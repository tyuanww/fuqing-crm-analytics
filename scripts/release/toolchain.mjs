import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { managerVersions } from './package-manager-contract.mjs';

const lanePath = process.env.DSH_RELEASE_LANE_CONFIG;
const configuredToolchainPath = process.env.DSH_COMPOSITION_TOOLCHAIN ?? process.env.DSH_TOOLCHAIN_PATH;
const defaultToolchainPath = join(fileURLToPath(new URL('../..', import.meta.url)), 'dsh-plugins/plugin-kit/toolchain.json');
const TRUSTED_LANES = Object.freeze({
  rc1: Object.freeze({
    upstream_sha: '1600d8a1e140dcde43a1a0941940a0480712c011',
    upstream_lock_sha256: '952ca2f79998660dc690b739078a5d6052bc7c5c2193714b918b9d720baaeaba',
    upstream_pnpm: '11.28.5', plugin_pnpm: '11.28.2', sdk: '0.2.1-rc.1',
    cordis: '4.0.5', node: 'v24.19.0', typescript: '6.0.3', esbuild: '0.25.12',
    react: '18.3.1', react_types: '18.3.31', node_types: '22.20.1',
  }),
  rc3: Object.freeze({
    upstream_sha: '1f81c047fc48fa190a683e469daa699857e9afe8',
    upstream_lock_sha256: '911b049924e8256d8d6e684235cf935ca75b28fd0dd46f0c3b316a51c2cf5dc1',
    upstream_pnpm: '11.28.5', plugin_pnpm: '11.28.2', sdk: '0.2.1-rc.3',
    cordis: '4.0.5', node: 'v24.19.0', typescript: '6.0.3', esbuild: '0.25.12',
    react: '18.3.1', react_types: '18.3.31', node_types: '22.20.1',
  }),
});
assert.ok(configuredToolchainPath || existsSync(defaultToolchainPath), 'TOOLCHAIN_SOURCE_REQUIRED');
const toolchain = JSON.parse(readFileSync(configuredToolchainPath ?? defaultToolchainPath, 'utf8'));
function readReleaseLane(path) {
  assert.ok(isAbsolute(path), 'TOOLCHAIN_LANE_PATH_INVALID');
  const lane = JSON.parse(readFileSync(path, 'utf8'));
  assert.match(lane.lane ?? '', /^rc(?:1|3)$/, 'TOOLCHAIN_LANE_ID_INVALID');
  assert.equal(lane.schema_version, `shinemage-${lane.lane}-release-lane/v1`, 'TOOLCHAIN_LANE_SCHEMA_INVALID');
  const expected = TRUSTED_LANES[lane.lane];
  assert.match(lane.upstream_sha ?? '', /^[0-9a-f]{40}$/, 'TOOLCHAIN_LANE_UPSTREAM_SHA_INVALID');
  assert.match(lane.upstream_lock_sha256 ?? '', /^[0-9a-f]{64}$/, 'TOOLCHAIN_LANE_LOCK_SHA_INVALID');
  assert.match(lane.upstream_pnpm ?? '', /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_LANE_UPSTREAM_PNPM_INVALID');
  assert.match(lane.plugin_pnpm ?? '', /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_LANE_PNPM_INVALID');
  assert.match(lane.sdk ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'TOOLCHAIN_LANE_SDK_INVALID');
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(lane[key], value, `TOOLCHAIN_LANE_${key.toUpperCase()}_MISMATCH`);
  }
  return lane;
}

const lane = lanePath ? readReleaseLane(lanePath) : null;
const effectiveToolchain = lane ? {
  ...toolchain,
  upstream_sha: lane.upstream_sha,
  upstream_lock_sha256: lane.upstream_lock_sha256 ?? toolchain.upstream_lock_sha256,
  upstream_pnpm: lane.upstream_pnpm,
  pnpm: lane.plugin_pnpm,
  sdk_version: lane.sdk,
  cordis: lane.cordis,
  typescript: lane.typescript,
  esbuild: lane.esbuild,
  react: lane.react,
  react_types: lane.react_types,
  node_types: lane.node_types,
} : toolchain;

const managers = managerVersions(effectiveToolchain);
assert.match(effectiveToolchain.upstream_sha, /^[0-9a-f]{40}$/, 'TOOLCHAIN_UPSTREAM_SHA_INVALID');
assert.match(effectiveToolchain.sdk_version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'TOOLCHAIN_SDK_VERSION_INVALID');
assert.ok(Number.isInteger(effectiveToolchain.node_major) && effectiveToolchain.node_major > 0, 'TOOLCHAIN_NODE_MAJOR_INVALID');

export const TOOLCHAIN = Object.freeze(effectiveToolchain);
export const DSH_UPSTREAM_SHA = effectiveToolchain.upstream_sha;
export const DSH_SDK_VERSION = effectiveToolchain.sdk_version;
export const NODE_MAJOR = effectiveToolchain.node_major;
export const PNPM_VERSION = managers.plugins;
export const UPSTREAM_PNPM_VERSION = managers.upstream;
