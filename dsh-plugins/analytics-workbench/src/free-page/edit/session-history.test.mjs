import test from 'node:test';
import assert from 'node:assert/strict';
import { d48Package } from '../source-index/page-fixture.mjs';
import { selectionBinding } from '../patch/engine.mjs';
import { createMemoryPageStore } from '../patch/store.mjs';
import { createEditController, makeIds } from './index.mjs';

const CAPABILITIES = ['edit:presentation', 'edit:source', 'edit:logic'];

function titleOuter(text) {
  return `<h1 data-shine-node="n_title">${text}</h1>`;
}

function operationFrom(pagePackage, { channel, node_id, kind, payload, key, operation_id, base_version = 1 }) {
  const binding = selectionBinding(pagePackage, { node_id, kind });
  assert.equal(binding.ok, true, binding.error?.code);
  const source = binding.source_hash;
  const region = channel === 'logic' ? binding.logic_region_hash : binding.region_hash;
  const located = channel === 'logic' ? binding.js_range : binding.located.node.html_range;
  const sourceRange = { start: located.start, end: located.end };
  const node = {
    page_id: 'page_fixture_unbound',
    node_id,
    kind,
    selector: `[data-shine-node="${node_id}"]`,
    source_range: sourceRange,
    mapping_token: `mt.${node_id}`,
    source_hash: source,
    region_hash: region,
  };
  const encoding = channel === 'presentation' ? 'overlay' : 'bytes';
  const body = {
    schema_version: 'free-page-edit/v1',
    operation_id,
    channel,
    action: 'update',
    selected_scope: { page_id: node.page_id, node_id, source_range: sourceRange },
    capabilities: [`edit:${channel}`],
    node,
    cas: { base_version, source_hash: source, region_hash: region, idempotency_key: key },
    encoding,
    byte_length: encoding === 'bytes' ? new TextEncoder().encode(payload).byteLength : 0,
  };
  if (encoding === 'overlay') body.payload = payload;
  else {
    body.payload = payload;
    body.splice = sourceRange;
    body.expected_region_hash = region;
  }
  return body;
}

function boot() {
  const store = createMemoryPageStore({ now: () => 1_000_000 });
  const page = store.seedPage({
    page_id: 'page_fixture_unbound',
    session_id: 'native_session_fixture',
    version: 1,
    package: d48Package(),
  });
  const calls = { confirmPatch: 0, saveDraft: 0 };
  const confirmPatch = store.confirmPatch.bind(store);
  const saveDraft = store.saveDraft.bind(store);
  store.confirmPatch = async (args) => {
    calls.confirmPatch += 1;
    return confirmPatch(args);
  };
  store.saveDraft = async (args) => {
    calls.saveDraft += 1;
    return saveDraft(args);
  };
  const controller = createEditController({ store, now: () => 1_000_000, ids: makeIds() });
  assert.equal(controller.open(page).ok, true);
  assert.equal(controller.enterEdit().ok, true);
  assert.equal(controller.select({ kind: 'static_element', node_id: 'n_title' }).ok, true);
  assert.equal(controller.bindServerEditContext({
    edit_context_id: `editctx_${'b'.repeat(32)}`,
    capabilities: CAPABILITIES,
    base_version: 1,
  }).ok, true);
  return { store, controller, page, calls, saveDraft };
}

function applyChannel(controller, fields) {
  const selected = controller.select({ kind: fields.kind, node_id: fields.node_id });
  assert.equal(selected.ok, true, selected.error?.code);
  const operation = operationFrom(controller.snapshot().draft, fields);
  const preview = controller.previewStructured(operation);
  assert.equal(preview.ok, true, preview.error?.code);
  assert.equal(preview.submitted, false);
  const confirmed = controller.confirmStructuredWorkingCopy();
  assert.equal(confirmed.ok, true, confirmed.error?.code);
  assert.equal(confirmed.saved_version_written, false);
  return confirmed;
}

function applyThree(controller) {
  applyChannel(controller, {
    channel: 'presentation', node_id: 'n_title', kind: 'static_element',
    payload: { text: '画布一' }, key: 'idem_present', operation_id: 'op_present',
  });
  applyChannel(controller, {
    channel: 'source', node_id: 'n_title', kind: 'static_element',
    payload: titleOuter('源码二'), key: 'idem_source', operation_id: 'op_source',
  });
  applyChannel(controller, {
    channel: 'logic', node_id: 'r_chart', kind: 'dynamic_region',
    payload: `${d48Package().js}/*三*/`, key: 'idem_logic', operation_id: 'op_logic',
  });
}

function assertUnversioned(store, calls, pageId) {
  assert.equal(store.getPage(pageId).version, 1);
  assert.equal(store.history(pageId).length, 1);
  assert.equal(store.history(pageId)[0].operation, 'GENERATE');
  assert.equal(store.history(pageId)[0].package.html.includes('示例标题'), true);
  assert.equal(calls.confirmPatch, 0);
  assert.equal(calls.saveDraft, 0);
}

test('consecutive undo restores presentation, source, and logic without a new version', () => {
  const { store, controller, page, calls } = boot();
  applyThree(controller);
  const tip = controller.snapshot();
  assert.deepEqual(tip.session.channels, ['presentation', 'source', 'logic']);
  assert.deepEqual(tip.session.operation_ids, ['op_present', 'op_source', 'op_logic']);
  assert.equal(tip.presentation_overlay.n_title.text, '画布一');
  assert.equal(tip.draft.html.includes('源码二'), true);
  assert.equal(tip.draft.js.includes('/*三*/'), true);
  assertUnversioned(store, calls, page.page_id);

  const undoLogic = controller.undo();
  assert.equal(undoLogic.changed, true);
  assert.equal(undoLogic.channel, 'logic');
  assert.equal(undoLogic.saved_version_written, false);
  assert.equal(undoLogic.state.draft.js.includes('/*三*/'), false);
  assert.equal(undoLogic.state.draft.html.includes('源码二'), true);
  assert.equal(undoLogic.state.presentation_overlay.n_title.text, '画布一');
  assert.deepEqual(undoLogic.state.session.channels, ['presentation', 'source']);

  const undoSource = controller.undo();
  assert.equal(undoSource.channel, 'source');
  assert.equal(undoSource.saved_version_written, false);
  assert.equal(undoSource.state.draft.html.includes('源码二'), false);
  assert.equal(undoSource.state.draft.html.includes('示例标题'), true);
  assert.equal(undoSource.state.draft.html.includes('导语保持不变'), true);
  assert.equal(undoSource.state.presentation_overlay.n_title.text, '画布一');
  assert.deepEqual(undoSource.state.session.channels, ['presentation']);

  const undoPresentation = controller.undo();
  assert.equal(undoPresentation.channel, 'presentation');
  assert.equal(undoPresentation.saved_version_written, false);
  assert.equal(undoPresentation.state.presentation_overlay.n_title, undefined);
  assert.equal(undoPresentation.state.session.can_undo, false);
  assert.equal(undoPresentation.state.session.can_redo, true);
  assert.equal(controller.undo().changed, false);
  assertUnversioned(store, calls, page.page_id);
});

test('redo restores undone session steps without a new version', () => {
  const { store, controller, page, calls } = boot();
  applyThree(controller);
  assert.equal(controller.undo().changed, true);
  assert.equal(controller.undo().changed, true);
  assert.equal(controller.undo().changed, true);

  const presentation = controller.redo();
  assert.equal(presentation.changed, true);
  assert.equal(presentation.channel, 'presentation');
  assert.equal(presentation.saved_version_written, false);
  assert.equal(presentation.state.presentation_overlay.n_title.text, '画布一');
  assert.equal(presentation.state.draft.html.includes('示例标题'), true);

  const source = controller.redo();
  assert.equal(source.channel, 'source');
  assert.equal(source.saved_version_written, false);
  assert.equal(source.state.draft.html.includes('源码二'), true);
  assert.equal(source.state.draft.js.includes('/*三*/'), false);

  const logic = controller.redo();
  assert.equal(logic.channel, 'logic');
  assert.equal(logic.saved_version_written, false);
  assert.equal(logic.state.draft.js.includes('/*三*/'), true);
  assert.equal(logic.state.session.can_redo, false);
  assert.equal(controller.redo().changed, false);
  assert.deepEqual(logic.state.session.operation_ids, ['op_present', 'op_source', 'op_logic']);
  assertUnversioned(store, calls, page.page_id);
});

test('a new operation after undo drops the redo tail', () => {
  const { store, controller, page, calls } = boot();
  applyThree(controller);
  assert.equal(controller.undo().channel, 'logic');
  assert.equal(controller.undo().channel, 'source');
  assert.equal(controller.snapshot().session.can_redo, true);

  applyChannel(controller, {
    channel: 'source', node_id: 'n_title', kind: 'static_element',
    payload: titleOuter('源码新'), key: 'idem_source_new', operation_id: 'op_source_new',
  });
  const state = controller.snapshot();
  assert.deepEqual(state.session.channels, ['presentation', 'source']);
  assert.deepEqual(state.session.operation_ids, ['op_present', 'op_source_new']);
  assert.equal(state.session.can_redo, false);
  assert.equal(state.draft.html.includes('源码新'), true);
  assert.equal(state.draft.js.includes('/*三*/'), false);
  assert.equal(state.presentation_overlay.n_title.text, '画布一');
  assert.equal(controller.redo().changed, false);
  assert.equal(controller.undo().channel, 'source');
  assert.equal(controller.snapshot().draft.html.includes('示例标题'), true);
  assertUnversioned(store, calls, page.page_id);
});

test('CAS conflict clears the edit context and recovery requires a new selection', () => {
  const { store, controller, page, calls } = boot();
  applyChannel(controller, {
    channel: 'presentation', node_id: 'n_title', kind: 'static_element',
    payload: { text: '画布一' }, key: 'idem_present', operation_id: 'op_present',
  });
  const stale = operationFrom(controller.snapshot().draft, {
    channel: 'source', node_id: 'n_title', kind: 'static_element',
    payload: titleOuter('过期源码'), key: 'idem_stale', operation_id: 'op_stale',
  });
  stale.node.region_hash = 'c'.repeat(64);
  stale.cas.region_hash = 'c'.repeat(64);
  stale.expected_region_hash = 'c'.repeat(64);
  const conflict = controller.previewStructured(stale);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'HASH_MISMATCH');
  assert.deepEqual([...conflict.recovery], ['redownload', 'reselect', 'reapply']);
  assert.equal(conflict.require, 'reselect');
  assert.equal(conflict.saved_version_written, false);
  assert.equal(conflict.state.edit_context, null);
  assert.equal(controller.nativeHandoff().require, 'reselect');
  assert.equal(controller.previewStructured(stale).require, 'reselect');
  assert.deepEqual(controller.snapshot().session.channels, ['presentation']);
  assert.equal(controller.snapshot().presentation_overlay.n_title.text, '画布一');

  assert.equal(controller.select({ kind: 'static_element', node_id: 'n_title' }).ok, true);
  assert.equal(controller.bindServerEditContext({
    edit_context_id: `editctx_${'c'.repeat(32)}`,
    capabilities: CAPABILITIES,
    base_version: 1,
  }).ok, true);
  applyChannel(controller, {
    channel: 'source', node_id: 'n_title', kind: 'static_element',
    payload: titleOuter('重新应用'), key: 'idem_reapply', operation_id: 'op_reapply',
  });
  const recovered = controller.snapshot();
  assert.equal(recovered.edit_context.located.node.node_id, 'n_title');
  assert.equal(recovered.draft.html.includes('重新应用'), true);
  assert.equal(recovered.presentation_overlay.n_title.text, '画布一');
  assert.deepEqual(recovered.session.operation_ids, ['op_present', 'op_reapply']);
  assert.equal(controller.nativeHandoff().handoff.context_id, `editctx_${'c'.repeat(32)}`);
  assertUnversioned(store, calls, page.page_id);
});

test('canceling a preview does not append a version or a session step', () => {
  const { store, controller, page, calls } = boot();
  applyChannel(controller, {
    channel: 'presentation', node_id: 'n_title', kind: 'static_element',
    payload: { text: '画布一' }, key: 'idem_present', operation_id: 'op_present',
  });
  const operation = operationFrom(controller.snapshot().draft, {
    channel: 'source', node_id: 'n_title', kind: 'static_element',
    payload: titleOuter('只是预览'), key: 'idem_preview', operation_id: 'op_preview',
  });
  const preview = controller.previewStructured(operation);
  assert.equal(preview.ok, true);
  const cancelled = controller.cancelStructuredPreview();
  assert.equal(cancelled.saved, false);
  assert.equal(cancelled.saved_version_written, false);
  assert.deepEqual(controller.snapshot().session.operation_ids, ['op_present']);
  assert.equal(controller.snapshot().draft.html.includes('只是预览'), false);

  const patch = controller.previewPatch(controller.snapshot().draft);
  assert.equal(patch.ok, true);
  const dropped = controller.cancelPreview();
  assert.equal(dropped.saved, false);
  assert.equal(dropped.saved_version_written, false);
  assert.equal(dropped.preview.status, 'CANCELLED');
  assert.equal(controller.snapshot().preview, null);
  assertUnversioned(store, calls, page.page_id);
});

test('refresh restores only the confirmed version', async () => {
  const { store, controller, page, calls, saveDraft } = boot();
  applyThree(controller);
  const original = store.history(page.page_id)[0];
  original.package.html = 'mutated-by-reader';
  assert.equal(store.history(page.page_id)[0].package.html.includes('示例标题'), true);

  const other = d48Package();
  other.html = other.html.replace('示例标题', '别人已确认');
  const written = await saveDraft({
    page_id: page.page_id,
    package: other,
    binding_manifest: page.binding_manifest,
    idempotency_key: 'other_writer',
    base_version: 1,
  });
  assert.equal(written.ok, true);
  assert.equal(written.page.version, 2);
  const conflict = await controller.saveDraft();
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'VERSION_CONFLICT');
  assert.equal(conflict.require, 'reselect');
  assert.equal(conflict.saved_version_written, false);
  assert.equal(conflict.state.edit_context, null);
  assert.equal(store.getPage(page.page_id).version, 2);
  assert.deepEqual(store.history(page.page_id).map(row => row.version), [1, 2]);
  assert.deepEqual(store.history(page.page_id).map(row => row.operation), ['GENERATE', 'SAVE']);
  assert.equal(store.history(page.page_id)[0].package.html.includes('示例标题'), true);
  assert.equal(store.history(page.page_id)[0].package.html.includes('别人已确认'), false);
  assert.equal(calls.saveDraft, 1);
  assert.equal(calls.confirmPatch, 0);

  const refreshed = controller.refresh();
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.restored, 'confirmed');
  assert.equal(refreshed.saved_version_written, false);
  assert.equal(refreshed.state.saved.version, 2);
  assert.equal(refreshed.state.draft.html.includes('别人已确认'), true);
  assert.equal(refreshed.state.draft.html.includes('源码二'), false);
  assert.equal(refreshed.state.draft.js.includes('/*三*/'), false);
  assert.equal(refreshed.state.presentation_overlay.n_title, undefined);
  assert.equal(refreshed.state.session.applied, 0);
  assert.equal(refreshed.state.edit_context, null);
  assert.equal(controller.undo().changed, false);
  assert.equal(controller.redo().changed, false);
  assert.equal(store.getPage(page.page_id).version, 2);
  assert.equal(store.history(page.page_id).length, 2);
  assert.equal(calls.saveDraft, 1);
  assert.equal(calls.confirmPatch, 0);
});
