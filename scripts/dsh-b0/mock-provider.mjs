/** Test-provider adapter, not a business/runtime adapter. The pinned official
 * mock repeats one tool-call ID for every request. Namespace wire IDs per HTTP
 * request so consecutive native turns obey the session-wide identity contract.
 * 0.1.7 speaks Messages (`content_block` tool_use). Older chat-completion
 * deltas stay namespaced too. No result, argument, prompt, outcome, retry,
 * or DSH source is rewritten.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

function namespacedId(requestNumber, id) {
  return `b0-request-${requestNumber}:${id}`;
}

export function namespaceToolCallLine(line, requestNumber) {
  if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') return line;
  const value = JSON.parse(line.slice(5));
  let changed = false;
  for (const choice of value.choices ?? []) {
    for (const tool of choice.delta?.tool_calls ?? []) {
      if (typeof tool.id === 'string' && tool.id.length) {
        tool.id = namespacedId(requestNumber, tool.id);
        changed = true;
      }
    }
  }
  const block = value.content_block;
  if (value.type === 'content_block_start' && block?.type === 'tool_use'
    && typeof block.id === 'string' && block.id.length) {
    block.id = namespacedId(requestNumber, block.id);
    changed = true;
  }
  return changed ? `data: ${JSON.stringify(value)}` : line;
}

function acceptedMockPath(url) {
  const path = new URL(url ?? '/', 'http://127.0.0.1').pathname;
  return path === '/v1/chat/completions' || path === '/chat/completions' || path.endsWith('/v1/messages');
}

function forwardedHeaders(req) {
  const headers = { 'content-type': 'application/json' };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers['x-api-key']) headers['x-api-key'] = req.headers['x-api-key'];
  if (req.headers['anthropic-version']) headers['anthropic-version'] = req.headers['anthropic-version'];
  return headers;
}

export async function startB0MockProvider(startOfficial, options) {
  const { script, ...defaults } = options;
  if (script) assert.ok(Array.isArray(script) && script.length > 0 && script.length <= 16);
  const officials = [];
  try {
    for (const step of script ?? [{}]) {
      const official = await startOfficial({ ...defaults, ...step, host: '127.0.0.1', port: 0 });
      officials.push(official);
      assert.equal(new URL(official.baseURL).hostname, '127.0.0.1');
    }
  } catch (error) { await Promise.all(officials.map(handle => handle.close())); throw error; }
  let requestNumber = 0;
  const inflight = new Set();
  const server = createServer((req, res) => {
    const abort = new AbortController();
    inflight.add(abort);
    res.once('close', () => { if (!res.writableFinished) abort.abort(); });
    void (async () => {
      if (req.method !== 'POST' || !acceptedMockPath(req.url)) {
        res.writeHead(404).end(); return;
      }
      const requestId = ++requestNumber;
      const official = officials[script ? requestId - 1 : 0];
      if (!official) {
        res.writeHead(409, { 'content-type': 'application/json' }).end('{"error":"B0 fixture script exhausted"}');
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        assert.ok(size <= 2 * 1024 * 1024, 'B0 fixture request too large');
        chunks.push(chunk);
      }
      const response = await fetch(`${official.baseURL}${req.url}`, {
        method: 'POST', headers: forwardedHeaders(req),
        body: Buffer.concat(chunks), signal: abort.signal, redirect: 'error',
      });
      const type = response.headers.get('content-type') ?? 'application/octet-stream';
      res.writeHead(response.status, { 'content-type': type, 'cache-control': 'no-store' });
      if (!type.startsWith('text/event-stream')) { res.end(await response.text()); return; }
      const decoder = new TextDecoder();
      let pending = '';
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        assert.ok(pending.length <= 262144, 'B0 fixture SSE frame too large');
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          const writable = res.write(namespaceToolCallLine(line, requestId) + '\n');
          if (!writable) await once(res, 'drain', { signal: abort.signal });
        }
      }
      pending += decoder.decode();
      if (pending) res.write(namespaceToolCallLine(pending, requestId));
      res.end();
    })().catch(() => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }).end('{"error":"B0 fixture transport failed"}');
      else res.destroy();
    }).finally(() => inflight.delete(abort));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
  } catch (error) { await Promise.all(officials.map(handle => handle.close())); throw error; }
  return {
    baseURL: `http://127.0.0.1:${server.address().port}`,
    get requests() { return officials.flatMap(handle => handle.requests); },
    async close() {
      for (const abort of inflight) abort.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await Promise.all(officials.map(handle => handle.close()));
    },
  };
}
