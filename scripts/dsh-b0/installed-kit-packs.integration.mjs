/** Published author declarations and domain locks. No business source/build or host boot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readCompositionInputs } from '../crm-calibration/composition-inputs.mjs';
import { LEAF_NAMES } from './leaf-pack-inputs.mjs';
import { installProfilePacks } from '../release/profile-packs.mjs';
import { insideArtifact } from '../release/service-artifact-evidence.mjs';
import { readPackagedLibrary, validatePackageLock, DEV_KIT_NAME } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const { packs, pages } = await readCompositionInputs({ inputsPath: process.env.CRM_COMPOSITION_PACK_INPUTS,
  pageInputsPath: process.env.CRM_COMPOSITION_PAGE_INPUTS });
assert.ok(pages, 'KIT_PACK_PAGE_INPUTS_REQUIRED');
assert.deepEqual(pages.plugins.map(row => row.id).sort(),
  ['@shine-mage/dsh-analytics-workbench-b0', ...LEAF_NAMES.map(name => `@shine-mage/dsh-${name}`)].sort(), 'KIT_PACK_PAGE_SELECTION');
const kit = JSON.parse(await readFile(join(repo, 'dsh-plugins/plugin-kit/package.json')));
const domainEntry = { name: '@shine-mage/board-components', version: '0.1.0',
  tarball: 'shine-mage-board-components-0.1.0.tgz',
  sha256: '22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182' };
const domain = await readPackagedLibrary(join(repo, 'vendor/dsh-package-inputs', domainEntry.tarball), domainEntry);
const base = process.env.CRM_COMPOSITION_OUTPUT;
assert.ok(isAbsolute(base ?? ''), 'KIT_PACK_OUTPUT_REQUIRED');
const parent = await lstat(base);
assert.ok(parent.isDirectory() && !parent.isSymbolicLink(), 'KIT_PACK_OUTPUT_REQUIRED');
const output = join(base, 'installed-kit-packs');
await mkdir(output, { mode: 0o700 });
const selected = [...packs.plugins, ...pages.plugins];
const installed = await installProfilePacks({ packs: pages, output: join(output, 'verified'),
  python: process.env.FQ_B0_PYTHON ?? 'python3' });
const declarations = [], locks = [];

test('nine fixed author packages declare the current kit only as a development dependency', () => {
  for (const row of selected) {
    assert.equal(row.manifest.devDependencies?.[DEV_KIT_NAME], kit.version, `KIT_PACK_VERSION ${row.id}`);
    for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      assert.equal(row.manifest[key]?.[DEV_KIT_NAME], undefined, `KIT_PACK_DEV_ONLY ${row.id}`);
    }
    declarations.push({ id: row.id, source_sha: row.receipt.source_sha, kit: kit.version,
      manifest_sha256: row.manifestSha256, tarball_sha256: row.receipt.tarball.sha256 });
  }
  assert.equal(declarations.length, 9);
});

test('three published consumers retain the same exact immutable domain input', async () => {
  for (const id of ['@shine-mage/dsh-shine-funnel', '@shine-mage/dsh-shine-waterfall', '@shine-mage/dsh-analytics-workbench-b0']) {
    const row = pages.plugins.find(item => item.id === id), runtime = installed.plugins.find(item => item.id === id);
    const bytes = await insideArtifact(runtime.root, 'bundled-dependencies.json', 256 * 1024);
    const lock = validatePackageLock(JSON.parse(bytes), row.manifest);
    const entry = lock.packages.find(item => item.name === domainEntry.name);
    assert.deepEqual(entry, domainEntry, `KIT_PACK_DOMAIN_LOCK ${id}`);
    assert.equal(domain.sha256, entry.sha256);
    locks.push({ id, source_sha: row.receipt.source_sha, lock_sha256: hash(bytes), entry });
  }
  assert.equal(locks.length, 3);
});

test.after(async () => {
  if (declarations.length !== 9 || locks.length !== 3) return;
  await writeFile(join(output, 'runtime-inputs.json'), JSON.stringify({
    schema: 'shinemage-installed-kit-pack-consumers/v1', kit: { name: kit.name, version: kit.version },
    crm_inputs_sha256: packs.inputsSha256, page_inputs_sha256: pages.inputsSha256,
    declarations, domain_locks: locks, domain_sha256: domain.sha256,
    business_source_builds: 'NOT_RUN_AUTHOR_OWNED', host: 'NOT_RUN', candidate: 'NOT_RUN',
    real_business: 'NOT_RUN', release_ready: false,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
});
