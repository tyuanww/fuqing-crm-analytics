import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

function safePackagePath(root, id) {
  if (typeof id !== 'string' || !id || id.includes('\0')) {
    throw new Error(`DSH_DEV_INVALID_PEER_PACKAGE ${String(id)}`);
  }
  const nodeModules = resolve(root);
  const target = resolve(nodeModules, ...id.split('/'));
  if (target === nodeModules || !target.startsWith(`${nodeModules}/`)) {
    throw new Error(`DSH_DEV_INVALID_PEER_PACKAGE ${id}`);
  }
  return target;
}

async function resolveVerifiedPackage(root, upstreamRoot, id, expectedVersion) {
  const candidate = safePackagePath(root, id);
  let target;
  try {
    target = await realpath(candidate);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`DSH_DEV_PEER_PACKAGE_UNREADABLE ${id}: ${error.message}`);
  }
  const trustedRoot = await realpath(upstreamRoot);
  if (target !== trustedRoot && !target.startsWith(`${trustedRoot}/`)) {
    throw new Error(`DSH_DEV_PEER_PACKAGE_OUTSIDE_UPSTREAM ${id}`);
  }
  const metadata = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  if (metadata.name !== id) throw new Error(`DSH_DEV_PEER_PACKAGE_ID_MISMATCH ${id}`);
  if (expectedVersion !== undefined && metadata.version !== expectedVersion) {
    throw new Error(`DSH_DEV_PEER_PACKAGE_VERSION_MISMATCH ${id}`);
  }
  return target;
}

/**
 * Link the runtime peer closure into each verified profile pack.
 * The pack archive stays immutable; only the owned runtime profile changes.
 */
export async function applyOwnerProfileBridge(prepared) {
  if (!prepared.packInstall?.plugins?.length) return { linked: [], pluginRoots: 0 };
  const profile = join(prepared.runtime, 'harness/profiles/web');
  const packagePath = join(profile, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  const ids = new Set([
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-api-workspace-files',
  ]);
  const declaredIds = new Set(ids);
  const expectedVersions = new Map(prepared.pin?.sdk_version ? [['@deepseek-ai/dsh-tools', prepared.pin.sdk_version]] : []);
  for (const plugin of prepared.packInstall.plugins) {
    const pluginJson = JSON.parse(await readFile(join(plugin.root, 'package.json'), 'utf8'));
    for (const id of pluginJson?.dsh?.client?.inject ?? []) { ids.add(id); declaredIds.add(id); }
    for (const id of Object.keys(pluginJson.peerDependencies ?? {})) { ids.add(id); declaredIds.add(id); }
    for (const id of Object.keys(pluginJson.dependencies ?? {})) {
      if (id.startsWith('@deepseek-ai/')) { ids.add(id); declaredIds.add(id); }
    }
  }
  const dependencies = { ...(packageJson.dependencies ?? {}) };
  const linked = [];
  for (const id of [...ids].sort()) {
    // Production deploys keep peer-only workspace packages under pnpm's
    // canonical peer alias root. Prefer that verified peer root, then use the
    // top-level alias when the package is not peer-only; never resolve from an
    // arbitrary host checkout.
    const candidateRoots = [
      join(prepared.upstream, 'node_modules', '.pnpm', 'node_modules'),
      join(prepared.upstream, 'node_modules'),
    ];
    let target = null;
    for (const root of candidateRoots) {
      target = await resolveVerifiedPackage(root, prepared.upstream, id, expectedVersions.get(id));
      if (target) break;
    }
    if (!target) {
      if (declaredIds.has(id)) throw new Error(`DSH_DEV_REQUIRED_PEER_MISSING ${id}`);
      continue;
    }
    dependencies[id] = `link:${target}`;
    linked.push(id);
  }
  packageJson.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + '\n', { mode: 0o600 });
  const pnpm = process.env.OWNER_PNPM_BIN ?? 'pnpm';
  if (process.env.OWNER_PNPM_BIN !== undefined) {
    if (!isAbsolute(pnpm)) throw new Error('DSH_DEV_PNPM_PATH_MUST_BE_ABSOLUTE');
  }
  const manager = await run(pnpm, ['--version'], {
    cwd: profile,
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    maxBuffer: 64 * 1024,
    timeout: 15_000,
    killSignal: 'SIGTERM',
  });
  if (prepared.pin?.pnpm !== undefined && manager.stdout.trim() !== prepared.pin.pnpm) {
    throw new Error(`DSH_DEV_PNPM_VERSION ${manager.stdout.trim()} expected ${prepared.pin.pnpm}`);
  }
  const { stdout, stderr } = await run(pnpm, ['install', '--offline', '--lockfile=false'], {
    cwd: profile,
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
    killSignal: 'SIGTERM',
  });
  for (const plugin of prepared.packInstall.plugins) {
    const scope = join(plugin.root, 'node_modules', '@deepseek-ai');
    await mkdir(scope, { recursive: true, mode: 0o700 });
    for (const id of linked) {
      const candidateRoots = [
        join(prepared.upstream, 'node_modules', '.pnpm', 'node_modules'),
        join(prepared.upstream, 'node_modules'),
      ];
      let target = null;
      for (const root of candidateRoots) {
        target = await resolveVerifiedPackage(root, prepared.upstream, id, expectedVersions.get(id));
        if (target) break;
      }
      if (!target) continue;
      const link = join(plugin.root, 'node_modules', ...id.split('/'));
      try {
        await symlink(target, link, 'junction');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = await realpath(link).catch(existingError => {
          if (existingError.code === 'ENOENT') return null;
          throw existingError;
        });
        if (existing !== target) throw new Error(`DSH_DEV_PLUGIN_PEER_COLLISION ${id}`);
      }
    }
  }
  console.log(`DSH_DEV_OWNER_PROFILE_BRIDGE linked=${linked.length} plugin_roots=${prepared.packInstall.plugins.length} pnpm=${pnpm}`);
  if (stdout.trim()) console.log(`DSH_DEV_OWNER_PROFILE_BRIDGE_STDOUT ${stdout.trim().replace(/\n/g, ' | ')}`);
  if (stderr.trim()) console.log(`DSH_DEV_OWNER_PROFILE_BRIDGE_STDERR ${stderr.trim().replace(/\n/g, ' | ')}`);
  return { linked, pluginRoots: prepared.packInstall.plugins.length };
}
