"""Free-page persistence with isolated SQLite. Not a BoardSpec mock."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
import json
import hashlib
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from threading import Barrier, Event

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from backend.contracts.board_spec import BoardDraft
from backend.contracts.competition_computed import DATA_SCOPE
from backend.contracts.page_documents import (
    FORBIDDEN_BRIDGE_OPS, PACKAGE_MAX_BYTES, PAGE_ERRORS, PageBindingManifest, PageDataReadRequest,
    PageDocument, PageDraft, PagePackage, PagePatchPreview, PageRollbackPreview, PageSavePreview,
    SCHEMA_VERSION, is_package_too_large, page_documents_openapi, page_source_hash,
)
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.board_documents import BoardDocumentStore
from backend.services.analytics.page_documents import PageDocumentStore, ResolvedPageBinding
from backend.services.analytics.page_documents_routes import PREFIX, create_page_app

ROOT = Path(__file__).resolve().parents[2]
CAPS = frozenset({"analysis:read", "analysis:save", "dashboard:read", "dashboard:update"})
ALICE = AnalyticsPrincipal("alice", CAPS, frozenset({DATA_SCOPE, "brand-a"}))
BOB = AnalyticsPrincipal("bob", CAPS, ALICE.data_scopes)
TOKEN = "library-page-isolated-test-token-32chars"
FROZEN = json.loads((ROOT / "docs/hackathon/free-html-cockpit/fixtures/frozen-contract-v0.json").read_text())


def private(path):
    path.mkdir(mode=0o700)
    return path


def sample_package(**overrides):
    body = deepcopy(FROZEN["asset"]["package"])
    body.update(overrides)
    return body


def draft(**overrides):
    body = {"title": FROZEN["asset"]["title"], "session_id": FROZEN["asset"]["session_id"],
            "package": sample_package(), "binding_manifest": deepcopy(FROZEN["asset"]["binding_manifest"])}
    body.update(overrides)
    return PageDraft.model_validate(body)


def confirm(store, preview, key="confirm"):
    return store.confirm(ALICE, preview["preview_id"], key)


def source_hash(package):
    raw = f"html:{package['html']}\0css:{package.get('css', '')}\0js:{package.get('js', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()


def source_patch(base_version, old_package, new_package, *, scope="exact_source_range", ranges=None):
    html_start = old_package["html"].index("<h1")
    html_end = old_package["html"].index("</h1>") + len("</h1>")
    digest = source_hash(old_package)
    mapping_token = hashlib.sha256(f"{digest}:n_title:{html_start}:{html_end}".encode()).hexdigest()[:32]
    return PagePatchPreview.model_validate({
        "base_version": base_version,
        "package": new_package,
        "edit_scope": "source_range",
        "edit_context_id": "ctx_fixture",
        "source_hash": source_hash(old_package),
        "focus_ref": {
            "node_id": "n_title", "kind": "static_element", "allowed_scope": scope,
            "allowed_ranges": ranges or [{"file": "html", "start": html_start, "end": html_end}],
            "mapping_token": mapping_token, "version_hash": digest,
        },
    })


def test_frozen_fixture_is_the_lane_a_target():
    assert FROZEN["approved_plan_sha256"] == "47fa5bfe482cb9bd93f4f02a7c62c6933d0242b5204ea95f2b912edc603a6ffb"
    assert FROZEN["asset"]["schema_version"] == SCHEMA_VERSION
    assert FROZEN["asset"]["binding_states"] == ["UNBOUND_SAMPLE", "BOUND_VERIFIED", "BOUND_STALE"]
    assert FROZEN["operations"] == ["GENERATE", "PATCH", "SAVE", "ROLLBACK"]
    assert FROZEN["errors"]["INVALID_PAGE"] == 422
    assert "INVALID_BOARD" not in FROZEN["errors"]
    PageDocument.model_validate({
        "schema_version": SCHEMA_VERSION, "page_id": FROZEN["asset"]["page_id"],
        "session_id": FROZEN["asset"]["session_id"], "title": FROZEN["asset"]["title"],
        "version": 1, "binding_state": "UNBOUND_SAMPLE",
        "package": FROZEN["asset"]["package"], "binding_manifest": FROZEN["asset"]["binding_manifest"],
    })


def test_uploaded_html_has_explicit_file_origin_without_fabricating_a_session():
    body = {"title": "Manual report", "session_id": None, "origin_file_id": "file_uploaded",
            "origin_path": "report.html", "package": {"html": "<h1>Uploaded</h1>"}}
    parsed = PageDraft.model_validate(body)
    assert parsed.session_id is None
    assert parsed.origin_file_id == "file_uploaded"
    with pytest.raises(ValidationError):
        PageDraft.model_validate({**body, "origin_file_id": None})
    with pytest.raises(ValidationError):
        PageDraft.model_validate({**body, "binding_manifest": {"bindings": [], "result_refs": ["real_result"]}})


def test_bound_node_must_exist_in_page_mapping():
    body = {
        "title": "Bound report",
        "session_id": "native_session_fixture",
        "package": {
            "html": '<h1 data-shine-node="n_title">标题</h1>',
            "node_map": [{
                "node_id": "n_title",
                "kind": "static_element",
                "selector": "[data-shine-node='n_title']",
            }],
        },
        "binding_manifest": {
            "result_refs": ["result_fixture_1"],
            "bindings": [{
                "binding_id": "bind_1",
                "result_ref": "result_fixture_1",
                "node_id": "n_missing",
            }],
        },
    }
    with pytest.raises(ValidationError, match="node_id"):
        PageDraft.model_validate(body)


def presentation_binding(*_):
    return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))


def bound_presentation_draft(html=None):
    return draft(package={
        "html": html or '<section id="report"><h1 id="heading">Title</h1>'
        '<div id="amount" data-shine-node="amount"><span id="value">100</span></div>'
        '<p id="advice">Advice</p></section>',
        "node_map": [{"node_id": "amount", "kind": "static_element",
                      "selector": '[data-shine-node="amount"]'}],
    }, binding_manifest={"result_refs": ["result_fixture"], "bindings": [
        {"binding_id": "binding_fixture", "result_ref": "result_fixture", "node_id": "amount"}]})


def presentation_package(package, *edits):
    changed = deepcopy(package)
    changed["presentation"] = {
        "version": 1, "source_hash": page_source_hash(changed["html"], changed.get("css", ""), changed.get("js", "")),
        "edits": list(edits),
    }
    return changed


def text_edit(identity, text="999", *, attribute="id", path=None):
    return {"target": {"anchor": {"attribute": attribute, "value": identity}, "path": path or []}, "text": text}


def test_bound_presentation_save_cannot_override_verified_amount(tmp_path):
    store = PageDocumentStore(private(tmp_path / "bound-presentation"), resolve_binding=presentation_binding)
    saved = confirm(store, store.generate(ALICE, bound_presentation_draft()))["spec"]
    request = PageSavePreview.model_validate({
        "base_version": 1, "title": saved["title"], "binding_manifest": saved["binding_manifest"],
        "package": presentation_package(saved["package"], text_edit("amount")),
    })
    with pytest.raises(AnalyticsError) as error:
        store.save(ALICE, saved["page_id"], request)
    assert error.value.code == "AI_BOUND_CONTENT"
    assert store.get(ALICE, saved["page_id"])["spec"] == saved


@pytest.mark.parametrize("target", [
    text_edit("amount"), text_edit("amount", ""), text_edit("report"), text_edit("value"),
    text_edit("report", path=[{"tag": "div"}]),
    text_edit("report", path=[{"tag": "div", "key": {"attribute": "id", "value": "amount"}}]),
    text_edit("report", path=[{"tag": "div", "key": {"attribute": "nth", "value": "0"}}]),
    text_edit("report", path=[{"tag": "div", "key": {"attribute": "text", "value": "100"}}]),
    text_edit("report", path=[{"tag": "div", "key": {"attribute": "class", "value": "fact"}}]),
    text_edit("metric", attribute="data-node"),
    text_edit("metric", attribute="data-page-field"),
    text_edit("metric", attribute="data-page-block"),
])
@pytest.mark.parametrize("operation", ["generate", "save", "patch"])
def test_bound_presentation_rejects_fact_and_relative_targets(tmp_path, target, operation):
    store = PageDocumentStore(private(tmp_path / "bound-relative"), resolve_binding=presentation_binding)
    body = bound_presentation_draft().model_dump(mode="json")
    body["package"]["html"] = body["package"]["html"].replace(
        'id="amount"', 'id="amount" class="fact" data-node="metric" data-page-field="metric" data-page-block="metric"')
    if operation != "generate":
        spec = confirm(store, store.generate(ALICE, PageDraft.model_validate(body)))["spec"]
        body["package"] = spec["package"]
    changed = presentation_package(body["package"], target)
    with pytest.raises(AnalyticsError) as error:
        if operation == "generate":
            store.generate(ALICE, PageDraft.model_validate({**body, "package": changed}))
        elif operation == "patch":
            store.patch(ALICE, spec["page_id"], PagePatchPreview(base_version=1, package=changed))
        else:
            store.save(ALICE, spec["page_id"], PageSavePreview(
                base_version=1, title=spec["title"], package=changed, binding_manifest=spec["binding_manifest"]))
    assert error.value.code == "AI_BOUND_CONTENT"
    with closing(sqlite3.connect(store.path)) as con:
        assert con.execute("SELECT count(*) FROM previews").fetchone()[0] == (0 if operation == "generate" else 1)
        assert con.execute("SELECT count(*) FROM revisions").fetchone()[0] == (0 if operation == "generate" else 1)


@pytest.mark.parametrize("step", [
    {"tag": "h1"},
    *({"tag": "h1", "key": {"attribute": attribute, "value": value}} for attribute, value in [
        ("id", "heading"), ("data-node", "heading"), ("data-page-field", "heading"),
        ("data-page-block", "heading"), ("class", "heading"), ("text", "A & B"), ("nth", "0")]),
])
def test_bound_presentation_independent_text_and_styles_survive_reopen(tmp_path, step):
    store = PageDocumentStore(private(tmp_path / "bound-independent"), resolve_binding=presentation_binding)
    body = bound_presentation_draft().model_dump(mode="json")
    body["package"]["html"] = ('<!doctype html><html><head><title>Report</title>'
        '<style>h1{color:blue}</style><script>window.label="<span>not a node</span>";</script>'
        '</head><body>' + body["package"]["html"].replace(
        'id="heading">Title', 'id="heading" data-node="heading" data-page-field="heading" '
        'data-page-block="heading" class="large heading">A &amp; B') + '</body></html>')
    spec = confirm(store, store.generate(ALICE, PageDraft.model_validate(body)))["spec"]
    edits = [text_edit("report", "Updated heading", path=[step]), text_edit("advice", "Updated advice"),
             {"target": text_edit("amount")["target"], "style": {"color": "blue"}}]
    changed = presentation_package(spec["package"], *edits)
    preview = store.save(ALICE, spec["page_id"], PageSavePreview(
        base_version=1, title=spec["title"], package=changed, binding_manifest=spec["binding_manifest"]))
    confirm(store, preview, "save-independent")
    reopened = PageDocumentStore(store.path.parent, resolve_binding=presentation_binding).get(ALICE, spec["page_id"])["spec"]
    assert reopened["version"] == 2 and reopened["binding_state"] == "BOUND_VERIFIED"
    assert reopened["package"]["html"] == spec["package"]["html"]
    assert [edit["text"] for edit in reopened["package"]["presentation"]["edits"]] == ["Updated heading", "Updated advice", None]
    changed = deepcopy(reopened["package"])
    changed["css"] = "h1 { color: red }"
    changed["presentation"]["source_hash"] = page_source_hash(changed["html"], changed["css"], changed["js"])
    saved = confirm(store, store.save(ALICE, spec["page_id"], PageSavePreview(
        base_version=2, title=spec["title"], package=changed, binding_manifest=spec["binding_manifest"])), "restyle")
    assert saved["spec"]["version"] == 3


@pytest.mark.parametrize("case", [
    "missing-marker", "duplicate-marker", "missing-node-id", "whole-page", "unsupported-selector",
    "refs-only", "unmapped-ref", "nonvoid-slash", "implicit-close", "table-foster", "foreign",
    "rawtext", "duplicate-attribute", "duplicate-anchor", "missing-target", "readonly", "database",
    "duplicate-body", "late-head", "implicit-tbody", "ambiguous-child", "shell-anchor", "head-binding",
])
def test_bound_presentation_unproven_target_is_rejected_but_style_remains_allowed(tmp_path, case):
    store = PageDocumentStore(private(tmp_path / case), resolve_binding=presentation_binding)
    body = bound_presentation_draft().model_dump(mode="json")
    package, manifest = body["package"], body["binding_manifest"]
    if case == "missing-marker":
        package["html"] = package["html"].replace('data-shine-node="amount"', '')
    elif case == "duplicate-marker":
        package["html"] += '<div data-shine-node="amount">200</div>'
    elif case == "missing-node-id":
        manifest["bindings"][0]["node_id"] = None
    elif case == "whole-page":
        package["node_map"][0]["kind"] = "whole_page"
    elif case == "unsupported-selector":
        package["node_map"][0]["selector"] = "#amount"
    elif case == "refs-only":
        manifest["bindings"] = []
    elif case == "unmapped-ref":
        manifest["result_refs"].append("result_other")
    elif case == "nonvoid-slash":
        package["html"] = package["html"].replace('<section id="report">', '<section id="report"/>')
    elif case == "implicit-close":
        package["html"] = '<p>' + package["html"] + '</p>'
    elif case == "table-foster":
        package["html"] += '<table>outside<tbody><tr><td>inside</td></tr></tbody></table>'
    elif case == "implicit-tbody":
        package["html"] += '<table><tr><td>inside</td></tr></table>'
    elif case == "foreign":
        package["html"] = '<svg>' + package["html"] + '</svg>'
    elif case == "rawtext":
        package["html"] = '<textarea>' + package["html"] + '</textarea>'
    elif case == "duplicate-attribute":
        package["html"] = package["html"].replace('id="heading"', 'id="heading" id="amount"')
    elif case == "duplicate-anchor":
        package["html"] += '<h1 id="heading">Other heading</h1>'
    elif case in {"readonly", "database"}:
        attribute = 'data-page-readonly' if case == "readonly" else 'data-sp-bindable="database"'
        package["html"] = package["html"].replace('id="heading"', f'id="heading" {attribute}')
    elif case == "duplicate-body":
        package["html"] = '<html><body>' + package["html"] + '</body><body>extra</body></html>'
    elif case == "late-head":
        package["html"] = '<html><body>' + package["html"] + '</body><head><title>late</title></head></html>'
    elif case == "head-binding":
        package["html"] = ('<html><head><title data-shine-node="amount">100</title></head><body>'
                           '<h1 id="heading">Title</h1></body></html>')
    elif case == "shell-anchor":
        package["html"] = '<html id="shell"><body>' + package["html"] + '</body></html>'
    elif case == "ambiguous-child":
        package["html"] = package["html"].replace('</section>', '<h1>Another title</h1></section>')
    target = text_edit("missing" if case == "missing-target" else "heading")
    if case == "ambiguous-child":
        target = text_edit("report", path=[{"tag": "h1"}])
    elif case == "shell-anchor":
        target = text_edit("shell", path=[{"tag": "body"}, {"tag": "section"}, {"tag": "h1"}])
    spec = confirm(store, store.generate(ALICE, PageDraft.model_validate(body)))["spec"]
    changed = presentation_package(spec["package"], target)
    with pytest.raises(AnalyticsError) as error:
        store.save(ALICE, spec["page_id"], PageSavePreview(base_version=1, title=spec["title"],
            package=changed, binding_manifest=manifest))
    assert error.value.code == "AI_BOUND_CONTENT"
    changed = presentation_package(spec["package"], {"target": target["target"], "style": {"color": "blue"}})
    saved = confirm(store, store.save(ALICE, spec["page_id"], PageSavePreview(base_version=1, title=spec["title"],
        package=changed, binding_manifest=manifest)), "style-only")
    assert saved["spec"]["version"] == 2


def test_bound_presentation_confirm_rejects_legacy_pending_text_without_advancing_version(tmp_path):
    store = PageDocumentStore(private(tmp_path / "legacy-bound-preview"), resolve_binding=presentation_binding)
    spec = confirm(store, store.generate(ALICE, bound_presentation_draft()))["spec"]
    preview = store.preview_identical(ALICE, spec["page_id"], 1)
    with closing(sqlite3.connect(store.path)) as con:
        payload = json.loads(con.execute("SELECT payload FROM previews WHERE preview_id=?", (preview["preview_id"],)).fetchone()[0])
        old_spec = payload["snapshot"]["spec"]
        old_spec["package"] = presentation_package(old_spec["package"], text_edit("amount"))
        encoded, digest = store._encode_snapshot(payload["snapshot"], payload["required_scopes"])
        con.execute("UPDATE previews SET payload=?, digest=? WHERE preview_id=?", (encoded, digest, preview["preview_id"]))
        con.commit()
    with pytest.raises(AnalyticsError) as error:
        confirm(store, preview, "legacy-save")
    assert error.value.code == "AI_BOUND_CONTENT"
    assert store.get(ALICE, spec["page_id"])["spec"] == spec
    assert store.preview(ALICE, preview["preview_id"])["status"] == "PENDING"
    with closing(sqlite3.connect(store.path)) as con:
        assert con.execute("SELECT count(*) FROM revisions").fetchone()[0] == 1
        assert con.execute("SELECT count(*) FROM receipts WHERE key='legacy-save'").fetchone()[0] == 0


@pytest.mark.parametrize("edits", [
    [text_edit("heading", "Advice"), text_edit("report", path=[{"tag": "h1", "key": {"attribute": "text", "value": "Title"}}])],
    [text_edit("heading"), text_edit("report", path=[{"tag": "h1"}])],
])
def test_bound_presentation_rejects_overlapping_or_changed_text_identities(tmp_path, edits):
    store = PageDocumentStore(private(tmp_path / "ordered-overlay"), resolve_binding=presentation_binding)
    body = bound_presentation_draft().model_dump(mode="json")
    body["package"] = presentation_package(body["package"], *edits)
    with pytest.raises(AnalyticsError) as error:
        store.generate(ALICE, PageDraft.model_validate(body))
    assert error.value.code == "AI_BOUND_CONTENT"


def test_bound_presentation_dynamic_binding_keeps_static_sibling_editable(tmp_path):
    store = PageDocumentStore(private(tmp_path / "dynamic-bound"), resolve_binding=presentation_binding)
    body = bound_presentation_draft().model_dump(mode="json")
    package = body["package"]
    package["html"] = package["html"].replace('data-shine-node="amount"', 'data-shine-region="amount"')
    package["node_map"][0].update(kind="dynamic_region", selector="[data-shine-region='amount']")
    package["presentation"] = presentation_package(package, text_edit("heading", "New heading"))["presentation"]
    saved = confirm(store, store.generate(ALICE, PageDraft.model_validate(body)))["spec"]
    assert saved["package"]["presentation"]["edits"][0]["text"] == "New heading"
    changed = presentation_package(saved["package"], text_edit("value"))
    with pytest.raises(AnalyticsError) as error:
        store.save(ALICE, saved["page_id"], PageSavePreview(base_version=1, title=saved["title"],
            package=changed, binding_manifest=saved["binding_manifest"]))
    assert error.value.code == "AI_BOUND_CONTENT"


def test_generate_adds_host_mappings_to_plain_html(tmp_path):
    store = PageDocumentStore(private(tmp_path / "plain-html-mappings"))
    request = PageDraft(title="Plain HTML", session_id=None, origin_file_id="file_plain",
                        package={"html": "<main><h1>标题</h1><button>按钮</button><canvas></canvas></main>"})
    saved = confirm(store, store.generate(ALICE, request), "plain-html-mappings")
    package = saved["spec"]["package"]
    assert len(package["node_map"]) == 4
    assert 'data-shine-node="auto_main_0"' in package["html"]
    assert 'data-shine-region="auto_canvas_' in package["html"]


def test_source_range_mapping_handles_quoted_greater_than_attributes():
    html = '<section data-shine-node="n_card" title="a > b"><span>内容</span></section>'
    assert PageDocumentStore._mapped_node_range(
        {"html": html}, "n_card", "static_element"
    ) == (0, len(html))


@pytest.mark.parametrize("tag,body", [
    ("style", "body{margin:16px} section{padding:12px} button{min-height:24px}"),
    ("script", "window.label='<h1>not-a-node</h1>'; window.counter=0;"),
    ("template", "<section><span>not-an-active-node</span></section>"),
    ("textarea", "not an active <span>node</span> after a long textarea body"),
    ("title", "a long title with <span>plain text</span> for the following mapping"),
])
def test_raw_block_skips_only_its_own_body_and_preserves_following_node_ranges(tmp_path, tag, body):
    html = f'<{tag}>{body}</{tag}><section id="parent"><h1>标题</h1><p><span>子元素文字</span></p></section>'
    store = PageDocumentStore(private(tmp_path / tag))
    request = PageDraft(title="Raw block", session_id=None, origin_file_id=f"file_{tag}",
                        package={"html": html})
    package = confirm(store, store.generate(ALICE, request), f"raw-block-{tag}")["spec"]["package"]
    assert len(package["node_map"]) == 4
    assert package["html"].startswith(f'<{tag}>{body}</{tag}>')
    for name in ("section", "h1", "p", "span"):
        node = next(row for row in package["node_map"] if row["node_id"].startswith(f"auto_{name}_"))
        start, end = store._mapped_node_range(package, node["node_id"], "static_element")
        assert package["html"][start:end].startswith(f"<{name}")
    assert "子元素文字" in package["html"]


def test_css_scope_parser_handles_quoted_braces():
    css = '[data-shine-node="n_card"]{--label:"a } b";color:red}'
    assert PageDocumentStore._canonical_css_ranges(
        {"css": css}, "n_card"
    ) == [{"start": 0, "end": len(css)}]


def test_contract_rejects_unknown_fields_board_spec_and_invalid_binding():
    body = draft().model_dump(mode="json")
    with pytest.raises(ValidationError):
        PageDraft.model_validate({**body, "owner": "alice"})
    with pytest.raises(ValidationError):
        PageDraft.model_validate({**body, "blocks": []})
    with pytest.raises(ValidationError):
        PageDraft.model_validate({**body, "board_id": "board_x"})
    with pytest.raises(ValidationError):
        PageDocument.model_validate({**body, "schema_version": "board-spec/v1",
                                     "page_id": "page_x", "version": 1, "binding_state": "UNBOUND_SAMPLE"})
    with pytest.raises(ValidationError):
        PageDocument.model_validate({**body, "page_id": "page_x", "version": 1,
                                     "binding_state": "BOUND_SAMPLE"})
    with pytest.raises(ValidationError):
        PageDraft.model_validate({**body, "package": {**body["package"], "html": ""}})
    with pytest.raises(ValidationError):
        PageDocument.model_validate({**body, "page_id": "page_x", "version": 1,
                                     "binding_state": "BOUND_VERIFIED"})
    with pytest.raises(ValidationError):
        PageDocument.model_validate({**body, "page_id": "page_x", "version": 1,
                                     "binding_state": "UNBOUND_SAMPLE",
                                     "binding_manifest": {"result_refs": ["result_fixture_1"],
                                                          "bindings": [{"binding_id": "bind_1",
                                                                        "result_ref": "result_fixture_1"}]}})
    fat = {**body["package"], "resources": [{
        "resource_id": "blob_1", "content_type": "image/png", "sha256": "a" * 64,
        "byte_length": PACKAGE_MAX_BYTES,
    }]}
    with pytest.raises(ValidationError) as oversized:
        PagePackage.model_validate(fat)
    assert is_package_too_large(oversized.value)
    with pytest.raises(ValidationError):
        PagePatchPreview.model_validate({"base_version": 1, "package": body["package"], "title": None})
    with pytest.raises(ValidationError):
        PagePatchPreview.model_validate({"base_version": 1, "edit_scope": "presentation"})
    with pytest.raises(ValidationError):
        PagePatchPreview.model_validate({"base_version": 1, "package": body["package"],
                                         "edit_scope": "presentation", "edit_context_id": "ctx_forced"})
    schema = page_documents_openapi()
    assert schema["x-free-page-schema"] == SCHEMA_VERSION
    assert "INVALID_BOARD" not in schema["x-page-errors"]
    assert schema["x-page-errors"] == PAGE_ERRORS
    assert "BoardDraft" not in schema["components"]["schemas"]
    patch_schema = schema["components"]["schemas"]["PagePatchPreview"]
    assert patch_schema["required"] == ["base_version"]
    assert "default" not in patch_schema["properties"]["title"]
    assert "anyOf" not in patch_schema["properties"]["title"]
    assert "$ref" in patch_schema["properties"]["package"]
    read = PageDataReadRequest.model_validate({
        "protocol": "free-page-bridge/v1", "instance_id": "inst_1", "request_id": "req_1",
        "nonce": "nonce_1", "seq": 0, **FROZEN["data_read"]["request"],
    })
    assert read.op == "data.read" and read.limit == 50
    for op in FORBIDDEN_BRIDGE_OPS:
        with pytest.raises(ValidationError):
            PageDataReadRequest.model_validate({
                "protocol": "free-page-bridge/v1", "instance_id": "inst_1", "request_id": "req_1",
                "nonce": "nonce_1", "seq": 0, "op": op, "result_ref": "result_fixture_1",
            })


def test_origin_path_round_trip_and_old_drafts_remain_valid(tmp_path):
    store = PageDocumentStore(private(tmp_path / "pages"))
    with pytest.raises(ValidationError):
        draft(origin_path="../etc/passwd")
    with pytest.raises(ValidationError):
        draft(origin_path="/tmp/a.html")
    preview = store.generate(ALICE, draft(
        origin_path="ops/web/index.html",
        binding_manifest={"bindings": [], "result_refs": []},
    ))
    assert preview["snapshot"]["spec"]["origin_path"] == "ops/web/index.html"
    saved = confirm(store, preview)
    assert saved["spec"]["origin_path"] == "ops/web/index.html"
    assert store.get(ALICE, saved["spec"]["page_id"])["spec"]["origin_path"] == "ops/web/index.html"
    assert store.list(ALICE)[0]["origin_path"] == "ops/web/index.html"
    body = draft().model_dump(mode="json")
    body.pop("origin_path", None)
    PageDraft.model_validate(body)


def test_generate_is_not_saved_until_confirm_and_failed_generate_leaves_no_asset(tmp_path):
    store = PageDocumentStore(private(tmp_path / "pages"))
    preview = store.generate(ALICE, draft())
    assert preview["operation"] == "GENERATE" and preview["base_version"] == 0
    assert preview["snapshot"]["spec"]["schema_version"] == SCHEMA_VERSION
    assert preview["snapshot"]["spec"]["binding_state"] == "UNBOUND_SAMPLE"
    assert store.list(ALICE) == []
    with pytest.raises(ValidationError):
        draft(package={**sample_package(), "html": ""})
    with pytest.raises(ValidationError):
        draft(package={**sample_package(), "js": "x" * 524_289})
    assert store.list(ALICE) == []
    forged = draft().model_dump(mode="json")
    forged["package"]["html"] = ""
    with pytest.raises(AnalyticsError) as error:
        store.generate(ALICE, PageDraft.model_construct(**forged))
    assert error.value.code == "INVALID_PAGE" and error.value.status == 422
    fat = draft().model_dump(mode="json")
    fat["package"]["resources"] = [{"resource_id": "blob_1", "content_type": "image/png",
                                    "sha256": "a" * 64, "byte_length": PACKAGE_MAX_BYTES}]
    with pytest.raises(AnalyticsError) as error:
        store.generate(ALICE, PageDraft.model_construct(**fat))
    assert error.value.code == "PACKAGE_TOO_LARGE" and error.value.status == 413
    bound = draft(binding_manifest={"result_refs": ["result_fixture_1"],
                                    "bindings": [{"binding_id": "bind_1", "result_ref": "result_fixture_1"}]})
    with pytest.raises(AnalyticsError) as error:
        store.generate(ALICE, bound)
    assert error.value.code == "RESULT_UNAVAILABLE" and error.value.status == 409
    assert store.list(ALICE) == []
    saved = confirm(store, preview)
    assert saved["spec"]["version"] == 1
    assert store.list(ALICE)[0]["page_id"] == saved["spec"]["page_id"]
    assert confirm(store, preview) == saved
    assert confirm(store, preview, "a-new-key") == saved
    assert len(store.history(ALICE, saved["spec"]["page_id"])) == 1


def test_d6_patch_and_d9_save_are_separate_one_version_each_and_cancel_does_not_save(tmp_path):
    store = PageDocumentStore(private(tmp_path / "pages"))
    v1 = confirm(store, store.generate(ALICE, draft()))
    page_id = v1["spec"]["page_id"]
    patched = store.patch(ALICE, page_id, PagePatchPreview.model_validate({
        "base_version": 1, "package": sample_package(html="<html><body>patched</body></html>"),
    }))
    assert patched["operation"] == "PATCH"
    assert store.get(ALICE, page_id) == v1
    store.cancel(ALICE, patched["preview_id"])
    store.cancel(ALICE, patched["preview_id"])
    with pytest.raises(AnalyticsError, match="PREVIEW_CANCELLED"):
        confirm(store, patched, "cancelled")
    assert store.get(ALICE, page_id) == v1
    patched = store.patch(ALICE, page_id, PagePatchPreview.model_validate({
        "base_version": 1, "package": sample_package(html="<html><body>patched</body></html>"),
    }))
    v2 = confirm(store, patched, "d6")
    assert v2["spec"]["version"] == 2
    assert v2["spec"]["package"]["html"] == "<html><body>patched</body></html>"
    assert v2["spec"]["binding_manifest"] == v1["spec"]["binding_manifest"]
    saved = store.save(ALICE, page_id, PageSavePreview.model_validate({
        "base_version": 2, "title": "显式保存草稿",
        "package": sample_package(html="<html><body>host-draft</body></html>", js="console.log(1)"),
        "binding_manifest": {"bindings": [], "result_refs": []},
    }))
    assert saved["operation"] == "SAVE"
    assert store.get(ALICE, page_id) == v2
    v3 = confirm(store, saved, "d9")
    assert v3["spec"]["version"] == 3 and v3["spec"]["title"] == "显式保存草稿"
    assert v3["spec"]["package"]["js"] == "console.log(1)"
    assert [item["operation"] for item in store.history(ALICE, page_id)] == ["SAVE", "PATCH", "GENERATE"]
    assert confirm(store, patched, "d6") == v2
    with pytest.raises(AnalyticsError, match="IDEMPOTENCY_CONFLICT"):
        confirm(store, saved, "d6")


def test_ai_source_range_patch_allows_selected_html_only(tmp_path):
    store = PageDocumentStore(private(tmp_path / "pages"))
    v1 = confirm(store, store.generate(ALICE, draft()))
    page_id = v1["spec"]["page_id"]
    old = v1["spec"]["package"]
    new = sample_package(html=old["html"].replace("示例标题", "新标题"))
    patch = store.patch(ALICE, page_id, source_patch(1, old, new))
    assert patch["snapshot"]["spec"]["package"]["html"].endswith("新标题</h1><canvas data-shine-region=\"r_chart\"></canvas></body></html>")

    both = sample_package(html=old["html"].replace("示例标题", "新标题"), css="h1{color:purple}")
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, page_id, source_patch(1, old, both, ranges=[
            {"file": "html", "start": old["html"].index("<h1"), "end": old["html"].index("</h1>") + 5},
            {"file": "css", "start": 0, "end": len(old["css"])},
        ]))
    assert error.value.code == "AI_SCOPE_DIFF"

    css_old = sample_package(css="[data-shine-node='n_title']{color:black}.other{display:none}")
    css_page = confirm(store, store.generate(ALICE, draft(package=css_old)), "css-page")
    css_new = sample_package(css="[data-shine-node='n_title']{color:black}.other{display:block}")
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, css_page["spec"]["page_id"], source_patch(
            1, css_old, css_new,
            ranges=[
                {"file": "html", "start": css_old["html"].index("<h1"), "end": css_old["html"].index("</h1>") + 5},
                {"file": "css", "start": 0, "end": len(css_old["css"])},
            ],
        ))
    assert error.value.code == "AI_SCOPE_DIFF"

    unrelated = sample_package(html=old["html"].replace("示例标题", "新标题").replace("r_chart", "other_chart"))
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, page_id, source_patch(1, old, unrelated))
    assert error.value.code == "AI_SCOPE_DIFF" and error.value.status == 422

    presentation = sample_package(html=old["html"].replace("示例标题", "新标题"), presentation={
        "version": 1,
        "source_hash": page_source_hash(old["html"].replace("示例标题", "新标题"), old["css"], old["js"]),
        "edits": [{"target": {"anchor": {"attribute": "id", "value": "outside"}, "path": []}, "text": "越界"}],
    })
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, page_id, source_patch(1, old, presentation))
    assert error.value.code == "AI_SCOPE_DIFF"

    boundary_html = '<h1 data-shine-node="n_title">Before</h1>'
    boundary_package = {"html": boundary_html, "css": "", "js": "", "resources": [],
                        "node_map": [{"node_id": "n_title", "kind": "static_element",
                                      "selector": "[data-shine-node='n_title']"}]}
    boundary_page = confirm(store, store.generate(ALICE, draft(package=boundary_package)), "boundary-page")
    boundary_new = {**boundary_package, "html": boundary_html + "<p>outside</p>"}
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, boundary_page["spec"]["page_id"], source_patch(1, boundary_package, boundary_new))
    assert error.value.code == "AI_SCOPE_DIFF"


def test_ai_source_range_rejects_stale_hash_and_bound_content(tmp_path):
    store = PageDocumentStore(private(tmp_path / "pages"))
    v1 = confirm(store, store.generate(ALICE, draft()))
    old = v1["spec"]["package"]
    changed = sample_package(html=old["html"].replace("示例标题", "新标题"))
    stale = source_patch(1, old, changed).model_dump(mode="json", exclude_unset=True)
    stale["source_hash"] = "0" * 64
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, v1["spec"]["page_id"], PagePatchPreview.model_validate(stale))
    assert error.value.code == "AI_SOURCE_CHANGED"
    forged = source_patch(1, old, changed).model_dump(mode="json", exclude_unset=True)
    forged["focus_ref"]["mapping_token"] = "f" * 32
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, v1["spec"]["page_id"], PagePatchPreview.model_validate(forged))
    assert error.value.code == "AI_SOURCE_CHANGED"

    def resolver(actor, session_id, result_id):
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    bound_store = PageDocumentStore(private(tmp_path / "bound"), resolve_binding=resolver)
    manifest = {"result_refs": ["result_fixture_1"],
                "bindings": [{"binding_id": "bind_1", "result_ref": "result_fixture_1", "node_id": "n_title"}]}
    bound = confirm(bound_store, bound_store.generate(ALICE, draft(binding_manifest=manifest)))
    bound_old = bound["spec"]["package"]
    bound_request = source_patch(1, bound_old,
        sample_package(html=bound_old["html"].replace("示例标题", "新标题")))
    with pytest.raises(AnalyticsError) as error:
        bound_store.patch(ALICE, bound["spec"]["page_id"], bound_request)
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403
    with pytest.raises(AnalyticsError) as error:
        bound_store.save(ALICE, bound["spec"]["page_id"], PageSavePreview.model_validate({
            "base_version": 1, "title": bound["spec"]["title"],
            "package": {**bound_old, "html": bound_old["html"].replace("示例标题", "绕过")},
            "binding_manifest": manifest,
        }))
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403


def test_readonly_computed_sources_survive_manual_and_forged_source_patches(tmp_path):
    store = PageDocumentStore(private(tmp_path / "readonly-pages"))
    readonly_package = {
        "html": (
            '<div id="root">'
            '<h1 data-shine-node="n_title">标题</h1>'
            '<p id="metric" data-shine-node="n_metric" data-page-readonly>42</p>'
            '</div>'
        ),
        "css": "",
        "js": "",
        "resources": [],
        "node_map": [
            {"node_id": "n_title", "kind": "static_element",
             "selector": "[data-shine-node='n_title']"},
            {"node_id": "n_metric", "kind": "static_element",
             "selector": "[data-shine-node='n_metric']"},
        ],
    }
    v1 = confirm(store, store.generate(ALICE, draft(package=readonly_package)), "readonly-v1")
    page_id = v1["spec"]["page_id"]

    manual_change = {**readonly_package, "html": readonly_package["html"].replace(">42<", ">99<")}
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, page_id, PagePatchPreview.model_validate({
            "base_version": 1,
            "package": manual_change,
        }))
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403

    editable_change = {**readonly_package, "html": readonly_package["html"].replace("标题", "新标题")}
    assert store.patch(ALICE, page_id, PagePatchPreview.model_validate({
        "base_version": 1,
        "package": editable_change,
    }))["operation"] == "PATCH"

    start = readonly_package["html"].index('<p id="metric" data-shine-node="n_metric"')
    end = readonly_package["html"].index("</p>", start) + len("</p>")
    digest = source_hash(readonly_package)
    token = hashlib.sha256(f"{digest}:n_metric:{start}:{end}".encode()).hexdigest()[:32]
    forged = PagePatchPreview.model_validate({
        "base_version": 1,
        "package": manual_change,
        "edit_scope": "source_range",
        "edit_context_id": "ctx_readonly",
        "source_hash": digest,
        "focus_ref": {
            "node_id": "n_metric",
            "kind": "static_element",
            "allowed_scope": "exact_source_range",
            "allowed_ranges": [{"file": "html", "start": start, "end": end}],
            "mapping_token": token,
            "version_hash": digest,
        },
    })
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, page_id, forged)
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403

    presentation = {
        **readonly_package,
        "presentation": {
            "source_hash": page_source_hash(
                readonly_package["html"], readonly_package["css"], readonly_package["js"]
            ),
            "edits": [{
                "target": {"anchor": {"attribute": "id", "value": "root"}, "path": []},
                "text": "99",
            }],
        },
    }
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, page_id, PagePatchPreview.model_validate({
            "base_version": 1,
            "package": presentation,
        }))
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403

    style_only = {
        **presentation,
        "presentation": {
            **presentation["presentation"],
            "edits": [{
                "target": {"anchor": {"attribute": "id", "value": "metric"}, "path": []},
                "style": {"color": "#805D9D"},
            }],
        },
    }
    assert store.patch(ALICE, page_id, PagePatchPreview.model_validate({
        "base_version": 1,
        "package": style_only,
    }))["operation"] == "PATCH"

    unmapped = {
        "html": '<p data-shine-node="n_metric" data-page-readonly>42</p>',
        "css": "",
        "js": "",
        "resources": [],
        "node_map": [],
    }
    unmapped_v1 = confirm(store, store.generate(ALICE, draft(package=unmapped)), "readonly-unmapped")
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, unmapped_v1["spec"]["page_id"], PagePatchPreview.model_validate({
            "base_version": 1,
            "package": {**unmapped, "html": unmapped["html"].replace("42", "99")},
        }))
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403


@pytest.mark.parametrize(
    ("name", "marker"),
    [
        ("unquoted", "data-sp-bindable=database"),
        ("spaced", "data-sp-bindable = 'database'"),
        ("entity", "data-sp-bindable='dat&#97;base'"),
        ("boolean", "data-page-readonly"),
    ],
)
def test_readonly_source_markers_use_html_attribute_semantics(tmp_path, name, marker):
    store = PageDocumentStore(private(tmp_path / f"readonly-marker-{name}"))
    package = {
        "html": (
            f'<div data-shine-node="metric" {marker}>'
            '<span data-shine-node="value">42</span></div>'
            '<p data-shine-node="copy">说明</p>'
        ),
        "css": "",
        "js": "",
        "resources": [],
        "node_map": [
            {"node_id": "value", "kind": "static_element",
             "selector": '[data-shine-node="value"]'},
            {"node_id": "copy", "kind": "static_element",
             "selector": '[data-shine-node="copy"]'},
        ],
    }
    v1 = confirm(store, store.generate(ALICE, draft(package=package)), f"readonly-marker-{name}")
    changed = {**package, "html": package["html"].replace(">42<", ">99<")}
    with pytest.raises(AnalyticsError) as error:
        store.patch(ALICE, v1["spec"]["page_id"], PagePatchPreview.model_validate({
            "base_version": 1,
            "package": changed,
        }))
    assert error.value.code == "AI_BOUND_CONTENT" and error.value.status == 403


def test_ai_dynamic_region_can_change_one_runtime_source_file(tmp_path):
    store = PageDocumentStore(private(tmp_path / "pages"))
    runtime_package = sample_package(js="document.querySelector('[data-shine-region=\"r_chart\"]')?.getContext('2d')")
    v1 = confirm(store, store.generate(ALICE, draft(package=runtime_package)))
    page_id = v1["spec"]["page_id"]
    old = v1["spec"]["package"]
    html_start = old["html"].index('<canvas')
    html_end = old["html"].index('</canvas>') + len('</canvas>')
    digest = source_hash(old)
    token = hashlib.sha256(f"{digest}:r_chart:{html_start}:{html_end}".encode()).hexdigest()[:32]
    new = sample_package(js="const barColor = 'purple'; " + old["js"])
    request = PagePatchPreview.model_validate({
        "base_version": 1, "package": new, "edit_scope": "source_range", "edit_context_id": "ctx_chart",
        "source_hash": digest,
        "focus_ref": {
            "node_id": "r_chart", "kind": "dynamic_region", "allowed_scope": "dynamic_source_range",
            "allowed_ranges": [
                {"file": "html", "start": html_start, "end": html_end},
                {"file": "js", "start": 0, "end": len(old["js"])},
            ],
            "mapping_token": token, "version_hash": digest,
        },
    })
    preview = store.patch(ALICE, page_id, request)
    assert "barColor" in preview["snapshot"]["spec"]["package"]["js"]


def test_process_reopen_new_connection_and_monotonic_rollback(tmp_path):
    directory = private(tmp_path / "pages")
    store = PageDocumentStore(directory)
    v1 = confirm(store, store.generate(ALICE, draft()))
    page_id = v1["spec"]["page_id"]
    v2 = confirm(store, store.patch(ALICE, page_id, PagePatchPreview.model_validate({
        "base_version": 1, "title": "第二版",
    })), "v2")
    script = """
import json, sys
from pathlib import Path
from backend.services.analytics.access import AnalyticsPrincipal
from backend.services.analytics.page_documents import PageDocumentStore
actor=AnalyticsPrincipal('alice',frozenset({'dashboard:read'}),frozenset({'competition-diagnosis-fixture'}))
print(json.dumps(PageDocumentStore(Path(sys.argv[1])).get(actor,sys.argv[2])))
"""
    process = subprocess.run([sys.executable, "-c", script, str(directory), page_id], cwd=tmp_path,
        env={"PATH": str(Path(sys.executable).parent) + ":/usr/bin:/bin", "PYTHONPATH": str(ROOT),
             "PYTHONNOUSERSITE": "1", "PYTHON_DOTENV_DISABLED": "1"},
        capture_output=True, text=True, timeout=30, check=True)
    assert json.loads(process.stdout) == v2
    reopened = PageDocumentStore(directory)
    rollback = reopened.rollback(ALICE, page_id, PageRollbackPreview(base_version=2, to_version=1))
    assert reopened.get(ALICE, page_id) == v2
    v3 = confirm(reopened, rollback, "rollback")
    assert v3["spec"]["package"] == v1["spec"]["package"] and v3["spec"]["version"] == 3
    assert v3["spec"]["title"] == v1["spec"]["title"]
    assert reopened.get(ALICE, page_id, 2) == v2
    assert [item["version"] for item in reopened.history(ALICE, page_id)] == [3, 2, 1]
    assert confirm(reopened, rollback, "rollback") == v3
    assert reopened.get(ALICE, page_id) == v3
    assert directory.stat().st_mode & 0o077 == 0
    assert reopened.path.stat().st_mode & 0o077 == 0


def test_parallel_confirm_exactly_one_wins_and_retry_is_idempotent(tmp_path):
    directory = private(tmp_path / "pages")
    store = PageDocumentStore(directory)
    v1 = confirm(store, store.generate(ALICE, draft()))
    page_id = v1["spec"]["page_id"]
    drafts = [store.patch(ALICE, page_id, PagePatchPreview.model_validate(
        {"base_version": 1, "title": title})) for title in ("A", "B")]
    clients = [PageDocumentStore(directory), PageDocumentStore(directory)]
    barrier = Barrier(2)

    def attempt(index):
        barrier.wait(timeout=10)
        try:
            return confirm(clients[index], drafts[index], f"key-{index}")
        except AnalyticsError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, [0, 1]))
    assert len([result for result in results if isinstance(result, dict)]) == 1
    assert results.count("VERSION_CONFLICT") == 1
    winner = next(index for index, result in enumerate(results) if isinstance(result, dict))
    assert confirm(store, drafts[winner], f"key-{winner}") == results[winner]
    assert confirm(store, drafts[winner], "a-new-key") == results[winner]
    assert len(store.history(ALICE, page_id)) == 2
    with pytest.raises(AnalyticsError, match="IDEMPOTENCY_CONFLICT"):
        confirm(store, drafts[1 - winner], f"key-{winner}")


def test_expiry_locked_sqlite_and_midtransaction_failure_preserve_head(tmp_path):
    instant = [100]
    store = PageDocumentStore(private(tmp_path / "pages"), clock=lambda: instant[0])
    v1 = confirm(store, store.generate(ALICE, draft()))
    page_id = v1["spec"]["page_id"]
    edit = store.patch(ALICE, page_id, PagePatchPreview.model_validate({"base_version": 1, "title": "不会丢失旧版"}))
    instant[0] = edit["expires_at_ms"]
    with pytest.raises(AnalyticsError, match="PREVIEW_EXPIRED"):
        confirm(store, edit, "expired")
    edit = store.patch(ALICE, page_id, PagePatchPreview.model_validate({"base_version": 1, "title": "可重试"}))
    with closing(sqlite3.connect(store.path)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        with pytest.raises(AnalyticsError, match="STATE_UNAVAILABLE") as error:
            confirm(store, edit, "locked")
        assert error.value.retryable
        conn.rollback()
        conn.execute("CREATE TRIGGER fail_revision BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
        conn.commit()
        with pytest.raises(AnalyticsError, match="STATE_UNAVAILABLE"):
            confirm(store, edit, "locked")
        assert store.get(ALICE, page_id) == v1
        assert store.preview(ALICE, edit["preview_id"])["status"] == "PENDING"
        conn.execute("DROP TRIGGER fail_revision")
        conn.commit()
    assert confirm(store, edit, "locked")["spec"]["version"] == 2


def test_ownership_permission_revocation_and_payload_integrity(tmp_path):
    def resolver(actor, session_id, result_id):
        assert session_id == "native_session_fixture" and result_id == "result_fixture_1"
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    store = PageDocumentStore(private(tmp_path / "pages"), resolve_binding=resolver)
    bound = draft(binding_manifest=PageBindingManifest.model_validate({
        "result_refs": ["result_fixture_1"],
        "bindings": [{"binding_id": "bind_1", "result_ref": "result_fixture_1", "node_id": "n_title"}],
    }))
    preview = store.generate(ALICE, bound)
    assert preview["snapshot"]["spec"]["binding_state"] == "BOUND_VERIFIED"
    v1 = confirm(store, preview)
    page_id = v1["spec"]["page_id"]
    assert store.list(BOB) == []
    for operation in (lambda: store.get(BOB, page_id), lambda: store.preview(BOB, preview["preview_id"]),
                      lambda: store.confirm(BOB, preview["preview_id"], "key")):
        with pytest.raises(AnalyticsError) as error:
            operation()
        assert error.value.status == 404
    revoked = AnalyticsPrincipal("alice", CAPS, frozenset({DATA_SCOPE}))
    assert store.list(revoked) == []
    with pytest.raises(AnalyticsError) as error:
        store.get(revoked, page_id)
    assert error.value.status == 403
    readonly = AnalyticsPrincipal("alice", frozenset({"dashboard:read"}), ALICE.data_scopes)
    assert store.get(readonly, page_id) == v1
    with pytest.raises(AnalyticsError) as error:
        store.confirm(readonly, preview["preview_id"], "confirm")
    assert error.value.status == 403
    with closing(sqlite3.connect(store.path)) as conn:
        conn.execute("UPDATE revisions SET payload='{}'")
        conn.commit()
    with pytest.raises(AnalyticsError, match="BINDING_CORRUPT"):
        store.get(ALICE, page_id)


def test_rollback_rechecks_grants_and_marks_stale_or_revoked(tmp_path):
    state = {"status": "VERIFIED"}

    def resolver(actor, session_id, result_id):
        return ResolvedPageBinding(state["status"], frozenset({"brand-a"}))

    store = PageDocumentStore(private(tmp_path / "pages"), resolve_binding=resolver)
    manifest = {"result_refs": ["result_fixture_1"],
                "bindings": [{"binding_id": "bind_1", "result_ref": "result_fixture_1"}]}
    v1 = confirm(store, store.generate(ALICE, draft(binding_manifest=manifest)))
    page_id = v1["spec"]["page_id"]
    v2 = confirm(store, store.patch(ALICE, page_id, PagePatchPreview.model_validate({
        "base_version": 1, "title": "改标题",
    })), "v2")
    state["status"] = "STALE"
    restored = confirm(store, store.rollback(ALICE, page_id, PageRollbackPreview(base_version=2, to_version=1)), "rb")
    assert restored["spec"]["binding_state"] == "BOUND_STALE"
    assert restored["spec"]["package"] == v1["spec"]["package"]
    assert restored["spec"]["version"] == 3
    state["status"] = "REVOKED"
    with pytest.raises(AnalyticsError) as error:
        store.rollback(ALICE, page_id, PageRollbackPreview(base_version=3, to_version=1))
    assert error.value.code == "RESULT_REVOKED" and error.value.status == 403
    assert store.get(ALICE, page_id)["spec"]["version"] == 3
    assert v2["spec"]["title"] == "改标题"


@pytest.mark.parametrize("operation", ["GENERATE", "PATCH", "SAVE", "ROLLBACK"])
@pytest.mark.parametrize("status,scopes,code", [
    ("REVOKED", frozenset({"brand-a"}), "RESULT_REVOKED"),
    ("UNAVAILABLE", frozenset({"brand-a"}), "RESULT_UNAVAILABLE"),
    ("VERIFIED", frozenset({"brand-a", "brand-b"}), "FORBIDDEN"),
])
def test_confirm_rechecks_result_access_before_writing(tmp_path, operation, status, scopes, code):
    state = {"status": "VERIFIED", "scopes": frozenset({"brand-a"})}

    def resolver(actor, session_id, result_id):
        if result_id == "result_fixture_1":
            return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))
        return ResolvedPageBinding(state["status"], state["scopes"])

    store = PageDocumentStore(private(tmp_path / "pages"), resolve_binding=resolver)
    request = draft(binding_manifest={"result_refs": ["result_fixture_1", "result_fixture_2"], "bindings": []})
    pending = store.generate(ALICE, request)
    page_id = pending["snapshot"]["spec"]["page_id"]
    base_version = 0
    if operation != "GENERATE":
        saved = confirm(store, pending, "initial")
        base_version = 1
        if operation == "PATCH":
            pending = store.patch(ALICE, page_id, PagePatchPreview(base_version=1, title="改标题"))
        elif operation == "SAVE":
            pending = store.save(ALICE, page_id, PageSavePreview(
                base_version=1, title="改标题", package=request.package,
                binding_manifest=request.binding_manifest,
            ))
        else:
            saved = confirm(store, store.patch(ALICE, page_id, PagePatchPreview(
                base_version=1, title="第二版",
            )), "second")
            base_version = 2
            pending = store.rollback(ALICE, page_id, PageRollbackPreview(base_version=2, to_version=1))
    state.update(status=status, scopes=scopes)
    with pytest.raises(AnalyticsError, match=code):
        confirm(store, pending, "pending-confirm")
    assert store.preview(ALICE, pending["preview_id"]) == pending
    with closing(sqlite3.connect(store.path)) as conn:
        assert conn.execute("SELECT count(*) FROM receipts WHERE key=?", ("pending-confirm",)).fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM revisions").fetchone()[0] == base_version
    if base_version:
        assert store.get(ALICE, page_id) == saved
    else:
        assert store.list(ALICE) == []
    state.update(status="VERIFIED", scopes=frozenset({"brand-a"}))
    recovered = confirm(store, pending, "pending-confirm")
    assert recovered["spec"]["version"] == base_version + 1


def test_confirm_persists_current_staleness_and_required_scopes(tmp_path):
    state = {"status": "VERIFIED", "scopes": frozenset({"brand-a"})}

    def resolver(actor, session_id, result_id):
        return ResolvedPageBinding(state["status"], state["scopes"])

    directory = private(tmp_path / "pages")
    store = PageDocumentStore(directory, resolve_binding=resolver)
    pending = store.generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    }))
    state.update(status="STALE", scopes=frozenset({"brand-b"}))
    actor = AnalyticsPrincipal("alice", CAPS, ALICE.data_scopes | {"brand-b"})
    saved = store.confirm(actor, pending["preview_id"], "stale-confirm")
    assert saved["spec"]["binding_state"] == "BOUND_STALE"
    reopened = PageDocumentStore(directory)
    assert reopened.get(actor, saved["spec"]["page_id"]) == saved
    assert reopened.preview(actor, pending["preview_id"])["snapshot"] == saved
    with pytest.raises(AnalyticsError, match="FORBIDDEN"):
        reopened.get(ALICE, saved["spec"]["page_id"])
    without_original_scope = AnalyticsPrincipal("alice", CAPS, (ALICE.data_scopes - {"brand-a"}) | {"brand-b"})
    with pytest.raises(AnalyticsError, match="FORBIDDEN"):
        reopened.get(without_original_scope, saved["spec"]["page_id"])
    with pytest.raises(AnalyticsError, match="FORBIDDEN"):
        store.confirm(ALICE, pending["preview_id"], "stale-confirm")


def test_successful_confirm_replay_keeps_its_historical_result(tmp_path):
    state = {"current": True}

    def resolver(actor, session_id, result_id):
        assert state["current"], "applied replay must not resolve a new result"
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    store = PageDocumentStore(private(tmp_path / "pages"), resolve_binding=resolver)
    pending = store.generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    }))
    saved = confirm(store, pending, "first")
    state["current"] = False
    assert confirm(store, pending, "first") == saved
    assert confirm(store, pending, "retry") == saved
    assert len(store.history(ALICE, saved["spec"]["page_id"])) == 1
    with closing(sqlite3.connect(store.path)) as conn:
        assert conn.execute("SELECT preview_id FROM receipts WHERE key='retry'").fetchone()[0] == pending["preview_id"]


def test_confirm_binding_refresh_rolls_back_with_revision_failure(tmp_path):
    state = {"status": "VERIFIED"}

    def resolver(actor, session_id, result_id):
        return ResolvedPageBinding(state["status"], frozenset({"brand-a"}))

    store = PageDocumentStore(private(tmp_path / "pages"), resolve_binding=resolver)
    pending = store.generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    }))
    state["status"] = "STALE"
    with closing(sqlite3.connect(store.path)) as conn:
        conn.execute("CREATE TRIGGER fail_revision BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
        conn.commit()
        with pytest.raises(AnalyticsError, match="STATE_UNAVAILABLE"):
            confirm(store, pending, "retry-confirm")
        assert store.preview(ALICE, pending["preview_id"]) == pending
        assert store.list(ALICE) == []
        assert conn.execute("SELECT count(*) FROM receipts").fetchone()[0] == 0
        conn.execute("DROP TRIGGER fail_revision")
        conn.commit()
    saved = confirm(store, pending, "retry-confirm")
    assert saved["spec"]["binding_state"] == "BOUND_STALE"


def test_confirm_rechecks_preview_expiry_after_resolving_bindings(tmp_path):
    state = {"now": 100, "expire_at": None}

    def resolver(actor, session_id, result_id):
        if state["expire_at"] is not None:
            state["now"] = state["expire_at"]
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    store = PageDocumentStore(private(tmp_path / "pages"), resolve_binding=resolver, clock=lambda: state["now"])
    pending = store.generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    }))
    state["expire_at"] = pending["expires_at_ms"]
    with pytest.raises(AnalyticsError, match="PREVIEW_EXPIRED"):
        confirm(store, pending, "expired")
    assert store.list(ALICE) == []
    assert store.preview(ALICE, pending["preview_id"]) == pending


@pytest.mark.parametrize("change,code", [
    ("cancel", "PREVIEW_CANCELLED"), ("head", "VERSION_CONFLICT"),
    ("expiry", "PREVIEW_EXPIRED"), ("payload", "VERSION_CONFLICT"),
    ("digest", "BINDING_CORRUPT"), ("denied", "RESULT_REVOKED"),
    ("key", "IDEMPOTENCY_CONFLICT"),
])
def test_confirm_does_not_lock_out_changes_during_resolution(tmp_path, change, code):
    entered, release = Event(), Event()
    state = {"blocked": False, "now": 100}

    def resolver(actor, session_id, result_id):
        if state["blocked"]:
            entered.set()
            assert release.wait(5), "resolver was not released"
            if change == "denied":
                raise AnalyticsError(403, "RESULT_REVOKED", "synthetic denial")
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    directory = private(tmp_path / "pages")
    store = PageDocumentStore(directory, resolve_binding=resolver, clock=lambda: state["now"])
    other = PageDocumentStore(directory, resolve_binding=resolver, clock=lambda: state["now"])
    saved = confirm(store, store.generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    })), "initial")
    page_id = saved["spec"]["page_id"]
    pending = store.patch(ALICE, page_id, PagePatchPreview(base_version=1, title="pending"))
    winner = other.patch(ALICE, page_id, PagePatchPreview(base_version=1, title="winner"))
    unrelated = other.generate(ALICE, draft(binding_manifest={"result_refs": [], "bindings": []}))
    state["blocked"] = True
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(confirm, store, pending, "pending")
        try:
            assert entered.wait(5), "resolver was not entered"
            if change == "cancel":
                assert other.cancel(ALICE, pending["preview_id"])["status"] == "CANCELLED"
            elif change == "head":
                state["blocked"] = False
                saved = confirm(other, winner, "winner")
            elif change == "key":
                confirm(other, unrelated, "pending")
            else:
                with closing(sqlite3.connect(store.path, timeout=0.1)) as con:
                    if change == "payload":
                        raw = json.loads(con.execute("SELECT payload FROM previews WHERE preview_id=?",
                                                    (pending["preview_id"],)).fetchone()[0])
                        raw["snapshot"]["spec"]["title"] = "changed while resolving"
                        payload = json.dumps(raw)
                        con.execute("UPDATE previews SET payload=?,digest=? WHERE preview_id=?",
                                    (payload, hashlib.sha256(payload.encode()).hexdigest(), pending["preview_id"]))
                    elif change == "digest":
                        con.execute("UPDATE previews SET digest=? WHERE preview_id=?", ("0" * 64, pending["preview_id"]))
                    else:
                        con.execute("UPDATE previews SET expires_ms=expires_ms WHERE preview_id=?", (winner["preview_id"],))
                    con.commit()
                if change == "expiry":
                    state["now"] = pending["expires_at_ms"]
        finally:
            release.set()
        with pytest.raises(AnalyticsError) as failure:
            future.result(timeout=5)
        assert failure.value.code == code
    assert other.get(ALICE, page_id) == saved
    with closing(sqlite3.connect(store.path)) as con:
        assert con.execute("SELECT count(*) FROM receipts WHERE key='pending' AND preview_id=?",
                           (pending["preview_id"],)).fetchone()[0] == 0
        assert con.execute("SELECT count(*) FROM revisions").fetchone()[0] == saved["spec"]["version"] + (change == "key")


def test_concurrent_bound_confirm_replays_one_revision_with_same_key(tmp_path):
    barrier = Barrier(2, timeout=5)
    state = {"race": False}

    def resolver(actor, session_id, result_id):
        if state["race"]:
            barrier.wait()
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    directory = private(tmp_path / "pages")
    stores = [PageDocumentStore(directory, resolve_binding=resolver) for _ in range(2)]
    pending = stores[0].generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    }))
    state["race"] = True
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(confirm, store, pending, "same") for store in stores]
        results = [future.result(timeout=10) for future in futures]
    assert results[0] == results[1]
    assert len(stores[0].history(ALICE, results[0]["spec"]["page_id"])) == 1
    with closing(sqlite3.connect(stores[0].path)) as con:
        assert con.execute("SELECT count(*) FROM receipts").fetchone()[0] == 1


@pytest.mark.parametrize("denied", [False, True])
def test_confirm_losing_to_applied_replays_history_after_head_and_access_change(tmp_path, denied):
    entered, release = Event(), Event()
    state = {"blocked": False, "now": 100}

    def resolver(actor, session_id, result_id):
        if state["blocked"]:
            entered.set()
            assert release.wait(5), "resolver was not released"
            if denied:
                raise AnalyticsError(403, "RESULT_REVOKED", "synthetic denial")
        return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))

    directory = private(tmp_path / "pages")
    store = PageDocumentStore(directory, resolve_binding=resolver, clock=lambda: state["now"])
    winner = PageDocumentStore(directory, resolve_binding=lambda *args: ResolvedPageBinding(
        "VERIFIED", frozenset({"brand-a"})), clock=lambda: state["now"])
    pending = store.generate(ALICE, draft(binding_manifest={
        "result_refs": ["result_fixture_1"], "bindings": [],
    }))
    state["blocked"] = True
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(confirm, store, pending, "alias")
        try:
            assert entered.wait(5), "resolver was not entered"
            saved = confirm(winner, pending, "winner")
            page_id = saved["spec"]["page_id"]
            newer = confirm(winner, winner.patch(ALICE, page_id, PagePatchPreview(
                base_version=1, title="new head")), "new-head")
            state["now"] = pending["expires_at_ms"]
        finally:
            release.set()
        assert future.result(timeout=5) == saved
    reopened = PageDocumentStore(directory, clock=lambda: state["now"])
    assert confirm(reopened, pending, "alias") == saved
    assert reopened.get(ALICE, page_id) == newer
    assert len(reopened.history(ALICE, page_id)) == 2
    with closing(sqlite3.connect(store.path)) as con:
        assert con.execute("SELECT preview_id FROM receipts WHERE key='alias'").fetchone()[0] == pending["preview_id"]


@pytest.mark.parametrize("status,expected_status", [("REVOKED", 403), ("STALE", 200)])
def test_http_confirm_rechecks_binding_status(tmp_path, status, expected_status):
    state = {"status": "VERIFIED"}
    registry = B0IdentityRegistry()
    registry.grant(TOKEN, ALICE)

    def resolver(actor, session_id, result_id):
        return ResolvedPageBinding(state["status"], frozenset({"brand-a"}))

    app = create_page_app(identities=registry, page_state_dir=private(tmp_path / "pages"), resolve_binding=resolver)
    headers = {"Authorization": "Bearer " + TOKEN, "Idempotency-Key": "http-confirm"}
    with TestClient(app) as client:
        preview_response = client.post(PREFIX + "/previews", headers=headers, json=draft(binding_manifest={
            "result_refs": ["result_fixture_1"], "bindings": [],
        }).model_dump(mode="json"))
        assert preview_response.status_code == 201
        pending = preview_response.json()
        state["status"] = status
        saved = client.post(PREFIX + f"/previews/{pending['preview_id']}/confirm", headers=headers)
        assert saved.status_code == expected_status
        assert saved.headers["cache-control"] == "no-store"
        if status == "REVOKED":
            assert saved.json()["error"]["code"] == "RESULT_REVOKED"
            assert client.get(PREFIX + "/pages", headers=headers).json()["items"] == []
        else:
            assert saved.json()["spec"]["binding_state"] == "BOUND_STALE"
            page_id = saved.json()["spec"]["page_id"]
            assert client.get(PREFIX + "/pages/" + page_id, headers=headers).json() == saved.json()


def test_foreign_or_linked_state_is_never_reinitialized(tmp_path):
    directory = private(tmp_path / "pages")
    path = directory / "page_documents.sqlite3"
    with closing(sqlite3.connect(path)) as conn:
        conn.execute("CREATE TABLE valuable(value TEXT)")
        conn.execute("INSERT INTO valuable VALUES ('keep')")
        conn.commit()
    before = path.read_bytes()
    with pytest.raises(ValueError):
        PageDocumentStore(directory)
    assert path.read_bytes() == before
    linked = private(tmp_path / "linked")
    os.symlink(path, linked / "page_documents.sqlite3")
    with pytest.raises(ValueError):
        PageDocumentStore(linked)
    assert path.read_bytes() == before


def test_boardspec_store_and_codec_stay_independent(tmp_path):
    pages = PageDocumentStore(private(tmp_path / "pages"))
    boards = BoardDocumentStore(private(tmp_path / "boards"))
    page = confirm(pages, pages.generate(ALICE, draft()))
    board_draft = BoardDraft.model_validate({"title": "经营看板", "session_id": "s1", "blocks": [
        {"block_id": "note", "kind": "TEXT", "title": "说明", "props": {"content": "旧内容"},
         "layout": {"x": 0, "y": 0, "w": 6, "h": 5}},
    ]})
    board = boards.confirm(ALICE, boards.generate(ALICE, board_draft)["preview_id"], "board")
    assert page["spec"]["schema_version"] == SCHEMA_VERSION
    assert board["spec"]["schema_version"] == "board-spec/v1"
    assert "blocks" not in page["spec"]
    assert "package" not in board["spec"]
    with pytest.raises(AnalyticsError, match="NOT_FOUND"):
        boards.get(ALICE, page["spec"]["page_id"])
    with pytest.raises(AnalyticsError, match="NOT_FOUND"):
        pages.get(ALICE, board["spec"]["board_id"])


def test_http_generate_patch_save_rollback_unknown_fields_and_reopen(tmp_path):
    registry = B0IdentityRegistry()
    registry.grant(TOKEN, ALICE)
    directory = private(tmp_path / "pages")
    headers = {"Authorization": "Bearer " + TOKEN}
    body = draft().model_dump(mode="json")
    with TestClient(create_page_app(identities=registry, page_state_dir=directory)) as client:
        assert client.get(PREFIX + "/pages").status_code == 401
        assert client.post(PREFIX + "/previews", json={**body, "owner": "alice"}).status_code == 422
        response = client.post(PREFIX + "/previews", headers=headers, json=body)
        assert response.status_code == 201, response.text
        assert response.headers["cache-control"] == "no-store"
        preview = response.json()
        assert preview["operation"] == "GENERATE"
        endpoint = PREFIX + "/previews/" + preview["preview_id"]
        assert client.get(PREFIX + "/pages", headers=headers).json() == {"items": []}
        assert client.post(endpoint + "/confirm", headers=headers).status_code == 428
        response = client.post(endpoint + "/confirm", headers={**headers, "Idempotency-Key": "save"})
        assert response.status_code == 200, response.text
        snapshot = response.json()
        page_id = snapshot["spec"]["page_id"]
        patch = {"base_version": 1, "package": sample_package(html="<html><h1>d6</h1></html>")}
        response = client.post(PREFIX + f"/pages/{page_id}/patch-preview", headers=headers, json=patch)
        assert response.status_code == 201 and response.json()["operation"] == "PATCH"
        assert client.post(PREFIX + "/previews/" + response.json()["preview_id"] + "/confirm",
                           headers={**headers, "Idempotency-Key": "d6"}).status_code == 200
        save = {"base_version": 2, "title": "d9", "package": sample_package(html="<html>d9</html>"),
                "binding_manifest": {"bindings": [], "result_refs": []}}
        response = client.post(PREFIX + f"/pages/{page_id}/save-preview", headers=headers, json=save)
        assert response.status_code == 201 and response.json()["operation"] == "SAVE"
        assert client.post(PREFIX + "/previews/" + response.json()["preview_id"] + "/confirm",
                           headers={**headers, "Idempotency-Key": "d9"}).status_code == 200
        rollback = {"base_version": 3, "to_version": 1}
        response = client.post(PREFIX + f"/pages/{page_id}/rollback-preview", headers=headers, json=rollback)
        assert response.status_code == 201 and response.json()["operation"] == "ROLLBACK"
        restored = client.post(PREFIX + "/previews/" + response.json()["preview_id"] + "/confirm",
                               headers={**headers, "Idempotency-Key": "rb"})
        assert restored.status_code == 200
        assert restored.json()["spec"]["package"]["html"] == body["package"]["html"]
        assert restored.json()["spec"]["version"] == 4
        forged = client.post(PREFIX + f"/pages/{page_id}/patch-preview", headers=headers,
                             json={**patch, "owner": "bob"})
        assert forged.status_code == 422
        assert forged.json()["error"]["code"] == "INVALID_PAGE"
        null_patch = client.post(PREFIX + f"/pages/{page_id}/patch-preview", headers=headers,
                                 json={"base_version": 4, "package": sample_package(), "title": None})
        assert null_patch.status_code == 422
        fat = {**body, "package": {**body["package"], "resources": [{
            "resource_id": "blob_1", "content_type": "image/png", "sha256": "a" * 64,
            "byte_length": PACKAGE_MAX_BYTES,
        }]}}
        huge = client.post(PREFIX + "/previews", headers=headers, json=fat)
        assert huge.status_code == 413
        assert huge.json()["error"]["code"] == "PACKAGE_TOO_LARGE"
        registry.revoke(TOKEN)
        assert client.get(PREFIX + f"/pages/{page_id}", headers=headers).status_code == 401
    registry.grant(TOKEN, ALICE)
    with TestClient(create_page_app(identities=registry, page_state_dir=directory)) as client:
        reopened = client.get(PREFIX + f"/pages/{page_id}", headers=headers)
        assert reopened.status_code == 200
        assert reopened.json()["spec"]["version"] == 4


def test_http_uses_the_offline_contract():
    schema = create_page_app().openapi()
    offline = page_documents_openapi()
    for name in ("PageDraft", "PageDocument", "PagePatchPreview", "PageSavePreview",
                 "PageRollbackPreview", "PagePreview", "PageSnapshot"):
        http = schema["components"]["schemas"][name]
        off = offline["components"]["schemas"][name]
        assert http["required"] == off["required"]
        assert set(http["properties"]) == set(off["properties"])
    paths = schema["paths"]
    for path, model in (("/previews", "PageDraft"), ("/pages/{page_id}/patch-preview", "PagePatchPreview"),
                        ("/pages/{page_id}/save-preview", "PageSavePreview"),
                        ("/pages/{page_id}/rollback-preview", "PageRollbackPreview")):
        assert paths[PREFIX + path]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/" + model}
    assert schema["x-page-http"] is True
    assert schema["x-b0-board-spec-untouched"] == "board-spec/v1"
    assert "INVALID_BOARD" not in schema["x-page-errors"]


@pytest.mark.parametrize("operation", ["save", "patch"])
@pytest.mark.parametrize("marker", ['data-page-readonly', 'data-sp-bindable="database"', ' data-page-readonly', ' data-sp-bindable="database"'])
@pytest.mark.parametrize("change", ["source-fact", "relative-title", "direct-title", "relative-fact", "direct-fact", "descendant-fact", "style"])
def test_readonly_adjacent_marker_and_real_target_path(tmp_path, operation, marker, change):
    store = PageDocumentStore(private(tmp_path / "pages"))
    package = {"html": '<div id="root"><h1 id="heading">Title</h1>'
               f'<p id="metric"{marker}><span id="value">42</span></p></div>',
               "css": "", "js": "", "resources": [], "node_map": []}
    spec = confirm(store, store.generate(ALICE, draft(package=package)))["spec"]
    package = deepcopy(spec["package"])
    if change == "source-fact":
        package["html"] = package["html"].replace('>42<', '>99<')
    else:
        identity = {"direct-title": "heading", "direct-fact": "metric", "descendant-fact": "value"}.get(change, "root")
        path = [] if identity != "root" else [{"tag": "h1" if change == "relative-title" else "p",
                                              "key": {"attribute": "nth", "value": "0"}}]
        edit = text_edit(identity, "Updated", path=path)
        if change == "style":
            edit.pop("text")
            edit["style"] = {"color": "blue"}
        package = presentation_package(package, edit)
    body = {"base_version": 1, "package": package}
    if operation == "save":
        body.update(title=spec["title"], binding_manifest=spec["binding_manifest"])
    request = (PageSavePreview if operation == "save" else PagePatchPreview).model_validate(body)
    apply = getattr(store, operation)
    if change in {"source-fact", "relative-fact", "direct-fact", "descendant-fact"}:
        with pytest.raises(AnalyticsError) as error:
            apply(ALICE, spec["page_id"], request)
        assert (error.value.status, error.value.code) == (403, "AI_BOUND_CONTENT")
        assert store.get(ALICE, spec["page_id"])["spec"] == spec
    else:
        saved = confirm(store, apply(ALICE, spec["page_id"], request), "edit")
        reopened = PageDocumentStore(store.path.parent).get(ALICE, spec["page_id"])
        assert reopened == saved
        assert saved["spec"]["package"]["html"] == spec["package"]["html"]
        assert saved["spec"]["package"]["presentation"] == request.package.model_dump(mode="json")["presentation"]


@pytest.mark.parametrize("operation", ["save", "patch"])
@pytest.mark.parametrize("marker", ["data-page-readonly", 'data-sp-bindable="database"'])
@pytest.mark.parametrize("binding_status", ["VERIFIED", "REVOKED"])
def test_readonly_page_can_add_authorized_result_binding(tmp_path, operation, marker, binding_status):
    calls = []

    def resolver(actor, session_id, result_id):
        calls.append((actor.actor_id, session_id, result_id))
        return ResolvedPageBinding(binding_status, frozenset({"brand-a"}))

    directory = private(tmp_path / "pages")
    store = PageDocumentStore(directory, resolve_binding=resolver)
    package = {"html": f'<p data-shine-node="metric" {marker}>42</p>',
               "css": "", "js": "", "resources": [], "node_map": [{
                   "node_id": "metric", "kind": "static_element", "selector": '[data-shine-node="metric"]',
               }]}
    before = confirm(store, store.generate(ALICE, draft(
        package=package, binding_manifest={"result_refs": [], "bindings": []},
    )))["spec"]
    assert before["binding_state"] == "UNBOUND_SAMPLE" and calls == []
    manifest = PageBindingManifest.model_validate({"result_refs": ["result_fixture_1"], "bindings": [{
        "binding_id": "binding_fixture", "result_ref": "result_fixture_1", "node_id": "metric",
    }]}).model_dump(mode="json")
    body = {"base_version": 1, "binding_manifest": manifest}
    if operation == "save":
        body.update(title=before["title"], package=before["package"])
    request = (PageSavePreview if operation == "save" else PagePatchPreview).model_validate(body)
    if binding_status == "REVOKED":
        with pytest.raises(AnalyticsError) as error:
            getattr(store, operation)(ALICE, before["page_id"], request)
        assert (error.value.status, error.value.code) == (403, "RESULT_REVOKED")
        assert PageDocumentStore(directory, resolve_binding=resolver).get(ALICE, before["page_id"])["spec"] == before
    else:
        saved = confirm(store, getattr(store, operation)(ALICE, before["page_id"], request), "bind")
        reopened = PageDocumentStore(directory, resolve_binding=resolver).get(ALICE, before["page_id"])
        assert reopened == saved
        assert saved["spec"]["version"] == 2 and saved["spec"]["binding_state"] == "BOUND_VERIFIED"
        assert saved["spec"]["binding_manifest"] == manifest
    assert calls and all(call == (ALICE.actor_id, before["session_id"], "result_fixture_1") for call in calls)
