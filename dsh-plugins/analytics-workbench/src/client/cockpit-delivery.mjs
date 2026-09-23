/** Session-scoped delivery scan for the cockpit cabinet. No UI store, no index.tsx wiring. */

import { resolvePageGenerateSession } from '../initial-session.mjs';
import {
  classifyWorkspaceFile,
  cockpitProductIdentity,
  collectWorkspaceScan,
  readWorkspaceFileText,
  workspaceRelFromEventPath,
} from './cockpit-products.mjs';
import { createNavigationEpoch, isSupersededRead } from './navigation/navigation-epoch.mjs';
import { digestBytes } from './artifact-inbox.mjs';

function safeHostValue(host, name) {
  try { return host?.[name]; } catch { return undefined; }
}

function safeHostMethod(host, name) {
  const method = safeHostValue(host, name);
  return typeof method === 'function' ? method : null;
}

export function captureDeliverySessionSource(list, compositionSessionId) {
  const sessionId = resolvePageGenerateSession(list, compositionSessionId);
  if (typeof sessionId !== 'string' || !sessionId || sessionId.startsWith('session-cockpit-ai-')) {
    return { status: 'no-session', sessionId: null, reason: 'no-explicit-session' };
  }
  return { status: 'captured', sessionId, reason: null };
}

export function inspectDeliveryHostCapabilities(host) {
  let remote;
  let workspaceChanges;
  let uiConversation;
  try { remote = host?.remote; } catch { remote = undefined; }
  try { workspaceChanges = host?.workspaceChanges; } catch { workspaceChanges = undefined; }
  try { uiConversation = host?.uiConversation; } catch { uiConversation = undefined; }
  const workspaceFiles = safeHostValue(remote, 'workspaceFiles');
  const uiEvents = safeHostValue(uiConversation, 'events');
  const canSubscribeWorkspaceChanges = Boolean(safeHostMethod(host, 'subscribeWorkspaceChanges'));
  const canSubscribePresented = Boolean(safeHostMethod(host, 'subscribePresented'));
  return {
    canListWorkspace: Boolean(safeHostMethod(workspaceFiles, 'list')),
    canReadWorkspace: Boolean(safeHostMethod(workspaceFiles, 'read')),
    canSubscribeWorkspaceChanges,
    canSubscribePresented,
    hasWorkspaceChangesService: Boolean(safeHostMethod(workspaceChanges, 'summary')),
    hasUiConversation: Boolean(safeHostMethod(uiEvents, 'register')),
    refreshMode: canSubscribeWorkspaceChanges || canSubscribePresented ? 'event+manual' : 'manual',
    workspaceChangesReason: canSubscribeWorkspaceChanges
      ? null
      : 'client inject is slots/sessions/theme/layout/remote/remote.session; workspace/changes is a Session event served by Host workspaceChanges.summary and consumed by ui-deliverables',
    presentedReason: canSubscribePresented
      ? null
      : 'present deliveries live in conversation turn deliverables; createPagePackageWaiter only observes plugin tool receipts',
  };
}

export function tryAttachWorkspaceChangeRefresh(host, onChange) {
  const cap = inspectDeliveryHostCapabilities(host);
  const subscribe = safeHostMethod(host, 'subscribeWorkspaceChanges');
  if (!subscribe) {
    return { attached: false, reason: cap.workspaceChangesReason, unsubscribe() {} };
  }
  let alive = true;
  const returned = subscribe.call(host, (payload) => {
    if (alive && typeof onChange === 'function') onChange(payload);
  });
  return {
    attached: true,
    reason: null,
    unsubscribe() {
      alive = false;
      if (typeof returned === 'function') returned();
    },
  };
}

function tryAttachPresentedRefresh(host, onChange) {
  const subscribe = safeHostMethod(host, 'subscribePresented');
  if (!subscribe) {
    return { attached: false, reason: '宿主没有提供 present 交付事件；可通过扫描或手动刷新发现 HTML。', unsubscribe() {} };
  }
  let alive = true;
  const returned = subscribe.call(host, (payload) => {
    if (alive && typeof onChange === 'function') onChange(payload);
  });
  return {
    attached: true,
    reason: null,
    unsubscribe() { alive = false; if (typeof returned === 'function') returned(); },
  };
}

export function ingestWorkspaceEventFiles(sessionId, files, { existing = [], source = 'workspace-event' } = {}) {
  if (!sessionId) return [];
  const out = [];
  const seen = new Set();
  for (const item of existing) {
    const id = cockpitProductIdentity(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  for (const file of files ?? []) {
    const rel = workspaceRelFromEventPath(typeof file === 'string' ? file : file?.path);
    if (!rel) continue;
    const kind = classifyWorkspaceFile(rel);
    if (!kind) continue;
    const item = {
      id: `file:${sessionId}:${rel}`,
      kind,
      title: rel.split('/').pop(),
      path: rel,
      sessionId,
      source,
    };
    const id = cockpitProductIdentity(item);
    if (!id) continue;
    if (seen.has(id)) {
      const index = out.findIndex(existing => cockpitProductIdentity(existing) === id);
      if (index >= 0 && source === 'session-presented' && out[index].source !== 'session-presented') {
        out[index] = { ...out[index], source };
      }
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

function emptySnapshot(epoch = 0, refreshMode = 'manual') {
  return {
    status: 'no-session',
    sessionId: null,
    files: [],
    truncated: false,
    error: null,
    epoch,
    refreshMode,
  };
}

function mergeDeliveries(files) {
  const seen = new Map();
  for (const file of files) {
    const identity = cockpitProductIdentity(file);
    const workspaceKey = file.workspaceRoot && file.path
      ? file.workspaceRoot.replace(/\\/g, '/') + '/' + file.path
      : '';
    const keys = [identity, workspaceKey, file.id].filter(Boolean);
    if (keys.some(key => seen.has(key))) continue;
    for (const key of keys) seen.set(key, file);
  }
  return [...new Set(seen.values())];
}

export function createCockpitDelivery(adapters = {}) {
  const listDir = adapters.listDir;
  const read = adapters.read;
  const history = adapters.history;
  const max = adapters.max;
  const dirDepth = adapters.dirDepth;
  const artifactInbox = adapters.artifactInbox;
  const epoch = createNavigationEpoch();
  const listeners = new Set();
  let sessionId = null;
  let eventFiles = [];
  let snapshot = emptySnapshot();
  let auto = { attached: false, unsubscribe() {} };
  let poll = null;

  const emit = () => {
    for (const listener of listeners) listener(snapshot);
  };
  const setSnapshot = (next) => {
    snapshot = next;
    emit();
    return snapshot;
  };

  async function intakeHtmlDeliveries(files, fallbackSessionId, signal) {
    if (!artifactInbox?.intake || typeof adapters.readBytes !== 'function') return;
    for (const file of files ?? []) {
      signal?.throwIfAborted();
      if (file?.kind !== 'html' || !file?.path) continue;
      const relative = workspaceRelFromEventPath(file.path);
      const sourceSession = file.sessionId || fallbackSessionId;
      if (!relative || !sourceSession) continue;
      try {
        const bytes = await api.readBytes(relative, { sessionId: sourceSession, signal });
        const contentHash = await digestBytes(bytes);
        await artifactInbox.intake({
          source: file.source === 'session-presented' ? 'native_present' : 'workspace_file',
          session_id: sourceSession,
          path: relative,
          title: file.title || relative.split('/').pop() || 'HTML 产物',
          content_hash: contentHash,
        });
      } catch {
        // A file can still remain visible in the cabinet when the optional
        // inbox read/hash bridge is unavailable or the session has expired.
      }
    }
  }

  const api = {
    captureSource(list, compositionSessionId) {
      const captured = captureDeliverySessionSource(list, compositionSessionId);
      api.setSessionId(captured.sessionId);
      return captured;
    },
    setSessionId(id) {
      const next = typeof id === 'string' && id ? id : null;
      poll?.stop(); poll = null;
      if (next !== sessionId) {
        sessionId = next;
        eventFiles = [];
        const ticket = epoch.begin('delivery-session');
        epoch.settle(ticket.epoch);
        setSnapshot({ ...emptySnapshot(ticket.epoch, snapshot.refreshMode), sessionId: next, status: next ? 'empty' : 'no-session',
          ...(history ? { files: snapshot.files.filter(file => file.source?.startsWith('session-')), history: snapshot.history } : {}) });
      }
      return { status: next ? 'captured' : 'no-session', sessionId: next, reason: next ? null : 'no-explicit-session' };
    },
    getSessionId() {
      return sessionId;
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    inspectHost: inspectDeliveryHostCapabilities,
    attachHostEvents(host) {
      auto.unsubscribe();
      const workspace = tryAttachWorkspaceChangeRefresh(host, payload => {
        const files = Array.isArray(payload?.files) ? payload.files : [];
        if (files.length) api.ingestEventFiles(files, { source: 'workspace-event' });
        void api.refresh();
      });
      const presented = tryAttachPresentedRefresh(host, payload => {
        const files = Array.isArray(payload?.files) ? payload.files : [];
        if (files.length) api.ingestEventFiles(files, { source: 'session-presented' });
        void api.refresh();
      });
      auto = {
        attached: workspace.attached || presented.attached,
        reason: workspace.attached ? null : presented.reason || workspace.reason,
        unsubscribe() { workspace.unsubscribe(); presented.unsubscribe(); },
      };
      snapshot = { ...snapshot, refreshMode: auto.attached ? 'event+manual' : 'manual' };
      emit();
      return { attached: auto.attached, reason: auto.reason };
    },
    startPolling(options = {}) {
      poll?.stop();
      const targetSession = options.sessionId ?? sessionId;
      if (!targetSession) return { started: false, stop() {} };
      let stopped = false;
      let inFlight = false;
      const startedAt = Date.now();
      const targetPaths = new Set((options.targetPaths ?? []).map(path => workspaceRelFromEventPath(path)).filter(Boolean));
      const intervalMs = Number.isFinite(options.intervalMs) ? Math.max(10, options.intervalMs) : 2_000;
      const maxMs = Number.isFinite(options.maxMs) ? Math.max(intervalMs, options.maxMs) : 20_000;
      const stop = () => { stopped = true; if (poll?.stop === stop) poll = null; if (timer) clearInterval(timer); };
      const tick = async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        try {
          await api.refresh({ sessionId: targetSession });
          const foundTarget = targetPaths.size > 0 && snapshot.files.some(file => targetPaths.has(file.path));
          if (foundTarget || Date.now() - startedAt >= maxMs) stop();
        } finally {
          inFlight = false;
        }
      };
      const timer = setInterval(tick, intervalMs);
      poll = { stop };
      void tick();
      return { started: true, stop };
    },
    async refresh(options = {}) {
      const id = options.sessionId ?? sessionId;
      const ticket = epoch.begin('delivery-refresh');
      if (!id && !history) {
        if (!epoch.isCurrent(ticket.epoch)) return snapshot;
        epoch.settle(ticket.epoch);
        return setSnapshot(emptySnapshot(ticket.epoch, snapshot.refreshMode));
      }
      if (id !== sessionId) eventFiles = [];
      sessionId = id;
      setSnapshot({
        ...snapshot,
        status: 'loading',
        sessionId: id,
        error: null,
        epoch: ticket.epoch,
      });
      try {
        const signal = options.signal ? AbortSignal.any([options.signal, ticket.signal]) : ticket.signal;
        const [scan, past] = await Promise.all([
          id ? collectWorkspaceScan(listDir, id, { signal, max, dirDepth })
            : { files: [], truncated: false, error: null, status: 'empty', lists: 0 },
          history ? history(null, signal).catch(error => ({ files: [], error: error?.message || '历史交付读取失败' })) : null,
        ]);
        if (!epoch.isCurrent(ticket.epoch)) return snapshot;
        epoch.settle(ticket.epoch);
        const files = mergeDeliveries([
          ...eventFiles,
          ...(past?.files ?? []),
          ...scan.files.map(file => ({ ...file, workspaceRoot: past?.currentWorkspace })),
        ]);
        await intakeHtmlDeliveries(files, id, signal);
        const status = files.length ? 'ready' : scan.error || past?.error ? 'error' : 'empty';
        return setSnapshot({
          status,
          sessionId: id,
          files,
          truncated: scan.truncated,
          error: scan.error,
          epoch: ticket.epoch,
          refreshMode: snapshot.refreshMode,
          lists: scan.lists,
          ...(history ? { history: { ...past, files: undefined } } : {}),
        });
      } catch (error) {
        if (isSupersededRead(error) || !epoch.isCurrent(ticket.epoch)) return snapshot;
        epoch.settle(ticket.epoch);
        return setSnapshot({
          status: 'error',
          sessionId: id,
          files: [],
          truncated: false,
          error: 'refresh-failed',
          epoch: ticket.epoch,
          refreshMode: snapshot.refreshMode,
        });
      }
    },
    async loadMore() {
      if (!history || !snapshot.history?.nextCursor || snapshot.status === 'loading') return snapshot;
      const cursor = snapshot.history.nextCursor, previous = snapshot;
      const ticket = epoch.begin('delivery-history-more');
      setSnapshot({ ...snapshot, status: 'loading', epoch: ticket.epoch });
      try {
        const past = await history(cursor, ticket.signal);
        if (!epoch.isCurrent(ticket.epoch)) return snapshot;
        epoch.settle(ticket.epoch);
        const files = mergeDeliveries([...previous.files, ...past.files]);
        await intakeHtmlDeliveries(past.files, sessionId, ticket.signal);
        return setSnapshot({ ...previous, files, status: files.length ? 'ready' : 'empty', epoch: ticket.epoch,
          history: { ...past, files: undefined, examined: (previous.history.examined ?? 0) + past.examined,
            failures: [...(previous.history.failures ?? []), ...(past.failures ?? [])],
            unsupportedPaths: (previous.history.unsupportedPaths ?? 0) + (past.unsupportedPaths ?? 0) } });
      } catch (error) {
        if (!epoch.isCurrent(ticket.epoch)) return snapshot;
        epoch.settle(ticket.epoch);
        return setSnapshot({ ...previous, history: { ...previous.history, error: error.message }, epoch: ticket.epoch });
      }
    },
    async readFile(path, options = {}) {
      const id = options.sessionId ?? sessionId;
      return readWorkspaceFileText(read, id, path, options);
    },
    async readBytes(path, options = {}) {
      const id = options.sessionId ?? sessionId;
      if (!id || !workspaceRelFromEventPath(path) || !adapters.readBytes) throw new Error('文件读取服务不可用。');
      const chunks = []; let offset = 0, version;
      while (offset <= 20 * 1024 * 1024) {
        const result = await adapters.readBytes(id, path, { offset, length: 65536 }, options.signal);
        const value = result?.ok === true ? result.value : null;
        if (!value || value.offset !== offset || typeof value.data !== 'string' || value.bytes > 20 * 1024 * 1024) throw new Error('文件不可读取或超过 20 MB。');
        if (version !== undefined && value.version !== version) throw new Error('读取时文件发生变化，请重试。');
        version = value.version;
        const chunk = Uint8Array.from(atob(value.data), char => char.charCodeAt(0));
        chunks.push(chunk); offset += chunk.length;
        if (value.eof) {
          if (offset > 20 * 1024 * 1024 || (value.bytes != null && value.bytes !== offset)) throw new Error('文件未能完整读取。');
          const bytes = new Uint8Array(offset); let start = 0;
          for (const part of chunks) { bytes.set(part, start); start += part.length; }
          return bytes;
        }
        if (!chunk.length) throw new Error('文件未能完整读取。');
      }
      throw new Error('文件超过 20 MB。');
    },
    ingestEventFiles(files, options = {}) {
      const id = options.sessionId ?? sessionId;
      if (!id) return [];
      const next = ingestWorkspaceEventFiles(id, files, { existing: eventFiles, source: options.source ?? 'workspace-event' });
      eventFiles = next.filter(file => file.sessionId === id);
      if (id === sessionId) {
        setSnapshot({ ...snapshot, status: eventFiles.length ? 'ready' : snapshot.status, sessionId: id, files: mergeDeliveries([...eventFiles, ...snapshot.files]) });
      }
      return eventFiles;
    },
    dispose() {
      poll?.stop(); poll = null;
      auto.unsubscribe();
      epoch.dispose();
      listeners.clear();
    },
  };
  return api;
}
