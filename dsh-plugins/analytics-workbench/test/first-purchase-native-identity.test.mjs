import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNativeIdentity, observeNativeIdentity } from '../src/first-purchase-native-identity.mjs';

const value = () => ({ schema_version: 'first-purchase-session-identity/v1', owner_id: 'crm-owner',
  data_scope: 'first-purchase-fixture', query_access: 'GRANTED' });
function fixture({ payload = value(), status = 200, request, username = 'crm-owner' } = {}) {
  const controller = new AbortController();
  const lease = { username, signal: controller.signal, isCurrent: () => !controller.signal.aborted,
    request: request ?? (async (op, body, key) => {
      assert.equal(op, 'identity'); assert.deepEqual(body, {}); assert.equal(key, 'native-session-identity');
      return { status, payload };
    }) };
  const provider = () => ({ contract: 'shinemage-first-purchase-access/v1', configured: true,
    authorize: id => id === 'native-session' ? lease : null });
  return { provider, controller };
}
test('fresh service query grant binds the current CRM lease and session, with no credentials', async () => {
  const { provider } = fixture();
  assert.deepEqual(await resolveNativeIdentity(provider, 'native-session'), { session_id: 'native-session', identity: value() });
  await assert.rejects(resolveNativeIdentity(provider, 'another-session'), /IDENTITY_UNAVAILABLE/);
  await assert.rejects(resolveNativeIdentity(() => undefined, 'native-session'), /IDENTITY_UNAVAILABLE/);
});
for (const payload of [null, {}, { ...value(), owner_id: 'another-account' }, { ...value(), token: 'untrusted' },
  { ...value(), data_scope: 'production' }, { ...value(), query_access: 'DENIED' },
  { ...value(), schema_version: 'unreviewed/v2' }, { ...value(), owner_id: 'x\ny' }]) {
  test('identity rejects malformed, foreign or overbroad service claims: ' + JSON.stringify(payload), async () => {
    await assert.rejects(resolveNativeIdentity(fixture({ payload }).provider, 'native-session'), /IDENTITY_UNAVAILABLE/);
  });
}
test('HTTP errors and disconnect during resolution never retain a grant', async () => {
  await assert.rejects(resolveNativeIdentity(fixture({ status: 403 }).provider, 'native-session'), /IDENTITY_UNAVAILABLE/);
  let complete;
  const f = fixture({ request: () => new Promise(resolve => { complete = resolve; }) });
  const pending = resolveNativeIdentity(f.provider, 'native-session');
  f.controller.abort();
  await assert.rejects(pending, /IDENTITY_UNAVAILABLE/);
  complete({ status: 200, payload: value() });
  await assert.rejects(resolveNativeIdentity(f.provider, 'native-session'), /IDENTITY_UNAVAILABLE/);
});
test('a provider that ignores cancellation is still bounded', async () => {
  const f = fixture({ request: () => new Promise(() => {}) });
  const keepAlive = setInterval(() => {}, 100);
  try { await assert.rejects(resolveNativeIdentity(f.provider, 'native-session'), /IDENTITY_UNAVAILABLE/); }
  finally { clearInterval(keepAlive); }
});
test('unavailability cannot masquerade as a revocation observation', async () => {
  assert.deepEqual(await observeNativeIdentity(fixture({ status: 401 }).provider, 'native-session'),
    { session_id: 'native-session', denied: 'UNAUTHENTICATED' });
  assert.deepEqual(await observeNativeIdentity(fixture({ status: 403 }).provider, 'native-session'),
    { session_id: 'native-session', denied: 'FORBIDDEN' });
  await assert.rejects(observeNativeIdentity(fixture({ status: 503 }).provider, 'native-session'), /IDENTITY_UNAVAILABLE/);
  await assert.rejects(observeNativeIdentity(() => undefined, 'native-session'), /IDENTITY_UNAVAILABLE/);
});
