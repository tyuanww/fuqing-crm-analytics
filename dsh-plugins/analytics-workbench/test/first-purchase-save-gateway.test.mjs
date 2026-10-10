import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveGateway, saveIdentity } from '../src/first-purchase-save-gateway.mjs';
import { target, owner, candidate, inspected, command, saved, unknown, browserRequest } from './first-purchase-save.fixture.mjs';
function setup(t, relay) {
  let active = true; const calls = [];
  const service = { contract: 'shinemage-first-purchase-access/v1', configured: true, authorize: () => ({ username: owner, signal: new AbortController().signal,
    isCurrent: () => active, request: async (...args) => { calls.push(args); return relay(...args); } }) };
  const gateway = createSaveGateway({ provider: () => service, candidateDigest: candidate, browserOrigins: ['http://127.0.0.1:43299'] });
  t.after(gateway.dispose); return { gateway, calls, revoke: () => { active = false; }, service };
}
test('gateway binds CRM owner/run/candidate and preserves strict no-age response', async t => {
  const { gateway, calls } = setup(t, async op => ({ status: 200, payload: op === 'inspect' ? inspected : saved }));
  const result = await (await gateway.browser(browserRequest('inspect'))).json();
  assert.equal(result.ok, true); assert.equal(result.value.provenance.freshness.freshness_state, 'NOT_CHECKED');
  assert.equal(calls[0][2], command.identity.action_id);
  assert.deepEqual((await (await gateway.browser(browserRequest('save', command))).json()).value, saved);
});
test('gateway rejects CSRF, forged identity/facts/owner and invalid target before transport', async t => {
  const { gateway, calls } = setup(t, () => { throw new Error(); });
  for (const request of [browserRequest('save', command, { origin: 'https://evil.invalid' }),
    browserRequest('save', { ...command, owner_id: 'admin' }), browserRequest('save', { ...command, facts: {} }),
    browserRequest('save', { ...command, identity: saveIdentity('other', target, candidate) }), browserRequest('inspect', {})]) {
    assert.equal((await (await gateway.browser(request)).json()).ok, false);
  }
  assert.equal(calls.length, 0);
});
test('gateway never blesses late, wrong-owner or wrong-run ACK; missing provider stays optional', async t => {
  for (const mutation of [v => { v.owner_id = 'other'; }, v => { v.source_ref.created_from_run_id = 'other-run'; }, v => { v.extra = true; }]) {
    const payload = structuredClone(saved); mutation(payload);
    const { gateway } = setup(t, async () => ({ status: 201, payload }));
    assert.equal((await (await gateway.browser(browserRequest('save', command))).json()).code, 'SAVE_UNKNOWN');
  }
  const item = setup(t, async () => { item.revoke(); return { status: 201, payload: saved }; });
  assert.equal((await (await item.gateway.browser(browserRequest('save', command))).json()).code, 'SAVE_UNKNOWN');
  const missing = createSaveGateway({ provider: () => undefined, candidateDigest: candidate, browserOrigins: ['http://127.0.0.1:43299'] }); t.after(missing.dispose);
  assert.equal((await (await missing.browser(browserRequest('status'))).json()).code, 'NOT_AVAILABLE');
});
test('old candidate is reconcile-only; transport failures stay unknown and provider text stays private', async t => {
  const old = saveIdentity(owner, target, 'd'.repeat(64));
  const { gateway, calls } = setup(t, async op => ({ status: op === 'reconcile' ? 200 : 503, payload: op === 'reconcile'
    ? { ...unknown, identity: old, idempotency_key: old.action_id } : { error: { message: 'private-provider-body' } } }));
  assert.equal((await (await gateway.browser(browserRequest('reconcile', old))).json()).ok, true);
  assert.equal((await gateway.browser(browserRequest('save', { ...command, identity: old }))).status, 400);
  const fail = await (await gateway.browser(browserRequest('save', command))).json();
  assert.equal(fail.code, 'SAVE_UNKNOWN'); assert.ok(!JSON.stringify(fail).includes('private-provider-body')); assert.equal(calls.length, 2);
});
