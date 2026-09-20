import test from 'node:test';
import assert from 'node:assert/strict';
import { crmAssetRequest, projectSnapshot } from '../src/crm-assets.mjs';
import { createDashboardAccess, CRM_ASSETS_UI_PATH, CRM_UI_PATH } from '../src/dashboard-access.mjs';
import { library, snapshot, analysis, reference, serveAssets } from './crm-assets.fixture.mjs';
import { SYNTHETIC_PASSWORD } from './dashboard.fixture.mjs';

test('Python-generated snapshot, saved analysis and cockpit refs pass the actual HTTP consumer', async t => {
  const fixture = await serveAssets(t);
  const options = { binding: fixture.binding, sessionId: 'fixture-session' };
  for (const [input, expected] of [
    [{ operation: 'capture', filters: snapshot.result.filters, key: 'query-1' }, snapshot],
    [{ operation: 'library' }, library],
    [{ operation: 'save', snapshot_id: snapshot.snapshot_id, title: analysis.title, key: 'save-1' }, analysis],
    [{ operation: 'pin', analysis_id: analysis.analysis_id, key: 'pin-1' }, reference],
  ]) {
    const value = await crmAssetRequest(input, options);
    assert.deepEqual(value, { ok: true, value: expected });
  }
  assert.deepEqual(fixture.writes[1], { body: { snapshot_id: snapshot.snapshot_id, title: analysis.title }, key: 'save-1' });
  assert.deepEqual(fixture.writes[2], { body: { analysis_id: analysis.analysis_id }, key: 'pin-1' });
  assert.ok(fixture.calls.every(call => call.authenticated));
  assert.equal(fixture.calls.filter(call => call.path.endsWith('/auth/me')).length, 4);
});

test('facts, owners, B0 IDs, forged provenance and checksums fail closed', async t => {
  const fixture = await serveAssets(t);
  const options = { binding: fixture.binding, sessionId: 'fixture-session' };
  for (const input of [
    { operation: 'save', snapshot_id: snapshot.snapshot_id, title: analysis.title, key: 's', facts: { gsv: 9 } },
    { operation: 'library', owner: 'other-user' }, { operation: 'pin', analysis_id: 'b0-analysis', key: 'p' },
    { operation: 'capture', filters: { ...snapshot.result.filters, source_id: 'synthetic-b0' }, key: 'q' },
    { operation: 'save', snapshot_id: snapshot.snapshot_id, title: analysis.title, key: 'bad key' },
  ]) assert.equal((await crmAssetRequest(input, options)).code, 'INVALID_REQUEST');
  assert.equal(fixture.calls.length, 0);
  for (const change of [v => { v.result.gsv_amount_fen++; }, v => { v.data_kind = 'real'; }, v => { v.result_sha256 = '0'.repeat(64); },
    v => { v.result.filters.channel = '直播'; }, v => { v.schema_version = 'analytics-b0/v1'; }]) {
    const value = structuredClone(snapshot); change(value);
    assert.throws(() => projectSnapshot(value, 'synthetic'));
  }
  const withSecrets = { ...snapshot, token: 'should-not-leak', owner: 'not-public' };
  assert.deepEqual(projectSnapshot(withSecrets, 'synthetic'), snapshot);
});

test('expiry, account mismatch, missing configuration and raw errors do not leak or fall back', async t => {
  for (const [status, body, expected, onAuth] of [
    [401, {}, 'AUTH_EXPIRED', true], [200, { username: 'other' }, 'ACCOUNT_MISMATCH', true],
    [503, { detail: { code: 'STATE_NOT_CONFIGURED', message: 'secret' } }, 'STATE_NOT_CONFIGURED', false],
    [500, { secret: 'internal trace' }, 'SERVICE_UNAVAILABLE', false],
  ]) {
    const fixture = await serveAssets(t, (url, _req, res) => {
      if (url.pathname.endsWith(onAuth ? '/auth/me' : '/crm-library')) { res.statusCode = status; res.end(JSON.stringify(body)); return true; }
      return false;
    });
    const result = await crmAssetRequest({ operation: 'library' }, { binding: fixture.binding, sessionId: 'fixture-session' });
    assert.equal(result.code, expected); assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.ok(fixture.calls.every(call => ['/api/v1/auth/me', '/api/v1/metrics/crm-library'].includes(call.path)));
  }
});

test('host browser writes require origin, current session grant and exact operation fields', async t => {
  const fixture = await serveAssets(t);
  const origin = 'http://127.0.0.1:43199'; let active = true;
  const access = createDashboardAccess({ baseUrl: fixture.binding.baseUrl, browserOrigin: origin, dataKind: 'synthetic', hasSession: id => active && id === 'fixture-session' });
  t.after(() => access.dispose());
  const request = (path, body, headers = {}) => access.browser(new Request(origin + path, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'x-crm-ui': '1', ...headers },
    body: JSON.stringify({ session_id: 'fixture-session', ...body }) }));
  assert.equal((await (await request(CRM_ASSETS_UI_PATH, { operation: 'library' })).json()).code, 'NOT_CONNECTED');
  await request(CRM_UI_PATH, { operation: 'login', username: 'fixture-user', password: SYNTHETIC_PASSWORD });
  const save = { operation: 'save', snapshot_id: snapshot.snapshot_id, title: analysis.title, key: 'save-ui' };
  for (const headers of [{ origin: 'https://evil.invalid' }, { 'x-crm-ui': '' }]) assert.equal((await request(CRM_ASSETS_UI_PATH, save, headers)).status, 403);
  assert.equal((await (await request(CRM_ASSETS_UI_PATH, { ...save, owner: 'bob' })).json()).code, 'INVALID_REQUEST');
  assert.equal((await request(CRM_ASSETS_UI_PATH, { operation: 'capture', filters: snapshot.result.filters, key: 'q' })).status, 400);
  assert.deepEqual((await (await request(CRM_ASSETS_UI_PATH, save)).json()).value, analysis);
  await request(CRM_UI_PATH, { operation: 'disconnect' });
  assert.equal((await (await request(CRM_ASSETS_UI_PATH, save)).json()).code, 'NOT_CONNECTED');
  active = false;
  assert.equal((await request(CRM_ASSETS_UI_PATH, save)).status, 409);
});

test('disconnect during capture suppresses late data; timeout is explicit', async t => {
  let arrived; const ready = new Promise(resolve => { arrived = resolve; });
  const fixture = await serveAssets(t, (url, _req, res) => {
    if (!url.pathname.endsWith('/dashboard-snapshots')) return false;
    arrived(); setTimeout(() => res.end(JSON.stringify(snapshot)), 80); return true;
  });
  const origin = 'http://127.0.0.1:43199';
  const access = createDashboardAccess({ baseUrl: fixture.binding.baseUrl, browserOrigin: origin, dataKind: 'synthetic', hasSession: () => true });
  t.after(() => access.dispose());
  const browser = operation => access.browser(new Request(origin + CRM_UI_PATH, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-crm-ui': '1' },
    body: JSON.stringify({ operation, session_id: 'fixture-session', ...(operation === 'login' ? { username: 'fixture-user', password: SYNTHETIC_PASSWORD } : {}) }) }));
  await browser('login');
  const pending = access.service.querySnapshot('fixture-session', snapshot.result.filters);
  await ready; await browser('disconnect');
  assert.equal((await pending).code, 'NOT_CONNECTED');
  const result = await crmAssetRequest({ operation: 'capture', filters: snapshot.result.filters, key: 'timeout' }, { binding: fixture.binding, sessionId: 'fixture-session', timeoutMs: 10 });
  assert.equal(result.code, 'TIMEOUT');
});
