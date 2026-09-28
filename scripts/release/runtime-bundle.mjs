#!/usr/bin/env node

/** Build the immutable, production-only DSH runtime closure from a pinned checkout. */
import assert from 'node:assert/strict';
import { access, cp, lstat, mkdir, mkdtemp, readdir, readlink, rm, stat, symlink } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const execFile = promisify(execFileCallback);
const PIN = '477b4f420553e8a52c2fbccc464d7561b239c443';
const REQUIRED = [
  'lib/bin.js',
  'node_modules/@deepseek-ai/dsh-base/lib/index.js',
  'node_modules/@deepseek-ai/dsh-web-app/lib/index.js',
  'node_modules/.pnpm',
];

async function materializeExternalSymlinks(deployed, upstream, pinnedSha) {
  const deployedRoot = resolve(deployed);
  const upstreamRoot = resolve(upstream);
  const externalRoot = join(deployedRoot, '.runtime-external');
  const copied = new Map();
  const verifiedRoots = new Map();
  async function findPinnedRoot(target) {
    let current = target;
    while (true) {
      if (verifiedRoots.has(current)) return verifiedRoots.get(current);
      if (await access(join(current, '.git')).then(() => true, () => false)) {
        const sha = await execFile('git', ['-C', current, 'rev-parse', 'HEAD']).then(result => result.stdout.trim(), () => null);
        const root = sha === pinnedSha ? current : null;
        verifiedRoots.set(current, root);
        if (root) return root;
      }
      const parent = dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
  async function resolvedTarget(path) {
    let current = path;
    const visited = new Set();
    for (let depth = 0; depth < 64; depth += 1) {
      if (visited.has(current)) throw new Error(`RUNTIME_LINK_CYCLE ${path}`);
      visited.add(current);
      const info = await lstat(current).catch(error => {
        if (error.code === 'ENOENT') throw new Error(`RUNTIME_LINK_BROKEN ${path}`);
        throw error;
      });
      if (!info.isSymbolicLink()) return resolve(current);
      current = resolve(dirname(current), await readlink(current));
    }
    throw new Error(`RUNTIME_LINK_DEPTH ${path}`);
  }
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await resolvedTarget(path);
        const inside = target === deployedRoot || target.startsWith(`${deployedRoot}/`);
        if (inside) continue;
        const allowedRoot = target === upstreamRoot || target.startsWith(`${upstreamRoot}/`) ? upstreamRoot : await findPinnedRoot(target);
        if (!allowedRoot) throw new Error(`RUNTIME_EXTERNAL_LINK_FORBIDDEN ${path}`);
        const targetRelative = relative(allowedRoot, target).split('/').join('/');
        if (!targetRelative || targetRelative === '.git' || targetRelative.startsWith('.git/')) throw new Error(`RUNTIME_EXTERNAL_TARGET_FORBIDDEN ${targetRelative}`);
        if (/(^|\/)(?:\.env(?:\.|$)|\.npmrc(?:$|\/)|credentials?(?:[-_.]|$)|private[-_]?key(?:[-_.]|$)|cookie(?:[-_.]|$)|.*\.duckdb(?:\.wal)?$|.*\.sqlite(?:-wal|-shm)?$|.*\.log$)/i.test(targetRelative)) throw new Error(`RUNTIME_EXTERNAL_DENYLIST ${targetRelative}`);
        let replacement = copied.get(targetRelative);
        let created = false;
        if (!replacement) {
          replacement = join(externalRoot, targetRelative);
          await mkdir(dirname(replacement), { recursive: true });
          const existing = await lstat(replacement).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
          if (existing?.isDirectory()) {
            await mergeMissing(target, replacement);
          } else if (existing) {
            throw new Error(`RUNTIME_EXTERNAL_COLLISION ${targetRelative}`);
          } else {
            await cp(target, replacement, { recursive: true, dereference: false, force: false, errorOnExist: true });
          }
          copied.set(targetRelative, replacement);
          created = true;
        }
        if (created && (await lstat(replacement)).isDirectory()) await walk(replacement);
        const linkTarget = relative(dirname(path), replacement) || '.';
        await rm(path);
        await symlink(linkTarget, path);
      } else if (entry.isDirectory()) {
        await walk(path);
      }
    }
  }
  const peerSource = join(upstreamRoot, 'node_modules/.pnpm/node_modules/@deepseek-ai/cordis-plugin-group');
  const peerDestination = join(deployedRoot, 'node_modules/@deepseek-ai/cordis-plugin-group');
  if (!await access(peerSource).then(() => true, () => false)) throw new Error('RUNTIME_REQUIRED_PEER_MISSING @deepseek-ai/cordis-plugin-group');
  if (!await lstat(peerDestination).then(() => true, () => false)) {
    await mkdir(dirname(peerDestination), { recursive: true });
    await cp(peerSource, peerDestination, { recursive: true, dereference: false, force: false, errorOnExist: true });
  }
  await walk(deployedRoot);
  if (await access(externalRoot).then(() => true, () => false)) await walk(externalRoot);
  return { external_targets: copied.size };
}

function option(name) {
  const index = process.argv.indexOf(name);
  assert.ok(index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `${name.slice(2).toUpperCase()}_REQUIRED`);
  return resolve(process.argv[index + 1]);
}

const upstream = option('--upstream');
const output = option('--output');
assert.equal(process.argv.filter(arg => arg.startsWith('--')).length, 2, 'RUNTIME_BUNDLE_OPTION_UNKNOWN');
assert.equal(await access(join(upstream, '.git')).then(() => true, () => false), true, 'UPSTREAM_CHECKOUT_REQUIRED');
const upstreamSha = (await execFile('git', ['-C', upstream, 'rev-parse', 'HEAD'])).stdout.trim();
assert.equal(upstreamSha, PIN, 'UPSTREAM_SHA_MISMATCH');
const outputInfo = await stat(output).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
assert.equal(outputInfo, null, 'RUNTIME_BUNDLE_OUTPUT_EXISTS');
await mkdir(resolve(output, '..'), { recursive: true });

const work = await mkdtemp(join(tmpdir(), 'dsh-runtime-bundle-'));
const deployed = join(work, 'dsh');
try {
  await execFile('corepack', ['pnpm', 'deploy', '--legacy', '--offline', '--filter', '@deepseek-ai/dsh', '--prod', deployed], {
    cwd: upstream,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1' },
    maxBuffer: 4 * 1024 * 1024,
  });
  const materialized = await materializeExternalSymlinks(deployed, upstream, upstreamSha);
  for (const path of REQUIRED) await access(join(deployed, path));
  await execFile('tar', ['--zstd', '--no-xattrs', '--no-acls', '-cf', output, '-C', deployed, '.'], { maxBuffer: 4 * 1024 * 1024 });
  const info = await stat(output);
  assert.ok(info.size > 0, 'RUNTIME_BUNDLE_EMPTY');
  console.log(JSON.stringify({ status: 'BUILT', upstream_sha: upstreamSha, path: output, bytes: info.size, ...materialized }));
} finally {
  await rm(work, { recursive: true, force: true });
}
