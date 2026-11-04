"""Run the actual source packer/receiver and isolated process tests in local/CI."""
import importlib.metadata
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

import pytest


def _dependency_drift(root: Path) -> list[str]:
    """Return lock/installed mismatches that make a valid pack fail its own check."""
    pins = {}
    for line in (root / "requirements-lock.txt").read_text().splitlines():
        match = re.fullmatch(r"([a-z0-9-]+)==(\S+)", line.strip())
        if match:
            pins[match.group(1)] = match.group(2)
    drift = []
    for name, expected in pins.items():
        try:
            installed = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            drift.append(f"{name} missing (lock {expected})")
            continue
        if installed != expected:
            drift.append(f"{name}={installed} (lock {expected})")
    return drift


def test_service_artifact_isolation_and_fail_closed_boundaries(tmp_path):
    root = Path(__file__).resolve().parents[2]
    node = shutil.which("node")
    assert node, "Service artifact checks need the existing Node 24 runtime on PATH"
    actual = subprocess.run([node, "--version"], cwd=tmp_path, capture_output=True, text=True, timeout=5)
    assert actual.returncode == 0 and actual.stdout.startswith("v24."), "Select the fixed Node 24 runtime; do not bypass the artifact check"
    assert shutil.which("zstd"), "Service artifact checks require zstd on PATH"
    service_python = os.environ.get("CRM_SERVICE_PYTHON", sys.executable)
    assert os.path.isabs(service_python), "CRM_SERVICE_PYTHON must be an absolute interpreter"
    # The packed service compares installed versions with requirements-lock.txt.
    # A drifted local interpreter makes a valid pack fail. CI installs the lock,
    # and CRM_SERVICE_PYTHON can point at a pinned venv, so only skip when this
    # process is the interpreter under test and it is unpinned.
    if service_python == sys.executable:
        drift = _dependency_drift(root)
        if drift:
            pytest.skip("service package check needs the pinned environment; local drift: " + "; ".join(drift[:4]))
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(tmp_path), "TMPDIR": str(tmp_path),
           "CRM_SERVICE_PYTHON": service_python, "PYTHON_DOTENV_DISABLED": "1"}
    result = subprocess.run([node, "--test", "--test-concurrency=1", str(root / "scripts/crm-calibration/service-package.test.mjs")],
                            cwd=tmp_path, env=env, capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr
