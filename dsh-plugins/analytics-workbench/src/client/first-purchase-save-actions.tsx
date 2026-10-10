import { useEffect, useRef, useState } from 'react';
import { createSaveController, type SaveState } from '../first-purchase-save-client.mjs';
const copy: Record<string, string> = {
  CHECKING: '正在核对 CRM 身份、来源与保存回执…', READY: '来源与权限已核对，可以确认保存。',
  NOT_AVAILABLE: 'NOT_AVAILABLE：保存服务、候选或 CRM 插件尚未配置。', NOT_CONNECTED: '当前对话尚未连接 CRM，请先连接，再核对保存。',
  ACCOUNT_CHANGED: 'CRM 账号已变化，请重新打开卡片；原保存回执保留在原账号下。',
  INTENT_STORAGE_UNAVAILABLE: '无法安全保留保存请求，保存已禁用。请检查浏览器存储后重新打开卡片。',
  RESULT_UNAVAILABLE: '结果或来源暂不可核对，保存已禁用。', SERVICE_UNAVAILABLE: '服务暂不可用，请稍后重新核对。',
  SAVING: '正在保存，请勿重复提交。', SAVED: '已保存为独立分析版本。',
  SAVE_UNKNOWN: 'SAVE_UNKNOWN：保存结果尚不确定，请先核对原回执。', RECONCILE_UNAVAILABLE: '原回执暂不可核对，不生成新保存请求。',
  RECEIPT_NOT_FOUND: 'SAVE_UNKNOWN：暂未查到回执；可核对，或明确重试同一请求。',
  SAVE_CONFLICT: '保存标识与已有记录冲突。保存已停止，请保留标识排查。',
  CANDIDATE_CHANGED: '候选已变化；只核对旧请求，不能以新候选重复保存。',
  ALREADY_SAVED: '该结果已保存，请核对原回执。', PERMISSION_DENIED: '当前 CRM 身份没有保存权限。',
  CANDIDATE_NOT_ADMITTED: '当前候选尚未获服务准入，保存已禁用。', POLICY_NOT_CONFIGURED: '服务端尚未配置保存策略。',
  PROVENANCE_INCOMPLETE: '来源不完整，保存已禁用。', RESULT_STALE: '服务端标记结果陈旧，保存已禁用。',
  RESULT_EXPIRED: '服务端标记结果过期，保存已禁用。', FRESHNESS_UNKNOWN: '服务端暂不能确认结果时效，保存已禁用。',
};
export function FirstPurchaseSaveActions({ sessionId, runId, callId, days }: { sessionId: string | null; runId: string; callId: string; days: number }) {
  const [state, setState] = useState<SaveState>({ phase: 'unavailable', code: 'NOT_AVAILABLE', receipt: null, result: null });
  const controller = useRef<ReturnType<typeof createSaveController> | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Save remains disabled without durable intent storage. */ }
    const create = () => createSaveController({ target: { session_id: sessionId, run_id: runId, call_id: callId }, storage, onChange: setState });
    const connect = () => {
      controller.current?.dispose();
      setState({ phase: 'checking', code: 'CHECKING', receipt: null, result: null });
      controller.current = create(); void controller.current.start();
    };
    connect(); window.addEventListener('crm-connection-changed', connect);
    return () => { controller.current?.dispose(); controller.current = null; window.removeEventListener('crm-connection-changed', connect); };
  }, [sessionId, runId, callId]);
  const busy = ['checking', 'saving'].includes(state.phase);
  return <div data-save-state={state.phase}>
    <button type="button" data-testid="analytics-first-purchase-save-button" disabled={state.phase !== 'ready'}
      onClick={() => { void controller.current?.save(`首购商品路径 / N=${days} · ${runId}`.slice(0, 120)); }}>确认保存分析</button>
    <button type="button" disabled={!sessionId || busy || state.code === 'ACCOUNT_CHANGED'}
      onClick={() => { void controller.current?.reconcile(); }}>核对保存</button>
    {state.phase === 'unknown' && state.code === 'RECEIPT_NOT_FOUND' && <button type="button"
      onClick={() => { void controller.current?.save(''); }}>使用原请求重试</button>}
    <p role="status" aria-live="polite" aria-atomic="true" data-testid="analytics-first-purchase-save-status">{copy[state.code] ?? '保存不可用，请核对服务状态。'}</p>
    {state.result?.provenance.freshness.freshness_state === 'NOT_CHECKED' && <small>时效：暂不检查（服务端策略） · SYNTHETIC</small>}
    {state.receipt && <p>分析 {state.receipt.analysis_ref.analysis_id} · 版本 {state.receipt.analysis_ref.version}<br />回执 {state.receipt.identity.action_id}</p>}
    <button type="button" disabled>加入驾驶舱</button><button type="button" disabled>导出</button><button type="button" disabled>发送</button>
    <small>NOT_AVAILABLE：这些操作尚未接通独立首购服务合同。</small>
  </div>;
}
