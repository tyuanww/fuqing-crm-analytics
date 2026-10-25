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

function visible(node) {
  if (!node || node.isConnected === false || node.hidden === true) return false;
  try {
    const rects = node.getClientRects?.();
    return !rects || rects.length > 0;
  } catch {
    return false;
  }
}

function evidence(root, node, kind) {
  const selector = kind === 'account' ? '[role="menu"]' : '[role="dialog"]';
  let visibleContainers = 0;
  try {
    const containers = root?.querySelectorAll?.(selector);
    visibleContainers = containers ? [...containers].filter(visible).length : 0;
  } catch {
    visibleContainers = 0;
  }
  return { expanded: node?.getAttribute?.('aria-expanded') ?? null, visibleContainers };
}

function defaultSettle() {
  return new Promise(resolve => setTimeout(resolve, 40));
}

function observe(before, after) {
  if (after.expanded === 'true' && before.expanded !== 'true') return true;
  if (after.visibleContainers > before.visibleContainers) return true;
  if (after.expanded === 'false' && after.visibleContainers <= before.visibleContainers) return false;
  return after.expanded === 'true' ? true : null;
}

function click(node) {
  if (unavailable(node)) return false;
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
export async function openNativeAccountSettings(root = globalThis.document, { settle = defaultSettle } = {}) {
  const account = query(root, NATIVE_ACCOUNT_SELECTOR);
  const settings = query(root, NATIVE_SETTINGS_SELECTOR);
  for (const [node, action] of [[account, 'account'], [settings, 'settings']]) {
    if (!node) continue;
    const before = evidence(root, node, action);
    if (!click(node)) continue;
    await settle();
    const changed = observe(before, evidence(root, node, action));
    if (changed === true) {
      return Object.freeze({ ok: true, action, ...(action === 'settings' ? { fellBack: Boolean(account) } : {}) });
    }
  }
  return Object.freeze({
    ok: false,
    action: null,
    code: account || settings ? 'NATIVE_ACCOUNT_CLICK_FAILED' : 'NATIVE_ACCOUNT_SETTINGS_NOT_FOUND',
    message: account || settings
      ? 'DSH 原生账号与设置入口未能打开，请重试或检查宿主版本。'
      : '未找到 DSH 原生账号或设置入口，请检查当前 rc1 profile。',
  });
}
