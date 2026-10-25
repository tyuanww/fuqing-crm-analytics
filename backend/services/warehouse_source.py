from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from datetime import date
from enum import Enum
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import threading
from typing import Callable, Iterator, get_args
from uuid import uuid4

import duckdb

from backend.contracts.crm_analysis import DataKind


RELATIONS = ("orders", "user_first_purchase")
CODEC = "duckdb-json-row-sha256/v1"
SCALAR_TYPES = {
    "VARCHAR", "BOOLEAN", "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
    "DATE", "TIMESTAMP", "TIMESTAMP_S", "TIMESTAMP_MS", "TIMESTAMP_NS", "TIMESTAMP WITH TIME ZONE",
}


class WarehouseSourceUnavailableError(RuntimeError):
    pass


class SourceState(str, Enum):
    READY = "READY"
    CLOSING = "CLOSING"
    CLOSED = "CLOSED"


@dataclass(frozen=True)
class WarehouseSourceSpec:
    database_path: Path
    source_id: str
    data_kind: DataKind


@dataclass(frozen=True)
class RelationIdentity:
    name: str
    schema: tuple[tuple[str, str, str], ...]
    definition_sha256: str
    rows: int
    sha256: str


@dataclass(frozen=True)
class WarehouseIdentity:
    source_id: str
    data_kind: DataKind
    dependency_root_sha256: str
    data_start: str | None
    data_cutoff: str | None
    orders_count: int
    relations: tuple[RelationIdentity, ...]
    duckdb_version: str
    timezone: str
    codec: str = CODEC

    @property
    def revision(self) -> str:
        return "warehouse-v1:" + self.dependency_root_sha256

    def metadata(self) -> dict:
        return {
            "source_id": self.source_id, "data_kind": self.data_kind,
            "data_version": self.revision, "data_start": self.data_start,
            "data_cutoff": self.data_cutoff, "orders_count": self.orders_count,
            "data_timezone": self.timezone,
        }


@dataclass(frozen=True)
class PinnedWarehouseRead:
    connection: duckdb.DuckDBPyConnection
    identity: WarehouseIdentity
    source_epoch: str


def _json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def _file_binding(path: Path) -> tuple[int, int, int, int]:
    info = path.stat()
    if not stat.S_ISREG(info.st_mode):
        raise WarehouseSourceUnavailableError("warehouse source is not a regular file")
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns


def _table_ref(database: str, name: str) -> str:
    return ".".join('"' + part.replace('"', '""') + '"' for part in (database, "main", name))


def _relation_identity(conn: duckdb.DuckDBPyConnection, database: str, name: str) -> RelationIdentity:
    kind = conn.execute(
        "SELECT table_type FROM information_schema.tables "
        "WHERE table_catalog=? AND table_schema='main' AND table_name=?",
        [database, name],
    ).fetchone()
    if not kind or kind[0] != "BASE TABLE":
        raise WarehouseSourceUnavailableError(f"unregistered warehouse relation: {name}")
    schema = tuple(conn.execute(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
        "WHERE table_catalog=? AND table_schema='main' AND table_name=? "
        "ORDER BY ordinal_position", [database, name],
    ).fetchall())
    if any(data_type not in SCALAR_TYPES and not re.fullmatch(r"DECIMAL\(\d+,\d+\)", data_type)
           for _, data_type, _ in schema):
        raise WarehouseSourceUnavailableError(f"unsupported column type in {name}")
    definition = conn.execute(
        "SELECT sql FROM duckdb_tables() WHERE database_name=? AND schema_name='main' AND table_name=?",
        [database, name],
    ).fetchone()[0]
    tokens = re.findall(r"'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|[A-Za-z_][A-Za-z_0-9]*", definition)
    keywords = [token.upper() for token in tokens if token[0] not in "'\""]
    if any(keywords[i:i + 3] == ["GENERATED", "ALWAYS", "AS"] for i in range(len(keywords) - 2)):
        raise WarehouseSourceUnavailableError(f"generated columns are not supported in {name}")
    definition_sha256 = hashlib.sha256(definition.encode()).hexdigest()
    digest = hashlib.sha256(b"warehouse-relation/v1\x00")
    encoded_schema = _json_bytes(schema)
    digest.update(len(encoded_schema).to_bytes(8, "big"))
    digest.update(encoded_schema)
    digest.update(bytes.fromhex(definition_sha256))
    cursor = conn.execute(f'SELECT sha256(to_json(t)) AS row_digest FROM {_table_ref(database, name)} AS t ORDER BY row_digest::BLOB')
    count = 0
    while rows := cursor.fetchmany(2048):
        for (row_digest,) in rows:
            digest.update(bytes.fromhex(row_digest))
        count += len(rows)
    digest.update(count.to_bytes(8, "big"))
    return RelationIdentity(name, schema, definition_sha256, count, digest.hexdigest())


def _write_receipt(state_dir: Path, receipt: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", dir=state_dir, prefix="source-", delete=False) as output:
            temporary = Path(output.name)
            output.write(_json_bytes(receipt))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, state_dir / "warehouse-source.json")
        temporary = None
        if hasattr(os, "O_DIRECTORY"):
            descriptor = os.open(state_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _lock_state_directory(state_dir: Path) -> int:
    try:
        import fcntl
    except ImportError as exc:
        raise WarehouseSourceUnavailableError("warehouse leases require POSIX file locks") from exc
    descriptor = os.open(state_dir / "warehouse-source.lock", os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        os.close(descriptor)
        raise WarehouseSourceUnavailableError("cannot acquire source state directory lock") from exc
    return descriptor


class VerifiedWarehouseSource:
    def __init__(
        self, connection: duckdb.DuckDBPyConnection, spec: WarehouseSourceSpec,
        identity: WarehouseIdentity, binding: tuple[int, int, int, int], state_lock: int,
    ):
        self._connection = connection
        self._spec = spec
        self._identity = identity
        self._binding = binding
        self._epoch = uuid4().hex
        self._state = SourceState.READY
        self._readers = 0
        self._lock = threading.RLock()
        self._state_lock = state_lock

    @classmethod
    def seal(
        cls, spec: WarehouseSourceSpec, state_dir: Path, *,
        connect: Callable[[], duckdb.DuckDBPyConnection],
    ) -> VerifiedWarehouseSource:
        if os.name != "posix":
            raise WarehouseSourceUnavailableError("warehouse leases require POSIX file locks")
        directory = Path(state_dir)
        info = directory.stat()
        if not directory.is_dir() or directory.is_symlink() or info.st_mode & 0o077 or info.st_uid != os.geteuid():
            raise WarehouseSourceUnavailableError("source state directory must be private")
        if not isinstance(spec.source_id, str) or not spec.source_id or spec.data_kind not in get_args(DataKind):
            raise ValueError("source_id and a supported data_kind are required")
        path = spec.database_path.resolve(strict=True)
        binding = _file_binding(path)
        state_lock = _lock_state_directory(directory)
        conn = None
        try:
            conn = connect()
            if not isinstance(conn, duckdb.DuckDBPyConnection):
                raise TypeError("source owner requires a fresh native DuckDB connection")
            databases = conn.execute(
                "SELECT database_name, path, readonly FROM duckdb_databases() WHERE NOT internal"
            ).fetchall()
            mode = conn.execute("SELECT current_setting('access_mode')").fetchone()[0]
            if len(databases) != 1 or not databases[0][2] or mode != "read_only":
                raise WarehouseSourceUnavailableError("source must be one read-only DuckDB database")
            database, database_path, _ = databases[0]
            if not database_path or Path(database_path).resolve(strict=True) != path:
                raise WarehouseSourceUnavailableError("connection does not match the registered source")
            if conn.execute("SELECT current_database()").fetchone()[0] != database:
                raise WarehouseSourceUnavailableError("connection uses an unregistered database")
            shadows = conn.execute(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE lower(table_name) IN (SELECT unnest(?)) AND table_catalog != ?",
                [list(RELATIONS), database],
            ).fetchone()[0]
            if shadows:
                raise WarehouseSourceUnavailableError("temporary warehouse relations are not registered")
            if conn.execute("SELECT current_setting('default_collation')").fetchone()[0]:
                raise WarehouseSourceUnavailableError("nonbinary default collation is not supported")
            timezone = conn.execute("SELECT current_setting('TimeZone')").fetchone()[0]
            conn.execute("SET TimeZone='UTC'")
            conn.execute("BEGIN TRANSACTION")
            relations = tuple(_relation_identity(conn, database, name) for name in RELATIONS)
            conn.execute("SET TimeZone='" + timezone.replace("'", "''") + "'")
            bounds = conn.execute(
                f"SELECT MIN(pay_time)::DATE, MAX(pay_time)::DATE FROM {_table_ref(database, 'orders')}"
            ).fetchone()
            descriptor = {
                "source_id": spec.source_id, "data_kind": spec.data_kind,
                "codec": CODEC, "duckdb_version": duckdb.__version__,
                "timezone": timezone,
                "relations": [asdict(relation) for relation in relations],
            }
            identity = WarehouseIdentity(
                spec.source_id, spec.data_kind, hashlib.sha256(_json_bytes(descriptor)).hexdigest(),
                bounds[0].isoformat() if isinstance(bounds[0], date) else None,
                bounds[1].isoformat() if isinstance(bounds[1], date) else None,
                relations[0].rows, relations, duckdb.__version__, timezone,
            )
            if _file_binding(path) != binding:
                raise WarehouseSourceUnavailableError("warehouse path changed while sealing")
            owner = cls(conn, replace(spec, database_path=spec.database_path.absolute()), identity, binding, state_lock)
            _write_receipt(directory, {
                "format": "warehouse-source-receipt/v1", "status": "SEALED_RECEIPT",
                "source_epoch": owner._epoch, "identity": asdict(identity),
                "revision": identity.revision,
            })
            return owner
        except BaseException:
            try:
                if isinstance(conn, duckdb.DuckDBPyConnection):
                    conn.close()
            finally:
                os.close(state_lock)
            raise

    @property
    def database_path(self) -> Path:
        return self._spec.database_path

    @property
    def state(self) -> SourceState:
        with self._lock:
            return self._state

    def _check_binding(self) -> None:
        try:
            binding = _file_binding(self._spec.database_path.resolve(strict=True))
        except (OSError, WarehouseSourceUnavailableError) as exc:
            self.close()
            raise WarehouseSourceUnavailableError("warehouse path is unavailable") from exc
        if binding != self._binding:
            self.close()
            raise WarehouseSourceUnavailableError("warehouse path changed; reseal the source")

    @contextmanager
    def pin(self) -> Iterator[PinnedWarehouseRead]:
        with self._lock:
            if self._state != SourceState.READY:
                raise WarehouseSourceUnavailableError("warehouse source is closed")
            self._check_binding()
            cursor = self._connection.cursor()
            try:
                cursor.execute("SET TimeZone='" + self._identity.timezone.replace("'", "''") + "'")
            except BaseException:
                cursor.close()
                raise
            self._readers += 1
        try:
            yield PinnedWarehouseRead(cursor, self._identity, self._epoch)
            self._check_binding()
        finally:
            try:
                cursor.close()
            finally:
                with self._lock:
                    self._readers -= 1
                    self._close_when_idle()

    def _close_when_idle(self) -> None:
        if self._state == SourceState.CLOSING and not self._readers:
            self._state = SourceState.CLOSED
            try:
                self._connection.close()
            finally:
                os.close(self._state_lock)

    def close(self) -> None:
        with self._lock:
            if self._state == SourceState.READY:
                self._state = SourceState.CLOSING
            self._close_when_idle()
