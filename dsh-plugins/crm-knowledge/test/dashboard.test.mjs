import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_CHANNELS, LOW_PRICE_CHANNELS as FRONTEND_LOW } from '../../../frontend-vue3/src/constants/channels.ts';
import { CHANNELS, LOW_PRICE_CHANNELS, queryDashboardGsv, normalizeDashboard, dashboardCapabilities, dashboardKnowledgeContext } from '../src/dashboard.mjs';
import { serveDashboard, request, overview, trend } from './dashboard.fixture.mjs';

const query = (input, binding, extra = {}) => queryDashboardGsv(input, { sessionId: 'fixture-session', binding, ...extra });
function unavailable(result, code) {
  assert.equal(result.status, 'UNAVAILABLE', JSON.stringify(result));
  assert.equal(result.reason.code, code);
  assert.equal('gsv' in result, false);
  assert.equal(JSON.stringify(result).includes('fixture-only-token'), false);
}

test('channel names and low-price selection track the actual frontend source', () => {
  assert.deepEqual(CHANNELS, ['全店', '纯派样', ...ACTIVE_CHANNELS]);
  assert.deepEqual(LOW_PRICE_CHANNELS, FRONTEND_LOW);
});

test('authenticated API result preserves accepted amount, exact cents and filters', async t => {
  const { binding, calls } = await serveDashboard(t);
  const result = await query(request, binding);
  assert.equal(result.status, 'OK', JSON.stringify(result));
  assert.deepEqual(result.gsv, { amount_fen: 10031, amount_yuan: '100.31', currency: 'CNY' });
  assert.deepEqual(result.daily.map(row => row.amount_fen), [3010, 7021]);
  assert.equal(result.contains_real_data, false);
  assert.equal(result.synthetic, true);
  assert.equal(result.data_through, null);
  assert.equal(result.refund_as_of, null);
  assert.equal('avg_order_value' in result, false);
  assert.equal('member_premium' in result, false);
  assert.deepEqual(calls.map(call => call.path), ['/api/v1/auth/me', '/api/v1/metrics/overview', '/api/v1/metrics/trend']);
  assert.ok(calls.every(call => call.authenticated && call.method === 'GET'));
  assert.deepEqual(calls[1].params, { ...request, metric_type: 'GSV' });
  assert.deepEqual(calls[1].params, calls[2].params);
});

test('channel and low-price switches use identical repeated query parameters', async t => {
  const { binding, calls } = await serveDashboard(t);
  const result = await query({ ...request, channel: '纯派样', exclude_low_price: true }, binding);
  assert.equal(result.status, 'OK');
  assert.equal(calls[1].params.channel, '纯派样');
  assert.deepEqual(calls[1].excluded, LOW_PRICE_CHANNELS);
  assert.deepEqual(calls[1].params, calls[2].params);
  assert.deepEqual(result.filters.exclude_channels, LOW_PRICE_CHANNELS);
});

test('missing login and another host session never request data', async t => {
  const { binding, calls } = await serveDashboard(t);
  unavailable(await query(request, null), 'NOT_CONNECTED');
  unavailable(await query(request, binding, { sessionId: 'other-session' }), 'SESSION_NOT_BOUND');
  assert.equal(calls.length, 0);
  assert.equal(dashboardCapabilities().connection_state, 'NOT_CONNECTED');
});

test('rejects extra fields, malformed dates, invalid scope and excessive windows before HTTP', async t => {
  const { binding, calls } = await serveDashboard(t);
  for (const invalid of [
    null, [], { ...request, sql: 'select 1' }, { ...request, token: 'ignored' },
    { ...request, refund_as_of: '2026-02-01' }, { ...request, base_url: binding.baseUrl },
    { ...request, start_date: '2026-02-29' }, { ...request, end_date: '2025-12-31' },
    { ...request, end_date: '2026-04-01' }, { ...request, channel: 'unknown' },
    { ...request, exclude_low_price: 'false' }, { ...request, channel: null },
  ]) unavailable(await query(invalid, binding), 'INVALID_REQUEST');
  assert.equal(calls.length, 0);
});

test('only a trusted literal loopback origin is accepted', async t => {
  const { binding, calls } = await serveDashboard(t);
  for (const baseUrl of ['http://example.com', 'http://localhost:8000', 'http://127.0.0.1:8000/api', 'http://user:secret@127.0.0.1', 'http://127.0.0.1?q=secret', 'http://127.0.0.1/#x']) {
    unavailable(await query(request, { ...binding, baseUrl }), 'INVALID_BINDING');
  }
  assert.equal(calls.length, 0);
});

test('account mismatch stops before metrics', async t => {
  const { binding, calls } = await serveDashboard(t);
  unavailable(await query(request, { ...binding, username: 'other-owner' }), 'ACCOUNT_MISMATCH');
  assert.equal(calls.length, 1);
});

test('HTTP authentication, busy, warning and error responses fail without leaking bodies', async t => {
  for (const [status, code] of [[401, 'AUTH_EXPIRED'], [403, 'ACCESS_DENIED'], [409, 'SERVICE_BUSY'], [429, 'SERVICE_BUSY'], [500, 'UPSTREAM_ERROR']]) {
    await t.test(String(status), async t => {
      const { binding, calls } = await serveDashboard(t, (_url, _req, res) => { res.statusCode = status; res.end('fixture-only-token'); return true; });
      unavailable(await query(request, binding), code); assert.equal(calls.length, 1);
    });
  }
  await t.test('upstream warning', async t => {
    const { binding } = await serveDashboard(t, (_url, _req, res) => { res.setHeader('X-Data-Warning', 'future-date'); res.end('{}'); return true; });
    unavailable(await query(request, binding), 'DATA_WARNING');
  });
});

test('login expiry during a metrics request is honored without a retry or cache', async t => {
  let count = 0;
  const { binding, calls } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/me') && ++count === 1) return false;
    res.statusCode = 401; res.end('{}'); return true;
  });
  unavailable(await query(request, binding), 'AUTH_EXPIRED');
  assert.equal(calls.length, 2);
  unavailable(await query(request, binding), 'AUTH_EXPIRED');
  assert.equal(calls.length, 3);
});

test('redirects cannot forward bearer credentials', async t => {
  const destination = await serveDashboard(t);
  const source = await serveDashboard(t, (_url, _req, res) => { res.statusCode = 302; res.setHeader('Location', destination.binding.baseUrl); res.end(); return true; });
  unavailable(await query(request, source.binding), 'UPSTREAM_ERROR');
  assert.equal(destination.calls.length, 0);
});

test('bounded body parsing rejects invalid, oversized and non-JSON content', async t => {
  for (const [name, send] of [
    ['invalid', res => res.end('fixture-only-token')],
    ['oversized-stream', res => { res.write('{"value":"'); res.end('x'.repeat(262145) + '"}'); }],
    ['oversized-header', res => { res.setHeader('Content-Length', '999999'); res.end('{}'); }],
    ['html', res => { res.setHeader('Content-Type', 'text/html'); res.end('<html/>'); }],
  ]) await t.test(name, async t => {
    const { binding } = await serveDashboard(t, (_url, _req, res) => { send(res); return true; });
    unavailable(await query(request, binding), 'INVALID_RESPONSE');
  });
});

test('cancellation and timeout return no amounts and release client requests', async t => {
  const { binding, calls } = await serveDashboard(t, () => true);
  const already = new AbortController(); already.abort();
  unavailable(await query(request, binding, { signal: already.signal }), 'CANCELLED');
  assert.equal(calls.length, 0);
  unavailable(await query(request, binding, { timeoutMs: 20 }), 'TIMEOUT');
  const controller = new AbortController();
  const pending = query(request, binding, { signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  unavailable(await pending, 'CANCELLED');
});

test('valid missing dates remain explicit, including genuinely empty returned data', () => {
  const filters = { ...request, channel: '全店', exclude_low_price: false };
  const sparse = normalizeDashboard({ ...overview, amount: 30.1 }, { ...trend, dates: ['2026-01-01'], amounts: [30.1] }, filters, 'synthetic');
  assert.deepEqual(sparse.reconciliation.dates_not_returned, ['2026-01-02']);
  assert.equal(sparse.daily.length, 1);
  const empty = normalizeDashboard({ ...overview, amount: 0 }, { ...trend, dates: [], amounts: [] }, filters, 'synthetic');
  assert.equal(empty.gsv.amount_fen, 0);
  assert.equal(empty.daily.length, 0);
  assert.equal(empty.reconciliation.dates_not_returned.length, 2);
});

test('upstream contract and total/day mismatch cannot produce usable facts', async t => {
  for (const [name, changedOverview, changedTrend, code] of [
    ['sum', { ...overview, amount: 1 }, trend, 'INCONSISTENT_RESULT'],
    ['null', { ...overview, amount: null }, trend, 'INVALID_RESPONSE'],
    ['sub-cent', { ...overview, amount: 100.311 }, trend, 'INVALID_RESPONSE'],
    ['unsafe', { ...overview, amount: 900719925474099 }, trend, 'INVALID_RESPONSE'],
    ['metric', { ...overview, metric_type: 'GMV' }, trend, 'INVALID_RESPONSE'],
    ['window', { ...overview, date_range: { start: '2025-01-01', end: request.end_date } }, trend, 'INVALID_RESPONSE'],
    ['duplicate', overview, { ...trend, dates: ['2026-01-01', '2026-01-01'] }, 'INVALID_RESPONSE'],
    ['outside', overview, { ...trend, dates: ['2025-12-31', '2026-01-02'] }, 'INVALID_RESPONSE'],
    ['length', overview, { ...trend, amounts: [100.31] }, 'INVALID_RESPONSE'],
  ]) await t.test(name, async t => {
    const { binding } = await serveDashboard(t, (url, _req, res) => {
      if (url.pathname.endsWith('/me')) return false;
      res.end(JSON.stringify(url.pathname.endsWith('/overview') ? changedOverview : changedTrend)); return true;
    });
    unavailable(await query(request, binding), code);
  });
});

test('knowledge explicitly separates current dashboard GSV and net candidate', () => {
  const context = dashboardKnowledgeContext();
  assert.equal(context.default_for_real_gsv, 'query_crm_dashboard_gsv');
  assert.match(context.difference_from_target, /不能.*再扣退款/);
  assert.equal(context.refund_as_of_supported, false);
});
