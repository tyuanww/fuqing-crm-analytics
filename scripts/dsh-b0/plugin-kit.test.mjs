import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectSdkPackage } from '../../dsh-plugins/plugin-kit/sdk-inputs.mjs';
import { copyPluginKitSources, copyTreeBounded } from './clean-build.mjs';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const kit = join(repository, 'dsh-plugins/plugin-kit');
async function owned(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-kit-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('SDK preflight is read-only and rejects missing, escaping, wrong and non-file entries', async t => {
  const root = await owned(t), sdk = join(root, 'sdk'); await mkdir(sdk);
  const manifest = { name: '@deepseek-ai/fixture', version: '0.1.7-rc.2', main: 'index.js', types: 'index.d.ts' };
  const save = value => writeFile(join(sdk, 'package.json'), JSON.stringify(value));
  await save(manifest); await writeFile(join(sdk, 'index.js'), 'throw Error("must never execute")');
  await writeFile(join(sdk, 'index.d.ts'), 'export {};');
  assert.equal((await inspectSdkPackage(sdk, manifest.name, manifest.version)).version, manifest.version);
  for (const [change, code] of [[{ name: 'wrong' }, 'KIT_SDK_NAME_MISMATCH'], [{ version: '0.2.0' }, 'KIT_SDK_VERSION_MISMATCH'],
    [{ main: 'missing.js' }, 'KIT_SDK_ENTRY_MISSING'], [{ types: '../outside' }, 'KIT_SDK_ENTRY_INVALID'],
    [{ main: '/' }, 'KIT_SDK_ENTRY_INVALID'], [{ main: '.' }, 'KIT_SDK_ENTRY_ESCAPE']]) {
    await save({ ...manifest, ...change });
    await assert.rejects(inspectSdkPackage(sdk, manifest.name, manifest.version), new RegExp(code));
  }
  await writeFile(join(root, 'outside'), 'fixture'); await symlink(join(root, 'outside'), join(sdk, 'escaped.js'));
  await save({ ...manifest, main: 'escaped.js' });
  await assert.rejects(inspectSdkPackage(sdk, manifest.name, manifest.version), /KIT_SDK_ENTRY_ESCAPE/);
  await mkdir(join(sdk, 'directory')); await save({ ...manifest, main: 'directory' });
  await assert.rejects(inspectSdkPackage(sdk, manifest.name, manifest.version), /KIT_SDK_ENTRY_INVALID/);
});

test('kit check rejects invalid/missing inputs without exposing paths or creating outputs', async t => {
  const root = await owned(t);
  for (const args of [[], ['--upstream', 'relative'], ['--upstream', join(root, 'SYNTHETIC_PRIVATE_PATH')]]) {
    await assert.rejects(exec(process.execPath, [join(kit, 'check.mjs'), ...args], { cwd: root }), error => {
      const receipt = JSON.parse(error.stdout);
      assert.equal(error.code, 2); assert.equal(receipt.status, 'BLOCKED');
      assert.equal(receipt.release_ready, false);
      assert.ok(!error.stdout.includes(root)); assert.equal(error.stderr, ''); return true;
    });
  }
});

test('real kit tarball contains only declared source/locks and exposes its public toolchain', async t => {
  const root = await owned(t), source = join(root, 'kit-source');
  await copyPluginKitSources(kit, source, { destinationRoot: root });
  // A credential-like accidental file and dependency directory must not ship.
  await writeFile(join(source, '.env'), 'SYNTHETIC_SENTINEL=do-not-pack\n');
  await mkdir(join(source, 'node_modules')); await writeFile(join(source, 'node_modules', 'sentinel'), 'not a dependency');
  const archive = join(root, 'kit.tgz');
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root, CI: '1',
    COREPACK_HOME: process.env.COREPACK_HOME ?? join(process.env.HOME, '.cache/node/corepack'), COREPACK_ENABLE_NETWORK: '0',
    npm_config_ignore_scripts: 'true' };
  await exec('corepack', ['pnpm', 'pack', '--out', archive], { cwd: source, env, timeout: 30000 });
  await exec('python3', [join(repository, 'scripts/release/secure-unpack.py'), archive, join(root, 'installed'),
    '--max-entries', '100', '--max-bytes', '1048576'], { cwd: root, timeout: 10000 });
  const installed = join(root, 'installed/package');
  const { stdout } = await exec('tar', ['-tzf', archive], { cwd: root });
  assert.ok(!stdout.includes('node_modules') && !stdout.includes('.env'));
  const pkg = JSON.parse(await readFile(join(installed, 'package.json')));
  assert.equal(pkg.private, true); assert.equal(pkg.exports['./toolchain'], './toolchain.mjs');
  await mkdir(join(root, 'consumer/node_modules/@shine-mage'), { recursive: true });
  await symlink(installed, join(root, 'consumer/node_modules/@shine-mage/dsh-plugin-kit'), 'dir');
  const result = await exec(process.execPath, ['--input-type=module', '-e',
    "const m = await import('@shine-mage/dsh-plugin-kit/toolchain'); if(typeof m.inspectToolchain !== 'function'||typeof m.bindToolchain !== 'function') process.exit(1);"], { cwd: join(root, 'consumer'), env });
  assert.equal(result.stderr, '');
  if (process.env.B0_BUILD_UPSTREAM) {
    const plugin = join(root, 'leaf/shine-brand');
    for (const item of ['package.json', 'build.mjs', 'src', 'cordis.patch.yml']) {
      await copyTreeBounded(join(repository, 'dsh-plugins/shine-brand', item), join(plugin, item), { destinationRoot: root });
    }
    await symlink(installed, join(root, 'leaf/plugin-kit'), 'dir');
    const upstream = process.env.B0_BUILD_UPSTREAM, tools = join(kit, 'build-tools');
    const before = await readFile(join(upstream, '.git/index'));
    const check = await exec(process.execPath, [join(installed, 'check.mjs'), '--upstream', upstream, '--build-tools', tools], { cwd: root, env });
    assert.equal(JSON.parse(check.stdout).status, 'READY');
    assert.deepEqual(await readFile(join(upstream, '.git/index')), before, 'read-only preflight changed Git index');
    await exec(process.execPath, [join(plugin, 'build.mjs'), upstream, tools], { cwd: root, env, timeout: 60000 });
    assert.ok((await readFile(join(plugin, 'lib/index.js'))).length > 0);
    await exec(process.execPath, ['--test', join(plugin, 'src/brand-surface.test.mjs'), join(plugin, 'src/client-lifecycle.test.mjs')], { cwd: plugin, env });
    t.diagnostic('actual packed kit: check, isolated shine-brand build and tests PASS; upstream index unchanged');
  } else t.diagnostic('actual packed-kit build NOT_RUN: set B0_BUILD_UPSTREAM to the fixed prepared checkout');
});
