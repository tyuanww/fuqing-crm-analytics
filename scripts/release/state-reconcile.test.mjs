import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { idempotent, readState, reconcileState, recordEvent, resume, transition } from './state.mjs';
import { reconcileRemote } from './reconcile.mjs';

const fixture = () => mkdtemp(join(tmpdir(), 'dsh-state-'));
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('phase journal rejects skips, preserves an integrity chain, and resumes at the next phase', async () => {
  const root = await fixture(); const path = join(root, 'state.json');
  await transition(path, 'BUILD', { release_tag: 'dsh-state-test' });
  await transition(path, 'CREATE_DRAFT_RELEASE');
  await assert.rejects(() => transition(path, 'PUBLISH_RELEASE'), /PHASE_SKIP/);
  await assert.rejects(() => transition(path, 'UPLOAD_TARBALLS', { phase: 'RECEIPT' }), /PHASE_DATA_INVALID/);
  await recordEvent(path, { release_tag: 'dsh-state-test', status: 'DRAFT' });
  const state = await readState(path);
  assert.equal(state.journal.length, 3);
  assert.equal((await resume(path)).next, 'UPLOAD_TARBALLS');
  const tampered = JSON.parse(await readFile(path, 'utf8'));
  tampered.journal[0].status = 'TAMPERED';
  await writeFile(path, JSON.stringify(tampered));
  await assert.rejects(() => readState(path), /RELEASE_JOURNAL_DIGEST_INVALID/);
});

test('idempotency commits once, conflicts on changed payload, and exposes unknown after failure', async () => {
  const root = await fixture(); const path = join(root, 'state.json'); let calls = 0;
  const fingerprint = sha('same payload');
  const first = await idempotent(path, 'draft-operation', async () => { calls += 1; return { draft_id: 'draft-1' }; }, { fingerprint });
  const replay = await idempotent(path, 'draft-operation', async () => { calls += 1; return { draft_id: 'draft-2' }; }, { fingerprint });
  assert.equal(first.status, 'COMMITTED'); assert.equal(replay.status, 'COMMITTED'); assert.equal(replay.replay, true); assert.equal(calls, 1);
  assert.equal((await idempotent(path, 'draft-operation', async () => ({}), { fingerprint: sha('other payload') })).status, 'CONFLICT');
  assert.equal((await idempotent(path, 'draft-operation', async () => ({}))).status, 'CONFLICT');
  await assert.rejects(() => idempotent(path, 'upload-operation', async () => { throw new Error('remote timeout'); }));
  const unknown = await idempotent(path, 'upload-operation', async () => ({ asset_id: 'duplicate-risk' }));
  assert.equal(unknown.status, 'UNKNOWN');
  assert.equal((await resume(path)).action_required, true);
});

test('remote reconcile fails closed on missing, mismatched, unknown, and out-of-order receipts', () => {
  assert.equal(reconcileRemote({ local: { release_tag: 'dsh-a' }, remote: null }).status, 'UNKNOWN');
  assert.equal(reconcileRemote({ local: { release_tag: 'dsh-a' }, remote: { release_tag: 'dsh-b' } }).status, 'CONFLICT');
  assert.equal(reconcileRemote({ local: { release_tag: 'dsh-a', phase: 'UPLOAD_TARBALLS' }, remote: { release_tag: 'dsh-a', phase: 'UPLOAD_TARBALLS', status: 'UNKNOWN' } }).status, 'UNKNOWN');
  assert.equal(reconcileRemote({ local: { release_tag: 'dsh-a', phase: 'PUBLISH_RELEASE' }, remote: { release_tag: 'dsh-a', phase: 'UPLOAD_TARBALLS', status: 'UPLOADED' } }).status, 'REMOTE_BEHIND');
  assert.equal(reconcileRemote({ local: { release_tag: 'dsh-a', phase: 'UPLOAD_TARBALLS', source_sha: 'a'.repeat(40) }, remote: { release_tag: 'dsh-a', phase: 'UPLOAD_TARBALLS', source_sha: 'b'.repeat(40) } }).status, 'CONFLICT');
  assert.equal(reconcileRemote({ local: { release_tag: 'dsh-a', artifact_sha256: 'a'.repeat(64) }, remote: { release_tag: 'dsh-a' } }).status, 'UNKNOWN');
});

test('reconcile decision is durable and never silently adopts remote state', async () => {
  const root = await fixture(); const path = join(root, 'state.json');
  await transition(path, 'BUILD', { release_tag: 'dsh-state-test' });
  const result = await reconcileState(path, { release_tag: 'dsh-state-test', phase: 'BUILD', status: 'DRAFT' });
  assert.equal(result.status, 'RECONCILED');
  const state = await readState(path);
  assert.equal(state.release_tag, 'dsh-state-test');
  assert.equal(state.phase, 'BUILD');
  assert.equal(state.journal.at(-1).event, 'RECONCILE');
  assert.equal(state.journal.at(-1).status, 'RECONCILED');
});

test('a killed idempotent worker leaves a resumable unknown operation', async () => {
  const root = await fixture(); const path = join(root, 'crash-state.json');
  const moduleUrl = new URL('./state.mjs', import.meta.url).href;
  const script = [
    'import { idempotent } from ' + JSON.stringify(moduleUrl) + ';',
    'await idempotent(process.env.STATE_PATH, "crash-operation", async () => await new Promise(() => {}), { fingerprint: "' + sha('crash') + '" });',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, STATE_PATH: path }, stdio: ['ignore', 'ignore', 'pipe'] });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const state = JSON.parse(await readFile(path, 'utf8'));
      if (state.idempotency['crash-operation']?.status === 'IN_PROGRESS') { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(ready, true);
  const childExit = new Promise(resolve => child.once('close', resolve));
  child.kill('SIGKILL');
  await childExit;
  const resumed = await resume(path);
  assert.equal(resumed.action_required, true);
  assert.equal(resumed.unknown_operations[0].idempotency_key, 'crash-operation');
});
