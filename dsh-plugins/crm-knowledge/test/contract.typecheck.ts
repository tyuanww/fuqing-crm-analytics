import type { components } from '../src/http-contract.generated.js';
export const request: components['schemas']['MetricRequest'] = {
  actor_scope: 'server_filled', amount_already_net: false, identity_scope: 'STOREWIDE', timezone: 'Asia/Shanghai',
  source_id: 'synthetic-crm-metrics', contains_real_data: false, metric_version: 'crm-metrics/v1',
  query_id: 'sales_window_summary', period_start: '2026-09-01', period_end_exclusive: '2026-10-01',
  refund_view: 'ORDER_COHORT_AS_OF', refund_as_of: '2026-09-21T00:00:00+08:00', data_through: '2026-09-21T00:00:00+08:00',
};
export function provenance(result: components['schemas']['MetricResult']) {
  const ref: string | null | undefined = result.adapter_query_ref;
  const scope: string | null | undefined = result.actor_scope;
  const complete: boolean | null | undefined = result.history_complete;
  return { ref, scope, complete };
}
