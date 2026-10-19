import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { managerVersions } from './package-manager-contract.mjs';

const lanePath = process.env.DSH_RELEASE_LANE_CONFIG;
const configuredToolchainPath = process.env.DSH_COMPOSITION_TOOLCHAIN ?? process.env.DSH_TOOLCHAIN_PATH;
const defaultToolchainPath = join(fileURLToPath(new URL('../..', import.meta.url)), 'dsh-plugins/plugin-kit/toolchain.json');
assert.ok(configuredToolchainPath || existsSync(defaultToolchainPath), 'TOOLCHAIN_SOURCE_REQUIRED');
const toolchain = JSON.parse(readFileSync(configuredToolchainPath ?? defaultToolchainPath, 'utf8'));
const lane = lanePath ? JSON.parse(readFileSync(lanePath, 'utf8')) : null;
const effectiveToolchain = lane ? {
  ...toolchain,
  upstream_sha: lane.upstream_sha,
  upstream_pnpm: lane.upstream_pnpm,
  pnpm: lane.plugin_pnpm,
  sdk_version: lane.sdk,
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
