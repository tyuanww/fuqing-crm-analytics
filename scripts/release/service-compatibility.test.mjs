import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareServiceCompatibility, serviceDigest, validateServiceEvidence, validateServiceGate } from './service-compatibility.mjs';
import { activateRelease, rollbackRelease } from './promotion.mjs';
import { recordEvent } from './state.mjs';
import { serviceFixture } from './test-fixtures/service-compatibility.mjs';

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'service-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('local candidate proof preserves BLOCKED activation and exact service state identity', async t => {
  const root = await directory(t), { binding, evidenceJson, gate, evidence } = await serviceFixture();
  const path = join(root, 'receipt.json'); await writeFile(path, evidenceJson);
  assert.deepEqual(await prepareServiceCompatibility(binding, path), gate);
  const readonly = { ...binding, access: 'read-only', source_sha: evidence.baseline };
  assert.equal((await validateServiceEvidence(readonly, evidenceJson)).release_ready, false);
  await assert.rejects(() => validateServiceEvidence({ ...readonly, access: 'read-write' }, evidenceJson), /SERVICE_OLD_WRITER_FORBIDDEN/);
  await assert.rejects(() => validateServiceGate({ ...gate, release_ready: true }), /SERVICE_GATE_VERDICT_MISMATCH/);
  await assert.rejects(() => prepareServiceCompatibility(undefined, path), /SERVICE_BINDING_REQUIRED/);
  await assert.rejects(() => prepareServiceCompatibility(binding, null), /SERVICE_EVIDENCE_REQUIRED/);
});

const evidenceMutations = [
  ['unknown schema', e => { e.schema_version = 'unknown'; }, /SERVICE_EVIDENCE_SCHEMA/],
  ['failed run', e => { e.status = 'FAIL'; }, /SERVICE_EVIDENCE_NOT_PASS/],
  ['false production scope', e => { e.scope = 'production'; }, /SERVICE_EVIDENCE_SCOPE/],
  ['false ready', e => { e.release_ready = true; }, /SERVICE_EVIDENCE_FALSE_RELEASE_CLAIM/],
  ['missing case', e => { e.observations.pop(); }, /SERVICE_CASES_INCOMPLETE/],
  ['duplicate case', e => { e.observations[0] = e.observations[1]; }, /SERVICE_CASES_INCOMPLETE/],
  ['failed case', e => { e.observations[0].status = 'FAIL'; }, /SERVICE_CASE_NOT_PASS/],
  ['readonly observation missing', e => { delete e.observations[2].database_unchanged; }, /SERVICE_CASE_SHAPE/],
  ['readonly database changed', e => { e.observations[2].database_unchanged = false; }, /SERVICE_READONLY_PROOF_REQUIRED/],
  ['stale runner', e => { e.runner_sha256 = '0'.repeat(64); }, /SERVICE_RUNNER_MISMATCH/],
  ['stale probe', e => { e.probe_sha256 = '0'.repeat(64); }, /SERVICE_PROBE_MISMATCH/],
  ['wrong source pair', e => { e.sources[1].commit = e.baseline; }, /SERVICE_SOURCE_PAIR_MISMATCH/],
  ['faked writer compatibility', e => { e.compatibility.candidate_state_old_writes = 'PASS'; }, /SERVICE_COMPATIBILITY_MISMATCH/],
  ['unknown field', e => { e.operator_override = true; }, /SERVICE_EVIDENCE_SHAPE/],
];
for (const [name, mutate, error] of evidenceMutations) {
  test('rejects ' + name + ' even when the profile digest is recomputed', async () => {
    const { binding, evidence } = await serviceFixture(); mutate(evidence);
    const text = JSON.stringify(evidence);
    await assert.rejects(() => validateServiceEvidence({ ...binding, evidence_sha256: serviceDigest(text) }, text), error);
  });
}

test('binding rejects wrong version, state owner/schema, embedded lifecycle and rollback', async () => {
  const { binding, evidenceJson } = await serviceFixture();
  for (const [change, error] of [
    [{ source_sha: 'e'.repeat(40) }, /SERVICE_SOURCE_NOT_TESTED/],
    [{ api_version: '2.0.0' }, /SERVICE_API_UNSUPPORTED/],
    [{ state: { ...binding.state, schema_version: 2 } }, /SERVICE_STATE_UNSUPPORTED/],
    [{ state: { ...binding.state, owner: 'plugin' } }, /SERVICE_STATE_UNSUPPORTED/],
    [{ lifecycle: 'bundled' }, /SERVICE_LIFECYCLE_MUST_BE_EXTERNAL/],
    [{ rollback: 'restore-database' }, /SERVICE_STATE_ROLLBACK_FORBIDDEN/],
  ]) await assert.rejects(() => validateServiceEvidence({ ...binding, ...change }, evidenceJson), error);
  await assert.rejects(() => validateServiceEvidence(binding, evidenceJson + ' '), /SERVICE_EVIDENCE_DIGEST_MISMATCH/);
});

test('bounded evidence rejects missing, symlink, FIFO and oversized files', async t => {
  const root = await directory(t), { binding, evidenceJson } = await serviceFixture();
  const path = join(root, 'receipt'); await writeFile(path, evidenceJson);
  await assert.rejects(() => prepareServiceCompatibility(binding, join(root, 'absent')), { code: 'ENOENT' });
  await symlink(path, join(root, 'link'));
  await assert.rejects(() => prepareServiceCompatibility(binding, join(root, 'link')), { code: 'ELOOP' });
  execFileSync('mkfifo', [join(root, 'fifo')]);
  await assert.rejects(() => prepareServiceCompatibility(binding, join(root, 'fifo')), /SERVICE_EVIDENCE_FILE_INVALID/);
  await writeFile(join(root, 'huge'), Buffer.alloc(512 * 1024 + 1));
  await assert.rejects(() => prepareServiceCompatibility(binding, join(root, 'huge')), /SERVICE_EVIDENCE_FILE_INVALID/);
});

async function hostFixture(t) {
  const root = await directory(t), statePath = join(root, 'journal.json');
  for (const [tag, sha] of [['dsh-old', 'a'.repeat(40)], ['dsh-next', 'b'.repeat(40)]]) {
    const path = join(root, 'releases', tag); await mkdir(path, { recursive: true });
    await writeFile(join(path, 'release-marker.json'), JSON.stringify({ tag, source_sha: sha, owner: 'test-service', restart_dependency: 'test-service.unit' }));
  }
  const activate = tag => activateRelease({ releaseRoot: root, tag, sourceSha: (tag === 'dsh-old' ? 'a' : 'b').repeat(40), statePath });
  const rollback = () => rollbackRelease({ releaseRoot: root, statePath });
  const update = async (tag, gate) => {
    const path = join(root, 'releases', tag, 'release-marker.json');
    await writeFile(path, JSON.stringify({ ...JSON.parse(await readFile(path)), service_compatibility: gate }));
  };
  const snapshot = async () => ({
    current: await readlink(join(root, 'current')), pointer: await readFile(join(root, 'current-target'), 'utf8'),
    journal: await readFile(statePath, 'utf8'),
    rollback: await readFile(join(root, 'rollback-target.json'), 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; }),
  });
  return { root, statePath, activate, rollback, update, snapshot };
}

test('real promotion rejects local proof before pointers/journal change, including active retries', async t => {
  const host = await hostFixture(t), { gate } = await serviceFixture();
  await host.activate('dsh-old');
  await host.update('dsh-next', gate);
  const before = await host.snapshot();
  await assert.rejects(() => host.activate('dsh-next'), /SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE/);
  assert.deepEqual(await host.snapshot(), before);
  await host.update('dsh-old', gate);
  await assert.rejects(() => host.activate('dsh-old'), /SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE/);
  assert.deepEqual(await host.snapshot(), before);
});

test('rollback and duplicate rollback both reject old writable services', async t => {
  const host = await hostFixture(t), { gate, evidence } = await serviceFixture();
  await host.activate('dsh-old'); await host.activate('dsh-next');
  const oldWriter = { ...gate, binding: { ...gate.binding, source_sha: evidence.baseline } };
  await host.update('dsh-old', oldWriter);
  const before = await host.snapshot();
  await assert.rejects(host.rollback, /SERVICE_OLD_WRITER_FORBIDDEN/);
  assert.deepEqual(await host.snapshot(), before);
  // A legacy successful rollback cannot let an idempotent retry bypass new metadata.
  const path = join(host.root, 'releases/dsh-old/release-marker.json');
  const marker = JSON.parse(await readFile(path)); delete marker.service_compatibility;
  await writeFile(path, JSON.stringify(marker)); await host.rollback();
  await host.update('dsh-old', oldWriter);
  const rolledBack = await host.snapshot();
  await assert.rejects(host.rollback, /SERVICE_OLD_WRITER_FORBIDDEN/);
  assert.deepEqual(await host.snapshot(), rolledBack);
});

test('current or durable journal requirement prevents removing the binding on downgrade', async t => {
  const host = await hostFixture(t), { gate } = await serviceFixture();
  await host.activate('dsh-old'); await host.activate('dsh-next');
  await host.update('dsh-next', gate);
  let before = await host.snapshot();
  await assert.rejects(host.rollback, /SERVICE_BINDING_REMOVAL_FORBIDDEN/);
  assert.deepEqual(await host.snapshot(), before);
  const path = join(host.root, 'releases/dsh-next/release-marker.json');
  const marker = JSON.parse(await readFile(path)); delete marker.service_compatibility;
  await writeFile(path, JSON.stringify(marker));
  await recordEvent(host.statePath, { release_tag: 'dsh-next', status: 'ACTIVE_INTENT', service_binding: gate.binding });
  before = await host.snapshot();
  await assert.rejects(host.rollback, /SERVICE_BINDING_REMOVAL_FORBIDDEN/);
  assert.deepEqual(await host.snapshot(), before);
});
