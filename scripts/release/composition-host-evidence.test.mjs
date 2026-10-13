import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { recordEvent, readState } from './state.mjs';
import { validateCompositionCandidate } from './composition-candidate.mjs';
import { validateCompositionHostEvidence, verifyCompositionHostEvidence } from './composition-host-evidence.mjs';

const hex = (char, length) => char.repeat(length);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const binding = { schema_version: 'dsh-service-binding/v1', service_id: 'analytics-first-purchase', source_sha: hex('a', 40),
  api_version: '1.0.0', state: { owner: 'analysis-service', application_id: 1397572502, schema_version: 1,
    contract: 'analytics-first-purchase-saved-provenance/v1' }, access: 'read-write', lifecycle: 'external',
  rollback: 'preserve-service-and-state', evidence_sha256: hex('b', 64) };
function candidate() {
  const ids = Array.from({ length: 9 }, (_, i) => `@shine-mage/dsh-plugin-${i}`);
  const plugins = ids.map((id, i) => ({ id, path: `dsh-plugins/plugin-${i}`, profile: i < 2 ? 'crm' : 'page',
    version: '0.1.0', dsh_pin: '0.1.7-rc.2', source_sha: hex(String(i), 40), manifest_sha256: hex(String(i + 1), 64),
    pack: { name: `${id.slice(1).replaceAll('/', '-')}-0.1.0.tgz`, bytes: 1, sha256: hex(String(i + 1), 64) } }));
  const base = { schema_version: 'dsh-composition-candidate/v1',
    profiles: [{ name: 'crm', profile_id: 'crm-knowledge-rc2', source_sha256: hex('c', 64), sha256: hex('d', 64), plugins: ids.slice(0, 2) },
      { name: 'page', profile_id: 'dsh-rc2', source_sha256: hex('e', 64), sha256: hex('f', 64), plugins: ids.slice(2) }],
    plugins, service_compatibility: { schema_version: 'dsh-service-compatibility-gate/v1', binding,
      evidence_json: '{}', status: 'LOCAL_COMPATIBLE', release_ready: false, activation: 'BLOCKED' },
    capabilities: { source_http: 'NOT_RUN', terminal: 'NOT_RUN', browser: 'NOT_RUN', recovery: 'NOT_RUN' },
    activation: 'NOT_RUN', canary: 'NOT_RUN', rollback: 'NOT_RUN', release_ready: false, state_scope: 'local-explicit-journal' };
  return { ...base, candidate_digest: digest(base) };
}
function envelope(value) {
  return { schema_version: 'dsh-composition-host-evidence/v1', phase: 'terminal', candidate_digest: value.candidate_digest,
    service_source_sha: binding.source_sha, profile_digests: value.profiles.map(row => row.sha256),
    plugins: value.plugins.map(item => ({ id: item.id, source_sha: item.source_sha, manifest_sha256: item.manifest_sha256, pack_sha256: item.pack.sha256 })),
    target: { input_sha256: hex('1', 64), receipt_sha256: hex('2', 64), runner_sha256: hex('3', 64),
      platform: { system: 'Linux', machine: 'x86_64', python: '3.14.4', kernel: '6.18.33.2-microsoft-standard-WSL2' },
      cleanup: 'OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED' },
    observation: { status: 'PASS', scope: 'actual-wsl2-synthetic-inflight-terminal-recovery', scenario_count: 23,
      cross_version_recovery: 'NOT_RUN', browser: 'NOT_RUN', supply_chain: 'NOT_VERIFIED', production_identity: 'NOT_RUN',
      release_ready: false, activation: 'NOT_RUN' }, release_ready: false, activation: 'NOT_RUN' };
}
async function prepared(t, value) {
  const root = await mkdtemp(join(tmpdir(), 'composition-host-evidence-')); t.after(() => rm(root, { recursive: true, force: true }));
  const candidatePath = join(root, 'composition-candidate.json'), statePath = join(root, 'state.json'), evidencePath = join(root, 'evidence.json');
  await writeFile(candidatePath, JSON.stringify(value) + '\n');
  const intent = await recordEvent(statePath, { release_tag: 'dsh-composition-test', status: 'COMPOSITION_CANDIDATE_INTENT', candidate_digest: value.candidate_digest });
  const ready = await recordEvent(statePath, { release_tag: 'dsh-composition-test', status: 'COMPOSITION_CANDIDATE_PREPARED', candidate_digest: value.candidate_digest }, { requiredEvent: { seq: intent.seq, digest: intent.digest }, idempotencyKey: 'composition-prepared-test' });
  await recordEvent(statePath, { release_tag: 'dsh-composition-test', status: 'COMPOSITION_SOURCE_HTTP_TARGET_OBSERVED', candidate_digest: value.candidate_digest,
    service_binding: binding, observation: { status: 'PASS' } }, { requiredEvent: { seq: ready.seq, digest: ready.digest }, idempotencyKey: 'composition-source-test' });
  return { root, candidatePath, statePath, evidencePath };
}

test('composition host evidence validates nine packs and appends a phase event', async t => {
  const value = candidate(); validateCompositionCandidate(value); const paths = await prepared(t, value);
  const receipt = envelope(value); await writeFile(paths.evidencePath, JSON.stringify(receipt) + '\n');
  const result = await verifyCompositionHostEvidence(paths);
  assert.equal(result.candidate_digest, value.candidate_digest); assert.equal(result.journal_seq, 4);
  const state = await readState(paths.statePath); assert.equal(state.journal.at(-1).status, 'COMPOSITION_TERMINAL_HOST_OBSERVED');
});

test('composition host evidence rejects a changed pack before journal mutation', async t => {
  const value = candidate(); const paths = await prepared(t, value); const receipt = envelope(value);
  receipt.plugins[0].pack_sha256 = hex('9', 64); await writeFile(paths.evidencePath, JSON.stringify(receipt) + '\n');
  await assert.rejects(() => verifyCompositionHostEvidence(paths), /COMPOSITION_HOST_PLUGIN_DIGESTS/);
  const state = await readState(paths.statePath); assert.equal(state.journal.length, 3);
  assert.throws(() => validateCompositionHostEvidence({ candidate: value, envelope: receipt }), /COMPOSITION_HOST_PLUGIN_DIGESTS/);
});

test('composition browser evidence requires the same candidate terminal parent', async t => {
  const value = candidate();
  const paths = await prepared(t, value);
  const receipt = envelope(value);
  receipt.phase = 'browser';
  receipt.observation.browser = { driver: 'Aside headed', headed: true };
  await writeFile(paths.evidencePath, JSON.stringify(receipt) + '\n');
  await assert.rejects(() => verifyCompositionHostEvidence(paths), /COMPOSITION_HOST_TERMINAL_PARENT_REQUIRED/);
  const state = await readState(paths.statePath);
  assert.equal(state.journal.length, 3);
});

test('composition browser retry reuses a legacy event once its terminal parent exists', async t => {
  const value = candidate();
  const paths = await prepared(t, value);
  const before = await readState(paths.statePath);
  const source = before.journal.at(-1);
  const terminal = await recordEvent(paths.statePath, {
    release_tag: 'dsh-composition-test', status: 'COMPOSITION_TERMINAL_HOST_OBSERVED',
    candidate_digest: value.candidate_digest, service_binding: binding,
    source_http_event: { seq: source.seq, digest: source.digest }, observation: { status: 'PASS' },
  }, { requiredEvent: { seq: source.seq, digest: source.digest }, idempotencyKey: 'composition-terminal-legacy-test' });
  const receipt = envelope(value);
  receipt.phase = 'browser';
  receipt.observation.browser = { driver: 'Aside headed', headed: true };
  const oldObservation = { ...receipt.observation, phase: 'browser', target: receipt.target,
    evidence_authenticity: 'UNATTESTED_OPERATOR_OBSERVATION', candidate_digest: value.candidate_digest };
  const envelopeDigest = digest(receipt);
  const browser = await recordEvent(paths.statePath, {
    release_tag: 'dsh-composition-test', status: 'COMPOSITION_BROWSER_HOST_OBSERVED',
    candidate_digest: value.candidate_digest, service_binding: binding,
    source_http_event: { seq: source.seq, digest: source.digest }, observation: oldObservation,
  }, { requiredEvent: { seq: source.seq, digest: source.digest },
    idempotencyKey: `composition-host:browser:${value.candidate_digest}:${envelopeDigest}` });
  await writeFile(paths.evidencePath, JSON.stringify(receipt) + '\n');
  const result = await verifyCompositionHostEvidence(paths);
  assert.equal(result.journal_seq, browser.seq);
  assert.deepEqual(result.terminal_host_event, { seq: terminal.seq, digest: terminal.digest });
  assert.equal((await readState(paths.statePath)).journal.length, 5);
});
