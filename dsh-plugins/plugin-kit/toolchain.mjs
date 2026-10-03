/** Exact upstream closure. No registry install, source rewrite or absolute URL in artifacts. */
import assert from 'node:assert/strict';
import { bindPackagedDependencies } from './packaged-dependencies.mjs';
import { createHash } from 'node:crypto';
import { readFile, mkdir, symlink, lstat, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const toolchainRoot = dirname(fileURLToPath(import.meta.url));
export const defaultBuildTools = join(toolchainRoot, 'build-tools');

/** Read only the kit-owned pin/lock; plugins provide no shared runtime state. */
export async function bindToolchain(plugin, upstream, buildTools = defaultBuildTools) {
  const pin = JSON.parse(await readFile(join(toolchainRoot, 'toolchain.json'), 'utf8'));
  assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major, 'Use the pinned Node major');
  const git = args => execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim();
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
  const compiler = req('typescript');
  assert.equal(compiler.version, pin.typescript);
  const esbuild = vite('esbuild');
  assert.equal(esbuild.version, pin.esbuild);
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
    const manifest = await readJson(join(target, 'package.json'));
    assert.equal(manifest.name, name);
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(manifest.version, pin.sdk_version);
    bindings.set(name, target);
  }
  for (const [name, resolver, version] of [['react', web, pin.react], ['react-dom', web, pin.react], ['@types/react', conversation, pin.react_types], ['@types/node', req, pin.node_types]]) {
    const packagePath = resolver.resolve(`${name}/package.json`);
    assert.equal((await readJson(packagePath)).version, version);
    bindings.set(name, dirname(packagePath));
  }
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
