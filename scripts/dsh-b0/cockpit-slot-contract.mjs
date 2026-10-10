/** Domain-owned slot contract; each consumer ships its generated copy. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
export const sourcePath = 'dsh-plugins/analytics-workbench/contracts/cockpit-slot.v1.json';
export const consumers = [
  'dsh-plugins/analytics-workbench/src/client/cockpit-slot-contract.generated.ts',
  'dsh-plugins/crm-knowledge/src/client/cockpit-slot-contract.generated.ts',
];

export function renderContract(bytes) {
  const contract = JSON.parse(bytes);
  // v1 freezes the existing slot; incompatible changes require a new contract.
  assert.deepEqual(contract, {
    schema_version: 'shinemage-cockpit-slot/v1', version: '1.0.0',
    owner: 'analysis-workbench', name: 'cockpit.crm',
    slot: { kind: 'single', scope: 'root' }, optional: true,
  }, 'COCKPIT_SLOT_CONTRACT_INVALID');
  const digest = createHash('sha256').update(bytes).digest('hex');
  return `// Generated from cockpit-slot/v1 (owner: analysis-workbench). Do not edit.\n`
    + `// source_sha256: ${digest}\n`
    + `export const CRM_COCKPIT_SLOT_NAME = ${JSON.stringify(contract.name)} as const;\n`
    + `export const CRM_COCKPIT_SLOT = ${JSON.stringify(contract.slot)} as const;\n`
    + `export type CrmCockpitSlot = typeof CRM_COCKPIT_SLOT;\n`;
}

export async function syncContract({ root = repository, write = false } = {}) {
  const expected = renderContract(await readFile(join(root, sourcePath)));
  for (const consumer of consumers) {
    if (write) await writeFile(join(root, consumer), expected);
    else assert.equal(await readFile(join(root, consumer), 'utf8'), expected, `COCKPIT_SLOT_CONTRACT_DRIFT ${consumer}`);
  }
  return { status: 'PASS', contract: 'shinemage-cockpit-slot/v1', consumers: consumers.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 3 && ['--write', '--check'].includes(process.argv[2]),
    'Usage: node scripts/dsh-b0/cockpit-slot-contract.mjs --write|--check');
  console.log(JSON.stringify(await syncContract({ write: process.argv[2] === '--write' })));
}
