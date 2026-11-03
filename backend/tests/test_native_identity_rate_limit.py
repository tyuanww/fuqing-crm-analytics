import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend import main
from backend.routers import auth


@pytest.fixture
def request_limit(monkeypatch):
    monkeypatch.delenv("RATE_LIMIT_PER_MINUTE", raising=False)
    monkeypatch.delenv("IDENTITY_RATE_LIMIT_PER_MINUTE", raising=False)
    monkeypatch.setattr(auth, "ACTIVE_TOKENS", {
        "synthetic-admin-token": ("admin", datetime.now()),
        "synthetic-other-token": ("other", datetime.now()),
    })

    async def admitted(_request):
        return JSONResponse({"ok": True})

    def request(path, token="synthetic-admin-token", method="GET"):
        scope = {"type": "http", "method": method, "path": path, "root_path": "",
                 "query_string": b"", "scheme": "http", "server": ("testserver", 80),
                 "client": ("127.0.0.1", 1),
                 "headers": [(b"authorization", f"Bearer {token}".encode())]}
        return asyncio.run(main.rate_limit_middleware(Request(scope), admitted))

    return request


def test_native_snapshot_identity_checks_do_not_spend_query_quota(request_limit):
    for _ in range(5):
        for _ in range(15):
            assert request_limit("/api/v1/auth/me").status_code == 200
        assert request_limit("/api/v1/metrics/warehouse-snapshots", method="POST").status_code == 200
    response = request_limit("/api/v1/metrics/warehouse-snapshots", method="POST")
    assert response.headers["X-RateLimit-Limit"] == "60"
    assert response.headers["X-RateLimit-Remaining"] == "54"


def test_identity_quota_is_bounded_and_separate_per_user(request_limit, monkeypatch):
    monkeypatch.setenv("IDENTITY_RATE_LIMIT_PER_MINUTE", "3")
    for _ in range(3):
        assert request_limit("/api/v1/auth/me").status_code == 200
    limited = request_limit("/api/v1/auth/me")
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "60"
    assert limited.headers["X-RateLimit-Limit"] == "3"
    assert request_limit("/api/v1/auth/me", "synthetic-other-token").status_code == 200
    assert request_limit("/api/v1/metrics/warehouse-snapshots", method="POST").status_code == 200


@pytest.mark.parametrize("path,token,method", [
    ("/api/v1/auth/me", "invalid", "GET"),
    ("/api/v1/auth/me/", "synthetic-admin-token", "GET"),
    ("/api/v1/auth/me", "synthetic-admin-token", "POST"),
    ("/api/v1/metrics/warehouse-snapshots", "synthetic-admin-token", "POST"),
])
def test_identity_budget_cannot_expand_other_request_limits(request_limit, monkeypatch, path, token, method):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    for _ in range(2):
        assert request_limit(path, token, method).status_code == 200
    response = request_limit(path, token, method)
    assert response.status_code == 429
    assert response.headers["X-RateLimit-Limit"] == "2"


@pytest.mark.parametrize("change", ["revoke", "expire"])
def test_identity_budget_does_not_cache_authorization(request_limit, change):
    client = TestClient(main.app)
    token = "synthetic-admin-token"
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
    if change == "revoke":
        auth.ACTIVE_TOKENS.pop(token)
    else:
        auth.ACTIVE_TOKENS[token] = ("admin", datetime.now() - auth.TOKEN_TTL - timedelta(seconds=1))
    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["X-RateLimit-Limit"] == "60"
