import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCompatibilityMatrix } from './compat-check.mjs';

test('compatibility without pinned runtime readers remains NOT_RUN', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-compat-'));
  assert.equal((await runCompatibilityMatrix(root)).status, 'NOT_RUN');
});

test('synthetic session/runtime/WAL roundtrip labels only fixture compatibility', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-compat-'));
  const fixture = join(root, 'synthetic-session.json');
  await writeFile(fixture, JSON.stringify({ schema: 'rc1-fixture', session_id: 'synthetic-session', runtime: { draft: 'fixture' }, wal_offset: 0 }));
  const result = await runCompatibilityMatrix(root, { runtimeRunner: async dir => {
    const current = JSON.parse(await readFile(join(dir, 'synthetic-session.json'), 'utf8'));
    assert.equal(current.schema, 'rc1-fixture');
    current.schema = 'rc2-fixture'; current.runtime.draft = 'fixture-updated'; current.wal_offset = 1;
    await writeFile(join(dir, 'synthetic-session.json'), JSON.stringify(current));
    const backward = JSON.parse(await readFile(join(dir, 'synthetic-session.json'), 'utf8'));
    assert.equal(backward.runtime.draft, 'fixture-updated');
    assert.equal(backward.wal_offset, 1);
    return { status: 'PASS', fixture: dir, scope: 'synthetic-json-only', real_duckdb: 'NOT_RUN', wsl2: 'NOT_RUN' };
  } });
  assert.equal(result.status, 'PASS');
  assert.equal(result.wsl2, 'NOT_RUN');
  assert.equal(result.real_duckdb, 'NOT_RUN');
});
