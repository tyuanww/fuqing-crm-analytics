#!/usr/bin/env node

/** Read a fixed domain-library pack without loading the author checkout. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { canonicalTreeDigest, generatedPaths } from './generated-provenance.mjs';

const exec = promisify(execFile);
const DOMAIN_PACK_SCHEMA = 'shinemage-domain-pack/v1';
const GENERATED_SCHEMA = 'dsh-generated-bytes/v1';
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PACKAGE = /^@shine-mage\/[a-z0-9][a-z0-9-]+$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REPOSITORY = /^tyuanww\/(?:shinemage-[a-z][a-z0-9-]*|dsh-[a-z][a-z0-9-]*)$/;
const MAX_BYTES = 20 * 1024 * 1024;
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

function absolute(value, code) {
  assert.ok(typeof value === 'string' && isAbsolute(value) && !value.includes('..'), code);
  return resolve(value);
}

function assertTree(value, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.match(value.sha256 ?? '', SHA256, `${code}_SHA`);
  assert.ok(Number.isSafeInteger(value.entries) && value.entries > 0, `${code}_ENTRIES`);
  assert.ok(Number.isSafeInteger(value.bytes) && value.bytes >= 0, `${code}_BYTES`);
}

function assertProvenance(value, sourceSha) {
  assert.equal(value?.schema_version, GENERATED_SCHEMA, 'DOMAIN_PACK_PROVENANCE_SCHEMA');
  assert.equal(value.status, 'PASS', 'DOMAIN_PACK_PROVENANCE_STATUS');
  assert.equal(value.source?.git_sha, sourceSha, 'DOMAIN_PACK_PROVENANCE_SOURCE_SHA');
  assertTree(value.source, 'DOMAIN_PACK_PROVENANCE_SOURCE_TREE');
  assertTree(value.generated_tree, 'DOMAIN_PACK_PROVENANCE_GENERATED_TREE');
  assert.equal(value.builder?.status, 'PASS', 'DOMAIN_PACK_PROVENANCE_BUILDER_STATUS');
  assert.equal(value.builder?.clean, true, 'DOMAIN_PACK_PROVENANCE_BUILDER_CLEAN');
  assert.equal(value.builder?.isolated, true, 'DOMAIN_PACK_PROVENANCE_BUILDER_ISOLATED');
  assert.equal(value.builder?.pnpm, '11.28.2', 'DOMAIN_PACK_PROVENANCE_PNPM');
}

function packageFileAllowed(path, files) {
  if (path === 'package.json' || /^(?:README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?)$/.test(path)) return true;
  if (files.includes(path)) return true;
  return files.some(entry => entry.endsWith('/') && path.startsWith(entry));
}

function verifyEntrypoints(manifest, files) {
  const targets = [];
  function collect(value) {
    if (value === null) return;
    if (typeof value === 'string') { targets.push(value); return; }
    assert.ok(value && typeof value === 'object', 'DOMAIN_PACK_EXPORT_INVALID');
    for (const child of Object.values(value)) collect(child);
  }
  if (manifest.exports !== undefined) collect(manifest.exports);
  for (const value of [manifest.main, manifest.module]) if (value !== undefined) targets.push(value);
  for (const target of targets) {
    assert.equal(typeof target, 'string', 'DOMAIN_PACK_ENTRY_INVALID');
    const entry = target.replace(/^\.\//, '');
    assert.ok(SAFE_RELATIVE.test(entry) && !entry.includes('*') && !entry.split('/').includes('.'), `DOMAIN_PACK_ENTRY_INVALID ${target}`);
    assert.ok(files.includes(entry), `DOMAIN_PACK_ENTRY_MISSING ${target}`);
  }
}

function inspectPackageManifest(manifest) {
  assert.equal(manifest.private, true, 'DOMAIN_PACK_PACKAGE_PRIVATE');
  assert.equal(manifest.type, 'module', 'DOMAIN_PACK_PACKAGE_TYPE');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'DOMAIN_PACK_FILES_REQUIRED');
  assert.equal(new Set(manifest.files).size, manifest.files.length, 'DOMAIN_PACK_FILES_DUPLICATE');
  for (const path of manifest.files) {
    assert.ok(SAFE_RELATIVE.test(path), `DOMAIN_PACK_FILE_PATH_INVALID ${path}`);
    assert.ok(!/(?:^|\/)(?:src|test|tests|node_modules)(?:\/|$)/.test(path) && !path.endsWith('.map'), `DOMAIN_PACK_SOURCE_PATH ${path}`);
  }
  return manifest.files;
}

async function unpackArchive(archive, work) {
  const tar = join(work, 'input.tgz'), extracted = join(work, 'extracted');
  await writeFile(tar, archive, { mode: 0o600, flag: 'wx' });
  await exec('python3', [fileURLToPath(new URL('./secure-unpack.py', import.meta.url)), tar, extracted,
    '--max-entries', '10000', '--max-bytes', String(MAX_BYTES)], { cwd: work, timeout: 30000 });
  assert.deepEqual(await readdir(extracted), ['package'], 'DOMAIN_PACK_ARCHIVE_ROOT');
  return join(extracted, 'package');
}

/** Validate the exact manifest and tarball bytes for a domain library. */
export async function readDomainPack({ manifestPath, expectedSha256, expectedSourceSha,
  expectedPackage = '@shine-mage/board-components', requireGeneratedProvenance = true } = {}) {
  const path = absolute(manifestPath, 'DOMAIN_PACK_MANIFEST_REQUIRED');
  const bytes = await readFile(path);
  assert.match(expectedSha256 ?? '', SHA256, 'DOMAIN_PACK_MANIFEST_DIGEST_REQUIRED');
  assert.equal(digest(bytes), expectedSha256, 'DOMAIN_PACK_MANIFEST_DIGEST');
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.schema_version, DOMAIN_PACK_SCHEMA, 'DOMAIN_PACK_SCHEMA');
  assert.equal(receipt.package_name, expectedPackage, 'DOMAIN_PACK_PACKAGE');
  assert.match(receipt.package_name ?? '', PACKAGE, 'DOMAIN_PACK_PACKAGE_NAME');
  assert.match(receipt.package_version ?? '', VERSION, 'DOMAIN_PACK_VERSION');
  assert.match(receipt.repository ?? '', REPOSITORY, 'DOMAIN_PACK_REPOSITORY');
  assert.match(receipt.source_sha ?? '', SHA1, 'DOMAIN_PACK_SOURCE_SHA');
  if (expectedSourceSha) assert.equal(receipt.source_sha, expectedSourceSha, 'DOMAIN_PACK_SOURCE_SHA_MISMATCH');
  assert.equal(receipt.source_dirty, false, 'DOMAIN_PACK_SOURCE_DIRTY');
  const provenance = receipt.generated_bytes_provenance;
  if (requireGeneratedProvenance) assert.ok(provenance, 'DOMAIN_PACK_PROVENANCE_REQUIRED');
  if (provenance) assertProvenance(provenance, receipt.source_sha);
  assert.ok(Array.isArray(receipt.entries) && receipt.entries.length > 0, 'DOMAIN_PACK_ENTRIES_REQUIRED');
  assert.ok(receipt.entries.every(entry => typeof entry === 'string' && SAFE_RELATIVE.test(entry)), 'DOMAIN_PACK_ENTRY_INVALID');
  assert.equal(new Set(receipt.entries).size, receipt.entries.length, 'DOMAIN_PACK_ENTRIES_DUPLICATE');
  const tarball = receipt.tarball;
  assert.equal(tarball?.name, `${receipt.package_name.slice(1).replaceAll('/', '-')}-${receipt.package_version}.tgz`, 'DOMAIN_PACK_TARBALL_NAME');
  assert.match(tarball.sha256 ?? '', SHA256, 'DOMAIN_PACK_TARBALL_SHA');
  assert.ok(Number.isSafeInteger(tarball.bytes) && tarball.bytes > 0 && tarball.bytes <= MAX_BYTES, 'DOMAIN_PACK_TARBALL_BYTES');
  const archivePath = join(dirname(path), tarball.name);
  const archiveInfo = await lstat(archivePath);
  assert.ok(archiveInfo.isFile() && !archiveInfo.isSymbolicLink(), 'DOMAIN_PACK_TARBALL_FILE');
  const archive = await readFile(archivePath);
  assert.equal(archive.length, tarball.bytes, 'DOMAIN_PACK_TARBALL_SIZE');
  assert.equal(digest(archive), tarball.sha256, 'DOMAIN_PACK_TARBALL_DIGEST');
  const work = await mkdtemp(join(tmpdir(), 'domain-pack-receive-'));
  try {
    const packageRoot = await unpackArchive(archive, work);
    const packageManifest = JSON.parse(await readFile(join(packageRoot, 'package.json')));
    assert.equal(packageManifest.name, receipt.package_name, 'DOMAIN_PACK_PACKAGE_NAME_MISMATCH');
    assert.equal(packageManifest.version, receipt.package_version, 'DOMAIN_PACK_PACKAGE_VERSION_MISMATCH');
    const declared = inspectPackageManifest(packageManifest);
    const entries = [];
    async function walk(directory, prefix = '') {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relative = `${prefix}${entry.name}`;
        assert.ok(!entry.isSymbolicLink(), `DOMAIN_PACK_SYMLINK ${relative}`);
        if (entry.isDirectory()) await walk(join(directory, entry.name), `${relative}/`);
        else {
          assert.ok(entry.isFile(), `DOMAIN_PACK_SPECIAL_FILE ${relative}`);
          assert.ok(packageFileAllowed(relative, declared), `DOMAIN_PACK_TARBALL_UNDECLARED ${relative}`);
          entries.push(relative);
        }
      }
    }
    await walk(packageRoot);
    assert.deepEqual(entries.sort(), [...receipt.entries].sort(), 'DOMAIN_PACK_ENTRIES');
    verifyEntrypoints(packageManifest, entries);
    if (provenance?.status === 'PASS') {
      const generatedTree = await canonicalTreeDigest(packageRoot, { include: generatedPaths(declared), allowSymlinks: false });
      assert.equal(generatedTree.sha256, provenance.generated_tree.sha256, 'DOMAIN_PACK_GENERATED_TREE_MISMATCH');
      assert.equal(generatedTree.entries, provenance.generated_tree.entries, 'DOMAIN_PACK_GENERATED_TREE_ENTRIES');
      assert.equal(generatedTree.bytes, provenance.generated_tree.bytes, 'DOMAIN_PACK_GENERATED_TREE_BYTES');
      const generated = generatedTree.records.filter(record => record.type === 'file')
        .map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
      const proven = (provenance.generated_files ?? []).map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
        .sort((a, b) => a.path.localeCompare(b.path));
      assert.deepEqual(proven, generated.sort((a, b) => a.path.localeCompare(b.path)), 'DOMAIN_PACK_GENERATED_FILE_DIGEST');
    }
    return { receipt, manifestBytes: bytes, archive, packageManifest };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
const modulePath = await realpath(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === modulePath) {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log('Usage: node scripts/release/domain-pack.mjs --manifest PATH --manifest-sha256 SHA256 --source-sha SHA1');
      process.exit(0);
    }
    const manifestPath = process.argv[process.argv.indexOf('--manifest') + 1];
    const expectedSha256 = process.argv[process.argv.indexOf('--manifest-sha256') + 1];
    const expectedSourceSha = process.argv[process.argv.indexOf('--source-sha') + 1];
    const result = await readDomainPack({ manifestPath, expectedSha256, expectedSourceSha });
    console.log(json({ package_name: result.receipt.package_name, source_sha: result.receipt.source_sha,
      manifest_sha256: expectedSha256, tarball: result.receipt.tarball, release_ready: false }));
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
