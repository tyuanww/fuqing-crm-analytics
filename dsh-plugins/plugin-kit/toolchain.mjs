/** Exact upstream closure. No registry install, source rewrite or absolute URL in artifacts. */
import assert from 'node:assert/strict';
import { bindPackagedDependencies, DEV_KIT_NAME } from './packaged-dependencies.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, symlink, lstat, realpath, rename, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { inspectSdkPackage } from './sdk-inputs.mjs';
import { verifySdkClosure } from './sdk-closure.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { managerVersions } from './package-manager.mjs';
import { isAbsolute } from 'node:path';

export const toolchainRoot = dirname(fileURLToPath(import.meta.url));
export const defaultBuildTools = join(toolchainRoot, 'build-tools');

async function applyReleaseLane(pin) {
  const path = process.env.DSH_RELEASE_LANE_CONFIG;
  if (!path) return pin;
  assert.ok(isAbsolute(path), 'KIT_RELEASE_LANE_PATH');
  const lane = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(lane.schema_version, 'shinemage-rc1-release-lane/v1', 'KIT_RELEASE_LANE_SCHEMA');
  assert.equal(lane.lane, 'rc1', 'KIT_RELEASE_LANE_ID');
  assert.match(lane.sdk ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'KIT_RELEASE_LANE_SDK');
  assert.match(lane.upstream_sha ?? '', /^[0-9a-f]{40}$/, 'KIT_RELEASE_LANE_UPSTREAM_SHA');
  assert.match(lane.upstream_lock_sha256 ?? '', /^[0-9a-f]{64}$/, 'KIT_RELEASE_LANE_UPSTREAM_LOCK');
  assert.match(lane.upstream_pnpm ?? '', /^\d+\.\d+\.\d+$/, 'KIT_RELEASE_LANE_UPSTREAM_PNPM');
  assert.match(lane.plugin_pnpm ?? '', /^\d+\.\d+\.\d+$/, 'KIT_RELEASE_LANE_PLUGIN_PNPM');
  for (const key of ['cordis', 'typescript', 'esbuild', 'react', 'react_types', 'node_types']) {
    assert.match(lane[key] ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `KIT_RELEASE_LANE_${key.toUpperCase()}`);
  }
  assert.equal(lane.node, 'v24.19.0', 'KIT_RELEASE_LANE_NODE');
  return {
    ...pin,
    sdk_version: lane.sdk,
    upstream_sha: lane.upstream_sha,
    upstream_lock_sha256: lane.upstream_lock_sha256,
    upstream_pnpm: lane.upstream_pnpm,
    pnpm: lane.plugin_pnpm,
    cordis: lane.cordis,
    typescript: lane.typescript,
    esbuild: lane.esbuild,
    react: lane.react,
    react_types: lane.react_types,
    node_types: lane.node_types,
  };
}

/** Check all fixed inputs without importing tool code or writing plugin links. */
export async function inspectToolchain(upstream, buildTools = defaultBuildTools, closureSha256 = process.env.DSH_SDK_CLOSURE_SHA256) {
  const pinBytes = await readFile(join(toolchainRoot, 'toolchain.json'));
  const pin = await applyReleaseLane(JSON.parse(pinBytes));
  const managers = managerVersions(pin);
  assert.equal(Number(process.versions.node.split('.')[0]), pin.node_major, 'Use the pinned Node major');
  const compact = closureSha256 !== undefined && closureSha256 !== null;
  if (compact) {
    assert.equal(process.env.DSH_RELEASE_LANE_CONFIG, undefined, 'KIT_CLOSURE_LANE_AMBIGUOUS');
    const root = await realpath(dirname(upstream));
    assert.equal(await realpath(upstream), join(root, 'upstream'), 'KIT_CLOSURE_LAYOUT');
    assert.equal(await realpath(buildTools), join(root, 'build-tools'), 'KIT_CLOSURE_LAYOUT');
    await verifySdkClosure(root, closureSha256, pinBytes);
  } else {
    // The read-only final check has the same isolation as preparation stages.
    // Do not forward app credentials or re-enable caller/global Git settings.
    const gitEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
    const git = args => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', upstream, ...args], {
      cwd: upstream, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    }).trim();
    assert.equal(git(['rev-parse', 'HEAD']), pin.upstream_sha, 'Upstream SHA drift');
    assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '', 'Fixed upstream contains local source edits');
  }
  assert.equal(createHash('sha256').update(await readFile(join(upstream, 'pnpm-lock.yaml'))).digest('hex'), pin.upstream_lock_sha256, 'Upstream lock drift');
  const upstreamManifest = JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8'));
  assert.equal(upstreamManifest.packageManager, `pnpm@${managers.upstream}`, 'Upstream package manager drift');
  const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
  const req = createRequire(join(upstream, 'package.json'));
  const web = compact ? req : createRequire(join(upstream, 'apps/web/package.json'));
  const vite = compact ? req : createRequire(web.resolve('vite/package.json'));
  const conversation = compact ? req : createRequire(join(upstream, 'packages/client/ui-conversation/package.json'));
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
  assert.equal(buildManifest.packageManager, `pnpm@${managers.plugins}`, 'Build tools package manager drift');
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
    const expected = name === '@deepseek-ai/cordis'
      ? pin.cordis
      : name.startsWith('@deepseek-ai/dsh-') ? pin.sdk_version : undefined;
    await inspectSdkPackage(target, name, expected);
    bindings.set(name, target);
  }
  for (const [name, resolver, version] of [['react', web, pin.react], ['react-dom', web, pin.react], ['@types/react', conversation, pin.react_types], ['@types/node', req, pin.node_types]]) {
    const packagePath = resolver.resolve(`${name}/package.json`);
    assert.equal((await readJson(packagePath)).version, version);
    bindings.set(name, dirname(packagePath));
  }
  return { pin, bindings, loadCompiler: () => req('typescript'), loadBundler: () => vite('esbuild'),
    loadBrowserModule: name => {
      assert.ok(/^(react|react-dom)(\/[^.][^\\]*)?$/.test(name) && !name.split('/').includes('..'), 'KIT_BROWSER_MODULE');
      return web(name);
    } };
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
  const changes = [];
  const replaceLink = async (link, target) => {
    const temporary = `${link}.replace-${randomUUID()}`;
    try {
      await symlink(target, temporary, 'dir');
      await rename(temporary, link);
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const restore = async () => {
    for (const change of changes.reverse()) {
      if (change.original === null) await rm(change.link, { force: true });
      else await replaceLink(change.link, change.original);
    }
    changes.length = 0;
  };
  try {
    for (const [name, target] of bindings) {
      const link = join(plugin, 'node_modules', name);
      await mkdir(dirname(link), { recursive: true });
      const existing = await lstat(link).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!existing) {
        await replaceLink(link, target);
        if (process.env.DSH_RELEASE_LANE_CONFIG) changes.push({ link, original: null });
        continue;
      }
      assert.ok(existing.isSymbolicLink(), `Refusing to replace existing dependency: ${name}`);
      const existingTarget = await realpath(link), expectedTarget = await realpath(target);
      if (existingTarget === expectedTarget) continue;
      assert.ok(process.env.DSH_RELEASE_LANE_CONFIG, `Existing SDK binding differs: ${name}`);
      const modules = await realpath(join(plugin, 'node_modules'));
      const local = relative(modules, existingTarget);
      assert.ok(local && !local.startsWith('..') && !isAbsolute(local), `Refusing to replace foreign dependency: ${name}`);
      await replaceLink(link, target);
      changes.push({ link, original: existingTarget });
    }
    await bindPackagedDependencies(plugin, process.env.DSH_PACKAGE_INPUTS);
  } catch (error) {
    await restore();
    throw error;
  }
  return { pin, compiler, build: esbuild.build, restore };
}
