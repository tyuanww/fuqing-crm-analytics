import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveDashboard } from './dashboard.fixture.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
export const library = JSON.parse(execFileSync(process.env.CRM_METRICS_PYTHON ?? 'python3', [fileURLToPath(new URL('./crm-assets.fixture.py', import.meta.url)), '--assets'], {
  cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, PYTHONPATH: root, PYTHON_DOTENV_DISABLED: '1' },
}));
export const snapshot = library.snapshots[0];
export const analysis = library.analyses[0];
export const reference = library.references[0];
export const analysisPage = {
  schema_version: 'crm-analysis-page/v1', data_kind: library.data_kind, next_cursor: null,
  items: [{
    schema_version: 'crm-saved-analysis-summary/v1', analysis_id: analysis.analysis_id, title: analysis.title,
    description: analysis.description ?? '', saved_at: analysis.saved_at, updated_at: analysis.updated_at ?? analysis.saved_at,
    revision: analysis.revision ?? 1, snapshot_id: analysis.snapshot.snapshot_id, filters: analysis.snapshot.result.filters, access: 'owner',
  }],
};
export const board = {
  schema_version: 'crm-board/v1', board_id: 'crm_b_' + 'b'.repeat(32), title: '销售组板', description: '',
  saved_at: analysis.saved_at, updated_at: analysis.saved_at, revision: 1,
  components: [{
    block_id: 'm1', title: 'GSV', analysis_id: analysis.analysis_id, snapshot_id: snapshot.snapshot_id, metric: 'gsv',
    layout: { x: 0, y: 0, w: 4, h: 4 },
    display: { tone: 'neutral', density: 'comfortable', value_format: 'standard', show_coverage: true },
    filters: snapshot.result.filters, metric_version: 'dashboard-gsv-purchases/v1',
    value: { amount_fen: snapshot.result.gsv_amount_fen, denominator: null, reason: null, count: null },
    result_sha256: snapshot.result_sha256,
  }],
};
export const boardPage = {
  schema_version: 'crm-board-page/v1', data_kind: library.data_kind, next_cursor: null,
  items: [{
    schema_version: 'crm-board-summary/v1', board_id: board.board_id, title: board.title, description: board.description,
    saved_at: board.saved_at, updated_at: board.updated_at, revision: board.revision, component_count: 1,
  }],
};
export const shares = { schema_version: 'crm-analysis-shares/v1', analysis_id: analysis.analysis_id, grants: [] };
export async function serveAssets(t, override) {
  const writes = [];
  const fixture = await serveDashboard(t, (url, req, res) => {
    if (override?.(url, req, res)) return true;
    const path = url.pathname;
    let value;
    if (path.endsWith('/crm-library')) value = library;
    else if (path.endsWith('/dashboard-snapshots') || path.endsWith('/' + snapshot.snapshot_id)) value = snapshot;
    else if (path.endsWith('/shares') || path.endsWith('/revoke')) value = shares;
    else if (path.endsWith('/crm-analyses') && req.method === 'GET') value = analysisPage;
    else if (path.includes('/crm-analyses')) value = analysis;
    else if (path.endsWith('/crm-boards') && req.method === 'GET') value = boardPage;
    else if (path.includes('/crm-boards')) value = board;
    else if (path.endsWith('/crm-cockpit-references') || path.endsWith('/' + reference.reference_id)) value = reference;
    if (!value) return false;
    void (async () => {
      let text = ''; for await (const chunk of req) text += chunk;
      if (text) writes.push({ body: JSON.parse(text), key: req.headers['idempotency-key'] });
      res.end(JSON.stringify(value));
    })();
    return true;
  });
  return { ...fixture, writes };
}
