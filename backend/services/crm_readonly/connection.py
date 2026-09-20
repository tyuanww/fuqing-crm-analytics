"""Independent DuckDB owners. Do not use backend.db.connection or dual_conn."""

from __future__ import annotations

import threading
from pathlib import Path

from backend.services.crm_readonly.errors import QueryTimeoutError, SourceBusyError
from backend.services.crm_readonly.fs import require_private_directory
from backend.services.crm_readonly.resources import MEMORY_MIB, QUERY_TIMEOUT_SECONDS, TEMP_MIB, THREADS


def _read_config(temp_directory: Path) -> dict:
    return {
        "memory_limit": f"{MEMORY_MIB}MiB",
        "threads": THREADS,
        "temp_directory": str(temp_directory),
        "max_temp_directory_size": f"{TEMP_MIB}MiB",
        "default_collation": "C",
        "autoload_known_extensions": False,
        "autoinstall_known_extensions": False,
        "allow_community_extensions": False,
        "allow_persistent_secrets": False,
    }


def _write_config() -> dict:
    return {
        "memory_limit": f"{MEMORY_MIB}MiB",
        "threads": THREADS,
        "default_collation": "C",
        "enable_external_access": False,
        "autoload_known_extensions": False,
        "autoinstall_known_extensions": False,
        "allow_community_extensions": False,
        "allow_persistent_secrets": False,
    }


def open_write_owner(database: Path):
    import duckdb

    try:
        conn = duckdb.connect(str(database), config=_write_config())
    except Exception as exc:  # noqa: BLE001
        raise SourceBusyError(f"cannot open write connection: {exc}") from exc
    try:
        conn.execute("SET enable_external_access=false")
        conn.execute("SET lock_configuration=true")
    except Exception:
        conn.close()
        raise
    return conn


def open_readonly_owner(database: Path, temp_directory: Path):
    import duckdb

    temp = require_private_directory(temp_directory)
    try:
        conn = duckdb.connect(str(database), read_only=True, config=_read_config(temp))
    except Exception as exc:  # noqa: BLE001
        raise SourceBusyError(f"cannot open read-only connection: {exc}") from exc
    try:
        conn.execute("SET default_collation = 'C'")
        conn.execute("SET max_temp_directory_size = ?", [f"{TEMP_MIB}MiB"])
        conn.execute("SET enable_external_access=false")
        conn.execute("SET lock_configuration=true")
        _require_readonly(conn)
    except Exception:
        conn.close()
        raise
    return conn


def _require_readonly(connection) -> None:
    settings = dict(
        connection.execute(
            "SELECT name, value FROM duckdb_settings() WHERE name IN (?, ?, ?, ?)",
            ["access_mode", "enable_external_access", "lock_configuration", "default_collation"],
        ).fetchall()
    )
    if str(settings.get("access_mode", "")).lower() != "read_only":
        raise SourceBusyError("source connection is not read_only")
    if str(settings.get("enable_external_access", "")).lower() != "false":
        raise SourceBusyError("source connection allows external access")
    if str(settings.get("lock_configuration", "")).lower() != "true":
        raise SourceBusyError("source connection configuration is unlocked")


def execute_with_timeout(connection, sql: str, params: list, *, timeout_seconds: float = QUERY_TIMEOUT_SECONDS):
    timer = threading.Timer(timeout_seconds, connection.interrupt)
    timer.daemon = True
    timer.start()
    try:
        return connection.execute(sql, params)
    except Exception as exc:  # noqa: BLE001
        name = type(exc).__name__.lower()
        message = str(exc).lower()
        if "interrupt" in name or "interrupt" in message or "cancel" in message:
            raise QueryTimeoutError("query interrupted by timeout") from exc
        raise
    finally:
        timer.cancel()


class OwnedConnection:
    def __init__(self, conn):
        self._conn = conn
        self._closed = False

    def execute(self, sql: str, params: list | None = None):
        if self._closed:
            raise SourceBusyError("connection owner already released")
        if params is None:
            return self._conn.execute(sql)
        return execute_with_timeout(self._conn, sql, params)

    def interrupt(self) -> None:
        if not self._closed:
            self._conn.interrupt()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._conn.close()

    @property
    def raw(self):
        return self._conn


def close_owner(connection) -> None:
    if connection is None:
        return
    close = getattr(connection, "close", None)
    if close is not None:
        close()
