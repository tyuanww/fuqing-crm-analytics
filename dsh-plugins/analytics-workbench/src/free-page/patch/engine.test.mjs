import test from 'node:test';
import assert from 'node:assert/strict';
import { d48Package } from '../source-index/page-fixture.mjs';
import { T1_SEAM } from '../edit/contract-adapter.mjs';
import {
  HTML_MAX_CHARS,
  commitWorkingCopy,
  createStructuredPatchSession,
  selectionBinding,
} from './engine.mjs';
import { createEditController, isDirty, makeIds } from '../edit/index.mjs';
import { createMemoryPageStore } from './store.mjs';

const EDITOR = ['edit:presentation', 'edit:source'];
const LOGIC = [...EDITOR, 'edit:logic'];
const BOUND_OK = [...LOGIC, 'node:bound'];
const PAGE_ID = 'page_fixture_unbound';

function bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function operation({
  channel,
  node_id,
  kind,
  encoding,
  payload,
  action = 'update',
  base_version = 1,
  key = 'idem_1',
  source_hash,
  region_hash,
  operation_id = `op_${node_id}`,
}) {
  const binding = selectionBinding(d48Package(), { node_id, kind });
  assert.equal(binding.ok, true);
  const source = source_hash ?? binding.source_hash;
  const region = region_hash ?? (channel === 'logic' ? binding.logic_region_hash : binding.region_hash);
  const located = channel === 'logic' ? binding.js_range : binding.located.node.html_range;
  const sourceRange = { start: located.start, end: located.end };
  const node = {
    page_id: PAGE_ID,
    node_id,
    kind,
    selector: `[data-shine-node="${node_id}"]`,
    source_range: sourceRange,
    mapping_token: `mt.${node_id}`,
    source_hash: source,
    region_hash: region,
  };
  const formalEncoding = encoding ?? (channel === 'presentation' ? 'overlay' : 'bytes');
  const body = {
    schema_version: 'free-page-edit/v1',
    operation_id,
    channel,
    action,
    selected_scope: { page_id: PAGE_ID, node_id, source_range: sourceRange },
    capabilities: [`edit:${channel}`],
    node,
    cas: { base_version, source_hash: source, region_hash: region, idempotency_key: key },
    encoding: formalEncoding,
    byte_length: formalEncoding === 'bytes' && typeof payload === 'string' ? bytes(payload) : 0,
  };
  if (payload !== undefined) body.payload = payload;
  if (formalEncoding === 'bytes') {
    body.splice = sourceRange;
    body.expected_region_hash = region;
  }
  return body;
}

function execute(op, extra = {}) {
  const session = extra.session ?? createStructuredPatchSession();
  const pagePackage = extra.pagePackage ?? d48Package();
  const result = session.execute({
    pagePackage,
    operation: op,
    capabilities: extra.capabilities ?? EDITOR,
    headVersion: extra.headVersion ?? 1,
    selectedNodeId: extra.selectedNodeId ?? op.node?.node_id,
    binding: extra.binding ?? { bindings: [], result_refs: [] },
  });
  return { session, pagePackage, result };
}

test('parser capability denial keeps its code', () => {
  const op = operation({
    channel: 'presentation', node_id: 'n_title', kind: 'static_element', payload: { text: '新标题' },
  });
  op.capabilities = ['edit:source'];
  const { result } = execute(op);
  assert.equal(result.error.code, 'CAPABILITY_DENIED');
});

test('T1 contract parsers are the only operation schema', () => {
  assert.equal(T1_SEAM.ready, true);
  assert.deepEqual([...T1_SEAM.symbols], ['parseNodeRef', 'parseCAS', 'parseEditOperation', 'parseEditContext']);
  assert.equal(HTML_MAX_CHARS, 1_048_576);
  const op = operation({
    channel: 'presentation', node_id: 'n_title', kind: 'static_element', encoding: 'overlay', payload: { text: '合同' },
  });
  assert.equal(op.cas.idempotency_key, 'idem_1');
  assert.equal(op.idempotency_key, undefined);
  assert.equal(op.action, 'update');
  assert.equal(op.node.channel, undefined);
  assert.equal(op.encoding, 'overlay');
});

test('presentation overlay leaves the original source bytes unchanged', () => {
  const pagePackage = d48Package();
  const op = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'overlay',
    payload: { text: '新标题', style: { color: '#111' } },
  });
  const { result } = execute(op, { pagePackage });
  assert.equal(result.ok, true);
  assert.equal(result.preview.source_bytes_unchanged, true);
  assert.equal(result.preview.package.html, pagePackage.html);
  assert.equal(result.preview.package.css, pagePackage.css);
  assert.equal(result.preview.package.js, pagePackage.js);
  assert.equal(result.preview.overlay.text, '新标题');
  assert.equal(pagePackage.html.includes('示例标题'), true);
  const committed = commitWorkingCopy(pagePackage, result.preview);
  assert.equal(committed.package.html, pagePackage.html);
  assert.equal(committed.presentation_overlays.n_title.text, '新标题');
});

test('presentation rejects script content and byte encoding', () => {
  const script = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'overlay',
    payload: { text: '<script>alert(1)</script>' },
  });
  assert.equal(execute(script).result.error.code, 'DANGEROUS_CONTENT');
  const bytesOp = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'bytes',
    payload: '<h1 data-shine-node="n_title">x</h1>',
  });
  assert.equal(execute(bytesOp).result.error.code, 'INVALID_EDIT');
});

test('source splice checks hashes and keeps bytes outside the region', () => {
  const pagePackage = d48Package();
  const binding = selectionBinding(pagePackage, { node_id: 'n_title', kind: 'static_element' });
  const payload = binding.outer.replace('示例标题', '精确标题');
  const op = operation({
    channel: 'source',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'bytes',
    payload,
  });
  const { result } = execute(op, { pagePackage });
  assert.equal(result.ok, true);
  assert.equal(result.preview.source_bytes_unchanged, false);
  assert.equal(result.preview.package.html.startsWith(pagePackage.html.slice(0, binding.located.node.html_range.start)), true);
  assert.equal(result.preview.package.html.endsWith(pagePackage.html.slice(binding.located.node.html_range.end)), true);
  assert.match(result.preview.package.html, /精确标题/);
  assert.match(result.preview.package.html, /导语保持不变/);
  assert.equal(result.preview.package.js, pagePackage.js);
  assert.equal(result.preview.impact.html_outside_selection, false);
  assert.deepEqual([...result.preview.impact.foreign_html_nodes], []);
});

test('source rejects a stale region hash', () => {
  const op = operation({
    channel: 'source',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'bytes',
    payload: '<h1 data-shine-node="n_title">精确标题</h1>',
    region_hash: 'a'.repeat(64),
  });
  const result = execute(op).result;
  assert.equal(result.error.code, 'HASH_MISMATCH');
  assert.deepEqual([...result.recovery], ['redownload', 'reselect', 'reapply']);
});

test('logic is denied until capability allows it, and a bound node stays denied', () => {
  const binding = selectionBinding(d48Package(), { node_id: 'r_chart', kind: 'dynamic_region' });
  const payload = `${binding.located ? '' : ''}${d48Package().js};`;
  const op = operation({
    channel: 'logic',
    node_id: 'r_chart',
    kind: 'dynamic_region',
    encoding: 'bytes',
    payload,
  });
  assert.equal(execute(op).result.error.code, 'CAPABILITY_DENIED');
  const outside = operation({
    channel: 'logic',
    node_id: 'r_chart',
    kind: 'dynamic_region',
    encoding: 'bytes',
    payload: 'document.querySelector(\'[data-shine-node="n_title"]\')',
    key: 'logic_outside',
  });
  assert.equal(execute(outside, { capabilities: LOGIC }).result.error.code, 'SCOPE_VIOLATION');
  const bound = execute(op, {
    capabilities: LOGIC,
    binding: { bindings: [{ binding_id: 'bind_chart', result_ref: 'result_1', node_id: 'r_chart' }], result_refs: ['result_1'] },
  });
  assert.equal(bound.result.error.code, 'BOUND_NODE');
  const allowed = execute(op, { capabilities: LOGIC });
  assert.equal(allowed.result.ok, true);
  assert.equal(allowed.result.preview.html_bytes_unchanged, true);
  assert.equal(allowed.result.preview.package.html, d48Package().html);
  assert.notEqual(allowed.result.preview.package.js, d48Package().js);
  assert.equal(allowed.result.preview.package.css, d48Package().css);
});

test('shared gates reject scope, empty, illegal, version, size, and replay conflicts', () => {
  const pagePackage = d48Package();
  const binding = selectionBinding(pagePackage, { node_id: 'n_title', kind: 'static_element' });
  const outside = operation({
    channel: 'source',
    node_id: 'n_lede',
    kind: 'static_element',
    encoding: 'bytes',
    payload: binding.outer.replace('n_title', 'n_lede').replace('示例标题', '导语保持不变'),
    key: 'idem_scope',
  });
  const scoped = execute(outside, { selectedNodeId: 'n_title' });
  assert.equal(scoped.result.error.code, 'SCOPE_VIOLATION');

  const empty = operation({
    channel: 'source',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'bytes',
    payload: binding.outer,
    key: 'idem_empty',
  });
  assert.equal(execute(empty).result.error.code, 'EMPTY_PATCH');

  assert.equal(execute({ schema_version: 'other', action: 'MOVE' }).result.error.code, 'INVALID_EDIT');

  const conflict = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'overlay',
    payload: { text: '新标题' },
    base_version: 2,
    key: 'idem_version',
  });
  const version = execute(conflict);
  assert.equal(version.result.error.code, 'VERSION_CONFLICT');
  assert.deepEqual([...version.result.recovery], ['redownload', 'reselect', 'reapply']);

  const huge = 'A'.repeat(HTML_MAX_CHARS);
  const sized = operation({
    channel: 'source',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'bytes',
    payload: `<h1 data-shine-node="n_title">${huge}</h1>`,
    key: 'idem_size',
  });
  assert.equal(execute(sized).result.error.code, 'PACKAGE_TOO_LARGE');

  const session = createStructuredPatchSession();
  const firstOp = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'overlay',
    payload: { text: '一次' },
    key: 'idem_replay',
  });
  const first = execute(firstOp, { session, pagePackage });
  const replay = execute(firstOp, { session, pagePackage });
  assert.equal(first.result.ok, true);
  assert.equal(replay.result.replayed, true);
  assert.equal(replay.result.preview.preview_id, first.result.preview.preview_id);
  assert.equal(replay.result.receipt_pending, true);
  const recovered = session.recover(firstOp.cas.idempotency_key);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.preview.preview_id, first.result.preview.preview_id);
  assert.equal(session.acknowledge(firstOp.cas.idempotency_key).receipt_pending, false);
  const other = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'overlay',
    payload: { text: '另一次' },
    key: 'idem_replay',
  });
  assert.equal(execute(other, { session, pagePackage }).result.error.code, 'IDEMPOTENCY_CONFLICT');
});

test('edit controller previews a presentation overlay without writing a saved version', () => {
  const store = createMemoryPageStore({ now: () => 1_000_000 });
  const page = store.seedPage({
    page_id: 'page_fixture_unbound',
    session_id: 'native_session_fixture',
    version: 1,
    package: d48Package(),
  });
  const controller = createEditController({ store, now: () => 1_000_000, ids: makeIds() });
  controller.open(page);
  controller.enterEdit();
  controller.select({ kind: 'static_element', node_id: 'n_title' });
  const issued = controller.bindServerEditContext({
    edit_context_id: `editctx_${'a'.repeat(32)}`,
    capabilities: EDITOR,
    base_version: 1,
  });
  assert.equal(issued.ok, true);
  const handoff = controller.nativeHandoff();
  assert.deepEqual(handoff.handoff, { context_id: issued ? `editctx_${'a'.repeat(32)}` : '' });
  assert.deepEqual(Object.keys(handoff.handoff), ['context_id']);
  const op = operation({
    channel: 'presentation',
    node_id: 'n_title',
    kind: 'static_element',
    encoding: 'overlay',
    payload: { text: '画布标题' },
    key: 'idem_controller',
  });
  const preview = controller.previewStructured(op);
  assert.equal(preview.ok, true);
  assert.equal(preview.submitted, false);
  const confirmed = controller.confirmStructuredWorkingCopy();
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.saved_version_written, false);
  assert.equal(confirmed.source_bytes_unchanged, true);
  assert.equal(controller.snapshot().saved.version, 1);
  assert.equal(controller.snapshot().draft.html, page.package.html);
  assert.equal(controller.snapshot().presentation_overlay.n_title.text, '画布标题');
  assert.equal(isDirty(controller.snapshot()), false);
});

test('source insert, delete, move, and replace stay inside the node', () => {
  const pagePackage = d48Package();
  const binding = selectionBinding(pagePackage, { node_id: 'n_title', kind: 'static_element' });
  const range = binding.located.node.html_range;
  const local = binding.outer.indexOf('示例标题');
  const word = range.start + local;

  const inserted = operation({
    channel: 'source', node_id: 'n_title', kind: 'static_element', payload: '新', key: 'idem_insert', action: 'insert',
  });
  inserted.splice = { start: word, end: word };
  inserted.byte_length = bytes('新');
  const insertResult = execute(inserted, { pagePackage }).result;
  assert.equal(insertResult.ok, true, insertResult.error?.code);
  assert.match(insertResult.preview.package.html, /新示例标题/);
  assert.match(insertResult.preview.package.html, /导语保持不变/);

  const deleted = operation({
    channel: 'source', node_id: 'n_title', kind: 'static_element', payload: '', key: 'idem_delete', action: 'delete',
  });
  delete deleted.payload;
  deleted.byte_length = 0;
  deleted.splice = { start: word, end: word + '示例'.length };
  const deleteResult = execute(deleted, { pagePackage }).result;
  assert.equal(deleteResult.ok, true, deleteResult.error?.code);
  assert.match(deleteResult.preview.package.html, /<h1[^>]*>标题<\/h1>/);
  assert.match(deleteResult.preview.package.html, /导语保持不变/);

  const moved = operation({
    channel: 'source', node_id: 'n_title', kind: 'static_element', payload: '示例', key: 'idem_move', action: 'move',
  });
  moved.splice = { start: word, end: word + '示例'.length };
  moved.byte_length = bytes('示例');
  moved.destination = { start: word + '示例标题'.length, end: word + '示例标题'.length };
  const moveResult = execute(moved, { pagePackage }).result;
  assert.equal(moveResult.ok, true, moveResult.error?.code);
  assert.match(moveResult.preview.package.html, /标题示例/);

  const replaced = operation({
    channel: 'source', node_id: 'n_title', kind: 'static_element',
    payload: binding.outer.replace('示例标题', '替换标题'), key: 'idem_replace', action: 'replace',
  });
  const replaceResult = execute(replaced, { pagePackage }).result;
  assert.equal(replaceResult.ok, true, replaceResult.error?.code);
  assert.match(replaceResult.preview.package.html, /替换标题/);
  assert.equal(replaceResult.preview.package.html.endsWith(pagePackage.html.slice(range.end)), true);
});
