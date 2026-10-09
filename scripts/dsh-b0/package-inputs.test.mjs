/** Real npm tarball, Node import, TypeScript and isolated build boundary proofs. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
let independent, producer, inputs, artifact, generatedArtifact;
before(async () => {
  independent = await mkdtemp(join(tmpdir(), 'board-components-independent-'));
  producer = join(independent, 'board-components');
  const generatedInputs = join(independent, 'inputs');
  generatedArtifact = join(generatedInputs, entry.tarball);
  inputs = process.env.DSH_PACKAGE_INPUTS ? resolve(process.env.DSH_PACKAGE_INPUTS) : join(independent, 'inputs');
  const options = { destinationRoot: independent };
  for (const part of ['package.json', 'build.mjs', 'src', 'test']) {
    await copyTreeBounded(join(repository, 'dsh-plugins/board-components', part), join(producer, part), options);
  }
  await copyPluginKitSources(join(repository, 'dsh-plugins/plugin-kit'), join(independent, 'plugin-kit'), options);
  await linkWorkspaceKit(producer, join(independent, 'plugin-kit'));
  run(process.execPath, [join(producer, 'build.mjs'), generatedInputs], independent);
  // A platform-specific pnpm pack may differ in gzip metadata even when the
  // archive members are byte-identical. Consumers must use the explicitly
  // locked input when the pipeline supplies one; the local rebuild remains
  // checked below for member-level reproducibility.
  artifact = process.env.DSH_PACKAGE_INPUTS ? join(inputs, entry.tarball) : generatedArtifact;
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
  if (process.env.DSH_PACKAGE_INPUTS) {
    const rebuilt = await readPackagedLibrary(generatedArtifact);
    const repeated = await readPackagedLibrary(join(again, entry.tarball));
    const locked = await readPackagedLibrary(artifact, entry);
    assert.deepEqual([...rebuilt.files.entries()], [...repeated.files.entries()]);
    assert.deepEqual([...rebuilt.files.entries()], [...locked.files.entries()]);
  } else {
    assert.deepEqual(await readFile(artifact), await readFile(join(again, entry.tarball)));
  }
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

test('real offline frozen pnpm tarball installation is reused unchanged and all drift fails closed', async t => {
  const f = await consumer(t);
  f.manifest.private = true;
  f.manifest.packageManager = JSON.parse(await readFile(join(producer, 'package.json'))).packageManager;
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

test('independent workbench fixtures match their tracked contract owners byte for byte', async () => {
  const fixtures = join(repository, 'dsh-plugins/analytics-workbench/test/fixtures/coordinator');
  const provenance = JSON.parse(await readFile(join(fixtures, 'provenance.json')));
  assert.equal(provenance.schema_version, 'plugin-test-contract-fixtures/v1');
  const sources = {
    'analytics_first_purchase_v1_expected.json': 'backend/tests/fixtures/analytics_first_purchase_v1_expected.json',
    'analytics_first_purchase_v1_missing_role_expected.json': 'backend/tests/fixtures/analytics_first_purchase_v1_missing_role_expected.json',
    'frozen-contract-v0.json': 'docs/hackathon/free-html-cockpit/fixtures/frozen-contract-v0.json',
    'd48-scope.fixture.json': 'docs/hackathon/free-html-cockpit/fixtures/d48-scope.fixture.json',
    'analytics-page.openapi.json': 'backend/contracts/analytics-page.openapi.json',
  };
  assert.deepEqual(provenance.files.map(item => item.name).sort(), Object.keys(sources).sort());
  for (const record of provenance.files) {
    assert.equal(record.source_path, sources[record.name]);
    const expected = await readFile(join(repository, record.source_path));
    const actual = await readFile(join(fixtures, record.name));
    assert.equal(digest(actual), record.sha256, `fixture provenance digest: ${record.name}`);
    assert.deepEqual(actual, expected, `update the reviewed independent fixture with its owner: ${record.source_path}`);
  }
});

test('author destination resolves parent aliases before writes and allows outside aliases', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-author-destination-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), sourceDirectory = join(source, 'src');
  await mkdir(sourceDirectory, { recursive: true });
  const author = await readFile(join(repository, 'dsh-plugins/analytics-workbench/author-inputs.mjs'));
  await writeFile(join(source, 'author-inputs.mjs'), author);
  await writeFile(join(source, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.2' }));
  await writeFile(join(sourceDirectory, 'original.txt'), 'source must stay unchanged');
  const kit = join(root, 'kit.tgz'), domain = join(root, 'domain'), preload = join(root, 'stop-before-install.cjs');
  const bytes = Buffer.from('guard-only fixture: stopped before package manager execution');
  await writeFile(kit, bytes); await mkdir(domain);
  await writeFile(preload, "require('node:child_process').execFileSync = () => { throw new Error('AUTHOR_TEST_STOP_BEFORE_PACKAGE_MANAGER'); }; require('node:module').syncBuiltinESMExports();\n");
  const invoke = destination => {
    try {
      execFileSync(process.execPath, ['--require', preload, join(source, 'author-inputs.mjs'),
        '--destination', destination, '--kit', kit, '--kit-sha256', digest(bytes), '--package-inputs', domain],
      { cwd: root, env: { COREPACK_HOME: root }, encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
      assert.fail('guard probe unexpectedly completed');
    } catch (error) {
      assert.equal(error.status, 1);
      return String(error.stderr);
    }
  };
  const insideAlias = join(root, 'inside-alias'); await symlink(sourceDirectory, insideAlias, 'dir');
  const rejected = invoke(join(insideAlias, 'new-author'));
  t.diagnostic(JSON.stringify({ author_sha256: digest(author), source_was_written: (await readdir(sourceDirectory)).includes('new-author'),
    destination_guard_rejected: rejected.includes('AUTHOR_DESTINATION_OUTSIDE_SOURCE') }));
  assert.match(rejected, /AUTHOR_DESTINATION_OUTSIDE_SOURCE/);
  assert.deepEqual(await readdir(sourceDirectory), ['original.txt']);
  assert.deepEqual((await readdir(source)).sort(), ['author-inputs.mjs', 'package.json', 'src']);
  assert.equal(await readFile(join(sourceDirectory, 'original.txt'), 'utf8'), 'source must stay unchanged');
  const outside = join(root, 'outside'), outsideAlias = join(root, 'outside-alias');
  await mkdir(outside); await symlink(outside, outsideAlias, 'dir');
  // The plain tmpdir path also covers macOS /var -> /private canonicalization.
  for (const [parent, name] of [[root, 'plain-author'], [outsideAlias, 'aliased-author']]) {
    const destination = join(parent, name);
    assert.match(invoke(destination), /AUTHOR_TEST_STOP_BEFORE_PACKAGE_MANAGER/);
    assert.deepEqual(await readFile(join(destination, 'inputs/kit.tgz')), bytes);
    assert.match(invoke(destination), /EEXIST/);
  }
  assert.deepEqual(await readdir(sourceDirectory), ['original.txt']);
});
