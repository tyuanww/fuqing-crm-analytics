/** Real pinned Connection + session/tool runtime + owned loopback server. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
// Expected public HTTP paths, asserted by the real compiled host in these tests.
const CRM_UI_PATH = '/api/crm-knowledge/connection';
const CRM_ASSETS_UI_PATH = '/api/crm-knowledge/assets';

export async function mountLoginHost(t, baseUrl, runtime) {
  assert.ok(runtime, 'Explicit verified composition runtime is required');
  const { Context, mountAgentLoopTestDependencies, connection, crmHost: hostPlugin, crm: toolsPlugin } = runtime;
  const ctx = new Context(); const routes = [];
  const server = createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname === '/') {
      if (ctx.connection.authorizeIndex(req, res)) { res.writeHead(200); res.end('isolated synthetic host'); }
      return;
    }
    const route = routes.find(route => req.url.startsWith(route.path + '/'));
    if (!route) { res.writeHead(404); res.end(); return; }
    void route.handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await ctx.fiber.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await mountAgentLoopTestDependencies(ctx);
  ctx.sessions.create('fixture-session'); ctx.sessions.create('another-session');
  let credentials;
  ctx.provide('credentials', {
    readRecord: async () => credentials,
    modifyRecord: async (_key, mutate) => (credentials = await mutate(credentials)),
    deleteRecord: async () => { credentials = undefined; },
  });
  await ctx.plugin({ name: 'crm-test-web', apply(scoped) {
    scoped.provide('webServer', { port: server.address().port, tapIndex: () => () => {}, register(route) {
      routes.push(route); return () => { const index = routes.indexOf(route); if (index >= 0) routes.splice(index, 1); };
    } });
  } });
  await ctx.plugin(connection);
  const host = await ctx.plugin(hostPlugin, { baseUrl, dataKind: 'synthetic' });
  const tool = await ctx.plugin(toolsPlugin);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const exchange = await fetch(ctx.connection.authenticatedUrl(origin), { redirect: 'manual' });
  const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]; await exchange.arrayBuffer(); assert.ok(cookie);
  const call = (operation, payload = {}, headers = {}, path = CRM_UI_PATH) => fetch(origin + path, { method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/json', 'x-crm-ui': '1', ...headers },
    body: JSON.stringify({ operation, session_id: 'fixture-session', ...payload }),
  });
  let counter = 0;
  const execute = (name, args, sessionId = 'fixture-session') => ctx.tools.execute({
    name, arguments: args, agent: { session: ctx.sessions.get(sessionId) }, callId: `login_${++counter}`, signal: new AbortController().signal,
  });
  return { ctx, origin, cookie, call, assetCall: (operation, payload = {}, headers = {}) => call(operation, payload, headers, CRM_ASSETS_UI_PATH),
    execute, removeHost: () => host.dispose(), removeTools: () => tool.dispose() };
}
