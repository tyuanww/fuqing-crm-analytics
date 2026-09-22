import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.contracts.page_documents import (
    EDIT_ACTIONS,
    EDIT_CHANNELS,
    PAGE_ERRORS,
    PageDocument,
    PagePackage,
    admit_edit,
    evaluate_cas,
    page_documents_openapi,
    parse_edit_context,
    parse_edit_operation,
    parse_node_ref,
)


HASH = "a" * 64
OTHER = "b" * 64
ROOT = Path(__file__).resolve().parents[3]


def node(**overrides):
    value = {
        "page_id": "page_1",
        "node_id": "n_title",
        "kind": "static_element",
        "selector": "[data-shine-node='n_title']",
        "source_range": {"start": 10, "end": 40},
        "mapping_token": "map_token_1",
        "source_hash": HASH,
        "region_hash": HASH,
    }
    value.update(overrides)
    return value


def scope(**overrides):
    value = {"page_id": "page_1", "node_id": "n_title", "source_range": {"start": 0, "end": 80}}
    value.update(overrides)
    return value


def cas(**overrides):
    value = {"base_version": 3, "source_hash": HASH, "region_hash": HASH, "idempotency_key": "idem_1"}
    value.update(overrides)
    return value


def operation(**overrides):
    value = {
        "schema_version": "free-page-edit/v1",
        "operation_id": "op_1",
        "channel": "source",
        "action": "replace",
        "selected_scope": scope(),
        "capabilities": ["edit:source"],
        "node": node(),
        "cas": cas(),
        "encoding": "bytes",
        "payload": "你好",
        "byte_length": 6,
        "splice": {"start": 10, "end": 40},
        "expected_region_hash": HASH,
    }
    value.update(overrides)
    return value


def context(**overrides):
    value = {
        "schema_version": "free-page-edit-context/v1",
        "edit_context_id": "ctx_1",
        "user_id": "user_1",
        "tenant_id": "tenant_1",
        "page_id": "page_1",
        "version": 3,
        "selected_node": node(),
        "capabilities": ["edit:presentation", "edit:source", "edit:logic"],
        "created_at": 1000,
        "expires_at": 11000,
        "ttl_ms": 10000,
    }
    value.update(overrides)
    return value


def head(**overrides):
    value = {
        "actor_user_id": "user_1",
        "actor_tenant_id": "tenant_1",
        "now_ms": 5000,
        "version": 3,
        "source_hash": HASH,
        "region_hash": HASH,
    }
    value.update(overrides)
    return value


def test_legacy_page_document_reads_without_migration_fields():
    document = PageDocument(
        title="未绑定经营复盘",
        session_id="native_session_fixture",
        package=PagePackage(html="<!doctype html><html><body><h1>示例</h1></body></html>", css="", js=""),
        page_id="page_fixture_unbound",
        version=1,
        binding_state="UNBOUND_SAMPLE",
    )
    assert document.schema_version == "free-page/v1"
    assert "source_hash" not in document.model_dump()
    with pytest.raises(ValidationError):
        PageDocument.model_validate({**document.model_dump(), "region_hash": HASH})


def test_success_paths_admit_overlay_source_and_logic():
    presentation = operation(
        operation_id="op_overlay",
        channel="presentation",
        action="update",
        capabilities=["edit:presentation"],
        encoding="overlay",
        payload={"text": "新标题"},
        byte_length=0,
        splice=None,
        expected_region_hash=None,
    )
    admitted = admit_edit(
        parse_edit_context(context()).get("value"),
        parse_edit_operation(presentation).get("value"),
        **head(),
    )
    assert admitted["ok"] is True
    assert admitted["value"]["operation"].encoding == "overlay"
    assert admitted["value"]["operation"].payload.text == "新标题"
    assert admitted["value"]["operation"].splice is None

    source = parse_edit_operation(operation())
    assert source["ok"] is True
    assert admit_edit(parse_edit_context(context())["value"], source["value"], **head())["ok"] is True

    logic = operation(
        operation_id="op_logic",
        channel="logic",
        action="update",
        capabilities=["edit:logic"],
        payload="x",
        byte_length=1,
        splice={"start": 12, "end": 18},
    )
    logic_edit = parse_edit_operation(logic)
    assert logic_edit["ok"] is True
    assert admit_edit(parse_edit_context(context())["value"], logic_edit["value"], **head())["ok"] is True

    moved = operation(action="move", payload="ab", byte_length=2, splice={"start": 10, "end": 20}, destination={"start": 30, "end": 30})
    assert parse_edit_operation(moved)["ok"] is True
    deleted = operation(action="delete", payload=None, byte_length=0, splice={"start": 10, "end": 20})
    assert parse_edit_operation(deleted)["value"].payload is None
    inserted = operation(action="insert", payload="Z", byte_length=1, splice={"start": 20, "end": 20})
    assert parse_edit_operation(inserted)["ok"] is True


def test_illegal_fields_unknown_operation_and_overlay_boundary():
    assert parse_node_ref({**node(), "owner": "alice"})["error"]["code"] == "INVALID_EDIT"
    assert parse_node_ref({**node(), "selector": None, "source_range": None})["error"]["code"] == "INVALID_EDIT"
    assert parse_edit_operation({**operation(), "sql": "select 1"})["error"]["code"] == "INVALID_EDIT"
    assert parse_edit_operation({**operation(), "action": "compile"})["error"]["code"] == "INVALID_EDIT"
    assert parse_edit_operation({**operation(), "action": "compile"})["error"]["message"] == "未知 operation"
    bytes_overlay = operation(channel="presentation", capabilities=["edit:presentation"], encoding="bytes")
    assert parse_edit_operation(bytes_overlay)["error"]["code"] == "INVALID_EDIT"
    missing_splice = operation()
    missing_splice.pop("splice")
    assert "未知字节" in parse_edit_operation(missing_splice)["error"]["message"]
    script_overlay = operation(
        channel="presentation",
        action="update",
        capabilities=["edit:presentation"],
        encoding="overlay",
        payload={"innerHTML": "<script>"},
        byte_length=0,
        splice=None,
        expected_region_hash=None,
    )
    assert parse_edit_operation(script_overlay)["error"]["code"] == "INVALID_EDIT"


def test_hash_mismatch_version_conflict_expiry_scope_and_capability():
    mismatched = operation(cas=cas(region_hash=OTHER))
    assert parse_edit_operation(mismatched)["error"]["code"] == "CAS_CONFLICT"
    parsed = parse_edit_operation(operation())["value"]
    assert evaluate_cas(parsed.cas, version=3, source_hash=HASH, region_hash=OTHER)["error"]["code"] == "CAS_CONFLICT"
    assert evaluate_cas(parsed.cas, version=4, source_hash=HASH, region_hash=HASH)["error"]["code"] == "VERSION_CONFLICT"
    replay = evaluate_cas(
        parsed.cas,
        version=9,
        source_hash=OTHER,
        region_hash=OTHER,
        prior={"idempotency_key": "idem_1", "fingerprint": "other"},
    )
    assert replay["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    ctx = parse_edit_context(context())["value"]
    assert admit_edit(ctx, parsed, **head(now_ms=11000))["error"]["code"] == "EDIT_EXPIRED"
    assert admit_edit(ctx, parsed, **head(version=4))["error"]["code"] == "VERSION_CONFLICT"
    assert admit_edit(ctx, parsed, **head(region_hash=OTHER))["error"]["code"] == "CAS_CONFLICT"
    outside = operation(splice={"start": 40, "end": 50})
    assert parse_edit_operation(outside)["error"]["code"] == "SCOPE_VIOLATION"
    other_node = operation(node=node(node_id="n_other"), selected_scope=scope(node_id="n_other"))
    other = parse_edit_operation(other_node)["value"]
    assert admit_edit(ctx, other, **head())["error"]["code"] == "SCOPE_VIOLATION"
    narrowed = parse_edit_context(context(capabilities=["edit:presentation"]))["value"]
    assert admit_edit(narrowed, parsed, **head())["error"]["code"] == "CAPABILITY_DENIED"
    assert admit_edit(ctx, parsed, **head(actor_user_id="user_2"))["error"]["code"] == "FORBIDDEN"


def test_openapi_freezes_edit_sets_and_leaves_page_document_unchanged():
    schema = page_documents_openapi()
    assert schema["x-edit-channels"] == list(EDIT_CHANNELS)
    assert schema["x-edit-actions"] == list(EDIT_ACTIONS)
    assert schema["x-edit-presentation"] == "overlay"
    assert schema["x-edit-source-logic"] == "hashed-byte-splice"
    assert schema["x-page-errors"]["VERSION_CONFLICT"] == 409
    assert schema["x-page-errors"]["CAS_CONFLICT"] == 409
    assert schema["x-page-errors"]["SCOPE_VIOLATION"] == 422
    assert PAGE_ERRORS["EDIT_EXPIRED"] == 409
    document = json.dumps(schema["components"]["schemas"]["PageDocument"])
    package = schema["components"]["schemas"]["PagePackage"]["properties"]
    assert "source_hash" not in document
    assert "selected_node" not in document
    assert set(package) == {"html", "css", "js", "resources", "node_map", "presentation"}
    published = json.loads((ROOT / "backend/contracts/analytics-page.openapi.json").read_text(encoding="utf-8"))
    assert published["x-edit-actions"] == list(EDIT_ACTIONS)
    assert "NodeRef" in published["components"]["schemas"]
    assert "EditContext" in published["components"]["schemas"]
