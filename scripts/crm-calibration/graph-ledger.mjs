/** Operator ledger for the deployed textbook graph. Does not start services, extract, or call paid models. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGraphReader } from '../../dsh-plugins/crm-knowledge/src/graph.mjs';

export async function writeGraphLedger({ settingsFile, principal, output }) {
  assert.ok(isAbsolute(settingsFile) && isAbsolute(output), 'settings and output must be absolute');
  assert.ok(/^[A-Za-z0-9_.@-]{1,64}$/.test(principal), 'principal must be a CRM username');
  const reader = createGraphReader(settingsFile);
  const ledger = await reader.inventory({}, undefined, { principal: { username: principal } });
  if (ledger.status !== 'OK') {
    throw new Error(ledger.reason?.code || 'inventory failed');
  }
  const summary = {
    schema_version: ledger.schema_version,
    knowledge_id: ledger.knowledge_id,
    knowledge_base_id: ledger.knowledge_base_id,
    document: ledger.document,
    extraction_content_hashes_saved: ledger.extraction_content_hashes_saved,
    graph_sync: ledger.graph_sync,
    generated_at: ledger.generated_at,
    entities: ledger.entities,
    relations: ledger.relations,
    truncated: ledger.truncated === true,
    limitations: ledger.limitations,
    complete_graph_review: false,
  };
  await writeFile(output, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await writeFile(output.replace(/\.json$/, '.summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2); const options = {};
    const names = { '--settings': 'settingsFile', '--principal': 'principal', '--output': 'output' };
    for (let i = 0; i < args.length; i += 2) {
      assert.ok(names[args[i]] && args[i + 1] && !options[names[args[i]]], 'Use --settings /private/graph-settings.json --principal crm-username --output /private/graph-ledger.json');
      options[names[args[i]]] = args[i + 1];
    }
    console.log(JSON.stringify(await writeGraphLedger(options), null, 2));
  } catch (error) {
    console.error('CRM graph ledger failed.', error instanceof Error ? error.message : '');
    process.exitCode = 1;
  }
}
