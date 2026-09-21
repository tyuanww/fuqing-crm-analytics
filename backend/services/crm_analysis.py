"""Private CRM aggregate assets. No B0 fixture state, credentials or raw rows."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import base64
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

from backend.contracts.crm_analysis import (
    CrmAnalysis, CrmAnalysisPage, CrmAnalysisSummary, CrmBoard, CrmBoardComponent,
    CrmBindCitations, CrmBoardPage, CrmBoardSummary, CrmBoardWrite, CrmCockpitReference,
    CrmKnowledgeCitation, CrmLibrary, CrmMetricValue, CrmPatchAnalysis, CrmSaveAnalysis,
    CrmShareGrant, CrmShareList, CrmSnapshot,
)
from backend.services.crm_document_acl import can_read_citations, share_citations_allowed
from backend.contracts.crm_dashboard import DashboardPurchases

APP_ID = 0x43524D41
MODELS = {"snapshot": CrmSnapshot, "analysis": CrmAnalysis, "reference": CrmCockpitReference, "board": CrmBoard}
IDS = {"snapshot": "snapshot_id", "analysis": "analysis_id", "reference": "reference_id", "board": "board_id"}
PREFIX = {"snapshot": "s", "analysis": "a", "reference": "r", "board": "b"}
LIMITS = {"snapshot": 2000, "analysis": 1000, "reference": 500, "board": 200}
OWNER = re.compile(r"[A-Za-z0-9_.@-]{1,64}")
MESSAGES = {
    "NOT_FOUND": "结果不存在或当前账号不可见。",
    "CONFLICT": "此请求已使用其他内容，或该结果已有不同标题的分析。",
    "VERSION_CONFLICT": "组板或分析已被更新，请刷新后基于最新版本继续。",
    "ACCOUNT_NOT_FOUND": "找不到该 CRM 账号，未建立分享。",
    "ACCESS_DENIED": "当前账号无权访问该资料，或分享范围大于来源文档权限。",
    "INVALID_BOARD": "组板内容无效：请检查指标来源、布局和展示属性。",
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


def encode_cursor(saved_at, asset_id):
    return base64.urlsafe_b64encode(f"{saved_at}|{asset_id}".encode()).decode().rstrip("=")


def decode_cursor(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        padded = value + "=" * (-len(value) % 4)
        saved_at, asset_id = base64.urlsafe_b64decode(padded.encode()).decode().split("|", 1)
        if not saved_at or not re.fullmatch(r"crm_[sarb]_[0-9a-f]{32}", asset_id):
            fail("NOT_FOUND", 404)
        return saved_at, asset_id
    except (ValueError, UnicodeDecodeError, OSError):
        fail("NOT_FOUND", 404)


def like_term(query):
    return "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def metric_value(snapshot, metric):
    result = snapshot.result
    if metric == "gsv":
        return CrmMetricValue(amount_fen=result.gsv_amount_fen)
    if metric == "aov":
        return CrmMetricValue(amount_fen=result.aov.amount_fen, denominator=result.aov.denominator, reason=result.aov.reason)
    if metric == "aus":
        return CrmMetricValue(amount_fen=result.aus.amount_fen, denominator=result.aus.denominator, reason=result.aus.reason)
    if metric == "orders":
        return CrmMetricValue(count=result.coverage.orders)
    return CrmMetricValue(count=result.coverage.buyers)


def known_crm_account(username):
    from backend.routers.auth import USERNAME_PATTERN, VALID_CREDENTIALS
    return bool(isinstance(username, str) and USERNAME_PATTERN.fullmatch(username) and username in VALID_CREDENTIALS)


class CrmAnalysisStore:
    """Reads resolve owner or current grants; facts stay server-owned."""

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
                        CREATE TABLE grants (
                            owner TEXT NOT NULL, analysis_id TEXT NOT NULL, grantee TEXT NOT NULL,
                            granted_at TEXT NOT NULL,
                            PRIMARY KEY(owner, analysis_id, grantee)
                        );
                        CREATE TABLE command_receipts (
                            owner TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
                            payload TEXT NOT NULL, PRIMARY KEY(owner, key)
                        );
                    """)
                    con.execute(f"PRAGMA application_id={APP_ID}")
                    con.execute("PRAGMA user_version=2")
                    con.executemany("INSERT INTO metadata VALUES (?, ?)", [("kind", "crm-analysis/v1"), ("data_kind", data_kind)])
                    con.execute("COMMIT")
            with self._connection():
                pass
        finally:
            os.close(fd)

    def _migrate(self, con):
        version = con.execute("PRAGMA user_version").fetchone()[0]
        if version == 1:
            con.execute("BEGIN IMMEDIATE")
            con.execute("""CREATE TABLE IF NOT EXISTS grants (
                owner TEXT NOT NULL, analysis_id TEXT NOT NULL, grantee TEXT NOT NULL,
                granted_at TEXT NOT NULL, PRIMARY KEY(owner, analysis_id, grantee))""")
            con.execute("""CREATE TABLE IF NOT EXISTS command_receipts (
                owner TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
                payload TEXT NOT NULL, PRIMARY KEY(owner, key))""")
            con.execute("PRAGMA user_version=2")
            con.execute("COMMIT")
            version = 2
        if version != 2:
            fail("STATE_UNAVAILABLE")

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
                if check:
                    if (con.execute("PRAGMA application_id").fetchone()[0] != APP_ID
                            or dict(con.execute("SELECT key,value FROM metadata")) != {"kind": "crm-analysis/v1", "data_kind": self.data_kind}):
                        fail("STATE_UNAVAILABLE")
                    self._migrate(con)
                yield con
            finally:
                con.close()
        except (OSError, sqlite3.DatabaseError, ValidationError, ValueError, KeyError, TypeError):
            fail("STATE_UNAVAILABLE")

    @staticmethod
    def _owner(owner):
        if not isinstance(owner, str) or not OWNER.fullmatch(owner):
            fail("AUTH_REQUIRED", 401)

    def _hydrate(self, con, owner, kind, asset_id):
        row = con.execute("SELECT * FROM assets WHERE owner=? AND kind=? AND id=?", (owner, kind, asset_id)).fetchone()
        if row is None:
            fail("NOT_FOUND", 404)
        raw = json.loads(row["payload"])
        if digest([owner, kind, asset_id, row["source"], raw]) != row["sha256"]:
            fail("STATE_UNAVAILABLE")
        value = MODELS[kind].model_validate(raw)
        if getattr(value, IDS[kind]) != asset_id:
            fail("STATE_UNAVAILABLE")
        if kind == "analysis" and any(not isinstance(item, CrmKnowledgeCitation) for item in value.knowledge_citations):
            fail("STATE_UNAVAILABLE")
        if kind == "snapshot":
            if (row["source"] != asset_id or value.data_kind != self.data_kind
                    or digest(value.result.model_dump(mode="json")) != value.result_sha256):
                fail("STATE_UNAVAILABLE")
        elif kind == "board":
            if row["source"] != asset_id:
                fail("STATE_UNAVAILABLE")
            for item in value.components:
                analysis = self._hydrate(con, owner, "analysis", item.analysis_id)
                if (analysis.snapshot.snapshot_id != item.snapshot_id
                        or analysis.snapshot.result_sha256 != item.result_sha256
                        or analysis.snapshot.result.filters != item.filters
                        or metric_value(analysis.snapshot, item.metric) != item.value):
                    fail("STATE_UNAVAILABLE")
        else:
            nested = value.snapshot if kind == "analysis" else value.analysis
            source_kind = "snapshot" if kind == "analysis" else "analysis"
            source = self._hydrate(con, owner, source_kind, row["source"])
            if nested != source:
                fail("STATE_UNAVAILABLE")
        return value

    def _locate(self, con, kind, asset_id):
        rows = con.execute("SELECT * FROM assets WHERE kind=? AND id=?", (kind, asset_id)).fetchall()
        if len(rows) != 1:
            fail("NOT_FOUND", 404)
        return rows[0]

    def _granted(self, con, owner, analysis_id, viewer):
        return con.execute("SELECT 1 FROM grants WHERE owner=? AND analysis_id=? AND grantee=?",
                           (owner, analysis_id, viewer)).fetchone() is not None

    @staticmethod
    def _citations_of(kind, value):
        if kind == "analysis":
            return value.knowledge_citations
        if kind == "reference":
            return value.analysis.knowledge_citations
        return []

    def _require_documents(self, username, citations, *, share=False, status=404):
        allowed = share_citations_allowed(username, citations) if share else can_read_citations(username, citations)
        if not allowed:
            fail("ACCESS_DENIED" if share else "NOT_FOUND", 403 if share else status)

    def _payload(self, kind, result):
        raw = result.model_dump(mode="json")
        if kind == "analysis" and not raw.get("knowledge_citations"):
            raw.pop("knowledge_citations", None)
        if kind == "reference":
            nested = raw.get("analysis")
            if isinstance(nested, dict) and not nested.get("knowledge_citations"):
                nested.pop("knowledge_citations", None)
        return raw

    def _guard_access(self, viewer, kind, value, con, owner, asset_id=None):
        if kind in {"analysis", "reference"}:
            self._require_documents(viewer, self._citations_of(kind, value))
            return
        if kind == "board":
            for item in value.components:
                analysis = self._hydrate(con, owner, "analysis", item.analysis_id)
                self._require_documents(viewer, analysis.knowledge_citations)
            return
        if kind == "snapshot" and viewer != owner:
            snapshot_id = asset_id or value.snapshot_id
            linked = con.execute(
                """SELECT a.owner, a.id FROM assets a WHERE a.kind='analysis' AND a.source=?
                   UNION SELECT a.owner, a.id FROM grants g JOIN assets a
                   ON a.owner=g.owner AND a.id=g.analysis_id AND a.kind='analysis'
                   WHERE g.grantee=? AND a.source=?""",
                (snapshot_id, viewer, snapshot_id)).fetchall()
            if not any(can_read_citations(viewer, self._hydrate(con, row["owner"], "analysis", row["id"]).knowledge_citations)
                       for row in linked):
                fail("NOT_FOUND", 404)

    def _visible(self, con, viewer, kind, asset_id):
        row = self._locate(con, kind, asset_id)
        owner = row["owner"]
        if owner == viewer:
            value = self._hydrate(con, owner, kind, asset_id)
        elif kind == "analysis" and self._granted(con, owner, asset_id, viewer):
            value = self._hydrate(con, owner, kind, asset_id)
        elif kind == "snapshot":
            linked = con.execute(
                """SELECT a.id FROM assets a WHERE a.owner=? AND a.kind='analysis' AND a.source=?
                   UNION SELECT g.analysis_id FROM grants g JOIN assets a
                   ON a.owner=g.owner AND a.id=g.analysis_id AND a.kind='analysis'
                   WHERE g.grantee=? AND a.source=?""",
                (viewer, asset_id, viewer, asset_id)).fetchone()
            if not (linked or owner == viewer):
                fail("NOT_FOUND", 404)
            value = self._hydrate(con, owner, kind, asset_id)
        else:
            fail("NOT_FOUND", 404)
        self._guard_access(viewer, kind, value, con, owner, asset_id)
        return value

    def read(self, owner, kind, asset_id):
        self._owner(owner)
        with self._connection() as con:
            return self._visible(con, owner, kind, asset_id)

    def _put(self, con, owner, kind, asset_id, source, result):
        raw = self._payload(kind, result)
        con.execute(
            "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner, kind, id) DO UPDATE SET payload=excluded.payload, sha256=excluded.sha256",
            (owner, kind, asset_id, source, canonical(raw), digest([owner, kind, asset_id, source, raw])))

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
                    result = self._hydrate(con, owner, kind, prior["id"])
                    self._guard_access(owner, kind, result, con, owner, prior["id"])
                else:
                    if con.execute("SELECT count(*) FROM receipts WHERE owner=?", (owner,)).fetchone()[0] >= 10000:
                        fail("STATE_LIMIT", 409)
                    existing = con.execute("SELECT id FROM assets WHERE owner=? AND kind=? AND source=?", (owner, kind, source)).fetchone()
                    if existing:
                        result = self._hydrate(con, owner, kind, existing["id"])
                        self._guard_access(owner, kind, result, con, owner, existing["id"])
                        if kind == "analysis" and (result.title != request["title"] or result.description != request.get("description", "")):
                            fail("CONFLICT", 409)
                    else:
                        if con.execute("SELECT count(*) FROM assets WHERE owner=? AND kind=?", (owner, kind)).fetchone()[0] >= LIMITS[kind]:
                            fail("STATE_LIMIT", 409)
                        asset_id = f"crm_{PREFIX[kind]}_{uuid4().hex}"
                        result = make(con, asset_id)
                        raw = self._payload(kind, result)
                        actual_source = source or asset_id
                        con.execute("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)",
                                    (owner, kind, asset_id, actual_source, canonical(raw), digest([owner, kind, asset_id, actual_source, raw])))
                    con.execute("INSERT INTO receipts VALUES (?, ?, ?, ?, ?)", (owner, key, request_hash, kind, getattr(result, IDS[kind])))
                con.execute("COMMIT")
                return result
            except BaseException:
                con.execute("ROLLBACK")
                raise

    def _command(self, owner, key, request, apply, replay=None):
        self._owner(owner)
        if not isinstance(key, str) or not re.fullmatch(r"[!-~]{1,100}", key):
            fail("INVALID_KEY", 428 if key is None else 400)
        request_hash = digest(request)
        with self._connection() as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                prior = con.execute("SELECT * FROM command_receipts WHERE owner=? AND key=?", (owner, key)).fetchone()
                if prior:
                    if prior["request_hash"] != request_hash:
                        fail("CONFLICT", 409)
                    result = replay(con) if replay else json.loads(prior["payload"])
                else:
                    if con.execute("SELECT count(*) FROM command_receipts WHERE owner=?", (owner,)).fetchone()[0] >= 10000:
                        fail("STATE_LIMIT", 409)
                    result = apply(con)
                    con.execute("INSERT INTO command_receipts VALUES (?, ?, ?, ?)",
                                (owner, key, request_hash, canonical(result)))
                con.execute("COMMIT")
                return result
            except BaseException:
                con.execute("ROLLBACK")
                raise

    def capture(self, owner, key, filters, compute):
        def make(con, asset_id):
            result = DashboardPurchases.model_validate(compute(filters).model_dump(mode="json"))
            return CrmSnapshot(snapshot_id=asset_id, captured_at=utcnow(), data_kind=self.data_kind,
                               result=result, result_sha256=digest(result.model_dump(mode="json")))
        return self._write(owner, "snapshot", key, filters.model_dump(mode="json"), None, make)

    def save(self, owner, key, request: CrmSaveAnalysis):
        return self._write(owner, "analysis", key, request.model_dump(), request.snapshot_id,
                           lambda con, asset_id: CrmAnalysis(
                               analysis_id=asset_id, title=request.title, description=request.description,
                               saved_at=utcnow(), updated_at=utcnow(), revision=1,
                               snapshot=self._hydrate(con, owner, "snapshot", request.snapshot_id)))

    def pin(self, owner, key, request):
        def make(con, asset_id):
            analysis = self._hydrate(con, owner, "analysis", request.analysis_id)
            self._require_documents(owner, analysis.knowledge_citations)
            return CrmCockpitReference(reference_id=asset_id, added_at=utcnow(), analysis=analysis)
        return self._write(owner, "reference", key, request.model_dump(), request.analysis_id, make)

    def bind_citations(self, owner, key, analysis_id, request: CrmBindCitations):
        citations = list(request.citations)

        def apply(con):
            analysis = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, citations, share=True)
            if analysis.knowledge_citations:
                if analysis.knowledge_citations == citations:
                    return analysis.model_dump(mode="json")
                fail("CONFLICT", 409)
            updated = analysis.model_copy(update={"knowledge_citations": citations})
            source = con.execute("SELECT source FROM assets WHERE owner=? AND kind='analysis' AND id=?",
                                 (owner, analysis_id)).fetchone()["source"]
            self._put(con, owner, "analysis", analysis_id, source, updated)
            for row in con.execute("SELECT grantee FROM grants WHERE owner=? AND analysis_id=?",
                                   (owner, analysis_id)).fetchall():
                if not share_citations_allowed(row["grantee"], citations):
                    con.execute("DELETE FROM grants WHERE owner=? AND analysis_id=? AND grantee=?",
                                (owner, analysis_id, row["grantee"]))
            for row in con.execute("SELECT id, payload FROM assets WHERE owner=? AND kind='reference' AND source=?",
                                   (owner, analysis_id)).fetchall():
                raw = json.loads(row["payload"])
                pinned = CrmCockpitReference(reference_id=raw["reference_id"], added_at=raw["added_at"], analysis=updated)
                self._put(con, owner, "reference", row["id"], analysis_id, pinned)
            return updated.model_dump(mode="json")

        def replay(con):
            analysis = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, analysis.knowledge_citations, share=True)
            if analysis.knowledge_citations != citations:
                fail("CONFLICT", 409)
            return analysis.model_dump(mode="json")

        return CrmAnalysis.model_validate(self._command(
            owner, key, {"op": "bind_citations", "analysis_id": analysis_id,
                         "citations": [item.model_dump(mode="json") for item in citations]},
            apply, replay))

    def patch_analysis(self, owner, key, analysis_id, request: CrmPatchAnalysis):
        def apply(con):
            row = con.execute("SELECT id FROM assets WHERE owner=? AND kind='analysis' AND id=?", (owner, analysis_id)).fetchone()
            if row is None:
                fail("NOT_FOUND", 404)
            current = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, current.knowledge_citations)
            if current.revision != request.base_revision:
                fail("VERSION_CONFLICT", 409)
            if current.title == request.title and current.description == request.description:
                return current.model_dump(mode="json")
            updated = current.model_copy(update={"title": request.title, "description": request.description,
                                                 "revision": current.revision + 1, "updated_at": utcnow()})
            source = con.execute("SELECT source FROM assets WHERE owner=? AND kind='analysis' AND id=?",
                                 (owner, analysis_id)).fetchone()["source"]
            self._put(con, owner, "analysis", analysis_id, source, updated)
            for row in con.execute("SELECT id, payload FROM assets WHERE owner=? AND kind='reference' AND source=?",
                                   (owner, analysis_id)).fetchall():
                raw = json.loads(row["payload"])
                pinned = CrmCockpitReference(reference_id=raw["reference_id"], added_at=raw["added_at"], analysis=updated)
                self._put(con, owner, "reference", row["id"], analysis_id, pinned)
            return updated.model_dump(mode="json")
        def replay(con):
            current = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, current.knowledge_citations)
            return current.model_dump(mode="json")
        return CrmAnalysis.model_validate(self._command(owner, key, request.model_dump() | {"analysis_id": analysis_id}, apply, replay))

    def search_analyses(self, viewer, q="", cursor=None, limit=20, scope="owned"):
        self._owner(viewer)
        if not isinstance(q, str) or len(q) > 80 or any(ord(char) < 32 or ord(char) == 127 for char in q):
            fail("NOT_FOUND", 404)
        if scope not in {"owned", "shared", "all"} or not isinstance(limit, int) or not 1 <= limit <= 20:
            fail("NOT_FOUND", 404)
        after = decode_cursor(cursor)
        query = q.strip()
        with self._connection() as con:
            con.execute("BEGIN")
            if scope == "owned":
                access_sql, access_params = "a.owner = ?", [viewer]
            elif scope == "shared":
                access_sql, access_params = "g.grantee = ?", [viewer]
            else:
                access_sql, access_params = "(a.owner = ? OR g.grantee = ?)", [viewer, viewer]
            where = [access_sql]
            params = access_params
            if query:
                if re.fullmatch(r"crm_[sa]_[0-9a-f]{32}", query):
                    where.append("(a.id = ? OR json_extract(a.payload, '$.snapshot.snapshot_id') = ?)")
                    params.extend([query, query])
                else:
                    term = like_term(query)
                    where.append("(json_extract(a.payload, '$.title') LIKE ? ESCAPE '\\' OR ifnull(json_extract(a.payload, '$.description'), '') LIKE ? ESCAPE '\\')")
                    params.extend([term, term])
            if after:
                where.append("(json_extract(a.payload, '$.saved_at'), a.id) < (?, ?)")
                params.extend(after)
            sql = f"""SELECT DISTINCT a.owner, a.id FROM assets a
                      LEFT JOIN grants g ON g.owner = a.owner AND g.analysis_id = a.id
                      WHERE a.kind = 'analysis' AND {' AND '.join(where)}
                      ORDER BY json_extract(a.payload, '$.saved_at') DESC, a.id DESC LIMIT ?"""
            rows = con.execute(sql, [*params, limit + 1]).fetchall()
            items = []
            for row in rows[:limit]:
                analysis = self._hydrate(con, row["owner"], "analysis", row["id"])
                if not can_read_citations(viewer, analysis.knowledge_citations):
                    continue
                items.append(CrmAnalysisSummary(
                    analysis_id=analysis.analysis_id, title=analysis.title, description=analysis.description,
                    saved_at=analysis.saved_at, updated_at=analysis.updated_at or analysis.saved_at,
                    revision=analysis.revision, snapshot_id=analysis.snapshot.snapshot_id,
                    filters=analysis.snapshot.result.filters,
                    access="owner" if row["owner"] == viewer else "shared"))
            next_cursor = None
            if len(rows) > limit and items:
                last = items[-1]
                next_cursor = encode_cursor(last.model_dump(mode="json")["saved_at"], last.analysis_id)
            return CrmAnalysisPage(data_kind=self.data_kind, items=items, next_cursor=next_cursor)

    def share(self, owner, key, analysis_id, grantee, *, known=known_crm_account):
        if grantee == owner:
            fail("CONFLICT", 409)
        if not known(grantee):
            fail("ACCOUNT_NOT_FOUND", 404)

        def apply(con):
            analysis = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, analysis.knowledge_citations)
            self._require_documents(grantee, analysis.knowledge_citations, share=True)
            existing = con.execute("SELECT granted_at FROM grants WHERE owner=? AND analysis_id=? AND grantee=?",
                                   (owner, analysis_id, grantee)).fetchone()
            if existing:
                return CrmShareList(analysis_id=analysis.analysis_id, grants=self._grants(con, owner, analysis_id)).model_dump(mode="json")
            if con.execute("SELECT count(*) FROM grants WHERE owner=? AND analysis_id=?", (owner, analysis_id)).fetchone()[0] >= 20:
                fail("STATE_LIMIT", 409)
            con.execute("INSERT INTO grants VALUES (?, ?, ?, ?)", (owner, analysis_id, grantee, utcnow().isoformat()))
            return CrmShareList(analysis_id=analysis.analysis_id, grants=self._grants(con, owner, analysis_id)).model_dump(mode="json")
        def replay(con):
            analysis = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, analysis.knowledge_citations)
            self._require_documents(grantee, analysis.knowledge_citations, share=True)
            return CrmShareList(analysis_id=analysis.analysis_id,
                                grants=self._grants(con, owner, analysis_id)).model_dump(mode="json")
        return CrmShareList.model_validate(self._command(owner, key, {"op": "share", "analysis_id": analysis_id, "username": grantee}, apply, replay))

    def unshare(self, owner, key, analysis_id, grantee):
        def apply(con):
            analysis = self._hydrate(con, owner, "analysis", analysis_id)
            con.execute("DELETE FROM grants WHERE owner=? AND analysis_id=? AND grantee=?", (owner, analysis_id, grantee))
            return CrmShareList(analysis_id=analysis.analysis_id, grants=self._grants(con, owner, analysis_id)).model_dump(mode="json")
        def replay(con):
            return CrmShareList(analysis_id=self._hydrate(con, owner, "analysis", analysis_id).analysis_id,
                                grants=self._grants(con, owner, analysis_id)).model_dump(mode="json")
        return CrmShareList.model_validate(self._command(owner, key, {"op": "unshare", "analysis_id": analysis_id, "username": grantee}, apply, replay))

    def _grants(self, con, owner, analysis_id):
        rows = con.execute("SELECT grantee, granted_at FROM grants WHERE owner=? AND analysis_id=? ORDER BY granted_at, grantee",
                           (owner, analysis_id)).fetchall()
        return [CrmShareGrant(username=row["grantee"], granted_at=row["granted_at"]) for row in rows]

    def list_shares(self, owner, analysis_id):
        self._owner(owner)
        with self._connection() as con:
            analysis = self._hydrate(con, owner, "analysis", analysis_id)
            self._require_documents(owner, analysis.knowledge_citations)
            return CrmShareList(analysis_id=analysis.analysis_id, grants=self._grants(con, owner, analysis_id))

    def _resolve_board(self, con, owner, board_id, request: CrmBoardWrite, revision, saved_at, updated_at):
        components = []
        for draft in request.components:
            analysis = self._hydrate(con, owner, "analysis", draft.analysis_id)
            self._require_documents(owner, analysis.knowledge_citations)
            if analysis.snapshot.snapshot_id != draft.snapshot_id:
                fail("INVALID_BOARD", 422)
            snapshot = analysis.snapshot
            components.append(CrmBoardComponent(
                **draft.model_dump(),
                filters=snapshot.result.filters,
                metric_version="dashboard-gsv-purchases/v1",
                value=metric_value(snapshot, draft.metric),
                result_sha256=snapshot.result_sha256,
            ))
        return CrmBoard(board_id=board_id, title=request.title, description=request.description,
                        saved_at=saved_at, updated_at=updated_at, revision=revision, components=components)

    def save_board(self, owner, key, request: CrmBoardWrite):
        return self._write(owner, "board", key, request.model_dump(), None,
                           lambda con, asset_id: self._resolve_board(con, owner, asset_id, request, 1, utcnow(), utcnow()))

    def patch_board(self, owner, key, board_id, request):
        def apply(con):
            current = self._hydrate(con, owner, "board", board_id)
            self._guard_access(owner, "board", current, con, owner)
            if current.revision != request.base_revision:
                fail("VERSION_CONFLICT", 409)
            draft = CrmBoardWrite(title=request.title, description=request.description, components=request.components)
            resolved = self._resolve_board(con, owner, board_id, draft, current.revision, current.saved_at, current.updated_at)
            if resolved.title == current.title and resolved.description == current.description and resolved.components == current.components:
                return current.model_dump(mode="json")
            updated = resolved.model_copy(update={"revision": current.revision + 1, "updated_at": utcnow()})
            source = con.execute("SELECT source FROM assets WHERE owner=? AND kind='board' AND id=?", (owner, board_id)).fetchone()["source"]
            self._put(con, owner, "board", board_id, source, updated)
            return updated.model_dump(mode="json")
        def replay(con):
            current = self._hydrate(con, owner, "board", board_id)
            self._guard_access(owner, "board", current, con, owner)
            return current.model_dump(mode="json")
        return CrmBoard.model_validate(self._command(owner, key, request.model_dump() | {"board_id": board_id}, apply, replay))

    def search_boards(self, owner, q="", cursor=None, limit=20):
        self._owner(owner)
        if not isinstance(q, str) or len(q) > 80 or any(ord(char) < 32 or ord(char) == 127 for char in q):
            fail("NOT_FOUND", 404)
        if not isinstance(limit, int) or not 1 <= limit <= 20:
            fail("NOT_FOUND", 404)
        after = decode_cursor(cursor)
        query = q.strip()
        with self._connection() as con:
            con.execute("BEGIN")
            where = ["owner=?", "kind='board'"]
            params = [owner]
            if query:
                if re.fullmatch(r"crm_b_[0-9a-f]{32}", query):
                    where.append("id=?")
                    params.append(query)
                else:
                    term = like_term(query)
                    where.append("(json_extract(payload, '$.title') LIKE ? ESCAPE '\\' OR ifnull(json_extract(payload, '$.description'), '') LIKE ? ESCAPE '\\')")
                    params.extend([term, term])
            if after:
                where.append("(json_extract(payload, '$.saved_at'), id) < (?, ?)")
                params.extend(after)
            rows = con.execute(
                f"SELECT id FROM assets WHERE {' AND '.join(where)} ORDER BY json_extract(payload, '$.saved_at') DESC, id DESC LIMIT ?",
                [*params, limit + 1]).fetchall()
            items = []
            for row in rows[:limit]:
                board = self._hydrate(con, owner, "board", row["id"])
                blocked = False
                for item in board.components:
                    analysis = self._hydrate(con, owner, "analysis", item.analysis_id)
                    if not can_read_citations(owner, analysis.knowledge_citations):
                        blocked = True
                        break
                if blocked:
                    continue
                items.append(CrmBoardSummary(
                    board_id=board.board_id, title=board.title, description=board.description,
                    saved_at=board.saved_at, updated_at=board.updated_at, revision=board.revision,
                    component_count=len(board.components)))
            next_cursor = encode_cursor(items[-1].model_dump(mode="json")["saved_at"], items[-1].board_id) if len(rows) > limit and items else None
            return CrmBoardPage(data_kind=self.data_kind, items=items, next_cursor=next_cursor)

    def library(self, owner):
        self._owner(owner)
        with self._connection() as con:
            con.execute("BEGIN")
            fields = {}
            for kind in ("snapshot", "analysis", "reference"):
                rows = con.execute("SELECT id FROM assets WHERE owner=? AND kind=? ORDER BY rowid DESC LIMIT 21", (owner, kind)).fetchall()
                plural = "analyses" if kind == "analysis" else kind + "s"
                values = []
                for row in rows[:20]:
                    item = self._hydrate(con, owner, kind, row["id"])
                    citations = self._citations_of(kind, item) if kind in {"analysis", "reference"} else []
                    if kind in {"analysis", "reference"} and not can_read_citations(owner, citations):
                        continue
                    values.append(item)
                fields[plural] = values
                fields[plural + "_truncated"] = len(rows) > 20
            return CrmLibrary(data_kind=self.data_kind, **fields)
