/** Real npm tarball, Node import, TypeScript and isolated build boundary proofs. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindPackagedDependencies, readPackagedLibrary, validatePackageLock, DEV_KIT_NAME } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';
import { copyPluginKitSources, copyTreeBounded } from './clean-build.mjs';
import { linkWorkspaceKit } from './plugin-kit-link.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const tools = createRequire(join(repository, 'dsh-plugins/plugin-kit/build-tools/package.json'));
const lockSource = JSON.parse(await readFile(join(repository, 'dsh-plugins/analytics-workbench/bundled-dependencies.json'), 'utf8'));
const entry = lockSource.packages[0];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, cwd) => execFileSync(command, args, { cwd, timeout: 60000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', stdio: 'pipe' });
let independent, producer, inputs, artifact;
before(async () => {
  independent = await mkdtemp(join(tmpdir(), 'board-components-independent-'));
  producer = join(independent, 'board-components'); inputs = join(independent, 'inputs');
  const options = { destinationRoot: independent };
  for (const part of ['package.json', 'build.mjs', 'src', 'test']) {
    await copyTreeBounded(join(repository, 'dsh-plugins/board-components', part), join(producer, part), options);
  }
  await copyPluginKitSources(join(repository, 'dsh-plugins/plugin-kit'), join(independent, 'plugin-kit'), options);
  await linkWorkspaceKit(producer, join(independent, 'plugin-kit'));
  run(process.execPath, [join(producer, 'build.mjs'), inputs], independent);
  artifact = join(inputs, entry.tarball);
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

test('domain-only build is reproducible and the same tarball is pinned by all consumers', async t => {
  assert.deepEqual((await readdir(independent)).sort(), ['board-components', 'inputs', 'plugin-kit']);
  run(process.execPath, ['--test', join(producer, 'test/geometry.test.mjs')], producer);
  const again = join(independent, 'second-output');
  run(process.execPath, [join(producer, 'build.mjs'), again], independent);
  assert.deepEqual(await readFile(artifact), await readFile(join(again, entry.tarball)));
  const pack = await readPackagedLibrary(artifact, entry);
  assert.deepEqual([...pack.files.keys()].sort(), ['lib/funnel.d.mts', 'lib/funnel.mjs', 'lib/waterfall.d.mts', 'lib/waterfall.mjs', 'package.json']);
  for (const name of ['analytics-workbench', 'shine-funnel', 'shine-waterfall']) {
    assert.deepEqual(JSON.parse(await readFile(join(repository, 'dsh-plugins', name, 'bundled-dependencies.json'), 'utf8')), lockSource);
  }
  t.diagnostic(JSON.stringify({ scope: 'isolated-domain-package', package: pack.manifest.name, sha256: pack.sha256, bytes: (await readFile(artifact)).length, sibling_plugin_sources: false, release_approval: 'NOT_RUN' }));
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
  await symlink(producer, join(g.root, 'node_modules/@shine-mage/board-components'));
  await assert.rejects(() => bindPackagedDependencies(g.root, inputs), /PACKAGE_BINDING_FOREIGN/);
  assert.equal(JSON.parse(await readFile(join(producer, 'package.json'))).name, entry.name);
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

test('same-version changed output cannot replace the original immutable tarball', async t => {
  const root = await mkdtemp(join(tmpdir(), 'board-components-conflict-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'inputs'); await mkdir(output);
  await copyFile(artifact, join(output, entry.tarball));
  // This producer is a command-owned fixture. No repository source is mutated.
  const fixture = join(root, 'board-components');
  for (const part of ['package.json', 'build.mjs', 'src']) await copyTreeBounded(join(producer, part), join(fixture, part), { destinationRoot: root });
  await copyTreeBounded(join(independent, 'plugin-kit'), join(root, 'plugin-kit'), { destinationRoot: root });
  await linkWorkspaceKit(fixture, join(root, 'plugin-kit'));
  await writeFile(join(fixture, 'src/funnel.mjs'), 'export const funnelGeometry = () => null;\n');
  assert.throws(() => run(process.execPath, [join(fixture, 'build.mjs'), output], root), /PACKAGE_OUTPUT_CONFLICT/);
  assert.equal(digest(await readFile(join(output, entry.tarball))), entry.sha256);
});

test('producer rejects a floating declaration and a mismatched actual manager before writing output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'board-components-manager-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = join(root, 'producer'), output = join(root, 'output'), bin = join(root, 'bin');
  for (const part of ['package.json', 'build.mjs', 'src']) {
    await copyTreeBounded(join(producer, part), join(fixture, part), { destinationRoot: root });
  }
  await linkWorkspaceKit(fixture, join(independent, 'plugin-kit'));
  await mkdir(bin);
  await writeFile(join(bin, 'pnpm'), '#!/bin/sh\necho 0.0.0\n', { mode: 0o700 });
  const manifest = JSON.parse(await readFile(join(fixture, 'package.json')));
  const build = () => execFileSync(process.execPath, [join(fixture, 'build.mjs'), output], {
    cwd: root, env: { PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root },
    timeout: 10000, stdio: 'pipe',
  });
  for (const [version, code] of [['latest', /PACKAGE_MANAGER_EXACT/], ['11.28.2', /Use the package-declared pnpm version/]]) {
    manifest.packageManager = `pnpm@${version}`;
    await writeFile(join(fixture, 'package.json'), JSON.stringify(manifest));
    assert.throws(build, code);
    await assert.rejects(readdir(output), { code: 'ENOENT' });
  }
});
