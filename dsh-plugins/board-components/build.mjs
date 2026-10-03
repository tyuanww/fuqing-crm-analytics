/** Local immutable build input, not a signed or reviewed release candidate. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPackagedLibrary } from '../plugin-kit/packaged-dependencies.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] ?? process.env.DSH_PACKAGE_INPUTS ?? join(root, '../../.context/dsh-b0/package-inputs'));
assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
assert.equal(execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8', timeout: 10000 }).trim(), '11.7.0', 'Use pnpm 11.7.0');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.deepEqual(manifest.files, ['lib/funnel.mjs', 'lib/funnel.d.mts', 'lib/waterfall.mjs', 'lib/waterfall.d.mts'], 'PACKAGE_SOURCE_ALLOWLIST');
assert.ok(!(await lstat(join(root, 'src'))).isSymbolicLink(), 'PACKAGE_SOURCE_SYMLINK');
const packed = { ...manifest }; delete packed.scripts;
await mkdir(output, { recursive: true });
assert.ok(!(await lstat(output)).isSymbolicLink(), 'PACKAGE_OUTPUT_SYMLINK');
const staging = await mkdtemp(join(output, '.board-components-'));
try {
  await mkdir(join(staging, 'lib'));
  await mkdir(join(root, 'lib'), { recursive: true });
  assert.ok(!(await lstat(join(root, 'lib'))).isSymbolicLink(), 'PACKAGE_BUILD_SYMLINK');
  for (const entry of manifest.files) {
    const source = join(root, 'src', entry.slice(4));
    const info = await lstat(source);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 65536, 'PACKAGE_SOURCE_INVALID');
    await copyFile(source, join(staging, entry));
    await copyFile(source, join(root, entry));
  }
  await writeFile(join(staging, 'package.json'), JSON.stringify(packed, null, 2) + '\n');
  execFileSync('pnpm', ['pack', '--pack-destination', staging], { cwd: staging, timeout: 30000, stdio: 'pipe' });
  const filename = `${manifest.name.slice(1).replace('/', '-')}-${manifest.version}.tgz`;
  const tarball = join(staging, filename);
  const verified = await readPackagedLibrary(tarball);
  const target = join(output, filename);
  try { await link(tarball, target); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.equal((await readPackagedLibrary(target)).sha256, verified.sha256, 'PACKAGE_OUTPUT_CONFLICT bump the library version or choose a new output directory');
  }
  console.log(JSON.stringify({ scope: 'local-package-input', package: manifest.name, version: manifest.version,
    tarball: target, sha256: verified.sha256, entries: [...verified.files.keys()].sort(), release_approval: 'NOT_RUN' }));
} finally { await rm(staging, { recursive: true, force: true }); }
