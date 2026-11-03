from dataclasses import replace
from datetime import date
import json

import duckdb
import pytest

from backend.services import dual_conn
from backend.services.health.rfm_analysis import cache
from backend.services.health.rfm_analysis.precompute_plan import (
    RfmPrecomputePolicy, RfmPrecomputeQuery, build_precompute_plan,
)
from backend.services.rfm._shared import _resolve_date_ranges
from backend.contracts.rfm import RFMAnalysisResponse


POLICY = RfmPrecomputePolicy(
    channels=(None,), metric_types=("GSV",), exclude_sets=((),),
)
START = date(2020, 1, 1)
CUTOFF = date(2026, 7, 5)


def test_plan_resolves_distinct_years_and_calendar_windows_without_wall_clock():
    plan = build_precompute_plan(START, CUTOFF, policy=POLICY)
    windows = {(query.period, query.start, query.end) for query in plan.queries}
    assert ("MTD", "2026-07-01", "2026-07-05") in windows
    assert ("MTD", "2025-07-01", "2025-07-05") in windows
    assert ("MONTH_2025_12", "2025-12-01", "2025-12-31") in windows
    assert ("YEAR_2025", "2025-01-01", "2025-12-31") in windows
    future = [query for query in plan.queries if query.start == "2026-10-01"]
    assert future and all(not query.covered(START, CUTOFF) for query in future)
    assert all(query.end <= "2026-07-05" for query in plan.queries if query.covered(START, CUTOFF))
    assert plan.digest == build_precompute_plan(START, CUTOFF, policy=POLICY).digest


@pytest.mark.parametrize("cutoff", [date(2024, 2, 29), date(2026, 1, 1), date(2026, 4, 1)])
def test_boundary_windows_keep_http_comparison_and_empty_month_semantics(cutoff):
    plan = build_precompute_plan(START, cutoff, policy=POLICY)
    for query in plan.queries:
        assert query.ranges == _resolve_date_ranges(None, query.start, query.end, *query.comparison)
        if query.empty:
            assert not query.covered(START, cutoff)
    assert any(query.covered(START, cutoff) for query in plan.queries)


def test_third_period_coverage_is_required_and_mom_does_not_change_prev2():
    query = RfmPrecomputeQuery("custom", "2026-07-01", "2026-07-05", None, "GSV", (), "auto_mom")
    assert query.ranges["comp"][0][:10] == "2026-06-26"
    assert query.ranges["prev2"][0][:10] == "2024-07-01"
    assert not query.covered(date(2025, 1, 1), CUTOFF)
    assert query.covered(START, CUTOFF)


@pytest.mark.parametrize("changes", [
    {"lookback_months": 0}, {"lookback_months": 61}, {"channels": ()},
    {"channels": (None, None)}, {"channels": ("unknown",)},
    {"metric_types": ("unknown",)}, {"compare_modes": ("custom",)},
])
def test_invalid_policy_is_rejected(changes):
    with pytest.raises(ValueError):
        replace(POLICY, **changes)


@pytest.fixture
def stores(tmp_path, monkeypatch):
    source = tmp_path / "business.duckdb"
    with duckdb.connect(str(source)) as conn:
        conn.execute("CREATE TABLE orders (pay_time TIMESTAMP)")
        conn.execute("INSERT INTO orders VALUES ('2020-01-01'), ('2026-07-05 23:59:58')")
    business = duckdb.connect(str(source), read_only=True)
    output = duckdb.connect(str(tmp_path / "cache.duckdb"))
    cache._ensure_db_cache_table(output)
    monkeypatch.setattr(dual_conn, "open_matching_read_connection", lambda: business)
    monkeypatch.setattr(cache, "_get_cache_conn", lambda: output)
    monkeypatch.setattr(cache, "_run_rfm_period", lambda *_args: ({}, {}, {}, {}))
    monkeypatch.setattr(cache, "_build_rows", lambda *_args: [])
    yield output, tmp_path / "cache.duckdb", business
    output.close()
    business.close()


def test_precompute_verifies_rows_and_receipt_after_close_and_reopen(stores):
    output, path, business = stores
    report = cache.precompute_rfm_cache(policy=POLICY)
    assert report.complete and report.ready + report.insufficient == report.expected
    assert report.ready > report.materialized == report.verified > 0
    assert report.insufficient > 0
    assert output.execute("SELECT 1").fetchone() == (1,)
    with pytest.raises(duckdb.ConnectionException):
        business.execute("SELECT 1")
    output.close()
    with duckdb.connect(str(path)) as fresh:
        rows = fresh.execute(
            f"SELECT start_date, end_date FROM {cache.RFM_CACHE_GENERATION_ROWS_TABLE} WHERE generation_id=?",
            [report.generation_id],
        ).fetchall()
        assert all(end <= "2026-07-05" for _, end in rows)
        assert {"2025", "2026"} <= {start[:4] for start, _ in rows}
        receipt = json.loads(fresh.execute(
            "SELECT report_json FROM rfm_cache_precompute_reports WHERE generation_id=?",
            [report.generation_id],
        ).fetchone()[0])
        assert receipt["complete"] and receipt["plan_digest"] == report.plan_digest
        assert len(receipt["queries"]) == report.expected
        assert {item["status"] for item in receipt["queries"]} == {"READY", "INSUFFICIENT_COVERAGE"}
        assert cache._get_active_cache_generation(fresh)[0] == report.generation_id


@pytest.mark.parametrize("failure", ["compute", "corrupt", "activate", "prune"])
def test_partial_corrupt_or_failed_activation_keeps_previous_generation(stores, monkeypatch, failure):
    output, _, _ = stores
    cache._activate_cache_generation(output, "previous", "previous-source", 1)
    calls = 0
    original = cache._activate_cache_generation

    def run(*_args):
        nonlocal calls
        calls += 1
        if calls == 4 and failure == "compute":
            raise RuntimeError("synthetic computation failed")
        if calls == 4 and failure == "corrupt":
            output.execute(f"UPDATE {cache.RFM_CACHE_GENERATION_ROWS_TABLE} SET result_json='{{}}'")
        return {}, {}, {}, {}

    def activate(*args):
        original(*args)
        raise RuntimeError("synthetic activation failed")

    monkeypatch.setattr(cache, "_run_rfm_period", run)
    if failure == "activate":
        monkeypatch.setattr(cache, "_activate_cache_generation", activate)
    if failure == "prune":
        def fail_prune(_conn):
            raise RuntimeError("synthetic pruning failed")
        monkeypatch.setattr(cache, "_prune_rfm_cache_after_success", fail_prune)
    with pytest.raises(RuntimeError):
        cache.precompute_rfm_cache(policy=replace(POLICY, lookback_months=1))
    assert cache._get_active_cache_generation(output)[0] == "previous"
    tables = {row[0] for row in output.execute("SHOW TABLES").fetchall()}
    if "rfm_cache_precompute_reports" in tables:
        assert output.execute("SELECT COUNT(*) FROM rfm_cache_precompute_reports").fetchone()[0] == 0


def test_real_rfm_materialization_preserves_nonempty_member_same_channel_rows(monkeypatch):
    with duckdb.connect(":memory:") as source, duckdb.connect(":memory:") as output:
        source.execute(
            "CREATE TABLE orders (pay_time TIMESTAMP, user_id VARCHAR, order_id VARCHAR, "
            "actual_amount DOUBLE, is_goujinjin BOOLEAN, order_status VARCHAR, "
            "is_refund BOOLEAN, is_member BOOLEAN, channel VARCHAR)"
        )
        source.executemany(
            "INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(timestamp, "synthetic-user", f"synthetic-{index}", 100, False, "交易成功", False, True, "货架")
             for index, timestamp in enumerate(("2020-01-01", "2026-06-01", "2026-07-05 23:59:58"))],
        )
        monkeypatch.setattr(dual_conn, "open_matching_read_connection", source.cursor)
        monkeypatch.setattr(cache, "_get_cache_conn", lambda: output)
        policy = RfmPrecomputePolicy(
            lookback_months=1, channels=("货架",), metric_types=("GSV",),
            exclude_sets=((),), compare_modes=("default",),
        )
        report = cache.precompute_rfm_cache(policy=policy)
        payload = json.loads(output.execute(
            f"SELECT result_json FROM {cache.RFM_CACHE_GENERATION_ROWS_TABLE} "
            "WHERE generation_id=? AND period='MTD'", [report.generation_id],
        ).fetchone()[0])
        response = RFMAnalysisResponse.model_validate(payload)
        assert response.member_same_channel_rows
        assert any(row.hist_users_current > 0 for row in response.member_same_channel_rows)
        assert len(response.member_same_channel_rows) == len(response.member_rows) == len(response.rows)
        assert "member_same_rows" not in payload
