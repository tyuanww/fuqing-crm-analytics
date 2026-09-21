import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDashboardReadiness, queryDashboardMembership, queryDashboardNetGsv } from '../src/dashboard.mjs';
import { serveDashboard, request } from './dashboard.fixture.mjs';

test('readiness tool projects A/B/C and does not forward secrets', async t => {
  const { binding, calls } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-readiness')) {
      res.end(JSON.stringify({
        schema_version: 'crm-dashboard-readiness/v1', metric_version: 'dashboard-readiness/v1',
        inventory: { schema_version: 'crm-dashboard-source/v1', tables: ['orders'], has_dashboard_gsv_fields: true,
          has_membership_at_purchase: false, has_membership_events: false, has_is_member_current: true,
          has_refund_events: false, has_refund_succeeded_at: false, has_parent_order_id: false,
          has_first_purchase_as_of: false, has_sample_qualification: false, has_sample_received_at: true,
          has_cost_profit: false, rejected_substitutes: ['orders.is_member'] },
        metrics: [{ metric_id: 'aov', name: 'AOV', acceptance_class: 'A', formula: 'gsv/orders', source: 'purchases',
          gap: '', required_fields: ['order_id'], source_system: 'orders', unlock: '', source_present: true }],
        data_through: null, refund_as_of: null, limitations: ['meta only'], secret: 'nope',
      }));
      return true;
    }
  });
  const value = await queryDashboardReadiness({}, { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'OK');
  assert.equal(value.metrics[0].acceptance_class, 'A');
  assert.equal(JSON.stringify(value).includes('nope'), false);
  assert.deepEqual(calls.map(x => x.path), ['/api/v1/auth/me', '/api/v1/metrics/dashboard-readiness']);
});

test('membership unavailable is preserved and does not use current member flag', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-membership')) {
      res.end(JSON.stringify({
        schema_version: 'crm-dashboard-membership/v1', metric_version: 'dashboard-member-premium/v1',
        status: 'UNAVAILABLE', filters: { ...request, channel: '全店', exclude_low_price: false },
        reason: 'MEMBERSHIP_AT_PURCHASE_UNAVAILABLE', required_fields: ['orders.membership_at_purchase'],
        source_system: 'orders.is_member', unlock: 'need snapshot', member_gsv_amount_fen: null,
        non_member_gsv_amount_fen: null, unknown_member_gsv_amount_fen: null, coverage: null,
        member_aus: null, non_member_aus: null, premium: { value: null, unit: 'multiple', reason: 'UNAVAILABLE' },
        data_through: null, refund_as_of: null, limitations: ['no current is_member'],
      }));
      return true;
    }
  });
  const value = await queryDashboardMembership(request, { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'UNAVAILABLE');
  assert.equal(value.reason, 'MEMBERSHIP_AT_PURCHASE_UNAVAILABLE');
  assert.equal('premium' in value, false);
});

test('net gsv rejects already-net conflict without inventing an amount', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-net-gsv')) {
      res.end(JSON.stringify({
        schema_version: 'crm-dashboard-net-gsv/v1', metric_version: 'dashboard-net-gsv/v1',
        status: 'UNAVAILABLE', filters: { ...request, channel: '全店', exclude_low_price: false },
        refund_as_of: '2026-07-31', reason: 'AMOUNT_ALREADY_NET_CONFLICT',
        required_fields: ['refund_id'], source_system: 'orders.is_refund + refund events', unlock: 'one source',
        gross_paid_fen: null, succeeded_refund_fen: null, net_gsv_amount_fen: null,
        parent_child_attributed: false, data_through: null, limitations: [],
      }));
      return true;
    }
  });
  const value = await queryDashboardNetGsv({ ...request, refund_as_of: '2026-07-31' },
    { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'UNAVAILABLE');
  assert.equal(value.reason, 'AMOUNT_ALREADY_NET_CONFLICT');
  assert.equal('net_gsv' in value, false);
});

test('membership OK projector keeps member and non-member AUS', async t => {
  const filters = { ...request, channel: '全店', exclude_low_price: false };
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-membership')) {
      res.end(JSON.stringify({
        schema_version: 'crm-dashboard-membership/v1', metric_version: 'dashboard-member-premium/v1',
        status: 'OK', filters,
        member_gsv_amount_fen: 30000, non_member_gsv_amount_fen: 15000, unknown_member_gsv_amount_fen: 9000,
        member_aus: { amount_fen: 15000, denominator: 2, reason: null },
        non_member_aus: { amount_fen: 5000, denominator: 3, reason: null },
        premium: { value: 3, unit: 'multiple', reason: 'UNKNOWN_IDENTITY' },
        coverage: { member_buyers: 2, non_member_buyers: 3, unknown_member_buyers: 1 },
        limitations: ['成交时身份'],
      }));
      return true;
    }
  });
  const value = await queryDashboardMembership(request, { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'OK');
  assert.equal(value.member_gsv.amount_fen, 30000);
  assert.equal(value.non_member_aus.amount_fen, 5000);
  assert.equal(value.premium.value, 3);
  assert.equal(JSON.stringify(value).includes('is_member'), false);
});

test('net gsv OK projector does not reuse dashboard gsv as net', async t => {
  const filters = { ...request, channel: '全店', exclude_low_price: false };
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-net-gsv')) {
      res.end(JSON.stringify({
        schema_version: 'crm-dashboard-net-gsv/v1', metric_version: 'dashboard-net-gsv/v1',
        status: 'OK', filters, refund_as_of: '2026-07-31',
        gross_paid_fen: 10000, succeeded_refund_fen: 2000, net_gsv_amount_fen: 8000,
        parent_child_attributed: true, limitations: [],
      }));
      return true;
    }
  });
  const value = await queryDashboardNetGsv({ ...request, refund_as_of: '2026-07-31' },
    { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'OK');
  assert.equal(value.net_gsv.amount_fen, 8000);
  assert.equal(value.gross_paid.amount_fen, 10000);
  assert.equal(value.succeeded_refund.amount_fen, 2000);
  assert.match(value.limitations[0], /分列/);
});

test('net gsv unavailable does not subtract from dashboard gsv', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-net-gsv')) {
      res.end(JSON.stringify({
        schema_version: 'crm-dashboard-net-gsv/v1', metric_version: 'dashboard-net-gsv/v1',
        status: 'UNAVAILABLE', filters: { ...request, channel: '全店', exclude_low_price: false },
        refund_as_of: '2026-07-31', reason: 'MISSING_REFUND_EVENTS',
        required_fields: ['refund_id'], source_system: 'orders.is_refund', unlock: 'need events',
        gross_paid_fen: null, succeeded_refund_fen: null, net_gsv_amount_fen: null,
        parent_child_attributed: false, data_through: null, limitations: [],
      }));
      return true;
    }
  });
  const value = await queryDashboardNetGsv({ ...request, refund_as_of: '2026-07-31' },
    { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'UNAVAILABLE');
  assert.equal(value.reason, 'MISSING_REFUND_EVENTS');
  assert.equal('net_gsv' in value, false);
});
