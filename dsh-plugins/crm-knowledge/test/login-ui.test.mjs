/** Actual compiled React/AntD login UI with synthetic HTTP replies; no browser credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function mount(t, fetchImpl) {
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
    FormData: w.FormData, HTMLInputElement: w.HTMLInputElement, HTMLElement: w.HTMLElement,
    Element: w.Element, ShadowRoot: w.ShadowRoot, SVGElement: w.SVGElement,
    getComputedStyle: element => w.getComputedStyle(element),
    setTimeout, clearTimeout, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) };
  vm.runInNewContext(source, globals, { timeout: 3000 });
  const { CrmConnectionDock } = entry.factory(name => req(name));
  const root = createRoot(w.document.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount());
    w.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const render = id => React.act(async () => root.render(React.createElement(CrmConnectionDock, { sessionId: id })));
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
