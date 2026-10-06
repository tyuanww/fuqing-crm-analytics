"""Real bootstrap failures must retain diagnostics and reap only their child."""
import hashlib
import json
import os
import sys

import pytest

from backend.tests.first_purchase_packed_kernel_support import PackedFirstPurchaseKernel


@pytest.mark.skipif(os.name != "posix" or sys.version_info[:2] != (3, 14), reason="owned POSIX Python 3.14 drill")
@pytest.mark.parametrize("foreign_marker", [False, True])
def test_kernel_rejects_bad_manifest_or_foreign_state_before_import(tmp_path, foreign_marker):
    app, state = tmp_path / "app", tmp_path / "owned-state"
    app.mkdir()
    state.mkdir(mode=0o700)
    (app / "kernel-manifest.json").write_text('{}\n')
    (state / ".owned-first-purchase-host").write_text("owned-synthetic-host/v1\n" + ("b" if foreign_marker else "a") * 64 + "\n")
    kernel = PackedFirstPurchaseKernel({"python": sys.executable, "app": str(app),
        "manifest_sha256": hashlib.sha256(b"different expected bytes").hexdigest()}, state, "a" * 64, {})
    with pytest.raises(AssertionError, match="HOST_KERNEL_PIPE_FAILED"):
        with kernel:
            pytest.fail("unverified input must never import the query application")
    assert kernel.process is None and kernel.error_log is None
    receipt, = json.loads((state / "kernel-processes/processes.json").read_text())
    assert receipt["status"] == "START_FAILED" and receipt["exit_code"] == 1
    assert not receipt["forced_kill"] and not receipt["cleanup_ok"]
    with pytest.raises(ProcessLookupError):
        os.kill(receipt["pid"], 0)
    assert "AssertionError" in (state / "kernel-processes/kernel-0.stderr").read_text()
    assert not (state / "state").exists()


def test_missing_query_interpreter_closes_preopened_diagnostic(tmp_path):
    kernel = PackedFirstPurchaseKernel({"python": str(tmp_path / "missing-python"), "app": str(tmp_path),
        "manifest_sha256": "a" * 64}, tmp_path, "a" * 64, {})
    with pytest.raises(FileNotFoundError):
        kernel.launch()
    assert kernel.process is None and kernel.error_log is None
