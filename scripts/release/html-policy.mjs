/**
 * Public HTML plugins are enabled only when the host supplies both a CSP and
 * an iframe sandbox. Otherwise the native conversation stays available and
 * the plugin capability is explicitly disabled.
 */
export function evaluatePublicHtmlPolicy({ csp, sandbox, sanitized = false } = {}) {
  const hasCsp = typeof csp === 'string' && csp.trim().length > 0;
  const hasSandbox = typeof sandbox === 'string';
  const scriptsAllowed = hasSandbox && sandbox.split(/\s+/).includes('allow-scripts');
  const safe = hasCsp && hasSandbox && (sanitized || !scriptsAllowed);
  if (!safe) return { status: 'DISABLED', capability: 'public_html_plugin', reason: 'PUBLIC_HTML_POLICY_INCOMPLETE', native_fallback: 'AVAILABLE' };
  return { status: 'PASS', capability: 'public_html_plugin', native_fallback: 'AVAILABLE' };
}
