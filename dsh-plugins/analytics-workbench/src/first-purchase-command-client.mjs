/** Native commands RPC envelope; no composer or session/prompt replacement. */
export function firstPurchaseCommandEnvelope(sessionId, line, rpcId) {
  return { type: 'client-request', rpcId, method: 'commands/execute',
    payload: { args: { agentId: sessionId, line, submittedAttachments: [] } } };
}
export const FIRST_PURCHASE_CANCEL_COPY = Object.freeze({
  submitting: '正在提交取消…', accepted: '取消已受理，等待执行退出',
  unknown: '取消结果待核对，请用 /first-purchase-status 查看原任务',
  unavailable: '取消暂不可用，请检查 CRM 连接与首购服务',
  inactive: '原任务已无活动执行；没有取消其他任务',
  active: '执行尚未确认退出，请核对原任务',
  error: '取消未完成，可核对后重试',
});
export function firstPurchaseCancelOutcome({ status, body }) {
  if (status !== 200 || body?.type !== 'server-response' || body.result?.ok !== true) return 'unknown';
  const value = body.result.value?.result;
  if (value?.kind === 'success' && value.text === 'CANCEL_ACCEPTED: 取消请求已受理；请核对执行是否退出。') return 'accepted';
  if (value?.kind !== 'error' || typeof value.text !== 'string') return 'unknown';
  if (value.text.startsWith('NO_ACTIVE_RUN:')) return 'inactive';
  if (value.text.startsWith('WORKER_ACTIVE:')) return 'active';
  if (value.text.startsWith('CANCEL_UNKNOWN:')) return 'unknown';
  if (/^(NOT_AVAILABLE|NOT_CONNECTED|PERMISSION_DENIED):/.test(value.text)) return 'unavailable';
  return 'error';
}
