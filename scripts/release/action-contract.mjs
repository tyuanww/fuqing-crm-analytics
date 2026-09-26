import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CAPABILITIES = {
  save: { enabled: false, status: 'NOT_AVAILABLE', reason: '持久化分析接口尚未接通；不会伪造成功' },
  export: { enabled: false, status: 'NOT_AVAILABLE', reason: '导出通道未接通；请保留当前证据引用' },
  send: { enabled: false, status: 'NOT_AVAILABLE', reason: '真实发送需要独立审批和发送服务' },
  cancel: { enabled: true, status: 'AVAILABLE', reason: null },
};
async function withLock(path, fn) {
  const lock = `${path}.lock`; await mkdir(dirname(path), { recursive: true });
  try { const h = await open(lock, 'wx', 0o600); await h.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); await h.close(); }
  catch (e) { if (e.code === 'EEXIST') throw new Error('ACTION_BUSY'); throw e; }
  try { return await fn(); } finally { await rm(lock, { force: true }); }
}
async function load(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { schema_version: 'action-state/v1', actions: {}, keys: {} }; throw e; } }
async function save(path, value) { const temp = `${path}.tmp-${process.pid}`; const h = await open(temp, 'wx', 0o600); try { await h.writeFile(JSON.stringify(value, null, 2) + '\n'); await h.sync(); } finally { await h.close(); } await rename(temp, path); }
export function capabilityMatrix() { return structuredClone(CAPABILITIES); }
export async function beginAction(path, { type, idempotencyKey, actor = '' }) {
  if (!CAPABILITIES[type]) throw new Error('ACTION_TYPE_UNKNOWN');
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('ACTION_ACTOR_REQUIRED');
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey ?? '')) throw new Error('ACTION_IDEMPOTENCY_INVALID');
  return withLock(path, async () => {
    const state = await load(path); const key = `${actor}:${idempotencyKey}`;
    if (state.keys[key]) {
      const prior = state.actions[state.keys[key]];
      if (!prior) throw new Error('ACTION_STATE_CORRUPT');
      if (prior.type !== type) throw new Error('ACTION_IDEMPOTENCY_CONFLICT');
      return prior;
    }
    const action = { action_id: randomUUID(), idempotency_key: idempotencyKey, actor, type, status: CAPABILITIES[type].enabled ? 'PENDING' : 'NOT_AVAILABLE', reason: CAPABILITIES[type].reason, created_at: new Date().toISOString(), receipt: null };
    state.keys[key] = action.action_id; state.actions[action.action_id] = action; await save(path, state); return action;
  });
}
export async function finishAction(path, actionId, { status, detail = null } = {}) {
  return withLock(path, async () => { const state = await load(path); const action = state.actions[actionId]; if (!action) return { status: 'UNKNOWN', action_id: actionId, receipt: null };
    if (!['SUCCEEDED', 'FAILED', 'CANCELED', 'NOT_AVAILABLE'].includes(status)) throw new Error('ACTION_STATUS_INVALID');
    if (action.status !== 'PENDING') {
      if (action.status !== status) throw new Error('ACTION_TERMINAL_CONFLICT');
      if (action.receipt) return action;
    }
    action.status = status; action.receipt = { action_id: actionId, status, detail, at: new Date().toISOString() }; await save(path, state); return action;
  });
}
export async function receipt(path, actionId) { const state = await load(path); return state.actions[actionId]?.receipt ?? { action_id: actionId, status: 'UNKNOWN', receipt: null }; }
