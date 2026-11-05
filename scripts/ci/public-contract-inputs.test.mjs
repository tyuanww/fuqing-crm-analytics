import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, symlink, link, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendContractEnvironment, assertOwnerRunBinding, CONTRACT_PACKAGE, projectContractMaterial, readPublicContractInputs, validatePublicContractLock } from './public-contract-inputs.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const lockPath = join(root, 'config/public-contract-inputs.lock.json');
const lock = JSON.parse(await readFile(lockPath));
const inputsPath = process.env.PUBLIC_CONTRACT_INPUTS;
const python = process.env.FQ_B0_PYTHON;
const inputs = JSON.parse(await readFile(inputsPath));
async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'public-contract-guard-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
test('environment output cannot overwrite a source file', async () => {
  const before = await readFile(lockPath);
  await assert.rejects(() => appendContractEnvironment(lockPath, inputsPath), /PUBLIC_CONTRACT_ENV_OUTSIDE_SOURCE/);
  assert.deepEqual(await readFile(lockPath), before);
});
test('environment output refuses symlinks and hardlinks without changing their target', async t => {
  const target = await fixture(t), victim = join(target, 'victim'), alias = join(target, 'alias'), hard = join(target, 'hard');
  await writeFile(victim, 'keep'); await symlink(victim, alias);
  await assert.rejects(() => appendContractEnvironment(alias, inputsPath), /ELOOP/);
  await link(victim, hard);
  await assert.rejects(() => appendContractEnvironment(hard, inputsPath), /PUBLIC_CONTRACT_ENV_REGULAR_FILE/);
  assert.equal(await readFile(victim, 'utf8'), 'keep');
});
test('environment output appends only the validated absolute input path', async t => {
  const target = await fixture(t), path = join(target, 'env');
  await writeFile(path, 'PREVIOUS=keep\n');
  await appendContractEnvironment(path, inputsPath);
  assert.equal(await readFile(path, 'utf8'), `PREVIOUS=keep\nPUBLIC_CONTRACT_INPUTS=${inputsPath}\n`);
  await assert.rejects(() => appendContractEnvironment(path, '/tmp/injected\nOTHER=value'), /PUBLIC_CONTRACT_ENV_PATH/);
});
test('FIFO inputs and environment output fail promptly without blocking a worker', async t => {
  const target = await fixture(t), pipe = join(target, 'pipe');
  execFileSync('mkfifo', [pipe], { timeout: 3000 });
  const candidate = structuredClone(inputs); candidate.archives.workbench = pipe;
  const path = join(target, 'inputs.json'); await writeFile(path, JSON.stringify(candidate));
  await assert.rejects(() => readPublicContractInputs({ inputsPath: path, python, lockPath }), /PUBLIC_CONTRACT_REGULAR_FILE/);
  await assert.rejects(() => appendContractEnvironment(pipe, inputsPath), /ENXIO|PUBLIC_CONTRACT_ENV_REGULAR_FILE/);
});
test('three actual sealed CI archives provide all 31 fixed compiler materials', async () => {
  const evidence = await readPublicContractInputs({ inputsPath, python, lockPath });
  assert.equal(evidence.materials.size, 31);
  assert.deepEqual(Object.fromEntries(Object.entries(evidence.owners).map(([name, row]) => [name, row.files])), { workbench: 28, crm: 2, brand: 1 });
  assert.equal(evidence.remote_ci_here, 'LOCKED_SOURCE_API_NOT_RECHECKED');
  assert.equal(evidence.host_admission, 'NOT_RUN'); assert.equal(evidence.release_ready, false);
});
test('generated compiler materials stage into the owned contracts package', () => {
  const domains = { workbench: 'analytics-workbench', crm: 'crm-knowledge', brand: 'shine-brand' };
  const generated = new Set(['generated_type', 'generated_constant']);
  const legacy = new Set(['dsh-plugins/analytics-workbench/src/competition-c0-contract.generated.d.ts']);
  let projected = 0;
  for (const [name, owner] of Object.entries(lock.owners)) {
    for (const row of owner.files) {
      if (!generated.has(row.kind)) {
        assert.equal(projectContractMaterial(row.main_path), row.main_path, `PUBLIC_CONTRACT_PROJECTION ${row.main_path}`);
        continue;
      }
      if (legacy.has(row.main_path)) {
        assert.equal(projectContractMaterial(row.main_path), row.main_path);
        continue;
      }
      const staged = projectContractMaterial(row.main_path);
      assert.ok(staged.startsWith(`${CONTRACT_PACKAGE}/`), `PUBLIC_CONTRACT_PROJECTION ${staged}`);
      assert.ok(staged.endsWith(row.main_path.slice(row.main_path.indexOf('/src/') + '/src/'.length)));
      projected += 1;
    }
  }
  assert.equal(projected, 16);
});
test('missing absolute inputs never fall back to plugin source', async () => {
  await assert.rejects(() => readPublicContractInputs({ python, lockPath }), /PUBLIC_CONTRACT_ABSOLUTE_FILE/);
  await assert.rejects(() => readPublicContractInputs({ inputsPath, python: 'python', lockPath }), /PUBLIC_CONTRACT_PYTHON_REQUIRED/);
});
for (const [name, edit, error] of [
  ['cross-owner projection', x => { x.owners.crm.files[0].main_path = x.owners.workbench.files[0].main_path; }, /PUBLIC_CONTRACT_PROJECTION/],
  ['another package identity', x => { x.owners.crm.package = '@example/another'; }, /PUBLIC_CONTRACT_PACKAGE/],
  ['obsolete CRM package version', x => { x.owners.crm.version = '0.0.0-crm.1'; }, /PUBLIC_CONTRACT_VERSION/],
  ['private runtime material', x => { x.owners.workbench.files[0].kind = 'runtime'; }, /PUBLIC_CONTRACT_MATERIAL_KIND/],
  ['missing original generator', x => { x.generators.pop(); }, /PUBLIC_CONTRACT_GENERATORS/],
  ['missing C0 provenance input', x => { x.canonical_sources = x.canonical_sources.filter(p => p !== 'backend/contracts/tests/test_competition_c0.py'); }, /PUBLIC_CONTRACT_CANONICAL_REQUIRED/],
  ['canonical source outside main contract ownership', x => { x.canonical_sources.push('dsh-plugins/crm-knowledge/src/index.ts'); }, /PUBLIC_CONTRACT_CANONICAL_OWNER/],
]) test(`fixed input lock rejects ${name}`, () => {
  const candidate = structuredClone(lock); edit(candidate);
  assert.throws(() => validatePublicContractLock(candidate), error);
});
test('a different producer digest fails even when ZIP and member bytes match', async t => {
  const target = await fixture(t), candidate = structuredClone(lock);
  candidate.owners.workbench.producer_sha256 = '0'.repeat(64);
  const path = join(target, 'lock.json'); await writeFile(path, JSON.stringify(candidate));
  await assert.rejects(() => readPublicContractInputs({ inputsPath, python, lockPath: path }), /PUBLIC_CONTRACT_MANIFEST_BINDING/);
});
test('wrong archive bytes are refused without a source or network fallback', async t => {
  const target = await fixture(t), candidate = structuredClone(inputs);
  const archive = join(target, 'bad.zip');
  const bytes = await readFile(inputs.archives.workbench); bytes[0] ^= 1;
  await writeFile(archive, bytes); candidate.archives.workbench = archive;
  const path = join(target, 'input.json'); await writeFile(path, JSON.stringify(candidate));
  await assert.rejects(() => readPublicContractInputs({ inputsPath: path, python, lockPath }), /PUBLIC_CONTRACT_ARCHIVE_DIGEST/);
});
for (const kind of ['symlink', 'hardlink']) test(`archive ${kind} is refused`, async t => {
  const target = await fixture(t), source = join(target, 'source.zip'), alias = join(target, 'alias.zip');
  await copyFile(inputs.archives.workbench, source);
  await (kind === 'symlink' ? symlink(source, alias) : link(source, alias));
  const candidate = structuredClone(inputs); candidate.archives.workbench = alias;
  const path = join(target, 'input.json'); await writeFile(path, JSON.stringify(candidate));
  await assert.rejects(() => readPublicContractInputs({ inputsPath: path, python, lockPath }), /ELOOP|PUBLIC_CONTRACT_REGULAR_FILE/);
});
for (const [kind, error] of [['duplicate', /PUBLIC_CONTRACT_DUPLICATE/], ['traversal', /PUBLIC_CONTRACT_PATH/],
  ['private-file', /PUBLIC_CONTRACT_FILE_SET/], ['symlink', /PUBLIC_CONTRACT_SPECIAL/], ['expansion', /PUBLIC_CONTRACT_EXPANSION/]])
  test(`sealed ZIP reader rejects ${kind} even with matching outer digest`, async t => {
    const target = await fixture(t), archive = join(target, 'mutated.zip');
    execFileSync(python, ['-I', '-B', '-c', `import sys, zipfile, stat, copy
source, target, kind = sys.argv[1:]
with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as output:
    for row in original.infolist():
        data = original.read(row)
        row = copy.copy(row)
        if kind == 'symlink' and row.filename == 'manifest.json':
            row.external_attr = (stat.S_IFLNK | 0o777) << 16
        output.writestr(row, data)
    if kind == 'duplicate': output.writestr('manifest.json', original.read('manifest.json'))
    elif kind == 'traversal': output.writestr('../escape', b'x')
    elif kind == 'private-file': output.writestr('contracts/plugin/private-runtime.mjs', b'export default true;')
    elif kind == 'expansion': output.writestr('oversize', b'x' * (3 * 1024 * 1024))
`, inputs.archives.workbench, archive, kind], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000 });
    const candidateLock = structuredClone(lock), candidateInputs = structuredClone(inputs), bytes = await readFile(archive);
    candidateLock.owners.workbench.archive.sha256 = createHash('sha256').update(bytes).digest('hex');
    candidateLock.owners.workbench.archive.bytes = bytes.length; candidateInputs.archives.workbench = archive;
    const localLock = join(target, 'lock.json'), localInputs = join(target, 'inputs.json');
    await writeFile(localLock, JSON.stringify(candidateLock)); await writeFile(localInputs, JSON.stringify(candidateInputs));
    await assert.rejects(() => readPublicContractInputs({ inputsPath: localInputs, python, lockPath: localLock }), error);
  });

test('push evidence is admitted with the default branch, pull_request unchanged', () => {
  assert.equal(validatePublicContractLock(lock), lock);
  const pushed = structuredClone(lock);
  for (const owner of Object.values(pushed.owners)) { owner.archive.event = 'push'; owner.archive.head_branch = 'main'; }
  assert.equal(validatePublicContractLock(pushed), pushed);
  for (const [edit, error] of [
    [x => { x.owners.workbench.archive.event = 'merge'; }, /PUBLIC_CONTRACT_EVENT/],
    [x => { x.owners.workbench.archive.event = 'push'; delete x.owners.workbench.archive.head_branch; }, /PUBLIC_CONTRACT_PUSH_BRANCH/],
    [x => { x.owners.workbench.archive.event = 'push'; x.owners.workbench.archive.head_branch = 'release'; }, /PUBLIC_CONTRACT_PUSH_BRANCH/],
  ]) {
    const candidate = structuredClone(pushed); edit(candidate);
    assert.throws(() => validatePublicContractLock(candidate), error);
  }
});

const pushSource = '1'.repeat(40);
const fetched = overrides => ({ event: 'push', head_branch: 'main', head_sha: pushSource, ...overrides });
const owner = event => ({ source_sha: pushSource, archive: event === 'push' ? { event, head_branch: 'main' } : { event } });

test('a push run on the default branch at the locked source is accepted; pull_request keeps working', () => {
  assert.doesNotThrow(() => assertOwnerRunBinding(owner('push'), fetched()));
  assert.doesNotThrow(() => assertOwnerRunBinding(owner('pull_request'), fetched({ event: 'pull_request', head_branch: 'codex/author' })));
});

test('a push run describing a later main is rejected', () => {
  assert.throws(() => assertOwnerRunBinding(owner('push'), fetched({ head_sha: '2'.repeat(40) })), /PUBLIC_CONTRACT_RUN_SOURCE/);
});

test('a push run from a non-default branch or repository is rejected', () => {
  assert.throws(() => assertOwnerRunBinding(owner('push'), fetched({ head_branch: 'codex/author' })), /PUBLIC_CONTRACT_RUN_BRANCH/);
  assert.throws(() => assertOwnerRunBinding(owner('push'), fetched(), 'release'), /PUBLIC_CONTRACT_REPOSITORY_BRANCH/);
});

test('an event mismatch keeps the existing run event code', () => {
  assert.throws(() => assertOwnerRunBinding(owner('push'), fetched({ event: 'pull_request' })), /PUBLIC_CONTRACT_RUN_EVENT/);
  assert.throws(() => assertOwnerRunBinding(owner('pull_request'), fetched()), /PUBLIC_CONTRACT_RUN_EVENT/);
});
