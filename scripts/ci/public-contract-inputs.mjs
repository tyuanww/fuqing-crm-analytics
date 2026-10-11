/** Fixed author compiler materials. No plugin source, install, runtime or SDK audit. */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const defaultLock = join(repository, 'config/public-contract-inputs.lock.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const owners = { workbench: ['tyuanww/dsh-analytics-workbench', 'analytics-workbench', 28, 12],
  crm: ['tyuanww/dsh-crm-knowledge', 'crm-knowledge', 2, 12], brand: ['tyuanww/dsh-shine-brand', 'shine-brand', 1, 9] };
const generators = ['content-theme', 'cockpit-slot', 'run-kernel', 'query', 'query-run', 'analysis', 'cockpit',
  'first-purchase', 'first-purchase-analysis', 'first-purchase-cockpit', 'competition-c0', 'competition-chart',
  'competition-computed', 'board-spec', 'page'].map(name => `scripts/dsh-b0/${name}-contract.mjs`);
const pathPattern = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\\)[A-Za-z0-9_./-]+$/;
const hex = /^[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
function descriptor(row) {
  assert.match(row?.sha256 ?? '', hex, 'PUBLIC_CONTRACT_DIGEST');
  assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 512 * 1024, 'PUBLIC_CONTRACT_BYTES');
}
function material(row, domain) {
  descriptor(row);
  assert.match(row.source_path ?? '', pathPattern, 'PUBLIC_CONTRACT_SOURCE_PATH');
  assert.ok(row.source_path.startsWith('plugin/'), 'PUBLIC_CONTRACT_SOURCE_PATH');
  assert.equal(row.main_path, `dsh-plugins/${domain}/${row.source_path.slice(7)}`, 'PUBLIC_CONTRACT_PROJECTION');
  assert.match(row.git_blob ?? '', sha, 'PUBLIC_CONTRACT_GIT_BLOB');
  const endings = { schema: /\.json$/, generated_type: /\.generated\.d\.ts$/, generated_constant: /\.generated\.ts$/,
    compiler_assertion: /(?:\.typecheck\.ts|\/run-contract\.typecheck\.ts)$/, frozen_fixture: /\/c0-fixtures\.mjs$/,
    api_declaration: /\/first-purchase-save-model\.d\.mts$/, catalog: /\/board-spec\/component-catalog\.json$/ };
  assert.ok(endings[row.kind]?.test(row.source_path), 'PUBLIC_CONTRACT_MATERIAL_KIND');
}
export function validatePublicContractLock(lock) {
  assert.equal(lock.schema, 'shinemage-public-contract-inputs-lock/v1', 'PUBLIC_CONTRACT_LOCK_SCHEMA');
  assert.equal(lock.release_ready, false, 'PUBLIC_CONTRACT_RELEASE_BOUNDARY');
  assert.deepEqual(Object.keys(lock.owners).sort(), Object.keys(owners).sort(), 'PUBLIC_CONTRACT_OWNERS');
  for (const [name, [repo, domain, count, tests]] of Object.entries(owners)) {
    const owner = lock.owners[name];
    assert.equal(owner.package, name === 'workbench' ? '@shine-mage/dsh-analytics-workbench-b0' : `@shine-mage/dsh-${domain}`, 'PUBLIC_CONTRACT_PACKAGE');
    assert.equal(owner.version, name === 'crm' ? '0.0.0-crm.1' : '0.0.0-b0', 'PUBLIC_CONTRACT_VERSION');
    assert.match(owner.source_sha ?? '', sha, 'PUBLIC_CONTRACT_SOURCE_SHA');
    assert.match(owner.ci_job_sha ?? '', sha, 'PUBLIC_CONTRACT_JOB_SHA');
    assert.equal(owner.archive.repository, repo, 'PUBLIC_CONTRACT_REPOSITORY');
    assert.equal(owner.archive.event, 'pull_request', 'PUBLIC_CONTRACT_EVENT');
    assert.equal(owner.archive.conclusion, 'success', 'PUBLIC_CONTRACT_CONCLUSION');
    for (const key of ['run_id', 'attempt', 'artifact_id']) assert.ok(Number.isSafeInteger(owner.archive[key]) && owner.archive[key] > 0, 'PUBLIC_CONTRACT_ID');
    assert.equal(owner.archive.name, `public-contracts-${owner.archive.run_id}-${owner.archive.attempt}`, 'PUBLIC_CONTRACT_ARTIFACT_NAME');
    descriptor(owner.archive); descriptor(owner.manifest);
    assert.ok(owner.manifest.bytes <= 64 * 1024, 'PUBLIC_CONTRACT_MANIFEST_SIZE');
    for (const key of ['producer_sha256', 'recipe_sha256', 'package_manifest_sha256']) assert.match(owner[key] ?? '', hex, 'PUBLIC_CONTRACT_PRODUCER');
    assert.equal(owner.owned_increment_tests, tests, 'PUBLIC_CONTRACT_TEST_SCOPE');
    assert.equal(owner.files.length, count, 'PUBLIC_CONTRACT_MATERIAL_COUNT');
    assert.equal(new Set(owner.files.map(row => row.source_path)).size, count, 'PUBLIC_CONTRACT_SOURCE_DUPLICATE');
    for (const row of owner.files) material(row, domain);
    assert.equal(owner.input_bytes, owner.files.reduce((total, row) => total + row.bytes, 0), 'PUBLIC_CONTRACT_INPUT_BYTES');
  }
  const projections = Object.values(lock.owners).flatMap(owner => owner.files.map(row => row.main_path));
  assert.equal(new Set(projections).size, 31, 'PUBLIC_CONTRACT_PROJECTION_DUPLICATE');
  assert.deepEqual(lock.generators.map(row => row.path), generators, 'PUBLIC_CONTRACT_GENERATORS');
  for (const row of lock.generators) assert.match(row.sha256 ?? '', hex, 'PUBLIC_CONTRACT_GENERATOR_SHA');
  assert.ok(Array.isArray(lock.canonical_sources) && lock.canonical_sources.length <= 256, 'PUBLIC_CONTRACT_CANONICAL_COUNT');
  assert.equal(new Set(lock.canonical_sources).size, lock.canonical_sources.length, 'PUBLIC_CONTRACT_CANONICAL_DUPLICATE');
  for (const path of lock.canonical_sources) {
    assert.match(path, pathPattern, 'PUBLIC_CONTRACT_CANONICAL_PATH');
    assert.ok((path.startsWith('backend/') && /\.(py|json)$/.test(path))
      || path.startsWith('docs/hackathon/parallel-competition-2026-09-09/contracts/')
      || generators.includes(path) || ['scripts/dsh-b0/content-theme-contract.test.mjs', 'scripts/dsh-b0/cockpit-slot-contract.test.mjs'].includes(path),
    'PUBLIC_CONTRACT_CANONICAL_OWNER');
  }
  for (const path of [...generators, 'scripts/dsh-b0/content-theme-contract.test.mjs', 'scripts/dsh-b0/cockpit-slot-contract.test.mjs', 'backend/contracts/tests/test_competition_c0.py'])
    assert.ok(lock.canonical_sources.includes(path), 'PUBLIC_CONTRACT_CANONICAL_REQUIRED');
  return lock;
}
export async function boundedContractFile(path, maximum) {
  assert.ok(isAbsolute(path ?? ''), 'PUBLIC_CONTRACT_ABSOLUTE_FILE');
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await fd.stat();
    assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= maximum, 'PUBLIC_CONTRACT_REGULAR_FILE');
    // Do not let a concurrent file growth turn a checked size into an unbounded read.
    const buffer = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await fd.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    const after = await fd.stat();
    assert.ok(used === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs,
      'PUBLIC_CONTRACT_FILE_CHANGED');
    return buffer.subarray(0, used);
  } finally { await fd.close(); }
}
export async function readPublicContractInputs({ inputsPath, python, lockPath = defaultLock } = {}) {
  assert.ok(isAbsolute(python ?? ''), 'PUBLIC_CONTRACT_PYTHON_REQUIRED');
  const lock = validatePublicContractLock(JSON.parse(await boundedContractFile(lockPath, 128 * 1024)));
  const inputs = JSON.parse(await boundedContractFile(inputsPath, 16 * 1024));
  assert.equal(inputs.schema, 'shinemage-public-contract-inputs/v1', 'PUBLIC_CONTRACT_INPUT_SCHEMA');
  assert.deepEqual(Object.keys(inputs.archives).sort(), Object.keys(owners).sort(), 'PUBLIC_CONTRACT_INPUT_OWNERS');
  const materials = new Map(), bindings = {};
  for (const [name, owner] of Object.entries(lock.owners)) {
    const bytes = await boundedContractFile(inputs.archives[name], 4 * 1024 * 1024);
    assert.equal(bytes.length, owner.archive.bytes, 'PUBLIC_CONTRACT_ARCHIVE_BYTES');
    assert.equal(hash(bytes), owner.archive.sha256, 'PUBLIC_CONTRACT_ARCHIVE_DIGEST');
    const expected = { 'manifest.json': owner.manifest };
    for (const row of owner.files) expected[`contracts/${row.source_path}`] = row;
    // Keep the bounded ZIP pipe asynchronous; the helper only inspects bytes and
    // never executes members or starts descendants. Preserve its actual error.
    const decoded = JSON.parse(await new Promise((resolveOutput, rejectOutput) => {
      let inputError;
      const child = execFile(python, ['-I', '-B', join(repository, 'scripts/ci/read-public-contract-inputs.py'), JSON.stringify(expected)],
        { encoding: 'utf8', timeout: 15000, maxBuffer: 3 * 1024 * 1024,
          env: { PATH: process.env.PATH, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' } },
        (error, stdout) => error || inputError ? rejectOutput(error ?? inputError) : resolveOutput(stdout));
      child.stdin.once('error', error => { inputError = error; child.kill(); });
      child.stdin.end(bytes);
    }));
    const manifest = JSON.parse(Buffer.from(decoded['manifest.json'], 'base64'));
    assert.equal(manifest.schema, 'shinemage-public-contract-inputs/v1', 'PUBLIC_CONTRACT_MANIFEST_SCHEMA');
    assert.equal(manifest.source_sha, owner.source_sha, 'PUBLIC_CONTRACT_MANIFEST_SOURCE');
    assert.equal(manifest.repository, owner.archive.repository, 'PUBLIC_CONTRACT_MANIFEST_REPOSITORY');
    assert.equal(manifest.ci_job_sha, owner.ci_job_sha, 'PUBLIC_CONTRACT_MANIFEST_JOB');
    assert.equal(manifest.source_clean, true, 'PUBLIC_CONTRACT_SOURCE_DIRTY');
    assert.equal(manifest.producer_committed, true, 'PUBLIC_CONTRACT_PRODUCER_NOT_COMMITTED');
    assert.equal(manifest.execution, 'CI_JOB_CONTEXT_NOT_EXTERNALLY_VERIFIED', 'PUBLIC_CONTRACT_EXECUTION');
    assert.equal(manifest.remote_ci, 'NOT_VERIFIED_BY_JOB', 'PUBLIC_CONTRACT_CI_BOUNDARY');
    assert.equal(manifest.host_admission, 'NOT_RUN', 'PUBLIC_CONTRACT_HOST_BOUNDARY');
    assert.equal(manifest.release_ready, false, 'PUBLIC_CONTRACT_RELEASE_BOUNDARY');
    for (const key of ['package', 'version', 'producer_sha256', 'recipe_sha256', 'package_manifest_sha256', 'input_bytes']) assert.equal(manifest[key], owner[key], 'PUBLIC_CONTRACT_MANIFEST_BINDING');
    assert.deepEqual(manifest.files, owner.files, 'PUBLIC_CONTRACT_MANIFEST_FILES');
    for (const row of owner.files) materials.set(row.main_path, Buffer.from(decoded[`contracts/${row.source_path}`], 'base64'));
    bindings[name] = { source_sha: owner.source_sha, archive: owner.archive, manifest_sha256: owner.manifest.sha256,
      files: owner.files.length, input_bytes: owner.input_bytes, author_owned_increment_tests: owner.owned_increment_tests };
  }
  const evidence = { schema: 'shinemage-public-contract-input-validation/v1', owners: bindings,
    source_execution_here: 'NOT_RUN_AUTHOR_OWNED', remote_ci_here: 'LOCKED_SOURCE_API_NOT_RECHECKED', host_admission: 'NOT_RUN', release_ready: false };
  Object.defineProperties(evidence, { materials: { value: materials }, lock: { value: lock } });
  return evidence;
}
export async function appendContractEnvironment(path, inputsPath) {
  assert.ok(isAbsolute(path ?? '') && isAbsolute(inputsPath ?? '') && !/[\x00-\x1f\x7f]/.test(path + inputsPath), 'PUBLIC_CONTRACT_ENV_PATH');
  const physical = join(await realpath(dirname(path)), resolve(path).split(sep).at(-1));
  const rest = relative(await realpath(repository), physical);
  assert.ok(rest && (rest === '..' || rest.startsWith(`..${sep}`) || isAbsolute(rest)), 'PUBLIC_CONTRACT_ENV_OUTSIDE_SOURCE');
  const fd = await open(physical, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_CREAT, 0o600);
  try {
    const info = await fd.stat();
    assert.ok(info.isFile() && info.nlink === 1 && info.size <= 1024 * 1024, 'PUBLIC_CONTRACT_ENV_REGULAR_FILE');
    await fd.writeFile(`PUBLIC_CONTRACT_INPUTS=${inputsPath}\n`);
  } finally { await fd.close(); }
}
export async function preparePublicContractInputs({ output, python, githubEnv } = {}) {
  assert.ok(isAbsolute(output ?? '') && !/[\x00-\x1f\x7f]/.test(output), 'PUBLIC_CONTRACT_OUTPUT_REQUIRED');
  assert.ok(isAbsolute(python ?? ''), 'PUBLIC_CONTRACT_PYTHON_REQUIRED');
  if (githubEnv) assert.ok(isAbsolute(githubEnv) && !/[\r\n]/.test(githubEnv), 'PUBLIC_CONTRACT_ENV_PATH');
  assert.ok(process.env.GH_TOKEN, 'PUBLIC_CONTRACT_AUTH_REQUIRED');
  const lock = validatePublicContractLock(JSON.parse(await boundedContractFile(defaultLock, 128 * 1024)));
  const target = join(await realpath(dirname(output)), resolve(output).split(sep).at(-1));
  const rest = relative(await realpath(repository), target);
  assert.ok(rest && (rest === '..' || rest.startsWith(`..${sep}`) || isAbsolute(rest)), 'PUBLIC_CONTRACT_OUTPUT_OUTSIDE_SOURCE');
  assert.ok(!(await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; })), 'PUBLIC_CONTRACT_OUTPUT_EXISTS');
  const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', timeout: 30000, maxBuffer: 512 * 1024 }));
  const archives = {}, observed = {};
  for (const [name, owner] of Object.entries(lock.owners)) {
    const prefix = `repos/${owner.archive.repository}`;
    const run = api(`${prefix}/actions/runs/${owner.archive.run_id}`);
    assert.equal(run.id, owner.archive.run_id, 'PUBLIC_CONTRACT_RUN_ID');
    assert.equal(run.head_sha, owner.source_sha, 'PUBLIC_CONTRACT_RUN_SOURCE');
    assert.equal(run.event, owner.archive.event, 'PUBLIC_CONTRACT_RUN_EVENT');
    assert.equal(run.run_attempt, owner.archive.attempt, 'PUBLIC_CONTRACT_RUN_ATTEMPT');
    assert.equal(run.status, 'completed', 'PUBLIC_CONTRACT_RUN_STATUS');
    assert.equal(run.conclusion, 'success', 'PUBLIC_CONTRACT_RUN_CONCLUSION');
    const artifact = api(`${prefix}/actions/artifacts/${owner.archive.artifact_id}`);
    assert.equal(artifact.id, owner.archive.artifact_id, 'PUBLIC_CONTRACT_ARTIFACT_ID');
    assert.equal(artifact.expired, false, 'PUBLIC_CONTRACT_ARTIFACT_EXPIRED');
    assert.equal(artifact.name, owner.archive.name, 'PUBLIC_CONTRACT_ARTIFACT_NAME');
    assert.equal(artifact.workflow_run.id, owner.archive.run_id, 'PUBLIC_CONTRACT_ARTIFACT_RUN');
    assert.equal(artifact.workflow_run.head_sha, owner.source_sha, 'PUBLIC_CONTRACT_ARTIFACT_SOURCE');
    assert.equal(artifact.size_in_bytes, owner.archive.bytes, 'PUBLIC_CONTRACT_API_BYTES');
    assert.equal(artifact.digest, `sha256:${owner.archive.sha256}`, 'PUBLIC_CONTRACT_API_DIGEST');
    const job = api(`${prefix}/git/commits/${owner.ci_job_sha}`);
    assert.ok(job.sha === owner.source_sha || job.parents.some(row => row.sha === owner.source_sha), 'PUBLIC_CONTRACT_JOB_SOURCE');
    const jobs = api(`${prefix}/actions/runs/${owner.archive.run_id}/jobs?per_page=100`);
    assert.equal(jobs.total_count, 1, 'PUBLIC_CONTRACT_JOB_COUNT');
    assert.equal(jobs.jobs.length, 1, 'PUBLIC_CONTRACT_JOB_COUNT');
    assert.equal(jobs.jobs[0].conclusion, 'success', 'PUBLIC_CONTRACT_JOB_CONCLUSION');
    for (const name of ['Verify owned contract behavior and export guards', 'Export fixed public contract inputs from this clean commit', 'Retain exact public contract inputs'])
      assert.equal(jobs.jobs[0].steps.find(step => step.name === name)?.conclusion, 'success', 'PUBLIC_CONTRACT_OWNED_STEP');
    archives[name] = execFileSync('gh', ['api', `${prefix}/actions/artifacts/${owner.archive.artifact_id}/zip`], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(hash(archives[name]), owner.archive.sha256, 'PUBLIC_CONTRACT_DOWNLOAD_DIGEST');
    assert.equal(archives[name].length, owner.archive.bytes, 'PUBLIC_CONTRACT_DOWNLOAD_BYTES');
    observed[name] = { run_id: run.id, conclusion: run.conclusion, artifact_id: artifact.id, expires_at: artifact.expires_at };
  }
  await mkdir(target, { mode: 0o700 });
  const input = { schema: 'shinemage-public-contract-inputs/v1', archives: {} };
  for (const [name, bytes] of Object.entries(archives)) {
    input.archives[name] = join(target, `${name}.zip`);
    await writeFile(input.archives[name], bytes, { flag: 'wx', mode: 0o600 });
  }
  const inputsPath = join(target, 'inputs.json');
  await writeFile(inputsPath, JSON.stringify(input, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const evidence = await readPublicContractInputs({ inputsPath, python });
  await writeFile(join(target, 'preparation.json'), JSON.stringify({ ...evidence, actual_ci_api: observed }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (githubEnv) await appendContractEnvironment(githubEnv, inputsPath);
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.ok((args.length === 4 || args.length === 6) && args[0] === '--output' && args[2] === '--python'
    && (args.length === 4 || args[4] === '--github-env'), 'PUBLIC_CONTRACT_ARGUMENTS');
  console.log(JSON.stringify(await preparePublicContractInputs({ output: args[1], python: args[3], githubEnv: args[5] }), null, 2));
}
