import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FreeHtmlLibraryStore } from './free-html-library/store.mjs';
import { acceptSelection, acceptTargets, editablePageNodes, selectionSrcdoc, type TextNode } from './html-selection-bridge.mjs';
import type { PageNode } from './html-node-graph-bridge.mjs';
import { editorPageCatalog } from './editor-page-nodes.mjs';
import { applyPresentationOverlay } from './presentation-overlay.mjs';
import { previewDirectText, previewNodeEdit } from './presentation-preview.mjs';
import { acceptOperation, channelForAction, createEditOperation, formatCapability, parseStyleDeclaration } from './html-edit-operations.mjs';
import { visualEditorCss } from './html-visual-editor-chrome.mjs';
import { FREE_PAGE_REFERRER_POLICY, FREE_PAGE_SANDBOX } from '../free-page/runtime/isolation-policy.mjs';
import { selectionForAI, type AISourceSelection } from './html-source-selection.mjs';
import { CockpitSidebar } from './CockpitSidebar.tsx';
import { editorSelectionReady, visibleEditorNodes } from './editor-selection.mjs';
import type { components } from '../free-page/contract/page-contract.generated.d.ts';

const NO_NODES: TextNode[] = [];

const STRUCTURED_STYLE_FIELDS = [
  { key: 'color', label: '文字颜色', placeholder: '#805D9D' },
  { key: 'font-size', label: '字号', placeholder: '16px' },
  { key: 'margin', label: '外边距', placeholder: '8px 0' },
  { key: 'padding', label: '内边距', placeholder: '12px' },
  { key: 'border', label: '边框', placeholder: '1px solid #D3C3E8' },
  { key: 'background-color', label: '背景色', placeholder: '#09050D' },
] as const;

function updateStructuredStyle(styleDraft: string, key: string, value: string) {
  const next = parseStyleDeclaration(styleDraft);
  if (value.trim()) next[key] = value.trim();
  else delete next[key];
  return Object.entries(next).map(([name, item]) => `${name}: ${item}`).join('; ');
}

function completePagePackage<T extends { html: string; css: string; js: string; resources: unknown[]; node_map: { node_id: string; kind: string; selector: string }[] }>(
  base: T,
  next: { html: string; css?: string; js?: string; resources?: unknown[]; node_map?: unknown[] },
): T {
  const rows = next.node_map;
  const node_map = Array.isArray(rows) && rows.every((row): row is T['node_map'][number] => {
    if (!row || typeof row !== 'object') return false;
    const item = row as { node_id?: unknown; kind?: unknown; selector?: unknown };
    return typeof item.node_id === 'string' && typeof item.kind === 'string' && typeof item.selector === 'string';
  }) ? rows : base.node_map;
  return {
    ...base,
    html: next.html,
    css: next.css ?? base.css,
    js: next.js ?? base.js,
    resources: next.resources ?? base.resources,
    node_map,
  };
}

export function HtmlPreview({ pkg, overlays = null, overlayNodes = [], pageId = 'workspace', version = 0, editing = false, selectBlocks = false, nodes = NO_NODES, selected, draft = null, onUnresolved, onSelect, onTargets, title }: {
  pkg: { html: string; css?: string; js?: string; resources?: unknown[]; presentation?: components['schemas']['PagePresentation'] | null }; pageId?: string; version?: number;
  overlays?: Record<string, { text?: string; style?: Record<string, string>; attributes?: Record<string, string> }> | null;
  overlayNodes?: Array<{ node_id?: string; source_range?: { start: number; end: number } | null }>;
  editing?: boolean; selectBlocks?: boolean; nodes?: TextNode[]; selected?: string;
  draft?: { nodeId: string; text: string; active: boolean; reset: number; style?: Record<string, string> | null } | null;
  onUnresolved?(count: number): void;
  onSelect?(node: TextNode | null): void; onTargets?(nodes: TextNode[]): void; title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onSelect); callback.current = onSelect;
  const targetsCallback = useRef(onTargets); targetsCallback.current = onTargets;
  const unresolvedCallback = useRef(onUnresolved); unresolvedCallback.current = onUnresolved;
  const draftStyleKey = draft?.style ? Object.entries(draft.style).map(([key, value]) => key + ':' + value).join(';') : '';
  const channel = useMemo(() => crypto.randomUUID(), [pkg, pageId, version, editing, selectBlocks]);
  const framed = useMemo(() => {
    if (!overlays || !Object.keys(overlays).length) return pkg;
    return { ...pkg, html: applyPresentationOverlay(pkg?.html ?? '', overlays, overlayNodes) };
  }, [pkg, overlays, overlayNodes]);
  const srcdoc = useMemo(() => selectionSrcdoc(framed, { channel, pageId, version, nodes, editing, selectBlocks }), [framed, channel, pageId, version, nodes, editing, selectBlocks]);
  useEffect(() => {
    unresolvedCallback.current?.(0);
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.source === frame.current?.contentWindow && event.origin === 'null' && data?.type === 'cockpit.presentation'
        && data.channel === channel && data.pageId === pageId && data.version === version && Number.isSafeInteger(data.unresolved)
        && data.unresolved >= 0 && data.unresolved <= (pkg.presentation?.edits?.length ?? 0)) unresolvedCallback.current?.(data.unresolved);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [channel, pageId, version, pkg]);
  useEffect(() => {
    if (!editing) return;
    let eligible: TextNode[] = [];
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
  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage({
      type: 'cockpit.draft', channel, pageId, version, nodeId: draft?.nodeId ?? null, text: draft?.text ?? '',
      active: Boolean(draft?.active), style: draft?.style ?? null, reset: false,
    }, '*');
    send(); const node = frame.current; node?.addEventListener('load', send);
    return () => node?.removeEventListener('load', send);
  }, [draft?.nodeId, draft?.text, draft?.active, draft?.reset, channel, pageId, version, draftStyleKey]);
  useEffect(() => {
    if (!draft?.reset) return;
    frame.current?.contentWindow?.postMessage({ type: 'cockpit.draft', channel, pageId, version, reset: true }, '*');
  }, [draft?.reset, channel, pageId, version]);
  return <iframe ref={frame} title={title} data-testid="library-html-preview" className="cockpit-html-frame"
    srcDoc={srcdoc} sandbox={FREE_PAGE_SANDBOX} referrerPolicy={FREE_PAGE_REFERRER_POLICY} />;
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
  const catalog = useMemo(() => editorPageCatalog(pkg, current.binding_manifest, { pageId: current.page_id }), [pkg, current.binding_manifest, current.page_id]);
  const locked = state.busy || Boolean(state.preview) || state.confirmationUncertain;
  const editing = state.mode === 'edit' && !locked && state.previewAlive;
  const session = useMemo(() => ({}), [pkg, current.page_id, current.version, editing]);
  const [availability, setAvailability] = useState<{ session: object; nodes: TextNode[] } | null>(null);
  const verified = editing && availability?.session === session ? availability.nodes : null;
  const listed = useMemo(() => candidates.filter(node => node.editableText !== false && !node.runtimeOnly), [candidates]);
  const nodes = visibleEditorNodes(listed, verified);
  const targetsPending = editing && verified === null;
  const [aiOpen, setAiOpen] = useState(false), [instruction, setInstruction] = useState(''), [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [previewNote, setPreviewNote] = useState('');
  const [styleFocus, setStyleFocus] = useState<'style' | 'attribute'>('style');
  const [styleDraft, setStyleDraft] = useState('');
  const [attrName, setAttrName] = useState('title');
  const [attrValue, setAttrValue] = useState('');
  const [structureDraft, setStructureDraft] = useState('');
  const [unresolvedEdits, setUnresolvedEdits] = useState(0);
  const sendLock = useRef(false);
  const selected = state.selection?.runtime ? state.selection as unknown as TextNode : candidates.find(row => row.node_id === state.selection?.node_id);
  const formalNode: PageNode | null = catalog.pageNodes.find(row => row.node_id === (state.selection?.node_id ?? selected?.node_id)) ?? null;
  const selectionAvailable = Boolean(selected) && editorSelectionReady(state.selection);
  const selectedRange = selected?.source ?? selected?.aiSource;
  const original = selected ? selected.richText && selected.editorText ? selected.editorText : selected.runtime ? selected.text : selected.editableText !== false ? decodeText(selected.text) : decodeText(selected.text.replace(/<[^>]*>/g, ' ')).trim() : '';
  const drafted = selected ? state.textDrafts?.[selected.node_id] : undefined;
  const value = state.textDraft && state.textDraft.original === original ? state.textDraft.value : drafted ?? original;
  const editableFormal = formalNode?.mapping === 'valid' && !formalNode.capabilities?.bound ? formalNode : null;
  const styles = parseStyleDeclaration(styleDraft);
  const attributes = attrName && !/javascript:/i.test(attrValue) ? { [attrName]: attrValue } : {};
  const styleProposed = styleFocus === 'attribute'
    ? (attrName && !/javascript:/i.test(attrValue) ? `${attrName}="${attrValue}"` : '')
    : Object.entries(styles).map(([key, item]) => `${key}: ${item}`).join('; ');
  useEffect(() => { setAiOpen(false); setInstruction(''); setSendError(''); setPreviewNote(''); setStyleDraft(''); setAttrValue(''); setStructureDraft(''); }, [current.page_id, current.version, aiMode, formalNode?.node_id]);
  const commitSelection = (node: TextNode | null) => {
    if (!node) { if (!state.textDraft?.changed) store.clearSelection(); return; }
    store.selectLocatable(node); onInspect?.();
    if (aiMode && !store.hasUnsavedChanges()) { setAiOpen(true); setSendError(''); }
  };
  const choose = (node: TextNode | null) => {
    if (!node || nodes.some(item => item.node_id === node.node_id)) commitSelection(node);
  };
  const sendAI = async () => {
    if (sendLock.current || !selected || !selectionAvailable || !instruction.trim() || !onAI) return;
    const scope = selectionForAI(current.package, selected);
    if (!scope) { setSendError('当前选区无法对应页面源码，请重新选择。'); return; }
    sendLock.current = true; setSending(true); setSendError('');
    try { if (!await onAI(scope, instruction.trim())) setSendError('暂未进入对话，修改要求已保留，请查看提示后重试。'); }
    catch (error) { setSendError(error instanceof Error ? error.message : '进入对话失败，请重试。'); }
    finally { sendLock.current = false; setSending(false); }
  };
  const applyFormalText = () => {
    if (!editableFormal?.capabilities?.direct_text) return;
    const op = createEditOperation({
      pageId: current.page_id, baseVersion: current.version, node: editableFormal, channel: channelForAction('set_text'), action: 'set_text',
      original, proposed: value, value,
    });
    const verdict = acceptOperation(op, { pageId: current.page_id, version: current.version, selection: editableFormal, nodes: catalog.pageNodes, apply: true });
    if (!verdict.ok) { setPreviewNote('正式预览未通过，源码字节保持不变'); return; }
    const preview = previewDirectText({
      pagePackage: current.package, pageId: current.page_id, version: current.version, nodeId: editableFormal.node_id, text: value,
      overlays: state.presentation_overlay ?? current.presentation_overlays ?? {}, binding: current.binding_manifest,
    });
    if (!preview.ok || !preview.node_id || typeof store.previewPresentationOverlay !== 'function') {
      setPreviewNote('正式预览未通过，源码字节保持不变');
      return;
    }
    setPreviewNote('');
    store.previewPresentationOverlay(preview.node_id, preview.overlay ?? {}, { kind: preview.kind || editableFormal.kind, idempotencyKey: preview.idempotency_key });
  };
  const applyMapped = (action: 'set_style' | 'set_attribute' | 'replace_structure', payload: Record<string, unknown>, channel: 'presentation' | 'source') => {
    if (!editableFormal) return;
    const op = createEditOperation({
      pageId: current.page_id, baseVersion: current.version, node: editableFormal, action, channel: channelForAction(action),
      styles: payload.styles as Record<string, string> | undefined,
      attributes: payload.attributes as Record<string, string> | undefined,
      structure: typeof payload.structure === 'string' ? payload.structure : undefined,
      proposed: typeof payload.structure === 'string' ? payload.structure : styleProposed,
    });
    const verdict = acceptOperation(op, { pageId: current.page_id, version: current.version, selection: editableFormal, nodes: catalog.pageNodes, apply: true });
    if (!verdict.ok) { setPreviewNote('当前节点不能写入。运行时选区仍只可查看。'); return; }
    const preview = previewNodeEdit({
      pagePackage: current.package, pageId: current.page_id, version: current.version, nodeId: editableFormal.node_id,
      overlays: state.presentation_overlay ?? current.presentation_overlays ?? {}, binding: current.binding_manifest, channel,
      action: channel === 'source' ? 'replace' : 'update',
      payload: channel === 'source' ? payload.structure : (action === 'set_style' ? { style: payload.styles } : { attributes: payload.attributes }),
      keyPrefix: action,
    });
    if (!preview.ok || !preview.node_id) { setPreviewNote('正式预览未通过，已保存版本不变'); return; }
    setPreviewNote('');
    if (channel === 'source' && preview.package && typeof store.previewSourcePackage === 'function') {
      store.previewSourcePackage(completePagePackage(current.package, preview.package), {
        nodeId: preview.node_id, kind: preview.kind || editableFormal.kind, idempotencyKey: preview.idempotency_key,
        structure: typeof payload.structure === 'string' ? payload.structure : undefined,
      });
      return;
    }
    if (typeof store.previewPresentationOverlay === 'function') {
      store.previewPresentationOverlay(preview.node_id, preview.overlay ?? {}, { kind: preview.kind || editableFormal.kind, idempotencyKey: preview.idempotency_key });
    }
  };
  return <div className="cockpit-editor-layout cockpit-visual-editor">
    <style>{visualEditorCss}</style>
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
      {state.preview && !state.silentCommit ? <div className="cockpit-notice" data-testid="html-patch-preview">
        <div><strong>{state.preview.operation === 'ROLLBACK' ? '回退预览' : '修改预览'}</strong><p>{state.confirmationUncertain ? '保存结果待核对，请重试本次确认。' : '检查画布变化，确认后才会保存新版本。'}</p>
          {state.textDraft ? <p className="cockpit-change"><del>{state.textDraft.original}</del> → <strong>{state.textDraft.value || '（空文本）'}</strong></p> : null}</div>
        <button disabled={state.busy || state.confirmationUncertain} onClick={() => void store.cancelPreview()}>取消预览</button>
        <button className="cockpit-primary" data-testid="html-confirm" disabled={state.busy} onClick={() => void store.confirmPatch()}>{state.confirmationUncertain ? '重试确认' : '确认保存'}</button>
      </div> : null}
      <div className="cockpit-frame-wrap">{state.previewAlive
        ? <HtmlPreview pkg={pkg} overlays={state.presentation_overlay ?? current.presentation_overlays ?? null} overlayNodes={catalog.pageNodes} pageId={current.page_id} version={current.version} title={current.title}
          editing={editing && !sending} selectBlocks={aiMode} nodes={candidates} selected={state.selection?.node_id}
          draft={selected ? { nodeId: selected.node_id, text: value, active: value !== original, reset: state.draftReset ?? 0, style: styleFocus === 'style' && Object.keys(styles).length ? styles : null } : null}
          onUnresolved={setUnresolvedEdits}
          onSelect={commitSelection}
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
        {unresolvedEdits > 0 ? <p role="status" className="cockpit-muted" data-testid="html-unresolved-edits">有 {unresolvedEdits} 处已保存修改还没对上当前画面。原修改仍保留，可以继续改字或保存。</p> : null}
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
          <p className="cockpit-muted">{selected.richText ? '整段说明都可以改。左边会立刻显示。句子里的指标原文会留在原标签中，请不要删掉或改写这些数字。保存用右上角。' : selected.runtime ? '输入时左边立刻显示。只替换显示文案，保留筛选和图表交互，不改计算数据。保存用右上角。' : '输入时左边立刻显示。保存用右上角。'}</p>
          </> : <p className="cockpit-muted">已选中 {selected.tag} 板块，可交给 AI 调整板块内容和局部样式。</p>}
          {!aiOpen && onAI && selectionForAI(current.package, selected) ? <button disabled={locked || !selectionAvailable || store.hasUnsavedChanges()} onClick={() => { setAiOpen(true); setSendError(''); }}>用 AI 修改此选区</button> : null}
          {editableFormal && !aiOpen ? <div data-testid="html-node-identity">
            <p className="cockpit-muted" data-testid="html-capability">{formatCapability(editableFormal)}</p>
            {editableFormal.capabilities?.direct_text ? <button type="button" data-testid="html-preview-formal-text" disabled={locked || value === original} onClick={applyFormalText}>按正式合同预览文字</button> : null}
            {editableFormal.capabilities?.style ? <div className="cockpit-structured-styles" data-testid="html-structured-styles">
              <p className="cockpit-muted">结构化样式</p>
              {STRUCTURED_STYLE_FIELDS.map(field => <label className="cockpit-field" key={field.key}>{field.label}
                <input data-testid={`html-style-${field.key}`} disabled={locked}
                  value={styles[field.key] ?? ''} placeholder={field.placeholder}
                  onChange={event => { setStyleFocus('style'); setStyleDraft(updateStructuredStyle(styleDraft, field.key, event.target.value)); }} />
              </label>)}
              <p className="cockpit-muted">这些控件只生成当前稳定节点的局部样式补丁；动态、绑定和无稳定映射区域保持只读。</p>
            </div> : null}
            <label className="cockpit-field">样式声明<textarea data-testid="html-style-declaration" disabled={locked} value={styleDraft} rows={3}
              onChange={event => { setStyleFocus('style'); setStyleDraft(event.target.value); }} placeholder="color: #805D9D" /></label>
            <label className="cockpit-field">属性名<input data-testid="html-attr-name" disabled={locked} value={attrName}
              onChange={event => { setStyleFocus('attribute'); setAttrName(event.target.value.replace(/[^a-zA-Z_:-]/g, '').replace(/^on/i, '')); }} /></label>
            <label className="cockpit-field">属性值<input data-testid="html-attr-value" disabled={locked} value={attrValue}
              onChange={event => { if (/javascript:/i.test(event.target.value)) return; setStyleFocus('attribute'); setAttrValue(event.target.value); }} /></label>
            <p className="cockpit-muted">样式会立刻出现在页面上。取消只收回这次预览，保存后才写入版本。</p>
            <button type="button" disabled={locked || !styleProposed} onClick={() => { setStyleDraft(''); setAttrValue(''); }}>取消样式</button>
            <button className="cockpit-primary" data-testid="html-preview-style" disabled={locked || (styleFocus === 'style' ? !styleProposed : !attrName)}
              onClick={() => applyMapped(styleFocus === 'attribute' ? 'set_attribute' : 'set_style', { styles, attributes }, 'presentation')}>保存样式</button>
            {editableFormal.capabilities?.structure ? <>
              <label className="cockpit-field">替换这一段 HTML<textarea data-testid="html-structure" disabled={locked} value={structureDraft} rows={4}
                onChange={event => setStructureDraft(event.target.value)} placeholder={'<p id="lead">新结构</p>'} /></label>
              <p className="cockpit-muted">结构替换只覆盖当前节点。确认前源码包不变。运行时选区不能改结构。</p>
              <button className="cockpit-primary" data-testid="html-preview-structure" disabled={locked || !structureDraft.trim()}
                onClick={() => applyMapped('replace_structure', { structure: structureDraft }, 'source')}>预览结构</button>
            </> : null}
            {previewNote ? <p className="cockpit-muted" data-testid="html-preview-note">{previewNote}</p> : null}
          </div> : null}
          {selectedRange ? <label className="cockpit-field">选择上级板块<select value="" disabled={locked || store.hasUnsavedChanges()} onChange={event => choose(nodes.find(node => node.node_id === event.target.value) ?? null)}><option value="">切换到上级范围</option>{nodes.filter(node => node.source && node.source.start < selectedRange.start && node.source.end >= selectedRange.end).reverse().map(node => <option key={node.node_id} value={node.node_id}>{node.tag} · {decodeText(node.text.replace(/<[^>]*>/g, ' ')).trim().slice(0, 40)}</option>)}</select></label> : null}
          {state.textDraft?.changed && !state.preview ? <button disabled={state.busy} onClick={() => store.discardTextDraft()}>放弃文本修改</button> : null}
        </> : <>
          <div className="cockpit-selection-hint" aria-hidden="true">↖</div>
          {nodes.length ? <>
            <h3>选择文字或板块</h3>
            <p className="cockpit-muted">悬停查看可编辑范围，点击后在这里修改。也可以从下方选择。</p>
          </> : targetsPending ? <>
            <h3>正在读取页面上的文字</h3>
            <p className="cockpit-muted">脚本生成的文案会在读取完成后出现在这里。</p>
          </> : <>
            <h3>此页暂无可直接修改的文字</h3>
            <p className="cockpit-muted">重复的卡片没有唯一标识，点选会改错对象。可以先用整页 AI 给这些卡片加上稳定标识，再回来改某一块。</p>
            {onWholeAI ? <button type="button" disabled={locked || store.hasUnsavedChanges()} onClick={onWholeAI}>用 AI 调整整页</button> : null}
          </>}
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
