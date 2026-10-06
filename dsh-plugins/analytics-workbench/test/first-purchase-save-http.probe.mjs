/** Python owns real HTTP CRM mock, current public service and isolated SQLite. No DSH server. */
import assert from 'node:assert/strict';
import { createDashboardAccess, CRM_UI_PATH } from '../../crm-knowledge/src/dashboard-access.mjs';
import { createSaveGateway } from '../src/first-purchase-save-gateway.mjs';
import { createSaveController } from '../src/first-purchase-save-client.mjs';
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw), origin = 'http://127.0.0.1:43299';
const target = { session_id: 'fixture-session', run_id: input.run_id, call_id: 'fixture-call' };
const access = createDashboardAccess({ baseUrl: input.crm_origin, firstPurchaseOrigin: input.service_origin,
  browserOrigin: origin, hasSession: id => id === target.session_id });
const gateway = createSaveGateway({ provider: () => access.firstPurchaseService, candidateDigest: 'a'.repeat(64), browserOrigins: [origin] });
const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
const browser = (op, payload, signal) => gateway.browser(new Request(origin + '/api/analytics-first-purchase/save', {
  method: 'POST', signal, headers: { origin, 'x-first-purchase-ui': '1', 'content-type': 'application/json' },
  body: JSON.stringify({ operation: op, target, payload }),
}));
const controllers = [];
try {
  assert.equal((await (await browser('status', null)).json()).code, 'NOT_CONNECTED');
  const login = await access.browser(new Request(origin + CRM_UI_PATH, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-crm-ui': '1' },
    body: JSON.stringify({ operation: 'login', session_id: target.session_id, username: 'synthetic-demo', password: 'synthetic-password' }) }));
  assert.equal(login.status, 200);
  let writes = 0, command;
  const request = async (_, op, body, signal) => {
    const result = await browser(op, body, signal); const value = await result.json();
    if (op === 'save') { writes++; command = body; assert.equal(value.value.status, 'SAVED'); throw new Error('deliberately lost browser ACK'); }
    return value;
  };
  const first = createSaveController({ target, storage, request, onChange() {} }); controllers.push(first);
  await first.start(); assert.equal(first.getState().phase, 'ready');
  assert.equal(first.getState().result.provenance.freshness.freshness_state, 'NOT_CHECKED');
  await first.save('HTTP 合成保存'); assert.equal(first.getState().phase, 'unknown'); first.dispose();
  const reopened = createSaveController({ target, storage, request, onChange() {} }); controllers.push(reopened);
  await reopened.start(); assert.equal(reopened.getState().phase, 'saved'); assert.equal(writes, 1);
  const replay = await (await browser('save', command)).json(); assert.deepEqual(replay.value, reopened.getState().receipt);
  const conflict = await (await browser('save', { ...command, title: '冲突标题' })).json(); assert.equal(conflict.code, 'SAVE_CONFLICT');
  const denied = await (await browser('save', { ...command, owner_id: 'other' })).json(); assert.equal(denied.code, 'INVALID_REQUEST');
  console.log('FIRST_PURCHASE_SAVE_HTTP PASS checks=7');
} finally { controllers.forEach(c => c.dispose()); gateway.dispose(); access.dispose(); }
