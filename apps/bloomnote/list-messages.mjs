// Operator-only reader for the notes stored behind share links.
//
// This is deliberately a LOCAL script, not an HTTP endpoint: it reads
// straight from Redis using the admin token in your .env, so it exposes
// nothing publicly. A "view all messages" web route would be one auth
// bug away from leaking every user's private note — don't build that.
//
// PRIVACY NOTE: the app's footer tells users "I don't track what you
// wrote." Using this to browse notes contradicts that promise. If
// Blossom is deployed publicly, update the disclosure copy to match
// what you actually do, or don't run this against real user data.
//
// Usage:
//   node scripts/list-messages.mjs            # readable list, newest first
//   node scripts/list-messages.mjs --json     # raw JSON array (for piping)
//   node scripts/list-messages.mjs --limit 20 # cap the number shown
//
// Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from .env.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Redis } from '@upstash/redis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// Minimal .env loader — avoids a dotenv dependency and means the script
// "just works" with `node scripts/list-messages.mjs`. Values already in
// process.env (e.g. exported in the shell) win over the file.
function loadEnv() {
  let text
  try {
    text = readFileSync(join(projectRoot, '.env'), 'utf8')
  } catch {
    return // no .env file; rely on whatever is already in process.env
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function parseArgs(argv) {
  const args = { json: false, limit: Infinity }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--limit') {
      const n = Number(argv[++i])
      if (Number.isFinite(n) && n > 0) args.limit = n
    }
  }
  return args
}

function fmtDate(iso) {
  if (!iso) return 'unknown date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error(
      'Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. ' +
        'Set them in .env (see .env.example).',
    )
    process.exit(1)
  }

  const redis = new Redis({ url, token })

  // SCAN the whole keyspace for garden keys. SCAN is non-blocking and
  // cursor-paged, so it's safe even if the store grows large.
  const keys = []
  let cursor = '0'
  do {
    const [next, batch] = await redis.scan(cursor, { match: 'g:*', count: 200 })
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')

  if (keys.length === 0) {
    console.log('No gardens stored yet.')
    return
  }

  // Batch-fetch values. mget returns parsed objects (Upstash auto-parses
  // JSON), aligned to the key order we passed in.
  const records = []
  const CHUNK = 100
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK)
    const values = await redis.mget(...slice)
    values.forEach((g, j) => {
      if (g && typeof g === 'object') {
        records.push({ id: slice[j].replace(/^g:/, ''), garden: g })
      }
    })
  }

  // Newest first. Missing createdAt sorts last.
  records.sort((a, b) => {
    const ta = Date.parse(a.garden.createdAt ?? '') || 0
    const tb = Date.parse(b.garden.createdAt ?? '') || 0
    return tb - ta
  })

  const shown = records.slice(0, args.limit)

  if (args.json) {
    console.log(JSON.stringify(shown, null, 2))
    return
  }

  console.log(
    `\n${records.length} garden${records.length === 1 ? '' : 's'} stored` +
      (shown.length < records.length ? ` (showing ${shown.length})` : '') +
      '\n',
  )

  shown.forEach((r, i) => {
    const g = r.garden
    const who = `${g.from || 'someone'} → ${g.to || 'someone'}`
    const tags = [g.occasion, g.mood].filter(Boolean).join(' · ')
    const scheduled =
      g.unlockAt && Date.parse(g.unlockAt) > Date.now()
        ? `  [opens ${fmtDate(g.unlockAt)}]`
        : ''
    console.log(`${String(i + 1).padStart(3)}. ${who}${tags ? `  (${tags})` : ''}`)
    console.log(`     ${fmtDate(g.createdAt)}  ·  /g/${r.id}${scheduled}`)
    console.log(`     "${(g.message || '').replace(/\s+/g, ' ').trim()}"`)
    console.log('')
  })
}

main().catch(err => {
  console.error('Failed to read messages:', err)
  process.exit(1)
})
