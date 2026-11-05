"""Synthetic real-host acceptance evidence for the cutover gate tests.

The production gate reads the evidence root produced by
``docs/operating/acp-cutover-acceptance.md``. Tests cannot carry a frozen
timestamp (it would age out), so this module writes the same documented paths
with a caller-chosen settlement time and the exact ``MANIFEST.sha256`` format
the acceptance document generates.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

MANIFEST = "MANIFEST.sha256"


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def settle_receipt(*, status: str, error_code, binding: str, active_slot=None,
                   transport: str = "acp", acp_session_id: str = "acp-session-1",
                   prompt_rpc_id: str = "prompt-1", updated_ms: int | None = None) -> dict:
    """One SQLite capture in the shape ``capture.py`` emits."""
    stamp = now_ms() if updated_ms is None else updated_ms
    return {
        "run": [{
            "run_id": "run-1",
            "attempt_id": "attempt-1",
            "status": status,
            "error_code": error_code,
            "active_slot": active_slot,
            "updated_ms": stamp,
        }],
        "dispatch": [{"run_id": "run-1", "state": "EXITED", "transport": transport}],
        "bindings": [{
            "run_id": "run-1",
            "attempt_id": "attempt-1",
            "state": binding,
            "acp_session_id": acp_session_id,
            "prompt_rpc_id": prompt_rpc_id,
        }],
        "steps": [],
        "events": [],
    }


def _write(root: Path, relative: str, content: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_manifest(root: Path, *, omit=()) -> None:
    lines = []
    for base, _, names in os.walk(root):
        for name in names:
            path = Path(base) / name
            if path.name == MANIFEST or path.relative_to(root).as_posix() in set(omit):
                continue
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            lines.append(f"{digest}  {path.relative_to(root).as_posix()}")
    _write(root, MANIFEST, "\n".join(sorted(lines)) + "\n")


def write_acceptance_evidence(root: Path, *, updated_ms: int | None = None) -> Path:
    """Write a complete, internally consistent evidence root."""
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = now_ms() if updated_ms is None else updated_ms
    receipts = {
        "04-normal/settle.json": settle_receipt(
            status="SUCCEEDED", error_code=None, binding="SETTLED",
            prompt_rpc_id="prompt-normal", updated_ms=stamp),
        "05-cancel/settle.json": settle_receipt(
            status="CANCELLED", error_code=None, binding="SETTLED",
            prompt_rpc_id="prompt-cancel", updated_ms=stamp),
        "06-sigkill-resume/settle.json": settle_receipt(
            status="SUCCEEDED", error_code=None, binding="SETTLED",
            prompt_rpc_id="prompt-resume", updated_ms=stamp),
        "07-kernel-restart/after.json": settle_receipt(
            status="FAILED", error_code="EXECUTION_UNKNOWN", binding="LOST",
            prompt_rpc_id="prompt-restart", updated_ms=stamp),
        "04b-no-tool-settle/settle.json": settle_receipt(
            status="FAILED", error_code="EXECUTION_UNKNOWN", binding="SETTLED",
            prompt_rpc_id="prompt-no-tool", updated_ms=stamp),
    }
    for relative, receipt in receipts.items():
        _write(root, relative, json.dumps(receipt, indent=2, sort_keys=True))
    _write(root, "README.md", "host: pinned rc.5\nresult: PASS\n")
    _write(root, "04c-shutdown/reaped.txt", "child reaped\n")
    write_manifest(root)
    return root


def evidence_config(root: Path, *, max_age_hours: int | None = None) -> dict:
    config = {"acceptance_evidence_dir": str(root)}
    if max_age_hours is not None:
        config["acceptance_max_age_hours"] = max_age_hours
    return config
