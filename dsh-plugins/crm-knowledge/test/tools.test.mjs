import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainCrm, listCapabilities, queryCrmMetrics } from '../src/run.mjs';

const base = {
  source_id: 'synthetic-crm-metrics',
  contains_real_data: false,
  metric_version: 'crm-metrics/v1',
  period_start: '2026-09-01',
  period_end_exclusive: '2026-10-01',
  refund_view: 'ORDER_COHORT_AS_OF',
  refund_as_of: '2026-09-21T00:00:00+08:00',
  data_through: '2026-09-21T00:00:00+08:00',
  timezone: 'Asia/Shanghai',
  identity_scope: 'STOREWIDE',
  amount_already_net: false,
};

test('sales query returns versioned facts', () => {
  const result = queryCrmMetrics({ ...base, query_id: 'sales_window_summary' });
  assert.equal(result.metric_version, 'crm-metrics/v1');
  assert.equal(result.synthetic, true);
  assert.equal(result.real_business_acceptance, false);
  assert.equal(typeof result.facts.aus.value, 'number');
  assert.equal(typeof result.facts.aov.value, 'number');
  assert.ok(result.query_ref);
  assert.ok(result.limitations.some((item) => item.code === 'D019_SOURCE_UNVERIFIED'));
});

test('repurchase query returns rate or empty reason', () => {
  const result = queryCrmMetrics({ ...base, query_id: 'existing_customer_repurchase' });
  assert.ok(result.facts.opening_old_customers.value >= 1);
  assert.ok(result.facts.repurchase_rate.value !== undefined);
});

test('sample followup keeps ROI disclaimer and maturity split', () => {
  const result = queryCrmMetrics({ ...base, query_id: 'sample_followup', observation_days: 14 });
  assert.match(result.facts.sampling_roi_disclaimer, /复购收入表现/);
  assert.ok(result.facts.immature_count.value >= 1);
});

test('explain cites decisions and does not claim legacy code is fixed', () => {
  const result = explainCrm('客单价');
  assert.ok(result.decision_ids.includes('D001'));
  assert.equal(result.code_fixed_in_legacy_services, false);
  assert.ok(result.evidence_refs.length >= 1);
});

test('capabilities stay synthetic and leave competition untouched', () => {
  const result = listCapabilities();
  assert.equal(result.synthetic_only, true);
  assert.equal(result.real_archive, false);
  assert.equal(result.competition_scope_untouched, true);
  assert.equal(result.d019, 'unverified');
});

test('real data flag is rejected before CLI facts', () => {
  assert.throws(() => queryCrmMetrics({ ...base, query_id: 'sales_window_summary', contains_real_data: true }));
});
