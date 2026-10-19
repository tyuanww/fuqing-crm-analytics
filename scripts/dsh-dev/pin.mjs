/** Verify the pinned public DSH checkout. Never fetch, switch, or reset it. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { PINNED_SHA, NODE_MAJOR } from './constants.mjs';
import { managerVersions } from '../release/package-manager-contract.mjs';
import { TOOLCHAIN } from '../release/toolchain.mjs';

export function validateToolchain(pin) {
  assert.ok(pin && typeof pin === 'object' && !Array.isArray(pin), 'TOOLCHAIN_INVALID');
  assert.equal(pin.schema_version, 'dsh-b0-toolchain/v2', 'TOOLCHAIN_SCHEMA_INVALID');
  assert.match(pin.upstream_sha ?? '', /^[0-9a-f]{40}$/, 'TOOLCHAIN_UPSTREAM_SHA_INVALID');
  assert.match(pin.sdk_version ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'TOOLCHAIN_SDK_VERSION_INVALID');
  assert.ok(Number.isInteger(pin.node_major) && pin.node_major > 0, 'TOOLCHAIN_NODE_MAJOR_INVALID');
  managerVersions(pin);
  return pin;
}

export async function readToolchainFile(path) {
  assert.ok(typeof path === 'string' && isAbsolute(path), 'TOOLCHAIN_PATH_INVALID');
  return validateToolchain(JSON.parse(await readFile(path, 'utf8')));
}

export async function readToolchain(repoRoot) {
  const configured = process.env.DSH_COMPOSITION_TOOLCHAIN ?? process.env.DSH_TOOLCHAIN_PATH;
  const lanePath = process.env.DSH_RELEASE_LANE_CONFIG;
  const pin = configured
    ? await readToolchainFile(configured)
    : lanePath
      ? await readFile(lanePath, 'utf8').then(value => {
          const lane = JSON.parse(value);
          assert.equal(lane.schema_version, 'shinemage-rc1-release-lane/v1', 'DSH_RELEASE_LANE_SCHEMA_INVALID');
          return validateToolchain({ ...TOOLCHAIN, upstream_sha: lane.upstream_sha, upstream_lock_sha256: lane.upstream_lock_sha256, upstream_pnpm: lane.upstream_pnpm, pnpm: lane.plugin_pnpm, sdk_version: lane.sdk });
        })
      : await readToolchainFile(join(repoRoot, 'dsh-plugins/plugin-kit/toolchain.json'));
  assert.equal(pin.upstream_sha, PINNED_SHA, 'toolchain.json drifted from the fixed upstream SHA');
  assert.equal(pin.node_major, NODE_MAJOR);
  return pin;
}

function git(upstream, args) {
  const result = spawnSync('git', ['-C', upstream, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.ok(!result.error && result.status === 0, `upstream git failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

export async function verifyUpstream(upstream, pin) {
  const managers = managerVersions(pin);
  assert.equal(Number(process.versions.node.split('.')[0]), NODE_MAJOR, `Use Node ${NODE_MAJOR}`);
  // A production runtime is the immutable pnpm deploy output shipped beside
  // release-marker.json. It has no .git checkout or pnpm lockfile, so bind it
  // to the release marker (or an explicit operator-provided SHA) and verify
  // the package identity/version before using its CLI.
  if (!await access(join(upstream, 'apps/cli/lib/bin.js')).then(() => true, () => false)) {
    await access(join(upstream, 'lib/bin.js'));
    const packageJson = JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8'));
    assert.equal(packageJson.name, '@deepseek-ai/dsh', 'Runtime bundle package mismatch');
    assert.equal(packageJson.version, pin.sdk_version, 'Runtime bundle version mismatch');
    let declaredSha = process.env.DSH_UPSTREAM_SHA ?? null;
    try {
      const marker = JSON.parse(await readFile(join(upstream, '..', 'release-marker.json'), 'utf8'));
      declaredSha = marker.upstream_runtime?.upstream_sha ?? declaredSha;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    assert.equal(declaredSha, pin.upstream_sha, 'Runtime bundle upstream SHA is not bound to the pinned release');
    return {
      upstream_sha: pin.upstream_sha,
      upstream_lock_sha256: pin.upstream_lock_sha256,
      pnpm: managers.upstream,
      node: process.version,
      runtime_bundle: true,
    };
  }
  await access(join(upstream, 'apps/cli/lib/bin.js'));
  await access(join(upstream, 'pnpm-lock.yaml'));
  assert.equal(git(upstream, ['rev-parse', 'HEAD']), pin.upstream_sha, 'Pinned upstream SHA mismatch');
  assert.equal(git(upstream, ['status', '--porcelain', '--untracked-files=no']), '', 'Refusing locally modified upstream');
  const lock = createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex');
  assert.equal(lock, pin.upstream_lock_sha256, 'Pinned upstream lockfile SHA-256 mismatch');
  assert.equal(JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8')).packageManager, `pnpm@${managers.upstream}`);
  return {
    upstream_sha: pin.upstream_sha,
    upstream_lock_sha256: pin.upstream_lock_sha256,
    pnpm: managers.upstream,
    node: process.version,
  };
}
