import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_ACCOUNT_SELECTOR,
  NATIVE_SETTINGS_SELECTOR,
  openNativeAccountSettings,
} from '../src/client/native-account-settings.mjs';

function button({ click = () => {}, label = '' } = {}) {
  return {
    clicks: 0,
    getAttribute(name) { return name === 'aria-label' ? label : null; },
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
  };
}

test('the bridge forwards to the official rc1 account menu before Settings', () => {
  const account = button({ label: '账号菜单' });
  const settings = button({ label: '设置' });
  const doc = root({ account, settings });
  assert.deepEqual(openNativeAccountSettings(doc), { ok: true, action: 'account' });
  assert.equal(account.clicks, 1);
  assert.equal(settings.clicks, 0);
});

test('the bridge falls back once to the official Settings trigger', () => {
  const settings = button({ label: '设置' });
  const doc = root({ settings });
  assert.deepEqual(openNativeAccountSettings(doc), { ok: true, action: 'settings', fellBack: false });
  assert.equal(settings.clicks, 1);
});

test('a failed account gesture can still reach official Settings', () => {
  const account = button({ click() { throw new Error('detached'); } });
  const settings = button();
  assert.deepEqual(openNativeAccountSettings(root({ account, settings })),
    { ok: true, action: 'settings', fellBack: true });
  assert.equal(account.clicks, 1);
  assert.equal(settings.clicks, 1);
});

test('missing native controls return an observable failure instead of pretending success', () => {
  assert.deepEqual(openNativeAccountSettings(root()), {
    ok: false,
    action: null,
    code: 'NATIVE_ACCOUNT_SETTINGS_NOT_FOUND',
    message: '未找到 DSH 原生账号或设置入口，请检查当前 rc1 profile。',
  });
});

test('both native gestures failing return an explicit click failure', () => {
  const account = button({ click() { throw new Error('detached'); } });
  const settings = button({ click() { throw new Error('detached'); } });
  const result = openNativeAccountSettings(root({ account, settings }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NATIVE_ACCOUNT_CLICK_FAILED');
  assert.match(result.message, /未能打开/);
});
