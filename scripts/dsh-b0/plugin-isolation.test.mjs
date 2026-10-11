/** Receive fixed independent author archives; no source build, SDK link or host boot. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readCompositionInputs } from '../crm-calibration/composition-inputs.mjs';
import { insideArtifact } from '../release/service-artifact-evidence.mjs';

const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const { packs, pages } = await readCompositionInputs({ inputsPath: process.env.CRM_COMPOSITION_PACK_INPUTS,
  pageInputsPath: process.env.CRM_COMPOSITION_PAGE_INPUTS });
assert.ok(pages, 'PACKAGE_ISOLATION_PAGE_INPUTS_REQUIRED');
const names = ['shine-brand', 'shine-query', 'crm-knowledge', 'knowledge'];
const selected = names.map(name => {
  const id = `@shine-mage/dsh-${name}`, matches = [...packs.plugins, ...pages.plugins].filter(row => row.id === id);
  assert.equal(matches.length, 1, `PACKAGE_ISOLATION_SELECTION ${id}`);
  return { name, packed: matches[0] };
});
const base = process.env.CRM_COMPOSITION_OUTPUT;
assert.ok(isAbsolute(base ?? ''), 'PACKAGE_ISOLATION_OUTPUT_REQUIRED');
const parent = await lstat(base);
assert.ok(parent.isDirectory() && !parent.isSymbolicLink(), 'PACKAGE_ISOLATION_OUTPUT_REQUIRED');
const output = join(base, 'package-isolation');
await mkdir(output, { mode: 0o700 });
const results = [];

for (const { name, packed } of selected) {
  test(`${name} receives only its sealed own runtime files without source or build inputs`, async () => {
    const directory = join(output, name), unpacked = join(directory, 'unpacked');
    await mkdir(directory, { mode: 0o700 });
    // Hold and recheck exactly the bytes validated by the existing formal reader.
    assert.equal(hash(packed.manifestBytes), packed.manifestSha256, 'PACKAGE_ISOLATION_MANIFEST_CHANGED');
    assert.deepEqual(JSON.parse(packed.manifestBytes), packed.receipt, 'PACKAGE_ISOLATION_RECEIPT_CHANGED');
    assert.equal(hash(packed.archive), packed.receipt.tarball.sha256, 'PACKAGE_ISOLATION_ARCHIVE_CHANGED');
    const archive = join(directory, 'input.tgz');
    await writeFile(archive, packed.archive, { flag: 'wx', mode: 0o600 });
    await writeFile(join(directory, 'plugin-pack.json'), packed.manifestBytes, { flag: 'wx', mode: 0o600 });
    await exec(process.env.FQ_B0_PYTHON ?? 'python3', ['-I', fileURLToPath(new URL('../release/secure-unpack.py', import.meta.url)),
      archive, unpacked, '--max-entries', '10000', '--max-bytes', String(20 * 1024 * 1024)],
    { cwd: directory, timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(unpacked), ['package'], 'PACKAGE_ISOLATION_ARCHIVE_ROOT');
    const root = join(unpacked, 'package'), files = [];
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'PACKAGE_ISOLATION_SYMLINK');
      if (entry.isDirectory()) continue;
      assert.ok(entry.isFile(), 'PACKAGE_ISOLATION_SPECIAL_FILE');
      const path = relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/');
      assert.doesNotMatch(path, /(?:^|\/)(?:src|test|tests|node_modules|\.git)(?:\/|$)|\.map$/, 'PACKAGE_ISOLATION_DEVELOPMENT_FILE');
      files.push(path);
    }
    assert.deepEqual(files.sort(), [...packed.receipt.entries].sort(), 'PACKAGE_ISOLATION_ENTRIES');
    const manifest = JSON.parse(await insideArtifact(root, 'package.json', 256 * 1024));
    assert.deepEqual(manifest, packed.manifest, 'PACKAGE_ISOLATION_MANIFEST_BYTES');
    assert.equal(manifest.name, packed.id, 'PACKAGE_ISOLATION_ID');
    assert.equal(manifest.version, packed.receipt.package_version, 'PACKAGE_ISOLATION_VERSION');
    assert.equal(packed.receipt.activation, 'NOT_RUN');
    const fileHashes = {};
    for (const path of files) fileHashes[path] = hash(await insideArtifact(root, path, 20 * 1024 * 1024));
    results.push({ id: packed.id, source_sha: packed.receipt.source_sha, manifest_sha256: packed.manifestSha256,
      tarball: packed.receipt.tarball, root, files: fileHashes, entrypoints: manifest.exports });
  });
}

test.after(async () => {
  if (results.length !== selected.length) return;
  await writeFile(join(output, 'runtime-inputs.json'), JSON.stringify({
    schema: 'shinemage-fixed-pack-isolation/v1', crm_inputs_sha256: packs.inputsSha256,
    page_inputs_sha256: pages.inputsSha256, packages: results,
    scope: 'four exact published archives, independently unpacked own runtime files',
    source_build_and_private_tests: 'NOT_RUN_AUTHOR_OWNED', sdk_resolution: 'NOT_RUN',
    public_behavior: 'SEPARATE_FIXED_PACK_CONSUMERS', host: 'NOT_RUN', candidate: 'NOT_RUN',
    real_business: 'NOT_RUN', release_ready: false,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
});
