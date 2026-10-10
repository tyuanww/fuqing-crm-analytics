/** Read-only verification of a digest-pinned, reduced development SDK. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, readdir, readlink, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export const CLOSURE_SCHEMA = 'shinemage-development-sdk-closure/v1';
export const CLOSURE_LIMITS = Object.freeze({ entries: 100000, bytes: 1024 ** 3, file: 64 * 1024 ** 2, manifest: 32 * 1024 ** 2 });
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const need = (ok, code) => assert.ok(ok, `KIT_CLOSURE_${code}`);
const fields = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).sort().join(',') === [...keys].sort().join(',');
export function closurePath(name) {
  need(typeof name === 'string' && name.length <= 1024 && !/[\\:\x00-\x1f\x7f]/.test(name)
    && name.split('/').every(part => part && part !== '.' && part !== '..')
    && ['upstream', 'build-tools', 'corepack'].includes(name.split('/')[0]), 'PATH');
  return name;
}

/** Bounded, no-follow read. An expected digest comes from the caller's pinned manifest. */
export async function readClosureFile(path, row) {
  need(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= CLOSURE_LIMITS.file && hex(row.sha256), 'FILE_LIMIT');
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await fd.stat();
    need(info.isFile() && info.size === row.bytes, 'FILE');
    const buffer = Buffer.alloc(row.bytes + 1); let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await fd.read(buffer, count, buffer.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    need(count === row.bytes && sha256(buffer.subarray(0, count)) === row.sha256, 'DIGEST');
    return buffer.subarray(0, count);
  } finally { await fd.close(); }
}

export async function verifySdkClosure(root, expectedSha, pinBytes) {
  need(hex(expectedSha), 'EXPECTED_DIGEST');
  need((await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(), 'ROOT');
  root = await realpath(root);
  const file = join(root, 'sdk-closure.json'), info = await lstat(file);
  need(info.isFile() && !info.isSymbolicLink() && info.size <= CLOSURE_LIMITS.manifest, 'MANIFEST_LIMIT');
  const bytes = await readClosureFile(file, { bytes: info.size, sha256: expectedSha });
  const manifest = JSON.parse(bytes), pin = JSON.parse(pinBytes);
  need(fields(manifest, ['schema', 'scope', 'upstream_sha', 'pin_sha256', 'source_archive_sha256', 'platform', 'arch', 'node_major', 'entries']), 'SCHEMA');
  need(manifest.schema === CLOSURE_SCHEMA && manifest.scope === 'development-build-only', 'SCHEMA');
  need(manifest.upstream_sha === pin.upstream_sha && manifest.pin_sha256 === sha256(pinBytes)
    && manifest.platform === process.platform && manifest.arch === process.arch && manifest.node_major === pin.node_major
    && manifest.node_major === Number(process.versions.node.split('.')[0]) && hex(manifest.source_archive_sha256), 'IDENTITY');
  need(manifest.entries && typeof manifest.entries === 'object' && !Array.isArray(manifest.entries), 'ENTRIES');
  const rows = Object.entries(manifest.entries); need(rows.length > 0 && rows.length <= CLOSURE_LIMITS.entries, 'ENTRY_LIMIT');
  let total = 0;
  for (const [name, row] of rows) {
    closurePath(name);
    need(row && typeof row === 'object', 'ENTRY');
    if (row.kind === 'file') {
      need(fields(row, ['kind', 'bytes', 'sha256', 'mode']) && Number.isSafeInteger(row.bytes) && row.bytes >= 0
        && row.bytes <= CLOSURE_LIMITS.file && hex(row.sha256) && [0o644, 0o755].includes(row.mode), 'FILE');
      total += row.bytes; need(total <= CLOSURE_LIMITS.bytes, 'BYTE_LIMIT');
    } else if (row.kind === 'dir') need(fields(row, ['kind']), 'DIRECTORY');
    else need(row.kind === 'link' && fields(row, ['kind', 'target']) && typeof row.target === 'string'
      && row.target.length <= 1024 && !isAbsolute(row.target) && !/[\\:\x00-\x1f\x7f]/.test(row.target), 'LINK');
  }
  // Resolve every component in the declared graph before realpath can consult
  // the filesystem. A final target inside the SDK does not prove that an
  // intermediate link stayed inside, or that its bytes were pinned.
  function declaredTarget(name) {
    let pending = name.split('/'), parts = [], hops = 0;
    while (pending.length) {
      const part = pending.shift();
      if (part === '' || part === '.') continue;
      if (part === '..') {
        need(parts.length > 0, 'LINK_ESCAPE'); parts.pop(); continue;
      }
      parts.push(part);
      const path = parts.join('/'), row = Object.hasOwn(manifest.entries, path) && manifest.entries[path];
      need(row, 'LINK_TARGET');
      if (row.kind === 'link') {
        need(++hops < 64, 'LINK_CYCLE');
        parts.pop(); pending = [...row.target.split('/'), ...pending];
      } else need(!pending.length || row.kind === 'dir', 'LINK_PARENT');
    }
    need(parts.length > 0, 'LINK_TARGET');
    return parts.join('/');
  }
  const linkTargets = new Map(rows.filter(([, row]) => row.kind === 'link')
    .map(([name]) => [name, declaredTarget(name)]));
  const seen = new Set();
  async function walk(name) {
    closurePath(name);
    const row = manifest.entries[name]; need(row && !seen.has(name), 'UNDECLARED_PATH'); seen.add(name);
    const path = join(root, name), info = await lstat(path);
    if (row.kind === 'dir') {
      need(info.isDirectory() && !info.isSymbolicLink(), 'DIRECTORY');
      for (const child of await readdir(path)) await walk(`${name}/${child}`);
    } else if (row.kind === 'file') {
      need(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o7777) === row.mode, 'FILE');
      await readClosureFile(path, row);
    } else {
      need(info.isSymbolicLink() && await readlink(path) === row.target, 'LINK');
      const target = relative(root, await realpath(path));
      need(target && !isAbsolute(target) && target !== '..' && !target.startsWith('..' + sep)
        && target.split(sep).join('/') === linkTargets.get(name), 'LINK_ESCAPE');
    }
  }
  for (const part of ['upstream', 'build-tools', 'corepack']) await walk(part);
  need(seen.size === rows.length, 'MISSING_ENTRY');
  // The fixed upstream lock remains part of the payload, even without a Git checkout.
  need(sha256(await readFile(join(root, 'upstream/pnpm-lock.yaml'))) === pin.upstream_lock_sha256, 'LOCK');
  return { entries: rows.length, bytes: total, source_archive_sha256: manifest.source_archive_sha256 };
}
