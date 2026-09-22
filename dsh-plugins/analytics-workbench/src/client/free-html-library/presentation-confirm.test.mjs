import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePageAdapters } from './live-adapters.mjs';
import { createFreeHtmlLibraryStore } from './store.mjs';

const HASH = 'a'.repeat(64);
const REGION = 'b'.repeat(64);

function response(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

test('live presentation confirm uses the edit-context routes and keeps source bytes', async (t) => {
  const calls = [];
  const spec = {
    page_id: 'page_1',
    session_id: 'sess_1',
    title: '标题',
    version: 1,
    binding_state: 'UNBOUND_SAMPLE',
    binding_manifest: { bindings: [], result_refs: [] },
    package: {
      html: '<h1 data-shine-node="n_title">示例</h1>',
      css: '',
      js: '',
      resources: [],
      node_map: [],
    },
  };
  const adapters = createLivePageAdapters({
    documentsHttp: {
      base: 'http://127.0.0.1:18999',
      token: 'isolated-presentation-token-32',
      fetchImpl: async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, method: init.method, body, key: init.headers?.['Idempotency-Key'] });
        if (url.endsWith('/pages/page_1') && init.method === 'GET') return response({ spec });
        if (url.endsWith('/page-edit-contexts') && init.method === 'POST') {
          return response({
            edit_context_id: `editctx_${'ab'.repeat(16)}`,
            version: 1,
            base_version: 1,
            capabilities: ['edit:presentation', 'edit:source'],
            selected_node: {
              page_id: 'page_1',
              node_id: 'n_title',
              kind: 'static_element',
              selector: '[data-shine-node="n_title"]',
              source_range: { start: 0, end: 40 },
              mapping_token: 'mt.0123456789abcdef',
              source_hash: HASH,
              region_hash: REGION,
            },
          }, 201);
        }
        if (url.endsWith('/patches') && init.method === 'POST') return response({ preview_id: 'preview_text', ok: true });
        if (url.endsWith('/confirm')) return response({ ok: true, saved_version: 2, source_bytes_unchanged: true });
        return response({ items: [] });
      },
    },
  });
  const store = createFreeHtmlLibraryStore({ adapters });
  t.after(() => store.dispose());
  assert.equal(await store.openPage('page_1'), true);
  store.enterEdit();
  assert.equal(store.previewPresentationOverlay('n_title', { text: '新标题' }, {
    kind: 'static_element', idempotencyKey: 'text_page_1',
  }), true);
  await store.confirmPatch();
  const current = store.getSnapshot().current;
  assert.equal(current.version, 2);
  assert.equal(current.package.html, spec.package.html);
  assert.equal(current.presentation_overlays.n_title.text, '新标题');
  const create = calls.find(row => row.url.endsWith('/page-edit-contexts'));
  const patch = calls.find(row => row.url.endsWith('/patches'));
  const confirm = calls.find(row => row.url.endsWith('/confirm'));
  assert.equal(create.body.node_id, 'n_title');
  assert.equal(patch.body.node.mapping_token, 'mt.0123456789abcdef');
  assert.equal(patch.body.cas.idempotency_key, 'text_page_1');
  assert.equal(patch.key, 'text_page_1');
  assert.equal(confirm.key, 'text_page_1:confirm');
  assert.equal(calls.some(row => row.url.includes('/patch-preview')), false);
});

test('a refused live presentation confirm does not invent a local version', async (t) => {
  const adapters = createLivePageAdapters({
    documentsHttp: {
      base: 'http://127.0.0.1:18999',
      token: 'isolated-presentation-token-32',
      fetchImpl: async (url, init = {}) => {
        if (url.endsWith('/pages/page_1')) {
          return response({
            spec: {
              page_id: 'page_1', session_id: 'sess_1', title: '标题', version: 1,
              binding_state: 'UNBOUND_SAMPLE', binding_manifest: { bindings: [], result_refs: [] },
              package: { html: '<h1 data-shine-node="n_title">示例</h1>', css: '', js: '', resources: [], node_map: [] },
            },
          });
        }
        return response({ error: { code: 'VERSION_CONFLICT', message: '页面版本已变化' } }, 409);
      },
    },
  });
  const store = createFreeHtmlLibraryStore({ adapters });
  t.after(() => store.dispose());
  assert.equal(await store.openPage('page_1'), true);
  store.enterEdit();
  store.previewPresentationOverlay('n_title', { text: '新标题' }, { idempotencyKey: 'text_conflict' });
  await store.confirmPatch();
  assert.equal(store.getSnapshot().current.version, 1);
  assert.equal(store.getSnapshot().current.package.html.includes('示例'), true);
  assert.equal(store.getSnapshot().confirmationUncertain, false);
  assert.match(store.getSnapshot().message, /版本已变化|文字确认/);
});

test('presentation confirm without edit-context HTTP does not save a version', async () => {
  const adapters = createLivePageAdapters();
  const denied = await adapters.editContexts.confirmPresentation({
    pageId: 'page_1', nodeId: 'n_title', overlay: { text: '新' }, idempotencyKey: 'text_off',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'http_not_configured');
});
