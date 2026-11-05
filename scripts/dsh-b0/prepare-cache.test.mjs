/** Cache-key and verified-restore regression tests for the B0 preparation cache.
 *
 * These run without network, pnpm or a pinned upstream: fixtures build the
 * exact file shapes the guard inspects.  They are part of `pipeline.mjs --check`
 * so the CI job that uses the cache also proves the guard logic.
 *
 * The key pinned here is also published from `main` by
 * `.github/workflows/b0-prepare-cache.yml`, which PRs restore: a producer that
 * drifted from this module would silently leave every PR cold.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  CHECK_ONLY_IMPORTS, PREPARE_INPUT_FILES, cleanPrepared, computePrepareKey, prepareInputFiles,
  verifyBuildTools, verifyPackageInput, verifyRuntimeArchives,
} from './prepare-cache.mjs';
import { verifyPinnedSource } from './pinned-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD_TOOLS = 'dsh-plugins/plugin-kit/build-tools';
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function owned(t) {
  const root = await mkdtemp(join(tmpdir(), 'b0-cache-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function write(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=b0-test', '-c', 'user.email=b0-test@example.test', '-C', cwd, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fakePin(overrides = {}) {
  return {
    schema_version: 'dsh-b0-toolchain/v2',
    upstream_url: 'https://example.test/dsh.git',
    upstream_sha: 'a'.repeat(40), upstream_lock_sha256: 'b'.repeat(64),
    node_major: 24, upstream_pnpm: '11.28.5', pnpm: '11.28.2', sdk_version: '0.2.1-rc.5',
    ...overrides,
  };
}

async function fakeRepo(t, { pin = fakePin() } = {}) {
  const root = await owned(t);
  await write(join(root, 'dsh-plugins/plugin-kit/toolchain.json'), JSON.stringify(pin));
  for (const path of await prepareInputFiles(ROOT)) {
    const target = join(root, path);
    const bytes = path.endsWith('.patch') || path.endsWith('README.md') ? `fixture ${path}`
      : await readFile(join(ROOT, path));
    await write(target, bytes);
  }
  return { root, pin };
}

test('cache key is stable, and every prepare input changes it', async t => {
  const { root } = await fakeRepo(t);
  const baseline = await computePrepareKey({ repoRoot: root, platform: 'linux', arch: 'x64', node: 'v24.19.0' });
  assert.match(baseline.key, /^b0-prepare-v1-linux-x64-[0-9a-f]{40}$/);
  const again = await computePrepareKey({ repoRoot: root, platform: 'linux', arch: 'x64', node: 'v24.19.0' });
  assert.equal(again.key, baseline.key, 'key is not deterministic');

  const cases = [
    ['pipeline.mjs', () => write(join(root, 'scripts/dsh-b0/pipeline.mjs'), 'changed')],
    ['pinned source digest', () => write(join(root, 'dsh-plugins/plugin-kit/toolchain.json'),
      JSON.stringify(fakePin({ upstream_sha: 'c'.repeat(40) })))],
    ['build-tools lock', () => write(join(root, `${BUILD_TOOLS}/pnpm-lock.yaml`), 'changed')],
    ['vendor input', () => write(join(root, 'vendor/dsh-package-inputs/shine-mage-board-components-0.1.0.tgz'), 'changed')],
  ];
  let previous = baseline.key;
  for (const [label, mutate] of cases) {
    await mutate();
    const next = await computePrepareKey({ repoRoot: root, platform: 'linux', arch: 'x64', node: 'v24.19.0' });
    assert.notEqual(next.key, previous, `${label} does not change the key`);
    previous = next.key;
  }
  const otherNode = await computePrepareKey({ repoRoot: root, platform: 'linux', arch: 'x64', node: 'v24.20.0' });
  assert.notEqual(otherNode.key, previous, 'node version does not change the key');
  const otherPlatform = await computePrepareKey({ repoRoot: root, platform: 'darwin', arch: 'arm64', node: 'v24.19.0' });
  assert.notEqual(otherPlatform.key, previous, 'platform/arch does not change the key');
});

test('key inputs cover every local import of the prepare entry point', async () => {
  const source = await readFile(join(ROOT, 'scripts/dsh-b0/pipeline.mjs'), 'utf8');
  const imports = new Set();
  for (const match of source.matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) {
    imports.add(relative(ROOT, resolve(ROOT, 'scripts/dsh-b0', match[1])).split(sep).join('/'));
  }
  assert.ok(imports.size >= 10, 'pipeline import scan found too few local imports');
  const classified = new Set([...PREPARE_INPUT_FILES, ...CHECK_ONLY_IMPORTS]);
  for (const path of imports) {
    assert.ok(classified.has(path), `pipeline import not classified for the cache key: ${path}`);
  }
  for (const path of CHECK_ONLY_IMPORTS) assert.ok(imports.has(path), `stale CHECK_ONLY_IMPORTS entry: ${path}`);
  const patches = (await prepareInputFiles(ROOT)).filter(path => path.includes('/patches/'));
  assert.ok(patches.some(path => path.endsWith('/patches/antd@5.29.3.patch')), 'patch files are not keyed');
  assert.ok(patches.length >= 2, 'build-tools patches are not keyed');
});

test('pinned source verification rejects a wrong SHA, dirty tree or wrong lock', async t => {
  const root = await owned(t);
  const upstream = join(root, 'upstream');
  await write(join(upstream, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.5' }));
  await write(join(upstream, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  git(upstream, ['init', '-q']);
  git(upstream, ['add', '-A']);
  git(upstream, ['commit', '-qm', 'fixture']);
  const head = git(upstream, ['rev-parse', 'HEAD']);
  const lock = await readFile(join(upstream, 'pnpm-lock.yaml'));
  const pin = fakePin({ upstream_sha: head, upstream_lock_sha256: sha256(lock) });
  const probe = args => git(upstream, args);

  await verifyPinnedSource({ upstream, pin, git: probe });
  await write(join(upstream, 'package.json'), JSON.stringify({ packageManager: 'pnpm@1.0.0' }));
  await assert.rejects(() => verifyPinnedSource({ upstream, pin, git: probe }), /Refusing locally modified upstream/);
  await write(join(upstream, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.5' }));
  await assert.rejects(() => verifyPinnedSource({ upstream, pin: { ...pin, upstream_sha: 'd'.repeat(40) }, git: probe }),
    /Pinned upstream SHA mismatch/);
  await assert.rejects(() => verifyPinnedSource({ upstream, pin: { ...pin, upstream_lock_sha256: 'e'.repeat(64) }, git: probe }),
    /Pinned upstream lockfile mismatch/);
});

test('build-tools verification binds the installed lock, versions and tsc', async t => {
  const root = await owned(t);
  const directory = join(root, BUILD_TOOLS);
  const lock = "lockfileVersion: '9.0'\n";
  await write(join(directory, 'package.json'), JSON.stringify({ dependencies: { typescript: '6.0.3', '@types/react': '18.3.31' } }));
  await write(join(directory, 'pnpm-lock.yaml'), lock);
  await write(join(directory, 'node_modules/.pnpm/lock.yaml'), lock);
  await write(join(directory, 'node_modules/typescript/package.json'), JSON.stringify({ version: '6.0.3' }));
  await write(join(directory, 'node_modules/@types/react/package.json'), JSON.stringify({ version: '18.3.31' }));
  await write(join(directory, 'node_modules/.bin/tsc'), '#!/bin/sh\n');

  await verifyBuildTools(root);
  await write(join(directory, 'node_modules/typescript/package.json'), JSON.stringify({ version: '5.0.0' }));
  await assert.rejects(() => verifyBuildTools(root), /B0_CACHE_BUILD_TOOLS_VERSION_MISMATCH typescript/);
  await write(join(directory, 'node_modules/typescript/package.json'), JSON.stringify({ version: '6.0.3' }));
  await write(join(directory, 'node_modules/.pnpm/lock.yaml'), 'other');
  await assert.rejects(() => verifyBuildTools(root), /B0_CACHE_BUILD_TOOLS_LOCK_MISMATCH/);
});

test('direct runtime archives are verified with the lock integrity', async t => {
  const root = await owned(t);
  const upstream = join(root, 'upstream');
  const bytes = Buffer.from('fixture archive');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const url = 'https://example.test/fixture.tgz';
  await write(join(upstream, 'pnpm-lock.yaml'),
    `lockfileVersion: '9.0'\npackages:\n  fixture@1.0.0:\n    resolution: {integrity: ${integrity}, tarball: ${url}}\n`);
  const name = `${sha256(`${url}\n${integrity}`)}.tgz`;
  await write(join(root, 'runtime-inputs', name), bytes);
  assert.equal(await verifyRuntimeArchives(upstream), 1);
  await write(join(root, 'runtime-inputs', name), 'corrupt');
  await assert.rejects(() => verifyRuntimeArchives(upstream), /RUNTIME_DIRECT_TARBALL_INTEGRITY_MISMATCH/);
});

test('the cached fixed package input must stay byte-identical to the vendor input', async t => {
  const root = await owned(t);
  const path = 'vendor/dsh-package-inputs/shine-mage-board-components-0.1.0.tgz';
  await write(join(root, path), 'fixed input');
  await write(join(root, '.context/dsh-b0/package-inputs', 'shine-mage-board-components-0.1.0.tgz'), 'fixed input');
  await verifyPackageInput(root);
  await write(join(root, '.context/dsh-b0/package-inputs', 'shine-mage-board-components-0.1.0.tgz'), 'poisoned');
  await assert.rejects(() => verifyPackageInput(root), /B0_CACHE_PACKAGE_INPUT_MISMATCH/);
});

test('a rejected cache removes only the restored preparation', async t => {
  const root = await owned(t);
  await write(join(root, 'dsh-plugins/plugin-kit/toolchain.json'), JSON.stringify(fakePin()));
  const b0 = join(root, '.context/dsh-b0');
  for (const path of ['upstream-0.2.1-rc.5/x', 'runtime-inputs/x', 'package-inputs/x', 'python-env/keep', 'keep']) {
    await write(join(b0, path), 'x');
  }
  await write(join(root, BUILD_TOOLS, 'node_modules/x'), 'x');
  const removed = await cleanPrepared(root);
  assert.equal(removed.length, 4);
  for (const path of ['upstream-0.2.1-rc.5', 'runtime-inputs', 'package-inputs', `${BUILD_TOOLS}/node_modules`]) {
    await assert.rejects(() => readFile(join(root, path, 'x')), /ENOENT/);
  }
  assert.equal(await readFile(join(b0, 'python-env/keep'), 'utf8'), 'x');
  assert.equal(await readFile(join(b0, 'keep'), 'utf8'), 'x');
});
