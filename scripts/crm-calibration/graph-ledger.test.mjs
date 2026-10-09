/** The operator owns ledger persistence; the plugin owns inventory semantics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeGraphLedger } from './graph-ledger.mjs';
import { graphFixture, USER_A, USER_B } from '../../dsh-plugins/knowledge/test/graph.fixture.mjs';

test('operator writes private graph ledger and honest incomplete review summary', async t => {
  const f = await graphFixture(t); const output = join(f.directory, 'ledger.json');
  const summary = await writeGraphLedger({ settingsFile: f.settingsFile, principal: USER_A, output });
  const ledger = JSON.parse(await readFile(output, 'utf8'));
  const savedSummary = JSON.parse(await readFile(output.replace(/\.json$/, '.summary.json'), 'utf8'));
  assert.equal(ledger.schema_version, 'crm-graph-ledger/v1');
  assert.equal(ledger.status, 'OK'); assert.equal(ledger.entries.length, 1);
  assert.equal(summary.entities.count, 1);
  assert.equal(summary.relations.total, 1); assert.equal(summary.relations.pending, 1);
  assert.equal(summary.relations.verified, 0); assert.equal(summary.truncated, false);
  assert.equal(summary.extraction_content_hashes_saved, false);
  assert.equal(summary.complete_graph_review, false);
  assert.ok(summary.limitations.length > 0);
  assert.deepEqual(savedSummary, summary);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal((await stat(output.replace(/\.json$/, '.summary.json'))).mode & 0o777, 0o600);
  const before = await readFile(output);
  await assert.rejects(writeGraphLedger({ settingsFile: f.settingsFile, principal: USER_A, output }), { code: 'EEXIST' });
  assert.deepEqual(await readFile(output), before);
});
test('operator cannot persist a graph ledger for a denied principal', async t => {
  const f = await graphFixture(t); const output = join(f.directory, 'denied.json');
  await assert.rejects(writeGraphLedger({ settingsFile: f.settingsFile, principal: USER_B, output }), /ACCESS_DENIED/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
  await assert.rejects(stat(output.replace(/\.json$/, '.summary.json')), { code: 'ENOENT' });
  assert.equal(f.state.graphBodies.length, 0);
});
