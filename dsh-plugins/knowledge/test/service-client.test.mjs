import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createKnowledgeService } from '../src/service-client.mjs';
const valid = { topic: 'aus', metric_version: 'crm-metrics/v1', pack_version: 'crm-knowledge-offline/v1',
  pack_sha256: 'a'.repeat(64), decision_ids: [], evidence_refs: [], sources: [], relations: [], context_nodes: [],
  implementation_status: 'not_implemented', content_scope: 'public_synthetic_pack_only',
  synthetic: true, publication_status: 'local_isolated_candidate', document_acl_connected: false,
  code_fixed_in_legacy_services: false, execution_authorized: false, real_business_acceptance: false, dsh_using_neo4j: false };
async function fixture(t, handler) {
  const calls = [];
  const server = createServer((req, res) => { calls.push({ path: req.url, headers: req.headers }); handler(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { origin: 'http://127.0.0.1:' + server.address().port, calls };
}
const json = (res, body, identity = 'crm-knowledge-service/1.0.0') => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': identity }); res.end(JSON.stringify(body));
};
test('knowledge works with only its own HTTP service and never sends CRM credentials', async t => {
  const f = await fixture(t, (_req, res) => json(res, valid));
  const service = createKnowledgeService({ knowledgeOrigin: f.origin });
  assert.deepEqual(await service.explain('aus'), valid);
  assert.equal(f.calls[0].path, '/api/v1/crm-knowledge/explain');
  assert.equal(f.calls[0].headers.authorization, undefined); assert.equal(f.calls[0].headers.cookie, undefined);
  assert.equal(service.query, undefined);
});
test('missing, credential-bearing and non-loopback bindings fail closed', async () => {
  for (const origin of [undefined, 'https://example.invalid', 'http://user:secret@127.0.0.1', 'http://127.0.0.1/private']) {
    const result = await createKnowledgeService({ knowledgeOrigin: origin }).explain('aus');
    assert.equal(result.reason.code, origin === undefined ? 'SERVICE_NOT_CONFIGURED' : 'INVALID_CONFIGURATION');
    assert.doesNotMatch(JSON.stringify(result), /secret|example.invalid/);
  }
});
test('knowledge rejects version mismatch, malformed results and unauthorized claims', async t => {
  for (const [body, identity, code] of [
    [valid, 'crm-knowledge-service/2.0.0', 'CONTRACT_MISMATCH'],
    [valid, 'crm-metrics-service/1.0.0', 'CONTRACT_MISMATCH'],
    [{ ...valid, execution_authorized: true }, undefined, 'INVALID_RESPONSE'],
    [{ ...valid, sources: 'untrusted-secret' }, undefined, 'INVALID_RESPONSE'],
    [{ ...valid, pack_sha256: 'invalid' }, undefined, 'INVALID_RESPONSE'],
  ]) {
    const f = await fixture(t, (_req, res) => json(res, body, identity));
    const result = await createKnowledgeService({ knowledgeOrigin: f.origin }).explain('aus');
    assert.equal(result.reason.code, code); assert.equal(f.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /untrusted-secret/);
  }
});
test('knowledge validates input before IO and refuses redirects and unbounded bodies', async t => {
  const target = await fixture(t, (_req, res) => json(res, valid));
  const client = createKnowledgeService({ knowledgeOrigin: target.origin });
  for (const topic of ['', ' ', 'x'.repeat(513), { url: target.origin }]) await assert.rejects(client.explain(topic));
  assert.equal(target.calls.length, 0);
  const redirected = await fixture(t, (_req, res) => { res.writeHead(302, { Location: target.origin }); res.end(); });
  assert.equal((await createKnowledgeService({ knowledgeOrigin: redirected.origin }).explain('aus')).status, 'NOT_AVAILABLE');
  assert.equal(target.calls.length, 0);
  const huge = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-ShineMage-Contract': 'crm-knowledge-service/1.0.0' });
    res.write('{"data":"'); res.end('x'.repeat(2 * 1024 * 1024) + '"}');
  });
  assert.equal((await createKnowledgeService({ knowledgeOrigin: huge.origin }).explain('aus')).reason.code, 'INVALID_RESPONSE');
});
test('knowledge timeout and cancellation cannot produce a successful answer', async t => {
  const f = await fixture(t, () => {});
  assert.equal((await createKnowledgeService({ knowledgeOrigin: f.origin, timeoutMs: 30 }).explain('aus')).reason.code, 'TIMEOUT');
  const controller = new AbortController();
  const task = createKnowledgeService({ knowledgeOrigin: f.origin }).explain('aus', controller.signal);
  controller.abort(); await assert.rejects(task, { name: 'AbortError' });
});
