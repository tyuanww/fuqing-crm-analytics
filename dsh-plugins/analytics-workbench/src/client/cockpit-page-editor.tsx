import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FreeHtmlLibraryStore } from './free-html-library/store.mjs';
import { acceptSelection, acceptTargets, editablePageNodes, selectionSrcdoc, type TextNode } from './html-selection-bridge.mjs';
import { FREE_PAGE_REFERRER_POLICY, FREE_PAGE_SANDBOX } from '../free-page/runtime/isolation-policy.mjs';
import { selectionForAI, type AISourceSelection } from './html-source-selection.mjs';
import { CockpitSidebar } from './CockpitSidebar.tsx';
import type { components } from '../free-page/contract/page-contract.generated.d.ts';
const NO_NODES: TextNode[] = [];

export function HtmlPreview({ pkg, pageId = 'workspace', version = 0, editing = false, selectBlocks = false, nodes = NO_NODES, selected, onSelect, onTargets, title }: {
  pkg: { html: string; css?: string; js?: string; resources?: unknown[]; presentation?: components['schemas']['PagePresentation'] | null }; pageId?: string; version?: number;
  editing?: boolean; selectBlocks?: boolean; nodes?: TextNode[]; selected?: string; onSelect?(node: TextNode | null): void; onTargets?(nodes: TextNode[]): void; title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [unresolved, setUnresolved] = useState(0);
  const callback = useRef(onSelect); callback.current = onSelect;
  const targetsCallback = useRef(onTargets); targetsCallback.current = onTargets;
  const channel = useMemo(() => crypto.randomUUID(), [pkg, pageId, version, editing, selectBlocks]);
  const srcdoc = useMemo(() => selectionSrcdoc(pkg, { channel, pageId, version, nodes, editing, selectBlocks }), [pkg, channel, pageId, version, editing, nodes, selectBlocks]);
  useEffect(() => {
    setUnresolved(0);
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.source === frame.current?.contentWindow && event.origin === 'null' && data?.type === 'cockpit.presentation'
        && data.channel === channel && data.pageId === pageId && data.version === version && Number.isSafeInteger(data.unresolved)
        && data.unresolved >= 0 && data.unresolved <= (pkg.presentation?.edits?.length ?? 0)) setUnresolved(data.unresolved);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [channel, pageId, version, pkg]);
  useEffect(() => {
    if (!editing) return;
    let eligible: TextNode[] = [];
    targetsCallback.current?.([]);
    const receive = (event: MessageEvent) => {
      const context = { source: frame.current?.contentWindow ?? null, channel, pageId, version, nodes };
      const targets = acceptTargets(event, context);
      if (targets !== undefined) { eligible = targets; targetsCallback.current?.(targets); return; }
      const node = acceptSelection(event, { ...context, nodes: eligible });
      if (node !== undefined) callback.current?.(node);
    };
    const request = () => frame.current?.contentWindow?.postMessage({ type: 'cockpit.targets.request', channel, pageId, version }, '*');
    window.addEventListener('message', receive);
    const iframe = frame.current; iframe?.addEventListener('load', request); request();
    return () => { window.removeEventListener('message', receive); iframe?.removeEventListener('load', request); };
  }, [channel, pageId, version, editing, nodes]);
  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage({ type: 'cockpit.highlight', channel, pageId, version, nodeId: selected ?? null }, '*');
    send(); const node = frame.current; node?.addEventListener('load', send);
    return () => node?.removeEventListener('load', send);
  }, [selected, channel, pageId, version]);
  return <>{unresolved > 0 ? <p role="status" className="cockpit-notice">{unresolved} 处已保存修改暂未匹配当前内容。可能被筛选隐藏或页面结构已变化；原修改仍保留。</p> : null}<iframe ref={frame} title={title} data-testid="library-html-preview" className="cockpit-html-frame"
    srcDoc={srcdoc} sandbox={FREE_PAGE_SANDBOX} referrerPolicy={FREE_PAGE_REFERRER_POLICY} /></>;
}
function decodeText(text: string) {
  const node = document.createElement('textarea'); node.innerHTML = text; return node.value;
}
const bindingCopy: Record<string, string> = { UNBOUND_SAMPLE: '未绑定数据', BOUND_VERIFIED: '已核验数据来源', BOUND_STALE: '数据绑定待更新' };
export function CockpitPageEditor({ store, onInspect, onAI, onWholeAI, aiMode = false }: { store: FreeHtmlLibraryStore; onInspect?(): void; onWholeAI?(): void; aiMode?: boolean; onAI?(selection: AISourceSelection, instruction: string): Promise<boolean> }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const current = state.current!;
  const pkg = state.preview?.snapshot ?? current.package;
  const candidates = useMemo(() => editablePageNodes(current.package, current.binding_manifest), [current.package, current.binding_manifest]);
  const locked = state.busy || Boolean(state.preview) || state.confirmationUncertain;
  const editing = state.mode === 'edit' && !locked && state.previewAlive;
  const session = useMemo(() => ({}), [pkg, current.page_id, current.version, editing]);
  const [availability, setAvailability] = useState<{ session: object; nodes: TextNode[] } | null>(null);
  const nodes = editing && availability?.session === session ? availability.nodes : NO_NODES;
  const [aiOpen, setAiOpen] = useState(false), [instruction, setInstruction] = useState(''), [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const sendLock = useRef(false);
  const selected = state.selection?.runtime ? state.selection as unknown as TextNode : candidates.find(row => row.node_id === state.selection?.node_id);
  const selectionAvailable = Boolean(selected && nodes.some(node => node.node_id === selected.node_id));
  const selectedRange = selected?.source ?? selected?.aiSource;
  const original = selected ? selected.runtime ? selected.text : selected.editableText !== false ? decodeText(selected.text) : decodeText(selected.text.replace(/<[^>]*>/g, ' ')).trim() : '';
  const value = state.textDraft?.value ?? original;
  const commitSelection = (node: TextNode | null) => {
    if (!node) { if (!state.textDraft?.changed) store.clearSelection(); return; }
    store.selectLocatable(node); onInspect?.();
    if (aiMode && !store.hasUnsavedChanges()) { setAiOpen(true); setSendError(''); }
  };
  const choose = (node: TextNode | null) => {
    if (!node || nodes.some(item => item.node_id === node.node_id)) commitSelection(node);
  };
  useEffect(() => { setAiOpen(false); setInstruction(''); setSendError(''); }, [current.page_id, current.version, aiMode]);
  const sendAI = async () => {
    if (sendLock.current || !selected || !selectionAvailable || !instruction.trim() || !onAI) return;
    const scope = selectionForAI(current.package, selected);
    if (!scope) { setSendError('当前选区无法对应页面源码，请重新选择。'); return; }
    sendLock.current = true; setSending(true); setSendError('');
    try { if (!await onAI(scope, instruction.trim())) setSendError('暂未进入对话，修改要求已保留，请查看提示后重试。'); }
    catch (error) { setSendError(error instanceof Error ? error.message : '进入对话失败，请重试。'); }
    finally { sendLock.current = false; setSending(false); }
  };
  return <div className="cockpit-editor-layout">
    <div className="cockpit-editor-canvas">
      <div className="cockpit-document-tools">
        <span className="cockpit-badge">{bindingCopy[current.binding_state] ?? current.binding_state}</span>
        <span className="cockpit-muted">{state.mode === 'edit' ? aiMode ? '点选板块，描述你希望 AI 怎样调整' : '点选文字，在右侧修改文案' : '页面预览'}</span>
        <div className="cockpit-tool-actions">
          <button onClick={() => { store.openContext('source'); onInspect?.(); }}>来源与源码</button>
          <button disabled={state.busy} onClick={() => { void store.loadHistory(); onInspect?.(); }}>版本历史</button>
          <button onClick={() => state.previewAlive ? store.stopPreview() : store.restartPreview()}>{state.previewAlive ? '暂停预览' : '恢复预览'}</button>
        </div>
      </div>
      {state.preview ? <div className="cockpit-notice" data-testid="html-patch-preview">
        <div><strong>{state.preview.operation === 'ROLLBACK' ? '回退预览' : '修改预览'}</strong><p>{state.confirmationUncertain ? '保存结果待核对，请重试本次确认。' : '检查画布变化，确认后才会保存新版本。'}</p>
          {state.textDraft ? <p className="cockpit-change"><del>{state.textDraft.original}</del> → <strong>{state.textDraft.value || '（空文本）'}</strong></p> : null}</div>
        <button disabled={state.busy || state.confirmationUncertain} onClick={() => void store.cancelPreview()}>取消预览</button>
        <button className="cockpit-primary" data-testid="html-confirm" disabled={state.busy} onClick={() => void store.confirmPatch()}>{state.confirmationUncertain ? '重试确认' : '确认保存'}</button>
      </div> : null}
      <div className="cockpit-frame-wrap">{state.previewAlive
        ? <HtmlPreview pkg={pkg} pageId={current.page_id} version={current.version} title={current.title}
          editing={editing && !sending} selectBlocks={aiMode} nodes={candidates} selected={state.selection?.node_id} onSelect={commitSelection}
          onTargets={verified => setAvailability({ session, nodes: verified })} />
        : <div className="cockpit-empty"><h2>预览已暂停</h2><p>已保存的页面和当前修改均保留。</p><button onClick={() => store.restartPreview()}>恢复预览</button></div>}
      </div>
    </div>
    <CockpitSidebar visible={state.mode === 'edit' || Boolean(state.contextPanel)}
      title={state.contextPanel === 'source' ? '来源与源码' : state.contextPanel === 'history' ? '版本历史' : '编辑选区'}
      onClose={() => state.contextPanel ? store.closeContext() : store.exitEdit()}>
      {state.contextPanel === 'source' ? <>
        <p className="cockpit-muted">{current.origin_path ? (current.origin_file_id ? '来自手动添加文件：' : '来自工作区副本：') + current.origin_path : '已保存页面'}</p>
        <p>{bindingCopy[current.binding_state] ?? current.binding_state}</p>
        {onWholeAI ? <><p className="cockpit-muted">计算、筛选或页面结构需要整页修改，范围会包含共享源码；业务绑定页仍只允许改样式。</p><button disabled={locked || store.hasUnsavedChanges()} onClick={onWholeAI}>用 AI 调整整页逻辑</button></> : null}
        <pre className="cockpit-source">{current.package.html}</pre>
      </> : state.contextPanel === 'history' ? <>
        <p className="cockpit-muted">回退先预览，确认后保存为新版本。</p>
        {state.historyItems.map(row => <div className="cockpit-history-row" key={row.version}><span>版本 {row.version}{row.version === current.version ? ' · 当前' : ''}</span>
          <button disabled={locked || store.hasUnsavedChanges() || row.version === current.version} onClick={() => void store.previewRollback(row.version)}>预览回退</button></div>)}
        {!state.historyItems.length ? <p>暂无可读取的版本记录。</p> : null}
      </> : <>
        <p className="cockpit-eyebrow">当前选区</p>
        {selected ? <>
          <h3>{original.trim().slice(0, 60) || '空文本'}</h3>
          {!locked && !selectionAvailable ? <p role="status" className="cockpit-muted">当前选区尚未就绪或已被脚本改写，暂不能修改。已有草稿保留。</p> : null}
          {aiOpen ? <div role="dialog" aria-label="调整选中板块" className="cockpit-inline-ai" data-testid="html-ai-composer">
            <label className="cockpit-field">想怎样调整这个板块？<textarea autoFocus rows={5} maxLength={4000} value={instruction} disabled={sending}
              placeholder="例如：把结论改成三点，突出风险，保留其他板块。" onChange={event => setInstruction(event.target.value)} /></label>
            <p className="cockpit-muted">发送后在主对话继续，HTML 会显示在右侧产物栏。</p>
            {sendError ? <p role="alert">{sendError}</p> : null}
            <button className="cockpit-primary" disabled={sending || locked || !selectionAvailable || !instruction.trim()} onClick={() => void sendAI()}>{sending ? '正在进入对话…' : '发送并进入对话'}</button>
            <button disabled={sending} onClick={() => setAiOpen(false)}>取消</button>
          </div> : selected.editableText !== false ? <><label className="cockpit-field">替换文本<textarea data-testid="html-replacement" disabled={locked || !selectionAvailable} value={value}
            rows={6} onChange={event => store.setReplacementText(event.target.value, original)} /></label>
          <p className="cockpit-muted">{selected.runtime ? '只替换显示文案，保留筛选和图表交互，不改计算数据。' : '只替换这段文字。确认前可检查修改效果。'}</p>
          <button className="cockpit-primary" data-testid="html-preview-patch" disabled={locked || !selectionAvailable || value === original}
            onClick={() => void store.previewPatch(value)}>预览修改</button>
          </> : <p className="cockpit-muted">已选中 {selected.tag} 板块，可交给 AI 调整板块内容和局部样式。</p>}
          {!aiOpen && onAI && selectionForAI(current.package, selected) ? <button disabled={locked || !selectionAvailable || store.hasUnsavedChanges()} onClick={() => { setAiOpen(true); setSendError(''); }}>用 AI 修改此选区</button> : null}
          {selectedRange ? <label className="cockpit-field">选择上级板块<select value="" disabled={locked || store.hasUnsavedChanges()} onChange={event => choose(nodes.find(node => node.node_id === event.target.value) ?? null)}><option value="">切换到上级范围</option>{nodes.filter(node => node.source && node.source.start < selectedRange.start && node.source.end >= selectedRange.end).reverse().map(node => <option key={node.node_id} value={node.node_id}>{node.tag} · {decodeText(node.text.replace(/<[^>]*>/g, ' ')).trim().slice(0, 40)}</option>)}</select></label> : null}
          {state.textDraft?.changed && !state.preview ? <button disabled={state.busy} onClick={() => store.discardTextDraft()}>放弃文本修改</button> : null}
        </> : <>
          <div className="cockpit-selection-hint" aria-hidden="true">↖</div>
          <h3>{nodes.length ? '选择文字或板块' : '此页暂无可直接修改的文字'}</h3>
          <p className="cockpit-muted">{nodes.length ? '悬停查看可编辑范围，点击后在这里修改。也可以从下方选择。' : '此处缺少唯一的内容身份。可先用整页 AI 编辑为重复卡片建立稳定标识，再进行块级编辑。'}</p>
        </>}
        {nodes.length ? <label className="cockpit-field">选择内容<select disabled={locked || Boolean(state.textDraft?.changed)}
          value={selectionAvailable ? selected?.node_id : ''} onChange={event => choose(nodes.find(row => row.node_id === event.target.value) ?? null)}>
          <option value="">请选择</option>{nodes.map(node => <option key={node.node_id} value={node.node_id}>{node.tag + ' · ' + (decodeText(node.text.replace(/<[^>]*>/g, ' ')).trim().slice(0, 60) || '空内容')}</option>)}
        </select></label> : null}
        <p className="cockpit-muted">业务绑定数字保持只读。脚本生成的文案可单独修改。</p>
      </>}
    </CockpitSidebar>
  </div>;
}
