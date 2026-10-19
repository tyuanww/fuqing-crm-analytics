import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { readDomainPack } from './domain-pack.mjs';
import { canonicalTreeDigest, generatedPaths } from './generated-provenance.mjs';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceSha = 'e'.repeat(40);

test('reads a clean domain pack and rejects changed tarball bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'domain-pack-test-'));
  try {
    const staging = join(root, 'staging/package'), output = join(root, 'pack');
    await mkdir(join(staging, 'lib'), { recursive: true });
    await mkdir(output);
    await writeFile(join(staging, 'package.json'), JSON.stringify({ name: '@shine-mage/fixture', version: '0.1.0', private: true, type: 'module', files: ['lib/value.mjs'], exports: { '.': './lib/value.mjs' } }));
    const generated = Buffer.from('export const value = 1;\n');
    await writeFile(join(staging, 'lib/value.mjs'), generated);
    const tarball = join(output, 'shine-mage-fixture-0.1.0.tgz');
    await exec('tar', ['-czf', tarball, '-C', join(root, 'staging'), 'package'],
      { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const archive = await readFile(tarball), treeSha = hash(Buffer.from('fixture-tree'));
    const generatedTree = await canonicalTreeDigest(staging, { include: generatedPaths(['lib/value.mjs']), allowSymlinks: false });
    const provenance = {
      schema_version: 'dsh-generated-bytes/v1', status: 'PASS',
      source: { git_sha: sourceSha, sha256: treeSha, entries: 1, bytes: 13 },
      generated_tree: { sha256: generatedTree.sha256, entries: generatedTree.entries, bytes: generatedTree.bytes },
      generated_files: generatedTree.records.filter(record => record.type === 'file'),
      builder: { status: 'PASS', clean: true, isolated: true, pnpm: '11.28.2' },
    };
    const receipt = {
      schema_version: 'shinemage-domain-pack/v1', package_name: '@shine-mage/fixture', package_version: '0.1.0',
      repository: 'tyuanww/shinemage-board-components', source_sha: sourceSha, source_dirty: false,
      tarball: { name: 'shine-mage-fixture-0.1.0.tgz', bytes: archive.length, sha256: hash(archive) },
      generated_bytes_provenance: provenance, entries: ['lib/value.mjs', 'package.json'],
    };
    const manifestPath = join(output, 'plugin-pack.json');
    const manifestBytes = Buffer.from(JSON.stringify(receipt));
    await writeFile(manifestPath, manifestBytes);
    await readDomainPack({ manifestPath, expectedSha256: hash(manifestBytes), expectedSourceSha: sourceSha,
      expectedPackage: '@shine-mage/fixture' });
    const mutated = { ...receipt, generated_bytes_provenance: { ...provenance,
      generated_tree: { ...provenance.generated_tree, sha256: '0'.repeat(64) } } };
    const mutatedBytes = Buffer.from(JSON.stringify(mutated));
    await writeFile(manifestPath, mutatedBytes);
    await assert.rejects(readDomainPack({ manifestPath, expectedSha256: hash(mutatedBytes), expectedSourceSha: sourceSha,
      expectedPackage: '@shine-mage/fixture' }), /DOMAIN_PACK_GENERATED_TREE_MISMATCH/);
    await writeFile(manifestPath, manifestBytes);
    await writeFile(join(staging, 'lib/extra.mjs'), 'export const extra = true;\n');
    await exec('tar', ['-czf', tarball, '-C', join(root, 'staging'), 'package'],
      { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const extraArchive = await readFile(tarball);
    const extraReceipt = { ...receipt, tarball: { ...receipt.tarball, bytes: extraArchive.length, sha256: hash(extraArchive) },
      entries: [...receipt.entries, 'lib/extra.mjs'] };
    const extraManifestBytes = Buffer.from(JSON.stringify(extraReceipt));
    await writeFile(manifestPath, extraManifestBytes);
    await assert.rejects(readDomainPack({ manifestPath, expectedSha256: hash(extraManifestBytes), expectedSourceSha: sourceSha,
      expectedPackage: '@shine-mage/fixture' }), /DOMAIN_PACK_TARBALL_UNDECLARED/);
    await writeFile(manifestPath, manifestBytes);
    await writeFile(tarball, archive);
    await writeFile(tarball, Buffer.concat([archive, Buffer.from('changed')]));
    await assert.rejects(readDomainPack({ manifestPath, expectedSha256: hash(manifestBytes), expectedSourceSha: sourceSha, expectedPackage: '@shine-mage/fixture' }), /DOMAIN_PACK_TARBALL_SIZE|DOMAIN_PACK_TARBALL_DIGEST/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
