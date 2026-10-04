import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { citationsFromGraphResult, createGraphReader, shareCitationAccess } from '../src/graph.mjs';
import { writeGraphLedger } from '../../../scripts/crm-calibration/graph-ledger.mjs';
import { graphFixture, DOC, DOC_B, CHUNK, CHUNK_B, USER_A, USER_B, KB, principal } from './graph.fixture.mjs';

const asA = principal(USER_A);
const asB = principal(USER_B);

test('read graph only after CRM account ACL; parameterized query, bounded evidence, no secrets', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  assert.equal((await reader.query({ topic: '会员溢价' })).reason.code, 'NOT_CONNECTED');
  const result = await reader.query({ topic: '会员溢价', limit: 3 }, undefined, asA);
  assert.equal(result.status, 'OK'); assert.equal(result.graph_backend, 'neo4j');
  assert.equal(result.relations[0].review_status, 'pending');
  assert.equal(result.document.updated_at, 'v1'); assert.equal(result.extraction_content_hashes_saved, false);
  assert.equal(result.graph_sync, 'unknown');
  assert.deepEqual(result.sources[0].page_refs, [161]); assert.equal(result.sources[0].id, CHUNK);
  assert.equal(result.relations[0].target, '非会员的AUS'); assert.equal(result.relations[0].semantic_verified, false);
  assert.equal(result.sources[0].content_sha256.length, 64);
  assert.ok(f.state.calls.some(c => c.path === '/api/v1/knowledge/' + DOC));
  assert.ok(f.state.calls.some(c => c.path === '/db/neo4j/tx/commit'));
  assert.equal(f.state.graphBodies[0].statements[0].parameters.topic, '会员溢价');
  assert.doesNotMatch(JSON.stringify(result), /fixture-key|fixture-password|Authorization|settings\.json/);
  f.state.denied = true;
  assert.equal((await reader.query({ topic: '会员溢价' }, undefined, asA)).reason.code, 'SOURCE_UNAVAILABLE');
  assert.equal(f.state.graphBodies.length, 1, 'Revocation of retrieve key must prevent a second graph request');
});

test('two accounts with different document grants cannot read across', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  assert.equal((await reader.query({ topic: '会员溢价' }, undefined, asB)).reason.code, 'ACCESS_DENIED');
  assert.equal(f.state.graphBodies.length, 0);
  const other = await reader.retrieve({ query: '会员溢价' }, undefined, asB);
  assert.equal(other.status, 'NO_MATCH');
  assert.deepEqual(f.state.searchBodies[0].knowledge_ids, [DOC_B]);
  assert.doesNotMatch(JSON.stringify(other), /会员的AUS|第 161/);
  const expanded = await reader.expand({ chunk_id: CHUNK }, undefined, asB);
  assert.equal(expanded.reason.code, 'ACCESS_DENIED');
  assert.deepEqual(expanded.sources ?? [], []);
  assert.ok(!JSON.stringify(expanded).includes('会员的AUS'));
  const allowed = await reader.retrieve({ query: '会员溢价' }, undefined, asA);
  assert.equal(allowed.status, 'OK'); assert.equal(allowed.sources[0].id, CHUNK);
  assert.deepEqual(f.state.searchBodies[1].knowledge_ids, [DOC]);
});

test('retrieve drops hits after a mid-query revoke of one granted document', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  f.acl.grants.find(g => g.username === USER_A).knowledge_ids = [DOC, DOC_B];
  await writeFile(f.settings.aclFile, JSON.stringify(f.acl), { mode: 0o600 });
  f.state.delay = 40;
  const pending = reader.retrieve({ query: '会员溢价' }, undefined, asA);
  await new Promise(r => setTimeout(r, 170));
  f.acl.grants.find(g => g.username === USER_A).knowledge_ids = [DOC_B];
  await writeFile(f.settings.aclFile, JSON.stringify(f.acl), { mode: 0o600 });
  const result = await pending;
  assert.equal(result.status, 'NO_MATCH');
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.knowledge_ids, [DOC_B]);
  assert.doesNotMatch(JSON.stringify(result), /会员的AUS|第 161/);
});

test('grant, revoke, session switch and cache-hit still enforce ACL; downed service does not serve cache', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const first = await reader.expand({ chunk_id: CHUNK }, undefined, asA);
  assert.equal(first.status, 'OK'); assert.equal(first.cache_hit, false);
  const second = await reader.expand({ chunk_id: CHUNK }, undefined, asA);
  assert.equal(second.cache_hit, true); assert.equal(second.source.id, CHUNK);
  await writeFile(f.settings.aclFile, JSON.stringify({ schema: 'crm-graph-acl/v1', knowledge_base_id: KB, grants: [{ username: USER_B, knowledge_ids: [DOC_B] }] }), { mode: 0o600 });
  const revoked = await reader.expand({ chunk_id: CHUNK }, undefined, asA);
  assert.equal(revoked.reason.code, 'ACCESS_DENIED'); assert.equal(revoked.source, undefined);
  await writeFile(f.settings.aclFile, JSON.stringify(f.acl), { mode: 0o600 });
  f.state.denied = true;
  const down = await reader.expand({ chunk_id: CHUNK }, undefined, asA);
  assert.equal(down.reason.code, 'SOURCE_UNAVAILABLE');
  assert.equal(down.source, undefined);
  assert.doesNotMatch(JSON.stringify(down), /会员的AUS|第 161/);
});

test('cross-document evidence is dropped without leaking unauthorized names', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  f.graphData.results[0].data.push({ row: ['对照实体', 'DEPENDS_ON', '隐藏对象', [CHUNK_B], 1] });
  const result = await reader.query({ topic: '会员' }, undefined, asA);
  assert.equal(result.status, 'OK');
  assert.equal(result.relations.length, 1);
  assert.equal(result.relations[0].source, '会员溢价率');
  assert.doesNotMatch(JSON.stringify(result), /对照实体|隐藏对象|对照文档/);
});

test('mid-query revoke, disable, delete, reparse/version change fail closed', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  f.state.delay = 40;
  const pending = reader.query({ topic: '会员溢价' }, undefined, asA);
  await new Promise(r => setTimeout(r, 20));
  await writeFile(f.settings.aclFile, JSON.stringify({ schema: 'crm-graph-acl/v1', knowledge_base_id: KB, grants: [] }), { mode: 0o600 });
  assert.equal((await pending).reason.code, 'ACCESS_DENIED');
  await writeFile(f.settings.aclFile, JSON.stringify(f.acl), { mode: 0o600 });
  f.state.delay = 0; f.state.disabled = true;
  assert.equal((await reader.query({ topic: '会员' }, undefined, asA)).reason.code, 'SOURCE_UNAVAILABLE');
  f.state.disabled = false; f.state.orphan = true;
  const missing = await reader.query({ topic: '会员' }, undefined, asA);
  assert.equal(missing.status, 'NO_MATCH'); assert.equal(missing.review_notes[0].verdict, 'missing_source');
  f.state.orphan = false; f.state.graphBodies.length = 0; f.state.searchBodies.length = 0; f.state.changed = true;
  assert.equal((await reader.query({ topic: '会员' }, undefined, asA)).reason.code, 'SOURCE_UNAVAILABLE');
});

test('injection is a literal parameter; document, SQL, credential and URL overrides rejected', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const topic = "会员' MATCH (n) DETACH DELETE n //";
  assert.equal((await reader.query({ topic }, undefined, asA)).status, 'OK');
  const statement = f.state.graphBodies[0].statements[0];
  assert.equal(statement.parameters.topic, topic); assert.ok(!statement.statement.includes(topic));
  for (const args of [{ topic: '会员', sql: 'MATCH (n)' }, { topic: '会员', knowledgeId: DOC }, { topic: '会员', token: 'x' }, { topic: '会员', url: 'http://example.com' }, { topic: '会员', limit: 21 }, { topic: '会员', limit: 1.1 }, { topic: 'x' }, { topic: '\n' }, { topic: 'x'.repeat(81) }, null]) {
    assert.equal((await reader.query(args, undefined, asA)).reason.code, 'INVALID_REQUEST');
  }
  assert.equal(f.state.graphBodies.length, 1);
});

for (const [flag, code] of [['disabled', 'SOURCE_UNAVAILABLE'], ['wrongChunk', 'SOURCE_UNAVAILABLE'], ['failGraph', 'GRAPH_UNAVAILABLE'], ['redirect', 'SOURCE_UNAVAILABLE'], ['overflow', 'INVALID_RESPONSE']]) {
  test(flag + ' fails closed and redacts upstream body', async t => {
    const f = await graphFixture(t); f.state[flag] = true;
    const result = await createGraphReader(f.settingsFile).query({ topic: '会员' }, undefined, asA);
    assert.equal(result.status, 'UNAVAILABLE'); assert.equal(result.reason.code, code);
    assert.deepEqual(result.relations, []); assert.deepEqual(result.sources, []);
    assert.doesNotMatch(JSON.stringify(result), /SECRET|fixture-password/);
    assert.ok(!f.state.calls.some(c => c.path === '/redirect-target'));
  });
}

test('configuration is private, loopback-only, and label/database cannot inject Cypher', async t => {
  const f = await graphFixture(t);
  for (const patch of [{ neo4jOrigin: 'https://example.com' }, { weknoraOrigin: 'http://127.0.0.1@evil.com' }, { weknoraOrigin: f.settings.weknoraOrigin + '/other' }, { database: '../system' }, { knowledgeId: 'x` MATCH (n)' }, { username: 'neo4j:evil' }]) {
    await writeFile(f.settingsFile, JSON.stringify({ ...f.settings, ...patch }));
    assert.equal((await createGraphReader(f.settingsFile).query({ topic: '会员' }, undefined, asA)).reason.code, 'INVALID_CONFIGURATION');
  }
  await writeFile(f.settingsFile, JSON.stringify(f.settings)); await chmod(f.settingsFile, 0o644);
  assert.equal((await createGraphReader(f.settingsFile).query({ topic: '会员' }, undefined, asA)).reason.code, 'INVALID_CONFIGURATION');
  assert.equal(f.state.calls.length, 0);
  assert.equal((await createGraphReader().query({ topic: '会员' }, undefined, asA)).reason.code, 'NOT_CONFIGURED');
});

test('empty is NO_MATCH, truncation is explicit, malformed refs never fetch arbitrary paths', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const row = f.graphData.results[0].data[0];
  f.graphData.results[0].data = [row, row];
  const result = await reader.query({ topic: '会员', limit: 1 }, undefined, asA);
  assert.equal(result.truncated, true); assert.equal(result.relations.length, 1);
  f.graphData.results[0].data = [];
  assert.equal((await reader.query({ topic: '未知' }, undefined, asA)).status, 'NO_MATCH');
  row.row[3] = ['../../secrets']; f.graphData.results[0].data = [row];
  assert.equal((await reader.query({ topic: '会员' }, undefined, asA)).reason.code, 'INVALID_RESPONSE');
  assert.ok(!f.state.calls.some(c => c.path.includes('secrets')));
});

test('abort and concurrency release the request guard', async t => {
  const f = await graphFixture(t); f.state.delay = 40;
  const reader = createGraphReader(f.settingsFile); const controller = new AbortController();
  const pending = reader.query({ topic: '会员' }, controller.signal, asA);
  assert.equal((await reader.query({ topic: '会员' }, undefined, asA)).reason.code, 'BUSY');
  controller.abort(); assert.equal((await pending).reason.code, 'CANCELLED');
  f.state.delay = 0;
  assert.equal((await reader.query({ topic: '会员' }, undefined, asA)).status, 'OK');
});

test('review overlay verifies or quarantines exact relations only while evidence hash matches', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const reviewFile = f.settingsFile + '.review';
  const entry = { source: '会员溢价率', relation: 'HAS_DENOMINATOR', target: '非会员的AUS', chunk_id: CHUNK,
    content_sha256: createHash('sha256').update(f.chunk.content).digest('hex'), verdict: 'verified', reason: '合成原文公式一致' };
  const review = { schema: 'crm-graph-review/v1', knowledge_id: DOC, entries: [entry] };
  await writeFile(reviewFile, JSON.stringify(review), { mode: 0o600 });
  await writeFile(f.settingsFile, JSON.stringify({ ...f.settings, reviewFile }));
  const verified = await reader.query({ topic: '会员溢价' }, undefined, asA);
  assert.equal(verified.relations[0].semantic_verified, true); assert.equal(verified.relations[0].review_status, 'verified');
  entry.verdict = 'rejected'; entry.reason = '合成拒绝案例';
  await writeFile(reviewFile, JSON.stringify(review));
  const rejected = await reader.query({ topic: '会员溢价' }, undefined, asA);
  assert.equal(rejected.status, 'REVIEW_REQUIRED'); assert.deepEqual(rejected.relations, []);
  assert.equal(rejected.review_notes[0].verdict, 'rejected');
  f.chunk.content += '\n文本变更';
  const stale = await reader.query({ topic: '会员溢价' }, undefined, asA);
  assert.equal(stale.relations[0].semantic_verified, false);
  assert.equal(stale.relations[0].review_status, 'version_stale');
  assert.equal(stale.review_notes[0].verdict, 'version_stale');
});

test('sync file marks graph stale without forging extraction hashes', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const syncFile = f.settingsFile + '.sync';
  await writeFile(syncFile, JSON.stringify({ schema: 'crm-graph-sync/v1', knowledge_id: DOC, extraction_content_hashes_saved: false, document_updated_at: 'old', document_processed_at: 'old' }), { mode: 0o600 });
  await writeFile(f.settingsFile, JSON.stringify({ ...f.settings, syncFile }));
  const stale = await reader.query({ topic: '会员' }, undefined, asA);
  assert.equal(stale.graph_sync, 'stale'); assert.equal(stale.extraction_content_hashes_saved, false);
  await writeFile(syncFile, JSON.stringify({ schema: 'crm-graph-sync/v1', knowledge_id: DOC, extraction_content_hashes_saved: false, document_updated_at: 'v1', document_processed_at: 'v1' }));
  const observed = await reader.query({ topic: '会员' }, undefined, asA);
  assert.equal(observed.graph_sync, 'observed'); assert.equal(observed.extraction_content_hashes_saved, false);
});

test('retrieve is scoped to granted documents; search outage is fail-closed', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const ok = await reader.retrieve({ query: '会员溢价' }, undefined, asA);
  assert.equal(ok.status, 'OK'); assert.equal(ok.sources[0].content_sha256.length, 64);
  f.state.failSearch = true;
  assert.equal((await reader.retrieve({ query: '会员溢价' }, undefined, asA)).reason.code, 'SOURCE_UNAVAILABLE');
  f.state.failSearch = false; f.state.denied = true;
  assert.equal((await reader.retrieve({ query: '会员溢价' }, undefined, asA)).reason.code, 'SOURCE_UNAVAILABLE');
});

test('group-readable ACL file fails closed', async t => {
  const f = await graphFixture(t);
  await chmod(f.settings.aclFile, 0o644);
  const reader = createGraphReader(f.settingsFile);
  assert.equal((await reader.query({ topic: '会员溢价' }, undefined, asA)).reason.code, 'INVALID_CONFIGURATION');
});

test('share wider than document grants is denied; recipient must be re-authorized', async t => {
  const f = await graphFixture(t);
  assert.equal(shareCitationAccess(f.acl, USER_B, [DOC]).action, 'deny');
  assert.equal(shareCitationAccess(f.acl, USER_A, [DOC]).action, 'allow');
  f.acl.grants.find(g => g.username === USER_B).knowledge_ids.push(DOC);
  assert.equal(shareCitationAccess(f.acl, USER_B, [DOC]).action, 'allow');
  const reader = createGraphReader(f.settingsFile);
  const result = await reader.query({ topic: '会员溢价' }, undefined, asA);
  const citations = citationsFromGraphResult(result);
  assert.equal(citations[0].chunk_id, CHUNK);
  assert.equal(citations[0].knowledge_id, DOC);
  assert.equal(shareCitationAccess(f.acl, USER_B, citations.map(item => item.knowledge_id)).action, 'allow');
});

test('inventory reports explicit denominators for the deployed graph', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const ledger = await reader.inventory({}, undefined, asA);
  assert.equal(ledger.status, 'OK');
  assert.equal(ledger.entities.count, 1);
  assert.equal(ledger.relations.total, 1);
  assert.equal(ledger.relations.pending, 1);
  assert.equal(ledger.relations.verified, 0);
  assert.equal(ledger.truncated, false);
  assert.equal(ledger.extraction_content_hashes_saved, false);
  assert.equal((await reader.inventory({}, undefined, asB)).reason.code, 'ACCESS_DENIED');
  const output = join(f.directory, 'ledger.json');
  const summary = await writeGraphLedger({ settingsFile: f.settingsFile, principal: USER_A, output });
  assert.equal(summary.relations.total, 1); assert.equal(summary.truncated, false); assert.equal(summary.complete_graph_review, false);
});

test('inventory marks truncated when the relation cap is reached', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const row = f.inventoryData.results[0].data[0];
  f.inventoryData.results[0].data = Array.from({ length: 200 }, () => row);
  const ledger = await reader.inventory({}, undefined, asA);
  assert.equal(ledger.truncated, true);
  assert.equal(ledger.relations.total, 5000);
  assert.equal(ledger.entries.length, 5000);
});
