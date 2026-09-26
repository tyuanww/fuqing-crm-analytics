import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, open, lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { reconcileJournal } from './reconcile.mjs';

/** Durable release state and journal. */
export const PHASES = [
  'BUILD',
  'CREATE_DRAFT_RELEASE',
  'UPLOAD_TARBALLS',
  'FINALIZE_MANIFEST',
  'GENERATE_SUMS',
  'UPLOAD_METADATA',
  'PREPARE_PUBLICATION',
  'PUBLISH_RELEASE',
  'RECEIPT',
];

const STATE_SCHEMA = 'release-state/v2';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const TERMINAL = new Set(['RECEIPT']);

function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function now() { return new Date().toISOString(); }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function phaseIndex(phase) { return phase === null ? -1 : PHASES.indexOf(phase); }

function emptyState() {
  return { schema_version: STATE_SCHEMA, phase: null, phase_status: 'IDLE', release_tag: null, journal: [], idempotency: {}, updated_at: null };
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('RELEASE_STATE_INVALID');
  if (state.schema_version !== STATE_SCHEMA) throw new Error('RELEASE_STATE_SCHEMA_UNSUPPORTED');
  if (state.phase !== null && !PHASES.includes(state.phase)) throw new Error('RELEASE_STATE_PHASE_INVALID');
  if (state.release_tag !== null && (typeof state.release_tag !== 'string' || !/^dsh-[A-Za-z0-9._-]+$/.test(state.release_tag))) throw new Error('RELEASE_STATE_TAG_INVALID');
  if (!Array.isArray(state.journal) || typeof state.idempotency !== 'object' || state.idempotency === null || Array.isArray(state.idempotency)) throw new Error('RELEASE_STATE_SHAPE_INVALID');
  let previous = 'GENESIS';
  for (let index = 0; index < state.journal.length; index += 1) {
    const entry = state.journal[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`RELEASE_JOURNAL_ENTRY_INVALID:${index}`);
    if (entry.seq !== index + 1 || entry.prev_digest !== previous) throw new Error(`RELEASE_JOURNAL_CHAIN_INVALID:${index}`);
    const copy = { ...entry }; delete copy.digest;
    if (entry.digest !== digest(copy)) throw new Error(`RELEASE_JOURNAL_DIGEST_INVALID:${index}`);
    previous = entry.digest;
  }
  for (const [key, value] of Object.entries(state.idempotency)) {
    if (!KEY.test(key) || !value || typeof value !== 'object' || !['IN_PROGRESS', 'COMMITTED', 'UNKNOWN', 'FAILED'].includes(value.status)) throw new Error('RELEASE_IDEMPOTENCY_INVALID');
  }
  return state;
}

async function load(path) {
  try {
    const state = JSON.parse(await readFile(path, 'utf8'));
    // v1 state has no integrity chain; accepting it would make resume unsafe.
    return validateState(state);
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw error;
  }
}

async function save(path, state) {
  validateState(state);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(tmp, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
  try {
    await rename(tmp, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) { await rm(tmp, { force: true }); throw error; }
}

async function withLock(path, fn) {
  const lock = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: now() })}\n`);
    await handle.sync();
  } catch (error) { if (error.code === 'EEXIST') throw new Error('RELEASE_LOCKED'); throw error; } finally { await handle?.close(); }
  try { return await fn(); } finally { await rm(lock, { force: true }); }
}

function appendJournal(state, value) {
  const previous = state.journal.at(-1)?.digest ?? 'GENESIS';
  const entry = { seq: state.journal.length + 1, prev_digest: previous, at: now(), ...value };
  entry.digest = digest(entry);
  state.journal.push(entry); state.updated_at = entry.at;
  return entry;
}

/** Record an ordered phase transition. Skips and regressions fail closed. */
export async function transition(path, phase, data = {}) {
  if (!PHASES.includes(phase)) throw new Error(`PHASE_INVALID ${phase}`);
  if (!data || typeof data !== 'object' || Array.isArray(data) || ['phase', 'event', 'status'].some(key => own(data, key))) throw new Error('PHASE_DATA_INVALID');
  return withLock(path, async () => {
    const state = await load(path); const current = phaseIndex(state.phase); const next = phaseIndex(phase);
    if (next < current) throw new Error(`PHASE_REGRESSION ${state.phase}->${phase}`);
    if (next > current + 1) throw new Error(`PHASE_SKIP ${state.phase ?? 'NONE'}->${phase}`);
    if (TERMINAL.has(state.phase) && phase !== state.phase) throw new Error(`PHASE_TERMINAL ${state.phase}`);
    if (data.release_tag !== undefined) {
      if (typeof data.release_tag !== 'string' || !/^dsh-[A-Za-z0-9._-]+$/.test(data.release_tag)) throw new Error('RELEASE_STATE_TAG_INVALID');
      if (state.release_tag !== null && state.release_tag !== data.release_tag) throw new Error('RELEASE_STATE_TAG_CONFLICT');
      state.release_tag = data.release_tag;
    }
    const entry = appendJournal(state, { phase, event: 'PHASE', status: 'COMMITTED', ...data });
    state.phase = phase; state.phase_status = 'COMMITTED'; await save(path, state); return entry;
  });
}

/** Append a receipt/observation while preserving the current phase. */
export async function recordEvent(path, data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || ['phase', 'event'].some(key => own(data, key))) throw new Error('RELEASE_EVENT_INVALID');
  return withLock(path, async () => {
    const state = await load(path);
    if (data.release_tag !== undefined) {
      if (typeof data.release_tag !== 'string' || !/^dsh-[A-Za-z0-9._-]+$/.test(data.release_tag)) throw new Error('RELEASE_STATE_TAG_INVALID');
      if (state.release_tag !== null && state.release_tag !== data.release_tag) throw new Error('RELEASE_STATE_TAG_CONFLICT');
      state.release_tag = data.release_tag;
    }
    const entry = appendJournal(state, { phase: state.phase, event: 'OBSERVATION', ...data }); await save(path, state); return entry;
  });
}

/** Reconcile a remote receipt and persist the decision without adopting remote state. */
export async function reconcileState(path, remote) {
  return withLock(path, async () => {
    const state = await load(path);
    const result = reconcileJournal({ state, remote });
    appendJournal(state, {
      phase: state.phase,
      event: 'RECONCILE',
      status: result.status,
      action: result.action ?? null,
      reason: result.reason ?? null,
      remote_phase: remote?.phase ?? null,
      remote_status: remote?.status ?? null,
    });
    await save(path, state);
    return result;
  });
}

/**
 * Run an external operation once per key. A crash after INTENT leaves an
 * UNKNOWN operation; replay never performs an unsafe duplicate side effect.
 */
export async function idempotent(path, idempotencyKey, operation, options = {}) {
  if (!KEY.test(idempotencyKey)) throw new Error('IDEMPOTENCY_KEY_INVALID');
  if (typeof operation !== 'function') throw new Error('IDEMPOTENCY_OPERATION_INVALID');
  const fingerprint = options.fingerprint ?? null;
  if (fingerprint !== null && !/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('IDEMPOTENCY_FINGERPRINT_INVALID');
  return withLock(path, async () => {
    const state = await load(path);
    if (own(state.idempotency, idempotencyKey)) {
      const prior = state.idempotency[idempotencyKey];
      if (prior.fingerprint !== fingerprint) return { replay: true, status: 'CONFLICT', idempotency_key: idempotencyKey };
      if (prior.status === 'IN_PROGRESS') return { replay: true, status: 'UNKNOWN', reason: 'prior_operation_may_have_committed', idempotency_key: idempotencyKey };
      if (prior.status === 'UNKNOWN') return { replay: true, status: 'UNKNOWN', reason: 'reconcile_required', idempotency_key: idempotencyKey };
      if (prior.status === 'FAILED') return { replay: true, status: 'FAILED', error: prior.error, idempotency_key: idempotencyKey };
      return { replay: true, status: 'COMMITTED', result: prior.result, idempotency_key: idempotencyKey };
    }
    const started = now();
    state.idempotency[idempotencyKey] = { status: 'IN_PROGRESS', fingerprint, started_at: started };
    appendJournal(state, { phase: state.phase, event: 'IDEMPOTENCY', idempotency_key: idempotencyKey, status: 'INTENT', fingerprint });
    await save(path, state);
    try {
      const result = await operation(Object.freeze({ ...state }));
      state.idempotency[idempotencyKey] = { status: 'COMMITTED', fingerprint, result, started_at: started, completed_at: now() };
      appendJournal(state, { phase: state.phase, event: 'IDEMPOTENCY', idempotency_key: idempotencyKey, status: 'COMMITTED', fingerprint, result });
      await save(path, state); return { replay: false, status: 'COMMITTED', result, idempotency_key: idempotencyKey };
    } catch (error) {
      const message = String(error?.message ?? error);
      state.idempotency[idempotencyKey] = { status: 'UNKNOWN', fingerprint, error: message, started_at: started, unknown_at: now() };
      appendJournal(state, { phase: state.phase, event: 'IDEMPOTENCY', idempotency_key: idempotencyKey, status: 'UNKNOWN', fingerprint, error: message });
      await save(path, state); throw error;
    }
  });
}

export async function readState(path) { return load(path); }

export async function resume(path) {
  const state = await load(path);
  const unknown = Object.entries(state.idempotency)
    .filter(([, value]) => value.status === 'IN_PROGRESS' || value.status === 'UNKNOWN')
    .map(([idempotency_key, value]) => ({ idempotency_key, ...value }));
  const current = phaseIndex(state.phase);
  return {
    schema_version: state.schema_version,
    release_tag: state.release_tag,
    phase: state.phase,
    phase_status: state.phase_status,
    next: state.phase === null ? PHASES[0] : (TERMINAL.has(state.phase) ? null : PHASES[current + 1] ?? null),
    action_required: unknown.length > 0,
    unknown_operations: unknown,
    journal: state.journal,
    updated_at: state.updated_at,
  };
}

/** Explicit operator action for a stale lock; never auto-delete locks. */
export async function clearStaleLock(path, { confirm = false } = {}) {
  if (confirm !== true) throw new Error('RELEASE_LOCK_CLEAR_REQUIRES_CONFIRMATION');
  const lock = `${path}.lock`; await lstat(lock); await rm(lock); return { cleared: true, path: lock };
}
