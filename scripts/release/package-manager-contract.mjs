import assert from 'node:assert/strict';

export function managerVersions(pin) {
  assert.equal(pin.schema_version, 'dsh-b0-toolchain/v2', 'TOOLCHAIN_SCHEMA_INVALID');
  assert.match(pin.upstream_pnpm ?? '', /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_UPSTREAM_PNPM_INVALID');
  assert.match(pin.pnpm ?? '', /^\d+\.\d+\.\d+$/, 'TOOLCHAIN_PNPM_VERSION_INVALID');
  return { upstream: pin.upstream_pnpm, plugins: pin.pnpm };
}
