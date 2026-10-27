import os
from pathlib import Path
import re
import subprocess
import sys


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/diagnostics/verify_rfm_execution_contract.py"


def test_rfm_characterization_runs_from_an_unrelated_directory(tmp_path):
    result = subprocess.run(
        [sys.executable, "-I", "-B", str(SCRIPT)],
        cwd=tmp_path,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")},
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert re.search(r"Ran [1-9]\d* tests?", result.stderr)
