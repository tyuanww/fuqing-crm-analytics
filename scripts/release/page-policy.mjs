export const PAGE_BROWSER_ORIGIN = 'https://app.tyuan.chat';
export const PAGE_BROWSER_BASE = 'https://page.tyuan.chat';
const METHODS = new Set(['GET', 'POST', 'OPTIONS']);
export function corsHeaders(origin) {
  if (origin !== PAGE_BROWSER_ORIGIN) return { vary: 'Origin' };
  return { 'access-control-allow-origin': PAGE_BROWSER_ORIGIN, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-csrf-token', vary: 'Origin' };
}
export function pageGuard({ origin, method = 'GET', authenticated = false, csrfValid = method !== 'POST' }) {
  const headers = corsHeaders(origin);
  if (origin !== PAGE_BROWSER_ORIGIN) return { status: 403, reason: 'ORIGIN_NOT_ALLOWED', headers };
  if (!METHODS.has(method)) return { status: 405, reason: 'METHOD_NOT_ALLOWED', headers: { ...headers, allow: 'GET, POST, OPTIONS' } };
  if (method === 'OPTIONS') return { status: 204, headers };
  if (!authenticated) return { status: 401, reason: 'AUTH_REQUIRED', headers };
  if (method === 'POST' && csrfValid !== true) return { status: 403, reason: 'CSRF_REQUIRED', headers };
  return { status: 200, headers };
}
