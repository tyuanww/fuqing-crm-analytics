#!/usr/bin/env python3
"""Negative and happy-path tests for the release acceptance verifier CLI.

The verifier must be a thin shell over ``cutover_acceptance`` rather than a
second implementation of the rules, so every refusal asserts that the CLI code
matches the code the production gate raises for the same evidence root.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from backend.services.analytics.cutover_acceptance import (
    CutoverAcceptanceError,
    require_acceptance_evidence,
)
from backend.tests.cutover_evidence import (
    evidence_config,
    now_ms,
    write_acceptance_evidence,
    write_manifest,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
VERIFIER = REPO_ROOT / "scripts" / "release" / "verify-acceptance.py"


def run_verifier(root: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VERIFIER), "--acceptance", str(root), *extra],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def production_code(root: Path, *, max_age_hours: int | None = None) -> str:
    with pytest.raises(CutoverAcceptanceError) as refused:
        require_acceptance_evidence(evidence_config(root, max_age_hours=max_age_hours))
    return refused.value.code


def assert_refused(
    root: Path,
    code: str,
    *,
    extra: tuple[str, ...] = (),
    max_age_hours: int | None = None,
) -> subprocess.CompletedProcess[str]:
    result = run_verifier(root, *extra)
    assert result.returncode == 1, result.stdout + result.stderr
    assert f"ACCEPTANCE_FAILED {code}" in result.stdout
    assert "ACCEPTANCE_OK" not in result.stdout
    assert production_code(root, max_age_hours=max_age_hours) == code
    return result


def test_verifier_accepts_consistent_evidence_and_prints_stages(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    result = run_verifier(root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stderr == ""
    output = result.stdout
    assert "ACCEPTANCE_MANIFEST_OK files=7" in output
    assert "ACCEPTANCE_DIGEST_OK README.md" in output
    assert "ACCEPTANCE_TEXT_OK 04c-shutdown/reaped.txt" in output
    for relative in (
        "04-normal/settle.json",
        "05-cancel/settle.json",
        "06-sigkill-resume/settle.json",
        "07-kernel-restart/after.json",
        "04b-no-tool-settle/settle.json",
    ):
        assert f"ACCEPTANCE_RECEIPT_OK {relative}" in output
    assert "ACCEPTANCE_FRESHNESS_OK max_age_hours=168" in output
    assert "ACCEPTANCE_OK manifest_sha256=" in output
    require_acceptance_evidence(evidence_config(root))


def test_verifier_refuses_missing_evidence_root(tmp_path):
    root = tmp_path / "missing"
    result = run_verifier(root)
    assert result.returncode == 1
    assert "ACCEPTANCE_FAILED CUTOVER_ACCEPTANCE_ROOT_MISSING" in result.stdout


def test_verifier_refuses_missing_manifest(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    (root / "MANIFEST.sha256").unlink()
    assert_refused(root, "CUTOVER_ACCEPTANCE_MANIFEST_MISSING")


def test_verifier_refuses_invalid_manifest(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    with (root / "MANIFEST.sha256").open("a", encoding="utf-8") as handle:
        handle.write("not a manifest line\n")
    assert_refused(root, "CUTOVER_ACCEPTANCE_MANIFEST_INVALID")


def test_verifier_refuses_rewritten_receipt_digest(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    (root / "README.md").write_text("host: pinned rc.5\nresult: FAIL\n", encoding="utf-8")
    assert_refused(root, "CUTOVER_ACCEPTANCE_DIGEST_MISMATCH")


def test_verifier_refuses_missing_listed_file(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    (root / "README.md").unlink()
    assert_refused(root, "CUTOVER_ACCEPTANCE_FILE_MISSING")


def test_verifier_refuses_required_receipt_omitted_from_manifest(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    write_manifest(root, omit=("05-cancel/settle.json",))
    assert_refused(root, "CUTOVER_ACCEPTANCE_RECEIPT_MISSING")


def test_verifier_refuses_stale_evidence(tmp_path):
    root = write_acceptance_evidence(
        tmp_path / "evidence",
        updated_ms=now_ms() - 2 * 60 * 60 * 1000,
    )
    assert_refused(
        root,
        "CUTOVER_ACCEPTANCE_STALE",
        extra=("--max-age-hours", "1"),
        max_age_hours=1,
    )


def test_verifier_refuses_future_evidence(tmp_path):
    root = write_acceptance_evidence(
        tmp_path / "evidence",
        updated_ms=now_ms() + 10 * 60 * 1000,
    )
    assert_refused(root, "CUTOVER_ACCEPTANCE_RECEIPT_INVALID")


def _mutate_status(receipt: dict) -> None:
    receipt["run"][0]["status"] = "FAILED"


def _mutate_cancel_status(receipt: dict) -> None:
    receipt["run"][0]["status"] = "SUCCEEDED"


def _mutate_resume_session(receipt: dict) -> None:
    receipt["bindings"][0]["acp_session_id"] = "different-session"


def _mutate_restart_binding(receipt: dict) -> None:
    receipt["bindings"][0]["state"] = "SETTLED"


def _mutate_no_tool_error(receipt: dict) -> None:
    receipt["run"][0]["error_code"] = None


@pytest.mark.parametrize(
    ("relative", "mutate"),
    (
        ("04-normal/settle.json", _mutate_status),
        ("05-cancel/settle.json", _mutate_cancel_status),
        ("06-sigkill-resume/settle.json", _mutate_resume_session),
        ("07-kernel-restart/after.json", _mutate_restart_binding),
        ("04b-no-tool-settle/settle.json", _mutate_no_tool_error),
    ),
)
def test_verifier_refuses_invalid_settle_metadata(tmp_path, relative, mutate):
    root = write_acceptance_evidence(tmp_path / "evidence")
    path = root / relative
    receipt = json.loads(path.read_text(encoding="utf-8"))
    mutate(receipt)
    path.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    write_manifest(root)
    result = assert_refused(root, "CUTOVER_ACCEPTANCE_RECEIPT_INVALID")
    assert relative in result.stdout
