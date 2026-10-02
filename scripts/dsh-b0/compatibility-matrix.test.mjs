import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectCompatibilityMatrix, inspectCheckout } from './compatibility-matrix.mjs';

const exec = promisify(execFile);
const repo = await mkdtemp(join(tmpdir(), 'dsh-compatibility-'));
await mkdir(join(repo, 'packages/core'), { recursive: true });
await writeFile(join(repo, 'packages/core/contract.ts'), [
  'export const capabilitySlot = "slot";',
  'export function unloadAndRestart(timeout: number) { return { session: true, WAL: timeout }; }',
  'export const shell = { run: "ctx.shell.run", toolResult: true };',
].join('\n'));
await exec('git', ['-C', repo, 'init', '-q']);
await exec('git', ['-C', repo, 'config', 'user.email', 'fixture@example.invalid']);
await exec('git', ['-C', repo, 'config', 'user.name', 'fixture']);
await exec('git', ['-C', repo, 'add', '.']);
await exec('git', ['-C', repo, 'commit', '-qm', 'fixture']);
const fixtureSha = (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim();
after(async () => { await rm(repo, { recursive: true, force: true }); });

test('missing exact checkout fails closed without network', async () => {
  const matrix = await collectCompatibilityMatrix();
  assert.equal(matrix.offline, true);
  assert.equal(matrix.rows[0].status, 'NOT_RUN');
  assert.equal(matrix.rows[0].reason, 'UPSTREAM_CHECKOUT_MISSING');
  assert.equal(matrix.rows[1].status, 'DEFERRED');
  assert.equal(matrix.overall, 'PARTIAL');
});

test('exact local checkout with matching sha produces bounded static evidence', async () => {
  const row = await inspectCheckout({ id: 'fixture', version: 'fixture', checkout: repo, expectedSha: fixtureSha, role: 'blocking' });
  assert.equal(row.status, 'SUPPORTED');
  assert.equal(row.actual_sha, fixtureSha);
  assert.deepEqual(row.source_scan_missing, []);
  assert.ok(row.source_scan.capability_slot.matches.length > 0);
});

test('sha mismatch is a hard block and does not scan another revision', async () => {
  const row = await inspectCheckout({ id: 'fixture', version: 'fixture', checkout: repo, expectedSha: 'a'.repeat(40), role: 'blocking' });
  assert.equal(row.status, 'BLOCKED');
  assert.equal(row.reason, 'UPSTREAM_SHA_MISMATCH');
});
