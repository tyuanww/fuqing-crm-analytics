import { execFile } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

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
  for (const plugin of prepared.packInstall.plugins) {
    const pluginJson = JSON.parse(await readFile(join(plugin.root, 'package.json'), 'utf8'));
    for (const id of pluginJson?.dsh?.client?.inject ?? []) ids.add(id);
    for (const id of Object.keys(pluginJson.peerDependencies ?? {})) ids.add(id);
    for (const id of Object.keys(pluginJson.dependencies ?? {})) {
      if (id.startsWith('@deepseek-ai/')) ids.add(id);
    }
  }
  const dependencies = { ...(packageJson.dependencies ?? {}) };
  const linked = [];
  for (const id of [...ids].sort()) {
    const target = join(prepared.upstream, 'node_modules', ...id.split('/'));
    try {
      await readFile(join(target, 'package.json'));
    } catch {
      continue;
    }
    dependencies[id] = `link:${target}`;
    linked.push(id);
  }
  packageJson.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + '\n', { mode: 0o600 });
  const pnpm = process.env.OWNER_PNPM_BIN ?? 'pnpm';
  const { stdout, stderr } = await run(pnpm, ['install', '--offline', '--lockfile=false'], {
    cwd: profile,
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    maxBuffer: 2 * 1024 * 1024,
  });
  for (const plugin of prepared.packInstall.plugins) {
    const scope = join(plugin.root, 'node_modules', '@deepseek-ai');
    await mkdir(scope, { recursive: true, mode: 0o700 });
    for (const id of linked) {
      const target = join(prepared.upstream, 'node_modules', ...id.split('/'));
      const link = join(plugin.root, 'node_modules', ...id.split('/'));
      try {
        await symlink(target, link, 'junction');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }
  console.log(`DSH_DEV_OWNER_PROFILE_BRIDGE linked=${linked.length} plugin_roots=${prepared.packInstall.plugins.length} pnpm=${pnpm}`);
  if (stdout.trim()) console.log(`DSH_DEV_OWNER_PROFILE_BRIDGE_STDOUT ${stdout.trim().replace(/\n/g, ' | ')}`);
  if (stderr.trim()) console.log(`DSH_DEV_OWNER_PROFILE_BRIDGE_STDERR ${stderr.trim().replace(/\n/g, ' | ')}`);
  return { linked, pluginRoots: prepared.packInstall.plugins.length };
}
