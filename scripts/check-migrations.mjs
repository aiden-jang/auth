/*
 * The schema in code and the migrations on disk have to agree.
 *
 * The deploy applies migrations before it publishes, so a migration that cannot apply is a deploy
 * that does not happen. See the note in src/auth/stepUp.ts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, rmSync } from 'node:fs';

const API = 'packages/api';
const journal = JSON.parse(readFileSync(`${API}/migrations/meta/_journal.json`, 'utf8'));
const tags = journal.entries.map((e) => e.tag);
const problems = [];

for (const tag of tags) {
  if (!existsSync(`${API}/migrations/${tag}.sql`)) {
    problems.push(`the journal lists ${tag}, but migrations/${tag}.sql is missing`);
  }
}
for (const f of globSync(`${API}/migrations/*.sql`)) {
  const tag = f
    .split('/')
    .pop()
    .replace(/\.sql$/, '');
  if (!tags.includes(tag)) problems.push(`migrations/${tag}.sql is not in the journal`);
}

/*
 * Only the newest snapshot is diffed against, so that is the one that has to exist. Older gaps are
 * history a rebase can leave behind and cost nothing.
 */
const newest = tags[tags.length - 1];
const index = String(tags.length - 1).padStart(4, '0');
if (!existsSync(`${API}/migrations/meta/${index}_snapshot.json`)) {
  problems.push(
    `migrations/meta/${index}_snapshot.json is missing, so drizzle diffs against an older schema ` +
      `than ${newest} and the next generate will re-create what already exists`,
  );
}

/*
 * The other direction: ask drizzle whether schema.ts needs a migration. It writes one when it does,
 * so anything it leaves behind is both the answer and the fix -- reported, then removed so a failed
 * check does not litter the tree.
 */
const before = new Set(globSync(`${API}/migrations/**/*.{sql,json}`));
const out = execFileSync('npx', ['drizzle-kit', 'generate', '--name', 'drift_check'], {
  cwd: API,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const created = globSync(`${API}/migrations/**/*.{sql,json}`).filter((f) => !before.has(f));
if (created.length > 0 || !/No schema changes/.test(out)) {
  problems.push(
    `schema.ts has changes with no migration. Run \`pnpm --filter @aidenjang/auth-api db:generate\` ` +
      `and commit what it writes.`,
  );
  for (const f of created) rmSync(f);
  execFileSync('git', ['checkout', '--', `${API}/migrations/meta/_journal.json`]);
}

if (problems.length > 0) {
  console.error('migration check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`migrations ok: ${tags.length} in step with the schema`);
