/** Cross-package consumer tests: exact SDK, owned HTTP fixtures, no production/model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { serveDashboard, request, SYNTHETIC_PASSWORD } from './dashboard.fixture.mjs';
import { mountLoginHost } from './login-native.fixture.mjs';
import { graphFixture } from '../../knowledge/test/graph.fixture.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const upstream = process.env.B0_BUILD_UPSTREAM; assert.ok(upstream);
const load = path => import(pathToFileURL(path).href);
const { Context } = await load(join(upstream, 'vendor/cordis/lib/index.js'));
const { mountAgentLoopTestDependencies } = await load(join(upstream, 'packages/test-support/agent-loop-testkit/lib/index.js'));
const { defineTool } = await load(join(upstream, 'packages/core/tools/lib/index.js'));
const crm = await load(join(root, 'crm-knowledge/lib/index.js'));
const knowledge = await load(join(root, 'knowledge/lib/index.js'));
const graph = await load(join(root, 'knowledge/lib/graph-tools.js'));

for (const order of ['crm-first', 'knowledge-first']) {
  test(`${order}: independent scopes unload without removing native or other-domain tools`, async t => {
    const ctx = new Context(); t.after(() => ctx.fiber.dispose()); await mountAgentLoopTestDependencies(ctx);
    await ctx.plugin({ name: 'fixture-native', inject: ['tools'], apply(scope) {
      scope.tools.register(defineTool({ name: 'native_probe', description: 'fixture', parameters: {},
        output: { schema: { type: 'json' }, render: () => [] }, execute: async () => ({ ok: true }) }));
    } });
    const instances = {};
    for (const kind of order === 'crm-first' ? ['crm', 'knowledge'] : ['knowledge', 'crm']) instances[kind] = await ctx.plugin(kind === 'crm' ? crm : knowledge);
    const agent = { session: { id: 'split-composition' } }; let count = 0;
    const execute = name => ctx.tools.execute({ name, arguments: {}, agent, callId: `composition-${++count}`, signal: new AbortController().signal });
    assert.equal((await execute('crm_service_health')).value.knowledge_explanation.status, 'AVAILABLE');
    await instances.knowledge.dispose();
    assert.equal(ctx.tools.get('crm_knowledge_explain', agent), undefined);
    assert.equal((await execute('crm_service_health')).value.knowledge_explanation.status, 'NOT_AVAILABLE');
    const reloaded = await ctx.plugin(knowledge);
    await instances.crm.dispose();
    assert.ok(ctx.tools.get('crm_knowledge_explain', agent));
    assert.equal(ctx.tools.get('query_crm_metrics_v1', agent), undefined);
    assert.deepEqual((await execute('native_probe')).value, { ok: true });
    await reloaded.dispose();
    assert.deepEqual((await execute('native_probe')).value, { ok: true });
  });
}

test('private knowledge uses only the optional lease, then saves references through the same login grant', async t => {
  const dashboard = await serveDashboard(t); const f = await graphFixture(t);
  const host = await mountLoginHost(t, dashboard.binding.baseUrl);
  const own = await host.ctx.plugin(graph, { settingsFile: f.settingsFile });
  assert.equal((await host.execute('query_crm_knowledge_sources', { query: '会员' })).value.reason.code, 'NOT_CONNECTED');
  await (await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD })).arrayBuffer();
  const result = await host.execute('query_crm_knowledge_graph', { topic: '会员' });
  assert.equal(result.isError, false, JSON.stringify(result)); assert.equal(result.value.status, 'OK');
  assert.ok(host.ctx.crmDashboard.takeSessionCitations('fixture-session').length);
  await own.dispose();
  assert.equal((await host.execute('query_crm_dashboard_gsv', request)).value.status, 'OK');
});

for (const action of ['disconnect', 'host-unload', 'knowledge-unload']) {
  test(`${action} fences an in-flight textbook result and leaves no late citations`, async t => {
    const dashboard = await serveDashboard(t); const f = await graphFixture(t); f.state.delay = 60;
    const host = await mountLoginHost(t, dashboard.binding.baseUrl);
    const own = await host.ctx.plugin(graph, { settingsFile: f.settingsFile });
    await (await host.call('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD })).arrayBuffer();
    const pending = host.execute('query_crm_knowledge_sources', { query: '会员' });
    for (let n = 0; !f.state.calls.length && n < 100; n++) await delay(5);
    assert.ok(f.state.calls.length, 'actual HTTP request must start before revocation');
    if (action === 'disconnect') await (await host.call('disconnect')).arrayBuffer();
    else if (action === 'host-unload') await host.removeHost();
    else await own.dispose();
    const result = await pending;
    assert.ok(result.isError || result.value.status === 'UNAVAILABLE', JSON.stringify(result));
    assert.doesNotMatch(JSON.stringify(result), /会员的AUS|第 161 页/);
    assert.deepEqual(host.ctx.get('crmDashboard')?.takeSessionCitations('fixture-session') ?? [], []);
    if (action === 'knowledge-unload') assert.equal((await host.execute('query_crm_dashboard_gsv', request)).value.status, 'OK');
  });
}
