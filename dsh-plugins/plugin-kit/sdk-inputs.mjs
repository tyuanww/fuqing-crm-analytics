/** Read-only SDK entry checks. Package code is never imported by preflight. */
import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export async function inspectSdkPackage(directory, name, version) {
  const root = await realpath(directory);
  const info = await lstat(join(root, 'package.json'));
  assert.ok(info.isFile() && info.size <= 1024 * 1024, 'KIT_SDK_MANIFEST_INVALID');
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.name, name, 'KIT_SDK_NAME_MISMATCH');
  if (version !== undefined) assert.equal(manifest.version, version, 'KIT_SDK_VERSION_MISMATCH');
  for (const field of ['main', 'types']) {
    const entry = manifest[field];
    assert.ok(typeof entry === 'string' && entry.length > 0 && !isAbsolute(entry)
      && !entry.includes('\\') && !entry.split('/').includes('..'), 'KIT_SDK_ENTRY_INVALID');
    let target;
    try { target = await realpath(join(root, entry)); }
    catch (error) { if (error.code === 'ENOENT') throw new Error('KIT_SDK_ENTRY_MISSING'); throw error; }
    const rel = relative(root, target);
    assert.ok(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'KIT_SDK_ENTRY_ESCAPE');
    assert.ok((await lstat(target)).isFile(), 'KIT_SDK_ENTRY_INVALID');
  }
  return { name, version: manifest.version, main: manifest.main, types: manifest.types };
}
