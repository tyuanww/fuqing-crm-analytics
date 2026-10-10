import { access, constants as fsConstants, lstat, readFile, stat, statfs } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA, NODE_MAJOR, PNPM_VERSION } from './toolchain.mjs';
import { loadReleaseProfile } from './profile.mjs';

export { DSH_UPSTREAM_SHA };

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        COREPACK_ENABLE_NETWORK: '0',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
        npm_config_offline: 'true',
      },
    }).trim();
  }
  catch { return null; }
}

const REMEDY_REFS = Object.freeze({
  NODE_TOOLCHAIN_REQUIRED: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-toolchain',
  PNPM_VERSION_REQUIRED: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-toolchain',
  PYTHON314_REQUIRED: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-toolchain',
  RELEASE_BLOCKED_DIRTY_WORKTREE: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-clean-tree',
  ZSTD_REQUIRED: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-artifact',
  PREFLIGHT_UPSTREAM_SHA_MISMATCH: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-upstream',
  PROFILE_MANIFEST_INVALID: 'docs/architecture/dsh-profile-manifest.md#dsh-profile-contract',
  PREFLIGHT_PLUGIN_ENTRYPOINT_MISSING: 'docs/operating/dsh-plugin-author-quickstart.md#plugin-contract',
  RELEASE_UPSTREAM_RUNTIME_REQUIRED: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-runtime',
  RELEASE_EVIDENCE_DIR_UNWRITABLE: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-artifact',
  PREFLIGHT_DISK_SPACE_LOW: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-artifact',
  PREFLIGHT_OUTPUT_DIR_INVALID: 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-artifact',
});

export function remedyReference(code) {
  return REMEDY_REFS[code] ?? 'docs/operating/dsh-rc2-quickstart.md#dsh-quickstart-troubleshooting';
}

function add(checks, name, ok, value, code, remedy) {
  checks.push({ name, ok: Boolean(ok), value: String(value), code: ok ? null : code, remedy: ok ? null : remedy, ref: ok ? null : remedyReference(code) });
}

async function writablePath(path, { allowCreate = false } = {}) {
  const target = resolve(path);
  try {
    const info = await stat(target);
    if (!info.isDirectory()) return { ok: false, value: `${target}:not-directory` };
    await access(target, fsConstants.W_OK);
    return { ok: true, value: target };
  } catch (error) {
    if (!allowCreate) return { ok: false, value: `${target}:${error.code ?? 'unavailable'}` };
    let parent = dirname(target);
    while (parent !== dirname(parent)) {
      try {
        const parentInfo = await stat(parent);
        if (parentInfo.isDirectory()) {
          await access(parent, fsConstants.W_OK);
          return { ok: true, value: `${target}:create-on-release` };
        }
      } catch {}
      parent = dirname(parent);
    }
    return { ok: false, value: `${target}:parent-unavailable` };
  }
}

function commandOk(command, args) {
  try {
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', npm_config_offline: 'true' },
    });
    return true;
  } catch { return false; }
}

async function runtimeReady(path) {
  if (!path) return { ok: false, value: 'missing' };
  const target = resolve(path);
  const expectedName = `shinemage-dsh-upstream-runtime-${DSH_UPSTREAM_SHA}.tar.zst`;
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) return { ok: false, value: `${target}:not-regular-file` };
    if (basename(target) !== expectedName) return { ok: false, value: `${target}:name-mismatch` };
    if (info.size < 1) return { ok: false, value: `${target}:empty` };
    if (!commandOk('zstd', ['-q', '-t', target])) return { ok: false, value: `${target}:zstd-invalid` };
    return { ok: true, value: `${target}:${info.size}B` };
  } catch (error) { return { ok: false, value: `${target}:${error.code ?? 'unavailable'}` }; }
}

/**
 * Read-only release checks shared by doctor and preflight --check.  It never
 * creates directories, fetches dependencies, starts services, or opens data
 * stores.  Callers decide whether a missing optional input is a warning.
 */
export async function collectReleaseReadiness({
  root,
  pythonPath = process.env.DSH_PYTHON ?? null,
  upstreamPath = process.env.DSH_UPSTREAM_CHECKOUT ?? null,
  runtimeBundle = process.env.DSH_UPSTREAM_RUNTIME_BUNDLE ?? null,
  outputDir = null,
  requireClean = false,
  requireRuntime = true,
  requireOutput = false,
  requireUpstream = true,
  profileManifest = process.env.DSH_PROFILE_MANIFEST ?? null,
} = {}) {
  const repo = resolve(root);
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  let expectedNode = null;
  try { expectedNode = (await readFile(join(repo, '.nvmrc'), 'utf8')).trim().replace(/^v/, ''); } catch {}
  const nodeOk = nodeMajor === NODE_MAJOR && (!expectedNode || process.versions.node === expectedNode);
  add(checks, `node${NODE_MAJOR}`, nodeOk, expectedNode ? `${process.versions.node}:expected-${expectedNode}` : process.versions.node, 'NODE_TOOLCHAIN_REQUIRED', 'use the exact Node version from .nvmrc');

  const pnpm = commandOutput('pnpm', ['--version']);
  add(checks, 'pnpm', pnpm === PNPM_VERSION, pnpm ?? 'missing', 'PNPM_VERSION_REQUIRED', `install/use pnpm ${PNPM_VERSION}`);

  const pythonCommand = pythonPath || 'python3';
  const pythonVersion = commandOutput(pythonCommand, ['--version']);
  const pythonAbsolute = pythonPath ? resolve(pythonPath) === pythonPath : Boolean(commandOutput('sh', ['-c', 'command -v python3']));
  const pythonMatch = /Python (\d+)\.(\d+)/.exec(pythonVersion ?? '');
  const pythonOk = pythonAbsolute && Boolean(pythonMatch) && (Number(pythonMatch[1]) > 3 || (Number(pythonMatch[1]) === 3 && Number(pythonMatch[2]) >= 14));
  add(checks, 'python314', pythonOk, pythonVersion ? `${pythonCommand}:${pythonVersion}` : `${pythonCommand}:missing`, 'PYTHON314_REQUIRED', 'set DSH_PYTHON to an absolute Python 3.14+ executable');

  let gitStatus = null;
  try { gitStatus = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim(); } catch { gitStatus = null; }
  const gitValue = gitStatus === null ? 'unavailable' : (gitStatus ? `dirty:${gitStatus.split(/\r?\n/).length} files` : 'clean');
  add(checks, 'git-clean', gitStatus === '', gitValue, 'RELEASE_BLOCKED_DIRTY_WORKTREE', 'build from a clean reviewed commit');
  if (!requireClean) checks.at(-1).ok = true;

  const zstd = commandOutput('zstd', ['--version']);
  add(checks, 'zstd', Boolean(zstd), zstd ?? 'missing', 'ZSTD_REQUIRED', 'install zstd before preflight');

  const upstream = resolve(upstreamPath || join(repo, `.context/dsh-b0/upstream-${DSH_SDK_VERSION}`));
  const upstreamSha = commandOutput('git', ['-C', upstream, 'rev-parse', 'HEAD']);
  const upstreamReady = upstreamSha === DSH_UPSTREAM_SHA || (!requireUpstream && upstreamSha === null);
  add(checks, 'upstream-sha', upstreamReady, upstreamSha ?? `${upstream}:missing`, 'PREFLIGHT_UPSTREAM_SHA_MISMATCH', `checkout ${DSH_UPSTREAM_SHA}`);

  let profile = null;
  let profileFailure = null;
  try {
    profile = await loadReleaseProfile({ root: repo, manifestPath: profileManifest });
    add(checks, 'profile-manifest', true, `${profile.profile.profile_id}:${profile.digest}`, 'PROFILE_MANIFEST_INVALID', 'fix the versioned profile manifest and DSH pin');
  } catch (error) {
    profileFailure = String(error?.message ?? error);
    add(checks, 'profile-manifest', false, profileFailure, 'PROFILE_MANIFEST_INVALID', 'fix the versioned profile manifest and DSH pin');
  }
  const configuredPlugins = profile?.plugins ?? [];
  const missingPlugins = [];
  for (const plugin of configuredPlugins) {
    try { const info = await stat(join(repo, plugin.path, plugin.build)); if (!info.isFile()) missingPlugins.push(plugin.path); }
    catch { missingPlugins.push(plugin.path); }
  }
  const pluginValue = profileFailure ? 'profile-unavailable' : (missingPlugins.length === 0 ? `${configuredPlugins.length} build.mjs` : missingPlugins.join(','));
  add(checks, 'plugin-entrypoints', !profileFailure && missingPlugins.length === 0, pluginValue, 'PREFLIGHT_PLUGIN_ENTRYPOINT_MISSING', 'restore the profile-selected plugin source before preflight');

  if (requireRuntime) {
    const runtime = await runtimeReady(runtimeBundle);
    add(checks, 'runtime-bundle', runtime.ok, runtime.value, 'RELEASE_UPSTREAM_RUNTIME_REQUIRED', `set DSH_UPSTREAM_RUNTIME_BUNDLE to ${`shinemage-dsh-upstream-runtime-${DSH_UPSTREAM_SHA}.tar.zst`}`);
  }

  const evidence = await writablePath(join(repo, '.context/release-evidence'), { allowCreate: true });
  add(checks, 'evidence-dir', evidence.ok, evidence.value, 'RELEASE_EVIDENCE_DIR_UNWRITABLE', 'make .context/release-evidence writable');

  let disk = null;
  try {
    let diskPath = outputDir ? resolve(outputDir) : repo;
    while (diskPath !== dirname(diskPath)) {
      try { const info = await stat(diskPath); if (info.isDirectory()) break; } catch {}
      diskPath = dirname(diskPath);
    }
    const info = await statfs(diskPath);
    disk = Number(info.bavail) * Number(info.bsize);
  } catch {}
  const minBytes = 128 * 1024 * 1024;
  add(checks, 'disk-free', disk !== null && disk >= minBytes, disk === null ? 'unavailable' : `${disk}B`, 'PREFLIGHT_DISK_SPACE_LOW', 'free at least 128 MiB in the candidate output filesystem');

  if (requireOutput && outputDir) {
    const target = resolve(outputDir);
    const parent = await writablePath(dirname(target), { allowCreate: true });
    let exists = false;
    try { await lstat(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') exists = true; }
    add(checks, 'output-dir', parent.ok && !exists, exists ? `${target}:already-exists` : `${target}:create-on-release`, 'PREFLIGHT_OUTPUT_DIR_INVALID', 'use a new output directory path');
  }

  return { checks, ok: checks.every(check => check.ok), upstream, runtimeBundle: runtimeBundle ? resolve(runtimeBundle) : null, profile };
}

export function printReadiness(result, prefix = 'DSH_DOCTOR_RELEASE') {
  const blockers = [];
  for (const check of result.checks) {
    const state = check.ok ? 'PASS' : 'FAIL';
    const suffix = check.ok ? '' : ` code=${check.code} remedy=${check.remedy} ref=${check.ref}`;
    console.log(`${prefix} ${state} ${check.name}=${check.value}${suffix}`);
    if (!check.ok) blockers.push(check);
  }
  if (blockers.length) {
    const codes = [...new Set(blockers.map(check => check.code))];
    const refs = [...new Set(blockers.map(check => check.ref))];
    console.log(`${prefix}_BLOCKERS count=${blockers.length} codes=${codes.join(',')} refs=${refs.join(',')}`);
  } else console.log(`${prefix}_BLOCKERS count=0`);
  return result.ok;
}
