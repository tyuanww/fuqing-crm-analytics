import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { CockpitArtifact, COCKPIT_ARTIFACT_TAB, cockpitArtifactAddress } from './cockpit-artifact.tsx';
import { CockpitPageTab, COCKPIT_PAGE_TAB, cockpitPageAddress } from './cockpit-page-tab.tsx';
import { normalizeWorkspaceReadBytes, workspaceReadBytesRequest } from './workspace-read-bytes.mjs';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import { createCockpitAIClient, createCockpitArtifactClients, nativeArtifactPrompt } from './cockpit-ai-client.mjs';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { defineStore, type PropsStore } from '@deepseek-ai/dsh-client-store';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { PagePackageWaiter } from './free-html-library/native-generate.d.mts';
import {
  TOOL_NAME, TITLE_STORAGE_KEY, FIXTURE, createEditor, changeDraft, previewTitle,
  applyTitle, serializeTitle, restoreTitle, decodeFixture,
} from '../model.mjs';
import { css, markCss, returnDockCss } from './styles.ts';
import { trapDialogTab } from './focus.ts';
import { B0_PRIMARY_SESSION_ID, QUERY_SESSION_IDS, bindInitialSession, mainViewSessionId, resolvePageGenerateSession, retainMainView } from '../initial-session.mjs';
import { QUERY_TOOL_NAME } from '../query-model.mjs';
import { FIRST_PURCHASE_TOOL_NAME } from '../first-purchase-query-model.mjs';
import { QueryToolCard } from './query-card.tsx';
import { FirstPurchaseQueryCard } from './first-purchase-query-card.tsx';
import { RunStatus } from './run-status.tsx';
import { HttpAssetOverlay } from './asset-overlay.tsx';
import { OverlayErrorBoundary } from './overlay-error-boundary.mjs';
import { probeAssetHttp } from '../asset-http.mjs';
import { competitionHttpOptions } from './competition-http.mjs';
import { ThemeProvider } from './competition-shell/index.ts';
import { nativeBrandTokens, type CompetitionColorScheme } from './competition-shell/tokens.ts';
const PRODUCT_NAME = '伸美 AI 增长董事会';
import { COCKPIT_PANEL_ID, CockpitMainPanel, CockpitPanelIcon } from './cockpit-main-panel.tsx';
import { STAFF_PANEL_ID, StaffMainPanel, StaffPanelIcon } from './staff-main-panel.tsx';
import { applyGenerate, generateBoard, specFromGsvFacts } from '../board-spec/generate.mjs';
import { catalogFromGsvItems } from '../board-spec/facts-from-result.mjs';
import { refreshFacts } from '../board-spec/refresh.mjs';

import { DEMO_BOARD } from '../board-spec/demo-board.mjs';
import { createLibraryBoardClient, type LibraryBoardClient } from './library-board-client.mjs';
import { createLeaveCoordinator } from './leave/leave-coordinator.mjs';
import { createHostLeaveAdapter, type HostLeaveAdapter } from './leave/host-leave-adapter.mjs';
import { hasUnsavedChanges } from './leave/dirty-predicate.mjs';
import { LeavePromptOverlay } from './leave/leave-prompt.tsx';
import { createHostPageStore } from './free-html-library/create-host-page-store.mjs';
import { createNativePageGenerate, createPagePackageWaiter, extractPagePackage } from './free-html-library/native-generate.mjs';
import { GenerateChipIcon, LibraryGenerateDock, LibraryPreviewToolCard } from './library-workspace.tsx';
import { BOARD_GENERATE_TOOL_NAME, BOARD_EDIT_TOOL_NAME } from '../competition-agent/family.mjs';
import { PAGE_GENERATE_TOOL_NAME, PAGE_REQUEST_ID_PATTERN, PAGE_TOOL_RESULT_SCHEMA } from '../competition-agent/page-family.mjs';
import { fileResourceAddress, isSafeWorkspaceRelPath } from './cockpit-products.mjs';
import { createCockpitDelivery } from './cockpit-delivery.mjs';
import { createCockpitFileClient } from './cockpit-file-client.mjs';
import { pageDocumentsHttpOptions } from './free-html-library/page-http.mjs';
import { callBoardConnection } from '../board-spec/connection-call.mjs';
import { boardPackEnabled, queryPackEnabled } from '../feature-pack-gate.mjs';
import { AccountMenu, LoginFooter, ThemeFooter, createAccountStore } from './account-chrome.tsx';

function initialState() {
  try {
    const restored = restoreTitle(window.localStorage.getItem(TITLE_STORAGE_KEY));
    return {
      open: false,
      openTick: 0,
      intent: 'view' as 'view' | 'generate',
      confirmClose: false,
      boardSpec: null as object | null,
      boardFacts: null as object | null,
      boardError: '',
      pendingGenerate: null as { spec: object; facts: object | null } | null,
      boardEpoch: 0,
      factsCatalog: null as object | null,
      editor: createEditor(restored.title),
      message: restored.invalid ? '本地 UI 偏好格式无效，已使用默认标题。'
        : restored.restored ? '已恢复本浏览器的 UI 标题；不是业务后端持久化。' : '',
    };
  } catch {
    return {
      open: false, openTick: 0, intent: 'view' as const, confirmClose: false,
      boardSpec: null, boardFacts: null, boardError: '', pendingGenerate: null, boardEpoch: 0, factsCatalog: null,
      editor: createEditor(), message: '浏览器存储不可用；本次 UI 修改仅在当前页面有效。',
    };
  }
}

/** A seeded store opens the cockpit on a board; the dock still replaces it. */
function createWorkbenchStore(seedBoard: { spec: object; facts: object | null } | null = null) {
  return defineStore({
    init: () => {
      const state = initialState();
      if (seedBoard) {
        state.boardSpec = seedBoard.spec;
        state.boardFacts = seedBoard.facts;
      }
      return state;
    },
    actions: {
      open: draft => { draft.open = true; draft.intent = 'view'; draft.confirmClose = false; draft.openTick = (draft.openTick || 0) + 1; },
      openGenerate: draft => { draft.open = true; draft.intent = 'generate'; draft.confirmClose = false; draft.openTick = (draft.openTick || 0) + 1; },
      generateBoard: (draft, payload?: { spec?: object; facts?: object | null }) => {
        if (!payload?.spec) {
          draft.boardError = '这场对话没有可绑定的核验结果，未写入。';
          return;
        }
        applyGenerate(draft, payload.spec, payload.facts ?? null);
        draft.pendingGenerate = null;
      },
      proposeGenerate: (draft, payload?: { spec?: object; facts?: object | null }) => {
        if (!payload?.spec) {
          draft.pendingGenerate = null;
          draft.boardError = '这场对话没有可绑定的核验结果，未写入。';
          return;
        }
        const got = generateBoard(payload.spec, payload.facts ?? null);
        if (!got.ok) {
          draft.boardError = got.error.message;
          draft.pendingGenerate = null;
          return;
        }
        draft.boardError = '';
        draft.pendingGenerate = got.value;
      },
      confirmGenerate: (draft) => {
        if (!draft.pendingGenerate) return;
        applyGenerate(draft, draft.pendingGenerate.spec, draft.pendingGenerate.facts);
        draft.pendingGenerate = null;
        draft.boardEpoch = (draft.boardEpoch || 0) + 1;
      },
      setFactsCatalog: (draft, catalog: object | null) => { draft.factsCatalog = catalog; },
      refreshBoard: (draft) => {
        if (!draft.boardSpec) return;
        const catalog = draft.factsCatalog ?? draft.boardFacts;
        const got = refreshFacts(draft.boardSpec, catalog);
        if (!got.ok) {
          draft.boardError = got.error.message;
          return;
        }
        draft.boardFacts = got.value;
      },
      cancelGenerate: (draft) => { draft.pendingGenerate = null; },
      close: draft => { draft.open = false; draft.intent = 'view'; draft.confirmClose = false; },
      requestClose: draft => {
        if (draft.editor.draft !== draft.editor.title || draft.editor.preview) draft.confirmClose = true;
        else draft.open = false;
      },
      keepEditing: draft => { draft.confirmClose = false; },
      discardAndClose: draft => {
        draft.editor = changeDraft(draft.editor, draft.editor.title);
        draft.open = false; draft.intent = 'view'; draft.confirmClose = false;
      },
      edit: (draft, title: string) => { draft.editor = changeDraft(draft.editor, title); draft.message = ''; },
      preview: draft => {
        try { draft.editor = previewTitle(draft.editor); draft.message = '仅预览标题；合成数据与条件未变。'; }
        catch (error) { draft.message = error instanceof Error ? error.message : '无法预览。'; }
      },
      commit: (draft, message: string) => { draft.editor = applyTitle(draft.editor); draft.message = message; },
      discard: draft => { draft.editor = changeDraft(draft.editor, draft.editor.title); draft.message = '已撤销未应用的标题草稿。'; },
      notify: (draft, message: string) => { draft.message = message; },
    },
  });
}

type StoreProps = PropsStore<ReturnType<typeof createWorkbenchStore>>;
type OverlayProps = PropsRuntime<'shell.overlay'> & StoreProps & {
  themeSource: { subscribe(listener: () => void): () => void; getSnapshot(): CompetitionColorScheme };
  detachSelection(): void;
  restoreSelection(): void;
};

function RoutedOverlay(props: OverlayProps) {
  const colorScheme = useSyncExternalStore(props.themeSource.subscribe, props.themeSource.getSnapshot);
  const [assets, setAssets] = useState(false);
  const competitionHttp = competitionHttpOptions();
  const openTick = props.useStore(state => state.openTick ?? 0);
  const open = props.useStore(state => state.open);
  useEffect(() => {
    if (!open) return;
    void probeAssetHttp().then(setAssets);
  }, [open]);
  return (
    <ThemeProvider className="sm-overlay-theme" colorScheme={colorScheme}>
      <OverlayErrorBoundary resetKey={openTick}>
        {assets || competitionHttp
          ? <HttpAssetOverlay key={openTick} {...props} />
          : <AssetOverlay key={openTick} {...props} />}
      </OverlayErrorBoundary>
    </ThemeProvider>
  );
}

function BrandMark({ size, className }: { size?: number; className?: string }) {
  return <><style>{markCss}</style><span className={['analytics-b0-mark', className].filter(Boolean).join(' ')}
    role="img" aria-label="伸美原帽子标识" style={{ width: size, height: size }} /></>;
}

type BoardLive = ReturnType<ReturnType<typeof createWorkbenchStore>['create']>;

type GenerateDockInject = {
  library?: LibraryBoardClient;
  generateDirect?(sessionId: string): Promise<void>;
  openCockpit?(): boolean;
  board: BoardLive;
  fetchResults?(): Promise<unknown[]>;
};

type GenerateDockProps = PropsRuntime<'conversation.composer.dock'> & GenerateDockInject & {
  session?: { sessionId: string };
};

function dockSessionId(props: GenerateDockProps): string {
  if (props.session?.sessionId) return props.session.sessionId;
  const value = 'sessionId' in props ? props.sessionId : undefined;
  return typeof value === 'string' ? value : '';
}

const aiSessionGroups = new Map<string, string>();
const sessionGroupLabels = ['未分组', 'Ungrouped'];

function revealSessionGroup(label: string, widen?: () => void) {
  if (typeof document === 'undefined') return;
  const labels = new Set([label, ...sessionGroupLabels].filter(Boolean));
  let opened = false;
  let widened = false;
  const ensureWide = () => {
    if (widened || !document.querySelector('[data-sidebar-collapsed]')) return;
    widened = true;
    try { widen?.(); } catch { /* the conversation is already visible */ }
  };
  const expand = () => {
    if (opened) return;
    for (const item of document.querySelectorAll<HTMLElement>('[role="treeitem"][aria-expanded="false"]')) {
      for (const span of item.querySelectorAll('span')) {
        if (labels.has(span.textContent ?? '') && span.children.length === 0) {
          item.click();
          opened = true;
          return;
        }
      }
    }
  };
  const scrollCurrent = () => {
    document.querySelector('[role="treeitem"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  ensureWide();
  expand();
  setTimeout(() => { ensureWide(); expand(); scrollCurrent(); }, 80);
  setTimeout(() => { expand(); scrollCurrent(); }, 400);
}

function ReturnToCockpit(props: PropsRuntime<'conversation.input.dock'> & { openCockpit?: () => boolean }) {
  const id = props.session?.sessionId;
  if (!id) return null;
  const group = aiSessionGroups.get(id);
  return <><style>{returnDockCss}</style>
    <div className="analytics-b0-return-dock" data-testid="cockpit-return-dock">
      {group ? <span>这次对话在左侧「{group}」里。</span> : <span />}
      <button type="button" onClick={() => { props.openCockpit?.(); }}>返回驾驶舱</button>
    </div></>;
}

function GenerateCockpitDock(props: GenerateDockProps) {
  const id = dockSessionId(props);
  if (!id) return null;
  if (props.generateDirect) {
    return <><style>{css}</style><LibraryGenerateDock sessionId={id} generate={props.generateDirect} /></>;
  }
  if (id !== B0_PRIMARY_SESSION_ID && !QUERY_SESSION_IDS.some(value => value === id)) return null;
  const proposeBoard = () => {
    void (async () => {
      try {
        const items = props.fetchResults ? await props.fetchResults() : [];
        const catalog = catalogFromGsvItems(items);
        const spec = specFromGsvFacts(catalog, { session_id: id });
        if (!spec.ok) props.board.actions.proposeGenerate();
        else props.board.actions.proposeGenerate({ spec: spec.value, facts: catalog });
      } catch {
        props.board.actions.proposeGenerate();
      }
      props.openCockpit?.();
    })();
  };
  return <><style>{css}</style>
    <div className="analytics-b0-artifacts" data-testid="analytics-b0-artifacts">
      <button type="button" className="analytics-b0-generate-dock" data-testid="analytics-b0-generate-cockpit"
        title="用这次认可的分析结果生成驾驶舱"
        aria-label="生成驾驶舱"
        onClick={proposeBoard}>
        <GenerateChipIcon />
        生成驾驶舱
      </button>
    </div></>;
}

function AssetOverlay(props: OverlayProps) {
  const open = props.useStore(state => state.open);
  const openTick = props.useStore(state => state.openTick ?? 0);
  const editor = props.useStore(state => state.editor);
  const message = props.useStore(state => state.message);
  const confirmClose = props.useStore(state => state.confirmClose);
  const selectedSession = props.useSessions(state => mainViewSessionId(state));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const focusFrame = useRef<number | undefined>(undefined);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, openTick]);
  useEffect(() => () => {
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    dialogRef.current?.close();
  }, []);

  function afterClose() {
    props.actions.close(); props.restoreSelection();
    // Native InputBar intentionally focuses its editor on a session switch.
    // Let that React commit paint, then return to our own fixed entry. No
    // upstream focus listener, component or stylesheet is replaced.
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = undefined;
        if (!dialogRef.current?.open) document.querySelector<HTMLButtonElement>('[data-testid="analytics-b0-open"]')?.focus({ preventScroll: true });
      });
    });
  }

  function applyPreview() {
    try {
      const next = applyTitle(editor);
      let status = '已应用并保存本浏览器 UI 标题；刷新页面后可恢复。不是业务后端持久化。';
      try { window.localStorage.setItem(TITLE_STORAGE_KEY, serializeTitle(next.title)); }
      catch { status = '已应用到当前页面，但浏览器存储失败；刷新将丢失此次标题修改。'; }
      props.actions.commit(status);
    } catch (error) {
      props.actions.notify(error instanceof Error ? error.message : '无法应用预览。');
    }
  }

  return <><style>{css}</style><dialog ref={dialogRef} className="analytics-b0-dialog"
    aria-labelledby="analytics-b0-heading" aria-describedby="analytics-b0-boundary"
    data-testid="analytics-b0-dialog" data-dsh-native-chrome="1"
    onKeyDown={trapDialogTab}
    onCancel={event => { event.preventDefault(); props.actions.requestClose(); }}
    onClose={afterClose}>
    <header><div><span className="analytics-b0-logo" role="img" aria-label="SHINE MAGE 原始 Logo" data-testid="analytics-b0-logo" />
      <h2 id="analytics-b0-heading">{PRODUCT_NAME}</h2></div>
      <button type="button" data-testid="analytics-b0-close" onClick={() => props.actions.requestClose()}>返回聊天</button></header>
    {confirmClose && <section className="analytics-b0-preview" role="alert" data-testid="analytics-b0-close-confirm">
      <p>标题草稿尚未应用，是否放弃本次修改？</p>
      <div className="analytics-b0-actions"><button type="button" onClick={() => props.actions.keepEditing()}>继续编辑</button>
        <button type="button" onClick={() => props.actions.discardAndClose()}>放弃草稿并返回</button></div>
    </section>}
    <p id="analytics-b0-boundary"><strong>B0 / STUB / SYNTHETIC</strong> · 独立静态资产，无需模型或活动会话。</p>
    <p><small>本页只验证 DSH 承载和局部标题编辑。未接真实数据库、业务资产库、AI 编辑或审批接口。</small></p>
    <p data-testid="analytics-b0-selection">{selectedSession ? '原会话仍保留；此资产不依赖会话。' : '当前无活动会话；固定资产仍可读。'}</p>
    <button type="button" data-testid="analytics-b0-detach" disabled={!selectedSession}
      onClick={() => props.detachSelection()}>脱离会话阅读（B0 验证）</button>
    <section aria-labelledby="analytics-b0-asset-title">
      <h3 id="analytics-b0-asset-title" data-testid="analytics-b0-title">{editor.title}</h3>
      <small>固定样例日期 {FIXTURE.data_as_of} · {FIXTURE.fixture_id} · 非最新经营数据</small>
      <table><caption>固定合成资产 · 复购率 = 复购人数 / 客户数</caption>
        <thead><tr><th scope="col">渠道</th><th scope="col">客户</th><th scope="col">复购</th><th scope="col">复购率</th></tr></thead>
        <tbody><tr><th scope="row">{FIXTURE.channel}</th><td>{FIXTURE.customers}</td><td>{FIXTURE.repeat_customers}</td><td>{FIXTURE.repeat_rate * 100}%</td></tr></tbody>
      </table>
      <label htmlFor="analytics-b0-draft">只编辑这个板块的标题（最多 40 字）</label>
      <input id="analytics-b0-draft" data-testid="analytics-b0-title-input" value={editor.draft}
        maxLength={80} onChange={event => props.actions.edit(event.currentTarget.value)} />
      <div className="analytics-b0-actions">
        <button type="button" data-testid="analytics-b0-preview" onClick={() => props.actions.preview()}>预览标题</button>
        <button type="button" data-testid="analytics-b0-apply" disabled={!editor.preview} onClick={applyPreview}>应用预览（仅本浏览器）</button>
        <button type="button" onClick={() => props.actions.discard()}>撤销草稿</button>
      </div>
      {editor.preview && <div className="analytics-b0-preview" data-testid="analytics-b0-preview-panel">
        <strong>预览，尚未应用</strong><p>{editor.preview.title}</p><small>数据、日期、渠道与指标均未改变。</small>
      </div>}
      <p role="status" aria-live="polite" data-testid="analytics-b0-status">{message}</p>
    </section>
    <p><small>localStorage 仅保存标题这一项 UI 偏好，不保存数据、会话、授权或业务资产。刷新页面不会刷新合成指标。</small></p>
    <p><a data-testid="analytics-b0-board-sample" href="/b0/board-sample?ref=b0-condition-specimen-v1">查看 B0 完整条件往返样例</a>
      <br /><small>独立合成接缝，未执行查询。不是本页指标的同条件 BI；旧私有 BI 仍不开放。</small></p>
  </dialog></>;
}

function AnalyticsToolCard({ block }: ToolCallViewProps) {
  if (!('kind' in block) || block.kind !== 'tool-result') {
    return <div className="analytics-b0-card" role="status">B0 合成工具运行中…</div>;
  }
  if (block.isError) return <div className="analytics-b0-card" role="status">B0 工具失败；没有可用结果。未执行业务动作。</div>;
  const value = decodeFixture(block.meta);
  if (!value) return <div className="analytics-b0-card" role="status">结果格式无法识别或版本不支持；不推断分析成功。</div>;
  return <div className="analytics-b0-card" data-testid="analytics-b0-tool-result">
    <strong>B0 / STUB / SYNTHETIC · 合成工具结果</strong>
    <p>{value.channel}：{value.customers} 位客户中 {value.repeat_customers} 位复购，复购率 {value.repeat_rate * 100}%。</p>
    <small>固定样例日期 {value.data_as_of} · {value.fixture_id}。这是工具步骤结果；任务终态以输入框上方的内核状态为准。不含真实数据或审批动作。</small>
  </div>;
}

/**
 * Tool-card intake for the native delivery tool. The card is the only place
 * the browser sees the package: it hands the receipt outcome to the waiter so
 * the waiting generate continues into the isolated documents HTTP. It never
 * persists the page and never renders the raw source.
 */
function PagePackageToolCard(props: ToolCallViewProps & { pagePackageWaiter?: PagePackageWaiter; onNativePackage?: (pkg: { html: string; css?: string; js?: string; resources?: unknown[]; node_map?: unknown[] }, sessionId: string) => Promise<void> }) {
  const { block, pagePackageWaiter } = props;
  const delivered = useRef<string | null>(null);
  useEffect(() => {
    if (!pagePackageWaiter || !('kind' in block) || block.kind !== 'tool-result') return;
    if (block.isError || typeof block.callId !== 'string') return;
    if (delivered.current === block.callId) return;
    const meta = block.meta as Record<string, unknown> | undefined;
    const requestId = typeof meta?.request_id === 'string' ? meta.request_id : '';
    if (!PAGE_REQUEST_ID_PATTERN.test(requestId)) return;
    delivered.current = block.callId;
    if (meta?.schema_version !== PAGE_TOOL_RESULT_SCHEMA) {
      pagePackageWaiter.deliver(requestId, new Error('页面交付回执格式无法识别；未取得页面源码包'));
      return;
    }
    if (meta.status === 'PACKAGE_RECEIVED') {
      const pkg = extractPagePackage(meta.package);
      if (!pkg) {
        pagePackageWaiter.deliver(requestId, new Error('页面交付回执缺少有效源码包'));
        return;
      }
      const accepted = pagePackageWaiter.deliver(requestId, pkg);
      const sessionId = typeof meta.session_id === 'string' ? meta.session_id : '';
      if (!accepted && sessionId) void Promise.resolve(props.onNativePackage?.(pkg, sessionId)).catch(() => { /* the tool card stays; the page was not saved */ });
      return;
    }
    const error = meta?.error as { code?: unknown } | undefined;
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    pagePackageWaiter.deliver(requestId, new Error(`页面源码包被拒收（${code}）；请修正后重新生成`));
  }, [block, pagePackageWaiter]);
  if (!('kind' in block) || block.kind !== 'tool-result') {
    return <div className="analytics-b0-card" role="status">正在等待原生 Agent 交付页面源码包…</div>;
  }
  if (block.isError) return <div className="analytics-b0-card" role="status">页面工具失败；未交付页面源码包。</div>;
  const meta = block.meta as Record<string, unknown> | undefined;
  if (meta?.schema_version !== PAGE_TOOL_RESULT_SCHEMA) {
    return <div className="analytics-b0-card" role="status">页面交付回执格式无法识别或版本不支持；不推断页面已交付。</div>;
  }
  if (meta.status !== 'PACKAGE_RECEIVED') {
    const refusedError = meta.error as { code?: unknown } | undefined;
    const code = typeof refusedError?.code === 'string' ? refusedError.code : 'UNKNOWN';
    return <div className="analytics-b0-card" role="status">页面源码包被拒收（{code}）；请按拒绝原因修正后重试。</div>;
  }
  return <div className="analytics-b0-card" data-testid="analytics-b0-page-card">
    <strong>自由页面源码包已交付工作台</strong>
    <p>request_id {String(meta.request_id)} · 请到工作台检查并保存；本工具不保存页面。</p>
  </div>;
}

export const name = 'analytics-workbench-b0-client';
export const inject = ['slots', 'sessions', 'theme', 'layout', 'remote', 'remote.session', 'remote.workspaceFiles', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace'];

export function apply(ctx: Context): void {
  ctx.effect(() => bindInitialSession(ctx.sessions, () => {
    console.warn('analytics-b0: the configured primary session could not be selected; no fallback attempted');
  }), 'analytics-b0: select exact Host-listed primary once');
  const chromeStore = createWorkbenchStore();
  const accountStore = createAccountStore();
  const boardLive = createWorkbenchStore(DEMO_BOARD).create();
  const connection = ctx.get?.('connection') as ConnectionHandle | undefined;
  let leaveAdapter: HostLeaveAdapter | undefined;
  const library = connection?.rpc?.call
    ? createLibraryBoardClient((channel, operation, payload, signal) => callBoardConnection(connection.rpc, channel, operation, payload, signal), {
      async editNative(context) {
        const sessionId = ctx.sessions.list.getSnapshot().ids.find(id => id === context.session_id);
        if (!sessionId) throw new Error('此看板的原生会话当前不可用；已保存内容仍可查看，请恢复原会话后编辑。');
        if (leaveAdapter) {
          const result = await leaveAdapter.request('conversation');
          if (result !== 'navigated') {
            throw new Error(result === 'prompt'
              ? '请先处理未保存的草稿，再转入原生对话描述修改。'
              : '当前无法转入原生对话；选中目标保留，可重试。');
          }
        } else {
          try { ctx.layout?.selectPanel(null); } catch { /* stay on the current panel */ }
        }
        ctx.uiWorkspace.openSession(sessionId);
        const reply = await ctx.remote.session.prompt({
          sessionId, requestId: `board-edit-${crypto.randomUUID()}` as never,
          mode: 'queue', clientTimeZone: 'Asia/Shanghai',
          content: [{ type: 'text', text: `我已在驾驶舱选中一个组件。编辑上下文：${context.edit_context_id}。请用 competition_board_edit_context 读取这个上下文，告诉我选中了什么并询问我要怎样修改；此消息只选择目标，不授权你自行改变内容。等我提出修改要求，再通过 competition_board_edit 生成该组件的修改预览，由我检查后确认。不要生成整板、重选目标或自动保存。` }],
        });
        if (!reply.ok || !reply.value.accepted) throw new Error('原生对话未接受编辑请求；选中目标保留，可重试转入对话或取消。');
      },
    })
    : undefined;
  ctx.effect(() => () => library?.dispose(), 'analytics-board: client lifetime');
  // Intake seam for the native delivery tool: the tool card resolves the
  // waiting generate through this waiter; disposal cancels everything pending.
  const pagePackageWaiter = createPagePackageWaiter();
  ctx.effect(() => () => pagePackageWaiter.cancelAll(), 'analytics-board: free-html page waiter');
  const pageStore = boardPackEnabled() ? createHostPageStore({
    nativeGenerate: createNativePageGenerate({
      waiter: pagePackageWaiter,
      submitPrompt: async (prompt, extras) => {
        const list = ctx.sessions.list.getSnapshot();
        const requested = typeof extras?.sessionId === 'string' ? extras.sessionId : '';
        const sessionId = requested || resolvePageGenerateSession(list);
        const requestId = extras?.requestId;
        if (!sessionId || typeof requestId !== 'string' || !PAGE_REQUEST_ID_PATTERN.test(requestId)
          || typeof ctx.remote?.session?.prompt !== 'function') {
          const error = new Error('原生 Agent 未返回页面源码包');
          (error as Error & { code?: string }).code = 'NATIVE_GENERATE_UNAVAILABLE';
          throw error;
        }
        const reply = await ctx.remote.session.prompt({
          sessionId: sessionId as never,
          requestId: requestId as never,
          mode: 'queue',
          clientTimeZone: 'Asia/Shanghai',
          content: [{
            type: 'text',
            text: `请生成自由 HTML 页面。先用文本给出说明，然后必须调用 ${PAGE_GENERATE_TOOL_NAME} 工具交付页面源码包（字段 html、css、js、resources、node_map），并把这个标识逐字填入 request_id：${requestId}。不要使用 BoardSpec，不要回退到示例页面。每个逻辑板块使用稳定 data-page-block，每段可编辑叶子文字使用 data-page-field，重复卡片使用业务键，重渲染保留标识；计算或绑定数字标 data-page-readonly。提示：${prompt}`,
          }],
        });
        if (!reply?.ok || reply.value?.accepted !== true) {
          throw new Error('原生对话未接受页面生成请求；请在该对话选择可用模型后重试。');
        }
        return reply;
      },
    }),
  }) : undefined;
  ctx.effect(() => () => pageStore?.dispose(), 'analytics-board: free-html page store');
  const fileClient = createCockpitFileClient(pageDocumentsHttpOptions());
  ctx.effect(() => () => fileClient.dispose(), 'analytics-board: file cabinet lifetime');
  const workspaceItems = () => {
    try {
      const list = (ctx as unknown as { get?(name: string): { list?: { getSnapshot?: () => { items?: Array<{ workspaceId?: string; path?: string; title?: string }> } } } }).get?.('workspaces');
      return list?.list?.getSnapshot?.().items ?? [];
    } catch {
      return [];
    }
  };
  const workspaceIdForPath = (path: string) => workspaceItems().find(item => item.path && item.path === path)?.workspaceId;
  const workspaceTitle = (workspaceId: string) => workspaceItems().find(item => item.workspaceId === workspaceId)?.title || '工作区';
  const aiClient = createCockpitAIClient(pageDocumentsHttpOptions(), {
    async openNative(job) {
      const workspaceId = workspaceIdForPath(job.workspace);
      const sessionId = await ctx.sessions.create(workspaceId
        ? { workspaceId: workspaceId as never, sessionId: job.session_id as never }
        : { cwd: job.workspace, sessionId: job.session_id as never });
      aiSessionGroups.set(sessionId, workspaceId ? workspaceTitle(workspaceId) : '未分组');
      const showConversation = () => {
        ctx.uiWorkspace.openSession(sessionId);
        try { ctx.layout.selectPanel(null); } catch { /* stay if the host refuses the panel switch */ }
        try { ctx.layout.openRightbar(true, false); } catch { /* the conversation is already open */ }
        revealSessionGroup(aiSessionGroups.get(sessionId) || '未分组', () => ctx.layout.toggleSidebar());
      };
      showConversation();
      // Stable request identity: reopening can safely recover a lost enqueue receipt.
      const reply = await ctx.remote.session.prompt({
        sessionId, requestId: ('artifact-' + job.id) as never, mode: 'queue', clientTimeZone: 'Asia/Shanghai',
        content: [{ type: 'text', text: nativeArtifactPrompt(job) }],
      });
      if (!reply.ok || !reply.value.accepted) throw new Error('原生 AI 未接受请求。请在该对话选择并配置可用模型，再回驾驶舱重试打开；修改任务已保留。');
      showConversation();
      const preview = job.preview_name ?? (job.target_kind === 'page' ? 'current.html' : job.source_name);
      const address = job.target_kind === 'page' ? cockpitArtifactAddress(job.id) : fileResourceAddress(sessionId, preview);
      if (address && job.target_kind === 'page') {
        // Navigation renders asynchronously. Target the adopted session, never
        // whichever old conversation still owns the visible seat this instant.
        const deadline = Date.now() + 5000;
        while (!ctx.sidebarRight.tabsIn(sessionId).length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
        if (!ctx.sidebarRight.tabsIn(sessionId).length) throw new Error('对话已打开，右侧产物栏尚未就绪。任务已保留，请重试打开。');
        ctx.sidebarRight.openResourceIn(sessionId, address);
      } else if (address) ctx.sidebarRight.openResource(address);
    },
    async onSaved(job) {
      await fileClient.refresh();
      await pageStore?.refreshPages();
      if (job.target_kind === 'page' && pageStore?.getSnapshot().cockpitSelectionId === 'page:' + job.target_id) await pageStore.openPage(job.target_id);
    },
  });
  ctx.effect(() => () => aiClient.dispose(), 'analytics-board: native AI exchange lifetime');
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: COCKPIT_ARTIFACT_TAB, kind: 'cockpit-artifact', patterns: ['dsh-resource://cockpit-ai/**'],
    canOpen: address => /^dsh-resource:\/\/cockpit-ai\/ai_[0-9a-f-]+$/.test(address),
    title: () => 'HTML 产物',
  }), 'analytics-board: immutable artifact tab');
  const artifactClients = createCockpitArtifactClients(() => createCockpitAIClient(pageDocumentsHttpOptions(), {
    openNative: async job => { ctx.uiWorkspace.openSession(job.session_id as never); },
    onSaved: async job => {
      await aiClient.refresh(); await fileClient.refresh(); await pageStore?.refreshPages();
      if (job.target_kind === 'page' && pageStore?.getSnapshot().cockpitSelectionId === 'page:' + job.target_id) await pageStore.openPage(job.target_id);
    },
  }));
  ctx.effect(() => () => artifactClients.dispose(), 'analytics-board: artifact request lifetime');
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: COCKPIT_ARTIFACT_TAB,
    inject: () => ({ createClient: artifactClients.get }),
  }, CockpitArtifact)), 'analytics-board: artifact body');
  if (pageStore) {
    ctx.effect(() => ctx.sidebarRightTabs.register({
      id: COCKPIT_PAGE_TAB, kind: 'cockpit-page', patterns: ['dsh-resource://cockpit-page/**'],
      canOpen: address => /^dsh-resource:\/\/cockpit-page\/page_[0-9a-f]+$/.test(address),
      title: () => 'HTML 产物',
    }), 'analytics-board: generated page tab');
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab', key: COCKPIT_PAGE_TAB,
      inject: () => ({ pageStore, openCockpit: openCockpitPanel }),
    }, CockpitPageTab)), 'analytics-board: generated page body');
  }


  /**
   * One leave transaction for every plugin-owned entry (D44/T25). The
   * coordinator reads the dirty predicate, runs the three choices and performs
   * the original navigation at most once; `goConversation` and the panel
   * entries below submit an intent instead of switching directly.
   * Free-HTML dirty state is folded into the same predicate so returning to
   * chat does not open a second three-choice prompt.
   */
  const leaveCoordinator = library ? createLeaveCoordinator({
    snapshot: () => ({ ...library.getSnapshot(), htmlUnsaved: Boolean(pageStore?.hasUnsavedChanges() || fileClient.hasUnsavedChanges() || aiClient.hasUnsavedChanges() || artifactClients.hasUnsavedChanges()),
      confirmationUncertain: library.getSnapshot().confirmationUncertain || Boolean(pageStore?.getSnapshot().confirmationUncertain) || fileClient.getSnapshot().confirmationUncertain || aiClient.getSnapshot().confirmationUncertain || artifactClients.hasUnsavedChanges() }),
    beginEpoch: kind => library.beginNavigation(kind),
    save: async () => {
      if (!(await artifactClients.persistForLeave()).ok) return { ok: false };
      if (aiClient.hasUnsavedChanges()) { const result = await aiClient.persistForLeave(); if (!result.ok) return result; }
      if (fileClient.hasUnsavedChanges()) { const result = await fileClient.persistForLeave(); if (!result.ok) return result; }
      if (pageStore?.hasUnsavedChanges()) {
        const html = await pageStore.persistForLeave();
        if (!html?.ok) return html ?? { ok: false, reason: 'failed' };
      }
      return library.saveForLeave();
    },
    discard: async () => {
      if (aiClient.hasUnsavedChanges() || artifactClients.hasUnsavedChanges()) return { ok: false, reason: 'confirmation_uncertain' };
      if (fileClient.hasUnsavedChanges()) { const result = await fileClient.discardForLeave(); if (!result.ok) return result; }
      if (pageStore?.hasUnsavedChanges()) {
        const html = await pageStore.discardForLeave();
        if (!html?.ok) return html ?? { ok: false, reason: 'failed' };
      }
      return library.discardDraft();
    },
    // Deferred: the adapter owns the host setter, and it is constructed around
    // this coordinator. By the time any intent resolves, both exist.
    navigate: async (intent: { kind: string; id?: string | null; performLocal?(): void | Promise<void> }): Promise<void> => {
      if (intent.performLocal) { await intent.performLocal(); return; }
      return leaveAdapter!.perform(intent);
    },
  }) : undefined;
  leaveAdapter = leaveCoordinator
    ? createHostLeaveAdapter({ coordinator: leaveCoordinator, layout: ctx.layout }) : undefined;
  ctx.effect(() => () => leaveAdapter?.dispose(), 'analytics-board: leave adapter lifetime');
  ctx.effect(() => () => leaveCoordinator?.dispose(), 'analytics-board: leave coordinator lifetime');
  ctx.effect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
    let armed = false;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const update = () => {
      const next = Boolean(library?.hasUnsavedChanges() || pageStore?.hasUnsavedChanges() || fileClient.hasUnsavedChanges() || aiClient.hasUnsavedChanges() || artifactClients.hasUnsavedChanges());
      if (next === armed) return;
      armed = next;
      if (armed) window.addEventListener('beforeunload', warn); else window.removeEventListener('beforeunload', warn);
    };
    const unboard = library?.subscribe(update), unpage = pageStore?.subscribe(update), unfile = fileClient.subscribe(update), unai = aiClient.subscribe(update), unartifact = artifactClients.subscribe(update); update();
    return () => { unboard?.(); unpage?.(); unfile(); unai(); unartifact(); if (armed) window.removeEventListener('beforeunload', warn); };
  }, 'analytics-board: dirty browser protection survives native panel switches');

  ctx.effect(() => ctx.theme.overrideTokens('shine-mage.brand', nativeBrandTokens), 'competition-native-theme');
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -10 }, BrandMark));
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -10,
  }, BrandMark));
  const revealGeneratedPage = (sessionId: string, pageId: string) => {
    const address = cockpitPageAddress(pageId);
    try { ctx.layout.openRightbar(true, false); } catch { /* the conversation sidebar may already be open */ }
    try { ctx.sidebarRight.openResourceIn(sessionId as never, address); } catch { /* the cockpit page is still selected */ }
    openCockpitPanel();
  };
  const openCockpitPanel = (): boolean => {
    captureVisibleDeliverySource();
    const layout = ctx.layout;
    if (layout == null || typeof layout.selectPanel !== 'function') return false;
    if (leaveAdapter && library && hasUnsavedChanges({ ...library.getSnapshot(), htmlUnsaved: Boolean(pageStore?.hasUnsavedChanges()) })) {
      void leaveAdapter.request('panel', { kind: 'panel', id: COCKPIT_PANEL_ID })
        .catch(() => { /* stay on the current panel */ });
      return true;
    }
    try {
      layout.selectPanel(COCKPIT_PANEL_ID as MainPanelId);
      return true;
    } catch {
      return false;
    }
  };
  /**
   * Return to the native conversation. The leave transaction runs first: a
   * clean cockpit closes immediately, and a dirty one is held on the page until
   * the user chooses. The panel switch itself happens in the coordinator's
   * navigation callback, so the original navigation still occurs exactly once.
   */
  const goConversation = (): void => {
    if (!leaveAdapter) {
      // No library client to protect (pack disabled): keep the original switch.
      try { ctx.layout?.selectPanel(null); } catch { /* stay on the current panel */ }
      return;
    }
    void leaveAdapter.request('conversation').catch(() => {
      // The host refused the switch: stay on the current page rather than
      // unloading the library state.
    });
  };
  const themeSource = {
    subscribe: (listener: () => void) => {
      try {
        const dispose = ctx.on('theme/change', listener);
        return () => { dispose(); };
      } catch { return () => {}; }
    },
    getSnapshot: (): CompetitionColorScheme => {
      try { return ctx.theme.getTheme().active.colorScheme; }
      catch { return 'dark'; }
    },
  };
  const remoteWorkspaceFiles = () => {
    try {
      return (ctx.remote as unknown as {
        workspaceFiles?: {
          list?: (sessionId: string, path: string, signal?: AbortSignal) => Promise<unknown>;
          read?: (sessionId: string, path: string, range?: { offset?: number; limit?: number }, signal?: AbortSignal) => Promise<unknown>;
          readBytes?: (sessionId: string, path: string, options: { range?: { offset?: number; length?: number } }, signal?: AbortSignal) => Promise<unknown>;
        };
      }).workspaceFiles;
    } catch {
      return undefined;
    }
  };
  const delivery = createCockpitDelivery({
    ...(connection?.rpc?.call ? { history: async (cursor: string | null, signal?: AbortSignal) => {
      const result = await connection.rpc.call('/api', 'shine-mage-deliveries', { ...(cursor ? { cursor } : {}),
        ...(delivery.getSessionId() ? { sessionId: delivery.getSessionId() } : {}) }, signal) as {
        ok: boolean; value?: { files: import('./cockpit-products.mjs').CockpitProduct[]; examined: number; totalSessions: number;
          nextCursor: string | null; failures: unknown[]; unsupportedPaths: number }; error?: { message?: string };
      };
      if (!result.ok || !result.value || !Array.isArray(result.value.files)) throw new Error(result.error?.message || '历史交付服务尚未连接');
      return result.value;
    } } : {}),
    listDir: async (sessionId, path, signal) => {
      const api = remoteWorkspaceFiles();
      if (!api?.list) throw new Error('工作区文件服务尚未连接');
      return api.list(sessionId, path, signal);
    },
    read: async (sessionId, path, range, signal) => {
      const api = remoteWorkspaceFiles();
      if (!api?.read) throw new Error('工作区文件服务尚未连接');
      return api.read(sessionId, path, range, signal);
    },
    readBytes: async (sessionId, path, range, signal) => {
      const api = remoteWorkspaceFiles();
      if (!api?.readBytes) throw new Error('文件字节读取服务尚未连接');
      const raw = await api.readBytes(sessionId, path, workspaceReadBytesRequest(range), signal);
      return normalizeWorkspaceReadBytes(raw);
    },
  });
  const captureVisibleDeliverySource = () => {
    const list = ctx.sessions.list.getSnapshot();
    const visible = mainViewSessionId(list);
    // Native sidebar selection releases mainView before mounting this panel.
    // Capture only an observed visible source; a null mainView is not another session.
    if (visible) delivery.captureSource(list);
    else if (delivery.getSessionId() && !list.ids.includes(delivery.getSessionId() as never)) delivery.setSessionId(null);
  };
  ctx.effect(() => {
    captureVisibleDeliverySource();
    return ctx.sessions.list.subscribe(captureVisibleDeliverySource);
  }, 'analytics-board: observe visible delivery source');
  ctx.effect(() => () => delivery.dispose(), 'analytics-board: delivery lifetime');
  const listWorkspaceFiles = async () => (await delivery.refresh()).files;
  const openWorkspaceFile = (product: { sessionId?: string; path?: string }) => {
    const openResource = (ctx as unknown as { sidebarRight?: { openResource?(address: string): void } }).sidebarRight?.openResource;
    if (!product?.sessionId || !product?.path || typeof openResource !== 'function') return;
    if (!isSafeWorkspaceRelPath(product.path)) return;
    const address = fileResourceAddress(product.sessionId, product.path);
    if (!address) return;
    openResource(address);
  };
  const readWorkspaceFile = async (product: { sessionId?: string; path?: string }) => {
    if (!product.sessionId || !product.path) return null;
    const result = await delivery.readFile(product.path, { sessionId: product.sessionId });
    return result.status === 'ok' ? result.text : null;
  };
  /**
   * The N14 three-choice prompt. It is its own overlay so the leave transaction
   * (Lane F) stays out of the composition/workspace components (Lane E): those
   * keep display and session binding, and the prompt renders whatever the
   * coordinator reports. It also observes the host panel selection, which is
   * the only hook the pinned host offers for an un-vetoable sidebar switch.
   */
  if (boardPackEnabled() && leaveCoordinator && library) ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'shine-mage.leave-prompt',
    inject: () => ({ coordinator: leaveCoordinator, library, pageStore }),
  }, LeavePromptOverlay));
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'shine-mage.account.login', order: 10, store: accountStore,
  }, LoginFooter));
  const themeChrome = () => ({
    setTheme: (id: string) => { try { ctx.theme.setTheme(id); } catch { /* host without theme writes */ } },
    themeSource: {
      subscribe: (listener: () => void) => {
        try {
          const dispose = ctx.on('theme/change', listener);
          return () => { dispose(); };
        } catch { return () => {}; }
      },
      getSnapshot: () => {
        try { return ctx.theme.getTheme().preference; }
        catch { return 'system'; }
      },
    },
  });
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'shine-mage.account.theme', order: 11, store: accountStore,
    inject: themeChrome,
  }, ThemeFooter));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'shine-mage.account.menu', store: accountStore,
    inject: themeChrome,
  }, AccountMenu));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'shine-mage.analytics-b0.overlay', store: chromeStore,
    inject: () => {
      let prior: ReturnType<typeof mainViewSessionId>;
      let held: { release(): void } | undefined;
      return {
        themeSource,
        detachSelection() {
          prior = mainViewSessionId(ctx.sessions.list.getSnapshot());
          held?.release();
          held = undefined;
        },
        restoreSelection() {
          const list = ctx.sessions.list.getSnapshot();
          if (prior !== undefined && mainViewSessionId(list) === undefined && list.ids.includes(prior)) {
            held = retainMainView(ctx.sessions, prior);
          }
          prior = undefined;
        },
      };
    },
  }, RoutedOverlay));
  if (queryPackEnabled()) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: TOOL_NAME,
    }, AnalyticsToolCard));
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: QUERY_TOOL_NAME,
    }, QueryToolCard));
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: FIRST_PURCHASE_TOOL_NAME,
    }, FirstPurchaseQueryCard));
  }
  if (boardPackEnabled()) {
    for (const toolName of [BOARD_GENERATE_TOOL_NAME, BOARD_EDIT_TOOL_NAME]) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: toolName,
      inject: () => ({ library, openCockpit: openCockpitPanel }),
    }, LibraryPreviewToolCard));
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: PAGE_GENERATE_TOOL_NAME,
      inject: () => ({ pagePackageWaiter, onNativePackage: async (pkg: { html: string; css?: string; js?: string; resources?: unknown[]; node_map?: unknown[] }, sessionId: string) => {
        const documents = (pageStore as { adapters?: { documents?: { generateAndConfirm?: (draft: object) => Promise<{ ok?: boolean; page?: { page_id?: string } }> } } } | undefined)?.adapters?.documents;
        if (!sessionId || !documents?.generateAndConfirm) return;
        const saved = await documents.generateAndConfirm({
          title: '本场对话驾驶舱', session_id: sessionId,
          package: { html: pkg.html, css: pkg.css ?? '', js: pkg.js ?? '', resources: pkg.resources ?? [], node_map: pkg.node_map ?? [] },
          binding_manifest: { bindings: [], result_refs: [] }, idempotency_key: crypto.randomUUID(),
        });
        const pageId = saved?.page?.page_id;
        if (!saved?.ok || !pageId) return;
        pageStore?.selectCockpitAsset('page:' + pageId);
        await pageStore?.refreshPages();
        await pageStore?.openPage(pageId);
        revealGeneratedPage(sessionId, pageId);
      } }),
    }, PagePackageToolCard));
  }
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'shine-mage.analytics-b0.run-status', order: 10,
  }, RunStatus));
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'shine-mage.analytics-b0.return-cockpit', order: 12,
    inject: () => ({ openCockpit: openCockpitPanel }),
  }, ReturnToCockpit));
  if (boardPackEnabled()) ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'shine-mage.analytics-b0.generate-cockpit', order: 20,
    inject: () => ({
      openCockpit: openCockpitPanel,
      board: boardLive,
      library,
      async generateDirect(sessionId: string) {
        const native = (pageStore as { adapters?: { nativeChat?: { submitGeneratePrompt?: (prompt: string, extras?: { sessionId?: string }) => Promise<{ package?: { html: string; css?: string; js?: string; resources?: unknown[]; node_map?: unknown[] } }> }; documents?: { generateAndConfirm?: (draft: object) => Promise<{ ok?: boolean; page?: { page_id?: string } }> } } } | undefined)?.adapters;
        if (!native?.nativeChat?.submitGeneratePrompt || !native.documents?.generateAndConfirm) throw new Error('原生 HTML 交付尚未连接');
        const submitted = await native.nativeChat.submitGeneratePrompt('根据本场对话已经完成的诊断和查出的数字，生成可编辑 HTML 驾驶舱。', { sessionId });
        const pkg = submitted?.package;
        if (!pkg?.html) throw new Error('原生对话没有交回页面源码包');
        const saved = await native.documents.generateAndConfirm({
          title: '本场对话驾驶舱',
          session_id: sessionId,
          package: { html: pkg.html, css: pkg.css ?? '', js: pkg.js ?? '', resources: pkg.resources ?? [], node_map: pkg.node_map ?? [] },
          binding_manifest: { bindings: [], result_refs: [] },
          idempotency_key: crypto.randomUUID(),
        });
        const pageId = saved?.page?.page_id;
        if (!saved?.ok || !pageId) throw new Error('页面未能写入驾驶舱');
        pageStore?.selectCockpitAsset('page:' + pageId);
        await pageStore?.refreshPages();
        await pageStore?.openPage(pageId);
        revealGeneratedPage(sessionId, pageId);
      },
      async fetchResults() {
        const http = competitionHttpOptions();
        if (!http) return [];
        try {
          const res = await http.fetchImpl(`${http.basePath}/results`);
          if (!res || !res.ok) return [];
          const body = await res.json();
          return Array.isArray(body.items) ? body.items : [];
        } catch {
          return [];
        }
      },
    }),
  }, GenerateCockpitDock));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: COCKPIT_PANEL_ID, order: 20, label: '驾驶舱',
  }, CockpitPanelIcon));
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: COCKPIT_PANEL_ID,
    children: { 'cockpit.crm': { kind: 'single', scope: 'root' } },
    inject: () => {
      const http = competitionHttpOptions();
      return {
        goConversation,
        themeSource,
        board: boardLive,
        library,
        pageStore,
        delivery,
        fileClient,
        aiClient,
        leaveCoordinator,
        listWorkspaceFiles,
        openWorkspaceFile,
        readWorkspaceFile,
        askTransport: http
          ? {
            fetchImpl: http.fetchImpl,
            path: '/api/v1/analytics/board-spec/ask',
            resultsPath: `${http.basePath}/results`,
          }
          : undefined,
      };
    },
  }, CockpitMainPanel));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: STAFF_PANEL_ID, order: 21, label: '数据员工',
  }, StaffPanelIcon));
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: STAFF_PANEL_ID,
    inject: () => ({
      goConversation,
      themeSource,
      openPlazaRole() {
        void (async () => {
          try {
            const created = await ctx.sessions.create();
            retainMainView(ctx.sessions, created);
            ctx.layout?.selectPanel(null);
          } catch {
            goConversation();
          }
        })();
      },
    }),
  }, StaffMainPanel));
}
