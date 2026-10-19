import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);

test('release toolchain loads from an explicit external file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toolchain-source-free-'));
  const path = join(root, 'toolchain.json');
  await writeFile(path, JSON.stringify({
    schema_version: 'dsh-b0-toolchain/v2',
    upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443',
    upstream_lock_sha256: '5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa',
    upstream_pnpm: '11.7.0',
    pnpm: '11.28.2',
    node_major: 24,
    sdk_version: '0.1.7-rc.2',
  }) + '\n');
  try {
    const result = await exec(process.execPath, ['--input-type=module', '-e',
      "import { TOOLCHAIN, PNPM_VERSION } from './scripts/release/toolchain.mjs'; console.log(JSON.stringify({ sdk: TOOLCHAIN.sdk_version, pnpm: PNPM_VERSION }));"], {
      cwd: process.cwd(), env: { ...process.env, DSH_COMPOSITION_TOOLCHAIN: path },
    });
    assert.deepEqual(JSON.parse(result.stdout), { sdk: '0.1.7-rc.2', pnpm: '11.28.2' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
