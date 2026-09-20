"""Review R01-R08 through real synthetic DuckDB -> adapter -> engine."""
from dataclasses import replace

import pytest

from backend.contracts.crm_metrics_v1 import MetricResult
from backend.semantic.crm_metrics_compose import run_composed_query
from backend.semantic.crm_metrics_v1 import MetricContractError, basket_from_dict, run_query
from backend.services.crm_readonly import GrainRequest, build_synthetic_grain_source
from backend.tests.test_crm_readonly import make_adapter, private_dir


def line(oid, day, *, user="U1", product="A", amount=10000, sample=False, channel="SHOP"):
    return dict(order_id=oid, line_id=oid + "_L", user_id=user, paid_at=day + "T10:00:00", gross_paid_minor=amount, quantity=1, product_id=product, channel=channel, membership_at_purchase="NON_MEMBER", is_sample=sample, status="PAID", event_seq=1)


def refund(oid, amount=3000, **kw):
    return dict(refund_id="R_" + oid, order_id=oid, refunded_at="2026-09-15T10:00:00", amount_minor=amount, product_id=None, line_id=None, status="SUCCEEDED", event_seq=2, **kw)


def request(**overrides):
    out = dict(source_id="audit", contains_real_data=False, metric_version="crm-metrics/v1", query_id="sales_window_summary", period_start="2026-09-01", period_end_exclusive="2026-10-01", refund_view="ORDER_COHORT_AS_OF", refund_as_of="2026-10-20T00:00:00+08:00", data_through="2026-10-20T00:00:00+08:00", timezone="Asia/Shanghai", identity_scope="STOREWIDE", amount_already_net=False)
    return {**out, **overrides}


def pipeline(tmp_path, lines, refunds=None, meta=None, **overrides):
    options = dict(coverage_start="2020-01-01", data_through="2026-10-20")
    options.update(meta or {})
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="audit", lines=lines, refunds=refunds or [], **options)
    adapter = make_adapter(tmp_path, source)
    req = request(**overrides)
    grain = adapter.materialize(GrainRequest(**req))
    result = run_composed_query(req, grain)
    MetricResult.model_validate(result)
    return result, grain, adapter, req


def value(result, key):
    return result["facts"][key]["value"]


@pytest.mark.parametrize("query", ["sales_window_summary", "existing_customer_repurchase"])
def test_r01_r02_history_before_window(tmp_path, query):
    out, grain, _, _ = pipeline(tmp_path, [line("old", "2026-08-10"), line("new", "2026-09-10")], query_id=query)
    assert len(grain.order_lines) == 2
    if query == "sales_window_summary":
        assert value(out, "old_buyer_count") == 1
        assert value(out, "new_buyer_count") == 0
    else:
        assert value(out, "opening_old_customers") == 1
        assert value(out, "repurchase_buyers") == 1
        assert value(out, "repurchase_rate") == 1


def test_r03_unallocated_refund_survives_product_filter(tmp_path):
    out, grain, _, _ = pipeline(tmp_path, [line("o", "2026-09-10")], [refund("o")], product_ids=["A"])
    assert len(grain.refund_events) == 1
    assert value(out, "gsv_amount") is None
    assert out["facts"]["gsv_amount"]["empty_reason"] == "PRODUCT_NET_UNAVAILABLE"


def test_r04_net_source_cannot_be_refunded_twice(tmp_path):
    out, _, _, _ = pipeline(tmp_path, [line("o", "2026-09-10", amount=7000)], [refund("o")], meta=dict(amount_already_net=True))
    assert out["status"] == "UNAVAILABLE"
    assert out["facts"] == {}
    assert "AMOUNT_ALREADY_NET_CONFLICT" in {x["code"] for x in out["limitations"]}


def test_r05_incomplete_history_unknown_and_repurchase_unavailable(tmp_path):
    out, _, adapter, req = pipeline(tmp_path, [line("o", "2026-09-10")], meta=dict(history_complete=False))
    assert value(out, "new_buyer_count") == 0
    assert value(out, "unknown_history_buyer_count") == 1
    assert "INSUFFICIENT_HISTORY" in {x["code"] for x in out["limitations"]}
    req["query_id"] = "existing_customer_repurchase"
    result = run_composed_query(req, adapter.materialize(GrainRequest(**req)))
    assert value(result, "repurchase_rate") is None
    assert result["facts"]["repurchase_rate"]["empty_reason"] == "INSUFFICIENT_HISTORY"


def test_r06_source_watermark_controls_maturity(tmp_path):
    out, _, _, _ = pipeline(tmp_path, [line("s", "2026-09-15", sample=True)], meta=dict(data_through="2026-09-20"), query_id="sample_followup", observation_days=14)
    assert value(out, "mature_cohort_count") == 0
    assert value(out, "immature_count") == 1
    assert out["data_through"].startswith("2026-09-20")
    assert out["resolved_filters"]["refund_as_of"].startswith("2026-09-20")


def test_r07_followup_crosses_cohort_end(tmp_path):
    out, _, _, _ = pipeline(tmp_path, [line("s", "2026-09-25", sample=True), line("repeat", "2026-10-02", amount=20000)], query_id="sample_followup", observation_days=14)
    assert value(out, "repeat_buyers") == 1
    assert value(out, "repeat_revenue") == 20000


def test_r08_product_repurchase_money_matches_historical_cohort(tmp_path):
    lines = [line("u1b", "2026-08-01", user="U1", product="B"), line("u1a", "2026-09-05", user="U1"), line("u2a", "2026-08-02", user="U2"), line("u2r", "2026-09-06", user="U2", amount=20000)]
    out, _, _, req = pipeline(tmp_path, lines, query_id="existing_customer_repurchase", product_ids=["A"])
    direct = run_query(req, basket_from_dict(dict(lines=lines, refunds=[])))
    for result in (out, direct):
        assert value(result, "repurchase_buyers") == 1
        assert value(result, "repurchase_gsv") == 20000
        assert value(result, "repurchase_aus") == 20000


def test_global_first_sample_before_channel_filter(tmp_path):
    out, _, _, _ = pipeline(tmp_path, [line("s1", "2026-09-02", sample=True, channel="A"), line("s2", "2026-09-03", sample=True, channel="B"), line("r", "2026-09-04")], query_id="sample_followup", observation_days=14, channel_ids=["B"])
    assert value(out, "sample_cohort_count") == 0


def test_yoy_reads_prior_year_and_refund_exact_cutoff(tmp_path):
    r = refund("new")
    r["refunded_at"] = "2026-09-15T12:00:00"
    out, grain, _, _ = pipeline(tmp_path, [line("old", "2025-09-10", amount=5000), line("new", "2026-09-10")], [r], refund_as_of="2026-09-15T11:00:00+08:00")
    assert grain.refund_events == []
    assert value(out, "gsv_yoy") == 1
    assert value(out, "gsv_amount") == 10000


def test_refund_flow_channel_filter(tmp_path):
    out, _, _, _ = pipeline(tmp_path, [line("a", "2026-08-01", channel="A"), line("b", "2026-08-02", channel="B")], [refund("a"), refund("b", 2000)], channel_ids=["A"], refund_view="REFUND_FLOW")
    assert value(out, "refund_flow_amount") == 3000


def test_cache_query_kind_and_permission_are_bound(tmp_path):
    _, grain, adapter, req = pipeline(tmp_path, [line("o", "2026-09-10")])
    other = {**req, "query_id": "sample_followup"}
    with pytest.raises(MetricContractError, match="query_id"):
        run_composed_query(other, grain)
    different = adapter.materialize(GrainRequest(**other))
    assert different.cache_hit is False
    assert different.query_ref != grain.query_ref
    with pytest.raises(MetricContractError, match="permission"):
        run_composed_query({**req, "actor_scope": "someone-else"}, grain)


def test_unavailable_grain_never_returns_zero_facts(tmp_path):
    _, grain, _, req = pipeline(tmp_path, [line("o", "2026-09-10")])
    broken = replace(grain, status="UNAVAILABLE", order_lines=[{**grain.order_lines[0], "gross_paid_minor": None}])
    out = run_composed_query(req, broken)
    assert out["status"] == "UNAVAILABLE" and out["facts"] == {}


@pytest.mark.parametrize("query", ["sales_window_summary", "existing_customer_repurchase", "sample_followup"])
def test_http_uses_the_composed_source(query):
    from fastapi.testclient import TestClient
    from backend.crm_metrics_app import create_crm_metrics_app
    client = TestClient(create_crm_metrics_app())
    reply = client.post("/api/v1/crm-metrics/query", json=request(source_id="synthetic-crm-metrics", query_id=query))
    assert reply.status_code == 200, reply.text
    result = reply.json()
    assert result["adapter_query_ref"].startswith("crmq_")
    assert result["permission_version"] == "crm-permission/v1"
    assert result["data_through"].startswith("2026-09-21")
    assert result["real_business_acceptance"] is False


def test_net_flag_cannot_hide_refunds_and_data_watermarks_change_cache(tmp_path):
    out, grain, adapter, req = pipeline(tmp_path, [line("o", "2026-09-10")], [refund("o")])
    assert value(out, "gsv_amount") == 7000
    override = {**req, "amount_already_net": True}
    result = run_composed_query(override, adapter.materialize(GrainRequest(**override)))
    assert result["status"] == "UNAVAILABLE"
    early = {**req, "data_through": "2026-09-12T00:00:00+08:00"}
    earlier_grain = adapter.materialize(GrainRequest(**early))
    assert earlier_grain.query_ref != grain.query_ref
    assert value(run_composed_query(early, earlier_grain), "gsv_amount") == 10000
