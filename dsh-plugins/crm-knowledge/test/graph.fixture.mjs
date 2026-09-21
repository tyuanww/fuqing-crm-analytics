import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const KB = '11111111-1111-1111-1111-111111111111';
export const DOC = '22222222-2222-2222-2222-222222222222';
export const DOC_B = '44444444-4444-4444-4444-444444444444';
export const CHUNK = '33333333-3333-3333-3333-333333333333';
export const CHUNK_B = '55555555-5555-5555-5555-555555555555';
export const USER_A = 'fixture-user';
export const USER_B = 'other-user';

export async function graphFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'crm-graph-'));
  const state = {
    denied: false, failGraph: false, redirect: false, wrongChunk: false, disabled: false, orphan: false,
    changed: false, overflow: false, delay: 0, failSearch: false, calls: [], graphBodies: [], searchBodies: [],
  };
  const document = { id: DOC, knowledge_base_id: KB, title: '合成教材', deleted_at: null, parse_status: 'completed', enable_status: 'enabled', pending_subtasks_count: 0, updated_at: 'v1', processed_at: 'v1' };
  const documentB = { id: DOC_B, knowledge_base_id: KB, title: '合成对照教材', deleted_at: null, parse_status: 'completed', enable_status: 'enabled', pending_subtasks_count: 0, updated_at: 'v1', processed_at: 'v1' };
  const chunk = { id: CHUNK, knowledge_id: DOC, knowledge_base_id: KB, is_enabled: true, content: '第 161 页\n会员溢价率 = 会员的AUS / 非会员的AUS', chunk_index: 1, content_revision: 1 };
  const chunkB = { id: CHUNK_B, knowledge_id: DOC_B, knowledge_base_id: KB, is_enabled: true, content: '第 2 页\n对照文档实体B', chunk_index: 1, content_revision: 1 };
  const graphData = { results: [{ columns: ['source', 'relation', 'target', 'refs', 'rank'], data: [{ row: ['会员溢价率', 'HAS_DENOMINATOR', '非会员的AUS', [CHUNK], 1] }] }], errors: [] };
  const inventoryData = { results: [{ columns: ['source', 'relation', 'target', 'refs'], data: [{ row: ['会员溢价率', 'HAS_DENOMINATOR', '非会员的AUS', [CHUNK] ] }] }], errors: [] };
  const server = createServer(async (req, res) => {
    state.calls.push({ path: req.url, method: req.method });
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (state.delay) await new Promise(r => setTimeout(r, state.delay));
    if (state.redirect) { res.writeHead(302, { Location: '/redirect-target' }); res.end(); return; }
    if (req.url.startsWith('/api/v1/')) {
      if (req.headers['x-api-key'] !== 'fixture-key' || state.denied) return json(403, { error: 'SECRET UPSTREAM BODY' });
      if (req.method === 'POST' && req.url === '/api/v1/knowledge-search') {
        let body = ''; for await (const part of req) body += part;
        state.searchBodies.push(JSON.parse(body));
        if (state.failSearch) return json(503, { error: 'SECRET UPSTREAM BODY' });
        return json(200, { data: [{ id: CHUNK, knowledge_id: DOC, knowledge_base_id: KB, content: chunk.content, chunk_index: 1, score: 0.9, knowledge_title: document.title }] });
      }
      if (req.url === '/api/v1/knowledge/' + DOC) return json(200, { success: true, data: { ...document, ...(state.disabled ? { enable_status: 'disabled' } : {}), ...(state.changed && (state.graphBodies.length || state.searchBodies.length) ? { updated_at: 'v2' } : {}) } });
      if (req.url === '/api/v1/knowledge/' + DOC_B) return json(200, { success: true, data: { ...documentB } });
      if (req.url === '/api/v1/chunks/by-id/' + CHUNK) return json(state.orphan ? 404 : 200, { success: true, data: { ...chunk, ...(state.wrongChunk ? { knowledge_id: KB } : {}) } });
      if (req.url === '/api/v1/chunks/by-id/' + CHUNK_B) return json(200, { success: true, data: { ...chunkB } });
      return json(404, {});
    }
    if (req.url === '/db/neo4j/tx/commit') {
      let body = ''; for await (const part of req) body += part;
      const parsed = JSON.parse(body);
      state.graphBodies.push(parsed);
      if (req.headers.authorization !== 'Basic ' + Buffer.from('neo4j:fixture-password').toString('base64')) return json(401, {});
      if (state.failGraph) return json(200, { errors: [{ code: 'internal', message: 'fixture-password SECRET' }] });
      if (state.overflow) { res.writeHead(200); res.end('x'.repeat(524289)); return; }
      const statement = parsed.statements[0].statement;
      if (statement.includes('count(n)')) return json(200, { results: [{ columns: ['count(n)'], data: [{ row: [1] }] }], errors: [] });
      if (statement.includes('SKIP $skip')) return json(200, inventoryData);
      return json(200, graphData);
    }
    return json(404, {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const acl = {
    schema: 'crm-graph-acl/v1', knowledge_base_id: KB,
    grants: [
      { username: USER_A, knowledge_ids: [DOC] },
      { username: USER_B, knowledge_ids: [DOC_B] },
    ],
  };
  const settings = {
    weknoraOrigin: origin, neo4jOrigin: origin, username: 'neo4j', database: 'neo4j', knowledgeId: DOC, knowledgeBaseId: KB,
    additionalKnowledgeIds: [DOC_B],
    weknoraKeyFile: join(directory, 'key'), neo4jPasswordFile: join(directory, 'password'),
    aclFile: join(directory, 'acl.json'),
  };
  const settingsFile = join(directory, 'settings.json');
  await writeFile(settings.weknoraKeyFile, 'fixture-key', { mode: 0o600 });
  await writeFile(settings.neo4jPasswordFile, 'fixture-password', { mode: 0o600 });
  await writeFile(settings.aclFile, JSON.stringify(acl), { mode: 0o600 });
  await writeFile(settingsFile, JSON.stringify(settings), { mode: 0o600 });
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(directory, { recursive: true }); });
  return { state, settings, settingsFile, graphData, inventoryData, chunk, chunkB, document, documentB, acl, directory };
}

export function principal(username) { return { principal: { username } }; }
