import assert from 'node:assert/strict';
import toolchain from '../../dsh-plugins/analytics-workbench/toolchain.json' with { type: 'json' };

assert.equal(toolchain.schema_version, 'dsh-b0-toolchain/v1', 'TOOLCHAIN_SCHEMA_INVALID');
assert.match(toolchain.upstream_sha, /^[0-9a-f]{40}$/, 'TOOLCHAIN_UPSTREAM_SHA_INVALID');
assert.match(toolchain.sdk_version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'TOOLCHAIN_SDK_VERSION_INVALID');
assert.ok(Number.isInteger(toolchain.node_major) && toolchain.node_major > 0, 'TOOLCHAIN_NODE_MAJOR_INVALID');
assert.match(toolchain.pnpm, /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_PNPM_VERSION_INVALID');

export const TOOLCHAIN = Object.freeze(toolchain);
export const DSH_UPSTREAM_SHA = toolchain.upstream_sha;
export const DSH_SDK_VERSION = toolchain.sdk_version;
export const NODE_MAJOR = toolchain.node_major;
export const PNPM_VERSION = toolchain.pnpm;
