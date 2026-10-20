import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bindToolchain } from '../../dsh-plugins/plugin-kit/toolchain.mjs';
import { inspectCockpitReleaseContract } from './rc1-cockpit-contract.mjs';

test('the default rc2 line and rc1 release lane remain explicitly separate', async () => {
  const result = await inspectCockpitReleaseContract();
  assert.equal(result.status, 'PARTIAL_STATIC_ONLY');
  assert.deepEqual(result.default_compatibility, {
    status: 'PASS',
    sdk: '0.1.7-rc.2',
    upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443',
    plugin_peer: '0.1.7-rc.2',
    composition_pin: '477b4f420553e8a52c2fbccc464d7561b239c443',
    composition_pin_role: 'rc2 DOM adapter identity; not the rc1 runtime pin',
  });
  assert.equal(result.rc1_release_lane.sdk, '0.2.1-rc.1');
  assert.equal(result.rc1_release_lane.upstream_sha, '1600d8a1e140dcde43a1a0941940a0480712c011');
  assert.equal(result.rc1_release_lane.build_input.status, 'NOT_RUN');
  assert.equal(result.artifact.status, 'NOT_RUN');
  assert.equal(result.runtime_profile.status, 'NOT_RUN');
});

test('an explicit rc1 upstream resolves through the release lane without changing the default pin', { skip: !process.env.B0_RC1_UPSTREAM || !process.env.B0_BUILD_TOOLS }, async () => {
  const result = await inspectCockpitReleaseContract({
    upstream: resolve(process.env.B0_RC1_UPSTREAM),
    buildTools: resolve(process.env.B0_BUILD_TOOLS),
  });
  assert.equal(result.status, 'PASS_LOCAL_BUILD_INPUTS');
  assert.equal(result.rc1_release_lane.build_input.sdk, '0.2.1-rc.1');
  assert.equal(result.default_compatibility.sdk, '0.1.7-rc.2');
});

test('an explicit rc1 lane temporarily rebinds local SDK links and restores them', {
  skip: !process.env.B0_RC1_UPSTREAM || !process.env.B0_BUILD_TOOLS,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'rc1-binding-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = join(root, 'node_modules/.pnpm/original/node_modules/@deepseek-ai/dsh-tools');
  const link = join(root, 'node_modules/@deepseek-ai/dsh-tools');
  await mkdir(original, { recursive: true });
  await mkdir(join(root, 'node_modules/@deepseek-ai'), { recursive: true });
  await symlink(join('..', '.pnpm/original/node_modules/@deepseek-ai/dsh-tools'), link, 'dir');
  await writeFile(join(root, 'package.json'), JSON.stringify({
    devDependencies: { '@shine-mage/dsh-plugin-kit': '0.1.0' },
  }));
  const lane = process.env.DSH_RELEASE_LANE_CONFIG;
  process.env.DSH_RELEASE_LANE_CONFIG = resolve('config/dsh-rc1-release-lane.json');
  try {
    const bound = await bindToolchain(root, resolve(process.env.B0_RC1_UPSTREAM), resolve(process.env.B0_BUILD_TOOLS));
    assert.equal(await readFile(join(root, 'node_modules/@deepseek-ai/dsh-tools/package.json'), 'utf8').then(JSON.parse).then(value => value.version), '0.2.1-rc.1');
    await bound.restore();
    assert.equal(await realpath(link), await realpath(original));
  } finally {
    if (lane === undefined) delete process.env.DSH_RELEASE_LANE_CONFIG;
    else process.env.DSH_RELEASE_LANE_CONFIG = lane;
  }
});
