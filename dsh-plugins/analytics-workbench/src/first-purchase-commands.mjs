/** Thin Host-only adapter: the existing SQLite kernel remains the sole run owner. */
import { readBoundedJson } from './first-purchase-query-model.mjs';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const schema = 'analytics-run-first-purchase-path/v1';
const statuses = new Set(['QUEUED', 'RUNNING', 'CANCELLING', 'CANCELLED', 'SUCCEEDED', 'FAILED', 'NEEDS_INPUT', 'UNKNOWN']);
const messages = {
  NOT_AVAILABLE: '本会话尚未配置首购准入；普通 DSH 对话仍可使用。',
  NOT_CONNECTED: '请先在本对话连接 CRM，再执行首购命令。',
  PERMISSION_DENIED: '当前 CRM 账号无权操作此任务。',
  CONFLICT: '任务冲突；请用 /first-purchase-status 核对原任务。',
  INVALID_REQUEST: '请检查命令参数；未提交新查询。',
  NO_ACTIVE_RUN: '没有可取消的活动任务；未声明已停止。',
  WORKER_ACTIVE: '执行进程尚未确认退出；请核对原任务。',
  NOT_FOUND: '任务不存在或当前会话不可见。',
  SERVICE_UNAVAILABLE: '首购服务暂不可用；请稍后核对原任务。',
  ADMISSION_UNKNOWN: '查询是否受理尚未确认；先用 /first-purchase-status 核对，勿重复提交。',
  CANCEL_UNKNOWN: '取消结果尚未确认；先核对原任务，不表示已停止。',
};
const failure = code => ({ kind: 'error', text: `${code}: ${messages[code]}` });
class Refused extends Error { constructor(code) { super(code); this.code = code; } }
function validRun(value, runId) {
  return value?.schema_version === schema && value.run_id === runId && statuses.has(value.status)
    && typeof value.diagnostics?.execution_active === 'boolean';
}
export function createFirstPurchaseCommands({ portBase, sessionId, gatewayToken, fetchImpl = fetch }) {
  if (![4315, 4325, 4335].includes(portBase) || !id(sessionId)) throw new Error('FIRST_PURCHASE_ADMISSION_CONFIG');
  if (gatewayToken !== undefined && !/^[A-Za-z0-9_-]{32,128}$/.test(gatewayToken)) throw new Error('FIRST_PURCHASE_ADMISSION_CONFIG');
  const lifetime = new AbortController();
  async function request(path, { signal, body, key } = {}) {
    const response = await fetchImpl(`http://127.0.0.1:${portBase}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal,
      headers: { authorization: `Bearer ${gatewayToken}`, 'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await readBoundedJson(response, 512 * 1024);
    if (!response.ok) {
      const code = response.status === 401 ? 'NOT_CONNECTED' : response.status === 403 ? 'PERMISSION_DENIED'
        : response.status === 404 ? 'NOT_FOUND'
        : response.status === 409 ? (['NO_ACTIVE_RUN', 'WORKER_ACTIVE'].includes(value?.error?.code) ? value.error.code : 'CONFLICT')
        : [400, 422].includes(response.status) ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE';
      throw new Refused(code);
    }
    return value;
  }
  return { dispose: () => lifetime.abort(), async execute(name, invocation) {
    if (!gatewayToken || lifetime.signal.aborted || invocation.sessionId !== sessionId) return failure('NOT_AVAILABLE');
    if (!id(invocation.commandId) || typeof invocation.rawInput !== 'string') return failure('INVALID_REQUEST');
    const signal = AbortSignal.any([lifetime.signal, invocation.signal, AbortSignal.timeout(12000)]);
    const input = invocation.rawInput.trim();
    let mutation = false;
    try {
      signal.throwIfAborted();
      if (name === 'first-purchase') {
        if (!input || input.length > 8000 || input.includes('\0')) return failure('INVALID_REQUEST');
        const requestId = `fp-${invocation.commandId}`;
        if (!id(requestId)) return failure('INVALID_REQUEST');
        mutation = true;
        const value = await request('/internal/native/prompt', { signal, body: { sessionId, requestId,
          mode: 'queue', content: [{ type: 'text', text: input }], clientTimeZone: 'Asia/Shanghai' } });
        if (value?.schema_version !== schema || !id(value.run_id) || value.version !== 1
          || value.status !== 'QUEUED' || value.phase !== 'ACCEPTED'
          || value.location !== `/api/v1/analytics-first-purchase/runs/${value.run_id}`
          || Object.keys(value).some(key => !['schema_version', 'run_id', 'version', 'status', 'phase', 'location'].includes(key))) throw new Error();
        return { kind: 'success', text: `SYNTHETIC · ${value.run_id} 已受理，不表示完成。用 /first-purchase-status ${value.run_id} 核对。` };
      }
      if (name === 'first-purchase-status') {
        if (input && !id(input)) return failure('INVALID_REQUEST');
        const context = await request('/internal/native/context', { signal });
        const runs = context?.conversation?.run_ids ?? (context?.conversation === null ? [] : null);
        if (context?.session_id !== sessionId || context.family !== 'first_purchase' || !Array.isArray(runs) || !runs.every(id)) throw new Error();
        if (input && !runs.includes(input)) return failure('NOT_FOUND');
        const selected = input ? [input] : runs.slice(-5);
        const lines = [];
        for (const runId of selected) {
          const value = await request(`/api/v1/analytics-first-purchase/runs/${runId}`, { signal });
          if (!validRun(value, runId)) throw new Error();
          lines.push(`${runId}: ${value.status}${value.diagnostics.execution_active ? '（执行仍在途）' : ''}`);
        }
        return { kind: 'success', text: `SYNTHETIC · ${lines.join('\n') || '当前没有已登记任务。'}` };
      }
      if (name !== 'first-purchase-cancel') return failure('INVALID_REQUEST');
      const match = /^(run|call) ([A-Za-z0-9_.:-]{1,128})$/.exec(input);
      if (!match) return failure('INVALID_REQUEST');
      const requestId = match[1] === 'call' ? invocation.requestForCall(match[2]) : undefined;
      if (match[1] === 'call' && !id(requestId)) return failure('NOT_FOUND');
      const key = `fp-cancel-${invocation.commandId}`;
      if (!id(key)) return failure('INVALID_REQUEST');
      mutation = true;
      const value = await request('/internal/native/first-purchase/cancel', { signal,
        key,
        body: requestId ? { request_id: requestId } : { run_id: match[2] } });
      if (!id(value?.run_id) || !validRun(value, match[1] === 'run' ? match[2] : value.run_id)
        || !['CANCELLING', 'CANCELLED'].includes(value.status)) throw new Error();
      return { kind: 'success', text: 'CANCEL_ACCEPTED: 取消请求已受理；请核对执行是否退出。' };
    } catch (error) {
      // No transport/provider message, prompt, credential or internal path is forwarded.
      if (error instanceof Refused && error.code !== 'SERVICE_UNAVAILABLE') return failure(error.code);
      return failure(mutation ? name === 'first-purchase-cancel' ? 'CANCEL_UNKNOWN' : 'ADMISSION_UNKNOWN' : 'SERVICE_UNAVAILABLE');
    }
  } };
}
