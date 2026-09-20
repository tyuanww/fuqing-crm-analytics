"""Feed the JS consumer actual service output using a tiny owned in-memory DB."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import duckdb

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from backend.contracts.crm_analysis import CrmSnapshotRequest  # noqa: E402
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases  # noqa: E402

conn = duckdb.connect(":memory:")
try:
    conn.execute("""CREATE TABLE orders AS SELECT * FROM (VALUES
    ('o1', 'u1', 10.01, '货架', TIMESTAMP '2026-01-01 12:00:00', false, false, '交易成功'),
    ('o1', 'u1', 20.00, '货架', TIMESTAMP '2026-01-01 12:00:00', false, false, '交易成功'),
    ('o2', 'u2', 50.00, '货架', TIMESTAMP '2026-01-02 12:00:00', false, false, '交易成功'),
    ('o3', 'u1', 0.00, '货架', TIMESTAMP '2026-01-02 12:00:00', false, false, '交易成功')
    ) t(order_id, user_id, actual_amount, channel, pay_time, is_refund, is_goujinjin, order_status)""")
    request = CrmSnapshotRequest(start_date="2026-01-01", end_date="2026-01-02")
    if "--assets" in sys.argv:
        from backend.contracts.crm_analysis import CrmAddReference, CrmSaveAnalysis
        from backend.services.crm_analysis import CrmAnalysisStore
        with TemporaryDirectory(prefix="crm-assets-fixture-") as directory:
            store = CrmAnalysisStore(Path(directory), "synthetic")
            snapshot = store.capture("fixture-user", "query", request, lambda value: query_dashboard_purchases(conn, value))
            analysis = store.save("fixture-user", "save", CrmSaveAnalysis(snapshot_id=snapshot.snapshot_id, title="合成销售分析"))
            store.pin("fixture-user", "pin", CrmAddReference(analysis_id=analysis.analysis_id))
            print(store.library("fixture-user").model_dump_json())
    else:
        print(json.dumps(query_dashboard_purchases(conn, request).model_dump(mode="json")))
finally:
    conn.close()
