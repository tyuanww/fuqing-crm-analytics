/** Prepare the same sealed independent-pack inputs for local and hosted B0. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { loadProfileSnapshot } from '../release/profile.mjs';
import { readPluginPack } from '../release/plugin-pack.mjs';
import { readDomainPack } from '../release/domain-pack.mjs';
import { insideArtifact, readArtifactFile } from '../release/service-artifact-evidence.mjs';
import { readCompositionInputs, validateCompositionPacks } from '../crm-calibration/composition-inputs.mjs';
import { readToolchainFile, validateToolchain } from '../dsh-dev/pin.mjs';
import { validateSourceManifest } from '../release/plugin-source-manifest.mjs';

const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = fileURLToPath(new URL('../..', import.meta.url));
const defaultLockPath = join(root, 'config/shinemage-composition-packs.lock.json');
const HEX = /^[a-f0-9]{64}$/, SHA = /^[a-f0-9]{40}$/;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const json = value => JSON.stringify(value, null, 2) + '\n';
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}
function absolute(path, code) {
  assert.ok(typeof path === 'string' && isAbsolute(path) && !/[\x00-\x1f\x7f]/.test(path), code);
  return resolve(path);
}

/** All inputs are validated before the new output directory is created. */
export async function prepareCompositionPacks({ inputDirectory, output,
  lockPath = defaultLockPath, profileRoot = root, toolchain, cordisPeerVersion, manifestPath = null } = {}) {
  const source = absolute(inputDirectory, 'CI_COMPOSITION_PACK_DIRECTORY_REQUIRED');
  const destination = absolute(output, 'CI_COMPOSITION_OUTPUT_REQUIRED');
  profileRoot = absolute(profileRoot, 'CI_COMPOSITION_PROFILE_ROOT_REQUIRED');
  const explicitToolchain = toolchain !== undefined || process.env.DSH_COMPOSITION_TOOLCHAIN !== undefined;
  const selectedToolchain = toolchain !== undefined ? validateToolchain(toolchain) : (process.env.DSH_COMPOSITION_TOOLCHAIN !== undefined
    ? await readToolchainFile(process.env.DSH_COMPOSITION_TOOLCHAIN) : undefined);
  const selectedCordisPeer = cordisPeerVersion ?? process.env.CRM_COMPOSITION_CORDIS_PEER;
  const info = await lstat(source);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'CI_COMPOSITION_PACK_DIRECTORY_INVALID');
  const physicalDestination = join(await realpath(dirname(destination)), basename(destination));
  const difference = relative(await realpath(source), physicalDestination);
  assert.ok(difference && (difference === '..' || difference.startsWith(`..${sep}`) || isAbsolute(difference)),
    'CI_COMPOSITION_OUTPUT_INSIDE_INPUT');
  const lockBytes = await readArtifactFile(absolute(lockPath, 'CI_COMPOSITION_LOCK_REQUIRED'), 256 * 1024);
  const lock = JSON.parse(lockBytes);
  exact(lock, ['schema_version', 'profiles', 'plugins'], 'CI_COMPOSITION_LOCK_SHAPE');
  assert.equal(lock.schema_version, 'shinemage-composition-pack-lock/v1', 'CI_COMPOSITION_LOCK_SCHEMA');
  assert.ok(Array.isArray(lock.profiles), 'CI_COMPOSITION_PROFILES_REQUIRED');
  assert.deepEqual(lock.profiles.map(row => row.name), ['crm', 'page'], 'CI_COMPOSITION_PROFILES_REQUIRED');
  const profiles = [];
  for (const row of lock.profiles) {
    exact(row, ['name', 'path', 'sha256'], 'CI_COMPOSITION_PROFILE_SHAPE');
    assert.match(row.sha256 ?? '', HEX, 'CI_COMPOSITION_PROFILE_DIGEST');
    const bytes = await insideArtifact(profileRoot, row.path, 256 * 1024);
    assert.equal(hash(bytes), row.sha256, 'CI_COMPOSITION_PROFILE_DIGEST');
    const snapshot = await loadProfileSnapshot({ root: profileRoot, manifestPath: row.path, toolchain: selectedToolchain });
    assert.equal(snapshot.digest, row.sha256, 'CI_COMPOSITION_PROFILE_CHANGED');
    profiles.push({ ...row, bytes, profile: snapshot.profile });
  }
  const selected = profiles.flatMap(row => row.profile.plugins.map(plugin => plugin.id));
  assert.ok(selected.length > 0 && selected.length <= 32, 'CI_COMPOSITION_SELECTION');
  assert.equal(new Set(selected).size, selected.length, 'CI_COMPOSITION_PROFILE_OVERLAP');
  assert.ok(Array.isArray(lock.plugins) && lock.plugins.length === selected.length, 'CI_COMPOSITION_SELECTION');
  assert.deepEqual(lock.plugins.map(row => row.id).sort(), [...selected].sort(), 'CI_COMPOSITION_SELECTION');
  let sourceManifest = null, sourceManifestSha256 = null, sourceManifestRows = new Map();
  if (manifestPath) {
    const manifestBytes = await readArtifactFile(absolute(manifestPath, 'CI_COMPOSITION_SOURCE_MANIFEST_REQUIRED'), 512 * 1024);
    sourceManifestSha256 = hash(manifestBytes);
    sourceManifest = validateSourceManifest(JSON.parse(manifestBytes), {
      lockSha256: hash(lockBytes), expectedIds: selected,
    });
    sourceManifestRows = new Map(sourceManifest.sources.map(row => [row.id, row]));
    for (const row of lock.plugins) {
      const source = sourceManifestRows.get(row.id);
      assert.ok(source, 'CI_COMPOSITION_SOURCE_MANIFEST_PLUGIN_REQUIRED');
      assert.equal(source.status, 'PASS', 'CI_COMPOSITION_SOURCE_NOT_READY');
      assert.equal(source.directory, row.directory, 'CI_COMPOSITION_SOURCE_MANIFEST_DIRECTORY');
      assert.equal(source.sha, row.source_sha, 'CI_COMPOSITION_SOURCE_MANIFEST_SHA');
      assert.equal(source.manifest_sha256, row.manifest_sha256, 'CI_COMPOSITION_SOURCE_MANIFEST_DIGEST');
    }
  }
  const plugins = [];
  for (const row of lock.plugins) {
    exact(row, ['directory', 'id', 'source_sha', 'version', 'manifest_sha256'], 'CI_COMPOSITION_PLUGIN_SHAPE');
    assert.match(row.directory ?? '', /^[a-z][a-z0-9-]*$/, 'CI_COMPOSITION_DIRECTORY_INVALID');
    assert.match(row.source_sha ?? '', SHA, 'CI_COMPOSITION_SOURCE_INVALID');
    assert.match(row.manifest_sha256 ?? '', HEX, 'CI_COMPOSITION_MANIFEST_DIGEST');
    const manifest = `packs/${row.directory}/plugin-pack.json`;
    const bytes = await insideArtifact(source, manifest, 256 * 1024);
    assert.equal(hash(bytes), row.manifest_sha256, 'CI_COMPOSITION_MANIFEST_DIGEST');
    const packed = await readPluginPack({ manifestPath: join(source, manifest), expectedSha256: row.manifest_sha256,
      expectedSdkVersion: selectedToolchain?.sdk_version, expectedPnpmVersion: selectedToolchain?.pnpm,
      requireGeneratedProvenance: true });
    assert.equal(packed.receipt.package_name, row.id, 'CI_COMPOSITION_PACKAGE_ID');
    assert.equal(packed.receipt.package_version, row.version, 'CI_COMPOSITION_PACKAGE_VERSION');
    assert.equal(packed.receipt.source_sha, row.source_sha, 'CI_COMPOSITION_SOURCE_MISMATCH');
    const sourceBinding = sourceManifestRows.get(row.id);
    if (sourceBinding) assert.equal(packed.receipt.tarball.sha256, sourceBinding.pack_sha256, 'CI_COMPOSITION_SOURCE_PACK_DIGEST');
    plugins.push({ ...row, manifestPath: manifest, ...packed });
  }
  assert.equal(new Set(plugins.map(row => row.directory)).size, plugins.length, 'CI_COMPOSITION_DIRECTORY_DUPLICATE');
  const domains = [];
  for (const row of sourceManifest?.domains ?? []) {
    assert.equal(row.status, 'PASS', 'CI_COMPOSITION_DOMAIN_NOT_READY');
    const manifestBytes = await insideArtifact(source, row.manifest, 256 * 1024);
    assert.equal(hash(manifestBytes), row.manifest_sha256, 'CI_COMPOSITION_DOMAIN_MANIFEST_DIGEST');
    const packed = await readDomainPack({ manifestPath: join(source, row.manifest), expectedSha256: row.manifest_sha256,
      expectedSourceSha: row.sha, expectedPackage: row.package, requireGeneratedProvenance: true });
    assert.equal(packed.receipt.tarball.sha256, row.pack_sha256, 'CI_COMPOSITION_DOMAIN_PACK_DIGEST');
    domains.push({ ...row, ...packed });
  }
  const [packs, pages] = profiles.map(row => ({ profile: row.profile,
    plugins: row.profile.plugins.map(plugin => plugins.find(item => item.id === plugin.id)) }));
  validateCompositionPacks({ packs, pages, toolchain: selectedToolchain,
    cordisPeerVersion: selectedCordisPeer });
  await mkdir(destination, { mode: 0o700 });
  for (const row of plugins) {
    const directory = join(destination, 'packs', row.directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'plugin-pack.json'), row.manifestBytes, { flag: 'wx', mode: 0o600 });
    await writeFile(join(directory, row.receipt.tarball.name), row.archive, { flag: 'wx', mode: 0o600 });
  }
  for (const row of domains) {
    const manifestPath = join(destination, row.manifest);
    await mkdir(dirname(manifestPath), { recursive: true, mode: 0o700 });
    await writeFile(manifestPath, row.manifestBytes, { flag: 'wx', mode: 0o600 });
    await writeFile(join(dirname(manifestPath), row.receipt.tarball.name), row.archive, { flag: 'wx', mode: 0o600 });
  }
  const inputs = {};
  for (const row of profiles) {
    const path = join(destination, row.path);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, row.bytes, { flag: 'wx', mode: 0o600 });
    const input = { schema_version: 'dsh-profile-pack-inputs/v1', profile: { path: row.path, sha256: row.sha256 },
      plugins: row.profile.plugins.map(plugin => {
        const pack = plugins.find(item => item.id === plugin.id);
        return { id: plugin.id, manifest: pack.manifestPath, sha256: pack.manifest_sha256 };
      }) };
    inputs[row.name] = join(destination, `${row.name}-inputs.json`);
    await writeFile(inputs[row.name], json(input), { flag: 'wx', mode: 0o600 });
  }
  // Apply the real domain/public-export/peer guards to the actual prepared bytes.
  await readCompositionInputs({ inputsPath: inputs.crm, pageInputsPath: inputs.page, toolchain: selectedToolchain,
    cordisPeerVersion: selectedCordisPeer });
  const runtimeOutput = join(destination, 'runs');
  await mkdir(runtimeOutput, { mode: 0o700 });
  const toolchainPath = explicitToolchain ? join(destination, 'toolchain.json') : null;
  if (toolchainPath) await writeFile(toolchainPath, json(selectedToolchain), { flag: 'wx', mode: 0o600 });
  const env = { CRM_COMPOSITION_PACK_INPUTS: inputs.crm, CRM_COMPOSITION_PAGE_INPUTS: inputs.page,
    CRM_COMPOSITION_OUTPUT: runtimeOutput,
    ...(toolchainPath ? { DSH_COMPOSITION_TOOLCHAIN: toolchainPath } : {}),
    ...(selectedCordisPeer ? { CRM_COMPOSITION_CORDIS_PEER: selectedCordisPeer } : {}),
    ...(process.env.CRM_COMPOSITION_CORDIS_RUNTIME ? { CRM_COMPOSITION_CORDIS_RUNTIME: process.env.CRM_COMPOSITION_CORDIS_RUNTIME } : {}) };
  const receipt = { schema_version: 'shinemage-ci-composition-preparation/v1', lock_sha256: hash(lockBytes),
    source_manifest_sha256: sourceManifestSha256,
    profiles: profiles.map(({ name, path, sha256 }) => ({ name, path, sha256 })),
    plugins: plugins.map(row => ({ id: row.id, source_sha: row.source_sha, version: row.version,
      manifest_sha256: row.manifest_sha256, pack_sha256: row.receipt.tarball.sha256 })),
    domains: domains.map(row => ({ package: row.package, source_sha: row.sha, manifest: row.manifest,
      manifest_sha256: row.manifest_sha256, pack_sha256: row.receipt.tarball.sha256 })), env,
    host: 'NOT_RUN', remote_ci: 'NOT_RUN', release_ready: false };
  await writeFile(join(destination, 'preparation.json'), json(receipt), { flag: 'wx', mode: 0o600 });
  return receipt;
}

function validateArtifactReference({ repository, id, sha256 }) {
  assert.match(repository ?? '', /^tyuanww\/(?:fuqing-crm-analytics|dsh-[a-z][a-z0-9-]*)$/, 'CI_COMPOSITION_ARTIFACT_REPOSITORY');
  assert.ok(Number.isSafeInteger(id) && id > 0, 'CI_COMPOSITION_ARTIFACT_ID');
  assert.match(sha256 ?? '', HEX, 'CI_COMPOSITION_ARTIFACT_DIGEST');
}

export async function loadCompositionArtifactReference({ artifactLockPath, compositionLockPath = defaultLockPath } = {}) {
  const bytes = await readArtifactFile(absolute(artifactLockPath, 'CI_COMPOSITION_ARTIFACT_LOCK_REQUIRED'), 64 * 1024);
  const lock = JSON.parse(bytes);
  exact(lock, ['schema_version', 'repository', 'id', 'sha256', 'runId', 'headSha', 'composition_lock_sha256'], 'CI_COMPOSITION_ARTIFACT_LOCK_SHAPE');
  assert.equal(lock.schema_version, 'dsh-composition-artifact/v1', 'CI_COMPOSITION_ARTIFACT_LOCK_SCHEMA');
  validateArtifactReference(lock);
  assert.ok(Number.isSafeInteger(lock.runId) && lock.runId > 0, 'CI_COMPOSITION_ARTIFACT_RUN_ID');
  assert.match(lock.headSha ?? '', SHA, 'CI_COMPOSITION_ARTIFACT_HEAD_SHA');
  assert.match(lock.composition_lock_sha256 ?? '', HEX, 'CI_COMPOSITION_ARTIFACT_COMPOSITION_DIGEST');
  const composition = await readArtifactFile(absolute(compositionLockPath, 'CI_COMPOSITION_LOCK_REQUIRED'), 256 * 1024);
  assert.equal(hash(composition), lock.composition_lock_sha256, 'CI_COMPOSITION_ARTIFACT_COMPOSITION_DIGEST');
  return { repository: lock.repository, id: lock.id, sha256: lock.sha256, runId: lock.runId, headSha: lock.headSha };
}

export function inspectGitHubArtifact(artifact, { repository, id, sha256, runId, headSha }) {
  validateArtifactReference({ repository, id, sha256 });
  assert.equal(artifact.id, id, 'CI_COMPOSITION_ARTIFACT_ID_MISMATCH');
  assert.equal(artifact.expired, false, 'CI_COMPOSITION_ARTIFACT_EXPIRED');
  assert.equal(artifact.digest, `sha256:${sha256}`, 'CI_COMPOSITION_ARTIFACT_DIGEST');
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_ARCHIVE,
    'CI_COMPOSITION_ARTIFACT_SIZE');
  assert.ok(Number.isSafeInteger(artifact.workflow_run?.id) && artifact.workflow_run.id > 0, 'CI_COMPOSITION_ARTIFACT_RUN');
  assert.match(artifact.workflow_run.head_sha ?? '', SHA, 'CI_COMPOSITION_ARTIFACT_RUN');
  if (runId !== undefined || headSha !== undefined) {
    assert.ok(Number.isSafeInteger(runId) && runId > 0, 'CI_COMPOSITION_ARTIFACT_RUN_ID');
    assert.match(headSha ?? '', SHA, 'CI_COMPOSITION_ARTIFACT_HEAD_SHA');
    assert.equal(artifact.workflow_run.id, runId, 'CI_COMPOSITION_ARTIFACT_RUN_ID');
    assert.equal(artifact.workflow_run.head_sha, headSha, 'CI_COMPOSITION_ARTIFACT_HEAD_SHA');
  }
}

async function receiveArchive({ archive, output, python, manifestPath, lockPath = defaultLockPath }) {
  const work = await mkdtemp(join(tmpdir(), 'composition-pack-archive-'));
  try {
    const bytes = await readArtifactFile(absolute(archive, 'CI_COMPOSITION_ARCHIVE_REQUIRED'), MAX_ARCHIVE);
    const input = join(work, 'input.zip'), extracted = join(work, 'extracted');
    await writeFile(input, bytes, { flag: 'wx', mode: 0o600 });
    await exec(python, ['-I', '-B', fileURLToPath(new URL('./unpack-composition-inputs.py', import.meta.url)), input, extracted],
      { timeout: 30000, maxBuffer: 256 * 1024 });
    return await prepareCompositionPacks({ inputDirectory: extracted, output, manifestPath, lockPath });
  } finally { await rm(work, { recursive: true, force: true }); }
}

async function receiveGitHubArtifact({ reference, output, python, manifestPath, lockPath = defaultLockPath }) {
  const { repository, id, sha256 } = reference;
  // Do not silently use personal gh credentials, or assume a public repo token
  // has access to the private author repositories. The token is prepare-only.
  validateArtifactReference({ repository, id, sha256 });
  absolute(output, 'CI_COMPOSITION_OUTPUT_REQUIRED');
  assert.ok(process.env.GH_TOKEN, 'CI_COMPOSITION_ARTIFACT_AUTH_REQUIRED: NOT_RUN without explicit read access');
  const work = await mkdtemp(join(tmpdir(), 'composition-pack-download-'));
  try {
    // gh's state directory is independent of GH_CONFIG_DIR; without HOME it
    // otherwise writes a relative .local/state directory in the checkout.
    const env = { PATH: process.env.PATH, GH_TOKEN: process.env.GH_TOKEN,
      GH_CONFIG_DIR: work, XDG_STATE_HOME: work, GH_PROMPT_DISABLED: '1' };
    const api = async (route, binary = false) => {
      try {
        return (await exec('gh', ['api', route], { env, encoding: binary ? 'buffer' : 'utf8', timeout: 180000,
          maxBuffer: MAX_ARCHIVE })).stdout;
      } catch { throw new Error('CI_COMPOSITION_ARTIFACT_FETCH_FAILED: check explicit read access and the fixed artifact'); }
    };
    const artifact = JSON.parse(await api(`repos/${repository}/actions/artifacts/${id}`));
    inspectGitHubArtifact(artifact, reference);
    const run = JSON.parse(await api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`));
    assert.equal(run.id, artifact.workflow_run.id, 'CI_COMPOSITION_ARTIFACT_RUN');
    assert.equal(run.status, 'completed', 'CI_COMPOSITION_ARTIFACT_RUN');
    assert.equal(run.conclusion, 'success', 'CI_COMPOSITION_ARTIFACT_RUN');
    assert.equal(run.head_sha, artifact.workflow_run.head_sha, 'CI_COMPOSITION_ARTIFACT_RUN');
    const bytes = await api(`repos/${repository}/actions/artifacts/${id}/zip`, true);
    assert.equal(bytes.length, artifact.size_in_bytes, 'CI_COMPOSITION_ARTIFACT_SIZE');
    assert.equal(hash(bytes), sha256, 'CI_COMPOSITION_ARTIFACT_DIGEST');
    const archive = join(work, 'input.zip');
    await writeFile(archive, bytes, { flag: 'wx', mode: 0o600 });
    return await receiveArchive({ archive, output, python, manifestPath, lockPath });
  } finally { await rm(work, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const key = args.shift(), value = args.shift();
      assert.ok(['--input-dir', '--archive', '--repository', '--artifact-lock', '--artifact-id', '--artifact-sha256', '--output', '--python', '--github-env', '--manifest'].includes(key)
        && value && !Object.hasOwn(options, key), 'CI_COMPOSITION_ARGUMENTS');
      options[key] = value;
    }
    const { '--input-dir': inputDirectory, '--archive': archive, '--repository': repository,
      '--artifact-id': artifactId, '--artifact-sha256': sha256, '--output': output,
      '--python': python = 'python3', '--github-env': githubEnv, '--manifest': manifestPath, '--artifact-lock': artifactLockPath } = options;
    assert.equal([inputDirectory, archive, repository, artifactLockPath].filter(Boolean).length, 1, 'CI_COMPOSITION_INPUT_REQUIRED');
    assert.ok(repository || (!artifactId && !sha256), 'CI_COMPOSITION_ARGUMENTS');
    const reference = artifactLockPath ? await loadCompositionArtifactReference({ artifactLockPath, compositionLockPath: defaultLockPath })
      : { repository, id: Number(artifactId), sha256 };
    const receipt = inputDirectory ? await prepareCompositionPacks({ inputDirectory, output, manifestPath })
      : archive ? await receiveArchive({ archive, output, python, manifestPath })
      : await receiveGitHubArtifact({ reference, output, python, manifestPath, lockPath: defaultLockPath });
    if (githubEnv) {
      const file = absolute(githubEnv, 'CI_COMPOSITION_GITHUB_ENV_INVALID'), info = await lstat(file);
      assert.ok(info.isFile() && !info.isSymbolicLink(), 'CI_COMPOSITION_GITHUB_ENV_INVALID');
      await appendFile(file, Object.entries(receipt.env).map(([key, value]) => `${key}=${value}\n`).join(''));
    }
    console.log(json(receipt));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
