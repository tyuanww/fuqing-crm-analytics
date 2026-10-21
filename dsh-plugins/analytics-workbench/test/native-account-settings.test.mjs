import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_ACCOUNT_SELECTOR,
  NATIVE_SETTINGS_SELECTOR,
  openNativeAccountSettings,
} from '../src/client/native-account-settings.mjs';
import { loadJsdom } from './helpers/jsdom-loader.mjs';

function button({ click = () => {}, label = '', attributes = {} } = {}) {
  const values = { 'aria-label': label, ...attributes };
  return {
    clicks: 0,
    getAttribute(name) { return values[name] ?? null; },
    click() { this.clicks += 1; click(); },
  };
}

function root({ account = null, settings = null } = {}) {
  const queries = [];
  return {
    queries,
    querySelector(selector) {
      queries.push(selector);
      if (selector === NATIVE_ACCOUNT_SELECTOR) return account;
      if (selector === NATIVE_SETTINGS_SELECTOR) return settings;
      return null;
    },
    querySelectorAll() { return []; },
  };
}

test('the bridge forwards to the official rc1 account menu before Settings', async () => {
  const account = button({ label: '账号菜单' });
  const settings = button({ label: '设置' });
  const doc = root({ account, settings });
  assert.deepEqual(await openNativeAccountSettings(doc), { ok: true, action: 'account' });
  assert.equal(account.clicks, 1);
  assert.equal(settings.clicks, 0);
});

test('the bridge falls back once to the official Settings trigger', async () => {
  const settings = button({ label: '设置' });
  const doc = root({ settings });
  assert.deepEqual(await openNativeAccountSettings(doc), { ok: true, action: 'settings', fellBack: false });
  assert.equal(settings.clicks, 1);
});

test('a failed account gesture can still reach official Settings', async () => {
  const account = button({ click() { throw new Error('detached'); } });
  const settings = button();
  assert.deepEqual(await openNativeAccountSettings(root({ account, settings })),
    { ok: true, action: 'settings', fellBack: true });
  assert.equal(account.clicks, 1);
  assert.equal(settings.clicks, 1);
});

test('a disabled account control falls back instead of reporting success', async () => {
  const account = button({ attributes: { 'aria-disabled': 'true' } });
  const settings = button();
  assert.deepEqual(await openNativeAccountSettings(root({ account, settings })),
    { ok: true, action: 'settings', fellBack: true });
  assert.equal(account.clicks, 0);
  assert.equal(settings.clicks, 1);
});

test('a collapsed native control that stays closed is observable and falls back', async () => {
  const account = button({ attributes: { 'aria-expanded': 'false' } });
  const settings = button();
  assert.deepEqual(await openNativeAccountSettings(root({ account, settings }), { settle: async () => {} }),
    { ok: true, action: 'settings', fellBack: true });
  assert.equal(account.clicks, 1);
  assert.equal(settings.clicks, 1);
});

test('an asynchronously expanded native account menu is accepted without a false error', async () => {
  let expanded = 'false';
  const account = {
    clicks: 0,
    getAttribute(name) {
      if (name === 'aria-label') return '账号菜单';
      if (name === 'aria-expanded') return expanded;
      return null;
    },
    click() { this.clicks += 1; setTimeout(() => { expanded = 'true'; }, 0); },
  };
  assert.deepEqual(await openNativeAccountSettings(root({ account }), {
    settle: () => new Promise(resolve => setTimeout(resolve, 5)),
  }), { ok: true, action: 'account' });
  assert.equal(account.clicks, 1);
});

test('a visible native account control is accepted after its document-level async expansion', async t => {
  const JSDOM = loadJsdom();
  const dom = new JSDOM('<!doctype html><body><button data-signed-out="true" aria-haspopup="menu" aria-expanded="false"></button></body>',
    { url: 'http://127.0.0.1' });
  t.after(() => dom.window.close());
  const account = dom.window.document.querySelector('button');
  account.getClientRects = () => [{ width: 1, height: 1 }];
  account.addEventListener('click', () => account.setAttribute('aria-expanded', 'true'));

  assert.deepEqual(await openNativeAccountSettings(dom.window.document, { settle: async () => {} }),
    { ok: true, action: 'account' });
});

test('missing native controls return an observable failure instead of pretending success', async () => {
  assert.deepEqual(await openNativeAccountSettings(root()), {
    ok: false,
    action: null,
    code: 'NATIVE_ACCOUNT_SETTINGS_NOT_FOUND',
    message: '未找到 DSH 原生账号或设置入口，请检查当前 rc1 profile。',
  });
});

test('both native gestures failing return an explicit click failure', async () => {
  const account = button({ click() { throw new Error('detached'); } });
  const settings = button({ click() { throw new Error('detached'); } });
  const result = await openNativeAccountSettings(root({ account, settings }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NATIVE_ACCOUNT_CLICK_FAILED');
  assert.match(result.message, /未能打开/);
});

test('a Settings control that remains closed is reported as a click failure', async () => {
  const settings = button({ attributes: { 'aria-expanded': 'false' } });
  assert.deepEqual(await openNativeAccountSettings(root({ settings }), { settle: async () => {} }), {
    ok: false,
    action: null,
    code: 'NATIVE_ACCOUNT_CLICK_FAILED',
    message: 'DSH 原生账号与设置入口未能打开，请重试或检查宿主版本。',
  });
  assert.equal(settings.clicks, 1);
});
