import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneUnsupportedLinuxNative, rewriteGeneratedPathShims, verifyPortableLinuxRuntime } from './runtime-portability.mjs';

test('portable Linux scan removes unsupported native bytes and rejects host metadata', async t => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-portability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'node_modules/pkg'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"fixture","dependencies":{"x":"file:///private/var/workspace/x"}}\n');
  await writeFile(join(root, 'node_modules/pkg/darwin.node'), Buffer.from('feedfacf', 'hex'));
  await writeFile(join(root, 'node_modules/pkg/windows.dll'), Buffer.from('4d5a0000', 'hex'));
  await writeFile(join(root, 'node_modules/pkg/linux-arm64.node'), Buffer.from('7f454c46020101000000000000000000b700', 'hex'));
  const removed = await pruneUnsupportedLinuxNative(root);
  assert.equal(removed.length, 3);
  await assert.rejects(() => verifyPortableLinuxRuntime(root), /RUNTIME_PORTABLE_SCAN_FAILED.*HOST_PATH/);
  await writeFile(join(root, 'package.json'), '{"name":"fixture","dependencies":{"x":"1.0.0"}}\n');
  await assert.doesNotReject(() => verifyPortableLinuxRuntime(root));
  await access(join(root, 'node_modules/pkg'));
});

test('portable Linux scan rejects native bytes outside node_modules', async t => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-portability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'lib.node'), Buffer.from('feedfacf', 'hex'));
  await assert.rejects(() => pruneUnsupportedLinuxNative(root), /RUNTIME_PORTABLE_NATIVE_FORBIDDEN/);
});

test('portable Linux rewrite removes pnpm staging roots from shell shims', async t => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-portability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
  await mkdir(join(root, 'lib'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(root, 'lib/bin.js'), '');
  await writeFile(join(root, 'node_modules/.bin/fixture'), '#!/bin/sh\nbasedir="$basedir_abs"\nexport NODE_PATH="/tmp/dsh-runtime-bundle-abc123/dsh/node_modules"\n# cmd-shim-target=/tmp/dsh-runtime-bundle-abc123/dsh/node_modules/pkg/bin.js\n');
  assert.equal(await rewriteGeneratedPathShims(root), 1);
  const shim = await readFile(join(root, 'node_modules/.bin/fixture'), 'utf8');
  assert.doesNotMatch(shim, /dsh-runtime-bundle-/);
  assert.match(shim, /dsh_runtime_root=\$\{DSH_RUNTIME_ROOT-\}/);
  await assert.doesNotReject(() => verifyPortableLinuxRuntime(root));
});
