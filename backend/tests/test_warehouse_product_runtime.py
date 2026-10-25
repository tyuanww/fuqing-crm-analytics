import asyncio
from dataclasses import replace
import sqlite3

import duckdb
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.db.connection import get_connection
from backend.middleware.query_router import QueryRouterMiddleware
from backend.routers.category import router as category_router
from backend.services.category_service import product_customer
from backend.services.category_service.data_version import orders_data_version
from backend.services.warehouse_cache import AggregateCache, AggregateCacheMissError
from backend.services.warehouse_runtime import WarehouseRuntime, current_warehouse_read, product_semantic_revision
from backend.services.warehouse_source import (
    SourceState, VerifiedWarehouseSource, WarehouseSourceSpec, WarehouseSourceUnavailableError,
)


@pytest.fixture
def runtime_case(tmp_path):
    path = tmp_path / "business.duckdb"
    with duckdb.connect(str(path)) as conn:
        conn.execute(
            "CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, pay_time TIMESTAMP, "
            "actual_amount DECIMAL(18,2), channel VARCHAR, is_member BOOLEAN, is_goujinjin BOOLEAN, "
            "is_refund BOOLEAN, order_status VARCHAR, spu_product_class VARCHAR)"
        )
        conn.execute(
            "INSERT INTO orders VALUES "
            "('s1','old','2020-01-01',10,'货架',false,false,false,'已付款','白膜'),"
            "('s2','old','2025-07-02',80,'货架',false,false,false,'已付款','白膜'),"
            "('s3','old','2026-07-02',100,'货架',true,false,false,'已付款','白膜'),"
            "('s4','new','2026-07-04',20,'货架',false,false,false,'已付款','白膜'),"
            "('s5','other','2026-07-05',50,'直播',false,false,false,'已付款','黑膜')"
        )
        conn.execute("CREATE TABLE user_first_purchase AS SELECT user_id, MIN(pay_time)::DATE AS first_pay_date FROM orders GROUP BY user_id")
    source_dir = tmp_path / "source"
    cache_dir = tmp_path / "cache"
    source_dir.mkdir(mode=0o700)
    cache_dir.mkdir(mode=0o700)
    spec = WarehouseSourceSpec(path, "synthetic-products", "synthetic")
    source = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(path), read_only=True))
    runtime = WarehouseRuntime(source, AggregateCache(cache_dir / "aggregates.sqlite"), {
        "product-customer/v3": product_semantic_revision(),
    })
    try:
        yield runtime, spec, source_dir
    finally:
        source.close()


def query(products=None, **kwargs):
    return product_customer.get_product_customer_overview(
        "2026-07-01", "2026-07-05", products=products, **kwargs,
    )


def test_compute_once_persists_all_products_and_serves_any_subset_without_live_sql(runtime_case, monkeypatch):
    runtime, _, _ = runtime_case
    with runtime.read(mode="compute"):
        white = query(["爆款面膜F"])
        identity = orders_data_version(get_connection())
        assert white["products"][0]["current"]["gsv"] == 120
        assert white["products"][0]["current"]["old_users"] == 1
        assert white["products"][0]["current"]["new_users"] == 1
        assert white["data_version"] == identity["data_version"]
        assert identity["data_kind"] == "synthetic"

    def no_live(*args, **kwargs):
        raise AssertionError("cache read attempted live SQL")

    monkeypatch.setattr(product_customer, "_period_metrics", no_live)
    monkeypatch.setattr(product_customer, "_assert_first_purchase_complete", no_live)
    with runtime.read():
        subset = query(["爆款面膜G", "爆款面膜F"])
        assert [row["display_name"] for row in subset["products"]] == ["爆款面膜G", "爆款面膜F"]
        assert subset["products"][0]["current"]["gsv"] == 50
        assert subset["products"][1] == white["products"][0]
        assert len(query()["products"]) == len(product_customer.PRODUCT_GROUPS)
        get_connection().close()
        assert get_connection().execute("SELECT COUNT(*) FROM orders").fetchone() == (5,)
    assert current_warehouse_read() is None


def test_reopened_source_reuses_cache_but_same_total_reclassification_does_not(runtime_case):
    runtime, spec, source_dir = runtime_case
    with runtime.read(mode="compute"):
        before = query()
    runtime.source.close()
    reopened = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    try:
        second = replace(runtime, source=reopened)
        with second.read():
            assert query() == before
    finally:
        reopened.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute("UPDATE orders SET spu_product_class='黑膜' WHERE order_id='s3'")
    changed = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    try:
        third = replace(runtime, source=changed)
        with third.read():
            with pytest.raises(AggregateCacheMissError):
                query()
        with third.read(mode="compute"):
            after = query(["爆款面膜F"])
        assert after["data_version"] != before["data_version"]
        assert after["products"][0]["current"]["gsv"] == 20
    finally:
        changed.close()


def test_semantic_change_does_not_reuse_previous_results(runtime_case):
    runtime, _, _ = runtime_case
    with runtime.read(mode="compute"):
        query()
    changed = replace(runtime, semantic_revisions={"product-customer/v3": "0" * 64})
    with changed.read():
        with pytest.raises(AggregateCacheMissError):
            query()


def test_coverage_failure_does_not_materialize_zero_results(runtime_case):
    runtime, _, _ = runtime_case
    with runtime.read():
        result = product_customer.get_product_customer_overview("2026-07-06", "2026-07-07")
    assert result["status"] == "INSUFFICIENT_COVERAGE"
    assert result["products"] == []
    with sqlite3.connect(runtime.cache.path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM aggregate_results").fetchone() == (0,)


def test_cached_products_do_not_bypass_selection_validation(runtime_case):
    runtime, _, _ = runtime_case
    with runtime.read(mode="compute"):
        query()
    with runtime.read():
        for products in (["不存在的商品"], ["白膜", "爆款面膜F"], []):
            with pytest.raises(ValueError):
                query(products)


def test_verified_identity_cannot_be_attached_to_another_cursor(runtime_case):
    runtime, spec, _ = runtime_case
    other = duckdb.connect(str(spec.database_path), read_only=True)
    try:
        with runtime.read():
            with pytest.raises(WarehouseSourceUnavailableError, match="does not match"):
                orders_data_version(other)
            with pytest.raises(WarehouseSourceUnavailableError, match="replace"):
                with runtime.read():
                    raise AssertionError("nested runtime replaced the current connection")
    finally:
        other.close()


def test_http_product_and_batch_use_cache_only_without_old_read_pool(runtime_case, monkeypatch):
    from backend.services import dual_conn

    runtime, _, _ = runtime_case
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.include_router(category_router)
    app.add_middleware(QueryRouterMiddleware)

    def no_pool():
        raise AssertionError("verified request opened a legacy pool connection")

    monkeypatch.setattr(dual_conn, "get_read_connection", no_pool)
    body = {"start_date": "2026-07-01", "end_date": "2026-07-05", "products": ["爆款面膜F"]}
    headers = {"X-ShineMage-Product-Customer-Version": "product-customer/v3"}
    with TestClient(app) as client:
        miss = client.post("/api/v1/category/product-customer", json=body, headers=headers)
        assert miss.status_code == 503
        assert miss.headers["X-Aggregate-Cache-Status"] == "miss"
        with runtime.read(mode="compute"):
            expected = query(["爆款面膜F"])
        response = client.post("/api/v1/category/product-customer", json=body, headers=headers)
        assert response.status_code == 200
        assert response.json() == expected
        batch = client.post("/api/v1/category/product-customer/batch", json={"ranges": [body]}, headers=headers)
        assert batch.status_code == 200
        assert batch.json()["results"] == [expected]
    runtime.source.close()
    assert runtime.source.state == SourceState.CLOSED


def test_cancelled_saturated_waiter_releases_its_slot_and_keeps_loop_responsive(runtime_case):
    runtime, _, _ = runtime_case
    runtime = replace(runtime, read_limit=1, acquire_timeout=1)

    async def scenario():
        acquired = asyncio.Event()
        release = asyncio.Event()

        async def holder():
            async with runtime.async_read():
                acquired.set()
                await release.wait()

        async def waiter():
            async with runtime.async_read():
                raise AssertionError("cancelled waiter entered the source")

        owner = asyncio.create_task(holder())
        await acquired.wait()
        pending = asyncio.create_task(waiter())
        await asyncio.sleep(0.01)
        pending.cancel()
        await asyncio.sleep(0.01)
        pending.cancel()
        await asyncio.wait_for(asyncio.sleep(0.01), 0.2)
        assert not pending.done()
        release.set()
        await owner
        with pytest.raises(asyncio.CancelledError):
            await pending
        async with runtime.async_read() as frame:
            assert frame.pin.connection.execute("SELECT COUNT(*) FROM orders").fetchone() == (5,)
        assert current_warehouse_read() is None

    asyncio.run(scenario())
