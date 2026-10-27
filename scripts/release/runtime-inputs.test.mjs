import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { access, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindRuntimeInputs, directTarballInputs, recordRuntimePreparation, runtimeDeployArgs, runtimeInputCache, runtimeSourceTree, stageRuntimeWorkspace, verifyRuntimePreparation } from './runtime-inputs.mjs';
import { UPSTREAM_PNPM_VERSION } from './toolchain.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'runtime-inputs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = join(root, 'upstream'), work = join(root, 'work'), stage = join(work, 'workspace');
  await mkdir(upstream);
  await mkdir(work);
  const bytes = Buffer.from('original synthetic pinned archive bytes');
  const url = 'https://example.invalid/fixture-0.20.3.tgz';
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const lock = `packages:\n  fixture@${url}:\n    resolution: {integrity: ${integrity}, tarball: ${url}}\n`;
  await writeFile(join(upstream, 'pnpm-lock.yaml'), lock);
  await writeFile(join(upstream, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n');
  await writeFile(join(upstream, 'package.json'), JSON.stringify({ dependencies: { fixture: url } }));
  await mkdir(join(upstream, 'packages/credentials-local'), { recursive: true });
  await writeFile(join(upstream, 'packages/credentials-local/package.json'), '{"name":"credentials-local"}');
  await writeFile(join(upstream, 'packages/credentials-local/credentials.js'), 'export const controller = true;');
  await writeFile(join(upstream, 'packages/credentials-local/credentials.json'), '{"fixture":"only"}');
  await writeFile(join(upstream, '.env'), 'SYNTHETIC_ONLY=1');
  await writeFile(join(upstream, '.env.js'), 'SYNTHETIC_ONLY=1');
  // Prepared package names are deliberately ambiguous. They cannot identify
  // immutable direct archives and must never be used to reconstruct one.
  for (const version of ['0.18.5', '0.20.3']) {
    const directory = join(upstream, 'node_modules/.pnpm', `fixture@${version}`, 'node_modules/fixture');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version }));
  }
  const input = directTarballInputs(lock)[0];
  await mkdir(runtimeInputCache(upstream));
  const cached = join(runtimeInputCache(upstream), input.name);
  await writeFile(cached, bytes);
  return { upstream, work, stage, lock, bytes, input, cached };
}

test('runtime uses exact original lock-integrity bytes and stages metadata only', async t => {
  const f = await fixture(t);
  const sourceManifest = await readFile(join(f.upstream, 'package.json'));
  await symlink(join(f.upstream, 'node_modules/.pnpm/fixture@0.20.3/node_modules/fixture'), join(f.upstream, 'node_modules/fixture'));
  await stageRuntimeWorkspace(f.upstream, f.stage);
  await access(join(f.stage, 'packages/credentials-local/package.json'));
  await access(join(f.stage, 'packages/credentials-local/credentials.js'));
  await assert.rejects(() => access(join(f.stage, 'packages/credentials-local/credentials.json')), { code: 'ENOENT' });
  await assert.rejects(() => access(join(f.stage, '.env')), { code: 'ENOENT' });
  await assert.rejects(() => access(join(f.stage, '.env.js')), { code: 'ENOENT' });
  assert.ok(!(await readlink(join(f.stage, 'node_modules/fixture'))).startsWith('/'));
  const restore = await bindRuntimeInputs(f.upstream, f.stage, f.work);
  assert.deepEqual(await readFile(join(f.work, 'direct-tarballs', f.input.name)), f.bytes);
  assert.match(await readFile(join(f.stage, 'package.json'), 'utf8'), /file:/);
  assert.deepEqual(await readFile(join(f.upstream, 'package.json')), sourceManifest);
  assert.equal(await readFile(join(f.upstream, 'pnpm-lock.yaml'), 'utf8'), f.lock);
  await restore();
  assert.deepEqual(await readFile(join(f.stage, 'package.json')), sourceManifest);
  await writeFile(join(f.stage, 'node_modules/fixture/package.json'), '{}');
  assert.notEqual(await readFile(join(f.upstream, 'node_modules/fixture/package.json'), 'utf8'), '{}');
});

test('offline runtime rejects missing/corrupt cached archive instead of repacking installed packages', async t => {
  const f = await fixture(t);
  await stageRuntimeWorkspace(f.upstream, f.stage);
  await rm(f.cached);
  await assert.rejects(() => bindRuntimeInputs(f.upstream, f.stage, f.work), /RUNTIME_DIRECT_TARBALL_NOT_PREPARED/);
  await writeFile(f.cached, 'wrong archive');
  await assert.rejects(() => bindRuntimeInputs(f.upstream, f.stage, f.work), /RUNTIME_DIRECT_TARBALL_INTEGRITY_MISMATCH/);
  assert.equal(await readFile(join(f.upstream, 'pnpm-lock.yaml'), 'utf8'), f.lock);
});

test('unsupported or missing direct integrity fails closed', async t => {
  const f = await fixture(t);
  assert.throws(() => directTarballInputs(f.lock.replace(/integrity: [^,]+, /, '')), /LOCK_INVALID/);
  assert.throws(() => directTarballInputs('resolution:\n  tarball: https://example.invalid/x.tgz'), /LOCK_UNSUPPORTED/);
  assert.throws(() => directTarballInputs(f.lock.replace('https:', 'http:').replace('tarball: https:', 'tarball: http:')), /LOCK_INVALID/);
});

test('offline policy reuse requires a prepared receipt bound to the exact lock and policy', async t => {
  const f = await fixture(t);
  await assert.rejects(() => verifyRuntimePreparation(f.upstream), /RUNTIME_PREPARATION_REQUIRED/);
  await recordRuntimePreparation(f.upstream);
  const prepared = await verifyRuntimePreparation(f.upstream);
  assert.equal(prepared.status, 'PREPARED');
  assert.equal(prepared.pnpm, UPSTREAM_PNPM_VERSION, 'official runtime receipt must not follow plugin manager upgrades');
  await writeFile(join(f.upstream, 'packages/credentials-local/runtime-generated.js'), 'export const generated = false;');
  await assert.rejects(() => verifyRuntimePreparation(f.upstream), /RUNTIME_PREPARATION_MISMATCH source_tree/);
  await rm(join(f.upstream, 'packages/credentials-local/runtime-generated.js'));
  await writeFile(join(f.upstream, 'pnpm-workspace.yaml'), 'changed policy');
  await assert.rejects(() => verifyRuntimePreparation(f.upstream), /RUNTIME_PREPARATION_MISMATCH policy_sha256/);
  await writeFile(join(f.upstream, 'pnpm-lock.yaml'), 'changed lock');
  await assert.rejects(() => verifyRuntimePreparation(f.upstream), /RUNTIME_PREPARATION_REQUIRED/);
});

test('source provenance excludes the materialized dependency tree but rejects source drift', async t => {
  const f = await fixture(t);
  await recordRuntimePreparation(f.upstream);
  const dependency = join(f.upstream, 'node_modules/.pnpm/fixture@0.20.3/node_modules/fixture/package.json');
  await writeFile(dependency, JSON.stringify({ name: 'fixture', version: '0.20.3', materialized: 'runtime-deploy' }));
  await assert.doesNotReject(() => verifyRuntimePreparation(f.upstream));
  await writeFile(join(f.upstream, 'packages/credentials-local/source-input.js'), 'export const changed = true;');
  await assert.rejects(() => verifyRuntimePreparation(f.upstream), /RUNTIME_PREPARATION_MISMATCH source_tree/);
});

test('source provenance matches the staged source after omission and symlink normalization', async t => {
  const f = await fixture(t);
  await mkdir(join(f.upstream, 'packages/links'), { recursive: true });
  await symlink('../credentials-local/credentials.js', join(f.upstream, 'packages/links/source.js'));
  await mkdir(join(f.upstream, 'docs'), { recursive: true });
  await writeFile(join(f.upstream, 'docs/credentials.md'), 'omitted documentation');
  await symlink('../credentials-local/credentials.js', join(f.upstream, 'packages/links/cookie'));
  await recordRuntimePreparation(f.upstream);
  const source = await runtimeSourceTree(f.upstream);
  await stageRuntimeWorkspace(f.upstream, f.stage);
  await assert.rejects(() => access(join(f.stage, 'docs/credentials.md')), { code: 'ENOENT' });
  await assert.rejects(() => access(join(f.stage, 'packages/links/cookie')), { code: 'ENOENT' });
  const staged = await runtimeSourceTree(f.stage);
  assert.equal(staged.sha256, source.sha256);
  assert.equal(staged.entries, source.entries);
  await writeFile(join(f.upstream, 'packages/credentials-local/credentials.json'), '{"ignored":"changed"}');
  await assert.doesNotReject(() => verifyRuntimePreparation(f.upstream));
  await writeFile(join(f.upstream, 'packages/credentials-local/credentials.js'), 'export const controller = false;');
  await assert.rejects(() => verifyRuntimePreparation(f.upstream), /RUNTIME_PREPARATION_MISMATCH source_tree/);
});

test('offline deployment intercepts HTTP, fetch and raw sockets before connecting', async () => {
  const script = `import assert from 'node:assert/strict';
    import { request } from 'node:https';
    import { connect } from 'node:net';
    for (const operation of [() => request('https://example.invalid'), () => fetch('https://example.invalid'), () => connect({host: 'example.invalid', port: 443})]) {
      assert.throws(operation, /RUNTIME_OFFLINE_NETWORK_DENIED/);
    }`;
  await promisify(execFile)(process.execPath, ['--require', fileURLToPath(new URL('./runtime-offline.cjs', import.meta.url)), '--input-type=module', '-e', script], { timeout: 5000 });
});

test('real pnpm deploy keeps locked versions with empty metadata cache and no network', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runtime-frozen-deploy-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exec = promisify(execFile);
  const workspace = join(root, 'workspace');
  await mkdir(join(workspace, 'apps/cli'), { recursive: true });
  await mkdir(join(root, 'archive/package'), { recursive: true });
  await writeFile(join(root, 'archive/package/package.json'), JSON.stringify({ name: 'dsh-synthetic-lock-probe', version: '1.0.0', main: 'index.js' }));
  await writeFile(join(root, 'archive/package/index.js'), 'module.exports = "locked-1.0.0";');
  const archive = join(root, 'original.tgz');
  await exec('tar', ['-czf', archive, '-C', join(root, 'archive'), 'package']);
  const integrity = `sha512-${createHash('sha512').update(await readFile(archive)).digest('base64')}`;
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ private: true, packageManager: `pnpm@${UPSTREAM_PNPM_VERSION}` }));
  await writeFile(join(workspace, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
  await writeFile(join(workspace, 'apps/cli/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.0.0', files: ['index.cjs'], dependencies: { 'dsh-synthetic-lock-probe': '^1.0.0' } }));
  await writeFile(join(workspace, 'apps/cli/index.cjs'), 'console.log(require("dsh-synthetic-lock-probe"));');
  const lock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .: {}
  apps/cli:
    dependencies:
      dsh-synthetic-lock-probe:
        specifier: ^1.0.0
        version: 1.0.0
packages:
  dsh-synthetic-lock-probe@1.0.0:
    resolution: {integrity: ${integrity}, tarball: 'file:${archive}'}
snapshots:
  dsh-synthetic-lock-probe@1.0.0: {}
`;
  await writeFile(join(workspace, 'pnpm-lock.yaml'), lock);
  const destination = join(root, 'deployed');
  const guard = fileURLToPath(new URL('./runtime-offline.cjs', import.meta.url));
  const offlineEnv = { ...process.env, CI: '1', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', NODE_OPTIONS: `--require ${JSON.stringify(guard)}` };
  const manager = await exec('corepack', ['pnpm', '--version'], { cwd: workspace, timeout: 5000, env: offlineEnv });
  assert.equal(manager.stdout.trim(), UPSTREAM_PNPM_VERSION);
  await exec('corepack', [...runtimeDeployArgs(destination), '--cache-dir', join(root, 'empty-cache'), '--store-dir', join(root, 'empty-store')], {
    cwd: workspace, timeout: 30000, env: offlineEnv,
  });
  const result = await exec(process.execPath, [join(destination, 'index.cjs')], { cwd: root });
  assert.equal(result.stdout.trim(), 'locked-1.0.0');
  assert.equal(await readFile(join(workspace, 'pnpm-lock.yaml'), 'utf8'), lock);
});

test('killing a bound runtime operation cannot mutate the original checkout', async t => {
  const f = await fixture(t);
  const sourceManifest = await readFile(join(f.upstream, 'package.json'));
  const script = `import { stageRuntimeWorkspace, bindRuntimeInputs } from ${JSON.stringify(import.meta.resolve('./runtime-inputs.mjs'))};
    const [source, stage, work] = process.argv.slice(1);
    await stageRuntimeWorkspace(source, stage);
    await bindRuntimeInputs(source, stage, work);
    console.log('BOUND');
    setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, f.upstream, f.stage, f.work], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('bind timeout')), 5000);
    child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`premature exit ${code}`)); });
  });
  child.kill('SIGTERM');
  assert.equal((await exited).signal, 'SIGTERM');
  assert.deepEqual(await readFile(join(f.upstream, 'package.json')), sourceManifest);
  assert.equal(await readFile(join(f.upstream, 'pnpm-lock.yaml'), 'utf8'), f.lock);
  await access(join(f.upstream, 'node_modules/.pnpm/fixture@0.20.3/node_modules/fixture/package.json'));
});
