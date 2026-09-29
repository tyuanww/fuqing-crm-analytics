"""Durable free-page assets. Drafts never change the published head.

One connection per operation, immutable snapshots, monotonic rollback versions,
current grants on every read/replay, and compare-and-swap inside BEGIN IMMEDIATE.
Source package and binding manifest share one atomic version. This file never
dispatches a model or opens a business DuckDB. BoardSpec codec is not used.
"""
from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from typing import Callable
from uuid import uuid4

from pydantic import ValidationError

from backend.contracts.analytics_query import canonical_json
from backend.contracts.competition_computed import DATA_SCOPE
from backend.contracts.page_documents import (
    PACKAGE_MAX_BYTES, PageDocument, PageDraft, PagePatchPreview, PageRollbackPreview,
    PageSavePreview, is_package_too_large, page_source_hash,
)
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, require
from backend.services.analytics.first_purchase.asset_state import (
    connect, initialize_sqlite, now_ms, opaque, transaction, validate_key,
)

UNAVAILABLE = "页面保存库暂不可用，已保存版本未被本次操作替换。"
AUTO_MAP_SKIP = {
    "html", "head", "body", "title", "meta", "link", "base", "style", "script",
    "template", "source", "track", "col", "colgroup", "option",
}
AUTO_DYNAMIC_TAGS = {"canvas", "svg", "video", "audio", "iframe"}
HTML_VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}


def _next_tag_end(html: str, start: int) -> int:
    quote = None
    for index in range(start, len(html)):
        char = html[index]
        if quote:
            if char == quote:
                quote = None
        elif char in {"'", '"'}:
            quote = char
        elif char == ">":
            return index
    return -1


def _skip_raw_block(html: str, start: int) -> int | None:
    if html.startswith("<!--", start):
        end = html.find("-->", start + 4)
        return len(html) if end < 0 else end + 3
    tag_end = _next_tag_end(html, start + 1)
    if tag_end < 0:
        return len(html)
    opening = re.match(r"<(script|style|template|textarea|title)\b", html[start:tag_end + 1], re.I)
    if opening is None:
        return None
    closing = re.search(rf"</{opening.group(1)}\s*>", html[tag_end + 1:], re.I)
    return (len(html) if closing is None else
            tag_end + 1 + closing.start() + closing.end())


def _annotate_generic_html(html: str) -> tuple[str, list[dict]]:
    raw = str(html or "")
    additions = []
    chunks = []
    cursor = 0
    index = 0
    while index < len(raw):
        start = raw.find("<", index)
        if start < 0:
            break
        skipped = _skip_raw_block(raw, start)
        if skipped is not None:
            index = skipped
            continue
        end = _next_tag_end(raw, start + 1)
        if end < 0:
            break
        source = raw[start:end + 1]
        match = re.fullmatch(r"<([A-Za-z][A-Za-z0-9:_-]*)([\s\S]*?)>", source)
        if (match is None or source.startswith(("</", "<!", "<?"))):
            index = end + 1
            continue
        tag = match.group(1).lower()
        attrs = match.group(2) or ""
        if tag in AUTO_MAP_SKIP or re.search(r"\bdata-shine-(?:node|region)\s*=\s*", attrs, re.I):
            index = end + 1
            continue
        node_id = f"auto_{tag}_{start}"
        kind = "dynamic_region" if tag in AUTO_DYNAMIC_TAGS else "static_element"
        attr = "region" if kind == "dynamic_region" else "node"
        marker = f' data-shine-{attr}="{node_id}"'
        insert_at = len(source) - 2 if source.endswith("/>") else len(source) - 1
        chunks.extend((raw[cursor:start], source[:insert_at], marker, source[insert_at:]))
        additions.append({"node_id": node_id, "kind": kind,
                          "selector": f"[data-shine-{attr}='{node_id}']"})
        cursor = end + 1
        index = end + 1
    if not additions:
        return raw, []
    chunks.append(raw[cursor:])
    return "".join(chunks), additions


def _annotate_package(package: dict) -> dict:
    if not isinstance(package, dict) or not isinstance(package.get("html"), str):
        return package
    source_html = package["html"]
    source_css = package.get("css", "")
    source_js = package.get("js", "")
    html, additions = _annotate_generic_html(source_html)
    existing = package.get("node_map") if isinstance(package.get("node_map"), list) else []
    known = {row.get("node_id") for row in existing if isinstance(row, dict) and row.get("node_id")}
    annotated = {**package, "html": html,
                 "node_map": [*existing, *(row for row in additions if row["node_id"] not in known)]}
    presentation = package.get("presentation")
    if additions and isinstance(presentation, dict):
        # A legacy snapshot may have a valid overlay hash for the source before
        # host-owned markers were inserted. Rebind only that exact case; a
        # stale hash must remain stale and be rejected by PagePackage.
        if presentation.get("source_hash") == page_source_hash(source_html, source_css, source_js):
            annotated["presentation"] = {
                **presentation,
                "source_hash": page_source_hash(html, source_css, source_js),
            }
    return annotated


def _css_rules(css: str):
    stack = []
    segment_starts = [0]
    quote = None
    comment = False
    index = 0
    while index < len(css):
        char = css[index]
        next_char = css[index + 1] if index + 1 < len(css) else ""
        if comment:
            if char == "*" and next_char == "/":
                comment = False
                index += 2
                continue
            index += 1
            continue
        if quote:
            if char == "\\":
                index += 2
                continue
            if char == quote:
                quote = None
            index += 1
            continue
        if char == "/" and next_char == "*":
            comment = True
            index += 2
            continue
        if char in {"'", '"'}:
            quote = char
            index += 1
            continue
        if char == "{":
            stack.append((segment_starts[-1], index))
            segment_starts.append(index + 1)
        elif char == "}" and stack:
            start, open_at = stack.pop()
            segment_starts.pop()
            selector = css[start:open_at].strip()
            if selector:
                yield selector, start, index + 1
            segment_starts[-1] = index + 1
        index += 1


DDL = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE heads (
    owner TEXT NOT NULL, page_id TEXT NOT NULL, version INTEGER NOT NULL,
    PRIMARY KEY(owner, page_id)
);
CREATE TABLE revisions (
    owner TEXT NOT NULL, page_id TEXT NOT NULL, version INTEGER NOT NULL,
    operation TEXT NOT NULL, created_ms INTEGER NOT NULL,
    payload TEXT NOT NULL, digest TEXT NOT NULL,
    PRIMARY KEY(owner, page_id, version)
);
CREATE TABLE previews (
    owner TEXT NOT NULL, preview_id TEXT NOT NULL, page_id TEXT NOT NULL,
    base_version INTEGER NOT NULL, operation TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING','CANCELLED','APPLIED')),
    expires_ms INTEGER NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL,
    PRIMARY KEY(owner, preview_id)
);
CREATE TABLE receipts (
    owner TEXT NOT NULL, key TEXT NOT NULL, preview_id TEXT NOT NULL,
    PRIMARY KEY(owner, key),
    FOREIGN KEY(owner, preview_id) REFERENCES previews(owner, preview_id)
);
"""


@dataclass(frozen=True)
class ResolvedPageBinding:
    status: str
    required_scopes: frozenset[str]


def fault(code="VERSION_CONFLICT", status=409):
    messages = {
        "VERSION_CONFLICT": "页面版本已变化，请重新读取后预览；原版本未被覆盖。",
        "NOT_FOUND": "页面或草稿不存在，或当前身份不可见。",
        "PREVIEW_CANCELLED": "草稿已取消，不能保存。",
        "PREVIEW_EXPIRED": "草稿已过期，请重新预览。",
        "IDEMPOTENCY_CONFLICT": "该幂等键已用于另一份草稿。",
        "BINDING_CORRUPT": "页面快照完整性校验失败，请保留状态并检查。",
        "INVALID_PAGE": "页面源码包、绑定或字段不符合合同。",
        "PACKAGE_TOO_LARGE": "页面源码包超过大小上限。",
        "RESULT_UNAVAILABLE": "没有可绑定的当前会话结果，请先完成对应问数。",
        "RESULT_STALE": "绑定结果已过期，页面仍可打开，请重新绑定。",
        "RESULT_REVOKED": "绑定结果授权已撤销。",
        "FORBIDDEN": "当前身份无权操作此页面。",
        "AI_CONTEXT_MISSING": "AI 编辑上下文不完整，请重新选择页面元素。",
        "AI_SCOPE_DIFF": "候选修改超出当前选区范围，已拒绝预览。",
        "AI_SOURCE_CHANGED": "页面源码已变化，请重新选择后再编辑。",
        "AI_BOUND_CONTENT": "绑定页面的源码或运行逻辑不可由此入口改写。",
    }
    return AnalyticsError(status, code, messages[code])


def validated(model, payload):
    try:
        return model.model_validate(payload)
    except ValidationError as error:
        if is_package_too_large(error):
            raise fault("PACKAGE_TOO_LARGE", 413) from error
        raise fault("INVALID_PAGE", 422) from error
    except (ValueError, TypeError) as error:
        raise fault("INVALID_PAGE", 422) from error


def stamp_binding_state(payload):
    spec = dict(payload)
    refs = (spec.get("binding_manifest") or {}).get("result_refs") or []
    if not refs:
        spec["binding_state"] = "UNBOUND_SAMPLE"
    elif spec.get("binding_state") not in {"BOUND_VERIFIED", "BOUND_STALE"}:
        spec["binding_state"] = "BOUND_VERIFIED"
    return spec


class PageDocumentStore:
    def __init__(self, directory: Path, *,
                 resolve_binding: Callable[[AnalyticsPrincipal, str, str], ResolvedPageBinding] | None = None,
                 clock: Callable[[], int] = now_ms):
        self.path = directory.resolve() / "page_documents.sqlite3"
        self.resolve_binding = resolve_binding
        self.clock = clock
        initialize_sqlite(directory, self.path, application_id=1804289383, schema_version=1,
                          kind="library_page_documents", ddl=DDL, unavailable=UNAVAILABLE)

    @contextmanager
    def _read(self):
        try:
            with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
                yield con
        except sqlite3.DatabaseError as error:
            raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True) from error

    @staticmethod
    def _access(actor, *, write=False, scopes=()):
        require(actor, "dashboard:read", data_scope=DATA_SCOPE)
        if write:
            require(actor, "dashboard:update", data_scope=DATA_SCOPE)
        for scope in scopes:
            require(actor, "dashboard:read", data_scope=scope)

    def _decode(self, actor, row, *, version):
        if row is None or row["owner"] != actor.actor_id:
            raise fault("NOT_FOUND", 404)
        try:
            if hashlib.sha256(row["payload"].encode()).hexdigest() != row["digest"]:
                raise ValueError("snapshot digest differs")
            stored = json.loads(row["payload"])
            snapshot = validated(PageDocument, stored["snapshot"]["spec"])
            scopes = stored["required_scopes"]
            if (not isinstance(scopes, list) or any(not isinstance(scope, str) or not scope for scope in scopes)
                    or snapshot.page_id != row["page_id"] or snapshot.version != version
                    or snapshot.schema_version != "free-page/v1"):
                raise ValueError("snapshot binding differs")
            normalized = snapshot.model_dump(mode="json")
            normalized["package"] = _annotate_package(normalized["package"])
            snapshot = validated(PageDocument, normalized)
        except (ValueError, TypeError, KeyError, AnalyticsError) as error:
            if isinstance(error, AnalyticsError) and error.code == "INVALID_PAGE":
                raise fault("BINDING_CORRUPT") from error
            raise fault("BINDING_CORRUPT") from error
        self._access(actor, scopes=scopes)
        return {"spec": snapshot.model_dump(mode="json")}, frozenset(scopes)

    @staticmethod
    def _head(con, actor, page_id):
        opaque(page_id, label="page_id")
        row = con.execute("SELECT version FROM heads WHERE owner=? AND page_id=?",
                          (actor.actor_id, page_id)).fetchone()
        if row is None:
            raise fault("NOT_FOUND", 404)
        return row["version"]

    def _revision(self, con, actor, page_id, version):
        row = con.execute("SELECT * FROM revisions WHERE owner=? AND page_id=? AND version=?",
                          (actor.actor_id, page_id, version)).fetchone()
        return self._decode(actor, row, version=version)

    def get(self, actor, page_id, version=None):
        self._access(actor)
        if version is not None and (type(version) is not int or not 1 <= version <= 9007199254740991):
            raise fault("INVALID_PAGE", 422)
        with self._read() as con:
            current = self._head(con, actor, page_id)
            return self._revision(con, actor, page_id, current if version is None else version)[0]

    def list(self, actor, *, limit=100, offset=0):
        self._access(actor)
        self._page(limit, offset)
        with self._read() as con:
            rows = con.execute("SELECT * FROM heads WHERE owner=? ORDER BY page_id LIMIT ? OFFSET ?",
                               (actor.actor_id, limit, offset)).fetchall()
            items = []
            for row in rows:
                try:
                    snapshot, _ = self._revision(con, actor, row["page_id"], row["version"])
                except AnalyticsError as error:
                    if error.status == 403:
                        continue
                    raise
                spec = snapshot["spec"]
                item = {key: spec[key] for key in
                        ("page_id", "title", "version", "session_id", "binding_state")}
                if spec.get("origin_path"):
                    item["origin_path"] = spec["origin_path"]
                if spec.get("origin_file_id"):
                    item["origin_file_id"] = spec["origin_file_id"]
                items.append(item)
            return items

    @staticmethod
    def _page(limit, offset):
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or not 0 <= offset <= 1000000:
            raise fault("INVALID_PAGE", 422)

    def history(self, actor, page_id, *, limit=100, offset=0):
        self._access(actor)
        self._page(limit, offset)
        with self._read() as con:
            self._head(con, actor, page_id)
            rows = con.execute(
                "SELECT * FROM revisions WHERE owner=? AND page_id=? ORDER BY version DESC LIMIT ? OFFSET ?",
                (actor.actor_id, page_id, limit, offset)).fetchall()
            items = []
            for row in rows:
                self._decode(actor, row, version=row["version"])
                items.append({"version": row["version"], "operation": row["operation"],
                              "created_at_ms": row["created_ms"]})
            return items

    def _bind(self, actor, spec, *, retained_scopes=None):
        refs = list(spec.binding_manifest.result_refs)
        if not refs:
            return spec.model_copy(update={"binding_state": "UNBOUND_SAMPLE"}), frozenset()
        if retained_scopes is not None:
            self._access(actor, scopes=retained_scopes)
            return spec, frozenset(retained_scopes)
        if self.resolve_binding is None:
            raise fault("RESULT_UNAVAILABLE", 409)
        scopes = set()
        stale = False
        for ref in refs:
            resolved = self.resolve_binding(actor, spec.session_id, ref)
            if resolved.status == "REVOKED":
                raise fault("RESULT_REVOKED", 403)
            if resolved.status == "UNAVAILABLE":
                raise fault("RESULT_UNAVAILABLE", 409)
            if resolved.status not in {"VERIFIED", "STALE"}:
                raise fault("INVALID_PAGE", 422)
            self._access(actor, scopes=resolved.required_scopes)
            scopes.update(resolved.required_scopes)
            stale = stale or resolved.status == "STALE"
        state = "BOUND_STALE" if stale else "BOUND_VERIFIED"
        return spec.model_copy(update={"binding_state": state}), frozenset(scopes)

    def _preview(self, actor, spec, operation, base_version, *, retained_scopes=None):
        self._access(actor, write=True)
        spec, scopes = self._bind(actor, spec, retained_scopes=retained_scopes)
        snapshot = {"spec": spec.model_dump(mode="json")}
        payload = canonical_json({"snapshot": snapshot, "required_scopes": sorted(scopes)})
        if len(payload.encode()) > PACKAGE_MAX_BYTES:
            raise fault("PACKAGE_TOO_LARGE", 413)
        preview_id = "preview_" + uuid4().hex
        expires = self.clock() + 30 * 60 * 1000
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            if base_version and self._head(con, actor, spec.page_id) != base_version:
                raise fault()
            con.execute("INSERT INTO previews VALUES (?,?,?,?,?,'PENDING',?,?,?)",
                        (actor.actor_id, preview_id, spec.page_id, base_version, operation, expires,
                         payload, hashlib.sha256(payload.encode()).hexdigest()))
        return {"preview_id": preview_id, "status": "PENDING", "operation": operation,
                "base_version": base_version, "expires_at_ms": expires, "snapshot": snapshot}

    def generate(self, actor, request: PageDraft):
        self._access(actor, write=True)
        draft = request.model_dump(mode="json")
        draft["package"] = _annotate_package(draft["package"])
        spec = validated(PageDocument, stamp_binding_state({**draft,
            "page_id": "page_" + uuid4().hex, "version": 1}))
        return self._preview(actor, spec, "GENERATE", 0)

    def _base(self, actor, page_id, base_version):
        self._access(actor, write=True)
        with self._read() as con:
            if self._head(con, actor, page_id) != base_version:
                raise fault()
            return self._revision(con, actor, page_id, base_version)

    @staticmethod
    def _source_hash(package):
        value = f"html:{package['html']}\0css:{package.get('css', '')}\0js:{package.get('js', '')}"
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _range_contains(ranges, start, end):
        # A zero-width edit at the right edge is outside a half-open source
        # range.  Treating it as contained lets an agent append content after
        # the selected element while still passing the range check.
        if end == start:
            return any(item["start"] <= start < item["end"] for item in ranges)
        return any(item["start"] <= start and end <= item["end"] for item in ranges)

    @staticmethod
    def _merge_ranges(ranges):
        ordered = sorted((item["start"], item["end"]) for item in ranges if item["end"] > item["start"])
        merged = []
        for start, end in ordered:
            if not merged or start > merged[-1]["end"]:
                merged.append({"start": start, "end": end})
            else:
                merged[-1]["end"] = max(merged[-1]["end"], end)
        return merged

    @staticmethod
    def _node_map_entry(package, node_id, kind):
        matches = [item for item in package.get("node_map", [])
                   if item.get("node_id") == node_id and item.get("kind") == kind]
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def _selector_unique_to_node(selector, node_id):
        selector = selector.strip()
        return selector in {
            f"[data-shine-node='{node_id}']",
            f'[data-shine-node="{node_id}"]',
            f"[data-shine-region='{node_id}']",
            f'[data-shine-region="{node_id}"]',
        }

    @classmethod
    def _canonical_css_ranges(cls, package, node_id):
        css = package.get("css", "")
        ranges = []
        for selector, start, end in _css_rules(css):
            if cls._selector_unique_to_node(selector, node_id):
                ranges.append({"start": start, "end": end})
        return cls._merge_ranges(ranges)

    @classmethod
    def _canonical_js_ranges(cls, package, node):
        js = package.get("js", "")
        node_id = node["node_id"]
        needles = [
            node_id,
            f"[data-shine-node='{node_id}']",
            f'[data-shine-node="{node_id}"]',
            f"[data-shine-region='{node_id}']",
            f'[data-shine-region="{node_id}"]',
            node.get("selector"),
        ]
        ranges = []
        for needle in filter(None, needles):
            start = 0
            while start < len(js):
                index = js.find(needle, start)
                if index < 0:
                    break
                line_start = js.rfind("\n", 0, index) + 1
                line_end = js.find("\n", index)
                if line_end < 0:
                    line_end = len(js)
                ranges.append({"start": line_start, "end": line_end})
                start = index + len(needle)
        return cls._merge_ranges(ranges)

    @staticmethod
    def _mapped_node_range(package, node_id, kind):
        html = package.get("html", "")
        attr = "node" if kind == "static_element" else "region"
        wanted = re.compile(rf"data-shine-{attr}\s*=\s*(['\"]){re.escape(node_id)}\1", re.I)
        marker = None
        cursor = 0
        while cursor < len(html):
            start = html.find("<", cursor)
            if start < 0:
                break
            skipped = _skip_raw_block(html, start)
            if skipped is not None:
                cursor = skipped
                continue
            tag_end = _next_tag_end(html, start + 1)
            if tag_end < 0:
                break
            source = html[start:tag_end + 1]
            match = re.fullmatch(r"<(/?)([A-Za-z][\w:-]*)([\s\S]*?)(/?)>", source)
            if match is None or match.group(1) or source.startswith(("<!", "<?")):
                cursor = tag_end + 1
                continue
            if wanted.search(match.group(3) or ""):
                if marker is not None:
                    return None
                marker = (start, tag_end + 1, match.group(2).lower(), match.group(4) == "/")
            cursor = tag_end + 1
        if marker is None:
            return None
        start, open_end, tag, self_closing = marker
        if self_closing or tag in HTML_VOID_TAGS:
            return start, open_end
        depth = 1
        cursor = open_end
        while cursor < len(html):
            candidate_start = html.find("<", cursor)
            if candidate_start < 0:
                break
            skipped = _skip_raw_block(html, candidate_start)
            if skipped is not None:
                cursor = skipped
                continue
            tag_end = _next_tag_end(html, candidate_start + 1)
            if tag_end < 0:
                break
            source = html[candidate_start:tag_end + 1]
            match = re.fullmatch(r"<(/?)([A-Za-z][\w:-]*)([\s\S]*?)(/?)>", source)
            if match is None or source.startswith(("<!", "<?")):
                cursor = tag_end + 1
                continue
            if match.group(2).lower() != tag:
                cursor = tag_end + 1
                continue
            if match.group(1):
                depth -= 1
            elif match.group(4) != "/" and tag not in HTML_VOID_TAGS:
                depth += 1
            if depth == 0:
                return start, tag_end + 1
            cursor = tag_end + 1
        return None

    def _validate_ai_scope(self, old_spec, new_spec, request):
        """Enforce the host selection on the server; never widen an AI patch."""
        if request.edit_scope != "source_range":
            return
        focus = request.focus_ref
        if focus is None or request.edit_context_id is None or request.source_hash is None:
            raise fault("AI_CONTEXT_MISSING", 422)
        old_package = old_spec["package"]
        new_package = new_spec["package"]
        base_hash = self._source_hash(old_package)
        if request.source_hash != base_hash or (focus.version_hash is not None and focus.version_hash != base_hash):
            raise fault("AI_SOURCE_CHANGED", 409)
        if focus.allowed_scope in {"shared_scope", "readonly_bound"}:
            raise fault("AI_BOUND_CONTENT" if focus.allowed_scope == "readonly_bound" else "AI_SCOPE_DIFF",
                        403 if focus.allowed_scope == "readonly_bound" else 422)
        node = self._node_map_entry(old_package, focus.node_id, focus.kind)
        if node is None:
            raise fault("AI_SOURCE_CHANGED", 409)
        mapped = self._mapped_node_range(old_package, focus.node_id, focus.kind)
        if mapped is None or focus.mapping_token != hashlib.sha256(
                f"{base_hash}:{focus.node_id}:{mapped[0]}:{mapped[1]}".encode()).hexdigest()[:32]:
            raise fault("AI_SOURCE_CHANGED", 409)
        if (old_package.get("resources", []) != new_package.get("resources", [])
                or old_package.get("node_map", []) != new_package.get("node_map", [])
                or old_package.get("presentation") != new_package.get("presentation")):
            raise fault("AI_SCOPE_DIFF", 422)
        if old_spec.get("binding_manifest", {}) != {"bindings": [], "result_refs": []}:
            if any(old_package.get(key, "") != new_package.get(key, "") for key in ("html", "css", "js")):
                raise fault("AI_BOUND_CONTENT", 403)
        canonical = {
            "html": [{"start": mapped[0], "end": mapped[1]}],
            "css": self._canonical_css_ranges(old_package, focus.node_id),
            "js": self._canonical_js_ranges(old_package, node),
        }
        expected_scope = "dynamic_source_range" if canonical["js"] else (
            "declared_region" if focus.kind == "dynamic_region" else "exact_source_range")
        if focus.allowed_scope != expected_scope:
            raise fault("AI_SCOPE_DIFF", 422)
        ranges_by_file = {"html": [], "css": [], "js": []}
        for item in focus.allowed_ranges:
            ranges_by_file[item.file].append({"start": item.start, "end": item.end})
        html_ranges = ranges_by_file["html"]
        if len(html_ranges) != 1 or html_ranges[0] != canonical["html"][0]:
            raise fault("AI_SCOPE_DIFF", 422)
        for file in ("css", "js"):
            if any(item["end"] <= item["start"] or not self._range_contains(canonical[file], item["start"], item["end"])
                   for item in ranges_by_file[file]):
                raise fault("AI_SCOPE_DIFF", 422)
        changed_files = [file for file in ranges_by_file
                         if old_package.get(file, "") != new_package.get(file, "")]
        if len(changed_files) > 1:
            raise fault("AI_SCOPE_DIFF", 422)
        for file in ranges_by_file:
            old_value = old_package.get(file, "")
            new_value = new_package.get(file, "")
            if old_value == new_value:
                continue
            if not ranges_by_file[file]:
                raise fault("AI_SCOPE_DIFF", 422)
            # The default autojunk heuristic keeps this bounded for repetitive
            # source files (the previous autojunk=False path could take minutes
            # on a large repeated stylesheet/script).
            matcher = SequenceMatcher(None, old_value, new_value, autojunk=True)
            for tag, start, end, _new_start, _new_end in matcher.get_opcodes():
                if tag != "equal" and not self._range_contains(ranges_by_file[file], start, end):
                    raise fault("AI_SCOPE_DIFF", 422)

    def patch(self, actor, page_id, request: PagePatchPreview):
        snapshot, scopes = self._base(actor, page_id, request.base_version)
        spec = deepcopy(snapshot["spec"])
        changes = request.model_dump(mode="json", exclude_unset=True)
        changes.pop("base_version")
        if "package" in changes:
            changes["package"] = _annotate_package(changes["package"])
        for field in ("edit_scope", "edit_context_id", "focus_ref", "source_hash"):
            changes.pop(field, None)
        spec.update(changes)
        self._validate_ai_scope(snapshot["spec"], spec, request)
        spec["version"] += 1
        retain = None if "binding_manifest" in request.model_fields_set else scopes
        return self._preview(actor, validated(PageDocument, stamp_binding_state(spec)), "PATCH",
                             request.base_version, retained_scopes=retain)

    def preview_identical(self, actor, page_id, base_version):
        """Mint the next version without changing package bytes.

        Presentation overlays are stored beside the page document. The source
        package in this revision stays byte-for-byte identical to the base.
        """
        snapshot, scopes = self._base(actor, page_id, base_version)
        spec = deepcopy(snapshot["spec"])
        spec["version"] = base_version + 1
        return self._preview(actor, validated(PageDocument, spec), "PATCH", base_version, retained_scopes=scopes)

    def save(self, actor, page_id, request: PageSavePreview):
        snapshot, _scopes = self._base(actor, page_id, request.base_version)
        spec = deepcopy(snapshot["spec"])
        package = _annotate_package(request.package.model_dump(mode="json"))
        if snapshot["spec"]["binding_manifest"]["result_refs"]:
            if request.binding_manifest.model_dump(mode="json") != snapshot["spec"]["binding_manifest"] or any(
                package[key] != spec["package"][key]
                for key in ("html", "js", "resources", "node_map")
            ):
                raise fault("AI_BOUND_CONTENT", 403)
        spec.update({**request.model_dump(mode="json", exclude={"base_version", "edit_origin"}), "package": package})
        spec["version"] += 1
        return self._preview(actor, validated(PageDocument, stamp_binding_state(spec)), "SAVE",
                             request.base_version)

    def rollback(self, actor, page_id, request: PageRollbackPreview):
        self._base(actor, page_id, request.base_version)
        with self._read() as con:
            snapshot, _scopes = self._revision(con, actor, page_id, request.to_version)
        spec = {**snapshot["spec"], "version": request.base_version + 1}
        return self._preview(actor, validated(PageDocument, stamp_binding_state(spec)), "ROLLBACK",
                             request.base_version)

    def _draft_row(self, con, actor, preview_id):
        opaque(preview_id, label="preview_id")
        row = con.execute("SELECT * FROM previews WHERE owner=? AND preview_id=?",
                          (actor.actor_id, preview_id)).fetchone()
        if row is None:
            raise fault("NOT_FOUND", 404)
        return row

    def preview(self, actor, preview_id):
        self._access(actor)
        with self._read() as con:
            row = self._draft_row(con, actor, preview_id)
            snapshot, _ = self._decode(actor, row, version=row["base_version"] + 1)
        return {"preview_id": preview_id, "status": row["status"], "operation": row["operation"],
                "base_version": row["base_version"], "expires_at_ms": row["expires_ms"], "snapshot": snapshot}

    def cancel(self, actor, preview_id):
        self._access(actor, write=True)
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            row = self._draft_row(con, actor, preview_id)
            self._decode(actor, row, version=row["base_version"] + 1)
            if row["status"] == "APPLIED":
                raise fault()
            con.execute("UPDATE previews SET status='CANCELLED' WHERE owner=? AND preview_id=?",
                        (actor.actor_id, preview_id))
        return {"preview_id": preview_id, "status": "CANCELLED"}

    def confirm(self, actor, preview_id, key):
        self._access(actor, write=True)
        key = validate_key(key)
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            row = self._draft_row(con, actor, preview_id)
            version = row["base_version"] + 1
            snapshot, _ = self._decode(actor, row, version=version)
            receipt = con.execute("SELECT preview_id FROM receipts WHERE owner=? AND key=?",
                                  (actor.actor_id, key)).fetchone()
            if receipt is not None and receipt["preview_id"] != preview_id:
                raise fault("IDEMPOTENCY_CONFLICT")
            if row["status"] == "APPLIED":
                saved, _ = self._revision(con, actor, row["page_id"], version)
                con.execute("INSERT OR IGNORE INTO receipts VALUES (?,?,?)", (actor.actor_id, key, preview_id))
                return saved
            if row["status"] == "CANCELLED":
                raise fault("PREVIEW_CANCELLED")
            if self.clock() >= row["expires_ms"]:
                raise fault("PREVIEW_EXPIRED")
            if row["base_version"]:
                if self._head(con, actor, row["page_id"]) != row["base_version"]:
                    raise fault()
                con.execute("UPDATE heads SET version=? WHERE owner=? AND page_id=?",
                            (version, actor.actor_id, row["page_id"]))
            else:
                con.execute("INSERT INTO heads VALUES (?,?,?)", (actor.actor_id, row["page_id"], version))
            con.execute("INSERT INTO revisions VALUES (?,?,?,?,?,?,?)", (actor.actor_id, row["page_id"], version,
                        row["operation"], self.clock(), row["payload"], row["digest"]))
            con.execute("UPDATE previews SET status='APPLIED' WHERE owner=? AND preview_id=?",
                        (actor.actor_id, preview_id))
            con.execute("INSERT INTO receipts VALUES (?,?,?)", (actor.actor_id, key, preview_id))
            return snapshot
