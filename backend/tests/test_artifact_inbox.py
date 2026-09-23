"""Candidate HTML artifact inbox persistence and idempotency."""
from pathlib import Path

from fastapi.testclient import TestClient

from backend.contracts.competition_computed import DATA_SCOPE
from backend.services.analytics.access import AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.page_documents_routes import create_page_app


CAPS = frozenset({"dashboard:read", "dashboard:update"})
TOKEN = "artifact-inbox-test-token-with-more-than-32-chars"
PACKAGE = {"html": "<h1>收入复盘</h1>", "css": "", "js": "", "resources": [], "node_map": []}


def app(tmp_path: Path):
    registry = B0IdentityRegistry()
    registry.grant(TOKEN, AnalyticsPrincipal("alice", CAPS, frozenset({DATA_SCOPE})))
    return create_page_app(registry, page_state_dir=tmp_path)


def headers():
    return {"authorization": "Bearer " + TOKEN}


def test_intake_is_durable_and_idempotent(tmp_path):
    with TestClient(app(tmp_path)) as client:
        body = {"source": "page_package", "session_id": "session_main", "request_id": "page-gen-1",
                "title": "收入复盘", "package": PACKAGE}
        first = client.post("/api/v1/analytics/cockpit-artifacts", json=body, headers=headers())
        assert first.status_code == 201
        artifact = first.json()
        assert artifact["status"] == "PREVIEWABLE"
        assert artifact["idempotent"] is False
        second = client.post("/api/v1/analytics/cockpit-artifacts", json=body, headers=headers())
        assert second.status_code == 201
        assert second.json()["artifact_id"] == artifact["artifact_id"]
        assert second.json()["idempotent"] is True
        listed = client.get("/api/v1/analytics/cockpit-artifacts", headers=headers())
        assert [row["artifact_id"] for row in listed.json()["items"]] == [artifact["artifact_id"]]
        assert client.get("/api/v1/analytics/page-documents/pages", headers=headers()).json()["items"] == []

    with TestClient(app(tmp_path)) as client:
        listed = client.get("/api/v1/analytics/cockpit-artifacts", headers=headers())
        assert listed.status_code == 200
        assert listed.json()["items"][0]["artifact_id"] == artifact["artifact_id"]


def test_dedupe_identity_follows_source_contract(tmp_path):
    with TestClient(app(tmp_path)) as client:
        page = {"source": "page_package", "session_id": "session_a", "request_id": "request-1",
                "title": "候选页", "package": PACKAGE}
        first = client.post("/api/v1/analytics/cockpit-artifacts", json=page, headers=headers()).json()
        replay = client.post("/api/v1/analytics/cockpit-artifacts", json={**page, "session_id": "session_b"}, headers=headers()).json()
        assert replay["artifact_id"] == first["artifact_id"]
        changed_request = client.post("/api/v1/analytics/cockpit-artifacts", json={**page, "request_id": "request-2"}, headers=headers()).json()
        assert changed_request["artifact_id"] != first["artifact_id"]

        workspace = {"source": "workspace_file", "session_id": "session_a", "path": "out/page.html",
                     "title": "page.html", "content_hash": "d" * 64}
        workspace_replay = client.post("/api/v1/analytics/cockpit-artifacts", json=workspace, headers=headers()).json()
        assert workspace_replay["artifact_id"] != first["artifact_id"]
        same_workspace = client.post("/api/v1/analytics/cockpit-artifacts", json=workspace, headers=headers()).json()
        assert same_workspace["artifact_id"] == workspace_replay["artifact_id"]
        other_path = client.post("/api/v1/analytics/cockpit-artifacts", json={**workspace, "path": "out/other.html"}, headers=headers()).json()
        assert other_path["artifact_id"] != workspace_replay["artifact_id"]


def test_new_hash_and_confirm_or_dismiss_are_separate_from_page_store(tmp_path):
    with TestClient(app(tmp_path)) as client:
        base = {"source": "workspace_file", "session_id": "session_main", "path": "deliverables/page.html",
                "title": "page.html", "content_hash": "a" * 64}
        first = client.post("/api/v1/analytics/cockpit-artifacts", json=base, headers=headers()).json()
        second = client.post("/api/v1/analytics/cockpit-artifacts", json={**base, "content_hash": "b" * 64}, headers=headers()).json()
        assert first["artifact_id"] != second["artifact_id"]
        assert first["status"] == "RECEIVED"
        draft = client.post("/api/v1/analytics/page-documents/previews", json={
            "title": "page_saved", "session_id": "session_main", "package": PACKAGE,
            "origin_path": "deliverables/page.html",
            "origin_content_hash": "a" * 64,
            "binding_manifest": {"bindings": [], "result_refs": []},
        }, headers=headers())
        confirmed = client.post(f"/api/v1/analytics/page-documents/previews/{draft.json()['preview_id']}/confirm",
                                headers={**headers(), "Idempotency-Key": "artifact-link"})
        page_id = confirmed.json()["spec"]["page_id"]
        saved = client.post(f"/api/v1/analytics/cockpit-artifacts/{first['artifact_id']}/confirm", json={"page_id": page_id}, headers=headers())
        assert saved.status_code == 200
        assert saved.json()["status"] == "SAVED"
        dismissed = client.post(f"/api/v1/analytics/cockpit-artifacts/{second['artifact_id']}/dismiss", headers=headers())
        assert dismissed.status_code == 200
        assert dismissed.json()["status"] == "DISMISSED"
        active = client.get("/api/v1/analytics/cockpit-artifacts", headers=headers()).json()["items"]
        assert {row["status"] for row in active} == {"SAVED"}


def test_confirm_cannot_link_an_unrelated_page_and_saved_receipts_are_not_dismissible(tmp_path):
    with TestClient(app(tmp_path)) as client:
        artifact = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "workspace_file", "session_id": "session_main", "path": "deliverables/page.html",
            "title": "page.html", "content_hash": "a" * 64,
        }, headers=headers()).json()
        draft = client.post("/api/v1/analytics/page-documents/previews", json={
            "title": "unrelated", "session_id": "session_main", "package": PACKAGE,
            "origin_path": "other/page.html",
            "binding_manifest": {"bindings": [], "result_refs": []},
        }, headers=headers()).json()
        saved_page = client.post(
            f"/api/v1/analytics/page-documents/previews/{draft['preview_id']}/confirm",
            headers={**headers(), "Idempotency-Key": "unrelated-page"},
        ).json()["spec"]["page_id"]
        linked = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
            json={"page_id": saved_page}, headers=headers(),
        )
        assert linked.status_code == 409
        assert linked.json()["error"]["code"] == "ARTIFACT_SOURCE_MISMATCH"

        matching = client.post("/api/v1/analytics/page-documents/previews", json={
            "title": "matching", "session_id": "session_main", "package": PACKAGE,
            "origin_path": "deliverables/page.html",
            "origin_content_hash": "a" * 64,
            "binding_manifest": {"bindings": [], "result_refs": []},
        }, headers=headers()).json()
        matching_page = client.post(
            f"/api/v1/analytics/page-documents/previews/{matching['preview_id']}/confirm",
            headers={**headers(), "Idempotency-Key": "matching-page"},
        ).json()["spec"]["page_id"]
        assert client.post(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
            json={"page_id": matching_page}, headers=headers(),
        ).status_code == 200
        dismissed = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/dismiss", headers=headers(),
        )
        assert dismissed.status_code == 409
        assert dismissed.json()["error"]["code"] == "ARTIFACT_ALREADY_SAVED"


def test_list_is_metadata_only_and_get_returns_the_package(tmp_path):
    with TestClient(app(tmp_path)) as client:
        artifact = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "page_package", "session_id": "session_main", "request_id": "metadata-only",
            "title": "候选页", "package": PACKAGE,
        }, headers=headers()).json()
        listed = client.get("/api/v1/analytics/cockpit-artifacts", headers=headers()).json()["items"]
        assert listed[0]["artifact_id"] == artifact["artifact_id"]
        assert "package" not in listed[0]
        fetched = client.get(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}", headers=headers(),
        ).json()
        assert fetched["package"] == {**PACKAGE, "presentation": None}


def test_windows_paths_are_rejected(tmp_path):
    with TestClient(app(tmp_path)) as client:
        for path in ("C:/workspace/page.html", "c:\\workspace\\page.html"):
            receipt = client.post("/api/v1/analytics/cockpit-artifacts", json={
                "source": "workspace_file", "session_id": "session_main", "path": path,
                "title": "page.html", "content_hash": "a" * 64,
            }, headers=headers())
            assert receipt.status_code == 422
            assert receipt.json()["error"]["code"] == "INVALID_ARTIFACT"


def test_native_present_is_a_first_class_receipt(tmp_path):
    with TestClient(app(tmp_path)) as client:
        receipt = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "native_present", "session_id": "session_main", "path": "deliverables/presented.html",
            "title": "presented.html", "content_hash": "c" * 64,
        }, headers=headers())
        assert receipt.status_code == 201
        assert receipt.json()["source"] == "native_present"
        assert receipt.json()["status"] == "RECEIVED"
        replay = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "native_present", "session_id": "session_main", "path": "deliverables/presented.html",
            "title": "presented.html", "content_hash": "c" * 64, "call_id": "different-call",
        }, headers=headers())
        assert replay.json()["artifact_id"] == receipt.json()["artifact_id"]
        assert replay.json()["idempotent"] is True
        cross_source = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "workspace_file", "session_id": "session_main", "path": "deliverables/presented.html",
            "title": "presented.html", "content_hash": "c" * 64,
        }, headers=headers())
        assert cross_source.json()["artifact_id"] == receipt.json()["artifact_id"]
        assert cross_source.json()["idempotent"] is True


def test_workspace_receipt_requires_content_hash(tmp_path):
    with TestClient(app(tmp_path)) as client:
        receipt = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "workspace_file", "session_id": "session_main", "path": "deliverables/page.html",
            "title": "page.html",
        }, headers=headers())
        assert receipt.status_code == 422
        assert receipt.json()["error"]["code"] == "CONTENT_HASH_REQUIRED"


def test_workspace_receipt_requires_source_path(tmp_path):
    with TestClient(app(tmp_path)) as client:
        receipt = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "workspace_file", "session_id": "session_main",
            "title": "page.html", "content_hash": "a" * 64,
        }, headers=headers())
        assert receipt.status_code == 422
        assert receipt.json()["error"]["code"] == "INVALID_ARTIFACT"


def test_malformed_artifact_body_uses_artifact_contract_error(tmp_path):
    with TestClient(app(tmp_path)) as client:
        receipt = client.post("/api/v1/analytics/cockpit-artifacts", data="[]", headers={**headers(), "content-type": "application/json"})
        assert receipt.status_code == 422
        assert receipt.json()["error"]["code"] == "INVALID_ARTIFACT"


def test_page_package_hash_cannot_be_forged(tmp_path):
    with TestClient(app(tmp_path)) as client:
        receipt = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "page_package", "session_id": "session_main", "request_id": "hash-mismatch",
            "title": "候选页", "package": PACKAGE, "content_hash": "f" * 64,
        }, headers=headers())
        assert receipt.status_code == 422
        assert receipt.json()["error"]["code"] == "CONTENT_HASH_MISMATCH"


def test_candidate_to_page_confirmation_is_a_two_step_write(tmp_path):
    with TestClient(app(tmp_path)) as client:
        draft = client.post("/api/v1/analytics/page-documents/previews", json={
            "title": "候选页", "session_id": "session_main", "package": PACKAGE,
            "binding_manifest": {"bindings": [], "result_refs": []},
        }, headers=headers())
        assert draft.status_code == 201
        preview_id = draft.json()["preview_id"]
        artifact = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "page_package", "session_id": "session_main", "request_id": "page-gen-integration",
            "title": "候选页", "package": PACKAGE,
        }, headers=headers()).json()
        assert client.get("/api/v1/analytics/page-documents/pages", headers=headers()).json()["items"] == []

        confirmed = client.post(f"/api/v1/analytics/page-documents/previews/{preview_id}/confirm",
                                headers={**headers(), "Idempotency-Key": "integration-confirm"})
        assert confirmed.status_code == 200
        page_id = confirmed.json()["spec"]["page_id"]
        assert len(client.get("/api/v1/analytics/page-documents/pages", headers=headers()).json()["items"]) == 1

        linked = client.post(f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
                             json={"page_id": page_id}, headers=headers())
        assert linked.status_code == 200
        assert linked.json()["status"] == "SAVED"


def test_artifact_cannot_be_marked_saved_for_a_missing_page(tmp_path):
    with TestClient(app(tmp_path)) as client:
        artifact = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "page_package", "session_id": "session_main", "request_id": "missing-page",
            "title": "候选页", "package": PACKAGE,
        }, headers=headers()).json()
        linked = client.post(f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
                             json={"page_id": "page_does_not_exist"}, headers=headers())
        assert linked.status_code == 404
        assert client.get(f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}", headers=headers()).json()["status"] == "PREVIEWABLE"


def test_artifact_contract_rejects_invalid_source_fields_and_hashes(tmp_path):
    with TestClient(app(tmp_path)) as client:
        base = {"source": "workspace_file", "session_id": "session_main", "path": "deliverables/page.html",
                "title": "page.html", "content_hash": "a" * 64}
        cases = [
            ({**base, "source": "unknown"}, "INVALID_ARTIFACT"),
            ({**base, "session_id": ""}, "INVALID_ARTIFACT"),
            ({**base, "title": "   "}, "INVALID_ARTIFACT"),
            ({**base, "path": "../page.html"}, "INVALID_ARTIFACT"),
            ({**base, "request_id": ""}, "INVALID_ARTIFACT"),
            ({**base, "call_id": 7}, "INVALID_ARTIFACT"),
            ({**base, "content_hash": "z" * 64}, "INVALID_ARTIFACT"),
            ({"source": "native_present", "session_id": "session_main", "title": "page.html",
              "content_hash": "a" * 64}, "INVALID_ARTIFACT"),
            ({"source": "page_package", "session_id": "session_main", "title": "page.html"}, "INVALID_ARTIFACT"),
            ({"source": "page_package", "session_id": "session_main", "title": "page.html",
              "package": {"html": 42}}, "INVALID_ARTIFACT"),
        ]
        for body, code in cases:
            receipt = client.post("/api/v1/analytics/cockpit-artifacts", json=body, headers=headers())
            assert receipt.status_code == 422, body
            assert receipt.json()["error"]["code"] == code, body


def test_listing_supports_status_filter_pagination_and_missing_receipts(tmp_path):
    with TestClient(app(tmp_path)) as client:
        for index in range(2):
            receipt = client.post("/api/v1/analytics/cockpit-artifacts", json={
                "source": "page_package", "session_id": "session_main", "request_id": f"list-{index}",
                "title": f"候选页 {index}", "package": PACKAGE,
            }, headers=headers())
            assert receipt.status_code == 201

        first = client.get("/api/v1/analytics/cockpit-artifacts?limit=1", headers=headers())
        assert first.status_code == 200
        assert len(first.json()["items"]) == 1
        assert first.json()["next_offset"] == 1
        second = client.get("/api/v1/analytics/cockpit-artifacts?limit=1&offset=1", headers=headers())
        assert second.status_code == 200
        assert second.json()["next_offset"] is None
        filtered = client.get("/api/v1/analytics/cockpit-artifacts?status=PREVIEWABLE", headers=headers())
        assert len(filtered.json()["items"]) == 2

        invalid_limit = client.get("/api/v1/analytics/cockpit-artifacts?limit=0", headers=headers())
        assert invalid_limit.status_code == 422
        assert invalid_limit.json()["error"]["code"] == "INVALID_PAGE"
        invalid_status = client.get("/api/v1/analytics/cockpit-artifacts?status=NOPE", headers=headers())
        assert invalid_status.status_code == 422
        assert invalid_status.json()["error"]["code"] == "INVALID_ARTIFACT"
        missing = client.get("/api/v1/analytics/cockpit-artifacts/artifact_missing", headers=headers())
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "NOT_FOUND"


def test_confirm_is_idempotent_and_dismissed_receipts_cannot_be_confirmed(tmp_path):
    with TestClient(app(tmp_path)) as client:
        artifact = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "page_package", "session_id": "session_main", "request_id": "confirm-repeat",
            "title": "候选页", "package": PACKAGE,
        }, headers=headers()).json()
        draft = client.post("/api/v1/analytics/page-documents/previews", json={
            "title": "候选页", "session_id": "session_main", "package": PACKAGE,
            "binding_manifest": {"bindings": [], "result_refs": []},
        }, headers=headers()).json()
        page_id = client.post(
            f"/api/v1/analytics/page-documents/previews/{draft['preview_id']}/confirm",
            headers={**headers(), "Idempotency-Key": "confirm-repeat-page"},
        ).json()["spec"]["page_id"]
        confirmed = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
            json={"page_id": page_id}, headers=headers(),
        )
        assert confirmed.status_code == 200
        repeated = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
            json={"page_id": page_id}, headers=headers(),
        )
        assert repeated.status_code == 200
        assert repeated.json()["page_id"] == page_id
        other = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{artifact['artifact_id']}/confirm",
            json={"page_id": "another-page"}, headers=headers(),
        )
        assert other.status_code == 409
        assert other.json()["error"]["code"] == "ARTIFACT_ALREADY_LINKED"

        dismissed = client.post("/api/v1/analytics/cockpit-artifacts", json={
            "source": "workspace_file", "session_id": "session_main", "path": "deliverables/other.html",
            "title": "other.html", "content_hash": "b" * 64,
        }, headers=headers()).json()
        assert client.post(
            f"/api/v1/analytics/cockpit-artifacts/{dismissed['artifact_id']}/dismiss", headers=headers(),
        ).status_code == 200
        repeat_dismiss = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{dismissed['artifact_id']}/dismiss", headers=headers(),
        )
        assert repeat_dismiss.status_code == 200
        rejected = client.post(
            f"/api/v1/analytics/cockpit-artifacts/{dismissed['artifact_id']}/confirm",
            json={"page_id": "page_does_not_matter"}, headers=headers(),
        )
        assert rejected.status_code == 409
        assert rejected.json()["error"]["code"] == "ARTIFACT_DISMISSED"
