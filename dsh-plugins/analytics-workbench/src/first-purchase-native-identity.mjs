/** A fresh service-owned query grant, bound to the current CRM host lease.
 * No credential, client actor, cache or synthetic fallback crosses this seam.
 */
const contract = 'shinemage-first-purchase-access/v1';
const schema = 'first-purchase-session-identity/v1';
class IdentityDenied extends Error {
  constructor(status) { super('IDENTITY_UNAVAILABLE'); this.status = status; }
}
/** A missing/revoked grant is distinct from an unreachable identity provider. */
export async function observeNativeIdentity(provider, sessionId) {
  try { return await resolveNativeIdentity(provider, sessionId); }
  catch (error) {
    if (error instanceof IdentityDenied) return { session_id: sessionId,
      denied: error.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' };
    throw new Error('IDENTITY_UNAVAILABLE');
  }
}
export async function resolveNativeIdentity(provider, sessionId) {
  const service = provider();
  if (service?.contract !== contract || service.configured !== true) throw new Error('IDENTITY_UNAVAILABLE');
  const lease = service.authorize(sessionId);
  if (!lease || !lease.isCurrent() || lease.signal.aborted) throw new IdentityDenied(401);
  const signal = AbortSignal.any([lease.signal, AbortSignal.timeout(2500)]);
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('IDENTITY_UNAVAILABLE'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    const result = await Promise.race([lease.request('identity', {}, 'native-session-identity', signal), cancelled]);
    if (result?.status === 401 || result?.status === 403) throw new IdentityDenied(result.status);
    const value = result?.payload;
    if (result?.status !== 200 || !value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'data_scope,owner_id,query_access,schema_version'
      || value.schema_version !== schema || value.data_scope !== 'first-purchase-fixture' || value.query_access !== 'GRANTED'
      || typeof value.owner_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value.owner_id)
      || value.owner_id !== lease.username || !lease.isCurrent() || signal.aborted) throw new Error('IDENTITY_UNAVAILABLE');
    return { session_id: sessionId, identity: value };
  } catch (error) {
    if (error instanceof IdentityDenied) throw error;
    if (!lease.isCurrent() || lease.signal.aborted) throw new IdentityDenied(401);
    throw new Error('IDENTITY_UNAVAILABLE');
  } finally { signal.removeEventListener('abort', abort); }
}
