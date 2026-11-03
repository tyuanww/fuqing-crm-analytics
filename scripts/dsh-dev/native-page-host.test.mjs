import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createNativePageHost, NATIVE_PAGE_PATH } from './native-page-host.mjs';

const REF = 'crm_ref_' + 'a'.repeat(32);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
const close = async server => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
const request = (operation, extra = {}, signal) => new Request('http://127.0.0.1:43299' + NATIVE_PAGE_PATH, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation, ...extra }), signal,
});

test('fixed edit operations bind context, patch preview and page-version query without arbitrary forwarding', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init }); return Response.json({ ok: true });
  });
  const host = createNativePageHost({ crmDashboard: {}, pageOrigin: 'http://127.0.0.1:18191', callbackPort: 0 });
  const prefix = 'http://127.0.0.1:18191/api/v1/analytics/page-edit-contexts';
  try {
    for (const [op, input, method, suffix] of [
      ['editCreate', { body: { page_id: 'page1', node_id: 'title', kind: 'static_element' } }, 'POST', ''],
      ['editNative', { id: 'ctx1' }, 'POST', '/ctx1/native'],
      ['editApply', { id: 'ctx1', page_id: 'page1', body: { schema_version: 'free-page-edit/v1' }, idempotency_key: 'apply1' }, 'POST', '/ctx1/patches?page_id=page1'],
      ['editConfirm', { id: 'ctx1', preview_id: 'patch1', idempotency_key: 'confirm1' }, 'POST', '/ctx1/patches/patch1/confirm'],
      ['editReceipt', { id: 'ctx1', preview_id: 'patch1' }, 'GET', '/ctx1/patches/patch1/receipt'],
      ['editAcknowledge', { id: 'ctx1', preview_id: 'patch1' }, 'POST', '/ctx1/patches/patch1/receipt'],
      ['editOverlay', { page_id: 'page1', version: 2 }, 'GET', '/overlay?version=2&page_id=page1'],
    ]) {
      assert.equal((await host.fetch(request(op, input))).status, 200);
      assert.equal(calls.at(-1).url, prefix + suffix);
      assert.equal(calls.at(-1).init.method, method);
      assert.equal(calls.at(-1).init.headers['idempotency-key'], input.idempotency_key);
    }
    const count = calls.length;
    for (const [op, input] of [
      ['editConfirm', { id: 'ctx1' }], ['editConfirm', { id: '..', preview_id: 'patch1' }],
      ['editConfirm', { id: 'ctx1', preview_id: 'x/y' }], ['editConfirm', { id: 'ctx1', preview_id: 'patch1', page_id: 'page1' }],
      ['editCreate', { id: 'ctx1' }], ['editOverlay', { page_id: 'page1' }],
      ['editOverlay', { page_id: 'page1', version: 0 }], ['editOverlay', { page_id: 'page1', version: 2, body: {} }],
      ['editApply', { id: 'ctx1', path: '/arbitrary' }], ['editApply', { id: 'ctx1', body: { owner: 'forged' } }],
    ]) assert.equal((await host.fetch(request(op, input))).status, 404, JSON.stringify(input));
    assert.equal(calls.length, count);
  } finally { await host.dispose(); }
});

test('body stalls and cancellation release bounded forwarding capacity', async () => {
  const host = createNativePageHost({ crmDashboard: {}, pageOrigin: 'http://127.0.0.1:18191', callbackPort: 0, timeoutMs: 25, capacity: 1 });
  try {
    const stalled = new Request('http://host' + NATIVE_PAGE_PATH, { method: 'POST', body: new ReadableStream({}), duplex: 'half' });
    assert.equal((await host.fetch(stalled)).status, 503);
    assert.equal((await host.fetch(request('unknown'))).status, 404);
    const abort = new AbortController(); abort.abort();
    assert.equal((await host.fetch(request('list', {}, abort.signal))).status, 503);
    assert.equal((await host.fetch(request('unknown'))).status, 404);
  } finally { await host.dispose(); }
});

test('private callbacks stay available at page capacity and pin the original CRM lease', async () => {
  let callbackOrigin; let opening = 0; let current = 'first';
  const secrets = []; const finished = deferred(); const acquired = deferred();
  const crmDashboard = {
    async openNativeSnapshotLease(session) {
      opening++; const identity = { native_session_id: session, connection_generation: current };
      return { identity, async read(ref) {
        assert.equal(ref, REF);
        if (identity.connection_generation !== current) throw Object.assign(new Error('SQL private'), { status: 401 });
        return { amount_fen: 8001 };
      }, async assertCurrent() { if (identity.connection_generation !== current) throw Object.assign(new Error('private token'), { status: 401 }); } };
    },
  };
  const faults = [];
  const page = createServer((req, res) => {
    void (async () => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const key = req.headers['x-native-page-lease']; secrets.push(key);
    const call = async input => {
      const response = await fetch(callbackOrigin + '/native-pages/callback', { method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(input) });
      return { status: response.status, body: await response.json() };
    };
    const { createHash } = await import('node:crypto');
    assert.equal((await call({ operation: 'authenticate', method: req.method, path: req.url, query: '', idempotency_key: null,
      body_sha256: createHash('sha256').update(Buffer.concat(chunks)).digest('hex') })).status, 200);
    const first = await call({ operation: 'read', session_id: 'native-session', ref: REF });
    assert.equal(first.status, 200); acquired.resolve();
    await finished.promise;
    const second = await call({ operation: 'read', session_id: 'native-session', ref: REF });
    assert.equal(second.status, 401); assert.equal(opening, 1);
    res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify(second.body));
    })().catch(error => {
      faults.push(error); acquired.resolve(error); finished.resolve();
      if (!res.writableEnded) { res.writeHead(503); res.end('{}'); }
    });
  });
  let host;
  try {
    const pageOrigin = await listen(page);
    host = createNativePageHost({ crmDashboard, pageOrigin, callbackPort: 0, capacity: 1 });
    callbackOrigin = await host.start();
    const pending = host.fetch(request('generate', { body: { session_id: 'native-session' } }));
    const failure = await acquired.promise;
    if (failure) throw failure;
    assert.equal((await host.fetch(request('list'))).status, 503);
    current = 'second'; finished.resolve();
    const response = await pending;
    assert.deepEqual(faults, []);
    assert.equal(response.status, 503);
    const output = await response.text(); assert(!output.includes(secrets[0])); assert(!output.includes('private'));
    const dead = await fetch(callbackOrigin + '/native-pages/callback', { method: 'POST', headers: { authorization: 'Bearer ' + secrets[0] }, body: '{}' });
    assert.equal(dead.status, 401);
  } finally { finished.resolve(); await host?.dispose(); await close(page); }
});
