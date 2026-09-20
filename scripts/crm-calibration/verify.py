#!/usr/bin/env python3
"""Bounded local CRM candidate acceptance. Never starts live services or installs deps."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
TESTS = [
    "test_crm_review_boundaries.py",
    "test_crm_calibration_regressions.py", "test_crm_calibration_integration.py", "test_crm_metrics_v1.py",
    "test_crm_readonly.py", "test_crm_readonly_contract_match.py", "test_crm_readonly_cache.py",
    "test_crm_readonly_security.py", "test_crm_readonly_unavailable.py", "test_crm_knowledge_pack.py",
]


def source_hashes():
    files = set()
    for rel in ["backend/services/crm_readonly", "dsh-plugins/crm-knowledge/src", "dsh-plugins/crm-knowledge/test", "scripts/crm-calibration", "backend/tests/fixtures/crm_metrics_v1", "backend/tests/fixtures/crm_readonly", "knowledge/crm/definitions", "knowledge/crm/graph", "knowledge/crm/textbook", "knowledge/crm/tools", "knowledge/crm/tests", "knowledge/crm/schema", "knowledge/crm/code_snapshots"]:
        files.update(p for p in (ROOT / rel).rglob("*") if p.is_file() and p.suffix in {".py", ".ts", ".tsx", ".mjs", ".json"})
    for rel in ["backend/semantic/crm_metrics_v1.py", "backend/semantic/crm_metrics_compose.py", "backend/contracts/crm_metrics_v1.py", "backend/crm_metrics_app.py", "backend/services/crm_knowledge.py", "dsh-plugins/crm-knowledge/build.mjs", "dsh-plugins/crm-knowledge/package.json", "backend/contracts/crm-metrics.openapi.json", "dsh-plugins/crm-knowledge/cordis.patch.yml", "dsh-plugins/analytics-workbench/src/client/competition-shell/tokens.ts"]:
        files.add(ROOT / rel)
    files.update(ROOT / "backend/tests" / item for item in TESTS)
    files.update(ROOT / rel for rel in ["knowledge/crm/pack.json", "docs/crm-calibration/contracts/crm-metrics-v1.json"])
    # The dashboard adapter consumes these existing contracts/filters; keep its
    # verification tied to the inspected source, without modifying legacy code.
    for rel in ["frontend-vue3/src/constants/channels.ts", "backend/contracts/metrics.py", "backend/contracts/common.py", "backend/routers/metrics.py", "backend/semantic/calculations.py", "backend/services/metrics/overview.py"]:
        files.add(ROOT / rel)
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--build-tools", required=True, type=Path)
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = ROOT / ".context/checks" / ("crm-candidate-" + stamp)
    report.mkdir(parents=True, exist_ok=False)
    before = source_hashes()
    result = dict(started_at=stamp, source_hashes=before, commands=[], status="running", real_data=False, live_service_changed=False, model_called=False)
    with TemporaryDirectory(prefix="crm-verify-") as temp:
        home = Path(temp) / "home"
        home.mkdir(mode=0o700)
        env = dict(PATH=os.pathsep.join([str(args.node.resolve().parent), str(Path(sys.executable).parent), "/usr/bin", "/bin", "/usr/sbin", "/sbin"]), HOME=str(home), TMPDIR=temp, LANG="en_US.UTF-8", PYTHONPATH=str(ROOT), PYTHON_DOTENV_DISABLED="1", PYTHONDONTWRITEBYTECODE="1", B0_BUILD_UPSTREAM=str(args.upstream.resolve()), CRM_METRICS_PYTHON=sys.executable)
        commands = [
            ("backend", [sys.executable, "scripts/run_backend_tests_bounded.py", *["backend/tests/" + item for item in TESTS], "--report-dir", str(report / "backend")]),
            ("ruff", [sys.executable, "-m", "ruff", "check", "backend/semantic/crm_metrics_v1.py", "backend/semantic/crm_metrics_compose.py", "backend/contracts/crm_metrics_v1.py", "backend/crm_metrics_app.py", "backend/services/crm_readonly", "backend/services/crm_knowledge.py", "scripts/crm-calibration", *["backend/tests/" + item for item in TESTS]]),
            ("wire-contract", [sys.executable, "scripts/crm-calibration/generate_contract.py", "--check"]),
            ("http-types", [str(args.node), "scripts/crm-calibration/generate_types.mjs", str(args.build_tools), "--check"]),
            ("build", [str(args.node), "dsh-plugins/crm-knowledge/build.mjs", str(args.upstream), str(args.build_tools)]),
            ("cli-tools", [str(args.node), "--test", *[str(p.relative_to(ROOT)) for p in sorted((ROOT / "dsh-plugins/crm-knowledge/test").glob("*.test.mjs"))]]),
            ("host-tools", [str(args.node), "--test", "dsh-plugins/crm-knowledge/test/host.integration.mjs"]),
        ]
        for name, cmd in commands:
            proc = subprocess.run(cmd, cwd=ROOT, env=env, text=True, capture_output=True, timeout=120)
            log = report / (name + ".log")
            log.write_text(proc.stdout + proc.stderr)
            result["commands"].append(dict(name=name, command=cmd, exit_code=proc.returncode, log=str(log.relative_to(ROOT))))
            print(name, "PASS" if proc.returncode == 0 else "FAIL", flush=True)
            if proc.returncode:
                print((proc.stdout + proc.stderr)[-5000:])
                result["status"] = "failed"
                (report / "summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
                return proc.returncode
    after = source_hashes()
    result["source_unchanged_during_verification"] = before == after
    result["status"] = "passed" if before == after else "source_changed_during_verification"
    (report / "summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print("Evidence:", report)
    return 0 if before == after else 1


if __name__ == "__main__":
    raise SystemExit(main())
