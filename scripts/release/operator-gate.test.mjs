import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { verifyOperatorGate, evaluateSli } from './operator-gate.mjs';
import { runBackpressure } from './backpressure.mjs';

test('operator gate needs matching identity and a real forbidden response', async () => {
  const releaseTag = 'dsh-operator-fixture'; const sourceSha = 'a'.repeat(40);
  const server = createServer((req, res) => {
    if (req.url === '/operator' && req.headers['x-synthetic-operator'] === 'yes') {
      res.writeHead(200, { 'x-release-tag': releaseTag, 'x-source-sha': sourceSha }); res.end('ok'); return;
    }
    res.writeHead(403); res.end('forbidden');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const result = await verifyOperatorGate({ method: 'tailscale-acl', positiveUrl: base + '/operator', negativeUrl: base + '/operator', operatorHeaders: { 'x-synthetic-operator': 'yes' }, releaseTag, sourceSha });
    assert.equal(result.status, 'PASS');
    assert.equal(result.negative_probe.code, 403);
    const wrong = await verifyOperatorGate({ method: 'tailscale-acl', positiveUrl: base + '/operator', negativeUrl: base + '/operator', operatorHeaders: { 'x-synthetic-operator': 'yes' }, releaseTag, sourceSha: 'b'.repeat(40) });
    assert.equal(wrong.status, 'FAIL');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('operator none stays PARTIAL, SLI needs 15 minutes and scheduler is not HTTP evidence', async () => {
  assert.equal((await verifyOperatorGate({ method: 'none' })).status, 'PARTIAL');
  assert.equal(evaluateSli([{ observed_at: 0, latency_ms: 1 }]).status, 'NOT_RUN');
  const result = await runBackpressure({ requests: 100, concurrency: 10, synthetic: true, task: async () => ({ status: 200 }) });
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidence_scope, 'synthetic-scheduler');
  assert.equal(result.peak, 10);
  assert.equal(result.results.length, 100);
  const live = await runBackpressure({ requests: 10, concurrency: 2, task: async () => ({ status: 200 }) });
  assert.equal(live.status, 'NOT_RUN');
  assert.equal(live.evidence_scope, 'real-http-required');
});
