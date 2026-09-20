"""A calculation composed with B synthetic grain. No archive DB."""
from __future__ import annotations

import os
from pathlib import Path

from backend.semantic.crm_metrics_compose import run_composed_query
from backend.semantic.crm_metrics_v1 import METRIC_VERSION
from backend.services.crm_readonly import (
    CrmReadonlyAdapter,
    GrainRequest,
    SourceRegistry,
    build_synthetic_grain_source,
)
from backend.tests.test_crm_readonly import three_line_sample


def private_dir(tmp_path: Path, name: str) -> Path:
    path = tmp_path / name
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)
    return path


def test_b_grain_feeds_c01_aus_aov(tmp_path):
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=three_line_sample(),
    )
    adapter = CrmReadonlyAdapter(
        SourceRegistry([source]),
        cache_dir=private_dir(tmp_path, "cache"),
        temp_dir=private_dir(tmp_path, "tmp"),
        server_scope=source.permission_scope,
    )
    grain = adapter.materialize(
        GrainRequest(
            source_id=source.source_id,
            contains_real_data=False,
            metric_version=METRIC_VERSION,
            query_id="sales_window_summary",
            period_start="2026-09-01",
            period_end_exclusive="2026-10-01",
            refund_view="ORDER_COHORT_AS_OF",
            refund_as_of="2026-09-21",
            data_through="2026-09-21",
        )
    )
    request = {
        "source_id": source.source_id,
        "contains_real_data": False,
        "metric_version": METRIC_VERSION,
        "query_id": "sales_window_summary",
        "period_start": "2026-09-01",
        "period_end_exclusive": "2026-10-01",
        "refund_view": "ORDER_COHORT_AS_OF",
        "refund_as_of": "2026-09-21T00:00:00+08:00",
        "data_through": "2026-09-21T00:00:00+08:00",
        "timezone": "Asia/Shanghai",
        "identity_scope": "STOREWIDE",
        "amount_already_net": False,
    }
    result = run_composed_query(request, grain)
    assert result["synthetic"] is True
    assert result["facts"]["aus"]["value"] == 30000
    assert result["facts"]["aov"]["value"] == 15000
    assert result["facts"]["line_average_diagnostic"]["value"] == 10000
    assert result["adapter_query_ref"]
    assert result["mapping_version"] == grain.mapping_version
