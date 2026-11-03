#!/usr/bin/env python3
"""Run the fast lane: backend tests that do not import heavy runtime fixtures."""
import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEAVY = ("duckdb", "TestClient", "subprocess", "httpx", "sqlite3", "tmp_duckdb",
         "multiprocessing", "ThreadPoolExecutor")


def selected() -> list[Path]:
    files = sorted((ROOT / "backend/tests").glob("test_*.py"))
    return [f.relative_to(ROOT) for f in files
            if not any(marker in f.read_text(errors="ignore") for marker in HEAVY)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="print the selected files and exit")
    args = parser.parse_args()
    files = selected()
    if args.list:
        print("\n".join(map(str, files)))
        return 0
    started = time.monotonic()
    result = subprocess.run([sys.executable, "-m", "pytest", *map(str, files), "-q"], cwd=ROOT)
    print(f"fast-lane: files={len(files)} duration_s={time.monotonic() - started:.1f}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
