#!/usr/bin/env python3
"""Wrapper so `python3 knowledge/crm/tests/test_validate_pack.py` re-runs the pack gate."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def test_validator_passes() -> None:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "validate_pack.py")],
        cwd=str(ROOT.parents[2]),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise AssertionError(proc.stdout + proc.stderr)


if __name__ == "__main__":
    test_validator_passes()
    print("test_validate_pack: ok")
