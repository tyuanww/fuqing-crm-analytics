"""Actual artifact CLI failure boundaries; the historical pair drill is opt-in."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "scripts/crm-calibration/service-package-compatibility.mjs"


def invoke(args, temporary):
    node = shutil.which("node")
    assert node, "artifact verification requires the existing Node 24 runtime"
    version = subprocess.run([node, "--version"], capture_output=True, text=True, check=True)
    assert version.stdout.startswith("v24.")
    return subprocess.run([node, str(CLI), *args], cwd=temporary, capture_output=True, text=True, timeout=15,
                          env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(temporary)})


def arguments(temporary):
    return ["--baseline", "0" * 40, "--candidate", "1" * 40,
            "--baseline-python", "/unavailable/python", "--candidate-python", "/unavailable/python",
            "--baseline-wheelhouse", "/unavailable/wheels", "--candidate-wheelhouse", "/unavailable/wheels",
            "--output", str(temporary / "evidence")]


@pytest.mark.parametrize(("key", "value", "code"), [
    ("--baseline", "HEAD", "SERVICE_PAIR_EXACT_SOURCE_REQUIRED"),
    ("--candidate", "main", "SERVICE_PAIR_EXACT_SOURCE_REQUIRED"),
    ("--candidate", "0" * 40, "SERVICE_PAIR_DISTINCT_SOURCE_REQUIRED"),
    ("--baseline-python", "python3", "SERVICE_PAIR_ABSOLUTE_PATH_REQUIRED"),
    ("--candidate-wheelhouse", "wheels", "SERVICE_PAIR_ABSOLUTE_PATH_REQUIRED"),
])
def test_invalid_pair_never_creates_evidence(tmp_path, key, value, code):
    args = arguments(tmp_path)
    args[args.index(key) + 1] = value
    result = invoke(args, tmp_path)
    assert result.returncode == 2 and code in result.stderr
    assert not (tmp_path / "evidence").exists()


def test_duplicate_arguments_are_rejected_before_work(tmp_path):
    result = invoke([*arguments(tmp_path), "--baseline", "2" * 40], tmp_path)
    assert result.returncode == 2 and "SERVICE_PAIR_ARGUMENT_REPEATED" in result.stderr
    assert not (tmp_path / "evidence").exists()


def test_existing_evidence_is_never_overwritten(tmp_path):
    output = tmp_path / "evidence"
    output.mkdir()
    receipt = output / "receipt.json"
    receipt.write_text('{"original":true}\n')
    result = invoke(arguments(tmp_path), tmp_path)
    assert result.returncode == 2
    assert receipt.read_text() == '{"original":true}\n'
    assert sorted(p.name for p in output.iterdir()) == ["receipt.json"]


def test_failed_exact_source_lookup_leaves_honest_failure_receipt(tmp_path):
    result = invoke(arguments(tmp_path), tmp_path)
    assert result.returncode == 2
    receipt = json.loads((tmp_path / "evidence/receipt.json").read_text())
    assert receipt["status"] == "FAIL" and receipt["release_ready"] is False
    assert receipt["observations"] == [] and receipt["artifacts"] == {}
    assert receipt["activation"] == "BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED"
