import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import test from 'node:test';
import { clearStaleLock, idempotent, MAX_STATE_BYTES, readState, reconcileState, recordEvent, resume, transition } from './state.mjs';
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

test('publication identity is promoted into state and missing identity stays unknown', async () => {
  const root = await fixture(); const path = join(root, 'state.json');
  await transition(path, 'BUILD', { release_tag: 'dsh-identity-test', source_sha: 'a'.repeat(40) });
  await transition(path, 'CREATE_DRAFT_RELEASE');
  await transition(path, 'UPLOAD_TARBALLS', { artifact_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64) });
  const state = await readState(path);
  assert.equal(state.source_sha, 'a'.repeat(40));
  assert.equal(state.artifact_sha256, 'b'.repeat(64));
  assert.equal(state.manifest_sha256, 'c'.repeat(64));
  assert.equal(reconcileRemote({
    local: state,
    remote: { release_tag: 'dsh-identity-test', phase: 'UPLOAD_TARBALLS', status: 'UPLOADED', source_sha: 'a'.repeat(40), artifact_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64) },
  }).status, 'RECONCILED');
  assert.equal(reconcileRemote({
    local: { release_tag: 'dsh-identity-test', phase: 'UPLOAD_TARBALLS' },
    remote: { release_tag: 'dsh-identity-test', phase: 'UPLOAD_TARBALLS', status: 'UPLOADED' },
  }).status, 'UNKNOWN');
  await assert.rejects(() => recordEvent(path, { artifact_sha256: 'd'.repeat(64) }), /RELEASE_STATE_IDENTITY_CONFLICT artifact_sha256/);
});

test('host tag changes clear old identity while the journal retains both releases', async () => {
  const path = join(await fixture(), 'host-state.json');
  await recordEvent(path, { release_tag: 'dsh-old', source_sha: 'a'.repeat(40), artifact_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64), assets: [{ name: 'old' }] });
  await recordEvent(path, { release_tag: 'dsh-new', source_sha: 'd'.repeat(40), status: 'PREPARE_INTENT' }, { allowTagChange: true });
  const state = await readState(path);
  assert.equal(state.release_tag, 'dsh-new');
  assert.equal(state.source_sha, 'd'.repeat(40));
  assert.equal(state.artifact_sha256, undefined);
  assert.equal(state.manifest_sha256, undefined);
  assert.equal(state.assets, undefined);
  assert.equal(state.journal[0].artifact_sha256, 'b'.repeat(64));
  await recordEvent(path, { release_tag: 'dsh-new', artifact_sha256: 'e'.repeat(64) });
  assert.equal((await readState(path)).artifact_sha256, 'e'.repeat(64));
});

test('a killed idempotent worker leaves a resumable unknown operation', async () => {
  const root = await fixture(); const path = join(root, 'crash-state.json');
  const moduleUrl = new URL('./state.mjs', import.meta.url).href;
  const script = [
    'import { idempotent } from ' + JSON.stringify(moduleUrl) + ';',
    'await idempotent(process.env.STATE_PATH, "crash-operation", async () => await new Promise(() => {}), { fingerprint: "' + sha('crash') + '" });',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, STATE_PATH: path }, stdio: ['ignore', 'ignore', 'pipe'] });
  const childExit = new Promise(resolve => child.once('close', resolve));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const state = JSON.parse(await readFile(path, 'utf8'));
      if (state.idempotency['crash-operation']?.status === 'IN_PROGRESS') { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(ready, true);
  child.kill('SIGKILL');
  await childExit;
  const resumed = await resume(path);
  assert.equal(resumed.action_required, true);
  assert.equal(resumed.unknown_operations[0].idempotency_key, 'crash-operation');
  await assert.rejects(() => transition(path, 'BUILD'), /RELEASE_LOCKED/);
  await assert.rejects(() => clearStaleLock(path), /RELEASE_LOCK_CLEAR_REQUIRES_CONFIRMATION/);
  assert.equal((await clearStaleLock(path, { confirm: true })).dead_pid, child.pid);
  await transition(path, 'BUILD', { release_tag: 'dsh-crash-recovery' });
  assert.equal((await resume(path)).unknown_operations[0].status, 'IN_PROGRESS');
});

test('stale-lock recovery refuses a live or unreadable owner', async () => {
  const root = await fixture(); const path = join(root, 'state.json');
  await writeFile(`${path}.lock`, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString(), nonce: 'a'.repeat(32) }) + '\n');
  await assert.rejects(() => clearStaleLock(path, { confirm: true }), /RELEASE_LOCK_OWNER_ACTIVE/);
  await writeFile(`${path}.lock`, 'not-json');
  await assert.rejects(() => clearStaleLock(path, { confirm: true }), /RELEASE_LOCK_OWNER_UNKNOWN/);
  const linkPath = join(root, 'symlink-state.json');
  await symlink(`${path}.lock`, `${linkPath}.lock`);
  await assert.rejects(() => clearStaleLock(linkPath, { confirm: true }), /RELEASE_LOCK_INVALID/);
});

test('recordEvent retains an exact prerequisite across unrelated appends and checks it again on retry', async t => {
  const root = await fixture(), path = join(root, 'journal.json');
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await recordEvent(path, { status: 'CANDIDATE_PREPARED' }, { idempotencyKey: 'prepared-fixture' });
  const data = { status: 'VERIFIED' }, options = { idempotencyKey: 'verified-fixture',
    requiredEvent: { seq: prepared.seq, digest: prepared.digest } };
  const first = await recordEvent(path, data, options);
  await recordEvent(path, { status: 'UNRELATED_OBSERVATION' });
  assert.deepEqual(await recordEvent(path, data, options), first);
  const state = await readState(path); state.journal = []; state.updated_at = null;
  const changed = JSON.stringify(state); await writeFile(path, changed);
  await assert.rejects(recordEvent(path, data, options), /RELEASE_EVENT_PREREQUISITE_CHANGED/);
  assert.equal(await readFile(path, 'utf8'), changed);
  await assert.rejects(recordEvent(path, data, { requiredEvent: { seq: 0, digest: prepared.digest } }), /RELEASE_EVENT_PREREQUISITE_INVALID/);
});

test('recordEvent never replays a cache result different from its journal entry', async t => {
  const root = await fixture(), path = join(root, 'journal.json');
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = { status: 'VERIFIED' }, options = { idempotencyKey: 'verified-fixture' };
  await recordEvent(path, data, options);
  const state = await readState(path);
  state.idempotency['verified-fixture'].result.status = 'WRONG_RECEIPT';
  const changed = JSON.stringify(state); await writeFile(path, changed);
  await assert.rejects(recordEvent(path, data, options), /RELEASE_EVENT_RECEIPT_INVALID/);
  assert.equal(await readFile(path, 'utf8'), changed);
});

test('state reads reject links, FIFO and oversized sparse files without blocking', async t => {
  const root = await fixture(), path = join(root, 'journal.json');
  t.after(() => rm(root, { recursive: true, force: true }));
  await recordEvent(path, { status: 'READY' });
  const link = join(root, 'link'); await symlink(path, link);
  await assert.rejects(readState(link), { code: 'ELOOP' });
  const fifo = join(root, 'fifo'); execFileSync('mkfifo', [fifo], { cwd: root });
  await assert.rejects(readState(fifo), /RELEASE_STATE_FILE_INVALID/);
  const huge = join(root, 'huge'), handle = await open(huge, 'wx');
  try { await handle.truncate(MAX_STATE_BYTES + 1); } finally { await handle.close(); }
  await assert.rejects(readState(huge), /RELEASE_STATE_FILE_INVALID/);
});
