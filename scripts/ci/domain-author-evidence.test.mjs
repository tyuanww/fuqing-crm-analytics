import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDomainAuthorEvidence, bindDomainPackageInput } from './domain-author-evidence.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const python = process.env.FQ_B0_PYTHON;
assert.ok(isAbsolute(python ?? ''), 'DOMAIN_TEST_PYTHON_REQUIRED');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lockFile = join(root, 'config/domain-author-evidence.lock.json');
const real = process.env.DOMAIN_AUTHOR_CI_ARCHIVE;
const options = { skip: !real ? 'NOT_RUN: fixed DOMAIN_AUTHOR_CI_ARCHIVE not supplied' : false };
const json = value => JSON.stringify(value) + '\n';
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'domain-author-guard-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function fixture(t, mutate) {
  const directory = await temporary(t), archivePath = join(directory, 'input.zip'), lockPath = join(directory, 'lock.json');
  const lock = JSON.parse(await readFile(lockFile));
  const changed = mutate ?? {};
  const record = JSON.parse(execFileSync(python, ['-I', '-B', '-c', `
import hashlib, io, json, pathlib, sys, zipfile
original, output, encoded, encoded_lock = sys.argv[1:]
change, lock = json.loads(encoded), json.loads(encoded_lock)
with zipfile.ZipFile(original) as source:
    members = {i.filename: source.read(i) for i in source.infolist() if not i.is_dir()}
name = lock['files']['receipt']['path']
receipt = json.loads(members[name])
for path, value in change.items():
    keys = path.split('.')
    obj = receipt
    for key in keys[:-1]: obj = obj[int(key)] if isinstance(obj, list) else obj[key]
    obj[int(keys[-1]) if isinstance(obj, list) else keys[-1]] = value
members[name] = (json.dumps(receipt, separators=(',', ':')) + '\\n').encode()
lock['files']['receipt']['bytes'] = len(members[name])
lock['files']['receipt']['sha256'] = hashlib.sha256(members[name]).hexdigest()
with zipfile.ZipFile(output, 'w') as target:
    for name, value in members.items(): target.writestr(name, value)
raw = pathlib.Path(output).read_bytes()
lock['archive']['sha256'] = hashlib.sha256(raw).hexdigest()
lock['archive']['bytes'] = len(raw)
print(json.dumps(lock))
`, real, archivePath, JSON.stringify(changed), JSON.stringify(lock)], { encoding: 'utf8', timeout: 10000 }));
  await writeFile(lockPath, json(record));
  return { archivePath, lockPath, python, directory };
}

test('fixed archive preserves owner attribution, true logs and two distinct library inputs', options, async () => {
  const evidence = await readDomainAuthorEvidence({ archivePath: real, python });
  assert.equal(evidence.source_files, 30);
  assert.deepEqual(evidence.groups.map(row => row.counts.pass), [28, 6]);
  assert.equal(evidence.source_execution_here, 'NOT_RUN_AUTHOR_OWNED');
  assert.equal(evidence.current_candidate_host_service_admission, 'NOT_RUN');
  assert.equal(evidence.release_ready, false);
});

test('missing/relative archives and Python, symlinks and changed digest are rejected', async t => {
  await assert.rejects(readDomainAuthorEvidence({ python }), /DOMAIN_AUTHOR_ARCHIVE_REQUIRED/);
  await assert.rejects(readDomainAuthorEvidence({ archivePath: 'relative.zip', python }), /DOMAIN_AUTHOR_ARCHIVE_REQUIRED/);
  await assert.rejects(readDomainAuthorEvidence({ archivePath: '/not-read.zip', python: 'python3' }), /DOMAIN_AUTHOR_PYTHON_REQUIRED/);
  const directory = await temporary(t), path = join(directory, 'empty.zip'), link = join(directory, 'link.zip');
  await writeFile(path, 'changed'); await symlink(path, link);
  await assert.rejects(readDomainAuthorEvidence({ archivePath: link, python }), /DOMAIN_AUTHOR_ARCHIVE_FILE/);
  await assert.rejects(readDomainAuthorEvidence({ archivePath: path, python }), /DOMAIN_AUTHOR_ARCHIVE_BYTES/);
});

test('unreviewed lock schema/counts/paths cannot be used even before reading an archive', async t => {
  const directory = await temporary(t), lockPath = join(directory, 'lock.json');
  const original = JSON.parse(await readFile(lockFile));
  for (const [mutate, code] of [
    [r => { r.schema = 'other'; }, /DOMAIN_AUTHOR_LOCK_SCHEMA/],
    [r => { r.archive.conclusion = 'failure'; }, /DOMAIN_AUTHOR_RUN_CONCLUSION/],
    [r => { r.files.receipt.path = '../escape'; }, /DOMAIN_AUTHOR_MEMBER_PATH/],
    [r => { r.groups[1].counts.skipped = 1; }, /DOMAIN_AUTHOR_GROUP_COUNTS/],
    [r => { r.groups[1].files = []; }, /DOMAIN_AUTHOR_GROUP_FILES/],
    [r => { r.files.reference = r.files.content_pack; }, /DOMAIN_AUTHOR_MEMBER_DUPLICATE/],
  ]) {
    const row = structuredClone(original); mutate(row); await writeFile(lockPath, json(row));
    await assert.rejects(readDomainAuthorEvidence({ archivePath: join(directory, 'absent'), python, lockPath }), code);
  }
});

for (const [name, mutate, code] of [
  ['dirty source', { 'source.clean': false }, /DOMAIN_AUTHOR_SOURCE_DIRTY/],
  ['local proposal', { scope: 'LOCAL_PROPOSAL' }, /DOMAIN_AUTHOR_SCOPE/],
  ['another commit', { 'source.sha': '0'.repeat(40) }, /DOMAIN_AUTHOR_SOURCE/],
  ['another run', { 'environment.github.run_id': 1 }, /DOMAIN_AUTHOR_ENVIRONMENT/],
  ['producer coverage omission', { groups: [] }, /DOMAIN_AUTHOR_GROUP_BINDING/],
  ['failed group', { 'groups.1.counts.fail': 1 }, /DOMAIN_AUTHOR_GROUP_BINDING/],
  ['release overclaim', { release_ready: true }, /DOMAIN_AUTHOR_RELEASE_BOUNDARY/],
]) test(`freshly resealed receipt with ${name} is rejected`, options, async t => {
  await assert.rejects(readDomainAuthorEvidence(await fixture(t, mutate)), code);
});

test('ZIP path/link/duplicate/expansion controls remain active under Python -O, without extraction', async t => {
  const directory = await temporary(t), helper = join(root, 'scripts/ci/read-domain-author-evidence.py');
  for (const [name, code] of [['../escape', /DOMAIN_AUTHOR_ARCHIVE_PATH/], ['link', /DOMAIN_AUTHOR_ARCHIVE_SPECIAL/],
    ['duplicate', /DOMAIN_AUTHOR_ARCHIVE_DUPLICATE/], ['expansion', /DOMAIN_AUTHOR_ARCHIVE_EXPANSION/]]) {
    const path = join(directory, name.replaceAll('/', '-') + '.zip');
    execFileSync(python, ['-I', '-B', '-c', `
import stat, sys, zipfile
path, kind = sys.argv[1:]
with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    if kind == 'link':
        info = zipfile.ZipInfo('link'); info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, 'not executed')
    elif kind == 'duplicate':
        archive.writestr('same', '1'); archive.writestr('same', '2')
    elif kind == 'expansion': archive.writestr('large', b'0' * (8 * 1024 * 1024 + 1))
    else: archive.writestr(kind, 'bad')
`, path, name], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    const archive = await readFile(path);
    for (const flags of [[], ['-O']]) assert.throws(() => execFileSync(python, ['-I', '-B', ...flags, helper, '{}'],
      { input: archive, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }), code);
  }
  await assert.rejects(access(join(directory, 'escape')), { code: 'ENOENT' });
});

test('reference binding refuses aliases and digest drift without writing outputs', async t => {
  const directory = await temporary(t), inputPath = join(directory, 'input.tgz'), link = join(directory, 'link.tgz');
  const bytes = Buffer.from('owned reference binding fixture');
  const evidence = { reference: { bytes: bytes.length, sha256: hash(bytes) } };
  await writeFile(inputPath, bytes); await symlink(inputPath, link);
  assert.equal((await bindDomainPackageInput(evidence, inputPath)).package_input.sha256, hash(bytes));
  await assert.rejects(bindDomainPackageInput(evidence, link), /DOMAIN_AUTHOR_INPUT_FILE/);
  await writeFile(inputPath, Buffer.alloc(bytes.length, 'x'));
  await assert.rejects(bindDomainPackageInput(evidence, inputPath), /DOMAIN_AUTHOR_INPUT_DIGEST/);
  assert.deepEqual((await readFile(inputPath)), Buffer.alloc(bytes.length, 'x'));
});


test('remote acquisition without token creates no output or command side effect', async t => {
  const directory = await temporary(t), output = join(directory, 'receive');
  assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/ci/domain-author-evidence.mjs'),
    '--output', output, '--python', python], { env: { ...process.env, GH_TOKEN: '', PATH: '/nonexistent' }, stdio: ['ignore', 'pipe', 'pipe'] }), /DOMAIN_AUTHOR_AUTH_REQUIRED/);
  await assert.rejects(access(output), { code: 'ENOENT' });
});

async function remoteFixture(t, { badSource = false, badDigest = false } = {}) {
  const directory = await temporary(t), bin = join(directory, 'bin');
  const { mkdir } = await import('node:fs/promises'); await mkdir(bin);
  const lock = JSON.parse(await readFile(lockFile));
  const run = { head_sha: badSource ? '0'.repeat(40) : lock.source_sha, event: lock.archive.event,
    run_attempt: lock.archive.attempt, status: 'completed', conclusion: 'success' };
  const artifact = { id: lock.archive.artifact_id, expired: false,
    workflow_run: { id: lock.archive.run_id, head_sha: lock.source_sha },
    digest: `sha256:${badDigest ? '0'.repeat(64) : lock.archive.sha256}`, size_in_bytes: lock.archive.bytes };
  const command = `#!${process.execPath}\n` +
    `const fs=require('node:fs');const path=process.argv[3];fs.appendFileSync(${JSON.stringify(join(directory, 'calls.log'))},path+'\\n');` +
    `if(path.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(real)}));` +
    `else process.stdout.write(JSON.stringify(path.includes('/runs/')?${JSON.stringify(run)}:${JSON.stringify(artifact)}));`;
  await writeFile(join(bin, 'gh'), command, { mode: 0o700 });
  const output = join(directory, 'received'), githubEnv = join(directory, 'github.env');
  const invoke = () => execFileSync(process.execPath, [join(root, 'scripts/ci/domain-author-evidence.mjs'),
    '--output', output, '--python', python, '--github-env', githubEnv], {
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, GH_TOKEN: 'owned-mock-command-only' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
  });
  return { directory, output, githubEnv, invoke };
}

test('owned mock acquisition preserves original archive/input and rejects output reuse', options, async t => {
  const f = await remoteFixture(t), result = JSON.parse(f.invoke());
  assert.equal(result.source_execution_here, 'NOT_RUN_AUTHOR_OWNED');
  assert.equal(result.package_input.sha256, result.reference.sha256);
  assert.equal(result.release_ready, false);
  assert.equal(await readFile(f.githubEnv, 'utf8'), `DOMAIN_AUTHOR_CI_ARCHIVE=${join(await realpath(f.output), 'author-ci.zip')}\n`);
  assert.throws(f.invoke, /DOMAIN_AUTHOR_OUTPUT_EXISTS/);
  assert.equal((await readFile(join(f.directory, 'calls.log'), 'utf8')).trim().split('\n').length, 3);
});

test('owned mock acquisition rejects wrong source and digest before creating output', options, async t => {
  for (const options of [{ badSource: true }, { badDigest: true }]) {
    const f = await remoteFixture(t, options);
    assert.throws(f.invoke, options.badSource ? /DOMAIN_AUTHOR_RUN_SOURCE/ : /DOMAIN_AUTHOR_REMOTE_DIGEST/);
    await assert.rejects(access(f.output), { code: 'ENOENT' });
    await assert.rejects(access(f.githubEnv), { code: 'ENOENT' });
  }
});
