import { loadCoordinatorFixture } from '../src/free-page/fixture-loader.mjs';
import { saveIdentity } from '../src/first-purchase-save-gateway.mjs';
export const target = { session_id: 'fixture-session', run_id: 'fixture-run', call_id: 'fixture-call' };
export const owner = 'fixture-user';
export const candidate = 'a'.repeat(64);
export const identity = saveIdentity(owner, target, candidate);
const expected = loadCoordinatorFixture('analytics_first_purchase_v1_expected.json');
const result = expected.result;
export const inspected = {
  schema_version: 'analytics-first-purchase-save-result/v1', api_version: '1.0.0', identity,
  result_state: 'SUCCESS_UNSAVED', result, finite_mock: true, save_eligible: true, save_ineligible_reason: null,
  provenance: { environment: 'synthetic', candidate_digest: candidate, generated_at: '2026-10-06T00:00:00Z',
    data_time_window: { kind: 'FIXED', start_date: expected.request.cohort_window.start_date, end_date: expected.request.cohort_window.end_date },
    query_scope: result.resolved_filters,
    permission_scope: { owner_id: owner, data_scope: 'first-purchase-fixture', can_read: true, can_save: true },
    source_refs: { service_owner: 'analytics-first-purchase', data_scope: 'first-purchase-fixture', created_from_run_id: target.run_id,
      evidence_digest: 'b'.repeat(64), primary_result_ref: 'fixture-result', method_package_digest: 'c'.repeat(64) },
    freshness: { freshness_state: 'NOT_CHECKED', freshness_checked_at: '2026-10-06T00:00:00Z', freshness_stale_at: null,
      freshness_expires_at: null, policy_version: 'fixture-policy', max_age_ms: null, expires_after_ms: null, reason: 'DISABLED_BY_POLICY' },
  },
};
export const command = { schema_version: 'analytics-first-purchase-save-command/v1', identity, created_from_run_id: target.run_id,
  title: '合成首购分析', evidence_digest: 'b'.repeat(64) };
export const unknown = { schema_version: 'analytics-first-purchase-save-receipt/v1', api_version: '1.0.0', service_owner: 'analytics-first-purchase',
  state_schema_version: 1, identity, idempotency_key: identity.action_id, owner_id: owner, finite_mock: true,
  status: 'SAVE_UNKNOWN', analysis_ref: null, source_ref: null, durable_state_key: null, reason: 'RECEIPT_NOT_FOUND' };
export const saved = { ...unknown, status: 'SAVED', analysis_ref: { analysis_id: 'analysis-fixture', version: 1 },
  source_ref: { service_owner: 'analytics-first-purchase', data_scope: 'first-purchase-fixture', created_from_run_id: target.run_id, evidence_digest: command.evidence_digest },
  durable_state_key: 'first-purchase-analysis:analysis-fixture:1', reason: null };
export const ok = value => ({ schema_version: 'shinemage-first-purchase-ui/v1', ok: true, value });
export const status = { schema_version: 'shinemage-first-purchase-ui/v1', ok: true, owner, identity };
export const storage = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), values }; };
export function browserRequest(operation, payload = null, extra = {}) {
  return new Request('http://dsh.internal/api/analytics-first-purchase/save', { method: 'POST',
    headers: { origin: 'http://127.0.0.1:43299', 'content-type': 'application/json', 'x-first-purchase-ui': '1', ...extra },
    body: JSON.stringify({ operation, target, payload }) });
}
