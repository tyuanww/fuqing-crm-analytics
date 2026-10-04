import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPinnedHostAcceptance } from './pinned-host-acceptance.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const upstream = process.env.B0_BUILD_UPSTREAM;
const exact = { skip: !upstream && 'Set B0_BUILD_UPSTREAM to the unchanged built 0.1.7-rc.2 checkout.' };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-pinned-host-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('host drill rejects a different Git pin before creating output or starting processes', async t => {
  const output = join(await fixture(t), 'not-created');
  await assert.rejects(runPinnedHostAcceptance({ upstream: repository, output }), /PINNED_HOST_SHA_MISMATCH/);
  await assert.rejects(access(output), /ENOENT/);
});

test('host drill rejects relative ownership and package paths before writing', async t => {
  const output = join(await fixture(t), 'not-created');
  await assert.rejects(runPinnedHostAcceptance({ upstream: '.', output }), /PINNED_HOST_ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(runPinnedHostAcceptance({ upstream: repository, output, packagesFrom: '.' }), /PINNED_HOST_ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(access(output), /ENOENT/);
});

test('host drill never overwrites an existing evidence directory', exact, async t => {
  const output = await fixture(t);
  await writeFile(join(output, 'keep.txt'), 'prior evidence');
  await assert.rejects(runPinnedHostAcceptance({ upstream, output }), /EEXIST/);
  assert.deepEqual(await readdir(output), ['keep.txt']);
  assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'prior evidence');
});

test('tampered immutable package fails before extraction or host startup and leaves a BLOCKED receipt', exact, async t => {
  const root = await fixture(t), packagesFrom = join(root, 'prior'), output = join(root, 'result');
  await mkdir(join(packagesFrom, 'packs/crm-knowledge'), { recursive: true });
  const name = 'tampered.tgz';
  await writeFile(join(packagesFrom, 'packs/crm-knowledge', name), 'tampered archive');
  await writeFile(join(packagesFrom, 'evidence.json'), JSON.stringify({
    schema: 'dsh-pinned-host-acceptance/v1', packages: { 'crm-knowledge': {
      name, sha256: '0'.repeat(64), source_sha: '0'.repeat(40), bytes: 16,
    } },
  }));
  await assert.rejects(runPinnedHostAcceptance({ upstream, output, packagesFrom }), /PINNED_HOST_PACKAGE_DIGEST_MISMATCH/);
  const receipt = JSON.parse(await readFile(join(output, 'evidence.json')));
  assert.equal(receipt.overall, 'BLOCKED');
  assert.equal(receipt.rows.length, 0);
  assert.match(receipt.error, /PINNED_HOST_PACKAGE_DIGEST_MISMATCH/);
  assert.equal(receipt.model_requests, undefined);
  await assert.rejects(access(join(output, 'installed')), /ENOENT/);
  assert.ok(!(await readdir(output)).some(name => name.startsWith('host-')));
});
