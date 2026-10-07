import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSessionRecoveryMatrix } from './session-recovery.mjs';

test('existing output is refused without touching its contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-guard-'));
  try {
    await writeFile(join(root, 'retain'), 'existing');
    await assert.rejects(runSessionRecoveryMatrix({ output: root, rc2Modules: '/missing' }), /EEXIST/);
    assert.equal(await readFile(join(root, 'retain'), 'utf8'), 'existing');
  } finally { await rm(root, { recursive: true }); }
});

test('missing runtime is FAIL with fresh-process evidence, never PASS/NOT_RUN', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-missing-'));
  try {
    const result = await runSessionRecoveryMatrix({ output: join(root, 'result'), rc2Modules: join(root, 'absent') });
    assert.equal(result.status, 'FAIL'); assert.equal(result.executions.length, 1);
    assert.notEqual(result.executions[0].exit_code, 0);
  } finally { await rm(root, { recursive: true }); }
});

test('official rc2 cold reader/writer recovers an incomplete zstd frame', {
  skip: !process.env.B0_BUILD_UPSTREAM && 'explicit built upstream required',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-session-real-'));
  try {
    const result = await runSessionRecoveryMatrix({ output: join(root, 'result'),
      rc2Modules: join(process.env.B0_BUILD_UPSTREAM, 'apps/cli/node_modules/@deepseek-ai') });
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.rows[0].status, 'PASS'); assert.equal(result.rows[1].status, 'NOT_RUN');
    assert.equal(result.executions.length, 4);
  } finally { await rm(root, { recursive: true }); }
});
