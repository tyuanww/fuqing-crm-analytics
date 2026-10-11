import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindWorkbenchAuthorEvidence, readWorkbenchAuthorEvidence } from './workbench-author-evidence.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const python = process.env.FQ_B0_PYTHON ?? 'python3';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value) + '\n';

async function fixture(t, { mutatePlan, mutateResult, extraMember } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-author-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lock = JSON.parse(await readFile(join(root, 'config/workbench-author-evidence.lock.json')));
  lock.core = { files: 2, tests: 2, pass: 2, fail: 0, skipped: 0, cancelled: 0, todo: 0, status: 0 };
  const owners = [{ file: 'src/a.test.mjs' }, { file: 'src/b.test.mjs' }, { file: 'test/c.test.mjs' }];
  const plan = { stage: 'core', files: ['src/first.test.mjs', 'test/second.test.mjs'], main_owned_checks: owners };
  const result = { schema: 'workbench-author-test-result/v1', stage: 'core', ...lock.core,
    remaining_stages: ['browser', 'standalone'].map(stage => ({ stage, status: 'NOT_RUN_BY_THIS_COMMAND' })),
    main_owned_checks: owners, release_ready: false };
  mutatePlan?.(plan); mutateResult?.(result);
  const members = { 'plan.json': json(plan), 'result.json': json(result), 'content.tgz': 'synthetic content pack\n' };
  lock.files = Object.fromEntries(['plan', 'result', 'content_pack'].map((name, i) => {
    const path = Object.keys(members)[i], bytes = Buffer.from(members[path]);
    return [name, { path, bytes: bytes.length, sha256: hash(bytes) }];
  }));
  const archivePath = join(directory, 'input.zip');
  execFileSync(python, ['-I', '-B', '-c', `
import json, stat, sys, zipfile
path, encoded, extra = sys.argv[1:]
with zipfile.ZipFile(path, 'w') as archive:
    for name, value in json.loads(encoded).items():
        archive.writestr(name, value)
    if extra:
        info = zipfile.ZipInfo(extra)
        info.external_attr = (stat.S_IFLNK | 0o777) << 16 if extra == 'link' else (stat.S_IFREG | 0o600) << 16
        archive.writestr(info, 'bad')
`, archivePath, JSON.stringify(members), extraMember ?? '']);
  const bytes = await readFile(archivePath);
  lock.archive.sha256 = hash(bytes); lock.archive.bytes = bytes.length;
  const lockPath = join(directory, 'lock.json');
  await writeFile(lockPath, json(lock));
  return { archivePath, lockPath, python, directory, lock };
}

test('the archive reader preserves author attribution and opt-in gaps, without extracting code', async t => {
  const f = await fixture(t), evidence = await readWorkbenchAuthorEvidence(f);
  assert.equal(evidence.source_sha, f.lock.source_sha);
  assert.equal(evidence.core.pass, 2);
  assert.deepEqual(evidence.core_files, ['src/first.test.mjs', 'test/second.test.mjs']);
  assert.equal(evidence.source_execution_here, 'NOT_RUN_AUTHOR_OWNED');
  assert.equal(evidence.host_service_admission, 'NOT_RUN');
  assert.equal(evidence.release_ready, false);
  assert.deepEqual(evidence.remaining_stages.map(row => row.status), ['NOT_RUN_BY_THIS_COMMAND', 'NOT_RUN_BY_THIS_COMMAND']);
  await assert.rejects(access(join(f.directory, 'plan.json')), { code: 'ENOENT' });
});

test('missing, relative, aliased and digest-changed archives are rejected', async t => {
  const f = await fixture(t);
  await assert.rejects(readWorkbenchAuthorEvidence({ ...f, archivePath: undefined }), /WORKBENCH_AUTHOR_ARCHIVE_REQUIRED/);
  await assert.rejects(readWorkbenchAuthorEvidence({ ...f, archivePath: 'relative.zip' }), /WORKBENCH_AUTHOR_ARCHIVE_REQUIRED/);
  await assert.rejects(readWorkbenchAuthorEvidence({ ...f, archivePath: join(f.directory, 'missing') }), { code: 'ENOENT' });
  await assert.rejects(readWorkbenchAuthorEvidence({ ...f, python: 'python3' }), /WORKBENCH_AUTHOR_PYTHON_REQUIRED/);
  const link = join(f.directory, 'alias.zip'); await symlink(f.archivePath, link);
  await assert.rejects(readWorkbenchAuthorEvidence({ ...f, archivePath: link }), /WORKBENCH_AUTHOR_ARCHIVE_FILE/);
  f.lock.archive.sha256 = '0'.repeat(64); await writeFile(f.lockPath, json(f.lock));
  await assert.rejects(readWorkbenchAuthorEvidence(f), /WORKBENCH_AUTHOR_ARCHIVE_DIGEST/);
});

for (const [name, mutateResult, code] of [
  ['failure', row => { row.fail = 1; }, /WORKBENCH_AUTHOR_RESULT_fail/],
  ['skip', row => { row.skipped = 1; }, /WORKBENCH_AUTHOR_RESULT_skipped/],
  ['wrong test count', row => { row.tests += 1; }, /WORKBENCH_AUTHOR_RESULT_tests/],
  ['browser overclaim', row => { row.remaining_stages[0].status = 'PASS'; }, /WORKBENCH_AUTHOR_OPT_IN_BOUNDARY/],
  ['release overclaim', row => { row.release_ready = true; }, /WORKBENCH_AUTHOR_RELEASE_BOUNDARY/],
  ['owner omission', row => { row.main_owned_checks = []; }, /WORKBENCH_AUTHOR_MAIN_OWNERS/],
]) test(`freshly sealed result with ${name} cannot satisfy core admission`, async t => {
  await assert.rejects(readWorkbenchAuthorEvidence(await fixture(t, { mutateResult })), code);
});

for (const [name, mutatePlan, code] of [
  ['duplicate files', row => { row.files[1] = row.files[0]; }, /WORKBENCH_AUTHOR_PLAN_DUPLICATE/],
  ['escaping path', row => { row.files[0] = 'src/../escape.test.mjs'; }, /WORKBENCH_AUTHOR_TEST_PATH/],
]) test(`freshly sealed plan with ${name} is rejected`, async t => {
  await assert.rejects(readWorkbenchAuthorEvidence(await fixture(t, { mutatePlan })), code);
});

test('ZIP traversal and links fail even under Python optimization, without extraction', async t => {
  for (const extraMember of ['../escape', 'link']) {
    const f = await fixture(t, { extraMember });
    await assert.rejects(readWorkbenchAuthorEvidence(f), /WORKBENCH_AUTHOR_ARCHIVE_(PATH|SPECIAL)/);
    const archiveBytes = await readFile(f.archivePath);
    for (const flags of [[], ['-O']]) assert.throws(() => execFileSync(python,
      ['-I', '-B', ...flags, join(root, 'scripts/ci/read-workbench-author-evidence.py'), JSON.stringify(f.lock.files)],
      { input: archiveBytes, stdio: ['pipe', 'pipe', 'pipe'] }), /WORKBENCH_AUTHOR_ARCHIVE_(PATH|SPECIAL)/);
    await assert.rejects(access(join(f.directory, 'escape')), { code: 'ENOENT' });
  }
});

test('fixed author evidence binds all three current formal package identities', async t => {
  const evidence = await readWorkbenchAuthorEvidence(await fixture(t));
  const row = { id: '@shine-mage/dsh-analytics-workbench-b0', manifestSha256: evidence.formal_manifest_sha256,
    receipt: { source_sha: evidence.source_sha, tarball: { sha256: evidence.formal_tarball_sha256 } } };
  assert.equal(bindWorkbenchAuthorEvidence(evidence, { plugins: [row] }), evidence);
  for (const [mutate, code] of [
    [r => { r.receipt.source_sha = 'f'.repeat(40); }, /WORKBENCH_AUTHOR_PACK_SOURCE/],
    [r => { r.manifestSha256 = '0'.repeat(64); }, /WORKBENCH_AUTHOR_PACK_MANIFEST/],
    [r => { r.receipt.tarball.sha256 = '0'.repeat(64); }, /WORKBENCH_AUTHOR_PACK_TARBALL/],
  ]) {
    const changed = structuredClone(row); mutate(changed);
    assert.throws(() => bindWorkbenchAuthorEvidence(evidence, { plugins: [changed] }), code);
  }
  assert.throws(() => bindWorkbenchAuthorEvidence(evidence, { plugins: [row, row] }), /WORKBENCH_AUTHOR_PACK_REQUIRED/);
});

test('remote acquisition without an explicit token creates no output and invokes no gh', async t => {
  const f = await fixture(t), output = join(f.directory, 'receive');
  assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/ci/workbench-author-evidence.mjs'),
    '--output', output, '--python', python], { env: { ...process.env, GH_TOKEN: '', PATH: '/nonexistent' }, stdio: ['ignore', 'pipe', 'pipe'] }),
  /WORKBENCH_AUTHOR_AUTH_REQUIRED/);
  await assert.rejects(access(output), { code: 'ENOENT' });
});
