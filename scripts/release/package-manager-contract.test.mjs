import assert from 'node:assert/strict';
import test from 'node:test';
import { managerVersions } from './package-manager-contract.mjs';

test('reads the two pinned package manager versions', () => {
  assert.deepEqual(managerVersions({ schema_version: 'dsh-b0-toolchain/v2', upstream_pnpm: '11.7.0', pnpm: '11.28.2' }), {
    upstream: '11.7.0', plugins: '11.28.2',
  });
});

test('rejects a floating package manager version', () => {
  assert.throws(() => managerVersions({ schema_version: 'dsh-b0-toolchain/v2', upstream_pnpm: 'latest', pnpm: '11.28.2' }), /TOOLCHAIN_UPSTREAM_PNPM_INVALID/);
});
