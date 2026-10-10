import { decodeFirstPurchaseSaveResult, decodeFirstPurchaseSaveReceipt } from './first-purchase-save-model.mjs';
const endpoint = '/api/analytics-first-purchase/save';
const wire = 'shinemage-first-purchase-ui/v1';
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const identity = v => exact(v, ['schema_version', 'action_id', 'candidate_digest', 'correlation_id'])
  && v.schema_version === 'analytics-first-purchase-save-identity/v1' && sha(v.candidate_digest)
  && /^fp-save-[a-f0-9]{64}$/.test(v.action_id) && v.correlation_id === v.action_id.replace('fp-save-', 'fp-ui-');
const same = (a, b) => identity(a) && identity(b) && Object.keys(a).every(k => a[k] === b[k]);
export async function saveUiRequest(target, operation, payload, signal) {
  const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { 'content-type': 'application/json', 'x-first-purchase-ui': '1' }, body: JSON.stringify({ target, operation, payload }) });
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error();
  const reader = response.body?.getReader(); if (!reader) throw new Error();
  const chunks = []; let size = 0;
  try { for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > 512 * 1024) throw new Error(); chunks.push(value);
  } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (body?.schema_version !== wire || typeof body.ok !== 'boolean' || response.ok !== body.ok) throw new Error();
  return body;
}

/** Durable browser intent contains identifiers/title only. Never credentials, facts or approval. */
export function createSaveController({ target, request = saveUiRequest, storage, onChange }) {
  let dead = false, busy = false, owner, currentIdentity, storageKey, pending = null, inspected = null;
  const lifetime = new AbortController();
  let state = { phase: 'checking', code: 'CHECKING', receipt: null, result: null };
  const publish = (phase, code, extra = {}) => { state = { ...state, phase, code, ...extra }; if (!dead) onChange(state); };
  const call = (op, payload) => request(target, op, payload, lifetime.signal);
  const validReceipt = (body, expected) => {
    const value = decodeFirstPurchaseSaveReceipt(body?.value);
    return body?.ok === true && value && value.owner_id === owner && same(value.identity, expected)
      && value.idempotency_key === expected.action_id
      && (value.status !== 'SAVED' || (value.source_ref.created_from_run_id === target.run_id
        && (!pending || value.source_ref.evidence_digest === pending.evidence_digest))) ? value : null;
  };
  async function status() {
    const body = await call('status', null);
    if (!body?.ok) { publish('unavailable', body?.code === 'NOT_CONNECTED' ? 'NOT_CONNECTED' : 'NOT_AVAILABLE', { receipt: null, result: null }); return false; }
    if (!identity(body.identity) || typeof body.owner !== 'string' || !/^[A-Za-z0-9_.@-]{1,64}$/.test(body.owner)) throw new Error();
    if (owner && owner !== body.owner) { publish('unavailable', 'ACCOUNT_CHANGED', { receipt: null, result: null }); return false; }
    owner = body.owner; currentIdentity = body.identity;
    storageKey = 'shinemage:fp-save:v1:' + JSON.stringify([owner, target.session_id, target.run_id, target.call_id]);
    return true;
  }
  function saved(receipt) {
    // Retain the intent: a lost UI ACK/reload must keep the original candidate identity.
    publish('saved', 'SAVED', { receipt });
  }
  async function inspect() {
    const body = await call('inspect', null);
    const value = decodeFirstPurchaseSaveResult(body?.value);
    if (!body?.ok || !value || !same(value.identity, currentIdentity)
      || value.provenance.permission_scope.owner_id !== owner
      || value.provenance.source_refs.created_from_run_id !== target.run_id) { publish('blocked', 'RESULT_UNAVAILABLE'); return; }
    inspected = value;
    publish(value.save_eligible ? 'ready' : 'blocked', value.save_ineligible_reason ?? 'READY', { result: value });
  }
  async function reconcile() {
    const expected = pending?.identity ?? currentIdentity;
    const body = await call('reconcile', expected);
    const receipt = validReceipt(body, expected);
    if (!receipt) { publish(pending ? 'unknown' : 'blocked', body?.code === 'SAVE_CONFLICT' ? 'SAVE_CONFLICT' : 'RECONCILE_UNAVAILABLE'); return; }
    if (receipt.status === 'SAVED') saved(receipt);
    else if (pending) publish('unknown', same(pending.identity, currentIdentity) ? 'RECEIPT_NOT_FOUND' : 'CANDIDATE_CHANGED');
    else await inspect();
  }
  function readPending() {
    if (!storage) throw new Error();
    const raw = storage.getItem(storageKey);
    if (raw === null) return;
    if (raw.length > 4096) throw new Error();
    const value = JSON.parse(raw);
    if (!exact(value, ['schema_version', 'identity', 'created_from_run_id', 'title', 'evidence_digest'])
      || value.schema_version !== 'analytics-first-purchase-save-command/v1' || !identity(value.identity)
      || value.created_from_run_id !== target.run_id || !sha(value.evidence_digest)
      || typeof value.title !== 'string' || !value.title.length || value.title.length > 120) throw new Error();
    pending = value;
  }
  async function run(fn, failure) {
    if (dead || busy) return;
    busy = true;
    try { await fn(); } catch { publish(pending ? 'unknown' : 'unavailable', failure); }
    finally { busy = false; }
  }
  return {
    getState: () => state,
    start: () => run(async () => {
      publish('checking', 'CHECKING');
      if (!await status() || dead) return;
      try { readPending(); } catch { publish('blocked', 'INTENT_STORAGE_UNAVAILABLE'); return; }
      await reconcile();
    }, 'SERVICE_UNAVAILABLE'),
    reconcile: () => run(async () => {
      publish('checking', 'CHECKING');
      if (await status() && !dead) {
        try { readPending(); } catch { publish('blocked', 'INTENT_STORAGE_UNAVAILABLE'); return; }
        await reconcile();
      }
    }, 'RECONCILE_UNAVAILABLE'),
    save: title => run(async () => {
      if (!['ready', 'unknown'].includes(state.phase) || state.code === 'SAVE_CONFLICT') return;
      if (!await status() || dead) return;
      try { readPending(); } catch { publish('blocked', 'INTENT_STORAGE_UNAVAILABLE'); return; }
      if (pending && !same(pending.identity, currentIdentity)) { publish('unknown', 'CANDIDATE_CHANGED'); return; }
      if (!pending) {
        if (!inspected?.save_eligible || !same(inspected.identity, currentIdentity)) { publish('blocked', 'CANDIDATE_CHANGED'); return; }
        const command = { schema_version: 'analytics-first-purchase-save-command/v1', identity: inspected.identity,
          created_from_run_id: target.run_id, title, evidence_digest: inspected.provenance.source_refs.evidence_digest };
        try {
          const raw = JSON.stringify(command); storage.setItem(storageKey, raw);
          if (storage.getItem(storageKey) !== raw) throw new Error();
        } catch { publish('blocked', 'INTENT_STORAGE_UNAVAILABLE'); return; }
        pending = command;
      }
      publish('saving', 'SAVING');
      const body = await call('save', pending);
      if (dead) return;
      const receipt = validReceipt(body, pending.identity);
      if (receipt?.status === 'SAVED') saved(receipt);
      else publish(body?.code === 'SAVE_CONFLICT' ? 'conflict' : 'unknown', body?.code === 'SAVE_CONFLICT' ? 'SAVE_CONFLICT' : 'SAVE_UNKNOWN');
    }, 'SAVE_UNKNOWN'),
    dispose() { dead = true; lifetime.abort(); },
  };
}
