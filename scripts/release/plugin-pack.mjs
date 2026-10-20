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
import { tmpdir } from 'node:os';
import { DSH_SDK_VERSION, PNPM_VERSION } from './toolchain.mjs';
import { assertClean, scanTree } from './secret-scan.mjs';
import { readArtifactFile, insideArtifact } from './service-artifact-evidence.mjs';
import { GENERATED_PROVENANCE_SCHEMA, assertSourceSha, assertTreeShape,
  canonicalTreeDigest, generatedPaths, readProvenanceFile } from './generated-provenance.mjs';

const exec = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;
const MAX_PACK_BYTES = 20 * 1024 * 1024;

function matchesPattern(path, pattern, code = 'PLUGIN_PACK_PATTERN_INVALID') {
  assert.equal((pattern.match(/\*/g) ?? []).length, 1, `${code} ${pattern}`);
  const slash = pattern.lastIndexOf('/');
  assert.ok(
    slash > 0
      && !pattern.slice(0, slash + 1).includes('*')
      && !pattern.slice(slash + 1).includes('/'),
    `${code} ${pattern}`,
  );
  const directory = pattern.slice(0, slash + 1);
  const suffix = pattern.slice(slash + 1);
  const star = suffix.indexOf('*');
  const head = `${directory}${suffix.slice(0, star)}`;
  const tail = suffix.slice(star + 1);
  return path.startsWith(head) && path.endsWith(tail)
    && !path.slice(head.length, path.length - tail.length).includes('/');
}

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
    assert.ok(SAFE_RELATIVE.test(entry) && !entry.split('/').includes('.'), `PLUGIN_PACK_ENTRY_INVALID ${target}`);
    const present = entry.includes('*') ? files.some(file => matchesPattern(file, entry)) : files.includes(entry);
    assert.ok(present, `PLUGIN_PACK_ENTRY_MISSING ${target}`);
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
  if (files.some(entry => entry.includes('*') && matchesPattern(path, entry))) return true;
  return files.some(entry => entry.endsWith('/') && path.startsWith(entry));
}

function isConfigurationBundle(manifest) {
  return manifest.shinemage?.bundle_role === 'configuration-bundle';
}

async function assertConfigurationBundleRuntime(root, manifest, files) {
  if (!isConfigurationBundle(manifest)) return;
  const toolImport = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]@deepseek-ai\/dsh-tools(?:\/[^'"]*)?['"]/;
  for (const file of files.filter(path => /\.[cm]?js$/.test(path))) {
    const source = await readFile(join(root, file), 'utf8');
    assert.doesNotMatch(source, toolImport, `PLUGIN_PACK_CONFIGURATION_BUNDLE_TOOL_IMPORT ${file}`);
  }
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
    if (declaredPath.includes('*')) {
      const slash = declaredPath.lastIndexOf('/');
      matchesPattern('', declaredPath, 'PLUGIN_PACK_PATTERN_SCOPE');
      const directory = declaredPath.slice(0, slash);
      const directoryPath = join(root, directory);
      const directoryInfo = await lstat(directoryPath);
      assert.ok(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink(), `PLUGIN_PACK_DECLARED_MISSING ${declaredPath}`);
      await canonicalInside(rootReal, directoryPath, `PLUGIN_PACK_PATH_ESCAPE ${directory}`);
      let matched = 0;
      for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
        const rel = `${directory}/${entry.name}`;
        if (!matchesPattern(rel, declaredPath)) continue;
        assert.ok(entry.isFile(), `PLUGIN_PACK_SPECIAL_FILE ${rel}`);
        await canonicalInside(rootReal, join(root, rel), `PLUGIN_PACK_PATH_ESCAPE ${rel}`);
        files.push(rel);
        matched += 1;
      }
      assert.ok(matched > 0, `PLUGIN_PACK_DECLARED_MISSING ${declaredPath}`);
      continue;
    }
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

function inspectManifest(manifest, packed = false, { sdkVersion = DSH_SDK_VERSION, pnpmVersion = PNPM_VERSION } = {}) {
  assert.match(manifest.name, /^@(shine-mage|deepseek-ai)\/[a-z0-9][a-z0-9-]+$/, 'PLUGIN_PACK_NAME_INVALID');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'PLUGIN_PACK_VERSION_INVALID');
  assert.equal(manifest.type, 'module', 'PLUGIN_PACK_TYPE_INVALID');
  if (!packed || manifest.packageManager !== undefined) {
    assert.equal(manifest.packageManager, `pnpm@${pnpmVersion}`, 'PLUGIN_PACK_PACKAGE_MANAGER_INVALID');
  }
  if (packed) assert.equal(manifest.scripts, undefined, 'PLUGIN_PACK_LIFECYCLE_FORBIDDEN');
  if (isConfigurationBundle(manifest)) {
    for (const field of ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies']) {
      assert.equal(manifest[field]?.['@deepseek-ai/dsh-tools'], undefined,
        'PLUGIN_PACK_CONFIGURATION_BUNDLE_TOOL_DEPENDENCY');
    }
  } else {
    assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'], sdkVersion, 'PLUGIN_PACK_DSH_PEER_INVALID');
  }
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
  return declared;
}

async function inspectPackage(pluginRoot, compatibility = {}) {
  const manifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'));
  const declared = inspectManifest(manifest, false, compatibility);
  const declaredFiles = await collectFiles(pluginRoot, declared);
  assert.ok(declaredFiles.some(file => file.startsWith('lib/')), 'PLUGIN_PACK_BUILD_OUTPUT_REQUIRED');
  await assertConfigurationBundleRuntime(pluginRoot, manifest, declaredFiles);
  return { manifest, declared, declaredFiles };
}

async function currentBuildBytes(pluginRoot, inspected) {
  const sourceTree = await canonicalTreeDigest(pluginRoot, {
    exclude: ['.git', 'node_modules', 'lib', 'bundled-dependencies.json', '.build-provenance.json', 'build-provenance.json'],
    allowSymlinks: false,
  });
  const generatedTree = await canonicalTreeDigest(pluginRoot, {
    include: generatedPaths(inspected.declaredFiles),
    allowSymlinks: false,
  });
  return { sourceTree, generatedTree };
}

async function verifyBuilderProvenance(pluginRoot, inspected, source, builderProvenancePath, { required = false } = {}) {
  if (!builderProvenancePath) {
    assert.ok(!required, 'PLUGIN_PACK_BUILD_PROVENANCE_REQUIRED');
    const current = await currentBuildBytes(pluginRoot, inspected);
    return { status: 'NOT_VERIFIED', schema_version: GENERATED_PROVENANCE_SCHEMA,
      source: { git_sha: source.sha, sha256: current.sourceTree.sha256, entries: current.sourceTree.entries, bytes: current.sourceTree.bytes },
      generated_tree: { sha256: current.generatedTree.sha256, entries: current.generatedTree.entries, bytes: current.generatedTree.bytes, records: current.generatedTree.records },
      builder: { status: 'NOT_VERIFIED', clean: false, isolated: false }, builder_receipt_sha256: null };
  }
  const verified = await readProvenanceFile(safeAbsolute(builderProvenancePath, 'PLUGIN_PACK_BUILD_PROVENANCE_PATH_INVALID'));
  const proof = verified.value;
  assert.equal(proof.schema_version, 'dsh-plugin-build/v1', 'PLUGIN_PACK_BUILD_PROVENANCE_SCHEMA');
  assert.equal(proof.status, 'PASS', 'PLUGIN_PACK_BUILD_PROVENANCE_STATUS');
  assertSourceSha(proof.source?.git_sha, 'PLUGIN_PACK_BUILD_SOURCE_SHA');
  assert.equal(proof.source.git_sha, source.sha, 'PLUGIN_PACK_BUILD_SOURCE_SHA_MISMATCH');
  assertTreeShape({ ...proof.source, sha256: proof.source.tree_sha256 }, 'PLUGIN_PACK_BUILD_SOURCE_TREE');
  assertTreeShape(proof.generated_tree, 'PLUGIN_PACK_BUILD_GENERATED_TREE');
  assert.equal(proof.builder?.clean, true, 'PLUGIN_PACK_BUILD_NOT_CLEAN');
  assert.equal(proof.builder?.isolated, true, 'PLUGIN_PACK_BUILD_NOT_ISOLATED');
  assert.equal(proof.builder?.status, 'PASS', 'PLUGIN_PACK_BUILD_BUILDER_STATUS');
  assert.match(proof.builder?.node ?? '', /^v?\d+\.\d+\.\d+$/, 'PLUGIN_PACK_BUILD_NODE');
  assert.equal(Number(proof.builder.node.replace(/^v/, '').split('.')[0]), 24, 'PLUGIN_PACK_BUILD_NODE_MAJOR');
  assert.equal(proof.builder?.pnpm, PNPM_VERSION, 'PLUGIN_PACK_BUILD_PNPM');
  const current = await currentBuildBytes(pluginRoot, inspected);
  assert.equal(current.sourceTree.sha256, proof.source.tree_sha256, 'PLUGIN_PACK_SOURCE_TREE_MISMATCH');
  assert.equal(current.generatedTree.sha256, proof.generated_tree.sha256, 'PLUGIN_PACK_GENERATED_TREE_MISMATCH');
  assert.equal(current.generatedTree.entries, proof.generated_tree.entries, 'PLUGIN_PACK_GENERATED_TREE_ENTRIES');
  assert.equal(current.generatedTree.bytes, proof.generated_tree.bytes, 'PLUGIN_PACK_GENERATED_TREE_BYTES');
  return {
    ...proof,
    schema_version: GENERATED_PROVENANCE_SCHEMA,
    source: { ...proof.source, sha256: proof.source.tree_sha256 },
    builder_receipt_schema_version: proof.schema_version,
    builder_receipt_sha256: verified.sha256,
  };
}

/** Consume an explicitly pinned formal pack, without source checkout or pnpm. */
export async function readPluginPack({ manifestPath, expectedSha256, expectedSdkVersion = DSH_SDK_VERSION,
  expectedPnpmVersion = PNPM_VERSION, requireGeneratedProvenance = false } = {}) {
  const path = safeAbsolute(manifestPath, 'PLUGIN_PACK_MANIFEST_INVALID');
  assert.match(expectedSha256 ?? '', SHA256, 'PLUGIN_PACK_MANIFEST_DIGEST_REQUIRED');
  const manifestBytes = await readArtifactFile(path, 256 * 1024);
  assert.equal(digest(manifestBytes), expectedSha256, 'PLUGIN_PACK_MANIFEST_DIGEST_MISMATCH');
  const receipt = JSON.parse(manifestBytes);
  assert.equal(receipt.schema_version, 'dsh-plugin-pack/v1', 'PLUGIN_PACK_SCHEMA');
  assert.match(receipt.package_name ?? '', /^@(shine-mage|deepseek-ai)\/[a-z0-9][a-z0-9-]+$/, 'PLUGIN_PACK_NAME_INVALID');
  assert.match(receipt.package_version ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'PLUGIN_PACK_VERSION_INVALID');
  assert.equal(receipt.dsh_pin, expectedSdkVersion, 'PLUGIN_PACK_DSH_PEER_INVALID');
  assert.match(receipt.source_sha ?? '', /^[a-f0-9]{40}$/, 'PLUGIN_PACK_GIT_SHA_INVALID');
  assert.equal(receipt.source_dirty, false, 'PLUGIN_PACK_SOURCE_DIRTY');
  const provenance = receipt.generated_bytes_provenance;
  if (requireGeneratedProvenance) assert.ok(provenance, 'PLUGIN_PACK_BUILD_PROVENANCE_REQUIRED');
  if (provenance) {
    assert.equal(provenance.schema_version, GENERATED_PROVENANCE_SCHEMA, 'PLUGIN_PACK_BUILD_PROVENANCE_SCHEMA');
    if (requireGeneratedProvenance) assert.equal(provenance.status, 'PASS', 'PLUGIN_PACK_BUILD_PROVENANCE_STATUS');
    assertTreeShape(provenance.source, 'PLUGIN_PACK_BUILD_SOURCE_TREE');
    assertTreeShape(provenance.generated_tree, 'PLUGIN_PACK_BUILD_GENERATED_TREE');
    assert.ok(provenance.builder && typeof provenance.builder === 'object', 'PLUGIN_PACK_BUILD_BUILDER');
    assert.equal(provenance.builder.clean, provenance.status === 'PASS', 'PLUGIN_PACK_BUILD_CLEAN_FLAG');
    if (provenance.status === 'PASS') {
      assertSourceSha(provenance.source.git_sha, 'PLUGIN_PACK_BUILD_SOURCE_SHA');
      assert.equal(provenance.source.git_sha, receipt.source_sha, 'PLUGIN_PACK_BUILD_SOURCE_SHA_MISMATCH');
      assert.equal(provenance.builder.isolated, true, 'PLUGIN_PACK_BUILD_NOT_ISOLATED');
      assert.equal(provenance.builder.pnpm, expectedPnpmVersion, 'PLUGIN_PACK_BUILD_PNPM');
      assert.match(provenance.builder_receipt_sha256 ?? '', SHA256, 'PLUGIN_PACK_BUILD_RECEIPT_DIGEST');
    }
  }
  assert.equal(receipt.activation, 'NOT_RUN', 'PLUGIN_PACK_ALREADY_ACTIVE');
  assert.equal(receipt.state_path, 'NOT_APPLICABLE_PLUGIN_PACK_ONLY', 'PLUGIN_PACK_STATE_SCOPE');
  const pack = receipt.tarball;
  assert.equal(pack?.name, `${receipt.package_name.slice(1).replaceAll('/', '-')}-${receipt.package_version}.tgz`, 'PLUGIN_PACK_TARBALL_NAME');
  assert.match(pack.sha256 ?? '', SHA256, 'PLUGIN_PACK_DIGEST_INVALID');
  assert.ok(Number.isSafeInteger(pack.bytes) && pack.bytes > 0 && pack.bytes <= MAX_PACK_BYTES, 'PLUGIN_PACK_TARBALL_INVALID');
  assert.ok(Array.isArray(receipt.entries) && receipt.entries.length > 0, 'PLUGIN_PACK_ENTRIES_REQUIRED');
  assert.ok(receipt.entries.every(entry => typeof entry === 'string'), 'PLUGIN_PACK_ENTRY_INVALID');
  assert.equal(new Set(receipt.entries).size, receipt.entries.length, 'PLUGIN_PACK_FILES_DUPLICATE');
  const archive = await insideArtifact(dirname(path), pack.name, MAX_PACK_BYTES);
  assert.equal(archive.length, pack.bytes, 'PLUGIN_PACK_SIZE_MISMATCH');
  assert.equal(digest(archive), pack.sha256, 'PLUGIN_PACK_DIGEST_MISMATCH');
  const work = await mkdtemp(join(tmpdir(), 'plugin-pack-receive-'));
  try {
    // Inspect the hashed bytes, never re-read the caller's mutable archive.
    const tar = join(work, 'package.tgz'), unpacked = join(work, 'unpacked');
    await writeFile(tar, archive, { mode: 0o600, flag: 'wx' });
    await exec('python3', [fileURLToPath(new URL('./secure-unpack.py', import.meta.url)), tar, unpacked,
      '--max-entries', '10000', '--max-bytes', String(MAX_PACK_BYTES)], { cwd: work, timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(unpacked), ['package'], 'PLUGIN_PACK_ARCHIVE_ROOT_INVALID');
    const packageRoot = join(unpacked, 'package');
    const manifest = JSON.parse(await insideArtifact(packageRoot, 'package.json', 256 * 1024));
    assert.equal(manifest.name, receipt.package_name, 'PLUGIN_PACK_PACKAGE_NAME_MISMATCH');
    assert.equal(manifest.version, receipt.package_version, 'PLUGIN_PACK_PACKAGE_VERSION_MISMATCH');
    const declared = inspectManifest(manifest, true, { sdkVersion: expectedSdkVersion, pnpmVersion: expectedPnpmVersion }), entries = [];
    async function walk(directory, prefix = '') {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const rel = prefix + entry.name;
        assert.ok(!/(?:^|\/)(?:src|test|tests|node_modules|\.git)(?:\/|$)/.test(rel) && !rel.endsWith('.map'), 'PLUGIN_PACK_SOURCE_PATH');
        if (entry.isDirectory()) await walk(join(directory, entry.name), rel + '/');
        else {
          assert.ok(entry.isFile(), 'PLUGIN_PACK_SPECIAL_FILE');
          assert.ok(packageFileAllowed(rel, declared), 'PLUGIN_PACK_TARBALL_UNDECLARED');
          entries.push(rel);
        }
      }
    }
    await walk(packageRoot);
    assert.deepEqual(entries.sort(), [...receipt.entries].sort(), 'PLUGIN_PACK_ENTRY_SET_MISMATCH');
    await assertConfigurationBundleRuntime(packageRoot, manifest, entries);
    // Declared assets, exports and patches must all be present in the archive.
    assert.ok((await collectFiles(packageRoot, declared)).some(file => file.startsWith('lib/')), 'PLUGIN_PACK_BUILD_OUTPUT_REQUIRED');
    verifyEntrypoints(manifest, entries);
    assertClean(await scanTree(packageRoot, { maxBytes: MAX_PACK_BYTES, allowSyntheticFixtures: false }));
    if (provenance?.status === 'PASS') {
      const generatedTree = await canonicalTreeDigest(packageRoot, { include: generatedPaths(declared), allowSymlinks: false });
      assert.equal(generatedTree.sha256, provenance.generated_tree.sha256, 'PLUGIN_PACK_GENERATED_TREE_MISMATCH');
      assert.equal(generatedTree.entries, provenance.generated_tree.entries, 'PLUGIN_PACK_GENERATED_TREE_ENTRIES');
      assert.equal(generatedTree.bytes, provenance.generated_tree.bytes, 'PLUGIN_PACK_GENERATED_TREE_BYTES');
    }
    return { receipt, manifestBytes, archive, manifest };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
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
    const root = await realpath((await exec('git', ['-C', pluginRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 3000 })).stdout.trim());
    const sha = (await exec('git', ['-C', pluginRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 3000 })).stdout.trim();
    const physicalPluginRoot = await realpath(pluginRoot);
    const pluginRelative = relative(root, physicalPluginRoot).split(sep).join('/');
    assert.ok(!pluginRelative.startsWith('../') && pluginRelative !== '..' && !pluginRelative.startsWith('/'), 'PLUGIN_PACK_SOURCE_OUTSIDE_REPO');
    const manifestRelative = pluginRelative ? `${pluginRelative}/package.json` : 'package.json';
    // Ignored copies can have an empty status; require a manifest in the recorded commit.
    const headManifest = (await exec('git', ['show', `${sha}:${manifestRelative}`], {
      cwd: root, encoding: 'utf8', timeout: 3000, maxBuffer: 256 * 1024,
    })).stdout;
    const sourceManifest = (await readFile(join(pluginRoot, 'package.json'))).toString('utf8');
    assert.equal(sourceManifest, headManifest, 'PLUGIN_PACK_SOURCE_MANIFEST_MISMATCH');
    const status = (await exec('git', ['--literal-pathspecs', 'status', '--porcelain', '--untracked-files=all', '--', pluginRelative || '.'], {
      cwd: root, encoding: 'utf8', timeout: 3000,
    })).stdout.trim();
    assert.match(sha, /^[0-9a-f]{40}$/, 'PLUGIN_PACK_GIT_SHA_INVALID');
    assert.equal(status, '', 'PLUGIN_PACK_SOURCE_DIRTY');
    return { root, sha, dirty: false };
  } catch (error) {
    throw new Error(`PLUGIN_PACK_GIT_METADATA_REQUIRED ${String(error?.stderr ?? error?.message ?? error).slice(0, 240)}`);
  }
}

export async function packPlugin({ plugin, outputDir, manifestPath, builderProvenancePath = null,
  requireGeneratedProvenance = Boolean(builderProvenancePath), sdkVersion = DSH_SDK_VERSION,
  pnpmVersion = PNPM_VERSION }) {
  const pluginRoot = safeAbsolute(plugin, 'PLUGIN_PACK_ROOT_INVALID');
  const destination = safeAbsolute(outputDir, 'PLUGIN_PACK_OUTPUT_INVALID');
  const pluginInfo = await lstat(pluginRoot).catch(error => { throw new Error(`PLUGIN_PACK_ROOT_INVALID ${error.code ?? 'unavailable'}`); });
  assert.ok(pluginInfo.isDirectory() && !pluginInfo.isSymbolicLink(), 'PLUGIN_PACK_ROOT_INVALID');
  await access(join(pluginRoot, 'package.json'));
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const destinationInfo = await lstat(destination);
  assert.ok(destinationInfo.isDirectory() && !destinationInfo.isSymbolicLink(), 'PLUGIN_PACK_OUTPUT_INVALID');
  const compatibility = { sdkVersion, pnpmVersion };
  const inspected = await inspectPackage(pluginRoot, compatibility);
  const source = await gitMetadata(pluginRoot);
  const provenance = await verifyBuilderProvenance(pluginRoot, inspected, source, builderProvenancePath, { required: requireGeneratedProvenance });
  const expectedName = `${inspected.manifest.name.slice(1).replaceAll('/', '-')}-${inspected.manifest.version}.tgz`;
  const tarball = join(destination, expectedName);
  try { await access(tarball); throw new Error('PLUGIN_PACK_OUTPUT_EXISTS'); } catch (error) {
    if (error.message === 'PLUGIN_PACK_OUTPUT_EXISTS') throw error;
    assert.equal(error.code, 'ENOENT', 'PLUGIN_PACK_OUTPUT_UNAVAILABLE');
  }
  const work = await mkdtemp(join(destination, '.plugin-pack-'));
  try {
    const staging = await stagePackInput(pluginRoot, inspected, join(work, 'input'));
    const actualPnpm = (await exec('pnpm', ['--version'], { cwd: staging, encoding: 'utf8', timeout: 15000 })).stdout.trim();
    assert.equal(actualPnpm, pnpmVersion, 'PLUGIN_PACK_PNPM_VERSION');
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
    const generatedBytesProvenance = {
      ...provenance,
      tarball: { name: basename(tarball), bytes: info.size, sha256: packDigest },
    };
    const receipt = {
      schema_version: 'dsh-plugin-pack/v1',
      package_name: inspected.manifest.name,
      package_version: inspected.manifest.version,
      dsh_pin: sdkVersion,
      source_sha: source.sha,
      source_dirty: source.dirty,
      tarball: { name: basename(tarball), bytes: info.size, sha256: packDigest },
      generated_bytes_provenance: generatedBytesProvenance,
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
    const builderProvenancePath = option('--builder-receipt');
    const receipt = await packPlugin({ plugin, outputDir, manifestPath: option('--manifest'), builderProvenancePath });
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
