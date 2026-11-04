from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict, dataclass
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
from typing import Callable, Literal, Protocol
from uuid import uuid4

from fastapi import HTTPException

from backend.contracts.crm_analysis import CrmSnapshot, DataKind
from backend.contracts.warehouse_snapshot import WarehouseSnapshot
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.asset_state import (
    SHA256_HEX, connect, now_ms, transaction,
)
from backend.services.crm_analysis import OWNER, CrmAnalysisStore, canonical, digest, fail
from backend.services.warehouse_snapshot import WarehouseSnapshotStore

APP_ID = 0x43525053
KIND = "native-crm-snapshot-source/v1"
PROJECTION = "crm-snapshot/v1"
WAREHOUSE_PROJECTION = "crm-warehouse-snapshot/v1"
SNAPSHOT_ID = re.compile(r"^crm_[sw]_[0-9a-f]{32}$")
REF_ID = re.compile(r"^crm_ref_[0-9a-f]{32}$")
NATIVE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
UNAVAILABLE = "CRM 结果引用存储暂不可用。"
DDL = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE refs (
    ref_id TEXT PRIMARY KEY, owner TEXT NOT NULL, session_id TEXT NOT NULL,
    generation TEXT NOT NULL, snapshot_id TEXT NOT NULL, payload TEXT NOT NULL,
    sha256 TEXT NOT NULL, UNIQUE(owner, session_id, generation, snapshot_id)
);
CREATE TABLE revocations (
    ref_id TEXT PRIMARY KEY REFERENCES refs(ref_id), revoked_at_ms INTEGER NOT NULL
);
"""
EXPECTED_SCHEMA = {
    ("table", statement.split()[2]): " ".join(statement.split()).casefold()
    for statement in DDL.split(";") if statement.strip()
}


class OwnedSnapshotStore(Protocol):
    @property
    def data_kind(self) -> str: ...

    def read_owned_snapshot(self, owner: str, snapshot_id: str) -> CrmSnapshot | WarehouseSnapshot: ...


@dataclass(frozen=True)
class NativeSnapshotCatalog:
    legacy: CrmAnalysisStore
    warehouse: WarehouseSnapshotStore

    def __post_init__(self):
        if self.legacy.data_kind != self.warehouse.data_kind:
            raise ValueError("snapshot source data kinds differ")

    @property
    def data_kind(self) -> DataKind:
        return self.warehouse.data_kind

    def read_owned_snapshot(self, owner: str, snapshot_id: str) -> CrmSnapshot | WarehouseSnapshot:
        if not isinstance(snapshot_id, str) or not SNAPSHOT_ID.fullmatch(snapshot_id):
            fail("NOT_FOUND", 404)
        store = self.legacy if snapshot_id.startswith("crm_s_") else self.warehouse
        return store.read_owned_snapshot(owner, snapshot_id)


def _projection(snapshot: CrmSnapshot | WarehouseSnapshot):
    if (isinstance(snapshot, CrmSnapshot) and snapshot.schema_version == "crm-result-snapshot/v1"
            and snapshot.snapshot_id.startswith("crm_s_")):
        return PROJECTION
    if (isinstance(snapshot, WarehouseSnapshot) and snapshot.schema_version == "crm-warehouse-result-snapshot/v1"
            and snapshot.snapshot_id.startswith("crm_w_")):
        return WAREHOUSE_PROJECTION
    raise fault("RESULT_UNAVAILABLE")


def fault(code: str) -> AnalyticsError:
    status, message = {
        "INVALID_REQUEST": (400, "结果引用标识无效。"),
        "UNAUTHENTICATED": (401, "请重新连接当前对话的 CRM 账号。"),
        "IDENTITY_UNAVAILABLE": (503, "无法核实当前原生 CRM 会话。"),
        "NOT_FOUND": (404, "结果引用不存在或当前对话不可见。"),
        "RESULT_REVOKED": (403, "结果引用已撤销，无法恢复。"),
        "RESULT_STALE": (409, "结果来源或有效期已变化，请重新查询。"),
        "RESULT_UNAVAILABLE": (409, "权威 CRM 快照当前不可用。"),
        "SOURCE_UNAVAILABLE": (503, "权威 CRM 快照暂不可用，请稍后重试。"),
        "STATE_UNAVAILABLE": (503, UNAVAILABLE),
    }[code]
    return AnalyticsError(status, code, message, retryable=status == 503)


@dataclass(frozen=True)
class NativeCrmIdentity:
    username: str
    native_session_id: str
    connection_generation: str
    expires_at_ms: int
    data_kind: DataKind


@dataclass(frozen=True)
class NativeSnapshotAuthorization:
    ref_id: str
    ref_payload_sha256: str


@dataclass(frozen=True)
class NativeCrmLease:
    """The trusted Host must recheck its current login grant in is_current."""

    identity: NativeCrmIdentity
    is_current: Callable[[], bool]
    authorizations: tuple[NativeSnapshotAuthorization, ...] = ()


@dataclass(frozen=True)
class NativeSnapshotRef:
    ref_id: str
    identity: NativeCrmIdentity
    snapshot_id: str
    source_sha256: str
    result_sha256: str
    projection_version: Literal["crm-snapshot/v1", "crm-warehouse-snapshot/v1"]
    registered_at_ms: int


@dataclass(frozen=True)
class NativeSnapshotExpectation:
    snapshot_id: str
    result_sha256: str


@dataclass(frozen=True)
class NativeSnapshotRead:
    ref_id: str
    expected: NativeSnapshotExpectation


def _private(path: Path, *, directory=False):
    info = path.lstat()
    valid_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if (not valid_type or info.st_uid != os.getuid() or info.st_mode & 0o077
            or (not directory and info.st_nlink != 1)):
        raise ValueError("private unlinked state required")


def _identity_valid(value):
    return (isinstance(value, NativeCrmIdentity)
            and isinstance(value.username, str) and OWNER.fullmatch(value.username)
            and isinstance(value.native_session_id, str) and NATIVE_ID.fullmatch(value.native_session_id)
            and isinstance(value.connection_generation, str) and NATIVE_ID.fullmatch(value.connection_generation)
            and type(value.expires_at_ms) is int and 0 < value.expires_at_ms <= 2**53 - 1
            and value.data_kind in {"real", "synthetic"})


class NativeCrmSnapshotSource:
    """Open existing state; create is an explicit, exclusive initialization step."""

    def __init__(self, *, directory: Path, store: OwnedSnapshotStore,
                 provider: Callable[[], NativeCrmLease | None] | None = None,
                 clock: Callable[[], int] = now_ms,
                 expected_snapshot: NativeSnapshotExpectation | None = None):
        try:
            if expected_snapshot is not None and (
                    not isinstance(expected_snapshot, NativeSnapshotExpectation)
                    or not isinstance(expected_snapshot.snapshot_id, str)
                    or not SNAPSHOT_ID.fullmatch(expected_snapshot.snapshot_id)
                    or not isinstance(expected_snapshot.result_sha256, str)
                    or not SHA256_HEX.fullmatch(expected_snapshot.result_sha256)):
                raise ValueError("invalid snapshot expectation")
            self.expected_snapshot = expected_snapshot
            _private(directory, directory=True)
            self.directory = directory.resolve(strict=True)
            self.path = self.directory / "native_crm_snapshot_refs.sqlite3"
            self.store, self.provider, self.clock = store, provider, clock
            self._check_files()
            with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
                self.namespace = self._metadata(con)
        except (OSError, sqlite3.DatabaseError, ValueError, TypeError):
            raise fault("STATE_UNAVAILABLE") from None

    @classmethod
    def create(cls, *, directory: Path, store: OwnedSnapshotStore,
               provider: Callable[[], NativeCrmLease | None] | None = None,
               clock: Callable[[], int] = now_ms):
        _private(directory, directory=True)
        folder = directory.resolve(strict=True)
        path = folder / "native_crm_snapshot_refs.sqlite3"
        fd = os.open(folder / ".native-source.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            lock = os.fstat(fd)
            if (not stat.S_ISREG(lock.st_mode) or lock.st_uid != os.getuid()
                    or lock.st_nlink != 1 or lock.st_mode & 0o077):
                raise ValueError("private initialization lock required")
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            created = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            os.close(created)
            with connect(path, readonly=False, unavailable=UNAVAILABLE) as con:
                con.execute("PRAGMA journal_mode=WAL")
                con.executescript("BEGIN IMMEDIATE;\n" + DDL)
                con.execute(f"PRAGMA application_id={APP_ID}")
                con.execute("PRAGMA user_version=1")
                con.executemany("INSERT INTO metadata VALUES (?, ?)", [
                    ("kind", KIND), ("data_kind", store.data_kind), ("namespace", uuid4().hex),
                ])
                con.execute("COMMIT")
        finally:
            os.close(fd)
        return cls(directory=folder, store=store, provider=provider, clock=clock)

    def _check_files(self):
        _private(self.directory, directory=True)
        _private(self.path)
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(self.path) + suffix)
            if sidecar.exists() or sidecar.is_symlink():
                _private(sidecar)

    def _metadata(self, con):
        values = dict(con.execute("SELECT key,value FROM metadata"))
        schema = {(row["type"], row["name"]): " ".join(row["sql"].split()).casefold()
                  for row in con.execute("SELECT type,name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")}
        if (con.execute("PRAGMA application_id").fetchone()[0] != APP_ID
                or con.execute("PRAGMA user_version").fetchone()[0] != 1
                or schema != EXPECTED_SCHEMA
                or set(values) != {"kind", "data_kind", "namespace"}
                or values["kind"] != KIND or values["data_kind"] != self.store.data_kind
                or not re.fullmatch(r"[0-9a-f]{32}", values["namespace"])):
            raise ValueError("state metadata differs")
        return values["namespace"]

    @contextmanager
    def _state(self, *, readonly=False):
        try:
            self._check_files()
            connection = (connect(self.path, readonly=True, unavailable=UNAVAILABLE) if readonly
                          else transaction(self.path, unavailable=UNAVAILABLE))
            with connection as con:
                if self._metadata(con) != self.namespace:
                    raise ValueError("state namespace differs")
                yield con
        except (OSError, sqlite3.DatabaseError, ValueError, TypeError, KeyError):
            raise fault("STATE_UNAVAILABLE") from None

    def _lease(self):
        if self.provider is None:
            raise fault("IDENTITY_UNAVAILABLE")
        try:
            lease = self.provider()
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None
        if lease is None:
            raise fault("UNAUTHENTICATED")
        try:
            valid = (isinstance(lease, NativeCrmLease) and _identity_valid(lease.identity)
                     and lease.identity.data_kind == self.store.data_kind and callable(lease.is_current)
                     and type(lease.authorizations) is tuple and len(lease.authorizations) <= 64
                     and all(type(item) is NativeSnapshotAuthorization
                             and isinstance(item.ref_id, str) and REF_ID.fullmatch(item.ref_id)
                             and isinstance(item.ref_payload_sha256, str) and SHA256_HEX.fullmatch(item.ref_payload_sha256)
                             for item in lease.authorizations)
                     and len({item.ref_id for item in lease.authorizations}) == len(lease.authorizations))
        except (AttributeError, TypeError, ValueError):
            valid = False
        if not valid:
            raise fault("IDENTITY_UNAVAILABLE")
        if lease.identity.expires_at_ms <= self.clock() or not self._is_current(lease):
            raise fault("UNAUTHENTICATED")
        return lease

    @staticmethod
    def _is_current(lease):
        try:
            return lease.is_current() is True
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None

    def _unchanged(self, lease):
        current = self._lease()
        if (current.identity != lease.identity or current.authorizations != lease.authorizations
                or not self._is_current(lease)):
            raise fault("UNAUTHENTICATED")

    def _snapshot(self, identity, snapshot_id):
        if self.expected_snapshot is not None and snapshot_id != self.expected_snapshot.snapshot_id:
            raise fault("NOT_FOUND")
        try:
            snapshot = self.store.read_owned_snapshot(identity.username, snapshot_id)
        except HTTPException as error:
            if error.status_code == 503:
                raise fault("SOURCE_UNAVAILABLE") from None
            raise fault("NOT_FOUND" if error.status_code == 404 else "RESULT_UNAVAILABLE") from None
        if snapshot.snapshot_id != snapshot_id or snapshot.data_kind != identity.data_kind:
            raise fault("RESULT_UNAVAILABLE")
        _projection(snapshot)
        if self.expected_snapshot is not None and snapshot.result_sha256 != self.expected_snapshot.result_sha256:
            raise fault("RESULT_STALE")
        return snapshot

    @staticmethod
    def _decode(row):
        raw = json.loads(row["payload"])
        if digest(raw) != row["sha256"]:
            raise ValueError("reference digest differs")
        identity = NativeCrmIdentity(**raw["identity"])
        ref = NativeSnapshotRef(**{**raw, "identity": identity})
        if (not _identity_valid(identity) or asdict(ref) != raw
                or not REF_ID.fullmatch(ref.ref_id) or not SNAPSHOT_ID.fullmatch(ref.snapshot_id)
                or not SHA256_HEX.fullmatch(ref.source_sha256) or not SHA256_HEX.fullmatch(ref.result_sha256)
                or ref.projection_version != (PROJECTION if ref.snapshot_id.startswith("crm_s_") else WAREHOUSE_PROJECTION)
                or type(ref.registered_at_ms) is not int or ref.registered_at_ms < 0
                or (ref.ref_id, identity.username, identity.native_session_id,
                    identity.connection_generation, ref.snapshot_id) != tuple(row[key] for key in
                    ("ref_id", "owner", "session_id", "generation", "snapshot_id"))):
            raise ValueError("reference metadata differs")
        return ref

    @staticmethod
    def _active(con, ref):
        if con.execute("SELECT 1 FROM revocations WHERE ref_id=?", (ref.ref_id,)).fetchone():
            raise fault("RESULT_REVOKED")

    @staticmethod
    def _matches(ref, snapshot):
        if (ref.source_sha256 != digest(snapshot.model_dump(mode="json"))
                or ref.result_sha256 != snapshot.result_sha256
                or ref.identity.data_kind != snapshot.data_kind or ref.projection_version != _projection(snapshot)):
            raise fault("RESULT_STALE")

    def _fresh(self, ref):
        if ref.identity.expires_at_ms <= self.clock():
            raise fault("RESULT_STALE")

    def register(self, snapshot_id: str) -> NativeSnapshotRef:
        if not isinstance(snapshot_id, str) or not SNAPSHOT_ID.fullmatch(snapshot_id):
            raise fault("INVALID_REQUEST")
        lease = self._lease()
        if lease.authorizations:
            raise fault("INVALID_REQUEST")
        identity = lease.identity
        snapshot = self._snapshot(identity, snapshot_id)
        self._unchanged(lease)
        with self._state() as con:
            row = con.execute("SELECT * FROM refs WHERE owner=? AND session_id=? AND generation=? AND snapshot_id=?",
                              (identity.username, identity.native_session_id, identity.connection_generation, snapshot_id)).fetchone()
            if row is None:
                ref = NativeSnapshotRef("crm_ref_" + uuid4().hex, identity, snapshot_id,
                                        digest(snapshot.model_dump(mode="json")), snapshot.result_sha256,
                                        _projection(snapshot), self.clock())
            else:
                ref = self._decode(row)
                self._active(con, ref)
                self._matches(ref, snapshot)
                self._fresh(ref)
            self._fresh(ref)
            if row is None:
                raw = asdict(ref)
                con.execute("INSERT INTO refs VALUES (?,?,?,?,?,?,?)", (ref.ref_id, identity.username,
                            identity.native_session_id, identity.connection_generation, snapshot_id,
                            canonical(raw), digest(raw)))
        self._unchanged(lease)
        self._recheck(lease, ref)
        return ref

    def _reference(self, con, identity, ref_id):
        if not isinstance(ref_id, str) or not REF_ID.fullmatch(ref_id):
            raise fault("INVALID_REQUEST")
        row = con.execute("SELECT * FROM refs WHERE ref_id=? AND owner=? AND session_id=?",
                          (ref_id, identity.username, identity.native_session_id)).fetchone()
        if row is None:
            raise fault("NOT_FOUND")
        ref = self._decode(row)
        self._expected(ref, self.expected_snapshot)
        return ref

    @staticmethod
    def _expected(ref, expected):
        if expected is not None:
            if ref.snapshot_id != expected.snapshot_id:
                raise fault("NOT_FOUND")
            if ref.result_sha256 != expected.result_sha256:
                raise fault("RESULT_STALE")

    def _authorized(self, ref, lease):
        authority = next((item for item in lease.authorizations if item.ref_id == ref.ref_id), None)
        if authority is not None:
            if authority.ref_payload_sha256 != digest(asdict(ref)):
                raise fault("RESULT_STALE")
            return
        if ref.identity.connection_generation != lease.identity.connection_generation:
            raise fault("NOT_FOUND")
        self._fresh(ref)

    def inspect(self, refs: tuple[str, ...], *, check_active):
        if (type(refs) is not tuple or not 1 <= len(refs) <= 64
                or any(not isinstance(item, str) or not REF_ID.fullmatch(item) for item in refs)
                or len(set(refs)) != len(refs)):
            raise fault("INVALID_REQUEST")
        check_active()
        lease = self._lease()
        observed = []
        with self._state(readonly=True) as con:
            for ref_id in refs:
                check_active()
                ref = self._reference(con, lease.identity, ref_id)
                self._active(con, ref)
                observed.append(ref)
        values = []
        for ref in observed:
            check_active()
            snapshot = self._snapshot(lease.identity, ref.snapshot_id)
            self._matches(ref, snapshot)
            values.append({"ref_id": ref.ref_id, "ref_payload_sha256": digest(asdict(ref)),
                           "snapshot_id": ref.snapshot_id, "source_sha256": ref.source_sha256,
                           "result_sha256": ref.result_sha256, "projection_version": ref.projection_version,
                           "data_kind": ref.identity.data_kind, "captured_at": snapshot.captured_at.isoformat()})
        self._unchanged(lease)
        for ref in observed:
            check_active()
            self._matches(ref, self._snapshot(lease.identity, ref.snapshot_id))
        with self._state(readonly=True) as con:
            for ref in observed:
                check_active()
                current = self._reference(con, lease.identity, ref.ref_id)
                if current != ref:
                    raise fault("RESULT_STALE")
                self._active(con, current)
        self._unchanged(lease)
        check_active()
        return tuple(values)

    def read(self, ref_id: str) -> CrmSnapshot | WarehouseSnapshot:
        lease = self._lease()
        with self._state(readonly=True) as con:
            ref = self._reference(con, lease.identity, ref_id)
            self._active(con, ref)
            self._authorized(ref, lease)
        self._unchanged(lease)
        snapshot = self._snapshot(lease.identity, ref.snapshot_id)
        self._matches(ref, snapshot)
        self._unchanged(lease)
        self._recheck(lease, ref)
        return snapshot

    def read_many(self, requests: tuple[NativeSnapshotRead, ...], *, check_active):
        if (not isinstance(requests, tuple) or not 1 <= len(requests) <= 16
                or any(not isinstance(item, NativeSnapshotRead) or not isinstance(item.ref_id, str)
                       or not isinstance(item.expected, NativeSnapshotExpectation) for item in requests)
                or len({item.ref_id for item in requests}) != len(requests)):
            raise fault("INVALID_REQUEST")
        check_active()
        lease = self._lease()
        refs = []
        with self._state(readonly=True) as con:
            for item in requests:
                check_active()
                ref = self._reference(con, lease.identity, item.ref_id)
                self._expected(ref, item.expected)
                self._active(con, ref)
                self._authorized(ref, lease)
                refs.append(ref)
        self._unchanged(lease)
        snapshots = []
        for ref in refs:
            check_active()
            snapshot = self._snapshot(lease.identity, ref.snapshot_id)
            self._matches(ref, snapshot)
            snapshots.append(snapshot)
        self._unchanged(lease)
        for ref in refs:
            check_active()
            self._recheck(lease, ref)
        check_active()
        return tuple(snapshots)

    def _recheck(self, lease, ref):
        with self._state(readonly=True) as con:
            current = self._reference(con, lease.identity, ref.ref_id)
            if current != ref:
                raise fault("STATE_UNAVAILABLE")
            self._active(con, current)
            self._authorized(current, lease)
        self._authorized(ref, lease)

    def revoke(self, ref_id: str) -> None:
        lease = self._lease()
        with self._state(readonly=True) as con:
            observed = self._reference(con, lease.identity, ref_id)
            if self.expected_snapshot is not None or lease.authorizations:
                self._authorized(observed, lease)
        self._unchanged(lease)
        with self._state() as con:
            ref = self._reference(con, lease.identity, ref_id)
            if ref != observed:
                raise fault("STATE_UNAVAILABLE")
            if self.expected_snapshot is not None or lease.authorizations:
                self._authorized(ref, lease)
            con.execute("INSERT INTO revocations VALUES (?,?) ON CONFLICT(ref_id) DO NOTHING",
                        (ref.ref_id, self.clock()))
            if con.execute("SELECT 1 FROM revocations WHERE ref_id=?", (ref.ref_id,)).fetchone() is None:
                raise fault("STATE_UNAVAILABLE")
