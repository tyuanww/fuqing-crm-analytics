"""Resource defaults and connection ownership; only isolated temporary databases."""
from __future__ import annotations

import importlib
import os
from pathlib import Path
import subprocess
import sys
import threading
from types import SimpleNamespace

import duckdb
import pytest

from backend import config
from backend import resource_budget as budget
from backend.services import dual_conn


def test_default_memory_has_one_source(monkeypatch):
    with monkeypatch.context() as patch:
        patch.delenv("DUCKDB_MEMORY_LIMIT", raising=False)
        patch.delenv("DUCKDB_MEMORY_LIMIT_OVERRIDE", raising=False)
        importlib.reload(config)
        try:
            assert config.get_duckdb_memory_limit() == config.DUCKDB_MEMORY_LIMIT
        finally:
            patch.undo()
            importlib.reload(config)


def test_cache_has_its_own_budget(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DUCKDB_PATH", tmp_path / "cache.duckdb")
    monkeypatch.setattr(dual_conn, "_CACHE_CONN", None)
    monkeypatch.setattr(dual_conn, "CACHE_MEMORY_LIMIT", "192MB", raising=False)
    seen = []
    original = dual_conn.configure_connection

    def apply(conn, memory_limit, **kwargs):
        seen.append(memory_limit)
        return original(conn, memory_limit, **kwargs)

    monkeypatch.setattr(dual_conn, "configure_connection", apply)
    try:
        conn = dual_conn.get_cache_connection()
        assert conn.execute("SELECT 42").fetchone() == (42,)
        assert seen == ["192MB"]
    finally:
        if dual_conn._CACHE_CONN is not None:
            dual_conn._CACHE_CONN.close()
            dual_conn._CACHE_CONN = None


@pytest.mark.parametrize("override", ["4GB", " 4GB "])
def test_explicit_offline_memory_override_is_preserved(monkeypatch, override):
    monkeypatch.setenv("DUCKDB_MEMORY_LIMIT", "2GB")
    monkeypatch.setenv("DUCKDB_MEMORY_LIMIT_OVERRIDE", override)
    assert config.get_duckdb_memory_limit() == "4GB"


@pytest.mark.parametrize(("ram_gib", "expected"), [
    (1, "512MiB"), (8, "4096MiB"), (16, "8192MiB"), (64, "8192MiB"),
])
def test_default_budget_leaves_headroom(ram_gib, expected):
    assert budget.default_memory_limit(ram_gib * budget.GIB) == expected


@pytest.mark.parametrize(("cpus", "expected"), [(1, 1), (2, 1), (8, 4), (10, 4), (64, 4)])
def test_default_threads_are_bounded(cpus, expected):
    assert budget.default_threads(cpus) == expected


def test_cache_default_is_small():
    assert budget.default_cache_memory_limit(16 * budget.GIB) == "256MiB"
    assert budget.default_cache_memory_limit(budget.GIB) == "32MiB"


@pytest.mark.parametrize(("root", "limit", "setting"), [
    ("relative/spill", "128MiB", "FQ_DUCKDB_TEMP_ROOT"),
    ("/tmp/spill", "0GiB", "FQ_DUCKDB_TEMP_LIMIT"),
    ("/tmp/spill", "-1GiB", "FQ_DUCKDB_TEMP_LIMIT"),
    ("/tmp/spill", "unlimited", "FQ_DUCKDB_TEMP_LIMIT"),
    ("/tmp/spill", "1GiB'; SELECT 1", "FQ_DUCKDB_TEMP_LIMIT"),
])
def test_invalid_spill_configuration_fails_at_import(root, limit, setting):
    env = {**os.environ, "FQ_DUCKDB_TEMP_ROOT": root, "FQ_DUCKDB_TEMP_LIMIT": limit}
    result = subprocess.run(
        [sys.executable, "-c", "import backend.config"], env=env,
        cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, timeout=10,
    )
    assert result.returncode != 0
    assert setting in result.stderr


def test_cgroup_memory_is_not_confused_with_host_ram(monkeypatch):
    monkeypatch.setattr(budget.sys, "platform", "linux")
    monkeypatch.setattr(budget.psutil, "virtual_memory", lambda: SimpleNamespace(total=64 * budget.GIB))
    monkeypatch.setattr(Path, "read_text", lambda self, **kwargs: (
        str(2 * budget.GIB) if self.name == "memory.max" else str(2 ** 63 - 4096)
    ))
    assert budget.effective_memory_bytes() == 2 * budget.GIB


def test_unlimited_cgroup_uses_host_ram(monkeypatch):
    monkeypatch.setattr(budget.sys, "platform", "linux")
    monkeypatch.setattr(budget.psutil, "virtual_memory", lambda: SimpleNamespace(total=8 * budget.GIB))
    monkeypatch.setattr(Path, "read_text", lambda self, **kwargs: "max")
    assert budget.effective_memory_bytes() == 8 * budget.GIB


def test_unknown_host_falls_back_conservatively(monkeypatch):
    monkeypatch.setattr(budget.sys, "platform", "darwin")

    def unavailable():
        raise OSError("synthetic unavailable host")

    monkeypatch.setattr(budget.psutil, "virtual_memory", unavailable)
    assert budget.default_memory_limit() == "2048MiB"


def test_cache_settings_do_not_change_business_database(tmp_path, monkeypatch):
    business_path = tmp_path / "business.duckdb"
    with duckdb.connect(str(business_path)) as seed:
        seed.execute("CREATE TABLE marker (value INTEGER)")
    monkeypatch.setattr(config, "CACHE_DUCKDB_PATH", tmp_path / "cache.duckdb")
    monkeypatch.setattr(dual_conn, "_CACHE_CONN", None)
    monkeypatch.setattr(dual_conn, "CACHE_MEMORY_LIMIT", "64MB")
    with duckdb.connect(str(business_path), read_only=True) as business:
        dual_conn.configure_connection(business, "128MB")
        before = business.execute("SELECT current_setting('memory_limit')").fetchone()
        try:
            cache = dual_conn.get_cache_connection()
            assert business.execute("SELECT current_setting('memory_limit')").fetchone() == before
            assert cache.execute("SELECT current_setting('memory_limit')").fetchone() != before
        finally:
            if dual_conn._CACHE_CONN is not None:
                dual_conn._CACHE_CONN.close()
                dual_conn._CACHE_CONN = None


@pytest.fixture
def isolated_spill_policy(tmp_path, monkeypatch):
    from backend.db import connection as bdc

    database = tmp_path / "business.duckdb"
    with duckdb.connect(str(database)) as seed:
        seed.execute("CREATE TABLE marker AS SELECT 42 AS value")
    monkeypatch.setattr(config, "FQ_DUCKDB_TEMP_ROOT", tmp_path / "spill", raising=False)
    monkeypatch.setattr(config, "FQ_DUCKDB_TEMP_LIMIT", "128MiB", raising=False)
    monkeypatch.setattr(config, "CACHE_DUCKDB_PATH", tmp_path / "cache.duckdb")
    monkeypatch.setattr(dual_conn, "DUCKDB_PATH", database)
    monkeypatch.setattr(dual_conn, "READ_MEMORY_LIMIT", "32MiB")
    monkeypatch.setattr(dual_conn, "DUCKDB_THREADS", 1)
    monkeypatch.setattr(dual_conn, "_read_pool", [])
    monkeypatch.setattr(dual_conn, "_read_semaphore", threading.BoundedSemaphore(2))
    monkeypatch.setattr(dual_conn, "_WRITE_CONN", None)
    monkeypatch.setattr(dual_conn, "_CACHE_CONN", None)
    monkeypatch.setattr(bdc, "_conn", None)
    monkeypatch.delenv("FQ_ARCHIVE_DUCKDB", raising=False)
    yield database
    bdc.close_connection()


def _spill_settings(conn):
    directory, limit = conn.execute(
        "SELECT current_setting('temp_directory'), current_setting('max_temp_directory_size')"
    ).fetchone()
    return Path(directory), limit


def test_read_pool_recreation_keeps_spill_policy(isolated_spill_policy):
    from backend.db import connection as bdc

    expected = config.FQ_DUCKDB_TEMP_ROOT / str(os.getpid()) / "business"
    for _ in range(2):
        with dual_conn.read_request_context() as request:
            directory, limit = _spill_settings(request.conn)
            assert directory == expected
            assert directory.is_dir()
            assert limit == "128.0 MiB"
            assert request.conn.execute("SELECT value FROM marker").fetchone() == (42,)
            with pytest.raises(duckdb.Error):
                request.conn.execute("INSERT INTO marker VALUES (99)")
        bdc.close_connection()


def test_cache_spill_does_not_share_business_directory(isolated_spill_policy):
    with dual_conn.read_request_context() as request:
        business_directory, business_limit = _spill_settings(request.conn)
        cache_directory, cache_limit = _spill_settings(dual_conn.get_cache_connection())
        assert business_directory != cache_directory
        assert cache_directory == config.FQ_DUCKDB_TEMP_ROOT / str(os.getpid()) / "cache"
        assert business_limit == cache_limit == "128.0 MiB"
        with duckdb.connect(str(isolated_spill_policy), read_only=True) as sibling:
            assert sibling.execute("SELECT value FROM marker").fetchone() == (42,)
            assert _spill_settings(sibling) == (business_directory, business_limit)


def test_spilled_read_can_open_another_configured_connection(isolated_spill_policy):
    with dual_conn.read_request_context() as request:
        request.conn.execute(
            "CREATE TEMP TABLE sorted AS SELECT i, sha256(i::VARCHAR) AS payload "
            "FROM range(500000) AS rows(i) ORDER BY payload"
        )
        files = request.conn.execute("SELECT path, size FROM duckdb_temporary_files()").fetchall()
        directory, _ = _spill_settings(request.conn)
        assert files
        assert all(Path(path).is_relative_to(directory) and size > 0 for path, size in files)
        sibling = dual_conn.open_matching_read_connection()
        try:
            assert _spill_settings(sibling) == _spill_settings(request.conn)
            assert sibling.execute("SELECT value FROM marker").fetchone() == (42,)
            assert request.conn.execute("SELECT count(*) FROM sorted").fetchone() == (500000,)
        finally:
            sibling.close()


@pytest.mark.parametrize("failure", ["directory", "setting", "archive"])
def test_spill_setup_failure_releases_connection_and_pool_slot(isolated_spill_policy, monkeypatch, failure):
    if failure == "directory":
        config.FQ_DUCKDB_TEMP_ROOT.write_text("not a directory", encoding="utf-8")
    elif failure == "setting":
        monkeypatch.setattr(dual_conn, "READ_MEMORY_LIMIT", "invalid")
    else:
        monkeypatch.setenv("FQ_ARCHIVE_DUCKDB", str(isolated_spill_policy.parent / "missing.duckdb"))
    error = None
    try:
        dual_conn.get_read_connection(timeout=0.01)
    except (OSError, duckdb.Error) as exc:
        error = exc
    else:
        pytest.fail("invalid connection settings must fail initialization")
    assert error is not None
    assert dual_conn._read_semaphore.acquire(blocking=False)
    assert dual_conn._read_semaphore.acquire(blocking=False)
    assert not dual_conn._read_semaphore.acquire(blocking=False)
    dual_conn._read_semaphore.release()
    dual_conn._read_semaphore.release()
    with duckdb.connect(str(isolated_spill_policy)) as writer:
        writer.execute("INSERT INTO marker VALUES (99)")
        assert writer.execute("SELECT count(*) FROM marker").fetchone() == (2,)


def test_five_callers_share_two_native_read_slots(tmp_path, monkeypatch):
    """Real temporary DuckDB connections; this tests scheduling, not heavy-query SLA."""
    database = tmp_path / "pool.duckdb"
    with duckdb.connect(str(database)) as seed:
        seed.execute("CREATE TABLE marker AS SELECT 42 AS value")
    monkeypatch.setattr(dual_conn, "DUCKDB_PATH", database)
    monkeypatch.setattr(dual_conn, "READ_MEMORY_LIMIT", "64MB")
    monkeypatch.setattr(dual_conn, "DUCKDB_THREADS", 2)
    monkeypatch.setattr(dual_conn, "READ_POOL_SIZE", 2)
    monkeypatch.setattr(dual_conn, "ACTIVE_READ_LIMIT", 2)
    monkeypatch.setattr(dual_conn, "_read_pool", [])
    monkeypatch.setattr(dual_conn, "_read_semaphore", threading.BoundedSemaphore(2))
    start = threading.Barrier(6)
    two_active = threading.Event()
    release = threading.Event()
    state_lock = threading.Lock()
    active = peak = 0
    values, errors = [], []

    def caller():
        nonlocal active, peak
        conn = None
        counted = False
        try:
            start.wait(timeout=5)
            conn = dual_conn.get_read_connection(timeout=5)
            with state_lock:
                active += 1
                counted = True
                peak = max(peak, active)
                if active == 2:
                    two_active.set()
            assert release.wait(timeout=5)
            value = conn.execute("SELECT value FROM marker").fetchone()[0]
            with state_lock:
                values.append(value)
        except BaseException as exc:
            with state_lock:
                errors.append(exc)
        finally:
            if counted:
                with state_lock:
                    active -= 1
            if conn is not None:
                dual_conn.return_read_connection(conn)

    threads = [threading.Thread(target=caller) for _ in range(5)]
    for thread in threads:
        thread.start()
    try:
        start.wait(timeout=5)
        assert two_active.wait(timeout=5)
        with pytest.raises(dual_conn.ReadPoolTimeout):
            dual_conn.get_read_connection(timeout=0.01)
    finally:
        release.set()
        for thread in threads:
            thread.join(timeout=6)
        for conn in dual_conn._read_pool:
            conn.close()
        dual_conn._read_pool.clear()
    assert not any(thread.is_alive() for thread in threads)
    assert errors == []
    assert values == [42] * 5
    assert peak == 2
    assert dual_conn._read_semaphore.acquire(blocking=False)
    assert dual_conn._read_semaphore.acquire(blocking=False)
    assert not dual_conn._read_semaphore.acquire(blocking=False)
    dual_conn._read_semaphore.release()
    dual_conn._read_semaphore.release()
