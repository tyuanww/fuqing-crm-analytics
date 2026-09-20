"""Synthetic verification for crm-metrics/v1. No archive DB."""
from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from backend.contracts.crm_metrics_v1 import MetricRequest, MetricResult
from backend.semantic.crm_metrics_v1 import (
    METRIC_VERSION,
    MetricContractError,
    SyntheticReadonlySource,
    as_dt,
    basket_from_dict,
    compute_order_nets,
    default_synthetic_path,
    existing_customer_repurchase,
    explain_topic,
    first_valid_purchase,
    is_mature,
    load_basket,
    ltv_new_customer_n_day,
    natural_day_window,
    parse_line,
    result_cache_key,
    run_query,
    sample_followup,
    sales_window_summary,
    yoy_period,
)

FIXTURE = default_synthetic_path()
AS_OF = "2026-09-21T00:00:00+08:00"
THROUGH = "2026-09-21T00:00:00+08:00"


def line(**kwargs):
    base = {
        "quantity": 1,
        "product_id": "P1",
        "channel": "A",
        "membership_at_purchase": "NON_MEMBER",
        "is_sample": False,
        "status": "PAID",
        "event_seq": 0,
    }
    base.update(kwargs)
    return parse_line(base)


def basket(lines, refunds=None):
    return basket_from_dict({
        "source_id": "synthetic-crm-metrics",
        "data_version": "synthetic-crm-metrics-data/v1",
        "mapping_version": "synthetic-identity/v1",
        "contains_real_data": False,
        "lines": lines,
        "refunds": refunds or [],
    })


def req(query_id, **kwargs):
    body = {
        "source_id": "synthetic-crm-metrics",
        "contains_real_data": False,
        "metric_version": METRIC_VERSION,
        "query_id": query_id,
        "period_start": "2026-09-01",
        "period_end_exclusive": "2026-10-01",
        "refund_view": "ORDER_COHORT_AS_OF",
        "refund_as_of": AS_OF,
        "data_through": THROUGH,
        "timezone": "Asia/Shanghai",
        "identity_scope": "STOREWIDE",
        "amount_already_net": False,
    }
    body.update(kwargs)
    return body


class TestWindows:
    def test_natural_day_14_from_sep1_1500(self):
        window = natural_day_window("2026-09-01T15:00:00+08:00", 14)
        assert window["day_1"] == "2026-09-01"
        assert window["day_n"] == "2026-09-14"
        assert as_dt(window["exclusive_end"]) == as_dt("2026-09-15T00:00:00+08:00")
        assert is_mature(window["exclusive_end"], "2026-09-15T00:00:00+08:00")
        assert not is_mature(window["exclusive_end"], "2026-09-14T23:59:59+08:00")

    def test_yoy_leap_day(self):
        start, end = yoy_period("2024-02-29", "2024-03-01")
        assert start == date(2023, 2, 28)
        assert end == date(2023, 3, 1)


class TestC01Examples:
    def test_e01_three_means(self):
        data = basket([
            {"order_id": "o1", "line_id": "a", "user_id": "u1", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "o1", "line_id": "b", "user_id": "u1", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 1},
            {"order_id": "o2", "line_id": "c", "user_id": "u1", "paid_at": "2026-09-04T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["aus"]["value"] == 30000
        assert result["facts"]["aov"]["value"] == 15000
        assert result["facts"]["line_average_diagnostic"]["value"] == 10000
        assert result["facts"]["valid_order_count"]["value"] == 2
        assert result["facts"]["buyer_count"]["value"] == 1

    def test_e02_member_premium_is_multiple(self):
        lines = []
        for i, uid in enumerate(("m1", "m2")):
            lines.append({"order_id": uid, "line_id": "1", "user_id": uid, "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 20000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0})
        for uid in ("n1", "n2", "n3", "n4"):
            lines.append({"order_id": uid, "line_id": "1", "user_id": uid, "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0})
        result = sales_window_summary(req("sales_window_summary"), basket(lines))
        assert result["facts"]["member_aus"]["value"] == 20000
        assert result["facts"]["non_member_aus"]["value"] == 10000
        assert result["facts"]["member_premium_multiple"]["value"] == 2.0
        assert result["facts"]["member_premium_multiple"]["unit"] == "multiple"

    def test_e03_partial_refund_still_valid(self):
        data = basket(
            [{"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0}],
            [{"refund_id": "r", "order_id": "o", "refunded_at": "2026-09-04T10:00:00+08:00", "amount_minor": 3000, "product_id": "P1", "line_id": "1", "status": "SUCCEEDED", "event_seq": 0}],
        )
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["gsv_amount"]["value"] == 7000
        assert result["facts"]["valid_order_count"]["value"] == 1
        assert result["facts"]["buyer_count"]["value"] == 1

    def test_e04_cross_period_refund_two_views(self):
        data = basket(
            [{"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-10T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0}],
            [{"refund_id": "r", "order_id": "o", "refunded_at": "2026-10-05T10:00:00+08:00", "amount_minor": 3000, "product_id": "P1", "line_id": "1", "status": "SUCCEEDED", "event_seq": 0}],
        )
        sep_end = sales_window_summary(req("sales_window_summary", refund_as_of="2026-09-30T00:00:00+08:00"), data)
        oct_asof = sales_window_summary(req("sales_window_summary", refund_as_of="2026-10-31T00:00:00+08:00"), data)
        flow = sales_window_summary(req(
            "sales_window_summary",
            refund_view="REFUND_FLOW",
            period_start="2026-10-01",
            period_end_exclusive="2026-11-01",
            refund_as_of="2026-10-31T00:00:00+08:00",
        ), data)
        assert sep_end["facts"]["gsv_amount"]["value"] == 10000
        assert oct_asof["facts"]["gsv_amount"]["value"] == 7000
        assert flow["facts"]["refund_flow_amount"]["value"] == 3000

    def test_e05_window_start_old_customer(self):
        data = basket([
            {"order_id": "h", "line_id": "1", "user_id": "u", "paid_at": "2026-09-10T10:00:00+08:00", "gross_paid_minor": 5000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "w", "line_id": "1", "user_id": "u", "paid_at": "2026-09-16T10:00:00+08:00", "gross_paid_minor": 5000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        result = sales_window_summary(req("sales_window_summary", period_start="2026-09-15", period_end_exclusive="2026-09-21"), data)
        assert result["facts"]["old_buyer_count"]["value"] == 1
        assert result["facts"]["new_buyer_count"]["value"] == 0

    def test_e06_product_refund_attribution(self):
        data = basket(
            [
                {"order_id": "o", "line_id": "a", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 6000, "quantity": 1, "product_id": "A", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
                {"order_id": "o", "line_id": "b", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 4000, "quantity": 1, "product_id": "B", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 1},
            ],
            [{"refund_id": "r", "order_id": "o", "refunded_at": "2026-09-04T10:00:00+08:00", "amount_minor": 3000, "product_id": "B", "line_id": None, "status": "SUCCEEDED", "event_seq": 0}],
        )
        only_a = sales_window_summary(req("sales_window_summary", product_ids=["A"]), data)
        only_b = sales_window_summary(req("sales_window_summary", product_ids=["B"]), data)
        assert only_a["facts"]["gsv_amount"]["value"] == 6000
        assert only_b["facts"]["gsv_amount"]["value"] == 1000

    def test_e06_missing_refund_line_blocks_product_net(self):
        data = basket(
            [
                {"order_id": "o", "line_id": "a", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 6000, "quantity": 1, "product_id": "A", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
                {"order_id": "o", "line_id": "b", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 4000, "quantity": 1, "product_id": "B", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 1},
            ],
            [{"refund_id": "r", "order_id": "o", "refunded_at": "2026-09-04T10:00:00+08:00", "amount_minor": 3000, "product_id": None, "line_id": None, "status": "SUCCEEDED", "event_seq": 0}],
        )
        only_a = sales_window_summary(req("sales_window_summary", product_ids=["A"]), data)
        assert only_a["facts"]["gsv_amount"]["value"] is None
        assert only_a["facts"]["gsv_amount"]["empty_reason"] == "PRODUCT_NET_UNAVAILABLE"
        whole = sales_window_summary(req("sales_window_summary"), data)
        assert whole["facts"]["gsv_amount"]["value"] == 7000

    def test_full_refund_other_order_still_counts_person(self):
        data = basket(
            [
                {"order_id": "full", "line_id": "1", "user_id": "u", "paid_at": "2026-09-02T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
                {"order_id": "keep", "line_id": "1", "user_id": "u", "paid_at": "2026-09-08T10:00:00+08:00", "gross_paid_minor": 5000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            ],
            [{"refund_id": "r", "order_id": "full", "refunded_at": "2026-09-03T10:00:00+08:00", "amount_minor": 10000, "product_id": "P1", "line_id": "1", "status": "SUCCEEDED", "event_seq": 0}],
        )
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["valid_order_count"]["value"] == 1
        assert result["facts"]["buyer_count"]["value"] == 1
        assert result["facts"]["gsv_amount"]["value"] == 5000

    def test_d021_recompute_first_purchase_after_full_refund(self):
        data = basket(
            [
                {"order_id": "old", "line_id": "1", "user_id": "u", "paid_at": "2025-01-01T10:00:00+08:00", "gross_paid_minor": 9000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
                {"order_id": "new", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 7000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            ],
            [{"refund_id": "r", "order_id": "old", "refunded_at": "2026-08-01T10:00:00+08:00", "amount_minor": 9000, "product_id": "P1", "line_id": "1", "status": "SUCCEEDED", "event_seq": 0}],
        )
        orders = compute_order_nets(data.lines, data.refunds, AS_OF)
        first = first_valid_purchase(orders, "u")
        assert first is not None and first.order_id == "new"
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["new_buyer_count"]["value"] == 1
        assert result["facts"]["old_buyer_count"]["value"] == 0

    def test_mid_month_join_two_groups(self):
        data = basket([
            {"order_id": "a", "line_id": "1", "user_id": "u", "paid_at": "2026-09-05T10:00:00+08:00", "gross_paid_minor": 8000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "b", "line_id": "1", "user_id": "u", "paid_at": "2026-09-20T10:00:00+08:00", "gross_paid_minor": 12000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["member_buyer_count"]["value"] == 1
        assert result["facts"]["non_member_buyer_count"]["value"] == 1
        assert result["facts"]["storewide_unique_buyers"]["value"] == 1
        assert result["facts"]["member_plus_nonmember_buyers_not_storewide_unique"]["value"] == 2

    def test_e08_yoy_zero_base_is_null(self):
        data = basket([
            {"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["gsv_yoy"]["value"] is None
        assert result["facts"]["gsv_yoy"]["empty_reason"] == "INCOMPARABLE_BASE"

    def test_e12_no_guess_net_quantity(self):
        data = basket(
            [{"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 10000, "quantity": 2, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0}],
            [{"refund_id": "r", "order_id": "o", "refunded_at": "2026-09-04T10:00:00+08:00", "amount_minor": 3000, "product_id": "P1", "line_id": "1", "status": "SUCCEEDED", "event_seq": 0}],
        )
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["gsv_amount"]["value"] == 7000
        assert result["facts"]["net_quantity"]["value"] is None
        assert result["facts"]["net_quantity"]["empty_reason"] == "CAPABILITY_UNAVAILABLE"

    def test_amount_already_net_conflict(self):
        data = basket(
            [{"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 7000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0}],
            [{"refund_id": "r", "order_id": "o", "refunded_at": "2026-09-04T10:00:00+08:00", "amount_minor": 3000, "product_id": "P1", "line_id": "1", "status": "SUCCEEDED", "event_seq": 0}],
        )
        with pytest.raises(MetricContractError) as exc:
            sales_window_summary(req("sales_window_summary", amount_already_net=True), data)
        assert exc.value.code == "AMOUNT_ALREADY_NET_CONFLICT"

    def test_unknown_membership_not_non_member(self):
        data = basket([
            {"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 4000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "UNKNOWN", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["member_unknown_buyer_count"]["value"] == 1
        assert result["facts"]["non_member_buyer_count"]["value"] == 0
        assert result["facts"]["member_premium_multiple"]["value"] is None

    def test_cancelled_excluded(self):
        data = basket([
            {"order_id": "o", "line_id": "1", "user_id": "u", "paid_at": "2026-09-03T10:00:00+08:00", "gross_paid_minor": 9999, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "CANCELLED", "event_seq": 0},
        ])
        result = sales_window_summary(req("sales_window_summary"), data)
        assert result["facts"]["gmv_amount"]["value"] == 0
        assert result["facts"]["valid_order_count"]["value"] == 0


class TestRepurchaseAndSample:
    def test_e10_product_repurchase_uses_historical_set(self):
        data = basket([
            {"order_id": "h1", "line_id": "1", "user_id": "hist1", "paid_at": "2026-07-01T10:00:00+08:00", "gross_paid_minor": 1000, "quantity": 1, "product_id": "A", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "h2", "line_id": "1", "user_id": "hist2", "paid_at": "2026-07-01T10:00:00+08:00", "gross_paid_minor": 1000, "quantity": 1, "product_id": "A", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "now", "line_id": "1", "user_id": "hist1", "paid_at": "2026-09-11T10:00:00+08:00", "gross_paid_minor": 1000, "quantity": 1, "product_id": "A", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "nb", "line_id": "1", "user_id": "newbie", "paid_at": "2026-09-11T10:00:00+08:00", "gross_paid_minor": 1000, "quantity": 1, "product_id": "A", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        result = existing_customer_repurchase(req("existing_customer_repurchase", product_ids=["A"]), data)
        assert result["facts"]["opening_old_customers"]["value"] == 2
        assert result["facts"]["repurchase_buyers"]["value"] == 1
        assert result["facts"]["repurchase_rate"]["value"] == 0.5

    def test_sample_first_attribution_and_maturity(self):
        data = basket([
            {"order_id": "s1", "line_id": "1", "user_id": "ivy", "paid_at": "2026-09-02T15:00:00+08:00", "gross_paid_minor": 0, "quantity": 1, "product_id": "SAMPLE", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": True, "status": "PAID", "event_seq": 0},
            {"order_id": "s2", "line_id": "1", "user_id": "ivy", "paid_at": "2026-09-08T15:00:00+08:00", "gross_paid_minor": 0, "quantity": 1, "product_id": "SAMPLE", "channel": "B", "membership_at_purchase": "NON_MEMBER", "is_sample": True, "status": "PAID", "event_seq": 0},
            {"order_id": "buy", "line_id": "1", "user_id": "ivy", "paid_at": "2026-09-12T15:00:00+08:00", "gross_paid_minor": 18000, "quantity": 1, "product_id": "P9", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "late", "line_id": "1", "user_id": "jade", "paid_at": "2026-09-18T15:00:00+08:00", "gross_paid_minor": 0, "quantity": 1, "product_id": "SAMPLE", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": True, "status": "PAID", "event_seq": 0},
        ])
        result = sample_followup(req("sample_followup", observation_days=14), data)
        assert result["facts"]["sample_cohort_count"]["value"] == 2
        assert result["facts"]["mature_cohort_count"]["value"] == 1
        assert result["facts"]["immature_count"]["value"] == 1
        assert result["facts"]["repeat_buyers"]["value"] == 1
        assert result["facts"]["repeat_rate"]["value"] == 1.0
        assert result["facts"]["sampling_roi"]["value"] == 18000
        assert "复购收入表现" in result["facts"]["sampling_roi_disclaimer"]
        channel_b = sample_followup(req("sample_followup", observation_days=14, channel_ids=["B"]), data)
        assert channel_b["facts"]["sample_cohort_count"]["value"] == 0

    def test_same_order_split_is_not_repeat(self):
        data = basket([
            {"order_id": "s", "line_id": "1", "user_id": "u", "paid_at": "2026-09-01T15:00:00+08:00", "gross_paid_minor": 0, "quantity": 1, "product_id": "SAMPLE", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": True, "status": "PAID", "event_seq": 0},
            {"order_id": "s", "line_id": "2", "user_id": "u", "paid_at": "2026-09-01T15:00:00+08:00", "gross_paid_minor": 8000, "quantity": 1, "product_id": "P9", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 1},
        ])
        result = sample_followup(req("sample_followup", observation_days=14), data)
        assert result["facts"]["repeat_buyers"]["value"] == 0

    def test_empty_mature_not_zero(self):
        data = basket([
            {"order_id": "late", "line_id": "1", "user_id": "jade", "paid_at": "2026-09-18T15:00:00+08:00", "gross_paid_minor": 0, "quantity": 1, "product_id": "SAMPLE", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": True, "status": "PAID", "event_seq": 0},
        ])
        result = sample_followup(req("sample_followup", observation_days=14), data)
        assert result["facts"]["repeat_rate"]["value"] is None
        assert result["facts"]["repeat_rate"]["empty_reason"] == "EMPTY_MATURE_COHORT"

    def test_ltv_includes_first_order_and_maturity(self):
        data = basket([
            {"order_id": "f", "line_id": "1", "user_id": "u", "paid_at": "2026-09-01T15:00:00+08:00", "gross_paid_minor": 10000, "quantity": 1, "product_id": "P1", "channel": "A", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
            {"order_id": "later", "line_id": "1", "user_id": "u", "paid_at": "2026-09-10T15:00:00+08:00", "gross_paid_minor": 4000, "quantity": 1, "product_id": "P2", "channel": "B", "membership_at_purchase": "NON_MEMBER", "is_sample": False, "status": "PAID", "event_seq": 0},
        ])
        mature = ltv_new_customer_n_day(req("sales_window_summary"), data, "u", 14)
        assert mature["includes_first_order"] is True
        assert mature["value"] == 14000
        immature = ltv_new_customer_n_day(req("sales_window_summary"), data, "u", 30)
        assert immature["value"] is None
        assert immature["empty_reason"] == "IMMATURE"


class TestStoreQueriesAndContract:
    def test_three_queries_on_store_fixture(self):
        store = load_basket(FIXTURE)
        sales = run_query(req("sales_window_summary"), store)
        repurchase = run_query(req("existing_customer_repurchase"), store)
        sample = run_query(req("sample_followup", observation_days=14), store)
        for result, query_id in ((sales, "sales_window_summary"), (repurchase, "existing_customer_repurchase"), (sample, "sample_followup")):
            MetricResult.model_validate(result)
            MetricRequest.model_validate(req(query_id, observation_days=14 if query_id == "sample_followup" else None))
            assert result["metric_version"] == METRIC_VERSION
            assert result["synthetic"] is True
            assert result["contains_real_data"] is False
            assert result["real_business_acceptance"] is False
            assert result["production_release"] is False
            assert result["facts"]
            assert result["resolved_filters"]["timezone"] == "Asia/Shanghai"
            assert result["query_ref"]
            assert any(item["code"] == "D019_SOURCE_UNVERIFIED" for item in result["limitations"])
        assert sales["facts"]["aus"]["value"] is not None
        assert sales["facts"]["aov"]["value"] is not None
        assert sales["facts"]["uv_cycle_unique"]["empty_reason"] == "CAPABILITY_UNAVAILABLE"
        assert repurchase["facts"]["opening_old_customers"]["value"] >= 1
        assert sample["facts"]["immature_count"]["value"] >= 1
        assert sample["facts"]["sampling_roi_kind"] == "repeat_revenue_performance"

    def test_reject_real_data_flag(self):
        store = load_basket(FIXTURE)
        with pytest.raises(MetricContractError):
            run_query(req("sales_window_summary", contains_real_data=True), store)

    def test_wrong_metric_version(self):
        store = load_basket(FIXTURE)
        body = req("sales_window_summary")
        body["metric_version"] = "crm-metrics/v0"
        with pytest.raises(MetricContractError):
            run_query(body, store)

    def test_wire_request_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            MetricRequest.model_validate(req("sales_window_summary") | {"sql": "select 1"})

    def test_synthetic_readonly_source_and_cache_key(self):
        source = SyntheticReadonlySource()
        first = source.execute(req("sales_window_summary"))
        second = source.execute(req("sales_window_summary"))
        assert first["query_ref"] == second["query_ref"]
        assert second is first or second == first
        key_a = result_cache_key(
            first["source_id"], first["data_version"], first["mapping_version"],
            first["metric_version"], first["resolved_filters"], "server_filled",
        )
        key_b = result_cache_key(
            first["source_id"], first["data_version"], first["mapping_version"],
            "crm-metrics/v0", first["resolved_filters"], "server_filled",
        )
        assert key_a != key_b
        with pytest.raises(MetricContractError):
            SyntheticReadonlySource("/tmp/other.json")


class TestCandidateApp:
    def test_http_query_and_explain(self):
        from fastapi.testclient import TestClient
        from backend.crm_metrics_app import create_crm_metrics_app

        client = TestClient(create_crm_metrics_app())
        caps = client.get("/api/v1/crm-metrics/capabilities")
        assert caps.status_code == 200
        assert caps.json()["real_archive"] is False
        body = req("sales_window_summary")
        posted = client.post("/api/v1/crm-metrics/query", json=body)
        assert posted.status_code == 200
        assert posted.json()["facts"]["aus"]["value"] is not None
        explained = client.post("/api/v1/crm-metrics/explain", json={"topic": "派样ROI", "metric_version": METRIC_VERSION})
        assert explained.status_code == 200
        assert "D011" in explained.json()["decision_ids"]


class TestExplain:
    def test_aus_not_claimed_legacy_fixed(self):
        result = explain_topic("客单价")
        assert result["topic"] == "aus"
        assert "D001" in result["decision_ids"]
        assert result["code_fixed_in_legacy_services"] is False
        assert any("行均" in item for item in result["conflicts"])

    def test_member_premium_unit(self):
        result = explain_topic("会员溢价")
        assert result["unit"] == "multiple"
        assert any("1.2" in item for item in result["conflicts"])

    def test_new_member_conversion_missing_join_event(self):
        result = explain_topic("新会员转化")
        assert result["implementation_status"] == "source_unverified"
        assert result["capabilities"] == []
        assert any("入会" in item for item in result["missing"])
