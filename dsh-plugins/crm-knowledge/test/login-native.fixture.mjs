/** Real pinned Connection + session/tool runtime + owned loopback server. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CRM_UI_PATH } from '../src/dashboard-access.mjs';

export async function mountLoginHost(t, baseUrl) {
  const upstream = process.env.B0_BUILD_UPSTREAM;
  assert.ok(upstream);
  const load = path => import(pathToFileURL(join(upstream, path, 'lib/index.js')).href);
  const { Context } = await load('vendor/cordis');
  const { mountAgentLoopTestDependencies } = await load('packages/test-support/agent-loop-testkit');
  const connection = await load('packages/client/connection');
  const plugin = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const hostPlugin = await import(pathToFileURL(join(plugin, 'lib/host.js')).href);
  const toolsPlugin = await import(pathToFileURL(join(plugin, 'lib/index.js')).href);
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
  const call = (operation, payload = {}, headers = {}) => fetch(origin + CRM_UI_PATH, { method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/json', 'x-crm-ui': '1', ...headers },
    body: JSON.stringify({ operation, session_id: 'fixture-session', ...payload }),
  });
  let counter = 0;
  const execute = (name, args, sessionId = 'fixture-session') => ctx.tools.execute({
    name, arguments: args, agent: { session: ctx.sessions.get(sessionId) }, callId: `login_${++counter}`, signal: new AbortController().signal,
  });
  return { ctx, origin, cookie, call, execute, removeHost: () => host.dispose(), removeTools: () => tool.dispose() };
}
