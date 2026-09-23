"""Durable candidate artifact inbox for the plugin-owned cockpit.

Artifacts are intentionally kept separate from page_documents.  Intake is
idempotent and only records a candidate; the page store is changed only after
the user confirms a preview and the client links the resulting page id.
"""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time
from uuid import uuid4

from backend.contracts.page_documents import PagePackage, is_package_too_large
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, require
from backend.services.analytics.first_purchase.asset_state import initialize_sqlite
from backend.contracts.competition_computed import DATA_SCOPE


PREFIX = "/api/v1/analytics/cockpit-artifacts"
UNAVAILABLE = "产物收件箱暂不可用，候选产物未被改变。"
SOURCES = {"page_package", "native_present", "workspace_file"}
STATUSES = {"RECEIVED", "PREVIEWABLE", "SAVED", "DISMISSED"}
DDL = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE artifacts (
    owner TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    source TEXT NOT NULL,
    session_id TEXT NOT NULL,
    request_id TEXT,
    call_id TEXT,
    title TEXT NOT NULL,
    path TEXT,
    package TEXT,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    page_id TEXT,
    created_ms INTEGER NOT NULL,
    updated_ms INTEGER NOT NULL,
    PRIMARY KEY(owner, artifact_id),
    UNIQUE(owner, source, session_id, request_id, call_id, path, content_hash)
);
CREATE INDEX artifacts_owner_status ON artifacts(owner, status, updated_ms DESC);
"""


def fault(status: int, code: str, message: str) -> None:
    raise AnalyticsError(status, code, message)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class ArtifactInboxStore:
    def __init__(self, directory: Path, *, clock=_now_ms):
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
        self.path = directory.resolve() / "artifact_inbox.sqlite3"
        self.clock = clock
        initialize_sqlite(directory, self.path, application_id=1804289394,
                          schema_version=1, kind="cockpit_artifact_inbox",
                          ddl=DDL, unavailable=UNAVAILABLE)

    @contextmanager
    def _connect(self, *, write=False):
        try:
            con = sqlite3.connect(self.path, timeout=10)
            con.row_factory = sqlite3.Row
            try:
                if write:
                    con.execute("BEGIN IMMEDIATE")
                yield con
                con.commit()
            finally:
                con.close()
        except sqlite3.DatabaseError as error:
            raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True) from error

    @staticmethod
    def _access(actor: AnalyticsPrincipal, *, write=False) -> None:
        require(actor, "dashboard:update" if write else "dashboard:read", data_scope=DATA_SCOPE)

    @staticmethod
    def _row(row, *, include_package=True):
        if row is None:
            return None
        result = {
            "artifact_id": row["artifact_id"], "source": row["source"],
            "session_id": row["session_id"], "request_id": row["request_id"],
            "call_id": row["call_id"], "title": row["title"], "path": row["path"],
            "content_hash": row["content_hash"],
            "status": row["status"], "page_id": row["page_id"],
            "created_at": row["created_ms"], "updated_at": row["updated_ms"],
            "created_at_ms": row["created_ms"], "updated_at_ms": row["updated_ms"],
        }
        if include_package:
            result["package"] = json.loads(row["package"]) if row["package"] else None
        return result

    @staticmethod
    def _validate(body):
        if not isinstance(body, dict):
            fault(422, "INVALID_ARTIFACT", "产物回执必须是对象。")
        source = body.get("source")
        if source not in SOURCES:
            fault(422, "INVALID_ARTIFACT", "产物来源不受支持。")
        session_id = body.get("session_id")
        if not isinstance(session_id, str) or not session_id or len(session_id) > 128:
            fault(422, "INVALID_ARTIFACT", "产物来源会话无效。")
        title = body.get("title") or "未命名产物"
        if not isinstance(title, str) or not title.strip() or len(title) > 160:
            fault(422, "INVALID_ARTIFACT", "产物标题无效。")
        path = body.get("path")
        if path is not None:
            path_value = path.replace("\\", "/") if isinstance(path, str) else path
            parts = path_value.split("/") if isinstance(path_value, str) else []
            if (not isinstance(path_value, str) or not path_value or len(path_value) > 512
                    or path_value.startswith("/") or path_value.startswith("~")
                    or re.match(r"^[A-Za-z]:/", path_value)
                    or "://" in path_value or any(part in {"", ".", ".."} for part in parts)):
                fault(422, "INVALID_ARTIFACT", "产物路径必须是安全的工作区相对路径。")
            path = path_value
        if source in {"workspace_file", "native_present"} and path is None:
            fault(422, "INVALID_ARTIFACT", "工作区产物必须包含来源路径。")
        for key in ("request_id", "call_id"):
            value = body.get(key)
            if value is not None and (not isinstance(value, str) or not value or len(value) > 256):
                fault(422, "INVALID_ARTIFACT", f"{key} 无效。")
        package = body.get("package")
        if package is not None:
            try:
                package = PagePackage.model_validate(package).model_dump(mode="json")
            except Exception as error:
                if is_package_too_large(error):
                    fault(413, "PACKAGE_TOO_LARGE", "页面源码包超过大小上限。")
                fault(422, "INVALID_ARTIFACT", "页面源码包不符合 free-page/v1 合同。")
        if source == "page_package" and package is None:
            fault(422, "INVALID_ARTIFACT", "页面源码包来源必须包含 package。")
        supplied_digest = body.get("content_hash")
        if source in {"native_present", "workspace_file"} and not supplied_digest:
            fault(422, "CONTENT_HASH_REQUIRED", "工作区产物必须提供内容哈希。")
        expected_digest = _digest(package) if source == "page_package" else None
        if source == "page_package" and supplied_digest is not None and supplied_digest != expected_digest:
            fault(422, "CONTENT_HASH_MISMATCH", "页面源码包内容哈希与回执不一致。")
        digest = expected_digest or supplied_digest
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            fault(422, "INVALID_ARTIFACT", "content_hash 无效。")
        return {"source": source, "session_id": session_id, "request_id": body.get("request_id"),
                "call_id": body.get("call_id"), "title": title.strip(), "path": path,
                "package": package, "content_hash": digest}

    def intake(self, actor: AnalyticsPrincipal, body):
        self._access(actor, write=True)
        data = self._validate(body)
        now = self.clock()
        with self._connect(write=True) as con:
            # The source-specific identity is deliberately narrower than the
            # storage UNIQUE constraint: a page package is identified by the
            # native request and hash, while a workspace file is identified by
            # its session/path and hash.  This keeps retries idempotent even if
            # a host replays a receipt with a different display session.
            if data["source"] == "page_package" and data["request_id"] is not None:
                where = "owner=? AND source=? AND request_id=? AND content_hash=?"
                values = [actor.actor_id, data["source"], data["request_id"], data["content_hash"]]
            elif data["source"] in {"workspace_file", "native_present"} and data["path"] is not None:
                # A native present and a later workspace scan can describe the
                # same physical file. They share one receipt identity even
                # though the source label is retained from the first intake.
                where = "owner=? AND source IN (?, ?) AND session_id=? AND path=? AND content_hash=?"
                values = [actor.actor_id, "workspace_file", "native_present", data["session_id"], data["path"], data["content_hash"]]
            else:
                where = "owner=? AND source=? AND session_id=? AND content_hash=?"
                values = [actor.actor_id, data["source"], data["session_id"], data["content_hash"]]
                if data["call_id"] is not None:
                    where += " AND call_id=?"
                    values.append(data["call_id"])
                elif data["path"] is not None:
                    where += " AND path=?"
                    values.append(data["path"])
            row = con.execute(f"SELECT * FROM artifacts WHERE {where} LIMIT 1", values).fetchone()
            if row is not None:
                return {**self._row(row), "idempotent": True}
            artifact_id = "artifact_" + uuid4().hex
            con.execute(
                "INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (actor.actor_id, artifact_id, data["source"], data["session_id"], data["request_id"],
                 data["call_id"], data["title"], data["path"],
                 json.dumps(data["package"], ensure_ascii=False, separators=(",", ":")) if data["package"] else None,
                 data["content_hash"], "PREVIEWABLE" if data["package"] else "RECEIVED", None, now, now),
            )
            return {**self._row(con.execute("SELECT * FROM artifacts WHERE owner=? AND artifact_id=?", (actor.actor_id, artifact_id)).fetchone()), "idempotent": False}

    def list(self, actor: AnalyticsPrincipal, *, status=None, limit=100, offset=0):
        self._access(actor)
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or not 0 <= offset <= 1000000:
            fault(422, "INVALID_PAGE", "产物列表分页参数无效。")
        if status is not None and status not in STATUSES:
            fault(422, "INVALID_ARTIFACT", "产物状态无效。")
        with self._connect() as con:
            if status:
                rows = con.execute("SELECT * FROM artifacts WHERE owner=? AND status=? ORDER BY updated_ms DESC LIMIT ? OFFSET ?", (actor.actor_id, status, limit + 1, offset)).fetchall()
            else:
                rows = con.execute("SELECT * FROM artifacts WHERE owner=? AND status<>? ORDER BY updated_ms DESC LIMIT ? OFFSET ?", (actor.actor_id, "DISMISSED", limit + 1, offset)).fetchall()
            has_more = len(rows) > limit
            rows = rows[:limit]
            return {"items": [self._row(row, include_package=False) for row in rows],
                    "next_offset": offset + limit if has_more else None}

    def get(self, actor: AnalyticsPrincipal, artifact_id: str):
        self._access(actor)
        with self._connect() as con:
            row = con.execute("SELECT * FROM artifacts WHERE owner=? AND artifact_id=?", (actor.actor_id, artifact_id)).fetchone()
            if row is None:
                fault(404, "NOT_FOUND", "产物不存在或当前身份不可访问。")
            return self._row(row, include_package=True)

    def confirm(self, actor: AnalyticsPrincipal, artifact_id: str, page_id: str, page_store=None):
        self._access(actor, write=True)
        if not isinstance(page_id, str) or not page_id or len(page_id) > 128:
            fault(422, "INVALID_ARTIFACT", "页面标识无效。")
        with self._connect(write=True) as con:
            row = con.execute("SELECT * FROM artifacts WHERE owner=? AND artifact_id=?", (actor.actor_id, artifact_id)).fetchone()
            if row is None:
                fault(404, "NOT_FOUND", "产物不存在或当前身份不可访问。")
            if row["status"] == "DISMISSED":
                fault(409, "ARTIFACT_DISMISSED", "产物已被放弃。")
            if row["status"] == "SAVED":
                if row["page_id"] == page_id:
                    return self._row(row, include_package=True)
                fault(409, "ARTIFACT_ALREADY_LINKED", "产物已经关联其他正式页面。")
            if page_store is not None:
                # A receipt may only be linked to the page produced from the
                # same source. This prevents a caller from attaching an
                # arbitrary page owned by the same actor.
                page = page_store.get(actor, page_id).get("spec", {})
                if page.get("session_id") != row["session_id"]:
                    fault(409, "ARTIFACT_SOURCE_MISMATCH", "正式页面来源会话与产物不一致。")
                if row["source"] == "page_package":
                    if _digest(page.get("package")) != row["content_hash"]:
                        fault(409, "ARTIFACT_SOURCE_MISMATCH", "正式页面源码与产物回执不一致。")
                elif row["path"] and page.get("origin_path") != row["path"]:
                    fault(409, "ARTIFACT_SOURCE_MISMATCH", "正式页面来源路径与产物不一致。")
                elif page.get("origin_content_hash") != row["content_hash"]:
                    fault(409, "ARTIFACT_SOURCE_MISMATCH", "正式页面来源内容已变化，请重新登记产物。")
            con.execute("UPDATE artifacts SET status='SAVED', page_id=?, updated_ms=? WHERE owner=? AND artifact_id=?", (page_id, self.clock(), actor.actor_id, artifact_id))
            return self._row(con.execute("SELECT * FROM artifacts WHERE owner=? AND artifact_id=?", (actor.actor_id, artifact_id)).fetchone(), include_package=True)

    def dismiss(self, actor: AnalyticsPrincipal, artifact_id: str):
        self._access(actor, write=True)
        with self._connect(write=True) as con:
            row = con.execute("SELECT * FROM artifacts WHERE owner=? AND artifact_id=?", (actor.actor_id, artifact_id)).fetchone()
            if row is None:
                fault(404, "NOT_FOUND", "产物不存在或当前身份不可访问。")
            if row["status"] == "SAVED":
                fault(409, "ARTIFACT_ALREADY_SAVED", "已保存产物不能丢弃。")
            if row["status"] == "DISMISSED":
                return self._row(row, include_package=True)
            con.execute("UPDATE artifacts SET status='DISMISSED', updated_ms=? WHERE owner=? AND artifact_id=?", (self.clock(), actor.actor_id, artifact_id))
            return self._row(con.execute("SELECT * FROM artifacts WHERE owner=? AND artifact_id=?", (actor.actor_id, artifact_id)).fetchone(), include_package=True)
