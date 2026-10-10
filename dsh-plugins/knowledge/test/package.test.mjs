/** Execute the actual built or verified-unpacked knowledge package with only pinned SDK peers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const plugin = process.env.KNOWLEDGE_TEST_PLUGIN_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const upstream = process.env.B0_BUILD_UPSTREAM;
assert.ok(upstream, 'Use the verified pinned SDK checkout');
const { Context } = await import(pathToFileURL(join(upstream, 'vendor/cordis/lib/index.js')).href);
const { mountAgentLoopTestDependencies } = await import(pathToFileURL(join(upstream, 'packages/test-support/agent-loop-testkit/lib/index.js')).href);
const knowledge = await import(pathToFileURL(join(plugin, 'lib/index.js')).href);
const graph = await import(pathToFileURL(join(plugin, 'lib/graph-tools.js')).href);

async function runtime(t) {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await mountAgentLoopTestDependencies(ctx);
  const agent = { session: { id: 'knowledge-package-fixture' } }; let seq = 0;
  return { ctx, agent, execute: (name, args = {}) => ctx.tools.execute({ name, arguments: args, agent,
    callId: `knowledge-${++seq}`, signal: new AbortController().signal }) };
}
test('knowledge package alone registers definitions without CRM, Python, UI or page tools', async t => {
  const { ctx, agent, execute } = await runtime(t);
  const owned = await ctx.plugin(knowledge);
  assert.equal(ctx.tools.get('query_crm_dashboard_gsv', agent), undefined);
  assert.equal(ctx.tools.get('free_html_page_generate', agent), undefined);
  assert.equal(ctx.get('crmDashboard'), undefined);
  const result = await execute('crm_knowledge_explain', { topic: '客单价' });
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.equal(result.value.status, 'NOT_AVAILABLE');
  assert.equal(result.value.reason.code, 'SERVICE_NOT_CONFIGURED');
  await owned.dispose();
  assert.equal(ctx.tools.get('crm_knowledge_explain', agent), undefined);
});
test('private textbook tools deny absent/incompatible identity before reading settings', async t => {
  const { ctx, execute } = await runtime(t);
  await ctx.plugin(graph, { settingsFile: '/never/read/private-settings.json' });
  const result = await execute('query_crm_knowledge_sources', { query: '会员' });
  assert.equal(result.value.reason.code, 'IDENTITY_PROVIDER_NOT_AVAILABLE');
  const provider = await ctx.plugin({ name: 'fixture-incompatible-identity', apply(scope) {
    scope.provide('crmKnowledgeAccess', { contract: 'shinemage-knowledge-access/v2', authorize() { throw Error('must not run'); } });
  } });
  const incompatible = await execute('query_crm_knowledge_graph', { topic: '会员' });
  assert.equal(incompatible.value.reason.code, 'IDENTITY_CONTRACT_MISMATCH');
  assert.deepEqual(incompatible.value.sources, []);
  await provider.dispose();
});
test('knowledge package carries no CRM implementation or repository discovery', async () => {
  for (const file of ['index.js', 'graph-tools.js']) {
    const entry = await readFile(join(plugin, 'lib', file), 'utf8');
    assert.doesNotMatch(entry, /node:child_process|createDashboardAccess|CRM_METRICS_PYTHON|PYTHONPATH|crm-knowledge\/src|scripts\/crm-calibration/);
    assert.doesNotMatch(entry, /\/api\/v1\/auth\/login|\/api\/v1\/metrics\/overview/);
  }
  const manifest = JSON.parse(await readFile(join(plugin, 'package.json')));
  assert.equal(manifest.name, '@shine-mage/dsh-knowledge');
  assert.equal(manifest.shinemage.plugin_domain, 'knowledge');
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.dsh.client, undefined);
});

test('unloading a knowledge owner cancels in-flight HTTP and fences its late answer', async t => {
  const started = Promise.withResolvers();
  const body = { topic: 'probe', metric_version: 'crm-metrics/v1', pack_version: 'crm-knowledge-offline/v1',
    pack_sha256: 'a'.repeat(64), decision_ids: [], evidence_refs: [], sources: [], relations: [], context_nodes: [],
    implementation_status: 'not_implemented', content_scope: 'public_synthetic_pack_only',
    synthetic: true, publication_status: 'local_isolated_candidate', document_acl_connected: false,
    code_fixed_in_legacy_services: false, execution_authorized: false, real_business_acceptance: false, dsh_using_neo4j: false };
  const server = createServer((_req, res) => started.resolve(res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const { ctx, agent, execute } = await runtime(t);
  const owner = await ctx.plugin(knowledge, { knowledgeOrigin: 'http://127.0.0.1:' + server.address().port });
  const pending = execute('crm_knowledge_explain', { topic: 'probe' });
  const response = await started.promise;
  await owner.dispose();
  assert.equal(ctx.tools.get('crm_knowledge_explain', agent), undefined);
  response.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': 'crm-knowledge-service/1.0.0' });
  response.end(JSON.stringify(body));
  const late = await pending;
  assert.equal(late.isError, true, JSON.stringify(late));
  assert.equal(late.value, undefined);
  await ctx.plugin(knowledge);
  const next = await execute('crm_knowledge_explain', { topic: 'probe' });
  assert.equal(next.isError, false);
  assert.equal(next.value.reason.code, 'SERVICE_NOT_CONFIGURED');
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
