/** Actual compiled React/AntD login UI with synthetic HTTP replies; no browser credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { library, snapshot, analysis, reference, analysisPage, board, boardPage } from './crm-assets.fixture.mjs';

const upstream = process.env.B0_BUILD_UPSTREAM;
assert.ok(upstream, 'Use the pinned SDK checkout');
const req = createRequire(join(upstream, 'apps/web/package.json'));
const React = req('react');
const { createRoot } = req('react-dom/client');
const { JSDOM } = createRequire(join(upstream, 'node_modules/jsdom/package.json'))('jsdom');
const source = await readFile(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8');
const empty = { ok: true, connected: false, username: null, expires_at: null };
const connected = { ok: true, connected: true, username: 'fixture-user', expires_at: '2099-01-01' };
const reply = (body, status = 200) => Response.json(body, { status });

async function mount(t, fetchImpl, component = 'CrmConnectionDock') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:43300', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: w, document: w.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let entry;
  w.__ModuleLoader__ = { load: value => { entry = value; } };
  const globals = { window: w, document: w.document, fetch: fetchImpl, AbortController,
    Event: w.Event, crypto: globalThis.crypto, FormData: w.FormData, HTMLInputElement: w.HTMLInputElement, HTMLElement: w.HTMLElement,
    Element: w.Element, ShadowRoot: w.ShadowRoot, SVGElement: w.SVGElement,
    getComputedStyle: element => w.getComputedStyle(element),
    setTimeout, clearTimeout, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) };
  vm.runInNewContext(source, globals, { timeout: 3000 });
  const Component = entry.factory(name => req(name))[component];
  const root = createRoot(w.document.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount());
    w.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const render = id => React.act(async () => root.render(React.createElement(Component, { sessionId: id })));
  await render('first');
  const click = async text => {
    const button = [...w.document.querySelectorAll('button')].find(b => b.textContent.replace(/\s/g, '') === text.replace(/\s/g, ''));
    assert.ok(button, `Missing button ${text}`);
    await React.act(async () => button.click());
  };
  const submit = async password => {
    const form = w.document.querySelector('form'); assert.ok(form);
    form.elements.namedItem('username').value = 'fixture-user';
    const input = form.elements.namedItem('password'); input.value = password;
    await React.act(async () => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(input.value, '', 'password cleared immediately');
  };
  const type = async (testId, value) => {
    const node = w.document.querySelector(`[data-testid="${testId}"]`);
    assert.ok(node, `Missing ${testId}`);
    const native = node.tagName === 'INPUT' ? node : node.querySelector('input');
    assert.ok(native);
    const propsKey = Object.keys(native).find(key => key.startsWith('__reactProps$'));
    await React.act(async () => {
      native.value = value;
      native[propsKey].onChange({ target: native, currentTarget: native });
    });
  };
  return { w, click, submit, render, type };
}

test('compiled UI reports failure, allows retry, connects and disconnects', async t => {
  const calls = [];
  let current = empty;
  const ui = await mount(t, async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body.operation);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['x-crm-ui'], '1');
    if (body.operation === 'login') {
      if (body.password !== 'fixture-password') return reply({ ok: false, code: 'LOGIN_FAILED' }, 401);
      current = connected;
    }
    if (body.operation === 'disconnect') current = empty;
    return reply(current);
  });
  await ui.click('连接 CRM');
  await ui.submit('wrong');
  assert.ok(ui.w.document.body.textContent.includes('CRM 账号或密码不正确'));
  await ui.submit('fixture-password');
  assert.ok(ui.w.document.body.textContent.includes('CRM 已连接'));
  await ui.click('CRM 已连接');
  await ui.click('断开当前连接');
  assert.equal(ui.w.document.body.textContent.includes('CRM 已连接'), false);
  assert.deepEqual(calls, ['status', 'status', 'login', 'login', 'status', 'disconnect']);
});

test('session switch ignores a late login reply and leaves the new UI usable', async t => {
  let finish; let oldSignal;
  const ui = await mount(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.operation === 'login') { oldSignal = options.signal; return new Promise(resolve => { finish = resolve; }); }
    return reply(empty);
  });
  await ui.click('连接 CRM');
  await ui.submit('fixture-password');
  await ui.render('second');
  assert.equal(oldSignal.aborted, true);
  await React.act(async () => finish(reply(connected)));
  assert.equal(ui.w.document.body.textContent.includes('CRM 已连接'), false);
  await ui.click('连接 CRM');
  assert.equal(ui.w.document.querySelector('input[name="password"]').disabled, false);
});

test('compiled asset UI requires explicit confirmation and reuses the request key after a lost reply', async t => {
  const writes = []; let saves = 0;
  const ui = await mount(t, async (url, options) => {
    assert.equal(url, '/api/crm-knowledge/assets');
    const body = JSON.parse(options.body);
    if (body.operation === 'library') return reply({ ok: true, value: library });
    if (body.operation === 'search') return reply({ ok: true, value: analysisPage });
    if (body.operation === 'boards') return reply({ ok: true, value: boardPage });
    if (body.operation === 'get') return reply({ ok: true, value: analysis });
    writes.push(body);
    if (body.operation === 'save' && !saves++) throw new Error('lost response after commit');
    return reply({ ok: true, value: body.operation === 'save' ? analysis : reference });
  }, 'CrmLibraryButton');
  await ui.click('CRM 分析');
  assert.ok(ui.w.document.body.textContent.includes('¥80.01'));
  assert.ok(ui.w.document.body.textContent.includes('合成资料'));
  await ui.click('保存分析');
  assert.equal(writes.length, 0);
  await ui.click('取消');
  assert.equal(writes.length, 0);
  await ui.click('保存分析');
  await ui.click('确认保存');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].snapshot_id, snapshot.snapshot_id);
  assert.deepEqual(Object.keys(writes[0]).sort(), ['key', 'operation', 'session_id', 'snapshot_id', 'title']);
  await ui.click('重试并核对结果');
  assert.deepEqual(writes[1], writes[0]);
  const tab = text => [...ui.w.document.querySelectorAll('[role="tab"]')].find(node => node.textContent === text);
  await React.act(async () => tab('已保存分析').click());
  await ui.click('加入驾驶舱');
  assert.equal(writes.length, 2);
  await ui.click('确认加入');
  assert.equal(writes[2].analysis_id, analysis.analysis_id);
  assert.deepEqual(Object.keys(writes[2]).sort(), ['analysis_id', 'key', 'operation', 'session_id']);
  await React.act(async () => tab('驾驶舱引用').click());
  assert.ok(ui.w.document.body.textContent.includes(reference.reference_id));
  await React.act(async () => ui.w.dispatchEvent(new ui.w.Event('crm-connection-changed')));
  assert.equal(ui.w.document.body.textContent.includes('¥80.01'), false);
});

test('asset session change aborts and ignores an old account library reply', async t => {
  let finish; let signal;
  const ui = await mount(t, async (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); }, 'CrmLibraryButton');
  await ui.click('CRM 分析');
  await ui.render('another-session');
  assert.equal(signal.aborted, true);
  await React.act(async () => finish(reply({ ok: true, value: library })));
  assert.equal(ui.w.document.body.textContent.includes('¥80.01'), false);
});

test('compiled UI searches history, edits metadata and saves a board without sending amounts', async t => {
  const writes = []; const scopes = [];
  const page = { ...analysisPage, next_cursor: 'next-page' };
  const older = { ...analysisPage, items: [{ ...analysisPage.items[0], analysis_id: analysis.analysis_id, title: '窗口 00' }], next_cursor: null };
  const board = {
    schema_version: 'crm-board/v1', board_id: 'crm_b_' + '1'.repeat(32), title: '销售组板', description: '',
    saved_at: analysis.saved_at, updated_at: analysis.saved_at, revision: 1,
    components: [{ block_id: 'm1', title: 'GSV', analysis_id: analysis.analysis_id, snapshot_id: snapshot.snapshot_id, metric: 'gsv',
      layout: { x: 0, y: 0, w: 4, h: 4 }, display: { tone: 'neutral', density: 'comfortable', value_format: 'standard', show_coverage: true },
      filters: snapshot.result.filters, metric_version: 'dashboard-gsv-purchases/v1',
      value: { amount_fen: snapshot.result.gsv_amount_fen, denominator: null, reason: null, count: null }, result_sha256: snapshot.result_sha256 }],
  };
  const ui = await mount(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.operation === 'library') return reply({ ok: true, value: library });
    if (body.operation === 'search') { scopes.push(body.scope); return reply({ ok: true, value: body.cursor ? older : page }); }
    if (body.operation === 'boards') return reply({ ok: true, value: boardPage });
    if (body.operation === 'get') return reply({ ok: true, value: analysis });
    if (body.operation === 'shares') return reply({ ok: true, value: { schema_version: 'crm-analysis-shares/v1', analysis_id: analysis.analysis_id, grants: [] } });
    writes.push(body);
    if (body.operation === 'patch') return reply({ ok: true, value: { ...analysis, title: body.title, description: body.description, revision: 2 } });
    if (body.operation === 'save_board') return reply({ ok: true, value: board });
    return reply({ ok: true, value: analysis });
  }, 'CrmLibraryButton');
  await ui.click('CRM 分析');
  assert.ok(scopes.includes('all'));
  const tab = text => [...ui.w.document.querySelectorAll('[role="tab"]')].find(node => node.textContent === text);
  await React.act(async () => tab('已保存分析').click());
  await ui.click('更早的记录');
  assert.ok(ui.w.document.body.textContent.includes('窗口 00'));
  await ui.click('编辑');
  await ui.click('保存');
  assert.equal(writes[0].operation, 'patch');
  assert.equal(writes[0].analysis_id, analysis.analysis_id);
  assert.equal(Object.hasOwn(writes[0], 'gsv'), false);
  await React.act(async () => tab('指标组板').click());
  await ui.click('新建组板');
  await ui.click('添加指标');
  await ui.click('保存组板');
  assert.equal(writes.at(-1).operation, 'save_board');
  assert.equal(Object.hasOwn(writes.at(-1).components[0], 'value'), false);
  assert.equal(writes.filter(item => item.operation === 'save_board').length, 1);
});

test('shared analysis is listed as read-only', async t => {
  const sharedPage = { ...analysisPage, items: [{ ...analysisPage.items[0], access: 'shared' }] };
  const ui = await mount(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.operation === 'library') return reply({ ok: true, value: library });
    if (body.operation === 'search') { assert.equal(body.scope, 'all'); return reply({ ok: true, value: sharedPage }); }
    if (body.operation === 'boards') return reply({ ok: true, value: boardPage });
    if (body.operation === 'get') return reply({ ok: true, value: analysis });
    return reply({ ok: false, code: 'INVALID_REQUEST' }, 400);
  }, 'CrmLibraryButton');
  await ui.click('CRM 分析');
  const tab = text => [...ui.w.document.querySelectorAll('[role="tab"]')].find(node => node.textContent === text);
  await React.act(async () => tab('已保存分析').click());
  assert.ok(ui.w.document.body.textContent.includes('分享给我'));
  assert.equal([...ui.w.document.querySelectorAll('button')].some(node => node.textContent === '编辑'), false);
  await ui.click('查看');
  assert.ok(ui.w.document.body.textContent.includes('只读'));
});

test('compiled UI shares to an account and revokes without sending amounts', async t => {
  const writes = [];
  let grants = [];
  const ui = await mount(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.operation === 'library') return reply({ ok: true, value: library });
    if (body.operation === 'search') return reply({ ok: true, value: analysisPage });
    if (body.operation === 'boards') return reply({ ok: true, value: boardPage });
    if (body.operation === 'get') return reply({ ok: true, value: analysis });
    if (body.operation === 'shares') return reply({ ok: true, value: { schema_version: 'crm-analysis-shares/v1', analysis_id: analysis.analysis_id, grants } });
    writes.push(body);
    if (body.operation === 'share') {
      grants = [{ username: body.username, granted_at: analysis.saved_at }];
      return reply({ ok: true, value: { schema_version: 'crm-analysis-shares/v1', analysis_id: analysis.analysis_id, grants } });
    }
    if (body.operation === 'unshare') {
      grants = [];
      return reply({ ok: true, value: { schema_version: 'crm-analysis-shares/v1', analysis_id: analysis.analysis_id, grants } });
    }
    return reply({ ok: true, value: analysis });
  }, 'CrmLibraryButton');
  await ui.click('CRM 分析');
  const tab = text => [...ui.w.document.querySelectorAll('[role="tab"]')].find(node => node.textContent === text);
  await React.act(async () => tab('已保存分析').click());
  await ui.click('分享');
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const shareInput = ui.w.document.querySelector('[data-testid="crm-share-user"]');
  assert.ok(shareInput);
  const nativeShare = shareInput.tagName === 'INPUT' ? shareInput : shareInput.querySelector('input');
  assert.equal(nativeShare.disabled, false);
  await ui.type('crm-share-user', 'bob');
  assert.equal(nativeShare.value, 'bob');
  const shareModal = [...ui.w.document.querySelectorAll('.ant-modal')].find(node => node.textContent.includes('输入对方 CRM 账号'));
  assert.ok(shareModal);
  const modalShare = [...shareModal.querySelectorAll('button')].find(node => node.textContent.replace(/\s/g, '') === '分享');
  assert.equal(modalShare.disabled, false);
  await React.act(async () => modalShare.click());
  assert.equal(writes[0].operation, 'share');
  assert.equal(writes[0].username, 'bob');
  assert.equal(Object.hasOwn(writes[0], 'amount_fen'), false);
  assert.ok(ui.w.document.body.textContent.includes('bob'));
  await ui.click('撤销');
  assert.equal(writes.at(-1).operation, 'unshare');
  assert.equal(writes.at(-1).username, 'bob');
});

test('compiled UI patches an existing board without sending amounts', async t => {
  const writes = [];
  const ui = await mount(t, async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.operation === 'library') return reply({ ok: true, value: library });
    if (body.operation === 'search') return reply({ ok: true, value: analysisPage });
    if (body.operation === 'boards') return reply({ ok: true, value: boardPage });
    if (body.operation === 'get_board') return reply({ ok: true, value: board });
    writes.push(body);
    if (body.operation === 'patch_board') return reply({ ok: true, value: { ...board, title: body.title, revision: 2 } });
    return reply({ ok: true, value: analysis });
  }, 'CrmLibraryButton');
  await ui.click('CRM 分析');
  const tab = text => [...ui.w.document.querySelectorAll('[role="tab"]')].find(node => node.textContent === text);
  await React.act(async () => tab('指标组板').click());
  await ui.click('编辑组板');
  await ui.click('保存组板');
  assert.equal(writes[0].operation, 'patch_board');
  assert.equal(writes[0].board_id, board.board_id);
  assert.equal(Object.hasOwn(writes[0].components[0], 'value'), false);
});

test('expired authorization clears facts from the pending confirmation as well as the library', async t => {
  const ui = await mount(t, async (_url, options) => ['library', 'search', 'boards'].includes(JSON.parse(options.body).operation)
    ? reply({ ok: true, value: JSON.parse(options.body).operation === 'search' ? analysisPage : JSON.parse(options.body).operation === 'boards' ? boardPage : library })
    : reply({ ok: false, code: 'AUTH_EXPIRED', message: 'CRM 登录已失效。' }, 409), 'CrmLibraryButton');
  await ui.click('CRM 分析'); await ui.click('保存分析'); await ui.click('确认保存');
  assert.equal(ui.w.document.body.textContent.includes('¥80.01'), false);
  assert.ok(ui.w.document.body.textContent.includes('重新连接后刷新核对'));
});
