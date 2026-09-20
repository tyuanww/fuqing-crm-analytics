"""Unavailable facts stay empty with reasons; never filled with zero."""

from __future__ import annotations

from backend.services.crm_readonly import build_synthetic_declared_orders_source, build_synthetic_grain_source
from backend.tests.test_crm_readonly import make_adapter, private_dir, request_for, three_line_sample


def _codes(result) -> set[str]:
    return {item["code"] for item in result.limitations}


def test_product_net_unavailable_without_refund_lines(tmp_path):
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=three_line_sample()[:1],
        refunds=[
            {
                "refund_id": "R1",
                "order_id": "O1",
                "refunded_at": "2026-09-11T00:00:00",
                "amount_minor": 3000,
                "product_id": None,
                "line_id": None,
                "status": "SUCCEEDED",
                "event_seq": 1,
            }
        ],
    )
    result = make_adapter(tmp_path, source).materialize(request_for(source.source_id))
    assert "PRODUCT_NET_UNAVAILABLE" in _codes(result)
    assert "MISSING_REFUND_LINES" in _codes(result)
    assert all(item.get("related_fact") != "product_net" or item.get("code") != "ZERO_DENOMINATOR" for item in result.limitations)
    assert result.refund_events[0]["amount_minor"] == 3000


def test_insufficient_history_and_unknown_identity(tmp_path):
    lines = three_line_sample()[:1]
    lines[0] = {**lines[0], "user_id": None}
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=lines,
        history_complete=False,
    )
    result = make_adapter(tmp_path, source).materialize(request_for(source.source_id))
    assert "INSUFFICIENT_HISTORY" in _codes(result)
    assert "UNIDENTIFIED_BUYERS_IN_SCOPE" in _codes(result)
    assert result.order_lines[0]["user_id"] is None
    assert result.order_lines[0]["membership_at_purchase"] == "NON_MEMBER"


def test_amount_already_net_conflict_and_over_refund(tmp_path):
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=three_line_sample()[:1],
        refunds=[
            {
                "refund_id": "R1",
                "order_id": "O1",
                "refunded_at": "2026-09-11T00:00:00",
                "amount_minor": 99999,
                "product_id": "A",
                "line_id": "L1",
                "status": "SUCCEEDED",
                "event_seq": 1,
            }
        ],
        amount_already_net=True,
    )
    result = make_adapter(tmp_path, source).materialize(request_for(source.source_id))
    assert "AMOUNT_ALREADY_NET_CONFLICT" in _codes(result)
    assert "OVER_REFUND" in _codes(result)


def test_declared_orders_without_refund_table(tmp_path):
    source = build_synthetic_declared_orders_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-declared-v1",
        include_refund_table=False,
        orders=[
            {
                "order_id": "O1",
                "sub_order_id": "S1",
                "user_id": "U1",
                "pay_time": "2026-09-10T10:00:00",
                "actual_amount": "60.00",
                "quantity": 1,
                "product_id": "A",
                "channel": "直播",
                "is_member": True,
                "order_status": "交易成功",
                "refund_amount": 30,
                "is_refund": True,
                "spu_type": "正装",
            }
        ],
    )
    result = make_adapter(tmp_path, source).materialize(request_for(source.source_id))
    assert result.refund_events == []
    assert "MISSING_REFUND_LINES" in _codes(result)
    assert result.order_lines[0]["gross_paid_minor"] == 6000
    # refund_amount on the order row is not guessed into a product-net fact
    assert all(item["code"] != "ZERO_DENOMINATOR" for item in result.limitations)
