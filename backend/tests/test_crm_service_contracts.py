"""Independent service API/version and public-synthetic boundary evidence."""
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.crm_knowledge_app import create_crm_knowledge_app
from backend.crm_metrics_app import create_crm_metrics_app
from backend.crm_service_contracts import CONTRACT_HEADER, service_contract


def test_offline_generated_contracts_match_domain_sources(tmp_path):
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run([sys.executable, str(root / "scripts/crm-calibration/generate_contract.py"), "--check"],
                            cwd=tmp_path, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("domain,factory", [
    ("metrics", create_crm_metrics_app), ("knowledge", create_crm_knowledge_app),
])
def test_api_version_and_domain_are_checked_on_every_request(domain, factory):
    contract = service_contract(domain)
    identity = f"{contract['contract']}/{contract['api_version']}"
    path = f"{contract['base_path']}/capabilities"
    schema = factory().openapi()
    parameter = next(row for row in schema["paths"][path]["get"]["parameters"] if row["name"] == CONTRACT_HEADER)
    assert parameter["in"] == "header"
    assert parameter["required"] is (domain == "knowledge")
    assert parameter["schema"]["const"] == identity
    with TestClient(factory()) as client:
        response = client.get(path, headers={CONTRACT_HEADER: identity})
        assert response.status_code == 200
        assert response.headers[CONTRACT_HEADER] == identity
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["contract"] == contract["contract"]
        assert response.json()["api_version"] == "1.0.0"
        for bad in ["crm-metrics-service/2.0.0", "unrelated/1.0.0", identity + "-rc.1"]:
            response = client.get(path, headers={CONTRACT_HEADER: bad})
            assert response.status_code == 409
            assert response.json()["code"] == "CONTRACT_MISMATCH"
        response = client.get(path, headers={CONTRACT_HEADER: identity, "Origin": "https://example.invalid"})
        assert response.status_code == 403
        assert "access-control-allow-origin" not in response.headers


def test_knowledge_is_a_separate_app_and_requires_the_public_contract():
    with TestClient(create_crm_knowledge_app()) as client:
        path = "/api/v1/crm-knowledge/explain"
        assert client.post(path, json={"topic": "客单价"}).status_code == 409
        headers = {CONTRACT_HEADER: "crm-knowledge-service/1.0.0"}
        response = client.post(path, json={"topic": "客单价"}, headers=headers)
        assert response.status_code == 200, response.text
        result = response.json()
        assert "D001" in result["decision_ids"]
        assert result["synthetic"] is True
        assert result["content_scope"] == "public_synthetic_pack_only"
        assert result["execution_authorized"] is False
        assert result["document_acl_connected"] is False
        assert result["real_business_acceptance"] is False
        assert client.post("/api/v1/crm-metrics/query", json={}, headers=headers).status_code == 404


def test_standalone_metrics_has_strict_negotiation_and_no_legacy_knowledge_route():
    app = create_crm_metrics_app(legacy_adapter=False)
    schema = app.openapi()
    assert schema["info"]["version"] == "1.0.0"
    assert "/api/v1/crm-metrics/explain" not in schema["paths"]
    with TestClient(app) as client:
        assert client.get("/api/v1/crm-metrics/capabilities").status_code == 409
        headers = {CONTRACT_HEADER: "crm-metrics-service/1.0.0"}
        assert client.get("/api/v1/crm-metrics/capabilities", headers=headers).status_code == 200
        assert client.post("/api/v1/crm-metrics/explain", headers=headers, json={"topic": "aus"}).status_code == 404


@pytest.mark.parametrize("payload", [
    {"topic": ""}, {"topic": "x" * 513}, {"topic": 1},
    {"topic": "客单价", "path": "/private/knowledge"},
    {"topic": "客单价", "contains_real_data": True},
    {"topic": "客单价", "sql": "select * from private"},
])
def test_knowledge_rejects_undeclared_input_without_echo(payload):
    with TestClient(create_crm_knowledge_app()) as client:
        response = client.post("/api/v1/crm-knowledge/explain", json=payload,
                               headers={CONTRACT_HEADER: "crm-knowledge-service/1.0.0"})
        assert response.status_code == 422
        assert response.json() == {"status": "UNAVAILABLE", "code": "INVALID_REQUEST"}


def test_legacy_explain_adapter_keeps_its_existing_response_during_migration():
    with TestClient(create_crm_metrics_app()) as client:
        old = client.post("/api/v1/crm-metrics/explain", json={"topic": "客单价"})
    with TestClient(create_crm_knowledge_app()) as client:
        new = client.post("/api/v1/crm-knowledge/explain", json={"topic": "客单价"},
                          headers={CONTRACT_HEADER: "crm-knowledge-service/1.0.0"})
    assert old.status_code == new.status_code == 200
    assert old.json() == new.json()


def test_metrics_app_never_accepts_real_sources_or_model_sql():
    body = {
        "source_id": "synthetic-crm-metrics", "contains_real_data": False, "metric_version": "crm-metrics/v1",
        "query_id": "sales_window_summary", "period_start": "2026-09-01", "period_end_exclusive": "2026-10-01",
        "refund_view": "ORDER_COHORT_AS_OF", "refund_as_of": "2026-09-21T00:00:00+08:00",
        "data_through": "2026-09-21T00:00:00+08:00",
    }
    with TestClient(create_crm_metrics_app()) as client:
        for mutation in [{"contains_real_data": True}, {"source_id": "/archive/real.duckdb"}, {"sql": "select 1"}]:
            response = client.post("/api/v1/crm-metrics/query", json={**body, **mutation},
                                   headers={CONTRACT_HEADER: "crm-metrics-service/1.0.0"})
            assert response.status_code in {400, 422}
            assert response.json()["status"] == "UNAVAILABLE"
            assert "facts" not in response.json()


@pytest.mark.parametrize("domain,legacy", [("metrics", True), ("metrics", False), ("knowledge", False)])
def test_published_error_contract_matches_actual_sanitized_responses(domain, legacy):
    app = create_crm_metrics_app(legacy_adapter=legacy) if domain == "metrics" else create_crm_knowledge_app()
    schema = app.openapi()
    prefix = f"/api/v1/crm-{domain}"
    identity = f"crm-{domain}-service/1.0.0"
    headers = {CONTRACT_HEADER: identity}
    path = prefix + ("/query" if domain == "metrics" else "/explain")
    with TestClient(app) as client:
        responses = [
            (path, "post", client.post(path, json={}, headers=headers), 422, "INVALID_REQUEST"),
            (prefix + "/capabilities", "get", client.get(prefix + "/capabilities", headers={
                **headers, "Origin": "https://example.invalid"}), 403, "ORIGIN_REJECTED"),
            (prefix + "/capabilities", "get", client.get(prefix + "/capabilities", headers={
                CONTRACT_HEADER: "unrelated/1.0.0"}), 409, "CONTRACT_MISMATCH"),
        ]
        if domain == "metrics":
            responses.append((path, "post", client.post(path, headers=headers, json={
                "source_id": "synthetic-crm-metrics", "contains_real_data": True,
                "metric_version": "crm-metrics/v1", "query_id": "sales_window_summary",
                "period_start": "2026-09-01", "period_end_exclusive": "2026-10-01",
                "refund_view": "ORDER_COHORT_AS_OF", "refund_as_of": "2026-09-21T00:00:00+08:00",
                "data_through": "2026-09-21T00:00:00+08:00",
            }), 400, "FORBIDDEN"))
        for route, method, response, status, code in responses:
            assert response.status_code == status
            assert response.headers[CONTRACT_HEADER] == identity
            assert response.headers["cache-control"] == "no-store"
            body = response.json()
            assert body["status"] == "UNAVAILABLE" and body["code"] == code
            declared = schema["paths"][route][method]["responses"]
            assert str(status) in declared, f"undocumented {status}: {route}"
            error_schema = declared[str(status)]["content"]["application/json"]["schema"]
            if "$ref" in error_schema:
                error_schema = schema["components"]["schemas"][error_schema["$ref"].rsplit("/", 1)[1]]
            assert set(body) <= error_schema["properties"].keys()
            assert {"status", "code"} <= set(error_schema["required"]) <= body.keys()
            assert error_schema["properties"]["status"]["const"] == "UNAVAILABLE"
            assert "detail" not in body
