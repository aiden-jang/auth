import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { loadSentGardens, removeSentGarden, type MineRecord } from '../lib/mine'
import { claimGardens, fetchMine, removeFromAccount, type GardenSummary } from '../lib/account'
import { buildShareUrl } from '../garden'
import { labelFor as occasionLabel } from '../lib/occasions'
import { formatGardenDate } from '../lib/formatDate'
import styles from './MyGardens.module.css'

/**
 * The "/mine" view. Signed in, it reads server-side (so Sent + Received show on any device),
 * and on first visit it claims any gardens this device made anonymously. Signed out, it falls
 * back to the on-device archive (localStorage) — anonymous use still works, just per-device.
 */
type Tab = 'sent' | 'received'

/** Fields GardenRow renders — satisfied by both MineRecord and the server GardenSummary. */
interface CardData {
  id: string
  to: string
  occasion?: string | undefined
  createdAt: string
  unlockAt?: string | undefined
  swatches: string[]
}

export default function MyGardens() {
  const { user, loading } = useAuth()

  if (loading) return <Shell subtitle="">{null}</Shell>
  return user ? <AccountGardens /> : <LocalGardens />
}

// --- Signed in: server-backed Sent + Received -----------------------------

function AccountGardens() {
  const [sent, setSent] = useState<GardenSummary[]>([])
  const [received, setReceived] = useState<GardenSummary[]>([])
  const [tab, setTab] = useState<Tab>('sent')
  const [busy, setBusy] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // First-login claim: adopt any gardens this device made anonymously, then forget them locally.
      const localIds = loadSentGardens().map(r => r.id)
      if (localIds.length > 0) {
        await claimGardens(localIds)
        localIds.forEach(removeSentGarden)
      }
      const mine = await fetchMine().catch(() => ({ sent: [], received: [] }))
      if (cancelled) return
      setSent(mine.sent)
      setReceived(mine.received)
      setBusy(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCopy = (id: string) => {
    void navigator.clipboard.writeText(buildShareUrl(id)).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(c => (c === id ? null : c)), 2000)
    })
  }

  // Optimistic: drop it from the list right away, then persist server-side (survives refresh and
  // syncs across devices). The garden itself is kept, so a link already shared still opens.
  const handleRemove = (id: string) => {
    setSent(s => s.filter(g => g.id !== id))
    setReceived(s => s.filter(g => g.id !== id))
    void removeFromAccount(id)
  }

  const list = tab === 'sent' ? sent : received

  return (
    <Shell subtitle="the gardens you've grown and kept, on every device.">
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sent'}
          className={tab === 'sent' ? styles.tabActive : styles.tab}
          onClick={() => setTab('sent')}
        >
          Sent{sent.length ? ` (${sent.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'received'}
          className={tab === 'received' ? styles.tabActive : styles.tab}
          onClick={() => setTab('received')}
        >
          Received{received.length ? ` (${received.length})` : ''}
        </button>
      </div>

      {busy ? (
        <p className={styles.emptyText}>loading…</p>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {tab === 'sent' ? 'you haven’t grown any yet.' : 'nothing received yet.'}
          </p>
          {tab === 'sent' && (
            <a href="/" className={styles.emptyLink}>
              grow one
            </a>
          )}
        </div>
      ) : (
        <ul className={styles.list}>
          {list.map(r => (
            <GardenRow
              key={r.id}
              record={r}
              copied={copiedId === r.id}
              onCopy={() => handleCopy(r.id)}
              onRemove={() => handleRemove(r.id)}
            />
          ))}
        </ul>
      )}
    </Shell>
  )
}

// --- Signed out: on-device archive (unchanged behavior) -------------------

function LocalGardens() {
  const { login } = useAuth()
  const [records, setRecords] = useState<MineRecord[]>(() => loadSentGardens())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (id: string) => {
    void navigator.clipboard.writeText(buildShareUrl(id)).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(c => (c === id ? null : c)), 2000)
    })
  }
  const handleRemove = (id: string) => {
    removeSentGarden(id)
    setRecords(rs => rs.filter(r => r.id !== id))
  }

  return (
    <Shell subtitle="the gardens you've grown, saved on this device.">
      {records.length > 0 && (
        <p className={styles.emptyText}>
          <button type="button" className={styles.emptyLink} onClick={() => login()}>
            sign in
          </button>{' '}
          to keep them across devices.
        </p>
      )}
      {records.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>you haven&rsquo;t grown any yet.</p>
          <a href="/" className={styles.emptyLink}>
            grow one
          </a>
        </div>
      ) : (
        <ul className={styles.list}>
          {records.map(r => (
            <GardenRow
              key={r.id}
              record={r}
              copied={copiedId === r.id}
              onCopy={() => handleCopy(r.id)}
              onRemove={() => handleRemove(r.id)}
            />
          ))}
        </ul>
      )}
    </Shell>
  )
}

function Shell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>your gardens</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </header>
      {children}
      <footer className={styles.footer}>
        <a href="/" className={styles.backLink}>
          ← grow another
        </a>
      </footer>
    </div>
  )
}

interface RowProps {
  record: CardData
  copied: boolean
  onCopy: () => void
  onRemove?: () => void
}

function GardenRow({ record, copied, onCopy, onRemove }: RowProps) {
  const { id, to, occasion, createdAt, unlockAt, swatches } = record

  const sealedUntil =
    unlockAt && new Date(unlockAt).getTime() > Date.now() ? formatGardenDate(unlockAt) : null
  const grownOn = formatGardenDate(createdAt)
  const recipientLine = to.trim() ? `for ${to.trim()}` : 'for someone'

  return (
    <li className={styles.card}>
      <a href={`/g/${id}`} className={styles.cardMain}>
        <span className={styles.swatches} aria-hidden>
          {swatches.length > 0 ? (
            swatches.map((c, i) => <span key={i} className={styles.swatch} style={{ background: c }} />)
          ) : (
            <span className={styles.swatch} style={{ background: 'var(--green-pale)' }} />
          )}
        </span>
        <span className={styles.cardText}>
          <span className={styles.recipient}>{recipientLine}</span>
          <span className={styles.meta}>
            {occasion && <span>{occasionLabel(occasion)}</span>}
            {sealedUntil ? (
              <span className={styles.sealed}>opens {sealedUntil}</span>
            ) : (
              grownOn && <span>{grownOn}</span>
            )}
          </span>
        </span>
      </a>

      <div className={styles.cardActions}>
        <button type="button" className={styles.actionBtn} onClick={onCopy}>
          {copied ? 'copied' : 'copy link'}
        </button>
        {onRemove && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={onRemove}
            aria-label={`remove ${recipientLine} from your gardens`}
          >
            remove
          </button>
        )}
      </div>
    </li>
  )
}
