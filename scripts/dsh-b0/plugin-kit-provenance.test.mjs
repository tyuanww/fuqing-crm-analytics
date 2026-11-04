/**
 * P2a acceptance: provenance and the browser CJS wrapper are owned by the
 * shared plugin kit, and every plugin build consumes those public exports
 * rather than reaching back into main-repository scripts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as kitProvenance from '../../dsh-plugins/plugin-kit/provenance.mjs';
import * as compatibilityEntry from '../../scripts/release/generated-provenance.mjs';
import { CLIENT_MODULE_FOOTER, clientModuleBanner } from '../../dsh-plugins/plugin-kit/client-banner.mjs';

const exec = promisify(execFile);
const pluginsRoot = fileURLToPath(new URL('../../dsh-plugins/', import.meta.url));

test('kit owns provenance and the compatibility entry forwards every export', () => {
  const expected = ['GENERATED_PROVENANCE_SCHEMA', 'assertDigest', 'assertSourceSha', 'assertTreeShape',
    'canonicalTreeDigest', 'generatedPaths', 'readProvenanceFile', 'writeBuildProvenance'];
  assert.deepEqual(Object.keys(kitProvenance).sort(), [...expected].sort());
  assert.deepEqual(Object.keys(compatibilityEntry).sort(), Object.keys(kitProvenance).sort());
  for (const key of Object.keys(kitProvenance)) assert.equal(compatibilityEntry[key], kitProvenance[key], key);
  assert.equal(kitProvenance.GENERATED_PROVENANCE_SCHEMA, 'dsh-generated-bytes/v1');
});

test('canonicalTreeDigest is path/bytes canonical and generatedPaths is allowlisted', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kit-provenance-tree-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'lib'));
  await writeFile(join(root, 'lib/index.js'), 'export const value = 1;\n');
  await writeFile(join(root, 'notes.txt'), 'ignored by include');
  const first = await kitProvenance.canonicalTreeDigest(root, { include: ['lib'], normalizeFileModes: true });
  const second = await kitProvenance.canonicalTreeDigest(root, { include: ['lib'], normalizeFileModes: true });
  assert.deepEqual(second, first);
  assert.equal(first.entries, 2);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.records.map(row => [row.path, row.type]), [['lib', 'directory'], ['lib/index.js', 'file']]);
  assert.deepEqual(kitProvenance.generatedPaths(['lib/index.js', 'src/index.ts', 'bundled-dependencies.json', 'README.md']),
    ['lib/index.js', 'bundled-dependencies.json']);
});

test('client banner helper reproduces the exact module-loader wrapper', () => {
  const id = '@shine-mage/dsh-shine-board';
  const { banner, footer } = clientModuleBanner(id);
  assert.equal(banner.js, `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\n`
    + 'var module = { exports: {} }; var exports = module.exports;');
  assert.equal(footer.js, 'return module.exports;\n} });');
  assert.equal(CLIENT_MODULE_FOOTER, footer.js);
  assert.throws(() => clientModuleBanner(''), /CLIENT_BANNER_ID_INVALID/);
  assert.throws(() => clientModuleBanner('dsh-shine-board'), /CLIENT_BANNER_ID_INVALID/);
});

test('checked-in client bundles still start and end with the helper wrapper', async () => {
  const names = (await readdir(pluginsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
  let checked = 0;
  for (const name of names.sort()) {
    const path = join(pluginsRoot, name, 'lib/client.js');
    const source = await readFile(path, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (source === null) continue;
    const manifest = JSON.parse(await readFile(join(pluginsRoot, name, 'package.json'), 'utf8'));
    const { banner, footer } = clientModuleBanner(manifest.name);
    assert.ok(source.startsWith(`${banner.js}\n`), `${name} client banner drift`);
    assert.ok(source.includes(`\n${footer.js}\n`), `${name} client footer drift`);
    checked += 1;
  }
  assert.ok(checked >= 6, `expected the committed plugin client bundles, saw ${checked}`);
});

test('every plugin build receipts through the kit and never copies the loader wrapper', async () => {
  const names = (await readdir(pluginsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
  const builds = [];
  for (const name of names.sort()) {
    const path = join(pluginsRoot, name, 'build.mjs');
    const source = await stat(path).then(() => readFile(path, 'utf8')).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!source?.includes('writeBuildProvenance(')) continue;
    builds.push(name);
    assert.match(source, /from '@shine-mage\/dsh-plugin-kit\/provenance'/, `${name} provenance import`);
    assert.doesNotMatch(source, /generated-provenance/, `${name} must not import main-repository provenance`);
    if (source.includes('clientModuleBanner(manifest.name)')) {
      assert.match(source, /from '@shine-mage\/dsh-plugin-kit\/client-banner'/, `${name} banner import`);
      assert.doesNotMatch(source, /__ModuleLoader__/, `${name} must not duplicate the loader wrapper`);
    } else {
      assert.doesNotMatch(source, /window\.__ModuleLoader__\.load/, `${name} must not duplicate the loader wrapper`);
    }
  }
  assert.equal(builds.length, 9, 'all nine plugin builds receipt their own output');
});

test('kit provenance writes a builder receipt from a clean plugin checkout', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kit-provenance-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'lib'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@shine-mage/synthetic-provenance',
    version: '0.0.0', type: 'module', files: ['lib/'] }));
  await writeFile(join(root, 'lib/index.js'), 'export const value = 1;\n');
  const git = args => exec('git', ['-C', root, ...args], { encoding: 'utf8' });
  await git(['init', '--quiet']);
  await git(['config', 'user.email', 'synthetic@example.invalid']);
  await git(['config', 'user.name', 'Synthetic Fixture']);
  await git(['add', '.']);
  await git(['commit', '--quiet', '-m', 'synthetic plugin fixture']);
  // The receipt records the builder's pnpm version. B0 test children have no
  // network-backed Corepack shim, so provide a deterministic stub rather than
  // letting `pnpm --version` attempt a registry fetch. Keep it outside the
  // plugin root so the clean-tree assertion still means what it says.
  const pin = JSON.parse(await readFile(new URL('../../dsh-plugins/plugin-kit/toolchain.json', import.meta.url), 'utf8'));
  const binRoot = await mkdtemp(join(tmpdir(), 'kit-provenance-bin-'));
  t.after(() => rm(binRoot, { recursive: true, force: true }));
  await writeFile(join(binRoot, 'pnpm'), `#!/bin/sh\nprintf '%s\\n' '${pin.pnpm}'\n`, { mode: 0o755 });
  const priorPath = process.env.PATH;
  process.env.PATH = `${binRoot}${delimiter}${priorPath ?? ''}`;
  let receipt;
  try {
    receipt = await kitProvenance.writeBuildProvenance({ root });
  } finally {
    process.env.PATH = priorPath;
  }
  assert.equal(receipt.builder.pnpm, pin.pnpm);
  assert.equal(receipt.schema_version, 'dsh-plugin-build/v1');
  assert.equal(receipt.status, 'NOT_VERIFIED');
  assert.equal(receipt.builder.clean, false);
  assert.match(receipt.source.git_sha, /^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(receipt.source.entries) && receipt.source.entries > 0);
  assert.ok(receipt.generated_tree.entries > 0);
  assert.ok(receipt.generated_files.some(row => row.path === 'lib/index.js'));
  const written = JSON.parse(await readFile(join(root, '.build-provenance.json'), 'utf8'));
  assert.deepEqual(written, receipt);
});
