"""Real child-process failure cleanup; these fixtures do not prove an artifact."""
import hashlib
import json
import os
import sys

import pytest

from backend.tests.first_purchase_packed_service_support import PackedFirstPurchaseService


@pytest.mark.skipif(os.name != "posix" or sys.version_info[:2] != (3, 14), reason="owned POSIX Python 3.14 drill")
@pytest.mark.parametrize("origin, detail", [
    ("http://127.0.0.1:9", "OWNED_LIFECYCLE_FAILURE"),
    ("https://production.invalid", "AssertionError"),
])
def test_owned_service_failure_exits_and_preserves_diagnostic(tmp_path, origin, detail):
    app = tmp_path / "app"
    app.mkdir()
    manifest = b'{}\n'
    (app / "service-manifest.json").write_bytes(manifest)
    (app / "service.py").write_text("raise RuntimeError('OWNED_LIFECYCLE_FAILURE')\n")
    state = tmp_path / "owned-state"
    state.mkdir(mode=0o700)
    service = PackedFirstPurchaseService({"python": sys.executable, "app": str(app),
        "manifest_sha256": hashlib.sha256(manifest).hexdigest()}, state, "a" * 64, origin)
    with pytest.raises(AssertionError, match="HOST_SERVICE_START_FAILED"):
        with service:
            pytest.fail("a rejected driver must never become ready")
    assert service.process is None and service.error_log is None
    receipts = json.loads((state / "service-processes/processes.json").read_text())
    assert len(receipts) == 1 and receipts[0]["status"] == "START_FAILED"
    assert receipts[0]["process_exited"] and not receipts[0]["forced_kill"]
    with pytest.raises(ProcessLookupError):
        os.kill(receipts[0]["pid"], 0)
    assert detail in (state / "service-processes/service-0.stderr").read_text()
    assert not (state / "analyses").exists()


@pytest.mark.skipif(os.name != "posix" or sys.version_info[:2] != (3, 14), reason="owned POSIX Python 3.14 drill")
def test_http_source_driver_rejects_query_database_access_before_bootstrap(tmp_path):
    app, state = tmp_path / "app", tmp_path / "save-owner"
    app.mkdir()
    state.mkdir(mode=0o700)
    forbidden = tmp_path / "query-owner.sqlite3"
    manifest = b'{}\n'
    (app / "service-manifest.json").write_bytes(manifest)
    (app / "service.py").write_text(f"import sqlite3\nsqlite3.connect({forbidden.as_uri()!r}, uri=True)\n")
    service = PackedFirstPurchaseService({"python": sys.executable, "app": str(app),
        "manifest_sha256": hashlib.sha256(manifest).hexdigest(), "source_contract": "first-purchase-frozen-source/v1",
        "query_runtime": "independent-offline-query-artifact"}, state, "a" * 64, "http://127.0.0.1:9")
    with pytest.raises(AssertionError, match="HOST_SERVICE_START_FAILED"):
        with service:
            pytest.fail("a query database must never be opened by the saved service")
    receipt, = json.loads((state / "service-processes/processes.json").read_text())
    assert receipt["process_exited"] and not receipt["forced_kill"]
    assert "HOST_SERVICE_QUERY_DB_FORBIDDEN" in (state / "service-processes/service-0.stderr").read_text()
    assert not forbidden.exists() and not (state / "analyses").exists()
    with pytest.raises(ProcessLookupError):
        os.kill(receipt["pid"], 0)
