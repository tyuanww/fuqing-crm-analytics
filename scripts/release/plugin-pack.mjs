#!/usr/bin/env node

/**
 * Controlled, plugin-only pack boundary (T15).
 *
 * This adapter packages one explicit built plugin with pnpm's packer and
 * records the digest of the tarball. It never builds DSH, reads a profile/WAL,
 * uploads, restarts a host or creates a release journal entry. Admission of a
 * candidate and host activation remain separate owners.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DSH_SDK_VERSION, PNPM_VERSION } from './toolchain.mjs';
import { assertClean, scanTree } from './secret-scan.mjs';

const exec = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;
const MAX_PACK_BYTES = 20 * 1024 * 1024;

function verifyEntrypoints(manifest, files) {
  const targets = [];
  function exportsTargets(value) {
    if (value === null) return;
    if (typeof value === 'string') { targets.push(value); return; }
    assert.ok(value && typeof value === 'object', 'PLUGIN_PACK_EXPORT_INVALID');
    for (const item of Object.values(value)) exportsTargets(item);
  }
  if (manifest.exports !== undefined) exportsTargets(manifest.exports);
  for (const value of [manifest.main, manifest.module, manifest.dsh?.bundle?.patch]) {
    if (value !== undefined) targets.push(value);
  }
  for (const target of targets) {
    assert.equal(typeof target, 'string', 'PLUGIN_PACK_ENTRY_INVALID');
    const entry = target.replace(/^\.\//, '');
    // Wildcard exports need an explicit expansion contract; do not guess it.
    assert.ok(SAFE_RELATIVE.test(entry) && !entry.includes('*') && !entry.split('/').includes('.'), `PLUGIN_PACK_ENTRY_INVALID ${target}`);
    assert.ok(files.includes(entry), `PLUGIN_PACK_ENTRY_MISSING ${target}`);
  }
}

function digest(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function safeAbsolute(value, code) {
  assert.equal(typeof value, 'string', code);
  assert.ok(value.startsWith('/') && !value.includes('..'), code);
  return resolve(value);
}

function packageFileAllowed(path, files) {
  if (path === 'package.json' || /^(?:README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?)$/.test(path)) return true;
  if (files.includes(path)) return true;
  return files.some(entry => entry.endsWith('/') && path.startsWith(entry));
}

async function canonicalInside(root, candidate, code) {
  const rootReal = await realpath(root);
  const candidateReal = await realpath(candidate);
  assert.ok(candidateReal === rootReal || candidateReal.startsWith(`${rootReal}/`), code);
  return candidateReal;
}

async function collectFiles(root, declared) {
  const files = [];
  const rootReal = await realpath(root);
  async function walk(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      assert.ok(!entry.isSymbolicLink(), `PLUGIN_PACK_SYMLINK ${rel}`);
      await canonicalInside(rootReal, path, `PLUGIN_PACK_PATH_ESCAPE ${rel}`);
      if (entry.isDirectory()) await walk(path, rel);
      else {
        assert.ok(entry.isFile(), `PLUGIN_PACK_SPECIAL_FILE ${rel}`);
        assert.ok(packageFileAllowed(rel, declared), `PLUGIN_PACK_UNDECLARED_FILE ${rel}`);
        files.push(rel);
      }
    }
  }
  // pnpm's `files` allowlist is the package boundary. Development helpers
  // such as build.mjs and test sources stay outside it and are intentionally
  // ignored here; the tar listing below is the final packaged truth.
  for (const declaredPath of [...declared, 'package.json']) {
    const clean = declaredPath.replace(/\/$/, '');
    const path = join(root, clean);
    let info;
    try { info = await lstat(path); } catch (error) { throw new Error(`PLUGIN_PACK_DECLARED_MISSING ${clean} ${error.code ?? 'unavailable'}`); }
    assert.ok(!info.isSymbolicLink(), `PLUGIN_PACK_SYMLINK ${clean}`);
    await canonicalInside(rootReal, path, `PLUGIN_PACK_PATH_ESCAPE ${clean}`);
    if (info.isDirectory()) await walk(path, clean);
    else {
      assert.ok(info.isFile(), `PLUGIN_PACK_SPECIAL_FILE ${clean}`);
      files.push(clean);
    }
  }
  return files.sort();
}

async function inspectPackage(pluginRoot) {
  const packagePath = join(pluginRoot, 'package.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.match(manifest.name, /^@shine-mage\/[a-z0-9][a-z0-9-]+$/, 'PLUGIN_PACK_NAME_INVALID');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'PLUGIN_PACK_VERSION_INVALID');
  assert.equal(manifest.type, 'module', 'PLUGIN_PACK_TYPE_INVALID');
  assert.equal(manifest.packageManager, `pnpm@${PNPM_VERSION}`, 'PLUGIN_PACK_PACKAGE_MANAGER_INVALID');
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'], DSH_SDK_VERSION, 'PLUGIN_PACK_DSH_PEER_INVALID');
  const declared = manifest.files;
  assert.ok(Array.isArray(declared) && declared.length > 0, 'PLUGIN_PACK_FILES_REQUIRED');
  assert.equal(new Set(declared).size, declared.length, 'PLUGIN_PACK_FILES_DUPLICATE');
  for (const path of declared) {
    assert.ok(SAFE_RELATIVE.test(path), `PLUGIN_PACK_FILE_PATH_INVALID ${path}`);
    assert.ok(!/(?:^|\/)(?:src|test|tests|node_modules)(?:\/|$)/.test(path), `PLUGIN_PACK_SOURCE_PATH ${path}`);
  }
  for (const dependencies of [manifest.dependencies, manifest.optionalDependencies, manifest.devDependencies, manifest.peerDependencies]) {
    for (const [name, value] of Object.entries(dependencies ?? {})) {
      assert.ok(typeof value === 'string' && !/^(?:workspace:|file:|link:)/.test(value), `PLUGIN_PACK_WORKSPACE_LINK ${name}`);
    }
  }
  const declaredFiles = await collectFiles(pluginRoot, declared);
  assert.ok(declaredFiles.some(file => file.startsWith('lib/')), 'PLUGIN_PACK_BUILD_OUTPUT_REQUIRED');
  return { manifest, declared, declaredFiles };
}

async function stagePackInput(pluginRoot, inspected, staging) {
  await mkdir(staging, { mode: 0o700 });
  // Never run a plugin's lifecycle hooks while producing a release artifact.
  // The staging manifest retains package identity/files/peer metadata but drops
  // scripts and other development-only execution hooks.
  const manifest = { ...inspected.manifest };
  delete manifest.scripts;
  await writeFile(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  for (const entry of inspected.declaredFiles) {
    if (entry === 'package.json') continue;
    const source = join(pluginRoot, entry);
    await canonicalInside(pluginRoot, source, `PLUGIN_PACK_PATH_ESCAPE ${entry}`);
    const target = join(staging, entry);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(source, target);
  }
  return staging;
}

async function gitMetadata(pluginRoot) {
  try {
    const root = (await exec('git', ['-C', pluginRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 3000 })).stdout.trim();
    const sha = (await exec('git', ['-C', pluginRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 3000 })).stdout.trim();
    const physicalPluginRoot = await realpath(pluginRoot);
    const status = (await exec('git', ['status', '--porcelain', '--', relative(root, physicalPluginRoot)], {
      cwd: root, encoding: 'utf8', timeout: 3000,
    })).stdout.trim();
    assert.match(sha, /^[0-9a-f]{40}$/, 'PLUGIN_PACK_GIT_SHA_INVALID');
    assert.equal(status, '', 'PLUGIN_PACK_SOURCE_DIRTY');
    return { root, sha, dirty: false };
  } catch (error) {
    throw new Error(`PLUGIN_PACK_GIT_METADATA_REQUIRED ${String(error?.stderr ?? error?.message ?? error).slice(0, 240)}`);
  }
}

export async function packPlugin({ plugin, outputDir, manifestPath }) {
  const pluginRoot = safeAbsolute(plugin, 'PLUGIN_PACK_ROOT_INVALID');
  const destination = safeAbsolute(outputDir, 'PLUGIN_PACK_OUTPUT_INVALID');
  const pluginInfo = await lstat(pluginRoot).catch(error => { throw new Error(`PLUGIN_PACK_ROOT_INVALID ${error.code ?? 'unavailable'}`); });
  assert.ok(pluginInfo.isDirectory() && !pluginInfo.isSymbolicLink(), 'PLUGIN_PACK_ROOT_INVALID');
  await access(join(pluginRoot, 'package.json'));
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const destinationInfo = await lstat(destination);
  assert.ok(destinationInfo.isDirectory() && !destinationInfo.isSymbolicLink(), 'PLUGIN_PACK_OUTPUT_INVALID');
  const inspected = await inspectPackage(pluginRoot);
  const source = await gitMetadata(pluginRoot);
  const expectedName = `${inspected.manifest.name.slice(1).replaceAll('/', '-')}-${inspected.manifest.version}.tgz`;
  const tarball = join(destination, expectedName);
  try { await access(tarball); throw new Error('PLUGIN_PACK_OUTPUT_EXISTS'); } catch (error) {
    if (error.message === 'PLUGIN_PACK_OUTPUT_EXISTS') throw error;
    assert.equal(error.code, 'ENOENT', 'PLUGIN_PACK_OUTPUT_UNAVAILABLE');
  }
  const work = await mkdtemp(join(destination, '.plugin-pack-'));
  try {
    const staging = await stagePackInput(pluginRoot, inspected, join(work, 'input'));
    await exec('pnpm', ['pack', '--pack-destination', work], { cwd: staging, encoding: 'utf8', timeout: 180000, maxBuffer: 256 * 1024 });
    const packedPath = join(work, expectedName);
    const info = await lstat(packedPath);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= MAX_PACK_BYTES, 'PLUGIN_PACK_TARBALL_INVALID');
    const unpacked = join(work, 'verified');
    await exec('python3', [fileURLToPath(new URL('./secure-unpack.py', import.meta.url)), packedPath, unpacked,
      '--max-entries', '10000', '--max-bytes', String(MAX_PACK_BYTES)], { encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(unpacked), ['package'], 'PLUGIN_PACK_ARCHIVE_ROOT_INVALID');
    const packageRoot = join(unpacked, 'package');
    const packageEntries = [];
    async function inspectFiles(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        const rel = relative(packageRoot, path).split(sep).join('/');
        assert.ok(!/(?:^|\/)(?:src|test|tests|\.git)(?:\/|$)/.test(rel) && !rel.endsWith('.map'), `PLUGIN_PACK_SOURCE_PATH ${rel}`);
        if (entry.isDirectory()) await inspectFiles(path);
        else {
          assert.ok(entry.isFile(), `PLUGIN_PACK_SPECIAL_FILE ${rel}`);
          assert.ok(packageFileAllowed(rel, inspected.declared), `PLUGIN_PACK_TARBALL_UNDECLARED ${rel}`);
          packageEntries.push(rel);
        }
      }
    }
    await inspectFiles(packageRoot);
    packageEntries.sort();
    assert.ok(packageEntries.includes('package.json'), 'PLUGIN_PACK_PACKAGE_JSON_MISSING');
    verifyEntrypoints(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')), packageEntries);
    assertClean(await scanTree(packageRoot, { maxBytes: MAX_PACK_BYTES, allowSyntheticFixtures: false }));
    const bytes = await readFile(packedPath);
    const packDigest = digest(bytes);
    assert.match(packDigest, SHA256, 'PLUGIN_PACK_DIGEST_INVALID');
    const receipt = {
      schema_version: 'dsh-plugin-pack/v1',
      package_name: inspected.manifest.name,
      package_version: inspected.manifest.version,
      dsh_pin: DSH_SDK_VERSION,
      source_sha: source.sha,
      source_dirty: source.dirty,
      tarball: { name: basename(tarball), bytes: info.size, sha256: packDigest },
      entries: packageEntries,
      activation: 'NOT_RUN',
      state_path: 'NOT_APPLICABLE_PLUGIN_PACK_ONLY',
    };
    // Publish verified bytes atomically without replacing another candidate.
    await link(packedPath, tarball);
    if (manifestPath) {
      const target = safeAbsolute(manifestPath, 'PLUGIN_PACK_MANIFEST_INVALID');
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const existing = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      assert.ok(!existing || (existing.isFile() && !existing.isSymbolicLink()), 'PLUGIN_PACK_MANIFEST_INVALID');
      await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    }
    return receipt;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const plugin = option('--plugin');
    const outputDir = option('--output-dir');
    assert.ok(plugin && outputDir, 'Usage: node plugin-pack.mjs --plugin /absolute/plugin --output-dir /absolute/output [--manifest /absolute/manifest.json]');
    const receipt = await packPlugin({ plugin, outputDir, manifestPath: option('--manifest') });
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
