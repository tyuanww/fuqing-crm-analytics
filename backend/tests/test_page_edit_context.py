"""Server-owned edit context and the three-channel patch gate."""
from pathlib import Path
import json
import sqlite3

from fastapi.testclient import TestClient
import pytest

from backend.contracts.competition_computed import DATA_SCOPE
from backend.contracts.page_documents import HTML_MAX_CHARS, PageDraft, PagePatchPreview
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.page_documents import PageDocumentStore, ResolvedPageBinding
from backend.services.analytics.page_documents_routes import PREFIX, create_page_app
from backend.services.analytics.page_edit_context import (
    PageEditContextStore, byte_region_hash, package_source_hash, scan_markers, t1_contract_ready,
)
from backend.services.analytics.page_edit_context_routes import PREFIX as EDIT_PREFIX

CAPS = frozenset({"analysis:read", "analysis:save", "dashboard:read", "dashboard:update"})
TOKEN = "edit-context-isolated-test-token-32"
BOB_TOKEN = "edit-context-bob-isolated-token-32xx"
HTML = (
    '<!doctype html><html><body>'
    '<h1 data-shine-node="n_title">示例标题</h1>'
    '<p data-shine-node="n_lede">导语</p>'
    '</body></html>'
)
JS = """document.querySelector('[data-shine-node="n_title"]');"""


class Clock:
    def __init__(self):
        self.t = 1_700_000_000_000

    def __call__(self):
        return self.t


def principal(actor_id="alice", *extra, tenant="brand-a"):
    return AnalyticsPrincipal(actor_id, CAPS | frozenset(extra), frozenset({DATA_SCOPE, f"tenant:{tenant}"}))


def private(path: Path):
    path.mkdir(mode=0o700)
    path.chmod(0o700)
    return path


def package(**overrides):
    body = {
        "html": HTML,
        "css": "",
        "js": JS,
        "resources": [],
        "node_map": [
            {"node_id": "n_title", "kind": "static_element", "selector": "[data-shine-node='n_title']"},
            {"node_id": "n_lede", "kind": "static_element", "selector": "[data-shine-node='n_lede']"},
        ],
    }
    body.update(overrides)
    return body


def region(node_id="n_title"):
    marker = next(item for item in scan_markers(HTML) if item["node_id"] == node_id and item["attr"] == "node")
    return HTML[marker["start"]:marker["end"]]


def operation(channel, payload, key, *, context, node_id=None, source_hash=None, region_hash=None,
              base_version=None, encoding=None, action="update", capabilities=None):
    node = dict(context["selected_node"])
    if node_id is not None:
        node["node_id"] = node_id
    if source_hash is not None:
        node["source_hash"] = source_hash
    if region_hash is not None:
        node["region_hash"] = region_hash
    version = context["version"] if base_version is None else base_version
    scope = {"page_id": node["page_id"], "node_id": node["node_id"]}
    if node.get("source_range") is not None:
        scope["source_range"] = node["source_range"]
    formal_encoding = encoding or ("overlay" if channel == "presentation" else "bytes")
    body = {
        "schema_version": "free-page-edit/v1",
        "operation_id": "op_" + key[:24],
        "channel": channel,
        "action": action,
        "selected_scope": scope,
        "capabilities": capabilities or [f"edit:{channel}"],
        "node": node,
        "cas": {
            "base_version": version,
            "source_hash": node["source_hash"],
            "region_hash": node["region_hash"],
            "idempotency_key": key,
        },
        "encoding": formal_encoding,
        "byte_length": len(payload.encode()) if isinstance(payload, str) else 0,
    }
    if formal_encoding == "bytes":
        body["payload"] = payload
        body["splice"] = dict(node["source_range"])
        body["expected_region_hash"] = node["region_hash"]
    elif payload is not None:
        body["payload"] = payload
    return body


def boot(tmp_path, *, actor=None, binding=None, resolve=False):
    actor = actor or principal()
    clock = Clock()
    directory = private(tmp_path / "state")
    pages = PageDocumentStore(directory, clock=clock, resolve_binding=(
        (lambda _actor, _session, _ref: ResolvedPageBinding("VERIFIED", frozenset({DATA_SCOPE}))) if resolve else None
    ))
    manifest = binding or {"bindings": [], "result_refs": []}
    draft = PageDraft.model_validate({
        "title": "编辑上下文", "session_id": "sess_edit", "package": package(), "binding_manifest": manifest,
    })
    preview = pages.generate(actor, draft)
    saved = pages.confirm(actor, preview["preview_id"], "create-page")
    edits = PageEditContextStore(directory, pages, clock=clock)
    return actor, clock, pages, edits, saved["spec"]


def open_context(edits, actor, page_id, **extra):
    return edits.create(actor, {"page_id": page_id, "node_id": "n_title", "kind": "static_element", **extra})


def test_t1_contract_is_ready_and_marker_region_is_stable():
    assert t1_contract_ready() is True
    assert region() == '<h1 data-shine-node="n_title">示例标题</h1>'


def test_context_binds_server_identity_and_native_handoff_is_only_the_id(tmp_path):
    actor, _clock, _pages, edits, spec = boot(tmp_path)
    with pytest.raises(AnalyticsError, match="INVALID_EDIT"):
        open_context(edits, actor, spec["page_id"], capabilities=["edit:logic"])
    created = open_context(edits, actor, spec["page_id"])
    assert created["user_id"] == "alice"
    assert created["tenant_id"] == "brand-a"
    assert created["page_id"] == spec["page_id"]
    assert created["base_version"] == spec["version"] == created["version"]
    assert created["selected_node"]["node_id"] == "n_title"
    assert created["selected_node"]["page_id"] == spec["page_id"]
    assert created["selected_node"]["source_range"]["end"] > created["selected_node"]["source_range"]["start"]
    assert "channel" not in created["selected_node"]
    assert created["source_hash"] == package_source_hash(HTML, "", JS)
    assert created["region_hash"] == byte_region_hash(region())
    assert created["ttl_ms"] > 0
    assert created["expires_at"] == created["created_at"] + created["ttl_ms"]
    assert "edit:presentation" in created["capabilities"]
    assert "edit:source" in created["capabilities"]
    assert "edit:logic" not in created["capabilities"]
    handoff = edits.native_handoff(actor, created["edit_context_id"])
    assert set(handoff) == {"context_id"}
    assert handoff["context_id"] == created["edit_context_id"]


def test_presentation_source_and_logic_success_and_rejections(tmp_path):
    actor, _clock, pages, edits, spec = boot(tmp_path)
    created = open_context(edits, actor, spec["page_id"])
    context_id = created["edit_context_id"]

    presentation = edits.apply(actor, context_id, operation(
        "presentation", {"text": "新标题", "style": {"color": "#111"}}, "present", context=created,
    ), "present")
    assert presentation["source_bytes_unchanged"] is True
    assert presentation["working_copy"]["html"] == HTML
    saved = edits.confirm(actor, context_id, presentation["preview_id"], "present-save")
    assert saved["saved_version"] == 2
    assert saved["package"]["html"] == HTML
    assert saved["package"]["js"] == JS
    assert edits.overlay(actor, spec["page_id"], 1) == {}
    assert edits.overlay(actor, spec["page_id"], 2)["n_title"]["text"] == "新标题"
    again = edits.confirm(actor, context_id, presentation["preview_id"], "present-save")
    assert again["replayed"] is True and again["saved_version"] == 2
    recovered = edits.recover(actor, context_id, presentation["preview_id"])
    assert recovered["recovered"] is True and recovered["receipt_pending"] is True
    assert edits.acknowledge(actor, context_id, presentation["preview_id"])["receipt_pending"] is False
    assert pages.get(actor, spec["page_id"])["spec"]["version"] == 2
    assert pages.get(actor, spec["page_id"])["spec"]["package"]["html"] == HTML

    current = open_context(edits, actor, spec["page_id"])
    source_payload = region().replace("示例标题", "精确标题")
    sourced = edits.apply(actor, current["edit_context_id"], operation(
        "source", source_payload, "source", context=current, base_version=current["base_version"],
    ), "source")
    assert sourced["html_bytes_unchanged"] is False
    assert sourced["working_copy"]["html"].startswith(HTML[:HTML.index("<h1")])
    assert "精确标题" in sourced["working_copy"]["html"] and "导语" in sourced["working_copy"]["html"]
    assert sourced["working_copy"]["js"] == JS
    source_saved = edits.confirm(actor, current["edit_context_id"], sourced["preview_id"], "source-save")
    assert source_saved["saved_version"] == 3
    assert source_saved["package"]["html"] == sourced["working_copy"]["html"]
    replayed_confirm = edits.confirm(actor, current["edit_context_id"], sourced["preview_id"], "source-save")
    assert replayed_confirm["replayed"] is True
    assert pages.get(actor, spec["page_id"])["spec"]["version"] == 3

    logic_actor = principal("alice", "page:logic")
    latest = open_context(edits, logic_actor, spec["page_id"], channel="logic")
    denied = operation("logic", JS + "/*ok*/", "logic-deny", context=latest, base_version=latest["base_version"])
    with pytest.raises(AnalyticsError, match="CAPABILITY_DENIED"):
        edits.apply(actor, latest["edit_context_id"], denied, "logic-deny")
    with pytest.raises(AnalyticsError, match="SCOPE_VIOLATION"):
        edits.apply(logic_actor, latest["edit_context_id"], operation(
            "logic", """document.querySelector('[data-shine-node="n_lede"]');""", "logic-outside",
            context=latest, base_version=latest["base_version"],
        ), "logic-outside")
    allowed = edits.apply(logic_actor, latest["edit_context_id"], operation(
        "logic", JS + "/*ok*/", "logic-ok", context=latest, base_version=latest["base_version"],
    ), "logic-ok")
    assert allowed["html_bytes_unchanged"] is True
    assert allowed["working_copy"]["html"] == source_saved["package"]["html"]
    assert allowed["working_copy"]["js"].endswith("/*ok*/")
    logic_saved = edits.confirm(logic_actor, latest["edit_context_id"], allowed["preview_id"], "logic-save")
    assert logic_saved["package"]["html"] == source_saved["package"]["html"]
    assert logic_saved["package"]["js"].endswith("/*ok*/")


def test_server_rechecks_context_loss_scope_and_patch_failures(tmp_path):
    actor, clock, pages, edits, spec = boot(tmp_path)
    created = open_context(edits, actor, spec["page_id"], ttl_ms=1_000)
    context_id = created["edit_context_id"]

    def present(key, text="新标题", **extra):
        return operation(
            "presentation", {"text": text}, key, context=created,
            base_version=created["base_version"], **extra,
        )

    with pytest.raises(AnalyticsError, match="UNAUTHORIZED_CONTEXT"):
        edits.apply(principal("bob"), context_id, present("bob"), "bob")
    with pytest.raises(AnalyticsError, match="UNAUTHORIZED_CONTEXT"):
        edits.apply(principal(tenant="brand-b"), context_id, present("tenant"), "tenant")
    with pytest.raises(AnalyticsError, match="CROSS_SCOPE"):
        edits.apply(actor, context_id, present("page"), "page", page_id="page_other")
    with pytest.raises(AnalyticsError, match="NOT_FOUND"):
        edits.apply(actor, "editctx_" + "0" * 32, present("missing"), "missing")

    first = edits.apply(actor, context_id, present("same", "一次"), "same")
    replay = edits.apply(actor, context_id, present("same", "一次"), "same")
    assert replay["replayed"] is True and replay["preview_id"] == first["preview_id"]
    with pytest.raises(AnalyticsError, match="IDEMPOTENCY_CONFLICT"):
        edits.apply(actor, context_id, present("same", "另一次"), "same")
    with pytest.raises(AnalyticsError, match="INVALID_EDIT"):
        edits.apply(actor, context_id, operation(
            "presentation", {}, "empty", context=created, base_version=created["base_version"],
        ), "empty")
    with pytest.raises(AnalyticsError, match="IDEMPOTENCY_CONFLICT"):
        edits.apply(actor, context_id, present("empty", "补救"), "empty")
    with pytest.raises(AnalyticsError, match="SCOPE_VIOLATION"):
        edits.apply(actor, context_id, operation(
            "presentation", {"text": "越界"}, "scope", context=created, node_id="n_lede",
            base_version=created["base_version"],
        ), "scope")
    with pytest.raises(AnalyticsError, match="INVALID_EDIT"):
        edits.apply(actor, context_id, {"schema_version": "nope", "action": "MOVE"}, "illegal")
    with pytest.raises(AnalyticsError, match="CAPABILITY_DENIED"):
        edits.apply(actor, context_id, {**present("caps"), "capabilities": ["edit:logic"]}, "caps")
    with pytest.raises(AnalyticsError, match="DANGEROUS_CONTENT"):
        edits.apply(actor, context_id, operation(
            "presentation", {"text": "<script>alert(1)</script>"}, "script",
            context=created, base_version=created["base_version"],
        ), "script")
    huge = "A" * HTML_MAX_CHARS
    with pytest.raises(AnalyticsError, match="PACKAGE_TOO_LARGE"):
        edits.apply(actor, context_id, operation(
            "source", f'<h1 data-shine-node="n_title">{huge}</h1>', "huge",
            context=created, base_version=created["base_version"],
        ), "huge")
    with pytest.raises(AnalyticsError, match="HASH_MISMATCH") as stale:
        edits.apply(actor, context_id, operation(
            "source", region().replace("示例标题", "精确标题"), "stale",
            context=created, region_hash="c" * 64, base_version=created["base_version"],
        ), "stale")
    assert stale.value.recovery_url == "page-edit:redownload,reselect,reapply"
    with pytest.raises(AnalyticsError, match="NOT_FOUND"):
        edits.native_handoff(actor, context_id)

    fresh = open_context(edits, actor, spec["page_id"])
    bumped = pages.patch(actor, spec["page_id"], PagePatchPreview.model_validate({
        "base_version": pages.get(actor, spec["page_id"])["spec"]["version"],
        "package": package(html=HTML.replace("示例标题", "已发布")),
    }))
    pages.confirm(actor, bumped["preview_id"], "other-writer")
    with pytest.raises(AnalyticsError, match="VERSION_CONFLICT") as conflict:
        edits.apply(actor, fresh["edit_context_id"], operation(
            "presentation", {"text": "太晚"}, "after-version",
            context=fresh, base_version=fresh["base_version"],
        ), "after-version")
    assert conflict.value.message == "页面版本已变化，请重新下载、重新选择、重新应用。"
    assert conflict.value.recovery_url == "page-edit:redownload,reselect,reapply"
    with pytest.raises(AnalyticsError, match="NOT_FOUND"):
        edits.native_handoff(actor, fresh["edit_context_id"])
    refreshed = open_context(edits, actor, spec["page_id"])
    assert refreshed["base_version"] != created["base_version"]
    redone = edits.apply(actor, refreshed["edit_context_id"], operation(
        "presentation", {"text": "重新应用"}, "redone",
        context=refreshed, base_version=refreshed["base_version"],
    ), "redone")
    assert redone["ok"] is True

    expiring = open_context(edits, actor, spec["page_id"], ttl_ms=1_000)
    clock.t += 1_000
    with pytest.raises(AnalyticsError, match="EDIT_EXPIRED"):
        edits.native_handoff(actor, expiring["edit_context_id"])


def test_cas_conflict_clears_context_and_leaves_versions_append_only(tmp_path):
    actor, _clock, pages, edits, spec = boot(tmp_path)
    page_id = spec["page_id"]
    opened = pages.patch(actor, page_id, PagePatchPreview.model_validate({
        "base_version": 1,
        "package": package(html=HTML.replace("示例标题", "未保存预览")),
    }))
    assert pages.cancel(actor, opened["preview_id"])["status"] == "CANCELLED"
    with pytest.raises(AnalyticsError, match="PREVIEW_CANCELLED"):
        pages.confirm(actor, opened["preview_id"], "cancel-key")
    assert [item["version"] for item in pages.history(actor, page_id)] == [1]
    assert pages.history(actor, page_id)[0]["operation"] == "GENERATE"
    assert "示例标题" in pages.get(actor, page_id, 1)["spec"]["package"]["html"]
    assert "未保存预览" not in pages.get(actor, page_id, 1)["spec"]["package"]["html"]
    assert edits.overlay(actor, page_id, 1) == {}

    created = open_context(edits, actor, page_id)
    applied = edits.apply(actor, created["edit_context_id"], operation(
        "presentation", {"text": "会话里的字"}, "pending-present",
        context=created, base_version=created["base_version"],
    ), "pending-present")
    assert edits.overlay(actor, page_id, 1) == {}
    bumped = pages.patch(actor, page_id, PagePatchPreview.model_validate({
        "base_version": 1,
        "package": package(html=HTML.replace("示例标题", "已发布")),
    }))
    pages.confirm(actor, bumped["preview_id"], "other-writer")
    with pytest.raises(AnalyticsError, match="VERSION_CONFLICT"):
        edits.confirm(actor, created["edit_context_id"], applied["preview_id"], "too-late")
    with pytest.raises(AnalyticsError, match="NOT_FOUND"):
        edits.native_handoff(actor, created["edit_context_id"])
    history = pages.history(actor, page_id)
    assert [item["version"] for item in history] == [2, 1]
    assert [item["operation"] for item in history] == ["PATCH", "GENERATE"]
    assert "示例标题" in pages.get(actor, page_id, 1)["spec"]["package"]["html"]
    assert "已发布" in pages.get(actor, page_id, 2)["spec"]["package"]["html"]
    refreshed = open_context(edits, actor, page_id)
    redone = edits.apply(actor, refreshed["edit_context_id"], operation(
        "presentation", {"text": "重新应用"}, "redone-after-conflict",
        context=refreshed, base_version=refreshed["base_version"],
    ), "redone-after-conflict")
    assert redone["ok"] is True
    assert [item["version"] for item in pages.history(actor, page_id)] == [2, 1]


def test_bound_node_is_denied_unless_capability_explicitly_allows_it(tmp_path):
    actor, _clock, _pages, edits, spec = boot(tmp_path, resolve=True, binding={
        "bindings": [{"binding_id": "bind_title", "result_ref": "result_1", "node_id": "n_title"}],
        "result_refs": ["result_1"],
    })
    created = open_context(edits, actor, spec["page_id"])
    assert created["capabilities"] == []
    stored = json.loads(sqlite3.connect(edits.path).execute("SELECT body FROM edit_contexts").fetchone()[0])
    assert stored["contract"]["capabilities"] == []
    assert stored["granted"] == []
    assert "edit:bound-denied" not in json.dumps(stored)
    with pytest.raises(AnalyticsError, match="BOUND_NODE"):
        edits.apply(actor, created["edit_context_id"], operation(
            "presentation", {"text": "不能改"}, "bound", context=created,
        ), "bound")
    allowed_actor = principal("alice", "page:edit-bound")
    allowed_context = open_context(edits, allowed_actor, spec["page_id"])
    assert "node:bound" in allowed_context["capabilities"]
    applied = edits.apply(allowed_actor, allowed_context["edit_context_id"], operation(
        "presentation", {"text": "授权覆写"}, "bound-ok", context=allowed_context,
    ), "bound-ok")
    assert applied["source_bytes_unchanged"] is True


def test_recomputed_capability_ignores_an_earlier_grant(tmp_path):
    logic_actor = principal("alice", "page:logic")
    _actor, _clock, _pages, edits, spec = boot(tmp_path, actor=logic_actor)
    created = open_context(edits, logic_actor, spec["page_id"], channel="logic")
    assert "edit:logic" in created["capabilities"]
    with pytest.raises(AnalyticsError, match="CAPABILITY_DENIED"):
        edits.apply(principal(), created["edit_context_id"], operation(
            "logic", JS + "/*ok*/", "recompute", context=created, base_version=created["base_version"],
        ), "recompute")


def test_http_context_rejects_client_capabilities_and_other_users(tmp_path):
    registry = B0IdentityRegistry()
    alice = principal()
    registry.grant(TOKEN, alice)
    registry.grant(BOB_TOKEN, principal("bob"))
    directory = private(tmp_path / "http")
    headers = {"Authorization": "Bearer " + TOKEN}
    with TestClient(create_page_app(identities=registry, page_state_dir=directory)) as client:
        created = client.post(PREFIX + "/previews", headers=headers, json={
            "title": "编辑上下文", "session_id": "sess_edit", "package": package(),
            "binding_manifest": {"bindings": [], "result_refs": []},
        })
        assert created.status_code == 201, created.text
        saved = client.post(PREFIX + "/previews/" + created.json()["preview_id"] + "/confirm",
                            headers={**headers, "Idempotency-Key": "save-page"})
        assert saved.status_code == 200, saved.text
        page_id = saved.json()["spec"]["page_id"]
        forged = client.post(EDIT_PREFIX, headers=headers, json={
            "page_id": page_id, "node_id": "n_title", "kind": "static_element",
            "capabilities": ["edit:logic"],
        })
        assert forged.status_code == 422 and forged.json()["error"]["code"] == "INVALID_EDIT"
        context = client.post(EDIT_PREFIX, headers=headers, json={
            "page_id": page_id, "node_id": "n_title", "kind": "static_element",
        })
        assert context.status_code == 201, context.text
        body = context.json()
        assert body["base_version"] == saved.json()["spec"]["version"]
        assert "edit:logic" not in body["capabilities"]
        assert "channel" not in body["selected_node"]
        overlay = client.get(EDIT_PREFIX + "/overlay", headers=headers, params={"page_id": page_id, "version": 1})
        assert overlay.status_code == 200, overlay.text
        assert overlay.json()["overlays"] == {}
        handoff = client.post(EDIT_PREFIX + "/" + body["edit_context_id"] + "/native", headers=headers)
        assert handoff.status_code == 200
        assert handoff.json() == {"context_id": body["edit_context_id"]}
        foreign = client.post(
            EDIT_PREFIX + "/" + body["edit_context_id"] + "/patches",
            headers={"Authorization": "Bearer " + BOB_TOKEN, "Idempotency-Key": "bob"},
            json=operation("presentation", {"text": "别人"}, "bob", context=body),
        )
        assert foreign.status_code == 403
        assert foreign.json()["error"]["code"] == "UNAUTHORIZED_CONTEXT"


def test_replace_and_overlay_delete_use_formal_actions(tmp_path):
    actor, _clock, pages, edits, spec = boot(tmp_path)
    created = open_context(edits, actor, spec["page_id"])
    replaced = edits.apply(actor, created["edit_context_id"], operation(
        "source", region().replace("示例标题", "替换标题"), "replace-title", context=created, action="replace",
    ), "replace-title")
    assert "替换标题" in replaced["working_copy"]["html"]
    assert "导语" in replaced["working_copy"]["html"]
    edits.confirm(actor, created["edit_context_id"], replaced["preview_id"], "replace-save")
    assert "替换标题" in pages.get(actor, spec["page_id"])["spec"]["package"]["html"]

    presented_context = open_context(edits, actor, spec["page_id"])
    presented = edits.apply(actor, presented_context["edit_context_id"], operation(
        "presentation", {"text": "旁路标题"}, "overlay-title", context=presented_context,
    ), "overlay-title")
    saved = edits.confirm(actor, presented_context["edit_context_id"], presented["preview_id"], "overlay-save")
    assert edits.overlay(actor, spec["page_id"], saved["saved_version"])["n_title"]["text"] == "旁路标题"
    assert "替换标题" in pages.get(actor, spec["page_id"])["spec"]["package"]["html"]

    deleting = open_context(edits, actor, spec["page_id"])
    removed = edits.apply(actor, deleting["edit_context_id"], operation(
        "presentation", None, "overlay-delete", context=deleting, action="delete",
    ), "overlay-delete")
    assert removed["clear_overlay"] is True
    edits.confirm(actor, deleting["edit_context_id"], removed["preview_id"], "overlay-delete-save")
    assert edits.overlay(actor, spec["page_id"], saved["saved_version"])["n_title"]["text"] == "旁路标题"
    assert "n_title" not in edits.overlay(actor, spec["page_id"], saved["saved_version"] + 1)
