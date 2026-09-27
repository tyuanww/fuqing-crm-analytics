import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { authenticateSession, consumeToken, issueToken, redact, tokenExchangeResponse } from './auth-contract.mjs';

const fixture = () => mkdtemp(join(tmpdir(), 'dsh-auth-'));
const web = 'https://app.tyuan.chat';

test('concurrent exchange consumes exactly once and persists after reopening state', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  const token = await issueToken(path, { now: 1000 });
  const options = { origin: web, allowedOrigins: [web], now: 1001 };
  const results = await Promise.allSettled([consumeToken(path, token, options), consumeToken(path, token, options)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected').length, 1);
  const state = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(state.tokens[Object.keys(state.tokens)[0]].consumed, true);
  assert.equal(Object.keys(state.sessions).length, 1);
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_TOKEN_REPLAY|AUTH_RATE_LIMIT/);
});

test('session requires bound Origin and CSRF for a modifying method', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  const token = await issueToken(path, { now: 1000 });
  const result = await consumeToken(path, token, { origin: web, allowedOrigins: [web], now: 1001 });
  const session = result.cookie.match(/^dsh_session=([^;]+)/)[1];
  assert.equal((await authenticateSession(path, session, { origin: web, allowedOrigins: [web], now: 1002 })).authenticated, true);
  await assert.rejects(() => authenticateSession(path, session, { origin: web, allowedOrigins: [web], method: 'POST', now: 1002 }), /AUTH_CSRF_REJECTED/);
  assert.equal((await authenticateSession(path, session, { origin: web, allowedOrigins: [web], method: 'POST', csrf: result.csrf, now: 1002 })).authenticated, true);
  await assert.rejects(() => authenticateSession(path, session, { origin: 'https://foreign.example', allowedOrigins: [web], now: 1002 }), /AUTH_ORIGIN_REJECTED/);
  await assert.rejects(() => authenticateSession(path, session, { origin: web, allowedOrigins: [web], now: 8 * 60 * 60_000 + 1002 }), /AUTH_SESSION_EXPIRED_OR_INVALID/);
});

test('exchange only accepts POST and returns host-only cookies without token reflection', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  const token = await issueToken(path, { now: 1000 });
  const options = { origin: web, allowedOrigins: [web], now: 1001 };
  assert.equal((await tokenExchangeResponse(path, token, { ...options, method: 'GET' })).status, 405);
  const response = await tokenExchangeResponse(path, token, { ...options, method: 'POST' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, '/');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['set-cookie'][0], /HttpOnly; SameSite=Lax; Secure/);
  assert.doesNotMatch(response.headers['set-cookie'].join(';'), /Domain=/);
  assert.doesNotMatch(JSON.stringify(response), new RegExp(token));
  assert.equal((await tokenExchangeResponse(path, token, { ...options, method: 'POST' })).status, 401);
});

test('loopback cookie may omit Secure; non-loopback insecure cookie is rejected', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  const origin = 'http://127.0.0.1:6678';
  const token = await issueToken(path, { now: 1000 });
  const response = await tokenExchangeResponse(path, token, { method: 'POST', origin, allowedOrigins: [origin], secure: false, now: 1001 });
  assert.equal(response.status, 303);
  assert.doesNotMatch(response.headers['set-cookie'][0], /; Secure/);
  const second = await issueToken(path, { now: 2000 });
  await assert.rejects(() => consumeToken(path, second, { origin: web, allowedOrigins: [web], secure: false, now: 2001 }), /AUTH_INSECURE_COOKIE_REJECTED/);
});

test('expired and repeated invalid exchanges are rejected without secret logging', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  const token = await issueToken(path, { ttlSeconds: 1, now: 1000 });
  const options = { origin: web, allowedOrigins: [web], maxAttempts: 2, now: 3000 };
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_TOKEN_EXPIRED_OR_INVALID/);
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_TOKEN_EXPIRED_OR_INVALID/);
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_RATE_LIMIT/);
  assert.deepEqual(redact({ url: `/auth?token=${token}`, authorization: token, message: `Bearer ${token}` }), { url: '/auth?token=[REDACTED]', authorization: '[REDACTED]', message: 'Bearer [REDACTED]' });
  assert.doesNotMatch(await readFile(path, 'utf8'), new RegExp(token));
});

test('foreign-origin attempts are rate-limited before origin rejection', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json'); const token = await issueToken(path, { now: 1000 });
  const options = { origin: 'https://foreign.example', allowedOrigins: [web], maxAttempts: 2, now: 1001 };
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_ORIGIN_REJECTED/);
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_ORIGIN_REJECTED/);
  await assert.rejects(() => consumeToken(path, token, options), /AUTH_RATE_LIMIT/);
});

test('auth state prunes expired tokens and bounds origin rate buckets', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  const tokens = {}; const rate_limits = {};
  for (let index = 0; index < 1100; index += 1) rate_limits[String(index).padStart(64, '0')] = { started_at: index, count: 1 };
  tokens.dead = { expires_at: 1, consumed: false };
  await writeFile(path, JSON.stringify({ schema_version: 'one-time-token/v1', tokens, rate_limits }));
  const token = await issueToken(path, { now: 10_000 });
  await consumeToken(path, token, { origin: web, allowedOrigins: [web], now: 10_000 });
  const state = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(state.tokens.dead, undefined);
  assert.ok(Object.keys(state.rate_limits).length <= 1024);
});

test('auth state prunes expired sessions before enforcing the session cap', async () => {
  const dir = await fixture(); const path = join(dir, 'tokens.json');
  await writeFile(path, JSON.stringify({ schema_version: 'one-time-token/v1', tokens: {}, rate_limits: {}, sessions: { expired: { expires_at: 1 } } }));
  const token = await issueToken(path, { now: 10_000 });
  const result = await consumeToken(path, token, { origin: web, allowedOrigins: [web], now: 10_000 });
  assert.equal(result.authenticated, true);
  const state = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(state.sessions.expired, undefined);
  assert.equal(Object.keys(state.sessions).length, 1);
});
