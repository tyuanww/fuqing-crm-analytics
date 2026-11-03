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

async function fixture(t, manifestName = '@deepseek-ai/dsh-tools') {
  const root = await mkdtemp(join(tmpdir(), 'default-toolchain-rebind-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const original = join(root, 'previous-upstream/@deepseek-ai/dsh-tools');
  const link = join(root, 'node_modules/@deepseek-ai/dsh-tools');
  const added = join(root, 'node_modules/@deepseek-ai/dsh-agent');
  await writePackage(original, manifestName, '0.2.1-rc.3');
  await mkdir(dirname(link), { recursive: true });
  await symlink(relative(dirname(link), original), link, 'dir');

  const kit = JSON.parse(await readFile(new URL('../../dsh-plugins/plugin-kit/package.json', import.meta.url)));
  await writeFile(join(root, 'package.json'), JSON.stringify({
    devDependencies: { '@shine-mage/dsh-plugin-kit': kit.version },
  }));
  return { root, original, link, added };
}

test('the default rc3 lane rebinds a verified upstream SDK link and restores it', {
  skip: !process.env.B0_BUILD_UPSTREAM || !process.env.B0_BUILD_TOOLS,
}, async t => {
  const { root, original, link, added } = await fixture(t);

  const lane = process.env.DSH_RELEASE_LANE_CONFIG;
  delete process.env.DSH_RELEASE_LANE_CONFIG;
  try {
    const bound = await bindToolchain(
      root,
      resolve(process.env.B0_BUILD_UPSTREAM),
      resolve(process.env.B0_BUILD_TOOLS),
      { allowRebind: true },
    );
    assert.equal(bound.pin.sdk_version, '0.2.1-rc.3');
    assert.notEqual(await realpath(link), await realpath(original));
    assert.equal(JSON.parse(await readFile(join(link, 'package.json'))).version, '0.2.1-rc.3');
    assert.equal((await lstat(added)).isSymbolicLink(), true);

    await bound.restore();
    assert.equal(await realpath(link), await realpath(original));
    assert.equal((await lstat(added)).isSymbolicLink(), true);
  } finally {
    if (lane === undefined) delete process.env.DSH_RELEASE_LANE_CONFIG;
    else process.env.DSH_RELEASE_LANE_CONFIG = lane;
  }
});

test('a mismatched external package identity is refused', {
  skip: !process.env.B0_BUILD_UPSTREAM || !process.env.B0_BUILD_TOOLS,
}, async t => {
  const { root, original, link } = await fixture(t, '@shine-mage/not-dsh-tools');
  await assert.rejects(
    bindToolchain(root, resolve(process.env.B0_BUILD_UPSTREAM), resolve(process.env.B0_BUILD_TOOLS), {
      allowRebind: true,
    }),
    error => error?.code === 'ERR_ASSERTION' && /KIT_EXISTING_BINDING_NAME/.test(error.message),
  );
  assert.equal(await realpath(link), await realpath(original));
});

test('a build consumer without explicit rebind permission preserves the existing SDK link', {
  skip: !process.env.B0_BUILD_UPSTREAM || !process.env.B0_BUILD_TOOLS,
}, async t => {
  const { root, original, link } = await fixture(t);
  const lane = process.env.DSH_RELEASE_LANE_CONFIG;
  delete process.env.DSH_RELEASE_LANE_CONFIG;
  try {
    await assert.rejects(
      bindToolchain(root, resolve(process.env.B0_BUILD_UPSTREAM), resolve(process.env.B0_BUILD_TOOLS)),
      /KIT_EXISTING_BINDING_DIFFERS/,
    );
    assert.equal(await realpath(link), await realpath(original));
  } finally {
    if (lane === undefined) delete process.env.DSH_RELEASE_LANE_CONFIG;
    else process.env.DSH_RELEASE_LANE_CONFIG = lane;
  }
});

test('only the cockpit build opts into temporary SDK rebinding', async () => {
  const builds = [
    'analytics-workbench',
    'knowledge',
    'crm-knowledge',
    'shine-board',
    'shine-brand',
    'shine-crowd-action',
    'shine-funnel',
    'shine-query',
    'shine-waterfall',
  ];
  for (const plugin of builds) {
    const source = await readFile(resolve(`dsh-plugins/${plugin}/build.mjs`), 'utf8');
    assert.equal(
      /allowRebind\s*:\s*true/.test(source),
      plugin === 'analytics-workbench',
      `UNEXPECTED_REBIND_OPT_IN ${plugin}`,
    );
  }
});
