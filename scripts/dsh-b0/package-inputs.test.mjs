/** Actual fixed library/consumer archives, public types and offline installation. No private producer source. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindPackagedDependencies, readPackagedLibrary, validatePackageLock, DEV_KIT_NAME } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';
import { readDomainComposition } from './domain-package-inputs.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const buildTools = process.env.B0_BUILD_TOOLS;
assert.ok(isAbsolute(buildTools ?? ''), 'DOMAIN_PUBLIC_TYPE_TOOLS_REQUIRED');
const tools = createRequire(join(buildTools, 'package.json'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, cwd) => execFileSync(command, args, { cwd, timeout: 60000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', stdio: 'pipe' });
let independent, inputs, artifact, lockSource, entry, evidence;
before(async () => {
  independent = await mkdtemp(join(tmpdir(), 'domain-public-consumer-'));
  const result = await readDomainComposition({ archivePath: process.env.DOMAIN_AUTHOR_CI_ARCHIVE,
    packageInputs: process.env.DSH_PACKAGE_INPUTS, pageInputsPath: process.env.CRM_COMPOSITION_PAGE_INPUTS,
    python: process.env.FQ_B0_PYTHON, output: join(independent, 'published') });
  ({ inputs, artifact, lockSource, entry, evidence } = result);
});
after(async () => { if (independent) await rm(independent, { recursive: true, force: true }); });

async function consumer(t) {
  const root = await mkdtemp(join(tmpdir(), 'board-components-consumer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = { name: '@shine-mage/fixture', type: 'module', files: ['lib/', 'bundled-dependencies.json'],
    devDependencies: { [entry.name]: entry.version } };
  const lock = structuredClone(lockSource);
  const save = async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    await writeFile(join(root, 'bundled-dependencies.json'), JSON.stringify(lock));
  };
  await save(); return { root, manifest, lock, save };
}

test('the fixed owner CI and three actual published consumer locks bind the same original library input', async () => {
  const pack = await readPackagedLibrary(artifact, entry);
  assert.deepEqual([...pack.files.keys()].sort(), ['lib/funnel.d.mts', 'lib/funnel.mjs', 'lib/waterfall.d.mts', 'lib/waterfall.mjs', 'package.json']);
  assert.equal(evidence.source_execution_here, 'NOT_RUN_AUTHOR_OWNED');
  assert.deepEqual(evidence.groups.map(row => row.counts.pass), [28, 6]);
  assert.equal(evidence.release_ready, false);
});

test('packed public exports run and typecheck without any provider source tree', async t => {
  const f = await consumer(t);
  await bindPackagedDependencies(f.root, inputs);
  const sample = `import { funnelGeometry, type FunnelGeometry } from '@shine-mage/board-components/funnel';
import { waterfallGeometry, type WaterfallGeometry } from '@shine-mage/board-components/waterfall';
const funnel: FunnelGeometry | null = funnelGeometry(null);
const waterfall: WaterfallGeometry | null = waterfallGeometry(null);
// @ts-expect-error public declarations must reject an invalid field
if (funnel) funnel.stages[0].imaginary;
// @ts-expect-error public declarations must reject an invalid field
if (waterfall) waterfall.bars[0].imaginary;
console.log(JSON.stringify([funnel, waterfall]));`;
  await writeFile(join(f.root, 'consumer.mts'), sample);
  const ts = tools('typescript');
  assert.equal(ts.version, '6.0.3', 'DOMAIN_PUBLIC_TYPESCRIPT_PIN');
  const program = ts.createProgram([join(f.root, 'consumer.mts')], { strict: true, noEmit: true, skipLibCheck: false,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2023, types: [] });
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0, ts.formatDiagnostics(ts.getPreEmitDiagnostics(program), {
    getCanonicalFileName: n => n, getCurrentDirectory: () => f.root, getNewLine: () => '\n' }));
  const esm = sample.replace(/, type (FunnelGeometry|WaterfallGeometry)/g, '').replace(/: (FunnelGeometry|WaterfallGeometry) \| null/g, '');
  await writeFile(join(f.root, 'consumer.mjs'), esm);
  assert.equal(run(process.execPath, ['consumer.mjs'], f.root).trim(), '[null,null]');
  assert.match(run(process.execPath, ['--input-type=module', '-e',
    "try { await import('@shine-mage/board-components/src/funnel.mjs'); process.exit(1); } catch(e) { if(e.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw e; console.log(e.code); }"], f.root), /ERR_PACKAGE_PATH_NOT_EXPORTED/);
});

test('missing, changed or symlinked tarballs fail before creating a dependency', async t => {
  const f = await consumer(t), other = join(f.root, 'inputs');
  await mkdir(other);
  await assert.rejects(() => bindPackagedDependencies(f.root, other), /PACKAGE_INPUT_REQUIRED/);
  await writeFile(join(other, entry.tarball), Buffer.concat([await readFile(artifact), Buffer.from('corruption')]));
  await assert.rejects(() => bindPackagedDependencies(f.root, other), /PACKAGE_INPUT_DIGEST/);
  await rm(join(other, entry.tarball)); await symlink(artifact, join(other, entry.tarball));
  await assert.rejects(() => bindPackagedDependencies(f.root, other), /PACKAGE_INPUT_FILE_INVALID/);
  assert.ok(!(await readdir(f.root)).includes('node_modules'));
});

test('unlocked versions, registry links and unrecorded dependencies fail closed', async t => {
  const f = await consumer(t);
  for (const value of ['^0.1.0', 'workspace:*', 'file:../board-components']) {
    f.manifest.devDependencies[entry.name] = value; await f.save();
    await assert.rejects(() => bindPackagedDependencies(f.root, inputs), /PACKAGE_LOCK_DECLARATION/);
  }
  f.manifest.devDependencies[entry.name] = entry.version; f.manifest.devDependencies['@shine-mage/unreviewed'] = '1.0.0'; await f.save();
  await assert.rejects(() => bindPackagedDependencies(f.root, inputs), /PACKAGE_LOCK_MISSING/);
});

test('development kit is separate from locked runtime business inputs', async t => {
  const f = await consumer(t);
  f.manifest.devDependencies[DEV_KIT_NAME] = '0.1.0'; await f.save();
  await bindPackagedDependencies(f.root, inputs);
  await assert.rejects(readFile(join(f.root, 'node_modules', DEV_KIT_NAME, 'package.json')), { code: 'ENOENT' });
  f.lock.packages.push({ name: DEV_KIT_NAME, version: '0.1.0', tarball: 'shine-mage-dsh-plugin-kit-0.1.0.tgz', sha256: 'a'.repeat(64) });
  assert.throws(() => validatePackageLock(f.lock, f.manifest), /PACKAGE_KIT_MUST_NOT_BE_BUNDLED/);
});

test('installed input drift and unrelated dependency bindings are never silently replaced', async t => {
  const f = await consumer(t); await bindPackagedDependencies(f.root, inputs);
  const source = join(f.root, 'node_modules/@shine-mage/board-components/lib/funnel.mjs');
  await writeFile(source, 'export const changed = true;');
  await assert.rejects(() => bindPackagedDependencies(f.root, inputs), /PACKAGE_INSTALLED_DRIFT/);
  assert.equal(await readFile(source, 'utf8'), 'export const changed = true;');
  const g = await consumer(t);
  await mkdir(join(g.root, 'node_modules/@shine-mage'), { recursive: true });
  const foreign = join(g.root, 'foreign'); await mkdir(foreign);
  await writeFile(join(foreign, 'package.json'), JSON.stringify({ name: entry.name }));
  await symlink(foreign, join(g.root, 'node_modules/@shine-mage/board-components'));
  await assert.rejects(() => bindPackagedDependencies(g.root, inputs), /PACKAGE_BINDING_FOREIGN/);
  assert.equal(JSON.parse(await readFile(join(foreign, 'package.json'))).name, entry.name);
});

async function mutated(t, change) {
  const root = await mkdtemp(join(tmpdir(), 'board-components-bad-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { files } = await readPackagedLibrary(artifact);
  for (const [name, bytes] of files) { await mkdir(dirname(join(root, 'package', name)), { recursive: true }); await writeFile(join(root, 'package', name), bytes); }
  const manifest = JSON.parse(files.get('package.json'));
  await change(root, manifest);
  await writeFile(join(root, 'package/package.json'), JSON.stringify(manifest));
  const paths = ['package/package.json', ...manifest.files.map(name => `package/${name}`)];
  const tarball = join(root, 'mutated.tgz');
  run('tar', ['-czf', tarball, '--', ...paths], root);
  return tarball;
}
test('missing export types, native hooks and archive symlinks are rejected', async t => {
  const missing = await mutated(t, async (_root, manifest) => { manifest.exports['./funnel'].types = './lib/absent.d.mts'; });
  await assert.rejects(() => readPackagedLibrary(missing), /PACKAGE_INPUT_EXPORT_MISSING/);
  const script = await mutated(t, async (_root, manifest) => { manifest.scripts = { postinstall: 'must never execute' }; });
  await assert.rejects(() => readPackagedLibrary(script), /PACKAGE_INPUT_FORBIDDEN scripts/);
  const linked = await mutated(t, async root => { const path = join(root, 'package/lib/funnel.mjs'); await rm(path); await symlink('/etc/passwd', path); });
  await assert.rejects(() => readPackagedLibrary(linked), /PACKAGE_INPUT_SPECIAL/);
});

test('real offline frozen pnpm tarball installation is reused unchanged and all drift fails closed', async t => {
  const f = await consumer(t);
  f.manifest.private = true;
  f.manifest.packageManager = 'pnpm@11.28.2';
  await f.save();
  await writeFile(join(f.root, 'pnpm-workspace.yaml'), `packages:\n  - '.'\nautoInstallPeers: false\noverrides:\n  '${entry.name}': ${JSON.stringify(`file:${artifact}`)}\n`);
  const env = { ...process.env, CI: '', COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0',
    npm_config_offline: 'true' };
  const install = args => execFileSync('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', join(f.root, 'store'), ...args],
    { cwd: f.root, env, encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
  install(['--lockfile-only']);
  const lock = await readFile(join(f.root, 'pnpm-lock.yaml'));
  install(['--frozen-lockfile']);
  const { realpath, lstat, readlink } = await import('node:fs/promises');
  const link = join(f.root, 'node_modules', entry.name), target = await realpath(link), originalLink = await readlink(link);
  assert.ok(target.includes('/node_modules/.pnpm/'));
  const pristine = await readPackagedLibrary(artifact, entry);
  const aliased = await consumer(t);
  await symlink(join(f.root, 'node_modules'), join(aliased.root, 'node_modules'), 'dir');
  await assert.rejects(bindPackagedDependencies(aliased.root, inputs), /PACKAGE_BINDING_DIRECTORY/);
  await bindPackagedDependencies(f.root, inputs);
  assert.equal(await readlink(link), originalLink);
  await assert.rejects(lstat(join(f.root, 'node_modules/.shinemage-bundled')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(f.root, 'pnpm-lock.yaml')), lock);
  for (const name of ['lib/funnel.mjs', 'package.json']) {
    const path = join(target, name), bytes = await readFile(path);
    await writeFile(path, name === 'package.json' ? JSON.stringify({ name: 'wrong' }) : 'export const changed = true;');
    await assert.rejects(bindPackagedDependencies(f.root, inputs), /PACKAGE_INSTALLED_DRIFT/);
    await writeFile(path, bytes);
  }
  const extra = join(target, 'lib/extra.mjs'); await writeFile(extra, 'extra');
  await assert.rejects(bindPackagedDependencies(f.root, inputs), /PACKAGE_INSTALLED_ENTRIES/); await rm(extra);
  const member = join(target, 'lib/funnel.mjs'), bytes = await readFile(member);
  await rm(member); await symlink(join(target, 'lib/waterfall.mjs'), member);
  await assert.rejects(bindPackagedDependencies(f.root, inputs), /PACKAGE_INPUT_FILE_INVALID/); await rm(member);
  run('mkfifo', [member], f.root);
  await assert.rejects(bindPackagedDependencies(f.root, inputs), /PACKAGE_INPUT_FILE_INVALID/); await rm(member); await writeFile(member, bytes);
  const badInputs = join(f.root, 'bad-inputs'); await mkdir(badInputs);
  await writeFile(join(badInputs, entry.tarball), Buffer.concat([await readFile(artifact), Buffer.from('changed')]));
  await assert.rejects(bindPackagedDependencies(f.root, badInputs), /PACKAGE_INPUT_DIGEST/);
  await bindPackagedDependencies(f.root, inputs);
  assert.equal(await readlink(link), originalLink);
  for (const [name, content] of pristine.files) assert.deepEqual(await readFile(join(target, name)), content);
  assert.equal(digest(await readFile(artifact)), entry.sha256);
  t.diagnostic('real pnpm offline lock creation + frozen installation; original link, all bytes and lock preserved; file/manifest/extra/symlink/FIFO/wrong tar rejected');
});
