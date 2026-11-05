#!/usr/bin/env node
/**
 * Reseal the sealed rc3 composition artifact after a dependency-lock change.
 *
 * PR #228 moved `starlette` 1.10 into `requirements-lock.txt` and the service
 * recipes while the B0 job was skipped (see PR #215). `main` merged green but
 * the sealed composition source still pinned 1.6.0, so the next B0 run failed
 * `SERVICE_SOURCE_TARGET_QUERY_LOCK` until #233 resealed by hand. This helper
 * performs that manual sequence deterministically and fails closed:
 *
 *   1. verify the checkout is the intended commit and has no tracked changes;
 *   2. run the service-manifest SSOT generator with --write and re-check;
 *   3. rebuild the dedicated sealing branch from the target commit and push it;
 *   4. wait for the push-triggered sealing workflow, verify the artifact;
 *   5. update the artifact lock and move RUNTIME_HOST_SOURCE to the sealed head;
 *   6. print every changed file and the old/new ids.
 *
 * Usage:
 *   node scripts/release/respin-composition-artifact.mjs
 *   node scripts/release/respin-composition-artifact.mjs --dry-run
 *   node scripts/release/respin-composition-artifact.mjs --check
 *
 * `--dry-run` stops after step 2 (read-only: it runs the generator's --check)
 * and prints the planned rewrite. `--check` verifies the checked-in lock/pin
 * state without mutating anything and without network access.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import {
  canonicalPackageName, parseLockPins, readDependencyClosure,
} from '../crm-calibration/service-manifest-pins.mjs';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const SEALING_BRANCH = 'codex/rc3-composition-artifact-20261024';
export const SEALING_WORKFLOW = '.github/workflows/rc3-composition-artifact.yml';
export const SEALED_DIR = '.ci/rc3-composition';
export const SEALED_SUMS = '.ci/rc3-composition.sha256';
export const SEALED_MEMBER_COUNT = 20;
export const ARTIFACT_LOCK = 'config/shinemage-composition-artifact.lock.json';
export const COMPOSITION_LOCK = 'config/shinemage-composition-packs.lock.json';
export const COMPOSITION_MANIFEST = 'config/shinemage-composition-pack-manifest.v1.json';
export const RUNTIME_HOST_SOURCE_PATH = 'scripts/release/runtime-host-evidence.mjs';
export const DEFAULT_REPOSITORY = 'tyuanww/fuqing-crm-analytics';
export const PIN_GENERATOR = fileURLToPath(new URL('../crm-calibration/service-manifest-pins.mjs', import.meta.url));
export const COMPOSITION_INPUTS = fileURLToPath(new URL('../ci/composition-pack-inputs.mjs', import.meta.url));

const CODE = 'RESPIN_';
const HEX64 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const ARTIFACT_KEYS = ['schema_version', 'repository', 'id', 'sha256', 'runId', 'headSha', 'composition_lock_sha256'];
const ARTIFACT_SCHEMA = 'dsh-composition-artifact/v1';
const RUNTIME_SOURCE_PATTERN = "^export const RUNTIME_HOST_SOURCE = '([a-f0-9]{40})';$";

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sleep = ms => new Promise(done => setTimeout(done, ms));

function fail(code, detail = '') {
  const error = new Error(detail);
  error.code = CODE + code;
  return error;
}

function assertCode(condition, code, detail = '') {
  if (!condition) throw fail(code, detail);
}

async function run(command, args, { cwd, env, buffer = false, timeout = 300000 } = {}) {
  try {
    const { stdout } = await exec(command, args, {
      cwd, env: env ? { ...process.env, ...env } : process.env,
      encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, timeout,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? (buffer ? Buffer.alloc(0) : ''),
      stderr: error.stderr ?? (buffer ? Buffer.alloc(0) : ''),
      message: error.message,
    };
  }
}

async function git(root, args, options = {}) {
  const result = await run('git', ['-C', root, ...args], { ...options, buffer: options.buffer ?? false });
  if (result.code !== 0) {
    const stderr = result.stderr.toString().trim() || result.message || '';
    throw fail('GIT', `git ${args.join(' ')}: ${stderr}`);
  }
  return options.buffer ? result.stdout : result.stdout.trimEnd();
}

async function gitQuiet(root, args) {
  const result = await run('git', ['-C', root, ...args]);
  return result.code;
}

async function readJson(root, path, code) {
  let bytes;
  try {
    bytes = await readFile(join(root, path));
  } catch (error) {
    throw fail(code, `${path}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw fail(code, `${path}: invalid JSON`);
  }
}

function exactKeys(value, keys, code) {
  assertCode(value && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) {
    throw fail(code, `keys ${actual.join(',')}`);
  }
  return value;
}

function safeRelative(path, code) {
  assertCode(typeof path === 'string' && path && !path.startsWith('/') && !path.includes('\\')
    && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..'), code, path);
  return path;
}

async function walkFiles(root) {
  const files = [];
  async function walk(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw fail('SEALED_SYMLINK', name);
      if (entry.isDirectory()) await walk(join(path, entry.name), `${name}/`);
      else if (entry.isFile()) files.push(name);
      else throw fail('SEALED_ENTRY', name);
    }
  }
  await walk(join(root, SEALED_DIR));
  return files.sort();
}

// --- artifact lock and runtime pin -----------------------------------------

export function validateArtifactLock(value) {
  exactKeys(value, ARTIFACT_KEYS, 'ARTIFACT_LOCK_SHAPE');
  assertCode(value.schema_version === ARTIFACT_SCHEMA, 'ARTIFACT_LOCK_SCHEMA');
  assertCode(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository ?? ''), 'ARTIFACT_LOCK_REPOSITORY');
  assertCode(Number.isSafeInteger(value.id) && value.id > 0, 'ARTIFACT_LOCK_ID');
  assertCode(HEX64.test(value.sha256 ?? ''), 'ARTIFACT_LOCK_SHA256');
  assertCode(Number.isSafeInteger(value.runId) && value.runId > 0, 'ARTIFACT_LOCK_RUN_ID');
  assertCode(SHA40.test(value.headSha ?? ''), 'ARTIFACT_LOCK_HEAD_SHA');
  assertCode(HEX64.test(value.composition_lock_sha256 ?? ''), 'ARTIFACT_LOCK_COMPOSITION_DIGEST');
  return value;
}

export async function compositionLockDigest(root = ROOT) {
  return sha256(await readFile(join(root, COMPOSITION_LOCK)));
}

export function nextArtifactLock(current, sealed) {
  validateArtifactLock(current);
  assertCode(Number.isSafeInteger(sealed.id) && sealed.id > 0, 'ARTIFACT_LOCK_ID');
  assertCode(HEX64.test(sealed.sha256 ?? ''), 'ARTIFACT_LOCK_SHA256');
  assertCode(Number.isSafeInteger(sealed.runId) && sealed.runId > 0, 'ARTIFACT_LOCK_RUN_ID');
  assertCode(SHA40.test(sealed.headSha ?? ''), 'ARTIFACT_LOCK_HEAD_SHA');
  assertCode(HEX64.test(sealed.composition_lock_sha256 ?? ''), 'ARTIFACT_LOCK_COMPOSITION_DIGEST');
  return {
    schema_version: current.schema_version,
    repository: current.repository,
    id: sealed.id,
    sha256: sealed.sha256,
    runId: sealed.runId,
    headSha: sealed.headSha,
    composition_lock_sha256: sealed.composition_lock_sha256,
  };
}

/** Rewrite only the artifact identity fields; every other byte stays canonical JSON. */
export async function rewriteArtifactLock({ root = ROOT, sealed }) {
  const path = join(root, ARTIFACT_LOCK);
  const current = validateArtifactLock(JSON.parse(await readFile(path, 'utf8')));
  const next = nextArtifactLock(current, sealed);
  const bytes = jsonBytes(next);
  const before = jsonBytes(current);
  if (bytes.equals(before)) {
    return { path: ARTIFACT_LOCK, changed: false, oldId: current.id, newId: next.id,
      oldHeadSha: current.headSha, newHeadSha: next.headSha };
  }
  await writeFile(path, bytes, { mode: 0o644 });
  return { path: ARTIFACT_LOCK, changed: true, oldId: current.id, newId: next.id,
    oldHeadSha: current.headSha, newHeadSha: next.headSha };
}

export function runtimeHostSource(text) {
  const matches = [...String(text).matchAll(new RegExp(RUNTIME_SOURCE_PATTERN, 'gm'))];
  assertCode(matches.length === 1, 'RUNTIME_SOURCE_SHAPE', `matches=${matches.length}`);
  return matches[0][1];
}

export function nextRuntimeHostSource(text, headSha) {
  assertCode(SHA40.test(headSha ?? ''), 'RUNTIME_SOURCE_HEAD_SHA');
  const oldSha = runtimeHostSource(text);
  if (oldSha === headSha) return { oldSha, newSha: headSha, text: String(text), changed: false };
  const next = String(text).replace(new RegExp(RUNTIME_SOURCE_PATTERN, 'gm'), `export const RUNTIME_HOST_SOURCE = '${headSha}';`);
  return { oldSha, newSha: headSha, text: next, changed: true };
}

/** Move the archived host-verifier source to the new sealed head. */
export async function rewriteRuntimeHostSource({ root = ROOT, headSha }) {
  const path = join(root, RUNTIME_HOST_SOURCE_PATH);
  const current = await readFile(path, 'utf8');
  const next = nextRuntimeHostSource(current, headSha);
  if (!next.changed) {
    return { path: RUNTIME_HOST_SOURCE_PATH, changed: false, oldHeadSha: next.oldSha, newHeadSha: next.newSha };
  }
  await writeFile(path, next.text, { mode: 0o644 });
  return { path: RUNTIME_HOST_SOURCE_PATH, changed: true, oldHeadSha: next.oldSha, newHeadSha: next.newSha };
}

// --- sealed member verification --------------------------------------------

/** Regenerate the checksum file from the bytes that would be uploaded. */
export async function buildSealedSums(root = ROOT) {
  const files = await walkFiles(root);
  assertCode(files.length === SEALED_MEMBER_COUNT, 'SEALED_MEMBER_COUNT', `${files.length} != ${SEALED_MEMBER_COUNT}`);
  const lines = [];
  for (const file of files) {
    const digest = sha256(await readFile(join(root, SEALED_DIR, file)));
    lines.push(`${digest}  ${SEALED_DIR}/${file}`);
  }
  return Buffer.from(lines.join('\n') + '\n');
}

function parseSums(bytes) {
  const rows = new Map();
  for (const line of bytes.toString('utf8').split('\n')) {
    if (!line) continue;
    const match = /^([a-f0-9]{64}) [ *](.+)$/.exec(line);
    assertCode(match, 'SEALED_SUMS_SHAPE', line);
    assertCode(!rows.has(match[2]), 'SEALED_SUMS_DUPLICATE', match[2]);
    rows.set(match[2], match[1]);
  }
  return rows;
}

/**
 * Prove the sealed member bytes still satisfy the target commit's composition
 * lock and manifest: exactly 20 files, no symlinks, sums match, every pack
 * manifest/tarball digest is the reviewed one. Throws on the first mismatch.
 */
export async function verifySealedMembers({ root = ROOT, compositionLock, manifest }) {
  exactKeys(compositionLock, ['schema_version', 'profiles', 'plugins'], 'COMPOSITION_LOCK_SHAPE');
  exactKeys(manifest, ['schema_version', 'lock', 'consumer', 'bundle', 'toolchain', 'sources', 'deletion_gate', 'domains'],
    'COMPOSITION_MANIFEST_SHAPE');
  assertCode(Array.isArray(compositionLock.plugins) && compositionLock.plugins.length > 0, 'COMPOSITION_PLUGINS');
  assertCode(Array.isArray(manifest.sources), 'COMPOSITION_MANIFEST_SOURCES');
  assertCode(Array.isArray(manifest.domains), 'COMPOSITION_MANIFEST_DOMAINS');

  const files = await walkFiles(root);
  assertCode(files.length === SEALED_MEMBER_COUNT, 'SEALED_MEMBER_COUNT',
    `${files.length} != ${SEALED_MEMBER_COUNT}`);
  const sums = parseSums(await readFile(join(root, SEALED_SUMS)));
  assertCode(sums.size === files.length, 'SEALED_SUMS_COUNT', `${sums.size} != ${files.length}`);
  const expectedFiles = new Set(files);

  const lockedDirectories = compositionLock.plugins.map(plugin => `${safeRelative(`packs/${plugin.directory}`,
    'COMPOSITION_PLUGIN_DIRECTORY')}/`);
  const sourceDirectories = manifest.sources.map(source => `${safeRelative(`packs/${source.directory}`,
    'COMPOSITION_SOURCE_DIRECTORY')}/`);
  assertCode(JSON.stringify([...lockedDirectories].sort()) === JSON.stringify([...sourceDirectories].sort()),
    'COMPOSITION_PLUGIN_SET', `${lockedDirectories.length} != ${sourceDirectories.length}`);

  const expected = new Set();
  for (const plugin of compositionLock.plugins) {
    const directory = `${safeRelative(`packs/${plugin.directory}`, 'COMPOSITION_PLUGIN_DIRECTORY')}/`;
    const manifestPath = `${directory}plugin-pack.json`;
    assertCode(expectedFiles.has(manifestPath), 'SEALED_MEMBER_MISSING', manifestPath);
    assertCode(sha256(await readFile(join(root, SEALED_DIR, manifestPath))) === plugin.manifest_sha256,
      'SEALED_PLUGIN_MANIFEST', plugin.directory);
    expected.add(manifestPath);
    const tarballs = files.filter(file => file.startsWith(directory) && file.endsWith('.tgz'));
    assertCode(tarballs.length === 1, 'SEALED_PACK_COUNT', `${plugin.directory}: ${tarballs.length}`);
    const source = manifest.sources.find(row => row.directory === plugin.directory);
    assertCode(source && HEX64.test(source.pack_sha256 ?? ''), 'SEALED_PACK_SOURCE', plugin.directory);
    assertCode(sha256(await readFile(join(root, SEALED_DIR, tarballs[0]))) === source.pack_sha256,
      'SEALED_PACK_DIGEST', plugin.directory);
    expected.add(tarballs[0]);
  }
  for (const domain of manifest.domains) {
    const manifestPath = safeRelative(domain.manifest, 'COMPOSITION_DOMAIN_MANIFEST');
    assertCode(expectedFiles.has(manifestPath), 'SEALED_MEMBER_MISSING', manifestPath);
    assertCode(sha256(await readFile(join(root, SEALED_DIR, manifestPath))) === domain.manifest_sha256,
      'SEALED_DOMAIN_MANIFEST', domain.package);
    expected.add(manifestPath);
    const directory = `${dirname(manifestPath)}/`;
    const tarballs = files.filter(file => file.startsWith(directory) && file.endsWith('.tgz'));
    assertCode(tarballs.length === 1, 'SEALED_DOMAIN_PACK_COUNT', `${domain.package}: ${tarballs.length}`);
    assertCode(sha256(await readFile(join(root, SEALED_DIR, tarballs[0]))) === domain.pack_sha256,
      'SEALED_DOMAIN_PACK_DIGEST', domain.package);
    expected.add(tarballs[0]);
  }
  assertCode(expected.size === files.length, 'SEALED_MEMBER_UNBOUND',
    `${files.length - expected.size} unbound file(s)`);
  for (const file of files) {
    const row = sums.get(`${SEALED_DIR}/${file}`);
    assertCode(row, 'SEALED_SUMS_MISSING', file);
    assertCode(row === sha256(await readFile(join(root, SEALED_DIR, file))), 'SEALED_SUMS_DIGEST', file);
  }
  return { memberCount: files.length, plugins: compositionLock.plugins.length, domains: manifest.domains.length };
}

// --- source-target lock -----------------------------------------------------

/**
 * The seal is stale when the sealed head's requirements-lock.txt disagrees
 * with a service recipe shipped by the current commit. This is the exact
 * SERVICE_SOURCE_TARGET_QUERY_LOCK class that #228 left behind.
 */
export async function verifySourceTargetLock({ root = ROOT, headSha, headLockBytes }) {
  assertCode(SHA40.test(headSha ?? ''), 'SOURCE_TARGET_HEAD_SHA');
  const pins = parseLockPins(headLockBytes.toString('utf8'));
  const closure = await readDependencyClosure(root);
  const manifests = [];
  for (const [service, table] of closure.tables) {
    for (const path of table.manifests) {
      const value = await readJson(root, path, 'SOURCE_TARGET_MANIFEST');
      assertCode(value.dependencies && typeof value.dependencies === 'object' && !Array.isArray(value.dependencies),
        'SOURCE_TARGET_MANIFEST', path);
      for (const [name, pin] of Object.entries(value.dependencies)) {
        const canonical = canonicalPackageName(name);
        assertCode(pins.get(canonical) === pin, 'SOURCE_TARGET_LOCK',
          `${path} ${canonical} locked=${pins.get(canonical) ?? 'absent'} recipe=${pin}`);
      }
      manifests.push(path);
    }
    assertCode(table.packages.length > 0, 'SOURCE_TARGET_TABLE', service);
  }
  return { headSha, manifests, pins: pins.size };
}

// --- current state ----------------------------------------------------------

export async function findDependentLocks({ root = ROOT, artifactId, headSha }) {
  const config = join(root, 'config');
  const hits = [];
  async function walk(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const relativePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(join(path, entry.name), `${relativePath}/`);
      else if (entry.isFile() && entry.name.endsWith('.json') && relativePath !== ARTIFACT_LOCK) {
        const text = await readFile(join(path, entry.name), 'utf8');
        if (text.includes(String(artifactId)) || (headSha && text.includes(headSha))) hits.push(relativePath);
      }
    }
  }
  await walk(config, 'config/');
  return hits.sort();
}

/**
 * Local consistency gate. It deliberately makes no network call: the live
 * reseal verifies the remote artifact, while --check proves the checked-in
 * lock/pin/recipe state cannot stay silently stale.
 */
export async function checkState({ root = ROOT, generator = PIN_GENERATOR } = {}) {
  const errors = [];
  const warnings = [];
  let lock = null;
  let runtimeSource = null;
  try {
    lock = validateArtifactLock(JSON.parse(await readFile(join(root, ARTIFACT_LOCK), 'utf8')));
  } catch (error) {
    errors.push(`${error.code ?? 'RESPIN_ARTIFACT_LOCK_INVALID'}${error.message ? ` ${error.message}` : ''}`);
  }
  let compositionSha256 = null;
  try {
    compositionSha256 = await compositionLockDigest(root);
  } catch (error) {
    errors.push('RESPIN_COMPOSITION_LOCK_MISSING');
  }
  if (lock && compositionSha256 && lock.composition_lock_sha256 !== compositionSha256) {
    errors.push(`RESPIN_ARTIFACT_LOCK_COMPOSITION_DIGEST locked=${lock.composition_lock_sha256} current=${compositionSha256}`);
  }
  try {
    runtimeSource = runtimeHostSource(await readFile(join(root, RUNTIME_HOST_SOURCE_PATH), 'utf8'));
  } catch (error) {
    errors.push(error.code ?? error.message);
  }
  if (lock && runtimeSource && lock.headSha !== runtimeSource) {
    errors.push(`RESPIN_RUNTIME_SOURCE_DRIFT lock=${lock.headSha} pin=${runtimeSource}`);
  }
  const pins = await run(process.execPath, [generator, '--check', '--root', root], { cwd: root });
  if (pins.code === 1) errors.push(`RESPIN_SERVICE_PINS_DRIFT\n${pins.stdout.trim()}`);
  else if (pins.code !== 0) errors.push(`RESPIN_SERVICE_PINS_INVALID ${pins.stderr.trim() || pins.stdout.trim()}`);
  let headLock = null;
  if (lock && lock.headSha !== runtimeSource) {
    // reported above
  } else if (lock) {
    const hasHead = (await gitQuiet(root, ['cat-file', '-e', `${lock.headSha}^{commit}`])) === 0;
    if (!hasHead) {
      warnings.push(`sealed head ${lock.headSha} is not in the local object store; source-target lock not re-read`);
    } else {
      headLock = await git(root, ['show', `${lock.headSha}:requirements-lock.txt`], { buffer: true });
      try {
        await verifySourceTargetLock({ root, headSha: lock.headSha, headLockBytes: headLock });
      } catch (error) {
        errors.push(`${error.code ?? 'RESPIN_SOURCE_TARGET_INVALID'}${error.message ? ` ${error.message}` : ''}`);
      }
    }
  }
  return { ok: errors.length === 0, lock, runtimeSource, compositionSha256, headLock, errors, warnings };
}

// --- checkout and pins ------------------------------------------------------

export async function verifyCheckout({ root = ROOT, target = 'HEAD' } = {}) {
  const [top, checkout] = await Promise.all([git(root, ['rev-parse', '--show-toplevel']), realpath(root)]);
  assertCode(await realpath(top) === checkout, 'CHECKOUT_ROOT', `${top} != ${checkout}`);
  const head = await git(root, ['rev-parse', 'HEAD']);
  const intended = await git(root, ['rev-parse', `${target}^{commit}`]);
  assertCode(head === intended, 'TARGET_MISMATCH', `HEAD=${head} target=${intended}`);
  const status = await git(root, ['status', '--porcelain', '--untracked-files=no']);
  assertCode(!status, 'DIRTY_TREE', status.split('\n').join(', '));
  return { head, target: intended };
}

function parseWritten(stdout) {
  return stdout.split('\n')
    .map(line => /^SERVICE_DEPENDENCY_PIN_WROTE (.+)$/.exec(line.trim()))
    .filter(Boolean).map(match => safeRelative(match[1], 'PIN_WRITE_PATH'));
}

/** Read-only pin state; used by --dry-run so expected drift is reported, not thrown. */
export async function checkServicePins({ root = ROOT, generator = PIN_GENERATOR } = {}) {
  const check = await run(process.execPath, [generator, '--check', '--root', root], { cwd: root });
  if (check.code === 2) throw fail('SERVICE_PINS_INVALID', check.stderr.trim() || check.stdout.trim());
  return { drift: check.code === 1 ? check.stdout.trim().split('\n').filter(Boolean) : [] };
}

/** Run the SSOT generator. --write must leave zero drift, or the run fails. */
export async function regenerateServicePins({ root = ROOT, write = true, generator = PIN_GENERATOR } = {}) {
  let written = [];
  if (write) {
    const result = await run(process.execPath, [generator, '--write', '--root', root], { cwd: root });
    assertCode(result.code === 0, 'SERVICE_PINS_WRITE', result.stderr.trim() || result.stdout.trim());
    written = parseWritten(result.stdout);
  }
  const check = await run(process.execPath, [generator, '--check', '--root', root], { cwd: root });
  if (check.code === 1) {
    throw fail('SERVICE_PINS_STILL_DRIFTING', check.stdout.trim());
  }
  assertCode(check.code === 0, 'SERVICE_PINS_INVALID', check.stderr.trim() || check.stdout.trim());
  return { written, drift: [] };
}

// --- sealing branch ---------------------------------------------------------

async function fetchSealingBranch(root) {
  const ref = `refs/remotes/origin/${SEALING_BRANCH}`;
  const fetched = await run('git', ['-C', root, 'fetch', '--no-tags', 'origin',
    `+refs/heads/${SEALING_BRANCH}:${ref}`]);
  assertCode(fetched.code === 0, 'SEALING_BRANCH_MISSING', fetched.stderr.toString().trim());
  const head = await git(root, ['rev-parse', ref]);
  assertCode(SHA40.test(head), 'SEALING_BRANCH_HEAD', head);
  return { ref, head };
}

async function copyFromRef(root, ref, path, destination) {
  const bytes = await git(root, ['show', `${ref}:${path}`], { buffer: true });
  const target = join(destination, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o755 });
  await writeFile(target, bytes, { mode: 0o644 });
}

/**
 * Rebuild `codex/rc3-composition-artifact-20261024` from the target commit:
 * target tree + the already-reviewed .ci member bytes + the sealing workflow +
 * the service pins written in step 2. The commit id is deterministic (fixed
 * identity and the target commit date), so re-running cannot fork the branch.
 */
export async function buildSealingCommit({ root = ROOT, target, writtenPaths = [] }) {
  const { ref, head: previousHead } = await fetchSealingBranch(root);
  const sealDate = await git(root, ['show', '-s', '--format=%cI', target]);
  const parent = await mkdtemp(join(tmpdir(), 'respin-sealing-'));
  const worktree = join(parent, 'tree');
  let added = false;
  try {
    const addedResult = await run('git', ['-C', root, 'worktree', 'add', '--detach', worktree, target]);
    assertCode(addedResult.code === 0, 'SEALING_WORKTREE', addedResult.stderr.toString().trim());
    added = true;

    const members = (await git(root, ['ls-tree', '-r', '--name-only', '-z', ref, '--', SEALED_DIR]))
      .split('\0').filter(Boolean);
    assertCode(members.length === SEALED_MEMBER_COUNT, 'SEALED_MEMBER_COUNT', `${members.length} != ${SEALED_MEMBER_COUNT}`);
    for (const path of members) await copyFromRef(root, ref, path, worktree);
    await copyFromRef(root, ref, SEALED_SUMS, worktree);
    await copyFromRef(root, ref, SEALING_WORKFLOW, worktree);

    const compositionLock = await readJson(worktree, COMPOSITION_LOCK, 'COMPOSITION_LOCK_MISSING');
    const manifest = await readJson(worktree, COMPOSITION_MANIFEST, 'COMPOSITION_MANIFEST_MISSING');
    await verifySealedMembers({ root: worktree, compositionLock, manifest });

    await writeFile(join(worktree, SEALED_SUMS), await buildSealedSums(worktree), { mode: 0o644 });
    for (const path of writtenPaths) {
      safeRelative(path, 'PIN_WRITE_PATH');
      await mkdir(dirname(join(worktree, path)), { recursive: true, mode: 0o755 });
      await copyFile(join(root, path), join(worktree, path));
    }
    const staged = await run('git', ['-C', worktree, 'add', '-A', '--', '.ci',
      SEALING_WORKFLOW, ...writtenPaths]);
    assertCode(staged.code === 0, 'SEALING_STAGE', staged.stderr.toString().trim());

    const commit = await run('git', ['-C', worktree,
      '-c', 'user.name=respin-composition-artifact',
      '-c', 'user.email=respin-composition-artifact@users.noreply.github.com',
      '-c', 'commit.gpgsign=false',
      'commit', '--no-verify', '-m', `build(composition): reseal the sealed inputs at ${target}`], {
      env: { GIT_AUTHOR_DATE: sealDate, GIT_COMMITTER_DATE: sealDate, GIT_CONFIG_NOSYSTEM: '1' },
    });
    assertCode(commit.code === 0, 'SEALING_COMMIT', commit.stderr.toString().trim());
    const head = await git(worktree, ['rev-parse', 'HEAD']);
    const changed = head !== previousHead;
    if (changed) {
      const lease = `refs/heads/${SEALING_BRANCH}:${previousHead}`;
      const pushed = await run('git', ['-C', worktree, '-c', 'core.hooksPath=/dev/null', 'push',
        `--force-with-lease=${lease}`, 'origin', `HEAD:refs/heads/${SEALING_BRANCH}`]);
      assertCode(pushed.code === 0, 'SEALING_PUSH', pushed.stderr.toString().trim());
    }
    return { head, previousHead, changed, worktree };
  } finally {
    if (added) await run('git', ['-C', root, 'worktree', 'remove', '--force', worktree]);
    await rm(parent, { recursive: true, force: true });
  }
}

// --- live artifact ----------------------------------------------------------

async function defaultRepository(root) {
  const remote = await run('git', ['-C', root, 'remote', 'get-url', 'origin']);
  if (remote.code !== 0) return DEFAULT_REPOSITORY;
  const match = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote.stdout.trim());
  return match ? `${match[1]}/${match[2]}` : DEFAULT_REPOSITORY;
}

async function gh(args, { buffer = false } = {}) {
  const result = await run('gh', args, { buffer });
  assertCode(result.code === 0, 'GITHUB_CLI', result.stderr.toString().trim() || result.message);
  return buffer ? result.stdout : result.stdout.trim();
}

async function ghToken() {
  const result = await run('gh', ['auth', 'token']);
  assertCode(result.code === 0 && result.stdout.trim(), 'GITHUB_TOKEN',
    'gh is not authenticated; set GH_TOKEN for artifact download');
  return result.stdout.trim();
}

/** Find the workflow run triggered by the sealing-branch push. */
export async function waitForSealingRun({ repository, headSha, timeoutMs, pollMs, runGh = gh }) {
  const deadline = Date.now() + timeoutMs;
  const workflowPath = SEALING_WORKFLOW;
  let workflowRun = null;
  while (Date.now() < deadline && !workflowRun) {
    const list = JSON.parse(await runGh(['api', `repos/${repository}/actions/runs?head_sha=${headSha}&per_page=100`]));
    workflowRun = (list.workflow_runs ?? []).find(row => row.head_sha === headSha
      && row.path === workflowPath && row.event === 'push') ?? null;
    if (!workflowRun) await sleep(pollMs);
  }
  assertCode(workflowRun, 'SEALING_RUN_MISSING', `no push run for ${headSha} on ${workflowPath}`);
  while (workflowRun.status !== 'completed') {
    assertCode(Date.now() < deadline, 'SEALING_RUN_TIMEOUT', workflowRun.html_url);
    console.log(`RESPIN_WAIT run=${workflowRun.id} status=${workflowRun.status}`);
    await sleep(pollMs);
    workflowRun = JSON.parse(await runGh(['api', `repos/${repository}/actions/runs/${workflowRun.id}`]));
  }
  assertCode(workflowRun.conclusion === 'success', 'SEALING_RUN_FAILED',
    `${workflowRun.conclusion} ${workflowRun.html_url}`);
  return workflowRun;
}

/** Download the artifact through the checked-in composition verifier. */
export async function verifySealedArtifact({ root = ROOT, repository, sealed, python = process.env.FQ_B0_PYTHON ?? 'python3' }) {
  const work = await mkdtemp(join(tmpdir(), 'respin-artifact-'));
  try {
    const lockPath = join(work, 'artifact.lock.json');
    const lock = {
      schema_version: ARTIFACT_SCHEMA,
      repository,
      id: sealed.id,
      sha256: sealed.sha256,
      runId: sealed.runId,
      headSha: sealed.headSha,
      composition_lock_sha256: sealed.composition_lock_sha256,
    };
    await writeFile(lockPath, jsonBytes(lock), { mode: 0o600 });
    const token = process.env.GH_TOKEN || await ghToken();
    const result = await run(process.execPath, [COMPOSITION_INPUTS,
      '--artifact-lock', lockPath,
      '--manifest', join(root, COMPOSITION_MANIFEST),
      '--output', join(work, 'out'),
      '--python', python,
    ], { cwd: root, env: { GH_TOKEN: token }, timeout: 600000 });
    assertCode(result.code === 0, 'ARTIFACT_VERIFY', result.stderr.trim() || result.stdout.trim());
    return JSON.parse(result.stdout);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function summarizeChanges(changes) {
  for (const change of changes) {
    console.log(`RESPIN_CHANGED ${change.path} ${change.detail}`);
  }
}

async function printState(state, prefix = 'RESPIN_STATE') {
  console.log(`${prefix} artifact_id=${state.lock?.id ?? 'absent'} head=${state.lock?.headSha ?? 'absent'}`);
  console.log(`${prefix} runtime_host_source=${state.runtimeSource ?? 'absent'} composition_digest=${state.compositionSha256 ?? 'absent'}`);
  for (const warning of state.warnings) console.log(`${prefix} WARN ${warning}`);
  for (const error of state.errors) console.log(`${prefix} ERROR ${error}`);
}

function usage() {
  return [
    'Usage: node scripts/release/respin-composition-artifact.mjs [options]',
    '',
    'Reseal the rc3 composition artifact after a dependency-lock change.',
    '',
    'Options:',
    '  --dry-run             stop after the read-only pin check; write nothing',
    '  --check               verify the current lock/pin/recipe state; write nothing',
    '  --target <commit>     commit to seal (default HEAD)',
    '  --root <path>         repository root (defaults to this script\'s checkout)',
    '  --repository <owner/repo>  GitHub repository for the sealing workflow',
    '  --python <path>       Python for artifact unpacking (default FQ_B0_PYTHON or python3)',
    '  --timeout <seconds>   sealing workflow wait budget (default 900)',
    '  --poll <seconds>      workflow poll interval (default 15)',
    '  --help                print this help',
    '',
    'Exit codes: 0 success / nothing to do, 1 mismatch or failed verification.',
    'The workflow-triggering and artifact-download steps are live CI-only:',
    'they need push access to the dedicated sealing branch and gh auth.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean' },
      check: { type: 'boolean' },
      target: { type: 'string' },
      root: { type: 'string' },
      repository: { type: 'string' },
      python: { type: 'string' },
      timeout: { type: 'string' },
      poll: { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(usage());
    return 0;
  }
  assertCode(!(values['dry-run'] && values.check), 'MODE_INVALID');
  const root = values.root ? resolve(values.root) : ROOT;
  const timeoutMs = Number(values.timeout ?? 900) * 1000;
  const pollMs = Number(values.poll ?? 15) * 1000;
  assertCode(Number.isFinite(timeoutMs) && timeoutMs > 0, 'TIMEOUT_INVALID');
  assertCode(Number.isFinite(pollMs) && pollMs >= 1000, 'POLL_INVALID');

  if (values.check) {
    const state = await checkState({ root });
    await printState(state);
    if (!state.ok) {
      console.log('RESPIN_CHECK_FAILED');
      return 1;
    }
    console.log('RESPIN_CHECK_OK');
    return 0;
  }

  const checkout = await verifyCheckout({ root, target: values.target ?? 'HEAD' });
  const repository = values.repository ?? await defaultRepository(root);
  const state = await checkState({ root });

  const alreadySealed = state.ok && (await sealedHeadCoversTarget(root, state.lock));
  if (alreadySealed) {
    console.log(`RESPIN_ALREADY_SEALED target=${checkout.head} artifact_id=${state.lock.id} head=${state.lock.headSha}`);
    await printState(state);
    return 0;
  }

  if (values['dry-run']) {
    const pins = await checkServicePins({ root });
    console.log(`RESPIN_DRY_RUN target=${checkout.head} repository=${repository}`);
    await printState(state, 'RESPIN_DRY_RUN STATE');
    for (const line of pins.drift) console.log(`RESPIN_DRY_RUN DRIFT ${line}`);
    summarizeChanges([
      { path: SEALED_SUMS, detail: 'regenerated from the fixed .ci member bytes' },
      { path: SEALING_WORKFLOW, detail: `carried onto ${SEALING_BRANCH}` },
      { path: ARTIFACT_LOCK, detail: `id/run/head would move to the new sealed artifact` },
      { path: RUNTIME_HOST_SOURCE_PATH, detail: 'RUNTIME_HOST_SOURCE would move to the new sealed head' },
      ...pins.drift.map(line => ({ path: line, detail: 'service dependency pin drift (would be rewritten)' })),
    ]);
    console.log('RESPIN_DRY_RUN no files changed; re-run without --dry-run to reseal');
    return 0;
  }

  const pins = await regenerateServicePins({ root, write: true });
  const changes = pins.written.map(path => ({ path, detail: 'service dependency pins regenerated' }));
  console.log(`RESPIN_SEAL target=${checkout.head} branch=${SEALING_BRANCH}`);

  const sealing = await buildSealingCommit({ root, target: checkout.head, writtenPaths: pins.written });
  console.log(`RESPIN_SEAL head=${sealing.head} previous=${sealing.previousHead} pushed=${sealing.changed}`);

  const runRow = await waitForSealingRun({ repository, headSha: sealing.head, timeoutMs, pollMs });
  assertCode(runRow.head_sha === sealing.head, 'SEALING_RUN_HEAD', `${runRow.head_sha} != ${sealing.head}`);
  const artifacts = JSON.parse(await gh(['api', `repos/${repository}/actions/runs/${runRow.id}/artifacts`]));
  const name = `shinemage-sealed-composition-rc3-${sealing.head}`;
  const artifact = (artifacts.artifacts ?? []).find(row => row.name === name && row.expired === false);
  assertCode(artifact, 'ARTIFACT_MISSING', name);
  assertCode(artifact.workflow_run?.id === runRow.id && artifact.workflow_run?.head_sha === sealing.head,
    'ARTIFACT_RUN_BINDING', `${artifact.workflow_run?.id}/${artifact.workflow_run?.head_sha}`);
  const digestMatch = /^sha256:([a-f0-9]{64})$/.exec(artifact.digest ?? '');
  assertCode(digestMatch, 'ARTIFACT_DIGEST_MISSING', `artifact ${artifact.id} has no sha256 digest`);
  const compositionSha256 = await compositionLockDigest(root);
  const sealed = {
    id: artifact.id, sha256: digestMatch[1], runId: runRow.id, headSha: sealing.head,
    composition_lock_sha256: compositionSha256,
  };
  console.log(`RESPIN_ARTIFACT id=${sealed.id} sha256=${sealed.sha256} run=${sealed.runId} bytes=${artifact.size_in_bytes}`);

  const headLock = await git(root, ['show', `${sealing.head}:requirements-lock.txt`], { buffer: true });
  await verifySourceTargetLock({ root, headSha: sealing.head, headLockBytes: headLock });
  await verifySealedArtifact({ root, repository, sealed, python: values.python });

  const oldId = state.lock?.id;
  const oldHead = state.lock?.headSha;
  if (oldId && oldId !== sealed.id) {
    const dependents = await findDependentLocks({ root, artifactId: oldId, headSha: oldHead });
    assertCode(dependents.length === 0, 'DEPENDENT_LOCK_UNSUPPORTED',
      `update or teach this helper about ${dependents.join(', ')}`);
  }
  const lockChange = await rewriteArtifactLock({ root, sealed });
  changes.push({ ...lockChange, detail: `artifact id ${lockChange.oldId} -> ${lockChange.newId}, head ${lockChange.oldHeadSha} -> ${lockChange.newHeadSha}` });
  const runtime = await rewriteRuntimeHostSource({ root, headSha: sealing.head });
  changes.push({ ...runtime, detail: `RUNTIME_HOST_SOURCE ${runtime.oldHeadSha} -> ${runtime.newHeadSha}` });

  const finalState = await checkState({ root });
  assertCode(finalState.ok, 'FINAL_STATE', finalState.errors.join('\n'));
  summarizeChanges(changes.filter(change => change.changed !== false));
  console.log(`RESPIN_SUMMARY artifact ${oldId} -> ${sealed.id} head ${oldHead} -> ${sealing.head}`);
  console.log(`RESPIN_SUMMARY runtime_host_source ${runtime.oldHeadSha} -> ${runtime.newHeadSha}`);
  console.log(`RESPIN_SUMMARY run=${sealing.changed ? 'https://github.com/' + repository + '/actions/runs/' + runRow.id : 'reused'}`);
  console.log('RESPIN_NEXT commit the changed files with the dependency PR, then watch B0');
  return 0;
}

/**
 * The sealed head already carries the dependency inputs in the working tree
 * (requirements-lock plus every service recipe). Lock-only commits made after
 * a successful reseal therefore do not trigger a second seal.
 */
export async function sealedHeadCoversTarget(root, lock) {
  const hasHead = (await gitQuiet(root, ['cat-file', '-e', `${lock.headSha}^{commit}`])) === 0;
  if (!hasHead) return false;
  const paths = ['requirements-lock.txt'];
  try {
    const closure = await readDependencyClosure(root);
    for (const table of closure.tables.values()) paths.push(...table.manifests);
  } catch {
    paths.push('services/');
  }
  return (await gitQuiet(root, ['diff', '--quiet', lock.headSha, '--', ...paths])) === 0;
}

async function invokedAsScript() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  return pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(self).href;
}

if (await invokedAsScript()) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`${error.code ?? 'RESPIN_FAILED'}${error.message ? `: ${error.message}` : ''}`);
    process.exitCode = 1;
  }
}
