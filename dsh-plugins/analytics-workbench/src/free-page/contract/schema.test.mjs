import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from './fixture.json' with { type: 'json' };
import {
  parsePageDocument, parsePagePackage, parseBridgeMessage, parseBindingManifest,
  FORBIDDEN_BRIDGE_OPS, PAGE_OPERATIONS, BINDING_STATE_VALUES,
  parseNodeRef, parseCAS, parseEditOperation, parseEditContext, evaluateCAS, admitEdit,
  EDIT_CHANNEL_VALUES, EDIT_ACTION_VALUES,
} from './schema.mjs';
import { sourceHash } from '../presentation/model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const frozen = JSON.parse(readFileSync(join(here,
  '../../../../../docs/hackathon/free-html-cockpit/fixtures/frozen-contract-v0.json'), 'utf8'));

const sampleDoc = {
  schema_version: 'free-page/v1',
  page_id: frozen.asset.page_id,
  session_id: frozen.asset.session_id,
  title: frozen.asset.title,
  version: 1,
  binding_state: 'UNBOUND_SAMPLE',
  package: fixture.package,
  binding_manifest: fixture.binding_manifest,
};

test('published fixture matches coordinator freeze on shared fields', () => {
  assert.equal(fixture.schema_version, frozen.asset.schema_version);
  assert.deepEqual(fixture.binding_states, frozen.asset.binding_states);
  assert.deepEqual(fixture.operations, frozen.operations);
  assert.deepEqual(fixture.package, frozen.asset.package);
  assert.equal(fixture.errors.INVALID_PAGE, 422);
  assert.equal(fixture.errors.INVALID_BOARD, undefined);
  assert.deepEqual(PAGE_OPERATIONS, ['GENERATE', 'PATCH', 'SAVE', 'ROLLBACK']);
  assert.deepEqual(BINDING_STATE_VALUES, ['UNBOUND_SAMPLE', 'BOUND_VERIFIED', 'BOUND_STALE']);
});

test('parsePageDocument accepts the unbound sample and free JS', () => {
  const got = parsePageDocument(sampleDoc);
  assert.equal(got.ok, true);
  assert.equal(got.value.package.js.includes('getContext'), true);
  const custom = parsePageDocument({
    ...sampleDoc,
    package: { ...fixture.package, html: '<html><body><script>window.x=1</script></body></html>', js: 'window.x=1' },
  });
  assert.equal(custom.ok, true);
});

test('parsePageDocument rejects BoardSpec fields, unknown keys and empty html', () => {
  assert.equal(parsePageDocument({ ...sampleDoc, blocks: [] }).error.code, 'INVALID_PAGE');
  assert.equal(parsePageDocument({ ...sampleDoc, board_id: 'board_x' }).error.code, 'INVALID_PAGE');
  assert.equal(parsePageDocument({ ...sampleDoc, owner: 'alice' }).error.code, 'INVALID_PAGE');
  assert.equal(parsePageDocument({ ...sampleDoc, binding_state: 'BOUND_SAMPLE' }).error.code, 'INVALID_PAGE');
  assert.equal(parsePagePackage({ ...fixture.package, html: '' }).error.code, 'INVALID_PAGE');
  assert.equal(parseBindingManifest({ bindings: [{ binding_id: 'b1', result_ref: 'missing' }], result_refs: [] }).ok, false);
  assert.equal(parseBindingManifest({
    result_refs: ['result_fixture_1'],
    bindings: [{ binding_id: 'b1', result_ref: 'result_fixture_1', mode: 'sql' }],
  }).error.code, 'INVALID_PAGE');
  assert.equal(parsePagePackage({
    ...fixture.package,
    resources: [{ resource_id: 'blob_1', content_type: 'image/png', sha256: 'zz', byte_length: 1 }],
  }).error.code, 'INVALID_PAGE');
  assert.equal(parsePageDocument({ ...sampleDoc, binding_state: 'BOUND_VERIFIED' }).error.code, 'INVALID_PAGE');
});

test('parseBridgeMessage covers unknown op, nonce, expiry and budget', () => {
  const session = { instance_id: 'inst_1', nonce: 'nonce_1' };
  const read = {
    protocol: 'free-page-bridge/v1', instance_id: 'inst_1', request_id: 'req_1',
    nonce: 'nonce_1', seq: 0, ...fixture.data_read,
  };
  assert.equal(parseBridgeMessage(read, session).ok, true);
  assert.equal(parseBridgeMessage({ ...read, op: 'sql' }, session).error.code, 'BRIDGE_UNKNOWN_OP');
  assert.equal(parseBridgeMessage({ ...read, op: 'save' }, session).error.code, 'BRIDGE_UNKNOWN_OP');
  assert.equal(parseBridgeMessage({ ...read, nonce: 'other' }, session).error.code, 'BRIDGE_NONCE');
  assert.equal(parseBridgeMessage(read, { ...session, expired: true }).error.code, 'BRIDGE_EXPIRED_INSTANCE');
  assert.equal(parseBridgeMessage({
    protocol: 'free-page-bridge/v1', instance_id: 'inst_1', request_id: 'req_1',
    nonce: 'nonce_1', seq: 0, op: 'data.chunk', byte_length: 65537,
  }, session).error.code, 'PACKAGE_TOO_LARGE');
  assert.equal(parseBridgeMessage({ ...read, owner: 'alice' }, session).error.code, 'INVALID_PAGE');
  assert.equal(parseBridgeMessage({ ...read, mode: 'sql' }, session).error.code, 'INVALID_PAGE');
  for (const op of FORBIDDEN_BRIDGE_OPS) {
    assert.equal(parseBridgeMessage({ ...read, op }, session).error.code, 'BRIDGE_UNKNOWN_OP');
  }
});

test('parsePagePackage accepts omitted presentation defaults and rejects a stale source hash', () => {
  const pkg = { html: '<section id="cards">x</section>', css: '', js: '', resources: [], node_map: [] };
  const presentation = { source_hash: sourceHash(pkg), edits: [
    { target: { anchor: { attribute: 'id', value: 'cards' }, path: [] }, text: 'y' },
  ] };
  const got = parsePagePackage({ ...pkg, presentation });
  assert.equal(got.ok, true);
  assert.equal(got.value.presentation.edits[0].text, 'y');
  assert.equal(parsePagePackage({ ...pkg, presentation: { ...presentation, source_hash: '0'.repeat(64) } }).error.code, 'INVALID_PAGE');
  assert.equal(parsePagePackage({ ...pkg, presentation: { ...presentation, edits: [{ ...presentation.edits[0], style: { color: 'url(x)' } }] } }).ok, false);
});

test('legacy PagePackage and PageDocument stay readable without edit fields', () => {
  assert.equal(parsePageDocument(sampleDoc).ok, true);
  assert.equal(parsePagePackage(fixture.package).ok, true);
  assert.equal(parsePageDocument({ ...sampleDoc, source_hash: 'a'.repeat(64) }).error.code, 'INVALID_PAGE');
  assert.equal(parsePagePackage({ ...fixture.package, region_hash: 'a'.repeat(64) }).error.code, 'INVALID_PAGE');
  assert.equal(parsePageDocument({ ...sampleDoc, node_graph: [] }).error.code, 'INVALID_PAGE');
});

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

function editNode(overrides = {}) {
  return {
    page_id: 'page_1',
    node_id: 'n_title',
    kind: 'static_element',
    selector: "[data-shine-node='n_title']",
    source_range: { start: 10, end: 40 },
    mapping_token: 'map_token_1',
    source_hash: HASH,
    region_hash: HASH,
    ...overrides,
  };
}

function editScope(overrides = {}) {
  return { page_id: 'page_1', node_id: 'n_title', source_range: { start: 0, end: 80 }, ...overrides };
}

function editCas(overrides = {}) {
  return { base_version: 3, source_hash: HASH, region_hash: HASH, idempotency_key: 'idem_1', ...overrides };
}

function editOperation(overrides = {}) {
  return {
    schema_version: 'free-page-edit/v1',
    operation_id: 'op_1',
    channel: 'source',
    action: 'replace',
    selected_scope: editScope(),
    capabilities: ['edit:source'],
    node: editNode(),
    cas: editCas(),
    encoding: 'bytes',
    payload: '你好',
    byte_length: 6,
    splice: { start: 10, end: 40 },
    expected_region_hash: HASH,
    ...overrides,
  };
}

function editContext(overrides = {}) {
  return {
    schema_version: 'free-page-edit-context/v1',
    edit_context_id: 'ctx_1',
    user_id: 'user_1',
    tenant_id: 'tenant_1',
    page_id: 'page_1',
    version: 3,
    selected_node: editNode(),
    capabilities: ['edit:presentation', 'edit:source', 'edit:logic'],
    created_at: 1000,
    expires_at: 11000,
    ttl_ms: 10000,
    ...overrides,
  };
}

function editHead(overrides = {}) {
  return {
    actor_user_id: 'user_1',
    actor_tenant_id: 'tenant_1',
    now_ms: 5000,
    version: 3,
    source_hash: HASH,
    region_hash: HASH,
    ...overrides,
  };
}

test('edit contract admits presentation overlay, source replace, and logic update', () => {
  assert.deepEqual(EDIT_CHANNEL_VALUES, ['presentation', 'source', 'logic']);
  assert.deepEqual(EDIT_ACTION_VALUES, ['insert', 'update', 'delete', 'move', 'replace']);
  const presentation = editOperation({
    operation_id: 'op_overlay',
    channel: 'presentation',
    action: 'update',
    capabilities: ['edit:presentation'],
    encoding: 'overlay',
    payload: { text: '新标题' },
    byte_length: 0,
    splice: undefined,
    expected_region_hash: undefined,
  });
  delete presentation.splice;
  delete presentation.expected_region_hash;
  const admitted = admitEdit(editContext(), presentation, editHead());
  assert.equal(admitted.ok, true);
  assert.equal(admitted.value.operation.encoding, 'overlay');
  assert.equal(admitted.value.operation.payload.text, '新标题');
  assert.equal(admitted.value.operation.splice, null);
  assert.equal(admitEdit(editContext(), editOperation(), editHead()).ok, true);
  const logic = editOperation({
    operation_id: 'op_logic',
    channel: 'logic',
    action: 'update',
    capabilities: ['edit:logic'],
    payload: 'x',
    byte_length: 1,
    splice: { start: 12, end: 18 },
  });
  assert.equal(admitEdit(editContext(), logic, editHead()).ok, true);
  assert.equal(parseEditOperation(editOperation({
    action: 'move', payload: 'ab', byte_length: 2, splice: { start: 10, end: 20 }, destination: { start: 30, end: 30 },
  })).ok, true);
  assert.equal(parseEditOperation(editOperation({
    action: 'delete', payload: undefined, byte_length: 0, splice: { start: 10, end: 20 },
  })).value.payload, null);
  assert.equal(parseEditOperation(editOperation({
    action: 'insert', payload: 'Z', byte_length: 1, splice: { start: 20, end: 20 },
  })).ok, true);
  assert.equal(parseNodeRef(editNode()).ok, true);
  assert.equal(parseCAS(editCas()).ok, true);
});

test('edit contract rejects illegal fields, unknown operations, and silent byte writes', () => {
  assert.equal(parseNodeRef({ ...editNode(), owner: 'alice' }).error.code, 'INVALID_EDIT');
  assert.equal(parseNodeRef({ ...editNode(), selector: undefined, source_range: undefined }).error.code, 'INVALID_EDIT');
  assert.equal(parseEditOperation({ ...editOperation(), sql: 'select 1' }).error.code, 'INVALID_EDIT');
  assert.equal(parseEditOperation({ ...editOperation(), action: 'compile' }).error.code, 'INVALID_EDIT');
  assert.equal(parseEditOperation({ ...editOperation(), action: 'CREATE' }).error.message, '未知 operation');
  const bytesOverlay = editOperation({ channel: 'presentation', capabilities: ['edit:presentation'], encoding: 'bytes' });
  assert.equal(parseEditOperation(bytesOverlay).error.code, 'INVALID_EDIT');
  const missingSplice = editOperation();
  delete missingSplice.splice;
  assert.match(parseEditOperation(missingSplice).error.message, /未知字节/);
  const scriptOverlay = editOperation({
    channel: 'presentation',
    action: 'update',
    capabilities: ['edit:presentation'],
    encoding: 'overlay',
    payload: { innerHTML: '<script>' },
    byte_length: 0,
  });
  delete scriptOverlay.splice;
  delete scriptOverlay.expected_region_hash;
  assert.equal(parseEditOperation(scriptOverlay).error.code, 'INVALID_EDIT');
  assert.equal(parseEditContext({ ...editContext(), expires_at: 1001 }).error.code, 'INVALID_EDIT_CONTEXT');
  assert.equal(parseEditContext({ ...editContext(), capabilities: [] }).ok, true);
  assert.equal(parseEditOperation({ ...editOperation(), capabilities: [] }).error.code, 'INVALID_EDIT');
});

test('published OpenAPI edit enums match the runtime contract', () => {
  const openapi = JSON.parse(readFileSync(join(here, '../../../../../backend/contracts/analytics-page.openapi.json'), 'utf8'));
  assert.deepEqual(openapi['x-edit-channels'], EDIT_CHANNEL_VALUES);
  assert.deepEqual(openapi['x-edit-actions'], EDIT_ACTION_VALUES);
  assert.equal(openapi['x-edit-presentation'], 'overlay');
  assert.equal(openapi['x-edit-source-logic'], 'hashed-byte-splice');
  assert.equal(openapi['x-page-errors'].CAS_CONFLICT, 409);
  assert.equal(openapi['x-page-errors'].VERSION_CONFLICT, 409);
  assert.equal(openapi['x-page-errors'].SCOPE_VIOLATION, 422);
  assert.equal(openapi.components.schemas.NodeRef.required.includes('mapping_token'), true);
  assert.equal(openapi.components.schemas.PagePackage.properties.region_hash, undefined);
});

test('edit contract reports hash mismatch, expiry, scope violation, and version conflict', () => {
  assert.equal(parseEditOperation(editOperation({ cas: editCas({ region_hash: OTHER }) })).error.code, 'CAS_CONFLICT');
  const parsed = parseEditOperation(editOperation());
  assert.equal(evaluateCAS(parsed.value.cas, { version: 3, source_hash: HASH, region_hash: OTHER }).error.code, 'CAS_CONFLICT');
  assert.equal(evaluateCAS(parsed.value.cas, { version: 4, source_hash: HASH, region_hash: HASH }).error.code, 'VERSION_CONFLICT');
  assert.equal(evaluateCAS(parsed.value.cas, { version: 9, source_hash: OTHER, region_hash: OTHER }, {
    idempotency_key: 'idem_1', fingerprint: 'other',
  }).error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(admitEdit(editContext(), editOperation(), editHead({ now_ms: 11000 })).error.code, 'EDIT_EXPIRED');
  assert.equal(admitEdit(editContext(), editOperation(), editHead({ version: 4 })).error.code, 'VERSION_CONFLICT');
  assert.equal(admitEdit(editContext(), editOperation(), editHead({ region_hash: OTHER })).error.code, 'CAS_CONFLICT');
  assert.equal(parseEditOperation(editOperation({ splice: { start: 40, end: 50 } })).error.code, 'SCOPE_VIOLATION');
  const other = editOperation({
    node: editNode({ node_id: 'n_other' }),
    selected_scope: editScope({ node_id: 'n_other' }),
  });
  assert.equal(admitEdit(editContext(), other, editHead()).error.code, 'SCOPE_VIOLATION');
  assert.equal(admitEdit(editContext({ capabilities: ['edit:presentation'] }), editOperation(), editHead()).error.code, 'CAPABILITY_DENIED');
  assert.equal(admitEdit(editContext(), editOperation(), editHead({ actor_user_id: 'user_2' })).error.code, 'FORBIDDEN');
});
