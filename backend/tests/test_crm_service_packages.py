"""Run the actual source packer/receiver and isolated process tests in local/CI."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def test_service_artifact_isolation_and_fail_closed_boundaries(tmp_path):
    root = Path(__file__).resolve().parents[2]
    node = shutil.which("node")
    assert node, "Service artifact checks need the existing Node 24 runtime on PATH"
    actual = subprocess.run([node, "--version"], cwd=tmp_path, capture_output=True, text=True, timeout=5)
    assert actual.returncode == 0 and actual.stdout.startswith("v24."), "Select the fixed Node 24 runtime; do not bypass the artifact check"
    assert shutil.which("zstd"), "Service artifact checks require zstd on PATH"
    service_python = os.environ.get("CRM_SERVICE_PYTHON", sys.executable)
    assert os.path.isabs(service_python), "CRM_SERVICE_PYTHON must be an absolute interpreter"
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(tmp_path), "TMPDIR": str(tmp_path),
           "CRM_SERVICE_PYTHON": service_python, "PYTHON_DOTENV_DISABLED": "1"}
    result = subprocess.run([node, "--test", "--test-concurrency=1", str(root / "scripts/crm-calibration/service-package.test.mjs")],
                            cwd=tmp_path, env=env, capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr
