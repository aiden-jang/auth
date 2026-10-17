// Validate documented paths, scripts, routes, symbols, and local links.
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Test files are excluded: they mount their own throwaway routes on a local Hono instance, and a
// test that registered a real-looking path would otherwise be demanded of docs/API.md.
const code = globSync('packages/api/src/**/*.ts')
  .filter((f) => !/\.test\.ts$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const routes = new Set(
  [...code.matchAll(/app\.(?:get|post|put|patch|delete|options|head|all)\('([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p !== '*'),
);

const apiDoc = readFileSync('docs/API.md', 'utf8');
const documented = new Set(
  [
    ...apiDoc.matchAll(
      /`(?:GET |POST |PUT |PATCH |DELETE |OPTIONS |HEAD )?(\/(?:auth\/[a-z0-9/-]+|health|\.well-known\/[a-z0-9/-]+))`/g,
    ),
  ].map((m) => m[1]),
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
for (const doc of globSync('{*.md,.github/**/*.md,docs/**/*.md,packages/*/*.md}')) {
  const text = readFileSync(doc, 'utf8');
  for (const m of text.matchAll(/`(packages\/[A-Za-z0-9_./-]+\.[a-z]+)`/g)) {
    if (!existsSync(m[1])) problems.push(`${doc} points at ${m[1]}, which does not exist`);
  }
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || target.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const file = decodeURIComponent(target);
    if (!existsSync(join(dirname(doc), file)))
      problems.push(`${doc} links to ${file}, which does not exist`);
  }
}

if (problems.length > 0) {
  console.error('doc check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`docs ok: all ${routes.size} routes documented, every path resolves`);
