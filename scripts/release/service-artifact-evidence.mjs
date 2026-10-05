/** Local artifact proof only. Never imports service code or authorizes activation. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { serviceDigest as hash, SERVICE_CASES, validateServiceGate } from './service-compatibility.mjs';

export const SERVICE_ARTIFACT_SCOPE = 'local-posix-synthetic-service-artifacts-http';
export const SERVICE_ARTIFACT_INPUTS = Object.freeze([
  'scripts/crm-calibration/service-package-compatibility.mjs',
  'scripts/crm-calibration/package-service.mjs', 'scripts/crm-calibration/service-entry.py',
  'scripts/crm-calibration/service-runtime.fixture.py', 'scripts/crm-calibration/service-process.fixture.mjs',
  'scripts/crm-calibration/first-purchase-package.fixture.py', 'scripts/dsh-b0/service-save-compatibility.py',
]);
const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
const HEX = /^[a-f0-9]{64}$/, COMMIT = /^[a-f0-9]{40}$/;
const MAX_ARCHIVE = 8 * 1024 * 1024;
const decode = bytes => JSON.parse(bytes.toString('utf8'));
function exact(value, keys, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

export async function readArtifactFile(path, max = 1024 * 1024, allowEmpty = false) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    assert.ok(info.isFile() && info.size >= (allowEmpty ? 0 : 1) && info.size <= max, 'SERVICE_ARTIFACT_FILE_INVALID');
    const bytes = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const next = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!next.bytesRead) break;
      offset += next.bytesRead;
    }
    assert.equal(offset, info.size, 'SERVICE_ARTIFACT_FILE_CHANGED');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}

export async function insideArtifact(directory, name, max, allowEmpty = false) {
  assert.ok(typeof name === 'string' && name && !isAbsolute(name) && !/[\\\0]/.test(name)
    && name.split('/').every(part => part && part !== '.' && part !== '..'), 'SERVICE_ARTIFACT_PATH_INVALID');
  let path = directory;
  for (const part of name.split('/')) {
    path = join(path, part);
    assert.ok(!(await lstat(path)).isSymbolicLink(), 'SERVICE_ARTIFACT_SYMLINK');
  }
  return readArtifactFile(path, max, allowEmpty);
}

function installedRuntime(installed, dependencies) {
  exact(installed, ['python', 'dependencies', 'mode', 'wheels'], 'SERVICE_ARTIFACT_RUNTIME_SHAPE');
  assert.match(installed.python ?? '', /^3\.14\.\d+$/, 'SERVICE_ARTIFACT_PYTHON_MISMATCH');
  assert.equal(installed.mode, 'offline-hashed-wheel-install', 'SERVICE_ARTIFACT_INSTALL_MODE');
  assert.deepEqual(installed.dependencies, dependencies, 'SERVICE_ARTIFACT_DEPENDENCIES_MISMATCH');
  exact(installed.wheels, Object.keys(dependencies), 'SERVICE_ARTIFACT_WHEELS_MISMATCH');
  for (const [name, version] of Object.entries(dependencies)) {
    const wheel = installed.wheels[name];
    exact(wheel, ['file', 'version', 'sha256'], 'SERVICE_ARTIFACT_WHEEL_SHAPE');
    assert.equal(wheel.version, version, 'SERVICE_ARTIFACT_WHEEL_VERSION');
    assert.ok(typeof wheel.file === 'string' && /^[a-zA-Z0-9_.+-]+\.whl$/.test(wheel.file)
      && wheel.file.split('-')[0].toLowerCase().replace(/[-_.]+/g, '-') === name
      && wheel.file.split('-')[1] === version, 'SERVICE_ARTIFACT_WHEEL_NAME');
    assert.match(wheel.sha256 ?? '', HEX, 'SERVICE_ARTIFACT_WHEEL_DIGEST');
  }
}

async function verifyArchive(archive, manifestBytes, manifest, recipe, sourceFiles) {
  const work = await mkdtemp(join(tmpdir(), 'service-artifact-verify-'));
  try {
    // Unpack the bytes just hashed, not a second read of a mutable external path.
    const path = join(work, 'service.tar.zst'), extracted = join(work, 'app');
    await writeFile(path, archive, { mode: 0o600, flag: 'wx' });
    await exec('python3', [join(root, 'scripts/release/secure-unpack.py'), path, extracted,
      '--max-entries', '100', '--max-bytes', String(MAX_ARCHIVE + 1024 * 1024)],
    { cwd: work, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHON_DOTENV_DISABLED: '1' },
      timeout: 30000, maxBuffer: 256 * 1024 });
    const files = [];
    async function walk(directory, prefix = '') {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) await walk(join(directory, entry.name), name + '/');
        else { assert.ok(entry.isFile(), 'SERVICE_ARTIFACT_ENTRY_INVALID'); files.push(name); }
      }
    }
    await walk(extracted);
    assert.deepEqual(files.sort(), [...Object.keys(manifest.files), 'service-manifest.json'].sort(), 'SERVICE_ARTIFACT_FILE_SET');
    assert.deepEqual(await insideArtifact(extracted, 'service-manifest.json'), manifestBytes, 'SERVICE_ARTIFACT_EMBEDDED_MANIFEST');
    let total = 0;
    for (const [name, item] of Object.entries(manifest.files)) {
      exact(item, ['sha256', 'bytes', 'source', 'role'], 'SERVICE_ARTIFACT_FILE_SHAPE');
      assert.match(item.sha256 ?? '', HEX, 'SERVICE_ARTIFACT_FILE_DIGEST');
      assert.ok(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= 2 * 1024 * 1024, 'SERVICE_ARTIFACT_FILE_SIZE');
      total += item.bytes;
      assert.ok(total <= MAX_ARCHIVE, 'SERVICE_ARTIFACT_SIZE_LIMIT');
      const bytes = await insideArtifact(extracted, name, 2 * 1024 * 1024, true);
      assert.equal(bytes.length, item.bytes, 'SERVICE_ARTIFACT_FILE_SIZE_MISMATCH');
      assert.equal(hash(bytes), item.sha256, 'SERVICE_ARTIFACT_FILE_HASH_MISMATCH');
      if (Object.hasOwn(recipe.files, name)) {
        const spec = recipe.files[name];
        assert.deepEqual({ source: item.source, role: item.role }, spec, 'SERVICE_ARTIFACT_FILE_RECIPE_MISMATCH');
        const expected = spec.role === 'code' ? sourceFiles[spec.source]
          : hash(await insideArtifact(root, spec.source, 2 * 1024 * 1024, true));
        assert.equal(item.sha256, expected, 'SERVICE_ARTIFACT_SOURCE_CONTENT_MISMATCH');
      } else if (name === 'requirements.lock') {
        const lock = Object.entries(recipe.dependencies).sort(([a], [b]) => a.localeCompare(b))
          .map(([name, pin]) => `${name}==${pin}\n`).join('');
        assert.equal(bytes.toString('utf8'), lock, 'SERVICE_ARTIFACT_LOCK_MISMATCH');
        assert.equal(item.source, manifest.source.inputs_manifest, 'SERVICE_ARTIFACT_LOCK_SOURCE');
        assert.equal(item.role, 'lock', 'SERVICE_ARTIFACT_LOCK_ROLE');
      } else {
        assert.equal(name, 'openapi.json', 'SERVICE_ARTIFACT_UNKNOWN_FILE');
        assert.equal(item.source, 'backend/analytics_first_purchase_analysis_app.py', 'SERVICE_ARTIFACT_API_SOURCE');
        assert.equal(item.role, 'contract', 'SERVICE_ARTIFACT_API_ROLE');
        const api = decode(bytes);
        // FastAPI info.version names the saved-analysis schema; the separate
        // service API version (1.0.0) is checked against the package recipe.
        assert.equal(api.info?.version, 'analytics-first-purchase-saved-analysis/v1', 'SERVICE_ARTIFACT_OPENAPI_CONTRACT');
        assert.ok(api.paths && typeof api.paths === 'object' && !Array.isArray(api.paths), 'SERVICE_ARTIFACT_API_SHAPE');
      }
    }
  } finally { await rm(work, { force: true, recursive: true }); }
}

async function verifyPackage(evidenceRoot, label, artifact, sourceEvidence) {
  exact(artifact, ['schema_version', 'domain', 'name', 'version', 'artifact', 'sha256', 'bytes', 'manifest_sha256',
    'source', 'service_source', 'release_ready', 'supply_chain', 'installation', 'activation', 'installed'], 'SERVICE_ARTIFACT_PACK_SHAPE');
  assert.equal(artifact.schema_version, 'shinemage-service-candidate/v1', 'SERVICE_ARTIFACT_PACK_SCHEMA');
  assert.equal(artifact.domain, 'first-purchase', 'SERVICE_ARTIFACT_DOMAIN');
  assert.equal(artifact.name, 'shinemage-analytics-first-purchase-service', 'SERVICE_ARTIFACT_NAME');
  assert.match(artifact.version ?? '', /^\d+\.\d+\.\d+(?:rc\d+)?$/, 'SERVICE_ARTIFACT_VERSION');
  assert.equal(artifact.artifact, `${artifact.name}-${artifact.version}.tar.zst`, 'SERVICE_ARTIFACT_NAME');
  for (const key of ['sha256', 'manifest_sha256']) assert.match(artifact[key] ?? '', HEX, 'SERVICE_ARTIFACT_DIGEST');
  assert.ok(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && artifact.bytes <= MAX_ARCHIVE, 'SERVICE_ARTIFACT_SIZE_LIMIT');
  assert.equal(artifact.release_ready, false, 'SERVICE_ARTIFACT_FALSE_RELEASE_CLAIM');
  for (const key of ['supply_chain', 'installation', 'activation']) assert.equal(artifact[key], 'NOT_RUN', 'SERVICE_ARTIFACT_UNVERIFIED_CLAIM');
  exact(artifact.service_source, ['commit', 'requirements_sha256', 'scope'], 'SERVICE_ARTIFACT_SOURCE_SHAPE');
  assert.equal(artifact.service_source.commit, sourceEvidence[label], 'SERVICE_ARTIFACT_SOURCE_PAIR_MISMATCH');
  assert.match(artifact.service_source.requirements_sha256 ?? '', HEX, 'SERVICE_ARTIFACT_LOCK_DIGEST');
  assert.equal(artifact.service_source.scope, 'exact-git-code-current-packaging', 'SERVICE_ARTIFACT_SOURCE_SCOPE');
  exact(artifact.source, ['commit', 'worktree_dirty', 'inputs_manifest', 'inputs_sha256'], 'SERVICE_ARTIFACT_PACKAGER_SHAPE');
  assert.match(artifact.source.commit ?? '', COMMIT, 'SERVICE_ARTIFACT_PACKAGER_COMMIT');
  assert.equal(typeof artifact.source.worktree_dirty, 'boolean', 'SERVICE_ARTIFACT_PACKAGER_DIRTY');
  const recipePath = `services/analytics-first-purchase/${label === 'baseline' ? 'compatibility-baseline.json' : 'package.json'}`;
  assert.equal(artifact.source.inputs_manifest, recipePath, 'SERVICE_ARTIFACT_RECIPE_PATH');
  const recipeBytes = await insideArtifact(root, recipePath), recipe = decode(recipeBytes);
  assert.equal(artifact.source.inputs_sha256, hash(recipeBytes), 'SERVICE_ARTIFACT_RECIPE_DRIFT');
  assert.equal(artifact.version, recipe.version, 'SERVICE_ARTIFACT_VERSION');
  const { installed, ...packReceipt } = artifact;
  assert.deepEqual(decode(await insideArtifact(evidenceRoot, `${label}/candidate-receipt.json`)), packReceipt, 'SERVICE_ARTIFACT_RECEIPT_MISMATCH');
  const manifestBytes = await insideArtifact(evidenceRoot, `${label}/service-manifest.json`), manifest = decode(manifestBytes);
  assert.equal(hash(manifestBytes), artifact.manifest_sha256, 'SERVICE_ARTIFACT_MANIFEST_DIGEST');
  exact(manifest.files, [...Object.keys(recipe.files), 'openapi.json', 'requirements.lock'], 'SERVICE_ARTIFACT_MANIFEST_FILES');
  assert.deepEqual(manifest, { ...recipe, schema_version: 'shinemage-service-package/v1', files: manifest.files,
    source: artifact.source, service_source: artifact.service_source, release_ready: false }, 'SERVICE_ARTIFACT_MANIFEST_MISMATCH');
  installedRuntime(installed, recipe.dependencies);
  const archive = await insideArtifact(evidenceRoot, `${label}/${artifact.artifact}`, MAX_ARCHIVE);
  assert.equal(archive.length, artifact.bytes, 'SERVICE_ARTIFACT_ARCHIVE_SIZE');
  assert.equal(hash(archive), artifact.sha256, 'SERVICE_ARTIFACT_ARCHIVE_DIGEST');
  await verifyArchive(archive, manifestBytes, manifest, recipe,
    sourceEvidence.sources.find(row => row.commit === sourceEvidence[label]).files);
  return { source_sha: artifact.service_source.commit, version: artifact.version, sha256: artifact.sha256,
    manifest_sha256: artifact.manifest_sha256, dependency_observation_sha256: hash(JSON.stringify(installed)),
    packaging_source: artifact.source };
}

export async function verifyServiceArtifactEvidence({ gate, evidencePath } = {}) {
  await validateServiceGate(gate);
  assert.ok(typeof evidencePath === 'string' && isAbsolute(evidencePath), 'SERVICE_ARTIFACT_ABSOLUTE_PATH_REQUIRED');
  const bytes = await readArtifactFile(evidencePath), evidence = decode(bytes), source = JSON.parse(gate.evidence_json);
  exact(evidence, ['schema_version', 'status', 'scope', 'release_ready', 'activation', 'platform', 'baseline', 'candidate',
    'runtime_mode', 'artifacts', 'observations', 'verifiers', 'seed', 'compatibility'], 'SERVICE_ARTIFACT_EVIDENCE_SHAPE');
  assert.equal(evidence.schema_version, 'shinemage-service-artifact-compatibility/v1', 'SERVICE_ARTIFACT_SCHEMA');
  assert.equal(evidence.status, 'PASS', 'SERVICE_ARTIFACT_NOT_PASS');
  assert.equal(evidence.scope, SERVICE_ARTIFACT_SCOPE, 'SERVICE_ARTIFACT_SCOPE');
  assert.equal(evidence.release_ready, false, 'SERVICE_ARTIFACT_FALSE_RELEASE_CLAIM');
  assert.equal(evidence.activation, 'BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED', 'SERVICE_ARTIFACT_ACTIVATION');
  assert.equal(evidence.runtime_mode, 'separate-offline-hashed-wheel-install', 'SERVICE_ARTIFACT_RUNTIME_MODE');
  exact(evidence.platform, ['system', 'machine'], 'SERVICE_ARTIFACT_PLATFORM');
  assert.ok(['Darwin', 'Linux'].includes(evidence.platform.system), 'SERVICE_ARTIFACT_PLATFORM');
  assert.match(evidence.platform.machine ?? '', /^[a-zA-Z0-9_-]{1,40}$/, 'SERVICE_ARTIFACT_PLATFORM');
  for (const label of ['baseline', 'candidate']) assert.equal(evidence[label], source[label], 'SERVICE_ARTIFACT_SOURCE_PAIR_MISMATCH');
  assert.deepEqual(evidence.compatibility, source.compatibility, 'SERVICE_ARTIFACT_COMPATIBILITY_MISMATCH');
  assert.deepEqual(evidence.seed, { source: source.baseline, scope: 'exact-source-synthetic-worker-outside-service-packages' }, 'SERVICE_ARTIFACT_SEED');
  assert.deepEqual(evidence.observations, SERVICE_CASES.map(name => ({ case: name, status: 'PASS',
    ...(name === 'old-readonly' || name.endsWith('unknown-schema') ? { database_unchanged: true } : {}),
    ...(name.endsWith('unknown-schema') ? { rejected: true } : {}) })), 'SERVICE_ARTIFACT_OBSERVATIONS');
  exact(evidence.verifiers, SERVICE_ARTIFACT_INPUTS, 'SERVICE_ARTIFACT_VERIFIERS');
  for (const path of SERVICE_ARTIFACT_INPUTS) {
    assert.equal(evidence.verifiers[path], hash(await insideArtifact(root, path)), 'SERVICE_ARTIFACT_VERIFIER_DRIFT');
  }
  exact(evidence.artifacts, ['baseline', 'candidate'], 'SERVICE_ARTIFACT_PAIR_SHAPE');
  const artifacts = {};
  for (const label of ['baseline', 'candidate']) artifacts[label] = await verifyPackage(dirname(evidencePath), label, evidence.artifacts[label], source);
  return { status: 'LOCAL_SERVICE_ARTIFACTS_VERIFIED', scope: SERVICE_ARTIFACT_SCOPE,
    service_evidence_sha256: hash(bytes), source_evidence_sha256: gate.binding.evidence_sha256,
    binding: gate.binding, artifacts, platform: evidence.platform, scenario_count: SERVICE_CASES.length,
    release_ready: false, activation: 'BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED',
    target_host: 'NOT_RUN', supply_chain: 'NOT_RUN' };
}
