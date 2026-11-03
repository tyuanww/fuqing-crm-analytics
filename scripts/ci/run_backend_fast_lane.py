#!/usr/bin/env python3
"""Run the curated fast backend lane from an explicit file allowlist.

This lane is additive: it never changes CI or the weekly full run. The
authoritative full backend selection remains
``scripts/run_backend_tests_bounded.py`` (all ``backend/tests/test_*.py`` plus
the two nested competition test files).

Selection is file-level and explicit on purpose. Mass ``@pytest.mark.fast``
markers would silently capture integration tests when fixtures move; the
manifest is reviewed instead. Every listed file is a subset of the full lane,
is green at the recorded baseline, and is audited to perform no DuckDB access,
HTTP/TestClient call, subprocess/thread start, SQLite store write, page/board
save, or repository-policy check.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
TEST_ROOT = ROOT / "backend" / "tests"
MANIFEST = Path(__file__).resolve().parent / "fast_lane_files.txt"
# The full bounded runner adds these two nested files to backend/tests/*.py.
EXTRA_FULL_TARGETS = frozenset({
    "backend/contracts/tests/test_competition_c0.py",
    "backend/services/analytics/competition_diagnosis/tests/test_competition_diagnosis.py",
})

sys.path.insert(0, str(ROOT))
from scripts.ci.pre_push_path_class import load_deselect_nodeids  # noqa: E402
from scripts.run_backend_tests_bounded import (  # noqa: E402
    _rss_tree_bytes,
    _stop_process_tree,
    isolated_env,
)


def load_manifest(path: Path = MANIFEST) -> list[str]:
    """Return validated repo-relative backend test files from the allowlist."""
    files: list[str] = []
    seen: set[str] = set()
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "::" in line:
            raise SystemExit(f"{path}:{number}: nodeids are not allowed; list one file per line")
        target = (ROOT / line).resolve()
        if not target.is_relative_to(ROOT):
            raise SystemExit(f"{path}:{number}: path escapes the repository: {line}")
        rel = target.relative_to(ROOT).as_posix()
        in_full_lane = (
            (target.parent == TEST_ROOT and target.name.startswith("test_")
             and target.suffix == ".py")
            or rel in EXTRA_FULL_TARGETS
        )
        if not in_full_lane:
            raise SystemExit(f"{path}:{number}: not in the full backend lane: {line}")
        if not target.is_file() or not target.name.startswith("test_"):
            raise SystemExit(f"{path}:{number}: not an existing backend test file: {line}")
        if rel in seen:
            raise SystemExit(f"{path}:{number}: duplicate entry: {line}")
        seen.add(rel)
        files.append(rel)
    if not files:
        raise SystemExit(f"{path}: no test files selected")
    return files


def pytest_command(files: list[str]) -> list[str]:
    deselects = [arg for node in load_deselect_nodeids() for arg in ("--deselect", node)]
    return [sys.executable, "-m", "pytest", *files, "-q", "-p", "no:xdist",
            "-p", "no:cacheprovider", "-m", "not slow", "--durations=10",
            "-o", "faulthandler_timeout=60", *deselects]


def manifest_digest(path: Path = MANIFEST) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(files: list[str], timeout_seconds: float, rss_limit_gb: float,
        report_dir: Path | None, manifest_path: Path = MANIFEST) -> int:
    command = pytest_command(files)
    try:
        manifest_label = manifest_path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        manifest_label = str(manifest_path.resolve())
    report = {
        "lane": "backend-fast",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "python": sys.version,
        "manifest": manifest_label,
        "manifest_sha256": manifest_digest(manifest_path),
        "files": files,
        "command": command,
        "timeout_seconds": timeout_seconds,
        "rss_limit_gb": rss_limit_gb,
        "returncode": None,
        "elapsed_seconds": None,
        "peak_rss_bytes": None,
    }
    started = time.monotonic()
    rc: int | None = None
    peak = 0
    print(f"[fast-lane] manifest: {manifest_label} ({len(files)} files)", flush=True)
    print(f"[fast-lane] command: {' '.join(command)}", flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="fq-fast-lane-") as scratch_dir:
            # isolated_env drops FQ_TEST_ARCHIVE_DB and every other user env,
            # so the fast lane can never attach to the archived production DB.
            env = isolated_env(Path(scratch_dir))
            process = subprocess.Popen(command, cwd=ROOT, env=env, start_new_session=True)
            try:
                while process.poll() is None:
                    elapsed = time.monotonic() - started
                    rss = _rss_tree_bytes(process.pid)
                    peak = max(peak, rss)
                    if rss > rss_limit_gb * 1024**3:
                        print(f"[fast-lane] RSS limit exceeded: {rss_limit_gb} GB", flush=True)
                        rc = 90
                        break
                    if elapsed > timeout_seconds:
                        print(f"[fast-lane] timeout: {timeout_seconds}s", flush=True)
                        rc = 91
                        break
                    time.sleep(0.2)
            finally:
                if rc is not None and process.poll() is None:
                    _stop_process_tree(process)
                if rc is None:
                    rc = int(process.returncode or 0)
        report["returncode"] = rc
        report["elapsed_seconds"] = round(time.monotonic() - started, 3)
        report["peak_rss_bytes"] = peak
        print(f"[fast-lane] rc={rc} time={report['elapsed_seconds']}s "
              f"peak_rss_gb={peak / 1024**3:.2f}", flush=True)
        return rc
    finally:
        if report["returncode"] is None:
            report["returncode"] = rc if rc is not None else 1
            report["elapsed_seconds"] = round(time.monotonic() - started, 3)
            report["peak_rss_bytes"] = peak
        if report_dir is not None:
            report_dir.mkdir(parents=True, exist_ok=True)
            result_path = report_dir / "summary.json"
            result_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            print(f"[fast-lane] report: {result_path}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST,
                        help="explicit allowlist (default: scripts/ci/fast_lane_files.txt)")
    parser.add_argument("--timeout-seconds", type=float, default=300.0,
                        help="hard wall-clock budget (default: 300s, the lane target)")
    parser.add_argument("--rss-limit-gb", type=float, default=4.0)
    parser.add_argument("--report-dir", type=Path,
                        help="optional directory for summary.json evidence")
    parser.add_argument("--list-files", action="store_true",
                        help="print the validated allowlist and exit")
    args = parser.parse_args()
    if args.timeout_seconds <= 0 or args.rss_limit_gb <= 0:
        parser.error("timeout-seconds and rss-limit-gb must be positive")
    files = load_manifest(args.manifest)
    if args.list_files:
        for path in files:
            print(path)
        return 0
    return run(files, args.timeout_seconds, args.rss_limit_gb,
               args.report_dir.resolve() if args.report_dir else None,
               args.manifest.resolve())


if __name__ == "__main__":
    raise SystemExit(main())
