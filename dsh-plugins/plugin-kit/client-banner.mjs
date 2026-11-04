/**
 * Canonical browser-client wrapper for ShineMage DSH plugins.
 *
 * A plugin client bundle is a CommonJS module evaluated by the host's
 * `window.__ModuleLoader__`; the loader owns the `require` shim and reads the
 * returned `module.exports`. This helper is the single owner of that wrapper so
 * every plugin build emits identical bytes.
 */
import assert from 'node:assert/strict';

export const CLIENT_BANNER_ID_PREFIX = 'window.__ModuleLoader__.load({ id: ';
export const CLIENT_MODULE_PREFIX = 'var module = { exports: {} }; var exports = module.exports;';
export const CLIENT_MODULE_FOOTER = 'return module.exports;\n} });';

/**
 * Build the esbuild `banner`/`footer` pair for one plugin client bundle.
 * Spread the result into the client build options.
 */
export function clientModuleBanner(id) {
  assert.equal(typeof id, 'string', 'CLIENT_BANNER_ID_INVALID');
  assert.match(id, /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, 'CLIENT_BANNER_ID_INVALID');
  return {
    banner: { js: `${CLIENT_BANNER_ID_PREFIX}${JSON.stringify(id)}, factory: (require) => {\n${CLIENT_MODULE_PREFIX}` },
    footer: { js: CLIENT_MODULE_FOOTER },
  };
}
