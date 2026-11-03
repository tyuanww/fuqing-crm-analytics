from dataclasses import replace
from datetime import date
import sqlite3

import duckdb
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.contracts.rfm import RFMRFlowResponse, RFMFRFlowResponse, RFMMFlowResponse, RFMAnalysisResponse
from backend.middleware.query_router import QueryRouterMiddleware
from backend.routers import rfm as rfm_router
from backend.routers.health import router as health_router
from backend.services.health.rfm_analysis import analysis, period
from backend.services.rfm import _flow_engine, _shared, get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow
from backend.services.rfm.f_flow import _F_SEGMENTATION_CTE
from backend.semantic.segments import F_SEGMENT_ORDER
from backend.services.warehouse_cache import AggregateCacheMissError
from backend.services.warehouse_rfm import WarehouseQueryError, resolve_verified_ranges
from backend.services.warehouse_runtime import rfm_semantic_revision
from backend.services.warehouse_source import VerifiedWarehouseSource
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


SERVICES = [
    (analysis.get_rfm_analysis, RFMAnalysisResponse),
    (get_rfm_r_flow, RFMRFlowResponse),
    (get_rfm_f_flow, RFMFRFlowResponse),
    (get_rfm_m_flow, RFMMFlowResponse),
]
PARAMS = {"start_date": "2026-07-01", "end_date": "2026-07-05"}


def rfm_runtime(case):
    runtime, _, _ = case
    return replace(runtime, semantic_revisions={**runtime.semantic_revisions, "rfm": rfm_semantic_revision()})


@pytest.mark.parametrize("service,contract", SERVICES)
def test_real_sql_persists_rfm_and_hot_reads_skip_all_legacy_caches(runtime_case, monkeypatch, service, contract):
    runtime = rfm_runtime(runtime_case)

    def forbidden(*args, **kwargs):
        raise AssertionError("verified RFM entered an unverified cache or derived table")

    for module, name in (
        (analysis, "_fetch_max_pay_time"), (analysis, "_read_db_cache"), (analysis, "_write_db_cache"),
        (analysis, "_new_duckdb_conn"), (_flow_engine, "_fetch_data_version"),
        (_flow_engine, "_get_cached_flow"), (_flow_engine, "_set_cached_flow"),
        (period, "_run_rfm_period_dashboard_full"), (period, "_run_rfm_period_precomputed"),
    ):
        monkeypatch.setattr(module, name, forbidden)
    with runtime.read(mode="compute"):
        result = service(**PARAMS)
    parsed = contract.model_validate(result)
    assert parsed.year_label == "2026" and parsed.comp_year_label == "2025"
    ttl = result["rows"][-1]
    assert ttl["hist_users_current"] == (1 if service is analysis.get_rfm_analysis else 3)
    assert ttl["repurchase_gsv_current"] == (100 if service is analysis.get_rfm_analysis else 170)
    assert ttl["repurchase_gsv_comp"] == 80
    assert result["member_same_channel_rows"]
    monkeypatch.setattr(period, "_run_rfm_period_live", forbidden)
    monkeypatch.setattr(_flow_engine, "run_flow_period", forbidden)
    with runtime.read():
        assert service(**PARAMS) == result


@pytest.mark.parametrize("service,_contract", SERVICES)
def test_complete_rfm_miss_does_not_compute_in_read_mode(runtime_case, monkeypatch, service, _contract):
    runtime = rfm_runtime(runtime_case)

    def forbidden(*args, **kwargs):
        raise AssertionError("HTTP cache miss executed RFM SQL")

    monkeypatch.setattr(period, "_run_rfm_period_live", forbidden)
    monkeypatch.setattr(_flow_engine, "run_flow_period", forbidden)
    with runtime.read():
        with pytest.raises(AggregateCacheMissError):
            service(**PARAMS)


@pytest.mark.parametrize("params", [
    {"start_date": "2026-07-06", "end_date": "2026-07-07"},
    {**PARAMS, "compare_start_date": "2027-07-01", "compare_end_date": "2027-07-05"},
    {"start_date": "2020-07-01", "end_date": "2020-07-05"},
])
def test_any_uncovered_period_is_explicit_and_not_a_zero_result(runtime_case, params):
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        for service, _ in SERVICES:
            with pytest.raises(WarehouseQueryError) as error:
                service(**params)
            assert error.value.code == "INSUFFICIENT_COVERAGE"
    with sqlite3.connect(runtime.cache.path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM aggregate_results").fetchone() == (0,)


def test_yoy_and_mom_are_distinct_persisted_queries(runtime_case):
    runtime = rfm_runtime(runtime_case)
    mom_params = {**PARAMS, "compare_start_date": "2026-06-26", "compare_end_date": "2026-06-30"}
    with runtime.read(mode="compute"):
        yoy = analysis.get_rfm_analysis(**PARAMS)
        mom = analysis.get_rfm_analysis(**mom_params)
    assert yoy["rows"][-1]["repurchase_gsv_comp"] == 80
    assert mom["rows"][-1]["repurchase_gsv_comp"] == 0
    assert mom["comp_year_label"] == "2026"
    with runtime.read():
        assert analysis.get_rfm_analysis(**PARAMS) == yoy
        assert analysis.get_rfm_analysis(**mom_params) == mom


def test_same_total_channel_correction_invalidates_rfm_cache(runtime_case):
    runtime = rfm_runtime(runtime_case)
    _, spec, directory = runtime_case
    params = {**PARAMS, "channel": "货架"}
    with runtime.read(mode="compute"):
        before = analysis.get_rfm_analysis(**params)
    runtime.source.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET channel='直播' WHERE order_id='s3'")
    source = VerifiedWarehouseSource.seal(spec, directory, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    try:
        changed = replace(runtime, source=source)
        with changed.read():
            with pytest.raises(AggregateCacheMissError):
                analysis.get_rfm_analysis(**params)
        with changed.read(mode="compute"):
            after = analysis.get_rfm_analysis(**params)
        assert before["rows"][-1]["repurchase_gsv_current"] == 100
        assert after["rows"][-1]["repurchase_gsv_current"] == 0
    finally:
        source.close()


def test_period_alias_uses_actual_dates_and_custom_comparison(runtime_case, monkeypatch):
    class CutoffDay(date):
        @classmethod
        def today(cls):
            return cls(2026, 7, 6)

    monkeypatch.setattr(_shared, "date", CutoffDay)
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        explicit = analysis.get_rfm_analysis(**PARAMS)
    with runtime.read():
        assert analysis.get_rfm_analysis(period="MTD") == explicit
    ranges = resolve_verified_ranges("MTD", None, None, "2026-06-26", "2026-06-30")
    assert ranges["current"][0] == "2026-07-01 00:00:00"
    assert ranges["comp"][0] == "2026-06-26 00:00:00"
    assert ranges["prev2"][0] == "2024-07-01 00:00:00"


@pytest.mark.parametrize("service,_contract", SERVICES)
def test_cross_year_period_labels_match_resolved_dates(runtime_case, monkeypatch, service, _contract):
    class NewYear(date):
        @classmethod
        def today(cls):
            return cls(2026, 1, 1)

    monkeypatch.setattr(_shared, "date", NewYear)
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        result = service(period="WTD")
    assert result["year_label"] == "2025"
    assert result["comp_year_label"] == "2025"
    assert result["prev2_year_label"] == "2024"


@pytest.mark.parametrize("service,_contract", SERVICES)
def test_month_start_empty_period_does_not_become_a_real_day(runtime_case, monkeypatch, service, _contract):
    class NewYear(date):
        @classmethod
        def today(cls):
            return cls(2026, 1, 1)

    monkeypatch.setattr(_shared, "date", NewYear)
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        with pytest.raises(WarehouseQueryError) as error:
            service(period="MTD")
    assert error.value.code == "INSUFFICIENT_COVERAGE"


@pytest.mark.parametrize("service,_contract", SERVICES)
def test_member_ttl_numerator_uses_its_own_population(runtime_case, service, _contract):
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        result = service(**PARAMS)
    for rows in (result["member_rows"], result["member_same_channel_rows"]):
        ttl = rows[-1]
        if service is analysis.get_rfm_analysis:
            assert ttl["hist_users_current"] == sum(row["hist_users_current"] for row in rows[:-1]) == 0
            assert ttl["repurchase_users_current"] == 0
            assert ttl["repurchase_gsv_current"] == 0
        else:
            assert ttl["hist_users_current"] == ttl["repurchase_users_current"] == 1
            assert ttl["repurchase_gsv_current"] == 100
        assert 0 <= ttl["repurchase_rate_current"] <= 1


def test_history_filter_ttl_counts_only_buyers_in_that_population(runtime_case):
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        result = _flow_engine.get_rfm_flow(
            dimension="f", segment_order=F_SEGMENT_ORDER,
            hist_extra_cols="COUNT(DISTINCT order_id) AS frequency", segmentation_cte=_F_SEGMENTATION_CTE,
            history_channels=["直播"], **PARAMS,
        )
    ttl = result["rows"][-1]
    assert ttl["hist_users_current"] == ttl["repurchase_users_current"] == 1
    assert ttl["repurchase_gsv_current"] == 50
    assert ttl["repurchase_rate_current"] == 1


@pytest.mark.parametrize("service,contract", SERVICES)
def test_both_metrics_and_grouped_channels_keep_valid_member_contracts(runtime_case, service, contract):
    runtime = rfm_runtime(runtime_case)
    with runtime.read(mode="compute"):
        for metric in ("GSV", "GMV"):
            for channel in (None, "货架", "纯派样"):
                for excluded in ([], ["直播"]):
                    result = service(**PARAMS, metric_type=metric, channel=channel, exclude_channels=excluded)
                    contract.model_validate(result)
                    for rows in (result["rows"], result["same_channel_rows"], result["member_rows"], result["member_same_channel_rows"]):
                        assert all(row["repurchase_users_current"] <= row["hist_users_current"] for row in rows)


def test_existing_member_cohort_matches_eight_quadrant_member_total(runtime_case):
    runtime = rfm_runtime(runtime_case)
    _, spec, directory = runtime_case
    runtime.source.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET is_member=true WHERE order_id='s1'")
    source = VerifiedWarehouseSource.seal(spec, directory, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    try:
        changed = replace(runtime, source=source)
        with changed.read(mode="compute"):
            result = analysis.get_rfm_analysis(**PARAMS)
        for rows in (result["member_rows"], result["member_same_channel_rows"]):
            assert rows[-1]["hist_users_current"] == sum(row["hist_users_current"] for row in rows[:-1]) == 1
            assert rows[-1]["repurchase_users_current"] == 1
            assert rows[-1]["repurchase_gsv_current"] == 100
    finally:
        source.close()


@pytest.mark.parametrize("params", [
    {**PARAMS, "metric_type": "not-a-metric"},
    {"start_date": "2026-07-01"},
    {**PARAMS, "compare_start_date": "2025-07-01"},
    {**PARAMS, "start_date": "2026-07-99"},
    {**PARAMS, "period": "MTD"}, {"period": "unknown-period"},
])
def test_strict_rfm_rejects_ambiguous_or_invalid_queries(runtime_case, params):
    runtime = rfm_runtime(runtime_case)
    with runtime.read():
        with pytest.raises(WarehouseQueryError) as error:
            analysis.get_rfm_analysis(**params)
    assert error.value.code == "INVALID_REQUEST"


def test_http_rfm_uses_unified_cache_and_preserves_reason_headers(runtime_case, monkeypatch):
    runtime = rfm_runtime(runtime_case)
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.include_router(rfm_router.router)
    app.include_router(health_router)
    app.add_middleware(QueryRouterMiddleware)

    def forbidden(*args, **kwargs):
        raise AssertionError("strict route touched W5 cache")

    monkeypatch.setattr(rfm_router._rfm_cache, "get", forbidden)
    monkeypatch.setattr(rfm_router._rfm_cache, "set", forbidden)
    paths = ["/api/v1/customer-health/rfm-analysis", *(f"/api/v1/rfm/{dimension}-flow" for dimension in "rfm")]
    with TestClient(app) as client:
        for path in paths:
            miss = client.get(path, params=PARAMS)
            assert miss.status_code == 503 and miss.headers["X-RFM-Cache-Status"] == "miss"
            insufficient = client.get(path, params={"start_date": "2026-07-06", "end_date": "2026-07-07"})
            assert insufficient.status_code == 422
            assert insufficient.json()["error"]["code"] == "INSUFFICIENT_COVERAGE"
        with runtime.read(mode="compute"):
            expected = [service(**PARAMS) for service, _ in SERVICES]
        for path, result in zip(paths, expected, strict=True):
            hit = client.get(path, params=PARAMS)
            assert hit.status_code == 200 and hit.json() == result
        with sqlite3.connect(runtime.cache.path) as conn:
            conn.execute("UPDATE aggregate_results SET payload='corrupt'")
        unavailable = client.get(paths[0], params=PARAMS)
        assert unavailable.status_code == 503
        assert unavailable.headers["X-RFM-Cache-Status"] == "unavailable"
        runtime.source.close()
        closed = client.get(paths[0], params=PARAMS)
        assert closed.status_code == 503
        assert closed.headers["X-RFM-Cache-Status"] == "unavailable"
