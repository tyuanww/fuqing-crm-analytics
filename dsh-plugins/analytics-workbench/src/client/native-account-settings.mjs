/**
 * RC1 compatibility seam for the official account and Settings controls.
 *
 * The Host owns account state, sign-in and Settings. This plugin only forwards
 * the user gesture to the native controls; it never reads or writes identity.
 */

export const NATIVE_ACCOUNT_SELECTOR = [
  'button[data-signed-out][aria-haspopup="menu"]',
  'button[aria-label="账号菜单"][aria-haspopup="menu"]',
  'button[aria-label="Account menu"][aria-haspopup="menu"]',
].join(', ');

export const NATIVE_SETTINGS_SELECTOR = [
  '[class*="settingsArea"] button[aria-haspopup="dialog"]',
  'button[aria-label="设置"][aria-haspopup="dialog"]',
  'button[aria-label="Settings"][aria-haspopup="dialog"]',
].join(', ');

function query(root, selector) {
  try {
    const node = root?.querySelector?.(selector);
    return node && typeof node.click === 'function' ? node : null;
  } catch {
    return null;
  }
}

function click(node) {
  if (!node) return false;
  try {
    node.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer the native account menu, whose Settings row is Host-owned. If the
 * account launcher is absent or refuses the gesture, fall back once to the
 * native Settings dialog trigger.
 */
export function openNativeAccountSettings(root = globalThis.document) {
  const account = query(root, NATIVE_ACCOUNT_SELECTOR);
  const settings = query(root, NATIVE_SETTINGS_SELECTOR);
  if (click(account)) return Object.freeze({ ok: true, action: 'account' });
  if (click(settings)) return Object.freeze({ ok: true, action: 'settings', fellBack: Boolean(account) });
  return Object.freeze({
    ok: false,
    action: null,
    code: account ? 'NATIVE_ACCOUNT_CLICK_FAILED' : 'NATIVE_ACCOUNT_SETTINGS_NOT_FOUND',
    message: account
      ? 'DSH 原生账号与设置入口未能打开，请重试或检查宿主版本。'
      : '未找到 DSH 原生账号或设置入口，请检查当前 rc1 profile。',
  });
}
