/** Public D15 wire decoders. No native route, local clock or client approval. */
import { decodeFirstPurchaseResult, decodeFirstPurchaseResolvedFilters } from './first-purchase-query-model.mjs';

const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const opaque = v => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const timestamp = v => typeof v === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)
  && Number.isFinite(Date.parse(v));
const same = (a, b) => Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && a.every((v, i) => same(v, b[i]))
  : a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
    ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]))
    : a === b;
const positive = v => Number.isSafeInteger(v) && v > 0;
const identity = v => exact(v, ['schema_version', 'action_id', 'candidate_digest', 'correlation_id'])
  && v.schema_version === 'analytics-first-purchase-save-identity/v1'
  && opaque(v.action_id) && opaque(v.correlation_id) && sha(v.candidate_digest);
const analysisRef = v => exact(v, ['analysis_id', 'version']) && opaque(v.analysis_id) && positive(v.version);
const sourceRef = v => v.service_owner === 'analytics-first-purchase' && v.data_scope === 'first-purchase-fixture'
  && opaque(v.created_from_run_id) && sha(v.evidence_digest);

function freshness(v, generated) {
  if (!exact(v, ['freshness_state', 'freshness_checked_at', 'freshness_stale_at', 'freshness_expires_at',
    'policy_version', 'max_age_ms', 'expires_after_ms', 'reason']) || !timestamp(v.freshness_checked_at)) return false;
  if (v.policy_version === null) return v.freshness_state === 'UNKNOWN' && v.reason === 'POLICY_NOT_CONFIGURED'
    && v.max_age_ms === null && v.expires_after_ms === null
    && v.freshness_stale_at === null && v.freshness_expires_at === null;
  if (!opaque(v.policy_version) || !positive(v.max_age_ms) || !positive(v.expires_after_ms)
    || v.max_age_ms >= v.expires_after_ms || v.expires_after_ms > 2_147_483_647) return false;
  if (generated === null) return v.freshness_state === 'UNKNOWN' && v.reason === 'GENERATION_TIME_UNAVAILABLE'
    && v.freshness_stale_at === null && v.freshness_expires_at === null;
  if (!timestamp(v.freshness_stale_at) || !timestamp(v.freshness_expires_at)
    || Date.parse(v.freshness_stale_at) - Date.parse(generated) !== v.max_age_ms
    || Date.parse(v.freshness_expires_at) - Date.parse(generated) !== v.expires_after_ms) return false;
  // Validate the service's own observation, never decide expiry using Date.now().
  const elapsed = Date.parse(v.freshness_checked_at) - Date.parse(generated);
  const expected = elapsed < 0 ? ['UNKNOWN', 'CLOCK_BEFORE_GENERATION']
    : elapsed >= v.expires_after_ms ? ['EXPIRED', 'EXPIRED']
      : elapsed >= v.max_age_ms ? ['STALE', 'MAX_AGE_REACHED'] : ['FRESH', 'WITHIN_WINDOW'];
  return v.freshness_state === expected[0] && v.reason === expected[1];
}

function provenance(v, boundIdentity, result) {
  if (!exact(v, ['environment', 'data_time_window', 'query_scope', 'permission_scope', 'source_refs',
    'candidate_digest', 'generated_at', 'freshness']) || v.environment !== 'synthetic'
    || v.candidate_digest !== boundIdentity.candidate_digest
    || !(v.generated_at === null || timestamp(v.generated_at))) return false;
  const p = v.permission_scope, s = v.source_refs, window = v.data_time_window;
  if (!exact(p, ['owner_id', 'data_scope', 'can_read', 'can_save']) || !opaque(p.owner_id)
    || p.data_scope !== 'first-purchase-fixture' || typeof p.can_read !== 'boolean' || typeof p.can_save !== 'boolean'
    || !exact(s, ['service_owner', 'data_scope', 'created_from_run_id', 'evidence_digest',
      'primary_result_ref', 'method_package_digest']) || !sourceRef(s)
    || !(s.primary_result_ref === null || opaque(s.primary_result_ref))
    || !(s.method_package_digest === null || sha(s.method_package_digest))
    || !exact(window, ['kind', 'start_date', 'end_date']) || window.kind !== 'FIXED'
    || !/^\d{4}-\d\d-\d\d$/.test(window.start_date) || !/^\d{4}-\d\d-\d\d$/.test(window.end_date)
    || window.start_date >= window.end_date) return false;
  if (!decodeFirstPurchaseResolvedFilters(v.query_scope)) return false;
  if (result && !same(v.query_scope, result.resolved_filters)) return false;
  // A saved provenance uses the same strict domain query shape as a result.
  const q = v.query_scope;
  if (Date.parse(window.start_date + 'T00:00:00+08:00') !== Date.parse(q.resolved_cohort_start)
    || Date.parse(window.end_date + 'T00:00:00+08:00') !== Date.parse(q.resolved_cohort_end)) return false;
  return freshness(v.freshness, v.generated_at);
}

export function decodeFirstPurchaseSaveResult(v) {
  if (!exact(v, ['schema_version', 'api_version', 'identity', 'result_state', 'result', 'provenance',
    'save_eligible', 'save_ineligible_reason', 'finite_mock'])
    || v.schema_version !== 'analytics-first-purchase-save-result/v1' || v.api_version !== '1.0.0'
    || v.finite_mock !== true || !identity(v.identity) || !decodeFirstPurchaseResult(v.result)
    || v.result.status !== 'OK' || !provenance(v.provenance, v.identity, v.result)
    || !['SUCCESS_UNSAVED', 'SAVED', 'PARTIAL'].includes(v.result_state)
    || typeof v.save_eligible !== 'boolean') return null;
  const p = v.provenance, s = p.source_refs;
  const complete = p.generated_at !== null && s.primary_result_ref !== null && s.method_package_digest !== null;
  if (v.result_state === 'SUCCESS_UNSAVED' && !complete) return null;
  if (v.save_eligible) {
    if (v.result_state !== 'SUCCESS_UNSAVED' || !complete || p.freshness.freshness_state !== 'FRESH'
      || !p.permission_scope.can_read || !p.permission_scope.can_save || v.save_ineligible_reason !== null) return null;
  } else {
    const allowed = new Set(['ALREADY_SAVED', 'PROVENANCE_INCOMPLETE', 'PERMISSION_DENIED', 'CANDIDATE_NOT_ADMITTED',
      'POLICY_NOT_CONFIGURED', 'RESULT_STALE', 'RESULT_EXPIRED', 'FRESHNESS_UNKNOWN']);
    if (!allowed.has(v.save_ineligible_reason)) return null;
    if (v.result_state === 'SAVED' && v.save_ineligible_reason !== 'ALREADY_SAVED') return null;
  }
  return v;
}

export function decodeFirstPurchaseSaveReceipt(v) {
  if (!exact(v, ['schema_version', 'api_version', 'service_owner', 'state_schema_version', 'identity',
    'idempotency_key', 'owner_id', 'finite_mock', 'status', 'analysis_ref', 'source_ref', 'durable_state_key', 'reason'])
    || v.schema_version !== 'analytics-first-purchase-save-receipt/v1' || v.api_version !== '1.0.0'
    || v.service_owner !== 'analytics-first-purchase' || v.state_schema_version !== 1 || v.finite_mock !== true
    || !identity(v.identity) || !opaque(v.owner_id) || typeof v.idempotency_key !== 'string'
    || !/^[!-~]{1,200}$/.test(v.idempotency_key)) return null;
  if (v.status === 'SAVE_UNKNOWN') return v.analysis_ref === null && v.source_ref === null
    && v.durable_state_key === null && v.reason === 'RECEIPT_NOT_FOUND' ? v : null;
  if (v.status !== 'SAVED' || !analysisRef(v.analysis_ref)
    || !exact(v.source_ref, ['service_owner', 'data_scope', 'created_from_run_id', 'evidence_digest'])
    || !sourceRef(v.source_ref) || v.reason !== null
    || v.durable_state_key !== `first-purchase-analysis:${v.analysis_ref.analysis_id}:${v.analysis_ref.version}`) return null;
  return v;
}

export function decodeFirstPurchaseSavedProvenance(v) {
  if (!exact(v, ['schema_version', 'api_version', 'analysis_ref', 'identity', 'provenance', 'finite_mock'])
    || v.schema_version !== 'analytics-first-purchase-saved-provenance/v1' || v.api_version !== '1.0.0'
    || v.finite_mock !== true || !analysisRef(v.analysis_ref) || !identity(v.identity)
    || !provenance(v.provenance, v.identity, null)
    || v.provenance.freshness.freshness_state !== 'FRESH'
    || !v.provenance.permission_scope.can_read || !v.provenance.permission_scope.can_save
    || v.provenance.generated_at === null || v.provenance.source_refs.primary_result_ref === null
    || v.provenance.source_refs.method_package_digest === null) return null;
  return v;
}
