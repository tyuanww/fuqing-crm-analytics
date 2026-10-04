/** Actual source-only package proof; no DSH host, registry install or release candidate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { copyPluginKitSources, copyTreeBounded } from './clean-build.mjs';
import { packPlugin } from '../release/plugin-pack.mjs';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../..', import.meta.url));
const upstream = resolve(process.env.B0_BUILD_UPSTREAM ?? join(repository, '.context/dsh-b0/upstream-0.1.7-rc.2'));
const buildTools = join(repository, 'dsh-plugins/plugin-kit/build-tools');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const name of ['shine-brand', 'shine-query', 'crm-knowledge']) {
  test(`${name} builds, tests and packs with only its own source and the dev kit`, { timeout: 240000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-independent-plugin-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const plugin = join(root, 'dsh-plugins', name);
    const source = join(repository, 'dsh-plugins', name);
    const options = { destinationRoot: root, budget: { bytes: 0, files: 0 } };
    await copyPluginKitSources(join(repository, 'dsh-plugins/plugin-kit'), join(root, 'dsh-plugins/plugin-kit'), options);
    for (const item of ['package.json', 'build.mjs', 'src', 'cordis.patch.yml']) {
      await copyTreeBounded(join(source, item), join(plugin, item), options);
    }
    if (name === 'crm-knowledge') {
      // This test has no Python fixture or workbench source dependency.
      for (const file of ['contract.typecheck.ts', 'package.test.mjs']) {
        await copyTreeBounded(join(source, 'test', file), join(plugin, 'test', file), options);
      }
    }
    assert.deepEqual((await readdir(join(root, 'dsh-plugins'))).sort(), ['plugin-kit', name].sort());
    const command = (file, args, cwd = root, environment = {}) => exec(file, args, { cwd, timeout: 180000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, B0_BUILD_UPSTREAM: upstream, ...environment } });
    // This throwaway test commit supplies pack's real provenance check. It is
    // never pushed, nor used as a reviewed product/release source identity.
    await writeFile(join(root, '.gitignore'), 'node_modules/\nlib/\nout/\n');
    await command('git', ['init', '-q']);
    await command('git', ['add', '.']);
    await command('git', ['-c', 'user.name=isolated-fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'synthetic independent package fixture']);
    await command(process.execPath, [join(plugin, 'build.mjs'), upstream, buildTools]);
    const tests = name === 'crm-knowledge' ? ['test/package.test.mjs']
      : (await readdir(join(plugin, 'src'))).filter(file => file.endsWith('.test.mjs')).sort().map(file => `src/${file}`);
    assert.ok(tests.length, 'ISOLATED_PACKAGE_TESTS_REQUIRED');
    await command(process.execPath, ['--test', ...tests.map(file => join(plugin, file))], plugin);
    const receipt = await packPlugin({ plugin, outputDir: join(root, 'out') });
    assert.equal(receipt.activation, 'NOT_RUN');
    assert.equal(receipt.dsh_pin, '0.1.7-rc.2');
    const artifacts = ['lib/index.js', 'lib/client.js', ...(name === 'crm-knowledge' ? ['lib/host.js', 'lib/graph-tools.js'] : [])];
    assert.deepEqual(receipt.entries.sort(), ['cordis.patch.yml', ...artifacts, 'package.json'].sort());
    if (name === 'crm-knowledge') {
      // Exercise the actual verified archive, not the nearby build directory.
      // Only pinned SDK peers are supplied by this synthetic host fixture.
      const installed = join(root, 'installed/package');
      await command('python3', [join(repository, 'scripts/release/secure-unpack.py'),
        join(root, 'out', receipt.tarball.name), join(root, 'installed'), '--max-entries', '100', '--max-bytes', '4194304']);
      assert.deepEqual((await readdir(installed)).sort(), ['cordis.patch.yml', 'lib', 'package.json']);
      await symlink(join(plugin, 'node_modules'), join(installed, 'node_modules'), 'dir');
      await command(process.execPath, ['--test', join(plugin, 'test/package.test.mjs')], installed, { CRM_TEST_PLUGIN_ROOT: installed });
    }
    const outputs = {};
    for (const file of artifacts) {
      outputs[file] = sha256(await readFile(join(plugin, file)));
    }
    t.diagnostic(JSON.stringify({ scope: 'isolated-package-build-test-pack', package: name, fixture_only: true,
      production_activation: 'NOT_RUN', source_manifest_sha256: sha256(await readFile(join(source, 'package.json'))),
      tarball: receipt.tarball, outputs, test_files: tests, copied_inputs: options.budget }));
  });
}
