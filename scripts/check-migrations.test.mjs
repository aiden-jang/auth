import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('a failed migration check preserves a preexisting journal and removes only its own output', () => {
  const root = mkdtempSync(join(tmpdir(), 'auth-migrations-'));
  try {
    const migrations = join(root, 'packages/api/migrations');
    mkdirSync(join(migrations, 'meta'), { recursive: true });
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'packages/api/node_modules/.bin'), { recursive: true });
    const journal = '{"entries":[{"tag":"0000_initial"}],"pendingNote":"keep this edit"}\n';
    writeFileSync(join(migrations, 'meta/_journal.json'), journal);
    writeFileSync(join(migrations, 'meta/0000_snapshot.json'), '{}');
    writeFileSync(join(migrations, '0000_initial.sql'), 'SELECT 1;');
    writeFileSync(
      join(root, 'check.mjs'),
      readFileSync(new URL('./check-migrations.mjs', import.meta.url)),
    );
    const fake = `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync('migrations/meta/_journal.json', '{"entries":[]}');
fs.writeFileSync('migrations/0001_drift.sql', 'SELECT 2;');
fs.writeFileSync('migrations/meta/0001_snapshot.json', '{}');
console.log('generated drift');
`;
    for (const name of ['pnpm', 'npx']) {
      const file = join(root, 'bin', name);
      writeFileSync(file, fake);
      chmodSync(file, 0o755);
    }
    const drizzle = join(root, 'packages/api/node_modules/.bin/drizzle-kit');
    writeFileSync(drizzle, fake);
    chmodSync(drizzle, 0o755);
    const result = spawnSync(process.execPath, ['check.mjs'], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'), journal);
    assert.equal(existsSync(join(migrations, '0001_drift.sql')), false);
    assert.equal(existsSync(join(migrations, 'meta/0001_snapshot.json')), false);
    assert.equal(readFileSync(join(migrations, '0000_initial.sql'), 'utf8'), 'SELECT 1;');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
