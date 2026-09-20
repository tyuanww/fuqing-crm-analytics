import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const KB = '11111111-1111-1111-1111-111111111111';
export const DOC = '22222222-2222-2222-2222-222222222222';
export const CHUNK = '33333333-3333-3333-3333-333333333333';

export async function graphFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'crm-graph-'));
  const state = { denied: false, failGraph: false, redirect: false, wrongChunk: false, disabled: false, orphan: false, changed: false, overflow: false, delay: 0, calls: [], graphBodies: [] };
  const document = { id: DOC, knowledge_base_id: KB, title: '合成教材', deleted_at: null, parse_status: 'completed', enable_status: 'enabled', pending_subtasks_count: 0, updated_at: 'v1', processed_at: 'v1' };
  const chunk = { id: CHUNK, knowledge_id: DOC, knowledge_base_id: KB, is_enabled: true, content: '第 161 页\n会员溢价率 = 会员的AUS / 非会员的AUS', chunk_index: 1, content_revision: 1 };
  const graphData = { results: [{ columns: ['source', 'relation', 'target', 'refs', 'rank'], data: [{ row: ['会员溢价率', 'HAS_DENOMINATOR', '非会员的AUS', [CHUNK], 1] }] }], errors: [] };
  const server = createServer(async (req, res) => {
    state.calls.push({ path: req.url, method: req.method });
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (state.delay) await new Promise(r => setTimeout(r, state.delay));
    if (state.redirect) { res.writeHead(302, { Location: '/redirect-target' }); res.end(); return; }
    if (req.url.startsWith('/api/v1/')) {
      if (req.headers['x-api-key'] !== 'fixture-key' || state.denied) return json(403, { error: 'SECRET UPSTREAM BODY' });
      if (req.url === '/api/v1/knowledge/' + DOC) return json(200, { success: true, data: { ...document, ...(state.disabled ? { enable_status: 'disabled' } : {}), ...(state.changed && state.graphBodies.length ? { updated_at: 'v2' } : {}) } });
      if (req.url === '/api/v1/chunks/by-id/' + CHUNK) return json(state.orphan ? 404 : 200, { success: true, data: { ...chunk, ...(state.wrongChunk ? { knowledge_id: KB } : {}) } });
      return json(404, {});
    }
    if (req.url === '/db/neo4j/tx/commit') {
      let body = ''; for await (const part of req) body += part;
      state.graphBodies.push(JSON.parse(body));
      if (req.headers.authorization !== 'Basic ' + Buffer.from('neo4j:fixture-password').toString('base64')) return json(401, {});
      if (state.failGraph) return json(200, { errors: [{ code: 'internal', message: 'fixture-password SECRET' }] });
      if (state.overflow) { res.writeHead(200); res.end('x'.repeat(524289)); return; }
      return json(200, graphData);
    }
    return json(404, {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const settings = { weknoraOrigin: origin, neo4jOrigin: origin, username: 'neo4j', database: 'neo4j', knowledgeId: DOC, knowledgeBaseId: KB, weknoraKeyFile: join(directory, 'key'), neo4jPasswordFile: join(directory, 'password') };
  const settingsFile = join(directory, 'settings.json');
  await writeFile(settings.weknoraKeyFile, 'fixture-key', { mode: 0o600 });
  await writeFile(settings.neo4jPasswordFile, 'fixture-password', { mode: 0o600 });
  await writeFile(settingsFile, JSON.stringify(settings), { mode: 0o600 });
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(directory, { recursive: true }); });
  return { state, settings, settingsFile, graphData, chunk, document };
}
