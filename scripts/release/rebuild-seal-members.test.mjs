import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  COMPOSITION_LOCK, COMPOSITION_MANIFEST, SEALED_DIR, SEALED_SUMS, SEALING_BRANCH,
  buildSumsBytes, compareSealTrees, createSealSource, deriveSealMembers, readSealTree,
  rebuildSealMembers,
} from './rebuild-seal-members.mjs';
import {
  SEALING_WORKFLOW, buildSealingCommit,
} from './respin-composition-artifact.mjs';

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, 'rebuild-seal-members.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);
const REF = `refs/remotes/origin/${SEALING_BRANCH}`;

const DIRECTORIES = [
  'analytics-workbench', 'crm-knowledge', 'knowledge', 'shine-board', 'shine-brand',
  'shine-crowd-action', 'shine-funnel', 'shine-query', 'shine-waterfall',
];

async function root(t, prefix = 'seal-rebuild-test-') {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function put(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function packSet({ version = '0.0.0-b0', packBytes = index => `tarball-${index}`, overrides = {} } = {}) {
  const members = new Map();
  const plugins = [];
  const sources = [];
  DIRECTORIES.forEach((directory, index) => {
    const id = `@shine-mage/dsh-${directory}`;
    const selected = overrides[directory] ?? { version, bytes: packBytes(index) };
    const tarballName = `shine-mage-dsh-${directory}-${selected.version}.tgz`;
    const pack = Buffer.from(selected.bytes);
    const manifest = canonical({
      schema_version: 'dsh-plugin-pack/v1', package_name: id, package_version: selected.version,
      source_sha: 'a'.repeat(40), tarball: { name: tarballName, bytes: pack.length, sha256: sha256(pack) },
    });
    members.set(`packs/${directory}/plugin-pack.json`, manifest);
    members.set(`packs/${directory}/${tarballName}`, pack);
    plugins.push({ directory, id, source_sha: 'a'.repeat(40), version: selected.version,
      manifest_sha256: sha256(manifest) });
    sources.push({ id, directory, repository: `tyuanww/dsh-${directory}`, ref: 'commit',
      sha: 'a'.repeat(40), manifest_sha256: sha256(manifest), pack_sha256: sha256(pack), status: 'PASS' });
  });
  const domainName = 'shine-mage-board-components-0.1.0.tgz';
  const domainPack = Buffer.from('domain-tarball');
  const domainManifest = canonical({
    schema_version: 'shinemage-domain-pack/v1', package_name: '@shine-mage/board-components',
    package_version: '0.1.0', tarball: { name: domainName, bytes: domainPack.length, sha256: sha256(domainPack) },
  });
  members.set('domain/board-components-pack.json', domainManifest);
  members.set(`domain/${domainName}`, domainPack);
  const domains = [{ package: '@shine-mage/board-components', directory: 'board-components',
    repository: 'tyuanww/shinemage-board-components', ref: 'commit', sha: 'b'.repeat(40),
    manifest: 'domain/board-components-pack.json', manifest_sha256: sha256(domainManifest),
    pack_sha256: sha256(domainPack), status: 'PASS' }];
  return { members, plugins, sources, domains };
}

function composition(set) {
  const compositionLock = {
    schema_version: 'shinemage-composition-pack-lock/v1',
    profiles: [{ name: 'crm', path: 'config/dsh-profile.crm-knowledge.rc3.json', sha256: 'c'.repeat(64) },
      { name: 'page', path: 'config/dsh-profile.rc3.json', sha256: 'd'.repeat(64) }],
    plugins: set.plugins,
  };
  const manifest = {
    schema_version: 'shinemage-composition-pack-manifest/v1',
    lock: { path: COMPOSITION_LOCK, sha256: sha256(canonical(compositionLock)) },
    consumer: { repository: 'tyuanww/fuqing-crm-analytics', branch: 'main', reviewed_sha: 'e'.repeat(40) },
    bundle: { status: 'NOT_RUN' },
    toolchain: { sdk_version: '0.2.1-rc.5' },
    sources: set.sources,
    deletion_gate: { status: 'BLOCKED', blocking_reasons: [] },
    domains: set.domains,
  };
  return { compositionLock, manifest };
}

async function writePacks(directory, members, only = null) {
  for (const [path, bytes] of members) {
    if (only && !only.some(prefix => path.startsWith(prefix))) continue;
    await put(join(directory, path), bytes);
  }
  return directory;
}

async function git(directory, args) {
  const { stdout } = await exec('git', ['-C', directory, ...args]);
  return stdout.trim();
}

/**
 * Bare origin + work repo: `main` carries the locks; the dedicated sealing
 * branch carries a committed sealed tree built from `sealed`.
 */
async function repoFixture(t, { locked, sealed }) {
  const origin = await root(t, 'seal-origin-');
  const repo = await root(t, 'seal-repo-');
  await exec('git', ['init', '--bare', '-q', origin]);
  await exec('git', ['-c', 'init.defaultBranch=main', 'init', '-q', repo]);
  await git(repo, ['config', 'user.name', 'Seal Test']);
  await git(repo, ['config', 'user.email', 'seal@example.invalid']);
  await git(repo, ['remote', 'add', 'origin', origin]);

  await put(join(repo, COMPOSITION_LOCK), canonical(locked.compositionLock));
  await put(join(repo, COMPOSITION_MANIFEST), canonical(locked.manifest));
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-q', '-m', 'main locks']);
  const main = await git(repo, ['rev-parse', 'HEAD']);

  await git(repo, ['switch', '-q', '-c', SEALING_BRANCH]);
  for (const [path, bytes] of sealed.members) {
    await put(join(repo, SEALED_DIR, path), bytes);
  }
  await writeFile(join(repo, SEALED_SUMS), buildSumsBytes([...sealed.members]
    .map(([path, bytes]) => ({ path, bytes }))));
  await put(join(repo, SEALING_WORKFLOW), 'name: fixture sealing\n');
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-q', '-m', 'seed seal']);
  await git(repo, ['push', '-q', '-u', 'origin', SEALING_BRANCH]);
  await git(repo, ['switch', '-q', '--detach', main]);
  return { repo, origin, main };
}

async function commitLocks(repo, locked) {
  await put(join(repo, COMPOSITION_LOCK), canonical(locked.compositionLock));
  await put(join(repo, COMPOSITION_MANIFEST), canonical(locked.manifest));
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-q', '-m', 'repack one source']);
  return git(repo, ['rev-parse', 'HEAD']);
}

test('derivation produces the exact 20-member set, bytes and checksum file', async t => {
  const set = packSet();
  const { compositionLock, manifest } = composition(set);
  const packs = await writePacks(await root(t, 'seal-packs-'), set.members);
  const derived = await deriveSealMembers({
    compositionLock, manifest, source: await createSealSource({ packsDirectory: packs }),
  });

  const expectedPaths = [...set.members.keys()].sort();
  assert.deepEqual(derived.members.map(member => member.path), expectedPaths);
  assert.equal(derived.memberCount, 20);
  for (const member of derived.members) {
    assert.deepEqual(member.bytes, set.members.get(member.path), member.path);
    assert.equal(member.sha256, sha256(set.members.get(member.path)));
    assert.equal(member.origin, 'packs');
  }
  const expectedSums = expectedPaths
    .map(path => `${sha256(set.members.get(path))}  ${SEALED_DIR}/${path}`).join('\n') + '\n';
  assert.deepEqual(derived.sums, Buffer.from(expectedSums));
});

test('a rebuilt pack replaces only its own members, unchanged packs come from the branch', async t => {
  const sealed = packSet();
  const locked = packSet({ overrides: { knowledge: { version: '0.0.0-b1', bytes: 'repacked-knowledge' } } });
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const packs = await writePacks(await root(t, 'seal-partial-'), locked.members, ['packs/knowledge/']);

  const derived = await rebuildSealMembers({
    compositionLock: composition(locked).compositionLock,
    manifest: composition(locked).manifest,
    source: await createSealSource({ root: fixture.repo, ref: REF, packsDirectory: packs }),
  });
  const changed = derived.members.filter(member => member.path.startsWith('packs/knowledge/'));
  assert.equal(changed.length, 2);
  assert.ok(changed.every(member => member.origin === 'packs'));
  assert.ok(derived.members.filter(member => !member.path.startsWith('packs/knowledge/'))
    .every(member => member.origin === 'branch'));
  assert.equal(derived.memberCount, 20);
});

test('a stale branch byte fails as stale, while bad --packs bytes are genuine inconsistency', async t => {
  const sealed = packSet();
  const locked = packSet({ overrides: { knowledge: { version: '0.0.0-b1', bytes: 'repacked-knowledge' } } });
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const { compositionLock, manifest } = composition(locked);

  const branchSource = await createSealSource({ root: fixture.repo, ref: REF });
  await rejectsCode(() => rebuildSealMembers({ compositionLock, manifest, source: branchSource }),
    'SEAL_SOURCE_STALE');

  const tampered = await writePacks(await root(t, 'seal-tampered-'), locked.members);
  await put(join(tampered, 'packs/knowledge/shine-mage-dsh-knowledge-0.0.0-b1.tgz'), 'not-the-pack');
  const tamperedSource = await createSealSource({ packsDirectory: tampered });
  await rejectsCode(() => rebuildSealMembers({ compositionLock, manifest, source: tamperedSource }),
    'SEAL_INPUT_DIGEST');
});

test('--check proves the committed tree matches a fresh derivation and reports drift', async t => {
  const sealed = packSet();
  const locked = packSet({ overrides: { knowledge: { version: '0.0.0-b1', bytes: 'repacked-knowledge' } } });
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const packs = await writePacks(await root(t, 'seal-partial-'), locked.members, ['packs/knowledge/']);

  const aligned = await exec(process.execPath, [CLI, '--check', '--root', fixture.repo, '--ref', REF]);
  assert.match(aligned.stdout, /SEAL_REBUILD_CHECK_OK/);

  await commitLocks(fixture.repo, composition(locked));
  const stale = await exec(process.execPath, [CLI, '--check', '--root', fixture.repo, '--ref', REF])
    .catch(error => error);
  assert.equal(stale.code, 1);
  assert.match(stale.stdout, /SEAL_REBUILD_CHECK_FAILED/);
  assert.match(stale.stdout, /SEAL_REBUILD_CHECK_DRIFT/);

  const drifted = await exec(process.execPath, [CLI, '--check', '--root', fixture.repo, '--ref', REF,
    '--packs', packs]).catch(error => error);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stdout, /SEAL_REBUILD_CHECK_DRIFT packs\/knowledge\/plugin-pack\.json bytes differ/);
});

test('dry-run writes nothing and --output materialises the derived bytes', async t => {
  const sealed = packSet();
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const before = {
    head: await git(fixture.repo, ['rev-parse', 'HEAD']),
    status: await git(fixture.repo, ['status', '--porcelain', '--untracked-files=no']),
  };
  const dry = await exec(process.execPath, [CLI, '--dry-run', '--root', fixture.repo, '--ref', REF]);
  assert.match(dry.stdout, /SEAL_REBUILD_DRY_RUN/);
  assert.match(dry.stdout, /SEAL_REBUILD_NO_WRITES/);
  assert.equal(await git(fixture.repo, ['rev-parse', 'HEAD']), before.head);
  assert.equal(await git(fixture.repo, ['status', '--porcelain', '--untracked-files=no']), before.status);

  const output = await root(t, 'seal-output-');
  const materialised = await exec(process.execPath, [CLI, '--root', fixture.repo, '--ref', REF,
    '--output', output]);
  assert.match(materialised.stdout, /SEAL_REBUILD_OUTPUT/);
  for (const [path, bytes] of sealed.members) {
    assert.deepEqual(await readFile(join(output, SEALED_DIR, path)), bytes, path);
  }
  assert.deepEqual(await readFile(join(output, SEALED_SUMS)), buildSumsBytes([...sealed.members]
    .map(([path, bytes]) => ({ path, bytes }))));
  assert.equal(await git(fixture.repo, ['rev-parse', 'HEAD']), before.head);
});

test('respin refuses a stale seal with the --packs remedy instead of RESPIN_SEALED_*', async t => {
  const sealed = packSet();
  const locked = packSet({ overrides: { knowledge: { version: '0.0.0-b1', bytes: 'repacked-knowledge' } } });
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const head = await commitLocks(fixture.repo, composition(locked));
  const remoteBefore = (await exec('git', ['--git-dir', fixture.origin, 'rev-parse',
    `refs/heads/${SEALING_BRANCH}`])).stdout.trim();
  await rejectsCode(() => buildSealingCommit({ root: fixture.repo, target: head }), 'RESPIN_SEAL_MEMBERS_STALE');
  await assert.rejects(() => buildSealingCommit({ root: fixture.repo, target: head }),
    error => error.code === 'RESPIN_SEAL_MEMBERS_STALE' && /--packs <dir>/.test(error.message));
  assert.equal((await exec('git', ['--git-dir', fixture.origin, 'rev-parse',
    `refs/heads/${SEALING_BRANCH}`])).stdout.trim(), remoteBefore);
});

test('respin keeps a hard SEALED_* failure when --packs bytes genuinely disagree', async t => {
  const sealed = packSet();
  const locked = packSet({ overrides: { knowledge: { version: '0.0.0-b1', bytes: 'repacked-knowledge' } } });
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const head = await commitLocks(fixture.repo, composition(locked));
  const packs = await writePacks(await root(t, 'seal-bad-'), locked.members, ['packs/knowledge/']);
  await put(join(packs, 'packs/knowledge/shine-mage-dsh-knowledge-0.0.0-b1.tgz'), 'wrong-bytes');
  await rejectsCode(() => buildSealingCommit({ root: fixture.repo, target: head, packsDirectory: packs }),
    'RESPIN_SEALED_INPUT');
});

test('the sealing commit rebuild is deterministic, idempotent and carries the rebuilt bytes', async t => {
  const sealed = packSet();
  const locked = packSet({ overrides: { knowledge: { version: '0.0.0-b1', bytes: 'repacked-knowledge' } } });
  const fixture = await repoFixture(t, { locked: composition(sealed), sealed });
  const head = await commitLocks(fixture.repo, composition(locked));
  const packs = await writePacks(await root(t, 'seal-partial-'), locked.members, ['packs/knowledge/']);
  const remoteBefore = (await exec('git', ['--git-dir', fixture.origin, 'rev-parse',
    `refs/heads/${SEALING_BRANCH}`])).stdout.trim();

  const first = await exec(process.execPath, [CLI, '--write-branch', '--root', fixture.repo, '--ref', REF,
    '--target', head, '--packs', packs]);
  const firstHead = /SEAL_REBUILD_WRITE head=([a-f0-9]{40})/.exec(first.stdout)?.[1];
  assert.match(firstHead ?? '', /^[a-f0-9]{40}$/);
  const remoteAfter = (await exec('git', ['--git-dir', fixture.origin, 'rev-parse',
    `refs/heads/${SEALING_BRANCH}`])).stdout.trim();
  assert.equal(remoteAfter, firstHead);
  assert.notEqual(remoteAfter, remoteBefore);

  const committed = await readSealTree({ root: fixture.repo, ref: firstHead });
  const { compositionLock, manifest } = composition(locked);
  const expected = await deriveSealMembers({
    compositionLock, manifest, source: await createSealSource({ root: fixture.repo, ref: firstHead }),
  });
  assert.deepEqual(compareSealTrees({ derived: expected, committed }), { ok: true, drift: [] });
  for (const [path, bytes] of locked.members) {
    if (!path.startsWith('packs/knowledge/')) continue;
    assert.deepEqual(committed.members.find(member => member.path === path).bytes, bytes, path);
  }

  const second = await buildSealingCommit({ root: fixture.repo, target: head, packsDirectory: packs });
  assert.equal(second.head, firstHead);
  assert.equal(second.changed, false);
  assert.equal((await exec('git', ['--git-dir', fixture.origin, 'rev-parse',
    `refs/heads/${SEALING_BRANCH}`])).stdout.trim(), firstHead);
  assert.equal(await git(fixture.repo, ['status', '--porcelain', '--untracked-files=no']), '');
});
