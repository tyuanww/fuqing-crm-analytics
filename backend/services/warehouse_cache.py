from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict, dataclass
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
from typing import Any, Iterator

from backend.services.warehouse_source import WarehouseIdentity


APPLICATION_ID = 0x46514147
SCHEMA_VERSION = 1


class AggregateCacheUnavailableError(RuntimeError):
    pass


class AggregateCacheMissError(RuntimeError):
    pass


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


@dataclass(frozen=True)
class AggregateKey:
    endpoint: str
    source_revision: str
    semantic_revision: str
    query_json: str

    @classmethod
    def for_query(cls, endpoint: str, identity: WarehouseIdentity, semantic_revision: str, query: dict) -> AggregateKey:
        return cls(endpoint, identity.revision, semantic_revision, canonical(query))

    @property
    def descriptor(self) -> str:
        return canonical(asdict(self))

    @property
    def digest(self) -> str:
        return hashlib.sha256(self.descriptor.encode()).hexdigest()


def semantic_revision(root: Path, dependencies: tuple[str, ...]) -> str:
    digest = hashlib.sha256(b"aggregate-semantics/v1\x00")
    for relative in sorted(dependencies):
        name = relative.encode()
        content = (root / relative).read_bytes()
        for value in (name, content):
            digest.update(len(value).to_bytes(8, "big"))
            digest.update(value)
    return digest.hexdigest()


class AggregateCache:
    def __init__(self, path: Path):
        self.path = Path(path).absolute()
        directory = self.path.parent
        info = directory.stat()
        if not directory.is_dir() or directory.is_symlink() or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise AggregateCacheUnavailableError("aggregate cache directory must be private")
        descriptor = None
        try:
            descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise AggregateCacheUnavailableError("aggregate cache file must be private and regular")
        except OSError as exc:
            raise AggregateCacheUnavailableError("cannot open aggregate cache file") from exc
        finally:
            if descriptor is not None:
                os.close(descriptor)
        with self._connect(initialize=True) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                app_id = conn.execute("PRAGMA application_id").fetchone()[0]
                tables = conn.execute("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").fetchall()
                if app_id == 0 and not tables:
                    conn.execute(
                        "CREATE TABLE aggregate_results ("
                        "cache_key TEXT PRIMARY KEY, descriptor TEXT NOT NULL, "
                        "payload TEXT NOT NULL, payload_sha256 TEXT NOT NULL) STRICT"
                    )
                    conn.execute(f"PRAGMA application_id={APPLICATION_ID}")
                    conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
                self._validate_schema(conn)
                conn.commit()
                conn.execute("PRAGMA journal_mode=WAL")
            except BaseException:
                conn.rollback()
                raise

    @staticmethod
    def _validate_schema(conn: sqlite3.Connection) -> None:
        app_id = conn.execute("PRAGMA application_id").fetchone()[0]
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        table = conn.execute("SELECT type FROM sqlite_master WHERE name='aggregate_results'").fetchone()
        columns = conn.execute("PRAGMA table_info(aggregate_results)").fetchall()
        if (app_id != APPLICATION_ID or version != SCHEMA_VERSION or table != ("table",)
                or [(row[1], row[2], row[5]) for row in columns] != [
                    ("cache_key", "TEXT", 1), ("descriptor", "TEXT", 0),
                    ("payload", "TEXT", 0), ("payload_sha256", "TEXT", 0),
                ]):
            raise AggregateCacheUnavailableError("unrecognized aggregate cache schema")

    @contextmanager
    def _connect(self, *, write: bool = False, initialize: bool = False) -> Iterator[sqlite3.Connection]:
        conn = None
        try:
            info = self.path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise AggregateCacheUnavailableError("aggregate cache file is unavailable")
            mode = "rw" if write or initialize else "ro"
            conn = sqlite3.connect(self.path.as_uri() + "?mode=" + mode, uri=True, timeout=5)
            conn.execute("PRAGMA busy_timeout=5000")
            if not initialize:
                self._validate_schema(conn)
            yield conn
        except (OSError, sqlite3.Error) as exc:
            raise AggregateCacheUnavailableError("aggregate cache is unavailable") from exc
        finally:
            if conn is not None:
                conn.close()

    def get(self, key: AggregateKey) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT descriptor, payload, payload_sha256 FROM aggregate_results WHERE cache_key=?",
                [key.digest],
            ).fetchone()
        if row is None:
            return None
        descriptor, payload, payload_sha256 = row
        if descriptor != key.descriptor or hashlib.sha256(payload.encode()).hexdigest() != payload_sha256:
            raise AggregateCacheUnavailableError("aggregate cache result failed verification")
        try:
            result = json.loads(payload)
        except (ValueError, TypeError) as exc:
            raise AggregateCacheUnavailableError("aggregate cache result is not JSON") from exc
        if not isinstance(result, dict):
            raise AggregateCacheUnavailableError("aggregate cache result is not an object")
        return result

    def put(self, key: AggregateKey, result: dict) -> None:
        payload = canonical(result)
        values = (key.descriptor, payload, hashlib.sha256(payload.encode()).hexdigest())
        with self._connect(write=True) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT INTO aggregate_results VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO NOTHING",
                    [key.digest, *values],
                )
                existing = conn.execute(
                    "SELECT descriptor, payload, payload_sha256 FROM aggregate_results WHERE cache_key=?",
                    [key.digest],
                ).fetchone()
                if existing != values:
                    raise AggregateCacheUnavailableError("same aggregate key has conflicting results")
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
