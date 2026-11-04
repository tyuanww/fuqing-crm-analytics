/** Guard the single native surface binding table and its backend projection.
 *
 * P3-2 removes the scattered `/internal/native/*` and port literals from both
 * sides of the private kernel contract. The plugin keeps the reviewed table in
 * `dsh-plugins/analytics-workbench/src/native-tools.mjs`; the FastAPI kernel
 * reads one generated projection, `config/analytics-native-tools.v1.json`
 * (`backend/services/analytics/native_tools.py`). A table edit is a contract
 * change: regenerate the projection in the same commit.
 *
 *   node scripts/ci/analytics-native-tools-sync.mjs --check
 *   node scripts/ci/analytics-native-tools-sync.mjs --write
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));

export const TABLE_SCHEMA = 'analytics-native-tools/v1';
export const TABLE_PATH = 'config/analytics-native-tools.v1.json';
export const PLUGIN_TABLE_PATH = 'dsh-plugins/analytics-workbench/src/native-tools.mjs';
/** Kernel families own a FastAPI app; bridge rows cover every runtime family. */
export const KERNEL_FAMILIES = ['b0', 'channel_followup', 'first_purchase'];
export const ALL_FAMILIES = [...KERNEL_FAMILIES, 'competition_growth'];
const BRIDGE_PATHS = ['/health', '/identity', '/dispatch', '/observe', '/cancel'];
const METHODS = ['GET', 'POST'];
const SURFACE_ID = /^(kernel|bridge)\.[a-z][a-z0-9-]*$/;
const TOOL_NAME = /^analytics_[a-z0-9_]+$/;

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  return error;
}

function checkedStringList(value, where) {
  if (!Array.isArray(value) || value.length === 0 || value.some(row => typeof row !== 'string' || row.length === 0)) {
    throw fail('NATIVE_TOOLS_SHAPE', `${where} must be a non-empty string array`);
  }
  if (new Set(value).size !== value.length) throw fail('NATIVE_TOOLS_DUPLICATE', `${where} repeats an entry`);
  return value;
}

function checkedModels(models, families, where) {
  if (models === null) return;
  if (typeof models !== 'object' || Array.isArray(models)) throw fail('NATIVE_TOOLS_SHAPE', `${where} models must be an object or null`);
  const keys = Object.keys(models);
  if (new Set(keys).size !== keys.length) throw fail('NATIVE_TOOLS_DUPLICATE', `${where} models repeat a family`);
  if (keys.length !== families.length || keys.some(key => !families.includes(key))) {
    throw fail('NATIVE_TOOLS_FAMILY', `${where} models must cover exactly ${families.join(',')}`);
  }
  for (const key of keys) {
    if (models[key] !== null && (typeof models[key] !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(models[key]))) {
      throw fail('NATIVE_TOOLS_SHAPE', `${where} models.${key} must be a Pydantic model name or null`);
    }
  }
}

/** Fail closed on any table shape the backend route/model guard cannot read. */
export function validateNativeTools(table) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) throw fail('NATIVE_TOOLS_SHAPE', 'table must be an object');
  if (table.schema_version !== TABLE_SCHEMA) throw fail('NATIVE_TOOLS_SCHEMA', String(table.schema_version));
  if (!Array.isArray(table.families) || table.families.join(',') !== ALL_FAMILIES.join(',')) {
    throw fail('NATIVE_TOOLS_FAMILY', `families must be ${ALL_FAMILIES.join(',')}`);
  }
  const sources = table.baseUrlSources ?? {};
  if (sources.kernel?.config !== 'baseUrl' || sources.kernel?.legacyEnv !== 'B0_PORT_BASE'
    || sources.kernel?.legacyPortBase !== 4315 || sources.kernel?.scheme !== 'http' || sources.kernel?.host !== '127.0.0.1') {
    throw fail('NATIVE_TOOLS_BASE_URL', 'kernel baseUrl source must be Config.baseUrl with the B0 port-block fallback');
  }
  if (sources.bridge?.config !== 'bridgeUrl' || sources.bridge?.legacyPortOffset !== 1) {
    throw fail('NATIVE_TOOLS_BASE_URL', 'bridge baseUrl source must be Config.bridgeUrl with the +1 fallback');
  }
  for (const key of ['payloadBytes', 'contextTimeoutMs', 'toolTimeoutMs']) {
    const value = table.bounds?.[key];
    if (!Number.isSafeInteger(value) || value <= 0) throw fail('NATIVE_TOOLS_BOUNDS', `bounds.${key} must be a positive integer`);
  }
  if (!Array.isArray(table.surfaces) || table.surfaces.length === 0) throw fail('NATIVE_TOOLS_SHAPE', 'surfaces must be a non-empty array');
  const ids = new Set(), paths = new Set(), tools = new Set();
  for (const surface of table.surfaces) {
    if (!SURFACE_ID.test(surface?.id ?? '')) throw fail('NATIVE_TOOLS_SURFACE_ID', `${surface?.id}`);
    if (ids.has(surface.id)) throw fail('NATIVE_TOOLS_DUPLICATE', `surface ${surface.id}`);
    ids.add(surface.id);
    if (surface.side !== surface.id.split('.')[0]) throw fail('NATIVE_TOOLS_SURFACE_SIDE', `${surface.id} side ${surface.side}`);
    if (!METHODS.includes(surface.method)) throw fail('NATIVE_TOOLS_SURFACE_METHOD', `${surface.id} ${surface.method}`);
    checkedStringList(surface.families, `${surface.id}.families`);
    if (surface.families.some(family => !ALL_FAMILIES.includes(family))) {
      throw fail('NATIVE_TOOLS_FAMILY', `${surface.id} names an unknown family`);
    }
    if (surface.side === 'kernel') {
      if (!surface.path.startsWith('/internal/native/')) throw fail('NATIVE_TOOLS_SURFACE_PATH', `${surface.id} ${surface.path}`);
      if (surface.families.some(family => !KERNEL_FAMILIES.includes(family))) {
        throw fail('NATIVE_TOOLS_FAMILY', `${surface.id} kernel surfaces are limited to ${KERNEL_FAMILIES.join(',')}`);
      }
    } else if (!BRIDGE_PATHS.includes(surface.path)) {
      throw fail('NATIVE_TOOLS_SURFACE_PATH', `${surface.id} ${surface.path}`);
    }
    const route = `${surface.method} ${surface.path}`;
    if (paths.has(route)) throw fail('NATIVE_TOOLS_DUPLICATE', route);
    paths.add(route);
    if (surface.tool !== null) {
      if (typeof surface.tool?.name !== 'string' || !TOOL_NAME.test(surface.tool.name)) throw fail('NATIVE_TOOLS_TOOL', `${surface.id} tool`);
      if (surface.families.length !== 1) throw fail('NATIVE_TOOLS_TOOL', `${surface.id} tool must bind exactly one family`);
      if (tools.has(surface.tool.name)) throw fail('NATIVE_TOOLS_DUPLICATE', `tool ${surface.tool.name}`);
      tools.add(surface.tool.name);
    }
    if (surface.request !== null) {
      checkedModels(surface.request.models, surface.families, `${surface.id}.request`);
      checkedStringList(surface.request.fields, `${surface.id}.request.fields`);
    }
    if (surface.response !== null) {
      checkedModels(surface.response.models, surface.families, `${surface.id}.response`);
      checkedStringList(surface.response.fields, `${surface.id}.response.fields`);
    }
  }
  return table;
}

/** Stable JSON serialization; the projection is byte-compared by --check. */
export function renderNativeTools(table) {
  validateNativeTools(table);
  return `${JSON.stringify(table, null, 2)}\n`;
}

/** Import the reviewed plugin table without a build step. */
export async function pluginNativeTools(root = repository) {
  const module = await import(pathToFileURL(join(resolve(root), PLUGIN_TABLE_PATH)).href);
  return validateNativeTools(module.NATIVE_TOOLS);
}

export async function checkNativeTools({ root = repository, table } = {}) {
  const source = table === undefined ? await pluginNativeTools(root) : validateNativeTools(table);
  const expected = renderNativeTools(source);
  const wired = await readFile(join(resolve(root), TABLE_PATH), 'utf8');
  if (wired !== expected) {
    throw fail('NATIVE_TOOLS_PROJECTION_DRIFT',
      `${TABLE_PATH} does not match ${PLUGIN_TABLE_PATH}; run node scripts/ci/analytics-native-tools-sync.mjs --write`);
  }
  return JSON.parse(wired);
}

export async function writeNativeTools({ root = repository, table } = {}) {
  const source = table === undefined ? await pluginNativeTools(root) : validateNativeTools(table);
  await writeFile(join(resolve(root), TABLE_PATH), renderNativeTools(source));
  return source;
}

export async function main(argv = process.argv.slice(2)) {
  const root = resolve(repository);
  if (argv.length === 0 || argv.includes('--check')) {
    const table = await checkNativeTools({ root });
    console.log(`native tools ${table.schema_version}: ${table.surfaces.length} surfaces match ${TABLE_PATH}`);
    return 0;
  }
  if (argv.length === 1 && argv[0] === '--write') {
    const table = await writeNativeTools({ root });
    console.log(`native tools ${table.schema_version}: wrote ${table.surfaces.length} surfaces to ${TABLE_PATH}`);
    return 0;
  }
  throw fail('NATIVE_TOOLS_USAGE', 'Usage: node scripts/ci/analytics-native-tools-sync.mjs [--check|--write]');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then(code => { process.exitCode = code; }, error => {
    console.error(`NATIVE_TOOLS_BLOCKED ${error.message}`);
    process.exitCode = 2;
  });
}
