import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardAccess, CRM_UI_PATH } from '../src/dashboard-access.mjs';
import { request, serveDashboard, SYNTHETIC_PASSWORD, SYNTHETIC_TOKEN } from './dashboard.fixture.mjs';

const uiOrigin = 'http://127.0.0.1:43299';
const login = { operation: 'login', session_id: 'fixture-session', username: 'fixture-user', password: SYNTHETIC_PASSWORD };
function browserRequest(input, overrides = {}) {
  return new Request(uiOrigin + CRM_UI_PATH, { method: 'POST', headers: { origin: uiOrigin, 'x-crm-ui': '1', 'content-type': 'application/json' }, body: JSON.stringify(input), ...overrides });
}
async function setup(t, custom, options = {}) {
  const fixture = await serveDashboard(t, custom);
  const sessions = new Set(['fixture-session', 'other']);
  const access = createDashboardAccess({ baseUrl: fixture.binding.baseUrl, browserOrigin: uiOrigin, dataKind: 'synthetic', hasSession: id => sessions.has(id), ...options });
  t.after(() => access.dispose());
  const call = input => access.browser(browserRequest(input)).then(response => response.json());
  return { fixture, sessions, access, call };
}
const status = { operation: 'status', session_id: 'fixture-session' };
const disconnect = { operation: 'disconnect', session_id: 'fixture-session' };
function noSecret(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(SYNTHETIC_PASSWORD), false);
  assert.equal(text.includes(SYNTHETIC_TOKEN), false);
}

test('login stores credentials only in host closure; per-session queries and disconnect work', async t => {
  const { access, call, fixture } = await setup(t);
  assert.equal((await call(status)).connected, false);
  const connected = await call(login); assert.equal(connected.connected, true); noSecret(connected);
  assert.equal((await call({ ...status, session_id: 'other' })).connected, false);
  assert.equal((await access.service.query('other', request)).reason.code, 'NOT_CONNECTED');
  const result = await access.service.query('fixture-session', request);
  assert.equal(result.status, 'OK'); assert.equal(result.gsv.amount_fen, 10031); noSecret(result);
  noSecret(access.service.capabilities('fixture-session'));
  assert.equal((await call(login)).code, 'ALREADY_CONNECTED');
  assert.equal((await call(disconnect)).connected, false);
  assert.equal((await access.service.query('fixture-session', request)).reason.code, 'NOT_CONNECTED');
  assert.equal(fixture.calls.some(call => call.path.endsWith('/logout')), false);
});

test('bad credentials and malformed login replies never create a grant', async t => {
  await t.test('wrong password', async t => {
    const { call } = await setup(t);
    const result = await call({ ...login, password: 'wrong' }); assert.equal(result.code, 'LOGIN_FAILED'); noSecret(result);
    assert.equal((await call(status)).connected, false);
  });
  for (const [name, response, code] of [
    ['bad-token', { username: login.username, token: 'short' }, 'SERVICE_UNAVAILABLE'],
    ['other-user', { username: 'other-user', token: SYNTHETIC_TOKEN }, 'SERVICE_UNAVAILABLE'],
    ['reflected', { message: SYNTHETIC_PASSWORD }, 'SERVICE_UNAVAILABLE'],
  ]) await t.test(name, async t => {
    const { call } = await setup(t, (_url, _req, res) => { res.end(JSON.stringify(response)); return true; });
    const result = await call(login); assert.equal(result.code, code); noSecret(result);
    assert.equal((await call(status)).connected, false);
  });
});

test('untrusted, arbitrary connection fields and oversized bodies stop before login', async t => {
  const { access, call, fixture } = await setup(t);
  for (const input of [
    { ...login, baseUrl: 'http://example.com' }, { ...login, token: SYNTHETIC_TOKEN },
    { ...login, session_id: '../outside' }, { ...login, password: 'x'.repeat(9000) },
    { ...login, password: '中'.repeat(25) }, { ...login, username: 'bad user' },
    { ...status, password: SYNTHETIC_PASSWORD }, { ...login, operation: 'http' },
  ]) { const result = await call(input); assert.equal(result.ok, false); noSecret(result); }
  assert.equal((await call({ ...login, session_id: 'not-live' })).code, 'SESSION_UNAVAILABLE');
  for (const headers of [{}, { origin: 'https://example.com', 'x-crm-ui': '1', 'content-type': 'application/json' }]) {
    assert.equal((await access.browser(browserRequest(login, { headers }))).status, 403);
  }
  assert.equal(fixture.calls.length, 0);
});

test('expiry and session removal remove grants without upstream logout', async t => {
  let now = Date.now();
  const { access, call, sessions } = await setup(t, undefined, { now: () => now, ttlMs: 1000 });
  assert.equal((await call(login)).connected, true);
  now += 1001;
  assert.equal((await access.service.query('fixture-session', request)).reason.code, 'NOT_CONNECTED');
  assert.equal((await call(login)).connected, true);
  sessions.delete('fixture-session');
  assert.equal(access.service.capabilities('fixture-session').connection_state, 'NOT_CONNECTED');
  assert.equal((await call(status)).code, 'SESSION_UNAVAILABLE');
});

test('a late login response cannot resurrect a disconnected session', async t => {
  let started; const seen = new Promise(resolve => { started = resolve; });
  const { access, call } = await setup(t, (url, _req, res) => {
    if (!url.pathname.endsWith('/login')) return false;
    started(res); return true;
  });
  const pending = access.browser(browserRequest(login));
  const response = await seen;
  assert.equal((await call(disconnect)).connected, false);
  response.end(JSON.stringify({ username: login.username, token: SYNTHETIC_TOKEN }));
  assert.equal((await (await pending).json()).code, 'CANCELLED');
  assert.equal((await call(status)).connected, false);
});

test('disconnect fences an in-flight result and a new login survives the stale request', async t => {
  let started; const seen = new Promise(resolve => { started = resolve; });
  const { access, call } = await setup(t, (url, _req, res) => {
    if (!url.pathname.endsWith('/trend')) return false;
    started(res); return true;
  });
  assert.equal((await call(login)).connected, true);
  const pending = access.service.query('fixture-session', request);
  await seen;
  assert.equal((await call(disconnect)).connected, false);
  assert.equal((await call(login)).connected, true);
  const old = await pending;
  assert.equal(old.status, 'UNAVAILABLE'); assert.equal('gsv' in old, false);
  assert.equal((await call(status)).connected, true);
});

test('upstream login expiry clears the stored grant', async t => {
  const { access, call } = await setup(t, (url, _req, res) => {
    if (url.pathname.endsWith('/login')) return false;
    res.statusCode = 401; res.end('{}'); return true;
  });
  assert.equal((await call(login)).connected, true);
  assert.equal((await access.service.query('fixture-session', request)).reason.code, 'AUTH_EXPIRED');
  assert.equal((await call(status)).connected, false);
});

test('a disposed or new host does not retain any authorization', async t => {
  const { access, call, fixture } = await setup(t);
  assert.equal((await call(login)).connected, true); access.dispose();
  assert.equal((await access.service.query('fixture-session', request)).reason.code, 'NOT_CONNECTED');
  const fresh = createDashboardAccess({ baseUrl: fixture.binding.baseUrl, browserOrigin: uiOrigin, hasSession: () => true }); t.after(() => fresh.dispose());
  assert.equal(fresh.service.capabilities('fixture-session').connection_state, 'NOT_CONNECTED');
});
