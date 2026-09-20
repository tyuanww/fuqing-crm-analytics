"""Synthetic grain adapter matches crm-metrics/v1 input grain."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pytest

from backend.services.crm_readonly import (
    CrmReadonlyAdapter,
    GrainRequest,
    SourceRegistry,
    build_synthetic_declared_orders_source,
    build_synthetic_grain_source,
    inventory_document,
)
from backend.services.crm_readonly.versions import ORDER_LINE_FIELDS, REFUND_EVENT_FIELDS

A_CONTRACT = Path(__file__).resolve().parents[2] / "docs/crm-calibration/contracts/crm-metrics-v1.json"


def private_dir(tmp_path: Path, name: str) -> Path:
    path = tmp_path / name
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)
    return path


def request_for(source_id: str, **overrides) -> GrainRequest:
    payload = dict(
        source_id=source_id,
        contains_real_data=False,
        metric_version="crm-metrics/v1",
        query_id="sales_window_summary",
        period_start="2026-09-01",
        period_end_exclusive="2026-09-20",
        refund_view="ORDER_COHORT_AS_OF",
        refund_as_of="2026-09-19",
        data_through="2026-09-19",
    )
    payload.update(overrides)
    return GrainRequest(**payload)


def three_line_sample():
    return [
        {
            "order_id": "O1",
            "line_id": "L1",
            "user_id": "U1",
            "paid_at": "2026-09-10T10:00:00",
            "gross_paid_minor": 10000,
            "quantity": 1,
            "product_id": "A",
            "channel": "直播",
            "membership_at_purchase": "NON_MEMBER",
            "is_sample": False,
            "status": "PAID",
            "event_seq": 1,
        },
        {
            "order_id": "O1",
            "line_id": "L2",
            "user_id": "U1",
            "paid_at": "2026-09-10T10:00:00",
            "gross_paid_minor": 10000,
            "quantity": 1,
            "product_id": "B",
            "channel": "直播",
            "membership_at_purchase": "NON_MEMBER",
            "is_sample": False,
            "status": "PAID",
            "event_seq": 2,
        },
        {
            "order_id": "O2",
            "line_id": "L3",
            "user_id": "U1",
            "paid_at": "2026-09-12T11:00:00",
            "gross_paid_minor": 10000,
            "quantity": 1,
            "product_id": "A",
            "channel": "直播",
            "membership_at_purchase": "MEMBER",
            "is_sample": False,
            "status": "PAID",
            "event_seq": 1,
        },
    ]


def make_adapter(tmp_path: Path, source) -> CrmReadonlyAdapter:
    return CrmReadonlyAdapter(
        SourceRegistry([source]),
        cache_dir=private_dir(tmp_path, "cache"),
        temp_dir=private_dir(tmp_path, "tmp"),
        server_scope=source.permission_scope,
    )


def test_inventory_marks_d019_unverified_and_conflicts():
    doc = inventory_document()
    assert doc["real_database_connected"] is False
    assert doc["d019_status"] == "awaiting_source_verification"
    assert doc["order_line_fields"] == list(ORDER_LINE_FIELDS)
    assert any(item["logical"] == "is_sample" and item["verification_status"] == "declared_schema_conflict" for item in doc["items"])
    assert any(item["verification_status"] == "missing_declared" and "event_seq" in item["logical"] for item in doc["items"])


def test_contract_fingerprint_matches_a_if_present():
    assert list(ORDER_LINE_FIELDS) == [
        "order_id", "line_id", "user_id", "paid_at", "gross_paid_minor", "quantity",
        "product_id", "channel", "membership_at_purchase", "is_sample", "status", "event_seq",
    ]
    assert list(REFUND_EVENT_FIELDS) == [
        "refund_id", "order_id", "refunded_at", "amount_minor", "product_id", "line_id", "status", "event_seq",
    ]
    if not A_CONTRACT.is_file():
        pytest.skip("A contract file is not in the A worktree yet")
    contract = json.loads(A_CONTRACT.read_text(encoding="utf-8"))
    assert contract["metric_version"] == "crm-metrics/v1"
    assert contract["input_grain"]["order_line"] == list(ORDER_LINE_FIELDS)
    assert contract["input_grain"]["refund_event"] == list(REFUND_EVENT_FIELDS)


def test_grain_three_lines_sum_300_yuan(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    adapter = make_adapter(tmp_path, source)
    result = adapter.materialize(request_for(source.source_id))
    assert result.real_database_connected is False
    assert result.synthetic is True
    assert result.contains_real_data is False
    assert result.metric_version == "crm-metrics/v1"
    assert {key for row in result.order_lines for key in row} <= set(ORDER_LINE_FIELDS)
    assert sum(row["gross_paid_minor"] for row in result.order_lines) == 30000
    assert len({row["order_id"] for row in result.order_lines}) == 2
    assert result.status == "OK"
    before = hashlib.sha256(source.path.read_bytes()).hexdigest()
    adapter.materialize(request_for(source.source_id))
    assert hashlib.sha256(source.path.read_bytes()).hexdigest() == before


def test_declared_orders_convert_yuan_and_drop_nickname(tmp_path):
    source = build_synthetic_declared_orders_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-declared-v1",
        orders=[
            {
                "order_id": "O1",
                "sub_order_id": "S1",
                "user_id": "U1",
                "user_nickname": "SECRET-NAME",
                "pay_time": "2026-09-10T10:00:00",
                "actual_amount": "100.00",
                "quantity": 1,
                "product_id": "A",
                "channel": "直播",
                "is_member": False,
                "order_status": "交易成功",
                "spu_type": "正装",
            }
        ],
        refunds=[
            {
                "refund_id": "R1",
                "order_id": "O1",
                "refunded_at": "2026-09-11T00:00:00",
                "amount_minor": 3000,
                "product_id": "A",
                "line_id": "S1",
                "status": "SUCCEEDED",
                "event_seq": 1,
            }
        ],
    )
    result = make_adapter(tmp_path, source).materialize(request_for(source.source_id))
    assert result.order_lines[0]["gross_paid_minor"] == 10000
    assert result.order_lines[0]["status"] == "PAID"
    dumped = json.dumps(result.as_dict(), ensure_ascii=False)
    assert "SECRET-NAME" not in dumped
    assert result.refund_events[0]["amount_minor"] == 3000
