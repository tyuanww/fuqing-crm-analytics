import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createNativePageHost, NATIVE_PAGE_PATH } from '../native-page-host.mjs';

const lines = createInterface({ input: process.stdin });
const iterator = lines[Symbol.asyncIterator]();
const config = JSON.parse((await iterator.next()).value);
const require = createRequire(join(config.upstream, 'packages/client/connection/package.json'));
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const source = name => import(pathToFileURL(join(config.upstream, 'packages/client/connection/src', name)).href);
const { BrowserAuth } = await source('browser-auth.ts');
const { HostConnectionService } = await source('rpc-host.ts');
const { bridge } = await source('http-bridge.ts');
const { createDashboardAccess, CRM_UI_PATH } = await import(pathToFileURL(join(config.crmPlugin, 'src/dashboard-access.mjs')).href);
const { createLivePageAdapters } = await import(pathToFileURL(join(config.workbenchPlugin, 'src/client/free-html-library/live-adapters.mjs')).href);
const { createHostPageStore } = await import(pathToFileURL(join(config.workbenchPlugin, 'src/client/free-html-library/create-host-page-store.mjs')).href);
const { previewMessages } = await import(pathToFileURL(join(config.workbenchPlugin, 'src/client/free-html-library/preview-message.fixture.mjs')).href);
let library;
let credential;
const auth = await BrowserAuth.create({}, {
  readRecord: async () => credential,
  modifyRecord: async (_key, change) => (credential = await change(credential)),
}, 1);
const ctx = new Context();
const fiber = ctx.plugin(c => {
  c.provide('webServer', { protocol: 'http:', host: '127.0.0.1' });
  new HostConnectionService(c, [], auth);
});
await fiber.await();
const connection = ctx.get('connection');
const shared = connection.createSharedFetchHandler('/api');
const sessions = new Set(['native-session', 'other-session']);
let now = Date.now();
let serverOrigin;
const makeAccess = () => createDashboardAccess({ baseUrl: config.crmOrigin, browserOrigin: config.browserOrigin,
  dataKind: 'synthetic', hasSession: id => sessions.has(id), now: () => now,
  nativeSnapshot: { introspectionPort: config.introspectionPort, sourceOrigin: config.sourceOrigin, tokenFile: config.tokenFile } });
let access = makeAccess();
let host;
const makeHost = async () => {
  const owned = createNativePageHost({ crmDashboard: access.service, pageOrigin: config.pageOrigin, callbackPort: config.callbackPort });
  await owned.start(); return owned;
};
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/?token=')) { connection.authorizeIndex(req, res); return; }
    const admission = connection.admit(req);
    if ('rejection' in admission) { res.writeHead(admission.rejection); res.end(); return; }
    await bridge(req, res, shared, admission.peer, 4 * 1024 * 1024);
  } catch { if (!res.writableEnded) { res.writeHead(503); res.end(); } }
});
let cookie;
try {
  await access.start(); host = await makeHost();
  connection.fetch.register({ path: NATIVE_PAGE_PATH, methods: ['POST'], requestBody: 'streaming', fetch: req => host.fetch(req) });
  connection.fetch.register({ path: CRM_UI_PATH, methods: ['POST'], requestBody: 'streaming', fetch: req => access.browser(req) });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.webPort, '127.0.0.1', resolve); });
  serverOrigin = `http://127.0.0.1:${server.address().port}`;
  const launch = await fetch(connection.authenticatedUrl(serverOrigin), { redirect: 'manual' });
  assert.equal(launch.status, 303);
  cookie = launch.headers.get('set-cookie').split(';')[0];
  let dropEditConfirm = false;
  const nativeFetch = async (path, init = {}) => {
    const response = await fetch(serverOrigin + path, { ...init, headers: { ...init.headers, cookie, origin: serverOrigin } });
    if (dropEditConfirm && path === NATIVE_PAGE_PATH && JSON.parse(init.body).operation === 'editConfirm' && response.ok) {
      dropEditConfirm = false; await response.arrayBuffer(); throw new TypeError('owned edit confirmation response lost');
    }
    return response;
  };
  const adapters = createLivePageAdapters({ nativePages: true, nativeFetch });
  const publicRequest = async (envelope, headers = {}) => {
    const res = await nativeFetch(NATIVE_PAGE_PATH, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(envelope) });
    let body; try { body = await res.json(); } catch { body = {}; }
    return { status: res.status, body };
  };
  send({ ready: true });
  for (;;) {
    const line = await iterator.next(); if (line.done) break;
    const input = JSON.parse(line.value); if (input.op === 'close') break;
    try {
      const session = input.session ?? 'native-session';
      let value;
      if (input.op === 'login' || input.op === 'disconnect') {
        const res = await nativeFetch(CRM_UI_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'x-crm-ui': '1' },
          body: JSON.stringify({ operation: input.op, session_id: session, ...(input.op === 'login' ? { username: 'fixture-user', password: 'native-fixture-password' } : {}) }) });
        value = await res.json();
      } else if (input.op === 'query') value = await access.service.querySnapshot(session, input.filters);
      else if (input.op === 'preview') value = (await adapters.documents.generatePreview(input.draft)).body;
      else if (input.op === 'confirm') value = (await adapters.documents.confirmPreview(input.id, input.key)).body;
      else if (input.op === 'read') value = await adapters.bridge.readResult(input.request);
      else if (input.op === 'parallelRead') value = await Promise.all(input.requests.map(async request => {
        try { return { ok: true, value: await adapters.bridge.readResult(request) }; }
        catch (error) { return { ok: false, status: error.status, code: error.code }; }
      }));
      else if (input.op === 'binding') value = await adapters.bridge.readBinding(input.page);
      else if (input.op === 'get') { await adapters.documents.pullPage(input.id); value = adapters.assets.get(input.id); }
      else if (input.op === 'history') value = await adapters.documents.pullHistory(input.id);
      else if (input.op === 'raw') value = await publicRequest(input.envelope);
      else if (input.op === 'revoke') value = await access.service.revokeNativeSnapshot(session, input.ref);
      else if (input.op === 'inactive') { sessions.delete(session); value = { ok: true }; }
      else if (input.op === 'active') { sessions.add(session); value = { ok: true }; }
      else if (input.op === 'expire') { now += 9 * 60 * 60 * 1000; value = { ok: true }; }
      else if (input.op === 'restart') { await host.dispose(); await access.dispose(); access = makeAccess(); await access.start(); host = await makeHost(); value = { ok: true }; }
      else if (input.op === 'pageRestart') { await host.dispose(); host = await makeHost(); value = { ok: true }; }
      else if (input.op === 'store') {
        const store = createHostPageStore({ nativePages: true, nativeFetch, nativeGenerate: async () => ({ ...input.draft.package, __session_id: input.draft.session_id, binding_manifest: input.draft.binding_manifest }) });
        store.setPrompt('native CRM'); await store.generate();
        value = store.getSnapshot(); store.dispose();
      } else if (input.op === 'storeOpen') {
        library?.dispose();
        library = createHostPageStore({ nativePages: true, nativeFetch,
          nativeGenerate: async () => ({ ...input.draft.package, __session_id: input.draft.session_id, binding_manifest: input.draft.binding_manifest }) });
        library.setPrompt('native CRM'); await library.generate(); value = library.getSnapshot();
      } else if (input.op === 'storeReopen') {
        const pageId = library.getSnapshot().current.page_id;
        library.dispose(); library = createHostPageStore({ nativePages: true, nativeFetch });
        await library.openPage(pageId); value = library.getSnapshot();
      } else if (input.op === 'storeText' || input.op === 'storeSource') {
        dropEditConfirm = input.loseReceipt === true;
        if (input.op === 'storeText') library.previewPresentationOverlay(input.node, { text: input.text }, { idempotencyKey: input.key });
        else library.previewSourcePackage({ ...library.getSnapshot().current.package, html: input.html },
          { nodeId: input.node, structure: input.structure, idempotencyKey: input.key });
        await library.confirmPatch(); value = library.getSnapshot();
      } else if (input.op === 'storeRetry') {
        await library.inspectConfirmation(); value = library.getSnapshot();
      } else if (input.op === 'frame') {
        const frame = await previewMessages(library);
        try {
          frame.send(input.operation ?? 'data.read', input.payload, 'frame-request');
          value = await frame.reply('frame-request');
        } finally { frame.close(); }
      } else if (input.op === 'auth') {
        const statuses = [];
        for (const headers of [{}, { cookie: 'invalid' }, { cookie, origin: 'http://evil.invalid' }, { cookie, host: 'evil.invalid' }]) {
          if (headers.host) {
            const status = await new Promise((resolve, reject) => {
              const req = httpRequest(serverOrigin + NATIVE_PAGE_PATH, { method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' } }, res => {
                res.resume(); res.on('end', () => resolve(res.statusCode)); res.on('error', reject);
              });
              req.on('error', reject); req.end('{"operation":"list"}');
            });
            statuses.push(status); continue;
          }
          const res = await fetch(serverOrigin + NATIVE_PAGE_PATH, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{"operation":"list"}' });
          statuses.push(res.status); await res.body?.cancel();
        }
        value = { statuses, valid: (await publicRequest({ operation: 'list' })).status };
      } else throw new Error('unknown fixture operation');
      send({ ok: true, value });
    } catch (error) { send({ ok: false, status: error.status ?? 503, code: error.code ?? 'SOURCE_UNAVAILABLE' }); }
  }
} finally {
  library?.dispose();
  lines.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await host?.dispose(); await access.dispose(); await fiber.dispose();
}
