/** Guard the main-owned board component catalogue and its plugin projection.
 *
 * The backend runtime reads backend/contracts/component-catalog.json only. The
 * plugin keeps a copy for its own UI build, and the public-contract lock keeps
 * the upstream analytics-workbench material pinned by digest. All three must
 * stay byte-identical; a catalog edit is a contract change and needs all of
 * them updated together.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const repository = fileURLToPath(new URL('../..', import.meta.url));
export const CATALOG_SSOT_PATH = 'backend/contracts/component-catalog.json';
export const CATALOG_PLUGIN_PATH = 'dsh-plugins/analytics-workbench/src/board-spec/component-catalog.json';
export const CONTRACT_LOCK_PATH = 'config/public-contract-inputs.lock.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function checkBoardCatalogSync(root = repository) {
  root = resolve(root);
  const ssot = await readFile(join(root, CATALOG_SSOT_PATH));
  const plugin = await readFile(join(root, CATALOG_PLUGIN_PATH));
  const lock = JSON.parse(await readFile(join(root, CONTRACT_LOCK_PATH), 'utf8'));
  const material = lock.owners?.workbench?.files?.find(row => row.kind === 'catalog');
  assert.ok(material, 'BOARD_CATALOG_LOCK_ENTRY');
  assert.equal(material.main_path, CATALOG_PLUGIN_PATH, 'BOARD_CATALOG_LOCK_PATH');
  assert.equal(ssot.length, material.bytes, 'BOARD_CATALOG_BYTES_DRIFT update the lock with the new archive bytes');
  const sha256 = hash(ssot);
  assert.equal(sha256, material.sha256, 'BOARD_CATALOG_LOCK_DRIFT update the public-contract lock from the owning upstream CI');
  assert.equal(hash(plugin), sha256, 'BOARD_CATALOG_PLUGIN_DRIFT copy the main-owned catalogue over the plugin projection');
  return { schema_version: 'shinemage-board-catalog-sync/v1', path: CATALOG_SSOT_PATH, sha256, bytes: ssot.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 2, 'Usage: node scripts/ci/board-catalog-sync.mjs');
    console.log(JSON.stringify(await checkBoardCatalogSync()));
  } catch (error) {
    console.error(`BOARD_CATALOG_BLOCKED ${error.message}`);
    process.exitCode = 2;
  }
}
