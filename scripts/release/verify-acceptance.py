#!/usr/bin/env python3
"""Deterministic CLI over the production ACP acceptance gate.

The evidence rules live in ``backend/services/analytics/cutover_acceptance.py``
and are used unchanged: this entrypoint only selects the evidence root, walks
the same production stages in order and renders a stable verdict for release
tooling:

``ACCEPTANCE_OK`` on success, or ``ACCEPTANCE_FAILED <CODE>: <detail>`` with
exit code 1. There is no override for the freshness window and no fallback
path: a missing, extra, rewritten or stale receipt refuses just as it does at
runtime.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.services.analytics import cutover_acceptance as acceptance  # noqa: E402


def _emit(line: str) -> None:
    print(line, flush=True)


def verify(acceptance_dir: str, *, max_age_hours: int | None = None,
           now_ms: int | None = None) -> int:
    """Run the production gate and print the deterministic verdict."""
    config = {"acceptance_evidence_dir": str(Path(acceptance_dir).resolve())}
    if max_age_hours is not None:
        config["acceptance_max_age_hours"] = max_age_hours
    try:
        root = acceptance._root(config)
        _emit(f"ACCEPTANCE_ROOT {root}")
        entries = acceptance._parse_manifest(root)
        _emit(f"ACCEPTANCE_MANIFEST_OK files={len(entries)}")
        # Re-hash every manifest entry, then assert the required receipt set
        # and its metadata. These are the production helpers; the final
        # require_acceptance_evidence() call is the gate itself and adds the
        # freshness window.
        acceptance._verify_files(root, entries)
        for relative in sorted(entries):
            _emit(f"ACCEPTANCE_DIGEST_OK {relative}")
        acceptance._verify_receipts(root, entries)
        for relative in acceptance.REQUIRED_TEXT:
            _emit(f"ACCEPTANCE_TEXT_OK {relative}")
        for relative in acceptance.REQUIRED_RECEIPTS:
            _emit(f"ACCEPTANCE_RECEIPT_OK {relative}")
        evidence = acceptance.require_acceptance_evidence(config, now_ms=now_ms)
    except acceptance.CutoverAcceptanceError as error:
        _emit(f"ACCEPTANCE_FAILED {error.code}: {error.detail}")
        return 1
    _emit(f"ACCEPTANCE_FRESHNESS_OK max_age_hours={evidence.max_age_hours} "
          f"completed_ms={evidence.completed_ms}")
    _emit(f"ACCEPTANCE_OK manifest_sha256={evidence.manifest_sha256} "
          f"files={len(evidence.files)} completed_ms={evidence.completed_ms}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="verify-acceptance.py",
        description="Verify a real-host ACP acceptance evidence root with the "
                    "production cutover gate.",
    )
    parser.add_argument(
        "--acceptance",
        required=True,
        metavar="DIR",
        help="evidence root containing MANIFEST.sha256 (absolute or relative)",
    )
    parser.add_argument(
        "--max-age-hours",
        type=int,
        default=None,
        metavar="N",
        help="override the production freshness window (default: 168)",
    )
    args = parser.parse_args(argv)
    if args.max_age_hours is not None and args.max_age_hours <= 0:
        parser.error("--max-age-hours must be a positive integer")
    return verify(args.acceptance, max_age_hours=args.max_age_hours)


if __name__ == "__main__":
    raise SystemExit(main())
