#!/usr/bin/env node
/**
 * DSH 0.2.1-rc.5 surface shadow gate.
 *
 * The repository pins rc.3 while the externalization target is rc.5, so plugin
 * and runtime usage must be checked against the *target* surface, not against
 * whatever the current pin happens to accept. This gate encodes the parts of
 * that surface that are verifiable without a running Harness, fails closed on
 * every drift it can prove, and runs non-blocking until the pin lands.
 *
 * Provenance for every rule is cited in `config/dsh-rc5-surface.v1.json`; the
 * checked-in slot catalog is generated from the rc.5 source tree with
 * `--extract-upstream`.
 *
 * Usage:
 *   node scripts/ci/rc5-surface-gate.mjs [--root .] [--contract <path>]
 *        [--shadow] [--json] [--summary <file>]
 *   node scripts/ci/rc5-surface-gate.mjs --extract-upstream <rc5-checkout>
 *        [--write-contract <path>] [--commit <sha>] [--release <version>]
 *
 * Exit codes: 0 = no errors (warnings allowed, and `--shadow` always exits 0),
 * 1 = at least one error, 2 = usage or contract failure.
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTRACT_SCHEMA = 'dsh-rc5-surface/v1';
export const DEFAULT_CONTRACT = 'config/dsh-rc5-surface.v1.json';

const MODULE_SUFFIXES = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.jsx'];
const TEST_FILE_PATTERN = /\.(test|spec|probe)\.[cm]?[jt]sx?$/;
const SIDE_EFFECT_FREE_DIRS = new Set(['node_modules', 'lib', 'dist', '.context']);

/** rc.5 `packages/client/connection/src/rpc.ts:147-181`. */
const FETCH_METHODS = new Set(['GET', 'HEAD', 'POST']);
const FETCH_BODIES = new Set(['buffered', 'streaming']);
const API_ROOT = '/api';
const LEDGER_IMPORT = 'ConnectionFetchLedger';

export const SLOT_CATALOG_PATH = 'packages/extensions/cordis-client-runner/src/client/slot-catalog.ts';

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function fail(message) {
  const error = new Error(message);
  error.code = 'RC5_GATE_INPUT';
  return error;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw fail(`cannot read JSON at ${path}: ${error.message}`);
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Sorted recursive source walk; deterministic output keeps the shadow log reviewable. */
async function pluginDirectories(root) {
  const base = join(root, 'dsh-plugins');
  const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
  const plugins = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || SIDE_EFFECT_FREE_DIRS.has(entry.name)) continue;
    const dir = join(base, entry.name);
    if (!(await isFile(join(dir, 'package.json')))) continue;
    const files = [];
    for (const area of ['src', 'test']) {
      if (await isDirectory(join(dir, area))) await walk(join(dir, area), files);
    }
    plugins.push({ dir, name: entry.name, files });
  }
  return plugins;
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || SIDE_EFFECT_FREE_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path, out);
    } else if (entry.isFile() && MODULE_SUFFIXES.some(suffix => entry.name.endsWith(suffix))) {
      out.push(path);
    }
  }
  return out;
}

/** Comment bodies replaced by spaces, newlines preserved: offsets and line numbers stay valid. */
export function maskComments(text) {
  const chars = text.split('');
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      for (let j = i; j < stop; j += 1) chars[j] = ' ';
      i = stop;
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i);
      const stop = end < 0 ? text.length : end + 2;
      for (let j = i; j < stop; j += 1) if (chars[j] !== '\n') chars[j] = ' ';
      i = stop;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === char) break;
        j += 1;
      }
      i = j;
    }
  }
  return chars.join('');
}

/** Strip one layer of quotes; templates keep their literal prefix before `${`. */
export function literal(value) {
  const text = String(value ?? '').trim();
  const quote = text[0];
  if (quote !== '\'' && quote !== '"' && quote !== '`') return undefined;
  const end = text.lastIndexOf(quote);
  if (end <= 0) return undefined;
  const body = text.slice(1, end);
  const interpolation = body.indexOf('${');
  if (interpolation >= 0) {
    return quote === '`' ? { value: body.slice(0, interpolation), interpolated: true } : undefined;
  }
  return { value: body, interpolated: false };
}

function skipString(text, start, end) {
  const quote = text[start];
  let j = start + 1;
  while (j < end) {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === quote) return j + 1;
    j += 1;
  }
  return end;
}

/** One balanced bracket group starting at `start`; strings are opaque. */
export function balanced(text, start) {
  const open = text[start];
  const close = { '{': '}', '(': ')', '[': ']' }[open];
  if (!close) return undefined;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\'' || char === '"' || char === '`') { i = skipString(text, i, text.length) - 1; continue; }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Index of the first non-space character after the opening parenthesis at `open`. */
function objectStartOf(text, open) {
  return text.slice(open + 1).search(/\S/) + open + 1;
}

const KEY_MODIFIERS = new Set(['async', 'get', 'set', 'static', 'readonly']);

/**
 * Top-level members of one object literal: `name: value`, quoted keys, and
 * shorthand methods (`async fetch(request) { … }`), which route objects use.
 */
export function topLevelProperties(objectText) {
  const properties = new Map();
  if (!objectText || objectText[0] !== '{') return properties;
  const end = objectText.length - 1;
  let i = 1;
  while (i < end) {
    while (i < end && /[\s,]/.test(objectText[i])) i += 1;
    if (i >= end) break;
    let key;
    if (objectText[i] === '\'' || objectText[i] === '"') {
      const stop = skipString(objectText, i, end);
      key = objectText.slice(i + 1, stop - 1);
      i = stop;
    } else {
      let j = i;
      while (j < end && /[A-Za-z0-9_$]/.test(objectText[j])) j += 1;
      key = objectText.slice(i, j);
      i = j;
      while (i < end && /\s/.test(objectText[i])) i += 1;
      if (KEY_MODIFIERS.has(key) && /[A-Za-z_$]/.test(objectText[i] ?? '')) {
        let k = i;
        while (k < end && /[A-Za-z0-9_$]/.test(objectText[k])) k += 1;
        key = objectText.slice(i, k);
        i = k;
        while (i < end && /\s/.test(objectText[i])) i += 1;
      }
    }
    if (objectText[i] === '(') {
      // Shorthand method: the handler body is not a property value we parse.
      const params = balanced(objectText, i);
      i = params ? i + params.length : i + 1;
      while (i < end && /\s/.test(objectText[i])) i += 1;
      if (objectText[i] === '{') {
        const body = balanced(objectText, i);
        i = body ? i + body.length : i + 1;
      }
      properties.set(key, '(method)');
      continue;
    }
    if (objectText[i] !== ':') { i += 1; continue; }
    i += 1;
    const valueStart = i;
    let depth = 0;
    let j = i;
    while (j < end) {
      const inner = objectText[j];
      if (inner === '\'' || inner === '"' || inner === '`') { j = skipString(objectText, j, end); continue; }
      if (inner === '{' || inner === '(' || inner === '[') depth += 1;
      else if (inner === '}' || inner === ')' || inner === ']') depth -= 1;
      else if (inner === ',' && depth === 0) break;
      j += 1;
    }
    if (key) properties.set(key, objectText.slice(valueStart, j).trim());
    i = j + 1;
  }
  return properties;
}

/** Child slot keys declared through a register call's `children` table. */
function childSlotKeys(properties) {
  const children = properties.get('children');
  if (!children || children[0] !== '{') return [];
  return [...topLevelProperties(children).keys()];
}

/** rc.5 slot catalog extraction (`slot-catalog.ts`, generated data only). */
export function extractSlotCatalog(source) {
  const start = source.indexOf('export const CLIENT_SLOT_API');
  if (start < 0) throw fail('slot catalog has no CLIENT_SLOT_API export');
  const body = source.slice(start);
  const entries = [];
  const pattern = /^  \{\n    key: '([^']+)',\n    kind: '(single|list|keyed|chain)',\n    scope: '(root|session|session-maybe)',/gm;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    entries.push({ key: match[1], kind: match[2], scope: match[3] });
  }
  if (entries.length === 0) throw fail('slot catalog extraction found no entries');
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) throw fail(`slot catalog repeats ${entry.key}`);
    seen.add(entry.key);
  }
  return entries;
}

export function validateContract(contract, path) {
  if (!contract || typeof contract !== 'object') throw fail(`${path}: contract must be an object`);
  if (contract.schema_version !== CONTRACT_SCHEMA) throw fail(`${path}: schema_version must be ${CONTRACT_SCHEMA}`);
  const target = contract.target ?? {};
  if (!/^[0-9a-f]{40}$/.test(String(target.commit ?? ''))) throw fail(`${path}: target.commit must be a full 40-hex commit`);
  if (typeof target.release !== 'string' || target.release.length === 0) throw fail(`${path}: target.release must name the release`);
  if (!target.packages || typeof target.packages !== 'object') throw fail(`${path}: target.packages must map package name to pinned version`);
  if (!Array.isArray(contract.slots) || contract.slots.length === 0) throw fail(`${path}: slots must be a non-empty catalog list`);
  const kinds = new Set(['single', 'list', 'keyed', 'chain']);
  for (const slot of contract.slots) {
    if (typeof slot.key !== 'string' || !kinds.has(slot.kind)) throw fail(`${path}: invalid slot entry ${JSON.stringify(slot)}`);
  }
  for (const slot of contract.privateSlots ?? []) {
    if (typeof slot.key !== 'string' || typeof slot.reason !== 'string') throw fail(`${path}: privateSlots entries need key and reason`);
  }
  const ownership = contract.routeOwnership;
  if (!ownership || !Array.isArray(ownership.ownerModules) || ownership.ownerModules.length === 0) {
    throw fail(`${path}: routeOwnership.ownerModules must be a non-empty array`);
  }
  for (const module of ownership.ownerModules) {
    if (typeof module !== 'string' || module.length === 0) throw fail(`${path}: routeOwnership.ownerModules entries must be repository paths`);
  }
  if (new Set(ownership.ownerModules).size !== ownership.ownerModules.length) throw fail(`${path}: routeOwnership.ownerModules must be unique`);
  if (!Array.isArray(ownership.debt)) throw fail(`${path}: routeOwnership.debt must be an array`);
  for (const entry of ownership.debt) {
    if (typeof entry.path !== 'string' || !Number.isInteger(entry.routes) || entry.routes < 1) {
      throw fail(`${path}: routeOwnership.debt entries need path and a positive routes count`);
    }
    if (typeof entry.reason !== 'string') throw fail(`${path}: routeOwnership.debt ${entry.path} needs a reason`);
  }
  if (contract.tools?.dsl !== 'defineTool') throw fail(`${path}: tools.dsl must be defineTool`);
  if (!Array.isArray(contract.envDeploymentPrefixes)) throw fail(`${path}: envDeploymentPrefixes must be an array`);
  return contract;
}

function finding(severity, code, where, message) {
  return { severity, code, where, message };
}

function checkSlotKey(key, where, catalog, privateSlots, declaredChildren, findings, stats) {
  if (catalog.has(key)) {
    stats.slots.add(`${key}:${catalog.get(key).kind}`);
    return;
  }
  if (privateSlots.has(key)) {
    stats.privateSlots.add(key);
    return;
  }
  if (declaredChildren.has(key)) {
    stats.declaredChildren.add(key);
    return;
  }
  findings.push(finding('error', 'UNKNOWN_SLOT', where,
    `slot ${key} is neither in the rc.5 catalog (${catalog.size} keys) nor declared as a private children entry`));
}

function checkSlotSites(text, where, contract, findings, stats) {
  const catalog = new Map(contract.slots.map(slot => [slot.key, slot]));
  const privateSlots = new Map((contract.privateSlots ?? []).map(slot => [slot.key, slot.reason]));
  const declaredChildren = new Set();
  const registers = [];
  const registerPattern = /\.slots\s*\.\s*register\s*\(/g;
  let match;
  while ((match = registerPattern.exec(text)) !== null) {
    const line = lineOf(text, match.index);
    const objectStart = objectStartOf(text, text.indexOf('(', match.index));
    if (text[objectStart] !== '{') {
      findings.push(finding('error', 'UNPARSED_SLOT_REGISTER', `${where}:${line}`,
        'slot registration options must be an object literal so the rc.5 gate can read name/key/id'));
      continue;
    }
    const properties = topLevelProperties(balanced(text, objectStart) ?? '');
    const name = literal(properties.get('name'));
    if (!name || name.interpolated) {
      findings.push(finding('error', 'UNPARSED_SLOT_REGISTER', `${where}:${line}`,
        'slot registration needs a literal name'));
      continue;
    }
    registers.push({ line, name: name.value, properties });
    for (const child of childSlotKeys(properties)) declaredChildren.add(child);
  }
  const injectPattern = /\.slots\s*\.\s*inject\s*\(\s*([^,)]+)/g;
  while ((match = injectPattern.exec(text)) !== null) {
    const line = lineOf(text, match.index);
    const key = literal(match[1]);
    if (!key || key.interpolated) {
      findings.push(finding('error', 'UNPARSED_SLOT_INJECT', `${where}:${line}`, 'slots.inject needs a literal slot key'));
      continue;
    }
    checkSlotKey(key.value, `${where}:${line}`, catalog, privateSlots, declaredChildren, findings, stats);
  }
  for (const register of registers) {
    const kind = catalog.get(register.name)?.kind;
    checkSlotKey(register.name, `${where}:${register.line}`, catalog, privateSlots, declaredChildren, findings, stats);
    if (kind === 'list' && !register.properties.has('id')) {
      findings.push(finding('error', 'SLOT_LIST_ID', `${where}:${register.line}`,
        `rc.5 list slot ${register.name} requires a stable id option (ui-slots/src/index.ts:1161-1235)`));
    }
    if (kind === 'keyed' && !register.properties.has('key')) {
      findings.push(finding('error', 'SLOT_KEYED_KEY', `${where}:${register.line}`,
        `rc.5 keyed slot ${register.name} requires a key option (ui-slots/src/index.ts:1161-1235)`));
    }
  }
}

/**
 * True when the call is the expression body of a `ctx.effect(...)`: cordis then
 * owns the returned disposer, which rc.5 documents as the supported pattern.
 */
function ownedByEffect(text, index) {
  const lookback = text.slice(Math.max(0, index - 96), index);
  const receiver = '(?:[A-Za-z_$][\\w$]*\\s*\\.?\\s*)?';
  return new RegExp('(?:^|[^\\w$])(?:ctx|scoped|this\\.ctx)\\s*\\.\\s*effect\\s*\\(\\s*'
    + '(?:(?:async\\s+)?\\(\\s*\\)\\s*=>|function\\s*\\(\\s*\\)\\s*\\{\\s*return)\\s*'
    + receiver + '$').test(lookback);
}

/** Resolve a route path written as a literal, a template prefix, or a local constant. */
function resolvePath(raw, constants) {
  const direct = literal(raw);
  if (direct) return direct;
  const name = String(raw ?? '').trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return undefined;
  const value = constants.get(name);
  return value === undefined ? undefined : { value, interpolated: false };
}

function checkFetchSites(text, where, contract, findings, stats, constants) {
  const ownerModules = new Set(contract.routeOwnership.ownerModules);
  const debt = new Map(contract.routeOwnership.debt.map(entry => [entry.path, entry]));
  const ledgerImported = text.includes(LEDGER_IMPORT);
  const sites = [];
  for (const pattern of [/\.connection\s*\.\s*fetch\s*\.\s*register\s*\(/g, /\.own\s*\(/g]) {
    const isOwn = pattern.source.includes('own');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = lineOf(text, match.index);
      const open = text.indexOf('(', match.index);
      let objectStart;
      if (isOwn) {
        // `.own(owner, { … })`: skip the owner argument, then expect the object.
        const comma = text.indexOf(',', open);
        if (comma < 0) continue;
        const start = objectStartOf(text, comma);
        objectStart = text[start] === '{' ? start : -1;
      } else {
        objectStart = objectStartOf(text, open);
      }
      if (objectStart < 0 || text[objectStart] !== '{') {
        if (isOwn) continue;
        findings.push(finding('error', 'UNPARSED_FETCH_ROUTE', `${where}:${line}`, 'fetch route must be an object literal'));
        continue;
      }
      const properties = topLevelProperties(balanced(text, objectStart) ?? '');
      // A non-route `.own(…)` call is not a Connection route declaration.
      if (isOwn && !(properties.has('path') && properties.has('methods') && properties.has('requestBody'))) continue;
      sites.push({ line, index: match.index, isOwn, properties });
    }
  }
  if (sites.length === 0) return;
  stats.fetchSites.set(where, (stats.fetchSites.get(where) ?? 0) + sites.length);
  if (ownerModules.has(where)) {
    // Each ledger validates path/method/body at runtime and is covered by its
    // unit test; an owner module is the only place allowed to call register
    // directly. Independently published plugins each ship their own ledger.
    stats.owned += sites.length;
    return;
  }
  for (const site of sites) {
    const routePath = resolvePath(site.properties.get('path'), constants);
    if (!routePath || (routePath.value !== API_ROOT && !routePath.value.startsWith(`${API_ROOT}/`))) {
      findings.push(finding('error', 'FETCH_PATH', `${where}:${site.line}`,
        `fetch route path must live below ${API_ROOT} (rpc.ts:153-171); found ${JSON.stringify(site.properties.get('path'))}`));
    }
    const methods = [...(site.properties.get('methods') ?? '').matchAll(/'([A-Z]+)'/g)].map(item => item[1]);
    if (methods.length === 0) {
      findings.push(finding('error', 'FETCH_METHODS', `${where}:${site.line}`, 'fetch route methods must be a literal array'));
    }
    for (const method of methods) {
      if (!FETCH_METHODS.has(method)) {
        findings.push(finding('error', 'FETCH_METHODS', `${where}:${site.line}`, `fetch method ${method} is not GET/HEAD/POST`));
      }
    }
    const body = literal(site.properties.get('requestBody'));
    if (!body || !FETCH_BODIES.has(body.value)) {
      findings.push(finding('error', 'FETCH_BODY', `${where}:${site.line}`, 'requestBody must be buffered or streaming'));
    }
    if (!site.properties.has('fetch')) {
      findings.push(finding('error', 'FETCH_HANDLER', `${where}:${site.line}`, 'fetch route has no fetch handler'));
    }
    if (site.isOwn) {
      if (ledgerImported) stats.owned += 1;
      else {
        findings.push(finding('error', 'UNOWNED_FETCH_ROUTE', `${where}:${site.line}`,
          `.own(…) is only an owner when the module imports ${LEDGER_IMPORT}`));
      }
      continue;
    }
    if (ownedByEffect(text, site.index)) {
      stats.owned += 1;
      if (!TEST_FILE_PATTERN.test(where)) {
        findings.push(finding('warn', 'ROUTE_EFFECT_OWNED', `${where}:${site.line}`,
          'route is owned by a local ctx.effect; the shared ledger is the single owner once this row moves'));
      }
      continue;
    }
    if (debt.has(where)) continue;
    findings.push(finding('error', 'UNOWNED_FETCH_ROUTE', `${where}:${site.line}`,
      `connection.fetch.register must run through one of routeOwnership.ownerModules so the rc.5 disposer is owned (${[...ownerModules].join(', ')})`));
  }
}

function checkToolSites(text, where, contract, findings, stats) {
  const pattern = /\.tools\s*\.\s*register\s*\(/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const line = lineOf(text, match.index);
    const after = text.slice(text.indexOf('(', match.index) + 1).trimStart();
    if (!after.startsWith(`${contract.tools.dsl}(`) && !after.startsWith(`${contract.tools.dsl} (`)) {
      findings.push(finding('error', 'TOOL_DSL', `${where}:${line}`,
        `rc.5 tool registration must pass ${contract.tools.dsl}(...)`));
      continue;
    }
    stats.tools += 1;
  }
}

function checkEnvDeploymentValues(text, where, contract, findings, stats) {
  if (TEST_FILE_PATTERN.test(where)) return;
  for (const prefix of contract.envDeploymentPrefixes) {
    const pattern = new RegExp(`process\\.env\\.(${prefix}[A-Z0-9_]+)`, 'g');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (stats.envValues.has(`${where}:${match[1]}`)) continue;
      stats.envValues.add(`${where}:${match[1]}`);
      findings.push(finding('warn', 'ENV_DEPLOYMENT_VALUE', `${where}:${lineOf(text, match.index)}`,
        `${match[1]} is a deployment value read from the environment; rc.5 wants a plugin Config field (docs/user/develop/basic/config.md:78)`));
    }
  }
}

async function checkManifest(manifest, dir, root, contract, findings) {
  const where = relative(root, join(dir, 'package.json')).split(sep).join('/');
  const dsh = manifest.dsh;
  if (dsh === undefined) return;
  if (typeof dsh !== 'object' || dsh === null) {
    findings.push(finding('error', 'MANIFEST_SHAPE', where, 'dsh must be an object'));
    return;
  }
  const exportsField = manifest.exports ?? {};
  if (dsh.client !== undefined) {
    const client = dsh.client;
    if (typeof client !== 'object' || client === null) {
      findings.push(finding('error', 'MANIFEST_SHAPE', where, 'dsh.client must be an object'));
    } else {
      if (client.platform !== 'web') {
        findings.push(finding('error', 'CLIENT_PLATFORM', where,
          `dsh.client.platform is ${JSON.stringify(client.platform)}; rc.5 only scans platform "web" rows (modules/src/index.ts:862-865)`));
      }
      if (exportsField['./client'] === undefined) {
        findings.push(finding('error', 'CLIENT_EXPORT_MISSING', where,
          'dsh.client without exports["./client"] makes rc.5 throw (modules/src/index.ts:866-868)'));
      }
      for (const field of ['inject', 'external']) {
        const value = client[field];
        if (value === undefined) continue;
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
          findings.push(finding('error', 'CLIENT_ARRAY', where, `dsh.client.${field} must be a string array`));
          continue;
        }
        if (new Set(value).size !== value.length) {
          findings.push(finding('error', 'CLIENT_ARRAY', where, `dsh.client.${field} repeats an entry`));
        }
      }
      if (client.immediately !== undefined && typeof client.immediately !== 'boolean') {
        findings.push(finding('error', 'CLIENT_IMMEDIATELY', where, 'dsh.client.immediately must be a boolean'));
      }
      for (const key of Object.keys(client)) {
        if (!['platform', 'inject', 'external', 'immediately'].includes(key)) {
          findings.push(finding('warn', 'CLIENT_UNKNOWN_KEY', where, `dsh.client.${key} is not consumed by rc.5`));
        }
      }
    }
  }
  if (dsh.bundle !== undefined) {
    const patch = dsh.bundle?.patch;
    if (typeof patch !== 'string' || patch.length === 0) {
      findings.push(finding('error', 'BUNDLE_PATCH', where, 'dsh.bundle.patch must name a patch file'));
    } else if (!(await isFile(join(dir, patch)))) {
      findings.push(finding('error', 'BUNDLE_PATCH', where, `dsh.bundle.patch ${patch} does not exist`));
    }
  }
  const pins = { ...(manifest.peerDependencies ?? {}), ...(manifest.dependencies ?? {}) };
  for (const [name, version] of Object.entries(pins)) {
    if (!name.startsWith('@deepseek-ai/')) continue;
    const expected = contract.target.packages[name];
    if (expected === undefined) {
      findings.push(finding('warn', 'PIN_UNLISTED', where, `${name}@${version} is not part of the rc.5 surface contract`));
    } else if (version !== expected) {
      findings.push(finding('warn', 'PIN_DRIFT', where,
        `${name}@${version} is behind the contract pin ${expected} (P0 single-source work)`));
    }
  }
}

/** String constants declared across the plugin sources, for route paths by name. */
function collectConstants(sources) {
  const constants = new Map();
  const pattern = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(['"])([^'"\n]*)\2\s*;/gm;
  for (const text of sources) {
    let match;
    while ((match = pattern.exec(text)) !== null) constants.set(match[1], match[3]);
  }
  return constants;
}

/** Evaluate the repository against the pinned rc.5 surface. */
export async function evaluate({ root = process.cwd(), contractPath = DEFAULT_CONTRACT } = {}) {
  const absoluteRoot = resolve(root);
  const contractFile = resolve(absoluteRoot, contractPath);
  const contract = validateContract(await readJson(contractFile), contractPath);
  const findings = [];
  const stats = {
    plugins: 0,
    slots: new Set(),
    privateSlots: new Set(),
    declaredChildren: new Set(),
    fetchSites: new Map(),
    owned: 0,
    tools: 0,
    envValues: new Set(),
  };
  const plugins = await pluginDirectories(absoluteRoot);
  const sources = [];
  for (const plugin of plugins) {
    for (const file of plugin.files) sources.push({ file, text: maskComments(await readFile(file, 'utf8')) });
  }
  const constants = collectConstants(sources.map(source => source.text));
  let index = 0;
  for (const plugin of plugins) {
    stats.plugins += 1;
    await checkManifest(await readJson(join(plugin.dir, 'package.json')), plugin.dir, absoluteRoot, contract, findings);
    for (const file of plugin.files) {
      const where = relative(absoluteRoot, file).split(sep).join('/');
      const text = sources[index++].text;
      checkSlotSites(text, where, contract, findings, stats);
      checkFetchSites(text, where, contract, findings, stats, constants);
      checkToolSites(text, where, contract, findings, stats);
      if (where.includes('/src/')) checkEnvDeploymentValues(text, where, contract, findings, stats);
    }
  }
  // Debt must shrink, never silently grow: an unrecorded route is an error
  // above, so only under-use is reported here.
  for (const entry of contract.routeOwnership.debt) {
    const sites = stats.fetchSites.get(entry.path) ?? 0;
    if (sites === 0) {
      findings.push(finding('warn', 'ROUTE_DEBT_STALE', entry.path,
        `no connection.fetch route remains in ${entry.path}; drop it from routeOwnership.debt`));
    } else if (sites > entry.routes) {
      findings.push(finding('error', 'ROUTE_DEBT_EXCEEDED', entry.path,
        `${sites} routes exceed the recorded debt of ${entry.routes}; route them through one of ${contract.routeOwnership.ownerModules.join(', ')}`));
    } else {
      findings.push(finding('warn', 'ROUTE_DEBT', entry.path,
        `${sites} route(s) still registered directly: ${entry.reason}`));
    }
  }
  // Every declared owner module must still register at least one route; a stale
  // entry means the ledger moved or stopped owning, not that debt was repaid.
  for (const ownerModule of contract.routeOwnership.ownerModules) {
    if ((stats.fetchSites.get(ownerModule) ?? 0) === 0) {
      findings.push(finding('error', 'OWNER_MODULE_MISSING', ownerModule,
        'the ledger that owns Connection Fetch disposers no longer registers any route'));
    }
  }
  const toolchainFile = join(absoluteRoot, 'dsh-plugins/plugin-kit/toolchain.json');
  if (await isFile(toolchainFile)) {
    const toolchain = await readJson(toolchainFile);
    if (toolchain.upstream_sha !== contract.target.commit) {
      findings.push(finding('warn', 'PIN_DRIFT', 'dsh-plugins/plugin-kit/toolchain.json',
        `upstream_sha ${toolchain.upstream_sha} is not the rc.5 commit ${contract.target.commit} (P0 single-source work)`));
    }
    if (toolchain.sdk_version !== contract.target.release) {
      findings.push(finding('warn', 'PIN_DRIFT', 'dsh-plugins/plugin-kit/toolchain.json',
        `sdk_version ${toolchain.sdk_version} is not the contract release ${contract.target.release}`));
    }
  }
  const errors = findings.filter(row => row.severity === 'error');
  const warnings = findings.filter(row => row.severity === 'warn');
  return { contract, contractPath: contractFile, findings, errors, warnings, stats };
}

function fetchRouteCount(stats) {
  return [...stats.fetchSites.values()].reduce((sum, value) => sum + value, 0);
}

export function render(result, { shadow = false } = {}) {
  const { contract, findings, errors, warnings, stats } = result;
  const lines = [];
  lines.push(`rc.5 surface gate${shadow ? ' (shadow)' : ''} — ${contract.schema_version} @ ${contract.target.release} (${contract.target.commit.slice(0, 8)})`);
  lines.push(`plugins ${stats.plugins} · catalog slots ${contract.slots.length} · used slots ${stats.slots.size}`
    + ` · private/children ${stats.privateSlots.size + stats.declaredChildren.size}`
    + ` · fetch routes ${fetchRouteCount(stats)} (owned ${stats.owned}) · tools ${stats.tools}`);
  for (const row of findings) {
    lines.push(`${row.severity === 'error' ? 'error' : 'warn '} ${row.code} ${row.where}: ${row.message}`);
  }
  lines.push(`result: ${errors.length} error(s), ${warnings.length} warning(s)`
    + `${shadow && errors.length > 0 ? ' — non-blocking shadow run' : ''}`);
  return lines.join('\n');
}

export function renderSummary(result) {
  const { contract, errors, warnings, stats } = result;
  const lines = ['## rc.5 surface shadow gate', ''];
  lines.push(`Contract: \`${contract.schema_version}\` @ \`${contract.target.release}\` (\`${contract.target.commit}\`)`, '');
  lines.push(`Scanned ${stats.plugins} plugin manifests, ${contract.slots.length} catalog slots, `
    + `${fetchRouteCount(stats)} fetch routes, ${stats.tools} tools.`, '');
  if (errors.length === 0) {
    lines.push('No rc.5 surface errors. Warnings are recorded debt (P0 pin bump, P1/P3 follow-ups).');
  } else {
    lines.push('| severity | code | where | detail |', '| --- | --- | --- | --- |');
    for (const row of [...errors, ...warnings].slice(0, 40)) {
      lines.push(`| ${row.severity} | ${row.code} | \`${row.where}\` | ${row.message.replace(/\|/g, '\\|')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function extractFromUpstream(dir, contractPath, options) {
  const catalogFile = join(dir, SLOT_CATALOG_PATH);
  const source = await readFile(catalogFile, 'utf8').catch(() => {
    throw fail(`cannot read the rc.5 slot catalog at ${catalogFile}`);
  });
  const slots = extractSlotCatalog(source);
  const contract = validateContract(await readJson(contractPath), contractPath);
  const before = contract.slots.length;
  contract.slots = slots;
  if (options.commit) contract.target.commit = options.commit;
  if (options.release) contract.target.release = options.release;
  validateContract(contract, contractPath);
  await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  return { before, after: slots.length, contractPath };
}

export async function main(argv = process.argv.slice(2)) {
  const options = {
    root: process.cwd(), contractPath: DEFAULT_CONTRACT, shadow: false, json: false, summary: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') options.root = argv[++i];
    else if (arg === '--contract') options.contractPath = argv[++i];
    else if (arg === '--shadow') options.shadow = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--summary') options.summary = argv[++i];
    else if (arg === '--extract-upstream') options.extractUpstream = argv[++i];
    else if (arg === '--write-contract') options.writeContract = argv[++i];
    else if (arg === '--commit') options.commit = argv[++i];
    else if (arg === '--release') options.release = argv[++i];
    else if (arg === '--help' || arg === '-h') { console.log('see the module header for usage'); return 0; }
    else throw fail(`unknown argument ${arg}`);
  }
  if (options.extractUpstream) {
    const contractPath = resolve(options.root, options.writeContract ?? options.contractPath);
    const outcome = await extractFromUpstream(resolve(options.extractUpstream), contractPath, options);
    console.log(`rc.5 slot catalog refreshed: ${outcome.before} -> ${outcome.after} keys in ${relative(process.cwd(), outcome.contractPath)}`);
    return 0;
  }
  const result = await evaluate(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      ok: result.errors.length === 0,
      contract: {
        schema_version: result.contract.schema_version,
        release: result.contract.target.release,
        commit: result.contract.target.commit,
      },
      errors: result.errors,
      warnings: result.warnings,
      stats: {
        plugins: result.stats.plugins,
        catalogSlots: result.contract.slots.length,
        usedSlots: [...result.stats.slots].sort(),
        privateSlots: [...result.stats.privateSlots].sort(),
        declaredChildren: [...result.stats.declaredChildren].sort(),
        fetchRoutes: Object.fromEntries([...result.stats.fetchSites].sort()),
        ownedRoutes: result.stats.owned,
        tools: result.stats.tools,
        envValues: [...result.stats.envValues].sort(),
      },
    }, null, 2)}\n`);
  } else {
    console.log(render(result, options));
  }
  if (options.summary) await writeFile(options.summary, renderSummary(result));
  if (options.shadow) return 0;
  return result.errors.length === 0 ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(`rc.5 surface gate could not run: ${error.message}`);
    process.exitCode = error.code === 'RC5_GATE_INPUT' ? 2 : 1;
  });
}
