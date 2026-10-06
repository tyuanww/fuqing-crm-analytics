import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstPurchaseRelay } from '../src/first-purchase-relay.mjs';
import { createDashboardAccess, CRM_UI_PATH } from '../src/dashboard-access.mjs';
import { serveDashboard, SYNTHETIC_TOKEN, SYNTHETIC_PASSWORD } from './dashboard.fixture.mjs';
const ui = 'http://127.0.0.1:43299';
const browser = (operation, fields = {}) => new Request(ui + CRM_UI_PATH, { method: 'POST', headers: { origin: ui, 'content-type': 'application/json', 'x-crm-ui': '1' }, body: JSON.stringify({ operation, session_id: 'fixture-session', ...fields }) });
test('finite relay uses login grant without exporting it; disconnect revokes outstanding lease', async t => {
  const server = await serveDashboard(t, (url, req, res) => {
    if (!url.pathname.includes('/save-')) return false;
    assert.equal(req.headers['idempotency-key'], 'fixture-key'); res.end('{"status":"fixture"}'); return true;
  });
  const access = createDashboardAccess({ baseUrl: server.binding.baseUrl, firstPurchaseOrigin: server.binding.baseUrl, browserOrigin: ui, hasSession: () => true }); t.after(access.dispose);
  assert.equal(access.firstPurchaseService.authorize('fixture-session'), null);
  assert.equal((await access.browser(browser('login', { username: 'fixture-user', password: SYNTHETIC_PASSWORD }))).status, 200);
  const lease = access.firstPurchaseService.authorize('fixture-session'); assert.ok(lease);
  assert.ok(!JSON.stringify(lease).includes(SYNTHETIC_TOKEN)); assert.ok(!('token' in lease));
  assert.deepEqual(await lease.request('inspect', {}, 'fixture-key'), { status: 200, payload: { status: 'fixture' } });
  await access.browser(browser('disconnect')); assert.equal(lease.isCurrent(), false); assert.equal(lease.signal.aborted, true);
  await assert.rejects(lease.request('save', {}, 'fixture-key'));
});
test('relay denies redirects, token echo, size overflow, arbitrary operation and pre-aborted calls', async t => {
  let mode = 'echo'; const server = await serveDashboard(t, (_url, _req, res) => {
    if (mode === 'redirect') { res.statusCode = 302; res.setHeader('location', 'https://example.invalid'); res.end('{}'); }
    else res.end(mode === 'echo' ? JSON.stringify({ token: SYNTHETIC_TOKEN }) : JSON.stringify({ data: 'x'.repeat(512 * 1024) }));
    return true;
  });
  const relay = createFirstPurchaseRelay(server.binding.baseUrl);
  for (const value of ['echo', 'large', 'redirect']) { mode = value; await assert.rejects(relay.request('save', {}, 'key', SYNTHETIC_TOKEN)); }
  await assert.rejects(relay.request('login', {}, 'key', SYNTHETIC_TOKEN));
  await assert.rejects(relay.request('save', {}, 'key', SYNTHETIC_TOKEN, AbortSignal.abort()));
  assert.throws(() => createFirstPurchaseRelay('https://example.invalid'));
  assert.equal(createFirstPurchaseRelay().configured, false);
});
test('escaped credential echoes are rejected before reaching another plugin', async t => {
  const encoded = [...SYNTHETIC_TOKEN].map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const server = await serveDashboard(t, (_url, _req, res) => { res.end('{"echo":"' + encoded + '"}'); return true; });
  const relay = createFirstPurchaseRelay(server.binding.baseUrl);
  await assert.rejects(relay.request('inspect', {}, 'key', SYNTHETIC_TOKEN));
});
