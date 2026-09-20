"""Private file copies and immutable Office revisions in the existing local state service."""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import secrets
import sqlite3
import time
import zipfile
import zlib
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from backend.services.analytics.access import AnalyticsError

MAX_FILE_BYTES = 20 * 1024 * 1024
KINDS = {"html": "html", "htm": "html", "docx": "document", "doc": "document",
         "odt": "document", "rtf": "document", "xlsx": "spreadsheet", "xls": "spreadsheet",
         "ods": "spreadsheet", "csv": "spreadsheet", "pdf": "pdf"}


def fault(status, code, message):
    raise AnalyticsError(status, code, message)


def stamp():
    return int(time.time() * 1000)


def validate_file(filename, content):
    if (not isinstance(filename, str) or len(filename) > 240 or not filename.strip()
            or any(c in filename for c in "/\\\0\r\n")):
        fault(422, "INVALID_FILENAME", "文件名无效。")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in KINDS:
        fault(422, "UNSUPPORTED_FORMAT", "请选择 HTML、Word、Excel/CSV 或 PDF 文件。")
    if not content or len(content) > MAX_FILE_BYTES:
        fault(413, "FILE_SIZE", "文件不能为空，且不能超过 20 MB。")
    if ext in {"html", "htm", "csv"}:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeError:
            fault(422, "FILE_ENCODING", "请将文本文件保存为 UTF-8 后再添加。")
        if "\0" in text:
            fault(422, "INVALID_FILE", "文本文件包含无效字符。")
    elif ext in {"docx", "xlsx", "odt", "ods"}:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as package:
                infos = package.infolist()
                names = {item.filename for item in infos}
                expected = {"docx": "word/document.xml", "xlsx": "xl/workbook.xml", "odt": "content.xml", "ods": "content.xml"}[ext]
                if expected not in names or len(infos) > 10000 or sum(item.file_size for item in infos) > 200 * 1024 * 1024:
                    raise ValueError()
                if any("vbaproject" in name.lower() for name in names):
                    raise ValueError()
                # Central-directory names alone do not prove that the contents
                # can be read. Verify CRCs within the bounded expanded size.
                if any(item.flag_bits & 1 for item in infos) or package.testzip() is not None:
                    raise ValueError()
        except (ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, zlib.error):
            fault(422, "INVALID_OFFICE_FILE", "Office 文件结构无效、包含宏或解压后过大。")
    elif ext == "pdf" and not content.startswith(b"%PDF-"):
        fault(422, "INVALID_PDF", "文件不是有效的 PDF。")
    elif ext in {"doc", "xls"} and not content.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        fault(422, "INVALID_OFFICE_FILE", "文件格式与扩展名不符。")
    elif ext == "rtf" and not content.startswith(b"{\\rtf"):
        fault(422, "INVALID_OFFICE_FILE", "文件格式与扩展名不符。")
    return ext, KINDS[ext]


def _b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def sign_token(payload, secret):
    head = _b64(b'{"alg":"HS256","typ":"JWT"}')
    body = _b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    signature = _b64(hmac.digest(secret.encode(), f"{head}.{body}".encode(), "sha256"))
    return f"{head}.{body}.{signature}"


def verify_token(token, secret):
    try:
        head, body, signature = token.split(".")
        if json.loads(base64.urlsafe_b64decode(head + "=" * (-len(head) % 4))).get("alg") != "HS256":
            raise ValueError()
        expected = _b64(hmac.digest(secret.encode(), f"{head}.{body}".encode(), "sha256"))
        if not hmac.compare_digest(expected, signature):
            raise ValueError()
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if not isinstance(payload, dict) or ("exp" in payload and payload["exp"] < time.time()):
            raise ValueError()
        return payload
    except (ValueError, TypeError, AttributeError, KeyError):
        fault(401, "INVALID_OFFICE_TOKEN", "文档服务签名无效或已过期。")


class CockpitFileStore:
    def __init__(self, root: Path):
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = root / "files.sqlite3"
        with self.connect() as con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS cockpit_preferences (
                  owner TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS files (
                  id TEXT PRIMARY KEY, owner TEXT NOT NULL, filename TEXT NOT NULL,
                  kind TEXT NOT NULL, head INTEGER NOT NULL, created_ms INTEGER NOT NULL,
                  origin TEXT NOT NULL, upload_key TEXT NOT NULL, upload_hash TEXT NOT NULL,
                  UNIQUE(owner, upload_key));
                CREATE TABLE IF NOT EXISTS file_revisions (
                  file_id TEXT NOT NULL, version INTEGER NOT NULL, filename TEXT NOT NULL,
                  content BLOB NOT NULL, sha256 TEXT NOT NULL, created_ms INTEGER NOT NULL,
                  PRIMARY KEY(file_id,version));
                CREATE TABLE IF NOT EXISTS file_edits (
                  key TEXT PRIMARY KEY, file_id TEXT NOT NULL, owner TEXT NOT NULL,
                  base_version INTEGER NOT NULL, last_version INTEGER NOT NULL,
                  status TEXT NOT NULL, created_ms INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS file_save_receipts (
                  id TEXT PRIMARY KEY, edit_key TEXT NOT NULL, status TEXT NOT NULL,
                  version INTEGER, created_ms INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS file_edit_drafts (
                  edit_key TEXT PRIMARY KEY, filename TEXT NOT NULL, content BLOB NOT NULL,
                  updated_ms INTEGER NOT NULL);
            """)

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=10)
        con.row_factory = sqlite3.Row
        try:
            with con:
                yield con
        finally:
            con.close()

    @staticmethod
    def access(actor, write=False):
        needed = "dashboard:update" if write else "dashboard:read"
        if needed not in actor.capabilities:
            fault(403, "FORBIDDEN", "当前身份无权操作产物库。")

    def preferences(self, actor, change=None):
        """Per-user cabinet organization; never deletes source files or revisions."""
        self.access(actor, change is not None)
        with self.connect() as con:
            if change is not None:
                con.execute("BEGIN IMMEDIATE")
            row = con.execute("SELECT value FROM cockpit_preferences WHERE owner=?", (actor.actor_id,)).fetchone()
            value = json.loads(row[0]) if row else {"removed": [], "order": [], "rail_width": 248, "rail_layout": None}
            if change is None:
                return value
            if not isinstance(change, dict) or len(change) != 1:
                fault(422, "INVALID_PREFERENCE", "每次只调整一个产物设置。")
            key, data = next(iter(change.items()))
            def identity(item):
                return (isinstance(item, str) and 1 < len(item) <= 4608
                        and item.split(":", 1)[0] in {"file", "page", "board", "cabinet"}
                        and ":" in item and not any(c in item for c in "\0\r\n"))
            if key in {"remove", "restore"} and identity(data):
                value["removed"] = [item for item in value["removed"] if item != data]
                if key == "remove":
                    if len(value["removed"]) >= 5000:
                        fault(422, "PREFERENCE_LIMIT", "回收站已达上限，请先恢复部分产物。")
                    value["removed"].append(data)
            elif key == "order" and isinstance(data, list) and len(data) <= 5000 and all(identity(item) for item in data) and len(set(data)) == len(data):
                value["order"] = data
            elif key == "rail_width" and type(data) is int and 180 <= data <= 480:
                value["rail_width"] = data
            elif key == "rail_layout" and (data is None or isinstance(data, dict) and set(data) == {"x", "y", "width", "height"}
                    and all(type(v) is int for v in data.values())
                    and 0 <= data["x"] <= 20000 and 0 <= data["y"] <= 20000
                    and 180 <= data["width"] <= 480 and 240 <= data["height"] <= 1000):
                value["rail_layout"] = data
            else:
                fault(422, "INVALID_PREFERENCE", "产物设置无效。")
            con.execute("INSERT INTO cockpit_preferences VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value",
                        (actor.actor_id, json.dumps(value)))
            return value

    def row(self, con, actor, file_id):
        row = con.execute("SELECT * FROM files WHERE id=? AND owner=?", (file_id, actor.actor_id)).fetchone()
        if row is None:
            fault(404, "FILE_NOT_FOUND", "产物不存在或当前身份不可访问。")
        return row

    @staticmethod
    def metadata(con, row):
        rev = con.execute("SELECT length(content) AS size, sha256, created_ms FROM file_revisions WHERE file_id=? AND version=?", (row["id"], row["head"])).fetchone()
        return {"file_id": row["id"], "filename": row["filename"], "kind": row["kind"], "version": row["head"],
                "size": rev["size"], "sha256": rev["sha256"], "updated_at_ms": rev["created_ms"], "origin": json.loads(row["origin"])}

    def upload(self, actor, filename, content, key, origin=None):
        self.access(actor, True)
        _, kind = validate_file(filename, content)
        if not isinstance(key, str) or not 8 <= len(key) <= 200:
            fault(422, "IDEMPOTENCY_KEY_REQUIRED", "添加文件需要稳定的请求标识。")
        origin = origin or {"kind": "upload"}
        if (not isinstance(origin, dict) or origin.get("kind") not in {"upload", "session"}
                or set(origin) - {"kind", "session_id", "path", "session_title"}
                or any(not isinstance(value, str) or len(value) > 4096 for value in origin.values())):
            fault(422, "INVALID_ORIGIN", "文件来源无效。")
        digest = hashlib.sha256(content).hexdigest()
        fingerprint = hashlib.sha256(json.dumps([filename, digest, origin], sort_keys=True).encode()).hexdigest()
        with self.connect() as con:
            con.execute("BEGIN IMMEDIATE")
            prior = con.execute("SELECT * FROM files WHERE owner=? AND upload_key=?", (actor.actor_id, key)).fetchone()
            if prior:
                if prior["upload_hash"] != fingerprint:
                    fault(409, "UPLOAD_CONFLICT", "该请求标识已用于另一份文件。")
                return self.metadata(con, prior)
            file_id = "file_" + secrets.token_hex(16)
            con.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
                        (file_id, actor.actor_id, filename, kind, 1, stamp(), json.dumps(origin), key, fingerprint))
            con.execute("INSERT INTO file_revisions VALUES(?,?,?,?,?,?)", (file_id, 1, filename, content, digest, stamp()))
            return self.metadata(con, self.row(con, actor, file_id))

    def list(self, actor, offset=0):
        self.access(actor)
        if not isinstance(offset, int) or offset < 0:
            fault(422, "INVALID_OFFSET", "分页位置无效。")
        with self.connect() as con:
            rows = con.execute("SELECT * FROM files WHERE owner=? ORDER BY created_ms DESC,id LIMIT 101 OFFSET ?", (actor.actor_id, offset)).fetchall()
            return {"items": [self.metadata(con, row) for row in rows[:100]], "next_offset": offset + 100 if len(rows) > 100 else None}

    def get(self, actor, file_id):
        self.access(actor)
        with self.connect() as con:
            return self.metadata(con, self.row(con, actor, file_id))

    def content(self, actor, file_id, version=None):
        self.access(actor)
        with self.connect() as con:
            row = self.row(con, actor, file_id)
            rev = con.execute("SELECT * FROM file_revisions WHERE file_id=? AND version=?", (file_id, version or row["head"])).fetchone()
            if not rev:
                fault(404, "VERSION_NOT_FOUND", "文件版本不存在。")
            return rev["filename"], rev["content"]

    def begin_edit(self, actor, file_id):
        self.access(actor, True)
        with self.connect() as con:
            row = self.row(con, actor, file_id)
            if row["kind"] == "html":
                fault(422, "HTML_EDITOR", "HTML 请使用页面编辑器。")
            key = "edit_" + secrets.token_hex(20)
            con.execute("INSERT INTO file_edits VALUES(?,?,?,?,?,?,?)", (key, file_id, actor.actor_id, row["head"], row["head"], "OPEN", stamp()))
            return {**dict(con.execute("SELECT * FROM file_edits WHERE key=?", (key,)).fetchone()), "filename": row["filename"]}

    def edit(self, actor, key):
        self.access(actor)
        with self.connect() as con:
            row = con.execute("SELECT * FROM file_edits WHERE key=? AND owner=?", (key, actor.actor_id)).fetchone()
            if not row:
                fault(404, "EDIT_NOT_FOUND", "编辑会话不存在。")
            return dict(row)

    def cancel_edit(self, actor, key):
        self.access(actor, True)
        with self.connect() as con:
            con.execute("UPDATE file_edits SET status='CANCELLED' WHERE key=? AND owner=?", (key, actor.actor_id))
        return {"ok": True}

    def draft(self, actor, key):
        self.edit(actor, key)
        with self.connect() as con:
            row = con.execute("SELECT * FROM file_edit_drafts WHERE edit_key=?", (key,)).fetchone()
            return dict(row) if row else None

    def stage_office(self, actor, key, filename, content):
        self.access(actor, True)
        _, kind = validate_file(filename, content)
        edit = self.edit(actor, key)
        if edit["status"] != "OPEN":
            return
        if self.get(actor, edit["file_id"])["kind"] != kind:
            fault(409, "FILE_CONFLICT", "文档类型不匹配。")
        with self.connect() as con:
            con.execute("INSERT OR REPLACE INTO file_edit_drafts VALUES(?,?,?,?)", (key, filename, content, stamp()))

    def save_receipt(self, actor, key, receipt_id, create=False):
        if create:
            self.access(actor, True)
        edit = self.edit(actor, key)
        with self.connect() as con:
            if create:
                if edit["status"] != "OPEN":
                    fault(409, "EDIT_CLOSED", "编辑会话已关闭，请重新打开。")
                con.execute("INSERT OR IGNORE INTO file_save_receipts VALUES(?,?,?,NULL,?)", (receipt_id, key, "WAITING", stamp()))
            row = con.execute("SELECT * FROM file_save_receipts WHERE id=? AND edit_key=?", (receipt_id, key)).fetchone()
            if not row:
                fault(404, "RECEIPT_NOT_FOUND", "保存回执不存在。")
            return dict(row)

    def commit_office(self, actor, key, filename, content, receipt_id=None, final=False):
        self.access(actor, True)
        _, kind = validate_file(filename, content)
        digest = hashlib.sha256(content).hexdigest()
        with self.connect() as con:
            con.execute("BEGIN IMMEDIATE")
            edit = con.execute("SELECT * FROM file_edits WHERE key=? AND owner=?", (key, actor.actor_id)).fetchone()
            if not edit:
                fault(404, "EDIT_NOT_FOUND", "编辑会话不存在。")
            if edit["status"] == "CANCELLED":
                return {"discarded": True}
            if receipt_id is not None:
                receipt = con.execute("SELECT * FROM file_save_receipts WHERE id=? AND edit_key=?", (receipt_id, key)).fetchone()
                if not receipt:
                    fault(409, "RECEIPT_NOT_FOUND", "未发起该保存请求。")
                if receipt["status"] in {"FAILED", "CONFLICT"}:
                    return {receipt["status"].lower(): True}
                if receipt["status"] == "SAVED":
                    # An acknowledged request always refers to its original version,
                    # even after another save has advanced the head.
                    prior = con.execute("SELECT sha256,filename FROM file_revisions WHERE file_id=? AND version=?",
                                        (edit["file_id"], receipt["version"])).fetchone()
                    if not prior or prior["sha256"] != digest or prior["filename"] != filename:
                        fault(409, "RECEIPT_CONFLICT", "该回执已确认另一份内容，未重复保存。")
                    return {"version": receipt["version"]}
            row = self.row(con, actor, edit["file_id"])
            if row["head"] != edit["last_version"] or row["kind"] != kind:
                if receipt_id is not None:
                    # Durable, definitive rejection: polling clients can stop
                    # treating a known CAS conflict as an unknown save forever.
                    con.execute("UPDATE file_save_receipts SET status='CONFLICT' WHERE id=? AND edit_key=?",
                                (receipt_id, key))
                    return {"conflict": True}
                fault(409, "FILE_CONFLICT", "文件已有其他版本，当前修改未覆盖它。")
            old = con.execute("SELECT sha256 FROM file_revisions WHERE file_id=? AND version=?", (row["id"], row["head"])).fetchone()
            version = row["head"]
            if digest != old["sha256"]:
                if edit["status"] != "OPEN":
                    fault(409, "EDIT_CLOSED", "编辑会话已关闭。")
                version += 1
                con.execute("INSERT INTO file_revisions VALUES(?,?,?,?,?,?)", (row["id"], version, filename, content, digest, stamp()))
                con.execute("UPDATE files SET head=?,filename=? WHERE id=?", (version, filename, row["id"]))
            con.execute("UPDATE file_edits SET last_version=? WHERE key=?", (version, key))
            if receipt_id:
                con.execute("UPDATE file_save_receipts SET status='SAVED',version=? WHERE id=? AND edit_key=?", (version, receipt_id, key))
            return {"version": version}

    def fail_save(self, actor, key, receipt_id):
        """Only a signed, correlated Office failure closes a waiting receipt."""
        self.access(actor, True)
        with self.connect() as con:
            con.execute("BEGIN IMMEDIATE")
            edit = con.execute("SELECT status FROM file_edits WHERE key=? AND owner=?", (key, actor.actor_id)).fetchone()
            if not edit:
                fault(404, "EDIT_NOT_FOUND", "编辑会话不存在。")
            if edit["status"] != "OPEN":
                return
            receipt = con.execute("SELECT status FROM file_save_receipts WHERE id=? AND edit_key=?", (receipt_id, key)).fetchone()
            if not receipt:
                fault(409, "RECEIPT_NOT_FOUND", "未发起该保存请求。")
            if receipt["status"] == "WAITING":
                con.execute("UPDATE file_save_receipts SET status='FAILED' WHERE id=? AND edit_key=?", (receipt_id, key))


class OfficeSettings:
    def __init__(self, base, callback_base, secret):
        for origin in (base, callback_base):
            parsed = urlsplit(origin)
            if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "host.docker.internal"} or parsed.path not in {"", "/"} or parsed.username or parsed.query or parsed.fragment:
                raise ValueError("Office local integration requires explicit loopback/Docker origins")
        if len(secret) < 32:
            raise ValueError("Office requires a private JWT secret")
        self.base, self.callback_base, self.secret = base.rstrip("/"), callback_base.rstrip("/"), secret

    def capability(self, actor, key, purpose):
        return sign_token({"actor": actor.actor_id, "key": key, "purpose": purpose, "exp": int(time.time()) + 86400}, self.secret)

    def config(self, actor, edit):
        prefix = self.callback_base + "/api/v1/analytics/cockpit-files/office"
        ext = edit["filename"].rsplit(".", 1)[-1].lower()
        config = {
            "documentType": "cell" if KINDS[ext] == "spreadsheet" else "pdf" if ext == "pdf" else "word",
            "document": {"fileType": ext, "key": edit["key"], "title": edit["filename"],
                         "url": prefix + "/content?ticket=" + self.capability(actor, edit["key"], "read"),
                         "permissions": {"edit": True, "download": True, "print": True}},
            "editorConfig": {"mode": "edit", "lang": "zh-CN",
                             "callbackUrl": prefix + "/callback?ticket=" + self.capability(actor, edit["key"], "callback"),
                             "user": {"id": actor.actor_id, "name": "驾驶舱用户"},
                             # Editor Save/Ctrl+S syncs changes; the cabinet's
                             # explicit forcesave carries our receipt identity.
                             "customization": {"forcesave": False, "autosave": True, "compactHeader": True}},
            "height": "100%", "width": "100%",
        }
        return {"script_url": self.base + "/web-apps/apps/api/documents/api.js",
                "config": {**config, "token": sign_token(config, self.secret)}, "edit_key": edit["key"]}
