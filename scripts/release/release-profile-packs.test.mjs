import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReleasePacks, prepareReleasePayload, verifyReleasePackBinding } from './release-profile-packs.mjs';
import { collectAllowlist, packArtifact, receiveArtifact, verifyPayload } from './artifact.mjs';
import { collectReleaseReadiness } from './readiness.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const sdk = { sdk_version: '0.1.7-rc.2', upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443' };

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'release-pack-fixture-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'main'), inputRoot = join(base, 'input'), built = join(base, 'built');
  await mkdir(join(root, 'config'), { recursive: true });
  await mkdir(join(inputRoot, 'pack'), { recursive: true });
  await mkdir(join(built, 'package/lib'), { recursive: true });
  const id = '@shine-mage/dsh-synthetic-release';
  const manifest = { name: id, version: '0.1.0', type: 'module', main: './lib/index.js',
    exports: { '.': './lib/index.js' }, files: ['lib/', 'cordis.patch.yml'],
    peerDependencies: { '@deepseek-ai/dsh-tools': sdk.sdk_version }, dsh: { bundle: { patch: 'cordis.patch.yml' } } };
  await writeFile(join(built, 'package/package.json'), json(manifest));
  await writeFile(join(built, 'package/lib/index.js'), 'export const synthetic = true;\n');
  await writeFile(join(built, 'package/cordis.patch.yml'), '[]\n');
  const tarName = 'shine-mage-dsh-synthetic-release-0.1.0.tgz';
  execFileSync('tar', ['-czf', join(inputRoot, 'pack', tarName), '-C', built, 'package'],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const archive = await readFile(join(inputRoot, 'pack', tarName));
  const receipt = { schema_version: 'dsh-plugin-pack/v1', package_name: id, package_version: '0.1.0', dsh_pin: sdk.sdk_version,
    source_sha: '1'.repeat(40), source_dirty: false, activation: 'NOT_RUN', state_path: 'NOT_APPLICABLE_PLUGIN_PACK_ONLY',
    tarball: { name: tarName, bytes: archive.length, sha256: hash(archive) },
    generated_bytes_provenance: { schema_version: 'dsh-generated-bytes/v1', status: 'PASS',
      source: { git_sha: '1'.repeat(40), sha256: '2'.repeat(64), entries: 1, bytes: 1 },
      generated_tree: { sha256: '0555cb12712fd53b766689033a0849967a867bb4429c0eaa1c1d38d8281d3f23', entries: 2, bytes: 31 },
      builder: { clean: true, isolated: true, node: '24.19.0', pnpm: '11.28.2' },
      builder_receipt_sha256: '4'.repeat(64) }, entries: ['cordis.patch.yml','lib/index.js','package.json'] };
  const receiptBytes = Buffer.from(json(receipt));
  await writeFile(join(inputRoot, 'pack/plugin-pack.json'), receiptBytes);
  const profile = { schema_version: 'dsh-profile/v1', profile_id: 'synthetic-release', dsh: sdk,
    plugins: [{ id, path: 'dsh-plugins/independent', build: 'build.mjs', enabled: true }] };
  const input = { schema_version: 'dsh-profile-pack-inputs/v1', profile: { path: 'profile.json', sha256: '' },
    plugins: [{ id, manifest: 'pack/plugin-pack.json', sha256: hash(receiptBytes) }] };
  const inputsPath = join(inputRoot, 'inputs.json');
  async function saveProfile() {
    const bytes = Buffer.from(json(profile)); input.profile.sha256 = hash(bytes);
    await writeFile(join(root, 'config/dsh-profile.rc2.json'), bytes);
    await writeFile(join(inputRoot, 'profile.json'), bytes);
    await writeFile(inputsPath, json(input));
  }
  await saveProfile();
  await writeFile(join(root, 'VERSION'), '0.20.0.0\n');
  await mkdir(join(root, 'dsh-plugins'), { recursive: true });
  // Both selected and unselected old plugin trees are unreadable aliases.
  // The artifact path must ignore them rather than follow/copy either source.
  await symlink(join(base, 'missing-old-source'), join(root, 'dsh-plugins/independent'));
  await symlink(join(base, 'missing-sibling-source'), join(root, 'dsh-plugins/unselected'));
  await rm(built, { recursive: true });
  return { base, root, inputRoot, input, inputsPath, profile, saveProfile, output: join(base, 'payload') };
}

async function prepared(t) {
  const f = await fixture(t);
  f.receipt = await prepareReleasePayload(f);
  f.verify = () => verifyReleasePackBinding({ directory: f.output, snapshot: f.receipt.profile_pack_snapshot,
    profileSnapshot: { path: f.receipt.profile_path, sha256: f.input.profile.sha256 } });
  return f;
}

test('release payload uses fixed runtime bytes and omits both old source aliases', async t => {
  const f = await prepared(t);
  assert.equal(await readFile(join(f.output, 'dsh-plugins/independent/lib/index.js'), 'utf8'), 'export const synthetic = true;\n');
  await assert.rejects(access(join(f.output, 'dsh-plugins/independent/build.mjs')), { code: 'ENOENT' });
  await assert.rejects(access(join(f.output, 'dsh-plugins/unselected')), { code: 'ENOENT' });
  assert.equal((await f.verify()).status, 'PACK_BYTES_VERIFIED');
  assert.equal(f.receipt.activation, 'NOT_RUN'); assert.equal(f.receipt.release_ready, false);
  assert.match(f.receipt.plugins[0].source_sha, /^1{40}$/);
});

test('fixed pack input is mandatory and fails before writing any payload', async t => {
  const f = await fixture(t);
  for (const inputsPath of [undefined, 'relative-input.json', join(f.base, 'missing.json')]) {
    await assert.rejects(prepareReleasePayload({ ...f, inputsPath }));
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  }
});

test('another valid profile cannot replace the selected main profile', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'config/dsh-profile.rc2.json'), json({ ...f.profile, profile_id: 'another-profile' }));
  await assert.rejects(loadReleasePacks(f), /RELEASE_PACK_PROFILE_MISMATCH/);
  await assert.rejects(prepareReleasePayload(f), /RELEASE_PACK_PROFILE_MISMATCH/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('profile cannot place a plugin over main code or the kit', async t => {
  const f = await fixture(t);
  for (const path of ['backend', 'scripts/release', 'dsh-plugins/plugin-kit', 'dsh-plugins/board-components']) {
    f.profile.plugins[0].path = path; await f.saveProfile();
    await assert.rejects(prepareReleasePayload(f), /RELEASE_PACK_PLUGIN_PATH/);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
  }
});

test('archive drift fails before payload creation', async t => {
  const f = await fixture(t);
  const path = join(f.inputRoot, 'pack/shine-mage-dsh-synthetic-release-0.1.0.tgz');
  const bytes = await readFile(path); bytes[4] ^= 1; await writeFile(path, bytes);
  await assert.rejects(prepareReleasePayload(f), /PLUGIN_PACK_DIGEST_MISMATCH/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('new payload never overwrites existing evidence', async t => {
  const f = await prepared(t), before = await readFile(join(f.output, f.receipt.profile_pack_snapshot.path));
  await assert.rejects(prepareReleasePayload(f), { code: 'EEXIST' });
  assert.deepEqual(await readFile(join(f.output, f.receipt.profile_pack_snapshot.path)), before);
});

test('receiver rejects runtime byte substitutions even if outer payload hashes are recomputed', async t => {
  const f = await prepared(t);
  await writeFile(join(f.output, 'dsh-plugins/independent/lib/index.js'), 'export const synthetic = false;\n');
  await assert.rejects(f.verify(), /RELEASE_PACK_RUNTIME_BYTES/);
  const files = await collectAllowlist(f.output);
  const manifest = { schema_version: 'release-manifest/v1', release_tag: 'dsh-synthetic-pack', product_version: '0.20.0.0',
    source_sha: '2'.repeat(40), dsh_upstream_sha: sdk.upstream_sha, archive_allowlist: files, denylist_version: 'release-denylist/v1',
    artifact_bytes: 1, artifact_sha256: '0'.repeat(64),
    profile_snapshot: { path: f.receipt.profile_path, sha256: f.input.profile.sha256 }, profile_pack_snapshot: f.receipt.profile_pack_snapshot,
    payload: await Promise.all(files.map(async path => { const bytes = await readFile(join(f.output, path));
      return { path, role: 'runtime-source', bytes: bytes.length, sha256: hash(bytes) }; })) };
  const path = join(f.base, 'manifest.json'); await writeFile(path, json(manifest));
  await assert.rejects(verifyPayload(path, f.output), /RELEASE_PACK_RUNTIME_BYTES/);
});

test('unexpected runtime files and symlinks cannot bypass the pack boundary', async t => {
  const f = await prepared(t), extra = join(f.output, 'dsh-plugins/independent/extra.js');
  await writeFile(extra, 'export {};'); await assert.rejects(f.verify(), /RELEASE_PACK_RUNTIME_ENTRIES/);
  await rm(extra); await symlink(join(f.base, 'outside'), extra);
  await assert.rejects(f.verify(), /RELEASE_PACK_RUNTIME_SYMLINK/);
});

test('pack snapshot digest and shape are enforced', async t => {
  const f = await prepared(t);
  await assert.rejects(verifyReleasePackBinding({ directory: f.output, snapshot: { ...f.receipt.profile_pack_snapshot, sha256: '0'.repeat(64) },
    profileSnapshot: { path: f.receipt.profile_path, sha256: f.input.profile.sha256 } }), /RELEASE_PACK_SNAPSHOT_DIGEST/);
  await assert.rejects(verifyReleasePackBinding({ directory: f.output, snapshot: f.receipt.profile_pack_snapshot }), /RELEASE_PACK_PROFILE_SNAPSHOT_REQUIRED/);
});

test('readiness verifies fixed packs without old plugin entrypoints', async t => {
  const f = await fixture(t);
  execFileSync('git', ['init', '-q', f.root]);
  const readiness = await collectReleaseReadiness({ root: f.root, profilePackInputs: f.inputsPath,
    requireClean: false, requireRuntime: false, requireUpstream: false });
  const check = readiness.checks.find(row => row.name === 'plugin-packs');
  assert.equal(check.ok, true, check.value);
  assert.ok(!readiness.checks.some(row => row.name === 'plugin-entrypoints'));
  assert.equal(readiness.pluginPacks.plugins.length, 1);
});

test('narrow payload allowlist still rejects links within its declared boundary', async t => {
  const f = await fixture(t);
  await symlink(join(f.base, 'outside'), join(f.root, 'config/unsafe.json'));
  await assert.rejects(prepareReleasePayload(f), /ALLOWLIST_SYMLINK config\/unsafe.json/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('release pack receipt binds the main snapshot to immutable external inputs', async t => {
  const f = await prepared(t);
  assert.equal(f.receipt.inputs_sha256, hash(await readFile(f.inputsPath)));
  const ledger = JSON.parse(await readFile(join(f.output, f.receipt.profile_pack_snapshot.path), 'utf8'));
  ledger.profile.path = 'config/another-profile.json';
  const bytes = Buffer.from(json(ledger));
  await writeFile(join(f.output, f.receipt.profile_pack_snapshot.path), bytes);
  await writeFile(join(f.output, 'config/another-profile.json'), await readFile(join(f.root, 'config/dsh-profile.rc2.json')));
  await assert.rejects(verifyReleasePackBinding({ directory: f.output, snapshot: { path: f.receipt.profile_pack_snapshot.path, sha256: hash(bytes) },
    profileSnapshot: { path: f.receipt.profile_path, sha256: f.input.profile.sha256 } }), /RELEASE_PACK_PROFILE_MISMATCH/);
});

test('pack-based runtime artifact is received with the same package binding', async t => {
  const f = await prepared(t), files = await collectAllowlist(f.output);
  const artifact = join(f.base, 'runtime.tar.zst');
  const packed = await packArtifact({ rootDir: f.output, allowlist: files, output: artifact });
  const manifest = { schema_version: 'release-manifest/v1', release_tag: 'dsh-synthetic-pack', product_version: '0.20.0.0',
    source_sha: '2'.repeat(40), dsh_upstream_sha: sdk.upstream_sha, archive_allowlist: files, denylist_version: 'release-denylist/v1',
    artifact_bytes: packed.bytes, artifact_sha256: packed.sha256,
    profile_snapshot: { path: f.receipt.profile_path, sha256: f.input.profile.sha256 }, profile_pack_snapshot: f.receipt.profile_pack_snapshot,
    payload: await Promise.all(files.map(async path => { const bytes = await readFile(join(f.output, path));
      return { path, role: 'runtime-source', bytes: bytes.length, sha256: hash(bytes) }; })) };
  const manifestPath = join(f.base, 'manifest.json'); await writeFile(manifestPath, json(manifest));
  const received = await receiveArtifact({ artifact, manifestPath, destination: join(f.base, 'received') });
  assert.equal(received.entries, files.length);
  assert.equal(received.manifest.profile_pack_snapshot.sha256, f.receipt.profile_pack_snapshot.sha256);
});
