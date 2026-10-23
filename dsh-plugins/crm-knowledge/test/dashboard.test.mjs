import test from 'node:test';
import assert from 'node:assert/strict';
import { isJsonValue } from '@deepseek-ai/dsh-util-values';
import { ACTIVE_CHANNELS, LOW_PRICE_CHANNELS as FRONTEND_LOW } from '../../../frontend-vue3/src/constants/channels.ts';
import { CHANNELS, LEAF_CHANNELS, LOW_PRICE_CHANNELS, channelRole, queryDashboardGsv,
  queryProductCustomer, queryRfmSnapshot, normalizeDashboard, normalizeProductCustomer, dashboardCapabilities,
  dashboardKnowledgeContext } from '../src/dashboard.mjs';
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
  assert.deepEqual(LEAF_CHANNELS, [...ACTIVE_CHANNELS]);
  assert.deepEqual(LOW_PRICE_CHANNELS, FRONTEND_LOW);
  const caps = dashboardCapabilities();
  assert.equal('purchases_requires_backend' in caps, false);
  assert.equal(caps.purchases_runtime_status, 'unknown_until_query_crm_dashboard_purchases_is_called');
  assert.deepEqual(caps.channel_hierarchy.leaf_partition, [...LEAF_CHANNELS]);
  assert.deepEqual(caps.channel_hierarchy.aggregates.find(row => row.channel === '纯派样').equals, ['U先派样', '百补派样']);
  assert.equal(channelRole('纯派样').add_with_leaves, false);
  assert.equal(channelRole('货架').add_with_leaves, true);
  const leaves = new Set(caps.channel_hierarchy.leaf_partition);
  assert.equal(leaves.has('纯派样') || leaves.has('全店'), false);
});

test('authenticated API result preserves accepted amount, exact cents and filters', async t => {
  const { binding, calls } = await serveDashboard(t);
  const result = await query(request, binding);
  assert.equal(result.status, 'OK', JSON.stringify(result));
  assert.deepEqual(result.gsv, { amount_fen: 10031, amount_yuan: '100.31', currency: 'CNY' });
  assert.deepEqual(result.daily.map(row => row.amount_fen), [3010, 7021]);
  assert.equal(result.returned_day_count, 2);
  assert.equal(result.calendar_day_count, 2);
  assert.equal('day_count' in result, false);
  assert.equal(result.contains_real_data, false);
  assert.equal(result.synthetic, true);
  assert.equal(result.data_through, null);
  assert.equal(result.warehouse_cutoff, '2026-07-10');
  assert.equal(result.refund_as_of, null);
  assert.equal('avg_order_value' in result, false);
  assert.equal('member_premium' in result, false);
  assert.deepEqual(result.audience, { source: 'user_first_purchase', definition: '新客是首购日晚于窗口开始前一天的买家；老客是首购日不晚于该日的买家。', new_users: 3, old_users: 7, new_user_amount_yuan: 20.1, old_user_amount_yuan: 80.21, new_user_ratio: 0.2004, old_user_ratio: 0.7996 });
  assert.deepEqual(calls.map(call => call.path), ['/api/v1/auth/me', '/api/v1/metrics/overview', '/api/v1/metrics/trend', '/api/v1/metrics/cutoff']);
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

test('requests after the warehouse cutoff fail instead of returning zero as OK', async t => {
  const outOfCoverage = { start_date: '2026-07-06', end_date: '2026-07-07' };
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname.endsWith('/me')) return false;
    if (url.pathname.endsWith('/overview')) {
      res.end(JSON.stringify({
        ...overview,
        date_range: { start: outOfCoverage.start_date, end: outOfCoverage.end_date, cutoff: null },
        amount: 0,
        new_users: 0,
        old_users: 0,
        new_user_amount: 0,
        old_user_amount: 0,
        new_user_ratio: 0,
        old_user_ratio: 0,
      }));
    } else if (url.pathname.endsWith('/trend')) {
      res.end(JSON.stringify({ ...trend, dates: [], amounts: [] }));
    } else if (url.pathname.endsWith('/cutoff')) {
      res.end(JSON.stringify({ cutoff_date: '2026-07-05' }));
    }
    return true;
  });

  unavailable(await query(outOfCoverage, binding), 'INSUFFICIENT_COVERAGE');
});

// Regression: ISSUE-003 — a failed cutoff lookup must not bypass coverage proof.
// Found by /qa on 2026-10-22
// Report: .gstack/qa-reports/qa-report-app.tyuan.chat-2026-10-22.md
test('missing warehouse cutoff fails closed instead of returning an unbounded GSV', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname !== '/api/v1/metrics/cutoff') return false;
    res.statusCode = 503;
    res.end('{}');
    return true;
  });
  unavailable(await query(request, binding), 'SERVICE_UNAVAILABLE');
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
  for (const [status, code] of [
    [400, 'INVALID_REQUEST'], [401, 'AUTH_EXPIRED'], [403, 'ACCESS_DENIED'],
    [409, 'SERVICE_BUSY'], [422, 'INVALID_REQUEST'], [429, 'SERVICE_BUSY'],
    [500, 'UPSTREAM_ERROR'], [503, 'SERVICE_UNAVAILABLE'],
  ]) {
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
  assert.equal(sparse.returned_day_count, 1);
  assert.equal(sparse.calendar_day_count, 2);
  const empty = normalizeDashboard({ ...overview, amount: 0 }, { ...trend, dates: [], amounts: [] }, filters, 'synthetic');
  assert.equal(empty.gsv.amount_fen, 0);
  assert.equal(empty.daily.length, 0);
  assert.equal(empty.returned_day_count, 0);
  assert.equal(empty.calendar_day_count, 2);
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

test('product customer query uses one authenticated POST and preserves source facts', async t => {
  const productResponse = {
    schema_version: 'product-customer/v3',
    status: 'OK',
    source: 'orders+user_first_purchase',
    date_start: '2026-07-01',
    date_end: '2026-07-05',
    compare_start_date: '2025-07-01',
    compare_end_date: '2025-07-05',
    new_old_cutoff: '2026-06-30',
    comparison_new_old_cutoff: '2025-06-30',
    data_cutoff: '2026-07-05',
    data_version: 'orders-v1:2024-05-10:2026-07-05:17:1234.00',
    metric_type: 'GSV',
    channel: null,
    exclude_channels: [],
    coverage: {
      data_cutoff: '2026-07-05',
      current_status: 'COMPLETE',
      comparison_status: 'COMPLETE',
    },
    products: [{
      name: '经典膜',
      display_name: '爆款面膜E',
      spu_classes: ['经典膜', '【妆】经典膜'],
      status: 'OK',
      current: {
        gsv: 190, users: 2, aus: 95, old_gsv: 150, old_users: 1, old_aus: 150,
        old_ratio: 0.7895, new_gsv: 40, new_users: 1, new_aus: 40, new_ratio: 0.2105,
        member_gsv: 0, member_users: 0, member_aus: 0, member_ratio: 0,
        old_users_ratio: 0.5, new_users_ratio: 0.5,
      },
      comparison: {
        gsv: 100, users: 2, aus: 50, old_gsv: 80, old_users: 1, old_aus: 80,
        old_ratio: 0.8, new_gsv: 20, new_users: 1, new_aus: 20, new_ratio: 0.2,
        member_gsv: 0, member_users: 0, member_aus: 0, member_ratio: 0,
        old_users_ratio: 0.5, new_users_ratio: 0.5,
      },
      yoy: {
        gsv: 0.9, users: 0, aus: 0.9, old_gsv: 0.875, old_users: 0, old_aus: 0.875,
        new_gsv: 1, new_users: 0, new_aus: 1, old_ratio_ppt: -0.0105,
        new_ratio_ppt: 0.0105, old_users_ratio_ppt: 0, new_users_ratio_ppt: 0,
      },
    }],
  };
  let postedBody = null;
  const { binding, calls } = await serveDashboard(t, (url, req, res) => {
    if (url.pathname !== '/api/v1/category/product-customer') return false;
    assert.equal(req.method, 'POST');
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      postedBody = JSON.parse(raw);
      res.end(JSON.stringify(productResponse));
    });
    return true;
  });
  const result = await queryProductCustomer({
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    products: ['爆款面膜E'],
  }, { sessionId: 'fixture-session', binding });
  assert.equal(result.status, 'OK', JSON.stringify(result));
  assert.equal(result.current, undefined);
  assert.equal(result.products[0].display_name, '爆款面膜E');
  assert.equal('name' in result.products[0], false);
  assert.equal('spu_classes' in result.products[0], false);
  assert.equal(JSON.stringify(result).includes('经典膜'), false);
  assert.deepEqual(result.filters.products, ['爆款面膜E']);
  assert.deepEqual(result.coverage, productResponse.coverage);
  assert.equal(result.products[0].current.users, 2);
  assert.equal(result.products[0].current.old_gsv + result.products[0].current.new_gsv, 190);
  assert.equal(result.comparison_new_old_cutoff, '2025-06-30');
  assert.equal(result.warehouse_cutoff, '2026-07-10');
  assert.equal(result.contains_real_data, false);
  assert.equal(result.synthetic, true);
  assert.deepEqual(postedBody, {
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    products: ['爆款面膜E'],
    metric_type: 'GSV',
    exclude_channels: [],
  });
  assert.deepEqual(calls.map(call => [call.method, call.path]), [
    ['GET', '/api/v1/auth/me'],
    ['POST', '/api/v1/category/product-customer'],
    ['GET', '/api/v1/metrics/cutoff'],
  ]);
  assert.equal(calls[1].authenticated, true);
  assert.equal(calls[1].product_customer_version, 'product-customer/v3');
});

test('product customer rejects unknown fields and malformed product lists before HTTP', async t => {
  const { binding, calls } = await serveDashboard(t);
  for (const invalid of [
    { start_date: '2026-07-01', end_date: '2026-07-05', sql: 'select 1' },
    { start_date: '2026-07-01', end_date: '2026-07-05', products: [] },
    { start_date: '2026-07-01', end_date: '2026-07-05', products: ['经典膜', '经典膜'] },
    { start_date: '2026-07-01', end_date: '2026-07-05', compare_start_date: '2025-07-01' },
  ]) {
    const result = await queryProductCustomer(invalid, { sessionId: 'fixture-session', binding });
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.reason.code, 'INVALID_REQUEST');
  }
  assert.equal(calls.length, 0);
});

test('backend product lookup failures remain distinguishable from malformed input', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname === '/api/v1/category/product-customer') {
      res.statusCode = 400;
      res.end('{}');
      return true;
    }
  });
  const result = await queryProductCustomer({
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    products: ['绝不存在的测试商品XYZ'],
  }, { sessionId: 'fixture-session', binding });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason.code, 'UNKNOWN_PRODUCT');
});

test('product customer preserves incomplete first-purchase history as a data warning', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname !== '/api/v1/category/product-customer') return false;
    res.statusCode = 409;
    res.end(JSON.stringify({ detail: 'FIRST_PURCHASE_UNAVAILABLE' }));
    return true;
  });
  const result = await queryProductCustomer({
    start_date: '2026-07-01', end_date: '2026-07-05', products: ['爆款面膜E'],
  }, { sessionId: 'fixture-session', binding });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason.code, 'FIRST_PURCHASE_UNAVAILABLE');
});

test('product customer rejects unverifiable comparison and incomplete product evidence', async t => {
  const productResponse = {
    schema_version: 'product-customer/v3',
    status: 'OK',
    source: 'orders+user_first_purchase',
    date_start: '2026-07-01',
    date_end: '2026-07-05',
    compare_start_date: '2025-07-01',
    compare_end_date: '2025-07-05',
    new_old_cutoff: '2026-06-30',
    comparison_new_old_cutoff: '2025-06-30',
    data_cutoff: '2026-07-05',
    data_version: 'orders-v1:fixture',
    metric_type: 'GSV',
    channel: null,
    exclude_channels: [],
    coverage: {
      data_cutoff: '2026-07-05',
      current_status: 'COMPLETE',
      comparison_status: 'COMPLETE',
    },
    products: [{
      name: '经典膜',
      display_name: '爆款面膜E',
      spu_classes: ['经典膜', '【妆】经典膜'],
      status: 'OK',
      current: {
        gsv: 190, users: 2, aus: 95, old_gsv: 150, old_users: 1, old_aus: 150,
        old_ratio: 0.7895, new_gsv: 40, new_users: 1, new_aus: 40, new_ratio: 0.2105,
        member_gsv: 0, member_users: 0, member_aus: 0, member_ratio: 0,
        old_users_ratio: 0.5, new_users_ratio: 0.5,
      },
      comparison: {
        gsv: 100, users: 2, aus: 50, old_gsv: 80, old_users: 1, old_aus: 80,
        old_ratio: 0.8, new_gsv: 20, new_users: 1, new_aus: 20, new_ratio: 0.2,
        member_gsv: 0, member_users: 0, member_aus: 0, member_ratio: 0,
        old_users_ratio: 0.5, new_users_ratio: 0.5,
      },
      yoy: {
        gsv: 0.9, users: 0, aus: 0.9, old_gsv: 0.875, old_users: 0, old_aus: 0.875,
        new_gsv: 1, new_users: 0, new_aus: 1, old_ratio_ppt: -0.0105,
        new_ratio_ppt: 0.0105, old_users_ratio_ppt: 0, new_users_ratio_ppt: 0,
      },
    }],
  };
  for (const mutate of [
    value => { value.compare_start_date = '2025-07-02'; },
    value => { value.comparison_new_old_cutoff = '2025-07-01'; },
    value => { delete value.products[0].display_name; },
  ]) {
    const payload = structuredClone(productResponse);
    mutate(payload);
    const { binding } = await serveDashboard(t, (url, _req, res) => {
      if (url.pathname !== '/api/v1/category/product-customer') return false;
      res.end(JSON.stringify(payload));
      return true;
    });
    const result = await queryProductCustomer({
      start_date: '2026-07-01',
      end_date: '2026-07-05',
      products: ['经典膜'],
    }, { sessionId: 'fixture-session', binding });
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.reason.code, 'INVALID_RESPONSE');
  }
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname !== '/api/v1/category/product-customer') return false;
    res.end(JSON.stringify(productResponse));
    return true;
  });
  const incomplete = await queryProductCustomer({
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    products: ['经典膜', '黑膜'],
  }, { sessionId: 'fixture-session', binding });
  assert.equal(incomplete.status, 'UNAVAILABLE');
  assert.equal(incomplete.reason.code, 'INVALID_RESPONSE');
  const allProducts = await queryProductCustomer({
    start_date: '2026-07-01',
    end_date: '2026-07-05',
  }, { sessionId: 'fixture-session', binding });
  assert.equal(allProducts.status, 'OK', JSON.stringify(allProducts));
  assert.equal(isJsonValue(allProducts), true);
  assert.equal('products' in allProducts.filters, false);
});

test('product customer v3 exposes coverage and rejects v2, empty or partial results', async t => {
  const filters = {
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    products: ['爆款面膜E'],
    channel: '全店',
    exclude_low_price: false,
  };
  const base = {
    schema_version: 'product-customer/v3',
    status: 'INSUFFICIENT_COVERAGE',
    source: 'orders+user_first_purchase',
    date_start: '2026-07-01',
    date_end: '2026-07-05',
    compare_start_date: '2025-07-01',
    compare_end_date: '2025-07-05',
    new_old_cutoff: '2026-06-30',
    comparison_new_old_cutoff: '2025-06-30',
    data_cutoff: '2026-07-03',
    data_version: 'orders-v1:fixture',
    coverage: {
      data_cutoff: '2026-07-03',
      current_status: 'INSUFFICIENT',
      comparison_status: 'COMPLETE',
    },
    metric_type: 'GSV',
    channel: null,
    exclude_channels: [],
    products: [],
  };
  const insufficient = normalizeProductCustomer(base, filters, 'synthetic', '2026-07-05');
  assert.equal(insufficient.status, 'INSUFFICIENT_COVERAGE');
  assert.deepEqual(insufficient.coverage, base.coverage);
  assert.equal(insufficient.warehouse_cutoff, '2026-07-05');

  assert.throws(
    () => normalizeProductCustomer({ ...base, schema_version: 'product-customer/v2' }, filters, 'synthetic'),
    error => error?.code === 'BACKEND_UPGRADE_REQUIRED',
  );

  await t.test('empty products cannot be successful', async t => {
    const { binding } = await serveDashboard(t, (url, _req, res) => {
      if (url.pathname !== '/api/v1/category/product-customer') return false;
      res.end(JSON.stringify({ ...base, status: 'OK', coverage: {
        data_cutoff: '2026-07-05', current_status: 'COMPLETE', comparison_status: 'COMPLETE',
      }, data_cutoff: '2026-07-05' }));
      return true;
    });
    const result = await queryProductCustomer({
      start_date: '2026-07-01', end_date: '2026-07-05', products: ['爆款面膜E'],
    }, { sessionId: 'fixture-session', binding });
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.reason.code, 'INVALID_RESPONSE');
  });

  await t.test('successful products require complete coverage in both periods', async t => {
    for (const coverage of [
      { data_cutoff: '2026-07-05', current_status: 'INSUFFICIENT', comparison_status: 'COMPLETE' },
      { data_cutoff: '2026-07-05', current_status: 'COMPLETE', comparison_status: 'INSUFFICIENT' },
    ]) {
      const { binding } = await serveDashboard(t, (url, _req, res) => {
        if (url.pathname !== '/api/v1/category/product-customer') return false;
        res.end(JSON.stringify({ ...base, status: 'OK', data_cutoff: '2026-07-05', coverage, products: [{
          name: '经典膜', display_name: '爆款面膜E', spu_classes: ['经典膜'], status: 'OK',
          current: {
            gsv: 100, users: 1, aus: 100, old_gsv: 100, old_users: 1, old_aus: 100, old_ratio: 1,
            new_gsv: 0, new_users: 0, new_aus: 0, new_ratio: 0, member_gsv: 0, member_users: 0,
            member_aus: 0, member_ratio: 0, old_users_ratio: 1, new_users_ratio: 0,
          },
          comparison: {
            gsv: 100, users: 1, aus: 100, old_gsv: 100, old_users: 1, old_aus: 100, old_ratio: 1,
            new_gsv: 0, new_users: 0, new_aus: 0, new_ratio: 0, member_gsv: 0, member_users: 0,
            member_aus: 0, member_ratio: 0, old_users_ratio: 1, new_users_ratio: 0,
          },
          yoy: {
            gsv: 0, users: 0, aus: 0, old_gsv: 0, old_users: 0, old_aus: 0, new_gsv: 0, new_users: 0,
            new_aus: 0, old_ratio_ppt: 0, new_ratio_ppt: 0, old_users_ratio_ppt: 0, new_users_ratio_ppt: 0,
          },
        }] }));
        return true;
      });
      const result = await queryProductCustomer({
        start_date: '2026-07-01', end_date: '2026-07-05', products: ['爆款面膜E'],
      }, { sessionId: 'fixture-session', binding });
      assert.equal(result.status, 'UNAVAILABLE');
      assert.equal(result.reason.code, 'INVALID_RESPONSE');
    }
  });
});

// Regression: ISSUE-003 — a successful product payload cannot override warehouse coverage.
// Found by /qa on 2026-10-22
// Report: .gstack/qa-reports/qa-report-app.tyuan.chat-2026-10-22.md
test('product customer rejects a successful response when the requested window exceeds the cutoff', async t => {
  const metric = {
    gsv: 100, users: 2, aus: 50, old_gsv: 50, old_users: 1, old_aus: 50, old_ratio: 0.5,
    new_gsv: 50, new_users: 1, new_aus: 50, new_ratio: 0.5, member_gsv: 0, member_users: 0,
    member_aus: 0, member_ratio: 0, old_users_ratio: 0.5, new_users_ratio: 0.5,
  };
  const value = {
    schema_version: 'product-customer/v3', status: 'OK', source: 'orders+user_first_purchase',
    date_start: '2026-07-01', date_end: '2026-07-07', compare_start_date: '2025-07-01',
    compare_end_date: '2025-07-07', new_old_cutoff: '2026-06-30', comparison_new_old_cutoff: '2025-06-30',
    data_cutoff: '2026-07-05', data_version: 'orders-v1:fixture', metric_type: 'GSV', channel: null, exclude_channels: [],
    coverage: { data_cutoff: '2026-07-05', current_status: 'COMPLETE', comparison_status: 'COMPLETE' },
    products: [{ name: '经典膜', display_name: '爆款面膜E', spu_classes: ['经典膜'], status: 'OK',
      current: metric, comparison: metric,
      yoy: { gsv: 0, users: 0, aus: 0, old_gsv: 0, old_users: 0, old_aus: 0,
        new_gsv: 0, new_users: 0, new_aus: 0, old_ratio_ppt: 0, new_ratio_ppt: 0,
        old_users_ratio_ppt: 0, new_users_ratio_ppt: 0 } }],
  };
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname === '/api/v1/category/product-customer') {
      res.end(JSON.stringify(value));
      return true;
    }
    if (url.pathname === '/api/v1/metrics/cutoff') {
      res.end(JSON.stringify({ cutoff_date: '2026-07-05' }));
      return true;
    }
    return false;
  });
  const result = await queryProductCustomer({
    start_date: '2026-07-01', end_date: '2026-07-07', products: ['经典膜'],
  }, { sessionId: 'fixture-session', binding });
  assert.equal(result.status, 'UNAVAILABLE', JSON.stringify(result));
  assert.equal(result.reason.code, 'INSUFFICIENT_COVERAGE');
  assert.equal('products' in result, false);
});

const rfmSegments = [
  '重要价值客户', '重要保持客户', '重要发展客户', '重要挽留客户',
  '一般价值客户', '一般保持客户', '一般发展客户', '一般挽留客户', '已购客TTL',
];
const rfmRow = {
  rfm_segment: '重要价值客户',
  hist_users_current: 10, repurchase_users_current: 4, repurchase_rate_current: 0.4,
  repurchase_gsv_current: 1200, repurchase_gsv_ratio_current: 0.6,
  hist_users_comp: 8, repurchase_users_comp: 2, repurchase_rate_comp: 0.25,
  repurchase_gsv_comp: 800, repurchase_gsv_ratio_comp: 0.5,
  hist_users_prev2: 6, repurchase_users_prev2: 1, repurchase_rate_prev2: 0.1667,
  repurchase_gsv_prev2: 600, repurchase_gsv_ratio_prev2: 0.4,
  yoy_hist_users: 0.25, yoy_repurchase_users: 1, yoy_repurchase_rate: 0.15,
  yoy_repurchase_gsv: 0.5, yoy_repurchase_gsv_ratio_ppt: 0.1,
};

test('RFM snapshot reads only the precomputed cache and returns a stable identity', async t => {
  const payload = {
    year_label: '2026', comp_year_label: '2025', prev2_year_label: '2024', metric_type: 'GSV',
    rows: rfmSegments.map(segment => ({ ...rfmRow, rfm_segment: segment })),
    same_channel_rows: rfmSegments.map(segment => ({ ...rfmRow, rfm_segment: segment })),
    member_rows: rfmSegments.map(segment => ({ ...rfmRow, rfm_segment: segment })),
    member_same_channel_rows: rfmSegments.map(segment => ({ ...rfmRow, rfm_segment: segment })),
  };
  const { binding, calls } = await serveDashboard(t, (url, req, res) => {
    if (url.pathname !== '/api/v1/customer-health/rfm-analysis') return false;
    assert.equal(req.method, 'GET');
    res.end(JSON.stringify(payload));
    return true;
  });
  const input = { start_date: '2026-07-01', end_date: '2026-07-05' };
  const first = await queryRfmSnapshot(input, { sessionId: 'fixture-session', binding });
  const second = await queryRfmSnapshot(input, { sessionId: 'fixture-session', binding });
  assert.equal(first.status, 'OK', JSON.stringify(first));
  assert.equal(first.schema_version, 'rfm-snapshot/v1');
  assert.match(first.snapshot_id, /^rfm_[a-f0-9]{64}$/);
  assert.equal(first.snapshot_id, second.snapshot_id);
  assert.equal(first.rows[0].rfm_segment, '重要价值客户');
  assert.equal(first.rows[8].rfm_segment, '已购客TTL');
  assert.equal(first.warehouse_cutoff, '2026-07-10');
  assert.equal(first.synthetic, true);
  assert.deepEqual(calls.slice(0, 3).map(call => call.path), [
    '/api/v1/auth/me',
    '/api/v1/customer-health/rfm-analysis',
    '/api/v1/metrics/cutoff',
  ]);
  assert.equal(calls[1].params.start_date, '2026-07-01');
  assert.equal(calls[1].params.metric_type, 'GSV');
});

test('RFM snapshot rejects incomplete segment sets and missing warehouse cutoff', async t => {
  const completeRows = rfmSegments.map(segment => ({ ...rfmRow, rfm_segment: segment }));
  let incompleteSegments = true;
  let omitCutoff = false;
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname === '/api/v1/customer-health/rfm-analysis') {
      res.end(JSON.stringify({
        year_label: '2026', comp_year_label: '2025', prev2_year_label: '2024', metric_type: 'GSV',
        rows: incompleteSegments ? completeRows.slice(0, 8) : completeRows, same_channel_rows: completeRows,
        member_rows: completeRows, member_same_channel_rows: completeRows,
      }));
      return true;
    }
    if (omitCutoff && url.pathname === '/api/v1/metrics/cutoff') {
      res.statusCode = 503;
      res.end('{}');
      return true;
    }
    return false;
  });
  const input = { start_date: '2026-07-01', end_date: '2026-07-05' };
  const incomplete = await queryRfmSnapshot(input, { sessionId: 'fixture-session', binding });
  assert.equal(incomplete.status, 'UNAVAILABLE');
  assert.equal(incomplete.reason.code, 'INVALID_RESPONSE');

  incompleteSegments = false;
  omitCutoff = true;
  const missingCutoff = await queryRfmSnapshot(input, { sessionId: 'fixture-session', binding });
  assert.equal(missingCutoff.status, 'UNAVAILABLE');
  assert.equal(missingCutoff.reason.code, 'SERVICE_UNAVAILABLE');
});

test('RFM cache miss is explicit and does not fall back to live SQL', async t => {
  const { binding, calls } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname !== '/api/v1/customer-health/rfm-analysis') return false;
    res.statusCode = 503;
    res.end('{}');
    return true;
  });
  const result = await queryRfmSnapshot(
    { start_date: '2026-07-01', end_date: '2026-07-05' },
    { sessionId: 'fixture-session', binding },
  );
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason.code, 'SERVICE_UNAVAILABLE');
  assert.deepEqual(calls.map(call => call.path), [
    '/api/v1/auth/me',
    '/api/v1/customer-health/rfm-analysis',
  ]);
});

test('RFM backend rejection after local validation is reported as insufficient coverage', async t => {
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname === '/api/v1/customer-health/rfm-analysis') {
      res.statusCode = 400;
      res.end('{}');
      return true;
    }
  });
  const result = await queryRfmSnapshot({
    start_date: '2026-07-06',
    end_date: '2026-07-07',
    metric_type: 'GSV',
  }, { sessionId: 'fixture-session', binding });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason.code, 'INSUFFICIENT_COVERAGE');
});

test('RFM success after the warehouse cutoff fails instead of returning a zero snapshot', async t => {
  const rows = rfmSegments.map(segment => ({ ...rfmRow, rfm_segment: segment }));
  const { binding } = await serveDashboard(t, (url, _req, res) => {
    if (url.pathname === '/api/v1/customer-health/rfm-analysis') {
      res.end(JSON.stringify({
        year_label: '2026', comp_year_label: '2025', prev2_year_label: '2024', metric_type: 'GSV',
        rows, same_channel_rows: rows, member_rows: rows, member_same_channel_rows: rows,
      }));
      return true;
    }
    if (url.pathname === '/api/v1/metrics/cutoff') {
      res.end(JSON.stringify({ cutoff_date: '2026-07-05' }));
      return true;
    }
  });
  const result = await queryRfmSnapshot({
    start_date: '2026-07-06',
    end_date: '2026-07-07',
    metric_type: 'GSV',
  }, { sessionId: 'fixture-session', binding });
  assert.equal(result.status, 'UNAVAILABLE', JSON.stringify(result));
  assert.equal(result.reason.code, 'INSUFFICIENT_COVERAGE');
  assert.equal('rows' in result, false);
});
