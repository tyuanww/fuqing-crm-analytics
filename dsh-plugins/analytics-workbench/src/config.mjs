/**
 * Plugin Config for the B0 analytics workbench (rc.5 `Config` contract).
 *
 * rc.5 has no global `baseUrl` API: every deployment-varying value must be a
 * plugin Config field (`docs/user/develop/basic/config.md:78` in the pinned
 * harness) and Cordis validates the row config through
 * `Config['~standard'].validate` (`vendor/cordis/src/fiber.ts:53`). The schema
 * is written by hand instead of importing `@deepseek-ai/schemastery` so the
 * plugin keeps zero runtime dependencies and stays packable; it implements the
 * same Standard Schema interface Cordis consumes.
 *
 * `baseUrl` and `bridgeUrl` are the two origins of the private native
 * contract: the FastAPI run kernel and the Host bridge that the kernel calls
 * back. Use `resolveNativeRuntime()` in runtime-endpoints.ts instead of
 * reading these fields directly. `B0_PORT_BASE` / `B0_RUNTIME_TOKEN` /
 * `B0_GATEWAY_TOKEN` stay as documented transitional fallbacks for the
 * existing B0 harness; Config wins when both are present.
 */

const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export const NATIVE_CONFIG_KEYS = Object.freeze([
  'baseUrl', 'bridgeUrl', 'runtimeToken', 'gatewayToken', 'firstPurchaseCandidateDigest',
]);

/**
 * Parse one explicit loopback origin. Any loopback port is allowed (that is
 * the point of Config.baseUrl); the scheme, host, path and credentials are
 * fixed so a config typo cannot redirect the bearer token to another host or
 * to a path prefix.
 */
export function parseLoopbackOrigin(value, name = 'baseUrl') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new Error(`NATIVE_CONFIG_INVALID: ${name} must be an absolute http://127.0.0.1 origin`);
  }
  let url;
  try { url = new URL(value); } catch { throw new Error(`NATIVE_CONFIG_INVALID: ${name} must be an absolute http://127.0.0.1 origin`); }
  const port = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash
    || (value !== url.origin && value !== `${url.origin}/`)
    || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`NATIVE_CONFIG_INVALID: ${name} must be an absolute http://127.0.0.1 origin`);
  }
  return `http://127.0.0.1:${port}`;
}

/** True when `value` is already a normalized loopback origin. */
export function isLoopbackOrigin(value) {
  try { return parseLoopbackOrigin(value) === value; } catch { return false; }
}

function issue(message, path) {
  return { message, path: [path] };
}

function optionalString(value, key, pattern, issues) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') { issues.push(issue(`${key} must be a string`, key)); return undefined; }
  if (pattern && !pattern.test(value)) { issues.push(issue(`${key} has an invalid shape`, key)); return undefined; }
  return value;
}

/** Cordis Standard Schema `validate` for the workbench row config. */
export function validateNativeConfig(value) {
  if (value === undefined || value === null) return { value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { issues: [issue('config must be an object', 'config')] };
  }
  const issues = [];
  const config = {};
  for (const key of Object.keys(value)) {
    if (!NATIVE_CONFIG_KEYS.includes(key)) issues.push(issue(`unknown config key ${key}`, key));
  }
  for (const key of ['baseUrl', 'bridgeUrl']) {
    if (value[key] === undefined || value[key] === null) continue;
    try { config[key] = parseLoopbackOrigin(value[key], key); } catch (error) { issues.push(issue(error.message, key)); }
  }
  for (const key of ['runtimeToken', 'gatewayToken']) {
    const parsed = optionalString(value[key], key, TOKEN, issues);
    if (parsed !== undefined) config[key] = parsed;
  }
  const digest = optionalString(value.firstPurchaseCandidateDigest, 'firstPurchaseCandidateDigest', SHA256, issues);
  if (digest !== undefined) config.firstPurchaseCandidateDigest = digest;
  return issues.length > 0 ? { issues } : { value: config };
}

/** Throwing form for callers that did not arrive through Cordis validation. */
export function parseNativeConfig(value) {
  const result = validateNativeConfig(value);
  if (result.issues) {
    const error = new Error(`NATIVE_CONFIG_INVALID: ${result.issues.map(row => row.message).join('; ')}`);
    error.code = 'NATIVE_CONFIG_INVALID';
    error.issues = result.issues;
    throw error;
  }
  return result.value;
}

/** rc.5 plugin Config export. Do not replace with a plain object schema. */
export const Config = Object.freeze({
  '~standard': Object.freeze({
    version: 1,
    vendor: 'shine-mage',
    validate: validateNativeConfig,
  }),
});
