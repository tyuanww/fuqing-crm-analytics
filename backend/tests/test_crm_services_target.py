"""Fail-closed input and owned-process boundaries of the opt-in target runner."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
from types import SimpleNamespace

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


@pytest.mark.parametrize("aliased", [False, True])
def test_cli_rejects_output_inside_inputs_before_any_write(tmp_path, aliased):
    root, expected = input_fixture(tmp_path)
    parent = root
    if aliased:
        parent = tmp_path / "input-alias"
        parent.symlink_to(root, target_is_directory=True)
    before = runner.snapshot(root)
    result = subprocess.run([sys.executable, "-I", str(ROOT / "scripts/crm-calibration/crm-services-target.py"),
        "--input", str(root), "--input-sha256", expected, "--output", str(parent / "result"),
        "--phase", "install"], capture_output=True, text=True, timeout=10)
    assert result.returncode != 0
    assert "OUTPUT_OVERLAPS_INPUT" in result.stderr
    assert runner.snapshot(root) == before
    assert not (root / "result").exists()


@pytest.mark.parametrize("domain", runner.DOMAINS)
@pytest.mark.parametrize("changed_install", ["app", "venv"])
def test_http_rejects_install_drift_before_starting_any_service(tmp_path, monkeypatch, domain, changed_install):
    root, expected = input_fixture(tmp_path)
    output = tmp_path / "output"
    output.mkdir()
    observer = runner.Observer(root, output, expected)
    records = {}
    for name in runner.DOMAINS:
        app, venv = output / (name + "-app"), output / (name + "-venv")
        app.mkdir()
        venv.mkdir()
        (app / "payload.txt").write_text("reviewed application")
        (venv / "payload.txt").write_text("reviewed runtime")
        records[name] = {"app": str(app), "python": str(venv / "bin/python"),
                         "app_inventory": runner.snapshot(app), "venv_inventory": runner.snapshot(venv)}
    runner.dump(output / "install-receipt.json", {"input_sha256": expected, "services": records})
    (output / (domain + "-" + changed_install) / "payload.txt").write_text("changed between install and readonly bind")
    # Exercise pre-start admission only; this fixture does not claim a real readonly mount or HTTP run.
    monkeypatch.setattr(runner.os, "statvfs", lambda _path: SimpleNamespace(f_flag=os.ST_RDONLY))
    started = []

    def unexpected_start(*args):
        started.append(args)
        raise RuntimeError("STARTED_BEFORE_ALL_INSTALLS_VERIFIED")

    monkeypatch.setattr(observer, "start", unexpected_start)
    code = "INSTALL_PRE_DRIFT" if changed_install == "app" else "VENV_PRE_DRIFT"
    with pytest.raises(RuntimeError, match=code):
        observer.http()
    assert not started


@pytest.mark.parametrize("signal_stage", ["term", "kill"])
def test_cleanup_handles_owned_exit_between_poll_and_signal(tmp_path, monkeypatch, signal_stage):
    root, expected = input_fixture(tmp_path)
    output = tmp_path / "output"
    output.mkdir()
    observer = runner.Observer(root, output, expected)
    program = "print('ready',flush=True);import time;time.sleep(30)"
    stubborn = "import signal;signal.signal(signal.SIGTERM,signal.SIG_IGN);" + program
    children = [subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True, start_new_session=True)
                for code in [stubborn if signal_stage == "kill" else program, program]]
    real_killpg = os.killpg
    exited = False

    def exit_before_signal(pid, sig):
        nonlocal exited
        if pid == children[0].pid and not exited and sig == (signal.SIGKILL if signal_stage == "kill" else signal.SIGTERM):
            exited = True
            children[0].kill()
            children[0].wait(timeout=5)
        return real_killpg(pid, sig)

    try:
        for child in children:
            assert child.stdout.readline().strip() == "ready"
        observer.processes = [("exit-race", children[0]), ("remaining-owned", children[1])]
        monkeypatch.setattr(runner.os, "killpg", exit_before_signal)
        records = observer.cleanup()
        assert exited and all(row["reaped"] for row in records)
        assert all(child.poll() is not None for child in children)
        assert json.loads((output / "cleanup.json").read_text())["all_reaped"]
    finally:
        for child in children:
            if child.poll() is None:
                real_killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
            child.stdout.close()


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
