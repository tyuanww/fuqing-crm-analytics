/** Local composition of an existing saved-analysis archive, never a pack/publish entry. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { insideArtifact, readArtifactFile, verifyServiceArtifactEvidence } from '../release/service-artifact-evidence.mjs';
import { serviceDigest as hash } from '../release/service-compatibility.mjs';
import { assertClean, scanTree } from '../release/secret-scan.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
const PRIVATE = { mode: 0o600, flag: 'wx' }, decode = bytes => JSON.parse(bytes.toString('utf8'));
async function run(python, args, cwd) {
  return exec(python, args, { cwd, timeout: 90000, maxBuffer: 1024 * 1024,
    env: { PATH: dirname(python) + ':' + (process.env.PATH ?? '/usr/bin:/bin'),
      HOME: cwd, TMPDIR: cwd, PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1' } });
}

export async function readFirstPurchaseService({ evidencePath, expectedSha, gate, python, wheelhouse }) {
  for (const path of [evidencePath, python, wheelhouse]) {
    assert.ok(typeof path === 'string' && isAbsolute(path), 'HOST_SERVICE_ABSOLUTE_PATH');
  }
  assert.match(expectedSha ?? '', /^[a-f0-9]{64}$/, 'HOST_SERVICE_EVIDENCE_DIGEST');
  const bytes = await readArtifactFile(evidencePath);
  assert.equal(hash(bytes), expectedSha, 'HOST_SERVICE_EVIDENCE_DIGEST');
  const checked = await verifyServiceArtifactEvidence({ gate, evidencePath });
  assert.equal(checked.service_evidence_sha256, expectedSha, 'HOST_SERVICE_EVIDENCE_CHANGED');
  const receipt = decode(bytes).artifacts.candidate;
  assert.equal(receipt.source.worktree_dirty, false, 'HOST_SERVICE_DIRTY_SOURCE');
  const directory = join(dirname(evidencePath), 'candidate');
  const archive = await insideArtifact(directory, receipt.artifact, 8 * 1024 * 1024);
  const manifest = await insideArtifact(directory, 'service-manifest.json', 256 * 1024);
  assert.equal(hash(archive), checked.artifacts.candidate.sha256, 'HOST_SERVICE_ARCHIVE_CHANGED');
  assert.equal(archive.length, receipt.bytes, 'HOST_SERVICE_ARCHIVE_SIZE');
  assert.equal(hash(manifest), checked.artifacts.candidate.manifest_sha256, 'HOST_SERVICE_MANIFEST_CHANGED');
  const wheelInfo = await lstat(wheelhouse);
  assert.ok(wheelInfo.isDirectory() && !wheelInfo.isSymbolicLink(), 'HOST_SERVICE_WHEELHOUSE');
  const wheels = {};
  for (const row of Object.values(receipt.installed.wheels)) {
    wheels[row.file] = await insideArtifact(wheelhouse, row.file, 64 * 1024 * 1024);
    assert.equal(hash(wheels[row.file]), row.sha256, 'HOST_SERVICE_WHEEL_CHANGED');
  }
  const version = (await run(python, ['-I', '-c', 'import sys;print(sys.version.split()[0])'], dirname(evidencePath))).stdout.trim();
  assert.match(version, /^3\.14\.\d+$/, 'HOST_SERVICE_PYTHON_VERSION');
  return { receipt, archive, manifest, wheels, python, evidenceSha256: expectedSha };
}

export async function verifyFiles(app, manifestBytes, manifestName = 'service-manifest.json') {
  assert.deepEqual(await insideArtifact(app, manifestName), manifestBytes, 'HOST_SERVICE_INSTALLED_MANIFEST');
  const manifest = decode(manifestBytes), actual = [];
  async function walk(relative = '') {
    for (const entry of await readdir(join(app, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await walk(name);
      else { assert.ok(entry.isFile(), 'HOST_SERVICE_SPECIAL_FILE'); actual.push(name); }
    }
  }
  await walk();
  assert.deepEqual(actual.sort(), [...Object.keys(manifest.files), manifestName].sort(), 'HOST_SERVICE_FILE_SET');
  for (const [name, row] of Object.entries(manifest.files)) {
    const bytes = await insideArtifact(app, name, 2 * 1024 * 1024, true);
    assert.equal(bytes.length, row.bytes, 'HOST_SERVICE_INSTALLED_SIZE');
    assert.equal(hash(bytes), row.sha256, 'HOST_SERVICE_INSTALLED_DIGEST');
  }
}

export async function installFirstPurchaseService(spec, output) {
  assert.ok(isAbsolute(output), 'HOST_SERVICE_ABSOLUTE_PATH');
  await mkdir(output, { mode: 0o700 });
  const app = join(output, 'app'), wheelhouse = join(output, 'wheels'), archive = join(output, 'service.tar.zst');
  await mkdir(wheelhouse, { mode: 0o700 });
  for (const [name, bytes] of Object.entries(spec.wheels)) await writeFile(join(wheelhouse, name), bytes, PRIVATE);
  await writeFile(archive, spec.archive, PRIVATE);
  await run(spec.python, [join(root, 'scripts/release/secure-unpack.py'), archive, app,
    '--max-bytes', '8388608', '--max-entries', '100'], output);
  await verifyFiles(app, spec.manifest);
  assertClean(await scanTree(app));
  const installed = decode(Buffer.from((await run(spec.python, ['-I', join(root, 'scripts/crm-calibration/service-runtime.fixture.py'),
    join(app, 'service-manifest.json'), join(output, 'venv'), '--wheelhouse', wheelhouse], output)).stdout));
  assert.equal(installed.mode, 'offline-hashed-wheel-install', 'HOST_SERVICE_INSTALL_MODE');
  assert.deepEqual(installed.wheels, spec.receipt.installed.wheels, 'HOST_SERVICE_INSTALLED_WHEELS');
  const prepared = { app, python: installed.python, output, manifest: spec.manifest, receipt: {
    archive_sha256: spec.receipt.sha256, manifest_sha256: spec.receipt.manifest_sha256,
    source_sha: spec.receipt.service_source.commit, evidence_sha256: spec.evidenceSha256,
    runtime_mode: installed.mode, wheels: installed.wheels,
    service_runtime: 'independent-offline-saved-analysis-artifact', query_runtime: 'workspace-synthetic-kernel',
    release_ready: false } };
  await verifyFirstPurchaseService(prepared);
  return prepared;
}

export async function verifyFirstPurchaseService(prepared) {
  // Check immutable bytes before executing the installed bootstrap again.
  await verifyFiles(prepared.app, prepared.manifest);
  const result = decode(Buffer.from((await run(prepared.python, ['-I', join(prepared.app, 'service.py'), 'check'], prepared.output)).stdout));
  assert.equal(result.status, 'SERVICE_PACKAGE_CHECK_PASS', 'HOST_SERVICE_CHECK');
  assert.equal(result.manifest_sha256, prepared.receipt.manifest_sha256, 'HOST_SERVICE_CHECK_DIGEST');
  const closure = decode(Buffer.from((await run(prepared.python, ['-I', '-c',
    'import importlib.metadata as m,json;print(json.dumps({d.metadata["Name"].lower().replace("_","-"):d.version for d in m.distributions()}))'], prepared.output)).stdout));
  assert.deepEqual(closure, decode(prepared.manifest).dependencies, 'HOST_SERVICE_DEPENDENCY_CLOSURE');
}
