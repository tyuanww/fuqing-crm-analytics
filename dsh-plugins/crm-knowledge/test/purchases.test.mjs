import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDashboardPurchases, normalizePurchases } from '../src/dashboard.mjs';
import { serveDashboard, request } from './dashboard.fixture.mjs';

const filters = { ...request, channel: '全店', exclude_low_price: false };
const aggregate = () => ({
  schema_version: 'crm-dashboard-purchases/v1', metric_version: 'dashboard-gsv-purchases/v1', filters,
  gsv_amount_fen: 20000, coverage: { rows: 4, orders: 3, buyers: 2, unknown_order_rows: 0,
    unknown_buyer_rows: 0, unknown_order_amount_fen: 0, unknown_buyer_amount_fen: 0,
    null_amount_rows: 0, negative_amount_rows: 0, zero_amount_orders: 0, zero_only_buyers: 0 },
  aov: { amount_fen: 6667, denominator: 3, reason: null },
  aus: { amount_fen: 10000, denominator: 2, reason: null }, data_through: null, refund_as_of: null,
});

test('authenticated purchase tool requests only bounded aggregate and projects allowed fields', async t => {
  const { binding, calls } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/dashboard-purchases')) {
      res.end(JSON.stringify({ ...aggregate(), secret: 'private-server-value' })); return true;
    }
  });
  const value = await queryDashboardPurchases(request, { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'OK', JSON.stringify(value));
  assert.equal(value.aov.amount_yuan, '66.67'); assert.equal(value.aus.amount_yuan, '100.00');
  assert.equal(value.synthetic, true);
  assert.deepEqual(calls.map(x => x.path), ['/api/v1/auth/me', '/api/v1/metrics/dashboard-purchases']);
  assert.deepEqual(calls[1].params, { ...filters, exclude_low_price: 'false' });
  assert.equal(JSON.stringify(value).includes('private-server-value'), false);
});

test('missing aggregate route fails without falling back to legacy avg_order_value', async t => {
  const { binding, calls } = await serveDashboard(t);
  const value = await queryDashboardPurchases(request, { binding, sessionId: 'fixture-session' });
  assert.equal(value.status, 'UNAVAILABLE');
  assert.equal(calls.length, 2); assert.equal('aov' in value, false);
});

test('unknown buyer null is preserved while complete order mean remains available', () => {
  const input = aggregate(); input.coverage.unknown_buyer_rows = 1; input.coverage.unknown_buyer_amount_fen = 5000;
  input.aus = { amount_fen: null, denominator: 2, reason: 'UNKNOWN_BUYER' };
  const value = normalizePurchases(input, filters, 'synthetic');
  assert.equal(value.aus.amount_yuan, null); assert.equal(value.aus.reason, 'UNKNOWN_BUYER');
  assert.equal(value.aov.amount_fen, 6667);
});

test('rejects mismatched filters, unsafe integers, false coverage and wrong means', () => {
  for (const mutate of [
    x => { x.filters = { ...filters, channel: '淘客' }; },
    x => { x.gsv_amount_fen = Number.MAX_SAFE_INTEGER + 1; },
    x => { x.aov.amount_fen = 5000; },
    x => { x.coverage.unknown_order_rows = 1; },
    x => { x.coverage.zero_only_buyers = 5; },
    x => { x.coverage.rows = 1; },
    x => { x.aov.denominator = 4; },
    x => { x.schema_version = 'legacy'; },
  ]) {
    const input = aggregate(); mutate(input);
    assert.throws(() => normalizePurchases(input, filters, 'synthetic'));
  }
});

test('authentication and cancellation boundaries apply to purchases too', async t => {
  const { binding, calls } = await serveDashboard(t);
  for (const options of [{}, { binding, sessionId: 'other' }, { binding, sessionId: 'fixture-session', signal: AbortSignal.abort() }]) {
    assert.equal((await queryDashboardPurchases(request, options)).status, 'UNAVAILABLE');
  }
  assert.equal(calls.length, 0);
});


test('confirmed free-order coverage does not lower paid purchase averages', () => {
  const input = aggregate(); input.coverage.rows += 2;
  input.coverage.zero_amount_orders = 2; input.coverage.zero_only_buyers = 1;
  const value = normalizePurchases(input, filters, 'synthetic');
  assert.equal(value.aov.amount_fen, 6667); assert.equal(value.aus.amount_fen, 10000);
  assert.equal(value.coverage.zero_amount_orders, 2);
});
