/** Disposable loopback model fault. Holds exactly one request until its client dies. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request } from 'node:http';

export async function startRecoveryModelGate(target) {
  const url = new URL(target);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/');
  let armed = false, pending = false, observed = false, closed = false;
  const downstream = new Set();
  const server = createServer((req, res) => {
    if (armed) {
      armed = false; pending = true; observed = true;
      req.resume();
      res.once('close', () => { pending = false; });
      return;
    }
    const proxy = request({ hostname: '127.0.0.1', port: url.port, path: req.url,
      method: req.method, headers: req.headers, timeout: 15000 }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
      upstream.once('error', () => res.destroy());
    });
    downstream.add(proxy);
    proxy.once('close', () => downstream.delete(proxy));
    proxy.once('timeout', () => proxy.destroy());
    proxy.once('error', () => res.destroy());
    res.once('close', () => proxy.destroy());
    req.pipe(proxy);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  return {
    baseURL: `http://127.0.0.1:${server.address().port}`,
    arm() { assert.ok(!armed && !pending && !closed, 'RECOVERY_GATE_BUSY'); armed = true; observed = false; },
    get observed() { return observed; },
    get pending() { return pending; },
    async close() {
      if (closed) return; closed = true;
      for (const proxy of downstream) proxy.destroy();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
