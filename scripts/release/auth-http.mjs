import { createServer } from 'node:http';
import { authenticateSession, tokenExchangeResponse } from './auth-contract.mjs';
import { corsHeaders, pageGuard } from './page-policy.mjs';

function cookies(value = '') {
  return Object.fromEntries(value.split(';').map((part) => part.trim().split('='))
    .filter(([key, item]) => key && item).map(([key, item]) => [key, item]));
}

function send(response, result) {
  response.writeHead(result.status, result.headers ?? {});
  response.end(result.body ?? '');
}

async function requestBody(request, limit = 1024 * 1024) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('AUTH_BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function exchangeToken(request) {
  if (request.method !== 'POST') return null;
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(String(request.headers['content-type'] ?? ''))) return null;
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 512) throw new Error('AUTH_BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if (form.getAll('token').length !== 1) return null;
  return form.get('token');
}

/** Minimal host adapter for the auth contract; callers own the listener. */
function createAuthServer({ statePath, allowedOrigins = [], secure = true, upstreamBase = null, upstreamToken = null } = {}) {
  if (typeof statePath !== 'string' || !statePath) throw new Error('AUTH_STATE_PATH_REQUIRED');
  let upstream = null;
  if (upstreamBase !== null) {
    if (typeof upstreamBase !== 'string' || !upstreamBase || typeof upstreamToken !== 'string' || !upstreamToken) throw new Error('AUTH_UPSTREAM_CONFIG_INVALID');
    upstream = new URL(upstreamBase);
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw new Error('AUTH_UPSTREAM_URL_INVALID');
  }
  return createServer(async (request, response) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/auth/exchange') {
      // Tokens are accepted only in a bounded POST body, never in a URL that
      // browser history, referrers, proxies or access logs can retain.
      if (url.search) {
        send(response, { status: 400, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: 'Bad Request' });
        return;
      }
      let token;
      try { token = await exchangeToken(request); } catch {
        send(response, { status: 400, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: 'Bad Request' });
        return;
      }
      const result = await tokenExchangeResponse(statePath, token, {
        method: request.method,
        origin,
        allowedOrigins,
        rateKey: request.socket.remoteAddress ?? 'unknown-client',
        secure,
      });
      const headers = { ...result.headers, ...corsHeaders(origin), vary: 'Origin' };
      send(response, { ...result, headers });
      return;
    }
    const guard = pageGuard({ origin, method: request.method, authenticated: false });
    if (upstream && url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') { send(response, { status: 204, headers: corsHeaders(origin) }); return; }
      const session = cookies(request.headers.cookie).dsh_session;
      const csrf = request.headers['x-csrf-token'];
      try { await authenticateSession(statePath, session, { origin, allowedOrigins, method: request.method, csrf }); }
      catch { send(response, { status: 403, headers: { ...corsHeaders(origin), 'cache-control': 'no-store' }, body: 'Forbidden' }); return; }
      let body;
      try { body = ['GET', 'HEAD'].includes(request.method) ? undefined : await requestBody(request); }
      catch { send(response, { status: 413, headers: { ...corsHeaders(origin), 'cache-control': 'no-store' }, body: 'Payload Too Large' }); return; }
      try {
        const target = new URL(`${url.pathname}${url.search}`, upstream);
        const headers = { authorization: `Bearer ${upstreamToken}` };
        if (request.headers['content-type']) headers['content-type'] = request.headers['content-type'];
        const forwarded = await fetch(target, { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
        const forwardedBody = Buffer.from(await forwarded.arrayBuffer());
        const responseHeaders = { ...corsHeaders(origin), 'cache-control': 'no-store', 'content-type': forwarded.headers.get('content-type') ?? 'application/json' };
        send(response, { status: forwarded.status, headers: responseHeaders, body: forwardedBody });
      } catch { send(response, { status: 502, headers: { ...corsHeaders(origin), 'cache-control': 'no-store' }, body: 'Bad Gateway' }); }
      return;
    }
    if (url.pathname === '/api/mutate' && request.method === 'POST') {
      const session = cookies(request.headers.cookie).dsh_session;
      const csrf = request.headers['x-csrf-token'];
      try {
        await authenticateSession(statePath, session, { origin, allowedOrigins, method: request.method, csrf });
        send(response, { status: 200, headers: { ...guard.headers, 'cache-control': 'no-store' }, body: JSON.stringify({ status: 'PASS' }) });
      } catch { send(response, { status: 403, headers: guard.headers, body: 'Forbidden' }); }
      return;
    }
    send(response, { status: guard.status, headers: guard.headers, body: guard.reason ?? '' });
  });
}

export function assertLoopbackHost(host) {
  if (!/^127\.0\.0\.1$|^localhost$/.test(host)) throw new Error('AUTH_SERVER_NON_LOOPBACK');
  return host;
}

export async function startAuthServer({ host = '127.0.0.1', port = 0, ...options } = {}) {
  assertLoopbackHost(host);
  const server = createAuthServer(options);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
    return server;
  } catch (error) {
    server.close();
    throw error;
  }
}
