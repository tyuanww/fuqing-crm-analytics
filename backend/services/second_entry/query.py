"""Read-only SQL validation and execution for one dataset DuckDB file."""

from __future__ import annotations

import base64
import math
import re
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import duckdb

from backend.services.second_entry.errors import (
    invalid_sql,
    query_failed,
    dataset_unavailable,
)
from backend.services.second_entry.ingest import TABLE_NAME
from backend.services.second_entry.models import (
    DEFAULT_ROW_LIMIT,
    MAX_ROW_LIMIT,
    DatasetDetail,
    DatasetMeta,
    DatasetPreview,
    QueryRequest,
    QueryResult,
)
from backend.services.second_entry.store import DatasetStore

# Keep this list literal and explicit: a statement starting with SELECT or WITH
# may still try to mutate data or escape the dataset file.
FORBIDDEN_KEYWORDS = frozenset(
    {
        # DDL / DML / transaction control
        "alter",
        "analyze",
        "attach",
        "begin",
        "call",
        "checkpoint",
        "comment",
        "commit",
        "copy",
        "create",
        "deallocate",
        "delete",
        "detach",
        "drop",
        "execute",
        "export",
        "grant",
        "import",
        "insert",
        "install",
        "into",
        "load",
        "merge",
        "pragma",
        "prepare",
        "replace",
        "reset",
        "revoke",
        "rollback",
        "set",
        "truncate",
        "transaction",
        "update",
        "use",
        "vacuum",
    }
)

# DuckDB can read local files or attach remote databases through table
# functions. The read-only connection also disables external access, but
# rejecting these names gives callers a deterministic INVALID_SQL error.
FORBIDDEN_FUNCTIONS = frozenset(
    {
        "azure_blob",
        "azure_scan",
        "delta_scan",
        "glob",
        "httpfs",
        "iceberg_attach",
        "iceberg_scan",
        "mysql_attach",
        "mysql_scan",
        "parquet_scan",
        "postgres_attach",
        "postgres_scan",
        "read_arrow",
        "read_blob",
        "read_csv",
        "read_csv_auto",
        "read_ipc",
        "read_json",
        "read_json_auto",
        "read_json_objects",
        "read_ndjson",
        "read_ndjson_auto",
        "read_parquet",
        "read_text",
        "s3",
        "sqlite_attach",
        "sqlite_scan",
    }
)

_DOLLAR_TAG_RE = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")
_LEADING_KEYWORD_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)")
_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_READ_ONLY_CONFIG = {
    "enable_external_access": False,
    "memory_limit": "1GB",
    "threads": 2,
}


def _mask_literals(sql: str) -> str:
    """Blank out string literals and quoted identifiers.

    Comment markers, semicolons and forbidden words inside data must not be
    mistaken for SQL syntax. Quoting rules follow DuckDB/Postgres: doubled
    quotes escape a quote, and ``$tag$...$tag$`` is a dollar-quoted string.
    """
    characters = list(sql)
    index = 0
    length = len(sql)
    while index < length:
        character = sql[index]
        if character in {"'", '"'}:
            quote = character
            characters[index] = " "
            index += 1
            while index < length:
                if sql[index] == quote:
                    if index + 1 < length and sql[index + 1] == quote:
                        characters[index] = " "
                        characters[index + 1] = " "
                        index += 2
                        continue
                    characters[index] = " "
                    index += 1
                    break
                characters[index] = " "
                index += 1
        elif character == "$":
            match = _DOLLAR_TAG_RE.match(sql, index)
            if match is None:
                characters[index] = " "
                index += 1
                continue
            tag = match.group(0)
            end = sql.find(tag, match.end())
            if end == -1:
                for position in range(index, length):
                    characters[position] = " "
                index = length
            else:
                for position in range(index, end + len(tag)):
                    characters[position] = " "
                index = end + len(tag)
        else:
            index += 1
    return "".join(characters)


def validate_readonly_sql(sql: str) -> str | None:
    """Return an error message, or ``None`` when the SQL is allowed.

    Rules (all case-insensitive):
    - non-empty, starts with SELECT or WITH
    - one statement only; one trailing semicolon is allowed
    - no ``--`` line comments or ``/* ... */`` block comments
    - no DDL/DML/session/file keywords anywhere outside quotes
    - no file/network table functions (``read_csv_auto`` etc.)
    """
    text = (sql or "").strip()
    if not text:
        return "SQL 不能为空"

    masked = _mask_literals(text)
    if "--" in masked:
        return "不允许 SQL 行注释（--）"
    if "/*" in masked or "*/" in masked:
        return "不允许 SQL 块注释（/* */）"

    candidate = masked.rstrip()
    if candidate.endswith(";"):
        candidate = candidate[:-1].rstrip()
    if ";" in candidate:
        return "只允许单条 SQL 语句"
    if not candidate:
        return "SQL 不能为空"

    leading = _LEADING_KEYWORD_RE.match(candidate)
    if leading is None or leading.group(1).lower() not in {"select", "with"}:
        return "只允许 SELECT 或 WITH 查询"

    for token in _TOKEN_RE.findall(candidate):
        lowered = token.lower()
        if lowered in FORBIDDEN_KEYWORDS:
            return f"不允许使用关键字 {token.upper()}"
        if lowered in FORBIDDEN_FUNCTIONS:
            return f"不允许使用函数 {token.upper()}"
    return None


def _json_safe(value: Any) -> Any:
    """Convert DuckDB row values into JSON-safe primitives."""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(value)).decode("ascii")
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _connect_read_only(path: Path) -> duckdb.DuckDBPyConnection:
    try:
        return duckdb.connect(
            str(path),
            read_only=True,
            config=dict(_READ_ONLY_CONFIG),
        )
    except duckdb.Error as exc:
        raise dataset_unavailable("数据集分析库无法打开") from exc


def execute_readonly_sql(
    meta: DatasetMeta,
    sql: str,
    limit: int = DEFAULT_ROW_LIMIT,
) -> QueryResult:
    """Execute already-validated SQL against exactly one dataset file."""
    limit = max(1, min(int(limit), MAX_ROW_LIMIT))
    connection = _connect_read_only(Path(meta.path))
    try:
        try:
            cursor = connection.execute(sql)
            if cursor.description is None:
                raise query_failed("SQL 未返回结果集")
            columns = [str(description[0]) for description in cursor.description]
            raw_rows = cursor.fetchmany(limit + 1)
        except duckdb.Error as exc:
            message = " ".join(str(exc).split())[:400]
            raise query_failed(f"查询失败: {message}") from exc

        truncated = len(raw_rows) > limit
        if truncated:
            raw_rows = raw_rows[:limit]
        return QueryResult(
            columns=columns,
            rows=[[_json_safe(value) for value in row] for row in raw_rows],
            truncated=truncated,
        )
    finally:
        connection.close()


def query_dataset(store: DatasetStore, request: QueryRequest) -> QueryResult:
    """Look up a dataset, validate its SQL, and execute read-only."""
    meta = store.get(request.dataset_id)
    validation_error = validate_readonly_sql(request.sql)
    if validation_error is not None:
        raise invalid_sql(validation_error)
    return execute_readonly_sql(meta, request.sql, request.limit)


def dataset_preview(store: DatasetStore, dataset_id: str, limit: int = 10) -> DatasetDetail:
    """Return metadata plus the first ``limit`` rows."""
    meta = store.get(dataset_id)
    preview = execute_readonly_sql(
        meta,
        f'SELECT * FROM "{TABLE_NAME}"',
        limit,
    )
    return DatasetDetail(
        **meta.model_dump(),
        preview=DatasetPreview(
            columns=preview.columns,
            rows=preview.rows,
            truncated=preview.truncated,
        ),
    )
