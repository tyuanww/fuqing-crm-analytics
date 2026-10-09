/** Owned HTTP fixtures for the public test caller; no production service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { explainPublicKnowledge } from './knowledge-http.mjs';
const headers = { 'X-ShineMage-Contract': 'crm-knowledge-service/1.0.0', 'Content-Type': 'application/json' };
async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('public caller sends its contract and returns fixture JSON', async t => {
  const origin = await fixture(t, async (req, res) => {
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/api/v1/crm-knowledge/explain');
    assert.equal(req.headers['x-shinemage-contract'], headers['X-ShineMage-Contract']);
    let body = ''; for await (const part of req) body += part;
    assert.deepEqual(JSON.parse(body), { topic: 'fixture' });
    res.writeHead(200, headers); res.end(JSON.stringify({ status: 'OK', scope: 'synthetic' }));
  });
  assert.deepEqual(await explainPublicKnowledge(origin, 'fixture'), { status: 'OK', scope: 'synthetic' });
});
for (const declaredLength of [false, true]) {
  test(`public caller bounds ${declaredLength ? 'declared' : 'streamed'} response bytes`, async t => {
    const body = JSON.stringify({ oversized: 'x'.repeat(2 * 1024 * 1024) });
    const origin = await fixture(t, (_req, res) => {
      res.writeHead(200, { ...headers, ...(declaredLength ? { 'Content-Length': Buffer.byteLength(body) } : {}) });
      if (!declaredLength) res.write(body.slice(0, 1024));
      res.end(declaredLength ? body : body.slice(1024));
    });
    assert.equal((await explainPublicKnowledge(origin, 'fixture')).reason?.code, 'INVALID_RESPONSE');
  });
}
for (const stage of ['headers', 'body']) {
  test(`public caller times out while waiting for ${stage}`, { timeout: 2000 }, async t => {
    const origin = await fixture(t, (_req, res) => {
      if (stage === 'body') { res.writeHead(200, headers); res.write('{'); }
    });
    assert.equal((await explainPublicKnowledge(origin, 'fixture', { timeoutMs: 100 })).reason.code, 'TIMEOUT');
  });
}
test('redirect and denied responses stay unavailable without reading error payload', async t => {
  let targetCalls = 0;
  const target = await fixture(t, (_req, res) => { targetCalls++; res.end('SECRET'); });
  const redirect = await fixture(t, (_req, res) => { res.writeHead(302, { Location: target }); res.end(); });
  assert.equal((await explainPublicKnowledge(redirect, 'fixture')).reason.code, 'SERVICE_UNAVAILABLE');
  assert.equal(targetCalls, 0);
  const denied = await fixture(t, (_req, res) => { res.writeHead(403, headers); res.write('SECRET'); });
  assert.deepEqual(await explainPublicKnowledge(denied, 'fixture', { timeoutMs: 100 }), { status: 'NOT_AVAILABLE', reason: { code: 'SERVICE_UNAVAILABLE' } });
});
test('contract mismatch and invalid JSON remain explicit failures', async t => {
  const mismatch = await fixture(t, (_req, res) => { res.writeHead(409); res.write('SECRET'); });
  assert.equal((await explainPublicKnowledge(mismatch, 'fixture', { timeoutMs: 100 })).reason.code, 'CONTRACT_MISMATCH');
  const invalid = await fixture(t, (_req, res) => { res.writeHead(200, headers); res.end('{'); });
  assert.equal((await explainPublicKnowledge(invalid, 'fixture')).reason.code, 'INVALID_RESPONSE');
});
