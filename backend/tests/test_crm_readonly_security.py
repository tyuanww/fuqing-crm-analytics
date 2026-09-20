"""Whitelist, permission, schema drift, timeout, and no legacy cache reuse."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend.services.crm_readonly import (
    CancelToken,
    CrmReadonlyAdapter,
    SourceRegistry,
    archive_placeholder,
    build_synthetic_grain_source,
)
from backend.services.crm_readonly.connection import execute_with_timeout, open_readonly_owner, open_write_owner
from backend.services.crm_readonly.errors import (
    CancelledError,
    ForbiddenError,
    MetricNotApprovedError,
    NotConnectedError,
    PathRejectedError,
    QueryTimeoutError,
    SchemaMismatchError,
    SqlRejectedError,
)
from backend.services.crm_readonly.queries import fetch_capped
from backend.tests.test_crm_readonly import make_adapter, private_dir, request_for, three_line_sample


def test_unknown_source_and_arbitrary_path_sql(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    adapter = make_adapter(tmp_path, source)
    with pytest.raises(PathRejectedError):
        adapter.materialize(request_for("not-registered"))
    with pytest.raises(SqlRejectedError):
        adapter.materialize(request_for(source.source_id, path="/tmp/evil.duckdb"))
    with pytest.raises(SqlRejectedError):
        adapter.materialize(request_for(source.source_id, sql="SELECT 1"))
    with pytest.raises(SqlRejectedError):
        conn = open_readonly_owner(source.path, private_dir(tmp_path, "tmp2"))
        try:
            fetch_capped(conn, "SELECT 1", [])
        finally:
            conn.close()


def test_forbidden_real_flag_and_archive_placeholder(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    adapter = make_adapter(tmp_path, source)
    with pytest.raises(ForbiddenError):
        adapter.materialize(request_for(source.source_id, contains_real_data=True))
    with pytest.raises(MetricNotApprovedError):
        adapter.materialize(request_for(source.source_id, metric_version="crm-metrics/v0"))
    registry = SourceRegistry([archive_placeholder()])
    adapter = CrmReadonlyAdapter(
        registry,
        cache_dir=private_dir(tmp_path, "cache-a"),
        temp_dir=private_dir(tmp_path, "tmp-a"),
        server_scope="test-scope",
    )
    with pytest.raises(NotConnectedError):
        adapter.materialize(request_for("crm-archive-candidate", contains_real_data=True))


def test_permission_mismatch(tmp_path):
    source = build_synthetic_grain_source(
        private_dir(tmp_path, "src"),
        source_id="crm-synthetic-grain-v1",
        lines=three_line_sample(),
        permission_scope="scope-a",
    )
    adapter = CrmReadonlyAdapter(
        SourceRegistry([source]),
        cache_dir=private_dir(tmp_path, "cache"),
        temp_dir=private_dir(tmp_path, "tmp"),
        server_scope="scope-b",
    )
    with pytest.raises(ForbiddenError):
        adapter.materialize(request_for(source.source_id, actor_scope="scope-b"))


def test_schema_drift_extra_table(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    writer = open_write_owner(source.path)
    try:
        writer.execute("CREATE TABLE evil (x INTEGER)")
        writer.execute("CHECKPOINT")
    finally:
        writer.close()
    os.chmod(source.path, 0o600)
    adapter = make_adapter(tmp_path, source)
    with pytest.raises(SchemaMismatchError):
        adapter.materialize(request_for(source.source_id))


def test_timeout_and_cancel(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    conn = open_readonly_owner(source.path, private_dir(tmp_path, "tmp"))
    try:
        with pytest.raises(QueryTimeoutError):
            execute_with_timeout(conn, "SELECT sum(i) FROM range(1000000000) t(i)", [], timeout_seconds=0.05)
    finally:
        conn.close()
    adapter = CrmReadonlyAdapter(
        SourceRegistry([source]),
        cache_dir=private_dir(tmp_path, "cache"),
        temp_dir=private_dir(tmp_path, "tmp-adapter"),
        server_scope=source.permission_scope,
    )
    token = CancelToken()
    token.cancel()
    with pytest.raises(CancelledError):
        adapter.materialize(request_for(source.source_id), cancel=token)


def test_source_files_do_not_import_legacy_cache():
    root = Path(__file__).resolve().parents[1] / "services" / "crm_readonly"
    forbidden = ("from backend.services.rfm", "from backend.db.connection", "import dual_conn", "get_connection(")
    for path in root.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in text, f"{path.name} contains {token}"
    assert "rfm_query_cache" not in (root / "cache.py").read_text(encoding="utf-8")
