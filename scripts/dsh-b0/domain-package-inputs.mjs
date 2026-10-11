/** Verify the sealed domain input and locks inside actual formal consumer packages. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { readDomainAuthorEvidence, bindDomainPackageInput } from '../ci/domain-author-evidence.mjs';
import { readLeafPackInputs } from './leaf-pack-inputs.mjs';
import { installProfilePacks } from '../release/profile-packs.mjs';
import { validatePackageLock } from '../../dsh-plugins/plugin-kit/packaged-dependencies.mjs';

export async function readDomainComposition({ archivePath, packageInputs, pageInputsPath, python, output } = {}) {
  assert.ok(isAbsolute(packageInputs ?? ''), 'DOMAIN_PACKAGE_INPUTS_REQUIRED');
  assert.ok(isAbsolute(output ?? ''), 'DOMAIN_PACKAGE_OUTPUT_REQUIRED');
  const author = await readDomainAuthorEvidence({ archivePath, python });
  const artifact = join(packageInputs, author.reference.tarball);
  const evidence = await bindDomainPackageInput(author, artifact);
  const packs = await readLeafPackInputs(pageInputsPath);
  const installed = await installProfilePacks({ packs, output, python });
  const names = ['@shine-mage/dsh-analytics-workbench-b0', '@shine-mage/dsh-shine-funnel', '@shine-mage/dsh-shine-waterfall'];
  const expected = { name: author.package, version: author.version, tarball: author.reference.tarball, sha256: author.reference.sha256 };
  const locks = [];
  for (const id of names) {
    const row = installed.plugins.find(row => row.id === id);
    assert.ok(row, 'DOMAIN_PACKAGE_CONSUMER_REQUIRED');
    const lock = JSON.parse(await readFile(join(row.root, 'bundled-dependencies.json')));
    const manifest = JSON.parse(await readFile(join(row.root, 'package.json')));
    validatePackageLock(lock, manifest);
    assert.deepEqual(lock.packages, [expected], 'DOMAIN_PACKAGE_CONSUMER_LOCK');
    locks.push(lock);
  }
  assert.deepEqual(locks[1], locks[0], 'DOMAIN_PACKAGE_CONSUMER_LOCK');
  assert.deepEqual(locks[2], locks[0], 'DOMAIN_PACKAGE_CONSUMER_LOCK');
  return { inputs: packageInputs, artifact, lockSource: locks[0], entry: expected, evidence };
}
