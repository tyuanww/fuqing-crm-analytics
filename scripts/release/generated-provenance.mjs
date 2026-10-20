import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const GENERATED_PROVENANCE_SCHEMA = 'dsh-generated-bytes/v1';
const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_SHA = /^[a-f0-9]{40}$/;
const MAX_ENTRIES = 200_000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const digest = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.split('\\').join('/');

function normalizePatterns(patterns = []) {
  return patterns.map(pattern => {
    assert.equal(typeof pattern, 'string', 'TREE_DIGEST_PATTERN_INVALID');
    const value = slash(pattern).replace(/^\.\//, '').replace(/\/$/, '');
    assert.ok(value && !value.startsWith('/') && !value.split('/').includes('..'), 'TREE_DIGEST_PATTERN_INVALID');
    return value;
  });
}

function selected(path, include, exclude) {
  const included = !include.length || include.some(pattern =>
    pattern === path || pattern.startsWith(`${path}/`) || path.startsWith(`${pattern}/`));
  if (!included) return false;
  return !exclude.some(pattern => pattern === path || path.startsWith(`${pattern}/`));
}

/**
 * Hash a filesystem tree using only canonical relative paths and bytes.
 * mtimes, uid/gid and archive metadata are deliberately excluded.
 */
export async function canonicalTreeDigest(root, { include = [], exclude = [], allowSymlinks = false,
  excludeBasenames = [], excludeEntry = null, normalizeSymlinkTargets = false,
  maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES } = {}) {
  const physicalRoot = await realpath(resolve(root));
  const includePatterns = normalizePatterns(include);
  const excludePatterns = normalizePatterns(exclude);
  const excludedNames = new Set(excludeBasenames);
  const records = [];
  let bytes = 0, count = 0;
  async function walk(directory, prefix = '') {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const rel = slash(prefix ? `${prefix}/${entry.name}` : entry.name);
      if (excludedNames.has(entry.name)) continue;
      if (excludeEntry?.({ name: entry.name, path: rel, directory: entry.isDirectory(), symlink: entry.isSymbolicLink() })) continue;
      if (!selected(rel, includePatterns, excludePatterns)) continue;
      if (entry.isSymbolicLink()) {
        assert.ok(allowSymlinks, `TREE_DIGEST_SYMLINK ${rel}`);
        const target = await readlink(path);
        records.push({ path: rel, type: 'symlink', target: normalizeSymlinkTargets
          ? slash(relative(physicalRoot, resolve(directory, target))) : target });
      } else if (entry.isDirectory()) {
        records.push({ path: rel, type: 'directory' });
        await walk(path, rel);
      } else if (entry.isFile()) {
        const info = await lstat(path);
        const content = await readFile(path);
        bytes += content.length;
        assert.ok(bytes <= maxBytes, 'TREE_DIGEST_BYTES_LIMIT');
        records.push({ path: rel, type: 'file', mode: info.mode & 0o777, bytes: content.length, sha256: digest(content) });
      } else {
        throw new Error(`TREE_DIGEST_SPECIAL_FILE ${rel}`);
      }
      assert.ok(++count <= maxEntries, 'TREE_DIGEST_ENTRIES_LIMIT');
    }
  }
  await walk(physicalRoot);
  records.sort((a, b) => a.path.localeCompare(b.path));
  const canonical = `${records.map(record => JSON.stringify(record)).join('\n')}\n`;
  return { sha256: digest(canonical), entries: records.length, bytes, records };
}

export function generatedPaths(files) {
  assert.ok(Array.isArray(files), 'GENERATED_PATHS_INVALID');
  return files.filter(path => path === 'lib' || path.startsWith('lib/') || path === 'bundled-dependencies.json');
}

export async function readProvenanceFile(path) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink(), 'GENERATED_PROVENANCE_FILE_INVALID');
  const bytes = await readFile(path);
  assert.ok(bytes.length > 0 && bytes.length <= 1024 * 1024, 'GENERATED_PROVENANCE_FILE_INVALID');
  return { bytes, value: JSON.parse(bytes.toString('utf8')), sha256: digest(bytes) };
}

export function assertDigest(value, code = 'GENERATED_PROVENANCE_DIGEST_INVALID') {
  assert.match(value ?? '', SHA256, code);
  return value;
}

export function assertSourceSha(value, code = 'GENERATED_PROVENANCE_SOURCE_INVALID') {
  assert.match(value ?? '', SOURCE_SHA, code);
  return value;
}

export function assertTreeShape(value, code = 'GENERATED_PROVENANCE_TREE_INVALID') {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assertDigest(value.sha256, `${code}_SHA`);
  assert.ok(Number.isSafeInteger(value.entries) && value.entries > 0, `${code}_ENTRIES`);
  assert.ok(Number.isSafeInteger(value.bytes) && value.bytes >= 0, `${code}_BYTES`);
  return value;
}

/** Write a builder-side receipt after a plugin's clean build has completed. */
export async function writeBuildProvenance({ root, outputPath = join(root, '.build-provenance.json'),
  command = 'build.mjs', networkMode = process.env.COREPACK_ENABLE_NETWORK === '0' ? 'offline' : 'online',
  toolchain = null, releaseLane = null } = {}) {
  const pluginRoot = resolve(root);
  const sourceSha = (await execFile('git', ['-C', pluginRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 })).stdout.trim();
  assertSourceSha(sourceSha, 'PLUGIN_BUILD_SOURCE_SHA');
  const status = (await execFile('git', ['-C', pluginRoot, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8', timeout: 5000 })).stdout.trim();
  assert.equal(status, '', 'PLUGIN_BUILD_SOURCE_DIRTY');
  const manifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'));
  const sourceTree = await canonicalTreeDigest(pluginRoot, {
    exclude: ['.git', 'node_modules', 'lib', 'bundled-dependencies.json', '.build-provenance.json', 'build-provenance.json'],
    allowSymlinks: false,
  });
  const generatedTree = await canonicalTreeDigest(pluginRoot, {
    include: generatedPaths(manifest.files), allowSymlinks: false,
  });
  const pnpm = (await execFile('pnpm', ['--version'], { cwd: pluginRoot, encoding: 'utf8', timeout: 15000 })).stdout.trim();
  const clean = process.env.SHINEMAGE_CLEAN_BUILDER === '1';
  const receipt = {
    schema_version: 'dsh-plugin-build/v1', status: clean ? 'PASS' : 'NOT_VERIFIED',
    source: { git_sha: sourceSha, tree_sha256: sourceTree.sha256, entries: sourceTree.entries, bytes: sourceTree.bytes },
    generated_tree: { sha256: generatedTree.sha256, entries: generatedTree.entries, bytes: generatedTree.bytes },
    generated_files: generatedTree.records.filter(record => record.type === 'file'),
    ...(toolchain ? { toolchain: {
      sdk_version: toolchain.sdk_version,
      upstream_sha: toolchain.upstream_sha,
      upstream_lock_sha256: toolchain.upstream_lock_sha256,
      node_major: toolchain.node_major,
      pnpm: toolchain.pnpm,
      upstream_pnpm: toolchain.upstream_pnpm,
      cordis: toolchain.cordis,
      typescript: toolchain.typescript,
      esbuild: toolchain.esbuild,
      react: toolchain.react,
      react_types: toolchain.react_types,
      node_types: toolchain.node_types,
      release_lane: releaseLane,
    } } : {}),
    builder: { status: clean ? 'PASS' : 'NOT_VERIFIED', clean, isolated: clean,
      node: process.version, pnpm, platform: process.platform, arch: process.arch, command, network_mode: networkMode },
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return receipt;
}
