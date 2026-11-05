#!/usr/bin/env node

/** Deterministic cut of the @shine-mage/dsh-plugin-kit tarball from a clean commit.
 *
 * The kit is distributed as a private, `file:`-vendored tarball. Author repos
 * only consume the tarball, so one byte stream per version is the identity the
 * fleet pins. This entry stages `dsh-plugins/plugin-kit` from a Git commit
 * (never the caller's worktree), packs it with the pinned pnpm, and refuses to
 * print a digest unless the archive is reproducible and the public build
 * surface is intact.
 *
 * Checked here, fail-closed:
 * - the packed manifest exports ./toolchain, ./provenance, ./client-banner,
 *   ./packaged-dependencies and ./pin, and each target exists in the tarball;
 * - `packaged-dependencies.mjs` carries CONTRACT_PACKAGE_NAME (the constant the
 *   rc.5 author branches needed and the pre-a9980f3 cut lacked);
 * - every archive member is a regular file with mode 0644, uid/gid 0 and the
 *   portable 1985-10-26 mtime, so no caller timestamp can leak into the digest;
 * - a second, independent extraction of the same commit packs to the same
 *   bytes with the same pinned pnpm.
 *
 * Usage:
 *   node scripts/dsh-b0/cut-kit-artifact.mjs --commit <rev> --out <dir> [--pnpm /abs/pnpm]
 *   node scripts/dsh-b0/cut-kit-artifact.mjs --commit <rev> --dry-run
 *   node scripts/dsh-b0/cut-kit-artifact.mjs --commit <rev> --check [--manifest <path>]
 *
 * `--check` exits 1 while any author repo still vendors a different tarball;
 * it is the S0 drift gate, not a CI job (it is red by design before S0 runs).
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const KIT_PATH = 'dsh-plugins/plugin-kit';
const DEFAULT_MANIFEST = 'docs/operating/p4-s0-kit-vendored.v1.json';
const TAR_BLOCK = 512;
// pnpm/npm portable-tar constant: 1985-10-26T08:30:00Z.
const PORTABLE_MTIME = 499162500;
const PACKAGE_ROOT = 'package/';
const CONTRACT_PACKAGE_NAME = '@shine-mage/dsh-contracts';
const REQUIRED_EXPORTS = Object.freeze({
  './toolchain': './toolchain.mjs',
  './provenance': './provenance.mjs',
  './client-banner': './client-banner.mjs',
  './packaged-dependencies': './packaged-dependencies.mjs',
  './pin': './toolchain.json',
  './package.json': './package.json',
});
const REQUIRED_MEMBERS = Object.freeze(['package.json', 'toolchain.json', 'toolchain.mjs',
  'prepare.mjs', 'sdk-archive.py', 'package-manager.mjs', 'packaged-dependencies.mjs',
  'provenance.mjs', 'client-banner.mjs', 'README.md']);
const LIFECYCLE = Object.freeze(['prepack', 'postpack', 'prepare', 'prepublishOnly',
  'install', 'postinstall', 'preinstall']);
const SHA256 = /^[a-f0-9]{64}$/;

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function octal(header, offset, length) {
  const raw = header.subarray(offset, offset + length).toString('latin1').replace(/\0.*$/s, '').trim();
  return raw === '' ? 0 : Number.parseInt(raw, 8);
}

function text(header, offset, length) {
  return header.subarray(offset, offset + length).toString('utf8').replace(/\0.*$/s, '');
}

/** Parse a gzipped ustar archive into regular-file members with their headers. */
export function readKitTarGz(bytes) {
  const tar = gunzipSync(bytes);
  assert.ok(tar.length > TAR_BLOCK && tar.length % TAR_BLOCK === 0, 'KIT_TAR_BLOCK_ALIGNMENT');
  const entries = [], seen = new Set();
  for (let offset = 0; offset + TAR_BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + TAR_BLOCK);
    if (header.every(byte => byte === 0)) break;
    const name = text(header, 0, 100);
    assert.ok(name !== '', 'KIT_TAR_NAME');
    const prefix = text(header, 345, 500);
    const path = prefix ? `${prefix}/${name}` : name;
    assert.ok(path.startsWith(PACKAGE_ROOT), `KIT_TAR_ROOT ${path}`);
    const relative = path.slice(PACKAGE_ROOT.length);
    assert.ok(!relative.startsWith('/') && !relative.split('/').includes('..') && !relative.includes('\\'),
      `KIT_TAR_PATH ${path}`);
    assert.ok(!seen.has(relative), `KIT_TAR_DUPLICATE ${relative}`);
    seen.add(relative);
    const bytes_ = octal(header, 124, 12);
    assert.ok(offset + TAR_BLOCK + bytes_ <= tar.length, `KIT_TAR_TRUNCATED ${relative}`);
    const body = tar.subarray(offset + TAR_BLOCK, offset + TAR_BLOCK + bytes_);
    entries.push({
      path: relative,
      type: header.subarray(156, 157).toString('latin1') || '0',
      mode: octal(header, 100, 8),
      uid: octal(header, 108, 8),
      gid: octal(header, 116, 8),
      mtime: octal(header, 136, 12),
      uname: text(header, 265, 32),
      gname: text(header, 297, 32),
      bytes: bytes_,
      sha256: digest(body),
      body,
    });
    offset += TAR_BLOCK + Math.ceil(bytes_ / TAR_BLOCK) * TAR_BLOCK;
  }
  assert.ok(entries.length > 0, 'KIT_TAR_EMPTY');
  return entries;
}

/** The kit manifest is the contract the author repos build against. */
export function validateKitManifest(manifest) {
  assert.equal(manifest.name, '@shine-mage/dsh-plugin-kit', 'KIT_NAME');
  assert.match(manifest.version ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'KIT_VERSION');
  assert.equal(manifest.private, true, 'KIT_PRIVATE');
  assert.equal(manifest.type, 'module', 'KIT_TYPE');
  assert.ok(manifest.exports && typeof manifest.exports === 'object', 'KIT_EXPORTS');
  for (const [key, target] of Object.entries(REQUIRED_EXPORTS)) {
    assert.equal(manifest.exports[key], target, `KIT_EXPORT_MISSING ${key}`);
  }
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'KIT_FILES');
  assert.equal(new Set(manifest.files).size, manifest.files.length, 'KIT_FILES_DUPLICATE');
  for (const entry of manifest.files) {
    assert.match(entry, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/, `KIT_FILES_PATH ${entry}`);
  }
  for (const name of LIFECYCLE) {
    assert.equal(manifest.scripts?.[name], undefined, `KIT_LIFECYCLE_SCRIPT ${name}`);
  }
  const manager = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
  assert.ok(manager, 'KIT_PACKAGE_MANAGER');
  return { version: manifest.version, pnpm: manager[1] };
}

function exportTargets(exports) {
  const targets = [];
  const collect = value => {
    if (typeof value === 'string') { targets.push(value); return; }
    assert.ok(value && typeof value === 'object', 'KIT_EXPORT_TARGET');
    for (const child of Object.values(value)) collect(child);
  };
  collect(exports);
  return targets;
}

function declared(path, files) {
  if (path === 'package.json') return true;
  if (/^(?:README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?)$/.test(path)) return true;
  return files.includes(path) || files.some(entry => path.startsWith(entry.endsWith('/') ? entry : `${entry}/`));
}

/** Prove the archive is a normalized, complete kit and not a worktree snapshot. */
export function inspectKitMembers(manifest, entries) {
  const paths = entries.map(entry => entry.path);
  for (const entry of entries) {
    assert.equal(entry.type, '0', `KIT_MEMBER_TYPE ${entry.path}`);
    assert.equal(entry.mode, 0o644, `KIT_MEMBER_MODE ${entry.path}`);
    assert.equal(entry.uid, 0, `KIT_MEMBER_UID ${entry.path}`);
    assert.equal(entry.gid, 0, `KIT_MEMBER_GID ${entry.path}`);
    assert.equal(entry.mtime, PORTABLE_MTIME, `KIT_MEMBER_MTIME ${entry.path}`);
    assert.equal(entry.uname, '', `KIT_MEMBER_UNAME ${entry.path}`);
    assert.equal(entry.gname, '', `KIT_MEMBER_GNAME ${entry.path}`);
    assert.ok(declared(entry.path, manifest.files), `KIT_MEMBER_UNDECLARED ${entry.path}`);
    assert.ok(!/(?:^|\/)node_modules(?:\/|$)/.test(entry.path), `KIT_MEMBER_NODE_MODULES ${entry.path}`);
  }
  for (const name of REQUIRED_MEMBERS) assert.ok(paths.includes(name), `KIT_MEMBER_MISSING ${name}`);
  for (const target of exportTargets(manifest.exports)) {
    const path = target.replace(/^\.\//, '');
    assert.ok(paths.includes(path), `KIT_EXPORT_TARGET_MISSING ${target}`);
  }
  for (const entry of manifest.files) {
    const directory = !paths.includes(entry) && paths.some(path => path.startsWith(`${entry}/`));
    assert.ok(directory || paths.includes(entry), `KIT_FILES_MISSING ${entry}`);
  }
  const binding = entries.find(entry => entry.path === 'packaged-dependencies.mjs');
  assert.ok(binding, 'KIT_MEMBER_MISSING packaged-dependencies.mjs');
  const source = binding.body.toString('utf8');
  assert.match(source, /export\s+const\s+CONTRACT_PACKAGE_NAME\s*=\s*'@shine-mage\/dsh-contracts'/, 'KIT_CONTRACT_PACKAGE_NAME');
  const packed = JSON.parse(entries.find(entry => entry.path === 'package.json').body.toString('utf8'));
  assert.equal(packed.name, manifest.name, 'KIT_PACKED_NAME');
  assert.equal(packed.version, manifest.version, 'KIT_PACKED_VERSION');
  return { exports: Object.keys(REQUIRED_EXPORTS), contract_package_name: CONTRACT_PACKAGE_NAME, members: paths.length };
}

function packEnvironment() {
  const allowed = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'COREPACK_HOME', 'COREPACK_ENABLE_DOWNLOAD_PROMPT',
      'COREPACK_ENABLE_AUTO_PIN', 'COREPACK_DEFAULT_TO_LATEST', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
      'LANG', 'LC_ALL'].includes(key)));
  return { ...allowed, CI: '1', NO_COLOR: '1', COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', COREPACK_ENABLE_AUTO_PIN: '0',
    npm_config_userconfig: '/dev/null', npm_config_globalconfig: '/dev/null' };
}

async function git(args, cwd = root) {
  const { stdout } = await exec('git', ['--no-optional-locks', '-C', cwd, ...args], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' },
  });
  return stdout.trim();
}

async function extract(commit, destination, repo) {
  await mkdir(destination, { recursive: true });
  const tarPath = join(destination, 'kit.tar');
  await git(['archive', '--format=tar', '--output', tarPath, commit, KIT_PATH], repo);
  await exec('tar', ['-xf', tarPath, '-C', destination], { timeout: 30000 });
  const kit = join(destination, KIT_PATH);
  const manifest = JSON.parse(await readFile(join(kit, 'package.json'), 'utf8'));
  const toolchain = JSON.parse(await readFile(join(kit, 'toolchain.json'), 'utf8'));
  return { kit, manifest, toolchain };
}

async function pack(stage, destination, pnpm, manifest) {
  await mkdir(destination, { recursive: true });
  const { stdout, stderr } = await exec(pnpm, ['pack', '--pack-destination', destination], {
    cwd: stage, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    env: packEnvironment(),
  });
  const expected = `${manifest.name.slice(1).replace('/', '-')}-${manifest.version}.tgz`;
  const files = await readdir(destination);
  assert.deepEqual(files, [expected], `KIT_PACK_OUTPUT ${stdout}${stderr}`);
  return join(destination, expected);
}

async function pnpmVersion(pnpm) {
  const { stdout } = await exec(pnpm, ['--version'], { encoding: 'utf8', timeout: 30000, env: packEnvironment() });
  return stdout.trim();
}

/** Cut the kit from `commit`; returns the digest and never reads the worktree. */
export async function cutKitArtifact({ repo = root, commit = 'HEAD', out, pnpm = 'pnpm', verifyRepro = true, dryRun = false } = {}) {
  const sha = await git(['rev-parse', '--verify', `${commit}^{commit}`], repo);
  const subject = await git(['show', '-s', '--format=%s', sha], repo);
  const work = await mkdtemp(join(tmpdir(), 'p4-kit-cut-'));
  try {
    const first = await extract(sha, join(work, 'a'), repo);
    const pin = validateKitManifest(first.manifest);
    assert.equal(first.toolchain.pnpm, pin.pnpm, 'KIT_TOOLCHAIN_PNPM');
    assert.equal(Number(process.versions.node.split('.')[0]), first.toolchain.node_major, 'KIT_NODE_MAJOR');
    assert.equal(await pnpmVersion(pnpm), pin.pnpm, `KIT_PNPM_VERSION ${pnpm}`);
    const tarball = await pack(first.kit, join(work, 'out-a'), pnpm, first.manifest);
    const bytes = await readFile(tarball);
    const entries = readKitTarGz(bytes);
    const surface = inspectKitMembers(first.manifest, entries);
    const result = {
      schema: 'shinemage-kit-cut/v1',
      package: first.manifest.name,
      version: pin.version,
      commit: { sha, subject },
      pin: { node: first.toolchain.node_major, pnpm: pin.pnpm },
      sha256: digest(bytes),
      bytes: bytes.length,
      entries: entries.length,
      tarball: basename(tarball),
      written: null,
      surface,
      reproducible: null,
    };
    if (verifyRepro) {
      const second = await extract(sha, join(work, 'b'), repo);
      const again = await pack(second.kit, join(work, 'out-b'), pnpm, second.manifest);
      const other = await readFile(again);
      assert.equal(digest(other), result.sha256, 'KIT_REPRO_DIGEST');
      assert.equal(other.length, result.bytes, 'KIT_REPRO_BYTES');
      result.reproducible = { sha256: digest(other), bytes: other.length, identical: true };
    }
    if (dryRun) return result;
    assert.ok(typeof out === 'string' && out !== '', 'KIT_OUT_REQUIRED');
    const destination = isAbsolute(out) ? out : resolve(out);
    await mkdir(destination, { recursive: true });
    const target = join(destination, result.tarball);
    try {
      const existing = await readFile(target);
      assert.equal(digest(existing), result.sha256, `KIT_OUTPUT_EXISTS ${target}`);
      result.written = { path: target, status: 'UNCHANGED' };
      return result;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await writeFile(target, bytes, { mode: 0o644, flag: 'wx' });
    result.written = { path: target, status: 'WRITTEN' };
    return result;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Compare a cut against the recorded author-vendor state. */
export function checkVendored({ summary, manifest, manifestPath = DEFAULT_MANIFEST }) {
  assert.equal(manifest?.schema, 'shinemage-kit-vendored/v1', 'KIT_VENDORED_SCHEMA');
  assert.equal(manifest.package, summary.package, 'KIT_VENDORED_PACKAGE');
  assert.ok(String(summary.sha256).match(SHA256), 'KIT_VENDORED_CUT');
  const rows = [];
  for (const repo of manifest.repos ?? []) {
    assert.match(repo.repository ?? '', /^tyuanww\/[a-z0-9-]+$/, 'KIT_VENDORED_REPOSITORY');
    for (const [name, vendor] of [['main', repo.main], ['pr', repo.pr]]) {
      assert.ok(vendor && typeof vendor === 'object', `KIT_VENDORED_REF ${repo.repository} ${name}`);
      assert.match(vendor.sha256 ?? '', SHA256, `KIT_VENDORED_SHA ${repo.repository} ${name}`);
      assert.ok(Number.isSafeInteger(vendor.bytes) && vendor.bytes > 0, `KIT_VENDORED_BYTES ${repo.repository} ${name}`);
      rows.push({ repository: repo.repository, ref: name, head: vendor.head ?? null,
        tarball: vendor.tarball ?? null, expected_sha256: vendor.sha256, expected_bytes: vendor.bytes,
        actual_sha256: summary.sha256, status: vendor.sha256 === summary.sha256 ? 'MATCH' : 'DRIFT' });
    }
  }
  assert.ok(rows.length > 0, 'KIT_VENDORED_EMPTY');
  const authoritative = manifest.authoritative ?? {};
  assert.match(authoritative.sha256 ?? '', SHA256, 'KIT_VENDORED_AUTHORITATIVE');
  const authoritativeMatch = authoritative.sha256 === summary.sha256 && authoritative.bytes === summary.bytes;
  const drift = rows.filter(row => row.status === 'DRIFT');
  return {
    schema: 'shinemage-kit-check/v1',
    manifest: manifestPath,
    authoritative: { sha256: summary.sha256, bytes: summary.bytes },
    manifest_authoritative: { sha256: authoritative.sha256, bytes: authoritative.bytes ?? null },
    authoritative_match: authoritativeMatch,
    rows,
    drift: drift.length,
    ok: authoritativeMatch && drift.length === 0,
  };
}

const USAGE = `Usage:
  node scripts/dsh-b0/cut-kit-artifact.mjs --commit <rev> --out <dir> [--pnpm /abs/pnpm] [--no-verify-repro]
  node scripts/dsh-b0/cut-kit-artifact.mjs --commit <rev> --dry-run
  node scripts/dsh-b0/cut-kit-artifact.mjs --commit <rev> --check [--manifest <path>]`;

function parse(argv) {
  const options = { commit: 'HEAD', dryRun: false, check: false, verifyRepro: true, pnpm: 'pnpm' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { console.log(USAGE); process.exit(0); }
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--no-verify-repro') options.verifyRepro = false;
    else if (arg === '--commit') options.commit = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--pnpm') options.pnpm = argv[++i];
    else if (arg === '--manifest') options.manifest = argv[++i];
    else throw new Error(`KIT_CUT_UNKNOWN_ARGUMENT ${arg}`);
  }
  assert.ok(options.commit, 'KIT_CUT_COMMIT_REQUIRED');
  return options;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath !== modulePath) {
  // Imported by tests: export only.
} else {
  try {
    const options = parse(process.argv.slice(2));
    assert.ok(options.dryRun || options.check || options.out, USAGE);
    const summary = await cutKitArtifact({ commit: options.commit, out: options.out, pnpm: options.pnpm,
      verifyRepro: options.verifyRepro, dryRun: options.dryRun || options.check });
    if (!options.check) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      const manifestPath = options.manifest ?? join(root, DEFAULT_MANIFEST);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const report = checkVendored({ summary, manifest, manifestPath: options.manifest ?? DEFAULT_MANIFEST });
      console.log(JSON.stringify({ cut: { sha256: summary.sha256, bytes: summary.bytes, commit: summary.commit }, ...report }, null, 2));
      process.exitCode = report.ok ? 0 : 1;
    }
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 2;
  }
}
