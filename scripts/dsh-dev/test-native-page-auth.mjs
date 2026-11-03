import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createNativePageHost, NATIVE_PAGE_PATH } from './native-page-host.mjs';

const upstream = process.argv[2];
assert(upstream && isAbsolute(upstream), 'explicit DSH upstream path required');
const require = createRequire(join(upstream, 'packages/client/connection/package.json'));
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const { BrowserAuth } = await import(pathToFileURL(join(upstream, 'packages/client/connection/src/browser-auth.ts')).href);
const { HostConnectionService } = await import(pathToFileURL(join(upstream, 'packages/client/connection/src/rpc-host.ts')).href);
let record;
const auth = await BrowserAuth.create({}, { readRecord: async () => record, modifyRecord: async (_key, change) => (record = await change(record)) }, 1);
const ctx = new Context();
const fiber = ctx.plugin(c => { new HostConnectionService(c, [], auth); });
await fiber.await();
const connection = ctx.get('connection');
const host = createNativePageHost({ crmDashboard: {}, pageOrigin: 'http://127.0.0.1:18191', callbackPort: 0 });
connection.fetch.register({ path: NATIVE_PAGE_PATH, methods: ['POST'], requestBody: 'streaming', fetch: req => host.fetch(req) });
const authority = '127.0.0.1:43299'; const origin = `http://${authority}`;
const url = new URL(connection.authenticatedUrl(origin));
let cookie;
connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: authority } }, {
  writeHead(status, headers) { assert.equal(status, 303); cookie = headers['set-cookie'].split(';')[0]; }, end() {},
});
const shared = connection.createSharedFetchHandler('/api');
try {
  for (const [headers, status] of [
    [{ host: authority }, 401], [{ host: authority, cookie: 'invalid' }, 401],
    [{ host: authority, cookie, origin: 'http://evil.invalid' }, 403], [{ host: 'evil.invalid', cookie }, 403],
  ]) assert.equal(connection.admit({ method: 'POST', url: NATIVE_PAGE_PATH, headers }).rejection, status);
  const headers = { host: authority, cookie, origin };
  const admission = connection.admit({ method: 'POST', url: NATIVE_PAGE_PATH, headers });
  assert('peer' in admission);
  const res = await shared.fetch(new Request(origin + NATIVE_PAGE_PATH, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{"operation":"arbitrary-url"}' }), admission.peer);
  assert.equal(res.status, 404); assert.equal((await res.json()).error.code, 'NOT_FOUND');
  console.log('actual BrowserAuth synthetic exchange / Connection admission / native exact route: passed');
} finally { await host.dispose(); await fiber.dispose(); }
