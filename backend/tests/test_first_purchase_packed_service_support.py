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
