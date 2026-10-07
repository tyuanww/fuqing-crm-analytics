"""Fail-closed input and owned-process boundaries of the opt-in target runner."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("crm_services_target", ROOT / "scripts/crm-calibration/crm-services-target.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


def input_fixture(tmp_path):
    root = tmp_path / "input"
    root.mkdir()
    payload = root / "payload.json"
    payload.write_text('{"synthetic":true}\n')
    manifest = {"scope": "crm-services-synthetic-target/v1", "release_ready": False,
                "files": {payload.name: {"bytes": payload.stat().st_size, "sha256": runner.digest(payload)}}}
    (root / "input-manifest.json").write_text(json.dumps(manifest))
    return root, runner.digest(root / "input-manifest.json")


@pytest.mark.parametrize("mutation,code", [
    ("digest", "INPUT_MANIFEST_DIGEST"), ("payload", "INPUT_DIGEST"),
    ("extra", "INPUT_EXTRA"), ("missing", "INPUT_MISSING"), ("link", "INPUT_LINK"),
])
def test_inputs_reject_drift_and_unlisted_files(tmp_path, mutation, code):
    root, expected = input_fixture(tmp_path)
    runner.verify_inputs(root, expected)
    if mutation == "digest":
        expected = "0" * 64
    elif mutation == "payload":
        (root / "payload.json").write_text('{"synthetic":false}')
    elif mutation == "extra":
        (root / "extra.whl").write_text("extra")
    elif mutation == "missing":
        (root / "payload.json").unlink()
    else:
        (root / "payload.json").unlink()
        (root / "payload.json").symlink_to(tmp_path / "unavailable")
    with pytest.raises(RuntimeError, match=code):
        runner.verify_inputs(root, expected)


def test_wheel_inventory_rejects_extra_dependency_and_digest_drift(tmp_path):
    path = tmp_path / "one-1.0-py3-none-any.whl"
    path.write_bytes(b"bounded metadata is delegated to existing installer")
    provenance = {"one": {"file": path.name, "version": "1.0", "bytes": path.stat().st_size, "sha256": runner.digest(path)}}
    runner.wheel_inventory(tmp_path, provenance, {"one": "1.0"})
    extra = tmp_path / "two-1.0-py3-none-any.whl"
    extra.write_bytes(b"unexpected")
    with pytest.raises(RuntimeError, match="WHEEL_EXTRA_OR_MISSING"):
        runner.wheel_inventory(tmp_path, provenance, {"one": "1.0"})
    extra.unlink()
    path.write_bytes(b"changed")
    with pytest.raises(RuntimeError, match="WHEEL_DIGEST"):
        runner.wheel_inventory(tmp_path, provenance, {"one": "1.0"})


def test_existing_output_is_not_replaced(tmp_path):
    root, expected = input_fixture(tmp_path)
    output = tmp_path / "output"
    output.mkdir()
    marker = output / "keep.json"
    marker.write_text("keep")
    observer = runner.Observer(root, output, expected)
    with pytest.raises(RuntimeError, match="OUTPUT_EXISTS"):
        observer.install()
    assert list(output.iterdir()) == [marker]
    assert marker.read_text() == "keep"


def test_cleanup_reaps_owned_stubborn_process_and_leaves_peer_alive(tmp_path):
    program = "import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print('ready',flush=True);time.sleep(30)"
    peer = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"], start_new_session=True)
    owned = subprocess.Popen([sys.executable, "-c", program], start_new_session=True, stdout=subprocess.PIPE, text=True)
    try:
        assert owned.stdout.readline().strip() == "ready"
        row = runner.stop_owned(owned, grace=0.05)
        assert row["reaped"] and row["returncode"] == -signal.SIGKILL
        assert peer.poll() is None
        # Repeated cleanup must not signal a reused PID.
        assert runner.stop_owned(owned, grace=0.05) == row
    finally:
        if owned.poll() is None:
            os.killpg(owned.pid, signal.SIGKILL)
        owned.wait(timeout=5)
        owned.stdout.close()
        os.killpg(peer.pid, signal.SIGTERM)
        peer.wait(timeout=5)


def test_timed_out_command_is_reaped_and_preserves_log(tmp_path):
    root, expected = input_fixture(tmp_path)
    output = tmp_path / "output"
    output.mkdir()
    (output / "tmp").mkdir()
    observer = runner.Observer(root, output, expected)
    with pytest.raises(subprocess.TimeoutExpired):
        observer.command("timeout", [sys.executable, "-c", "import os,time;print(os.getpid(),flush=True);time.sleep(30)"], timeout=0.1)
    pid = int((output / "timeout.stdout").read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_guard_evidence_survives_sigterm_without_atexit(tmp_path):
    app = tmp_path / "app.py"
    app.write_text("import time; print('ready',flush=True); time.sleep(30)\n")
    report = tmp_path / "guard.json"
    child = subprocess.Popen([sys.executable, "-I", "-c", runner.service_guard_program(),
        '["synthetic_forbidden_module"]', str(report), str(app)], stdout=subprocess.PIPE,
        text=True, start_new_session=True)
    try:
        assert child.stdout.readline().strip() == "ready"
        before = json.loads(report.read_text())
        assert before == {"guard_installed": True, "blocked": ["synthetic_forbidden_module"],
                          "attempts": [], "loaded_at_guard_install": [], "loaded_at_last_snapshot": [],
                          "snapshot_phase": "guard-installed", "final_snapshot": False}
        stopped = runner.stop_owned(child)
        assert stopped["returncode"] == -signal.SIGTERM
        assert json.loads(report.read_text()) == before
    finally:
        runner.stop_owned(child)
        child.stdout.close()


def test_guard_records_a_caught_forbidden_import_before_sigterm(tmp_path):
    app = tmp_path / "app.py"
    app.write_text("import time\ntry:\n import synthetic_forbidden_module\nexcept ImportError:\n pass\nprint('ready',flush=True)\ntime.sleep(30)\n")
    report = tmp_path / "guard.json"
    child = subprocess.Popen([sys.executable, "-I", "-c", runner.service_guard_program(),
        '["synthetic_forbidden_module"]', str(report), str(app)], stdout=subprocess.PIPE,
        text=True, start_new_session=True)
    try:
        assert child.stdout.readline().strip() == "ready"
        assert json.loads(report.read_text())["attempts"] == ["synthetic_forbidden_module"]
        assert json.loads(report.read_text())["snapshot_phase"] == "blocked-attempt"
        runner.stop_owned(child)
        assert json.loads(report.read_text())["attempts"] == ["synthetic_forbidden_module"]
    finally:
        runner.stop_owned(child)
        child.stdout.close()


def test_guard_marks_normal_exit_final_snapshot_separately(tmp_path):
    app = tmp_path / "app.py"
    app.write_text("pass\n")
    report = tmp_path / "guard.json"
    subprocess.run([sys.executable, "-I", "-c", runner.service_guard_program(),
        '["synthetic_forbidden_module"]', str(report), str(app)], check=True, timeout=5)
    row = json.loads(report.read_text())
    assert row["snapshot_phase"] == "normal-exit"
    assert row["final_snapshot"] is True
    assert not row["attempts"] and not row["loaded_at_last_snapshot"]
