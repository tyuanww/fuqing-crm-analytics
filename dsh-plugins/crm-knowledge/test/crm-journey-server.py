"""Owned loopback CRM analysis API for browser journey tests."""
from __future__ import annotations
import os
from pathlib import Path
import sys
import tempfile
import duckdb
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import uvicorn

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
os.environ["PYTHON_DOTENV_DISABLED"] = "1"

from backend.db import connection  # noqa: E402
from backend.main import auth_middleware  # noqa: E402
from backend.routers import auth  # noqa: E402
from backend.routers.metrics import router  # noqa: E402
from backend.services.crm_analysis import CrmAnalysisStore  # noqa: E402

directory = Path(tempfile.mkdtemp(prefix="crm-journey-"))
directory.chmod(0o700)
con = duckdb.connect(":memory:")
con.execute("""CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, actual_amount DOUBLE, channel VARCHAR,
    pay_time TIMESTAMP, is_refund BOOLEAN, is_goujinjin BOOLEAN, order_status VARCHAR)""")
con.execute("""INSERT INTO orders VALUES ('o1','u1',10.01,'货架','2026-01-01',false,false,'交易成功'),
    ('o1','u1',20,'货架','2026-01-01',false,false,'交易成功'),
    ('o2','u2',50,'货架','2026-01-01',false,false,'交易成功'),
    ('o3','u1',0,'货架','2026-01-01',false,false,'交易成功')""")
connection.get_connection = lambda: con
store = CrmAnalysisStore(directory, "synthetic")
os.environ["FQ_CRM_ANALYSIS_STATE_DIR"] = str(directory)
os.environ["FQ_CRM_ANALYSIS_DATA_KIND"] = "synthetic"
auth.VALID_CREDENTIALS = {"alice": "hash", "bob": "hash"}
auth._verify_token = lambda token: {"test-alice": "alice", "test-bob": "bob"}.get(token)
app = FastAPI()
app.middleware("http")(auth_middleware)
app.include_router(router)
PAGE = """<!doctype html><meta charset="utf-8"><title>CRM 组板旅程</title>
<p data-testid="status">idle</p>
<button id="run">查询并组板</button>
<button id="reload">刷新重开</button>
<script>
const headers = { authorization: 'Bearer test-alice', 'content-type': 'application/json', 'idempotency-key': 'k' };
const status = document.querySelector('[data-testid="status"]');
const filters = { start_date: '2026-01-01', end_date: '2026-01-02', channel: '货架', exclude_low_price: false };
async function call(method, path, body, key) {
  const res = await fetch('/api/v1/metrics/' + path, { method, headers: { ...headers, 'idempotency-key': key }, body: body ? JSON.stringify(body) : undefined });
  const value = await res.json();
  if (!res.ok) throw new Error(value.detail?.code || res.status);
  return value;
}
document.getElementById('run').onclick = async () => {
  try {
    const snap = await call('POST', 'dashboard-snapshots', filters, 'cap');
    const saved = await call('POST', 'crm-analyses', { snapshot_id: snap.snapshot_id, title: '浏览器分析', description: '旅程' }, 'save');
    const patched = await call('PATCH', 'crm-analyses/' + saved.analysis_id, { title: '浏览器分析', description: '已编辑', base_revision: saved.revision }, 'patch');
    const board = await call('POST', 'crm-boards', { title: '浏览器组板', description: '', components: [{
      block_id: 'm1', title: 'GSV', analysis_id: saved.analysis_id, snapshot_id: snap.snapshot_id, metric: 'gsv',
      layout: { x: 0, y: 0, w: 4, h: 4 } }] }, 'board');
    await call('POST', 'crm-analyses/' + saved.analysis_id + '/shares', { username: 'bob' }, 'share');
    const bobRead = await fetch('/api/v1/metrics/crm-analyses/' + saved.analysis_id, { headers: { authorization: 'Bearer test-bob' } });
    await call('POST', 'crm-analyses/' + saved.analysis_id + '/shares/bob/revoke', {}, 'revoke');
    const bobRevoked = await fetch('/api/v1/metrics/crm-analyses/' + saved.analysis_id, { headers: { authorization: 'Bearer test-bob' } });
    window.__journey = { snap, saved, patched, board, bobRead: bobRead.status, bobRevoked: bobRevoked.status };
    status.textContent = 'saved ' + patched.description + ' ' + board.components[0].value.amount_fen + ' share=' + bobRead.status + ' revoke=' + bobRevoked.status;
  } catch (error) { status.textContent = 'error ' + error.message; }
};
document.getElementById('reload').onclick = async () => {
  const board = await call('GET', 'crm-boards/' + window.__journey.board.board_id);
  const analysis = await call('GET', 'crm-analyses/' + window.__journey.saved.analysis_id);
  const bob = await fetch('/api/v1/metrics/crm-boards/' + board.board_id, { headers: { authorization: 'Bearer test-bob' } });
  status.textContent = 'reopen ' + analysis.description + ' ' + board.components[0].value.amount_fen + ' bob=' + bob.status;
};
</script>"""

@app.get("/docs/crm-journey", response_class=HTMLResponse)
def page():
    return PAGE


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
