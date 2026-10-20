import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { bindToolchain } from '../../dsh-plugins/plugin-kit/toolchain.mjs';

async function writePackage(root, name, version) {
  await mkdir(join(root, 'lib'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name,
    version,
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
  }));
  await writeFile(join(root, 'lib/index.js'), 'export const version = "fixture";\n');
  await writeFile(join(root, 'lib/index.d.ts'), 'export declare const version: string;\n');
}

test('the default rc2 lane rebinds local SDK links and restores them', {
  skip: !process.env.B0_BUILD_UPSTREAM || !process.env.B0_BUILD_TOOLS,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'default-toolchain-rebind-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const original = join(root, 'previous-upstream/@deepseek-ai/dsh-tools');
  const link = join(root, 'node_modules/@deepseek-ai/dsh-tools');
  const added = join(root, 'node_modules/@deepseek-ai/dsh-agent');
  await writePackage(original, '@deepseek-ai/dsh-tools', '0.1.7-rc.2');
  await mkdir(dirname(link), { recursive: true });
  await symlink(relative(dirname(link), original), link, 'dir');

  const kit = JSON.parse(await readFile(new URL('../../dsh-plugins/plugin-kit/package.json', import.meta.url)));
  await writeFile(join(root, 'package.json'), JSON.stringify({
    devDependencies: { '@shine-mage/dsh-plugin-kit': kit.version },
  }));

  const lane = process.env.DSH_RELEASE_LANE_CONFIG;
  delete process.env.DSH_RELEASE_LANE_CONFIG;
  try {
    const bound = await bindToolchain(
      root,
      resolve(process.env.B0_BUILD_UPSTREAM),
      resolve(process.env.B0_BUILD_TOOLS),
    );
    assert.equal(bound.pin.sdk_version, '0.1.7-rc.2');
    assert.notEqual(await realpath(link), await realpath(original));
    assert.equal(JSON.parse(await readFile(join(link, 'package.json'))).version, '0.1.7-rc.2');
    assert.equal((await lstat(added)).isSymbolicLink(), true);

    await bound.restore();
    assert.equal(await realpath(link), await realpath(original));
    assert.equal((await lstat(added)).isSymbolicLink(), true);
  } finally {
    if (lane === undefined) delete process.env.DSH_RELEASE_LANE_CONFIG;
    else process.env.DSH_RELEASE_LANE_CONFIG = lane;
  }
});
