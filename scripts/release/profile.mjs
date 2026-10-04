import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from './toolchain.mjs';
import { validateServiceBinding } from './service-compatibility.mjs';

export const PROFILE_SCHEMA = 'dsh-profile/v1';
export const DEFAULT_PROFILE_MANIFEST = 'config/dsh-profile.rc2.json';
const RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;
const PACKAGE_NAME = /^@shine-mage\/[a-z0-9][a-z0-9-]+$/;

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function profilePathWithinRoot(root, manifestPath) {
  const repo = resolve(root);
  const candidate = resolve(repo, manifestPath);
  const rel = relative(repo, candidate).split(sep).join('/');
  assert.ok(rel && RELATIVE.test(rel) && rel !== '..' && !rel.startsWith('../'), 'PROFILE_MANIFEST_OUTSIDE_ROOT');
  return candidate;
}

async function canonicalInside(root, candidate, code) {
  const rootReal = await realpath(root).catch(() => { throw new Error(code); });
  const candidateReal = await realpath(candidate).catch(() => { throw new Error(code); });
  assert.ok(candidateReal === rootReal || candidateReal.startsWith(`${rootReal}/`), code);
  return candidateReal;
}

export function validateProfile(profile) {
  assert.ok(profile && typeof profile === 'object' && !Array.isArray(profile), 'PROFILE_MANIFEST_INVALID');
  assert.equal(profile.schema_version, PROFILE_SCHEMA, 'PROFILE_SCHEMA_UNSUPPORTED');
  if (Object.hasOwn(profile, 'service_binding')) validateServiceBinding(profile.service_binding);
  assert.match(profile.profile_id, /^[a-z0-9][a-z0-9._-]{1,63}$/, 'PROFILE_ID_INVALID');
  assert.deepEqual(profile.dsh, { sdk_version: DSH_SDK_VERSION, upstream_sha: DSH_UPSTREAM_SHA }, 'PROFILE_DSH_PIN_MISMATCH');
  assert.ok(Array.isArray(profile.plugins) && profile.plugins.length > 0, 'PROFILE_PLUGINS_REQUIRED');
  const paths = new Set();
  const ids = new Set();
  for (const [index, plugin] of profile.plugins.entries()) {
    assert.ok(plugin && typeof plugin === 'object' && !Array.isArray(plugin), `PROFILE_PLUGIN_INVALID ${index}`);
    assert.match(plugin.path, RELATIVE, `PROFILE_PLUGIN_PATH_INVALID ${index}`);
    assert.equal(plugin.path, plugin.path.replaceAll('\\', '/'), `PROFILE_PLUGIN_PATH_INVALID ${index}`);
    assert.ok(!plugin.path.startsWith('../') && !plugin.path.includes('/../'), `PROFILE_PLUGIN_PATH_INVALID ${index}`);
    assert.match(plugin.id, PACKAGE_NAME, `PROFILE_PLUGIN_ID_INVALID ${index}`);
    assert.equal(plugin.enabled, true, `PROFILE_PLUGIN_DISABLED_OR_INVALID ${index}`);
    assert.equal(plugin.build, 'build.mjs', `PROFILE_PLUGIN_BUILD_INVALID ${index}`);
    assert.ok(!paths.has(plugin.path), `PROFILE_PLUGIN_DUPLICATE_PATH ${plugin.path}`);
    assert.ok(!ids.has(plugin.id), `PROFILE_PLUGIN_DUPLICATE_ID ${plugin.id}`);
    paths.add(plugin.path); ids.add(plugin.id);
  }
}

/**
 * Load the only release plugin input. Validation is deliberately strict and
 * read-only: no package manager, source build, host process or data store is
 * touched here.
 */
export async function loadReleaseProfile({ root, manifestPath = null } = {}) {
  assert.ok(typeof root === 'string' && root, 'PROFILE_ROOT_REQUIRED');
  const selected = manifestPath || process.env.DSH_PROFILE_MANIFEST || DEFAULT_PROFILE_MANIFEST;
  assert.ok(typeof selected === 'string' && selected, 'PROFILE_MANIFEST_REQUIRED');
  const path = profilePathWithinRoot(root, selected);
  const profileInfo = await lstat(path).catch(error => { throw new Error(`PROFILE_MANIFEST_READ_FAILED ${error.code ?? 'unavailable'}`); });
  assert.ok(profileInfo.isFile() && !profileInfo.isSymbolicLink(), 'PROFILE_MANIFEST_SYMLINK');
  await canonicalInside(root, path, 'PROFILE_MANIFEST_OUTSIDE_ROOT');
  const bytes = await readFile(path).catch(error => { throw new Error(`PROFILE_MANIFEST_READ_FAILED ${error.code ?? 'unavailable'}`); });
  let profile;
  try { profile = JSON.parse(bytes); } catch { throw new Error('PROFILE_MANIFEST_JSON_INVALID'); }
  validateProfile(profile);
  const plugins = [];
  for (const item of profile.plugins) {
    const pluginRoot = resolve(root, item.path);
    const pluginInfo = await lstat(pluginRoot).catch(error => { throw new Error(`PROFILE_PLUGIN_ROOT_MISSING ${item.path} ${error.code ?? 'unavailable'}`); });
    assert.ok(pluginInfo.isDirectory() && !pluginInfo.isSymbolicLink(), `PROFILE_PLUGIN_ROOT_INVALID ${item.path}`);
    const pluginReal = await canonicalInside(root, pluginRoot, `PROFILE_PLUGIN_ROOT_OUTSIDE_ROOT ${item.path}`);
    const packagePath = join(pluginReal, 'package.json');
    const packageInfo = await lstat(packagePath).catch(error => { throw new Error(`PROFILE_PLUGIN_PACKAGE_MISSING ${item.path} ${error.code ?? 'unavailable'}`); });
    assert.ok(packageInfo.isFile() && !packageInfo.isSymbolicLink(), `PROFILE_PLUGIN_PACKAGE_INVALID ${item.path}`);
    const packageBytes = await readFile(packagePath).catch(error => { throw new Error(`PROFILE_PLUGIN_PACKAGE_MISSING ${item.path} ${error.code ?? 'unavailable'}`); });
    let manifest;
    try { manifest = JSON.parse(packageBytes); } catch { throw new Error(`PROFILE_PLUGIN_PACKAGE_INVALID ${item.path}`); }
    assert.equal(manifest.name, item.id, `PROFILE_PLUGIN_PACKAGE_NAME_MISMATCH ${item.path}`);
    assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'], DSH_SDK_VERSION, `PROFILE_PLUGIN_DSH_PEER_MISMATCH ${item.path}`);
    const buildPath = join(pluginReal, item.build);
    const buildInfo = await lstat(buildPath).catch(() => null);
    assert.ok(buildInfo?.isFile() && !buildInfo.isSymbolicLink(), `PROFILE_PLUGIN_BUILD_MISSING ${item.path}`);
    await canonicalInside(pluginReal, buildPath, `PROFILE_PLUGIN_BUILD_OUTSIDE_ROOT ${item.path}`);
    plugins.push({ ...item, package_version: manifest.version });
  }
  return Object.freeze({
    path,
    contents: bytes.toString('utf8'),
    digest: digest(bytes),
    profile,
    plugins: Object.freeze(plugins),
  });
}
