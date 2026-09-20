import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { CockpitFileClient } from './cockpit-file-client.mjs';

const scripts = new Map<string, Promise<void>>();
export function loadEditor(url: string) {
  if (!scripts.has(url)) scripts.set(url, new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scripts.delete(url); script.remove(); reject(new Error('文档编辑器未能加载，请检查本地服务。')); };
    document.head.appendChild(script);
  }));
  return scripts.get(url)!;
}

export function CockpitOfficeEditor({ client }: { client: CockpitFileClient }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const id = 'office-' + useId().replace(/:/g, '');
  const editor = state.editor;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (!editor) return;
    setStatus('loading');
    let alive = true, instance: { destroyEditor(): void } | undefined;
    void loadEditor(editor.script_url).then(() => {
      if (!alive) return;
      const sdk = (window as unknown as { DocsAPI?: { DocEditor: new (id: string, config: object) => typeof instance } }).DocsAPI;
      if (!sdk) throw new Error('文档编辑器 API 不可用。');
      instance = new sdk.DocEditor(id, { ...editor.config, events: {
        onDocumentReady: () => { if (alive) setStatus('ready'); },
        onDocumentStateChange: (event: { data: boolean }) => client.changed(event.data),
        onError: () => client.reportError('文档编辑器报告错误，请保留页面并检查服务。'),
      } });
    }).catch(error => { if (alive) { setStatus('error'); client.reportError(error.message); } });
    return () => { alive = false; instance?.destroyEditor(); };
  }, [editor, client, id, attempt]);
  return <div className="cockpit-office" data-testid="cockpit-office-editor">
    <div className="cockpit-document-tools"><span className="cockpit-muted">Office 编辑 · 保存为新版本</span>
      <button className="cockpit-primary" disabled={state.busy || !client.hasUnsavedChanges()} onClick={() => void client.save()}>
        {state.busy ? '正在保存…' : state.confirmationUncertain ? '重试保存并核对' : '保存版本'}
      </button></div>
    {status === 'loading' ? <p className="cockpit-muted" role="status">正在加载文档编辑器…</p> : null}
    {editor?.config.documentType === 'pdf' ? <p className="cockpit-muted">PDF 正文：选择下方“编辑PDF → 编辑文本”，双击文字后修改。</p> : null}
    {status === 'error' ? <button onClick={() => setAttempt(value => value + 1)}>重试加载编辑器</button> : null}
    <div className="cockpit-office-frame" ref={element => { element?.toggleAttribute('inert', state.busy || state.confirmationUncertain); }}><div id={id} /></div>
  </div>;
}
