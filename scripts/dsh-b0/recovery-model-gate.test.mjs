import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startRecoveryModelGate } from './recovery-model-gate.mjs';

test('owned fault holds only the armed request, observes disconnect, and preserves next payload', async () => {
  const bodies = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    bodies.push(body); res.writeHead(200, { 'content-type': 'text/event-stream' }).end('data: ' + body + '\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const gate = await startRecoveryModelGate(`http://127.0.0.1:${server.address().port}`);
  try {
    const abort = new AbortController(); gate.arm();
    const pending = fetch(gate.baseURL + '/v1/messages', { method: 'POST', body: 'held', signal: abort.signal }).catch(() => null);
    const deadline = Date.now() + 3000;
    while (!gate.observed) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.ok(gate.pending); assert.throws(() => gate.arm(), /BUSY/); assert.deepEqual(bodies, []);
    abort.abort(); await pending;
    while (gate.pending) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.equal(await (await fetch(gate.baseURL + '/v1/messages', { method: 'POST', body: 'unchanged' })).text(), 'data: unchanged\n');
    assert.deepEqual(bodies, ['unchanged']);
  } finally { await gate.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('fault proxy rejects non-loopback targets', async () => {
  await assert.rejects(startRecoveryModelGate('https://example.com'));
  await assert.rejects(startRecoveryModelGate('http://localhost:1234'));
});
