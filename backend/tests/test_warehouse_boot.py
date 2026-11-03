import asyncio
import hashlib
import json
import sqlite3
import threading
from unittest.mock import Mock

import duckdb
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.db.connection import get_connection
from backend.middleware.query_router import QueryRouterMiddleware
from backend.services import warehouse_boot as boot
from backend.services.category_service.data_version import orders_data_version
from backend.services.warehouse_cache import AggregateCacheUnavailableError
from backend.services.warehouse_source import SourceState, WarehouseSourceUnavailableError
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


@pytest.fixture
def boot_case(runtime_case, tmp_path):
    _, spec, _ = runtime_case
    state = tmp_path / "boot"
    state.mkdir(mode=0o700)
    settings = boot.WarehouseRuntimeSettings(state, spec)
    return settings, lambda: duckdb.connect(str(spec.database_path), read_only=True)


def test_unconfigured_mode_does_not_require_or_build_a_source(boot_case):
    settings, _ = boot_case
    assert not boot.warehouse_runtime_requested({})
    assert boot.WarehouseRuntimeSettings.from_environment(settings.source.database_path, {}) is None


@pytest.mark.parametrize("values", [
    {"FQ_WAREHOUSE_STATE_DIR": ""}, {"FQ_WAREHOUSE_SOURCE_ID": "synthetic"},
    {"FQ_WAREHOUSE_STATE_DIR": "/tmp/synthetic", "FQ_WAREHOUSE_SOURCE_ID": "synthetic", "FQ_WAREHOUSE_DATA_KIND": "unknown"},
])
def test_partial_or_invalid_configuration_never_selects_legacy(boot_case, values):
    settings, _ = boot_case
    assert boot.warehouse_runtime_requested(values)
    with pytest.raises(ValueError, match="requires"):
        boot.WarehouseRuntimeSettings.from_environment(settings.source.database_path, values)


def test_factory_binds_real_native_source_and_reopens_after_owned_close(boot_case):
    settings, connect = boot_case
    runtime = boot.build_warehouse_runtime(settings, connect=connect)
    try:
        with runtime.read() as frame:
            identity, first_epoch = frame.pin.identity, frame.pin.source_epoch
            assert orders_data_version(get_connection())["data_version"] == identity.revision
            assert identity.data_cutoff == "2026-07-05"
        with pytest.raises(WarehouseSourceUnavailableError, match="directory lock"):
            boot.build_warehouse_runtime(settings, connect=connect)
        assert runtime.source.state == SourceState.READY
    finally:
        runtime.source.close()
    reopened = boot.build_warehouse_runtime(settings, connect=connect)
    try:
        with reopened.read() as frame:
            assert frame.pin.identity == identity
            assert frame.pin.source_epoch != first_epoch
    finally:
        reopened.source.close()


def test_public_state_and_foreign_cache_are_rejected_before_connect(boot_case):
    settings, _ = boot_case
    connect = Mock(side_effect=AssertionError("invalid state opened a source"))
    settings.state_dir.chmod(0o755)
    with pytest.raises(ValueError, match="private"):
        boot.build_warehouse_runtime(settings, connect=connect)
    settings.state_dir.chmod(0o700)
    cache_dir = settings.state_dir / "cache"
    cache_dir.mkdir(mode=0o700)
    path = cache_dir / "aggregates.sqlite"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE unrelated(value TEXT)")
    path.chmod(0o600)
    before = path.read_bytes()
    with pytest.raises(AggregateCacheUnavailableError):
        boot.build_warehouse_runtime(settings, connect=connect)
    assert path.read_bytes() == before
    connect.assert_not_called()


def test_failed_connection_releases_its_source_owner_lock(boot_case):
    settings, connect = boot_case
    fail = Mock(side_effect=RuntimeError("synthetic connect failed"))
    with pytest.raises(RuntimeError, match="synthetic connect failed"):
        boot.build_warehouse_runtime(settings, connect=fail)
    runtime = boot.build_warehouse_runtime(settings, connect=connect)
    runtime.source.close()


@pytest.mark.parametrize("worker_fails", [False, True])
def test_cancelled_cold_start_waits_for_own_worker_and_releases_source(boot_case, worker_fails):
    settings, connect = boot_case
    started = threading.Event()
    release = threading.Event()

    def delayed_connect():
        started.set()
        assert release.wait(5)
        if worker_fails:
            raise RuntimeError("synthetic failed after cancellation")
        return connect()

    def builder(config):
        return boot.build_warehouse_runtime(config, connect=delayed_connect)

    async def scenario():
        task = asyncio.create_task(boot.initialize_warehouse_runtime(settings, builder=builder))
        while not started.is_set():
            await asyncio.sleep(0.001)
        task.cancel()
        await asyncio.sleep(0.01)
        task.cancel()
        await asyncio.wait_for(asyncio.sleep(0.01), timeout=0.2)
        assert not task.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task

    try:
        asyncio.run(scenario())
    finally:
        release.set()
    runtime = boot.build_warehouse_runtime(settings, connect=connect)
    runtime.source.close()


def test_requested_mode_without_ready_lifespan_refuses_the_old_pool(monkeypatch):
    from backend.services import dual_conn

    for key in boot.SETTINGS_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("FQ_WAREHOUSE_STATE_DIR", "/synthetic-not-started")
    forbidden = Mock(side_effect=AssertionError("unready source fell back to the legacy pool"))
    monkeypatch.setattr(dual_conn, "get_read_connection", forbidden)
    app = FastAPI()
    app.add_middleware(QueryRouterMiddleware)

    @app.get("/api/v1/category/probe")
    def data():
        raise AssertionError("unready source reached a business handler")

    @app.get("/api/v1/auth/probe")
    def control():
        return {"ok": True}

    with TestClient(app) as client:
        response = client.get("/api/v1/category/probe")
        assert response.status_code == 503
        assert response.headers["X-Aggregate-Cache-Status"] == "unavailable"
        assert client.get("/api/v1/auth/probe").status_code == 200
    forbidden.assert_not_called()


@pytest.mark.parametrize("state", ["unready", "closed", "ready"])
def test_business_post_cannot_bypass_the_registered_source(runtime_case, monkeypatch, state):
    from backend.routers.ad_hoc_query import router

    runtime, _, _ = runtime_case
    monkeypatch.setenv("FQ_WAREHOUSE_STATE_DIR", "/synthetic-requested")
    app = FastAPI()
    app.include_router(router)
    app.add_middleware(QueryRouterMiddleware)
    if state != "unready":
        app.state.warehouse_runtime = runtime
    if state == "closed":
        runtime.source.close()
    forbidden = Mock(side_effect=AssertionError("business POST opened an independent database"))
    monkeypatch.setattr(duckdb, "connect", forbidden)
    with TestClient(app) as client:
        response = client.post("/api/v1/ad-hoc/daily-gsv", json={"start_date": "2026-07-01", "end_date": "2026-07-05"})
        if state == "ready":
            assert response.status_code == 200
            assert sum(row[1] for row in response.json()["rows"]) == 170
        else:
            assert response.status_code == 503
    forbidden.assert_not_called()


def test_source_configuration_cannot_be_bypassed_by_demo_mode(monkeypatch):
    from backend import main
    from backend.services.mission_service import MissionService

    monkeypatch.setenv("FQ_LOCAL_DEMO_NO_LOGIN", "1")
    monkeypatch.setenv("FQ_WAREHOUSE_STATE_DIR", "")
    mission = Mock()
    monkeypatch.setattr(MissionService, "from_environment", mission)

    async def scenario():
        with pytest.raises(ValueError):
            async with main.lifespan(FastAPI()):
                raise AssertionError("demo bypassed invalid source configuration")

    asyncio.run(scenario())
    mission.assert_not_called()


def test_unbound_database_helpers_cannot_open_a_source_in_verified_mode(monkeypatch):
    from backend.services import dual_conn
    from scripts.ad_hoc_queries._utils import read_only_conn

    monkeypatch.setenv("FQ_WAREHOUSE_SOURCE_ID", "synthetic-unbound")
    forbidden = Mock(side_effect=AssertionError("unbound helper opened a source"))
    monkeypatch.setattr(duckdb, "connect", forbidden)
    monkeypatch.setattr(dual_conn, "get_write_connection", forbidden)
    with pytest.raises(WarehouseSourceUnavailableError):
        get_connection()
    with pytest.raises(WarehouseSourceUnavailableError):
        with read_only_conn():
            raise AssertionError("unbound helper yielded a source")
    forbidden.assert_not_called()


def test_ad_hoc_helper_borrows_owned_source_without_changing_budget(runtime_case, monkeypatch, tmp_path):
    from scripts.ad_hoc_queries._utils import read_only_conn

    runtime, spec, _ = runtime_case
    forbidden = Mock(side_effect=AssertionError("bound helper opened an independent source"))
    monkeypatch.setattr(duckdb, "connect", forbidden)
    with runtime.read() as frame:
        limit = frame.pin.connection.execute("SELECT current_setting('memory_limit')").fetchone()[0]
        with read_only_conn(db_path=spec.database_path, memory_limit="99GB") as conn:
            assert conn.execute("SELECT COUNT(*) FROM orders").fetchone() == (5,)
            assert conn.execute("SELECT current_setting('memory_limit')").fetchone() == (limit,)
            with pytest.raises(duckdb.InvalidInputException):
                conn.execute("DELETE FROM orders")
        with pytest.raises(WarehouseSourceUnavailableError, match="does not match"):
            with read_only_conn(db_path=tmp_path / "another.duckdb"):
                raise AssertionError("foreign database was accepted")
        assert get_connection().execute("SELECT COUNT(*) FROM orders").fetchone() == (5,)
    forbidden.assert_not_called()


def test_source_mode_rejects_unregistered_posts_without_starting_handlers(runtime_case, monkeypatch):
    runtime, _, _ = runtime_case
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.add_middleware(QueryRouterMiddleware)
    called = Mock(side_effect=AssertionError("unregistered operation ran in verified mode"))
    app.add_api_route("/api/v1/ad-hoc/ai-sandbox-execute", called, methods=["POST"])
    app.add_api_route("/api/v1/unknown-operation", called, methods=["POST"])
    with TestClient(app) as client:
        for path in ("/api/v1/ad-hoc/ai-sandbox-execute", "/api/v1/unknown-operation"):
            response = client.post(path, json={})
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "UNSUPPORTED_OPERATION"
    called.assert_not_called()


@pytest.mark.parametrize("path,method", [
    ("/api/v1/rfm/extended", "POST"), ("/api/v1/ad-hoc/export-excel", "POST"),
    ("/api/v1/category/flow", "GET"), ("/api/v1/unknown-business", "GET"),
    ("/api/v1/metrics/dashboard-membership", "GET"),
])
def test_unadapted_queries_do_not_reach_legacy_handlers(runtime_case, path, method):
    runtime, _, _ = runtime_case
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.add_middleware(QueryRouterMiddleware)
    called = Mock(side_effect=AssertionError("unadapted handler used a legacy cache or table"))
    app.add_api_route(path, called, methods=[method])
    with TestClient(app) as client:
        response = client.request(method, path)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "UNSUPPORTED_OPERATION"
    called.assert_not_called()


@pytest.mark.parametrize("store_kind", ["real", "synthetic"])
def test_unadapted_snapshot_capture_never_stamps_or_persists_a_source(runtime_case, tmp_path, store_kind):
    from backend.routers.crm_dashboard import library_context, router
    from backend.services.crm_analysis import CrmAnalysisStore

    runtime, _, _ = runtime_case
    directory = tmp_path / "analysis-store"
    directory.mkdir(mode=0o700)
    store = CrmAnalysisStore(directory, store_kind)
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.include_router(router, prefix="/api/v1/metrics")
    app.dependency_overrides[library_context] = lambda: (store, "alice")
    app.add_middleware(QueryRouterMiddleware)
    with TestClient(app) as client:
        response = client.post("/api/v1/metrics/dashboard-snapshots",
                               json={"start_date": "2026-07-01", "end_date": "2026-07-05"},
                               headers={"Idempotency-Key": "capture-unadapted"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "UNSUPPORTED_OPERATION"
    assert store.library("alice").snapshots == []


@pytest.mark.parametrize("closed", [False, True])
def test_mission_business_cannot_borrow_control_plane_exemption(runtime_case, closed):
    runtime, _, _ = runtime_case
    if closed:
        runtime.source.close()
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.add_middleware(QueryRouterMiddleware)
    calls = []

    @app.post("/api/v1/missions/diagnose")
    def diagnose():
        calls.append(True)
        return {"channel": "source-A-only"}

    with TestClient(app) as client:
        response = client.post("/api/v1/missions/diagnose")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "UNSUPPORTED_OPERATION"
    assert calls == []


def test_session_control_stays_available_without_a_ready_source(monkeypatch):
    monkeypatch.setenv("FQ_WAREHOUSE_SOURCE_ID", "synthetic-not-ready")
    app = FastAPI()
    app.add_middleware(QueryRouterMiddleware)

    @app.post("/api/v1/session/heartbeat")
    def heartbeat():
        return {"ok": True}

    with TestClient(app) as client:
        assert client.post("/api/v1/session/heartbeat").json() == {"ok": True}


def test_verified_mode_refuses_another_sources_legacy_file_cache(runtime_case, monkeypatch, tmp_path):
    from backend.routers.category import router
    from backend.services.category_service.flow.association import get_category_flow

    runtime, _, _ = runtime_case
    monkeypatch.chdir(tmp_path)
    cache_dir = tmp_path / "backend/cache/category_flow"
    cache_dir.mkdir(parents=True)
    key = hashlib.md5(
        "2026-07-01|2026-07-05|class|10|90|None|('其他', '赠品&0.01')".encode()
    ).hexdigest()
    payload = {"sankey_data": {"nodes": [{"name": "source-A-only", "category_name": "source-A-only"}], "links": []},
               "matrix": {"sources": [], "targets": [], "matrix": [], "concentration_warnings": []}}
    cache_file = cache_dir / f"flow_full_{key}.json"
    cache_file.write_text(json.dumps(payload))
    with runtime.read():
        assert get_category_flow("2026-07-01", "2026-07-05")["sankey_data"] == payload["sankey_data"]
    app = FastAPI()
    app.state.warehouse_runtime = runtime
    app.include_router(router)
    app.add_middleware(QueryRouterMiddleware)
    with TestClient(app) as client:
        response = client.get("/api/v1/category/flow", params={"start_date": "2026-07-01", "end_date": "2026-07-05"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "UNSUPPORTED_OPERATION"
        assert "source-A-only" not in response.text
    assert json.loads(cache_file.read_text()) == payload


@pytest.mark.parametrize("ready", [False, True])
def test_main_cors_preflight_remains_available_but_actual_query_is_gated(runtime_case, monkeypatch, ready):
    from backend import main

    runtime, _, _ = runtime_case
    monkeypatch.setenv("FQ_WAREHOUSE_SOURCE_ID", "synthetic-requested")
    if ready:
        monkeypatch.setattr(main.app.state, "warehouse_runtime", runtime, raising=False)
    else:
        monkeypatch.delattr(main.app.state, "warehouse_runtime", raising=False)
    origin = next(value.strip() for value in main._CORS_ORIGINS if value.strip())
    client = TestClient(main.app)
    path = "/api/v1/category/product-customer"
    response = client.options(path, headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                            "Access-Control-Request-Headers": "content-type,authorization"})
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == origin
    rejected = client.options(path, headers={"Origin": "https://not-allowed.invalid", "Access-Control-Request-Method": "POST"})
    assert rejected.status_code == 400
    assert "Access-Control-Allow-Origin" not in rejected.headers
    assert client.post(path, json={}).status_code == 401


def test_main_selects_owned_lifespan_without_legacy_startup_or_cleanup(boot_case, monkeypatch):
    from backend import main
    from backend.db import connection, memory_monitor
    from backend.services import auth_token_evictor
    from backend.services.health.rfm_analysis import prewarm
    from backend.services.rfm import cache

    settings, connect = boot_case
    monkeypatch.delenv("FQ_LOCAL_DEMO_NO_LOGIN", raising=False)
    for key, value in zip(boot.SETTINGS_KEYS, (str(settings.state_dir), settings.source.source_id, settings.source.data_kind), strict=True):
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(main, "DUCKDB_PATH", settings.source.database_path)
    forbidden = Mock(side_effect=AssertionError("verified lifespan touched legacy runtime state"))
    monkeypatch.setattr(main, "validate_startup_db", forbidden)
    monkeypatch.setattr(memory_monitor, "start_memory_watchdog", forbidden)
    monkeypatch.setattr(memory_monitor, "stop_memory_watchdog", forbidden)
    monkeypatch.setattr(connection, "close_connection", forbidden)
    monkeypatch.setattr(cache.RfmQueryCache, "ensure_table", forbidden)
    monkeypatch.setattr(cache, "check_manifest_version_and_invalidate", forbidden)
    monkeypatch.setattr(prewarm, "maybe_start_prewarm_thread", forbidden)
    watchdogs = []
    stopped = threading.Event()

    class Watchdog:
        def __init__(self, interval):
            self.started = False
            self.stopped = False
            watchdogs.append(self)

        def start(self):
            self.started = True

        def stop(self):
            self.stopped = True

    async def evictor(stop):
        await stop.wait()
        stopped.set()

    initialize = boot.initialize_warehouse_runtime

    async def actual_initialize(config):
        return await initialize(config, builder=lambda value: boot.build_warehouse_runtime(value, connect=connect))

    monkeypatch.setattr(memory_monitor, "MemoryWatchdog", Watchdog)
    monkeypatch.setattr(auth_token_evictor, "evict_idle_tokens_periodically", evictor)
    monkeypatch.setattr(boot, "initialize_warehouse_runtime", actual_initialize)
    app = FastAPI(lifespan=main.lifespan)
    app.add_middleware(QueryRouterMiddleware)

    @app.get("/api/v1/metrics/cutoff")
    def data():
        return orders_data_version(get_connection())

    with TestClient(app) as client:
        response = client.get("/api/v1/metrics/cutoff")
        assert response.status_code == 200
        assert response.json()["data_version"].startswith("warehouse-v1:")
        assert response.json()["data_kind"] == "synthetic"
        runtime = app.state.warehouse_runtime
        assert runtime.source.state == SourceState.READY
    assert runtime.source.state == SourceState.CLOSED
    assert stopped.is_set()
    assert len(watchdogs) == 1 and watchdogs[0].started and watchdogs[0].stopped
    forbidden.assert_not_called()
