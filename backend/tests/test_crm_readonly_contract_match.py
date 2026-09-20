"""Feed B grain into A's frozen calculator without copying A's formulas."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from backend.services.crm_readonly import build_synthetic_grain_source
from backend.tests.test_crm_readonly import make_adapter, private_dir, request_for

A_ENGINE = Path(__file__).resolve().parents[2] / "backend/semantic/crm_metrics_v1.py"


def load_a_engine():
    if not A_ENGINE.is_file():
        pytest.skip("A calculator is not in the A worktree yet")
    spec = importlib.util.spec_from_file_location("crm_metrics_v1_from_a", A_ENGINE)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


C01_LINES = [
    {
        "order_id": "o1",
        "line_id": "a",
        "user_id": "u1",
        "paid_at": "2026-09-03T10:00:00",
        "gross_paid_minor": 10000,
        "quantity": 1,
        "product_id": "P1",
        "channel": "A",
        "membership_at_purchase": "NON_MEMBER",
        "is_sample": False,
        "status": "PAID",
        "event_seq": 0,
    },
    {
        "order_id": "o1",
        "line_id": "b",
        "user_id": "u1",
        "paid_at": "2026-09-03T10:00:00",
        "gross_paid_minor": 10000,
        "quantity": 1,
        "product_id": "P1",
        "channel": "A",
        "membership_at_purchase": "NON_MEMBER",
        "is_sample": False,
        "status": "PAID",
        "event_seq": 1,
    },
    {
        "order_id": "o2",
        "line_id": "c",
        "user_id": "u1",
        "paid_at": "2026-09-04T10:00:00",
        "gross_paid_minor": 10000,
        "quantity": 1,
        "product_id": "P1",
        "channel": "A",
        "membership_at_purchase": "NON_MEMBER",
        "is_sample": False,
        "status": "PAID",
        "event_seq": 0,
    },
]


def test_b_grain_matches_a_c01_aus_aov(tmp_path):
    engine = load_a_engine()
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=C01_LINES,
    )
    grain = make_adapter(tmp_path, source).materialize(
        request_for(
            source.source_id,
            period_end_exclusive="2026-10-01",
            refund_as_of="2026-09-21",
            data_through="2026-09-21",
        )
    )
    assert [row["gross_paid_minor"] for row in grain.order_lines] == [10000, 10000, 10000]
    basket = engine.basket_from_dict(
        {
            "source_id": grain.source_id,
            "data_version": grain.data_version,
            "mapping_version": grain.mapping_version,
            "contains_real_data": False,
            "lines": grain.order_lines,
            "refunds": grain.refund_events,
        }
    )
    result = engine.sales_window_summary(
        {
            "source_id": grain.source_id,
            "contains_real_data": False,
            "metric_version": "crm-metrics/v1",
            "query_id": "sales_window_summary",
            "period_start": "2026-09-01",
            "period_end_exclusive": "2026-10-01",
            "refund_view": "ORDER_COHORT_AS_OF",
            "refund_as_of": "2026-09-21T00:00:00+08:00",
            "data_through": "2026-09-21T00:00:00+08:00",
            "timezone": "Asia/Shanghai",
            "identity_scope": "STOREWIDE",
            "amount_already_net": False,
        },
        basket,
    )
    assert result["facts"]["aus"]["value"] == 30000
    assert result["facts"]["aov"]["value"] == 15000
    assert result["facts"]["valid_order_count"]["value"] == 2
    assert result["facts"]["buyer_count"]["value"] == 1
    assert result["contains_real_data"] is False


def test_b_grain_partial_refund_matches_a_gsv70(tmp_path):
    engine = load_a_engine()
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=[
            {
                "order_id": "o",
                "line_id": "1",
                "user_id": "u",
                "paid_at": "2026-09-03T10:00:00",
                "gross_paid_minor": 10000,
                "quantity": 1,
                "product_id": "P1",
                "channel": "A",
                "membership_at_purchase": "NON_MEMBER",
                "is_sample": False,
                "status": "PAID",
                "event_seq": 0,
            }
        ],
        refunds=[
            {
                "refund_id": "r",
                "order_id": "o",
                "refunded_at": "2026-09-04T10:00:00",
                "amount_minor": 3000,
                "product_id": "P1",
                "line_id": "1",
                "status": "SUCCEEDED",
                "event_seq": 0,
            }
        ],
    )
    grain = make_adapter(tmp_path, source).materialize(
        request_for(source.source_id, period_end_exclusive="2026-10-01", refund_as_of="2026-09-21", data_through="2026-09-21")
    )
    basket = engine.basket_from_dict(
        {
            "source_id": grain.source_id,
            "data_version": grain.data_version,
            "mapping_version": grain.mapping_version,
            "contains_real_data": False,
            "lines": grain.order_lines,
            "refunds": grain.refund_events,
        }
    )
    result = engine.sales_window_summary(
        {
            "source_id": grain.source_id,
            "contains_real_data": False,
            "metric_version": "crm-metrics/v1",
            "query_id": "sales_window_summary",
            "period_start": "2026-09-01",
            "period_end_exclusive": "2026-10-01",
            "refund_view": "ORDER_COHORT_AS_OF",
            "refund_as_of": "2026-09-21T00:00:00+08:00",
            "data_through": "2026-09-21T00:00:00+08:00",
            "timezone": "Asia/Shanghai",
            "identity_scope": "STOREWIDE",
            "amount_already_net": False,
        },
        basket,
    )
    assert result["facts"]["gsv_amount"]["value"] == 7000
    assert result["facts"]["valid_order_count"]["value"] == 1
