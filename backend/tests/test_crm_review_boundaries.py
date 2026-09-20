"""Publication review regressions, using only isolated synthetic records."""
import pytest

from backend.semantic.crm_metrics_v1 import (
    MetricContractError, SyntheticReadonlySource, basket_from_dict,
    ltv_new_customer_n_day, run_query,
)
from backend.tests.test_crm_calibration_regressions import line, pipeline, refund, request, value


def test_json_cache_does_not_cross_query_kind():
    source = SyntheticReadonlySource()
    req = request(source_id="synthetic-crm-metrics")
    sales = source.execute(req)
    repeat = source.execute({**req, "query_id": "existing_customer_repurchase"})
    assert sales["query_id"] == "sales_window_summary"
    assert repeat["query_id"] == "existing_customer_repurchase"
    assert "repurchase_rate" in repeat["facts"]


def test_feb28_exclusive_feb29_keeps_a_nonempty_yoy_window(tmp_path):
    result, _, _, _ = pipeline(tmp_path, [line("base", "2023-02-28", amount=5000), line("now", "2024-02-28")],
                              period_start="2024-02-28", period_end_exclusive="2024-02-29")
    assert value(result, "gsv_yoy") == 1
    assert result["resolved_filters"]["yoy_period_end_exclusive"] == "2023-03-01"


@pytest.mark.parametrize("products", [None, ["A"]])
def test_channel_subset_never_returns_gross_as_net(tmp_path, products):
    lines = [line("mixed", "2026-09-10", channel="SHOP", amount=6000),
             {**line("mixed", "2026-09-10", channel="LIVE", product="B", amount=4000), "line_id": "second"}]
    result, _, _, _ = pipeline(tmp_path, lines, [refund("mixed")], channel_ids=["SHOP"], product_ids=products)
    assert value(result, "gsv_amount") is None
    assert result["facts"]["gsv_amount"]["empty_reason"] in {"CHANNEL_NET_UNAVAILABLE", "PRODUCT_NET_UNAVAILABLE"}


def test_product_filter_also_filters_gross_and_quantity(tmp_path):
    lines = [line("basket", "2026-09-10", amount=6000),
             {**line("basket", "2026-09-10", product="B", amount=4000), "line_id": "second", "quantity": 3}]
    result, _, _, _ = pipeline(tmp_path, lines, product_ids=["A", "A"])
    assert value(result, "gsv_amount") == 6000
    assert value(result, "gmv_amount") == 6000
    assert value(result, "items_per_order_paid") == 1


def test_unidentified_orders_do_not_inflate_identified_frequency(tmp_path):
    result, _, _, _ = pipeline(tmp_path, [line("known", "2026-09-10"), line("unknown", "2026-09-10", user=None)])
    assert value(result, "frequency_orders_per_buyer") == 1
    assert value(result, "items_per_buyer_paid") == 1
    assert value(result, "valid_order_count") == 2


def test_product_cohort_with_unallocated_historical_refund_is_unavailable(tmp_path):
    lines = [line("history", "2026-08-01"), line("again", "2026-09-10")]
    result, _, _, _ = pipeline(tmp_path, lines, [refund("history")], query_id="existing_customer_repurchase", product_ids=["A"])
    assert value(result, "repurchase_rate") is None
    assert result["facts"]["repurchase_rate"]["empty_reason"] == "PRODUCT_NET_UNAVAILABLE"


def test_ltv_cannot_prove_first_purchase_with_incomplete_history():
    data = basket_from_dict({"lines": [line("visible", "2026-09-01")], "history_complete": False})
    result = ltv_new_customer_n_day(request(), data, "U1", 14)
    assert result["value"] is None
    assert result["empty_reason"] == "INSUFFICIENT_HISTORY"


@pytest.mark.parametrize("overrides", [
    {"query_id": "sample_followup", "product_ids": ["A"]},
    {"query_id": "existing_customer_repurchase", "refund_view": "REFUND_FLOW"},
])
def test_unsupported_query_filters_are_rejected_not_ignored(overrides):
    with pytest.raises(MetricContractError, match="筛选"):
        run_query(request(**overrides), basket_from_dict({"lines": []}))
