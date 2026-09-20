/** Actual compiled React/AntD login UI with synthetic HTTP replies; no browser credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { library, snapshot, analysis, reference } from './crm-assets.fixture.mjs';

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
  return { w, click, submit, render };
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

test('expired authorization clears facts from the pending confirmation as well as the library', async t => {
  const ui = await mount(t, async (_url, options) => JSON.parse(options.body).operation === 'library'
    ? reply({ ok: true, value: library }) : reply({ ok: false, code: 'AUTH_EXPIRED', message: 'CRM 登录已失效。' }, 409), 'CrmLibraryButton');
  await ui.click('CRM 分析'); await ui.click('保存分析'); await ui.click('确认保存');
  assert.equal(ui.w.document.body.textContent.includes('¥80.01'), false);
  assert.ok(ui.w.document.body.textContent.includes('重新连接后刷新核对'));
});
