/** Dev-only, offline binding of exact tarball inputs. Never execute package hooks. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const LIMIT = 2 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (object, keys, code) => assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), code);
const missing = error => { if (error.code !== 'ENOENT') throw error; return null; };
const regular = async path => {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= LIMIT, 'PACKAGE_INPUT_FILE_INVALID');
  return readFile(path);
};

export function validatePackageLock(lock, consumer) {
  exact(lock, ['schema_version', 'packages'], 'PACKAGE_LOCK_FIELDS');
  assert.equal(lock.schema_version, 'shinemage-bundled-dependencies/v1', 'PACKAGE_LOCK_VERSION');
  assert.ok(Array.isArray(lock.packages) && lock.packages.length > 0 && lock.packages.length <= 16, 'PACKAGE_LOCK_COUNT');
  const seen = new Set();
  for (const entry of lock.packages) {
    exact(entry, ['name', 'version', 'tarball', 'sha256'], 'PACKAGE_LOCK_ENTRY_FIELDS');
    assert.match(entry.name, /^@shine-mage\/[a-z][a-z0-9-]+$/, 'PACKAGE_LOCK_NAME');
    assert.match(entry.version, /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/, 'PACKAGE_LOCK_VERSION');
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, 'PACKAGE_LOCK_DIGEST');
    assert.equal(entry.tarball, `${entry.name.slice(1).replace('/', '-')}-${entry.version}.tgz`, 'PACKAGE_LOCK_TARBALL');
    assert.ok(!seen.has(entry.name), 'PACKAGE_LOCK_DUPLICATE'); seen.add(entry.name);
    assert.equal(consumer.devDependencies?.[entry.name], entry.version, 'PACKAGE_LOCK_DECLARATION');
    assert.ok(!consumer.dependencies?.[entry.name] && !consumer.peerDependencies?.[entry.name], 'PACKAGE_MUST_BE_BUNDLED');
  }
  for (const name of Object.keys(consumer.devDependencies ?? {}).filter(name => name.startsWith('@shine-mage/'))) {
    assert.ok(seen.has(name), 'PACKAGE_LOCK_MISSING');
  }
  assert.ok(consumer.files?.includes('bundled-dependencies.json'), 'PACKAGE_LOCK_NOT_PUBLISHED');
  return lock;
}

/** tar writes only to stdout; even a hostile member name cannot write a path. */
export async function readPackagedLibrary(path, expected) {
  const bytes = await regular(path);
  const digest = sha256(bytes);
  if (expected) assert.equal(digest, expected.sha256, 'PACKAGE_INPUT_DIGEST');
  const tar = args => execFileSync('tar', args, { input: bytes, timeout: 10000, maxBuffer: LIMIT, env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const names = tar(['-tzf', '-']).toString().trim().split('\n');
  assert.ok(names.length > 1 && names.length <= 64 && new Set(names).size === names.length, 'PACKAGE_INPUT_ENTRIES');
  assert.ok(names.every(name => /^package\/(?:package\.json|lib\/[a-z0-9-]+(?:\.d)?\.m[jt]s)$/.test(name)), 'PACKAGE_INPUT_PATH');
  const descriptions = tar(['-tvzf', '-']).toString().trim().split('\n');
  assert.ok(descriptions.length === names.length && descriptions.every(line => line.startsWith('-')), 'PACKAGE_INPUT_SPECIAL');
  const files = new Map(); let total = 0;
  for (const name of names) {
    const content = tar(['-xOzf', '-', name]); total += content.length;
    assert.ok(total <= LIMIT, 'PACKAGE_INPUT_SIZE'); files.set(name.slice(8), content);
  }
  assert.ok(files.has('package.json'), 'PACKAGE_INPUT_MANIFEST');
  const manifest = JSON.parse(files.get('package.json'));
  assert.match(manifest.name, /^@shine-mage\/[a-z][a-z0-9-]+$/, 'PACKAGE_INPUT_NAME');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/, 'PACKAGE_INPUT_VERSION');
  if (expected) {
    assert.equal(manifest.name, expected.name, 'PACKAGE_INPUT_NAME');
    assert.equal(manifest.version, expected.version, 'PACKAGE_INPUT_VERSION');
  }
  assert.equal(manifest.type, 'module', 'PACKAGE_INPUT_TYPE');
  // A domain geometry package is data/JS/types only, with no host, registry
  // dependencies, lifecycle hooks, bin or native execution contract.
  for (const key of ['dsh', 'scripts', 'bin', 'dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    assert.equal(manifest[key], undefined, `PACKAGE_INPUT_FORBIDDEN ${key}`);
  }
  assert.deepEqual([...files.keys()].sort(), ['package.json', ...manifest.files].sort(), 'PACKAGE_INPUT_ALLOWLIST');
  assert.ok(manifest.exports && Object.keys(manifest.exports).length > 0, 'PACKAGE_INPUT_EXPORTS');
  for (const [name, value] of Object.entries(manifest.exports)) {
    assert.match(name, /^\.\/[a-z][a-z0-9-]*$/, 'PACKAGE_INPUT_EXPORT_KEY');
    exact(value, ['types', 'import'], 'PACKAGE_INPUT_EXPORT_CONDITIONS');
    for (const [kind, target] of Object.entries(value)) {
      assert.match(target, kind === 'types' ? /^\.\/lib\/[a-z0-9-]+\.d\.mts$/ : /^\.\/lib\/[a-z0-9-]+\.mjs$/, 'PACKAGE_INPUT_EXPORT_TARGET');
      assert.ok(files.has(target.slice(2)), 'PACKAGE_INPUT_EXPORT_MISSING');
    }
  }
  return { manifest, files, sha256: digest };
}

async function directory(path) {
  await mkdir(path, { recursive: true });
  const info = await lstat(path);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'PACKAGE_BINDING_DIRECTORY');
}

async function verifyInstalled(root, files) {
  assert.deepEqual((await readdir(root)).sort(), ['lib', 'package.json'], 'PACKAGE_INSTALLED_ENTRIES');
  const lib = await lstat(join(root, 'lib'));
  assert.ok(lib.isDirectory() && !lib.isSymbolicLink(), 'PACKAGE_INSTALLED_SYMLINK');
  const paths = ['package.json', ...(await readdir(join(root, 'lib'))).map(name => `lib/${name}`)];
  assert.deepEqual(paths.sort(), [...files.keys()].sort(), 'PACKAGE_INSTALLED_ENTRIES');
  for (const [name, bytes] of files) assert.deepEqual(await regular(join(root, name)), bytes, `PACKAGE_INSTALLED_DRIFT ${name}`);
}

export async function bindPackagedDependencies(plugin, inputDirectory) {
  const consumer = JSON.parse(await regular(join(plugin, 'package.json')));
  const bytes = await regular(join(plugin, 'bundled-dependencies.json')).catch(missing);
  if (!bytes) {
    assert.ok(!Object.keys(consumer.devDependencies ?? {}).some(name => name.startsWith('@shine-mage/')), 'PACKAGE_LOCK_MISSING');
    return [];
  }
  const lock = validatePackageLock(JSON.parse(bytes), consumer), bound = [];
  for (const entry of lock.packages) {
    const tarball = join(inputDirectory, entry.tarball);
    assert.ok(await lstat(tarball).catch(missing), `PACKAGE_INPUT_REQUIRED ${entry.tarball}; set DSH_PACKAGE_INPUTS to the directory containing the locked tarball`);
    const { files } = await readPackagedLibrary(tarball, entry);
    const modules = join(plugin, 'node_modules'), store = join(modules, '.shinemage-bundled');
    await directory(modules); await directory(store);
    const target = join(store, entry.sha256);
    if (await lstat(target).catch(missing)) {
      assert.ok(!(await lstat(target)).isSymbolicLink(), 'PACKAGE_INSTALLED_SYMLINK');
      await verifyInstalled(target, files);
    } else {
      const staging = join(store, `.prepare-${randomUUID()}`);
      try {
        await directory(staging);
        for (const [name, content] of files) {
          await mkdir(dirname(join(staging, name)), { recursive: true });
          await writeFile(join(staging, name), content, { flag: 'wx' });
        }
        try { await rename(staging, target); } catch (error) {
          if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
          await verifyInstalled(target, files);
        }
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
    const link = join(modules, entry.name);
    await directory(dirname(link));
    const existing = await lstat(link).catch(missing);
    if (existing) {
      assert.ok(existing.isSymbolicLink(), 'PACKAGE_BINDING_FOREIGN');
      const previous = await realpath(link);
      const rel = relative(await realpath(store), previous);
      assert.match(rel, /^[a-f0-9]{64}$/, 'PACKAGE_BINDING_FOREIGN');
      const previousManifest = JSON.parse(await regular(join(previous, 'package.json')));
      assert.equal(previousManifest.name, entry.name, 'PACKAGE_BINDING_FOREIGN');
      if (previous === await realpath(target)) { bound.push(entry); continue; }
    }
    const temporaryLink = `${link}.${randomUUID()}`;
    try {
      await symlink(relative(dirname(link), target), temporaryLink, 'dir');
      await rename(temporaryLink, link);
    } finally { await rm(temporaryLink, { force: true }); }
    // Previous immutable inputs are retained; never delete another package.
    bound.push(entry);
  }
  return bound;
}
