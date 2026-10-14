import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fetchCdpJson, waitForWebSocketOpen } from './chrome-cdp.mjs';

async function fixture(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('CDP HTTP metadata request is bounded when DevTools stops responding', async t => {
  const origin = await fixture(t, () => {});
  await assert.rejects(fetchCdpJson(`${origin}/json/version`, 20), error => error?.name === 'TimeoutError');
});

test('CDP HTTP metadata request rejects non-OK responses and parses JSON', async t => {
  const origin = await fixture(t, (req, res) => {
    if (req.url === '/json/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"Browser":"Chrome Fixture"}');
      return;
    }
    res.writeHead(503);
    res.end();
  });
  assert.deepEqual(await fetchCdpJson(`${origin}/json/version`, 500), { Browser: 'Chrome Fixture' });
  await assert.rejects(fetchCdpJson(`${origin}/json/list`, 500), /cdp http 503/);
});

test('CDP WebSocket handshake is bounded and closes a stalled socket', async () => {
  class FakeSocket extends EventTarget {
    closed = false;
    close() { this.closed = true; }
  }
  const socket = new FakeSocket();
  await assert.rejects(waitForWebSocketOpen(socket, 20), /cdp websocket open timeout/);
  assert.equal(socket.closed, true);
});

test('CDP WebSocket handshake resolves on open', async () => {
  const socket = new EventTarget();
  const pending = waitForWebSocketOpen(socket, 500);
  socket.dispatchEvent(new Event('open'));
  await pending;
});
