/** Prepare a developer-owned offline workspace. Published plugin declarations stay unchanged. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = await realpath(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  assert.ok(['--destination', '--kit', '--kit-sha256', '--package-inputs'].includes(key)
    && typeof args[i + 1] === 'string' && !(key in options), 'AUTHOR_INPUT_ARGUMENTS');
  options[key] = args[i + 1];
}
assert.equal(Object.keys(options).length, 4, 'Usage: node author-inputs.mjs --destination /new/workspace --kit /reviewed/kit.tgz --kit-sha256 SHA256 --package-inputs /locked-domain-inputs');
assert.equal(Number(process.versions.node.split('.')[0]), 24, 'AUTHOR_NODE_24');
for (const key of ['--destination', '--kit', '--package-inputs']) assert.ok(isAbsolute(options[key]), `AUTHOR_ABSOLUTE ${key}`);
assert.match(options['--kit-sha256'], /^[a-f0-9]{64}$/, 'AUTHOR_KIT_DIGEST');
assert.ok(isAbsolute(process.env.COREPACK_HOME ?? ''), 'AUTHOR_COREPACK_HOME_REQUIRED');
const manifest = JSON.parse(await readFile(join(source, 'package.json')));
assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/, 'AUTHOR_MANAGER_EXACT');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const kitInfo = await lstat(options['--kit']);
assert.ok(kitInfo.isFile() && !kitInfo.isSymbolicLink() && kitInfo.size < 2 * 1024 * 1024, 'AUTHOR_KIT_FILE');
const kitBytes = await readFile(options['--kit']);
assert.equal(sha256(kitBytes), options['--kit-sha256'], 'AUTHOR_KIT_DIGEST');
// Resolve the existing parent before checking or writing through directory aliases.
const destination = join(await realpath(dirname(options['--destination'])), basename(options['--destination']));
const destinationRelative = relative(source, destination);
assert.ok(destinationRelative === '..' || destinationRelative.startsWith('../'), 'AUTHOR_DESTINATION_OUTSIDE_SOURCE');
const domainInfo = await lstat(options['--package-inputs']);
assert.ok(domainInfo.isDirectory() && !domainInfo.isSymbolicLink(), 'AUTHOR_DOMAIN_DIRECTORY');
await mkdir(destination); // Exclusive: never adopt or overwrite an existing author workspace.
const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: join(destination, '.home'), CI: '1',
  COREPACK_HOME: process.env.COREPACK_HOME, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0',
  COREPACK_DEFAULT_TO_LATEST: '0', npm_config_offline: 'true' };
await mkdir(env.HOME); await mkdir(join(destination, 'inputs')); await mkdir(join(destination, 'logs'));
await writeFile(join(destination, 'inputs/kit.tgz'), kitBytes, { flag: 'wx' });
const run = async (stage, args, extra = {}) => {
  try {
    const output = execFileSync('corepack', ['pnpm', ...args], { cwd: destination, env: { ...env, ...extra },
      encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: 'pipe' });
    return writeFile(join(destination, `logs/${stage}.log`), output);
  } catch (error) {
    // Keep the owned directory and failure evidence; retry in a new directory.
    await writeFile(join(destination, `logs/${stage}.log`), String(error.stdout ?? '') + String(error.stderr ?? ''));
    throw error;
  }
};
const parentManifest = { private: true, packageManager: manifest.packageManager,
  devDependencies: { '@shine-mage/dsh-plugin-kit': 'file:inputs/kit.tgz' } };
await writeFile(join(destination, 'package.json'), JSON.stringify(parentManifest, null, 2) + '\n');
await writeFile(join(destination, 'pnpm-workspace.yaml'), 'packages: []\nautoInstallPeers: false\noffline: true\n');
const install = ['install', '--offline', '--ignore-scripts', '--store-dir', join(destination, '.store')];
// First preparation creates a lock from the explicitly reviewed local inputs.
// Every actual installation is frozen; ordinary build/test never regenerates it.
await run('kit-lock', [...install, '--lockfile-only'], { CI: '' });
await run('kit-install', [...install, '--frozen-lockfile']);
const require = createRequire(join(destination, 'package.json'));
const installedKit = JSON.parse(await readFile(require.resolve('@shine-mage/dsh-plugin-kit/package.json')));
assert.equal(installedKit.name, '@shine-mage/dsh-plugin-kit', 'AUTHOR_KIT_NAME');
assert.equal(installedKit.version, manifest.devDependencies[installedKit.name], 'AUTHOR_KIT_VERSION');
const { validatePackageLock, readPackagedLibrary } = await import(pathToFileURL(require.resolve('@shine-mage/dsh-plugin-kit/packaged-dependencies')));
const lock = validatePackageLock(JSON.parse(await readFile(join(source, 'bundled-dependencies.json'))), manifest);
const overrides = { '@shine-mage/dsh-plugin-kit': 'file:inputs/kit.tgz' }, domain = [];
for (const entry of lock.packages) {
  const input = join(options['--package-inputs'], entry.tarball);
  const verified = await readPackagedLibrary(input, entry);
  const bytes = await readFile(input);
  assert.equal(sha256(bytes), verified.sha256, 'AUTHOR_DOMAIN_CHANGED');
  await writeFile(join(destination, 'inputs', entry.tarball), bytes, { flag: 'wx' });
  overrides[entry.name] = `file:inputs/${entry.tarball}`;
  domain.push(entry);
}
async function copy(path, target) {
  const info = await lstat(path);
  assert.ok(!info.isSymbolicLink() && (info.isFile() || info.isDirectory()), 'AUTHOR_SOURCE_REGULAR');
  if (info.isDirectory()) {
    await mkdir(target);
    for (const item of await readdir(path)) await copy(join(path, item), join(target, item));
  } else await copyFile(path, target);
}
const plugin = join(destination, 'plugin'); await mkdir(plugin);
const files = ['package.json', 'build.mjs', 'author-inputs.mjs', 'toolchain.mjs', 'pack-skills.mjs', 'src', 'test', 'skills',
  'bundled-dependencies.json', 'cordis.patch.yml', ...(await readdir(source)).filter(file => file.endsWith('skill-package.lock.json'))];
for (const file of files) await copy(join(source, file), join(plugin, file));
await writeFile(join(destination, 'pnpm-workspace.yaml'), 'packages:\n  - plugin\nautoInstallPeers: false\noffline: true\noverrides:\n'
  + Object.entries(overrides).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}\n`).join(''));
await run('workspace-lock', [...install, '--lockfile-only'], { CI: '' });
await run('workspace-install', [...install, '--frozen-lockfile']);
assert.deepEqual(await readFile(join(plugin, 'package.json')), await readFile(join(source, 'package.json')), 'AUTHOR_MANIFEST_CHANGED');
const receipt = { scope: 'plugin-author-development-inputs', plugin, package_manager: manifest.packageManager,
  kit_sha256: sha256(kitBytes), domain, lock_sha256: sha256(await readFile(join(destination, 'pnpm-lock.yaml'))),
  sdk: 'NOT_CHECKED_UNTIL_BUILD', build: 'NOT_RUN', release_ready: false };
await writeFile(join(destination, 'author-inputs.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
