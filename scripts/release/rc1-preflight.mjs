#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadProfilePacks } from './profile-packs.mjs';
import baseToolchain from '../../dsh-plugins/plugin-kit/toolchain.json' with { type: 'json' };

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lane = JSON.parse(await readFile(join(root, 'config/dsh-rc1-release-lane.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function option(name, required = true, asPath = true) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (required) throw new Error(`RC1_${name.slice(2).toUpperCase()}_REQUIRED`);
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`RC1_${name.slice(2).toUpperCase()}_REQUIRED`);
  return asPath ? resolve(value) : value;
}

async function extract(archive, destination) {
  await exec('python3', [join(root, 'scripts/release/secure-unpack.py'), archive, destination,
    '--max-entries', '200000', '--max-bytes', String(1024 * 1024 * 1024)], { maxBuffer: 1024 * 1024 });
  const entries = await readdir(destination, { withFileTypes: true });
  const roots = entries.filter(entry => entry.isDirectory()).map(entry => join(destination, entry.name));
  assert.equal(roots.length, 1, 'RC1_SOURCE_ROOT_AMBIGUOUS');
  return roots[0];
}

async function countLfsPointers(directory) {
  let count = 0;
  const paths = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const bytes = await readFile(path).catch(() => null);
      if (bytes && bytes.subarray(0, 43).toString() === 'version https://git-lfs.github.com/spec/v1\n') {
        count += 1;
        paths.push(path.replace(`${directory}/`, ''));
      }
    }
  }
  await walk(directory);
  return { count, paths };
}

async function packChecks(subjectRoot) {
  const manifests = [];
  const toolchain = {
    ...baseToolchain,
    sdk_version: lane.sdk,
    upstream_sha: lane.upstream_sha,
    upstream_pnpm: lane.upstream_pnpm,
    pnpm: lane.plugin_pnpm,
  };
  for (const profile of ['page', 'crm']) {
    const input = JSON.parse(await readFile(join(subjectRoot, profile, 'shinemage-release-pack-inputs.json'), 'utf8'));
    const packs = await loadProfilePacks({
      inputsPath: join(subjectRoot, profile, 'shinemage-release-pack-inputs.json'),
      toolchain,
      requireGeneratedProvenance: true,
    });
    for (const item of packs.plugins) {
      const receipt = item.receipt;
      const provenance = receipt.generated_bytes_provenance;
      manifests.push({
        id: item.id,
        profile,
        profile_sha256: packs.digest,
        inputs_sha256: packs.inputsSha256,
        manifest_sha256: item.manifestSha256,
        pack_sha256: receipt.tarball.sha256,
        pack_bytes: receipt.tarball.bytes,
        package_version: receipt.package_version,
        dsh_pin: receipt.dsh_pin,
        source_sha: receipt.source_sha,
        provenance_schema: provenance?.schema_version,
        provenance_status: provenance?.status,
        builder_node: provenance?.builder?.node,
        builder_pnpm: provenance?.builder?.pnpm,
      });
    }
  }
  return manifests;
}

const sourceArchive = option('--source-archive');
const subjectRoot = option('--subject-root');
const subjectArchive = option('--subject-archive', false);
const subjectArchiveSha = option('--subject-archive-sha256', false, false);
const outputDir = option('--output-dir');
const runtimeBundle = option('--runtime-bundle', false);
const runtimeBundleSha = option('--runtime-bundle-sha256', false, false);
const runtimeProvenance = option('--runtime-provenance', false);
const releaseDir = option('--release-dir', false);
const sourceSha = option('--source-sha', false, false);
const archiveInfo = await stat(sourceArchive);
assert.ok(archiveInfo.isFile() && archiveInfo.size > 0, 'RC1_SOURCE_ARCHIVE_INVALID');
const sourceBytes = await readFile(sourceArchive);
const sourceArchiveSha = sha256(sourceBytes);
const failures = [];
if (sourceSha && sourceSha !== lane.source_identity.source_sha) failures.push('RC1_SOURCE_SHA_MISMATCH');
if (sourceArchiveSha !== lane.source_identity.archive_sha256) failures.push('RC1_SOURCE_ARCHIVE_DIGEST_MISMATCH');
if (subjectArchive || subjectArchiveSha) {
  if (!subjectArchive || !subjectArchiveSha) failures.push('RC1_SUBJECT_ARCHIVE_INPUTS_INCOMPLETE');
  else if (sha256(await readFile(subjectArchive)) !== subjectArchiveSha) failures.push('RC1_SUBJECT_ARCHIVE_DIGEST_MISMATCH');
}

const extraction = await mkdtemp(join(tmpdir(), 'dsh-rc1-preflight-'));
try {
  const sourceRoot = await extract(sourceArchive, join(extraction, 'source'));
  const toolchain = JSON.parse(await readFile(join(sourceRoot, 'dsh-plugins/plugin-kit/toolchain.json'), 'utf8'));
  if (toolchain.sdk_version !== lane.sdk || toolchain.upstream_sha !== lane.upstream_sha) failures.push('RC1_SOURCE_TOOLCHAIN_MISMATCH');
  const lfs = await countLfsPointers(sourceRoot);
  if (lfs.count > 0) failures.push('RC1_SOURCE_LFS_POINTERS_PRESENT');
  const packs = await packChecks(subjectRoot);
  if (packs.length !== 9) failures.push('RC1_PACK_COUNT_INVALID');
  for (const pack of packs) {
    if (pack.dsh_pin !== lane.sdk) failures.push(`RC1_PACK_SDK_MISMATCH:${pack.id}`);
    if (pack.source_sha !== lane.source_identity.source_sha) failures.push(`RC1_PACK_SOURCE_MISMATCH:${pack.id}`);
    if (pack.provenance_schema !== 'dsh-generated-bytes/v1' || pack.provenance_status !== 'PASS') failures.push(`RC1_PACK_PROVENANCE_INVALID:${pack.id}`);
    if (pack.builder_node !== lane.node || pack.builder_pnpm !== lane.plugin_pnpm) failures.push(`RC1_PACK_BUILDER_MISMATCH:${pack.id}`);
  }
  let runtime = { status: 'NOT_PROVIDED' };
  if (runtimeBundle || runtimeProvenance) {
    if (!runtimeBundle || !runtimeProvenance) failures.push('RC1_RUNTIME_INPUTS_INCOMPLETE');
    else {
      const runtimeBytes = await readFile(runtimeBundle);
      if (runtimeBundleSha && sha256(runtimeBytes) !== runtimeBundleSha) failures.push('RC1_RUNTIME_BUNDLE_INPUT_DIGEST_MISMATCH');
      const proof = JSON.parse(await readFile(runtimeProvenance, 'utf8'));
      runtime = { status: proof.status, bundle_sha256: sha256(runtimeBytes), proof_archive_sha256: proof.archive?.sha256, upstream_sha: proof.upstream_sha, builder: proof.builder };
      if (proof.schema_version !== 'dsh-generated-bytes/v1' || proof.status !== 'PASS') failures.push('RC1_RUNTIME_PROVENANCE_INVALID');
      if (proof.upstream_sha !== lane.upstream_sha) failures.push('RC1_RUNTIME_UPSTREAM_MISMATCH');
      if (runtime.bundle_sha256 !== proof.archive?.sha256) failures.push('RC1_RUNTIME_DIGEST_MISMATCH');
    }
  } else failures.push('RC1_RUNTIME_INPUTS_MISSING');
  const releaseAssets = { source_bundle: 'NOT_GENERATED', runtime_bundle: runtime.status === 'PASS' ? 'READY_FOR_MANIFEST' : 'BLOCKED', manifest: 'NOT_GENERATED', sha256sums: 'NOT_GENERATED', provenance: runtime.status === 'PASS' ? 'PASS' : 'BLOCKED' };
  if (releaseDir) {
    const required = ['release-preflight.json', 'pre-manifest.v1.json', 'release-manifest.v1.json', 'SHA256SUMS', 'ci-evidence-index.v1.json'];
    const missing = [];
    for (const name of required) {
      const info = await stat(join(releaseDir, name)).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!info?.isFile() || info.size === 0) missing.push(name);
    }
    if (missing.length) failures.push(`RC1_RELEASE_ASSETS_MISSING:${missing.join(',')}`);
    else {
      const releasePreflight = JSON.parse(await readFile(join(releaseDir, 'release-preflight.json'), 'utf8'));
      if (releasePreflight.status !== 'PASS') failures.push('RC1_RELEASE_PREFLIGHT_INVALID');
      releaseAssets.source_bundle = 'PASS';
      releaseAssets.runtime_bundle = runtime.status === 'PASS' ? 'PASS' : 'BLOCKED';
      releaseAssets.manifest = 'PASS';
      releaseAssets.sha256sums = 'PASS';
      releaseAssets.provenance = runtime.status === 'PASS' ? 'PASS' : 'BLOCKED';
    }
  }
  const report = {
    schema_version: 'shinemage-rc1-preflight/v1',
    status: failures.length ? 'BLOCKED' : 'PASS',
    source: { kind: lane.source_identity.kind, source_sha: lane.source_identity.source_sha, archive: { path: sourceArchive, bytes: sourceBytes.length, sha256: sourceArchiveSha }, lfs_pointer_count: lfs.count, lfs_pointer_paths: lfs.paths.slice(0, 128), tree_sha256: lane.source_identity.tree_sha256 },
    subject_archive: subjectArchive ? { path: subjectArchive, sha256: subjectArchiveSha } : { status: 'NOT_PROVIDED' },
    toolchain: { sdk: lane.sdk, upstream_tag: lane.upstream_tag, upstream_sha: lane.upstream_sha, cordis: lane.cordis, node: lane.node, plugin_pnpm: lane.plugin_pnpm },
    packs: { count: packs.length, status: failures.some(value => value.startsWith('RC1_PACK_')) ? 'BLOCKED' : 'PASS', items: packs },
    runtime,
    formal_status: lane.formal_status,
    release_assets: releaseAssets,
    failures,
  };
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await writeFile(join(outputDir, 'rc1-preflight.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, output: join(outputDir, 'rc1-preflight.json'), failures, lfs_pointer_count: lfs.count, packs: packs.length, runtime: runtime.status, formal_status: lane.formal_status }, null, 2));
  if (failures.length) process.exitCode = 2;
} finally {
  await rm(extraction, { recursive: true, force: true });
}
