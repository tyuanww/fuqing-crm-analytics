/** Service state stays with its owner when a plugin/profile changes.
 * This gate accepts local observations for candidate preparation only.
 * A local source drill can never authorize a production service transition.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const HEX = /^[a-f0-9]{64}$/, COMMIT = /^[a-f0-9]{40}$/;
const MAX_EVIDENCE = 512 * 1024;
export const SERVICE_STATE = Object.freeze({
  owner: 'analysis-service', application_id: 1397572502, schema_version: 1,
  contract: 'analytics-first-purchase-saved-provenance/v1',
});
export const SERVICE_CASES = Object.freeze(['seed-legacy', 'upgrade', 'old-readonly', 'recover',
  'cold-backup-restore', 'old-write', 'detect-old-write', 'old-unknown-schema', 'new-unknown-schema']);
const COMPATIBILITY = Object.freeze({
  old_v1_to_candidate: 'PASS',
  candidate_state_old_readonly: 'PASS_WITH_READ_ONLY_IDENTITY',
  candidate_replay_after_old_read: 'PASS',
  candidate_forward_fix_and_backup_restore: 'PASS',
  candidate_state_old_writes: 'BLOCKED_PROVENANCE_NOT_PRESERVED',
  old_service_d15_api: 'NOT_AVAILABLE',
  unknown_state_schema: 'REJECTED_WITHOUT_DB_CHANGE',
  profile_rollback: 'KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE',
});
const verifierRoot = fileURLToPath(new URL('../..', import.meta.url));
export const serviceDigest = bytes => createHash('sha256').update(bytes).digest('hex');
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

export function validateServiceBinding(binding) {
  exact(binding, ['schema_version', 'service_id', 'source_sha', 'api_version', 'state',
    'access', 'lifecycle', 'rollback', 'evidence_sha256'], 'SERVICE_BINDING_SHAPE');
  assert.equal(binding.schema_version, 'dsh-service-binding/v1', 'SERVICE_BINDING_SCHEMA');
  assert.equal(binding.service_id, 'analytics-first-purchase', 'SERVICE_ID_UNSUPPORTED');
  assert.match(binding.source_sha ?? '', COMMIT, 'SERVICE_SOURCE_INVALID');
  assert.equal(binding.api_version, '1.0.0', 'SERVICE_API_UNSUPPORTED');
  assert.deepEqual(binding.state, SERVICE_STATE, 'SERVICE_STATE_UNSUPPORTED');
  assert.ok(['read-only', 'read-write'].includes(binding.access), 'SERVICE_ACCESS_INVALID');
  assert.equal(binding.lifecycle, 'external', 'SERVICE_LIFECYCLE_MUST_BE_EXTERNAL');
  assert.equal(binding.rollback, 'preserve-service-and-state', 'SERVICE_STATE_ROLLBACK_FORBIDDEN');
  assert.match(binding.evidence_sha256 ?? '', HEX, 'SERVICE_EVIDENCE_DIGEST_INVALID');
  return binding;
}

async function boundedEvidence(path) {
  assert.ok(typeof path === 'string' && path, 'SERVICE_EVIDENCE_REQUIRED');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    assert.ok(info.isFile() && info.size > 0 && info.size <= MAX_EVIDENCE, 'SERVICE_EVIDENCE_FILE_INVALID');
    const bytes = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    assert.equal(offset, info.size, 'SERVICE_EVIDENCE_FILE_CHANGED');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}

export async function validateServiceEvidence(binding, evidenceJson) {
  validateServiceBinding(binding);
  assert.ok(typeof evidenceJson === 'string' && Buffer.byteLength(evidenceJson) <= MAX_EVIDENCE, 'SERVICE_EVIDENCE_INVALID');
  assert.equal(serviceDigest(evidenceJson), binding.evidence_sha256, 'SERVICE_EVIDENCE_DIGEST_MISMATCH');
  const evidence = JSON.parse(evidenceJson);
  exact(evidence, ['schema_version', 'status', 'scope', 'release_ready', 'baseline', 'candidate',
    'probe_sha256', 'runner_sha256', 'python', 'observations', 'platform', 'dependency_mode',
    'dependencies', 'sources', 'compatibility'], 'SERVICE_EVIDENCE_SHAPE');
  assert.equal(evidence.schema_version, 'shinemage-service-save-compatibility/v1', 'SERVICE_EVIDENCE_SCHEMA');
  assert.equal(evidence.status, 'PASS', 'SERVICE_EVIDENCE_NOT_PASS');
  assert.equal(evidence.scope, 'local-posix-synthetic-sqlite-and-asgi', 'SERVICE_EVIDENCE_SCOPE');
  assert.equal(evidence.release_ready, false, 'SERVICE_EVIDENCE_FALSE_RELEASE_CLAIM');
  assert.equal(evidence.dependency_mode, 'shared-current-test-environment', 'SERVICE_DEPENDENCY_SCOPE');
  assert.match(evidence.python ?? '', /^3\.(?:1[4-9]|[2-9][0-9])\.\d+$/, 'SERVICE_PYTHON_INVALID');
  exact(evidence.platform, ['system', 'machine'], 'SERVICE_PLATFORM_INVALID');
  assert.ok(['Darwin', 'Linux'].includes(evidence.platform.system), 'SERVICE_PLATFORM_INVALID');
  assert.match(evidence.platform.machine ?? '', /^[a-zA-Z0-9_-]{1,40}$/, 'SERVICE_PLATFORM_INVALID');
  exact(evidence.dependencies, ['fastapi', 'pydantic', 'starlette', 'httpx', 'psutil'], 'SERVICE_DEPENDENCIES_INVALID');
  for (const version of Object.values(evidence.dependencies)) {
    assert.match(version ?? '', /^\d+\.\d+\.\d+[a-zA-Z0-9.+-]{0,40}$/, 'SERVICE_DEPENDENCIES_INVALID');
  }
  assert.match(evidence.baseline ?? '', COMMIT, 'SERVICE_BASELINE_INVALID');
  assert.match(evidence.candidate ?? '', COMMIT, 'SERVICE_CANDIDATE_INVALID');
  assert.notEqual(evidence.baseline, evidence.candidate, 'SERVICE_PAIR_INVALID');
  assert.ok([evidence.baseline, evidence.candidate].includes(binding.source_sha), 'SERVICE_SOURCE_NOT_TESTED');
  if (binding.source_sha === evidence.baseline && binding.access === 'read-write') {
    throw new Error('SERVICE_OLD_WRITER_FORBIDDEN');
  }
  assert.deepEqual(evidence.compatibility, COMPATIBILITY, 'SERVICE_COMPATIBILITY_MISMATCH');
  assert.ok(Array.isArray(evidence.observations) && evidence.observations.length === SERVICE_CASES.length, 'SERVICE_CASES_INCOMPLETE');
  assert.deepEqual(evidence.observations.map(row => row.case).sort(), [...SERVICE_CASES].sort(), 'SERVICE_CASES_INCOMPLETE');
  for (const row of evidence.observations) {
    exact(row, ['case', 'status', ...(row.case.endsWith('unknown-schema') ? ['rejected'] : ['source_import']),
      ...(row.case === 'old-readonly' ? ['database_unchanged'] : [])], 'SERVICE_CASE_SHAPE');
    assert.equal(row.status, 'PASS', 'SERVICE_CASE_NOT_PASS');
    if (row.case.endsWith('unknown-schema')) assert.equal(row.rejected, true, 'SERVICE_SCHEMA_REJECTION_REQUIRED');
    else assert.equal(row.source_import, 'backend/analytics_first_purchase_analysis_app.py', 'SERVICE_IMPORT_MISMATCH');
    if (row.case === 'old-readonly') assert.equal(row.database_unchanged, true, 'SERVICE_READONLY_PROOF_REQUIRED');
  }
  assert.ok(Array.isArray(evidence.sources) && evidence.sources.length === 2, 'SERVICE_SOURCES_REQUIRED');
  assert.deepEqual(evidence.sources.map(row => row.commit), [evidence.baseline, evidence.candidate], 'SERVICE_SOURCE_PAIR_MISMATCH');
  for (const source of evidence.sources) {
    exact(source, ['commit', 'files'], 'SERVICE_SOURCE_SHAPE');
    assert.ok(source.files && typeof source.files === 'object' && !Array.isArray(source.files), 'SERVICE_FILES_INVALID');
    const paths = Object.keys(source.files);
    assert.ok(paths.length > 0 && paths.length <= 1000, 'SERVICE_FILES_INVALID');
    for (const path of paths) {
      assert.ok(path.startsWith('backend/') && !path.includes('..') && !path.includes('\\'), 'SERVICE_FILE_PATH_INVALID');
      assert.match(source.files[path] ?? '', HEX, 'SERVICE_FILE_DIGEST_INVALID');
    }
    for (const name of ['backend/services/analytics/first_purchase/saved.py', 'backend/analytics_first_purchase_analysis_app.py']) {
      assert.match(source.files[name] ?? '', HEX, 'SERVICE_SOURCE_CLOSURE_INCOMPLETE');
    }
  }
  // Bind observations to the reviewed verifier shipped with this control plane.
  const [runner, probe] = await Promise.all([
    readFile(verifierRoot + '/scripts/dsh-b0/service-save-compatibility.py'),
    readFile(verifierRoot + '/backend/tests/first_purchase_service_compat_probe.py'),
  ]);
  assert.equal(evidence.runner_sha256, serviceDigest(runner), 'SERVICE_RUNNER_MISMATCH');
  assert.equal(evidence.probe_sha256, serviceDigest(probe), 'SERVICE_PROBE_MISMATCH');
  return { status: 'LOCAL_COMPATIBLE', release_ready: false,
    activation: 'BLOCKED_SERVICE_PACKAGE_AND_HOST_EVIDENCE_REQUIRED' };
}

export async function prepareServiceCompatibility(binding, evidencePath) {
  if (binding === undefined) {
    assert.ok(!evidencePath, 'SERVICE_BINDING_REQUIRED');
    return null;
  }
  validateServiceBinding(binding);
  const evidenceJson = (await boundedEvidence(evidencePath)).toString('utf8');
  const verdict = await validateServiceEvidence(binding, evidenceJson);
  return { schema_version: 'dsh-service-compatibility-gate/v1', binding, evidence_json: evidenceJson, ...verdict };
}

export async function validateServiceGate(gate, expectedBinding = undefined) {
  exact(gate, ['schema_version', 'binding', 'evidence_json', 'status', 'release_ready', 'activation'], 'SERVICE_GATE_SHAPE');
  assert.equal(gate.schema_version, 'dsh-service-compatibility-gate/v1', 'SERVICE_GATE_SCHEMA');
  if (expectedBinding !== undefined) assert.deepEqual(gate.binding, expectedBinding, 'SERVICE_PROFILE_BINDING_MISMATCH');
  const verdict = await validateServiceEvidence(gate.binding, gate.evidence_json);
  for (const [name, value] of Object.entries(verdict)) assert.deepEqual(gate[name], value, 'SERVICE_GATE_VERDICT_MISMATCH');
  return verdict;
}

/** Called inside the existing promotion lock, before intents or pointers change.
 * Missing metadata cannot turn a service-aware current/journal into legacy mode.
 * No function here starts/stops a service, grants credentials or reads its DB.
 */
export async function assertServicePromotion({ marker, currentMarker = null, journal }) {
  const targetBindings = journal.journal.filter(row =>
    ['PREPARE_INTENT', 'PREPARED', 'ACTIVE_INTENT', 'ACTIVE', 'ROLLBACK_INTENT', 'ROLLED_BACK'].includes(row.status)
    && row.release_tag === marker.tag && row.source_sha === marker.source_sha
    && Object.hasOwn(row, 'service_binding')).map(row => row.service_binding);
  const previousBinding = (currentMarker != null && Object.hasOwn(currentMarker, 'service_compatibility'))
    || journal.journal.some(row => ['ACTIVE_INTENT', 'ACTIVE', 'ROLLBACK_INTENT', 'ROLLED_BACK'].includes(row.status)
      && Object.hasOwn(row, 'service_binding'));
  if (!Object.hasOwn(marker, 'service_compatibility')) {
    assert.ok(!previousBinding && targetBindings.length === 0, 'SERVICE_BINDING_REMOVAL_FORBIDDEN');
    return;
  }
  await validateServiceGate(marker.service_compatibility);
  for (const binding of targetBindings) {
    assert.deepEqual(marker.service_compatibility.binding, binding, 'SERVICE_JOURNAL_BINDING_MISMATCH');
  }
  // A future signed package/target-host contract needs its own implemented
  // verifier. Neither --offline nor a JSON release_ready=true is such proof.
  throw new Error('SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE');
}
