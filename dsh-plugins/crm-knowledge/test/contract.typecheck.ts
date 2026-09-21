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


import type { components as DashboardComponents } from '../src/dashboard-contract.generated.js';
export function purchaseCoverage(result: DashboardComponents['schemas']['DashboardPurchases']) {
  const aov: number | null = result.aov.amount_fen;
  const aus: number | null = result.aus.amount_fen;
  const unknown: number = result.coverage.unknown_buyer_rows;
  return { aov, aus, unknown };
}

export function readinessClass(result: DashboardComponents['schemas']['DashboardReadiness']) {
  const klass: 'A' | 'B' | 'C' = result.metrics[0].acceptance_class;
  const present: boolean = result.metrics[0].source_present;
  return { klass, present };
}

export function membershipStatus(result: DashboardComponents['schemas']['DashboardMembership']) {
  const status: 'OK' | 'UNAVAILABLE' = result.status;
  const premium: number | null | undefined = result.premium?.value;
  return { status, premium };
}

export function netStatus(result: DashboardComponents['schemas']['DashboardNetGsv']) {
  const status: 'OK' | 'UNAVAILABLE' = result.status;
  const net: number | null = result.net_gsv_amount_fen;
  return { status, net };
}
