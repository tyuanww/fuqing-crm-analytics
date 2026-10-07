import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, type, machine } from 'node:os';
import { join } from 'node:path';
import { serviceDigest as hash } from '../release/service-compatibility.mjs';
import { DSH_UPSTREAM_SHA } from '../release/toolchain.mjs';
import { readFirstPurchaseRuntime, copyFirstPurchaseRuntime, runtimeTreeDigest,
  readFirstPurchasePlatform, platformWheels } from './first-purchase-runtime-artifacts.mjs';
import { prepareFirstPurchaseArtifacts } from './first-purchase-artifacts.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-runtime-input-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}
function runtimeManifest(bytes) {
  return { schema_version: 'release-manifest/v1', dsh_upstream_sha: DSH_UPSTREAM_SHA,
    upstream_runtime: { name: `shinemage-dsh-upstream-runtime-${DSH_UPSTREAM_SHA}.tar.zst`,
      role: 'upstream-runtime-bundle', upstream_sha: DSH_UPSTREAM_SHA, bytes: bytes.length, sha256: hash(bytes) } };
}
for (const [name, mutate, code] of [
  ['other upstream', m => { m.dsh_upstream_sha = 'b'.repeat(40); }, 'UPSTREAM_SHA'],
  ['other runtime pin', m => { m.upstream_runtime.upstream_sha = 'b'.repeat(40); }, 'UPSTREAM_SHA'],
  ['floating name', m => { m.upstream_runtime.name = 'latest.tar.zst'; }, 'NAME'],
  ['oversize', m => { m.upstream_runtime.bytes = 1024 ** 3; }, 'SIZE'],
  ['unknown runtime field', m => { m.upstream_runtime.extra = true; }, 'SHAPE'],
  ['other role', m => { m.upstream_runtime.role = 'source'; }, 'ROLE'],
  ['missing digest', m => { m.upstream_runtime.sha256 = ''; }, 'DIGEST'],
]) test('runtime input rejects ' + name + ' before extraction', async t => {
  const root = await fixture(t), manifest = runtimeManifest(Buffer.from('owned'));
  mutate(manifest); const bytes = Buffer.from(JSON.stringify(manifest));
  const path = join(root, 'manifest.json'); await writeFile(path, bytes);
  await assert.rejects(readFirstPurchaseRuntime({ manifestPath: path, manifestSha256: hash(bytes), archivePath: join(root, 'unused') }),
    new RegExp('HOST_RUNTIME_' + code));
  assert.deepEqual(await readdir(root), ['manifest.json']);
});

test('runtime receiver hashes the copied bytes and preserves both external input and old destination', async t => {
  const root = await fixture(t), archivePath = join(root, 'runtime.zst'), destination = join(root, 'copy.zst');
  const bytes = Buffer.from('owned fixed bytes'); await writeFile(archivePath, bytes);
  const manifestPath = join(root, 'manifest.json'), data = Buffer.from(JSON.stringify(runtimeManifest(bytes)));
  await writeFile(manifestPath, data);
  await assert.rejects(readFirstPurchaseRuntime({ manifestPath, manifestSha256: 'a'.repeat(64), archivePath }), /HOST_RUNTIME_MANIFEST_DIGEST/);
  const spec = await readFirstPurchaseRuntime({ manifestPath, manifestSha256: hash(data), archivePath });
  await copyFirstPurchaseRuntime(spec, destination);
  assert.deepEqual(await readFile(destination), bytes);
  await assert.rejects(copyFirstPurchaseRuntime(spec, destination), /EEXIST/);
  await writeFile(archivePath, 'other fixed data');
  await assert.rejects(copyFirstPurchaseRuntime(spec, join(root, 'size-fail')), /HOST_RUNTIME_SIZE/);
  await assert.rejects(access(join(root, 'size-fail')), /ENOENT/);
  await writeFile(archivePath, Buffer.alloc(bytes.length));
  await assert.rejects(copyFirstPurchaseRuntime(spec, join(root, 'digest-fail')), /HOST_RUNTIME_DIGEST/);
  assert.deepEqual(await readFile(destination), bytes);
});

test('runtime receiver refuses symlink and FIFO without blocking', async t => {
  const root = await fixture(t), archivePath = join(root, 'input');
  await writeFile(join(root, 'real'), 'owned'); await symlink('real', archivePath);
  const spec = { archivePath, artifact: { bytes: 5, sha256: hash('owned') } };
  await assert.rejects(copyFirstPurchaseRuntime(spec, join(root, 'unused')), /ELOOP/);
  await rm(archivePath); execFileSync('mkfifo', [archivePath]);
  await assert.rejects(copyFirstPurchaseRuntime(spec, join(root, 'unused')), /HOST_RUNTIME_SIZE/);
  await assert.rejects(access(join(root, 'unused')), /ENOENT/);
});

test('runtime inventory detects file/link changes, extra files and links outside its owned root', async t => {
  const root = await fixture(t), runtime = join(root, 'runtime'); await mkdir(runtime);
  await writeFile(join(runtime, 'cli.js'), 'export {}'); await symlink('cli.js', join(runtime, 'alias'));
  const original = await runtimeTreeDigest(runtime);
  assert.deepEqual(await runtimeTreeDigest(runtime), original);
  await writeFile(join(runtime, 'cli.js'), 'export { }');
  assert.notEqual((await runtimeTreeDigest(runtime)).sha256, original.sha256);
  await writeFile(join(runtime, 'extra'), 'extra');
  assert.equal((await runtimeTreeDigest(runtime)).entries, original.entries + 1);
  await writeFile(join(root, 'outside'), 'owned outside');
  await symlink('../outside', join(runtime, 'escape'));
  await assert.rejects(runtimeTreeDigest(runtime), /HOST_RUNTIME_LINK_ESCAPE/);
});

function wheelFixture() {
  const dependencies = { example: '1.2.3' }, archive = 'a'.repeat(64), manifest = 'b'.repeat(64);
  const observation = { archive_sha256: archive, manifest_sha256: manifest, installed: dependencies,
    wheels: { example: { version: '1.2.3', file: 'example-1.2.3-py3-none-any.whl', sha256: 'c'.repeat(64) } } };
  return { dependencies, archive, manifest, observation };
}
for (const [name, mutate, code] of [
  ['different query archive', f => { f.observation.archive_sha256 = 'd'.repeat(64); }, 'ARCHIVE'],
  ['different manifest', f => { f.observation.manifest_sha256 = 'd'.repeat(64); }, 'MANIFEST'],
  ['dependency drift', f => { f.observation.installed = { example: '1.2.4' }; }, 'DEPENDENCIES'],
  ['extra wheel', f => { f.observation.wheels.other = f.observation.wheels.example; }, 'WHEELS'],
  ['wrong wheel name', f => { f.observation.wheels.example.file = 'other-1.2.3-py3-none-any.whl'; }, 'WHEEL_NAME'],
  ['traversal', f => { f.observation.wheels.example.file = '../example.whl'; }, 'WHEEL_NAME'],
  ['Mac wheel on Linux', f => { f.observation.wheels.example.file = 'example-1.2.3-cp314-cp314-macosx_11_0_arm64.whl'; }, 'WHEEL_ABI'],
]) test('explicit target wheels reject ' + name, () => {
  const f = wheelFixture(); mutate(f);
  assert.throws(() => platformWheels(f.observation, f.archive, f.manifest, f.dependencies), new RegExp('HOST_PLATFORM_' + code));
});
test('wheel selection preserves the supplied provenance object', () => {
  const f = wheelFixture(), before = JSON.stringify(f);
  assert.deepEqual(platformWheels(f.observation, f.archive, f.manifest, f.dependencies), f.observation.wheels);
  assert.equal(JSON.stringify(f), before);
});

test('target dependency provenance rejects digest substitution and another candidate before reading wheels', async t => {
  const root = await fixture(t), path = join(root, 'receipt.json');
  const candidate = { candidate_digest: 'a'.repeat(64), source_sha: 'b'.repeat(40) };
  const report = { schema_version: 'source-http-target-observation/v1', scope: 'actual-wsl2-synthetic-package-http',
    status: 'PASS', release_ready: false, ...candidate, candidate_digest: 'c'.repeat(64) };
  const data = Buffer.from(JSON.stringify(report)); await writeFile(path, data);
  await assert.rejects(readFirstPurchasePlatform({ path, sha256: 'a'.repeat(64), candidate }), /HOST_PLATFORM_DIGEST/);
  await assert.rejects(readFirstPurchasePlatform({ path, sha256: hash(data), candidate }), /HOST_PLATFORM_CANDIDATE/);
});

test('runtime artifact mode is explicit and cannot silently use a checkout', async t => {
  const root = await fixture(t), manifestPath = join(root, 'input.json'), output = join(root, 'unused');
  const doc = { schema_version: 'dsh-first-purchase-host-artifacts/v5' };
  await writeFile(manifestPath, JSON.stringify(doc));
  await assert.rejects(prepareFirstPurchaseArtifacts({ manifestPath, output }), /HOST_ARTIFACT_SCHEMA/);
  for (const key of ['candidate_path', 'candidate_sha256', 'crm_pack_path', 'crm_pack_sha256',
    'service_evidence_path', 'service_evidence_sha256', 'kernel_receipt_path', 'kernel_receipt_sha256',
    'runtime_manifest_path', 'runtime_manifest_sha256', 'runtime_archive_path', 'platform_receipt_path', 'platform_receipt_sha256']) doc[key] = 'unused';
  await writeFile(manifestPath, JSON.stringify(doc));
  await assert.rejects(prepareFirstPurchaseArtifacts({ manifestPath, output, upstream: root }), /HOST_ARTIFACT_AMBIGUOUS_RUNTIME/);
  await assert.rejects(access(output), /ENOENT/);
});


test('v2 target wheels use service provenance, while v1 retains its shared-source requirement', async t => {
  const root = await fixture(t), path = join(root, 'receipt.json');
  const candidate = { candidate_digest: 'a'.repeat(64), source_sha: 'b'.repeat(40),
    service_compatibility: { binding: { source_sha: 'c'.repeat(40) } } };
  const report = { schema_version: 'source-http-target-observation/v2', scope: 'actual-wsl2-synthetic-package-http',
    status: 'PASS', release_ready: false, candidate_digest: candidate.candidate_digest, source_sha: 'c'.repeat(40),
    platform: { system: 'Linux', machine: 'x86_64', python: '3.14.4' }, artifacts: { query: {}, save: {} } };
  async function run() {
    const data = Buffer.from(JSON.stringify(report)); await writeFile(path, data);
    return readFirstPurchasePlatform({ path, sha256: hash(data), candidate });
  }
  if (type() === 'Linux' && machine() === 'x86_64') assert.deepEqual((await run()).platform, report.platform);
  else await assert.rejects(run(), /HOST_PLATFORM_(SYSTEM|MACHINE)/);
  report.schema_version = 'source-http-target-observation/v1';
  await assert.rejects(run(), /HOST_PLATFORM_SOURCE/);
  report.schema_version = 'source-http-target-observation/v2';report.source_sha = candidate.source_sha;
  await assert.rejects(run(), /HOST_PLATFORM_SOURCE/);
  report.source_sha = 'c'.repeat(40);delete candidate.service_compatibility;
  await assert.rejects(run(), /HOST_PLATFORM_SOURCE/);
});
