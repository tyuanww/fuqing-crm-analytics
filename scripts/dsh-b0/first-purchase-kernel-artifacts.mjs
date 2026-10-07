/** Exact Git query code in a local composition fixture. Not a release/candidate gate. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, parseArgs } from 'node:util';
import { readGitInput } from '../crm-calibration/package-service.mjs';
import { readArtifactFile, insideArtifact } from '../release/service-artifact-evidence.mjs';
import { serviceDigest as hash } from '../release/service-compatibility.mjs';
import { assertClean, scanTree } from '../release/secret-scan.mjs';
import { verifyFiles } from './first-purchase-service-artifacts.mjs';
import { platformWheels } from './first-purchase-runtime-artifacts.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), exec = promisify(execFile);
const recipePath = join(root, 'services/analytics-first-purchase-kernel/package.json');
const PRIVATE = { flag: 'wx', mode: 0o600 }, HEX = /^[a-f0-9]{64}$/;
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';
async function run(python, args, cwd) {
  assert.ok(isAbsolute(python), 'HOST_KERNEL_PYTHON_PATH');
  return exec(python, args, { cwd, timeout: 90000, maxBuffer: 2 * 1024 * 1024,
    env: { PATH: dirname(python) + ':' + (process.env.PATH ?? '/usr/bin:/bin'), HOME: cwd, TMPDIR: cwd,
      PYTHON_DOTENV_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1' } });
}
async function recipe() {
  const bytes = await readArtifactFile(recipePath, 65536), value = decode(bytes);
  assert.deepEqual(Object.keys(value).sort(), ['dependencies', 'files', 'python', 'schema_version', 'scope']);
  assert.equal(value.schema_version, 'dsh-first-purchase-kernel-inputs/v1');
  assert.equal(value.scope, 'synthetic-composition-only');
  assert.equal(value.python, '3.14');
  assert.ok(Object.keys(value.files).length > 0 && Object.keys(value.files).length < 100);
  for (const [path, source] of Object.entries(value.files)) {
    assert.match(path, /^backend\/(?:[a-z0-9_]+\/)*[a-z0-9_]+\.py$/);
    assert.equal(source, path.endsWith('/__init__.py') ? 'scripts/crm-calibration/service-namespace.py' : path);
  }
  assert.ok(value.files['backend/analytics_worker.py']);
  assert.ok(value.files['backend/analytics_first_purchase_native.py']);
  return { value, sha256: hash(bytes) };
}
async function dependencies(python, cwd, expected) {
  const actual = decode(Buffer.from((await run(python, ['-I', '-c',
    'import importlib.metadata as m,json,sys;assert sys.version_info[:2]==(3,14);print(json.dumps({d.metadata["Name"].lower().replace("_","-"):d.version for d in m.distributions()}))'], cwd)).stdout));
  assert.deepEqual(actual, expected, 'HOST_KERNEL_DEPENDENCY_CLOSURE');
}

export async function packFirstPurchaseKernel({ revision, output, python, wheelhouse }) {
  assert.match(revision ?? '', /^[a-f0-9]{40}$/, 'HOST_KERNEL_EXACT_SOURCE');
  assert.ok(isAbsolute(output) && isAbsolute(wheelhouse), 'HOST_KERNEL_ABSOLUTE_PATH');
  const config = await recipe();
  const lock = (await readGitInput(root, revision, 'requirements-lock.txt')).toString('utf8');
  const pins = Object.fromEntries(lock.split(/\r?\n/).filter(s => /^[a-zA-Z0-9_-]+==/.test(s))
    .map(s => { const [name, pin] = s.split('=='); return [name.toLowerCase().replaceAll('_', '-'), pin]; }));
  for (const [name, pin] of Object.entries(config.value.dependencies)) assert.equal(pins[name], pin, 'HOST_KERNEL_LOCK_MISMATCH');
  await mkdir(output, { mode: 0o700 }); // Fail on an existing evidence directory, even after a failed run.
  const app = join(output, 'source');
  await mkdir(app, { mode: 0o700 });
  const files = {};
  for (const [name, source] of Object.entries(config.value.files)) {
    const bytes = await readGitInput(root, revision, source);
    await mkdir(dirname(join(app, name)), { mode: 0o700, recursive: true });
    await writeFile(join(app, name), bytes, PRIVATE);
    files[name] = { sha256: hash(bytes), bytes: bytes.length, source };
  }
  const manifest = { schema_version: 'dsh-first-purchase-kernel-fixture/v1', scope: config.value.scope,
    source_sha: revision, inputs_sha256: config.sha256, python: '3.14', dependencies: config.value.dependencies,
    files, release_ready: false };
  const manifestBytes = Buffer.from(json(manifest));
  await writeFile(join(app, 'kernel-manifest.json'), manifestBytes, PRIVATE);
  assertClean(await scanTree(app));
  await writeFile(join(output, 'allowlist.json'), json([...Object.keys(files), 'kernel-manifest.json']), PRIVATE);
  await run(python, [join(root, 'scripts/release/pack.py'), app, join(output, 'allowlist.json'), join(output, 'kernel.tar.zst')], output);
  const archive = await readArtifactFile(join(output, 'kernel.tar.zst'), 8 * 1024 * 1024);
  // A cold lock-only venv catches undeclared dependencies before Host composition.
  const installed = decode(Buffer.from((await run(python, ['-I', join(root, 'scripts/crm-calibration/service-runtime.fixture.py'),
    join(app, 'kernel-manifest.json'), join(output, 'check-venv'), '--wheelhouse', wheelhouse], output)).stdout));
  await dependencies(installed.python, output, manifest.dependencies);
  const receipt = { schema_version: 'dsh-first-purchase-kernel-archive/v1', artifact: 'kernel.tar.zst',
    sha256: hash(archive), bytes: archive.length, manifest_sha256: hash(manifestBytes),
    source_sha: revision, inputs_sha256: config.sha256, wheels: installed.wheels, release_ready: false };
  await writeFile(join(output, 'kernel-manifest.json'), manifestBytes, PRIVATE);
  await writeFile(join(output, 'receipt.json'), json(receipt), PRIVATE);
  return receipt;
}

export async function prepareFirstPurchaseKernel({ receiptPath, expectedSha, output, python, wheelhouse, platformObservation }) {
  for (const path of [receiptPath, output, python, wheelhouse]) assert.ok(typeof path === 'string' && isAbsolute(path), 'HOST_KERNEL_ABSOLUTE_PATH');
  assert.match(expectedSha ?? '', HEX, 'HOST_KERNEL_RECEIPT_DIGEST');
  const receiptBytes = await readArtifactFile(receiptPath), receipt = decode(receiptBytes);
  assert.equal(hash(receiptBytes), expectedSha, 'HOST_KERNEL_RECEIPT_DIGEST');
  assert.deepEqual(Object.keys(receipt).sort(), ['artifact', 'bytes', 'inputs_sha256', 'manifest_sha256', 'release_ready', 'schema_version', 'sha256', 'source_sha', 'wheels']);
  assert.equal(receipt.schema_version, 'dsh-first-purchase-kernel-archive/v1');
  assert.equal(receipt.artifact, 'kernel.tar.zst');
  assert.equal(receipt.release_ready, false);
  assert.match(receipt.source_sha, /^[a-f0-9]{40}$/);
  const manifestBytes = await insideArtifact(dirname(receiptPath), 'kernel-manifest.json');
  const manifest = decode(manifestBytes), config = await recipe();
  assert.equal(hash(manifestBytes), receipt.manifest_sha256, 'HOST_KERNEL_MANIFEST_DIGEST');
  assert.deepEqual({ ...manifest, files: Object.keys(manifest.files).sort() }, {
    schema_version: 'dsh-first-purchase-kernel-fixture/v1', scope: config.value.scope, source_sha: receipt.source_sha,
    inputs_sha256: config.sha256, python: '3.14', dependencies: config.value.dependencies,
    files: Object.keys(config.value.files).sort(), release_ready: false }, 'HOST_KERNEL_MANIFEST_SCHEMA');
  for (const [name, row] of Object.entries(manifest.files)) {
    assert.deepEqual(Object.keys(row).sort(), ['bytes', 'sha256', 'source']);
    assert.equal(row.source, config.value.files[name]);
    assert.match(row.sha256, HEX);
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 2 * 1024 * 1024);
  }
  assert.equal(receipt.inputs_sha256, config.sha256, 'HOST_KERNEL_RECIPE_DRIFT');
  const archive = await insideArtifact(dirname(receiptPath), receipt.artifact, 8 * 1024 * 1024);
  assert.equal(hash(archive), receipt.sha256, 'HOST_KERNEL_ARCHIVE_DIGEST');
  assert.equal(archive.length, receipt.bytes, 'HOST_KERNEL_ARCHIVE_SIZE');
  assert.deepEqual(Object.keys(receipt.wheels).sort(), Object.keys(manifest.dependencies).sort(), 'HOST_KERNEL_WHEEL_CLOSURE');
  const selectedWheels = platformObservation ? platformWheels(platformObservation, receipt.sha256,
    receipt.manifest_sha256, manifest.dependencies) : receipt.wheels;
  const wheels = {};
  for (const [name, row] of Object.entries(selectedWheels)) {
    assert.deepEqual(Object.keys(row).sort(), ['file', 'sha256', 'version']);
    assert.match(row.file, /^[a-zA-Z0-9_.-]+\.whl$/);
    assert.equal(row.version, manifest.dependencies[name]);
    assert.match(row.sha256, HEX);
    wheels[row.file] = await insideArtifact(wheelhouse, row.file, 64 * 1024 * 1024);
    assert.equal(hash(wheels[row.file]), row.sha256, 'HOST_KERNEL_WHEEL_DIGEST');
  }
  await mkdir(output, { mode: 0o700 });
  await mkdir(join(output, 'wheels'), { mode: 0o700 });
  for (const [name, bytes] of Object.entries(wheels)) await writeFile(join(output, 'wheels', name), bytes, PRIVATE);
  await writeFile(join(output, 'kernel.tar.zst'), archive, PRIVATE);
  const app = join(output, 'app');
  await run(python, [join(root, 'scripts/release/secure-unpack.py'), join(output, 'kernel.tar.zst'), app,
    '--max-bytes', '8388608', '--max-entries', '100'], output);
  await verifyFiles(app, manifestBytes, 'kernel-manifest.json');
  assertClean(await scanTree(app));
  const installed = decode(Buffer.from((await run(python, ['-I', join(root, 'scripts/crm-calibration/service-runtime.fixture.py'),
    join(app, 'kernel-manifest.json'), join(output, 'venv'), '--wheelhouse', join(output, 'wheels')], output)).stdout));
  assert.deepEqual(installed.wheels, selectedWheels, 'HOST_KERNEL_INSTALLED_WHEELS');
  const prepared = { app, python: installed.python, output, manifest: manifestBytes,
    receipt: { ...receipt, receipt_sha256: expectedSha, runtime_mode: installed.mode,
      ...(platformObservation ? { installed_wheels: installed.wheels } : {}) } };
  await verifyFirstPurchaseKernel(prepared);
  return prepared;
}

export async function verifyFirstPurchaseKernel(prepared) {
  await verifyFiles(prepared.app, prepared.manifest, 'kernel-manifest.json');
  await dependencies(prepared.python, prepared.output, decode(prepared.manifest).dependencies);
  assert.deepEqual((await readdir(join(prepared.app, 'backend'))).includes('main.py'), false, 'HOST_KERNEL_LEGACY_MAIN');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' }, python: { type: 'string' }, wheelhouse: { type: 'string' } }, strict: true });
  console.log(json(await packFirstPurchaseKernel({ revision: values.source, output: values.output, python: values.python, wheelhouse: values.wheelhouse })));
}
