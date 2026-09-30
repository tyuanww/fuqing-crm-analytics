import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { activateRelease, rollbackRelease } from './promotion.mjs';

const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-promotion-retry-'));
  const releases = join(root, 'releases');
  await mkdir(releases);
  for (const [tag, sha] of [['dsh-a', shaA], ['dsh-b', shaB]]) {
    const dir = join(releases, tag);
    await mkdir(dir);
    await writeFile(join(dir, 'release-marker.json'), JSON.stringify({ tag, source_sha: sha, owner: 'service-a', restart_dependency: 'service-a.service' }));
  }
  return root;
}
const statePath = root => join(root, 'release-state.json');
const activate = (root, tag, sourceSha) => activateRelease({ releaseRoot: root, tag, sourceSha, statePath: statePath(root) });
const current = async root => readFile(join(root, 'current-target'), 'utf8').then(value => value.trim());
async function receiptFiles(root) {
  const result = [];
  for (const tag of ['dsh-a', 'dsh-b']) {
    const dir = join(root, 'evidence', tag);
    try { result.push(...(await readdir(dir)).map(name => join(dir, name))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}

test('A to B then B retry preserves rollback target A', async () => {
  const root = await fixture();
  await activate(root, 'dsh-a', shaA);
  const first = await activate(root, 'dsh-b', shaB);
  const retry = await activate(root, 'dsh-b', shaB);
  assert.equal(first.previous, join(root, 'releases/dsh-a'));
  assert.equal(retry.idempotent, true);
  assert.equal(JSON.parse(await readFile(join(root, 'rollback-target.json'))).target, first.previous);
  assert.deepEqual((await rollbackRelease({ releaseRoot: root, statePath: statePath(root) })).target, first.previous);
  assert.equal(await current(root), first.previous);
});

test('A to B to A to B reactivation creates immutable receipts', async () => {
  const root = await fixture();
  await activate(root, 'dsh-a', shaA);
  await activate(root, 'dsh-b', shaB);
  await rollbackRelease({ releaseRoot: root, statePath: statePath(root) });
  await activate(root, 'dsh-b', shaB);
  assert.equal(await current(root), join(root, 'releases/dsh-b'));
  const receipts = await receiptFiles(root);
  assert.equal(receipts.length, 4);
  assert.equal(new Set(receipts).size, 4);
});

test('duplicate rollback is idempotent and preserves immutable receipts', async () => {
  const root = await fixture();
  await activate(root, 'dsh-a', shaA);
  await activate(root, 'dsh-b', shaB);
  const first = await rollbackRelease({ releaseRoot: root, statePath: statePath(root) });
  const count = (await receiptFiles(root)).length;
  const replay = await rollbackRelease({ releaseRoot: root, statePath: statePath(root) });
  assert.equal(first.target, replay.target);
  assert.equal(replay.idempotent, true);
  assert.equal((await receiptFiles(root)).length, count);
});

test('simultaneous activation and rollback cannot corrupt current pointers', async () => {
  const root = await fixture();
  await activate(root, 'dsh-a', shaA);
  await activate(root, 'dsh-b', shaB);
  const results = await Promise.allSettled([
    activate(root, 'dsh-a', shaA),
    rollbackRelease({ releaseRoot: root, statePath: statePath(root) }),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected' && /PROMOTION_LOCKED/.test(item.reason.message)).length, 1);
  const target = await current(root);
  assert.ok([join(root, 'releases/dsh-a'), join(root, 'releases/dsh-b')].includes(target));
  assert.equal(execFileSync('readlink', [join(root, 'current')], { encoding: 'utf8' }).trim(), target);
});

test('dead promotion lock is recovered conservatively', async () => {
  const root = await fixture();
  await writeFile(join(root, '.promotion.lock'), JSON.stringify({ pid: 999999999, nonce: 'dead' }));
  const result = await activate(root, 'dsh-a', shaA);
  assert.equal(result.status, 'ACTIVE');
});
