"""Private CRM aggregate assets. No B0 fixture state, credentials or raw rows."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from backend.contracts.crm_analysis import CrmAnalysis, CrmCockpitReference, CrmLibrary, CrmSnapshot
from backend.contracts.crm_dashboard import DashboardPurchases

APP_ID = 0x43524D41
MODELS = {"snapshot": CrmSnapshot, "analysis": CrmAnalysis, "reference": CrmCockpitReference}
IDS = {"snapshot": "snapshot_id", "analysis": "analysis_id", "reference": "reference_id"}
PREFIX = {"snapshot": "s", "analysis": "a", "reference": "r"}
LIMITS = {"snapshot": 2000, "analysis": 1000, "reference": 500}
MESSAGES = {
    "NOT_FOUND": "结果不存在或当前账号不可见。",
    "CONFLICT": "此请求已使用其他内容，或该结果已有不同标题的分析。",
    "STATE_UNAVAILABLE": "CRM 分析存储暂不可用，请稍后重试。",
    "STATE_NOT_CONFIGURED": "尚未配置独立的 CRM 分析存储。",
    "STATE_LIMIT": "当前账号的保存数量已达上限。",
    "INVALID_KEY": "需要稳定的 Idempotency-Key（1–100 个 ASCII 字符）。",
    "AUTH_REQUIRED": "请重新连接 CRM。",
}


def fail(code, status=503):
    raise HTTPException(status, {"code": code, "message": MESSAGES[code]}, headers={"Cache-Control": "no-store"})


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def utcnow():
    return datetime.now(timezone.utc)


class CrmAnalysisStore:
    """All values are immutable; reads and receipt replays resolve owner-scoped refs."""

    def __init__(self, directory: Path, data_kind: str):
        if data_kind not in {"real", "synthetic"} or directory.is_symlink() or not directory.is_dir():
            raise ValueError("explicit data kind and an existing private directory are required")
        self.directory = directory.resolve(strict=True)
        info = self.directory.stat()
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("CRM state directory must be owned by caller, mode 0700")
        self.path = self.directory / "crm-analyses.sqlite3"
        self.data_kind = data_kind
        fd = os.open(self.directory / ".initialize.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise ValueError("invalid initialization lock")
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if not self.path.exists() and not self.path.is_symlink():
                created = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
                os.close(created)
                with self._connection(check=False) as con:
                    con.execute("PRAGMA journal_mode=WAL")
                    con.executescript("""
                        BEGIN IMMEDIATE;
                        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                        CREATE TABLE assets (
                            owner TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
                            source TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL,
                            PRIMARY KEY(owner, kind, id), UNIQUE(owner, kind, source)
                        );
                        CREATE TABLE receipts (
                            owner TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
                            kind TEXT NOT NULL, id TEXT NOT NULL,
                            PRIMARY KEY(owner, key),
                            FOREIGN KEY(owner, kind, id) REFERENCES assets(owner, kind, id)
                        );
                    """)
                    con.execute(f"PRAGMA application_id={APP_ID}")
                    con.execute("PRAGMA user_version=1")
                    con.executemany("INSERT INTO metadata VALUES (?, ?)", [("kind", "crm-analysis/v1"), ("data_kind", data_kind)])
                    con.execute("COMMIT")
            with self._connection():
                pass
        finally:
            os.close(fd)

    @contextmanager
    def _connection(self, *, check=True):
        try:
            folder = self.directory.lstat()
            info = self.path.lstat()
            if (not stat.S_ISDIR(folder.st_mode) or folder.st_uid != os.getuid() or folder.st_mode & 0o077
                    or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077):
                fail("STATE_UNAVAILABLE")
            con = sqlite3.connect(self.path.as_uri() + "?mode=rw", uri=True, timeout=0.2, autocommit=True)
            con.row_factory = sqlite3.Row
            try:
                con.execute("PRAGMA foreign_keys=ON")
                con.execute("PRAGMA synchronous=FULL")
                if check and (con.execute("PRAGMA application_id").fetchone()[0] != APP_ID
                              or con.execute("PRAGMA user_version").fetchone()[0] != 1
                              or dict(con.execute("SELECT key,value FROM metadata")) != {"kind": "crm-analysis/v1", "data_kind": self.data_kind}):
                    fail("STATE_UNAVAILABLE")
                yield con
            finally:
                con.close()
        except (OSError, sqlite3.DatabaseError, ValidationError, ValueError, KeyError, TypeError):
            fail("STATE_UNAVAILABLE")

    @staticmethod
    def _owner(owner):
        if not isinstance(owner, str) or not re.fullmatch(r"[A-Za-z0-9_.@-]{1,64}", owner):
            fail("AUTH_REQUIRED", 401)

    def _read(self, con, owner, kind, asset_id):
        row = con.execute("SELECT * FROM assets WHERE owner=? AND kind=? AND id=?", (owner, kind, asset_id)).fetchone()
        if row is None:
            fail("NOT_FOUND", 404)
        raw = json.loads(row["payload"])
        if digest([owner, kind, asset_id, row["source"], raw]) != row["sha256"]:
            fail("STATE_UNAVAILABLE")
        value = MODELS[kind].model_validate(raw)
        if getattr(value, IDS[kind]) != asset_id:
            fail("STATE_UNAVAILABLE")
        if kind == "snapshot":
            if (row["source"] != asset_id or value.data_kind != self.data_kind
                    or digest(value.result.model_dump(mode="json")) != value.result_sha256):
                fail("STATE_UNAVAILABLE")
        else:
            nested = value.snapshot if kind == "analysis" else value.analysis
            source_kind = "snapshot" if kind == "analysis" else "analysis"
            source = self._read(con, owner, source_kind, row["source"])
            if nested != source:
                fail("STATE_UNAVAILABLE")
        return value

    def read(self, owner, kind, asset_id):
        self._owner(owner)
        with self._connection() as con:
            return self._read(con, owner, kind, asset_id)

    def _write(self, owner, kind, key, request, source, make):
        self._owner(owner)
        if not isinstance(key, str) or not re.fullmatch(r"[!-~]{1,100}", key):
            fail("INVALID_KEY", 428 if key is None else 400)
        request_hash = digest([kind, request])
        with self._connection() as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                prior = con.execute("SELECT * FROM receipts WHERE owner=? AND key=?", (owner, key)).fetchone()
                if prior:
                    if prior["request_hash"] != request_hash or prior["kind"] != kind:
                        fail("CONFLICT", 409)
                    result = self._read(con, owner, kind, prior["id"])
                else:
                    if con.execute("SELECT count(*) FROM receipts WHERE owner=?", (owner,)).fetchone()[0] >= 10000:
                        fail("STATE_LIMIT", 409)
                    existing = con.execute("SELECT id FROM assets WHERE owner=? AND kind=? AND source=?", (owner, kind, source)).fetchone()
                    if existing:
                        result = self._read(con, owner, kind, existing["id"])
                        if kind == "analysis" and result.title != request["title"]:
                            fail("CONFLICT", 409)
                    else:
                        if con.execute("SELECT count(*) FROM assets WHERE owner=? AND kind=?", (owner, kind)).fetchone()[0] >= LIMITS[kind]:
                            fail("STATE_LIMIT", 409)
                        asset_id = f"crm_{PREFIX[kind]}_{uuid4().hex}"
                        result = make(con, asset_id)
                        raw = result.model_dump(mode="json")
                        actual_source = source or asset_id
                        con.execute("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)",
                                    (owner, kind, asset_id, actual_source, canonical(raw), digest([owner, kind, asset_id, actual_source, raw])))
                    con.execute("INSERT INTO receipts VALUES (?, ?, ?, ?, ?)", (owner, key, request_hash, kind, getattr(result, IDS[kind])))
                con.execute("COMMIT")
                return result
            except BaseException:
                con.execute("ROLLBACK")
                raise

    def capture(self, owner, key, filters, compute):
        def make(con, asset_id):
            # Normalize request subclasses into the persisted public contract so
            # the creation receipt and a fresh-process read are identical.
            result = DashboardPurchases.model_validate(compute(filters).model_dump(mode="json"))
            return CrmSnapshot(snapshot_id=asset_id, captured_at=utcnow(), data_kind=self.data_kind,
                               result=result, result_sha256=digest(result.model_dump(mode="json")))
        return self._write(owner, "snapshot", key, filters.model_dump(mode="json"), None, make)

    def save(self, owner, key, request):
        return self._write(owner, "analysis", key, request.model_dump(), request.snapshot_id,
                           lambda con, asset_id: CrmAnalysis(analysis_id=asset_id, title=request.title, saved_at=utcnow(),
                                                             snapshot=self._read(con, owner, "snapshot", request.snapshot_id)))

    def pin(self, owner, key, request):
        return self._write(owner, "reference", key, request.model_dump(), request.analysis_id,
                           lambda con, asset_id: CrmCockpitReference(reference_id=asset_id, added_at=utcnow(),
                                                                    analysis=self._read(con, owner, "analysis", request.analysis_id)))

    def library(self, owner):
        self._owner(owner)
        with self._connection() as con:
            con.execute("BEGIN")
            fields = {}
            for kind in MODELS:
                rows = con.execute("SELECT id FROM assets WHERE owner=? AND kind=? ORDER BY rowid DESC LIMIT 21", (owner, kind)).fetchall()
                plural = "analyses" if kind == "analysis" else kind + "s"
                fields[plural] = [self._read(con, owner, kind, row["id"]) for row in rows[:20]]
                fields[plural + "_truncated"] = len(rows) > 20
            return CrmLibrary(data_kind=self.data_kind, **fields)
