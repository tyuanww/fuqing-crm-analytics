/** Actual source-only package proof; no DSH host, registry install or release candidate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

for (const name of ['shine-brand', 'shine-query']) {
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
    assert.deepEqual((await readdir(join(root, 'dsh-plugins'))).sort(), ['plugin-kit', name].sort());
    const command = (file, args, cwd = root) => exec(file, args, { cwd, timeout: 180000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, B0_BUILD_UPSTREAM: upstream } });
    // This throwaway test commit supplies pack's real provenance check. It is
    // never pushed, nor used as a reviewed product/release source identity.
    await writeFile(join(root, '.gitignore'), 'node_modules/\nlib/\nout/\n');
    await command('git', ['init', '-q']);
    await command('git', ['add', '.']);
    await command('git', ['-c', 'user.name=isolated-fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'synthetic independent package fixture']);
    await command(process.execPath, [join(plugin, 'build.mjs'), upstream, buildTools]);
    const tests = (await readdir(join(plugin, 'src'))).filter(file => file.endsWith('.test.mjs')).sort();
    assert.ok(tests.length, 'ISOLATED_PACKAGE_TESTS_REQUIRED');
    await command(process.execPath, ['--test', ...tests.map(file => join(plugin, 'src', file))], plugin);
    const receipt = await packPlugin({ plugin, outputDir: join(root, 'out') });
    assert.equal(receipt.activation, 'NOT_RUN');
    assert.equal(receipt.dsh_pin, '0.1.7-rc.2');
    assert.deepEqual(receipt.entries.sort(), ['cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'package.json'].sort());
    const outputs = {};
    for (const file of ['lib/index.js', 'lib/client.js']) {
      outputs[file] = sha256(await readFile(join(plugin, file)));
    }
    t.diagnostic(JSON.stringify({ scope: 'isolated-package-build-test-pack', package: name, fixture_only: true,
      production_activation: 'NOT_RUN', source_manifest_sha256: sha256(await readFile(join(source, 'package.json'))),
      tarball: receipt.tarball, outputs, test_files: tests, copied_inputs: options.budget }));
  });
}
