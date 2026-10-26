from contextlib import contextmanager

import duckdb
import pytest

from backend.db.connection import get_connection
from backend.services.category_service import overview
from backend.services.category_service.data_version import orders_data_version
from backend.services.warehouse_cache import AggregateCache
from backend.services.warehouse_runtime import WarehouseRuntime
from backend.services.warehouse_source import (
    VerifiedWarehouseSource,
    WarehouseSourceSpec,
    WarehouseSourceUnavailableError,
)


@pytest.fixture
def category_source(tmp_path, monkeypatch):
    path = tmp_path / "category.duckdb"
    with duckdb.connect(str(path)) as conn:
        conn.execute(
            "CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, pay_time TIMESTAMP, "
            "actual_amount DECIMAL(18,2), channel VARCHAR, is_member BOOLEAN, "
            "is_goujinjin BOOLEAN, is_refund BOOLEAN, order_status VARCHAR, spu_product_class VARCHAR)"
        )
        conn.execute(
            "INSERT INTO orders VALUES "
            "('old', 'u', '2025-07-02', 80, '货架', false, false, false, '已付款', '白膜'), "
            "('current', 'u', '2026-07-02', 100, '货架', false, false, false, '已付款', '白膜')"
        )
        conn.execute("CREATE TABLE user_first_purchase (user_id VARCHAR, first_pay_date DATE)")
        conn.execute("INSERT INTO user_first_purchase VALUES ('u', '2025-07-02')")
    monkeypatch.setattr(overview, "_overview_cache", {})
    return path


def category_query():
    return overview.get_category_overview_cached("2026-07-01", "2026-07-02", channel="货架")


@pytest.mark.parametrize("populated", [False, True])
def test_unverified_orders_report_coverage_without_claiming_snapshot_identity(tmp_path, populated):
    with duckdb.connect(str(tmp_path / "legacy.duckdb")) as conn:
        conn.execute("CREATE TABLE orders (pay_time TIMESTAMP, actual_amount DECIMAL(18,2))")
        if populated:
            conn.execute("INSERT INTO orders VALUES ('2026-07-01', 10), ('2026-07-02', 20)")
        assert orders_data_version(conn) == {
            "data_start": "2026-07-01" if populated else None,
            "data_cutoff": "2026-07-02" if populated else None,
            "data_version": "unknown",
        }


@pytest.mark.parametrize(("sql", "field", "before_value", "after_value"), [
    ("UPDATE user_first_purchase SET first_pay_date='2026-07-01'", "old_gsv", 100, 0),
    ("UPDATE orders SET channel='直播' WHERE order_id='current'", "gsv", 100, 0),
    ("UPDATE orders SET is_member=true WHERE order_id='current'", "member_gsv", 0, 100),
    ("UPDATE orders SET spu_product_class='黑膜' WHERE order_id='current'", "category_gsv", 100, 0),
])
def test_unverified_overview_recomputes_after_same_total_business_corrections(
    category_source, monkeypatch, sql, field, before_value, after_value,
):
    def metric(result):
        if field == "category_gsv":
            return next(row["gsv"] for row in result["all_rows"] if row["name"] == "白膜")
        return result["all_ttl"][field]

    with duckdb.connect(str(category_source)) as conn:
        monkeypatch.setattr(overview, "get_connection", lambda: conn)
        before = category_query()
        totals = conn.execute("SELECT COUNT(*), SUM(actual_amount) FROM orders").fetchone()
        conn.execute(sql)
        after = category_query()
        assert conn.execute("SELECT COUNT(*), SUM(actual_amount) FROM orders").fetchone() == totals
        assert metric(before) == before_value
        assert metric(after) == after_value
        assert before["data_version"] == after["data_version"] == "unknown"
        assert overview._overview_cache == {}


def test_unverified_overview_ignores_existing_unknown_cache(category_source, monkeypatch):
    key = overview._overview_cache_key(
        "2026-07-01", "2026-07-02", "class", "GSV", "货架", None, None, None, "unknown",
    )
    stale = {"data_version": "unknown", "all_ttl": {"gsv": -100}}
    monkeypatch.setattr(overview, "_overview_cache", {key: (float("inf"), stale)})
    with duckdb.connect(str(category_source)) as conn:
        monkeypatch.setattr(overview, "get_connection", lambda: conn)
        assert category_query()["all_ttl"]["gsv"] == 100
    assert overview._overview_cache == {key: (float("inf"), stale)}


def test_verified_overview_reuses_same_source_and_recomputes_resealed_corrections(category_source, tmp_path, monkeypatch):
    source_dir = tmp_path / "source"
    cache_dir = tmp_path / "cache"
    source_dir.mkdir(mode=0o700)
    cache_dir.mkdir(mode=0o700)
    spec = WarehouseSourceSpec(category_source, "synthetic-category", "synthetic")

    @contextmanager
    def source_read():
        source = VerifiedWarehouseSource.seal(
            spec, source_dir, connect=lambda: duckdb.connect(str(category_source), read_only=True),
        )
        try:
            runtime = WarehouseRuntime(source, AggregateCache(cache_dir / "aggregates.sqlite"), {})
            with runtime.read():
                yield
        finally:
            source.close()

    with source_read():
        before = category_query()
        assert before["data_version"] == orders_data_version(get_connection())["data_version"]
        assert before["data_version"].startswith("warehouse-v1:")

    def no_compute(*args, **kwargs):
        raise AssertionError("unchanged verified source recomputed a cached overview")

    with source_read(), monkeypatch.context() as patch:
        patch.setattr(overview, "get_category_overview", no_compute)
        assert category_query() == before

    with duckdb.connect(str(category_source)) as conn:
        conn.execute("UPDATE user_first_purchase SET first_pay_date='2026-07-01'")
    with source_read():
        after = category_query()
        assert after["data_version"] != before["data_version"]
        assert before["all_ttl"]["gsv"] == after["all_ttl"]["gsv"] == 100
        assert before["all_ttl"]["old_gsv"] == 100
        assert after["all_ttl"]["old_gsv"] == 0


def test_requested_warehouse_without_bound_identity_never_falls_back(category_source, monkeypatch):
    monkeypatch.setenv("FQ_WAREHOUSE_SOURCE_ID", "synthetic-category")
    with duckdb.connect(str(category_source)) as conn:
        with pytest.raises(WarehouseSourceUnavailableError, match="not bound"):
            orders_data_version(conn)
