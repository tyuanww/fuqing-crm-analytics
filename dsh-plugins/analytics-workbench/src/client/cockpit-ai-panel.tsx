import { useEffect, useId, useMemo, useState } from 'react';
import type { AIState, CockpitAIClient } from './cockpit-ai-client.mjs';
import { HtmlPreview } from './cockpit-page-editor.tsx';
import { loadEditor } from './cockpit-office-editor.tsx';

export function CockpitAIPanel({ client, state, blocked = false }: { client: CockpitAIClient; state: AIState; blocked?: boolean }) {
  const job = state.active;
  if (!job) return state.message ? <p role={state.messageError ? 'alert' : 'status'}>{state.message}</p> : null;
  if (['SAVED', 'CANCELLED'].includes(job.status) && !state.confirmationUncertain) return <>
    {state.messageError && state.message ? <p className="cockpit-live" role="alert">{state.message}</p> : null}
    <details className="cockpit-ai-panel cockpit-ai-complete" data-testid="cockpit-ai-panel">
    <summary>{job.status === 'SAVED' ? `AI 修改已保存 · 版本 ${job.saved_version}` : '本次修改已放弃'}</summary>
    <p>{!state.messageError && state.message || `基于版本 ${job.base_version}，保留原版本。`}</p>
  </details></>;
  return <section className="cockpit-ai-panel" aria-label="AI 修改" data-testid="cockpit-ai-panel">
    <div className="cockpit-notice"><div><strong>{job.status === 'READY' ? '检查 AI 修改' : job.status === 'SAVED' ? 'AI 修改已保存' : job.status === 'CANCELLED' ? '本次修改已放弃' : '在对话中描述修改要求'}</strong>
      <p>{state.confirmationUncertain ? '保存结果待核对，请用同一请求重试。' : job.status === 'WAITING' ? 'AI 完成后收取候选，预览确认后才保存。任务会保留，可稍后回来。' : `基于版本 ${job.base_version}，保留原版本。`}</p></div>
      {['WAITING', 'READY'].includes(job.status) ? <>
        <button disabled={blocked || state.busy || state.confirmationUncertain} onClick={() => void client.openConversation()}>查看 AI 对话</button>
        {job.status === 'WAITING' ? <button className="cockpit-primary" disabled={blocked || state.busy} onClick={() => void client.collect()}>收取修改</button> : <>
          <button disabled={blocked || state.busy || state.confirmationUncertain} aria-pressed={state.previewVariant === 'source'} onClick={() => void client.preview('source')}>预览原版本</button>
          <button disabled={blocked || state.busy || state.confirmationUncertain} aria-pressed={state.previewVariant === 'candidate'} onClick={() => void client.preview()}>预览修改后</button>
          <button className="cockpit-primary" data-testid="ai-confirm" disabled={blocked || state.busy} onClick={() => void client.confirm()}>{state.confirmationUncertain ? '重试保存并核对' : '确认保存新版本'}</button>
        </>}
        <button disabled={blocked || state.busy || state.confirmationUncertain} onClick={() => void client.cancel()}>放弃本次修改</button>
      </> : null}
    </div>
    {state.message ? <p className="cockpit-live" role={state.messageError ? 'alert' : 'status'}>{state.message}</p> : null}
    {state.previewVariant ? <p className="cockpit-muted" role="status">正在查看：{state.previewVariant === 'source' ? '原版本' : 'AI 修改后（尚未保存）'}</p> : null}
    {state.comparison ? <details className="cockpit-ai-diff"><summary>查看文本差异 · {state.comparison.source_size} → {state.comparison.candidate_size} 字节</summary>
      <p>{state.comparison.note}{state.comparison.truncated ? ' 当前差异已截断。' : ''}</p>
      <pre>{state.comparison.text_diff || '此格式暂无文本差异，请使用原版本和修改后预览逐项检查。'}</pre></details> : null}
  </section>;
}

export function CockpitAIPreview({ state }: { state: AIState }) {
  const pkg = useMemo(() => {
    if (!state.html) return null;
    // Normalize complete HTML documents into the existing trusted sandbox wrapper.
    // DOMParser does not execute scripts; untrusted meta/base cannot replace CSP.
    const parsed = new DOMParser().parseFromString(state.html.html, 'text/html');
    parsed.querySelectorAll('meta,base').forEach(node => node.remove());
    return { ...state.html, html: [...parsed.head.children].map(node => node.outerHTML).join('') + parsed.body.innerHTML };
  }, [state.html]);
  if (pkg) return <div className="cockpit-frame-wrap" data-testid="ai-html-preview"><HtmlPreview pkg={pkg} title="AI 修改预览" /></div>;
  if (state.viewer) return <CandidateViewer viewer={state.viewer} />;
  return null;
}

function CandidateViewer({ viewer }: { viewer: NonNullable<AIState['viewer']> }) {
  const id = 'ai-view-' + useId().replace(/:/g, '');
  const [status, setStatus] = useState('正在加载只读预览…');
  useEffect(() => {
    let alive = true, instance: { destroyEditor(): void } | undefined;
    setStatus('正在加载只读预览…');
    void loadEditor(viewer.script_url).then(() => {
      if (!alive) return;
      const sdk = (window as unknown as { DocsAPI?: { DocEditor: new (id: string, config: object) => typeof instance } }).DocsAPI;
      if (!sdk) throw new Error('文档预览 API 未加载。');
      instance = new sdk.DocEditor(id, { ...viewer.config, events: {
        onDocumentReady: () => { if (alive) setStatus('只读预览 · 确认保存后才写入产物库'); },
        onError: () => { if (alive) setStatus('预览失败，请检查文档服务后重新打开预览。'); },
      } });
    }).catch(error => { if (alive) setStatus(error.message); });
    return () => { alive = false; instance?.destroyEditor(); };
  }, [viewer, id]);
  return <div className="cockpit-office" data-testid="ai-office-preview"><p role="status" className="cockpit-muted">{status}</p>{(viewer.config.document as { fileType?: string } | undefined)?.fileType === 'csv' ? <p className="cockpit-muted">CSV 首次打开请在预览内确认编码和分隔符。</p> : null}<div className="cockpit-office-frame"><div id={id} /></div></div>;
}
