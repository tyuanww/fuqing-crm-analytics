from dataclasses import replace
import hashlib
from pathlib import Path
import selectors
import sqlite3
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import duckdb
import pytest

from backend.services.warehouse_cache import (
    AggregateCache, AggregateCacheUnavailableError, AggregateKey, semantic_revision,
)
from backend.services.warehouse_source import WarehouseIdentity


@pytest.fixture
def cache_case(tmp_path):
    directory = tmp_path / "cache"
    directory.mkdir(mode=0o700)
    identity = WarehouseIdentity(
        "synthetic-cache", "synthetic", "a" * 64, "2024-01-01", "2026-07-05", 4,
        (), duckdb.__version__, "UTC",
    )
    key = AggregateKey.for_query("product-customer/v3", identity, "b" * 64, {"start": "2026-07-01"})
    return AggregateCache(directory / "aggregates.sqlite"), key


def test_result_survives_new_store_and_is_not_shared_mutable_memory(cache_case):
    cache, key = cache_case
    result = {"products": [{"users": 10}], "data_version": key.source_revision}
    cache.put(key, result)
    result["products"][0]["users"] = 999
    reopened = AggregateCache(cache.path)
    saved = reopened.get(key)
    assert saved["products"][0]["users"] == 10
    saved["products"].clear()
    assert cache.get(key)["products"] == [{"users": 10}]
    cache.put(key, {"data_version": key.source_revision, "products": [{"users": 10}]})
    with pytest.raises(AggregateCacheUnavailableError, match="conflicting"):
        cache.put(key, {"products": [{"users": 11}]})
    assert cache.get(key)["products"][0]["users"] == 10


@pytest.mark.parametrize("changes", [
    {"endpoint": "rfm/r-flow"}, {"source_revision": "warehouse-v1:" + "c" * 64},
    {"semantic_revision": "d" * 64}, {"query_json": '{"start":"2025-07-01"}'},
])
def test_source_semantics_endpoint_and_dates_cannot_share_results(cache_case, changes):
    cache, key = cache_case
    cache.put(key, {"users": 10})
    assert cache.get(replace(key, **changes)) is None


@pytest.mark.parametrize("column,value", [
    ("descriptor", "{}"), ("payload", '{"users":999}'), ("payload_sha256", "0" * 64),
])
def test_corrupt_cache_fails_closed(cache_case, column, value):
    cache, key = cache_case
    cache.put(key, {"users": 10})
    with sqlite3.connect(cache.path) as conn:
        conn.execute(f"UPDATE aggregate_results SET {column}=?", [value])
    with pytest.raises(AggregateCacheUnavailableError, match="verification"):
        cache.get(key)


def test_wrong_database_is_not_reconfigured(tmp_path):
    directory = tmp_path / "private"
    directory.mkdir(mode=0o700)
    path = directory / "other.sqlite"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE unrelated(value TEXT)")
    path.chmod(0o600)
    before = path.read_bytes()
    with pytest.raises(AggregateCacheUnavailableError, match="schema"):
        AggregateCache(path)
    assert path.read_bytes() == before


def test_cache_rejects_public_files_and_symlinks(cache_case, tmp_path):
    cache, _ = cache_case
    alias = cache.path.with_name("alias.sqlite")
    alias.symlink_to(cache.path)
    with pytest.raises(AggregateCacheUnavailableError):
        AggregateCache(alias)
    cache.path.chmod(0o644)
    with pytest.raises(AggregateCacheUnavailableError):
        AggregateCache(cache.path)
    public = tmp_path / "public"
    public.mkdir()
    public.chmod(0o755)
    with pytest.raises(AggregateCacheUnavailableError):
        AggregateCache(public / "public.sqlite")


def test_concurrent_writers_commit_only_complete_results(cache_case):
    cache, key = cache_case

    def write(index):
        store = AggregateCache(cache.path)
        changed = replace(key, query_json=f'{{"window":{index}}}')
        store.put(changed, {"users": index, "rows": list(range(index))})
        assert store.get(changed)["users"] == index

    with ThreadPoolExecutor(max_workers=4) as workers:
        list(workers.map(write, range(12)))
    for index in range(12):
        result = cache.get(replace(key, query_json=f'{{"window":{index}}}'))
        assert result == {"users": index, "rows": list(range(index))}


def test_killed_writer_keeps_previous_committed_result(cache_case):
    cache, key = cache_case
    cache.put(key, {"users": 10})
    script = """
import sqlite3,sys,time
conn=sqlite3.connect(sys.argv[1])
conn.execute('BEGIN IMMEDIATE')
conn.execute('UPDATE aggregate_results SET payload=?', ['corrupt-uncommitted'])
print('UNCOMMITTED', flush=True)
time.sleep(60)
"""
    process = subprocess.Popen(
        [sys.executable, "-B", "-c", script, str(cache.path)],
        cwd=Path(__file__).resolve().parents[2], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            assert selector.select(10)
        assert process.stdout.readline().strip() == "UNCOMMITTED"
        assert cache.get(key) == {"users": 10}
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
    assert AggregateCache(cache.path).get(key) == {"users": 10}


def test_semantic_revision_includes_dependency_names_and_content(tmp_path):
    (tmp_path / "a.py").write_text("a = 1\n")
    (tmp_path / "b.py").write_text("b = 2\n")
    first = semantic_revision(tmp_path, ("a.py", "b.py"))
    assert first == semantic_revision(tmp_path, ("b.py", "a.py"))
    (tmp_path / "a.py").write_text("a = 3\n")
    assert first != semantic_revision(tmp_path, ("a.py", "b.py"))
    assert len(bytes.fromhex(first)) == hashlib.sha256().digest_size
