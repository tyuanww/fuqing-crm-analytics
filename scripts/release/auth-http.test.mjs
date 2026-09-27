import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { issueToken } from './auth-contract.mjs';
import { assertLoopbackHost, startAuthServer } from './auth-http.mjs';

const fixture = () => mkdtemp(join(tmpdir(), 'dsh-auth-http-'));
const readSetCookies = (response) => response.headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

test('HTTP adapter binds one-time exchange, host-only cookies and CSRF to origin', async () => {
  const root = await fixture(); const statePath = join(root, 'auth.json'); const actualOrigin = 'http://127.0.0.1:4325';
  const server = await startAuthServer({ statePath, allowedOrigins: [actualOrigin], secure: false });
  try {
    const port = server.address().port;
    const token = await issueToken(statePath);
    const exchange = await fetch(`http://127.0.0.1:${port}/auth/exchange?token=${token}`, { method: 'POST', headers: { origin: actualOrigin }, redirect: 'manual' });
    assert.equal(exchange.status, 400);
    const response = await fetch(`http://127.0.0.1:${port}/auth/exchange`, { method: 'POST', headers: { origin: actualOrigin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), redirect: 'manual' });
    assert.equal(response.status, 303);
    const setCookies = readSetCookies(response);
    assert.equal(setCookies.length, 2);
    assert.match(setCookies[0], /HttpOnly/); assert.doesNotMatch(setCookies[0], /Domain=/); assert.doesNotMatch(response.headers.get('location'), /token/i);
    const session = setCookies.find((value) => value.startsWith('dsh_session='));
    const csrf = setCookies.find((value) => value.startsWith('dsh_csrf='));
    const cookie = [session, csrf].map((value) => value.split(';', 1)[0]).join('; ');
    const mutate = await fetch(`http://127.0.0.1:${port}/api/mutate`, { method: 'POST', headers: { origin: actualOrigin, cookie, 'x-csrf-token': csrf.split('=', 2)[1].split(';')[0] } });
    assert.equal(mutate.status, 200);
    const bad = await fetch(`http://127.0.0.1:${port}/api/mutate`, { method: 'POST', headers: { origin: actualOrigin, cookie } });
    assert.equal(bad.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP adapter forwards authenticated browser requests to an isolated backend', async () => {
  const root = await fixture(); const statePath = join(root, 'auth.json'); const actualOrigin = 'http://127.0.0.1:4325';
  const upstream = createServer((request, response) => {
    if (request.headers.authorization !== 'Bearer backend-fixture-token') { response.writeHead(401); response.end('unauthorized'); return; }
    const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => { response.writeHead(201, { 'content-type': 'application/json' }); response.end(JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString() })); });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const server = await startAuthServer({ statePath, allowedOrigins: [actualOrigin], secure: false, upstreamBase, upstreamToken: 'backend-fixture-token' });
  try {
    const port = server.address().port; const token = await issueToken(statePath);
    const response = await fetch(`http://127.0.0.1:${port}/auth/exchange`, { method: 'POST', headers: { origin: actualOrigin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), redirect: 'manual' });
    const setCookies = readSetCookies(response); const session = setCookies.find(value => value.startsWith('dsh_session=')); const csrf = setCookies.find(value => value.startsWith('dsh_csrf='));
    const cookie = [session, csrf].map(value => value.split(';', 1)[0]).join('; ');
    const forwarded = await fetch(`http://127.0.0.1:${port}/api/v1/fixture`, { method: 'PUT', headers: { origin: actualOrigin, cookie, 'x-csrf-token': csrf.split('=', 2)[1].split(';')[0], 'content-type': 'application/json' }, body: JSON.stringify({ fixture: true }) });
    assert.equal(forwarded.status, 201); assert.deepEqual(await forwarded.json(), { method: 'PUT', body: JSON.stringify({ fixture: true }) });
    const denied = await fetch(`http://127.0.0.1:${port}/api/v1/fixture`, { method: 'PUT', headers: { origin: actualOrigin, cookie, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});

test('auth HTTP adapter rejects non-loopback binding intent', async () => {
  assert.equal(assertLoopbackHost('127.0.0.1'), '127.0.0.1');
  assert.throws(() => assertLoopbackHost('0.0.0.0'), /AUTH_SERVER_NON_LOOPBACK/);
  await assert.rejects(() => startAuthServer({ host: '0.0.0.0', statePath: '/tmp/never-used' }), /AUTH_SERVER_NON_LOOPBACK/);
});
