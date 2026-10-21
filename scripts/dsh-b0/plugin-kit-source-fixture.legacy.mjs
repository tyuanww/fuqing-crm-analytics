/** Historical ten-source installed-kit fixture, preserved 2026-10-11.
 * Explicit manual entry only; default B0 uses the current kit test and fixed
 * package consumers. NOT_RUN in this migration; no old PASS is inherited.
 * Original body SHA-256: 58e53d3e01af0cda93cab531aff76a133a6eb4d3cfed62d13b3972349ea7c29e
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readPackagedLibrary, validatePackageLock } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';
import { inspectSdkPackage } from '../../dsh-plugins/plugin-kit/sdk-inputs.mjs';
import { copyPluginKitSources, copyTreeBounded } from './clean-build.mjs';
import { linkWorkspaceKit, linkRepositoryKit } from './plugin-kit-link.mjs';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const kit = join(repository, 'dsh-plugins/plugin-kit');
// Test-only trial: never rewrite the repository kit or official SDK's pin.
// Corepack's explicit version command runs from the caller-owned offline cache.
function managerTrial(declared, candidate) {
  assert.match(declared, /^pnpm@\d+\.\d+\.\d+$/, 'KIT_TEST_MANAGER_DECLARATION');
  if (candidate !== undefined) assert.match(candidate, /^\d+\.\d+\.\d+$/, 'KIT_TEST_MANAGER_EXACT');
  return { command: candidate === undefined ? 'pnpm' : `pnpm@${candidate}`,
    version: candidate ?? declared.slice('pnpm@'.length) };
}

// Explicit domain artifacts retain their release-byte identity. A rebuild is
// compared separately and must never become another consumer's input.
async function immutableDomainInput(directory) {
  if (directory === undefined) return null;
  assert.ok(typeof directory === 'string' && isAbsolute(directory), 'KIT_TEST_DOMAIN_INPUT_ABSOLUTE');
  const info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'KIT_TEST_DOMAIN_INPUT_DIRECTORY');
  const locks = [];
  let entry;
  for (const name of ['shine-funnel', 'shine-waterfall', 'analytics-workbench']) {
    const consumer = join(repository, 'dsh-plugins', name), path = join(consumer, 'bundled-dependencies.json');
    const bytes = await readFile(path);
    const lock = validatePackageLock(JSON.parse(bytes), JSON.parse(await readFile(join(consumer, 'package.json'))));
    const candidate = lock.packages.find(item => item.name === '@shine-mage/board-components');
    assert.ok(candidate, 'KIT_TEST_DOMAIN_LOCK_REQUIRED');
    if (entry) assert.deepEqual(candidate, entry, 'KIT_TEST_DOMAIN_LOCK_DISAGREEMENT');
    entry = candidate; locks.push({ path, bytes });
  }
  const path = join(directory, entry.tarball);
  return { directory, path, entry, locks, ...await readPackagedLibrary(path, entry) };
}

test('candidate manager selection rejects floating versions without changing the default declaration', () => {
  assert.deepEqual(managerTrial('pnpm@11.7.0'), { command: 'pnpm', version: '11.7.0' });
  assert.deepEqual(managerTrial('pnpm@11.7.0', '11.28.2'), { command: 'pnpm@11.28.2', version: '11.28.2' });
  for (const value of ['', 'latest', '^11.28.2', '11', '11.28.2 --help', 'https://example.test/manager']) {
    assert.throws(() => managerTrial('pnpm@11.7.0', value), /KIT_TEST_MANAGER_EXACT/);
  }
});

async function owned(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-kit-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('immutable domain input rejects relative and empty paths without fallback', async () => {
  for (const value of ['', 'relative-input']) {
    await assert.rejects(immutableDomainInput(value), /KIT_TEST_DOMAIN_INPUT_ABSOLUTE/);
  }
  assert.equal(await immutableDomainInput(undefined), null);
});

test('immutable domain input rejects a missing locked archive without fallback', async t => {
  const root = await owned(t);
  await assert.rejects(immutableDomainInput(root), { code: 'ENOENT' });
  assert.deepEqual(await readdir(root), []);
  const alias = join(root, 'alias'); await symlink(root, alias, 'dir');
  await assert.rejects(immutableDomainInput(alias), /KIT_TEST_DOMAIN_INPUT_DIRECTORY/);
});

test('immutable domain input rejects byte drift even when the tar contents are unchanged', async t => {
  const root = await owned(t);
  const fixture = join(root, 'fixture'), input = join(root, 'input');
  await mkdir(join(fixture, 'package/lib'), { recursive: true }); await mkdir(input);
  const manifest = { name: '@shine-mage/board-components', version: '0.1.0', type: 'module',
    files: ['lib/funnel.mjs', 'lib/funnel.d.mts'],
    exports: { './funnel': { types: './lib/funnel.d.mts', import: './lib/funnel.mjs' } } };
  await writeFile(join(fixture, 'package/package.json'), JSON.stringify(manifest));
  await writeFile(join(fixture, 'package/lib/funnel.mjs'), 'export const fixture = true;');
  await writeFile(join(fixture, 'package/lib/funnel.d.mts'), 'export declare const fixture: true;');
  const originalPath = join(root, 'fixture.tgz');
  await exec('tar', ['-czf', originalPath, 'package/package.json', ...manifest.files.map(file => `package/${file}`)],
    { cwd: fixture, env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const original = await readPackagedLibrary(originalPath);
  const changed = Buffer.from(await readFile(originalPath));
  // Gzip MTIME is metadata: tar payload and all package files remain identical.
  changed[4] ^= 1;
  const path = join(input, 'shine-mage-board-components-0.1.0.tgz');
  await writeFile(path, changed);
  const decoded = await readPackagedLibrary(path);
  assert.notEqual(decoded.sha256, original.sha256);
  assert.deepEqual(decoded.files, original.files);
  await assert.rejects(readPackagedLibrary(path, { name: manifest.name, version: manifest.version, sha256: original.sha256 }), /PACKAGE_INPUT_DIGEST/);
  await assert.rejects(immutableDomainInput(input), /PACKAGE_INPUT_DIGEST/);
  assert.equal((await readPackagedLibrary(originalPath)).sha256, original.sha256);
});

test('candidate trial rejects missing or relative SDK and cache inputs before packaging', async t => {
  const root = await owned(t), home = join(root, 'home'), tmp = join(root, 'tmp');
  await mkdir(home); await mkdir(tmp);
  const inputs = ['B0_BUILD_UPSTREAM', 'B0_BUILD_TOOLS', 'COREPACK_HOME'];
  const base = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, TMPDIR: tmp,
    COREPACK_ENABLE_NETWORK: '0', B0_TEST_PNPM_VERSION: '11.28.2',
    ...Object.fromEntries(inputs.map(key => [key, join(root, key)])) };
  for (const key of inputs) {
    for (const value of [undefined, 'relative-input']) {
      const env = { ...base };
      if (value === undefined) delete env[key]; else env[key] = value;
      await assert.rejects(exec(process.execPath, ['--test', '--test-name-pattern=^real kit tarball',
        fileURLToPath(import.meta.url)], { cwd: root, env, timeout: 15000 }), error => {
        assert.equal(error.code, 1);
        assert.ok(error.stdout.includes(`KIT_TEST_CANDIDATE_INPUT_REQUIRED ${key}`), error.stdout);
        return true;
      });
      assert.deepEqual(await readdir(tmp), [], 'invalid candidate started packaging');
      assert.deepEqual(await readdir(home), [], 'invalid candidate touched manager cache/config');
    }
  }
});

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
  // An explicit manager trial must exercise every consumer, never report a
  // successful partial run or fall back to the repository's tools/user cache.
  if (process.env.B0_TEST_PNPM_VERSION !== undefined) {
    for (const key of ['B0_BUILD_UPSTREAM', 'B0_BUILD_TOOLS', 'COREPACK_HOME']) {
      assert.ok(typeof process.env[key] === 'string' && isAbsolute(process.env[key]),
        `KIT_TEST_CANDIDATE_INPUT_REQUIRED ${key}`);
    }
  }
  const immutable = await immutableDomainInput(process.env.DSH_PACKAGE_INPUTS);
  if (immutable) t.after(async () => {
    const after = await readPackagedLibrary(immutable.path, immutable.entry);
    assert.equal(after.sha256, immutable.sha256, 'consumer validation changed the immutable domain input');
    for (const lock of immutable.locks) assert.deepEqual(await readFile(lock.path), lock.bytes, 'consumer validation changed a domain lock');
    t.diagnostic(`immutable domain input before ${immutable.sha256}; after ${after.sha256}; all three consumer locks unchanged`);
  });
  const root = await owned(t), source = join(root, 'kit-source');
  await copyPluginKitSources(kit, source, { destinationRoot: root });
  // A credential-like accidental file and dependency directory must not ship.
  await writeFile(join(source, '.env'), 'SYNTHETIC_SENTINEL=do-not-pack\n');
  await mkdir(join(source, 'node_modules')); await writeFile(join(source, 'node_modules', 'sentinel'), 'not a dependency');
  const archive = join(root, 'kit.tgz');
  const repositoryManifest = await readFile(join(kit, 'package.json'));
  const trialManifest = JSON.parse(repositoryManifest);
  const originalDeclaration = trialManifest.packageManager;
  const manager = managerTrial(originalDeclaration, process.env.B0_TEST_PNPM_VERSION);
  // Align only our disposable packaging fixture with the candidate. Do not
  // suppress pnpm's version checks or mutate the official upstream manifest.
  if (process.env.B0_TEST_PNPM_VERSION !== undefined) {
    trialManifest.packageManager = `pnpm@${manager.version}`;
    await writeFile(join(source, 'package.json'), JSON.stringify(trialManifest));
  }
  const declaration = trialManifest.packageManager;
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root, CI: '1',
    COREPACK_HOME: process.env.COREPACK_HOME ?? join(process.env.HOME, '.cache/node/corepack'), COREPACK_ENABLE_NETWORK: '0',
    COREPACK_DEFAULT_TO_LATEST: '0', COREPACK_ENABLE_AUTO_PIN: '0',
    npm_config_ignore_scripts: 'true',
    ...(process.env.DSH_SDK_CLOSURE_SHA256 ? { DSH_SDK_CLOSURE_SHA256: process.env.DSH_SDK_CLOSURE_SHA256 } : {}) };
  const version = await exec('corepack', [manager.command, '--version'], { cwd: source, env, timeout: 30000 });
  assert.equal(version.stdout.trim(), manager.version, 'KIT_TEST_MANAGER_VERSION');
  t.diagnostic(`actual pnpm ${manager.version}; trial declaration ${declaration}; repository declaration ${originalDeclaration}`);
  await exec('corepack', [manager.command, 'pack', '--out', archive], { cwd: source, env, timeout: 30000 });
  await exec('python3', [join(repository, 'scripts/release/secure-unpack.py'), archive, join(root, 'installed'),
    '--max-entries', '100', '--max-bytes', '1048576'], { cwd: root, timeout: 10000 });
  const installed = join(root, 'installed/package');
  const { stdout } = await exec('tar', ['-tzf', archive], { cwd: root });
  assert.ok(!stdout.includes('node_modules') && !stdout.includes('.env'));
  const pkg = JSON.parse(await readFile(join(installed, 'package.json')));
  assert.equal(pkg.private, true); assert.equal(pkg.exports['./toolchain'], './toolchain.mjs');
  const consumer = join(root, 'consumer'); await mkdir(consumer);
  // A real offline package-manager install, with a fresh local store. The kit
  // has no registry dependencies; this parent is an owned install fixture.
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, packageManager: declaration,
    devDependencies: { '@shine-mage/dsh-plugin-kit': `file:${archive}` } }));
  const consumerManifest = await readFile(join(consumer, 'package.json'));
  await exec('corepack', [manager.command, 'install', '--offline', '--ignore-scripts', '--ignore-workspace',
    '--config.auto-install-peers=false', '--store-dir', join(root, 'fresh-store')], { cwd: consumer, env, timeout: 30000 });
  assert.deepEqual(await readFile(join(consumer, 'package.json')), consumerManifest, 'candidate manager rewrote the consumer declaration');
  assert.equal(JSON.parse(await readFile(join(source, 'package.json'))).packageManager, declaration);
  const installedKit = join(consumer, 'node_modules/@shine-mage/dsh-plugin-kit');
  const archiveHelp = await exec('python3', [join(installedKit, 'sdk-archive.py'), '--help'], { cwd: consumer, env });
  assert.match(archiveHelp.stdout, /pack,receive/);
  const help = await exec(process.execPath, [join(installedKit, 'prepare.mjs'), '--help'], { cwd: consumer, env });
  assert.match(help.stdout, /--destination/);
  await assert.rejects(exec(process.execPath, [join(installedKit, 'prepare.mjs'), '--destination', consumer], { cwd: consumer, env }), error => {
    assert.equal(error.code, 2); assert.equal(JSON.parse(error.stdout).code, 'KIT_PREPARE_DESTINATION_EXISTS'); return true;
  });
  const result = await exec(process.execPath, ['--input-type=module', '-e',
    "const m = await import('@shine-mage/dsh-plugin-kit/toolchain'); if(typeof m.inspectToolchain !== 'function'||typeof m.bindToolchain !== 'function') process.exit(1);"], { cwd: join(root, 'consumer'), env });
  assert.equal(result.stderr, '');
  // Build one consumer at a time in the same empty slot: no neighboring
  // plugin or kit source can satisfy an accidental relative import.
  const names = ['board-components', 'shine-brand', 'shine-query', 'shine-board', 'shine-crowd-action',
    'shine-funnel', 'shine-waterfall', 'crm-knowledge', 'knowledge', 'analytics-workbench'];
  const plugin = join(consumer, 'plugin'), domainOutput = join(root, 'domain-inputs');
  const inputs = immutable?.directory ?? domainOutput;
  const upstream = process.env.B0_BUILD_UPSTREAM, tools = process.env.B0_BUILD_TOOLS ?? join(kit, 'build-tools');
  const buildEnv = { ...env, ...(upstream ? { B0_BUILD_UPSTREAM: upstream } : {}), B0_BUILD_TOOLS: tools, DSH_PACKAGE_INPUTS: inputs };
  const inputRecord = upstream ? (process.env.DSH_SDK_CLOSURE_SHA256 ? join(dirname(upstream), 'sdk-closure.json') : join(upstream, '.git/index')) : null;
  const upstreamIndex = inputRecord ? await readFile(inputRecord) : null;
  if (upstream) {
    const before = await readFile(inputRecord);
    const check = await exec(process.execPath, [join(installedKit, 'check.mjs'), '--upstream', upstream, '--build-tools', tools], { cwd: root, env });
    assert.equal(JSON.parse(check.stdout).status, 'READY');
    assert.deepEqual(await readFile(inputRecord), before, 'read-only preflight changed SDK identity record');
  }
  for (const name of names) {
    await t.test(`${name} consumes the installed kit without sibling source`, { skip: name !== 'board-components' && !upstream }, async () => {
      const source = join(repository, 'dsh-plugins', name);
      const items = ['package.json', 'build.mjs', 'src'];
      if (name === 'board-components') items.push('test');
      else items.push('cordis.patch.yml');
      if (['shine-funnel', 'shine-waterfall', 'analytics-workbench'].includes(name)) items.push('bundled-dependencies.json');
      if (name === 'analytics-workbench') items.push('toolchain.mjs', 'pack-skills.mjs', 'skills', 'test',
        ...(await readdir(source)).filter(file => file.endsWith('skill-package.lock.json')));
      if (['crm-knowledge', 'knowledge'].includes(name)) items.push('test/contract.typecheck.ts', 'test/package.test.mjs');
      try {
        for (const item of items) await copyTreeBounded(join(source, item), join(plugin, item), { destinationRoot: root });
        if (process.env.B0_TEST_PNPM_VERSION !== undefined) {
          // All mutations here are to the owned fixture. Nested pnpm invocations
          // must select the same real candidate, without version-check bypasses.
          const manifest = JSON.parse(await readFile(join(plugin, 'package.json')));
          manifest.packageManager = declaration;
          await writeFile(join(plugin, 'package.json'), JSON.stringify(manifest));
        }
        await assert.rejects(lstat(join(consumer, 'plugin-kit')), { code: 'ENOENT' });
        const args = name === 'board-components' ? [domainOutput] : [upstream, tools];
        const result = await exec(process.execPath, [join(plugin, 'build.mjs'), ...args], { cwd: root, env: buildEnv, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
        if (name === 'board-components') {
          const receipt = JSON.parse(result.stdout);
          if (immutable) {
            const rebuilt = await readPackagedLibrary(join(domainOutput, immutable.entry.tarball));
            assert.equal(receipt.sha256, rebuilt.sha256, 'domain rebuild receipt mismatch');
            assert.deepEqual(rebuilt.manifest, immutable.manifest, 'domain rebuild manifest drift');
            assert.deepEqual(rebuilt.files, immutable.files, 'domain rebuild content drift');
            t.diagnostic(`domain original sha ${immutable.sha256}; rebuilt sha ${rebuilt.sha256}; ${rebuilt.files.size} files and manifest identical; consumers retain original artifact`);
          } else {
            const lock = JSON.parse(await readFile(join(repository, 'dsh-plugins/shine-funnel/bundled-dependencies.json')));
            assert.equal(receipt.sha256, lock.packages[0].sha256, 'dev kit migration changed the immutable domain tarball');
            t.diagnostic(`domain sha ${receipt.sha256}; original consumer locks unchanged`);
          }
        } else assert.ok((await readFile(join(plugin, 'lib/index.js'))).length > 0);
        const tests = name === 'board-components' ? ['test/geometry.test.mjs']
          : name === 'analytics-workbench' ? ['test/built.test.mjs', 'test/native-board-auth.test.mjs', 'test/lane-g-delivery.test.mjs',
            'test/native-slot-ownership.test.mjs', 'test/native-fixture-client-boundary.test.mjs',
            'test/first-purchase-query-model.test.mjs',
            'src/client/leave/host-leave-adapter.test.mjs']
          : ['crm-knowledge', 'knowledge'].includes(name) ? ['test/package.test.mjs']
          : (await readdir(join(plugin, 'src'))).filter(file => file.endsWith('.test.mjs')).map(file => `src/${file}`);
        await exec(process.execPath, ['--test', ...tests.map(file => join(plugin, file))], { cwd: plugin, env: buildEnv, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
        if (name === 'shine-brand') {
          const artifact = await readFile(join(plugin, 'lib/index.js'));
          const manifest = JSON.parse(await readFile(join(plugin, 'package.json')));
          manifest.devDependencies['@shine-mage/dsh-plugin-kit'] = '0.2.0';
          await writeFile(join(plugin, 'package.json'), JSON.stringify(manifest));
          await assert.rejects(exec(process.execPath, [join(plugin, 'build.mjs'), upstream, tools], { cwd: root, env: buildEnv, timeout: 30000 }), /KIT_VERSION_MISMATCH/);
          assert.deepEqual(await readFile(join(plugin, 'lib/index.js')), artifact);
        }
        t.diagnostic(`${name}: installed kit build and ${tests.length} existing test file(s) PASS`);
      } finally { await rm(plugin, { recursive: true, force: true }); }
    });
  }
  if (upstreamIndex) assert.deepEqual(await readFile(inputRecord), upstreamIndex,
    'consumer build/test changed the pinned SDK identity record');
  assert.deepEqual(await readFile(join(kit, 'package.json')), repositoryManifest, 'manager trial changed repository kit');
});

test('workspace kit link is explicit, idempotent and never replaces a foreign installation', async t => {
  const root = await owned(t), plugin = join(root, 'plugin'); await mkdir(plugin);
  const declaration = { devDependencies: { '@shine-mage/dsh-plugin-kit': '0.1.0' } };
  const save = obj => writeFile(join(plugin, 'package.json'), JSON.stringify(obj));
  await save({}); await assert.rejects(linkWorkspaceKit(plugin, kit), /KIT_LINK_VERSION/);
  await save({ ...declaration, dependencies: { '@shine-mage/dsh-plugin-kit': '0.1.0' } });
  await assert.rejects(linkWorkspaceKit(plugin, kit), /KIT_LINK_DEV_ONLY/);
  await save(declaration);
  assert.equal((await linkWorkspaceKit(plugin, kit)).status, 'LINKED');
  const link = join(plugin, 'node_modules/@shine-mage/dsh-plugin-kit'), before = await lstat(link);
  assert.equal((await linkWorkspaceKit(plugin, kit)).status, 'UNCHANGED');
  assert.equal((await lstat(link)).mtimeMs, before.mtimeMs);
  await rm(link); await mkdir(link); await writeFile(join(link, 'sentinel'), 'foreign install');
  await assert.rejects(linkWorkspaceKit(plugin, kit), /KIT_LINK_FOREIGN/);
  assert.equal(await readFile(join(link, 'sentinel'), 'utf8'), 'foreign install');
  await rm(join(plugin, 'node_modules'), { recursive: true });
  const outside = join(root, 'outside'); await mkdir(outside); await symlink(outside, join(plugin, 'node_modules'), 'dir');
  await assert.rejects(linkWorkspaceKit(plugin, kit), /KIT_LINK_PARENT_INVALID/);
  await assert.rejects(lstat(join(outside, '@shine-mage')), { code: 'ENOENT' });
});


test('repository build preparation leaves external checkouts alone', async t => {
  const root = await owned(t), repository = join(root, 'repo');
  await mkdir(join(repository, 'dsh-plugins'), { recursive: true });
  const kitSource = join(repository, 'dsh-plugins/plugin-kit');
  await copyPluginKitSources(kit, kitSource, { destinationRoot: root });
  const external = join(root, 'external'); await mkdir(external);
  await writeFile(join(external, 'package.json'), JSON.stringify({ devDependencies: { '@shine-mage/dsh-plugin-kit': '0.1.0' } }));
  assert.equal((await linkRepositoryKit(external, repository)).status, 'EXTERNAL_PACKAGE');
  await assert.rejects(lstat(join(external, 'node_modules')), { code: 'ENOENT' });
  const alias = join(repository, 'dsh-plugins/external-alias'); await symlink(external, alias, 'dir');
  assert.equal((await linkRepositoryKit(alias, repository)).status, 'EXTERNAL_PACKAGE');
  const local = join(repository, 'dsh-plugins/local'); await mkdir(local);
  await writeFile(join(local, 'package.json'), await readFile(join(external, 'package.json')));
  assert.equal((await linkRepositoryKit(local, repository)).status, 'LINKED');
});
