import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  ARTIFACT_LOCK, COMPOSITION_LOCK, COMPOSITION_MANIFEST, RUNTIME_HOST_SOURCE_PATH, SEALED_DIR, SEALED_SUMS,
  SEALING_BRANCH, SEALING_WORKFLOW, buildSealedSums, buildSealingCommit, checkState, nextRuntimeHostSource,
  rewriteArtifactLock, rewriteRuntimeHostSource, runtimeHostSource, sealedHeadCoversTarget, verifySealedMembers,
  verifySourceTargetLock,
} from './respin-composition-artifact.mjs';

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, 'respin-composition-artifact.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);

async function root(t) {
  const directory = await mkdtemp(join(tmpdir(), 'respin-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function put(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function pluginFixture(index, directory = `pack-${index}`) {
  const id = `@shine-mage/dsh-${directory}`;
  const version = '0.0.0-b0';
  const tarballName = `shine-mage-dsh-${directory}-${version}.tgz`;
  const pack = Buffer.from(`tarball-${index}`);
  const manifest = canonical({
    schema_version: 'dsh-plugin-pack/v1',
    package_name: id,
    package_version: version,
    source_sha: '1'.repeat(40),
    tarball: { name: tarballName, bytes: pack.length, sha256: sha256(pack) },
  });
  return { directory, id, version, tarballName, manifest, pack };
}

async function sealedFixture(t) {
  const directory = await root(t);
  const plugins = [];
  const sources = [];
  for (let index = 0; index < 9; index += 1) {
    const pack = pluginFixture(index);
    await put(join(directory, SEALED_DIR, 'packs', pack.directory, 'plugin-pack.json'), pack.manifest);
    await put(join(directory, SEALED_DIR, 'packs', pack.directory, pack.tarballName), pack.pack);
    plugins.push({ directory: pack.directory, id: pack.id, source_sha: '1'.repeat(40), version: pack.version,
      manifest_sha256: sha256(pack.manifest) });
    sources.push({ directory: pack.directory, pack_sha256: sha256(pack.pack) });
  }
  const domainName = 'shine-mage-board-components-0.1.0.tgz';
  const domainPack = Buffer.from('domain-tarball');
  const domainManifest = canonical({
    schema_version: 'shinemage-domain-pack/v1',
    package_name: '@shine-mage/board-components',
    package_version: '0.1.0',
    tarball: { name: domainName, bytes: domainPack.length, sha256: sha256(domainPack) },
  });
  await put(join(directory, SEALED_DIR, 'domain', 'board-components-pack.json'), domainManifest);
  await put(join(directory, SEALED_DIR, 'domain', domainName), domainPack);
  const compositionLock = { schema_version: 'shinemage-composition-pack-lock/v1', profiles: [], plugins };
  const manifest = {
    schema_version: 'shinemage-composition-pack-manifest/v1',
    lock: {}, consumer: {}, bundle: {}, toolchain: {}, sources,
    deletion_gate: {},
    domains: [{ package: '@shine-mage/board-components', manifest: 'domain/board-components-pack.json',
      manifest_sha256: sha256(domainManifest), pack_sha256: sha256(domainPack) }],
  };
  await writeFile(join(directory, SEALED_SUMS), await buildSealedSums(directory));
  return { directory, compositionLock, manifest };
}

async function serviceFixture(t) {
  const directory = await root(t);
  const lock = 'fastapi==0.141.1\nstarlette==1.10.0\n';
  const packageJson = canonical({ name: 'service', dependencies: { fastapi: '0.141.1', starlette: '1.10.0' } });
  await put(join(directory, 'requirements-lock.txt'), lock);
  await put(join(directory, 'services', 'dependency-closure.json'), canonical({
    schema_version: 'shinemage-service-dependency-closure/v1',
    source: 'requirements-lock.txt',
    tables: { service: { packages: ['fastapi', 'starlette'], manifests: ['services/service/package.json'] } },
  }));
  await put(join(directory, 'services', 'service', 'package.json'), packageJson);
  return { directory, lock: Buffer.from(lock), packageJson };
}

async function git(directory, args) {
  const { stdout } = await exec('git', ['-C', directory, ...args]);
  return stdout.trim();
}

async function checkoutFixture(t) {
  const directory = await root(t);
  const compositionLock = canonical({ schema_version: 'shinemage-composition-pack-lock/v1', profiles: [], plugins: [] });
  const lock = canonical({
    schema_version: 'dsh-composition-artifact/v1', repository: 'tyuanww/fuqing-crm-analytics',
    id: 111, sha256: 'a'.repeat(64), runId: 222, headSha: 'b'.repeat(40),
    composition_lock_sha256: sha256(compositionLock),
  });
  await put(join(directory, COMPOSITION_LOCK), compositionLock);
  await put(join(directory, COMPOSITION_MANIFEST), canonical({ schema_version: 'manifest/v1' }));
  await put(join(directory, ARTIFACT_LOCK), lock);
  await put(join(directory, RUNTIME_HOST_SOURCE_PATH),
    `// archived host source\nexport const RUNTIME_HOST_SOURCE = '${'b'.repeat(40)}';\n`);
  const service = await serviceFixture(t);
  await put(join(directory, 'requirements-lock.txt'), await readFile(join(service.directory, 'requirements-lock.txt')));
  await put(join(directory, 'services', 'dependency-closure.json'),
    await readFile(join(service.directory, 'services', 'dependency-closure.json')));
  await put(join(directory, 'services', 'service', 'package.json'), service.packageJson);
  await exec('git', ['init', '-q', directory]);
  await git(directory, ['config', 'user.name', 'Respin Test']);
  await git(directory, ['config', 'user.email', 'respin@example.invalid']);
  await git(directory, ['add', '-A']);
  await git(directory, ['commit', '-q', '-m', 'fixture']);
  return { directory, lock };
}

test('artifact lock rewrite moves only the identity fields and is idempotent', async t => {
  const { directory } = await checkoutFixture(t);
  const sealed = { id: 333, sha256: 'c'.repeat(64), runId: 444, headSha: 'd'.repeat(40),
    composition_lock_sha256: sha256(await readFile(join(directory, COMPOSITION_LOCK))) };
  const changed = await rewriteArtifactLock({ root: directory, sealed });
  assert.equal(changed.changed, true);
  assert.equal(changed.oldId, 111);
  const written = JSON.parse(await readFile(join(directory, ARTIFACT_LOCK), 'utf8'));
  assert.deepEqual(written, {
    schema_version: 'dsh-composition-artifact/v1', repository: 'tyuanww/fuqing-crm-analytics',
    id: 333, sha256: sealed.sha256, runId: 444, headSha: sealed.headSha,
    composition_lock_sha256: sealed.composition_lock_sha256,
  });
  const again = await rewriteArtifactLock({ root: directory, sealed });
  assert.equal(again.changed, false);
});

test('runtime host pin moves to the sealed head and refuses a malformed source', async t => {
  const { directory } = await checkoutFixture(t);
  const next = await rewriteRuntimeHostSource({ root: directory, headSha: 'e'.repeat(40) });
  assert.equal(next.changed, true);
  assert.equal(next.oldHeadSha, 'b'.repeat(40));
  assert.equal(runtimeHostSource(await readFile(join(directory, RUNTIME_HOST_SOURCE_PATH), 'utf8')), 'e'.repeat(40));
  assert.equal((await rewriteRuntimeHostSource({ root: directory, headSha: 'e'.repeat(40) })).changed, false);
  assert.throws(() => nextRuntimeHostSource("export const RUNTIME_HOST_SOURCE = 'short';\n", 'e'.repeat(40)),
    error => error.code === 'RESPIN_RUNTIME_SOURCE_SHAPE');
});

test('sealed members verify against the composition lock and manifest', async t => {
  const { directory, compositionLock, manifest } = await sealedFixture(t);
  const result = await verifySealedMembers({ root: directory, compositionLock, manifest });
  assert.deepEqual(result, { memberCount: 20, plugins: 9, domains: 1 });
});

test('sealed members refuse a tampered checksum file and an unbound extra file', async t => {
  const { directory, compositionLock, manifest } = await sealedFixture(t);
  const sums = await readFile(join(directory, SEALED_SUMS), 'utf8');
  await writeFile(join(directory, SEALED_SUMS), sums.replace(/^[a-f0-9]{64}/, 'f'.repeat(64)));
  await rejectsCode(() => verifySealedMembers({ root: directory, compositionLock, manifest }), 'RESPIN_SEALED_SUMS_DIGEST');

  const other = await sealedFixture(t);
  await put(join(other.directory, SEALED_DIR, 'packs', 'extra', 'extra.tgz'), 'extra');
  await rejectsCode(() => verifySealedMembers({ root: other.directory, compositionLock: other.compositionLock, manifest: other.manifest }),
    'RESPIN_SEALED_MEMBER_COUNT');
});

test('sealed members refuse a stale pack digest before any artifact is trusted', async t => {
  const { directory, compositionLock, manifest } = await sealedFixture(t);
  await unlink(join(directory, SEALED_DIR, 'packs', 'pack-0', 'shine-mage-dsh-pack-0-0.0.0-b0.tgz'));
  await rejectsCode(() => verifySealedMembers({ root: directory, compositionLock, manifest }),
    'RESPIN_SEALED_MEMBER_COUNT');
});

test('source-target lock rejects the starlette-style stale seal and accepts the current recipe', async t => {
  const { directory, lock } = await serviceFixture(t);
  const ok = await verifySourceTargetLock({ root: directory, headSha: 'f'.repeat(40), headLockBytes: lock });
  assert.deepEqual(ok.manifests, ['services/service/package.json']);
  await put(join(directory, 'services', 'service', 'package.json'),
    canonical({ name: 'service', dependencies: { fastapi: '0.141.1', starlette: '1.6.0' } }));
  await assert.rejects(() => verifySourceTargetLock({ root: directory, headSha: 'f'.repeat(40), headLockBytes: lock }),
    error => error.code === 'RESPIN_SOURCE_TARGET_LOCK'
      && /starlette locked=1\.10\.0 recipe=1\.6\.0/.test(error.message));
});

test('check state reports dry-run-safe consistency and the sealed head covers the worktree', async t => {
  const { directory } = await checkoutFixture(t);
  const state = await checkState({ root: directory });
  assert.equal(state.ok, true, state.errors.join('\n'));
  assert.equal(state.lock.id, 111);
  assert.equal(state.runtimeSource, 'b'.repeat(40));
  assert.equal(await sealedHeadCoversTarget(directory, state.lock), false);
});

test('--dry-run exits 0, writes nothing and leaves the checkout clean', async t => {
  const { directory } = await checkoutFixture(t);
  const before = {
    lock: await readFile(join(directory, ARTIFACT_LOCK)),
    runtime: await readFile(join(directory, RUNTIME_HOST_SOURCE_PATH)),
    head: await git(directory, ['rev-parse', 'HEAD']),
  };
  const { stdout } = await exec(process.execPath, [CLI, '--dry-run', '--root', directory]);
  assert.match(stdout, /RESPIN_DRY_RUN target=/);
  assert.match(stdout, /RESPIN_DRY_RUN no files changed/);
  assert.deepEqual(await readFile(join(directory, ARTIFACT_LOCK)), before.lock);
  assert.deepEqual(await readFile(join(directory, RUNTIME_HOST_SOURCE_PATH)), before.runtime);
  assert.equal(await git(directory, ['rev-parse', 'HEAD']), before.head);
  assert.equal(await git(directory, ['status', '--porcelain']), '');
});

test('--check exits 0 on this fixture and refuses a stale RUNTIME_HOST_SOURCE pin', async t => {
  const { directory } = await checkoutFixture(t);
  const ok = await exec(process.execPath, [CLI, '--check', '--root', directory]);
  assert.match(ok.stdout, /RESPIN_CHECK_OK/);
  await writeFile(join(directory, RUNTIME_HOST_SOURCE_PATH),
    `export const RUNTIME_HOST_SOURCE = '${'0'.repeat(40)}';\n`);
  await assert.rejects(exec(process.execPath, [CLI, '--check', '--root', directory]),
    error => /RESPIN_RUNTIME_SOURCE_DRIFT/.test(error.stdout) && error.code === 1);
});

test('sealing branch rebuild is deterministic, carries the target lock and is idempotent', async t => {
  const sealed = await sealedFixture(t);
  const origin = await root(t);
  const repo = await root(t);
  await exec('git', ['init', '--bare', '-q', origin]);
  await exec('git', ['-c', 'init.defaultBranch=main', 'init', '-q', repo]);
  await git(repo, ['config', 'user.name', 'Respin Test']);
  await git(repo, ['config', 'user.email', 'respin@example.invalid']);
  await git(repo, ['remote', 'add', 'origin', origin]);

  const service = await serviceFixture(t);
  await put(join(repo, 'requirements-lock.txt'), await readFile(join(service.directory, 'requirements-lock.txt')));
  await put(join(repo, 'services', 'dependency-closure.json'),
    await readFile(join(service.directory, 'services', 'dependency-closure.json')));
  await put(join(repo, 'services', 'service', 'package.json'), service.packageJson);
  await put(join(repo, COMPOSITION_LOCK), canonical(sealed.compositionLock));
  await put(join(repo, COMPOSITION_MANIFEST), canonical(sealed.manifest));
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-q', '-m', 'main']);
  const main = await git(repo, ['rev-parse', 'HEAD']);

  await git(repo, ['switch', '-q', '-c', SEALING_BRANCH]);
  await cp(join(sealed.directory, '.ci'), join(repo, '.ci'), { recursive: true });
  await put(join(repo, SEALING_WORKFLOW), 'name: fixture sealing\n');
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-q', '-m', 'seed seal']);
  await git(repo, ['push', '-q', '-u', 'origin', SEALING_BRANCH]);
  await git(repo, ['switch', '-q', '--detach', main]);

  // Step 2 writes pins in the worktree; the sealing commit must carry them.
  const pin = canonical({ name: 'service', dependencies: { fastapi: '0.141.1', starlette: '1.6.0' } });
  await writeFile(join(repo, 'services', 'service', 'package.json'), pin);

  const first = await buildSealingCommit({ root: repo, target: main, writtenPaths: ['services/service/package.json'] });
  assert.equal(first.changed, true);
  const remoteHead = (await exec('git', ['--git-dir', origin, 'rev-parse', `refs/heads/${SEALING_BRANCH}`])).stdout.trim();
  assert.equal(remoteHead, first.head);
  assert.equal(await git(repo, ['show', `${first.head}:requirements-lock.txt`]), 'fastapi==0.141.1\nstarlette==1.10.0');
  assert.deepEqual(await readFile(join(repo, 'services', 'service', 'package.json')), pin);
  assert.equal((await git(repo, ['show', `${first.head}:services/service/package.json`])), pin.toString().trimEnd());
  const sums = await git(repo, ['show', `${first.head}:${SEALED_SUMS}`]);
  assert.equal(sums, (await buildSealedSums(sealed.directory)).toString().trimEnd());
  assert.equal((await git(repo, ['show', `${first.head}:${SEALING_WORKFLOW}`])), 'name: fixture sealing');

  const second = await buildSealingCommit({ root: repo, target: main, writtenPaths: ['services/service/package.json'] });
  assert.equal(second.head, first.head);
  assert.equal(second.changed, false);
  assert.equal((await exec('git', ['--git-dir', origin, 'rev-parse', `refs/heads/${SEALING_BRANCH}`])).stdout.trim(), first.head);
  assert.equal((await git(repo, ['worktree', 'list'])).split('\n').length, 1);
});
