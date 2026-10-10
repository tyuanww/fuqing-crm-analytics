import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createMetricsService } from '../src/service-client.mjs';
import { serviceContract } from '../src/service-contract.generated.mjs';

async function fixture(t, handler) {
  const requests = [];
  const server = createServer((req, res) => { requests.push({ path: req.url, headers: req.headers }); handler(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { origin: 'http://127.0.0.1:' + server.address().port, requests };
}
const json = (res, body, contract = 'crm-metrics-service/1.0.0') => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': contract }); res.end(JSON.stringify(body));
};
const caps = { ...serviceContract, synthetic_only: true, real_archive: false, metric_version: 'crm-metrics/v1' };
const request = { source_id: 'synthetic-crm-metrics', contains_real_data: false, metric_version: 'crm-metrics/v1',
  query_id: 'sales_window_summary', period_start: '2026-09-01', period_end_exclusive: '2026-10-01',
  refund_view: 'ORDER_COHORT_AS_OF', refund_as_of: '2026-09-21T00:00:00+08:00', data_through: '2026-09-21T00:00:00+08:00' };

test('missing and invalid bindings never attempt a request or use ambient configuration', async () => {
  for (const origin of [undefined, 'http://example.invalid', 'http://user:secret@127.0.0.1', 'file:///tmp/source',
    'http://127.0.0.1/private', 'http://127.0.0.1?token=secret']) {
    const client = createMetricsService(origin === undefined ? {} : { metricsOrigin: origin });
    const result = await client.capabilities();
    assert.equal(result.status, 'NOT_AVAILABLE');
    assert.equal(result.reason.code, origin === undefined ? 'SERVICE_NOT_CONFIGURED' : 'INVALID_CONFIGURATION');
    assert.doesNotMatch(JSON.stringify(result), /secret|example.invalid|file:/);
  }
});

test('version, domain and body contract mismatches fail closed with no automatic retry', async t => {
  for (const [header, body, code] of [
    ['crm-metrics-service/2.0.0', caps, 'CONTRACT_MISMATCH'],
    ['crm-knowledge-service/1.0.0', caps, 'CONTRACT_MISMATCH'],
    ['', caps, 'CONTRACT_MISMATCH'],
    ['crm-metrics-service/1.0.0', { ...caps, real_archive: true }, 'INVALID_RESPONSE'],
    ['crm-metrics-service/1.0.0', { ...caps, api_version: '2.0.0' }, 'INVALID_RESPONSE'],
    ['crm-metrics-service/1.0.0', { ...caps, operations: [] }, 'INVALID_RESPONSE'],
  ]) {
    const f = await fixture(t, (_req, res) => json(res, body, header));
    const result = await createMetricsService({ metricsOrigin: f.origin }).capabilities();
    assert.equal(result.reason.code, code);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].headers['x-shinemage-contract'], 'crm-metrics-service/1.0.0');
    assert.equal(f.requests[0].headers.authorization, undefined);
    assert.equal(f.requests[0].headers.cookie, undefined);
  }
});

test('redirects cannot escape the selected service', async t => {
  const target = await fixture(t, (_req, res) => json(res, caps));
  const source = await fixture(t, (_req, res) => { res.writeHead(302, { Location: target.origin }); res.end(); });
  assert.equal((await createMetricsService({ metricsOrigin: source.origin }).capabilities()).status, 'NOT_AVAILABLE');
  assert.equal(source.requests.length, 1); assert.equal(target.requests.length, 0);
});

test('oversized, invalid JSON and non-JSON bodies do not leak upstream text', async t => {
  for (const [type, body] of [['application/json', '{private-password'], ['text/html', '<html>private-password</html>'],
    ['application/json', JSON.stringify({ secret: 'private-password', data: 'x'.repeat(2 * 1024 * 1024) })]]) {
    const f = await fixture(t, (_req, res) => {
      res.writeHead(200, { 'Content-Type': type, 'X-ShineMage-Contract': 'crm-metrics-service/1.0.0' });
      // No Content-Length: enforce the bound while streaming too.
      res.write(body.slice(0, 100)); res.end(body.slice(100));
    });
    const result = await createMetricsService({ metricsOrigin: f.origin }).capabilities();
    assert.equal(result.reason.code, 'INVALID_RESPONSE');
    assert.doesNotMatch(JSON.stringify(result), /private-password/);
  }
});

test('timeout covers headers and response streaming; cancellation remains cancellation', async t => {
  for (const stream of [false, true]) {
    const f = await fixture(t, (_req, res) => {
      if (stream) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': 'crm-metrics-service/1.0.0' });
        res.write('{');
      }
    });
    assert.equal((await createMetricsService({ metricsOrigin: f.origin, timeoutMs: 40 }).capabilities()).reason.code, 'TIMEOUT');
  }
  const f = await fixture(t, () => {});
  const client = createMetricsService({ metricsOrigin: f.origin });
  const controller = new AbortController();
  const pending = client.capabilities(controller.signal);
  const timer = setTimeout(() => controller.abort(), 30);
  try { await assert.rejects(pending, { name: 'AbortError' }); } finally { clearTimeout(timer); }
  const count = f.requests.length;
  await assert.rejects(client.capabilities(controller.signal), { name: 'AbortError' });
  assert.equal(f.requests.length, count);
});

test('request validation blocks arbitrary source, SQL and transport parameters before IO', async t => {
  const f = await fixture(t, (_req, res) => json(res, caps));
  const client = createMetricsService({ metricsOrigin: f.origin, knowledgeOrigin: f.origin });
  for (const change of [{ source_id: '/private/data' }, { contains_real_data: true }, { sql: 'select 1' },
    { query_id: 'delete' }, { origin: 'http://elsewhere.invalid' }]) {
    await assert.rejects(client.query({ ...request, ...change }), /请求不符合/);
  }
  assert.equal(f.requests.length, 0);
});

test('typed result schema rejects malformed facts', async t => {
  const f = await fixture(t, (_req, res) => json(res, { facts: { aus: 'invented' } }));
  assert.equal((await createMetricsService({ metricsOrigin: f.origin }).query(request)).reason.code, 'INVALID_RESPONSE');
});
