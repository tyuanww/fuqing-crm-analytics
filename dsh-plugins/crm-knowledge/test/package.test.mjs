/** Built CRM alone, using pinned Cordis/ToolRuntime and no business service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
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
const { defineTool } = await import(pathToFileURL(join(upstream, 'packages/core/tools/lib/index.js')).href);
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
  assert.equal(result.value.synthetic_services.knowledge, undefined);
  assert.equal(result.value.knowledge_explanation.reason, 'KNOWLEDGE_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE');
  assert.deepEqual(result.value.board_tools, { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'BOARD_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE' });
  assert.equal(ctx.tools.get('competition_board_catalog', agent), undefined);
  const capabilities = await ctx.tools.execute({ name: 'crm_metrics_capabilities', arguments: {}, agent,
    callId: 'isolated-capabilities', signal: new AbortController().signal });
  assert.equal(capabilities.isError, false);
  assert.equal(capabilities.value.synthetic_candidate.status, 'NOT_AVAILABLE');
  assert.equal(capabilities.value.dashboard.connection_state, 'NOT_CONNECTED');
  assert.equal(ctx.tools.get('crm_knowledge_explain', agent), undefined);
  assert.equal(ctx.tools.get('query_crm_knowledge_graph', agent), undefined);
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
  assert.doesNotMatch(entry, /node:child_process|query_crm_metrics_v1\.py|CRM_METRICS_PYTHON|PYTHONPATH|scripts\/crm-calibration|COMPETITION_HTTP_BASE|COMPETITION_HTTP_TOKEN/);
  assert.match(entry, /BOARD_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE/);
});

test('board health follows catalog visibility and ignores competition HTTP env', async t => {
  const previous = { base: process.env.COMPETITION_HTTP_BASE, token: process.env.COMPETITION_HTTP_TOKEN };
  process.env.COMPETITION_HTTP_BASE = 'http://127.0.0.1:9';
  process.env.COMPETITION_HTTP_TOKEN = 'synthetic-not-used';
  t.after(() => {
    if (previous.base === undefined) delete process.env.COMPETITION_HTTP_BASE;
    else process.env.COMPETITION_HTTP_BASE = previous.base;
    if (previous.token === undefined) delete process.env.COMPETITION_HTTP_TOKEN;
    else process.env.COMPETITION_HTTP_TOKEN = previous.token;
  });
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await mountAgentLoopTestDependencies(ctx);
  await ctx.plugin(crm);
  const agent = { session: { id: 'crm-board-visibility' } };
  const hidden = await ctx.tools.execute({ name: 'crm_service_health', arguments: {}, agent,
    callId: 'board-hidden', signal: new AbortController().signal });
  assert.deepEqual(hidden.value.board_tools, { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'BOARD_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE' });
  ctx.tools.register(defineTool({
    name: 'competition_board_catalog', description: 'fixture', parameters: {},
    output: { schema: { type: 'json' }, render: () => [] }, execute: async () => ({ ok: true }),
  }));
  const visible = await ctx.tools.execute({ name: 'crm_service_health', arguments: {}, agent,
    callId: 'board-visible', signal: new AbortController().signal });
  assert.deepEqual(visible.value.board_tools, { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null });
});

test('plugin build refuses missing or relative upstream instead of discovering the main repository', async () => {
  const build = await readFile(join(plugin, 'build.mjs'), 'utf8');
  assert.doesNotMatch(build, /\.context\/dsh-b0/);
  const env = { ...process.env };
  delete env.B0_BUILD_UPSTREAM;
  for (const args of [[], ['relative/upstream']]) {
    const child = spawn(process.execPath, [join(plugin, 'build.mjs'), ...args], { env, cwd: plugin });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(code, 2, stderr);
    assert.match(stderr, /UPSTREAM_NOT_CONFIGURED/);
  }
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

test('unloading CRM cancels its HTTP capabilities call without accepting a late response', async t => {
  const started = Promise.withResolvers();
  const server = createServer((_req, res) => started.resolve(res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const ctx = new Context(); t.after(() => ctx.fiber.dispose()); await mountAgentLoopTestDependencies(ctx);
  const owner = await ctx.plugin(crm, { metricsOrigin: 'http://127.0.0.1:' + server.address().port });
  const agent = { session: { id: 'crm-unload-fixture' } };
  const pending = ctx.tools.execute({ name: 'crm_metrics_capabilities', arguments: {}, agent,
    callId: 'unload-capabilities', signal: new AbortController().signal });
  const response = await started.promise;
  await owner.dispose();
  assert.equal(ctx.tools.get('crm_metrics_capabilities', agent), undefined);
  response.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': 'crm-metrics-service/1.0.0' });
  response.end(JSON.stringify({ contract: 'crm-metrics-service', api_version: '1.0.0', base_path: '/api/v1/crm-metrics',
    scope: 'synthetic_only', compatibility: 'exact_api_version', operations: ['capabilities', 'query'],
    synthetic_only: true, real_archive: false, metric_version: 'crm-metrics/v1' }));
  const late = await pending;
  assert.equal(late.isError, true, JSON.stringify(late)); assert.equal(late.value, undefined);
});

test('unloaded CRM cannot accept a late dashboard result even when its provider ignores abort', async t => {
  const started = Promise.withResolvers(), completed = Promise.withResolvers();
  const ctx = new Context(); t.after(() => ctx.fiber.dispose()); await mountAgentLoopTestDependencies(ctx);
  ctx.provide('crmDashboard', { query: async (_session, _args, signal) => {
    started.resolve(signal); return completed.promise;
  } });
  const owner = await ctx.plugin(crm);
  const pending = ctx.tools.execute({ name: 'query_crm_dashboard_gsv',
    arguments: { start_date: '2026-09-01', end_date: '2026-09-02' },
    agent: { session: { id: 'crm-unload-fixture' } }, callId: 'unload-dashboard', signal: new AbortController().signal });
  const signal = await started.promise;
  await owner.dispose();
  completed.resolve({ status: 'OK', synthetic: true, private_value: 'late-result' });
  const late = await pending;
  assert.equal(signal.aborted, true);
  assert.equal(late.isError, true, JSON.stringify(late)); assert.equal(late.value, undefined);
});
