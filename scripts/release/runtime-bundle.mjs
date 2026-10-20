#!/usr/bin/env node

/** Build the immutable, production-only DSH runtime closure from a pinned checkout. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runtimeVendorAssignmentAllowlist, scanText } from './secret-scan.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA as PIN } from './toolchain.mjs';
import { bindRuntimeInputs, prepareRuntimeInputs, runtimeDeployArgs, runtimeSourceTree, stageRuntimeWorkspace, verifyRuntimePreparation } from './runtime-inputs.mjs';
import { canonicalTreeDigest, GENERATED_PROVENANCE_SCHEMA } from './generated-provenance.mjs';
import { comparablePackageBytes } from './runtime-package-identity.mjs';
import { assertPeerAliasesPresent } from './runtime-peer-aliases.mjs';
import { pruneUnsupportedLinuxNative, rewriteGeneratedPathShims, verifyPortableLinuxRuntime } from './runtime-portability.mjs';

const execFile = promisify(execFileCallback);
const REQUIRED = [
  'lib/bin.js',
  'node_modules/@deepseek-ai/dsh-base/lib/index.js',
  'node_modules/@deepseek-ai/dsh-web-app/lib/index.js',
  'node_modules/.pnpm',
];
const SENSITIVE_BASENAME = /^(?:\.env(?:\..*)?|\.npmrc|private[-_]?key(?:[-_.].*)?|cookie(?:[-_.].*)?|.*\.duckdb(?:\.wal)?|.*\.sqlite(?:-wal|-shm)?|.*\.log)$/i;
const DEVELOPMENT_SEGMENT = /(^|\/)(?:test|tests|__tests__|stress-tests|docs|reference|benchmarks)(?:\/|$)/i;
const DEVELOPMENT_FILE = /(?:^\._|\.map|\.test\.[cm]?[jt]sx?|\.spec\.[cm]?[jt]sx?|\.tsx?|\.mts|\.cts|\.md|\.mdx|\.toml|^tsconfig(?:\..*)?$|^vite\.config\..*)$/i;
const TEXT_FILE = /\.(?:cjs|css|html|ini|json|js|mjs|mts|sh|txt|ts|tsx|yaml|yml)$/i;
const MAX_TEXT_SCAN_BYTES = 16 * 1024 * 1024;

// External web plugins declare these packages through `dsh.client.inject`.
// They are not runtime production dependencies of the CLI, so `pnpm deploy
// --prod` omits them even though the profile loader must resolve them from an
// installed bundle. Keep this closure explicit and small: it makes the
// runtime self-contained for the supported web-plugin contract without
// pulling every optional workspace package into production.
const EXTERNAL_WEB_PLUGIN_PEER_ALIASES = Object.freeze([
  'dsh-api-session-controller',
  'dsh-api-workspace-files',
  'dsh-client-connection',
  'dsh-client-ui-conversation',
  'dsh-client-ui-layout',
  'dsh-client-ui-renderer',
  'dsh-client-ui-sidebar',
  'dsh-client-ui-sidebar-right',
  'dsh-client-ui-slots',
  'dsh-client-ui-theme',
  'dsh-client-ui-tool',
  'dsh-client-ui-workspace',
  'dsh-tools',
]);

function relativePath(root, path) { return relative(root, path).split('\\').join('/'); }

async function pruneDevelopmentFiles(root) {
  let removed = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const rel = relativePath(root, path);
      const basename = entry.name;
      const requiredRuntimeFile = basename === 'cordis.patch.yml';
      if (entry.isSymbolicLink() && !await access(path).then(() => true, () => false)) {
        await rm(path, { force: true });
        removed += 1;
        continue;
      }
      if (!requiredRuntimeFile && (SENSITIVE_BASENAME.test(basename) || DEVELOPMENT_SEGMENT.test(rel) || DEVELOPMENT_FILE.test(basename))) {
        await rm(path, { recursive: true, force: true });
        removed += 1;
        continue;
      }
      if (entry.isDirectory()) await walk(path);
    }
  }
  await walk(root);
  return removed;
}

async function scanRuntimeTree(root) {
  let files = 0;
  let scannedBytes = 0;
  const findings = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const rel = relativePath(root, path);
      if (SENSITIVE_BASENAME.test(entry.name)) throw new Error(`RUNTIME_DENY_NAME ${rel}`);
      if (entry.isSymbolicLink() && !await access(path).then(() => true, () => false)) throw new Error(`RUNTIME_LINK_BROKEN ${rel}`);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      const info = await stat(path);
      if (TEXT_FILE.test(entry.name)) {
        if (info.size > MAX_TEXT_SCAN_BYTES) throw new Error(`RUNTIME_SCAN_FILE_LIMIT ${rel}`);
        scannedBytes += info.size;
        // Scan vendor assignments too. `scanText` has a narrow allowlist for
        // protocol identifiers observed in pinned third-party bundles; turning
        // assignment scanning off for an entire directory would let a real
        // API_KEY/PASSWORD value through the immutable runtime artifact.
        const bytes = await readFile(path);
        findings.push(...scanText(bytes.toString('utf8'), rel, {
          assignmentAllowlist: runtimeVendorAssignmentAllowlist(rel, bytes),
        }));
      }
    }
  }
  await walk(root);
  if (findings.length) throw new Error(`RUNTIME_SECRET_SCAN_FAILED ${[...new Set(findings)].sort().join(';')}`);
  return { files, scanned_bytes: scannedBytes };
}

async function requiredPeerAliases(root) {
  const names = new Set(EXTERNAL_WEB_PLUGIN_PEER_ALIASES);
  const optional = new Set();
  async function collectPackageDependencies(path) {
    const packageJson = JSON.parse(await readFile(join(path, 'package.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '{}';
      throw error;
    }));
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const name of Object.keys(packageJson[section] ?? {})) {
        if (name.startsWith('@deepseek-ai/')) names.add(name.slice('@deepseek-ai/'.length));
        if (section === 'optionalDependencies' && name.startsWith('@deepseek-ai/')) optional.add(name.slice('@deepseek-ai/'.length));
      }
    }
  }
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile()) {
        if (entry.name !== 'package.json') continue;
        const packageJson = JSON.parse(await readFile(path, 'utf8'));
        for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
          for (const name of Object.keys(packageJson[section] ?? {})) {
            if (name.startsWith('@deepseek-ai/')) names.add(name.slice('@deepseek-ai/'.length));
            if (section === 'optionalDependencies' && name.startsWith('@deepseek-ai/')) optional.add(name.slice('@deepseek-ai/'.length));
          }
        }
        continue;
      }
      if (!entry.isDirectory()) continue;
      const rel = relativePath(root, path);
      if (entry.name === '@deepseek-ai' && rel.includes('/node_modules/')) {
        for (const peer of await readdir(path, { withFileTypes: true })) {
          if (peer.isDirectory() || peer.isSymbolicLink()) {
            names.add(peer.name);
            await collectPackageDependencies(join(path, peer.name));
          }
        }
        continue;
      }
      await walk(path);
    }
  }
  await walk(root);
  assert.ok(names.size > 0, 'RUNTIME_REQUIRED_PEER_ALIASES_MISSING');
  return { names, optional };
}

async function verifyPeerSourceEntries(entries, upstreamRoots, required) {
  const trustedRoots = [...new Set(await Promise.all(upstreamRoots.map(root => realpath(root))))];
  for (const name of required) {
    const entry = entries.get(name);
    assert.ok(entry, `RUNTIME_EXTERNAL_WEB_PLUGIN_PEER_MISSING ${name}`);
    const target = await realpath(entry.path).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`RUNTIME_EXTERNAL_WEB_PLUGIN_PEER_MISSING ${name}`);
      throw new Error(`RUNTIME_PEER_ALIAS_UNREADABLE ${name}: ${error.message}`);
    });
    if (!trustedRoots.some(root => target === root || target.startsWith(`${root}/`))) {
      throw new Error(`RUNTIME_PEER_ALIAS_OUTSIDE_UPSTREAM ${name}`);
    }
    const metadata = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    if (metadata.name !== `@deepseek-ai/${name}`) {
      throw new Error(`RUNTIME_PEER_ALIAS_ID_MISMATCH ${name}`);
    }
    if (name === 'dsh-tools' && metadata.version !== DSH_SDK_VERSION) {
      throw new Error(`RUNTIME_PEER_ALIAS_VERSION_MISMATCH ${name}`);
    }
  }
}

async function materializeExternalSymlinks(deployed, upstream, pinnedSha, { portableLinux = false, sourceRoot = upstream } = {}) {
  const deployedRoot = resolve(deployed);
  const upstreamRoot = resolve(upstream);
  const externalRoot = join(deployedRoot, '.runtime-external');
  const copied = new Map();
  const verifiedRoots = new Map();
  async function mergeMissing(source, destination) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const sourcePath = join(source, entry.name);
      const destinationPath = join(destination, entry.name);
      const existing = await lstat(destinationPath).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!existing) {
        await cp(sourcePath, destinationPath, { recursive: true, dereference: false, force: false, errorOnExist: true });
      } else if (entry.isDirectory() && existing.isDirectory() && !entry.isSymbolicLink() && !existing.isSymbolicLink()) {
        await mergeMissing(sourcePath, destinationPath);
      } else if (existing.isFile() && !entry.isDirectory() && !entry.isSymbolicLink()) {
        const [sourceBytes, destinationBytes] = await Promise.all([readFile(sourcePath), readFile(destinationPath)]);
        if (!sourceBytes.equals(destinationBytes)) throw new Error(`RUNTIME_EXTERNAL_COLLISION ${destinationPath} source=${sourcePath}`);
      } else if (entry.isSymbolicLink() && existing.isSymbolicLink()) {
        const [sourceLink, destinationLink] = await Promise.all([readlink(sourcePath), readlink(destinationPath)]);
        if (sourceLink !== destinationLink) throw new Error(`RUNTIME_EXTERNAL_COLLISION ${destinationPath} source=${sourcePath} source_link=${sourceLink} existing_link=${destinationLink}`);
      } else {
        throw new Error(`RUNTIME_EXTERNAL_COLLISION ${destinationPath} source=${sourcePath} source_kind=${entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other'} existing_kind=${existing.isDirectory() ? 'directory' : existing.isFile() ? 'file' : existing.isSymbolicLink() ? 'symlink' : 'other'}`);
      }
    }
  }
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
        const targetInfo = await lstat(target);
        if (portableLinux && /(^|\/)[^/]*(?:darwin-arm64|darwin-x64|win32-arm64|win32-x64|win10-arm64|win10-x64|linux-arm64)(?:\/|$)/i.test(target)) {
          await rm(path, { force: true });
          continue;
        }
        const allowedRoot = target === upstreamRoot || target.startsWith(`${upstreamRoot}/`) ? upstreamRoot : await findPinnedRoot(target);
        if (!allowedRoot) throw new Error(`RUNTIME_EXTERNAL_LINK_FORBIDDEN ${path}`);
        const targetRelative = relative(allowedRoot, target).split('/').join('/');
        if (!targetRelative || targetRelative === '.git' || targetRelative.startsWith('.git/')) throw new Error(`RUNTIME_EXTERNAL_TARGET_FORBIDDEN ${targetRelative}`);
        if (!targetInfo.isDirectory() && /(^|\/)(?:\.env(?:\.|$)|\.npmrc(?:$|\/)|credentials?(?:[-_.]|$)|private[-_]?key(?:[-_.]|$)|cookie(?:[-_.]|$)|.*\.duckdb(?:\.wal)?$|.*\.sqlite(?:-wal|-shm)?$|.*\.log$)/i.test(targetRelative)) throw new Error(`RUNTIME_EXTERNAL_DENYLIST ${targetRelative}`);
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
  // `pnpm deploy --prod` does not copy workspace packages that are declared
  // only as peerDependencies. DSH's built-in plugin graph intentionally uses
  // that shape, so a production deploy can be syntactically complete while
  // failing at boot with ERR_MODULE_NOT_FOUND for core peer packages. Seed
  // only aliases already referenced by the deployed closure. Seeding every
  // workspace alias would pull optional browser tools and their vendor bytes
  // into the runtime. Materialization still applies the allowlist and secret
  // denylist to every resolved target.
  const peerSourceRoots = [
    join(upstreamRoot, 'node_modules/.pnpm/node_modules/@deepseek-ai'),
    join(upstreamRoot, 'node_modules/@deepseek-ai'),
    join(resolve(sourceRoot), 'node_modules/.pnpm/node_modules/@deepseek-ai'),
    join(resolve(sourceRoot), 'node_modules/@deepseek-ai'),
  ];
  const existingPeerSourceRoots = [];
  for (const root of peerSourceRoots) {
    if (await access(root).then(() => true, () => false)) existingPeerSourceRoots.push(root);
  }
  assert.ok(existingPeerSourceRoots.length > 0, 'RUNTIME_PEER_ALIAS_ROOT_MISSING');
  const peerDestinationRoot = join(deployedRoot, 'node_modules/.pnpm/node_modules/@deepseek-ai');
  await mkdir(peerDestinationRoot, { recursive: true });
  const peerRequirements = await requiredPeerAliases(deployedRoot);
  const requiredPeers = peerRequirements.names;
  const peerSources = new Map();
  for (const root of existingPeerSourceRoots) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!peerSources.has(entry.name)) peerSources.set(entry.name, { root, entry, path: join(root, entry.name) });
    }
  }
  for (const name of peerRequirements.optional) {
    if (!peerSources.has(name)) requiredPeers.delete(name);
  }
  assertPeerAliasesPresent([...requiredPeers], peerSources.keys());
  await verifyPeerSourceEntries(peerSources, [upstreamRoot, resolve(sourceRoot)], requiredPeers);
  let seededPeers = 0;
  for (const [name, source] of peerSources) {
    if (!requiredPeers.has(name)) continue;
    const peerSource = source.path;
    const peerDestination = join(peerDestinationRoot, name);
    const existing = await lstat(peerDestination).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing) {
      const sourceTarget = source.entry.isSymbolicLink() ? resolve(dirname(peerSource), await readlink(peerSource)) : peerSource;
      const destinationTarget = existing.isSymbolicLink() ? resolve(dirname(peerDestination), await readlink(peerDestination)) : peerDestination;
      const sourcePackage = join(sourceTarget, 'package.json');
      const destinationPackage = join(destinationTarget, 'package.json');
      const [sourceBytes, destinationBytes] = await Promise.all([
        readFile(sourcePackage).catch(() => null),
        readFile(destinationPackage).catch(() => null),
      ]);
      if (!sourceBytes || !destinationBytes || !comparablePackageBytes(sourceBytes).equals(comparablePackageBytes(destinationBytes))) throw new Error(`RUNTIME_PEER_ALIAS_COLLISION ${name}`);
      continue;
    }
    await cp(peerSource, peerDestination, { recursive: true, dereference: false, force: false, errorOnExist: true });
    seededPeers += 1;
  }
  await walk(deployedRoot);
  if (await access(externalRoot).then(() => true, () => false)) await walk(externalRoot);
  const pruned_files = await pruneDevelopmentFiles(deployedRoot);
  const runtime_scan = await scanRuntimeTree(deployedRoot);
  return { external_targets: copied.size, seeded_peer_aliases: seededPeers, pruned_files, ...runtime_scan };
}

function option(name) {
  const index = process.argv.indexOf(name);
  assert.ok(index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `${name.slice(2).toUpperCase()}_REQUIRED`);
  return resolve(process.argv[index + 1]);
}

const upstream = await realpath(option('--upstream'));
const output = option('--output');
const online = process.argv.includes('--online');
const portableLinux = process.argv.includes('--portable-linux');
if (portableLinux) assert.equal(process.platform, 'linux', 'RUNTIME_PORTABLE_LINUX_REQUIRES_LINUX_BUILDER');
if (portableLinux) assert.equal(process.arch, 'x64', 'RUNTIME_PORTABLE_LINUX_REQUIRES_X64_BUILDER');
const provenanceOption = process.argv.includes('--provenance') ? option('--provenance') : `${output}.provenance.json`;
const expectedOptions = (online ? 1 : 0) + (portableLinux ? 1 : 0) + (process.argv.includes('--provenance') ? 1 : 0) + 2;
assert.equal(process.argv.filter(arg => arg.startsWith('--')).length, expectedOptions, 'RUNTIME_BUNDLE_OPTION_UNKNOWN');
assert.equal(await access(join(upstream, '.git')).then(() => true, () => false), true, 'UPSTREAM_CHECKOUT_REQUIRED');
const upstreamSha = (await execFile('git', ['-C', upstream, 'rev-parse', 'HEAD'])).stdout.trim();
assert.equal(upstreamSha, PIN, 'UPSTREAM_SHA_MISMATCH');
const upstreamStatus = (await execFile('git', ['-C', upstream, 'status', '--porcelain', '--untracked-files=no'])).stdout.trim();
assert.equal(upstreamStatus, '', `UPSTREAM_CHECKOUT_DIRTY ${upstreamStatus}`);
const preparation = online ? null : await verifyRuntimePreparation(upstream);
const outputInfo = await stat(output).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
assert.equal(outputInfo, null, 'RUNTIME_BUNDLE_OUTPUT_EXISTS');
await mkdir(resolve(output, '..'), { recursive: true });

// macOS /var is a symlink; pnpm must use one canonical workspace/deploy root.
const work = await realpath(await mkdtemp(join(tmpdir(), 'dsh-runtime-bundle-')));
const deployed = join(work, 'dsh');
try {
  if (online) await prepareRuntimeInputs(upstream);
  const workspace = await stageRuntimeWorkspace(upstream, join(work, 'workspace'));
  const restoreStagedMetadata = await bindRuntimeInputs(upstream, workspace, work);
  // A production runtime must never execute upstream lifecycle hooks in the
  // temporary deploy directory. Preparation already hydrated and built the
  // pinned checkout; deploy only materializes those verified files.
  // The modern shared-lockfile deploy converts link: workspace importers into
  // directory snapshots and installs the derived closure frozen. Legacy
  // deploy deliberately re-resolves semver ranges, even with --offline.
  // Select this only in the private stage; upstream configuration stays intact.
  // pnpm explicitly supports trusting a lock already verified by preparation.
  // The receipt above binds the exact original lock, policy, pin and tools;
  // cached direct tarballs retain their original integrity. Online audit stays
  // a separate required preflight stage. Missing proof never disables policy.
  await execFile('corepack', runtimeDeployArgs(deployed, { online, portableLinux }), {
    cwd: workspace,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1',
      ...(!online ? { NODE_OPTIONS: `--require ${JSON.stringify(fileURLToPath(new URL('./runtime-offline.cjs', import.meta.url)))}`, npm_config_fetch_retries: '0' } : {}),
    },
    timeout: 900000,
    maxBuffer: 4 * 1024 * 1024,
  });
  await restoreStagedMetadata();
  const sourceTree = await runtimeSourceTree(workspace);
  if (preparation) assert.equal(sourceTree.sha256, preparation.source_tree.sha256, 'RUNTIME_SOURCE_TREE_MISMATCH');
  const materialized = await materializeExternalSymlinks(deployed, workspace, upstreamSha, { portableLinux, sourceRoot: upstream });
  const rewrittenPathShims = portableLinux ? await rewriteGeneratedPathShims(deployed) : 0;
  const removedNative = portableLinux ? await pruneUnsupportedLinuxNative(deployed) : [];
  const portable = portableLinux ? await verifyPortableLinuxRuntime(deployed) : null;
  for (const path of REQUIRED) await access(join(deployed, path));
  await execFile('tar', ['--zstd', '--no-xattrs', '--no-acls', '-cf', output, '-C', deployed, '.'], { maxBuffer: 4 * 1024 * 1024 });
  const info = await stat(output);
  assert.ok(info.size > 0, 'RUNTIME_BUNDLE_EMPTY');
  const archiveBytes = await readFile(output);
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex');
  const generatedTree = await canonicalTreeDigest(deployed, { allowSymlinks: true });
  const pnpm = (await execFile('corepack', ['pnpm', '--version'], { cwd: workspace, encoding: 'utf8', timeout: 15000 })).stdout.trim();
  const provenance = {
    schema_version: GENERATED_PROVENANCE_SCHEMA, status: 'PASS', upstream_sha: upstreamSha,
    source_tree: { sha256: sourceTree.sha256, entries: sourceTree.entries, bytes: sourceTree.bytes },
    generated_tree: { sha256: generatedTree.sha256, entries: generatedTree.entries, bytes: generatedTree.bytes },
    builder: { status: 'PASS', clean: true, isolated: true, node: process.version, pnpm,
      platform: process.platform, arch: process.arch, command: 'scripts/release/runtime-bundle.mjs',
      network_mode: online ? 'online' : 'offline' },
    preparation_receipt_sha256: preparation?.receipt_sha256 ?? null,
    portable_linux: portable ? { ...portable, rewritten_path_shims: rewrittenPathShims, removed_native: removedNative } : null,
    archive: { name: output.split('/').at(-1), bytes: info.size, sha256: archiveSha256 },
  };
  await writeFile(provenanceOption, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ status: 'BUILT', upstream_sha: upstreamSha, network_mode: online ? 'online' : 'offline', portable_linux: portableLinux, path: output, provenance: provenanceOption, bytes: info.size, sha256: archiveSha256, ...materialized, rewritten_path_shims: rewrittenPathShims, removed_native: removedNative }));
} finally {
  await rm(work, { recursive: true, force: true });
}
