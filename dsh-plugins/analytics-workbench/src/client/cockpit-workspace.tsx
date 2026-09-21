import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ThemeProvider } from './competition-shell/index.ts';
import type { CompetitionColorScheme } from './competition-shell/tokens.ts';
import type { LibraryBoardClient } from './library-board-client.mjs';
import type { FreeHtmlLibraryState, FreeHtmlLibraryStore } from './free-html-library/store.mjs';
import type { createCockpitDelivery, DeliverySnapshot } from './cockpit-delivery.mjs';
import { mergeCockpitProducts, type CockpitProduct } from './cockpit-products.mjs';
import { LibraryLayoutCanvas } from './library-layout-canvas.tsx';
import { CockpitSidebar } from './CockpitSidebar.tsx';
import { CockpitPageEditor, HtmlPreview } from './cockpit-page-editor.tsx';
import { BoardEditor, boardChangeSummary } from './cockpit-board-editor.tsx';
import { createLeaveCoordinator, type LeaveCoordinator } from './leave/leave-coordinator.mjs';
import { LeavePrompt } from './leave/leave-prompt.tsx';
import { cockpitCss } from './cockpit-workspace-style.ts';
import type { CockpitFileClient, FileClientState } from './cockpit-file-client.mjs';
import { CockpitAIPanel, CockpitAIPreview } from './cockpit-ai-panel.tsx';
import type { CockpitAIClient, AIState } from './cockpit-ai-client.mjs';
import { useFloatingRail } from './cockpit-floating-rail.tsx';
import { RailResize } from './cockpit-rail-controls.tsx';
import { CockpitOfficeEditor } from './cockpit-office-editor.tsx';

const noopSubscribe = () => () => {};
const EMPTY_PAGE = { pages: [], current: null, mode: 'browse', busy: false, preview: null, importCandidate: null,
  message: '', confirmationUncertain: false, liveStatus: '' } as unknown as FreeHtmlLibraryState;
const EMPTY_DELIVERY: DeliverySnapshot = { status: 'no-session', sessionId: null, files: [], truncated: false, error: null, epoch: 0, refreshMode: 'manual' };
const EMPTY_FILES: FileClientState = { files: [], status: 'idle', message: '', busy: false, editor: null, dirty: false, confirmationUncertain: false };
const EMPTY_AI: AIState = { jobs: [], active: null, busy: false, confirmationUncertain: false, message: '', comparison: null, viewer: null, html: null };
const groups = [{ key: 'html', name: 'HTML 页面', icon: '</>' }, { key: 'board', name: '数据看板', icon: '▦' },
  { key: 'spreadsheet', name: '表格与 CSV', icon: '▤' }, { key: 'document', name: 'Word 文档', icon: 'W' }, { key: 'pdf', name: 'PDF 文档', icon: 'PDF' }];

function workspacePackage(text: string) {
  const parsed = new DOMParser().parseFromString(text, 'text/html');
  // Build a fragment under the trusted wrapper; untrusted meta/base cannot replace its CSP.
  parsed.querySelectorAll('meta,base').forEach(node => node.remove());
  return { html: [...parsed.head.children].map(node => node.outerHTML).join('') + parsed.body.innerHTML, css: '', js: '', resources: [] };
}
export function LibraryCockpitPanel({ library, goConversation, themeSource, initialSurface = 'board', pageStore, delivery, leaveCoordinator,
  listWorkspaceFiles, openWorkspaceFile, readWorkspaceFile, fileClient, aiClient, extension }: {
  extension?: ReactNode;
  library: LibraryBoardClient; goConversation(): void; leaveCoordinator?: LeaveCoordinator;
  themeSource: { subscribe(listener: () => void): () => void; getSnapshot(): CompetitionColorScheme };
  initialSurface?: 'pages' | 'board'; pageStore?: FreeHtmlLibraryStore;
  delivery?: ReturnType<typeof createCockpitDelivery>;
  fileClient?: CockpitFileClient; aiClient?: CockpitAIClient;
  listWorkspaceFiles?: () => Promise<Array<Record<string, unknown>>>;
  openWorkspaceFile?: (product: Record<string, unknown>) => void;
  readWorkspaceFile?: (product: Record<string, unknown>) => Promise<string | null>;
}) {
  const state = useSyncExternalStore(library.subscribe, library.getSnapshot);
  const page = useSyncExternalStore(pageStore?.subscribe ?? noopSubscribe, pageStore?.getSnapshot ?? (() => EMPTY_PAGE));
  const deliveryState = useSyncExternalStore(delivery?.subscribe ?? noopSubscribe, delivery?.getSnapshot ?? (() => EMPTY_DELIVERY));
  const cabinet = useSyncExternalStore(fileClient?.subscribe ?? noopSubscribe, fileClient?.getSnapshot ?? (() => EMPTY_FILES));
  const ai = useSyncExternalStore(aiClient?.subscribe ?? noopSubscribe, aiClient?.getSnapshot ?? (() => EMPTY_AI));
  const picker = useRef<HTMLInputElement>(null);
  const colorScheme = useSyncExternalStore(themeSource.subscribe, themeSource.getSnapshot);
  const root = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(1440), [rail, setRail] = useState(true), [boardEdit, setBoardEdit] = useState(Boolean(state.fieldDraft || state.editContext));
  const [mobileInspector, setMobileInspector] = useState(false);
  const [htmlAIMode, setHtmlAIMode] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ html: true, board: true, spreadsheet: true, document: true, pdf: true });
  const [search, setSearch] = useState('');
  const [trash, setTrash] = useState(false), [removing, setRemoving] = useState<CockpitProduct | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const removeInFlight = useRef(false);
  const removalBlocked = () => removeInFlight.current || Boolean(fileClient?.getSnapshot().organizing);
  const removeFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!removing && !cabinet.organizing && removeFocus.current) {
      const target = removeFocus.current.isConnected ? removeFocus.current : root.current?.querySelector<HTMLElement>('.cockpit-rail-grab');
      target?.focus(); removeFocus.current = null;
    }
  }, [Boolean(removing), cabinet.organizing]);
  const [presenting, setPresenting] = useState(false);
  const dragged = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const preferences = cabinet.preferences ?? { removed: [], order: [], rail_width: 248 };
  const preferencesReady = !fileClient || Boolean(cabinet.preferencesReady);
  const canOpenProduct = (id: string | null | undefined): id is string => Boolean(id && preferencesReady && !preferences.removed.includes(id));
  const [railWidth, setRailWidth] = useState(248);
  useEffect(() => { setRailWidth(preferences.rail_width); }, [preferences.rail_width]);
  const organize = async (change: Parameters<CockpitFileClient['organize']>[0]) => {
    const ok = await fileClient?.organize(change);
    if (!ok) setNotice(fileClient?.getSnapshot().message || '产物设置未保存，请重试。');
    return ok;
  };
  const floating = useFloatingRail({ saved: cabinet.preferences?.rail_layout, dockWidth: railWidth, onCommit: value => { if (fileClient) void organize({ rail_layout: value }); } });
  const reorder = (id: string, target: string) => {
    const all = products.map(item => item.id);
    const order = all.filter(item => item !== id);
    const index = all.indexOf(target); if (index < 0 || id === target) return;
    order.splice(index, 0, id); void organize({ order });
  };
  useEffect(() => {
    const change = () => setPresenting(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setNotice('当前浏览器不支持全屏，请在桌面浏览器打开驾驶舱。');
    } catch { setNotice('无法进入全屏，请检查浏览器的全屏权限后重试。'); }
  };
  const [selectionId, setSelectedId] = useState<string | null>(() => page.cockpitSelectionId ?? (pageStore?.hasUnsavedChanges() && page.current
    ? 'page:' + page.current.page_id : state.saved ? 'board:' + state.saved.spec.board_id : null));
  const selectedId = canOpenProduct(selectionId) ? selectionId : null;
  const [legacyFiles, setLegacyFiles] = useState<Array<Record<string, unknown>>>([]);
  const [file, setFile] = useState({ text: '', loading: false, error: '' });
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const readSeq = useRef(0), autoOpened = useRef(false);
  const readFileId = useRef<string | null>(null);
  useEffect(() => {
    if (!preferencesReady || !selectionId || !preferences.removed.includes(selectionId)) return;
    // The shared board/page stores outlive this panel. Drop a trashed display
    // intent without discarding their saved versions or any unsaved work.
    readSeq.current++; readFileId.current = null;
    setSelectedId(null); pageStore?.selectCockpitAsset(null);
    setFile({ text: '', loading: false, error: '' });
  }, [selectionId, preferencesReady, preferences.removed, pageStore]);
  const lastPage = useRef(page.current?.page_id);
  const shown = state.preview?.snapshot ?? state.layoutDraft ?? state.saved;
  const files = useMemo(() => [...(delivery ? deliveryState.files : legacyFiles), ...cabinet.files.map(item => ({
    ...item, id: 'cabinet:' + item.file_id, title: item.filename, path: item.filename,
    source: 'file-library', subtitle: 'v' + item.version, sessionTitle: item.origin.session_title,
  }))], [delivery, deliveryState.files, legacyFiles, cabinet.files]);
  const products = mergeCockpitProducts({ files, pages: page.pages, boards: state.boards }).sort((a, b) => {
    const rank = (id: string) => { const i = preferences.order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    return rank(a.id) - rank(b.id);
  });
  const visibleProducts = products.filter(item => preferences.removed.includes(item.id) === trash).filter(item => [item.title, item.path, item.sessionTitle].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  const availableProducts = products.filter(item => canOpenProduct(item.id));
  const selected = availableProducts.find(item => item.id === selectedId) ?? null;
  const previewBoardId = state.preview && !pageStore?.hasUnsavedChanges() && canOpenProduct('board:' + state.preview.snapshot.spec.board_id) ? state.preview.snapshot.spec.board_id : null;
  const boardVisible = Boolean(previewBoardId) || selectedId?.startsWith('board:') || (!selectedId && initialSurface === 'board' && shown && canOpenProduct('board:' + shown.spec.board_id));
  const savedHtml = Boolean(page.current && selectedId === 'page:' + page.current.page_id);
  const officeEditing = Boolean(selected?.file_id && cabinet.editor?.file_id === selected.file_id);
  const editing = boardVisible ? boardEdit : officeEditing || savedHtml && page.mode === 'edit';
  const busy = state.busy || page.busy || file.loading || cabinet.busy || ai.busy;
  const uncertain = state.confirmationUncertain || page.confirmationUncertain || cabinet.confirmationUncertain || ai.confirmationUncertain;
  const dirty = () => library.hasUnsavedChanges() || Boolean(pageStore?.hasUnsavedChanges()) || Boolean(fileClient?.hasUnsavedChanges()) || Boolean(aiClient?.hasUnsavedChanges());
  const rawPackage = useMemo(() => file.text ? workspacePackage(file.text) : null, [file.text]);
  const coordinator = useMemo(() => leaveCoordinator ?? createLeaveCoordinator({
    snapshot: () => ({ ...library.getSnapshot(), htmlUnsaved: Boolean(pageStore?.hasUnsavedChanges() || fileClient?.hasUnsavedChanges() || aiClient?.hasUnsavedChanges()),
      confirmationUncertain: library.getSnapshot().confirmationUncertain || Boolean(pageStore?.getSnapshot().confirmationUncertain) || Boolean(fileClient?.getSnapshot().confirmationUncertain) || Boolean(aiClient?.getSnapshot().confirmationUncertain) }),
    beginEpoch: kind => library.beginNavigation(kind),
    save: async () => {
      if (aiClient?.hasUnsavedChanges()) { const result = await aiClient.persistForLeave(); if (!result.ok) return result; }
      if (fileClient?.hasUnsavedChanges()) { const result = await fileClient.persistForLeave(); if (!result.ok) return result; }
      if (pageStore?.hasUnsavedChanges()) { const result = await pageStore.persistForLeave(); if (!result.ok) return result; }
      return library.saveForLeave();
    },
    discard: async () => {
      if (aiClient?.hasUnsavedChanges()) return { ok: false, reason: 'confirmation_uncertain' };
      if (fileClient?.hasUnsavedChanges()) { const result = await fileClient.discardForLeave(); if (!result.ok) return result; }
      if (pageStore?.hasUnsavedChanges()) { const result = await pageStore.discardForLeave(); if (!result.ok) return result; }
      return library.discardDraft();
    },
    navigate: intent => intent.performLocal?.(),
  }), [leaveCoordinator, library, pageStore, fileClient, aiClient]);
  useEffect(() => () => { if (!leaveCoordinator) coordinator.dispose(); }, [coordinator, leaveCoordinator]);
  const guard = (action: () => void | Promise<void>) => {
    if (!busy) void coordinator.request({ kind: 'asset', performLocal: action });
  };
  const back = () => { if (busy) return; if (leaveCoordinator) goConversation(); else guard(goConversation); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (presenting || removing || event.key !== 'Escape' || event.defaultPrevented || coordinator.getSnapshot().status !== 'idle' || state.preview || state.layoutDraft || page.preview) return;
      if (page.contextPanel) pageStore?.closeContext();
      else if (boardEdit) guard(() => setBoardEdit(false));
      else if (page.mode === 'edit') guard(() => pageStore?.exitEdit());
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [coordinator, boardEdit, page.contextPanel, page.mode, state.preview, state.layoutDraft, page.preview, busy, presenting, removing]);
  const isDirty = dirty();
  useEffect(() => {
    if (!isDirty || leaveCoordinator) return;
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [library, pageStore, isDirty, leaveCoordinator]);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (state.layoutDraft) root.current?.querySelector<HTMLElement>('.sm-layout-scroll')?.focus();
  }, [Boolean(state.layoutDraft)]);
  useEffect(() => {
    const active = document.activeElement;
    if (uncertain && !busy && (active === document.body || (active && root.current?.contains(active)))) {
      root.current?.querySelector<HTMLButtonElement>('[data-testid="library-inspect-confirmation"], [data-testid="html-confirm"]')?.focus();
    }
  }, [uncertain, busy]);
  const refresh = async () => {
    setNotice('');
    await Promise.all([aiClient?.refresh(), library.refresh(), pageStore?.refreshPages(), fileClient?.refresh(), delivery ? delivery.refresh() : listWorkspaceFiles?.().then(value => { if (!Array.isArray(value)) throw new Error('文件列表格式错误'); setLegacyFiles(value); }).catch(() => setNotice('工作区文件读取失败，请重试。'))]);
  };
  useEffect(() => { void refresh(); return () => { readSeq.current++; }; }, [library, pageStore, delivery, listWorkspaceFiles]);
  useEffect(() => {
    if (!root.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (width < 1180 && editing) setRail(false); }, [width, editing]);
  useEffect(() => { if (width < 760 && (ai.active || ai.html || ai.viewer)) setRail(false); }, [width, ai.active?.id, ai.html, ai.viewer]);
  useEffect(() => { if (state.preview || state.layoutDraft || page.preview) setMobileInspector(false); }, [state.preview, state.layoutDraft, page.preview]);
  useEffect(() => {
    if (!preferencesReady) return;
    if (page.current?.page_id && page.current.page_id !== lastPage.current && canOpenProduct('page:' + page.current.page_id)) { setSelectedId('page:' + page.current.page_id); pageStore?.selectCockpitAsset('page:' + page.current.page_id); }
    lastPage.current = page.current?.page_id;
  }, [page.current?.page_id, preferencesReady, preferences.removed]);
  useEffect(() => {
    // Native tool cards can open a new, unsaved board while the panel is unmounted.
    // Its preview is the display intent, even if the last selection was HTML.
    if (!previewBoardId) return;
    readSeq.current++; readFileId.current = null;
    setFile({ text: '', loading: false, error: '' });
    setSelectedId('board:' + previewBoardId); pageStore?.selectCockpitAsset('board:' + previewBoardId);
  }, [previewBoardId, pageStore]);
  const source = deliveryState.sessionId;
  const lastSource = useRef(source);
  useEffect(() => {
    if (!delivery || lastSource.current === source) return;
    lastSource.current = source;
    if (!dirty() && selected?.source === 'workspace-file') { readSeq.current++; setSelectedId(null); pageStore?.selectCockpitAsset(null); setFile({ text: '', loading: false, error: '' }); autoOpened.current = false; }
    void delivery.refresh();
  }, [source, delivery]);

  const fileReadIdentity = (item: CockpitProduct) => item.id + ':' + (cabinet.files.find(row => row.file_id === item.file_id)?.version ?? 0);
  const open = async (item: CockpitProduct) => {
    if (!canOpenProduct(item.id)) return;
    if (cabinet.editor && cabinet.editor.file_id !== item.file_id && !await fileClient?.closeEditor()) return;
    fileClient?.clearMessage();
    const seq = ++readSeq.current; setNotice(''); setBoardEdit(false);
    readFileId.current = item.kind === 'html' && !item.page_id ? fileReadIdentity(item) : null;
    if (item.board_id) {
      if (library.getSnapshot().saved?.spec.board_id !== item.board_id) await library.openBoard(item.board_id);
      if (library.getSnapshot().saved?.spec.board_id !== item.board_id) return;
    } else if (item.page_id && pageStore) {
      if (!await pageStore.openPage(item.page_id)) return;
    }
    setSelectedId(item.id); pageStore?.selectCockpitAsset(item.id);
    if (width < 760) setRail(false);
    if (item.kind === 'html' && !item.page_id) {
      setFile({ text: '', loading: true, error: '' });
      try {
        const text = item.file_id && fileClient ? new TextDecoder().decode(await fileClient.read(item.file_id)) : delivery && item.path ? await delivery.readFile(item.path, { sessionId: item.sessionId }).then(result => {
          if (result.status !== 'ok') throw new Error('文件未能完整读取，请刷新后重试。'); return result.text;
        }) : await readWorkspaceFile?.(item);
        if (seq !== readSeq.current) return;
        if (typeof text !== 'string' || !text.trim()) throw new Error('文件为空或暂不可读取。');
        setFile({ text, loading: false, error: '' });
      } catch (error) { if (seq === readSeq.current) setFile({ text: '', loading: false, error: error instanceof Error ? error.message : '文件读取失败' }); }
    } else {
      setFile({ text: '', loading: false, error: '' });
      if (!item.page_id && !item.board_id && !fileClient) openWorkspaceFile?.(item);
    }
  };
  useEffect(() => {
    if (selectedId || autoOpened.current || busy || state.preview || dirty()) return;
    if (!preferencesReady) return;
    const pending = ai.jobs.map(job => availableProducts.find(item => job.target_kind === 'page' ? item.page_id === job.target_id : item.file_id === job.target_id)).find(Boolean);
    const first = pending ?? (initialSurface === 'board' ? availableProducts.find(item => item.kind === 'board') ?? availableProducts[0] : availableProducts.find(item => item.kind === 'html') ?? availableProducts[0]);
    if (first) { autoOpened.current = true; void open(first); }
  }, [selectedId, files, page.pages, state.boards, ai.jobs, busy, preferencesReady, preferences.removed]);
  useEffect(() => {
    // The shared store keeps selection across host panel switches, but the file
    // body is local. Re-read the exact session/path once when that row returns.
    if (busy || previewBoardId || dirty() || selected?.kind !== 'html' || selected.page_id || readFileId.current === fileReadIdentity(selected)) return;
    void open(selected);
  }, [selectedId, files, busy, previewBoardId]);

  const createImport = async () => {
    if (!selected?.path || (!selected.sessionId && !selected.file_id) || !pageStore || !file.text) return;
    const item = selected;
    await pageStore.previewImport({ html: file.text, path: item.path!, sessionId: item.sessionId, artifactId: item.file_id, title: item.title,
      readResource: async path => {
        if (!delivery || !item.sessionId) return null;
        const bytes = await delivery.readBytes(path, { sessionId: item.sessionId });
        return { bytes };
      } });
  };
  const addFiles = async (input: FileList | null) => {
    if (!input || !fileClient) return;
    const chosen = Array.from(input);
    guard(async () => {
      for (const upload of chosen) {
        const added = await fileClient.upload(upload);
        if (added) await open({ id: 'cabinet:' + added.file_id, file_id: added.file_id, path: added.filename, title: added.filename, kind: added.kind, source: 'file-library' });
      }
    });
  };
  const editDocument = async () => {
    if (!selected || !fileClient) return;
    let id = selected.file_id;
    if (!id && selected.sessionId && selected.path && delivery) {
      setFile({ text: '', loading: true, error: '' });
      try {
        const bytes = await delivery.readBytes(selected.path, { sessionId: selected.sessionId });
        const added = await fileClient.upload(new File([bytes], selected.title), { kind: 'session', session_id: selected.sessionId, path: selected.path, session_title: selected.sessionTitle ?? selected.sessionId });
        if (!added) return;
        id = added.file_id; setSelectedId('cabinet:' + id); pageStore?.selectCockpitAsset('cabinet:' + id);
      } catch (error) { setNotice(error instanceof Error ? error.message : '文件读取失败。'); return; }
      finally { setFile({ text: '', loading: false, error: '' }); }
    }
    if (id) await fileClient.openEditor(id);
  };
  useEffect(() => {
    aiClient?.select(selected?.page_id ? 'page' : 'file', selected?.page_id ?? selected?.file_id ?? '');
  }, [selected?.page_id, selected?.file_id, ai.jobs, ai.busy]);
  const beginAI = async () => {
    if (!selected || !aiClient || !fileClient) return;
    if (cabinet.editor && !await fileClient.closeEditor()) return;
    if (selected.page_id && page.current) { await aiClient.begin('page', selected.page_id, page.current.version); return; }
    let item = cabinet.files.find(row => row.file_id === selected.file_id);
    if (!item && selected.sessionId && selected.path && delivery) {
      setFile(current => ({ ...current, loading: true }));
      try {
        const bytes = await delivery.readBytes(selected.path, { sessionId: selected.sessionId });
        item = await fileClient.upload(new File([bytes], selected.title), { kind: 'session', session_id: selected.sessionId, path: selected.path, session_title: selected.sessionTitle ?? selected.sessionId }) ?? undefined;
        if (item) { setSelectedId('cabinet:' + item.file_id); pageStore?.selectCockpitAsset('cabinet:' + item.file_id); }
      } catch (error) { setNotice(error instanceof Error ? error.message : '文件读取失败。'); }
      finally { setFile(current => ({ ...current, loading: false })); }
    }
    if (item) await aiClient.begin('file', item.file_id, item.version);
  };
  const confirmRemoval = async () => {
    if (!removing || removalBlocked()) return;
    removeInFlight.current = true; setRemovePending(true); setNotice('');
    try {
      if (removing.id === selectedId && cabinet.editor && !await fileClient?.closeEditor()) {
        setNotice(fileClient?.getSnapshot().message || '文档编辑器未能关闭，请重试。'); return;
      }
      if (!await organize({ remove: removing.id })) return;
      if (removing.id === selectedId) { readSeq.current++; setSelectedId(null); pageStore?.selectCockpitAsset(null); setFile({ text: '', loading: false, error: '' }); autoOpened.current = true; }
      setRemoving(null); setNotice('已移入回收站，可在产物列表下方恢复。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除未完成，请重试。');
    } finally {
      removeInFlight.current = false; setRemovePending(false);
    }
  };
  const title = boardVisible ? shown?.spec.title ?? '数据看板' : selected?.title ?? '产物预览';
  const message = notice || (boardVisible ? state.message : savedHtml || page.importCandidate ? page.message : cabinet.message);
  const version = boardVisible ? state.saved?.spec.version : savedHtml ? page.current?.version : cabinet.files.find(item => item.file_id === selected?.file_id)?.version;
  return <ThemeProvider colorScheme={colorScheme} className="sm-library-theme"><style>{cockpitCss}</style>
    <main ref={root} className="sm-library-workspace" data-testid="library-workspace" aria-busy={busy} data-mobile-inspector={mobileInspector} data-presenting={presenting}>
      {presenting ? <button className="cockpit-exit-fullscreen" onClick={() => void fullscreen()}>退出全屏 · Esc</button> : null}
      <header className="sm-library-pagehead" data-testid="sm-library-pagehead">
        <div className="cockpit-heading"><button data-testid="sm-cockpit-back" aria-label="返回对话" onClick={back}>← <span className="cockpit-back-label">返回对话</span></button>
          <div><h1 ref={heading} tabIndex={-1}>项目驾驶舱</h1><small>历史交付 · 文件 · 预览与编辑</small></div></div>
        <div className="cockpit-head-actions">{extension}<button data-testid="cockpit-fullscreen" onClick={() => void fullscreen()}>全屏展示</button><button aria-expanded={rail} onClick={() => setRail(!rail)}>{rail ? '收起产物' : '产物列表'}</button>
          {fileClient ? <><input ref={picker} type="file" hidden multiple accept=".html,.htm,.docx,.doc,.odt,.rtf,.xlsx,.xls,.ods,.csv,.pdf" data-testid="cockpit-file-picker"
            onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} />
            <button disabled={busy || uncertain} onClick={() => picker.current?.click()}>添加产物</button></> : null}
          {aiClient && selected && !boardVisible ? <button disabled={busy || uncertain} onClick={() => guard(async () => { if (savedHtml && pageStore && !page.current?.binding_manifest?.result_refs?.length) { setHtmlAIMode(true); pageStore.enterEdit(); setMobileInspector(true); } else await beginAI(); })}>用 AI 改</button> : null}
          {!boardVisible && selected?.kind === 'html' && !selected.page_id ? <button className="cockpit-primary" data-testid="html-import-start"
            disabled={busy || ai.active?.status === 'READY' || !file.text || Boolean(page.importCandidate) || uncertain || !pageStore}
            onClick={() => guard(createImport)}>保存为可编辑副本</button>
            : !boardVisible && selected && !selected.page_id && fileClient ? <button className="cockpit-primary" disabled={busy || uncertain || ai.active?.status === 'READY'}
              onClick={() => guard(officeEditing ? async () => { await fileClient.closeEditor(); } : editDocument)}>{officeEditing ? '完成编辑' : selected.file_id ? '编辑文件' : '保存副本并编辑'}</button>
            : <button data-testid="cockpit-edit-btn" className={editing ? '' : 'cockpit-primary'} aria-pressed={editing}
              disabled={busy || uncertain || ai.active?.status === 'READY' || Boolean(page.preview) || (!savedHtml && !(boardVisible && state.saved))}
              onClick={() => {
                if (editing) guard(() => { if (boardVisible) setBoardEdit(false); else pageStore?.exitEdit(); });
                else { if (boardVisible) setBoardEdit(true); else { setHtmlAIMode(false); pageStore?.enterEdit(); } if (width < 1180) setRail(false); }
              }}>{editing ? '完成编辑' : '编辑'}</button>}
        </div>
      </header>
      <div className="cockpit-shell-body">
        <div ref={floating.ref} className="cockpit-rail-container" hidden={!rail} data-floating={Boolean(floating.layout)} style={floating.style}>
        <aside className="sm-library-rail" hidden={!rail} aria-label="产物列表">
          <div className="cockpit-rail-heading"><h2><button className="cockpit-rail-grab" aria-label="拖动产物面板" title="拖动整个面板，或用方向键移动" {...floating.move}
            onKeyDown={event => { if (event.key.startsWith('Arrow') && width >= 760) { event.preventDefault(); floating.nudge(event.key, event.shiftKey); } }}><span aria-hidden="true">⠿ </span>{trash ? '回收站' : '产物'}</button></h2>
            {floating.layout ? <button onClick={floating.dock} aria-label="将产物面板停靠左侧" title="停靠左侧">停靠</button> : null}<button disabled={busy || dirty()} onClick={() => void refresh()} aria-label="刷新产物">刷新</button></div>
          <label className="cockpit-field"><span>查找产物</span><input type="search" placeholder="名称或来源对话" value={search} onChange={event => setSearch(event.target.value)} /></label>

          {delivery && deliveryState.status === 'loading' ? <p role="status" className="cockpit-muted">正在查找历史产物…</p> : null}
          {deliveryState.history?.error ? <div className="cockpit-rail-status" role="alert"><p className="cockpit-muted">{deliveryState.history.error}</p><button disabled={busy || dirty()} onClick={() => void refresh()}>重试历史汇总</button></div> : null}
          {Boolean(deliveryState.history?.failures?.length) ? <p role="status" className="cockpit-muted">{deliveryState.history!.failures!.length} 个历史会话暂不可读取，可刷新重试。</p> : null}
          {Boolean(deliveryState.history?.unsupportedPaths) ? <p role="status" className="cockpit-muted">部分交付位于会话工作区外，尚未收录，可手动添加。</p> : null}
          {delivery && (deliveryState.status === 'error' || deliveryState.status === 'no-session' && !deliveryState.history) ? <div className="cockpit-rail-status" role={deliveryState.status === 'error' ? 'alert' : 'status'}>
            <p className="cockpit-muted">{deliveryState.status === 'error' ? '会话文件读取失败。已保存产物仍可使用。' : '尚未选择来源会话。回到对话后再打开驾驶舱。'}</p>
            {deliveryState.status === 'error' ? <button disabled={busy} onClick={() => void delivery.refresh()}>重试</button> : null}
          </div> : null}
          {deliveryState.truncated ? <p role="status" className="cockpit-muted">文件较多，当前显示有界扫描结果，列表未包含全部文件。</p> : null}
          {cabinet.status === 'error' ? <p role="alert" className="cockpit-muted">已添加文件的列表暂不可读取，可刷新重试。</p> : null}
          <div className="sm-library-products" data-testid="library-products">
            {groups.map(group => {
              const rows = visibleProducts.filter(item => item.kind === group.key);
              if (!rows.length) return null;
              return <div key={group.key}><button className="cockpit-group" aria-expanded={expanded[group.key]} data-testid={'library-panel-' + (group.key === 'html' ? 'pages' : group.key)}
                onClick={() => setExpanded(current => ({ ...current, [group.key]: !current[group.key] }))}><span>{expanded[group.key] ? '⌄' : '›'}　{group.name}</span><span>{rows.length}</span></button>
                <ul hidden={!expanded[group.key]}>{rows.map(item => <li key={item.id} data-kind={item.kind} data-product-id={item.id}
                  data-selected={selectedId === item.id ? '1' : '0'} data-drag-over={dragOver === item.id}
                  onDragOver={event => { if (!dragged.current || trash || cabinet.organizing || products.find(row => row.id === dragged.current)?.kind !== item.kind) return; event.preventDefault(); setDragOver(item.id); }}
                  onDrop={event => { event.preventDefault(); const id = dragged.current; dragged.current = null; setDragOver(null); if (id && !trash && !cabinet.organizing && products.find(row => row.id === id)?.kind === item.kind) reorder(id, item.id); }}>
                  {!trash ? <button className="cockpit-drag" aria-label={'拖动排序：' + item.title} title="拖动排序，或按上下方向键移动"
                    draggable={Boolean(fileClient && cabinet.preferencesReady && !cabinet.organizing)} disabled={!fileClient || !cabinet.preferencesReady} aria-disabled={Boolean(cabinet.organizing)}
                    onDragStart={event => { dragged.current = item.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }}
                    onDragEnd={() => { dragged.current = null; setDragOver(null); }}
                    onKeyDown={event => { if (cabinet.organizing) { if (event.key.startsWith('Arrow')) event.preventDefault(); return; } const i = rows.indexOf(item), next = rows[i + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)];
                      if (next && next !== item) { event.preventDefault(); reorder(item.id, next.id); } }}>⠿</button> : null}
                  <button className="cockpit-product" data-testid="library-product-open" aria-current={selectedId === item.id} disabled={busy || uncertain || trash}
                    title={[item.title, item.path, item.sessionTitle && '来自：' + item.sessionTitle, item.subtitle].filter(Boolean).join('\n')}
                    onClick={() => guard(() => open(item))}><span className="cockpit-file-icon" aria-hidden="true">{group.icon}</span>
                    <span className="cockpit-product-copy"><strong>{item.title}</strong></span></button>
                  <button className="cockpit-product-delete" aria-label={(trash ? '恢复产物：' : '删除产物：') + item.title}
                    disabled={busy || uncertain || !fileClient || !cabinet.preferencesReady || cabinet.organizing}
                    onClick={event => { const trigger = event.currentTarget; if (trash) { removeFocus.current = trigger; void organize({ restore: item.id }); } else guard(() => { removeFocus.current = trigger; setNotice(''); setRemoving(item); }); }}>{trash ? '恢复' : '×'}</button>
                </li>)}</ul></div>;
            })}
            {!visibleProducts.length && deliveryState.status !== 'loading' ? <p className="cockpit-muted" data-testid="library-products-empty">{search ? '没有匹配的产物。' : trash ? '回收站为空。' : '暂无产物。历史交付的 HTML、表格、Word 和 PDF 会出现在这里。'}</p> : null}
            {deliveryState.history?.nextCursor ? <button disabled={busy || dirty() || deliveryState.status === 'loading'} onClick={() => void delivery?.loadMore()}>加载更多历史产物</button> : null}
          </div>
          <div className="cockpit-rail-footer">{fileClient ? <button aria-pressed={trash} onClick={() => setTrash(!trash)}>{trash ? '返回产物' : '回收站'}</button> : null}<p className="cockpit-muted">{deliveryState.history ? `已检查 ${deliveryState.history.examined ?? 0} / ${deliveryState.history.totalSessions ?? '—'} 个历史会话。` : '生成新内容请回到原生对话。'}<br />刷新可获取最新交付记录。</p></div>
        </aside>
        {rail && width >= 760 ? <RailResize width={floating.width} max={Math.max(180, Math.min(480, width - 360))}
          onCommit={value => { if (floating.layout) floating.resizeWidth(value); else { setRailWidth(value); if (fileClient) void organize({ rail_width: value }); } }} /> : null}
        {floating.layout && width >= 760 ? <button className="cockpit-rail-corner" aria-label="缩放产物面板" title="拖动缩放，或用方向键调整" {...floating.resize}
          onKeyDown={event => { if (event.key.startsWith('Arrow')) { event.preventDefault(); floating.nudge(event.key, event.shiftKey, true); } }}>↘</button> : null}
        </div>
        <section className="sm-library-canvas" aria-label="产物工作区">
          <div className="sm-library-pathbar" data-testid="library-pathbar"><div><h2 title={title}>{title}</h2></div>
            <span className={'cockpit-badge' + (dirty() ? ' pending' : '')}>{uncertain ? '保存待核对' : dirty() ? '有未保存修改' : version ? '版本 ' + version + (officeEditing ? ' · 编辑中' : '') : selected ? '只读预览' : '请选择产物'}</span></div>
          {message ? <p className="cockpit-live" role="status" data-testid="library-message">{message}</p> : null}
          {aiClient && !boardVisible ? <CockpitAIPanel client={aiClient} state={ai} blocked={Boolean(library.hasUnsavedChanges() || pageStore?.hasUnsavedChanges() || fileClient?.hasUnsavedChanges())} /> : null}
          {file.error ? <p className="cockpit-error" role="alert">{file.error} <button onClick={() => selected && void open(selected)}>重试读取</button></p> : null}
          {width < 760 && (editing || Boolean(page.contextPanel)) ? <div className="cockpit-mobile-context" aria-label="工作区视图">
            <button aria-pressed={!mobileInspector} onClick={() => setMobileInspector(false)}>画布预览</button>
            <button aria-pressed={mobileInspector} onClick={() => setMobileInspector(true)}>编辑设置</button>
          </div> : null}
          <div className="cockpit-content">
            {!boardVisible && (ai.html || ai.viewer) ? <CockpitAIPreview state={ai} /> : boardVisible ? <div className="cockpit-editor-layout"><div className="cockpit-editor-canvas">
              {state.preview ? <div className="cockpit-notice" data-testid="library-preview-banner"><div><strong>{state.preview.operation === 'ROLLBACK' ? '回退预览' : state.preview.operation === 'LAYOUT' ? '布局已通过检查' : '修改预览'}</strong>
                <p>{uncertain ? '保存结果待核对，请重试确认或核对结果。' : '尚未保存。画布已显示候选内容，确认后才保存。'}</p>
                {state.preview.operation === 'PATCH' && state.editContext ? <p data-testid="library-edit-diff">{boardChangeSummary(state.editContext.block, shown?.spec.blocks.find(row => row.block_id === state.editContext?.block_id))}</p> : null}</div>
                {uncertain ? <button data-testid="library-inspect-confirmation" disabled={busy} onClick={() => void library.inspectConfirmation()}>核对保存结果</button> : null}
                <button data-testid="library-cancel" disabled={busy} onClick={() => void library.cancel()}>{uncertain ? '尝试取消未应用草稿' : state.preview.operation === 'LAYOUT' ? '返回调整' : '取消预览'}</button>
                <button className="cockpit-primary" data-testid="library-confirm" disabled={busy} onClick={() => void library.confirm()}>{uncertain ? '重试确认' : '确认保存'}</button></div> : null}
              {state.layoutDraft ? <div className="cockpit-notice" data-testid="library-layout-banner"><div><strong>调整布局</strong><p>拖动手柄或用方向键调整，检查后再确认。</p></div>
                <button data-testid="layout-cancel" disabled={busy} onClick={() => void library.cancel()}>取消布局</button><button className="cockpit-primary" data-testid="layout-preview" disabled={busy} onClick={() => void library.previewLayout()}>检查布局</button></div> : null}
              <div className="cockpit-board-wrap" data-testid="library-board-view">{shown ? <LibraryLayoutCanvas snapshot={shown} editing={Boolean(state.layoutDraft)} disabled={busy || uncertain || Boolean(state.preview)}
                updateLayout={library.updateLayout} selectedBlockId={state.editContext?.block_id}
                selectBlock={boardEdit && !state.preview && !state.layoutDraft ? id => guard(async () => { await library.selectComponent(id); setMobileInspector(true); }) : undefined} />
                : <div className="cockpit-empty" data-testid="library-board-empty"><h2>还没有看板</h2><p>在原生对话生成后，回到这里查看。</p></div>}</div>
            </div><CockpitSidebar visible={boardEdit} title="编辑看板" onClose={() => guard(() => setBoardEdit(false))}>
              <BoardEditor library={library} state={state} />
              {!state.editContext && !state.preview && !state.layoutDraft ? <div className="cockpit-sidebar-tools">
                <button data-testid="layout-start" disabled={busy} onClick={() => library.beginLayout()}>调整布局</button>
                <button data-testid="library-rollback-previous" disabled={busy} onClick={() => void library.rollbackPrevious()}>预览回退上一版</button>
                <button disabled={busy} onClick={() => void library.loadHistory()}>查看版本历史</button>
                {state.history.map(row => <div className="cockpit-history-row" key={row.version}><span>版本 {row.version}</span><button disabled={busy || row.version === state.saved?.spec.version} onClick={() => void library.rollback(row.version)}>预览回退</button></div>)}
              </div> : null}
            </CockpitSidebar></div>
            : savedHtml && pageStore ? <CockpitPageEditor store={pageStore} aiMode={htmlAIMode} onInspect={() => setMobileInspector(true)} onWholeAI={aiClient ? () => void guard(beginAI) : undefined} onAI={aiClient ? (scope, instruction) => aiClient.begin('page', page.current!.page_id, page.current!.version, scope, instruction) : undefined} />
            : page.importCandidate ? <><div className="cockpit-notice" data-testid="html-import-preview"><div><strong>保存为可编辑副本</strong><p>{uncertain ? '保存结果待核对。请用同一请求重试确认。' : '先检查页面。确认后进入页库，原工作区文件保持不变。'}</p></div>
              <button disabled={busy || uncertain} onClick={() => void pageStore?.cancelPreview()}>取消入库</button><button className="cockpit-primary" disabled={busy} onClick={() => void pageStore?.confirmImport()}>{uncertain ? '重试确认' : '确认保存副本'}</button></div>
              <div className="cockpit-frame-wrap"><HtmlPreview pkg={page.importCandidate.package} title={selected?.title ?? '副本预览'} /></div></>
            : selected?.kind === 'html' && rawPackage ? <><div className="cockpit-document-tools"><span className="cockpit-badge">{selected.file_id ? '已添加文件' : '会话文件'}</span><span className="cockpit-muted">保存副本后可编辑映射文字；外部资源受限。</span></div>
              <div className="cockpit-frame-wrap"><HtmlPreview pkg={rawPackage} title={selected.title} /></div></>
            : fileClient && selected?.file_id && cabinet.editor?.file_id === selected.file_id ? <CockpitOfficeEditor client={fileClient} />
            : selected && selected.kind !== 'html' ? <div className="cockpit-empty"><h2>{selected.title}</h2>
              <p>{fileClient ? '在文档编辑器中查看、修改内容，保存后生成新版本。' : '在文件预览中查看这份文档。'}</p>
              <button disabled={busy || uncertain || ai.active?.status === 'READY'} onClick={() => fileClient ? guard(editDocument) : openWorkspaceFile?.(selected)}>{fileClient ? selected.file_id ? '打开文档编辑器' : '保存副本并打开' : '打开文件预览'}</button></div>
            : <div className="cockpit-empty" data-testid="library-canvas-empty"><div className="cockpit-empty-mark" aria-hidden="true">▧</div><h2>{file.loading ? '正在打开页面' : '从一份产物开始'}</h2><p>{file.loading ? '正在读取完整内容，请稍候。' : '在左侧选择会话交付或已保存产物，预览后就地修改。'}</p><button onClick={back}>返回对话</button></div>}
          </div>
        </section>
      </div>
      {removing ? <div className="cockpit-modal-backdrop"><div className="cockpit-modal" role="alertdialog" aria-modal="true" aria-labelledby="cockpit-remove-title"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!removalBlocked()) setRemoving(null); }
          if (event.key === 'Tab') { const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const edge = event.shiftKey ? buttons[0] : buttons.at(-1); if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); } }
        }}>
        <h2 id="cockpit-remove-title">删除「{removing.title}」？</h2><p>将从你的产物列表移入回收站，可随时恢复。历史原文件和已保存版本会保留。</p>
        {ai.jobs.some(job => job.target_id === (removing.page_id ?? removing.file_id)) ? <p>此产物还有 AI 修改任务，删除不会停止原生对话。</p> : null}
        {notice ? <p role="status">{notice}</p> : null}<div className="cockpit-modal-actions"><button autoFocus aria-disabled={removePending || cabinet.organizing} onClick={() => { if (!removalBlocked()) setRemoving(null); }}>取消</button>
          <button className="cockpit-primary" aria-disabled={removePending || cabinet.organizing} onClick={() => void confirmRemoval()}>移入回收站</button></div>
      </div></div> : null}
      {!leaveCoordinator ? <LeavePrompt coordinator={coordinator} pageName={title} /> : null}
    </main>
  </ThemeProvider>;
}
