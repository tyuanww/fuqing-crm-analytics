#!/usr/bin/env node
/** Verified preparation cache for the B0 contract job.
 *
 * `--prepare` is deterministic over the pinned upstream SHA, the two pnpm
 * closures, the pinned managers and this repository's prepare script closure.
 * This module owns the three operations that make that closure safe to cache:
 *
 *   --key     print the exact cache key derived from every prepare input.
 *   --guard   after `actions/cache/restore`: verify the restored bytes with the
 *             same checks a fresh preparation goes through.  On any mismatch
 *             remove only the restored preparation and exit 0 so the workflow
 *             falls back to a full cold `pipeline.mjs --prepare`; a failure to
 *             remove the restored bytes exits non-zero (fail closed).
 *   --verify  after a cold or fallback `--prepare`: verify the closure before
 *             it is saved.  Any mismatch exits non-zero.
 *
 * A hit only skips the deterministic preparation.  `pipeline.mjs --check`, the
 * fixed author evidence and the merge gate are untouched: `--check` still runs
 * on every run and still begins with `verifyPinnedSource()`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, lstat, readdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PINNED_GIT_ENV, pinnedGitArgs, verifyPinnedSource } from './pinned-source.mjs';
import { directTarballInputs, runtimeInputCache, verifyDirectTarball, verifyRuntimePreparation } from '../release/runtime-inputs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIN_PATH = 'dsh-plugins/plugin-kit/toolchain.json';
const BUILD_TOOLS = 'dsh-plugins/plugin-kit/build-tools';
const FIXED_BOARD_INPUT = 'vendor/dsh-package-inputs/shine-mage-board-components-0.1.0.tgz';
const BUILD_TOOLS_NODE_MODULES = `${BUILD_TOOLS}/node_modules`;

/** Files whose bytes can change the prepared closure.  `pipeline.mjs` is the
 * entry point; the rest is its prepare-time import closure.  Any edit here
 * invalidates the cache, and `prepare-cache.test.mjs` keeps the list complete.
 */
export const PREPARE_INPUT_FILES = Object.freeze([
  'scripts/dsh-b0/pipeline.mjs',
  'scripts/dsh-b0/pinned-source.mjs',
  'scripts/dsh-b0/package-manager-env.mjs',
  'scripts/dsh-b0/upstream-dir.mjs',
  'scripts/dsh-b0/prepare-cache.mjs',
  'scripts/release/runtime-inputs.mjs',
  'scripts/release/toolchain.mjs',
  'scripts/release/package-manager-contract.mjs',
  'scripts/release/generated-provenance.mjs',
  'dsh-plugins/plugin-kit/provenance.mjs',
  'dsh-plugins/plugin-kit/package-manager.mjs',
  'dsh-plugins/plugin-kit/toolchain.json',
  `${BUILD_TOOLS}/package.json`,
  `${BUILD_TOOLS}/pnpm-lock.yaml`,
  `${BUILD_TOOLS}/pnpm-workspace.yaml`,
  FIXED_BOARD_INPUT,
]);

/** `pipeline.mjs` imports used only by `--check`; they cannot change prepare
 * bytes.  The test requires every local import of the entry point to appear
 * either here or in PREPARE_INPUT_FILES, so a new import forces a decision.
 */
export const CHECK_ONLY_IMPORTS = Object.freeze([
  'scripts/dsh-b0/plugin-kit-link.mjs',
  'scripts/crm-calibration/composition-inputs.mjs',
  'scripts/dsh-b0/leaf-pack-inputs.mjs',
  'scripts/dsh-b0/workbench-client-pack-inputs.mjs',
  'scripts/ci/workbench-author-evidence.mjs',
  'scripts/ci/domain-author-evidence.mjs',
  'scripts/dsh-b0/workbench-main-contracts.mjs',
  'scripts/ci/public-contract-inputs.mjs',
  'scripts/dsh-b0/fixed-contract-checks.mjs',
]);

const sha256 = value => createHash('sha256').update(value).digest('hex');

async function readPin(repoRoot = ROOT) {
  return JSON.parse(await readFile(join(repoRoot, PIN_PATH), 'utf8'));
}

function pinnedUpstream(repoRoot, pin) {
  assert.ok(!process.env.DSH_UPSTREAM_CHECKOUT, 'B0_CACHE_UPSTREAM_OVERRIDE_UNSUPPORTED');
  return join(repoRoot, '.context/dsh-b0', `upstream-${pin.sdk_version}`);
}

/** Build-tools patches are part of the install inputs; the lock also pins them. */
export async function prepareInputFiles(repoRoot = ROOT) {
  const patches = await readdir(join(repoRoot, BUILD_TOOLS, 'patches'), { withFileTypes: true })
    .catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
  const patchFiles = patches.filter(entry => entry.isFile())
    .map(entry => `${BUILD_TOOLS}/patches/${entry.name}`).sort();
  return [...PREPARE_INPUT_FILES, ...patchFiles];
}

export async function computePrepareKey({ repoRoot = ROOT, platform = process.platform, arch = process.arch,
  node = process.version } = {}) {
  const pin = await readPin(repoRoot);
  const files = [];
  for (const path of await prepareInputFiles(repoRoot)) {
    files.push({ path, sha256: sha256(await readFile(join(repoRoot, path))) });
  }
  const identity = {
    schema_version: 'b0-prepare-cache/v1',
    platform, arch, node, pin, files,
  };
  const digest = sha256(JSON.stringify(identity));
  const label = `${platform}-${arch}`.replace(/[^A-Za-z0-9.]+/g, '-');
  return { key: `b0-prepare-v1-${label}-${digest.slice(0, 40)}`, identity };
}

function gitOutput(repoRoot, upstream) {
  return args => {
    const result = spawnSync('git', pinnedGitArgs(upstream, args), {
      cwd: repoRoot, env: { ...process.env, ...PINNED_GIT_ENV }, encoding: 'utf8', timeout: 30000,
    });
    assert.ok(!result.error && result.status === 0,
      `B0 cache Git probe failed: ${result.error?.message ?? result.stderr}`);
    return result.stdout.trim();
  };
}

/** The lockfile copy pnpm writes into node_modules is the install receipt. */
async function verifyInstalledLock(nodeModules, expectedSha256, code) {
  const info = await lstat(nodeModules).catch(() => null);
  assert.ok(info?.isDirectory() && !info.isSymbolicLink(), `${code}_NODE_MODULES_MISSING`);
  const installed = join(nodeModules, '.pnpm', 'lock.yaml');
  assert.equal(sha256(await readFile(installed).catch(() => Buffer.alloc(0))), expectedSha256, code);
}

async function verifyUpstreamInstall(upstream, pin) {
  await verifyInstalledLock(join(upstream, 'node_modules'), pin.upstream_lock_sha256,
    'B0_CACHE_UPSTREAM_LOCK_MISMATCH');
  // node_modules is not byte-bound by the preparation receipt (the pinned
  // runtime treats it as lock-bound and re-verifies it by running).  Keep the
  // same model here: the installed lock copy must be the pinned lock, and
  // `--check` (which always runs) is what proves the tree actually works.
  const tsx = await lstat(join(upstream, 'node_modules/.bin/tsx')).catch(() => null);
  assert.ok(tsx, 'B0_CACHE_UPSTREAM_TSX_MISSING');
}

export async function verifyRuntimeArchives(upstream) {
  const inputs = directTarballInputs(await readFile(join(upstream, 'pnpm-lock.yaml'), 'utf8'));
  for (const input of inputs) await verifyDirectTarball(join(runtimeInputCache(upstream), input.name), input);
  return inputs.length;
}

export async function verifyPackageInput(repoRoot = ROOT) {
  const source = await readFile(join(repoRoot, FIXED_BOARD_INPUT));
  const cached = join(repoRoot, '.context/dsh-b0/package-inputs', basename(FIXED_BOARD_INPUT));
  const info = await lstat(cached).catch(() => null);
  assert.ok(info?.isFile() && !info.isSymbolicLink(), 'B0_CACHE_PACKAGE_INPUT_MISSING');
  assert.deepEqual(await readFile(cached), source, 'B0_CACHE_PACKAGE_INPUT_MISMATCH');
}

export async function verifyBuildTools(repoRoot = ROOT) {
  const directory = join(repoRoot, BUILD_TOOLS);
  const lockBytes = await readFile(join(directory, 'pnpm-lock.yaml'));
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  await verifyInstalledLock(join(directory, 'node_modules'), sha256(lockBytes), 'B0_CACHE_BUILD_TOOLS_LOCK_MISMATCH');
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    const installed = JSON.parse(await readFile(join(directory, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(installed.version, version, `B0_CACHE_BUILD_TOOLS_VERSION_MISMATCH ${name}`);
  }
  const tsc = await lstat(join(directory, 'node_modules/.bin/tsc')).catch(() => null);
  assert.ok(tsc, 'B0_CACHE_BUILD_TOOLS_TSC_MISSING');
}

/** Full verification shared by the restore guard and the pre-save check. */
export async function verifyPrepared(repoRoot = ROOT) {
  const pin = await readPin(repoRoot);
  const upstream = pinnedUpstream(repoRoot, pin);
  await verifyPinnedSource({ upstream, pin, git: gitOutput(repoRoot, upstream) });
  const receipt = await verifyRuntimePreparation(upstream);
  const archives = await verifyRuntimeArchives(upstream);
  await verifyPackageInput(repoRoot);
  await verifyBuildTools(repoRoot);
  await verifyUpstreamInstall(upstream, pin);
  return { upstream, receipt, archives };
}

/** Exact paths restored from the cache; nothing else is ever removed. */
export async function preparedTargets(repoRoot = ROOT) {
  const pin = await readPin(repoRoot);
  const b0 = resolve(repoRoot, '.context/dsh-b0');
  const buildToolsModules = resolve(repoRoot, BUILD_TOOLS_NODE_MODULES);
  const targets = [
    resolve(b0, `upstream-${pin.sdk_version}`),
    resolve(b0, 'runtime-inputs'),
    resolve(b0, 'package-inputs'),
    buildToolsModules,
  ];
  for (const target of targets) {
    assert.ok(target === buildToolsModules || target.startsWith(`${b0}${sep}`), `B0_CACHE_CLEAN_OUTSIDE_ROOT ${target}`);
  }
  return targets;
}

/** Remove only this cache's restored bytes so `--prepare` starts cold. */
export async function cleanPrepared(repoRoot = ROOT) {
  const targets = await preparedTargets(repoRoot);
  for (const target of targets) await rm(target, { recursive: true, force: true });
  return targets;
}

async function hasPrepared(repoRoot = ROOT) {
  for (const target of await preparedTargets(repoRoot)) {
    if (await lstat(target).catch(() => null)) return true;
  }
  return false;
}

function annotation(message) {
  return String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

async function emit(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT,
    Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
}

function usage() {
  return 'Usage: node scripts/dsh-b0/prepare-cache.mjs --key|--guard|--verify';
}

async function main() {
  const [mode] = process.argv.slice(2);
  assert.ok(['--key', '--guard', '--verify'].includes(mode), usage());
  assert.equal(process.argv.length, 3, usage());

    if (mode === '--key') {
    const { key, identity } = await computePrepareKey();
    console.error(`B0 prepare cache inputs: ${identity.files.length} file(s), node ${identity.node}, ` +
      `${identity.platform}/${identity.arch}, upstream ${identity.pin.upstream_sha}`);
    for (const file of identity.files) console.error(`  ${file.sha256}  ${file.path}`);
    console.log(key);
  } else if (mode === '--guard') {
    const hit = process.env.B0_CACHE_HIT === 'true';
    if (!hit) {
      // A restore that failed after partial extraction must not be layered over
      // by `--prepare` (which refuses to reset an existing checkout).
      if (await hasPrepared()) {
        const removed = await cleanPrepared();
        console.log(`B0 prepare cache: removed ${removed.length} partial restored path(s) before the cold prepare`);
      }
      console.log('B0 prepare cache: cold (no exact key match); the full preparation must run');
      await emit({ verified: 'false', mode: 'cold' });
    } else {
      try {
        const { receipt, archives } = await verifyPrepared();
        console.log(`B0 prepare cache: hit verified against the pin (receipt ${receipt.receipt_sha256}, ` +
          `${receipt.source_tree.entries} source entries, ${archives} direct archive(s))`);
        await emit({ verified: 'true', mode: 'hit' });
      } catch (error) {
        console.log(`::warning title=B0 preparation cache rejected::${annotation(error.message)}`);
        console.error(error.stack ?? error.message);
        const removed = await cleanPrepared();
        console.log(`B0 prepare cache: rejected restored bytes; falling back to a full prepare after removing ` +
          `${removed.length} restored path(s)`);
        await emit({ verified: 'false', mode: 'fallback' });
      }
    }
  } else {
    const { receipt, archives } = await verifyPrepared();
    console.log(`B0 preparation verified before caching: receipt ${receipt.receipt_sha256}, ` +
      `${receipt.source_tree.entries} source entries, ${archives} direct archive(s)`);
    await emit({ verified: 'true', mode: 'fresh' });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
