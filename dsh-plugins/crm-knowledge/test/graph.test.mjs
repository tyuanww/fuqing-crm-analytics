import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGraphReader } from '../src/graph.mjs';
import { graphFixture, DOC, CHUNK } from './graph.fixture.mjs';

test('read graph only after ACL; parameterized query, bounded evidence, no secrets', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const result = await reader.query({ topic: '会员溢价', limit: 3 });
  assert.equal(result.status, 'OK'); assert.equal(result.graph_backend, 'neo4j');
  assert.deepEqual(result.sources[0].page_refs, [161]); assert.equal(result.sources[0].id, CHUNK);
  assert.equal(result.relations[0].target, '非会员的AUS'); assert.equal(result.relations[0].semantic_verified, false);
  assert.equal(result.sources[0].content_sha256.length, 64);
  assert.deepEqual(f.state.calls.map(c => c.path), ['/api/v1/knowledge/' + DOC, '/db/neo4j/tx/commit', '/api/v1/chunks/by-id/' + CHUNK, '/api/v1/knowledge/' + DOC]);
  assert.equal(f.state.graphBodies[0].statements[0].parameters.topic, '会员溢价');
  assert.equal(f.state.graphBodies[0].statements[0].parameters.limit, 4);
  assert.doesNotMatch(JSON.stringify(result), /fixture-key|fixture-password|Authorization|settings\.json/);
  f.state.denied = true;
  assert.equal((await reader.query({ topic: '会员溢价' })).reason.code, 'SOURCE_UNAVAILABLE');
  assert.equal(f.state.graphBodies.length, 1, 'Revocation must prevent a second graph request');
});

test('injection is a literal parameter; document, SQL, credential and URL overrides rejected', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const topic = "会员' MATCH (n) DETACH DELETE n //";
  assert.equal((await reader.query({ topic })).status, 'OK');
  const statement = f.state.graphBodies[0].statements[0];
  assert.equal(statement.parameters.topic, topic); assert.ok(!statement.statement.includes(topic));
  for (const args of [{ topic: '会员', sql: 'MATCH (n)' }, { topic: '会员', knowledgeId: DOC }, { topic: '会员', token: 'x' }, { topic: '会员', url: 'http://example.com' }, { topic: '会员', limit: 21 }, { topic: '会员', limit: 1.1 }, { topic: 'x' }, { topic: '\n' }, { topic: 'x'.repeat(81) }, null]) {
    assert.equal((await reader.query(args)).reason.code, 'INVALID_REQUEST');
  }
  assert.equal(f.state.graphBodies.length, 1);
});

for (const [flag, code] of [['disabled', 'SOURCE_UNAVAILABLE'], ['orphan', 'SOURCE_UNAVAILABLE'], ['wrongChunk', 'SOURCE_UNAVAILABLE'], ['changed', 'SOURCE_UNAVAILABLE'], ['failGraph', 'GRAPH_UNAVAILABLE'], ['redirect', 'SOURCE_UNAVAILABLE'], ['overflow', 'INVALID_RESPONSE']]) {
  test(flag + ' fails closed and redacts upstream body', async t => {
    const f = await graphFixture(t); f.state[flag] = true;
    const result = await createGraphReader(f.settingsFile).query({ topic: '会员' });
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
    assert.equal((await createGraphReader(f.settingsFile).query({ topic: '会员' })).reason.code, 'INVALID_CONFIGURATION');
  }
  await writeFile(f.settingsFile, JSON.stringify(f.settings)); await chmod(f.settingsFile, 0o644);
  assert.equal((await createGraphReader(f.settingsFile).query({ topic: '会员' })).reason.code, 'INVALID_CONFIGURATION');
  assert.equal(f.state.calls.length, 0);
  assert.equal((await createGraphReader().query({ topic: '会员' })).reason.code, 'NOT_CONFIGURED');
});

test('empty is NO_MATCH, truncation is explicit, malformed refs never fetch arbitrary paths', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const row = f.graphData.results[0].data[0];
  f.graphData.results[0].data = [row, row];
  const result = await reader.query({ topic: '会员', limit: 1 });
  assert.equal(result.truncated, true); assert.equal(result.relations.length, 1);
  f.graphData.results[0].data = [];
  assert.equal((await reader.query({ topic: '未知' })).status, 'NO_MATCH');
  row.row[3] = ['../../secrets']; f.graphData.results[0].data = [row];
  assert.equal((await reader.query({ topic: '会员' })).reason.code, 'INVALID_RESPONSE');
  assert.ok(!f.state.calls.some(c => c.path.includes('secrets')));
});

test('abort and concurrency release the request guard', async t => {
  const f = await graphFixture(t); f.state.delay = 40;
  const reader = createGraphReader(f.settingsFile); const controller = new AbortController();
  const pending = reader.query({ topic: '会员' }, controller.signal);
  assert.equal((await reader.query({ topic: '会员' })).reason.code, 'BUSY');
  controller.abort(); assert.equal((await pending).reason.code, 'CANCELLED');
  f.state.delay = 0;
  assert.equal((await reader.query({ topic: '会员' })).status, 'OK');
});

test('review overlay verifies or quarantines exact relations only while evidence hash matches', async t => {
  const f = await graphFixture(t); const reader = createGraphReader(f.settingsFile);
  const reviewFile = f.settingsFile + '.review';
  const entry = { source: '会员溢价率', relation: 'HAS_DENOMINATOR', target: '非会员的AUS', chunk_id: CHUNK,
    content_sha256: createHash('sha256').update(f.chunk.content).digest('hex'), verdict: 'verified', reason: '合成原文公式一致' };
  const review = { schema: 'crm-graph-review/v1', knowledge_id: DOC, entries: [entry] };
  await writeFile(reviewFile, JSON.stringify(review), { mode: 0o600 });
  await writeFile(f.settingsFile, JSON.stringify({ ...f.settings, reviewFile }));
  assert.equal((await reader.query({ topic: '会员溢价' })).relations[0].semantic_verified, true);
  entry.verdict = 'rejected'; entry.reason = '合成拒绝案例';
  await writeFile(reviewFile, JSON.stringify(review));
  const rejected = await reader.query({ topic: '会员溢价' });
  assert.equal(rejected.status, 'REVIEW_REQUIRED'); assert.deepEqual(rejected.relations, []);
  assert.equal(rejected.review_notes[0].verdict, 'rejected');
  f.chunk.content += '\n文本变更';
  const stale = await reader.query({ topic: '会员溢价' });
  assert.equal(stale.relations[0].semantic_verified, false); assert.deepEqual(stale.review_notes, []);
});
