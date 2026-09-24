import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CLEAN_BUILD_LIMITS, copyTreeBounded, createCleanRoot, removeCleanRoot } from './clean-build.mjs';

test('bounded clean copy rejects links and dependency trees', async t => {
  const source = await mkdtemp(join(tmpdir(), 'b0-clean-source-'));
  const owner = await mkdtemp(join(tmpdir(), 'b0-clean-owner-'));
  t.after(async () => { await rm(source, { recursive: true, force: true }); await rm(owner, { recursive: true, force: true }); });
  await mkdir(join(source, 'src'), { recursive: true });
  await writeFile(join(source, 'src', 'index.js'), 'export const ok = true;\n');
  const { cleanRoot } = await createCleanRoot(owner);
  // A symlink to an external tree is never copied, even if it is small.
  await symlink(join(source, 'src'), join(source, 'linked'));
  await assert.rejects(() => copyTreeBounded(source, join(cleanRoot, 'copy'), { destinationRoot: cleanRoot }), /symbolic link/);
  await removeCleanRoot(owner, cleanRoot);
  await assert.rejects(() => lstat(cleanRoot), { code: 'ENOENT' });

  const dependencySource = await mkdtemp(join(tmpdir(), 'b0-clean-dependency-'));
  t.after(() => rm(dependencySource, { recursive: true, force: true }));
  await mkdir(join(dependencySource, 'node_modules'), { recursive: true });
  await writeFile(join(dependencySource, 'node_modules', 'unexpected.js'), 'must not copy');
  const dependencyOwner = await mkdtemp(join(tmpdir(), 'b0-clean-dependency-owner-'));
  t.after(() => rm(dependencyOwner, { recursive: true, force: true }));
  const dependencyRoot = await createCleanRoot(dependencyOwner);
  await assert.rejects(
    () => copyTreeBounded(dependencySource, join(dependencyRoot.cleanRoot, 'copy'), { destinationRoot: dependencyRoot.cleanRoot }),
    /dependency directory/,
  );
});

test('bounded clean copy enforces the shared byte budget', async t => {
  const source = await mkdtemp(join(tmpdir(), 'b0-clean-size-'));
  const owner = await mkdtemp(join(tmpdir(), 'b0-clean-size-owner-'));
  t.after(async () => { await rm(source, { recursive: true, force: true }); await rm(owner, { recursive: true, force: true }); });
  await writeFile(join(source, 'large.txt'), '0123456789');
  const { cleanRoot } = await createCleanRoot(owner);
  await assert.rejects(
    () => copyTreeBounded(source, join(cleanRoot, 'copy'), {
      destinationRoot: cleanRoot,
      limits: { ...CLEAN_BUILD_LIMITS, maxBytes: 5 },
    }),
    /byte limit/,
  );
  await removeCleanRoot(owner, cleanRoot);
});

test('owned clean root is removed after a failed build step', async t => {
  const owner = await mkdtemp(join(tmpdir(), 'b0-clean-failure-owner-'));
  t.after(() => rm(owner, { recursive: true, force: true }));
  const { cleanRoot } = await createCleanRoot(owner);
  await writeFile(join(cleanRoot, 'marker'), 'owned\n');
  try {
    throw new Error('synthetic build failure');
  } catch (error) {
    assert.match(error.message, /synthetic/);
  } finally {
    await removeCleanRoot(owner, cleanRoot);
  }
  await assert.rejects(() => readFile(join(cleanRoot, 'marker')), { code: 'ENOENT' });
});
