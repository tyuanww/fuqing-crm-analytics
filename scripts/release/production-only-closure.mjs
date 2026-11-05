#!/usr/bin/env node

/**
 * Production-only closure rehearsal for the P4 repo split.
 *
 * A clean ref is materialized into a temp directory (never the caller's tree),
 * the ten plugin source trees that S1/S2/S3/S5 delete are removed, and the
 * remaining main tree must still:
 *   - validate profile inputs and the composition manifest from the locks,
 *   - import the pack readers and backend/kernel entrypoints,
 *   - install production-only (no dev dependencies),
 *   - install the sealed packs into a fresh consumer and import their server
 *     entrypoints,
 *   - build the release payload and verify the installed bytes
 *     (`installProfilePacks` + `verifyReleasePackBinding`).
 *
 * The receipt is deterministic for a given commit + artifact + toolchain. The
 * pnpm/network install is exercised here and in CI; the unit test only covers
 * the deterministic copy/absence/lock/receipt parts with fixtures.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  PRODUCTION_ONLY_CLOSURE_SCHEMA,
  RECEIPT_BEGIN,
  RECEIPT_END,
  REQUIRED_CHECKS,
  RETAINED_PLUGIN_DIRECTORIES,
  SIMULATED_ABSENT_DIRECTORIES,
  readProductionOnlyClosureReceipt,
  validateProductionOnlyClosureReceipt,
} from './production-only-closure-receipt.mjs';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_RECEIPT = join(REPO_ROOT, 'docs/operating/production-only-closure-receipt.md');
const LOCK_PATH = 'config/shinemage-composition-packs.lock.json';
const MANIFEST_PATH = 'config/shinemage-composition-pack-manifest.v1.json';
const ARTIFACT_LOCK_PATH = 'config/shinemage-composition-artifact.lock.json';
const BUSINESS_PROFILE = 'config/dsh-profile.business.rc3.json';
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

/** Pack readers and composition validators that must load without sources. */
const PACK_READER_MODULES = Object.freeze([
  'scripts/release/toolchain.mjs',
  'scripts/release/profile.mjs',
  'scripts/release/plugin-pack.mjs',
  'scripts/release/domain-pack.mjs',
  'scripts/release/service-artifact-evidence.mjs',
  'scripts/release/generated-provenance.mjs',
  'scripts/release/artifact.mjs',
  'scripts/release/release-profile-packs.mjs',
  'scripts/release/plugin-source-manifest.mjs',
  'scripts/release/runtime-inputs.mjs',
  'scripts/ci/composition-pack-inputs.mjs',
  'scripts/crm-calibration/composition-inputs.mjs',
]);

/** Backend/kernel imports that stay on a production path after P4. */
const PYTHON_ENTRYPOINTS = Object.freeze([
  'backend.analytics_app',
  'backend.analytics_query_app',
  'backend.analytics_analysis_app',
  'backend.analytics_cockpit_app',
  'backend.analytics_competition_app',
  'backend.analytics_first_purchase_app',
  'backend.analytics_first_purchase_analysis_app',
  'backend.analytics_first_purchase_cockpit_app',
  'backend.analytics_first_purchase_source_app',
  'backend.analytics_runtime',
  'backend.analytics_worker',
  'backend.analytics_fixture',
  'backend.analytics_query_fixture',
  'backend.contracts.board_spec',
  'backend.contracts.competition_c0',
  'backend.services.analytics.native_tools',
]);

const UNPROVEN = Object.freeze([
  'real production host: no host was started, no profile was activated, no business data was read',
  'host activation: activation stays NOT_RUN; pack bytes were installed and imported only',
  'company-runner M2-07 closure: this receipt does not replace the company production-only consumer closure gate',
  'remote main verification: the sealed artifact was downloaded from the locked run; this rehearsal does not dispatch main',
]);

function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

async function run(command, args, { cwd = REPO_ROOT, env = process.env, timeout = 900000 } = {}) {
  try {
    return await exec(command, args, { cwd, env, timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  } catch (error) {
    const detail = String(error.stderr ?? error.stdout ?? error.message ?? '').trim().split('\n').slice(-8).join(' | ');
    throw new Error(`${command} ${args.join(' ')} failed: ${detail.slice(0, 800)}`);
  }
}

async function git(args, cwd) {
  const result = await run('git', ['-C', cwd, ...args], { cwd });
  return result.stdout.trim();
}

/** Materialize a committed ref as a plain directory; `.git` and untracked files never enter. */
export async function materializeRef({ repository, ref, destination }) {
  assert.ok(isAbsolute(repository), 'PRODUCTION_ONLY_CLOSURE_REPOSITORY_REQUIRED');
  const commit = await git(['rev-parse', '--verify', `${ref}^{commit}`], repository);
  const tree = await git(['rev-parse', `${commit}^{tree}`], repository);
  assert.match(commit, /^[a-f0-9]{40}$/, 'PRODUCTION_ONLY_CLOSURE_COMMIT_INVALID');
  assert.match(tree, /^[a-f0-9]{40}$/, 'PRODUCTION_ONLY_CLOSURE_TREE_INVALID');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const entries = await readdir(destination);
  assert.deepEqual(entries, [], 'PRODUCTION_ONLY_CLOSURE_DESTINATION_NOT_EMPTY');
  const archive = `${destination}.tar`;
  try {
    await exec('git', ['-C', repository, 'archive', '--format=tar', commit], {
      encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, timeout: 300000,
    }).then(result => writeFile(archive, result.stdout, { mode: 0o600 }));
    await run('tar', ['-xf', archive, '-C', destination], { cwd: repository });
  } finally {
    await rm(archive, { force: true });
  }
  const commitDate = await git(['show', '-s', '--format=%cI', commit], repository);
  return { commit, tree, commitDate };
}

/**
 * Simulate exactly the source absence of S1/S2/S3/S5. `contracts`,
 * `plugin-kit` and `query-agent` must survive; anything else under
 * `dsh-plugins/` is an unexpected tree, not part of this rehearsal.
 */
export async function simulateSourceAbsence({ root, allowAlreadyAbsent = false }) {
  const plugins = join(root, 'dsh-plugins');
  const listed = (await readdir(plugins)).sort();
  for (const name of RETAINED_PLUGIN_DIRECTORIES) {
    assert.ok(listed.includes(name), `PRODUCTION_ONLY_CLOSURE_RETAINED_MISSING ${name}`);
    const info = await lstat(join(plugins, name));
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), `PRODUCTION_ONLY_CLOSURE_RETAINED_INVALID ${name}`);
  }
  const removed = [];
  for (const name of SIMULATED_ABSENT_DIRECTORIES) {
    const target = join(plugins, name);
    const info = await lstat(target).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info === null) {
      assert.ok(allowAlreadyAbsent, `PRODUCTION_ONLY_CLOSURE_ABSENCE_TARGET_MISSING ${name}`);
      continue;
    }
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), `PRODUCTION_ONLY_CLOSURE_ABSENCE_TARGET_INVALID ${name}`);
    await rm(target, { recursive: true, force: true });
    removed.push(name);
  }
  await assertSourceAbsence({ root });
  return { removed, retained: [...RETAINED_PLUGIN_DIRECTORIES] };
}

/** Fail unless the simulated boundary is exactly the ten-absent/three-retained shape. */
export async function assertSourceAbsence({ root }) {
  const plugins = join(root, 'dsh-plugins');
  const remaining = (await readdir(plugins)).sort();
  const expected = [...RETAINED_PLUGIN_DIRECTORIES].sort();
  assert.deepEqual(remaining, expected, 'PRODUCTION_ONLY_CLOSURE_UNEXPECTED_PLUGIN_TREE');
  for (const name of SIMULATED_ABSENT_DIRECTORIES) {
    const info = await lstat(join(plugins, name)).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert.equal(info, null, `PRODUCTION_ONLY_CLOSURE_ABSENCE_VERIFY_FAILED ${name}`);
  }
  for (const name of RETAINED_PLUGIN_DIRECTORIES) {
    const info = await lstat(join(plugins, name));
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), `PRODUCTION_ONLY_CLOSURE_RETAINED_INVALID ${name}`);
  }
  return { remaining };
}

async function readInside(root, relativePath, code, maxBytes = 256 * 1024) {
  assert.ok(typeof relativePath === 'string' && relativePath && !relativePath.startsWith('/')
    && !relativePath.includes('\\') && !relativePath.split('/').includes('..'), code);
  const realRoot = await realpath(root);
  const target = await realpath(join(root, relativePath)).catch(() => { throw new Error(code); });
  assert.ok(target === realRoot || target.startsWith(`${realRoot}${sep}`), code);
  const info = await lstat(target);
  assert.ok(info.isFile() && !info.isSymbolicLink(), code);
  assert.ok(info.size > 0 && info.size <= maxBytes, code);
  return readFile(target);
}

/**
 * Validate the two profile inputs and their lock digests without any pack
 * bytes. `loadProfileSnapshot` is injectable so the unit test can exercise the
 * digest/binding logic without copying the release toolchain.
 */
export async function validateProfilesFromLock({ root, loadProfileSnapshot = null }) {
  const lockPath = join(root, LOCK_PATH);
  let lockBytes;
  try {
    lockBytes = await readFile(lockPath);
  } catch {
    throw new Error('PRODUCTION_ONLY_CLOSURE_LOCK_MISSING');
  }
  const lock = JSON.parse(lockBytes);
  exact(lock, ['schema_version', 'profiles', 'plugins'], 'PRODUCTION_ONLY_CLOSURE_LOCK_SHAPE');
  assert.equal(lock.schema_version, 'shinemage-composition-pack-lock/v1', 'PRODUCTION_ONLY_CLOSURE_LOCK_SCHEMA');
  assert.ok(Array.isArray(lock.profiles), 'PRODUCTION_ONLY_CLOSURE_LOCK_PROFILES');
  assert.deepEqual(lock.profiles.map(row => row.name), ['crm', 'page'], 'PRODUCTION_ONLY_CLOSURE_LOCK_PROFILE_SELECTION');
  const load = loadProfileSnapshot ?? (await import(pathToFileURL(join(root, 'scripts/release/profile.mjs')).href)).loadProfileSnapshot;
  const profiles = [];
  for (const row of lock.profiles) {
    exact(row, ['name', 'path', 'sha256'], 'PRODUCTION_ONLY_CLOSURE_LOCK_PROFILE_SHAPE');
    assert.match(row.sha256 ?? '', SHA256, 'PRODUCTION_ONLY_CLOSURE_LOCK_PROFILE_DIGEST');
    const bytes = await readInside(root, row.path, `PRODUCTION_ONLY_CLOSURE_PROFILE_MISSING ${row.path}`);
    assert.equal(hash(bytes), row.sha256, 'PRODUCTION_ONLY_CLOSURE_PROFILE_DIGEST');
    const snapshot = await load({ root, manifestPath: row.path });
    assert.equal(snapshot.digest, row.sha256, 'PRODUCTION_ONLY_CLOSURE_PROFILE_CHANGED');
    profiles.push({ name: row.name, path: row.path, sha256: row.sha256, profile: snapshot.profile });
  }
  const selected = profiles.flatMap(row => row.profile.plugins.map(plugin => plugin.id));
  assert.ok(selected.length > 0 && selected.length <= 32, 'PRODUCTION_ONLY_CLOSURE_LOCK_SELECTION');
  assert.equal(new Set(selected).size, selected.length, 'PRODUCTION_ONLY_CLOSURE_LOCK_OVERLAP');
  assert.ok(Array.isArray(lock.plugins) && lock.plugins.length === selected.length, 'PRODUCTION_ONLY_CLOSURE_LOCK_SELECTION');
  assert.deepEqual(lock.plugins.map(row => row.id).sort(), [...selected].sort(), 'PRODUCTION_ONLY_CLOSURE_LOCK_SELECTION');
  for (const row of lock.plugins) {
    exact(row, ['directory', 'id', 'source_sha', 'version', 'manifest_sha256'], 'PRODUCTION_ONLY_CLOSURE_LOCK_PLUGIN_SHAPE');
    assert.match(row.source_sha ?? '', /^[a-f0-9]{40}$/, 'PRODUCTION_ONLY_CLOSURE_LOCK_PLUGIN_SHA');
    assert.match(row.manifest_sha256 ?? '', SHA256, 'PRODUCTION_ONLY_CLOSURE_LOCK_PLUGIN_MANIFEST');
  }
  return { lock, lockSha256: hash(lockBytes), profiles: profiles.map(({ profile: _profile, ...row }) => row), selected };
}

/** Read and validate the source manifest against the lock; no pack bytes needed. */
export async function validateCompositionManifest({ root, lockInfo, validateManifest = null }) {
  assert.ok(lockInfo, 'PRODUCTION_ONLY_CLOSURE_LOCK_REQUIRED');
  const manifestBytes = await readInside(root, MANIFEST_PATH, 'PRODUCTION_ONLY_CLOSURE_MANIFEST_MISSING', 512 * 1024);
  const manifest = JSON.parse(manifestBytes);
  const validate = validateManifest
    ?? (await import(pathToFileURL(join(root, 'scripts/release/plugin-source-manifest.mjs')).href)).validateSourceManifest;
  const receiptPath = join(root, 'docs/operating/production-only-closure-receipt.md');
  const options = { lockSha256: lockInfo.lockSha256, expectedIds: lockInfo.selected };
  if (manifest.deletion_gate?.status === 'READY') options.productionOnlyClosurePath = receiptPath;
  validate(manifest, options);
  for (const row of lockInfo.lock.plugins) {
    const source = manifest.sources.find(item => item.id === row.id);
    assert.ok(source, `PRODUCTION_ONLY_CLOSURE_MANIFEST_PLUGIN_MISSING ${row.id}`);
    assert.equal(source.directory, row.directory, 'PRODUCTION_ONLY_CLOSURE_MANIFEST_DIRECTORY');
    assert.equal(source.sha, row.source_sha, 'PRODUCTION_ONLY_CLOSURE_MANIFEST_SOURCE_SHA');
    assert.equal(source.manifest_sha256, row.manifest_sha256, 'PRODUCTION_ONLY_CLOSURE_MANIFEST_PACK_MANIFEST_SHA');
  }
  assert.ok(Array.isArray(manifest.domains) && manifest.domains.length === 1, 'PRODUCTION_ONLY_CLOSURE_MANIFEST_DOMAINS');
  return {
    manifestSha256: hash(manifestBytes),
    sources: manifest.sources.map(({ id, directory, sha, manifest_sha256, pack_sha256 }) => ({
      id, directory, sha, manifest_sha256, pack_sha256,
    })),
    domains: manifest.domains.map(({ package: packageName, directory, sha, manifest_sha256, pack_sha256 }) => ({
      package: packageName, directory, sha, manifest_sha256, pack_sha256,
    })),
    gate: manifest.deletion_gate,
  };
}

export async function validateArtifactLock({ root }) {
  const bytes = await readInside(root, ARTIFACT_LOCK_PATH, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_LOCK_MISSING', 64 * 1024);
  const lock = JSON.parse(bytes);
  exact(lock, ['schema_version', 'repository', 'id', 'sha256', 'runId', 'headSha', 'composition_lock_sha256'],
    'PRODUCTION_ONLY_CLOSURE_ARTIFACT_LOCK_SHAPE');
  assert.equal(lock.schema_version, 'dsh-composition-artifact/v1', 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_LOCK_SCHEMA');
  assert.equal(lock.repository, 'tyuanww/fuqing-crm-analytics', 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_REPOSITORY');
  assert.ok(Number.isSafeInteger(lock.id) && lock.id > 0, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_ID');
  assert.ok(Number.isSafeInteger(lock.runId) && lock.runId > 0, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_RUN');
  assert.match(lock.sha256 ?? '', SHA256, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_DIGEST');
  assert.match(lock.headSha ?? '', /^[a-f0-9]{40}$/, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_HEAD');
  assert.match(lock.composition_lock_sha256 ?? '', SHA256, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_COMPOSITION');
  return {
    path: ARTIFACT_LOCK_PATH,
    sha256: hash(bytes),
    id: lock.id,
    run_id: lock.runId,
    head_sha: lock.headSha,
    artifact_sha256: lock.sha256,
    composition_lock_sha256: lock.composition_lock_sha256,
  };
}

async function prepareSealedPacks({ root, artifact, artifactLock, lockInfo, python, work }) {
  assert.ok(artifact, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_REQUIRED');
  const info = await lstat(artifact);
  assert.ok(info.isFile() && !info.isSymbolicLink(), 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_INVALID');
  assert.ok(info.size > 0 && info.size <= MAX_ARTIFACT_BYTES, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_SIZE');
  const bytes = await readFile(artifact);
  const artifactSha256 = hash(bytes);
  assert.equal(artifactSha256, artifactLock.artifact_sha256, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_DIGEST_MISMATCH');
  assert.equal(artifactLock.composition_lock_sha256, lockInfo?.lockSha256, 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_LOCK_BINDING');
  const extracted = join(work, 'sealed');
  await run(python, ['-I', '-B', join(root, 'scripts/ci/unpack-composition-inputs.py'), artifact, extracted], { cwd: root });
  const output = join(work, 'composition');
  const { prepareCompositionPacks } = await import(pathToFileURL(join(root, 'scripts/ci/composition-pack-inputs.mjs')).href);
  const receipt = await prepareCompositionPacks({
    inputDirectory: extracted,
    output,
    manifestPath: join(root, MANIFEST_PATH),
    businessProfile: BUSINESS_PROFILE,
    profileRoot: root,
    python,
  });
  return { artifactSha256, extracted, output, receipt };
}

async function preparePayload({ root, composition, python, work }) {
  const { prepareReleasePayload } = await import(pathToFileURL(join(root, 'scripts/release/release-profile-packs.mjs')).href);
  return prepareReleasePayload({
    root,
    inputsPath: join(composition.output, 'business-inputs.json'),
    manifestPath: join(root, BUSINESS_PROFILE),
    output: join(work, 'payload'),
    python,
  });
}

async function mainProductionInstall({ root }) {
  const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
  await run('corepack', ['pnpm', 'install', '--prod', '--frozen-lockfile', '--ignore-scripts'], { cwd: root, env });
  const info = await lstat(join(root, 'node_modules'));
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'PRODUCTION_ONLY_CLOSURE_NODE_MODULES_INVALID');
  const modules = await readdir(join(root, 'node_modules'));
  return { status: 'PASS', top_level_entries: modules.sort() };
}

async function consumerClosure({ work, composition, pnpmVersion }) {
  const packsRoot = join(composition.output, 'packs');
  const directories = (await readdir(packsRoot)).sort();
  const dependencies = {};
  for (const directory of directories) {
    const manifest = JSON.parse(await readFile(join(packsRoot, directory, 'plugin-pack.json'), 'utf8'));
    const tarball = join(packsRoot, directory, manifest.tarball.name);
    assert.equal(hash(await readFile(tarball)), manifest.tarball.sha256, 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PACK_DIGEST');
    dependencies[manifest.package_name] = `file:${tarball}`;
  }
  const names = Object.keys(dependencies).sort();
  assert.equal(names.length, 9, 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PACK_COUNT');
  const sorted = Object.fromEntries(names.map(name => [name, dependencies[name]]));
  const staging = join(work, 'consumer');
  await mkdir(staging, { mode: 0o700 });
  await writeFile(join(staging, 'package.json'), JSON.stringify({
    name: 'production-only-consumer',
    private: true,
    type: 'module',
    packageManager: `pnpm@${pnpmVersion}`,
    dependencies: sorted,
  }, null, 2) + '\n', { mode: 0o600 });
  const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', COREPACK_ENABLE_NETWORK: '1' };
  await run('corepack', ['pnpm', 'install', '--prod', '--ignore-scripts', '--config.auto-install-peers=true'], {
    cwd: staging, env,
  });
  const installed = (await readdir(join(staging, 'node_modules/@shine-mage'))).sort();
  assert.deepEqual(installed, names.map(name => name.split('/')[1]).sort(), 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PACKAGE_SET');
  assert.ok(!installed.includes('dsh-plugin-kit'), 'PRODUCTION_ONLY_CLOSURE_CONSUMER_DEV_DEPENDENCY_INSTALLED');
  const store = (await readdir(join(staging, 'node_modules/.pnpm'))).sort();
  assert.ok(store.some(name => name.startsWith('katex@')), 'PRODUCTION_ONLY_CLOSURE_CONSUMER_RUNTIME_DEPENDENCY');
  assert.ok(store.some(name => name.startsWith('@deepseek-ai+cordis@')), 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PEER_CORDIS');
  assert.ok(store.some(name => name.startsWith('@deepseek-ai+dsh-tools@')), 'PRODUCTION_ONLY_CLOSURE_CONSUMER_PEER_TOOLS');
  const require = createRequire(join(staging, 'package.json'));
  const imports = [];
  for (const name of names) {
    const manifest = JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8'));
    const specifiers = [name];
    for (const [key, value] of Object.entries(manifest.exports ?? {})) {
      if (key === '.' || key === './client' || key === './package.json') continue;
      const target = typeof value === 'string' ? value : value?.import ?? value?.default;
      if (!target || !/\.(?:m?js)$/.test(target)) continue;
      specifiers.push(`${name}${key.slice(1)}`);
    }
    for (const specifier of specifiers.sort()) {
      try {
        await import(pathToFileURL(require.resolve(specifier)).href);
        imports.push({ specifier, status: 'PASS' });
      } catch (error) {
        imports.push({ specifier, status: 'FAIL' });
        throw new Error(`PRODUCTION_ONLY_CLOSURE_CONSUMER_IMPORT_FAILED ${specifier}: ${error.code ?? error.message}`);
      }
    }
  }
  imports.sort((a, b) => a.specifier.localeCompare(b.specifier));
  return {
    packages: names.length,
    install: 'PASS',
    imports,
    dev_dependencies: 'excluded',
    peer_dependencies: 'installed',
    client_bundles: 'NOT_RUN_BROWSER_TARGET',
  };
}

async function nodePackReaderImports({ root }) {
  const modules = [];
  for (const relativePath of PACK_READER_MODULES) {
    await import(pathToFileURL(join(root, relativePath)).href);
    modules.push(relativePath);
  }
  return { modules };
}

async function pythonImportClosure({ root, python }) {
  const script = [
    'import importlib, json, sys',
    'sys.path.insert(0, sys.argv[1])',
    'results = []',
    'for name in json.loads(sys.argv[2]):',
    '    try:',
    '        importlib.import_module(name)',
    '        results.append({"module": name, "status": "PASS"})',
    '    except Exception as error:',
    '        results.append({"module": name, "status": "FAIL", "error": type(error).__name__ + ": " + str(error)[:200]})',
    'print(json.dumps(results, ensure_ascii=True))',
  ].join('\n');
  const env = {
    ...process.env,
    PYTHONPATH: root,
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHON_DOTENV_DISABLED: '1',
  };
  const result = await run(python, ['-I', '-B', '-c', script, root, JSON.stringify([...PYTHON_ENTRYPOINTS])], {
    cwd: root, env,
  });
  const rows = JSON.parse(result.stdout.trim());
  const failed = rows.filter(row => row.status !== 'PASS');
  assert.deepEqual(failed, [], `PRODUCTION_ONLY_CLOSURE_PYTHON_IMPORT_FAILED ${failed.map(row => row.module).join(',')}`);
  const version = (await run(python, ['-c', 'import sys; print(sys.version.split()[0])'], { cwd: root, env })).stdout.trim();
  return { modules: rows, python: version };
}

async function backendSourcePaths({ root }) {
  const backend = join(root, 'backend');
  const findings = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests') continue;
        await walk(path);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.py')) continue;
      const text = await readFile(path, 'utf8');
      const match = text.match(/^[ \t]*(?:from|import)[^\n]*dsh-plugins/m);
      if (match) findings.push(relative(root, path).split(sep).join('/'));
    }
  }
  await walk(backend);
  assert.deepEqual(findings.sort(), [], `PRODUCTION_ONLY_CLOSURE_BACKEND_SOURCE_PATH ${findings.join(',')}`);
  return { scanned: 'backend/**/*.py excluding tests', findings: [] };
}

async function kernelManifestFiles({ root }) {
  const path = join(root, 'services/analytics-first-purchase-kernel/package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const files = manifest.files ?? {};
  const missing = [];
  for (const source of Object.values(files)) {
    if (typeof source !== 'string') {
      missing.push('<non-string>');
      continue;
    }
    await lstat(join(root, source)).catch(() => missing.push(source));
  }
  assert.deepEqual(missing.sort(), [], `PRODUCTION_ONLY_CLOSURE_KERNEL_FILE_MISSING ${missing.join(',')}`);
  return { files: Object.keys(files).length, sources: Object.values(files).length };
}

async function businessProfile({ root }) {
  const { generateBusinessProfile } = await import(pathToFileURL(join(root, 'scripts/ci/composition-pack-inputs.mjs')).href);
  const result = await generateBusinessProfile({
    businessProfile: BUSINESS_PROFILE,
    check: true,
    profileRoot: root,
    lockPath: join(root, LOCK_PATH),
  });
  return { path: result.path, sha256: result.sha256 };
}

class Checks {
  constructor() {
    this.items = [];
    this.blockers = [];
  }

  async run(id, fn) {
    try {
      const detail = await fn();
      this.items.push({ id, status: 'PASS' });
      return detail;
    } catch (error) {
      this.items.push({ id, status: 'FAIL' });
      this.blockers.push({ check: id, code: error?.message ?? String(error) });
      return null;
    }
  }

  skip(id, code) {
    this.items.push({ id, status: 'SKIPPED' });
    this.blockers.push({ check: id, code });
  }
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function renderMarkdown(receipt) {
  const inputRows = [
    ['lock', receipt.inputs.lock.path, receipt.inputs.lock.sha256],
    ['manifest', receipt.inputs.manifest.path, receipt.inputs.manifest.sha256],
    ['artifact lock', receipt.inputs.artifact_lock.path, receipt.inputs.artifact_lock.sha256],
    ['sealed artifact', `id ${receipt.inputs.artifact_lock.id} / run ${receipt.inputs.artifact_lock.run_id}`,
      receipt.inputs.artifact_zip_sha256],
  ];
  const checkRows = receipt.checks.map(check => `| \`${check.id}\` | ${check.status} |`).join('\n');
  const inputTable = inputRows.map(([name, path, sha]) => `| ${name} | \`${path}\` | \`${sha}\` |`).join('\n');
  const environmentRows = Object.entries(receipt.environment)
    .map(([key, value]) => `| ${key} | \`${value}\` |`).join('\n');
  return `# Production-only closure receipt

Machine-checked evidence for the production-only closure condition
(the gate reason once labelled \`production_only_closure_not_recorded\`). It records one rehearsal of
\`origin/main\` with the ten P4 source trees removed: profile inputs, the
composition manifest, the pack readers, the backend/kernel imports, a
production-only install, the sealed consumer install and the release payload
all passed. It deliberately does **not** clear \`remote_main_not_verified\`
and does not claim a real production host.

- Tested ref: \`${receipt.ref}\`
- Commit: \`${receipt.commit}\` (${receipt.environment.commit_date})
- Verdict: **${receipt.verdict}**
- Install mode: \`${receipt.environment.install_mode}\`
- Absence boundary: ${receipt.absence.boundary}

## Checks

| Check | Status |
|---|---|
${checkRows}

## Inputs

| Input | Path / id | SHA-256 |
|---|---|---|
${inputTable}

## Environment

| Field | Value |
|---|---|
${environmentRows}

## What this proves

- \`git archive\` of \`${receipt.commit}\` contains no \`.git\` and no untracked files; the rehearsal never touched the caller's worktree.
- The ten deleted trees were removed from the temp copy with \`rm -rf\`; the retained \`contracts\`, \`plugin-kit\` and \`query-agent\` trees were asserted to survive.
- Both profile digests, the business-profile re-derivation, the source-manifest/lock binding and all nine pack manifest/pack digests were read from the locks, not from plugin source.
- The pack readers and 16 backend/kernel modules imported from the copied tree with plugin sources absent.
- \`pnpm install --prod --frozen-lockfile\` installed the main tree without dev dependencies; the nine sealed packs installed into a fresh consumer with peers and imported their server entrypoints.
- \`prepareReleasePayload\` re-installed every pack and every runtime byte matched \`verifyReleasePackBinding\`; \`activation\` stayed \`NOT_RUN\`.

## Reproduce

\`\`\`bash
node scripts/release/production-only-closure.mjs --ref origin/main \\
  --artifact <sealed-artifact.zip> --python <python3.14> \\
  --receipt docs/operating/production-only-closure-receipt.md
\`\`\`

The network/pnpm install stage is expected to run in CI (or on a network-
connected host). \`--skip-install\` exercises only the deterministic copy,
absence, lock and import checks; a committed receipt must be a full PASS.

## What remains unproven

${UNPROVEN.map(item => `- ${item}`).join('\n')}

${RECEIPT_BEGIN}
\`\`\`json
${JSON.stringify(receipt, null, 2)}
\`\`\`
${RECEIPT_END}
`;
}

async function writeReceipt(path, receipt, format) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const markdown = format === 'markdown' || (format === null && target.endsWith('.md'));
  await writeFile(target, markdown ? renderMarkdown(receipt) : json(receipt), { mode: 0o600 });
  return { path: target, format: markdown ? 'markdown' : 'json' };
}

export async function runProductionOnlyClosure({ repo = REPO_ROOT, ref = 'origin/main', artifact = null,
  python = 'python3.14', skipInstall = false, allowAlreadyAbsent = false } = {}) {
  const repository = resolve(repo);
  const work = await mkdtemp(join(tmpdir(), 'production-only-closure-'));
  const checks = new Checks();
  const receipt = {
    schema_version: PRODUCTION_ONLY_CLOSURE_SCHEMA,
    verdict: 'FAIL',
    ref,
    commit: '',
    tree: '',
    absence: {
      simulated_absent: [...SIMULATED_ABSENT_DIRECTORIES],
      retained: [...RETAINED_PLUGIN_DIRECTORIES],
      boundary: 'S1/S2/S3/S5 delete exactly the ten plugin source trees; dsh-plugins/{contracts,plugin-kit} stay in main, '
        + 'query-agent stays under the S4 retention decision, and locks, manifests, profiles, packs and release scripts are retained.',
    },
    inputs: null,
    environment: null,
    checks: [],
    composition: null,
    release_payload: null,
    consumer: null,
    unproven: [...UNPROVEN],
  };
  try {
    let refInfo = null;
    await checks.run('ref_materialized', async () => {
      refInfo = await materializeRef({ repository, ref, destination: join(work, 'repo') });
      return refInfo;
    });
    if (refInfo === null) {
      receipt.checks = checks.items;
      return { receipt, blockers: checks.blockers, work };
    }
    receipt.commit = refInfo.commit;
    receipt.tree = refInfo.tree;
    const root = join(work, 'repo');

    await checks.run('plugin_sources_removed', () => simulateSourceAbsence({ root, allowAlreadyAbsent }));
    await checks.run('retained_plugin_trees', () => assertSourceAbsence({ root }));

    let lockInfo = null;
    await checks.run('profile_inputs_from_lock', async () => {
      lockInfo = await validateProfilesFromLock({ root });
      return lockInfo;
    });
    let manifestInfo = null;
    await checks.run('composition_manifest_from_lock', async () => {
      manifestInfo = await validateCompositionManifest({ root, lockInfo });
      return manifestInfo;
    });
    let business = null;
    await checks.run('business_profile_rederived', async () => {
      business = await businessProfile({ root });
      return business;
    });
    await checks.run('backend_source_paths', () => backendSourcePaths({ root }));
    await checks.run('kernel_manifest_files', () => kernelManifestFiles({ root }));
    await checks.run('node_pack_reader_imports', () => nodePackReaderImports({ root }));
    let pythonInfo = null;
    await checks.run('python_backend_imports', async () => {
      pythonInfo = await pythonImportClosure({ root, python });
      return pythonInfo;
    });

    let artifactLock = null;
    await checks.run('artifact_lock_binding', async () => {
      artifactLock = await validateArtifactLock({ root });
      return artifactLock;
    });

    let composition = null;
    if (artifact === null) {
      checks.skip('sealed_packs_validated', 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_REQUIRED');
    } else {
      await checks.run('sealed_packs_validated', async () => {
        composition = await prepareSealedPacks({ root, artifact, artifactLock, lockInfo, python, work });
        return composition;
      });
    }

    let mainInstall = null;
    if (skipInstall) {
      checks.skip('main_production_install', 'PRODUCTION_ONLY_CLOSURE_INSTALL_SKIPPED');
    } else {
      await checks.run('main_production_install', async () => {
        mainInstall = await mainProductionInstall({ root });
        return mainInstall;
      });
    }

    let payload = null;
    if (composition === null) {
      checks.skip('release_payload_installed', 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_REQUIRED');
    } else {
      await checks.run('release_payload_installed', async () => {
        payload = await preparePayload({ root, composition, python, work });
        return payload;
      });
    }

    let consumer = null;
    if (composition === null) {
      checks.skip('consumer_pack_imports', 'PRODUCTION_ONLY_CLOSURE_ARTIFACT_REQUIRED');
    } else if (skipInstall) {
      checks.skip('consumer_pack_imports', 'PRODUCTION_ONLY_CLOSURE_INSTALL_SKIPPED');
    } else {
      await checks.run('consumer_pack_imports', async () => {
        const pnpmVersion = (await run('corepack', ['pnpm', '--version'], { cwd: root })).stdout.trim();
        consumer = await consumerClosure({ work, composition, pnpmVersion });
        receipt.environment = {
          node: process.version,
          pnpm: pnpmVersion,
          python: pythonInfo?.python ?? 'UNKNOWN',
          platform: process.platform,
          arch: process.arch,
          install_mode: 'PRODUCTION_ONLY',
          commit_date: refInfo.commitDate,
        };
        return consumer;
      });
    }

    receipt.inputs = {
      lock: { path: LOCK_PATH, sha256: lockInfo?.lockSha256 ?? null },
      manifest: { path: MANIFEST_PATH, sha256: manifestInfo?.manifestSha256 ?? null },
      artifact_lock: artifactLock ?? {
        path: ARTIFACT_LOCK_PATH, sha256: null, id: null, run_id: null, head_sha: null,
        artifact_sha256: null, composition_lock_sha256: null,
      },
      artifact_zip_sha256: composition?.artifactSha256 ?? null,
      profiles: lockInfo?.profiles ?? [],
      sources: manifestInfo?.sources ?? [],
      domains: manifestInfo?.domains ?? [],
    };
    receipt.environment ??= {
      node: process.version,
      pnpm: 'UNKNOWN',
      python: pythonInfo?.python ?? 'UNKNOWN',
      platform: process.platform,
      arch: process.arch,
      install_mode: 'PRODUCTION_ONLY',
      commit_date: refInfo.commitDate,
    };
    receipt.composition = composition === null || lockInfo === null ? null : {
      lock_sha256: composition.receipt.lock_sha256,
      source_manifest_sha256: composition.receipt.source_manifest_sha256,
      profiles: composition.receipt.profiles,
      plugins: composition.receipt.plugins,
      domains: composition.receipt.domains.map(({ package: packageName, source_sha, manifest, manifest_sha256, pack_sha256 }) => ({
        package: packageName, source_sha, manifest, manifest_sha256, pack_sha256,
      })),
      business_profile: business ?? { path: BUSINESS_PROFILE, sha256: null },
    };
    receipt.release_payload = payload === null ? null : {
      files: payload.files,
      bytes: payload.bytes,
      profile_pack_snapshot: payload.profile_pack_snapshot,
      plugins: payload.plugins.map(({ id, source_sha, version, manifest_sha256, pack_sha256 }) => ({
        id, source_sha, version, manifest_sha256, pack_sha256,
      })),
      activation: payload.activation,
    };
    receipt.consumer = consumer;
    receipt.checks = checks.items;
    const failed = checks.items.some(item => item.status === 'FAIL');
    const skipped = checks.items.some(item => item.status === 'SKIPPED');
    receipt.verdict = failed ? 'FAIL' : skipped ? 'INCOMPLETE' : 'PASS';
    assert.ok(receipt.checks.length >= REQUIRED_CHECKS.length, 'PRODUCTION_ONLY_CLOSURE_CHECKS_INCOMPLETE');
    return { receipt, blockers: checks.blockers, work };
  } catch (error) {
    receipt.checks = checks.items;
    checks.blockers.push({ check: 'rehearsal', code: error?.message ?? String(error) });
    return { receipt, blockers: checks.blockers, work };
  }
}

export function checkProductionOnlyClosureReceipt({ repo = REPO_ROOT, receiptPath = DEFAULT_RECEIPT } = {}) {
  const root = resolve(repo);
  const lockBytes = readFileSyncStrict(join(root, LOCK_PATH), 'PRODUCTION_ONLY_CLOSURE_LOCK_MISSING');
  const manifestBytes = readFileSyncStrict(join(root, MANIFEST_PATH), 'PRODUCTION_ONLY_CLOSURE_MANIFEST_MISSING');
  const manifest = JSON.parse(manifestBytes);
  const lockSha256 = hash(lockBytes);
  assert.equal(manifest.lock?.sha256, lockSha256, 'PRODUCTION_ONLY_CLOSURE_MANIFEST_LOCK_MISMATCH');
  const { receipt, sha256 } = readProductionOnlyClosureReceipt(resolve(receiptPath));
  validateProductionOnlyClosureReceipt(receipt, {
    lockSha256,
    sources: manifest.sources,
    domains: manifest.domains,
  });
  return {
    status: 'RECORDED',
    receipt_path: resolve(receiptPath),
    receipt_sha256: sha256,
    commit: receipt.commit,
    lock_sha256: lockSha256,
    gate: manifest.deletion_gate,
  };
}

function readFileSyncStrict(path, code) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(code);
  }
}

function usage() {
  return [
    'Usage:',
    '  node scripts/release/production-only-closure.mjs [--ref origin/main] [--artifact <zip>] [--python <3.14>]',
    '    [--receipt <path.md|path.json>] [--skip-install] [--allow-already-absent] [--repo <path>]',
    '  node scripts/release/production-only-closure.mjs --check-receipt [--receipt <path>] [--repo <path>]',
    '',
    '--skip-install covers only the deterministic copy/absence/lock/import checks; a committed',
    'receipt requires a full PASS with the production-only pnpm install.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { checkReceipt: false, skipInstall: false, allowAlreadyAbsent: false, receiptPath: null,
    artifact: null, ref: 'origin/main', python: 'python3.14', repo: REPO_ROOT, format: null, help: false };
  const values = new Set(['--ref', '--artifact', '--python', '--receipt', '--repo', '--format']);
  const flags = new Set(['--skip-install', '--allow-already-absent', '--check-receipt', '--help', '-h']);
  const args = [...argv];
  while (args.length) {
    const key = args.shift();
    if (flags.has(key)) {
      if (key === '--check-receipt') options.checkReceipt = true;
      else if (key === '--skip-install') options.skipInstall = true;
      else if (key === '--allow-already-absent') options.allowAlreadyAbsent = true;
      else options.help = true;
      continue;
    }
    assert.ok(values.has(key), `PRODUCTION_ONLY_CLOSURE_ARGUMENT ${key}`);
    const value = args.shift();
    assert.ok(value && !value.startsWith('--'), `PRODUCTION_ONLY_CLOSURE_ARGUMENT_VALUE ${key}`);
    if (key === '--ref') options.ref = value;
    else if (key === '--artifact') options.artifact = resolve(value);
    else if (key === '--python') options.python = value;
    else if (key === '--receipt') options.receiptPath = resolve(value);
    else if (key === '--repo') options.repo = resolve(value);
    else options.format = value;
  }
  assert.ok(options.format === null || ['json', 'markdown'].includes(options.format),
    'PRODUCTION_ONLY_CLOSURE_FORMAT');
  return options;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    if (options.checkReceipt) {
      const result = checkProductionOnlyClosureReceipt({
        repo: options.repo,
        receiptPath: options.receiptPath ?? DEFAULT_RECEIPT,
      });
      console.log(`PRODUCTION_ONLY_CLOSURE_RECORDED receipt_sha256=${result.receipt_sha256} commit=${result.commit} `
        + `lock_sha256=${result.lock_sha256} gate=${result.gate.status}`);
      process.exit(0);
    }
    const { receipt, blockers, work } = await runProductionOnlyClosure({
      repo: options.repo,
      ref: options.ref,
      artifact: options.artifact,
      python: options.python,
      skipInstall: options.skipInstall,
      allowAlreadyAbsent: options.allowAlreadyAbsent,
    });
    await rm(work, { recursive: true, force: true });
    if (options.receiptPath) {
      const written = await writeReceipt(options.receiptPath, receipt, options.format);
      console.error(`PRODUCTION_ONLY_CLOSURE_${receipt.verdict} receipt=${written.path} format=${written.format}`);
    } else {
      process.stdout.write(json(receipt));
    }
    for (const blocker of blockers) console.error(`${blocker.check}: ${blocker.code}`);
    if (receipt.verdict === 'FAIL') process.exit(1);
    if (receipt.verdict === 'INCOMPLETE') {
      console.error('PRODUCTION_ONLY_CLOSURE_INCOMPLETE: install or sealed packs were skipped; not receipt evidence.');
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
