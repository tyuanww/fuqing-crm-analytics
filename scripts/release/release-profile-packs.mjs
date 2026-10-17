/** Assemble release runtime from fixed packs; never read plugin author source or run builds. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { loadProfileSnapshot } from './profile.mjs';
import { installProfilePacks, loadProfilePacks } from './profile-packs.mjs';
import { insideArtifact } from './service-artifact-evidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const INPUTS = 'shinemage-release-pack-inputs.json';
const PACKS = 'config/shinemage-release-packs';
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 50000;

function pluginPaths(profile) {
  for (const item of profile.plugins) {
    assert.match(item.path, /^dsh-plugins\/[a-z][a-z0-9-]*$/, 'RELEASE_PACK_PLUGIN_PATH');
    assert.ok(!['dsh-plugins/plugin-kit', 'dsh-plugins/board-components'].includes(item.path), 'RELEASE_PACK_PLUGIN_PATH');
  }
}

/** The selected main profile must be exactly the profile bound by the external input. */
export async function loadReleasePacks({ root, inputsPath, manifestPath, requireGeneratedProvenance = false } = {}) {
  const snapshot = await loadProfileSnapshot({ root, manifestPath });
  const packs = await loadProfilePacks({ inputsPath, requireGeneratedProvenance });
  assert.equal(packs.digest, snapshot.digest, 'RELEASE_PACK_PROFILE_MISMATCH');
  assert.equal(packs.contents, snapshot.contents, 'RELEASE_PACK_PROFILE_MISMATCH');
  pluginPaths(snapshot.profile);
  return { ...packs, path: snapshot.path };
}

async function filesWithin(root, prefix = '', state = { count: 0 }) {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), 'RELEASE_PACK_RUNTIME_SYMLINK');
    if (entry.isDirectory()) {
      assert.ok(path.split('/').length <= 32, 'RELEASE_PACK_RUNTIME_DEPTH');
      files.push(...await filesWithin(root, path, state));
    } else {
      assert.ok(entry.isFile(), 'RELEASE_PACK_RUNTIME_SPECIAL');
      assert.ok(++state.count <= MAX_FILES, 'RELEASE_PACK_RUNTIME_FILES');
      files.push(path);
    }
  }
  return files.sort();
}

/** All plugin source paths are excluded before traversing the main allowlist. */
export async function prepareReleasePayload({ root, inputsPath, manifestPath, output, python = 'python3' } = {}) {
  assert.ok(isAbsolute(root ?? ''), 'RELEASE_PACK_ROOT_REQUIRED');
  assert.ok(isAbsolute(output ?? ''), 'RELEASE_PACK_OUTPUT_REQUIRED');
  const packs = await loadReleasePacks({ root, inputsPath, manifestPath });
  const { collectAllowlist, DEFAULT_ALLOWLIST } = await import('./artifact.mjs');
  const base = await collectAllowlist(root, { allowlist: DEFAULT_ALLOWLIST.filter(path => path !== 'dsh-plugins/')
    .concat('dsh-plugins/plugin-kit/'), maxFiles: MAX_FILES });
  const profilePath = relative(root, packs.path).split('\\').join('/');
  assert.ok(base.includes(profilePath), 'RELEASE_PACK_PROFILE_NOT_IN_PAYLOAD');
  assert.ok(!base.some(path => path === INPUTS || path.startsWith(`${PACKS}/`)), 'RELEASE_PACK_RESERVED_INPUT_PATH');
  const currentProfile = await insideArtifact(root, profilePath, 256 * 1024);
  assert.equal(hash(currentProfile), packs.digest, 'RELEASE_PACK_PROFILE_CHANGED');
  await mkdir(output, { mode: 0o700 });
  let bytes = 0, files = 0;
  async function save(path, buffer, mode = 0o600) {
    bytes += buffer.length; files += 1;
    assert.ok(bytes <= MAX_BYTES && files <= MAX_FILES, 'RELEASE_PACK_PAYLOAD_LIMIT');
    await mkdir(dirname(join(output, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(output, path), buffer, { flag: 'wx', mode });
  }
  for (const path of base) {
    const content = path === profilePath ? currentProfile : await insideArtifact(root, path, 20 * 1024 * 1024, true);
    const info = await lstat(join(root, path));
    await save(path, content, info.mode & 0o100 ? 0o700 : 0o600);
  }
  const work = await mkdtemp(join(tmpdir(), 'release-fixed-packs-'));
  try {
    const installed = await installProfilePacks({ packs, output: join(work, 'installed'), python });
    const input = { schema_version: 'dsh-profile-pack-inputs/v1', profile: { path: profilePath, sha256: packs.digest }, plugins: [] };
    for (const [index, item] of packs.plugins.entries()) {
      const directory = `${PACKS}/${index}`, manifest = `${directory}/plugin-pack.json`;
      await save(manifest, item.manifestBytes);
      await save(`${directory}/${item.receipt.tarball.name}`, item.archive);
      input.plugins.push({ id: item.id, manifest, sha256: item.manifestSha256 });
      const source = installed.plugins[index].root;
      assert.deepEqual(await filesWithin(source), [...item.receipt.entries].sort(), 'RELEASE_PACK_RUNTIME_ENTRIES');
      for (const path of item.receipt.entries) {
        await save(`${item.path}/${path}`, await insideArtifact(source, path, 20 * 1024 * 1024, true));
      }
    }
    const inputBytes = Buffer.from(JSON.stringify(input, null, 2) + '\n');
    await save(INPUTS, inputBytes);
    const snapshot = { path: INPUTS, sha256: hash(inputBytes) };
    await verifyReleasePackBinding({ directory: output, snapshot, profileSnapshot: { path: profilePath, sha256: packs.digest }, python });
    return { root: output, profile_path: profilePath, inputs_sha256: packs.inputsSha256, profile_pack_snapshot: snapshot, files, bytes,
      plugins: installed.plugins.map(({ root: _root, ...row }) => row), activation: 'NOT_RUN', release_ready: false };
  } finally { await rm(work, { recursive: true, force: true }); }
}

/** Verify received runtime files against the exact archives, not a package name alone. */
export async function verifyReleasePackBinding({ directory, snapshot, profileSnapshot, python = 'python3' }) {
  assert.ok(profileSnapshot, 'RELEASE_PACK_PROFILE_SNAPSHOT_REQUIRED');
  assert.deepEqual(Object.keys(snapshot).sort(), ['path', 'sha256'], 'RELEASE_PACK_SNAPSHOT_SHAPE');
  assert.equal(snapshot.path, INPUTS, 'RELEASE_PACK_SNAPSHOT_PATH');
  assert.match(snapshot.sha256 ?? '', /^[a-f0-9]{64}$/, 'RELEASE_PACK_SNAPSHOT_DIGEST');
  const input = await insideArtifact(directory, snapshot.path, 256 * 1024);
  assert.equal(hash(input), snapshot.sha256, 'RELEASE_PACK_SNAPSHOT_DIGEST');
  const packs = await loadProfilePacks({ inputsPath: join(directory, snapshot.path) });
  assert.equal(packs.digest, profileSnapshot.sha256, 'RELEASE_PACK_PROFILE_MISMATCH');
  assert.equal(relative(directory, packs.path).split('\\').join('/'), profileSnapshot.path, 'RELEASE_PACK_PROFILE_MISMATCH');
  pluginPaths(packs.profile);
  const work = await mkdtemp(join(tmpdir(), 'release-pack-binding-'));
  try {
    const installed = await installProfilePacks({ packs, output: join(work, 'installed'), python });
    for (const [index, item] of packs.plugins.entries()) {
      const target = join(directory, item.path);
      assert.ok((await lstat(target)).isDirectory() && !(await lstat(target)).isSymbolicLink(), 'RELEASE_PACK_RUNTIME_DIRECTORY');
      assert.deepEqual(await filesWithin(target), [...item.receipt.entries].sort(), 'RELEASE_PACK_RUNTIME_ENTRIES');
      for (const path of item.receipt.entries) {
        assert.deepEqual(await insideArtifact(directory, `${item.path}/${path}`, 20 * 1024 * 1024, true),
          await insideArtifact(installed.plugins[index].root, path, 20 * 1024 * 1024, true), 'RELEASE_PACK_RUNTIME_BYTES');
      }
    }
    return { plugins: packs.plugins.length, status: 'PACK_BYTES_VERIFIED', activation: 'NOT_RUN', release_ready: false };
  } finally { await rm(work, { recursive: true, force: true }); }
}
