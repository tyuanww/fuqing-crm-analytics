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

function unavailable(node) {
  if (!node) return true;
  if (node.isConnected === false || node.disabled === true || node.hidden === true) return true;
  if (node.getAttribute?.('aria-disabled') === 'true') return true;
  try {
    const rects = node.getClientRects?.();
    return Boolean(rects && typeof rects.length === 'number' && rects.length === 0);
  } catch {
    return true;
  }
}

function click(node) {
  if (unavailable(node)) return false;
  const expanded = node.getAttribute?.('aria-expanded') ?? null;
  try {
    node.click();
    const next = node.getAttribute?.('aria-expanded') ?? null;
    if (expanded === 'false' && next === 'false') return false;
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
    code: account || settings ? 'NATIVE_ACCOUNT_CLICK_FAILED' : 'NATIVE_ACCOUNT_SETTINGS_NOT_FOUND',
    message: account || settings
      ? 'DSH 原生账号与设置入口未能打开，请重试或检查宿主版本。'
      : '未找到 DSH 原生账号或设置入口，请检查当前 rc1 profile。',
  });
}
