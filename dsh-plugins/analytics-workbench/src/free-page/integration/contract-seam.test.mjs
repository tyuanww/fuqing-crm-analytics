import test from 'node:test';
import assert from 'node:assert/strict';
import { admitEdit, parseEditOperation, parseNodeRef } from '../contract/index.mjs';
import { T1_SEAM } from '../edit/contract-adapter.mjs';
import { createEditController, makeIds } from '../edit/index.mjs';
import { d48Package } from '../source-index/page-fixture.mjs';
import { buildNodeGraph } from '../source-index/node-graph.mjs';
import { createMemoryPageStore } from '../patch/store.mjs';
import { createStructuredPatchSession } from '../patch/engine.mjs';
import { createEditOperation, toFormalEditOperation } from '../../client/html-edit-operations.mjs';
import { applyPresentationOverlay } from '../../client/presentation-overlay.mjs';

const PAGE_ID = 'page_fixture_unbound';

function formalFrom(graphNode, action, extra) {
  const projected = graphNode;
  assert.equal(projected.ok, true);
  const node = {
    ...projected.value,
    mapping: 'valid',
    capabilities: { select: true, direct_text: true, ai: true, attribute: true, style: true, structure: true },
  };
  const ui = createEditOperation({
    pageId: node.page_id,
    baseVersion: 1,
    node,
    action,
    ...extra,
  });
  const formal = toFormalEditOperation(ui, { idempotencyKey: `idem_${action}` });
  assert.equal(formal.ok, true, formal.reason);
  return { ui, formal: formal.operation, contextOnly: formal.context_only === true };
}

test('T1 through T4 share one NodeRef and one EditOperation', () => {
  assert.equal(T1_SEAM.ready, true);
  const pagePackage = d48Package();
  const original = pagePackage.html;
  const graph = buildNodeGraph(pagePackage, { page_id: PAGE_ID });
  assert.equal(pagePackage.html, original);
  const title = graph.node_list.find(node => node.ref?.anchor_id === 'n_title' && node.authoritative);
  const projected = graph.toEditNodeRef(title, { channel: 'source' });
  assert.equal(parseNodeRef(projected.value).ok, true);
  assert.equal(Object.hasOwn(projected.value, 'channel'), false);
  assert.notEqual(projected.value.kind, 'whole_page');

  const text = formalFrom(projected, 'set_text', { proposed: '合同标题', value: '合同标题' });
  assert.equal(text.formal.channel, 'presentation');
  assert.equal(text.formal.action, 'update');
  assert.equal(text.formal.encoding, 'overlay');
  assert.equal(text.formal.payload.text, '合同标题');
  assert.equal(text.formal.cas.idempotency_key, 'idem_set_text');
  assert.equal(parseEditOperation(text.formal).ok, true);

  const session = createStructuredPatchSession();
  const preview = session.execute({
    pagePackage,
    operation: text.formal,
    capabilities: ['edit:presentation', 'edit:source'],
    headVersion: 1,
    selectedNodeId: projected.value.node_id,
    binding: { bindings: [], result_refs: [] },
  });
  assert.equal(preview.ok, true, preview.error?.code);
  assert.equal(preview.preview.package.html, original);
  assert.equal(preview.preview.overlay.text, '合同标题');

  const structure = formalFrom(projected, 'replace_structure', {
    structure: projected.value.selector ? `<h1 data-shine-node="n_title">源码标题</h1>` : '<h1>源码标题</h1>',
  });
  assert.equal(structure.formal.channel, 'source');
  assert.equal(structure.formal.action, 'replace');
  assert.equal(structure.formal.encoding, 'bytes');
  assert.equal(structure.formal.expected_region_hash, projected.value.region_hash);
  assert.deepEqual(structure.formal.splice, projected.value.source_range);

  const ai = toFormalEditOperation(createEditOperation({
    pageId: PAGE_ID, baseVersion: 1, node: { ...projected.value, mapping: 'valid', capabilities: { ai: true } },
    action: 'ai_instruction', instruction: '只创建上下文',
  }));
  assert.equal(ai.context_only, true);
  assert.equal(ai.operation, null);

  const now = 1_700_000_000_000;
  const context = {
    schema_version: 'free-page-edit-context/v1',
    edit_context_id: `editctx_${'a'.repeat(32)}`,
    user_id: 'alice',
    tenant_id: 'brand-a',
    page_id: PAGE_ID,
    version: 1,
    selected_node: projected.value,
    capabilities: ['edit:presentation', 'edit:source'],
    created_at: now,
    expires_at: now + 60_000,
    ttl_ms: 60_000,
  };
  const admitted = admitEdit(context, text.formal, {
    version: 1,
    source_hash: projected.value.source_hash,
    region_hash: projected.value.region_hash,
    actor_user_id: 'alice',
    actor_tenant_id: 'brand-a',
    now_ms: now + 1,
  });
  assert.equal(admitted.ok, true, admitted.error?.message);

  const duplicateHtml = '<h1 data-shine-node="n_title">A</h1><h2 data-shine-node="n_title">B</h2>';
  const duplicates = buildNodeGraph({
    html: duplicateHtml, css: '', js: '',
    node_map: [{ node_id: 'n_title', kind: 'static_element', selector: 'h1' }],
  }, { page_id: PAGE_ID });
  const refused = duplicates.toEditNodeRef(duplicates.node_list.find(node => node.duplicate));
  assert.equal(refused.ok, false);
  assert.equal(refused.reselect, true);
  assert.equal(refused.value, undefined);
  assert.notEqual(refused.code, undefined);
});

test('confirmed overlay is reapplied on reload and cancel does not write it', () => {
  const pagePackage = d48Package();
  const html = pagePackage.html;
  const store = createMemoryPageStore({ now: () => 1_000 });
  const page = store.seedPage({
    page_id: PAGE_ID,
    session_id: 'native_session_fixture',
    version: 1,
    package: pagePackage,
  });
  const overlays = new Map();
  store.readOverlay = (pageId, version) => ({ overlays: overlays.get(`${pageId}:${version}`) ?? {} });
  const controller = createEditController({ store, now: () => 1_000, ids: makeIds() });
  controller.open(page);
  controller.enterEdit();
  controller.select({ kind: 'static_element', node_id: 'n_title' });
  controller.bindServerEditContext({
    edit_context_id: `editctx_${'b'.repeat(32)}`,
    capabilities: ['edit:presentation'],
    base_version: 1,
  });
  const graph = buildNodeGraph(pagePackage, { page_id: PAGE_ID });
  const title = graph.toEditNodeRef(graph.node_list.find(node => node.ref?.anchor_id === 'n_title' && node.authoritative));
  const { formal } = formalFrom(title, 'set_text', { proposed: '已确认', value: '已确认' });
  const preview = controller.previewStructured(formal);
  assert.equal(preview.ok, true, preview.error?.code);
  controller.cancelStructuredPreview();
  assert.equal(controller.snapshot().presentation_overlay.n_title, undefined);
  assert.equal(pagePackage.html, html);
  const again = controller.previewStructured(formal);
  assert.equal(again.ok, true);
  const committed = controller.confirmStructuredWorkingCopy();
  assert.equal(committed.ok, true);
  assert.equal(committed.saved_version_written, false);
  overlays.set(`${PAGE_ID}:1`, { n_title: { text: '已确认' } });
  const refreshed = controller.refresh();
  assert.equal(refreshed.state.presentation_overlay.n_title.text, '已确认');
  const shown = applyPresentationOverlay(html, refreshed.state.presentation_overlay);
  assert.equal(html.includes('已确认'), false);
  assert.equal(shown.includes('已确认'), true);
  assert.equal(pagePackage.html, html);
});
