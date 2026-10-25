from contextlib import closing, contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
from typing import get_args
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError

from backend.contracts.crm_analysis import DataKind
from backend.contracts.warehouse_snapshot import (
    FixedSnapshotWindow, ProductSnapshotRequest, PurchasesSnapshotRequest, RfmSnapshotRequest,
    SnapshotWindow, WarehouseProvenance, WarehouseSnapshot, WarehouseSnapshotPayload, WarehouseSnapshotRequest,
)
from backend.services.crm_analysis import OWNER, canonical, digest, fail
from backend.services.warehouse_rfm import WarehouseQueryError, resolve_verified_ranges
from backend.services.warehouse_runtime import WarehouseReadFrame, current_warehouse_read
from backend.services.warehouse_source import WarehouseSourceUnavailableError


APP_ID = 0x46515753
KIND = "warehouse-snapshots/v1"
DDL = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE snapshots (snapshot_id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL) STRICT;
CREATE TABLE receipts (owner TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
    snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id), sha256 TEXT NOT NULL, PRIMARY KEY(owner,key)) STRICT;
"""
SCHEMA = {statement.split()[2]: " ".join(statement.split()).casefold() for statement in DDL.split(";") if statement.strip()}


def _private(path: Path, directory=False):
    info = path.lstat()
    valid = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1
    if not valid or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError("warehouse snapshot state must be private and unlinked")


@dataclass(frozen=True)
class CaptureQuery:
    request: WarehouseSnapshotRequest
    warehouse: WarehouseProvenance
    periods: tuple[SnapshotWindow, ...]

    @property
    def descriptor(self) -> dict:
        return {"request": self.request.model_dump(mode="json"), "warehouse": self.warehouse.model_dump(mode="json"),
                "periods": [value.model_dump(mode="json") for value in self.periods]}


def resolve_capture_query(request: WarehouseSnapshotRequest, frame: WarehouseReadFrame) -> CaptureQuery:
    if current_warehouse_read() is not frame or frame.mode != "cache_only":
        raise WarehouseSourceUnavailableError("snapshot creation requires the current cache-only source frame")
    identity = frame.pin.identity
    if identity.data_start is None or identity.data_cutoff is None:
        raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "仓库没有可用的数据范围")
    family = request.family
    semantic_key = "purchases" if family == "purchases" else "product-customer/v3" if family == "product" else "rfm"
    semantic = frame.semantic_revisions.get(semantic_key)
    if semantic is None:
        raise WarehouseSourceUnavailableError("snapshot family has no registered semantic revision")
    warehouse = WarehouseProvenance(**identity.metadata(), semantic_revision=semantic)
    filters = request.filters
    if isinstance(request, RfmSnapshotRequest):
        fixed = isinstance(filters.window, FixedSnapshotWindow)
        if fixed and frame.period_today is None:
            raise WarehouseSourceUnavailableError("fixed-period snapshot requires a bound business date")
        ranges = resolve_verified_ranges(filters.window.period if fixed else None,
                                         None if fixed else filters.window.start_date.isoformat(),
                                         None if fixed else filters.window.end_date.isoformat(),
                                         filters.compare_start_date.isoformat() if filters.compare_start_date else None,
                                         filters.compare_end_date.isoformat() if filters.compare_end_date else None,
                                         today=frame.period_today)
        periods = tuple(SnapshotWindow(start=ranges[name][0][:10], end=ranges[name][1][:10], cutoff=ranges[name][2][:10])
                        for name in ("current", "comp", "prev2"))
    else:
        periods = (SnapshotWindow(start=filters.start_date, end=filters.end_date, cutoff=filters.start_date - timedelta(days=1)),)
        if isinstance(request, ProductSnapshotRequest):
            from backend.semantic.time import shift_year_clamped

            start = filters.compare_start_date or shift_year_clamped(filters.start_date)
            end = filters.compare_end_date or shift_year_clamped(filters.end_date)
            periods += (SnapshotWindow(start=start, end=end, cutoff=start - timedelta(days=1)),)
    if not all(warehouse.data_start <= value.start <= value.end <= warehouse.data_cutoff for value in periods):
        raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "快照所需日期超出数据覆盖范围")
    return CaptureQuery(request, warehouse, periods)


def _compute(query: CaptureQuery):
    from backend.db.connection import get_connection
    from backend.services.category_service.product_customer import get_product_customer_overview
    from backend.services.health.rfm_analysis.analysis import get_rfm_analysis
    from backend.services.metrics.dashboard_purchases import LOW_PRICE_CHANNELS, query_dashboard_purchases
    from backend.services.rfm import get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow

    request, filters = query.request, query.request.filters
    if isinstance(request, PurchasesSnapshotRequest):
        return query_dashboard_purchases(get_connection(), filters).model_dump(mode="json")
    kwargs = {"channel": None if filters.channel == "全店" else filters.channel,
              "exclude_channels": list(LOW_PRICE_CHANNELS) if filters.exclude_low_price else None,
              "compare_start_date": filters.compare_start_date.isoformat() if filters.compare_start_date else None,
              "compare_end_date": filters.compare_end_date.isoformat() if filters.compare_end_date else None}
    if isinstance(request, ProductSnapshotRequest):
        return get_product_customer_overview(filters.start_date.isoformat(), filters.end_date.isoformat(), products=filters.products, **kwargs)
    dates = ({"period": filters.window.period} if isinstance(filters.window, FixedSnapshotWindow)
             else {"start_date": filters.window.start_date.isoformat(), "end_date": filters.window.end_date.isoformat()})
    function = {"analysis": get_rfm_analysis, "r": get_rfm_r_flow, "f": get_rfm_f_flow, "m": get_rfm_m_flow}[request.family]
    return function(**dates, metric_type=filters.metric_type, **kwargs)


class WarehouseSnapshotStore:
    def __init__(self, directory: Path, data_kind: DataKind):
        try:
            _private(directory, True)
            self.directory = directory.resolve(strict=True)
            self.path = self.directory / "warehouse_snapshots.sqlite3"
            self.data_kind = data_kind
            with self._state() as conn:
                self.namespace = self._metadata(conn)["namespace"]
        except (OSError, ValueError, sqlite3.Error):
            fail("STATE_UNAVAILABLE")

    @classmethod
    def create(cls, directory: Path, data_kind: DataKind):
        _private(directory, True)
        if data_kind not in get_args(DataKind):
            raise ValueError("invalid snapshot data kind")
        path = directory.resolve(strict=True) / "warehouse_snapshots.sqlite3"
        lock = os.open(directory / ".initialize.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            _private(directory / ".initialize.lock")
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if not path.exists() and not path.is_symlink():
                descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
                os.close(descriptor)
                with closing(sqlite3.connect(path, autocommit=True)) as conn:
                    conn.execute("PRAGMA journal_mode=WAL")
                    conn.execute("PRAGMA synchronous=FULL")
                    conn.executescript("BEGIN IMMEDIATE;\n" + DDL)
                    conn.execute(f"PRAGMA application_id={APP_ID}")
                    conn.execute("PRAGMA user_version=1")
                    conn.executemany("INSERT INTO metadata VALUES (?,?)", [("kind", KIND), ("data_kind", data_kind), ("namespace", uuid4().hex)])
                    conn.execute("COMMIT")
            return cls(directory, data_kind)
        finally:
            os.close(lock)

    def _metadata(self, conn):
        values = dict(conn.execute("SELECT key,value FROM metadata"))
        schema = {row[0]: " ".join(row[1].split()).casefold()
                  for row in conn.execute("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")}
        if (conn.execute("PRAGMA application_id").fetchone()[0] != APP_ID
                or conn.execute("PRAGMA user_version").fetchone()[0] != 1 or schema != SCHEMA
                or set(values) != {"kind", "data_kind", "namespace"} or values["kind"] != KIND
                or values["data_kind"] != self.data_kind or self.data_kind not in get_args(DataKind)
                or re.fullmatch(r"[0-9a-f]{32}", values["namespace"]) is None):
            raise ValueError("snapshot state identity differs")
        return values

    @contextmanager
    def _state(self, *, write=False):
        try:
            _private(self.directory, True)
            _private(self.path)
            for suffix in ("-wal", "-shm"):
                sidecar = Path(str(self.path) + suffix)
                if sidecar.exists() or sidecar.is_symlink():
                    _private(sidecar)
            conn = sqlite3.connect(self.path.as_uri() + ("?mode=rw" if write else "?mode=ro"), uri=True, timeout=0.2, autocommit=True)
            try:
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys=ON")
                metadata = self._metadata(conn)
                if hasattr(self, "namespace") and metadata["namespace"] != self.namespace:
                    raise ValueError("snapshot namespace changed")
                if write:
                    conn.execute("PRAGMA synchronous=FULL")
                    conn.execute("BEGIN IMMEDIATE")
                try:
                    yield conn
                    if write:
                        conn.execute("COMMIT")
                except BaseException:
                    if conn.in_transaction:
                        conn.execute("ROLLBACK")
                    raise
            finally:
                conn.close()
        except (OSError, ValueError, sqlite3.Error, ValidationError):
            fail("STATE_UNAVAILABLE")

    def _find(self, conn, owner, snapshot_id):
        row = conn.execute("SELECT payload,sha256 FROM snapshots WHERE owner=? AND snapshot_id=?", (owner, snapshot_id)).fetchone()
        if row is None:
            return None
        raw = json.loads(row["payload"])
        value = WarehouseSnapshot.model_validate(raw)
        if (digest([KIND, "snapshot", self.namespace, owner, snapshot_id, raw]) != row["sha256"]
                or value.model_dump(mode="json") != raw
                or value.snapshot_id != snapshot_id or value.data_kind != self.data_kind
                or digest(value.payload.model_dump(mode="json")) != value.result_sha256):
            raise ValueError("snapshot content differs")
        return value

    def read_owned_snapshot(self, owner: str, snapshot_id: str) -> WarehouseSnapshot:
        if not isinstance(owner, str) or not OWNER.fullmatch(owner):
            fail("AUTH_REQUIRED", 401)
        with self._state() as conn:
            value = self._find(conn, owner, snapshot_id)
            if value is None:
                fail("NOT_FOUND", 404)
            return value

    def _receipt(self, conn, owner, key, expected):
        row = conn.execute("SELECT request_hash,snapshot_id,sha256 FROM receipts WHERE owner=? AND key=?", (owner, key)).fetchone()
        if row is None:
            return None
        if digest([KIND, "receipt", self.namespace, owner, key, row["request_hash"], row["snapshot_id"]]) != row["sha256"]:
            raise ValueError("receipt integrity differs")
        if row["request_hash"] != expected:
            fail("CONFLICT", 409)
        value = self._find(conn, owner, row["snapshot_id"])
        if value is None:
            raise ValueError("receipt target is unavailable")
        actual = {"request": {"family": value.payload.family, "filters": value.payload.filters.model_dump(mode="json")},
                  "warehouse": value.warehouse.model_dump(mode="json"),
                  "periods": [period.model_dump(mode="json") for period in value.payload.periods]}
        if digest(actual) != expected:
            raise ValueError("receipt does not match the stored query")
        return value

    def capture(self, owner: str, key: str | None, request: WarehouseSnapshotRequest, frame: WarehouseReadFrame) -> WarehouseSnapshot:
        if not isinstance(owner, str) or not OWNER.fullmatch(owner):
            fail("AUTH_REQUIRED", 401)
        if not isinstance(key, str) or not 1 <= len(key) <= 100 or any(not 33 <= ord(value) <= 126 for value in key):
            fail("INVALID_KEY", 428 if key is None else 400)
        query = resolve_capture_query(request, frame)
        if query.warehouse.data_kind != self.data_kind:
            raise WarehouseSourceUnavailableError("snapshot store does not match the registered source kind")
        expected = digest(query.descriptor)
        with self._state() as conn:
            if prior := self._receipt(conn, owner, key, expected):
                return prior
        try:
            result = _compute(query)
        except ValueError as exc:
            raise WarehouseQueryError("INVALID_REQUEST", str(exc)) from exc
        payload = {"family": request.family, "filters": request.filters.model_dump(mode="json"),
                   "periods": [value.model_dump(mode="json") for value in query.periods], "result": result}
        try:
            parsed = TypeAdapter(WarehouseSnapshotPayload).validate_python(payload)
        except ValidationError as exc:
            raise WarehouseSourceUnavailableError("snapshot result violates the declared contract") from exc
        snapshot = WarehouseSnapshot(snapshot_id="crm_w_" + uuid4().hex, captured_at=datetime.now(timezone.utc),
                                     warehouse=query.warehouse, payload=parsed,
                                     result_sha256=digest(parsed.model_dump(mode="json")))
        with frame.source.pin():
            with self._state(write=True) as conn:
                if prior := self._receipt(conn, owner, key, expected):
                    return prior
                if conn.execute("SELECT COUNT(*) FROM snapshots WHERE owner=?", (owner,)).fetchone()[0] >= 2000:
                    fail("STATE_LIMIT", 409)
                raw = snapshot.model_dump(mode="json")
                conn.execute("INSERT INTO snapshots VALUES (?,?,?,?)", (snapshot.snapshot_id, owner, canonical(raw),
                             digest([KIND, "snapshot", self.namespace, owner, snapshot.snapshot_id, raw])))
                conn.execute("INSERT INTO receipts VALUES (?,?,?,?,?)", (owner, key, expected, snapshot.snapshot_id,
                             digest([KIND, "receipt", self.namespace, owner, key, expected, snapshot.snapshot_id])))
        return snapshot
