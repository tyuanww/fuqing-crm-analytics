#!/usr/bin/env node
/**
 * Rebuild the `.ci` members of the sealed rc3 composition artifact from the
 * current lock files instead of copying whatever bytes the dedicated sealing
 * branch happens to carry.
 *
 * `respin-composition-artifact.mjs` used to copy the 20 `.ci` members from
 * `codex/rc3-composition-artifact-20261024` and then verify them against the
 * current lock. That works for a dependency-only refill (pack bytes are
 * unchanged) but fails `RESPIN_SEALED_*` as soon as a pack is repacked: the
 * branch still carries the previous manifest/tarball, while the lock and the
 * source manifest describe the new ones. See the P4 runbook §5 and
 * docs/operating/dependency-reseal.md.
 *
 * This module derives the sealed member set from the current
 * `config/shinemage-composition-packs.lock.json`,
 * `config/shinemage-composition-pack-manifest.v1.json` and pack manifests:
 *
 *   .ci/rc3-composition/packs/<directory>/plugin-pack.json
 *   .ci/rc3-composition/packs/<directory>/<package>-<version>.tgz
 *   .ci/rc3-composition/domain/<domain>-pack.json
 *   .ci/rc3-composition/domain/<package>-<version>.tgz
 *   .ci/rc3-composition.sha256
 *
 * Pack bytes are build artifacts, so they cannot be regenerated from a
 * sha256. They come from one of two sources, in this order:
 *
 *   1. `--packs <dir>`: an unpacked author formal-pack input directory, the
 *      same layout `scripts/ci/composition-pack-inputs.mjs --input-dir`
 *      consumes (`packs/<dir>/...`, `domain/...`). Only the packs that
 *      actually changed need to be present; unchanged packs fall back to the
 *      sealing branch.
 *   2. the sealing branch: used for the unchanged packs (dependency-only
 *      reseal) and by `--check`.
 *
 * Every derived member is verified against the lock's `manifest_sha256` and
 * the source manifest's `pack_sha256`. A branch byte that no longer matches is
 * a stale seal (actionable: supply `--packs`); a byte supplied through
 * `--packs` that does not match is a genuine inconsistency and never accepted.
 *
 * Usage:
 *   node scripts/release/rebuild-seal-members.mjs --packs <dir>
 *   node scripts/release/rebuild-seal-members.mjs --dry-run --packs <dir>
 *   node scripts/release/rebuild-seal-members.mjs --check
 *   node scripts/release/rebuild-seal-members.mjs --check --packs <dir>
 *   node scripts/release/rebuild-seal-members.mjs --write-branch --packs <dir>
 *
 * The read-only modes write nothing. `--write-branch` rebuilds and pushes the
 * deterministic sealing commit (fixed identity, target commit date) through
 * `respin-composition-artifact.mjs#buildSealingCommit`; that path still needs
 * the live workflow run and the artifact download before the artifact lock can
 * move. `--check` is offline and only proves the committed tree is what a fresh
 * derivation would write.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';

const exec = promisify(execFile);
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SEALED_DIR = '.ci/rc3-composition';
export const SEALED_SUMS = '.ci/rc3-composition.sha256';
export const SEALED_MEMBER_COUNT = 20;
export const SEALING_BRANCH = 'codex/rc3-composition-artifact-20261024';
export const COMPOSITION_LOCK = 'config/shinemage-composition-packs.lock.json';
export const COMPOSITION_MANIFEST = 'config/shinemage-composition-pack-manifest.v1.json';

const CODE = 'SEAL_';
const HEX64 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const PACKAGE_NAME = /^@(shine-mage|deepseek-ai)\/[a-z0-9][a-z0-9-]+$/;
const TARBALL_NAME = /^[a-z0-9][a-z0-9.-]*\.tgz$/;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function fail(code, detail = '') {
  const error = new Error(detail);
  error.code = CODE + code;
  return error;
}

function assertCode(condition, code, detail = '') {
  if (!condition) throw fail(code, detail);
}

async function run(command, args, { cwd, buffer = false, timeout = 300000 } = {}) {
  try {
    const { stdout } = await exec(command, args, {
      cwd, encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, timeout,
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

async function gitBlob(root, ref, path) {
  const result = await run('git', ['-C', root, 'show', `${ref}:${path}`], { buffer: true });
  return result.code === 0 ? result.stdout : null;
}

function safeRelative(path, code) {
  assertCode(typeof path === 'string' && path && !path.startsWith('/') && !path.includes('\\')
    && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..'), code, path);
  return path;
}

export function packageTarballName(packageName, packageVersion) {
  assertCode(PACKAGE_NAME.test(packageName ?? ''), 'PACKAGE_NAME', packageName);
  assertCode(typeof packageVersion === 'string' && packageVersion, 'PACKAGE_VERSION', packageVersion);
  return `${packageName.slice(1).replaceAll('/', '-')}-${packageVersion}.tgz`;
}

function parseJson(bytes, origin, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw sourceError(origin, 'INVALID', `${label}: invalid JSON`);
  }
}

/**
 * A branch byte that no longer matches the current locks is a stale seal, not
 * corruption: the operator can supply the rebuilt pack. A byte supplied through
 * --packs that does not match is genuine inconsistency.
 */
function sourceError(origin, code, detail) {
  if (origin === 'branch') {
    return fail('SOURCE_STALE', `${detail} (the sealing branch still carries the previous pack bytes; `
      + 'fetch the rebuilt author formal pack and pass --packs <dir>)');
  }
  return fail(`INPUT_${code}`, detail);
}

async function isDirectory(path) {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the two accepted pack-input layouts: an unpacked author artifact
 * (`<dir>/packs/...`) or a full sealed tree (`<dir>/.ci/rc3-composition/...`).
 */
export async function resolvePackInputRoot(directory) {
  const absolute = resolve(directory);
  if (await isDirectory(join(absolute, 'packs'))) return absolute;
  if (await isDirectory(join(absolute, SEALED_DIR, 'packs'))) return join(absolute, SEALED_DIR);
  throw fail('INPUT_LAYOUT', `${directory}: expected packs/ or ${SEALED_DIR}/packs/`);
}

/**
 * `--packs` entries win over the sealing branch per pack, so a refill only has
 * to supply the packs it changed. `readFrom` pins a member to the same origin
 * as its manifest, which keeps a half-provided pack from mixing bytes.
 */
export async function createSealSource({ root = ROOT, ref = null, packsDirectory = null } = {}) {
  const packsRoot = packsDirectory ? await resolvePackInputRoot(packsDirectory) : null;
  return {
    packsRoot,
    ref,
    label: packsRoot ? `packs:${packsRoot}` : `ref:${ref}`,
    missingOrigin() {
      return ref ? 'branch' : 'packs';
    },
    async read(path) {
      if (packsRoot) {
        let bytes = null;
        try {
          bytes = await readFile(join(packsRoot, path));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (bytes) return { bytes, origin: 'packs' };
      }
      if (!ref) return null;
      const bytes = await gitBlob(root, ref, `${SEALED_DIR}/${path}`);
      return bytes ? { bytes, origin: 'branch' } : null;
    },
    async readFrom(origin, path) {
      if (origin === 'packs') {
        try {
          return { bytes: await readFile(join(packsRoot, path)), origin };
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      }
      if (!ref) return null;
      const bytes = await gitBlob(root, ref, `${SEALED_DIR}/${path}`);
      return bytes ? { bytes, origin } : null;
    },
  };
}

function requireEntry(entry, origin, path, label) {
  if (!entry) throw sourceError(origin, 'MISSING', `${label} ${path}: not present`);
  return entry;
}

function expectDigest(entry, expected, origin, label) {
  assertCode(HEX64.test(expected ?? ''), 'EXPECTED_DIGEST', label);
  const actual = sha256(entry.bytes);
  if (actual !== expected) {
    throw sourceError(origin, 'DIGEST', `${label}: ${actual} != ${expected}`);
  }
  return actual;
}

function validateCompositionLock(value) {
  assertCode(value && typeof value === 'object' && !Array.isArray(value), 'LOCK_SHAPE');
  assertCode(Array.isArray(value.plugins) && value.plugins.length > 0, 'LOCK_PLUGINS');
  for (const row of value.plugins) {
    assertCode(row && typeof row === 'object', 'LOCK_PLUGIN_SHAPE');
    assertCode(/^[a-z][a-z0-9-]*$/.test(row.directory ?? ''), 'LOCK_DIRECTORY', row.directory);
    assertCode(PACKAGE_NAME.test(row.id ?? ''), 'LOCK_PACKAGE', row.id);
    assertCode(typeof row.version === 'string' && row.version, 'LOCK_VERSION', row.directory);
    assertCode(HEX64.test(row.manifest_sha256 ?? ''), 'LOCK_MANIFEST_DIGEST', row.directory);
    assertCode(SHA40.test(row.source_sha ?? ''), 'LOCK_SOURCE_SHA', row.directory);
  }
  return value;
}

function validateSourceManifest(value) {
  assertCode(value && typeof value === 'object' && !Array.isArray(value), 'MANIFEST_SHAPE');
  assertCode(Array.isArray(value.sources), 'MANIFEST_SOURCES');
  assertCode(Array.isArray(value.domains), 'MANIFEST_DOMAINS');
  for (const row of value.sources) {
    assertCode(/^[a-z][a-z0-9-]*$/.test(row.directory ?? ''), 'MANIFEST_SOURCE_DIRECTORY', row.directory);
    assertCode(HEX64.test(row.pack_sha256 ?? ''), 'MANIFEST_SOURCE_PACK_DIGEST', row.directory);
  }
  for (const row of value.domains) {
    assertCode(PACKAGE_NAME.test(row.package ?? ''), 'MANIFEST_DOMAIN_PACKAGE', row.package);
    safeRelative(row.manifest, 'MANIFEST_DOMAIN_PATH');
    assertCode(HEX64.test(row.manifest_sha256 ?? ''), 'MANIFEST_DOMAIN_MANIFEST_DIGEST', row.package);
    assertCode(HEX64.test(row.pack_sha256 ?? ''), 'MANIFEST_DOMAIN_PACK_DIGEST', row.package);
  }
  return value;
}

/**
 * Derive the complete sealed member set from the current locks and the pack
 * manifests. Returns members sorted by path so the checksum file and the git
 * tree are independent of directory iteration order.
 */
export async function deriveSealMembers({ compositionLock, manifest, source }) {
  validateCompositionLock(compositionLock);
  validateSourceManifest(manifest);
  assertCode(source && typeof source.read === 'function', 'SOURCE_REQUIRED');

  const sourceByDirectory = new Map();
  for (const row of manifest.sources) {
    assertCode(!sourceByDirectory.has(row.directory), 'MANIFEST_SOURCE_DUPLICATE', row.directory);
    sourceByDirectory.set(row.directory, row);
  }
  const lockedDirectories = compositionLock.plugins.map(row => row.directory);
  assertCode(new Set(lockedDirectories).size === lockedDirectories.length, 'LOCK_DIRECTORY_DUPLICATE');
  assertCode(JSON.stringify([...lockedDirectories].sort()) === JSON.stringify([...sourceByDirectory.keys()].sort()),
    'SOURCE_PLUGIN_SET', `${lockedDirectories.length} != ${sourceByDirectory.size}`);

  const members = new Map();
  const collect = (path, bytes, expected, origin, label) => {
    safeRelative(path, 'MEMBER_PATH');
    assertCode(!members.has(path), 'MEMBER_DUPLICATE', path);
    assertCode(sha256(bytes) === expected, 'INTERNAL_DIGEST', path);
    members.set(path, { path, bytes, sha256: expected, origin, label });
  };

  for (const plugin of [...compositionLock.plugins].sort((left, right) => left.directory.localeCompare(right.directory))) {
    const pinned = sourceByDirectory.get(plugin.directory);
    const manifestPath = `packs/${plugin.directory}/plugin-pack.json`;
    const manifestEntry = requireEntry(await source.read(manifestPath), source.missingOrigin(), manifestPath, 'plugin manifest');
    const { origin } = manifestEntry;
    expectDigest(manifestEntry, plugin.manifest_sha256, origin, manifestPath);
    const receipt = parseJson(manifestEntry.bytes, origin, manifestPath);
    assertCode(receipt.package_name === plugin.id, 'PACK_ID',
      `${manifestPath}: ${receipt.package_name} != ${plugin.id}`);
    assertCode(receipt.package_version === plugin.version, 'PACK_VERSION',
      `${manifestPath}: ${receipt.package_version} != ${plugin.version}`);
    const tarballName = packageTarballName(plugin.id, plugin.version);
    assertCode(receipt.tarball?.name === tarballName, 'PACK_TARBALL_NAME',
      `${manifestPath}: ${receipt.tarball?.name} != ${tarballName}`);
    assertCode(receipt.tarball?.sha256 === pinned.pack_sha256, 'PACK_TARBALL_DIGEST',
      `${manifestPath}: ${receipt.tarball?.sha256} != ${pinned.pack_sha256}`);
    const tarballPath = `packs/${plugin.directory}/${tarballName}`;
    const tarballEntry = requireEntry(await source.readFrom(origin, tarballPath), origin, tarballPath, 'plugin pack');
    expectDigest(tarballEntry, pinned.pack_sha256, origin, tarballPath);
    collect(manifestPath, manifestEntry.bytes, plugin.manifest_sha256, origin, plugin.id);
    collect(tarballPath, tarballEntry.bytes, pinned.pack_sha256, origin, plugin.id);
  }

  for (const domain of [...manifest.domains].sort((left, right) => left.manifest.localeCompare(right.manifest))) {
    const manifestPath = domain.manifest;
    const manifestEntry = requireEntry(await source.read(manifestPath), source.missingOrigin(), manifestPath, 'domain manifest');
    const { origin } = manifestEntry;
    expectDigest(manifestEntry, domain.manifest_sha256, origin, manifestPath);
    const receipt = parseJson(manifestEntry.bytes, origin, manifestPath);
    assertCode(receipt.package_name === domain.package, 'DOMAIN_PACKAGE',
      `${manifestPath}: ${receipt.package_name} != ${domain.package}`);
    const tarballName = receipt.tarball?.name;
    assertCode(TARBALL_NAME.test(tarballName ?? ''), 'DOMAIN_TARBALL_NAME', `${manifestPath}: ${tarballName}`);
    assertCode(receipt.tarball?.sha256 === domain.pack_sha256, 'DOMAIN_TARBALL_DIGEST',
      `${manifestPath}: ${receipt.tarball?.sha256} != ${domain.pack_sha256}`);
    const tarballPath = `${dirname(manifestPath)}/${tarballName}`;
    const tarballEntry = requireEntry(await source.readFrom(origin, tarballPath), origin, tarballPath, 'domain pack');
    expectDigest(tarballEntry, domain.pack_sha256, origin, tarballPath);
    collect(manifestPath, manifestEntry.bytes, domain.manifest_sha256, origin, domain.package);
    collect(tarballPath, tarballEntry.bytes, domain.pack_sha256, origin, domain.package);
  }

  assertCode(members.size === SEALED_MEMBER_COUNT, 'MEMBER_COUNT',
    `${members.size} != ${SEALED_MEMBER_COUNT}`);
  const sorted = [...members.values()].sort((left, right) => left.path.localeCompare(right.path));
  return { members: sorted, sums: buildSumsBytes(sorted), memberCount: sorted.length };
}

/** Canonical checksum bytes: `<digest>  <SEALED_DIR>/<path>\n`, sorted by path. */
export function buildSumsBytes(members) {
  const lines = [...members]
    .map(member => ({ path: member.path, digest: member.sha256 ?? sha256(member.bytes) }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(member => `${member.digest}  ${SEALED_DIR}/${member.path}`);
  return Buffer.from(lines.join('\n') + '\n');
}

/** Materialise a derived tree under `root` (repo root or a scratch directory). */
export async function writeSealTree({ root = ROOT, derived }) {
  // Replace the member directory instead of merging into it, so a derivation
  // that drops a member cannot leave an unbound file behind.
  await rm(join(root, SEALED_DIR), { recursive: true, force: true });
  for (const member of derived.members) {
    const target = join(root, SEALED_DIR, member.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, member.bytes, { mode: 0o644 });
  }
  await writeFile(join(root, SEALED_SUMS), derived.sums, { mode: 0o644 });
  return { memberCount: derived.members.length, sums: join(root, SEALED_SUMS) };
}

/** Read the committed sealing tree at `ref` (members plus the checksum file). */
export async function readSealTree({ root = ROOT, ref }) {
  assertCode(typeof ref === 'string' && ref, 'REF_REQUIRED');
  const listed = await run('git', ['-C', root, 'ls-tree', '-r', '-z', ref, '--', SEALED_DIR], { buffer: true });
  assertCode(listed.code === 0, 'REF_MISSING', `${ref}: ${listed.stderr.toString().trim()}`);
  const members = new Map();
  for (const row of listed.stdout.toString('utf8').split('\0')) {
    if (!row) continue;
    const match = /^(\d{6}) (\w+) ([a-f0-9]+)\t(.+)$/.exec(row);
    assertCode(match, 'TREE_SHAPE', row);
    const [, mode, type, blobSha, path] = match;
    assertCode(type === 'blob', 'TREE_ENTRY', path);
    if (mode === '120000') throw fail('TREE_SYMLINK', path);
    assertCode(mode === '100644', 'TREE_MODE', `${path} ${mode}`);
    const rel = path.startsWith(`${SEALED_DIR}/`) ? path.slice(SEALED_DIR.length + 1) : null;
    assertCode(rel, 'TREE_PATH', path);
    const blob = await run('git', ['-C', root, 'cat-file', 'blob', blobSha], { buffer: true });
    assertCode(blob.code === 0, 'TREE_BLOB', path);
    members.set(rel, { path: rel, bytes: blob.stdout, sha256: sha256(blob.stdout) });
  }
  const sums = await gitBlob(root, ref, SEALED_SUMS);
  assertCode(sums, 'TREE_SUMS_MISSING', `${ref}:${SEALED_SUMS}`);
  return { members: [...members.values()].sort((left, right) => left.path.localeCompare(right.path)), sums };
}

/** Byte-for-byte comparison of a fresh derivation against a committed tree. */
export function compareSealTrees({ derived, committed }) {
  const drift = [];
  const committedMembers = new Map(committed.members.map(member => [member.path, member]));
  const derivedMembers = new Map(derived.members.map(member => [member.path, member]));
  for (const [path, member] of derivedMembers) {
    const other = committedMembers.get(path);
    if (!other) drift.push({ path, reason: 'missing from the sealing tree' });
    else if (!member.bytes.equals(other.bytes)) drift.push({ path, reason: 'bytes differ' });
  }
  for (const path of committedMembers.keys()) {
    if (!derivedMembers.has(path)) drift.push({ path, reason: 'unbound member in the sealing tree' });
  }
  if (!derived.sums.equals(committed.sums)) drift.push({ path: SEALED_SUMS, reason: 'checksum file differs' });
  drift.sort((left, right) => left.path.localeCompare(right.path));
  return { ok: drift.length === 0, drift };
}

/** One-call derivation used by the reseal helper. */
export async function rebuildSealMembers({ compositionLock, manifest, source }) {
  return deriveSealMembers({ compositionLock, manifest, source });
}

function usage() {
  return [
    'Usage: node scripts/release/rebuild-seal-members.mjs [options]',
    '',
    'Derive the sealed .ci members from the current composition locks.',
    '',
    'Options:',
    '  --packs <dir>       unpacked author formal packs (packs/, domain/); only the',
    '                      changed packs are required, others come from the sealing branch',
    '  --root <path>       repository root (defaults to this script\'s checkout)',
    '  --ref <git-ref>     sealing tree to read/check against',
    '                      (default refs/remotes/origin/' + SEALING_BRANCH + ')',
    '  --target <commit>   commit the sealing branch commit is rebuilt from (default HEAD)',
    '  --dry-run           derive and verify, write nothing (the default mode)',
    '  --check             verify the committed sealing tree matches a fresh derivation',
    '  --output <dir>      materialise the derived .ci tree under <dir>',
    '  --write-branch      rebuild and push the deterministic sealing commit via the',
    '                      reseal helper; still needs the live workflow + artifact download',
    '  --help              print this help',
    '',
    'Pack bytes are build artifacts: content comes from --packs or the sealing',
    'branch, never from a sha256. Paths and expected digests come from the locks.',
    'The workflow trigger/download remains live CI-only.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      packs: { type: 'string' },
      root: { type: 'string' },
      ref: { type: 'string' },
      target: { type: 'string' },
      'dry-run': { type: 'boolean' },
      check: { type: 'boolean' },
      output: { type: 'string' },
      'write-branch': { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(usage());
    return 0;
  }
  assertCode(!(values.check && values['write-branch']), 'MODE_INVALID');
  assertCode(!(values['dry-run'] && values['write-branch']), 'MODE_INVALID');
  assertCode(!(values.output && (values.check || values['write-branch'])), 'MODE_INVALID');
  const root = values.root ? resolve(values.root) : ROOT;
  const packsDirectory = values.packs ? resolve(values.packs) : null;
  const ref = values.ref ?? `refs/remotes/origin/${SEALING_BRANCH}`;

  const compositionLock = JSON.parse(await readFile(join(root, COMPOSITION_LOCK), 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, COMPOSITION_MANIFEST), 'utf8'));

  if (values['write-branch']) {
    // The deterministic commit writer lives in the reseal helper; importing it
    // lazily keeps the module graph acyclic at load time.
    const { buildSealingCommit, verifyCheckout } = await import('./respin-composition-artifact.mjs');
    const checkout = await verifyCheckout({ root, target: values.target ?? 'HEAD' });
    const sealing = await buildSealingCommit({ root, target: checkout.head, writtenPaths: [],
      packsDirectory });
    console.log(`SEAL_REBUILD_WRITE head=${sealing.head} previous=${sealing.previousHead} pushed=${sealing.changed}`);
    console.log('SEAL_REBUILD_WRITE the sealing workflow and artifact lock update remain live CI-only; '
      + 'run respin-composition-artifact.mjs to download and re-pin');
    return 0;
  }

  const source = await createSealSource({ root, ref, packsDirectory });
  let derived;
  try {
    derived = await rebuildSealMembers({ compositionLock, manifest, source });
  } catch (error) {
    if (!values.check) throw error;
    console.log(`SEAL_REBUILD_CHECK_DRIFT ${error.code ?? 'DERIVATION'}: ${error.message ?? ''}`);
    console.log(`SEAL_REBUILD_CHECK_FAILED ref=${ref} members=0`);
    return 1;
  }

  if (values.check) {
    const committed = await readSealTree({ root, ref });
    const comparison = compareSealTrees({ derived, committed });
    if (!comparison.ok) {
      for (const row of comparison.drift) console.log(`SEAL_REBUILD_CHECK_DRIFT ${row.path} ${row.reason}`);
      console.log(`SEAL_REBUILD_CHECK_FAILED ref=${ref} members=${derived.memberCount}`);
      return 1;
    }
    console.log(`SEAL_REBUILD_CHECK_OK ref=${ref} members=${derived.memberCount} sums=${sha256(derived.sums)}`);
    return 0;
  }

  if (values.output) {
    const output = resolve(values.output);
    await writeSealTree({ root: output, derived });
    console.log(`SEAL_REBUILD_OUTPUT ${output} members=${derived.memberCount} sums=${sha256(derived.sums)}`);
  }

  console.log(`SEAL_REBUILD_${values.output ? 'DERIVE' : 'DRY_RUN'} source=${source.label} `
    + `members=${derived.memberCount} plugins=${compositionLock.plugins.length} domains=${manifest.domains.length}`);
  console.log(`SEAL_REBUILD_SUMMARY sums_sha256=${sha256(derived.sums)} tarballs=`
    + `${derived.members.filter(member => member.path.endsWith('.tgz')).length}`);
  console.log(`SEAL_REBUILD_${values.output ? 'WROTE' : 'NO_WRITES'} `
    + `${values.output ? 'derived tree materialised under --output' : 'no files changed'}`);
  return 0;
}

function invokedAsScript() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  return pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(self).href;
}

// Deliberately not a top-level await: `--write-branch` lazily imports the
// reseal helper, which imports this module. A pending top-level await here
// would deadlock that cycle (Node exits 13, "unsettled top-level await").
if (invokedAsScript()) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`${error.code ?? 'SEAL_REBUILD_FAILED'}${error.message ? `: ${error.message}` : ''}`);
    process.exitCode = 1;
  });
}
