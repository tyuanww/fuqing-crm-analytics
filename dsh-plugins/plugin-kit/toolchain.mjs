/** Exact upstream closure. No registry install, source rewrite or absolute URL in artifacts. */
import assert from 'node:assert/strict';
import { bindPackagedDependencies, DEV_KIT_NAME } from './packaged-dependencies.mjs';
import { createHash } from 'node:crypto';
import { readFile, mkdir, symlink, lstat, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { inspectSdkPackage } from './sdk-inputs.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const toolchainRoot = dirname(fileURLToPath(import.meta.url));
export const defaultBuildTools = join(toolchainRoot, 'build-tools');

/** Check all fixed inputs without importing tool code or writing plugin links. */
export async function inspectToolchain(upstream, buildTools = defaultBuildTools) {
  const pin = JSON.parse(await readFile(join(toolchainRoot, 'toolchain.json'), 'utf8'));
  assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major, 'Use the pinned Node major');
  // The read-only final check has the same isolation as preparation stages.
  // Do not forward app credentials or re-enable caller/global Git settings.
  const gitEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
  const git = args => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', upstream, ...args], {
    cwd: upstream, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), pin.upstream_sha, 'Upstream SHA drift');
  assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '', 'Fixed upstream contains local source edits');
  assert.equal(createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex'), pin.upstream_lock_sha256, 'Upstream lock drift');
  const upstreamManifest = JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8'));
  assert.equal(upstreamManifest.packageManager, `pnpm@${pin.pnpm}`);
  const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
  const web = createRequire(join(upstream, 'apps/web/package.json'));
  const vite = createRequire(web.resolve('vite/package.json'));
  const req = createRequire(join(upstream, 'package.json'));
  const conversation = createRequire(join(upstream, 'packages/client/ui-conversation/package.json'));
  assert.equal((await readJson(req.resolve('typescript/package.json'))).version, pin.typescript, 'Compiler version drift');
  assert.equal((await readJson(vite.resolve('esbuild/package.json'))).version, pin.esbuild, 'Bundler version drift');
  req.resolve('typescript'); vite.resolve('esbuild'); // Resolve entry files without executing them.
  const bindings = new Map();
  // A clean source copy may reuse the already-installed, identical locked
  // dependency closure. Verification never installs from the registry.
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches/antd@5.29.3.patch', 'patches/rc-picker@4.11.3.patch']) {
    assert.deepEqual(await readFile(join(toolchainRoot, 'build-tools', file)), await readFile(join(buildTools, file)), `Build dependency ${file} differs`);
  }
  const buildManifest = await readJson(join(buildTools, 'package.json'));
  const business = createRequire(join(buildTools, 'package.json'));
  for (const name of ['antd', '@types/react-dom']) {
    const packagePath = business.resolve(`${name}/package.json`);
    assert.equal((await readJson(packagePath)).version, buildManifest.dependencies[name], `Business dependency drift: ${name}`);
    bindings.set(name, dirname(packagePath));
  }
  for (const name of ['react', 'react-dom']) {
    assert.equal((await readJson(business.resolve(`${name}/package.json`))).version, pin.react, `React closure drift: ${name}`);
  }
  for (const [name, path] of Object.entries(pin.sdk_bindings)) {
    const target = join(upstream, path);
    await inspectSdkPackage(target, name, name.startsWith('@deepseek-ai/dsh-') ? pin.sdk_version : undefined);
    bindings.set(name, target);
  }
  for (const [name, resolver, version] of [['react', web, pin.react], ['react-dom', web, pin.react], ['@types/react', conversation, pin.react_types], ['@types/node', req, pin.node_types]]) {
    const packagePath = resolver.resolve(`${name}/package.json`);
    assert.equal((await readJson(packagePath)).version, version);
    bindings.set(name, dirname(packagePath));
  }
  return { pin, bindings, loadCompiler: () => req('typescript'), loadBundler: () => vite('esbuild') };
}

/** Bind only after the complete input preflight succeeds. */
export async function bindToolchain(plugin, upstream, buildTools = defaultBuildTools) {
  const consumer = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'));
  const kit = JSON.parse(await readFile(join(toolchainRoot, 'package.json'), 'utf8'));
  assert.ok(![consumer.dependencies, consumer.optionalDependencies, consumer.peerDependencies]
    .some(group => group?.[DEV_KIT_NAME] !== undefined), 'KIT_MUST_BE_DEV_ONLY');
  if (consumer.devDependencies?.[DEV_KIT_NAME] !== undefined) {
    assert.equal(consumer.devDependencies[DEV_KIT_NAME], kit.version, 'KIT_VERSION_MISMATCH');
  }
  const { pin, bindings, loadCompiler, loadBundler } = await inspectToolchain(upstream, buildTools);
  const compiler = loadCompiler(), esbuild = loadBundler();
  assert.equal(compiler.version, pin.typescript);
  assert.equal(esbuild.version, pin.esbuild);
  for (const [name, target] of bindings) {
    const link = join(plugin, 'node_modules', name);
    await mkdir(dirname(link), { recursive: true });
    try {
      const existing = await lstat(link);
      assert.ok(existing.isSymbolicLink(), `Refusing to replace existing dependency: ${name}`);
      assert.equal(await realpath(link), await realpath(target), `Existing SDK binding differs: ${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await symlink(relative(dirname(link), target), link, 'dir');
    }
  }
  await bindPackagedDependencies(plugin, process.env.DSH_PACKAGE_INPUTS ?? join(toolchainRoot, '../../.context/dsh-b0/package-inputs'));
  return { pin, compiler, build: esbuild.build };
}
