/** Workbench-owned save boundary; CRM owns authentication, service owns admission/state. */
import { createHash } from 'node:crypto';
import { FIRST_PURCHASE_ACCESS_CONTRACT } from './first-purchase-access.generated.ts';
import { decodeFirstPurchaseSaveResult, decodeFirstPurchaseSaveReceipt } from './first-purchase-save-model.mjs';

export const FIRST_PURCHASE_SAVE_PATH = '/api/analytics-first-purchase/save';
const schema = 'shinemage-first-purchase-ui/v1';
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const opaque = (v, max = 128) => typeof v === 'string' && v.length <= max && /^[A-Za-z0-9_.:-]+$/.test(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const reply = (status, body) => Response.json({ schema_version: schema, ...body }, {
  status, headers: { 'cache-control': 'no-store', pragma: 'no-cache', 'x-content-type-options': 'nosniff' },
});
const error = (code, status = 409) => reply(status, { ok: false, code });
export function saveIdentity(owner, target, candidate) {
  const digest = createHash('sha256').update(JSON.stringify([owner, target.session_id, target.run_id, target.call_id, candidate])).digest('hex');
  return { schema_version: 'analytics-first-purchase-save-identity/v1', action_id: `fp-save-${digest}`,
    candidate_digest: candidate, correlation_id: `fp-ui-${digest}` };
}
const sameIdentity = (v, expected) => exact(v, Object.keys(expected)) && Object.keys(expected).every(k => v[k] === expected[k]);
function validCommand(v) {
  return exact(v, ['schema_version', 'identity', 'created_from_run_id', 'title', 'evidence_digest'])
    && v.schema_version === 'analytics-first-purchase-save-command/v1' && opaque(v.created_from_run_id)
    && typeof v.title === 'string' && v.title === v.title.trim() && v.title.length >= 1 && v.title.length <= 120
    && !/[\x00-\x1f\x7f]/.test(v.title) && sha(v.evidence_digest);
}
async function readInput(request, signal) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const chunks = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const part = await reader.read(); signal.throwIfAborted();
      if (part.done) break;
      size += part.value.length;
      if (size > 8192) throw new Error();
      chunks.push(Buffer.from(part.value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function createSaveGateway({ provider, candidateDigest, browserOrigins }) {
  if (candidateDigest !== undefined && !sha(candidateDigest)) throw new Error('FIRST_PURCHASE_CANDIDATE_INVALID');
  const origins = new Set(browserOrigins);
  const lifetime = new AbortController();
  return { dispose: () => lifetime.abort(), async browser(request) {
    const url = new URL(request.url);
    if (url.pathname !== FIRST_PURCHASE_SAVE_PATH || url.search || !origins.has(request.headers.get('origin'))
      || request.headers.get('x-first-purchase-ui') !== '1' || request.headers.get('sec-fetch-site') === 'cross-site') return error('HOST_AUTH_REQUIRED', 403);
    if (request.method !== 'POST' || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return error('INVALID_REQUEST', 400);
    const signal = AbortSignal.any([request.signal, lifetime.signal, AbortSignal.timeout(12000)]);
    let input;
    try { input = await readInput(request, signal); } catch { return error('INVALID_REQUEST', 400); }
    if (!exact(input, ['operation', 'target', 'payload']) || !['status', 'inspect', 'save', 'reconcile'].includes(input.operation)
      || !exact(input.target, ['session_id', 'run_id', 'call_id']) || !opaque(input.target.session_id, 160)
      || !opaque(input.target.run_id) || !opaque(input.target.call_id, 160)) return error('INVALID_REQUEST', 400);
    const { operation, target, payload } = input;
    if (['status', 'inspect'].includes(operation) && payload !== null) return error('INVALID_REQUEST', 400);
    const service = provider();
    if (lifetime.signal.aborted || !candidateDigest || service?.contract !== FIRST_PURCHASE_ACCESS_CONTRACT
      || service.configured !== true) return error('NOT_AVAILABLE');
    const lease = service.authorize(target.session_id);
    if (!lease || !lease.isCurrent()) return error('NOT_CONNECTED', 401);
    const current = () => !signal.aborted && lease.isCurrent() && !lease.signal.aborted && provider() === service;
    const identity = saveIdentity(lease.username, target, candidateDigest);
    if (operation === 'status') return reply(200, { ok: true, owner: lease.username, identity });
    let body, expected = identity;
    if (operation === 'inspect') body = { schema_version: 'analytics-first-purchase-save-inspect/v1', identity, created_from_run_id: target.run_id };
    else if (operation === 'save') {
      if (!validCommand(payload) || payload.created_from_run_id !== target.run_id
        || !sameIdentity(payload.identity, expected)) return error('INVALID_REQUEST', 400);
      body = payload;
    } else {
      // Reconcile an old candidate without allowing it to authorize new writes.
      if (!sha(payload?.candidate_digest)) return error('INVALID_REQUEST', 400);
      expected = saveIdentity(lease.username, target, payload.candidate_digest);
      if (!sameIdentity(payload, expected)) return error('INVALID_REQUEST', 400);
      body = expected;
    }
    try {
      const result = await lease.request(operation, body, expected.action_id, signal);
      if (!current()) return error(operation === 'save' ? 'SAVE_UNKNOWN' : 'NOT_CONNECTED');
      if (result.status < 200 || result.status >= 300) {
        // Never forward provider text, headers or validation internals.
        const code = result.status === 401 ? 'NOT_CONNECTED' : result.status === 403 ? 'PERMISSION_DENIED'
          : result.status === 409 ? 'SAVE_CONFLICT' : result.status === 404 ? 'RESULT_UNAVAILABLE' : 'SERVICE_UNAVAILABLE';
        return error(operation === 'save' && result.status >= 500 ? 'SAVE_UNKNOWN' : code);
      }
      const decoded = operation === 'inspect' ? decodeFirstPurchaseSaveResult(result.payload) : decodeFirstPurchaseSaveReceipt(result.payload);
      if (!decoded || !sameIdentity(decoded.identity, expected)) throw new Error();
      if (operation === 'inspect') {
        if (decoded.provenance.permission_scope.owner_id !== lease.username
          || decoded.provenance.source_refs.created_from_run_id !== target.run_id) throw new Error();
      } else if (decoded.owner_id !== lease.username || decoded.idempotency_key !== expected.action_id
        || (operation === 'save' && decoded.status !== 'SAVED')
        || (decoded.status === 'SAVED' && (decoded.source_ref.created_from_run_id !== target.run_id
          || (operation === 'save' && decoded.source_ref.evidence_digest !== body.evidence_digest)))) throw new Error();
      return reply(200, { ok: true, value: decoded });
    } catch { return error(operation === 'save' ? 'SAVE_UNKNOWN' : 'SERVICE_UNAVAILABLE'); }
  } };
}
