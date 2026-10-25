from dataclasses import replace
from datetime import date
import json
import os
from pathlib import Path
import subprocess
import sys

import duckdb
import pytest

from backend.services.health.rfm_analysis import period
from backend.services.health.rfm_analysis.precompute_plan import RfmPrecomputePolicy, RfmPrecomputeQuery
from backend.services.warehouse_boot import WarehouseRuntimeSettings, build_warehouse_runtime
from backend.services.warehouse_prewarm import WarmBudget, WarmRequest, build_warm_plan, run_warm_plan
from backend.services.warehouse_prewarm import FixedPeriodQuery
from backend.services.warehouse_runtime import rfm_semantic_revision
from backend.services.warehouse_source import WarehouseSourceUnavailableError
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


@pytest.fixture
def warm_case(runtime_case):
    runtime, spec, _ = runtime_case
    return replace(runtime, semantic_revisions={**runtime.semantic_revisions, "rfm": rfm_semantic_revision()}), spec


def query(start="2026-07-01", end="2026-07-05", mode="default"):
    return RfmPrecomputeQuery("selected", start, end, None, "GSV", (), mode)


def plan_for(runtime, requests):
    plan = build_warm_plan(runtime, policy=RfmPrecomputePolicy(lookback_months=1, channels=(None,),
                                                             metric_types=("GSV",), exclude_sets=((),), compare_modes=("default",)))
    return replace(plan, requests=tuple(requests))


def test_catalog_uses_real_two_year_windows_and_supported_product_limits(warm_case):
    runtime, _ = warm_case
    plan = build_warm_plan(runtime, policy=RfmPrecomputePolicy(channels=(None,), exclude_sets=((),)))
    assert {request.query.start[:4] for request in plan.requests} >= {"2024", "2025", "2026"}
    assert {request.family for request in plan.requests} == {"product", "analysis", "r", "f", "m"}
    assert {request.query.metric_type for request in plan.requests if request.family == "r"} == {"GSV", "GMV"}
    assert {request.query.compare_mode for request in plan.requests} == {"default", "auto_mom"}
    assert len({request.request_id for request in plan.requests}) == len(plan.requests)
    for request in plan.requests:
        if request.family == "product":
            assert request.query.metric_type == "GSV"
            for name in ("current", "comp"):
                start, end, _ = request.query.ranges[name]
                assert 0 <= (date.fromisoformat(end[:10]) - date.fromisoformat(start[:10])).days < 90


def test_zero_budget_only_reports_actual_hits_and_coverage(warm_case):
    runtime, _ = warm_case
    plan = plan_for(runtime, [WarmRequest("product", query()), WarmRequest("r", query()),
                              WarmRequest("analysis", query("2026-07-06", "2026-07-07"))])
    report = run_warm_plan(runtime, plan, WarmBudget(0, 10))
    assert [item.status for item in report.outcomes] == ["PENDING", "PENDING", "INSUFFICIENT_COVERAGE"]
    assert not report.complete and report.summary()["computed"] == 0


def test_budgeted_real_sql_resumes_and_proves_every_family_hot(warm_case, monkeypatch):
    from backend.services.rfm import _flow_engine
    from backend.services.category_service import product_customer

    runtime, _ = warm_case
    requests = [WarmRequest(family, query()) for family in ("product", "analysis", "r", "f", "m")]
    requests.append(WarmRequest("product", replace(query(), period="alias")))
    plan = plan_for(runtime, requests)
    first = run_warm_plan(runtime, plan, WarmBudget(2, 10))
    assert [item.status for item in first.outcomes] == ["READY", "READY", "PENDING", "PENDING", "PENDING", "READY"]
    assert first.summary()["computed"] == 2 and not first.complete
    second = run_warm_plan(runtime, plan, WarmBudget(3, 10))
    assert second.complete and second.summary()["computed"] == 3

    def forbidden(*args, **kwargs):
        raise AssertionError("hot resume recomputed SQL")

    monkeypatch.setattr(period, "_run_rfm_period_live", forbidden)
    monkeypatch.setattr(_flow_engine, "run_flow_period", forbidden)
    monkeypatch.setattr(product_customer, "_period_metrics", forbidden)
    hot = run_warm_plan(runtime, plan, WarmBudget(0, 10))
    assert hot.complete and hot.summary()["computed"] == 0


def test_elapsed_budget_stops_between_queries_and_retains_completed_results(warm_case):
    runtime, _ = warm_case
    plan = plan_for(runtime, [WarmRequest("product", query()), WarmRequest("analysis", query())])
    ticks = iter((0, 0, 11, 12))
    report = run_warm_plan(runtime, plan, WarmBudget(5, 10), clock=lambda: next(ticks))
    assert [item.status for item in report.outcomes] == ["READY", "PENDING"]
    assert report.elapsed_seconds == 12 and report.summary()["computed"] == 1


def test_failure_is_explicit_and_does_not_start_more_cold_computations(warm_case, monkeypatch):
    runtime, _ = warm_case
    plan = plan_for(runtime, [WarmRequest("analysis", query()), WarmRequest("product", query())])

    def fail(*args):
        raise RuntimeError("synthetic failure detail must not reach the report")

    monkeypatch.setattr(period, "_run_rfm_period_live", fail)
    report = run_warm_plan(runtime, plan, WarmBudget(10, 10))
    assert [item.status for item in report.outcomes] == ["FAILED", "PENDING"]
    assert report.outcomes[0].error_code == "RuntimeError"
    assert "synthetic failure detail" not in repr(report)
    assert not report.complete


def test_changed_semantics_refuse_an_old_plan_before_computing(warm_case):
    runtime, _ = warm_case
    plan = plan_for(runtime, [WarmRequest("r", query())])
    changed = replace(runtime, semantic_revisions={**runtime.semantic_revisions, "rfm": "changed"})
    with pytest.raises(ValueError, match="no longer matches"):
        run_warm_plan(changed, plan, WarmBudget(1, 10))


@pytest.mark.parametrize("family,path", [
    ("analysis", None), ("r", "/api/v1/rfm/r-flow"),
    ("f", "/api/v1/rfm/f-flow"), ("m", "/api/v1/rfm/m-flow"),
])
def test_prewarm_fixed_wtd_matches_native_three_period_key(warm_case, runtime_case, monkeypatch, family, path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.middleware.query_router import QueryRouterMiddleware
    from backend.routers.health import router as health_router
    from backend.routers.rfm import router as rfm_router
    from backend.services.rfm import _shared
    from backend.services.health.rfm_analysis.analysis import get_rfm_analysis
    from backend.services.rfm import get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow
    from backend.services.warehouse_cache import AggregateCacheMissError
    from backend.services.warehouse_rfm import resolve_verified_ranges
    from backend.services.warehouse_source import VerifiedWarehouseSource

    runtime, spec = warm_case
    runtime.source.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("INSERT INTO orders VALUES ('oct','old','2026-10-24',10,'货架',false,false,false,'已付款','白膜')")
    source = VerifiedWarehouseSource.seal(spec, runtime_case[2], connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    runtime = replace(runtime, source=source)

    class BusinessDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 25)

    monkeypatch.setattr(_shared, "date", BusinessDate)
    try:
        plan = build_warm_plan(runtime, policy=RfmPrecomputePolicy(lookback_months=1, channels=(None,),
                                                                  metric_types=("GSV",), exclude_sets=((),)))
        plan = replace(plan, requests=tuple(request for request in plan.requests if request.family == family
                                           and request.query.period.upper() == "WTD" and request.query.start.startswith("2026")))
        assert plan.requests
        free = replace(plan, requests=tuple(request for request in plan.requests if not isinstance(request.query, FixedPeriodQuery)))
        assert run_warm_plan(runtime, free, WarmBudget(20, 10)).complete
        service = {"analysis": get_rfm_analysis, "r": get_rfm_r_flow, "f": get_rfm_f_flow, "m": get_rfm_m_flow}[family]
        with runtime.read():
            with pytest.raises(AggregateCacheMissError):
                service(period="wtd", metric_type="GSV")
        assert run_warm_plan(runtime, plan, WarmBudget(20, 10)).complete
        with runtime.read() as frame:
            assert frame.period_today is None
            assert service(period="wtd", metric_type="GSV")["year_label"] == "2026"
            ranges = resolve_verified_ranges("wtd", None, None, None, None)
            assert tuple(value[:10] for value in ranges["comp"][:2]) == ("2026-10-12", "2026-10-17")
            assert tuple(value[:10] for value in ranges["prev2"][:2]) == ("2025-10-20", "2025-10-25")
        if path is None:
            return
        app = FastAPI()
        app.state.warehouse_runtime = runtime
        app.include_router(health_router)
        app.include_router(rfm_router)
        app.add_middleware(QueryRouterMiddleware)
        with TestClient(app) as client:
            response = client.get(path, params={"period": "wtd", "metric_type": "GSV"})
            assert response.status_code == 200, response.text
    finally:
        source.close()


def test_service_and_worker_have_independent_source_owners_and_shared_cache(warm_case, tmp_path):
    _, spec = warm_case
    state = tmp_path / "shared-runtime"
    state.mkdir(mode=0o700)
    settings = WarehouseRuntimeSettings(state, spec)
    def connect():
        return duckdb.connect(str(spec.database_path), read_only=True)
    service = build_warehouse_runtime(settings, connect=connect)
    try:
        worker = build_warehouse_runtime(settings, role="prewarm", connect=connect)
        try:
            with pytest.raises(WarehouseSourceUnavailableError, match="lock"):
                build_warehouse_runtime(settings, role="prewarm", connect=connect)
            plan = plan_for(worker, [WarmRequest("product", query())])
            assert run_warm_plan(worker, plan, WarmBudget(1, 10)).complete
        finally:
            worker.source.close()
        assert run_warm_plan(service, plan, WarmBudget(0, 10)).complete
        reopened = build_warehouse_runtime(settings, role="prewarm", connect=connect)
        try:
            assert run_warm_plan(reopened, plan, WarmBudget(0, 10)).complete
        finally:
            reopened.source.close()
    finally:
        service.source.close()


@pytest.mark.parametrize("single_day_source", [False, True])
def test_cli_reports_hot_resume_or_all_insufficient_in_a_fresh_process(warm_case, tmp_path, single_day_source):
    runtime, spec = warm_case
    if single_day_source:
        runtime.source.close()
        with duckdb.connect(str(spec.database_path)) as conn:
            conn.execute("DELETE FROM orders WHERE pay_time < '2026-07-05'")
    state = tmp_path / "cli-state"
    state.mkdir(mode=0o700)
    root = Path(__file__).resolve().parents[2]
    env = {"PATH": os.environ["PATH"], "PYTHONPATH": str(root), "PYTHON_DOTENV_DISABLED": "1",
           "DUCKDB_PATH": str(spec.database_path), "FQ_WAREHOUSE_STATE_DIR": str(state),
           "FQ_WAREHOUSE_SOURCE_ID": spec.source_id, "FQ_WAREHOUSE_DATA_KIND": "synthetic",
           "DUCKDB_MEMORY_LIMIT": "256MB", "DUCKDB_THREADS": "1"}
    args = [sys.executable, "-m", "scripts.etl.prewarm_verified_warehouse", "--execute", "--months", "1",
            "--families", "product", "--max-new-results", "1", "--max-seconds", "10"]
    first = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=30)
    assert first.returncode == 3, first.stderr
    assert json.loads(first.stdout)["computed"] == (0 if single_day_source else 1)
    args[-3] = "0"
    second = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=30)
    assert second.returncode == 3, second.stderr
    summary = json.loads(second.stdout)
    assert summary["computed"] == 0
    if single_day_source:
        assert summary["counts"]["INSUFFICIENT_COVERAGE"] == summary["expected"]
        assert summary["counts"]["PENDING"] == 0 and not summary["complete"]
    else:
        assert summary["counts"]["READY"] >= 1
    saved = json.loads((state / "prewarm-report.json").read_text())
    assert saved["summary"] == {key: value for key, value in summary.items() if key != "seal_seconds"}
    assert not (state / "prewarm-report.json").stat().st_mode & 0o077


@pytest.mark.parametrize("items,seconds", [(-1, 10), (1, 0), (1, float("inf")), (1, float("nan"))])
def test_invalid_budgets_are_rejected(items, seconds):
    with pytest.raises(ValueError):
        WarmBudget(items, seconds)
