import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const checker = readFileSync(new URL('./check-docs.mjs', import.meta.url), 'utf8');
function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'auth-docs-'));
  try {
    const fixture = {
      'check.mjs': checker,
      'packages/api/src/index.ts': "app.get('/auth/me', handler);",
      'docs/API.md': '`/auth/me`',
      ...files,
    };
    for (const [file, text] of Object.entries(fixture)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    return spawnSync(process.execPath, ['check.mjs'], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts documented routes and real relative links', () => {
  assert.equal(run({ 'README.md': '[API](docs/API.md)' }).status, 0);
});
test('rejects missing links without a dot prefix', () => {
  const result = run({ 'README.md': '[Contribute](CONTRIBUTING.md)' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CONTRIBUTING/);
});
test('covers GitHub policy and nested evidence documents', () => {
  for (const file of ['.github/SECURITY.md', 'docs/ui-qa/current/README.md']) {
    const result = run({ [file]: '[Missing](./missing.md)' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing.md/);
  }
});
test('requires documentation for DELETE as well as GET and POST', () => {
  const result = run({
    'packages/api/src/routes/example.ts': "app.delete('/auth/example', handler);",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /auth\/example/);
});
test('test-only routes do not become API documentation requirements', () => {
  assert.equal(
    run({ 'packages/api/src/example.test.ts': "app.post('/auth/fixture', handler);" }).status,
    0,
  );
});
