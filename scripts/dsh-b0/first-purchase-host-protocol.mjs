/** Public host HTTP/RPC acceptance for a fixed install. Not createSaveController. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const UI = 'shinemage-first-purchase-ui/v1';
const IDENTITY = 'analytics-first-purchase-save-identity/v1';
const COMMAND = 'analytics-first-purchase-save-command/v1';
const RESULT = 'analytics-first-purchase-save-result/v1';
const RECEIPT = 'analytics-first-purchase-save-receipt/v1';
const SERVICE = 'analytics-first-purchase';
const DATA_SCOPE = 'first-purchase-fixture';
const SHA = /^[a-f0-9]{64}$/;
const OPAQUE = /^[A-Za-z0-9_.:-]{1,128}$/;
const TARGET_SESSION = /^[A-Za-z0-9_.:-]{1,160}$/;
const TARGET_CALL = /^[A-Za-z0-9_.:-]{1,160}$/;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/;
const DAY = /^\d{4}-\d\d-\d\d$/;
export const PUBLIC_SAVE_EVIDENCE = 'public-save-http';
export const PUBLIC_SAVE_CONTROLLER = 'NOT_RUN';
export const WORKSPACE_HTTP_ADMISSION = 'official commands/execute HTTP; browser rendering NOT_RUN';
export const PUBLIC_HTTP_ADMISSION = 'public commands/execute and save HTTP; createSaveController NOT_RUN; browser rendering NOT_RUN';

const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function sameIdentity(actual, expected) {
  return exactKeys(actual, Object.keys(expected)) && Object.keys(expected).every(key => actual[key] === expected[key]);
}
function identityForTarget(owner, target, candidateDigest) {
  const digest = createHash('sha256').update(JSON.stringify([
    owner, target.session_id, target.run_id, target.call_id, candidateDigest,
  ])).digest('hex');
  return { schema_version: IDENTITY, action_id: `fp-save-${digest}`, candidate_digest: candidateDigest,
    correlation_id: `fp-ui-${digest}` };
}
function assertIdentity(value, candidateDigest, expected) {
  assert.ok(exactKeys(value, ['schema_version', 'action_id', 'candidate_digest', 'correlation_id']), 'PUBLIC_SAVE_IDENTITY');
  assert.equal(value.schema_version, IDENTITY, 'PUBLIC_SAVE_IDENTITY');
  assert.equal(value.candidate_digest, candidateDigest, 'PUBLIC_SAVE_CANDIDATE');
  assert.match(value.action_id, /^fp-save-[a-f0-9]{64}$/, 'PUBLIC_SAVE_IDENTITY');
  assert.equal(value.correlation_id, value.action_id.replace('fp-save-', 'fp-ui-'), 'PUBLIC_SAVE_IDENTITY');
  assert.ok(sameIdentity(value, expected), 'PUBLIC_SAVE_IDENTITY');
}
function assertEligibleFreshness(value, generatedAt) {
  assert.ok(exactKeys(value, ['freshness_state', 'freshness_checked_at', 'freshness_stale_at', 'freshness_expires_at',
    'policy_version', 'max_age_ms', 'expires_after_ms', 'reason']), 'PUBLIC_SAVE_PROVENANCE');
  assert.match(value.freshness_checked_at ?? '', TIMESTAMP, 'PUBLIC_SAVE_PROVENANCE');
  assert.ok(Number.isFinite(Date.parse(value.freshness_checked_at)), 'PUBLIC_SAVE_PROVENANCE');
  if (value.freshness_state === 'NOT_CHECKED') {
    assert.equal(value.reason, 'DISABLED_BY_POLICY', 'PUBLIC_SAVE_PROVENANCE');
    assert.match(value.policy_version ?? '', OPAQUE, 'PUBLIC_SAVE_PROVENANCE');
    assert.equal(value.max_age_ms, null, 'PUBLIC_SAVE_PROVENANCE');
    assert.equal(value.expires_after_ms, null, 'PUBLIC_SAVE_PROVENANCE');
    assert.equal(value.freshness_stale_at, null, 'PUBLIC_SAVE_PROVENANCE');
    assert.equal(value.freshness_expires_at, null, 'PUBLIC_SAVE_PROVENANCE');
    return;
  }
  assert.equal(value.freshness_state, 'FRESH', 'PUBLIC_SAVE_PROVENANCE');
  assert.equal(value.reason, 'WITHIN_WINDOW', 'PUBLIC_SAVE_PROVENANCE');
  assert.match(value.policy_version ?? '', OPAQUE, 'PUBLIC_SAVE_PROVENANCE');
  assert.ok(Number.isSafeInteger(value.max_age_ms) && value.max_age_ms > 0, 'PUBLIC_SAVE_PROVENANCE');
  assert.ok(Number.isSafeInteger(value.expires_after_ms) && value.expires_after_ms > value.max_age_ms
    && value.expires_after_ms <= 2147483647, 'PUBLIC_SAVE_PROVENANCE');
  assert.match(value.freshness_stale_at ?? '', TIMESTAMP, 'PUBLIC_SAVE_PROVENANCE');
  assert.match(value.freshness_expires_at ?? '', TIMESTAMP, 'PUBLIC_SAVE_PROVENANCE');
  const generated = Date.parse(generatedAt);
  assert.equal(Date.parse(value.freshness_stale_at) - generated, value.max_age_ms, 'PUBLIC_SAVE_PROVENANCE');
  assert.equal(Date.parse(value.freshness_expires_at) - generated, value.expires_after_ms, 'PUBLIC_SAVE_PROVENANCE');
  const elapsed = Date.parse(value.freshness_checked_at) - generated;
  assert.ok(elapsed >= 0 && elapsed < value.max_age_ms, 'PUBLIC_SAVE_PROVENANCE');
}
function assertInspectAdmission(result, bound) {
  assert.ok(exactKeys(result, ['schema_version', 'api_version', 'identity', 'result_state', 'result', 'provenance',
    'save_eligible', 'save_ineligible_reason', 'finite_mock']), 'PUBLIC_SAVE_RESULT');
  assert.equal(result.schema_version, RESULT, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(result.api_version, '1.0.0', 'PUBLIC_SAVE_SCHEMA');
  assert.equal(result.finite_mock, true, 'PUBLIC_SAVE_RESULT');
  assert.equal(result.result_state, 'SUCCESS_UNSAVED', 'PUBLIC_SAVE_RESULT');
  assert.ok(result.result !== null && typeof result.result === 'object' && !Array.isArray(result.result), 'PUBLIC_SAVE_RESULT');
  assert.ok(sameIdentity(result.identity, bound.identity), 'PUBLIC_SAVE_IDENTITY');
  assert.equal(result.save_eligible, true, 'PUBLIC_SAVE_PERMISSION');
  assert.equal(result.save_ineligible_reason, null, 'PUBLIC_SAVE_PERMISSION');
  const provenance = result.provenance;
  assert.ok(exactKeys(provenance, ['environment', 'data_time_window', 'query_scope', 'permission_scope', 'source_refs',
    'candidate_digest', 'generated_at', 'freshness']), 'PUBLIC_SAVE_PROVENANCE');
  assert.equal(provenance.environment, 'synthetic', 'PUBLIC_SAVE_PROVENANCE');
  assert.equal(provenance.candidate_digest, bound.candidateDigest, 'PUBLIC_SAVE_CANDIDATE');
  assert.match(provenance.generated_at ?? '', TIMESTAMP, 'PUBLIC_SAVE_PROVENANCE');
  assert.ok(Number.isFinite(Date.parse(provenance.generated_at)), 'PUBLIC_SAVE_PROVENANCE');
  const window = provenance.data_time_window;
  assert.ok(exactKeys(window, ['kind', 'start_date', 'end_date']), 'PUBLIC_SAVE_PROVENANCE');
  assert.equal(window.kind, 'FIXED', 'PUBLIC_SAVE_PROVENANCE');
  assert.match(window.start_date ?? '', DAY, 'PUBLIC_SAVE_PROVENANCE');
  assert.match(window.end_date ?? '', DAY, 'PUBLIC_SAVE_PROVENANCE');
  assert.ok(window.start_date < window.end_date, 'PUBLIC_SAVE_PROVENANCE');
  const permission = provenance.permission_scope;
  assert.ok(exactKeys(permission, ['owner_id', 'data_scope', 'can_read', 'can_save']), 'PUBLIC_SAVE_PERMISSION');
  assert.equal(permission.owner_id, bound.owner, 'PUBLIC_SAVE_PERMISSION');
  assert.equal(permission.can_read, true, 'PUBLIC_SAVE_PERMISSION');
  assert.equal(permission.can_save, true, 'PUBLIC_SAVE_PERMISSION');
  assert.equal(permission.data_scope, DATA_SCOPE, 'PUBLIC_SAVE_SCOPE');
  const source = provenance.source_refs;
  assert.ok(exactKeys(source, ['service_owner', 'data_scope', 'created_from_run_id', 'evidence_digest',
    'primary_result_ref', 'method_package_digest']), 'PUBLIC_SAVE_SOURCE');
  assert.equal(source.service_owner, SERVICE, 'PUBLIC_SAVE_SERVICE');
  assert.equal(source.data_scope, permission.data_scope, 'PUBLIC_SAVE_SCOPE');
  assert.equal(source.created_from_run_id, bound.runId, 'PUBLIC_SAVE_RUN');
  assert.match(source.evidence_digest ?? '', SHA, 'PUBLIC_SAVE_EVIDENCE');
  assert.match(source.primary_result_ref ?? '', OPAQUE, 'PUBLIC_SAVE_SOURCE');
  assert.match(source.method_package_digest ?? '', SHA, 'PUBLIC_SAVE_SOURCE');
  assertEligibleFreshness(provenance.freshness, provenance.generated_at);
  return { evidenceDigest: source.evidence_digest, dataScope: permission.data_scope };
}
function assertSavedReceipt(body, bound) {
  assert.equal(body?.schema_version, UI, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(body.ok, true, 'PUBLIC_SAVE_SCHEMA');
  const value = body.value;
  assert.equal(value?.status, 'SAVED', 'PUBLIC_SAVE_RECEIPT_NOT_ACCEPTED');
  assert.equal(Object.hasOwn(value, 'analysis_ref') && Object.hasOwn(value, 'durable_state_key'), true, 'PUBLIC_SAVE_ANALYSIS');
  assert.ok(exactKeys(value, ['schema_version', 'api_version', 'service_owner', 'state_schema_version', 'identity',
    'idempotency_key', 'owner_id', 'finite_mock', 'status', 'analysis_ref', 'source_ref', 'durable_state_key', 'reason']), 'PUBLIC_SAVE_RECEIPT');
  assert.equal(value.schema_version, RECEIPT, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(value.api_version, '1.0.0', 'PUBLIC_SAVE_SCHEMA');
  assert.equal(value.service_owner, SERVICE, 'PUBLIC_SAVE_SERVICE');
  assert.equal(value.state_schema_version, 1, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(value.finite_mock, true, 'PUBLIC_SAVE_RECEIPT');
  assert.equal(value.reason, null, 'PUBLIC_SAVE_RECEIPT');
  assert.equal(value.owner_id, bound.owner, 'PUBLIC_SAVE_OWNER');
  assert.match(value.owner_id, OPAQUE, 'PUBLIC_SAVE_OWNER');
  assert.ok(sameIdentity(value.identity, bound.identity), 'PUBLIC_SAVE_IDENTITY');
  assert.equal(value.idempotency_key, bound.identity.action_id, 'PUBLIC_SAVE_IDEMPOTENCY');
  assert.match(value.idempotency_key, /^[!-~]{1,200}$/, 'PUBLIC_SAVE_IDEMPOTENCY');
  assert.ok(exactKeys(value.analysis_ref, ['analysis_id', 'version']), 'PUBLIC_SAVE_ANALYSIS');
  assert.match(value.analysis_ref.analysis_id ?? '', OPAQUE, 'PUBLIC_SAVE_ANALYSIS');
  assert.ok(Number.isSafeInteger(value.analysis_ref.version) && value.analysis_ref.version > 0, 'PUBLIC_SAVE_ANALYSIS');
  assert.equal(value.durable_state_key, `first-purchase-analysis:${value.analysis_ref.analysis_id}:${value.analysis_ref.version}`, 'PUBLIC_SAVE_ANALYSIS');
  const source = value.source_ref;
  assert.ok(exactKeys(source, ['service_owner', 'data_scope', 'created_from_run_id', 'evidence_digest']), 'PUBLIC_SAVE_SOURCE');
  assert.equal(source.service_owner, SERVICE, 'PUBLIC_SAVE_SERVICE');
  assert.equal(source.data_scope, bound.dataScope, 'PUBLIC_SAVE_SCOPE');
  assert.equal(source.created_from_run_id, bound.runId, 'PUBLIC_SAVE_RUN');
  assert.equal(source.evidence_digest, bound.evidenceDigest, 'PUBLIC_SAVE_EVIDENCE');
  return value;
}

/** Official commands/execute client-request. Shape is the public RPC envelope. */
export function publicCommandExecuteEnvelope(sessionId, line, rpcId) {
  return { type: 'client-request', rpcId, method: 'commands/execute',
    payload: { args: { agentId: sessionId, line, submittedAttachments: [] } } };
}
export function readCommandExecuteBody(response, rpcId) {
  assert.equal(response?.status, 200, 'PUBLIC_COMMAND_HTTP_STATUS');
  assert.equal(response.value?.rpcId, rpcId, 'PUBLIC_COMMAND_RPC');
  assert.equal(response.value?.result?.ok, true, 'PUBLIC_COMMAND_RESULT');
  const value = response.value.result.value;
  assert.ok(value && ['success', 'error'].includes(value.result?.kind), 'PUBLIC_COMMAND_KIND');
  return value;
}
export function readSaveHttpBody(response) {
  assert.equal(response?.status, 200, 'PUBLIC_SAVE_HTTP_STATUS');
  assert.equal(response.value?.schema_version, UI, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(response.value.ok, true, 'PUBLIC_SAVE_SCHEMA');
  return response.value;
}

/**
 * Linear public save acceptance: status, inspect, recheck, one save, discard that ACK,
 * accept only reconcile, then replay the same command. No browser phase machine.
 */
export async function acceptPublicSaveHttp({ call, target, candidateDigest, title, expectedOwner }) {
  assert.equal(typeof call, 'function', 'PUBLIC_SAVE_CALL');
  assert.match(target?.session_id ?? '', TARGET_SESSION, 'PUBLIC_SAVE_TARGET');
  assert.match(target?.run_id ?? '', OPAQUE, 'PUBLIC_SAVE_TARGET');
  assert.match(target?.call_id ?? '', TARGET_CALL, 'PUBLIC_SAVE_TARGET');
  assert.match(candidateDigest ?? '', SHA, 'PUBLIC_SAVE_CANDIDATE');
  assert.match(expectedOwner ?? '', /^[A-Za-z0-9_.@-]{1,64}$/, 'PUBLIC_SAVE_OWNER');
  assert.equal(typeof title, 'string', 'PUBLIC_SAVE_TITLE');
  assert.equal(title, title.trim(), 'PUBLIC_SAVE_TITLE');
  assert.ok(title.length >= 1 && title.length <= 120, 'PUBLIC_SAVE_TITLE');
  assert.equal(/[\u0000-\u001f\u007f]/.test(title), false, 'PUBLIC_SAVE_TITLE');
  const seen = [];
  const invoke = async (operation, payload) => {
    const body = await call(operation, payload);
    seen.push(operation);
    return body;
  };
  const status = await invoke('status', null);
  assert.equal(status?.schema_version, UI, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(status.ok, true, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(status.owner, expectedOwner, 'PUBLIC_SAVE_OWNER');
  const expectedIdentity = identityForTarget(expectedOwner, target, candidateDigest);
  assertIdentity(status.identity, candidateDigest, expectedIdentity);
  const owner = status.owner, identity = status.identity;
  const inspected = await invoke('inspect', null);
  assert.equal(inspected?.schema_version, UI, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(inspected.ok, true, 'PUBLIC_SAVE_SCHEMA');
  const admission = assertInspectAdmission(inspected.value, { identity, owner, runId: target.run_id, candidateDigest });
  const rechecked = await invoke('status', null);
  assert.equal(rechecked?.ok, true, 'PUBLIC_SAVE_SCHEMA');
  assert.equal(rechecked.owner, owner, 'PUBLIC_SAVE_OWNER');
  assert.ok(sameIdentity(rechecked.identity, identity), 'PUBLIC_SAVE_CANDIDATE');
  const command = { schema_version: COMMAND, identity, created_from_run_id: target.run_id, title, evidence_digest: admission.evidenceDigest };
  const bound = { owner, identity, runId: target.run_id, evidenceDigest: admission.evidenceDigest, dataScope: admission.dataScope };
  assert.equal(seen.includes('save'), false, 'PUBLIC_SAVE_WRITE');
  const discarded = assertSavedReceipt(await invoke('save', command), bound);
  assert.equal(seen.filter(item => item === 'save').length, 1, 'PUBLIC_SAVE_WRITE');
  assert.equal(seen.at(-1), 'save', 'PUBLIC_SAVE_WRITE');
  const receipt = assertSavedReceipt(await invoke('reconcile', identity), bound);
  assert.deepEqual(receipt, discarded, 'PUBLIC_SAVE_RECONCILE');
  const replay = async () => {
    const again = assertSavedReceipt(await invoke('save', command), bound);
    assert.deepEqual(again, receipt, 'PUBLIC_SAVE_REPLAY');
    assert.deepEqual(command, { schema_version: COMMAND, identity, created_from_run_id: target.run_id, title, evidence_digest: admission.evidenceDigest }, 'PUBLIC_SAVE_REPLAY');
    return again;
  };
  await replay();
  return { receipt, accepted_from: 'reconcile', writes_before_reconcile: 1, evidence: PUBLIC_SAVE_EVIDENCE,
    controller: PUBLIC_SAVE_CONTROLLER, replay, operations_before_accept: seen.slice(0, seen.lastIndexOf('reconcile') + 1) };
}
