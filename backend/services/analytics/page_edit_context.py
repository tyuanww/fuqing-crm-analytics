"""Server-owned free-page edit context.

The native conversation receives only a context id. Capabilities are computed
again when a patch arrives. Operations and contexts are parsed only by the
free-page-edit/v1 contract. There is no fallback schema.

VERSION_CONFLICT and HASH_MISMATCH drop the old context so the caller must
select again. Confirmed page revisions stay append-only; this module does not
rewrite them and does not merge concurrent editors.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Callable
from uuid import uuid4

from pydantic import ValidationError

from backend.contracts.competition_computed import DATA_SCOPE
from backend.contracts.page_documents import (
    HTML_MAX_CHARS, PACKAGE_MAX_BYTES, STYLE_MAX_CHARS, PagePatchPreview, is_package_too_large,
)
from backend.services.analytics.access import AnalyticsError, require
from backend.services.analytics.first_purchase.asset_state import (
    connect, initialize_sqlite, now_ms, transaction, validate_key,
)

UNAVAILABLE = "编辑上下文暂不可用，已保存页面版本未被本次操作替换。"
CONTEXT_SCHEMA = "free-page-edit-context/v1"
IDENTITY = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
CHANNELS = {"presentation", "source", "logic"}
CHANNEL_CAPABILITY = {
    "presentation": "edit:presentation",
    "source": "edit:source",
    "logic": "edit:logic",
}
RECOVERY = "page-edit:redownload,reselect,reapply"
DANGEROUS = re.compile(
    r"<\s*(script|iframe|object|embed)\b|javascript\s*:|vbscript\s*:|\bon[a-z]+\s*=|"
    r"<\s*meta\b[^>]*http-equiv|<\s*link\b[^>]*rel\s*=\s*[\"']?import|eval\s*\(|"
    r"new\s+Function|document\s*\.\s*(write|cookie)\b|expression\s*\(",
    re.IGNORECASE,
)
START_TAG = re.compile(r"<([A-Za-z][\w:-]*)(\s[^>]*?)?(/?)>")
NODE_ATTR = re.compile(r"data-shine-node\s*=\s*([\"'])([^\"']+)\1", re.IGNORECASE)
REGION_ATTR = re.compile(r"data-shine-region\s*=\s*([\"'])([^\"']+)\1", re.IGNORECASE)
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
OVERLAY_KEYS = {"text", "style", "attributes"}
STYLE_KEY = re.compile(r"^[a-z-]{1,40}$")
ATTR_KEY = re.compile(r"^[A-Za-z_:][\w:.-]{0,40}$")
DDL = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE edit_contexts (
    context_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    expires_ms INTEGER NOT NULL,
    body TEXT NOT NULL
);
CREATE TABLE edit_previews (
    owner TEXT NOT NULL,
    preview_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    status TEXT NOT NULL,
    page_preview_id TEXT,
    body TEXT NOT NULL,
    PRIMARY KEY(owner, preview_id)
);
CREATE TABLE idempotency (
    owner TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    context_id TEXT NOT NULL,
    preview_id TEXT,
    digest TEXT NOT NULL,
    acked INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY(owner, kind, key)
);
CREATE TABLE presentation_overlays (
    owner TEXT NOT NULL,
    page_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY(owner, page_id, version)
);
"""


def t1_contract_ready() -> bool:
    from backend.contracts import page_documents as contracts
    return all(hasattr(contracts, name) for name in (
        "parse_node_ref", "parse_edit_operation", "parse_edit_context", "NodeRef", "EditOperation", "EditContext",
    ))


def package_source_hash(html: str, css: str = "", js: str = "") -> str:
    return sha256_text(f"html:{html}\0css:{css}\0js:{js}")


def byte_region_hash(text: str) -> str:
    return sha256_text(text)


def mapping_token(page_id: str, node_id: str, kind: str, start: int, end: int) -> str:
    return "mt." + sha256_text(f"{page_id}:{node_id}:{kind}:{start}:{end}")[:16]


def fault(code: str, status: int = 422) -> AnalyticsError:
    messages = {
        "VERSION_CONFLICT": "页面版本已变化，请重新下载、重新选择、重新应用。",
        "HASH_MISMATCH": "选区源码已变化，请重新下载、重新选择、重新应用。",
        "UNAUTHORIZED_CONTEXT": "编辑上下文不属于当前用户或租户。",
        "EDIT_EXPIRED": "编辑上下文已过期，请重新选择。",
        "CROSS_SCOPE": "编辑上下文不能用于其他页面。",
        "SCOPE_VIOLATION": "选区外的修改已被拒绝。",
        "CAPABILITY_DENIED": "当前能力不允许这个编辑通道。",
        "BOUND_NODE": "绑定业务节点默认不能修改。",
        "EMPTY_PATCH": "空补丁已被拒绝。",
        "INVALID_EDIT": "编辑操作不合法。",
        "DANGEROUS_CONTENT": "补丁包含不允许的标签或脚本。",
        "PACKAGE_TOO_LARGE": "页面源码超过大小上限。",
        "IDEMPOTENCY_CONFLICT": "该幂等键已用于另一份补丁。",
        "NOT_FOUND": "编辑上下文不存在，或当前身份不可见。",
        "LOGIC_REGION_UNAVAILABLE": "这个节点没有可校验的逻辑区域。",
        "MAPPING_STALE": "选区无法对应页面源码，请重新选择。",
    }
    recovery = RECOVERY if code in {"VERSION_CONFLICT", "HASH_MISMATCH"} else None
    return AnalyticsError(status, code, messages[code], recovery_url=recovery)


def tenant_of(actor) -> str:
    marked = sorted(scope.split(":", 1)[1] for scope in actor.data_scopes if scope.startswith("tenant:") and scope != "tenant:")
    if len(marked) != 1 or not marked[0] or len(marked[0]) > 128:
        raise fault("INVALID_EDIT")
    return marked[0]


def digest(value) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def recompute_capabilities(actor, *, bound: bool) -> frozenset[str]:
    allow_bound = "page:edit-bound" in actor.capabilities
    if bound and not allow_bound:
        return frozenset()
    caps = set()
    if "dashboard:update" in actor.capabilities:
        caps.update({"edit:presentation", "edit:source"})
    if "page:logic" in actor.capabilities:
        caps.add("edit:logic")
    if bound and allow_bound:
        caps.add("node:bound")
    return frozenset(caps)


def _plain(value) -> bool:
    return isinstance(value, dict)


def _extra(value, allowed) -> bool:
    return any(key not in allowed for key in value)


def adapt_operation(raw):
    if not t1_contract_ready():
        raise fault("INVALID_EDIT")
    from backend.contracts.page_documents import parse_edit_operation
    parsed = parse_edit_operation(raw)
    if not parsed.get("ok"):
        code = parsed.get("error", {}).get("code") or "INVALID_EDIT"
        if code == "PACKAGE_TOO_LARGE":
            raise fault("PACKAGE_TOO_LARGE", 413)
        if code == "CAPABILITY_DENIED":
            raise fault(code, 403)
        if code in {"VERSION_CONFLICT", "CAS_CONFLICT", "MAPPING_STALE", "IDEMPOTENCY_CONFLICT"}:
            raise fault(code, 409)
        raise fault("INVALID_EDIT")
    return parsed["value"].model_dump(mode="json", exclude_none=True)


def _close_range(html: str, tag: str, start: int):
    opener = re.compile(rf"<{re.escape(tag)}\b", re.IGNORECASE)
    closer = re.compile(rf"</{re.escape(tag)}\s*>", re.IGNORECASE)
    depth = 1
    cursor = start
    while cursor < len(html):
        nxt_open = opener.search(html, cursor)
        nxt_close = closer.search(html, cursor)
        if nxt_close is None:
            return None
        if nxt_open and nxt_open.start() < nxt_close.start():
            depth += 1
            cursor = nxt_open.end()
            continue
        depth -= 1
        if depth == 0:
            return nxt_close.start(), nxt_close.end()
        cursor = nxt_close.end()
    return None


def scan_markers(html: str) -> list[dict]:
    """T2 seam: same marker bounds as source-index/parse.mjs, without editing that module."""
    found = []
    for match in START_TAG.finditer(html):
        attrs = match.group(2) or ""
        node = NODE_ATTR.search(attrs)
        region = REGION_ATTR.search(attrs)
        if not node and not region:
            continue
        tag = match.group(1).lower()
        inner_start = match.end()
        self_closing = match.group(3) == "/" or tag in VOID
        if self_closing:
            inner_end = end = inner_start
        else:
            closed = _close_range(html, tag, inner_start)
            if closed is None:
                continue
            inner_end, end = closed
        for attr, found_id in (("node", node.group(2) if node else None), ("region", region.group(2) if region else None)):
            if found_id is None:
                continue
            found.append({
                "attr": attr, "node_id": found_id, "tag": tag,
                "start": match.start(), "inner_start": inner_start, "inner_end": inner_end, "end": end,
            })
    return found


def logic_range(js: str, node_id: str):
    needles = [
        node_id,
        f"[data-shine-node='{node_id}']",
        f'[data-shine-node="{node_id}"]',
        f"[data-shine-region='{node_id}']",
        f'[data-shine-region="{node_id}"]',
    ]
    ranges = []
    for needle in needles:
        start = 0
        while True:
            index = js.find(needle, start)
            if index < 0:
                break
            line_start = js.rfind("\n", 0, index) + 1
            line_end = js.find("\n", index)
            if line_end < 0:
                line_end = len(js)
            ranges.append((line_start, line_end))
            start = index + len(needle)
    if not ranges:
        return None
    ranges.sort()
    begin, end = ranges[0]
    for left, right in ranges[1:]:
        if left > end:
            return None
        end = max(end, right)
    return begin, end


def node_is_bound(manifest, node_id: str) -> bool:
    bindings = (manifest or {}).get("bindings") or []
    if any(isinstance(row, dict) and row.get("node_id") == node_id for row in bindings):
        return True
    refs = (manifest or {}).get("result_refs") or []
    return bool(refs) and all(not (isinstance(row, dict) and row.get("node_id")) for row in bindings)


def _dangerous(value: str) -> bool:
    return bool(DANGEROUS.search(value))


def _apply_bytes(source: str, operation: dict) -> str:
    splice = operation.get("splice") or {}
    start = splice["start"]
    end = splice["end"]
    payload = operation.get("payload") if isinstance(operation.get("payload"), str) else ""
    action = operation["action"]
    if action == "delete":
        return source[:start] + source[end:]
    if action == "insert":
        return source[:start] + payload + source[start:]
    if action == "move":
        removed = end - start
        base = source[:start] + source[end:]
        dest = operation["destination"]["start"]
        if dest >= end:
            dest -= removed
        return base[:dest] + payload + base[dest:]
    return source[:start] + payload + source[end:]


def _overlay(payload):
    if not _plain(payload) or _extra(payload, OVERLAY_KEYS):
        raise fault("INVALID_EDIT")
    overlay = {}
    if "text" in payload:
        if not isinstance(payload["text"], str):
            raise fault("INVALID_EDIT")
        if _dangerous(payload["text"]):
            raise fault("DANGEROUS_CONTENT", 422)
        if payload["text"]:
            overlay["text"] = payload["text"]
    if "style" in payload:
        style = payload["style"]
        if not _plain(style):
            raise fault("INVALID_EDIT")
        cleaned = {}
        for key, value in style.items():
            if not isinstance(value, str) or not STYLE_KEY.fullmatch(key) or _dangerous(value):
                raise fault("DANGEROUS_CONTENT" if _dangerous(str(value)) else "INVALID_EDIT")
            cleaned[key] = value
        if cleaned:
            overlay["style"] = cleaned
    if "attributes" in payload:
        attributes = payload["attributes"]
        if not _plain(attributes):
            raise fault("INVALID_EDIT")
        cleaned = {}
        for key, value in attributes.items():
            lowered = key.lower()
            if not isinstance(value, str) or not ATTR_KEY.fullmatch(key) or lowered.startswith("on") \
                    or lowered in {"data-shine-node", "data-shine-region"} or _dangerous(value):
                raise fault("DANGEROUS_CONTENT" if lowered.startswith("on") or _dangerous(str(value)) else "INVALID_EDIT")
            cleaned[key] = value
        if cleaned:
            overlay["attributes"] = cleaned
    if not overlay:
        raise fault("EMPTY_PATCH")
    return overlay


class PageEditContextStore:
    def __init__(self, directory: Path, pages, *, clock: Callable[[], int] = now_ms):
        self.path = directory.resolve() / "page_edit_context.sqlite3"
        self.pages = pages
        self.clock = clock
        initialize_sqlite(directory, self.path, application_id=1804289401, schema_version=1,
                          kind="page_edit_context", ddl=DDL, unavailable=UNAVAILABLE)

    def _read(self):
        return connect(self.path, readonly=True, unavailable=UNAVAILABLE)

    def _require(self, actor):
        require(actor, "dashboard:read", data_scope=DATA_SCOPE)
        require(actor, "dashboard:update", data_scope=DATA_SCOPE)

    def _context_row(self, context_id: str):
        if not isinstance(context_id, str) or not IDENTITY.fullmatch(context_id):
            raise fault("NOT_FOUND", 404)
        with self._read() as con:
            return con.execute("SELECT * FROM edit_contexts WHERE context_id=?", (context_id,)).fetchone()

    def _authorized(self, actor, context_id: str):
        self._require(actor)
        row = self._context_row(context_id)
        if row is None:
            raise fault("NOT_FOUND", 404)
        if row["owner"] != actor.actor_id or row["tenant_id"] != tenant_of(actor):
            raise fault("UNAUTHORIZED_CONTEXT", 403)
        if self.clock() >= row["expires_ms"]:
            raise fault("EDIT_EXPIRED", 409)
        return json.loads(row["body"])

    def _page(self, actor, page_id: str):
        snapshot = self.pages.get(actor, page_id)
        return snapshot["spec"]

    def create(self, actor, payload):
        self._require(actor)
        if not _plain(payload) or _extra(payload, {"page_id", "node_id", "kind", "ttl_ms", "channel"}):
            raise fault("INVALID_EDIT")
        page_id = payload.get("page_id")
        node_id = payload.get("node_id")
        kind = payload.get("kind")
        channel = payload.get("channel", "presentation")
        if not isinstance(page_id, str) or not isinstance(node_id, str) or kind not in {"static_element", "dynamic_region"}:
            raise fault("INVALID_EDIT")
        if channel not in CHANNELS:
            raise fault("INVALID_EDIT")
        ttl = payload.get("ttl_ms", 15 * 60 * 1000)
        if type(ttl) is not int or not 1 <= ttl <= 86_400_000:
            raise fault("INVALID_EDIT")
        spec = self._page(actor, page_id)
        package = spec["package"]
        html = package["html"]
        css = package.get("css") or ""
        js = package.get("js") or ""
        attr = "region" if kind == "dynamic_region" else "node"
        matches = [marker for marker in scan_markers(html) if marker["node_id"] == node_id and marker["attr"] == attr]
        if len(matches) != 1:
            raise fault("MAPPING_STALE", 409)
        marker = matches[0]
        js_span = logic_range(js, node_id)
        if channel == "logic":
            if js_span is None:
                raise fault("LOGIC_REGION_UNAVAILABLE")
            span = js_span
            region_text = js[span[0]:span[1]]
            region_field = "js"
        else:
            span = (marker["start"], marker["end"])
            region_text = html[span[0]:span[1]]
            region_field = "html"
        source_hash = package_source_hash(html, css, js)
        region_hash = byte_region_hash(region_text)
        bound = node_is_bound(spec.get("binding_manifest"), node_id)
        capabilities = sorted(recompute_capabilities(actor, bound=bound))
        now = self.clock()
        context_id = "editctx_" + uuid4().hex
        selector_attr = "data-shine-region" if attr == "region" else "data-shine-node"
        selected_node = {
            "page_id": page_id,
            "node_id": node_id,
            "kind": kind,
            "selector": f'[{selector_attr}="{node_id}"]',
            "source_range": {"start": span[0], "end": span[1]},
            "mapping_token": mapping_token(page_id, node_id, kind, span[0], span[1]),
            "source_hash": source_hash,
            "region_hash": region_hash,
        }
        contract = {
            "schema_version": CONTEXT_SCHEMA,
            "edit_context_id": context_id,
            "user_id": actor.actor_id,
            "tenant_id": tenant_of(actor),
            "page_id": page_id,
            "version": spec["version"],
            "selected_node": selected_node,
            "capabilities": list(capabilities),
            "created_at": now,
            "expires_at": now + ttl,
            "ttl_ms": ttl,
        }
        from backend.contracts.page_documents import parse_edit_context
        parsed = parse_edit_context(contract)
        if not parsed.get("ok"):
            raise fault("INVALID_EDIT")
        contract = parsed["value"].model_dump(mode="json")
        stored = {
            "contract": contract,
            "base_version": spec["version"],
            "bound": bound,
            "granted": list(capabilities),
            "region": [span[0], span[1]],
            "region_field": region_field,
            "logic_range": list(js_span) if js_span else None,
        }
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            con.execute("INSERT INTO edit_contexts VALUES (?,?,?,?,?,?)",
                        (context_id, actor.actor_id, contract["tenant_id"], page_id, contract["expires_at"],
                         json.dumps(stored, ensure_ascii=False)))
        return {
            **contract,
            "capabilities": list(capabilities),
            "base_version": spec["version"],
            "source_hash": source_hash,
            "region_hash": region_hash,
        }

    def native_handoff(self, actor, context_id: str):
        body = self._authorized(actor, context_id)
        return {"context_id": body["contract"]["edit_context_id"]}

    def _idempotent(self, actor, kind: str, key: str):
        with self._read() as con:
            return con.execute("SELECT * FROM idempotency WHERE owner=? AND kind=? AND key=?",
                               (actor.actor_id, kind, key)).fetchone()

    def _save_idempotency(self, actor, kind, key, context_id, preview_id, body_digest, body, *, acked=0):
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            con.execute("INSERT INTO idempotency VALUES (?,?,?,?,?,?,?,?)",
                        (actor.actor_id, kind, key, context_id, preview_id, body_digest, acked,
                         json.dumps(body, ensure_ascii=False)))

    def _drop_context(self, actor, context_id: str) -> None:
        """Forget a context whose compare-and-swap failed. Pending previews go with it."""
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            con.execute("DELETE FROM edit_contexts WHERE context_id=? AND owner=?", (context_id, actor.actor_id))
            con.execute(
                "DELETE FROM edit_previews WHERE owner=? AND context_id=? AND status='PENDING'",
                (actor.actor_id, context_id),
            )

    def apply(self, actor, context_id: str, operation, key: str | None, *, page_id: str | None = None):
        stored = self._authorized(actor, context_id)
        contract = stored["contract"]
        if page_id is not None and page_id != contract["page_id"]:
            raise fault("CROSS_SCOPE", 403)
        key = validate_key(key)
        try:
            adapted = adapt_operation(operation)
        except AnalyticsError as error:
            if error.code != "VERSION_CONFLICT":
                self._save_idempotency(actor, "apply", key, context_id, None, digest(operation), {
                    "error": True, "code": error.code, "status": error.status,
                })
            raise
        if adapted["cas"]["idempotency_key"] != key:
            raise fault("INVALID_EDIT")
        if adapted["action"] not in {"insert", "update", "delete", "move", "replace"}:
            raise fault("INVALID_EDIT")
        spec = self._page(actor, contract["page_id"])
        if spec["version"] != stored["base_version"] or adapted["cas"]["base_version"] != stored["base_version"]:
            self._drop_context(actor, context_id)
            raise fault("VERSION_CONFLICT", 409)
        body_digest = digest(adapted)
        prior = self._idempotent(actor, "apply", key)
        if prior is not None:
            if prior["digest"] != body_digest or prior["context_id"] != context_id:
                raise fault("IDEMPOTENCY_CONFLICT", 409)
            replay = json.loads(prior["body"])
            if replay.get("error"):
                raise fault(replay["code"], replay["status"])
            replay["replayed"] = True
            replay["receipt_pending"] = prior["acked"] == 0
            return replay
        try:
            result = self._decide(actor, stored, spec, adapted)
        except AnalyticsError as error:
            if error.code != "VERSION_CONFLICT":
                self._save_idempotency(actor, "apply", key, context_id, None, body_digest, {
                    "error": True, "code": error.code, "status": error.status,
                })
            if error.code in {"VERSION_CONFLICT", "HASH_MISMATCH"}:
                self._drop_context(actor, context_id)
            raise
        preview_id = "preview_" + digest(adapted)[:24]
        result.update({
            "ok": True,
            "preview_id": preview_id,
            "replayed": False,
            "receipt_pending": True,
            "base_version": stored["base_version"],
            "context_id": context_id,
        })
        encoded = json.dumps(result, ensure_ascii=False)
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            con.execute("INSERT INTO edit_previews VALUES (?,?,?,'PENDING',NULL,?)",
                        (actor.actor_id, preview_id, context_id, encoded))
            con.execute("INSERT INTO idempotency VALUES (?,?,?,?,?,?,?,?)",
                        (actor.actor_id, "apply", key, context_id, preview_id, body_digest, 0, encoded))
        return result

    def _decide(self, actor, stored, spec, operation):
        contract = stored["contract"]
        node = operation["node"]
        channel = operation["channel"]
        selected = contract["selected_node"]
        if node["node_id"] != selected["node_id"] or node["kind"] != selected["kind"] or node["page_id"] != selected["page_id"]:
            raise fault("SCOPE_VIOLATION")
        if node.get("source_range") != selected.get("source_range") or node.get("mapping_token") != selected.get("mapping_token"):
            raise fault("MAPPING_STALE", 409)
        bound = node_is_bound(spec.get("binding_manifest"), node["node_id"])
        capabilities = recompute_capabilities(actor, bound=bound)
        if bound and "node:bound" not in capabilities:
            raise fault("BOUND_NODE", 403)
        if CHANNEL_CAPABILITY[channel] not in capabilities:
            raise fault("CAPABILITY_DENIED", 403)
        package = spec["package"]
        html = package["html"]
        css = package.get("css") or ""
        js = package.get("js") or ""
        start, end = stored["region"]
        if stored.get("region_field") == "js":
            live_region = byte_region_hash(js[start:end])
        else:
            live_region = byte_region_hash(html[start:end])
        live_source = package_source_hash(html, css, js)
        if node["source_hash"] != live_source or node["region_hash"] != live_region:
            raise fault("HASH_MISMATCH", 409)
        overlay = None
        next_html, next_js = html, js
        clear_overlay = False
        if channel == "presentation":
            if operation["action"] == "delete":
                current = self._overlay_map(actor, contract["page_id"], spec["version"]).get(node["node_id"])
                if not current:
                    raise fault("EMPTY_PATCH")
                clear_overlay = True
                overlay = None
            else:
                built = _overlay(operation["payload"])
                if operation["action"] == "insert":
                    current = self._overlay_map(actor, contract["page_id"], spec["version"]).get(node["node_id"]) or {}
                    overlay = {**current, **built}
                else:
                    overlay = built
                if len(json.dumps(overlay, ensure_ascii=False).encode()) > HTML_MAX_CHARS:
                    raise fault("PACKAGE_TOO_LARGE", 413)
        elif channel == "source":
            payload = operation.get("payload")
            splice = operation.get("splice") or {}
            if splice.get("start", start) < start or splice.get("end", end) > end:
                raise fault("SCOPE_VIOLATION")
            if operation["action"] == "replace" and (splice.get("start") != start or splice.get("end") != end):
                raise fault("SCOPE_VIOLATION")
            if isinstance(payload, str) and _dangerous(payload):
                raise fault("DANGEROUS_CONTENT")
            next_html = _apply_bytes(html, operation)
            if next_html == html:
                raise fault("EMPTY_PATCH")
            if not next_html.startswith(html[:start]) or not next_html.endswith(html[end:]):
                raise fault("SCOPE_VIOLATION")
            if len(next_html) > HTML_MAX_CHARS or len(next_html.encode()) + len(css.encode()) + len(js.encode()) > PACKAGE_MAX_BYTES:
                raise fault("PACKAGE_TOO_LARGE", 413)
            if self._foreign_changed(html, next_html, node["node_id"]):
                raise fault("SCOPE_VIOLATION")
        else:
            if stored.get("region_field") == "js":
                js_start, js_end = stored["region"]
            elif stored.get("logic_range"):
                js_start, js_end = stored["logic_range"]
            else:
                raise fault("LOGIC_REGION_UNAVAILABLE")
            splice = operation.get("splice") or {}
            if splice.get("start", js_start) < js_start or splice.get("end", js_end) > js_end:
                raise fault("SCOPE_VIOLATION")
            if operation["action"] == "replace" and (splice.get("start") != js_start or splice.get("end") != js_end):
                raise fault("SCOPE_VIOLATION")
            current_slice = js[js_start:js_end]
            payload = operation.get("payload")
            if isinstance(payload, str) and _dangerous(payload):
                raise fault("DANGEROUS_CONTENT")
            other_ids = [item["node_id"] for item in package.get("node_map") or [] if item.get("node_id") != node["node_id"]]
            if isinstance(payload, str) and any(other_id in payload and other_id not in current_slice for other_id in other_ids):
                raise fault("SCOPE_VIOLATION")
            next_js = _apply_bytes(js, operation)
            if next_js == js:
                raise fault("EMPTY_PATCH")
            if operation["action"] != "delete" and node["node_id"] in current_slice and node["node_id"] not in next_js:
                raise fault("SCOPE_VIOLATION")
            if len(next_js) > STYLE_MAX_CHARS or len(html.encode()) + len(css.encode()) + len(next_js.encode()) > PACKAGE_MAX_BYTES:
                raise fault("PACKAGE_TOO_LARGE", 413)
        working = {
            "html": next_html,
            "css": css,
            "js": next_js,
            "resources": package.get("resources") or [],
            "node_map": package.get("node_map") or [],
        }
        return {
            "channel": channel,
            "node_id": node["node_id"],
            "overlay": overlay,
            "clear_overlay": clear_overlay,
            "working_copy": working,
            "source_bytes_unchanged": next_html == html and next_js == js and css == (package.get("css") or ""),
            "html_bytes_unchanged": next_html == html,
            "impact": {
                "channel": channel,
                "html_outside_selection": False,
                "affected_nodes": [node["node_id"]],
                "source_bytes_unchanged": next_html == html and next_js == js,
            },
        }

    @staticmethod
    def _foreign_changed(before: str, after: str, node_id: str) -> bool:
        def outers(html):
            grouped = {}
            for marker in scan_markers(html):
                grouped.setdefault(marker["node_id"], []).append(html[marker["start"]:marker["end"]])
            return grouped
        previous = outers(before)
        current = outers(after)
        for marker_id, chunks in previous.items():
            if marker_id == node_id:
                continue
            if current.get(marker_id) != chunks:
                return True
        return False

    def confirm(self, actor, context_id: str, preview_id: str, key: str | None):
        stored = self._authorized(actor, context_id)
        key = validate_key(key)
        body_digest = digest({"context_id": context_id, "preview_id": preview_id})
        prior = self._idempotent(actor, "confirm", key)
        if prior is not None:
            if prior["digest"] != body_digest or prior["context_id"] != context_id:
                raise fault("IDEMPOTENCY_CONFLICT", 409)
            body = json.loads(prior["body"])
            body["replayed"] = True
            body["receipt_pending"] = prior["acked"] == 0
            return body
        with self._read() as con:
            preview = con.execute("SELECT * FROM edit_previews WHERE owner=? AND preview_id=?",
                                  (actor.actor_id, preview_id)).fetchone()
        if preview is None or preview["context_id"] != context_id:
            raise fault("NOT_FOUND", 404)
        preview_body = json.loads(preview["body"])
        spec = self._page(actor, stored["contract"]["page_id"])
        if spec["version"] != stored["base_version"] and not preview["page_preview_id"]:
            self._drop_context(actor, context_id)
            raise fault("VERSION_CONFLICT", 409)
        page_preview_id = preview["page_preview_id"]
        if not page_preview_id:
            page_preview_id = self._open_page_preview(actor, stored, preview_body)
            with transaction(self.path, unavailable=UNAVAILABLE) as con:
                con.execute("UPDATE edit_previews SET page_preview_id=? WHERE owner=? AND preview_id=?",
                            (page_preview_id, actor.actor_id, preview_id))
        try:
            saved = self.pages.confirm(actor, page_preview_id, key)
        except AnalyticsError as error:
            if error.code == "VERSION_CONFLICT":
                self._drop_context(actor, context_id)
                try:
                    self.pages.cancel(actor, page_preview_id)
                except AnalyticsError:
                    pass
            raise
        saved_spec = saved["spec"]
        if preview_body["channel"] == "presentation":
            previous = self._overlay_map(actor, stored["contract"]["page_id"], stored["base_version"])
            if preview_body.get("clear_overlay"):
                merged = {key: value for key, value in previous.items() if key != preview_body["node_id"]}
            else:
                merged = {**previous, preview_body["node_id"]: preview_body["overlay"]}
            with transaction(self.path, unavailable=UNAVAILABLE) as con:
                con.execute("INSERT OR REPLACE INTO presentation_overlays VALUES (?,?,?,?)",
                            (actor.actor_id, stored["contract"]["page_id"], saved_spec["version"],
                             json.dumps(merged, ensure_ascii=False)))
        body = {
            "ok": True,
            "preview_id": preview_id,
            "context_id": context_id,
            "saved_version": saved_spec["version"],
            "replayed": False,
            "receipt_pending": True,
            "channel": preview_body["channel"],
            "source_bytes_unchanged": preview_body["source_bytes_unchanged"],
            "html_bytes_unchanged": preview_body["html_bytes_unchanged"],
            "overlay": preview_body["overlay"],
            "package": {key: saved_spec["package"].get(key, "") for key in ("html", "css", "js")},
            "recovery": None,
        }
        self._save_idempotency(actor, "confirm", key, context_id, preview_id, body_digest, body)
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            con.execute("UPDATE edit_previews SET status='APPLIED' WHERE owner=? AND preview_id=?",
                        (actor.actor_id, preview_id))
        return body

    def _open_page_preview(self, actor, stored, preview_body):
        page_id = stored["contract"]["page_id"]
        base_version = stored["base_version"]
        if preview_body["channel"] == "presentation":
            opened = self.pages.preview_identical(actor, page_id, base_version)
        else:
            try:
                request = PagePatchPreview.model_validate({
                    "base_version": base_version,
                    "package": preview_body["working_copy"],
                })
            except ValidationError as error:
                if is_package_too_large(error):
                    raise fault("PACKAGE_TOO_LARGE", 413) from error
                raise fault("INVALID_EDIT") from error
            opened = self.pages.patch(actor, page_id, request)
        return opened["preview_id"]

    def recover(self, actor, context_id: str, preview_id: str):
        self._authorized(actor, context_id)
        with self._read() as con:
            row = con.execute(
                "SELECT * FROM idempotency WHERE owner=? AND kind='confirm' AND context_id=? AND preview_id=?",
                (actor.actor_id, context_id, preview_id)).fetchone()
        if row is None:
            raise fault("NOT_FOUND", 404)
        body = json.loads(row["body"])
        body["replayed"] = True
        body["recovered"] = True
        body["receipt_pending"] = row["acked"] == 0
        return body

    def acknowledge(self, actor, context_id: str, preview_id: str):
        self._authorized(actor, context_id)
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            row = con.execute(
                "SELECT * FROM idempotency WHERE owner=? AND kind='confirm' AND context_id=? AND preview_id=?",
                (actor.actor_id, context_id, preview_id)).fetchone()
            if row is None:
                raise fault("NOT_FOUND", 404)
            con.execute("UPDATE idempotency SET acked=1 WHERE owner=? AND kind='confirm' AND key=?",
                        (actor.actor_id, row["key"]))
        body = json.loads(row["body"])
        body["replayed"] = True
        body["receipt_pending"] = False
        return body

    def _overlay_map(self, actor, page_id: str, version: int) -> dict:
        with self._read() as con:
            row = con.execute("SELECT body FROM presentation_overlays WHERE owner=? AND page_id=? AND version=?",
                              (actor.actor_id, page_id, version)).fetchone()
        if row is None:
            return {}
        body = json.loads(row["body"])
        return body if isinstance(body, dict) else {}

    def overlay(self, actor, page_id: str, version: int):
        """Read the overlay saved for this page version only. Missing rows are empty."""
        self._require(actor)
        self._page(actor, page_id)
        if type(version) is not int or version < 1:
            raise fault("INVALID_EDIT")
        return self._overlay_map(actor, page_id, version)
