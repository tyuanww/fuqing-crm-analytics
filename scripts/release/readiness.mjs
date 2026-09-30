import { access, constants as fsConstants, readdir, stat, statfs } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

export const DSH_UPSTREAM_SHA = '477b4f420553e8a52c2fbccc464d7561b239c443';
export const RELEASE_PLUGINS = [
  'dsh-plugins/analytics-workbench',
  'dsh-plugins/shine-brand',
  'dsh-plugins/shine-waterfall',
  'dsh-plugins/shine-crowd-action',
  'dsh-plugins/shine-query',
  'dsh-plugins/shine-board',
  'dsh-plugins/shine-funnel',
];

function commandOutput(command, args) {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

function add(checks, name, ok, value, code, remedy) {
  checks.push({ name, ok: Boolean(ok), value: String(value), code: ok ? null : code, remedy: ok ? null : remedy });
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

async function fileReady(path) {
  if (!path) return { ok: false, value: 'missing' };
  try {
    const info = await stat(resolve(path));
    return { ok: info.isFile() && info.size > 0, value: `${resolve(path)}:${info.size}B` };
  } catch (error) { return { ok: false, value: `${resolve(path)}:${error.code ?? 'unavailable'}` }; }
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
} = {}) {
  const repo = resolve(root);
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add(checks, 'node24', nodeMajor === 24, process.versions.node, 'NODE24_REQUIRED', 'use Node 24.x from .nvmrc');

  const pnpm = commandOutput('pnpm', ['--version']);
  add(checks, 'pnpm11', pnpm === '11.7.0', pnpm ?? 'missing', 'PNPM_VERSION_REQUIRED', 'install/use pnpm 11.7.0');

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

  const upstream = resolve(upstreamPath || join(repo, '.context/dsh-b0/upstream-0.1.7-rc.2'));
  const upstreamSha = commandOutput('git', ['-C', upstream, 'rev-parse', 'HEAD']);
  add(checks, 'upstream-sha', upstreamSha === DSH_UPSTREAM_SHA, upstreamSha ?? `${upstream}:missing`, 'PREFLIGHT_UPSTREAM_SHA_MISMATCH', `checkout ${DSH_UPSTREAM_SHA}`);

  const missingPlugins = [];
  for (const plugin of RELEASE_PLUGINS) {
    try { const info = await stat(join(repo, plugin, 'build.mjs')); if (!info.isFile()) missingPlugins.push(plugin); }
    catch { missingPlugins.push(plugin); }
  }
  add(checks, 'plugin-entrypoints', missingPlugins.length === 0, missingPlugins.length === 0 ? `${RELEASE_PLUGINS.length} build.mjs` : missingPlugins.join(','), 'PREFLIGHT_PLUGIN_ENTRYPOINT_MISSING', 'restore the pinned plugin source before preflight');

  if (requireRuntime) {
    const runtime = await fileReady(runtimeBundle);
    add(checks, 'runtime-bundle', runtime.ok, runtime.value, 'RELEASE_UPSTREAM_RUNTIME_REQUIRED', 'set DSH_UPSTREAM_RUNTIME_BUNDLE to the pinned runtime tarball');
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
    const output = await writablePath(outputDir, { allowCreate: true });
    let empty = true;
    try { empty = (await readdir(resolve(outputDir))).length === 0; } catch (error) { if (error.code !== 'ENOENT') empty = false; }
    add(checks, 'output-dir', output.ok && empty, `${output.value}${empty ? '' : ':not-empty'}`, 'PREFLIGHT_OUTPUT_DIR_INVALID', 'use a new empty output directory');
  }

  return { checks, ok: checks.every(check => check.ok), upstream, runtimeBundle: runtimeBundle ? resolve(runtimeBundle) : null };
}

export function printReadiness(result, prefix = 'DSH_DOCTOR_RELEASE') {
  for (const check of result.checks) {
    const state = check.ok ? 'PASS' : 'FAIL';
    const suffix = check.ok ? '' : ` code=${check.code} remedy=${check.remedy}`;
    console.log(`${prefix} ${state} ${check.name}=${check.value}${suffix}`);
  }
  return result.ok;
}
