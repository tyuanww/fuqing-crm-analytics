/** Owned HTTP/IPC integration driver, not an official DSH or browser acceptance. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { createDashboardAccess, CRM_UI_PATH } from '../../crm-knowledge/src/dashboard-access.mjs';
import { observeNativeIdentity } from '../src/first-purchase-native-identity.mjs';
import { createSaveGateway } from '../src/first-purchase-save-gateway.mjs';
import { createSaveController } from '../src/first-purchase-save-client.mjs';
const lines = createInterface({ input: process.stdin }), iterator = lines[Symbol.asyncIterator]();
const input = JSON.parse((await iterator.next()).value), origin = 'http://127.0.0.1:43299';
const access = createDashboardAccess({ baseUrl: input.crm_origin, firstPurchaseOrigin: input.service_origin,
  browserOrigin: origin, hasSession: id => id === input.session_id });
const gateway = createSaveGateway({ provider: () => access.firstPurchaseService, candidateDigest: 'a'.repeat(64), browserOrigins: [origin] });
const crm = async operation => {
  const response = await access.browser(new Request(origin + CRM_UI_PATH, { method: 'POST',
    headers: { origin, 'x-crm-ui': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ operation, session_id: input.session_id, ...(operation === 'login'
      ? { username: 'crm-owner', password: 'synthetic-password' } : {}) }) }));
  assert.equal(response.status, 200);
};
const bridge = createServer((req, res) => {
  void (async () => {
    assert.equal(req.headers.authorization, 'Bearer ' + input.runtime_token);
    assert.equal(req.url, '/identity'); assert.equal(req.method, 'POST');
    let raw = ''; for await (const chunk of req) { raw += chunk; assert.ok(raw.length < 1024); }
    assert.deepEqual(JSON.parse(raw), { session_id: input.session_id });
    const value = await observeNativeIdentity(() => access.firstPurchaseService, input.session_id);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
  })().catch(() => { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"IDENTITY_UNAVAILABLE"}'); });
});
const controllers = [];
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
try {
  await new Promise((resolve, reject) => { bridge.once('error', reject); bridge.listen(0, '127.0.0.1', resolve); });
  send({ origin: 'http://127.0.0.1:' + bridge.address().port });
  for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
    const command = JSON.parse(line);
    if (['login', 'disconnect'].includes(command.operation)) { await crm(command.operation); send({ ok: true }); continue; }
    assert.equal(command.operation, 'save');
    const target = { session_id: input.session_id, run_id: command.run_id, call_id: 'call-1' };
    const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
    let writes = 0, original;
    const transport = async (_target, operation, payload, signal) => {
      const response = await gateway.browser(new Request(origin + '/api/analytics-first-purchase/save', {
        method: 'POST', signal, headers: { origin, 'x-first-purchase-ui': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ operation, target, payload }),
      }));
      return response.json();
    };
    const request = async (...args) => {
      const value = await transport(...args);
      if (args[1] === 'save') {
        writes++; original = args[2]; assert.equal(value.value.status, 'SAVED');
        throw new Error('controlled ACK loss');
      }
      return value;
    };
    const first = createSaveController({ target, storage, request, onChange() {} }); controllers.push(first);
    await first.start(); assert.equal(first.getState().phase, 'ready');
    assert.equal(first.getState().result.provenance.permission_scope.owner_id, 'crm-owner');
    assert.equal(first.getState().result.provenance.freshness.freshness_state, 'NOT_CHECKED');
    await first.save('CRM 归属合成查询'); assert.equal(first.getState().phase, 'unknown'); first.dispose();
    const reopened = createSaveController({ target, storage, request, onChange() {} }); controllers.push(reopened);
    await reopened.start(); assert.equal(reopened.getState().phase, 'saved'); assert.equal(writes, 1);
    const replay = await transport(target, 'save', original);
    assert.deepEqual(replay.value, reopened.getState().receipt);
    send({ ok: true, saved: true, writes, owner: 'crm-owner', freshness: 'NOT_CHECKED' });
  }
} finally {
  controllers.forEach(controller => controller.dispose()); gateway.dispose(); access.dispose();
  bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve));
}
