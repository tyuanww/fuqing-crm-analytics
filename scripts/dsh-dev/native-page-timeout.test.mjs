import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

import { createNativePageHost, NATIVE_PAGE_PATH } from './native-page-host.mjs';
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });
const close = async server => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };

test('a stalled CRM read ends the callback at its own deadline without delivering late data', async () => {
  let resolveRead; const pendingRead = new Promise(resolve => { resolveRead = resolve; });
  let lateObserved; const lateFinished = new Promise(resolve => { lateObserved = resolve; });
  let firstRead = true;
  const ref = 'crm_ref_' + 'c'.repeat(32); let callbackOrigin;
  const crmDashboard = { async openNativeSnapshotLease(session) {
    return { identity: { native_session_id: session },
      async read() { if (firstRead) { firstRead = false; return pendingRead; } return { value: 'fresh-result' }; },
      async assertCurrent(signal) { if (signal.aborted) lateObserved(); } };
  } };
  const page = createServer((req, res) => { void (async () => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks);
    const call = (input, signal) => fetch(callbackOrigin + '/native-pages/callback', { method: 'POST', signal,
      headers: { authorization: 'Bearer ' + req.headers['x-native-page-lease'] }, body: JSON.stringify(input) });
    const auth = await call({ operation: 'authenticate', method: req.method, path: req.url, query: '', idempotency_key: null,
      body_sha256: createHash('sha256').update(body).digest('hex') });
    assert.equal(auth.status, 200);
    let result;
    try {
      const read = await call({ operation: 'read', session_id: 'fixture-session', ref }, AbortSignal.timeout(6500));
      result = { status: read.status, body: await read.text() };
    } catch { result = { status: 'client_timeout' }; }
    res.writeHead(typeof result.status === 'number' ? result.status : 504, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  })().catch(() => { res.writeHead(500); res.end('{}'); }); });
  let host;
  try {
    host = createNativePageHost({ crmDashboard, pageOrigin: await listen(page), callbackPort: 0, timeoutMs: 10000 });
    callbackOrigin = await host.start();
    const response = await host.fetch(new Request('http://host' + NATIVE_PAGE_PATH, { method: 'POST',
      body: JSON.stringify({ operation: 'read', body: { marker: 'fixture' } }) }));
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(result.status, 503);
    resolveRead({ value: 'late-secret' });
    await Promise.race([lateFinished, new Promise((_, reject) => setTimeout(() => reject(new Error('late callback did not finish')), 1000))]);
    await new Promise(resolve => setImmediate(resolve));
    assert(!JSON.stringify(result).includes('late-secret'));
    const next = await host.fetch(new Request('http://host' + NATIVE_PAGE_PATH, { method: 'POST',
      body: JSON.stringify({ operation: 'read', body: { marker: 'fixture' } }) }));
    assert.equal(next.status, 200);
    assert((await next.text()).includes('fresh-result'));
  } finally { resolveRead({ value: 'late-secret' }); await host?.dispose(); await close(page); }
});

test('callbacks that ignore cancellation keep capacity bounded until the underlying work finishes', async () => {
  let resolveReads; const blockedReads = new Promise(resolve => { resolveReads = resolve; });
  let observed = 0; let allObserved; const allLate = new Promise(resolve => { allObserved = resolve; });
  const ref = 'crm_ref_' + 'd'.repeat(32); let callbackOrigin;
  const crmDashboard = { async openNativeSnapshotLease(session) {
    return { identity: { native_session_id: session }, read: () => blockedReads,
      async assertCurrent(signal) { if (signal.aborted && ++observed === 32) allObserved(); } };
  } };
  const page = createServer((req, res) => { void (async () => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks);
    const call = async input => {
      const response = await fetch(callbackOrigin + '/native-pages/callback', { method: 'POST',
        headers: { authorization: 'Bearer ' + req.headers['x-native-page-lease'] }, body: JSON.stringify(input) });
      return { status: response.status, text: await response.text() };
    };
    const auth = { operation: 'authenticate', method: req.method, path: req.url, query: '', idempotency_key: null,
      body_sha256: createHash('sha256').update(body).digest('hex') };
    assert.equal((await call(auth)).status, 200);
    const reads = await Promise.all(Array.from({ length: 32 }, () => call({ operation: 'read', session_id: 'fixture-session', ref })));
    assert(reads.every(item => item.status === 503 && !item.text.includes('late-secret')));
    assert.equal((await call(auth)).status, 503);
    resolveReads({ value: 'late-secret' }); await allLate;
    let recovered = false;
    for (let attempt = 0; attempt < 20 && !recovered; attempt++) {
      await new Promise(resolve => setImmediate(resolve));
      recovered = (await call(auth)).status === 200;
    }
    assert(recovered);
    res.writeHead(200); res.end('{}');
  })().catch(error => { res.writeHead(500); res.end(JSON.stringify({ error: String(error) })); }); });
  let host;
  try {
    host = createNativePageHost({ crmDashboard, pageOrigin: await listen(page), callbackPort: 0, timeoutMs: 10000 });
    callbackOrigin = await host.start();
    const response = await host.fetch(new Request('http://host' + NATIVE_PAGE_PATH, { method: 'POST',
      body: JSON.stringify({ operation: 'read', body: { marker: 'fixture' } }) }));
    assert.equal(response.status, 200, await response.text());
  } finally { resolveReads({ value: 'late-secret' }); await host?.dispose(); await close(page); }
});
