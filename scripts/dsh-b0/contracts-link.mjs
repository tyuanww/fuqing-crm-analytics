/** Explicit source-check adapter for the owned generated-contract package.
 *
 * Independent author repositories install @shine-mage/dsh-contracts from a
 * tarball; this repository builds its source trees in place, so the same link
 * the B0 pipeline creates is made explicitly here for callers that execute
 * plugin sources without a package-manager install (for example the Python
 * integration probes).
 */
import assert from 'node:assert/strict';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkWorkspaceContract } from './plugin-kit-link.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const contracts = join(repository, 'dsh-plugins/contracts');
const results = [];
for (const entry of await readdir(join(repository, 'dsh-plugins'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'contracts') continue;
  const plugin = join(repository, 'dsh-plugins', entry.name);
  try {
    await access(join(plugin, 'package.json'));
  } catch {
    continue;
  }
  results.push({ plugin: entry.name, ...(await linkWorkspaceContract(plugin, contracts)) });
}
assert.ok(results.some(result => result.status !== 'NOT_DECLARED'), 'CONTRACT_LINK_NO_CONSUMER');
console.log(JSON.stringify({ schema: 'shinemage-contract-workspace-links/v1', package: '@shine-mage/dsh-contracts',
  results }, null, 2) + '\n');
