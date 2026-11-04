import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { CATALOG_PLUGIN_PATH, CATALOG_SSOT_PATH, CONTRACT_LOCK_PATH, checkBoardCatalogSync } from './board-catalog-sync.mjs';

const catalog = Buffer.from('{"schema_version":"board-component-catalog/v1","components":[]}\n');
const sha256 = createHash('sha256').update(catalog).digest('hex');
const lock = { owners: { workbench: { files: [{ kind: 'catalog', main_path: CATALOG_PLUGIN_PATH,
  sha256, bytes: catalog.length }] } } };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'board-catalog-sync-'));
  for (const path of [CATALOG_SSOT_PATH, CATALOG_PLUGIN_PATH]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), catalog);
  }
  await mkdir(dirname(join(root, CONTRACT_LOCK_PATH)), { recursive: true });
  await writeFile(join(root, CONTRACT_LOCK_PATH), JSON.stringify(lock));
  return root;
}

test('byte-identical SSOT, plugin projection and lock pass', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await checkBoardCatalogSync(root), { schema_version: 'shinemage-board-catalog-sync/v1',
    path: CATALOG_SSOT_PATH, sha256, bytes: catalog.length });
});

test('plugin projection drift fails closed', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, CATALOG_PLUGIN_PATH), Buffer.concat([catalog, Buffer.from(' ')]));
  await assert.rejects(checkBoardCatalogSync(root), /BOARD_CATALOG_PLUGIN_DRIFT/);
});

test('lock digest drift fails closed', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const drifted = { owners: { workbench: { files: [{ ...lock.owners.workbench.files[0], sha256: 'a'.repeat(64) }] } } };
  await writeFile(join(root, CONTRACT_LOCK_PATH), JSON.stringify(drifted));
  await assert.rejects(checkBoardCatalogSync(root), /BOARD_CATALOG_LOCK_DRIFT/);
});
