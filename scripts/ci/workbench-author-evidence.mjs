/** Fixed Workbench author CI input. No plugin source, SDK install or service startup. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const defaultLock = join(root, 'config/workbench-author-evidence.lock.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packageId = '@shine-mage/dsh-analytics-workbench-b0';

function validateLock(lock) {
  assert.equal(lock.schema, 'shinemage-workbench-author-evidence/v1', 'WORKBENCH_AUTHOR_LOCK_SCHEMA');
  assert.equal(lock.package, packageId, 'WORKBENCH_AUTHOR_LOCK_PACKAGE');
  assert.equal(lock.release_ready, false, 'WORKBENCH_AUTHOR_LOCK_RELEASE_BOUNDARY');
  assert.match(lock.source_sha, /^[a-f0-9]{40}$/, 'WORKBENCH_AUTHOR_SOURCE');
  for (const digest of [lock.formal_manifest_sha256, lock.formal_tarball_sha256, lock.archive.sha256]) {
    assert.match(digest, /^[a-f0-9]{64}$/, 'WORKBENCH_AUTHOR_LOCK_DIGEST');
  }
  assert.equal(lock.archive.repository, 'tyuanww/dsh-analytics-workbench', 'WORKBENCH_AUTHOR_REPOSITORY');
  assert.equal(lock.archive.event, 'pull_request', 'WORKBENCH_AUTHOR_EVENT');
  for (const name of ['artifact_id', 'run_id', 'bytes']) assert.ok(Number.isSafeInteger(lock.archive[name]) && lock.archive[name] > 0, 'WORKBENCH_AUTHOR_ARCHIVE_ID');
  assert.ok(lock.archive.bytes <= 4 * 1024 * 1024, 'WORKBENCH_AUTHOR_ARCHIVE_SIZE');
  for (const name of ['files', 'tests', 'pass']) assert.ok(Number.isSafeInteger(lock.core[name]) && lock.core[name] > 0, 'WORKBENCH_AUTHOR_CORE_COUNT');
  assert.equal(lock.core.tests, lock.core.pass, 'WORKBENCH_AUTHOR_CORE_TOTAL');
  for (const name of ['fail', 'skipped', 'cancelled', 'todo', 'status']) assert.equal(lock.core[name], 0, 'WORKBENCH_AUTHOR_CORE_FAILED');
  assert.deepEqual(Object.keys(lock.files).sort(), ['content_pack', 'plan', 'result'], 'WORKBENCH_AUTHOR_LOCK_MEMBERS');
}

/** Relate author results to the strict reader's current formal package, not its name alone. */
export function bindWorkbenchAuthorEvidence(evidence, packs) {
  const rows = packs.plugins.filter(row => row.id === packageId);
  assert.equal(rows.length, 1, 'WORKBENCH_AUTHOR_PACK_REQUIRED');
  const [row] = rows;
  assert.equal(row.receipt.source_sha, evidence.source_sha, 'WORKBENCH_AUTHOR_PACK_SOURCE');
  assert.equal(row.manifestSha256, evidence.formal_manifest_sha256, 'WORKBENCH_AUTHOR_PACK_MANIFEST');
  assert.equal(row.receipt.tarball.sha256, evidence.formal_tarball_sha256, 'WORKBENCH_AUTHOR_PACK_TARBALL');
  return evidence;
}

export async function readWorkbenchAuthorEvidence({ archivePath, python, lockPath = defaultLock } = {}) {
  assert.ok(isAbsolute(archivePath ?? ''), 'WORKBENCH_AUTHOR_ARCHIVE_REQUIRED');
  assert.ok(isAbsolute(python ?? ''), 'WORKBENCH_AUTHOR_PYTHON_REQUIRED');
  const info = await lstat(archivePath);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 4 * 1024 * 1024, 'WORKBENCH_AUTHOR_ARCHIVE_FILE');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  validateLock(lock);
  const bytes = await readFile(archivePath);
  assert.equal(bytes.length, lock.archive.bytes, 'WORKBENCH_AUTHOR_ARCHIVE_BYTES');
  assert.equal(hash(bytes), lock.archive.sha256, 'WORKBENCH_AUTHOR_ARCHIVE_DIGEST');
  const decoded = JSON.parse(execFileSync(python, ['-I', '-B', join(root, 'scripts/ci/read-workbench-author-evidence.py'), JSON.stringify(lock.files)], {
    input: bytes, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
  }));
  const { plan, result } = decoded;
  assert.equal(plan.stage, 'core', 'WORKBENCH_AUTHOR_PLAN_STAGE');
  assert.ok(Array.isArray(plan.files) && plan.files.length === lock.core.files, 'WORKBENCH_AUTHOR_PLAN_COUNT');
  assert.equal(new Set(plan.files).size, plan.files.length, 'WORKBENCH_AUTHOR_PLAN_DUPLICATE');
  for (const path of plan.files) {
    assert.match(path, /^(src|test|tests)\/[A-Za-z0-9_./-]+\.test\.mjs$/, 'WORKBENCH_AUTHOR_TEST_PATH');
    assert.ok(!path.split('/').includes('..'), 'WORKBENCH_AUTHOR_TEST_PATH');
  }
  assert.equal(result.schema, 'workbench-author-test-result/v1', 'WORKBENCH_AUTHOR_RESULT_SCHEMA');
  assert.equal(result.stage, 'core', 'WORKBENCH_AUTHOR_RESULT_STAGE');
  for (const [name, value] of Object.entries(lock.core)) assert.equal(result[name], value, `WORKBENCH_AUTHOR_RESULT_${name}`);
  assert.equal(result.pass, result.tests, 'WORKBENCH_AUTHOR_RESULT_TOTAL');
  assert.equal(result.release_ready, false, 'WORKBENCH_AUTHOR_RELEASE_BOUNDARY');
  assert.deepEqual(result.remaining_stages, ['browser', 'standalone'].map(stage => ({ stage, status: 'NOT_RUN_BY_THIS_COMMAND' })), 'WORKBENCH_AUTHOR_OPT_IN_BOUNDARY');
  assert.deepEqual(result.main_owned_checks, plan.main_owned_checks, 'WORKBENCH_AUTHOR_MAIN_OWNERS');
  assert.equal(result.main_owned_checks.length, 3, 'WORKBENCH_AUTHOR_MAIN_OWNERS');
  return { schema: 'shinemage-workbench-author-validation/v1', source_sha: lock.source_sha,
    formal_manifest_sha256: lock.formal_manifest_sha256, formal_tarball_sha256: lock.formal_tarball_sha256,
    archive: { ...lock.archive, path: archivePath }, core: lock.core, core_files: [...plan.files], main_owned_checks: lock.main_owned_checks,
    remaining_stages: result.remaining_stages, acquisition: 'fixed GitHub CI archive, exact SHA-256 and member digests',
    source_execution_here: 'NOT_RUN_AUTHOR_OWNED', host_service_admission: 'NOT_RUN', release_ready: false };
}

export async function prepareWorkbenchAuthorEvidence({ output, python, githubEnv } = {}) {
  assert.ok(isAbsolute(output ?? ''), 'WORKBENCH_AUTHOR_OUTPUT_REQUIRED');
  assert.ok(isAbsolute(python ?? ''), 'WORKBENCH_AUTHOR_PYTHON_REQUIRED');
  if (githubEnv !== undefined) assert.ok(isAbsolute(githubEnv), 'WORKBENCH_AUTHOR_GITHUB_ENV_REQUIRED');
  assert.ok(!/[\r\n]/.test(output), 'WORKBENCH_AUTHOR_OUTPUT_REQUIRED');
  assert.ok(process.env.GH_TOKEN, 'WORKBENCH_AUTHOR_AUTH_REQUIRED');
  const lock = JSON.parse(await readFile(defaultLock, 'utf8'));
  validateLock(lock);
  await mkdir(output, { mode: 0o700 });
  const run = JSON.parse(execFileSync('gh', ['api', `repos/${lock.archive.repository}/actions/runs/${lock.archive.run_id}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024 }));
  assert.equal(run.head_sha, lock.source_sha, 'WORKBENCH_AUTHOR_RUN_SOURCE');
  assert.equal(run.event, lock.archive.event, 'WORKBENCH_AUTHOR_RUN_EVENT');
  assert.equal(run.status, 'completed', 'WORKBENCH_AUTHOR_RUN_STATUS');
  assert.equal(run.conclusion, 'success', 'WORKBENCH_AUTHOR_RUN_CONCLUSION');
  const artifact = JSON.parse(execFileSync('gh', ['api', `repos/${lock.archive.repository}/actions/artifacts/${lock.archive.artifact_id}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024 }));
  assert.equal(artifact.id, lock.archive.artifact_id, 'WORKBENCH_AUTHOR_ARTIFACT_ID');
  assert.equal(artifact.expired, false, 'WORKBENCH_AUTHOR_ARTIFACT_EXPIRED');
  assert.equal(artifact.workflow_run.id, lock.archive.run_id, 'WORKBENCH_AUTHOR_RUN_ID');
  assert.equal(artifact.workflow_run.head_sha, lock.source_sha, 'WORKBENCH_AUTHOR_RUN_SOURCE');
  assert.equal(artifact.digest, `sha256:${lock.archive.sha256}`, 'WORKBENCH_AUTHOR_REMOTE_DIGEST');
  assert.equal(artifact.size_in_bytes, lock.archive.bytes, 'WORKBENCH_AUTHOR_REMOTE_BYTES');
  const bytes = execFileSync('gh', ['api', `repos/${lock.archive.repository}/actions/artifacts/${lock.archive.artifact_id}/zip`], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const archivePath = join(output, 'author-ci.zip');
  await writeFile(archivePath, bytes, { flag: 'wx', mode: 0o600 });
  const result = await readWorkbenchAuthorEvidence({ archivePath, python });
  await writeFile(join(output, 'preparation.json'), JSON.stringify({ ...result, artifact }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (githubEnv) await appendFile(githubEnv, `WORKBENCH_AUTHOR_CI_ARCHIVE=${archivePath}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 4 || args.length === 6, 'WORKBENCH_AUTHOR_ARGUMENTS');
  assert.ok(args[0] === '--output' && args[2] === '--python' && (args.length === 4 || args[4] === '--github-env'), 'WORKBENCH_AUTHOR_ARGUMENTS');
  console.log(JSON.stringify(await prepareWorkbenchAuthorEvidence({ output: args[1], python: args[3], githubEnv: args[5] }), null, 2));
}
