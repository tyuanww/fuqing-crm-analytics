import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectToolchain } from '@shine-mage/dsh-plugin-kit/toolchain';
import { fileURLToPath } from 'node:url';
import { loadJsdom } from './helpers/jsdom-loader.mjs';
import { requiredDirectory } from '../required-input.mjs';
import { createCockpitAIClient } from '../src/client/cockpit-ai-client.mjs';
import { sourceHash } from '../src/free-page/presentation/model.mjs';
import { editorPageCatalog } from '../src/client/editor-page-nodes.mjs';
import { projectAIPagePreview } from '../src/client/ai-preview-projection.mjs';

const plugin = fileURLToPath(new URL('..', import.meta.url));
const toolchain = await inspectToolchain(requiredDirectory('B0_BUILD_UPSTREAM', process.env.B0_BUILD_UPSTREAM), requiredDirectory('B0_BUILD_TOOLS', process.env.B0_BUILD_TOOLS));
const React = toolchain.loadBrowserModule('react');
const { createRoot } = toolchain.loadBrowserModule('react-dom/client');
const JSDOM = loadJsdom();
const built = await toolchain.loadBundler().build({ absWorkingDir: plugin, entryPoints: ['src/client/cockpit-ai-panel.tsx'], write: false,
  bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom'], logLevel: 'silent' });
const mod = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(toolchain.loadBrowserModule, mod, mod.exports);
const { CockpitAIPreview, CockpitAIPanel } = mod.exports;
const titleTarget = { anchor: { attribute: 'id', value: 'root' }, path: [{ tag: 'h1', key: { attribute: 'text', value: '原始标题' } }] };
const policyTarget = { anchor: { attribute: 'id', value: 'policy' }, path: [] };

async function fixture(t, { native = false, legacyPage = false, file = false, inherited = false } = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://fixture', pretendToBeVisual: true });
  const globals = ['window', 'document', 'DOMParser', 'HTMLElement', 'Element', 'IS_REACT_ACT_ENVIRONMENT', '__NATIVE_PAGE_TRANSPORT__', 'FQ_FREE_PAGE_SIDECAR_INDEX'];
  const previous = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === '__NATIVE_PAGE_TRANSPORT__' ? native || legacyPage : key === 'FQ_FREE_PAGE_SIDECAR_INDEX' ? 'on' : dom.window[key] });
  const source = { html: '<main id="root"><h1>原始标题</h1><p id="policy">原策略</p></main>', css: '', js: '', resources: [], node_map: [] };
  if (inherited) source.presentation = { version: 1, source_hash: sourceHash(source), edits: [{ target: titleTarget, text: '历史标题', style: { color: 'red', padding: '1px' } }] };
  const candidate = structuredClone(source);
  candidate.presentation ??= { version: 1, source_hash: sourceHash(candidate), edits: [] };
  candidate.presentation.edits.push({ target: policyTarget, text: 'AI策略' });
  const auto_h1 = editorPageCatalog(source, null, { pageId: 'page_fixture' }).pageNodes.find(node => node.tag === 'h1');
  const control = { overlay: { page_id: 'page_fixture', version: 2, overlays: { [auto_h1.node_id]: { text: '人工标题v2', style: { color: 'blue', padding: '9px' } } } }, fail: false, hold: null };
  const job = { id: 'ai_fixture', target_id: file ? 'file_fixture' : 'page_fixture', target_kind: file ? 'file' : 'page', base_version: 2,
    status: 'READY', candidate_hash: 'frozen-candidate-hash', filename: file ? 'file.html' : 'page-package.json', ...(native ? { transport: 'native-tools' } : {}) };
  const calls = [];
  const dispatch = async (operation, variant, init) => {
    calls.push({ operation, variant, init });
    if (operation === 'editOverlay') {
      if (control.hold) await control.hold;
      if (control.fail) return Response.json({ error: { message: 'overlay unavailable' } }, { status: 503 });
      return Response.json(control.overlay);
    }
    if (operation === 'aiContent') return file ? new Response('<h1>文件标题</h1>') : Response.json(variant === 'source' ? source : candidate);
    if (operation === 'aiComparison') return Response.json({ text_diff: 'raw diff', source_size: 1, candidate_size: 2 });
    if (operation === 'aiConfirm') {
      if (control.loseConfirm) { control.loseConfirm = false; throw new Error('lost response'); }
      return Response.json({ ...job, status: 'SAVED', saved_version: job.base_version + 1 });
    }
    return Response.json(job);
  };
  if (native || legacyPage) t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/shine-mage-pages');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.headers.authorization, undefined);
    const req = JSON.parse(init.body);
    if (legacyPage) { calls.push({ operation: 'native-' + req.operation }); return Response.json({ error: { message: 'missing' } }, { status: 404 }); }
    return dispatch(req.operation, req.variant, req);
  });
  const client = createCockpitAIClient({ base: 'http://legacy', token: 'fixture-token', fetchImpl: async (url, init) => {
    const parsed = new URL(url), path = parsed.pathname;
    const operation = path.endsWith('/overlay') ? 'editOverlay' : path.endsWith('/content') ? 'aiContent' : path.endsWith('/comparison') ? 'aiComparison' : path.endsWith('/collect') ? 'aiCollect' : path.endsWith('/confirm') ? 'aiConfirm' : 'aiGet';
    if (native) throw new Error('native job crossed into legacy');
    assert.equal(parsed.origin, 'http://legacy');
    assert.equal(init.headers.authorization, 'Bearer fixture-token');
    return dispatch(operation, parsed.searchParams.get('variant'), { ...init, page_id: parsed.searchParams.get('page_id'), version: Number(parsed.searchParams.get('version')) });
  } });
  const root = createRoot(dom.window.document.querySelector('#app'));
  const paint = async () => React.act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(CockpitAIPanel, { client, state: client.getSnapshot() }),
    React.createElement(CockpitAIPreview, { client, state: client.getSnapshot() }))));
  const render = async ({ forwardStatus = true } = {}) => {
    await paint();
    const frame = dom.window.document.querySelector('iframe');
    assert.ok(frame, client.getSnapshot().message);
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
    assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer');
    const reports = [];
    const rendered = new JSDOM(frame.srcdoc, { runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(view) {
        Object.defineProperty(view, 'parent', { value: { postMessage(data) {
          if (data.type === 'cockpit.presentation') reports.push({ data, readyState: view.document.readyState });
        } } });
      },
    });
    await new Promise(resolve => rendered.window.addEventListener('load', resolve, { once: true }));
    t.after(() => rendered.window.close());
    assert.ok(reports.length, 'the rendered document must report its presentation result');
    assert.ok(reports.every(report => report.data.ready === true && report.readyState !== 'loading'));
    if (forwardStatus) for (const { data } of reports) await React.act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      origin: 'null', source: frame.contentWindow, data,
    })));
    assert.ok(rendered.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
    return rendered.window.document;
  };
  t.after(async () => {
    await React.act(async () => root.unmount()); client.dispose(); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await client.load(job.id);
  return { client, source, candidate, control, calls, job, dom, render, paint };
}

for (const native of [false, true]) test(`READY collect and source/candidate share exact v2 overlay, native=${native}`, async t => {
  const f = await fixture(t, { native });
  const frozen = JSON.stringify([f.source, f.candidate, f.job]);
  assert.equal(await f.client.collect(), true);
  let doc = await f.render();
  assert.equal(doc.querySelector('h1').textContent, '人工标题v2');
  assert.equal(doc.querySelector('#policy').textContent, 'AI策略');
  assert.match(f.dom.window.document.body.textContent, /AI 修改后（尚未保存）/);
  for (const variant of ['source', 'candidate']) {
    assert.equal(await f.client.preview(variant), true);
    doc = await f.render();
    assert.equal(doc.querySelector('h1').textContent, '人工标题v2');
    assert.equal(doc.querySelector('#policy').textContent, variant === 'source' ? '原策略' : 'AI策略');
  }
  const reads = f.calls.filter(call => call.operation === 'editOverlay');
  assert.equal(reads.length, 3);
  assert.ok(reads.every(call => call.init.page_id === 'page_fixture' && call.init.version === 2));
  assert.equal(f.calls.some(call => call.operation === 'aiConfirm'), false);
  assert.equal(JSON.stringify([f.source, f.candidate, f.job]), frozen);
  assert.equal(f.client.getSnapshot().active.candidate_hash, 'frozen-candidate-hash');
});

for (const change of ['style', 'text', 'both']) test(`same node ${change} delta preserves newer manual fields and resolves original text path`, async t => {
  const f = await fixture(t, { inherited: true });
  const edit = f.candidate.presentation.edits[0];
  if (change !== 'style') edit.text = 'AI标题';
  if (change !== 'text') edit.style = { color: 'green', padding: '1px' };
  assert.equal(await f.client.preview(), true);
  const doc = await f.render(), title = doc.querySelector('h1');
  assert.equal(title.textContent, change === 'style' ? '人工标题v2' : 'AI标题');
  assert.equal(title.style.color, change === 'text' ? 'blue' : 'green');
  assert.equal(title.style.padding, '9px');
  assert.equal(doc.defaultView.__cockpitPresentationStatus.unresolved.length, 0);
  assert.equal(await f.client.preview('source'), true);
  assert.equal((await f.render()).querySelector('h1').textContent, '人工标题v2');
});

for (const failure of ['failure', 'version', 'page', 'invalid', 'missing', 'hash', 'source-hash', 'source-change']) test(`bad ${failure} clears the previous preview`, async t => {
  const f = await fixture(t);
  assert.equal(await f.client.preview(), true);
  await f.render();
  if (failure === 'failure') f.control.fail = true;
  if (failure === 'version') f.control.overlay.version = 3;
  if (failure === 'page') f.control.overlay.page_id = 'page_other';
  if (failure === 'invalid') f.control.overlay.overlays = [];
  if (failure === 'missing') f.control.overlay.overlays = { absent_node: { text: 'bad' } };
  if (failure === 'hash') f.candidate.presentation.source_hash = 'bad';
  if (failure === 'source-hash') f.source.presentation = { source_hash: 'bad', edits: [] };
  if (failure === 'source-change') { f.candidate.html += '<p>changed</p>'; f.candidate.presentation.source_hash = sourceHash(f.candidate); }
  assert.equal(await f.client.preview(), false);
  assert.equal(f.client.getSnapshot().html, null);
  assert.equal(f.client.getSnapshot().previewVariant, null);
  assert.equal(f.client.getSnapshot().messageError, true);
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('iframe'), null);
});

test('loading clears the frame before overlay completes; empty overlay is valid', async t => {
  const f = await fixture(t);
  await f.client.preview();
  let release;
  f.control.hold = new Promise(resolve => { release = resolve; });
  const pending = f.client.preview('source');
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('iframe'), null);
  f.control.overlay.overlays = {}; release();
  assert.equal(await pending, true);
  assert.equal((await f.render()).querySelector('h1').textContent, '原始标题');
});

test('HTML files do not read page overlays', async t => {
  const f = await fixture(t, { file: true });
  assert.equal(await f.client.preview(), true);
  assert.equal((await f.render()).querySelector('h1').textContent, '文件标题');
  assert.equal(f.calls.some(call => call.operation === 'editOverlay'), false);
});

for (const collect of [false, true]) test(`native overlay failure never falls back to legacy, collect=${collect}`, async t => {
  const f = await fixture(t, { native: true });
  await f.client.preview();
  f.control.fail = true;
  assert.equal(await (collect ? f.client.collect() : f.client.preview('source')), false);
  assert.equal(f.client.getSnapshot().html, null);
  assert.match(f.client.getSnapshot().message, /overlay unavailable/);
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('iframe'), null);
});

test('runtime unresolved report removes the frame and rejects stale or foreign reports', async t => {
  const f = await fixture(t);
  f.candidate.presentation.edits.push({ target: { anchor: { attribute: 'id', value: 'missing' }, path: [] }, text: 'unresolved' });
  assert.equal(await f.client.preview(), true);
  const doc = await f.render({ forwardStatus: false });
  const count = doc.defaultView.__cockpitPresentationStatus.unresolved.length;
  assert.equal(count, 1);
  const frame = f.dom.window.document.querySelector('iframe');
  const channel = /"channel":"([^"]+)"/.exec(frame.srcdoc)[1];
  const send = async extra => React.act(async () => f.dom.window.dispatchEvent(new f.dom.window.MessageEvent('message', {
    origin: 'null', source: frame.contentWindow, data: { type: 'cockpit.presentation', channel, pageId: 'page_fixture', version: 2, ready: true, unresolved: count, ...extra },
  })));
  await send({ ready: false });
  await send({ version: 3 });
  await send({ channel: 'foreign' });
  assert.ok(f.dom.window.document.querySelector('iframe'));
  await send({});
  assert.equal(f.dom.window.document.querySelector('iframe'), null);
  assert.match(f.dom.window.document.querySelector('[role="alert"]').textContent, /无法准确定位/);
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('[data-testid="ai-confirm"]').disabled, true);
  assert.deepEqual(await f.client.confirm(), { ok: false });
  assert.equal(f.calls.some(call => call.operation === 'aiConfirm'), false);
});

test('an attribute-only manual overlay remains visible without bypassing attribute filtering', async t => {
  const f = await fixture(t);
  const id = Object.keys(f.control.overlay.overlays)[0];
  f.control.overlay.overlays[id] = { attributes: { title: '人工说明', onclick: 'alert(1)' } };
  assert.equal(await f.client.preview(), true);
  const title = (await f.render()).querySelector('h1');
  assert.equal(title.title, '人工说明');
  assert.equal(title.hasAttribute('onclick'), false);
});

test('a legacy page job keeps legacy overlay credentials even when native pages are enabled', async t => {
  const f = await fixture(t, { legacyPage: true });
  assert.equal(await f.client.collect(), true);
  assert.equal((await f.render()).querySelector('h1').textContent, '人工标题v2');
  assert.deepEqual(f.calls.filter(call => call.operation.startsWith('native-')).map(call => call.operation), ['native-aiGet']);
  assert.equal(f.calls.filter(call => call.operation === 'editOverlay').length, 1);
});

test('projection accepts frozen originals and rejects their bad hash before rebinding a display copy', async t => {
  const f = await fixture(t, { inherited: true });
  const bad = structuredClone(f.candidate);
  bad.presentation.source_hash = 'bad';
  const original = JSON.stringify([f.source, f.candidate, f.control.overlay.overlays]);
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  freeze(f.source); freeze(f.candidate); freeze(f.control.overlay.overlays);
  const input = { source: f.source, candidate: f.candidate, pageId: 'page_fixture', variant: 'candidate', overlays: f.control.overlay.overlays };
  const display = projectAIPagePreview(input);
  assert.notEqual(display, f.candidate);
  assert.notEqual(display.html, f.candidate.html);
  assert.equal(display.presentation.source_hash, sourceHash(display));
  assert.equal(JSON.stringify([f.source, f.candidate, f.control.overlay.overlays]), original);
  assert.throws(() => projectAIPagePreview({ ...input, candidate: bad }), /来源不匹配/);
  assert.equal(bad.presentation.source_hash, 'bad');
});

test('existing manual CSS stays visible alongside an AI text candidate', async t => {
  const f = await fixture(t, { inherited: true });
  const overlay = Object.values(f.control.overlay.overlays)[0];
  overlay.style['box-shadow'] = '0 1px 2px #000';
  for (const variant of ['source', 'candidate']) {
    assert.equal(await f.client.preview(variant), true);
    const doc = await f.render();
    assert.equal(doc.querySelector('h1').style.boxShadow, '0 1px 2px #000');
    assert.equal(doc.querySelector('h1').style.color, 'blue');
    assert.equal(doc.querySelector('h1').style.padding, '9px');
    assert.equal(doc.querySelector('h1').textContent, '人工标题v2');
    assert.equal(doc.querySelector('#policy').textContent, variant === 'source' ? '原策略' : 'AI策略');
  }
});

test('manual important styles retain their value and priority', async t => {
  const f = await fixture(t, { inherited: true });
  Object.values(f.control.overlay.overlays)[0].style.color = 'blue !important';
  assert.equal(await f.client.preview(), true);
  const title = (await f.render()).querySelector('h1');
  assert.equal(title.style.color, 'blue');
  assert.equal(title.style.getPropertyPriority('color'), 'important');
});

test('newer manual longhands override inherited shorthand styles', async t => {
  const f = await fixture(t, { inherited: true });
  Object.values(f.control.overlay.overlays)[0].style = { 'padding-top': '9px' };
  for (const variant of ['source', 'candidate']) {
    assert.equal(await f.client.preview(variant), true);
    const title = (await f.render()).querySelector('h1');
    assert.equal(title.style.paddingTop, '9px');
    assert.equal(title.style.paddingBottom, '1px');
  }
});

test('a failed overlay blocks the first confirmation request', async t => {
  const f = await fixture(t);
  assert.equal(await f.client.preview(), true);
  f.control.fail = true;
  assert.equal(await f.client.preview(), false);
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('[data-testid="ai-confirm"]').disabled, true);
  assert.deepEqual(await f.client.confirm(), { ok: false });
  assert.equal(f.calls.some(call => call.operation === 'aiConfirm'), false);
});

test('a successful candidate preview is required before the first page save', async t => {
  const f = await fixture(t);
  assert.equal(await f.client.preview('source'), true);
  assert.deepEqual(await f.client.confirm(), { ok: false });
  assert.equal(f.calls.some(call => call.operation === 'aiConfirm'), false);
  assert.equal(await f.client.preview(), true);
  await f.render();
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('[data-testid="ai-confirm"]').disabled, false);
  assert.deepEqual(await f.client.confirm(), { ok: true });
  assert.equal(f.client.getSnapshot().active.saved_version, 3);
});

test('a stale frame cannot invalidate a newer candidate preview', async t => {
  const f = await fixture(t);
  assert.equal(await f.client.preview(), true);
  const previous = f.client.getSnapshot().html;
  assert.equal(await f.client.preview(), true);
  f.client.acceptPreview(previous);
  assert.equal(f.client.getSnapshot().previewReady, false);
  await f.render();
  f.client.rejectPreview(previous);
  assert.equal(f.client.getSnapshot().previewReady, true);
  assert.notEqual(f.client.getSnapshot().html, previous);
});

test('a lost save receipt can be reconciled after its frame fails', async t => {
  const f = await fixture(t, { native: true });
  assert.equal(await f.client.preview(), true);
  await f.render();
  f.control.loseConfirm = true;
  assert.deepEqual(await f.client.confirm(), { ok: false });
  assert.equal(f.client.getSnapshot().confirmationUncertain, true);
  f.client.rejectPreview(f.client.getSnapshot().html);
  assert.equal(f.client.getSnapshot().previewReady, false);
  await f.paint();
  assert.equal(f.dom.window.document.querySelector('[data-testid="ai-confirm"]').disabled, false);
  assert.deepEqual(await f.client.confirm(), { ok: true });
  assert.equal(f.client.getSnapshot().active.saved_version, 3);
  assert.equal(f.calls.filter(call => call.operation === 'aiConfirm').length, 2);
});


test('a downloaded candidate cannot be saved before its iframe reports success', async t => {
  const f = await fixture(t);
  await f.client.preview();
  await f.paint();
  assert.equal(f.client.getSnapshot().previewReady, false);
  assert.equal(f.dom.window.document.querySelector('[data-testid="ai-confirm"]').disabled, true);
  assert.deepEqual(await f.client.confirm(), { ok: false });
  assert.equal(f.calls.some(call => call.operation === 'aiConfirm'), false);
});

test('projected candidate styles still override page scripts through the presentation runtime', async t => {
  const f = await fixture(t, { inherited: true });
  f.source.js = f.candidate.js = 'document.querySelector("h1").style.color = "black";';
  f.source.presentation.source_hash = sourceHash(f.source);
  f.candidate.presentation.source_hash = sourceHash(f.candidate);
  f.candidate.presentation.edits[0].style.color = 'green';
  assert.equal(await f.client.preview(), true);
  const doc = await f.render();
  assert.equal(doc.querySelector('h1').style.color, 'green');
  doc.querySelector('h1').style.color = 'purple';
  await new Promise(resolve => doc.defaultView.setTimeout(resolve, 0));
  assert.equal(doc.querySelector('h1').style.color, 'green');
});

for (const protectedAttrs of ['data-page-readonly', 'data-sp-bindable="database"']) test(`style-only AI candidates retain the runtime boundary for ${protectedAttrs}`, async t => {
  const f = await fixture(t);
  f.source.html = f.candidate.html = f.source.html.replace('id="policy"', 'id="policy" ' + protectedAttrs);
  f.candidate.presentation = { version: 1, source_hash: sourceHash(f.candidate), edits: [{ target: policyTarget, style: { color: 'green' } }] };
  assert.equal(await f.client.preview(), true);
  const doc = await f.render();
  assert.equal(doc.querySelector('#policy').style.color, '');
  assert.deepEqual(Array.from(doc.defaultView.__cockpitPresentationStatus.unresolved), [0]);
});


test('an empty presentation becomes reviewable only after the real document reports ready', async t => {
  const f = await fixture(t);
  f.control.overlay.overlays = {};
  f.candidate.presentation.edits = [];
  await f.client.preview();
  await f.paint();
  assert.equal(f.client.getSnapshot().previewReady, false);
  await f.render();
  assert.equal(f.client.getSnapshot().previewReady, true);
});

for (const ownStyle of [false, true]) test(`manual-only style properties keep their static behavior, existing presentation style=${ownStyle}`, async t => {
  const f = await fixture(t);
  Object.values(f.control.overlay.overlays)[0].style = { color: 'blue' };
  if (ownStyle) f.source.presentation = { version: 1, source_hash: sourceHash(f.source), edits: [{ target: titleTarget, style: { padding: '1px' } }] };
  f.candidate.presentation.edits.unshift(...(f.source.presentation?.edits ?? []));
  f.source.js = f.candidate.js = 'document.querySelector("h1").style.color = "black";';
  if (f.source.presentation) f.source.presentation.source_hash = sourceHash(f.source);
  f.candidate.presentation.source_hash = sourceHash(f.candidate);
  for (const variant of ['source', 'candidate']) {
    assert.equal(await f.client.preview(variant), true);
    const doc = await f.render();
    assert.equal(doc.querySelector('h1').style.color, 'black');
    doc.querySelector('h1').style.color = 'purple';
    await new Promise(resolve => doc.defaultView.setTimeout(resolve, 0));
    assert.equal(doc.querySelector('h1').style.color, 'purple');
    if (ownStyle) assert.equal(doc.querySelector('h1').style.padding, '1px');
  }
});
