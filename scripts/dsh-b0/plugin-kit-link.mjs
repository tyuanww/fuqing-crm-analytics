/** Explicit workspace adapter; independent repositories use the package manager. */
import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, realpath, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSdkPackage } from '../../dsh-plugins/plugin-kit/sdk-inputs.mjs';

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

/** Link the owned generated-contract package when a source plugin declares it.
 * Consumers import only its package exports; the package is private, dev-only
 * and bundled into the plugin build. An undeclared plugin is left untouched.
 */
export async function linkWorkspaceContract(plugin, contracts) {
  assert.ok(isAbsolute(plugin) && isAbsolute(contracts), 'CONTRACT_LINK_ABSOLUTE_REQUIRED');
  plugin = await realpath(plugin); contracts = await realpath(contracts);
  const pkg = JSON.parse(await readFile(join(contracts, 'package.json'), 'utf8'));
  const consumer = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@shine-mage/dsh-contracts', 'CONTRACT_LINK_IDENTITY');
  if (consumer.devDependencies?.[pkg.name] === undefined) return { status: 'NOT_DECLARED', package: pkg.name };
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'CONTRACT_LINK_VERSION');
  assert.equal(consumer.devDependencies[pkg.name], pkg.version, 'CONTRACT_LINK_VERSION');
  assert.ok(![consumer.dependencies, consumer.optionalDependencies, consumer.peerDependencies]
    .some(group => group?.[pkg.name] !== undefined), 'CONTRACT_LINK_DEV_ONLY');
  assert.ok((await lstat(join(contracts, 'package.json'))).isFile(), 'CONTRACT_LINK_ENTRY');
  for (const path of [join(plugin, 'node_modules'), join(plugin, 'node_modules/@shine-mage')]) {
    await mkdir(path, { recursive: true });
    assert.ok((await lstat(path)).isDirectory(), 'CONTRACT_LINK_PARENT_INVALID');
  }
  const link = join(plugin, 'node_modules', pkg.name);
  let current;
  try { current = await lstat(link); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current) {
    assert.ok(current.isSymbolicLink(), 'CONTRACT_LINK_FOREIGN');
    assert.equal(await realpath(link), contracts, 'CONTRACT_LINK_FOREIGN');
    return { status: 'UNCHANGED', package: pkg.name, version: pkg.version };
  }
  await symlink(relative(dirname(link), contracts), link, 'dir');
  return { status: 'LINKED', package: pkg.name, version: pkg.version };
}

/** Link the pinned SDK packages the generated contract outputs reference.
 *
 * The contracts manifest intentionally declares no dependency: consumers bundle
 * the generated `.mjs` with `@deepseek-ai/*` external, and the host profile
 * resolves those specifiers when the bundled plugin loads. Source-level
 * workspace runs execute the package from its real path
 * (`dsh-plugins/contracts`), where a bare specifier cannot reach a sibling
 * plugin's `node_modules`; those callers bind the same pinned packages the kit
 * binds into a plugin, next to the package that imports them:
 *
 * - `@deepseek-ai/dsh-tools` is the only runtime import (service transport);
 * - `@deepseek-ai/cordis` is a type-only import (access contracts augment the
 *   host Context), resolved by the TypeScript programs that compile consumers.
 *
 * The package never gains a dependency or peerDependency entry.
 */
export async function linkWorkspaceContractSdk(contracts, bindings) {
  assert.ok(isAbsolute(contracts), 'CONTRACT_SDK_ABSOLUTE_REQUIRED');
  assert.ok(Array.isArray(bindings) && bindings.length, 'CONTRACT_SDK_BINDINGS_REQUIRED');
  contracts = await realpath(contracts);
  const pkg = JSON.parse(await readFile(join(contracts, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@shine-mage/dsh-contracts', 'CONTRACT_SDK_IDENTITY');
  const inspected = [];
  for (const binding of bindings) {
    assert.ok(typeof binding?.name === 'string' && /^@deepseek-ai\/[a-z0-9-]+$/.test(binding.name), 'CONTRACT_SDK_NAME');
    assert.ok(isAbsolute(binding?.directory ?? ''), 'CONTRACT_SDK_ABSOLUTE_REQUIRED');
    // The base pin does not version-pin cordis (release lanes do); identity and
    // entry checks always apply, the exact version only when the pin supplies it.
    assert.ok(binding?.version === undefined
      || /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(binding.version), 'CONTRACT_SDK_VERSION');
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      assert.equal(pkg[field]?.[binding.name], undefined, `CONTRACT_SDK_DEPENDENCY ${binding.name}`);
    }
    inspected.push({ ...await inspectSdkPackage(binding.directory, binding.name, binding.version),
      directory: await realpath(binding.directory) });
  }
  for (const path of [join(contracts, 'node_modules'), join(contracts, 'node_modules/@deepseek-ai')]) {
    await mkdir(path, { recursive: true });
    assert.ok((await lstat(path)).isDirectory(), 'CONTRACT_SDK_PARENT_INVALID');
  }
  const results = [];
  for (const entry of inspected) {
    const link = join(contracts, 'node_modules', entry.name);
    let current;
    try { current = await lstat(link); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current) {
      assert.ok(current.isSymbolicLink(), 'CONTRACT_SDK_FOREIGN');
      assert.equal(await realpath(link), entry.directory, 'CONTRACT_SDK_FOREIGN');
      results.push({ status: 'UNCHANGED', package: entry.name, version: entry.version });
      continue;
    }
    await symlink(relative(dirname(link), entry.directory), link, 'dir');
    results.push({ status: 'LINKED', package: entry.name, version: entry.version });
  }
  return results;
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
