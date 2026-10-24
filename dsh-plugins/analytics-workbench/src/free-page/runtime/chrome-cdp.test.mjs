import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fetchCdpJson, waitForWebSocketOpen, launchChrome } from './chrome-cdp.mjs';

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

test('failed Chrome initialization terminates its owned process', { skip: process.platform === 'win32' }, async t => {
  for (const mode of ['http-error', 'socket-error', 'ignores-term']) {
    await t.test(mode, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'cdp-launch-failure-'));
      const executable = join(directory, 'chrome.mjs');
      const before = process.env.FREE_PAGE_CHROME;
      let pid;
      try {
        await writeFile(executable, `#!${process.execPath}
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
${mode === 'ignores-term' ? "process.on('SIGTERM', () => {});" : ''}
const server = createServer((_request, response) => {
  response.writeHead(${mode === 'socket-error' ? 200 : 503}, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ webSocketDebuggerUrl: 'invalid-websocket-url' }));
});
server.listen(0, '127.0.0.1', () => {
  writeFileSync(${JSON.stringify(join(directory, 'pid'))}, String(process.pid));
  process.stderr.write('DevTools listening on ws://127.0.0.1:' + server.address().port + '/fixture\\n');
});
`, { mode: 0o700 });
        process.env.FREE_PAGE_CHROME = executable;
        await assert.rejects(launchChrome({ userDataDir: directory }),
          mode === 'socket-error' ? /Invalid URL|invalid URL/ : /cdp http 503/);
        pid = Number(await readFile(join(directory, 'pid'), 'utf8'));
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'failed launch must not leave a child running');
      } finally {
        if (before === undefined) delete process.env.FREE_PAGE_CHROME;
        else process.env.FREE_PAGE_CHROME = before;
        if (!pid) {
          try { pid = Number(await readFile(join(directory, 'pid'), 'utf8')); } catch {}
        }
        if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('Chrome spawn failure preserves the launch error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cdp-spawn-failure-'));
  const before = process.env.FREE_PAGE_CHROME;
  try {
    process.env.FREE_PAGE_CHROME = join(directory, 'missing-chrome');
    await assert.rejects(launchChrome({ userDataDir: directory }), { code: 'ENOENT' });
  } finally {
    if (before === undefined) delete process.env.FREE_PAGE_CHROME;
    else process.env.FREE_PAGE_CHROME = before;
    await rm(directory, { recursive: true, force: true });
  }
});
