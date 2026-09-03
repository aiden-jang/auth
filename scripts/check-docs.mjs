/*
 * Two mechanical checks on the docs, run by `pnpm verify`.
 *
 * Every route the code serves has to appear in docs/API.md, and every file path the docs point at
 * has to exist. Neither was true: API.md described nine of twenty-nine routes and SECURITY.md sent
 * readers to a package that was never created. Prose drifts silently, so the parts of it that are
 * checkable should be checked.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const code = globSync('packages/api/src/**/*.ts')
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const routes = new Set(
  [...code.matchAll(/app\.(?:get|post|all)\('([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '*'),
);

const apiDoc = readFileSync('docs/API.md', 'utf8');
const documented = new Set(
  [...apiDoc.matchAll(/`(\/(?:auth\/[a-z0-9/-]+|health))`/g)].map((m) => m[1]),
);

const problems = [];

for (const route of [...routes].sort()) {
  if (!documented.has(route)) problems.push(`docs/API.md does not mention ${route}`);
}
for (const route of [...documented].sort()) {
  if (!routes.has(route)) problems.push(`docs/API.md documents ${route}, which no longer exists`);
}

// Paths the docs point a reader at. Bare names like `lib/api.ts` are prose, not links, so only
// package-rooted ones are resolved.
for (const doc of globSync('{*.md,docs/*.md,packages/*/*.md}')) {
  const text = readFileSync(doc, 'utf8');
  for (const m of text.matchAll(/`(packages\/[A-Za-z0-9_./-]+\.[a-z]+)`/g)) {
    if (!existsSync(m[1])) problems.push(`${doc} points at ${m[1]}, which does not exist`);
  }
  for (const m of text.matchAll(/\]\((\.{1,2}\/[A-Za-z0-9_./-]+\.md)\)/g)) {
    if (!existsSync(join(dirname(doc), m[1]))) {
      problems.push(`${doc} links to ${m[1]}, which does not exist`);
    }
  }
}

if (problems.length > 0) {
  console.error('doc check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`docs ok: all ${routes.size} routes documented, every path resolves`);
