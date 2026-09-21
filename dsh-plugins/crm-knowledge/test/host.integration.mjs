/** Pinned Cordis + ToolRuntime + synthetic Python/HTTP. No model or live service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { serveDashboard, request as dashboardRequest, SYNTHETIC_PASSWORD } from './dashboard.fixture.mjs';
import { mountLoginHost } from './login-native.fixture.mjs';
import { serveAssets, snapshot, analysis, reference } from './crm-assets.fixture.mjs';
import { graphFixture, CHUNK } from './graph.fixture.mjs';

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.env.B0_BUILD_UPSTREAM;
assert.ok(upstream, 'B0_BUILD_UPSTREAM must point to the verified pinned checkout');
const load = path => import(pathToFileURL(join(upstream, path, 'lib/index.js')).href);
const { Context } = await load('vendor/cordis');
const { mountAgentLoopTestDependencies } = await load('packages/test-support/agent-loop-testkit');
const { defineTool } = await load('packages/core/tools');
const built = await import(pathToFileURL(join(plugin, 'lib/index.js')).href);
const graphTools = await import(pathToFileURL(join(plugin, 'lib/graph-tools.js')).href);
test('native tool captures trusted CRM snapshot; browser confirms saved analysis and cockpit reference', async t => {
  const fixture = await serveAssets(t);
  const host = await mountLoginHost(t, fixture.binding.baseUrl);
  for (const headers of [{ cookie: '' }, { origin: 'https://evil.invalid' }]) {
    const response = await host.assetCall('library', {}, headers);
    assert.ok([401, 403].includes(response.status)); await response.arrayBuffer();
  }
  assert.equal((await host.execute('query_crm_dashboard_snapshot', snapshot.result.filters)).value.code, 'NOT_CONNECTED');
  await (await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD })).arrayBuffer();
  const outcome = await host.execute('query_crm_dashboard_snapshot', snapshot.result.filters);
  assert.equal(outcome.isError, false, JSON.stringify(outcome));
  assert.deepEqual(outcome.value.snapshot, snapshot);
  assert.equal(outcome.value.ok, true);
  const saved = await host.assetCall('save', { snapshot_id: snapshot.snapshot_id, title: analysis.title, key: 'save-native' });
  assert.deepEqual((await saved.json()).value, analysis);
  const pinned = await host.assetCall('pin', { analysis_id: analysis.analysis_id, key: 'pin-native' });
  assert.deepEqual((await pinned.json()).value, reference);
  assert.equal((await host.execute('save_crm_analysis', { snapshot_id: snapshot.snapshot_id })).isError, true);
  await (await host.call('disconnect')).arrayBuffer();
  const hidden = await host.assetCall('library');
  assert.equal((await hidden.json()).code, 'NOT_CONNECTED');
  assert.equal(fixture.writes.length, 3);
});

const base = {
  source_id: 'synthetic-crm-metrics', contains_real_data: false, metric_version: 'crm-metrics/v1',
  period_start: '2026-09-01', period_end_exclusive: '2026-10-01', refund_view: 'ORDER_COHORT_AS_OF',
  refund_as_of: '2026-09-21T00:00:00+08:00', data_through: '2026-09-21T00:00:00+08:00',
};

test('registered tools execute all queries through B/A and retrieve C evidence', async t => {
  const home = await mkdtemp(join(tmpdir(), 'crm-host-test-'));
  const previous = process.env.HOME;
  process.env.HOME = home;
  const ctx = new Context();
  try {
    await mountAgentLoopTestDependencies(ctx);
    const instance = await ctx.plugin(built);
    const agent = { session: { id: 'crm-synthetic-host' } };
    let counter = 0;
    const execute = (name, args, signal = new AbortController().signal) => ctx.tools.execute({
      name, arguments: args, agent, callId: `crm_${++counter}`, signal,
    });
    for (const query of ['sales_window_summary', 'existing_customer_repurchase', 'sample_followup']) {
      await t.test(query, async () => {
        const outcome = await execute('query_crm_metrics_v1', { request: { ...base, query_id: query } });
        assert.equal(outcome.isError, false, JSON.stringify(outcome));
        const result = outcome.value;
        assert.equal(result.status, 'OK');
        assert.ok(result.adapter_query_ref.startsWith('crmq_'));
        assert.equal(result.actor_scope, 'crm-local-synthetic/v1');
        assert.equal(result.real_business_acceptance, false);
        if (query === 'sales_window_summary') assert.equal(result.facts.gsv_amount.value, 124000);
        if (query === 'existing_customer_repurchase') assert.equal(result.facts.opening_old_customers.value, 2);
        if (query === 'sample_followup') assert.equal(result.facts.repeat_rate.value, 0.5);
      });
    }
    await t.test('knowledge uses pack definitions and evidence', async () => {
      const outcome = await execute('crm_knowledge_explain', { topic: '客单价' });
      assert.equal(outcome.isError, false, JSON.stringify(outcome));
      assert.equal(outcome.value.definition.id, 'metric.aus:target-v1');
      assert.ok(outcome.value.sources.some(item => item.id === 'ev.decision.D001'));
      assert.ok(outcome.value.sources.some(item => item.id.startsWith('ev.tb.')));
      assert.ok(outcome.value.relations.length > 0);
      assert.equal(outcome.value.dsh_using_neo4j, false);
      assert.match(outcome.value.preferred_operational_definition.aus, /当前看板GSV/);
      assert.equal(outcome.value.preferred_operational_definition.real_business_acceptance, false);
    });
    await t.test('rejects real source and arbitrary SQL at host boundary', async () => {
      const real = await execute('query_crm_metrics_v1', { request: { ...base, query_id: 'sales_window_summary', contains_real_data: true } });
      assert.equal(real.isError, true);
      const sql = await execute('query_crm_metrics_v1', { request: { ...base, query_id: 'sales_window_summary', sql: 'select 1' } });
      assert.equal(sql.isError, true);
      const unknown = await execute('query_crm_metrics_v1', { request: { ...base, query_id: 'sales_window_summary', source_id: 'unregistered' } });
      assert.equal(unknown.isError, true);
    });
    await t.test('cancellation does not start successful query', async () => {
      const controller = new AbortController(); controller.abort();
      const outcome = await execute('crm_metrics_capabilities', {}, controller.signal);
      assert.equal(outcome.isError, true);
    });
    await t.test('dispose removes this plugin tools', async () => {
      await instance.dispose();
      const outcome = await execute('crm_metrics_capabilities', {});
      assert.equal(outcome.isError, true);
    });
  } finally {
    await ctx.fiber.dispose();
    if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test('built graph tool requires CRM login and uses that account for ACL', async t => {
  const fixture = await graphFixture(t);
  const dash = await serveDashboard(t);
  const host = await mountLoginHost(t, dash.binding.baseUrl);
  await host.ctx.plugin(graphTools, { settingsFile: fixture.settingsFile });
  const denied = await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' });
  assert.equal(denied.value.reason.code, 'NOT_CONNECTED');
  await (await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD })).arrayBuffer();
  const result = await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' });
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.equal(result.value.status, 'OK');
  assert.equal(result.value.relations[0].target, '非会员的AUS');
  assert.equal(result.value.sources[0].page_refs[0], 161);
  const other = await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' }, 'another-session');
  assert.equal(other.value.reason.code, 'NOT_CONNECTED');
  const sources = await host.execute('query_crm_knowledge_sources', { query: '会员溢价' });
  assert.equal(sources.value.status, 'OK');
  const expanded = await host.execute('expand_crm_knowledge_citation', { chunk_id: CHUNK });
  assert.equal(expanded.value.status, 'OK');
  fixture.state.denied = true;
  assert.equal((await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' })).value.reason.code, 'SOURCE_UNAVAILABLE');
  await (await host.call('disconnect')).arrayBuffer();
  assert.equal((await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' })).value.reason.code, 'NOT_CONNECTED');
});

test('built graph tools unload from native ToolRuntime and isolate shared retrieve', async t => {
  const fixture = await graphFixture(t);
  const dash = await serveDashboard(t);
  const host = await mountLoginHost(t, dash.binding.baseUrl);
  host.ctx.tools.register(defineTool({
    name: 'weknora_search',
    description: 'shared retrieve',
    parameters: { query: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async () => ({ leaked: true, secret: 'TENANT_KEY' }),
  }));
  const instance = await host.ctx.plugin(graphTools, { settingsFile: fixture.settingsFile });
  const blocked = await host.execute('weknora_search', { query: '会员溢价' });
  const blockedText = JSON.stringify(blocked);
  assert.equal(blocked.isError, true);
  assert.equal(blockedText.includes('TENANT_KEY'), false);
  assert.equal(blockedText.includes('leaked'), false);
  await (await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD })).arrayBuffer();
  const result = await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' });
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.equal(result.value.status, 'OK');
  await instance.dispose();
  assert.equal((await host.execute('query_crm_knowledge_graph', { topic: '会员溢价' })).isError, true);
  const restored = await host.execute('weknora_search', { query: '会员溢价' });
  assert.equal(restored.isError, false, JSON.stringify(restored));
  assert.equal(restored.value.leaked, true);
});

test('browser login reaches the pinned tools without exposing credentials', async t => {
  const fixture = await serveDashboard(t);
  const host = await mountLoginHost(t, fixture.binding.baseUrl);
  const { execute } = host;
    await t.test('native cookie and matching Origin are mandatory', async () => {
      for (const headers of [{ cookie: '' }, { origin: 'https://example.com' }, { origin: '' }, { 'x-crm-ui': '' }]) {
        const res = await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD }, headers);
        assert.ok([401, 403].includes(res.status)); await res.arrayBuffer();
      }
      assert.equal(fixture.calls.length, 0);
    });
    await t.test('login returns status only and provides no password tool', async () => {
      const login = await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD });
      assert.equal(login.status, 200);
      const body = await login.json(); assert.equal(body.connected, true);
      assert.equal(JSON.stringify(body).includes(fixture.binding.token), false);
      assert.equal(JSON.stringify(body).includes(SYNTHETIC_PASSWORD), false);
      assert.equal((await execute('crm_login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD })).isError, true);
      assert.deepEqual(Object.keys(host.ctx.crmDashboard).sort(), [
        'capabilities', 'principal', 'query', 'queryMembership', 'queryNetGsv', 'queryPurchases',
        'queryReadiness', 'querySnapshot', 'rememberCitations', 'takeSessionCitations',
      ]);
      assert.deepEqual(host.ctx.crmDashboard.principal('fixture-session'), { username: 'fixture-user' });
    });
    await t.test('preserves API amount and filters, without legacy extra metrics', async () => {
      const outcome = await execute('query_crm_dashboard_gsv', { ...dashboardRequest, channel: '淘客', exclude_low_price: true });
      assert.equal(outcome.isError, false, JSON.stringify(outcome));
      assert.equal(outcome.value.status, 'OK', JSON.stringify(outcome));
      assert.equal(outcome.value.gsv.amount_fen, 10031);
      assert.equal(outcome.value.gsv.amount_yuan, '100.31');
      assert.equal(outcome.value.filters.channel, '淘客');
      assert.equal(outcome.value.synthetic, true);
      assert.equal(outcome.value.contains_real_data, false);
      assert.equal('member_premium' in outcome.value, false);
      assert.equal(fixture.calls.length, 4);
    });
    await t.test('a different host session cannot borrow this login', async () => {
      const outcome = await execute('query_crm_dashboard_gsv', dashboardRequest, 'another-session');
      assert.equal(outcome.value.status, 'UNAVAILABLE');
      assert.equal(outcome.value.reason.code, 'NOT_CONNECTED');
      assert.equal(fixture.calls.length, 4);
    });
    await t.test('tool arguments cannot override connection or credentials', async () => {
      for (const extra of [{ token: fixture.binding.token }, { base_url: fixture.binding.baseUrl }, { sql: 'select 1' }, { refund_as_of: '2026-02-01' }]) {
        const outcome = await execute('query_crm_dashboard_gsv', { ...dashboardRequest, ...extra });
        assert.ok(outcome.isError || outcome.value?.reason?.code === 'INVALID_REQUEST', JSON.stringify(outcome));
      }
      assert.equal(fixture.calls.length, 4);
    });
    await t.test('capabilities keep synthetic and authenticated sources distinct', async () => {
      const outcome = await execute('crm_metrics_capabilities', {});
      assert.equal(outcome.isError, false, JSON.stringify(outcome));
      assert.equal(outcome.value.synthetic_candidate.synthetic_only, true);
      assert.equal(outcome.value.dashboard.connection_state, 'LOGIN_BOUND');
      assert.equal(JSON.stringify(outcome).includes(fixture.binding.token), false);
    });
    await t.test('GSV knowledge leads with the accepted dashboard and labels the target candidate', async () => {
      const outcome = await execute('crm_knowledge_explain', { topic: 'GSV' });
      assert.equal(outcome.isError, false, JSON.stringify(outcome));
      assert.equal(outcome.value.preferred_real_gsv.default_for_real_gsv, 'query_crm_dashboard_gsv');
      assert.equal(outcome.value.target_candidate.definition.id, 'metric.gsv_net:target-v1');
      assert.equal(outcome.value.target_candidate.real_business_acceptance, false);
    });
    await t.test('missing host binding reports unavailable without querying or falling back', async () => {
      const disconnected = await host.call('disconnect'); assert.equal(disconnected.status, 200); await disconnected.arrayBuffer();
      const outcome = await execute('query_crm_dashboard_gsv', dashboardRequest);
      assert.equal(outcome.value.reason.code, 'NOT_CONNECTED');
      assert.equal(fixture.calls.length, 4);
      assert.equal(fixture.calls.some(call => call.path.endsWith('/logout')), false);
    });
    await t.test('unload removes the added tool', async () => {
      await host.removeHost();
      const removed = await host.call('status'); assert.equal(removed.status, 404); await removed.arrayBuffer();
      await host.removeTools();
      assert.equal((await execute('query_crm_dashboard_gsv', dashboardRequest)).isError, true);
    });
});


test('purchase tool uses native login scope and clears access on disconnect', async t => {
  const fixture = await serveDashboard(t, (url, _req, res) => {
    if (!url.pathname.endsWith('/dashboard-purchases')) return false;
    res.end(JSON.stringify({
      schema_version: 'crm-dashboard-purchases/v1', metric_version: 'dashboard-gsv-purchases/v1',
      filters: { ...dashboardRequest, channel: '全店', exclude_low_price: false }, gsv_amount_fen: 6000,
      coverage: { rows: 3, orders: 2, buyers: 1, unknown_order_rows: 0, unknown_buyer_rows: 0,
        unknown_order_amount_fen: 0, unknown_buyer_amount_fen: 0, null_amount_rows: 0,
        negative_amount_rows: 0, zero_amount_orders: 0, zero_only_buyers: 0 },
      aov: { amount_fen: 3000, denominator: 2, reason: null },
      aus: { amount_fen: 6000, denominator: 1, reason: null }, data_through: null, refund_as_of: null,
    })); return true;
  });
  const host = await mountLoginHost(t, fixture.binding.baseUrl);
  const login = await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD });
  assert.equal(login.status, 200); await login.arrayBuffer();
  const result = await host.execute('query_crm_dashboard_purchases', dashboardRequest);
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.equal(result.value.aov.amount_fen, 3000); assert.equal(result.value.aus.amount_fen, 6000);
  assert.equal(result.value.synthetic, true);
  const count = fixture.calls.length;
  assert.equal((await host.execute('query_crm_dashboard_purchases', dashboardRequest, 'another-session')).value.reason.code, 'NOT_CONNECTED');
  const disconnect = await host.call('disconnect'); await disconnect.arrayBuffer();
  assert.equal((await host.execute('query_crm_dashboard_purchases', dashboardRequest)).value.reason.code, 'NOT_CONNECTED');
  assert.equal(fixture.calls.length, count);
});
