/** Read actual domain owner CI coverage. No domain source, rebuild, install or host startup. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const defaultLock = join(root, 'config/domain-author-evidence.lock.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const pathPattern = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\\)[A-Za-z0-9_./-]+$/;
const groups = [
  { name: 'geometry', files: ['library/test/geometry.test.mjs'], tests: 28 },
  { name: 'producer-inputs', files: ['scripts/producer.test.mjs', 'scripts/build-input.test.mjs'], tests: 6 },
];
const memberKeys = ['package/package.json', 'package/lib/funnel.mjs', 'package/lib/waterfall.mjs',
  'package/lib/funnel.d.mts', 'package/lib/waterfall.d.mts'];
const memberNames = ['receipt', 'geometry_stdout', 'geometry_stderr', 'producer_stdout', 'producer_stderr', 'reference', 'content_pack'];

function descriptor(row) {
  assert.match(row?.path ?? '', pathPattern, 'DOMAIN_AUTHOR_MEMBER_PATH');
  assert.match(row?.sha256 ?? '', hex, 'DOMAIN_AUTHOR_MEMBER_DIGEST');
  assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 1024 * 1024, 'DOMAIN_AUTHOR_MEMBER_SIZE');
}
function validateLock(lock) {
  assert.equal(lock.schema, 'shinemage-domain-author-evidence/v1', 'DOMAIN_AUTHOR_LOCK_SCHEMA');
  assert.equal(lock.package, '@shine-mage/board-components', 'DOMAIN_AUTHOR_LOCK_PACKAGE');
  assert.equal(lock.version, '0.1.0', 'DOMAIN_AUTHOR_LOCK_VERSION');
  assert.equal(lock.release_ready, false, 'DOMAIN_AUTHOR_RELEASE_BOUNDARY');
  assert.equal(lock.independent_tsc, 'NOT_IN_CURRENT_BUILD', 'DOMAIN_AUTHOR_TSC_BOUNDARY');
  assert.match(lock.source_sha ?? '', /^[a-f0-9]{40}$/, 'DOMAIN_AUTHOR_SOURCE');
  assert.equal(lock.source_files, 30, 'DOMAIN_AUTHOR_SOURCE_COUNT');
  assert.match(lock.source_inventory_sha256 ?? '', hex, 'DOMAIN_AUTHOR_SOURCE_INVENTORY');
  assert.equal(lock.archive.repository, 'tyuanww/shinemage-board-components', 'DOMAIN_AUTHOR_REPOSITORY');
  assert.equal(lock.archive.event, 'pull_request', 'DOMAIN_AUTHOR_EVENT');
  assert.equal(lock.archive.conclusion, 'success', 'DOMAIN_AUTHOR_RUN_CONCLUSION');
  for (const key of ['run_id', 'attempt', 'artifact_id', 'bytes']) {
    assert.ok(Number.isSafeInteger(lock.archive[key]) && lock.archive[key] > 0, 'DOMAIN_AUTHOR_ARCHIVE_ID');
  }
  assert.ok(lock.archive.bytes <= 4 * 1024 * 1024, 'DOMAIN_AUTHOR_ARCHIVE_SIZE');
  assert.match(lock.archive.sha256 ?? '', hex, 'DOMAIN_AUTHOR_ARCHIVE_DIGEST');
  assert.deepEqual(Object.keys(lock.files).sort(), [...memberNames].sort(), 'DOMAIN_AUTHOR_MEMBER_SELECTION');
  for (const row of Object.values(lock.files)) descriptor(row);
  assert.equal(new Set(Object.values(lock.files).map(row => row.path)).size, memberNames.length, 'DOMAIN_AUTHOR_MEMBER_DUPLICATE');
  assert.deepEqual(Object.keys(lock.members).sort(), [...memberKeys].sort(), 'DOMAIN_AUTHOR_LIBRARY_ENTRIES');
  for (const row of Object.values(lock.members)) {
    assert.match(row.sha256 ?? '', hex, 'DOMAIN_AUTHOR_LIBRARY_DIGEST');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 256 * 1024, 'DOMAIN_AUTHOR_LIBRARY_SIZE');
  }
  assert.equal(lock.reference.package, lock.package, 'DOMAIN_AUTHOR_REFERENCE_PACKAGE');
  assert.equal(lock.reference.version, lock.version, 'DOMAIN_AUTHOR_REFERENCE_VERSION');
  assert.equal(lock.reference.sha256, lock.files.reference.sha256, 'DOMAIN_AUTHOR_REFERENCE_DIGEST');
  assert.equal(lock.reference.bytes, lock.files.reference.bytes, 'DOMAIN_AUTHOR_REFERENCE_BYTES');
  assert.equal(lock.groups.length, groups.length, 'DOMAIN_AUTHOR_GROUPS');
  for (const [i, expected] of groups.entries()) {
    const group = lock.groups[i];
    assert.equal(group.name, expected.name, 'DOMAIN_AUTHOR_GROUP_NAME');
    assert.deepEqual(group.command, ['--test', '--test-reporter=tap', '--test-concurrency=1', ...expected.files], 'DOMAIN_AUTHOR_GROUP_COMMAND');
    assert.deepEqual(group.files.map(row => row.path), expected.files, 'DOMAIN_AUTHOR_GROUP_FILES');
    for (const row of group.files) descriptor(row);
    assert.equal(group.exit_code, 0, 'DOMAIN_AUTHOR_GROUP_EXIT');
    assert.deepEqual(group.counts, { tests: expected.tests, pass: expected.tests, fail: 0, cancelled: 0, skipped: 0, todo: 0 }, 'DOMAIN_AUTHOR_GROUP_COUNTS');
  }
}

function tapCounts(text, expected) {
  for (const [key, count] of Object.entries(expected)) {
    const matches = [...text.matchAll(new RegExp(`^# ${key} (\\d+)\r?$`, 'gm'))];
    assert.equal(matches.length, 1, 'DOMAIN_AUTHOR_TAP_SUMMARY');
    assert.equal(Number(matches[0][1]), count, 'DOMAIN_AUTHOR_TAP_COUNTS');
  }
}

export async function readDomainAuthorEvidence({ archivePath, python, lockPath = defaultLock } = {}) {
  assert.ok(isAbsolute(archivePath ?? ''), 'DOMAIN_AUTHOR_ARCHIVE_REQUIRED');
  assert.ok(isAbsolute(python ?? ''), 'DOMAIN_AUTHOR_PYTHON_REQUIRED');
  const lock = JSON.parse(await readFile(lockPath));
  validateLock(lock);
  const info = await lstat(archivePath);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 4 * 1024 * 1024, 'DOMAIN_AUTHOR_ARCHIVE_FILE');
  const bytes = await readFile(archivePath);
  assert.equal(bytes.length, lock.archive.bytes, 'DOMAIN_AUTHOR_ARCHIVE_BYTES');
  assert.equal(hash(bytes), lock.archive.sha256, 'DOMAIN_AUTHOR_ARCHIVE_DIGEST');
  const decoded = JSON.parse(execFileSync(python, ['-I', '-B', join(root, 'scripts/ci/read-domain-author-evidence.py'), JSON.stringify(lock.files)], {
    input: bytes, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
    env: { PATH: process.env.PATH, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
  }));
  const receipt = decoded.receipt;
  assert.equal(receipt.schema_version, 'board-components-author-evidence/v1', 'DOMAIN_AUTHOR_RECEIPT_SCHEMA');
  assert.equal(receipt.scope, 'AUTHOR_TESTS', 'DOMAIN_AUTHOR_SCOPE');
  assert.equal(receipt.source.sha, lock.source_sha, 'DOMAIN_AUTHOR_SOURCE');
  assert.equal(receipt.source.clean, true, 'DOMAIN_AUTHOR_SOURCE_DIRTY');
  assert.equal(receipt.source.files.length, lock.source_files, 'DOMAIN_AUTHOR_SOURCE_COUNT');
  assert.equal(new Set(receipt.source.files.map(row => row.path)).size, lock.source_files, 'DOMAIN_AUTHOR_SOURCE_DUPLICATE');
  for (const row of receipt.source.files) descriptor(row);
  assert.equal(hash(JSON.stringify(receipt.source.files)), lock.source_inventory_sha256, 'DOMAIN_AUTHOR_SOURCE_INVENTORY');
  assert.deepEqual(receipt.environment, { node: '24.19.0', platform: 'linux', arch: 'x64', github: {
    repository: lock.archive.repository, run_id: lock.archive.run_id, attempt: lock.archive.attempt,
    workflow_conclusion: 'NOT_VERIFIED_BY_JOB',
  } }, 'DOMAIN_AUTHOR_ENVIRONMENT');
  assert.deepEqual(receipt.groups, lock.groups, 'DOMAIN_AUTHOR_GROUP_BINDING');
  for (const [i, group] of receipt.groups.entries()) {
    assert.deepEqual(group.files, groups[i].files.map(path => receipt.source.files.find(row => row.path === path)), 'DOMAIN_AUTHOR_TEST_SOURCE');
    const prefix = i === 0 ? 'geometry' : 'producer';
    for (const stream of ['stdout', 'stderr']) {
      const row = lock.files[`${prefix}_${stream}`];
      assert.equal(row.path.split('/').at(-1), group.logs[stream].path, 'DOMAIN_AUTHOR_LOG_PATH');
      assert.equal(row.sha256, group.logs[stream].sha256, 'DOMAIN_AUTHOR_LOG_DIGEST');
      assert.equal(row.bytes, group.logs[stream].bytes, 'DOMAIN_AUTHOR_LOG_BYTES');
    }
    tapCounts(decoded[`${prefix}_stdout`], group.counts);
  }
  assert.deepEqual(receipt.reference, { ...lock.reference, path: `reference/${lock.reference.tarball}` }, 'DOMAIN_AUTHOR_REFERENCE_BINDING');
  assert.deepEqual(decoded.reference, lock.members, 'DOMAIN_AUTHOR_REFERENCE_MEMBERS');
  assert.deepEqual(decoded.content_pack, lock.members, 'DOMAIN_AUTHOR_BUILT_MEMBERS');
  for (const name of memberKeys.filter(name => name.startsWith('package/lib/'))) {
    const source = receipt.source.files.find(row => row.path === `library/src/${name.slice('package/lib/'.length)}`);
    assert.equal(source?.sha256, lock.members[name].sha256, 'DOMAIN_AUTHOR_PUBLIC_SOURCE');
    assert.equal(source?.bytes, lock.members[name].bytes, 'DOMAIN_AUTHOR_PUBLIC_SOURCE');
  }
  assert.equal(receipt.independent_tsc, lock.independent_tsc, 'DOMAIN_AUTHOR_TSC_BOUNDARY');
  assert.equal(receipt.remote_ci, 'NOT_VERIFIED_BY_JOB', 'DOMAIN_AUTHOR_CI_BOUNDARY');
  assert.equal(receipt.release_ready, false, 'DOMAIN_AUTHOR_RELEASE_BOUNDARY');
  const referenceBytes = Buffer.from(decoded.reference_base64, 'base64');
  assert.equal(referenceBytes.length, lock.reference.bytes, 'DOMAIN_AUTHOR_REFERENCE_BYTES');
  assert.equal(hash(referenceBytes), lock.reference.sha256, 'DOMAIN_AUTHOR_REFERENCE_DIGEST');
  const evidence = { schema: 'shinemage-domain-author-validation/v1', package: lock.package, version: lock.version,
    source_sha: lock.source_sha, source_files: lock.source_files, archive: { ...lock.archive, path: archivePath },
    groups: lock.groups, reference: lock.reference, members: lock.members,
    source_execution_here: 'NOT_RUN_AUTHOR_OWNED', independent_tsc: lock.independent_tsc,
    current_candidate_host_service_admission: 'NOT_RUN', release_ready: false };
  Object.defineProperty(evidence, 'referenceBytes', { value: referenceBytes });
  return evidence;
}

/** Keep the original reference input exact. A same-member rebuilt archive cannot replace it. */
export async function bindDomainPackageInput(evidence, inputPath) {
  assert.ok(isAbsolute(inputPath ?? ''), 'DOMAIN_AUTHOR_INPUT_REQUIRED');
  const info = await lstat(inputPath);
  assert.ok(info.isFile() && !info.isSymbolicLink(), 'DOMAIN_AUTHOR_INPUT_FILE');
  assert.equal(info.size, evidence.reference.bytes, 'DOMAIN_AUTHOR_INPUT_BYTES');
  const bytes = await readFile(inputPath);
  assert.equal(hash(bytes), evidence.reference.sha256, 'DOMAIN_AUTHOR_INPUT_DIGEST');
  return { ...evidence, package_input: { path: inputPath, sha256: hash(bytes), bytes: bytes.length } };
}

/** Download only the fixed CI artifact; keep original input bytes and job/API status distinct. */
export async function prepareDomainAuthorEvidence({ output, python, githubEnv } = {}) {
  assert.ok(isAbsolute(output ?? '') && !/[\x00-\x1f\x7f]/.test(output), 'DOMAIN_AUTHOR_OUTPUT_REQUIRED');
  assert.ok(isAbsolute(python ?? ''), 'DOMAIN_AUTHOR_PYTHON_REQUIRED');
  if (githubEnv !== undefined) assert.ok(isAbsolute(githubEnv) && !/[\r\n]/.test(githubEnv), 'DOMAIN_AUTHOR_GITHUB_ENV_REQUIRED');
  assert.ok(process.env.GH_TOKEN, 'DOMAIN_AUTHOR_AUTH_REQUIRED');
  const physical = join(await realpath(dirname(output)), resolve(output).split(sep).at(-1));
  const rest = relative(await realpath(root), physical);
  assert.ok(rest && (rest === '..' || rest.startsWith(`..${sep}`) || isAbsolute(rest)), 'DOMAIN_AUTHOR_OUTPUT_OUTSIDE_SOURCE');
  const existing = await lstat(physical).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  assert.ok(!existing, 'DOMAIN_AUTHOR_OUTPUT_EXISTS');
  const lock = JSON.parse(await readFile(defaultLock));
  validateLock(lock);
  const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024 }));
  const run = api(`repos/${lock.archive.repository}/actions/runs/${lock.archive.run_id}`);
  assert.equal(run.head_sha, lock.source_sha, 'DOMAIN_AUTHOR_RUN_SOURCE');
  assert.equal(run.event, lock.archive.event, 'DOMAIN_AUTHOR_RUN_EVENT');
  assert.equal(run.run_attempt, lock.archive.attempt, 'DOMAIN_AUTHOR_RUN_ATTEMPT');
  assert.equal(run.status, 'completed', 'DOMAIN_AUTHOR_RUN_STATUS');
  assert.equal(run.conclusion, lock.archive.conclusion, 'DOMAIN_AUTHOR_RUN_CONCLUSION');
  const artifact = api(`repos/${lock.archive.repository}/actions/artifacts/${lock.archive.artifact_id}`);
  assert.equal(artifact.id, lock.archive.artifact_id, 'DOMAIN_AUTHOR_ARTIFACT_ID');
  assert.equal(artifact.expired, false, 'DOMAIN_AUTHOR_ARTIFACT_EXPIRED');
  assert.equal(artifact.workflow_run.id, lock.archive.run_id, 'DOMAIN_AUTHOR_RUN_ID');
  assert.equal(artifact.workflow_run.head_sha, lock.source_sha, 'DOMAIN_AUTHOR_RUN_SOURCE');
  assert.equal(artifact.digest, `sha256:${lock.archive.sha256}`, 'DOMAIN_AUTHOR_REMOTE_DIGEST');
  assert.equal(artifact.size_in_bytes, lock.archive.bytes, 'DOMAIN_AUTHOR_REMOTE_BYTES');
  const bytes = execFileSync('gh', ['api', `repos/${lock.archive.repository}/actions/artifacts/${lock.archive.artifact_id}/zip`],
    { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(bytes.length, lock.archive.bytes, 'DOMAIN_AUTHOR_ARCHIVE_BYTES');
  assert.equal(hash(bytes), lock.archive.sha256, 'DOMAIN_AUTHOR_ARCHIVE_DIGEST');
  await mkdir(physical, { mode: 0o700 });
  const archivePath = join(physical, 'author-ci.zip');
  await writeFile(archivePath, bytes, { flag: 'wx', mode: 0o600 });
  const evidence = await readDomainAuthorEvidence({ archivePath, python });
  const inputs = join(physical, 'package-inputs'); await mkdir(inputs, { mode: 0o700 });
  const inputPath = join(inputs, evidence.reference.tarball);
  const referenceBytes = Buffer.from(evidence.referenceBytes);
  assert.equal(hash(referenceBytes), evidence.reference.sha256, 'DOMAIN_AUTHOR_REFERENCE_DIGEST');
  await writeFile(inputPath, referenceBytes, { flag: 'wx', mode: 0o600 });
  const bound = await bindDomainPackageInput(evidence, inputPath);
  await writeFile(join(physical, 'preparation.json'), JSON.stringify({ ...bound, artifact, remote_ci_api: 'success' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (githubEnv) await appendFile(githubEnv, `DOMAIN_AUTHOR_CI_ARCHIVE=${archivePath}\n`);
  return bound;
}

const invoked = process.argv[1] ? await realpath(process.argv[1]).catch(error => { if (error.code === 'ENOENT') return null; throw error; }) : null;
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
  const args = process.argv.slice(2);
  assert.ok((args.length === 4 || args.length === 6) && args[0] === '--output' && args[2] === '--python'
    && (args.length === 4 || args[4] === '--github-env'), 'DOMAIN_AUTHOR_ARGUMENTS');
  console.log(JSON.stringify(await prepareDomainAuthorEvidence({ output: args[1], python: args[3], githubEnv: args[5] }), null, 2));
}
