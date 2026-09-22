/**
 * Host-held free-page edit session.
 *
 * saved Vn -> session working copy -> patch preview -> explicit confirm -> CAS -> Vn+1
 *                       |                |                |
 *                  cancel/discard   invalid/expired   conflict/unknown reply
 *                       +----------------+----------------+
 *                                  retain Vn
 *
 * Presentation, source, and logic commits enter the in-memory session history.
 * Undo and redo move that working copy and do not append a page version.
 * Canceling a preview does not append one either. Refresh reloads the confirmed
 * head; the session history is not durable. Concurrent edits are not merged.
 *
 * D6 = PATCH confirm of a valid preview (original idempotency_key).
 * D9 = explicit SAVE of the host draft. exit/close/cancel/clear-selection do not save.
 * hasActiveEditContext is not dirty by itself (D42).
 */
import { buildSourceIndex, locateSelection, pageIdentity } from '../source-index/index.mjs';
import { applyInnerText, applyRegionOuter, commitWorkingCopy, createPatchPreview, previewStructuredPatch, rebuildAfterApply } from '../patch/index.mjs';
import { ERRORS, fail, isIdentity } from '../patch/codes.mjs';
import { createSessionHistory } from './session-history.mjs';

const CAS_RECOVERY = Object.freeze(['redownload', 'reselect', 'reapply']);
const CAS_CODES = new Set(['VERSION_CONFLICT', 'HASH_MISMATCH']);

function clone(value) {
  return structuredClone(value);
}

function packagesEqual(a, b) {
  return a.html === b.html && a.css === b.css && a.js === b.js;
}

export function hasActiveEditContext(state) {
  return Boolean(state?.edit_context);
}

export function isDirty(state) {
  if (!state?.saved) return false;
  if (state.confirmation_uncertain) return true;
  if (state.preview?.status === 'PENDING') return true;
  return !packagesEqual(state.saved.package, state.draft);
}

export function createEditController({
  store,
  now = () => Date.now(),
  ttl_ms = 15 * 60 * 1000,
  ids = makeIds(),
} = {}) {
  if (!store) throw new Error('store required');
  let state = emptyState();
  let serverContext = null;
  const structuredReplay = new Map();
  const history = createSessionHistory();
  let localStep = 0;

  function snapshot() {
    const copy = clone(state);
    copy.session = history.view();
    return copy;
  }

  function set(patch) {
    state = { ...state, ...patch };
    state.undo_stack = history.undoDrafts();
    return snapshot();
  }

  function open(page) {
    if (!pageIdentity(page.page_id) || !pageIdentity(page.session_id)) return fail('INVALID_PAGE');
    const pagePackage = clone(page.package);
    let index;
    try {
      index = buildSourceIndex(pagePackage);
    } catch {
      return fail('INVALID_PAGE', { reason: 'index' });
    }
    state = {
      page_id: page.page_id,
      session_id: page.session_id,
      saved: clone(page),
      draft: pagePackage,
      undo_stack: [],
      index,
      mode: 'browse',
      panel: null,
      edit_context: null,
      preview: null,
      structured_preview: null,
      presentation_overlay: clone(page.presentation_overlays ?? {}),
      confirmation_uncertain: false,
      last_error: null,
      last_idempotency_key: null,
    };
    history.clear();
    localStep = 0;
    serverContext = null;
    structuredReplay.clear();
    return { ok: true, state: snapshot() };
  }

  function bindServerEditContext(issued) {
    if (!issued || typeof issued.edit_context_id !== 'string' || !Array.isArray(issued.capabilities)) {
      return fail('INVALID_PAGE', { reason: 'server_edit_context' });
    }
    serverContext = {
      edit_context_id: issued.edit_context_id,
      capabilities: issued.capabilities.slice(),
      base_version: issued.base_version ?? issued.version,
    };
    return { ok: true, state: snapshot() };
  }

  function nativeHandoff() {
    if (!serverContext) return fail('MAPPING_STALE', { require: 'reselect' });
    return Object.freeze({ ok: true, handoff: Object.freeze({ context_id: serverContext.edit_context_id }) });
  }

  function draftForPatch() {
    return {
      html: state.draft.html,
      css: state.draft.css ?? '',
      js: state.draft.js ?? '',
      resources: state.draft.resources ?? [],
      node_map: state.draft.node_map ?? [],
      presentation_overlays: { ...(state.presentation_overlay ?? {}) },
    };
  }

  function workingNow() {
    return {
      draft: clone(state.draft),
      presentation_overlay: clone(state.presentation_overlay ?? {}),
    };
  }

  function dropEditContext(error, { cancelPendingPreview = false } = {}) {
    if (cancelPendingPreview && state.preview?.preview_id) {
      try { store.cancelPreview(state.preview.preview_id); } catch { /* the conflict response still stands */ }
    }
    serverContext = null;
    const patch = {
      edit_context: null,
      structured_preview: null,
      confirmation_uncertain: false,
      last_error: error,
    };
    if (cancelPendingPreview) patch.preview = null;
    set(patch);
    return Object.freeze({
      ok: false,
      error,
      recovery: CAS_RECOVERY,
      require: 'reselect',
      submitted: false,
      saved_version_written: false,
      state: snapshot(),
    });
  }

  function previewStructured(operation) {
    if (!state.saved) return fail('INVALID_PAGE');
    const selectedNodeId = state.edit_context?.located?.node?.node_id;
    if (!selectedNodeId || !serverContext) return fail('MAPPING_STALE', { require: 'reselect', submitted: false });
    const result = previewStructuredPatch({
      pagePackage: draftForPatch(),
      operation,
      capabilities: serverContext.capabilities,
      headVersion: state.saved.version,
      selectedNodeId,
      binding: state.saved.binding_manifest ?? null,
      replay: structuredReplay,
    });
    if (!result.ok) {
      if (CAS_CODES.has(result.error?.code)) return dropEditContext(result.error);
      set({ last_error: result.error });
      return { ...result, state: snapshot(), submitted: false };
    }
    const operationId = typeof operation?.operation_id === 'string' && operation.operation_id
      ? operation.operation_id
      : result.preview.idempotency_key;
    const structured_preview = Object.freeze({ ...result.preview, operation_id: operationId });
    return {
      ...result,
      preview: structured_preview,
      submitted: false,
      state: set({ structured_preview, last_error: null }),
    };
  }

  function confirmStructuredWorkingCopy() {
    const preview = state.structured_preview;
    if (!preview) return fail('NOT_FOUND', { submitted: false, saved_version_written: false });
    if (state.saved.version !== preview.base_version) {
      return dropEditContext(Object.freeze({ code: 'VERSION_CONFLICT', http: 409 }));
    }
    const before = workingNow();
    const committed = commitWorkingCopy(draftForPatch(), preview);
    if (!committed.ok) return { ...committed, state: snapshot(), saved_version_written: false };
    const draft = clone(committed.package);
    let index;
    try {
      index = buildSourceIndex(draft);
    } catch {
      return fail('INVALID_PAGE', { reason: 'index', saved_version_written: false, state: snapshot() });
    }
    const bound = rebindContext(index);
    const after = {
      draft,
      presentation_overlay: clone(committed.presentation_overlays ?? {}),
    };
    history.record({
      channel: preview.channel,
      operation_id: preview.operation_id || preview.idempotency_key,
      before,
      after,
    });
    return {
      ok: true,
      source_bytes_unchanged: committed.source_bytes_unchanged,
      saved_version_written: false,
      state: set({
        draft,
        index,
        structured_preview: null,
        presentation_overlay: after.presentation_overlay,
        last_error: null,
        ...bound,
      }),
    };
  }

  function enterEdit() {
    if (!state.saved) return fail('INVALID_PAGE');
    return { ok: true, state: set({ mode: 'edit', last_error: null }) };
  }

  function exitEdit() {
    return { ok: true, saved: false, state: set({ mode: 'browse', edit_context: null, panel: null }) };
  }

  function closePanel() {
    return { ok: true, saved: false, state: set({ panel: null }) };
  }

  function clearSelection() {
    return { ok: true, saved: false, state: set({ edit_context: null }) };
  }

  function select(selection) {
    if (state.mode !== 'edit') return fail('INVALID_PAGE', { reason: 'not_in_edit_mode' });
    const located = locateSelection(state.index, selection);
    if (!located.ok) {
      set({ last_error: located.error, edit_context: state.edit_context });
      return { ...located, state: snapshot(), submitted: false };
    }
    return {
      ok: true,
      located,
      state: set({
        edit_context: { selection: located.selection, located },
        last_error: null,
      }),
    };
  }

  function switchWholePage() {
    if (state.mode !== 'edit') return fail('INVALID_PAGE', { reason: 'not_in_edit_mode' });
    return select({ kind: 'whole_page', user_switched: true });
  }

  function agentContext() {
    const located = state.edit_context?.located;
    if (!located?.ok) return fail('MAPPING_STALE', { require: 'reselect' });
    const node = located.node;
    const excerpt = node
      ? state.draft.html.slice(node.html_range.start, node.html_range.end)
      : state.draft.html;
    return Object.freeze({
      ok: true,
      context: Object.freeze({
        schema_version: 'free-page-edit-context/v1',
        runtime: 'native-dsh',
        page_id: state.page_id,
        session_id: state.session_id,
        base_version: state.saved.version,
        selection: located.selection,
        scope: located.scope,
        source_excerpt: excerpt,
        related_css: node
          ? node.css_rules.map(rule => rule.text)
          : [state.draft.css],
        related_js: node
          ? node.js_ranges.map(range => state.draft.js.slice(range.start, range.end))
          : [state.draft.js],
        constraint: 'Modify only the selected scope. Do not rewrite the whole page unless scope is whole_package.',
      }),
    });
  }

  function rebindContext(index) {
    const prev = state.edit_context;
    if (!prev?.located?.ok) return { edit_context: prev ?? null };
    if (prev.located.scope === 'whole_package') {
      const located = locateSelection(index, { kind: 'whole_page', user_switched: true });
      if (!located.ok) return { edit_context: null, last_error: located.error };
      return { edit_context: { selection: located.selection, located } };
    }
    const node = prev.located.node;
    const located = locateSelection(index, { kind: node.kind, node_id: node.node_id });
    if (!located.ok) return { edit_context: null, last_error: located.error };
    return { edit_context: { selection: located.selection, located }, last_error: null };
  }

  function blockedByPreview() {
    if (state.preview?.status === 'PENDING' || state.structured_preview) {
      return fail('INVALID_PAGE', {
        reason: 'pending_preview',
        submitted: false,
        saved_version_written: false,
        state: snapshot(),
      });
    }
    return null;
  }

  function restoreWorking(working) {
    let index;
    try {
      index = buildSourceIndex(working.draft);
    } catch {
      return null;
    }
    return {
      draft: working.draft,
      presentation_overlay: working.presentation_overlay ?? {},
      index,
      structured_preview: null,
      ...rebindContext(index),
    };
  }

  function applyLocalDraft(nextPackage) {
    if (!state.saved) return fail('INVALID_PAGE');
    let index;
    try {
      index = buildSourceIndex(nextPackage);
    } catch {
      return fail('INVALID_PAGE', { reason: 'index', saved_version_written: false });
    }
    const before = workingNow();
    const bound = rebindContext(index);
    const draft = clone(nextPackage);
    const after = { draft, presentation_overlay: clone(before.presentation_overlay) };
    history.record({ channel: 'source', operation_id: `local_${++localStep}`, before, after });
    return {
      ok: true,
      saved_version_written: false,
      state: set({ draft, index, presentation_overlay: after.presentation_overlay, ...bound }),
    };
  }

  function moveSession(peek, commit) {
    const blocked = blockedByPreview();
    if (blocked) return blocked;
    const peeked = peek();
    if (!peeked) return { ok: true, changed: false, saved_version_written: false, state: snapshot() };
    const restored = restoreWorking(peeked.working);
    if (!restored) return fail('INVALID_PAGE', { reason: 'index', saved_version_written: false, state: snapshot() });
    commit();
    return {
      ok: true,
      changed: true,
      channel: peeked.channel,
      saved_version_written: false,
      state: set({ ...restored, last_error: null }),
    };
  }

  function undo() {
    return moveSession(() => history.peekUndo(), () => history.commitUndo());
  }

  function redo() {
    return moveSession(() => history.peekRedo(), () => history.commitRedo());
  }

  function refresh() {
    if (!state.page_id || typeof store.getPage !== 'function') return fail('INVALID_PAGE');
    const page = store.getPage(state.page_id);
    if (!page?.package) return fail('NOT_FOUND', { saved_version_written: false });
    const overlays = typeof store.readOverlay === 'function'
      ? store.readOverlay(page.page_id, page.version)?.overlays
      : page.presentation_overlays;
    const opened = open({ ...page, presentation_overlays: overlays ?? page.presentation_overlays ?? {} });
    if (!opened.ok) return opened;
    return { ok: true, restored: 'confirmed', saved_version_written: false, state: opened.state };
  }

  function cancelStructuredPreview() {
    if (!state.structured_preview) {
      return { ok: true, saved: false, saved_version_written: false, state: snapshot() };
    }
    return {
      ok: true,
      saved: false,
      saved_version_written: false,
      state: set({ structured_preview: null, last_error: null }),
    };
  }

  function previewPatch(proposed, { scope_confirmed = false, impact_hash = null } = {}) {
    if (!state.saved) return fail('INVALID_PAGE');
    if (!state.edit_context?.located?.ok) {
      return fail('MAPPING_STALE', { require: 'reselect', submitted: false });
    }
    const preview_id = ids.preview();
    const idempotency_key = ids.key('patch');
    const created = createPatchPreview({
      index: state.index,
      pagePackage: state.draft,
      selection: state.edit_context.selection,
      proposed,
      page_id: state.page_id,
      session_id: state.session_id,
      base_version: state.saved.version,
      idempotency_key,
      preview_id,
      now_ms: now(),
      ttl_ms,
      scope_confirmed,
      impact_hash,
    });
    if (!created.ok) {
      set({ last_error: created.error });
      return { ...created, state: snapshot(), submitted: false };
    }
    store.putPreview(created.preview);
    set({
      preview: created.preview,
      last_idempotency_key: idempotency_key,
      last_error: null,
      panel: 'patch',
    });
    return { ok: true, preview: created.preview, impact: created.impact, state: snapshot(), submitted: false };
  }

  async function confirmPatch() {
    const preview = state.preview;
    if (!preview || preview.status !== 'PENDING') return fail('NOT_FOUND', { submitted: false });
    const key = preview.idempotency_key;
    set({ confirmation_uncertain: true });
    let result;
    try {
      result = await store.confirmPatch({
        preview_id: preview.preview_id,
        idempotency_key: key,
        now_ms: now(),
      });
    } catch {
      return { ...fail('RECEIPT_UNCERTAIN'), state: snapshot(), submitted: false };
    }
    if (!result.ok) {
      if (CAS_CODES.has(result.error?.code)) return dropEditContext(result.error, { cancelPendingPreview: true });
      set({ last_error: result.error, confirmation_uncertain: result.error.code === 'RECEIPT_UNCERTAIN' });
      return { ...result, state: snapshot(), submitted: false };
    }
    const page = result.page;
    const index = rebuildAfterApply(page.package);
    history.clear();
    localStep = 0;
    set({
      saved: page,
      draft: clone(page.package),
      index,
      preview: null,
      confirmation_uncertain: false,
      last_error: null,
      undo_stack: [],
      edit_context: null,
    });
    return { ok: true, page, operation: 'PATCH', idempotent: result.idempotent === true, state: snapshot() };
  }

  async function saveDraft() {
    if (!state.saved) return fail('INVALID_PAGE');
    if (state.preview?.status === 'PENDING') {
      return fail('INVALID_PAGE', { reason: 'pending_patch_preview', submitted: false });
    }
    if (!isDirty(state) && !state.confirmation_uncertain) {
      return { ok: true, page: clone(state.saved), operation: 'SAVE', noop: true, state: snapshot() };
    }
    const reuse = state.confirmation_uncertain
      && typeof state.last_idempotency_key === 'string'
      && state.last_idempotency_key.startsWith('save_');
    const key = reuse ? state.last_idempotency_key : ids.key('save');
    set({ confirmation_uncertain: true, last_idempotency_key: key });
    let result;
    try {
      result = await store.saveDraft({
        page_id: state.page_id,
        package: state.draft,
        binding_manifest: state.saved.binding_manifest,
        idempotency_key: key,
        base_version: state.saved.version,
      });
    } catch {
      return { ...fail('RECEIPT_UNCERTAIN'), state: snapshot(), submitted: false };
    }
    if (!result.ok) {
      if (CAS_CODES.has(result.error?.code)) return dropEditContext(result.error);
      set({ last_error: result.error, confirmation_uncertain: result.error.code === 'RECEIPT_UNCERTAIN' });
      return { ...result, state: snapshot(), submitted: false };
    }
    const page = result.page;
    history.clear();
    localStep = 0;
    set({
      saved: page,
      draft: clone(page.package),
      index: rebuildAfterApply(page.package),
      confirmation_uncertain: false,
      last_error: null,
      undo_stack: [],
    });
    return { ok: true, page, operation: 'SAVE', idempotent: result.idempotent === true, state: snapshot() };
  }

  function cancelPreview() {
    if (!state.preview) return { ok: true, saved: false, saved_version_written: false, state: snapshot() };
    const cancelled = store.cancelPreview(state.preview.preview_id);
    if (!cancelled.ok) {
      set({ last_error: cancelled.error });
      return { ...cancelled, saved: false, saved_version_written: false, state: snapshot() };
    }
    return {
      ok: true,
      saved: false,
      saved_version_written: false,
      preview: cancelled.preview,
      state: set({ preview: null, last_error: null, panel: null }),
    };
  }

  function mutateSelectedText(text) {
    const located = state.edit_context?.located;
    const result = applyInnerText(state.draft, located, text);
    if (!result.ok) return { ...result, state: snapshot() };
    return applyLocalDraft(result.package);
  }

  function mutateSelectedRegion(outerHtml) {
    const located = state.edit_context?.located;
    const result = applyRegionOuter(state.draft, located, outerHtml);
    if (!result.ok) return { ...result, state: snapshot() };
    return applyLocalDraft(result.package);
  }

  return {
    open,
    enterEdit,
    exitEdit,
    closePanel,
    clearSelection,
    select,
    switchWholePage,
    agentContext,
    applyLocalDraft,
    undo,
    redo,
    refresh,
    previewPatch,
    confirmPatch,
    saveDraft,
    cancelPreview,
    cancelStructuredPreview,
    mutateSelectedText,
    mutateSelectedRegion,
    bindServerEditContext,
    nativeHandoff,
    previewStructured,
    confirmStructuredWorkingCopy,
    snapshot,
    isDirty: () => isDirty(state),
    hasActiveEditContext: () => hasActiveEditContext(state),
  };
}

function emptyState() {
  return {
    page_id: null,
    session_id: null,
    saved: null,
    draft: null,
    undo_stack: [],
    index: null,
    mode: 'browse',
    panel: null,
    edit_context: null,
    preview: null,
    structured_preview: null,
    presentation_overlay: {},
    confirmation_uncertain: false,
    last_error: null,
    last_idempotency_key: null,
  };
}

export function makeIds() {
  let n = 0;
  return {
    preview: () => `preview_${++n}`,
    key: kind => `${kind}_key_${++n}`,
  };
}

export { ERRORS, fail, isIdentity };
