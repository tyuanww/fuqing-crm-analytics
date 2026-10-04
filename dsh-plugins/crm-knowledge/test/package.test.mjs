/** Built CRM alone, using pinned Cordis/ToolRuntime and no business service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const plugin = process.env.CRM_TEST_PLUGIN_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const upstream = process.env.B0_BUILD_UPSTREAM;
assert.ok(upstream, 'Use the verified pinned SDK checkout');
const { Context } = await import(pathToFileURL(join(upstream, 'vendor/cordis/lib/index.js')).href);
const { mountAgentLoopTestDependencies } = await import(pathToFileURL(join(upstream, 'packages/test-support/agent-loop-testkit/lib/index.js')).href);
const crm = await import(pathToFileURL(join(plugin, 'lib/index.js')).href);

test('CRM alone keeps its tools and explicitly reports the absent page provider', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await mountAgentLoopTestDependencies(ctx);
  const instance = await ctx.plugin(crm);
  const agent = { session: { id: 'crm-isolated-fixture' } };
  assert.equal(ctx.tools.get('free_html_page_generate', agent), undefined);
  const result = await ctx.tools.execute({ name: 'crm_service_health', arguments: {}, agent,
    callId: 'isolated-health', signal: new AbortController().signal });
  assert.equal(result.isError, false);
  assert.deepEqual(result.value.page_delivery, { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'PAGE_PROVIDER_NOT_INSTALLED_OR_NOT_VISIBLE' });
  assert.equal(result.value.crm_login, 'NOT_CONNECTED');
  assert.equal(result.value.synthetic_services.metrics.reason.code, 'SERVICE_NOT_CONFIGURED');
  assert.equal(result.value.synthetic_services.knowledge.reason.code, 'SERVICE_NOT_CONFIGURED');
  const capabilities = await ctx.tools.execute({ name: 'crm_metrics_capabilities', arguments: {}, agent,
    callId: 'isolated-capabilities', signal: new AbortController().signal });
  assert.equal(capabilities.isError, false);
  assert.equal(capabilities.value.synthetic_candidate.status, 'NOT_AVAILABLE');
  assert.equal(capabilities.value.dashboard.connection_state, 'NOT_CONNECTED');
  const knowledge = await ctx.tools.execute({ name: 'crm_knowledge_explain', arguments: { topic: '客单价' }, agent,
    callId: 'isolated-knowledge', signal: new AbortController().signal });
  assert.equal(knowledge.isError, false);
  assert.equal(knowledge.value.reason.code, 'SERVICE_NOT_CONFIGURED');
  assert.equal(knowledge.value.preferred_operational_definition, undefined);
  const query = await ctx.tools.execute({ name: 'query_crm_metrics_v1', arguments: { request: {
    source_id: 'synthetic-crm-metrics', contains_real_data: false, metric_version: 'crm-metrics/v1',
    query_id: 'sales_window_summary', period_start: '2026-09-01', period_end_exclusive: '2026-10-01',
    refund_view: 'ORDER_COHORT_AS_OF', refund_as_of: '2026-09-21T00:00:00+08:00', data_through: '2026-09-21T00:00:00+08:00',
  } }, agent, callId: 'isolated-query', signal: new AbortController().signal });
  assert.equal(query.isError, false, JSON.stringify(query));
  assert.equal(query.value.status, 'NOT_AVAILABLE');
  assert.equal(query.value.reason.code, 'SERVICE_NOT_CONFIGURED');
  await instance.dispose();
  assert.equal(ctx.tools.get('crm_service_health', agent), undefined);
});

test('shipped plugin has no Python subprocess or repository discovery path', async () => {
  const entry = await readFile(join(plugin, 'lib/index.js'), 'utf8');
  assert.doesNotMatch(entry, /node:child_process|query_crm_metrics_v1\.py|CRM_METRICS_PYTHON|PYTHONPATH|scripts\/crm-calibration/);
});

test('built or unpacked CRM calls only its explicitly selected public service', async t => {
  const calls = [];
  const body = { contract: 'crm-metrics-service', api_version: '1.0.0', base_path: '/api/v1/crm-metrics',
    scope: 'synthetic_only', compatibility: 'exact_api_version', operations: ['capabilities', 'query'],
    synthetic_only: true, real_archive: false, metric_version: 'crm-metrics/v1' };
  const server = createServer((req, res) => {
    calls.push({ path: req.url, contract: req.headers['x-shinemage-contract'] });
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': 'crm-metrics-service/1.0.0' });
    res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await mountAgentLoopTestDependencies(ctx);
  await ctx.plugin(crm, { metricsOrigin: 'http://127.0.0.1:' + server.address().port });
  const result = await ctx.tools.execute({ name: 'crm_metrics_capabilities', arguments: {},
    agent: { session: { id: 'packed-service-fixture' } }, callId: 'packed-capabilities', signal: new AbortController().signal });
  assert.equal(result.isError, false);
  assert.deepEqual(result.value.synthetic_candidate, body);
  assert.deepEqual(calls, [{ path: '/api/v1/crm-metrics/capabilities', contract: 'crm-metrics-service/1.0.0' }]);
});

test('built CRM client can register its native dock with no workbench or brand plugin', async () => {
  const req = createRequire(join(upstream, 'apps/web/package.json'));
  let entry;
  const window = { __ModuleLoader__: { load: row => { entry = row; } } };
  vm.runInNewContext(await readFile(join(plugin, 'lib/client.js'), 'utf8'), { window }, { timeout: 3000 });
  const client = entry.factory(name => req(name));
  const registrations = [], disposers = [];
  client.apply({ sessions: { list: {} }, slots: {
    inject: (name, callback) => { if (name !== 'cockpit.crm') disposers.push(callback()); },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => registrations.splice(0, 1);
    },
  } });
  assert.deepEqual(registrations.map(row => row.options.name), ['conversation.input.dock']);
  assert.equal(typeof registrations[0].component, 'function');
  for (const dispose of disposers) dispose();
  assert.equal(registrations.length, 0);
});
