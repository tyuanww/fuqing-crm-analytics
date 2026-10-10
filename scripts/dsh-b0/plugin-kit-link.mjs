/** Explicit workspace adapter; independent repositories use the package manager. */
import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, realpath, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function linkWorkspaceKit(plugin, kit) {
  assert.ok(isAbsolute(plugin) && isAbsolute(kit), 'KIT_LINK_ABSOLUTE_REQUIRED');
  plugin = await realpath(plugin); kit = await realpath(kit);
  const pkg = JSON.parse(await readFile(join(kit, 'package.json'), 'utf8'));
  const consumer = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@shine-mage/dsh-plugin-kit', 'KIT_LINK_IDENTITY');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'KIT_LINK_VERSION');
  assert.equal(consumer.devDependencies?.[pkg.name], pkg.version, 'KIT_LINK_VERSION');
  assert.equal(pkg.exports?.['./toolchain'], './toolchain.mjs', 'KIT_LINK_EXPORT');
  assert.ok(![consumer.dependencies, consumer.optionalDependencies, consumer.peerDependencies]
    .some(group => group?.[pkg.name] !== undefined), 'KIT_LINK_DEV_ONLY');
  assert.ok((await lstat(join(kit, 'toolchain.mjs'))).isFile(), 'KIT_LINK_ENTRY');
  for (const path of [join(plugin, 'node_modules'), join(plugin, 'node_modules/@shine-mage')]) {
    await mkdir(path, { recursive: true });
    assert.ok((await lstat(path)).isDirectory(), 'KIT_LINK_PARENT_INVALID');
  }
  const link = join(plugin, 'node_modules', pkg.name);
  let current;
  try { current = await lstat(link); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current) {
    assert.ok(current.isSymbolicLink(), 'KIT_LINK_FOREIGN');
    assert.equal(await realpath(link), kit, 'KIT_LINK_FOREIGN');
    return { status: 'UNCHANGED', package: pkg.name, version: pkg.version };
  }
  await symlink(relative(dirname(link), kit), link, 'dir');
  return { status: 'LINKED', package: pkg.name, version: pkg.version };
}

/** Only source packages owned by this repository get workspace preparation.
 * A caller-supplied external checkout must use its own installed kit.
 */
export async function linkRepositoryKit(plugin, repository) {
  const target = await realpath(plugin);
  const packages = await realpath(join(repository, 'dsh-plugins'));
  if (dirname(target) !== packages) return { status: 'EXTERNAL_PACKAGE' };
  return linkWorkspaceKit(target, join(packages, 'plugin-kit'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [plugin, kit, ...extra] = process.argv.slice(2);
  assert.ok(!extra.length && plugin && kit, 'Usage: plugin-kit-link.mjs /absolute/plugin /absolute/kit');
  console.log(JSON.stringify(await linkWorkspaceKit(plugin, kit)));
}
