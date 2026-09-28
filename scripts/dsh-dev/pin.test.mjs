import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readToolchain, verifyUpstream } from './pin.mjs';
import { assertFree } from './ports.mjs';
import { assertCli, repoRoot, resolveUpstream } from './paths.mjs';
import { PINNED_SHA } from './constants.mjs';
import { DSH_B0_SOURCE_SHA } from '../dsh-b0/gateway-policy.mjs';
import { buildPluginOverlay } from './overlay.mjs';

test('assertFree fails when the owned port is already bound', async () => {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(4326, '127.0.0.1', ok);
  });
  try {
    await assert.rejects(() => assertFree(4326));
  } finally {
    await new Promise((ok, fail) => server.close(e => e ? fail(e) : ok()));
  }
});

test('plugin overlay is JSON that DSH --patch can read and does not disable native rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-dev-overlay-'));
  try {
    const patch = buildPluginOverlay('/opt/plugin');
    const file = join(dir, 'plugin.patch.yml');
    await writeFile(file, JSON.stringify(patch, null, 2));
    const parsed = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
    assert.equal(parsed[0].insert[0].id, 'analytics-dev-brand-assets');
    assert.equal(JSON.stringify(parsed).includes('"disabled":true'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('toolchain SHA, PINNED_SHA, gateway policy SHA and plugin peer version stay aligned', async () => {
  const pin = await readToolchain(repoRoot);
  const pkg = JSON.parse(await readFile(join(repoRoot, 'dsh-plugins/analytics-workbench/package.json'), 'utf8'));
  assert.equal(pin.upstream_sha, PINNED_SHA);
  assert.equal(DSH_B0_SOURCE_SHA, PINNED_SHA);
  assert.equal(pin.sdk_version, pkg.peerDependencies['@deepseek-ai/dsh-tools']);
});

test('verifyUpstream matches the pinned SHA when the checkout is present', async (t) => {
  let upstream;
  try {
    upstream = resolveUpstream(process.env.DSH_DEV_UPSTREAM);
  } catch (error) {
    t.skip(String(error.message));
    return;
  }
  const pin = await readToolchain(repoRoot);
  assert.equal(pin.upstream_sha, PINNED_SHA);
  const verified = await verifyUpstream(upstream, pin);
  assert.equal(verified.upstream_sha, PINNED_SHA);
});

test('verifyUpstream accepts the immutable production runtime bundle only when release-bound', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-dev-runtime-bundle-'));
  const previousSha = process.env.DSH_UPSTREAM_SHA;
  try {
    await mkdir(join(dir, 'lib'), { recursive: true });
    await writeFile(join(dir, 'lib/bin.js'), '#!/usr/bin/env node\n');
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.7-rc.2' }));
    const pin = await readToolchain(repoRoot);
    process.env.DSH_UPSTREAM_SHA = PINNED_SHA;
    const upstream = resolveUpstream(dir);
    const verified = await verifyUpstream(upstream, pin);
    assert.equal(await assertCli(upstream), join(dir, 'lib/bin.js'));
    assert.equal(verified.runtime_bundle, true);
    process.env.DSH_UPSTREAM_SHA = '0'.repeat(40);
    await assert.rejects(() => verifyUpstream(upstream, pin), /Runtime bundle upstream SHA/);
  } finally {
    if (previousSha === undefined) delete process.env.DSH_UPSTREAM_SHA;
    else process.env.DSH_UPSTREAM_SHA = previousSha;
    await rm(dir, { recursive: true, force: true });
  }
});

test('cli check refuses a foreign --web-port without starting anything', () => {
  const child = spawnSync(process.execPath, ['scripts/dsh-dev/cli.mjs', 'start', '--web-port', '4317'], {
    cwd: repoRoot, encoding: 'utf8', timeout: 10000,
  });
  assert.notEqual(child.status, 0);
  assert.equal(child.stdout.includes('DSH_DEV_READY'), false);
});
