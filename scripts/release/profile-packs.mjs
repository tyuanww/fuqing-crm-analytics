/** Fixed plugin packages for profile assembly. Does not build, install peers or activate a host. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadProfileSnapshot } from './profile.mjs';
import { readPluginPack } from './plugin-pack.mjs';
import { TOOLCHAIN } from './toolchain.mjs';
import { insideArtifact, readArtifactFile } from './service-artifact-evidence.mjs';

const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const HEX = /^[a-f0-9]{64}$/;
const RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\\)[^\0]+$/;
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

export async function loadProfilePacks({ inputsPath, toolchain = TOOLCHAIN } = {}) {
  assert.ok(typeof inputsPath === 'string' && isAbsolute(inputsPath), 'PROFILE_PACK_INPUTS_REQUIRED');
  const bytes = await readArtifactFile(inputsPath, 256 * 1024), input = JSON.parse(bytes);
  exact(input, ['schema_version', 'profile', 'plugins'], 'PROFILE_PACK_INPUTS_SHAPE');
  assert.equal(input.schema_version, 'dsh-profile-pack-inputs/v1', 'PROFILE_PACK_INPUTS_SCHEMA');
  exact(input.profile, ['path', 'sha256'], 'PROFILE_PACK_PROFILE_SHAPE');
  assert.match(input.profile.path ?? '', RELATIVE, 'PROFILE_PACK_PROFILE_PATH');
  assert.match(input.profile.sha256 ?? '', HEX, 'PROFILE_PACK_PROFILE_DIGEST');
  const root = dirname(inputsPath);
  const profileBytes = await insideArtifact(root, input.profile.path, 256 * 1024);
  assert.equal(hash(profileBytes), input.profile.sha256, 'PROFILE_PACK_PROFILE_DIGEST');
  const snapshot = await loadProfileSnapshot({ root, manifestPath: input.profile.path, toolchain });
  assert.equal(snapshot.digest, input.profile.sha256, 'PROFILE_PACK_PROFILE_CHANGED');
  assert.ok(Array.isArray(input.plugins) && input.plugins.length > 0 && input.plugins.length <= 32, 'PROFILE_PACK_PLUGINS_REQUIRED');
  assert.deepEqual(input.plugins.map(row => row?.id), snapshot.profile.plugins.map(row => row.id), 'PROFILE_PACK_SELECTION_MISMATCH');
  const plugins = [];
  for (const [index, row] of input.plugins.entries()) {
    exact(row, ['id', 'manifest', 'sha256'], 'PROFILE_PACK_PLUGIN_SHAPE');
    assert.match(row.manifest ?? '', RELATIVE, 'PROFILE_PACK_MANIFEST_PATH');
    assert.match(row.sha256 ?? '', HEX, 'PROFILE_PACK_MANIFEST_DIGEST');
    const manifestBytes = await insideArtifact(root, row.manifest, 256 * 1024);
    assert.equal(hash(manifestBytes), row.sha256, 'PROFILE_PACK_MANIFEST_DIGEST');
    const packed = await readPluginPack({ manifestPath: join(root, row.manifest), expectedSha256: row.sha256,
      expectedSdkVersion: toolchain.sdk_version, expectedPnpmVersion: toolchain.pnpm });
    assert.equal(packed.receipt.package_name, row.id, 'PROFILE_PACK_PACKAGE_ID');
    plugins.push({ ...snapshot.profile.plugins[index], ...packed, manifestSha256: row.sha256 });
  }
  return { ...snapshot, inputsPath, inputsSha256: hash(bytes), plugins };
}

/** Extract already verified, in-memory bytes into a new command-owned directory. */
export async function installProfilePacks({ packs, output, python = 'python3' }) {
  assert.ok(typeof output === 'string' && isAbsolute(output), 'PROFILE_PACK_OUTPUT_ABSOLUTE');
  assert.ok(packs?.plugins?.length && packs.plugins.length <= 32, 'PROFILE_PACK_PLUGINS_REQUIRED');
  // Recheck held bytes before writing: callers cannot mutate a loaded input and
  // accidentally install different bytes under the validated digest.
  assert.equal(hash(packs.contents), packs.digest, 'PROFILE_PACK_PROFILE_CHANGED');
  const profile = JSON.parse(packs.contents), profileDigest = packs.digest, inputsDigest = packs.inputsSha256;
  assert.deepEqual(packs.profile, profile, 'PROFILE_PACK_PROFILE_CHANGED');
  // Own the bytes synchronously, before the first filesystem await. A caller
  // changing its buffers while mkdir/writeFile yield must not change this run.
  const selected = packs.plugins.map(item => ({ ...item, receipt: structuredClone(item.receipt),
    manifestBytes: Buffer.from(item.manifestBytes), archive: Buffer.from(item.archive) }));
  assert.deepEqual(selected.map(row => row.id), profile.plugins.map(row => row.id), 'PROFILE_PACK_SELECTION_MISMATCH');
  for (const item of selected) {
    assert.equal(hash(item.manifestBytes), item.manifestSha256, 'PROFILE_PACK_MANIFEST_DIGEST');
    assert.deepEqual(JSON.parse(item.manifestBytes), item.receipt, 'PROFILE_PACK_RECEIPT_CHANGED');
    assert.equal(item.receipt.package_name, item.id, 'PROFILE_PACK_PACKAGE_ID');
    assert.equal(hash(item.archive), item.receipt.tarball.sha256, 'PROFILE_PACK_ARCHIVE_CHANGED');
  }
  await mkdir(output, { mode: 0o700 });
  const plugins = [];
  for (const [index, item] of selected.entries()) {
    const directory = join(output, String(index));
    await mkdir(directory, { mode: 0o700 });
    const archive = join(directory, 'input.tgz'), unpacked = join(directory, 'unpacked');
    await writeFile(archive, item.archive, { mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, 'plugin-pack.json'), item.manifestBytes, { mode: 0o600, flag: 'wx' });
    await exec(python, ['-I', fileURLToPath(new URL('./secure-unpack.py', import.meta.url)), archive, unpacked,
      '--max-entries', '10000', '--max-bytes', String(20 * 1024 * 1024)], { cwd: directory, timeout: 30000, maxBuffer: 256 * 1024 });
    assert.deepEqual(await readdir(unpacked), ['package'], 'PROFILE_PACK_ARCHIVE_ROOT');
    plugins.push({ id: item.id, root: join(unpacked, 'package'), source_sha: item.receipt.source_sha,
      version: item.receipt.package_version, manifest_sha256: item.manifestSha256, pack_sha256: item.receipt.tarball.sha256 });
  }
  const receipt = { schema_version: 'dsh-profile-pack-install/v1', profile_id: profile.profile_id,
    profile_sha256: profileDigest, inputs_sha256: inputsDigest, plugins, host: 'NOT_RUN', release_ready: false };
  await writeFile(join(output, 'profile-pack-install.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return receipt;
}
