import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DSH_UPSTREAM_SHA, UPSTREAM_PNPM_VERSION, NODE_MAJOR } from './toolchain.mjs';

const exec = promisify(execFile);
const MAX_TARBALL = 64 * 1024 * 1024;
const omitted = /^(?:\.git|\.env(?:\..*)?|\.npmrc|credentials?(?:[-_.].*)?|private[-_]?key(?:[-_.].*)?|cookie(?:[-_.].*)?|.*\.duckdb(?:\.wal)?|.*\.sqlite(?:-wal|-shm)?|.*\.log)$/i;
const sourceModule = /^(?:credentials?|cookie)(?:[-_.].*)?\.(?:[cm]?[jt]sx?|map)$/i;
const hash = value => createHash('sha256').update(value).digest('hex');

/** Fail closed on lock formats outside the pinned pnpm resolution contract. */
export function directTarballInputs(lock) {
  const inputs = [];
  for (const match of lock.matchAll(/\bresolution:\s*\{([^}\n]+)\}/g)) {
    if (!/\btarball:/.test(match[1])) continue;
    const url = match[1].match(/\btarball:\s*(https:\/\/[^,\s}'"]+)/)?.[1];
    const integrity = match[1].match(/\bintegrity:\s*(sha512-[A-Za-z0-9+/]+={0,2})(?:,|\s|$)/)?.[1];
    assert.ok(url && integrity, 'RUNTIME_DIRECT_TARBALL_LOCK_INVALID');
    const parsed = new URL(url);
    assert.ok(!parsed.username && !parsed.password && !parsed.hash && !parsed.search, 'RUNTIME_DIRECT_TARBALL_URL_INVALID');
    assert.equal(Buffer.from(integrity.slice(7), 'base64').length, 64, 'RUNTIME_DIRECT_TARBALL_INTEGRITY_INVALID');
    inputs.push({ url, integrity, name: `${hash(`${url}\n${integrity}`)}.tgz` });
  }
  assert.equal(inputs.length, [...lock.matchAll(/\btarball:/g)].length, 'RUNTIME_DIRECT_TARBALL_LOCK_UNSUPPORTED');
  const byUrl = new Map();
  for (const input of inputs) {
    assert.ok(!byUrl.has(input.url) || byUrl.get(input.url).integrity === input.integrity, 'RUNTIME_DIRECT_TARBALL_LOCK_CONFLICT');
    byUrl.set(input.url, input);
  }
  return [...byUrl.values()];
}

export function runtimeInputCache(upstream) { return join(dirname(resolve(upstream)), 'runtime-inputs'); }

export function runtimeDeployArgs(destination, { online = false } = {}) {
  // Modern deploy derives a frozen closure from workspace importer snapshots.
  // Legacy deploy re-resolves ranges and needs mutable registry metadata.
  return ['pnpm', 'deploy', '--config.inject-workspace-packages=true', '--ignore-scripts',
    ...(!online ? ['--offline', '--trust-lockfile'] : []), '--registry=https://registry.npmjs.org',
    '--filter', '@deepseek-ai/dsh', '--prod', destination];
}

async function preparationIdentity(upstream) {
  return {
    schema_version: 'dsh-runtime-preparation/v1', upstream_sha: DSH_UPSTREAM_SHA,
    lock_sha256: hash(await readFile(join(upstream, 'pnpm-lock.yaml'))),
    policy_sha256: hash(await readFile(join(upstream, 'pnpm-workspace.yaml'))),
    pnpm: UPSTREAM_PNPM_VERSION, node_major: NODE_MAJOR,
  };
}

/** Called by pipeline only after frozen install/build and source checks pass. */
export async function recordRuntimePreparation(upstream) {
  const identity = await preparationIdentity(upstream);
  const cache = runtimeInputCache(upstream);
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(join(cache, '.preparation-'));
  try {
    const temporary = join(work, 'receipt.json');
    await writeFile(temporary, JSON.stringify({ ...identity, status: 'PREPARED', verified_at: new Date().toISOString() }) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, join(cache, `prepared-${identity.lock_sha256}.json`));
  } finally { await rm(work, { recursive: true, force: true }); }
}

export async function verifyRuntimePreparation(upstream) {
  const identity = await preparationIdentity(upstream);
  const path = join(runtimeInputCache(upstream), `prepared-${identity.lock_sha256}.json`);
  const info = await lstat(path).catch(error => {
    if (error.code === 'ENOENT') throw new Error('RUNTIME_PREPARATION_REQUIRED run pinned pipeline --prepare');
    throw error;
  });
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 4096, 'RUNTIME_PREPARATION_INVALID');
  const proof = JSON.parse(await readFile(path, 'utf8'));
  for (const [key, value] of Object.entries(identity)) assert.equal(proof[key], value, `RUNTIME_PREPARATION_MISMATCH ${key}`);
  assert.equal(proof.status, 'PREPARED', 'RUNTIME_PREPARATION_INVALID');
  assert.ok(Number.isFinite(Date.parse(proof.verified_at)), 'RUNTIME_PREPARATION_INVALID');
  return proof;
}

export async function verifyDirectTarball(path, input) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= MAX_TARBALL, 'RUNTIME_DIRECT_TARBALL_FILE_INVALID');
  const bytes = await readFile(path);
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, input.integrity, 'RUNTIME_DIRECT_TARBALL_INTEGRITY_MISMATCH');
  return bytes;
}

/** Explicit online preparation caches original, lock-verified archives only. */
export async function prepareRuntimeInputs(upstream) {
  const inputs = directTarballInputs(await readFile(join(upstream, 'pnpm-lock.yaml'), 'utf8'));
  const cache = runtimeInputCache(upstream);
  await mkdir(cache, { recursive: true, mode: 0o700 });
  for (const input of inputs) {
    const target = join(cache, input.name);
    try { await verifyDirectTarball(target, input); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const work = await mkdtemp(join(cache, '.download-'));
    try {
      const temporary = join(work, 'original.tgz');
      await exec('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https',
        '--connect-timeout', '20', '--max-time', '120', '--max-filesize', String(MAX_TARBALL), '--output', temporary, input.url], { timeout: 125000 });
      await verifyDirectTarball(temporary, input);
      try { await link(temporary, target); }
      catch (error) { if (error.code !== 'EEXIST') throw error; await verifyDirectTarball(target, input); }
    } finally { await rm(work, { recursive: true, force: true }); }
  }
  return { archives: inputs.length, integrity: 'sha512', network: 'prepare-only' };
}

/** Copy prepared bytes, including dependencies, without mutable links to source. */
export async function stageRuntimeWorkspace(upstream, stage) {
  const source = resolve(upstream);
  const target = resolve(stage);
  assert.ok(target !== source && !target.startsWith(`${source}/`) && !source.startsWith(`${target}/`), 'RUNTIME_STAGE_OVERLAP');
  const links = [];
  await cp(source, target, { recursive: true, dereference: false, verbatimSymlinks: true,
    force: false, errorOnExist: true, mode: constants.COPYFILE_FICLONE,
    filter: async path => {
      const info = await lstat(path);
      // credential/cookie source modules are pinned code, not credential data.
      // Keep them for package exports; final runtime bytes still get scanned.
      if (path !== source && (basename(path) === '.git' || (!info.isDirectory() && omitted.test(basename(path)) && !sourceModule.test(basename(path))))) return false;
      if (info.isSymbolicLink()) {
        const resolved = resolve(dirname(path), await readlink(path));
        assert.ok(resolved.startsWith(`${source}/`), `RUNTIME_STAGE_EXTERNAL_LINK ${relative(source, path)}`);
        links.push({ path: join(target, relative(source, path)), to: join(target, relative(source, resolved)) });
      } else assert.ok(info.isDirectory() || info.isFile(), 'RUNTIME_STAGE_SPECIAL_FILE');
      return true;
    },
  });
  for (const item of links) {
    await rm(item.path);
    await symlink(relative(dirname(item.path), item.to), item.path);
  }
  return target;
}

/** Rewrite only private staged metadata; exact archive bytes come from cache. */
export async function bindRuntimeInputs(upstream, stage, work) {
  const inputs = directTarballInputs(await readFile(join(upstream, 'pnpm-lock.yaml'), 'utf8'));
  const bindings = [];
  await mkdir(join(work, 'direct-tarballs'), { recursive: true });
  for (const input of inputs) {
    const cached = join(runtimeInputCache(upstream), input.name);
    try { await verifyDirectTarball(cached, input); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('RUNTIME_DIRECT_TARBALL_NOT_PREPARED run pinned pipeline --prepare');
      throw error;
    }
    const archive = join(work, 'direct-tarballs', input.name);
    await copyFile(cached, archive, constants.COPYFILE_EXCL);
    await verifyDirectTarball(archive, input);
    bindings.push({ ...input, replacement: `file:${archive}` });
  }
  const changed = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === 'package.json' || entry.name === 'pnpm-lock.yaml') {
        assert.ok(entry.isFile(), 'RUNTIME_STAGE_METADATA_LINK');
        const bytes = await readFile(path);
        let text = bytes.toString('utf8');
        for (const input of bindings) text = text.split(input.url).join(input.replacement);
        if (text !== bytes.toString('utf8')) { changed.push({ path, bytes }); await writeFile(path, text); }
      }
    }
  }
  await walk(stage);
  return async () => { for (const item of changed) await writeFile(item.path, item.bytes); };
}
