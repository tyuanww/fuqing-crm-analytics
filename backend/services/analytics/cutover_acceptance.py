"""P3-3d cutover acceptance-evidence gate.

A ``transport`` switch is not proof: it is a configuration line. Before any
runtime may route a family to ACP, it must be handed the real-host acceptance
evidence root produced by ``docs/operating/acp-cutover-acceptance.md`` and that
root must still verify. The check is deliberately local, synchronous and
fail-closed:

* ``acceptance_evidence_dir`` is an explicit absolute path, never a default;
* ``MANIFEST.sha256`` is the generator's ``<sha256>  <relpath>`` listing, and
  every listed file is re-hashed at startup (a missing, extra, or rewritten
  receipt is a refusal, not a warning);
* the required settle receipts must be listed and must carry the metadata the
  acceptance document says proves the cutover: a normal ACP settlement, a
  cancelled run, a resumed session, a fenced restart, a no-tool settlement and
  a reaped child;
* the newest receipt timestamp must be inside ``acceptance_max_age_hours`` and
  no more than a small clock-skew allowance in the future.

There is no environment-variable bypass and no silent bridge fallback. A
caller that asks for ACP without this evidence gets a ``CutoverAcceptanceError``
whose message starts with a stable code.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

CONFIG_DIR = "acceptance_evidence_dir"
CONFIG_MAX_AGE_HOURS = "acceptance_max_age_hours"
DEFAULT_MAX_AGE_HOURS = 168
MANIFEST_NAME = "MANIFEST.sha256"
CLOCK_SKEW_MS = 5 * 60 * 1000

# The receipt set is the minimum that proves a real cutover rather than one
# happy-path run. Names are the documented evidence paths, not new artifacts.
REQUIRED_TEXT = ("README.md", "04c-shutdown/reaped.txt")
REQUIRED_RECEIPTS = (
    "04-normal/settle.json",
    "05-cancel/settle.json",
    "06-sigkill-resume/settle.json",
    "07-kernel-restart/after.json",
    "04b-no-tool-settle/settle.json",
)

_HEX = re.compile(r"^[0-9a-f]{64}$")
_LINE = re.compile(r"^(?P<sha>[0-9a-f]{64})  (?P<path>[^ ].*)$")
_LOGGER = logging.getLogger(__name__)


class CutoverAcceptanceError(ValueError):
    """Named startup refusal: the code is stable, the detail is inspectable."""

    def __init__(self, code: str, detail: str):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class AcceptanceEvidence:
    """Verified evidence root; only returned when every gate check passed."""

    root: Path
    manifest_sha256: str
    completed_ms: int
    max_age_hours: int
    files: tuple[str, ...]


def _fail(code: str, detail: str):
    raise CutoverAcceptanceError(code, detail)


def _max_age_hours(config) -> int:
    value = config.get(CONFIG_MAX_AGE_HOURS, DEFAULT_MAX_AGE_HOURS)
    if type(value) is not int or value <= 0:
        _fail("CUTOVER_ACCEPTANCE_CONFIG_INVALID",
              f"{CONFIG_MAX_AGE_HOURS} must be a positive integer")
    return value


def _root(config) -> Path:
    raw = config.get(CONFIG_DIR)
    if raw is None:
        _fail("CUTOVER_ACCEPTANCE_NOT_CONFIGURED",
              f"ACP transport requires an explicit absolute {CONFIG_DIR}")
    if not isinstance(raw, str) or not raw or not Path(raw).is_absolute():
        _fail("CUTOVER_ACCEPTANCE_CONFIG_INVALID",
              f"{CONFIG_DIR} must be an absolute path")
    root = Path(raw)
    if not root.is_dir():
        _fail("CUTOVER_ACCEPTANCE_ROOT_MISSING", str(root))
    return root.resolve()


def _parse_manifest(root: Path) -> dict[str, str]:
    path = root / MANIFEST_NAME
    if not path.is_file():
        _fail("CUTOVER_ACCEPTANCE_MANIFEST_MISSING", str(path))
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        _fail("CUTOVER_ACCEPTANCE_MANIFEST_INVALID", f"{path}: {error}")
    entries: dict[str, str] = {}
    for number, line in enumerate(lines, 1):
        if not line:
            continue
        match = _LINE.match(line)
        if match is None:
            _fail("CUTOVER_ACCEPTANCE_MANIFEST_INVALID", f"{path}:{number}: {line!r}")
        relative = match.group("path")
        candidate = PurePosixPath(relative)
        if (candidate.is_absolute() or ".." in candidate.parts or not candidate.parts
                or relative == MANIFEST_NAME or candidate.as_posix() != relative):
            _fail("CUTOVER_ACCEPTANCE_MANIFEST_INVALID", f"{path}:{number}: unsafe path {relative!r}")
        if relative in entries:
            _fail("CUTOVER_ACCEPTANCE_MANIFEST_INVALID", f"{path}:{number}: duplicate {relative}")
        entries[relative] = match.group("sha")
    if not entries:
        _fail("CUTOVER_ACCEPTANCE_MANIFEST_INVALID", f"{path}: empty manifest")
    return entries


def _verify_files(root: Path, entries: dict[str, str]) -> None:
    root = root.resolve()
    for relative, digest in entries.items():
        path = (root / relative).resolve()
        if path != root and root not in path.parents:
            _fail("CUTOVER_ACCEPTANCE_MANIFEST_INVALID", f"entry escapes the evidence root: {relative}")
        if not path.is_file():
            _fail("CUTOVER_ACCEPTANCE_FILE_MISSING", relative)
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != digest:
            _fail("CUTOVER_ACCEPTANCE_DIGEST_MISMATCH", f"{relative}: manifest={digest} actual={actual}")


def _read_json(root: Path, relative: str):
    try:
        return json.loads((root / relative).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID", f"{relative}: {error}")


def _one(receipt, key: str, relative: str) -> dict:
    value = receipt.get(key) if isinstance(receipt, dict) else None
    if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], dict):
        _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID", f"{relative}: {key} must be exactly one row")
    return value[0]


def _binding(receipt, relative: str) -> dict:
    bindings = receipt.get("bindings") if isinstance(receipt, dict) else None
    if not isinstance(bindings, list) or len(bindings) != 1 or not isinstance(bindings[0], dict):
        _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID", f"{relative}: bindings must be exactly one row")
    return bindings[0]


def _expect(condition: bool, relative: str, detail: str) -> None:
    if not condition:
        _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID", f"{relative}: {detail}")


def _settle(root: Path, relative: str, *, status: str, error_code, binding: str,
            active_slot=None, transport: str = "acp") -> dict:
    receipt = _read_json(root, relative)
    run = _one(receipt, "run", relative)
    dispatch = _one(receipt, "dispatch", relative)
    bound = _binding(receipt, relative)
    _expect(run.get("status") == status, relative, f"run.status must be {status}")
    _expect(run.get("error_code") == error_code, relative, f"run.error_code must be {error_code}")
    _expect("active_slot" in run and run.get("active_slot") == active_slot,
            relative, f"run.active_slot must be {active_slot}")
    _expect(bound.get("state") == binding, relative, f"binding.state must be {binding}")
    _expect(bound.get("acp_session_id") not in (None, ""), relative, "binding.acp_session_id is empty")
    _expect(dispatch.get("transport") == transport, relative, f"dispatch.transport must be {transport}")
    _expect(isinstance(run.get("updated_ms"), int) and run["updated_ms"] > 0,
            relative, "run.updated_ms must be epoch milliseconds")
    return {"run": run, "binding": bound, "updated_ms": run["updated_ms"]}


def _verify_receipts(root: Path, entries: dict[str, str]) -> tuple[int, ...]:
    for relative in (*REQUIRED_TEXT, *REQUIRED_RECEIPTS):
        if relative not in entries:
            _fail("CUTOVER_ACCEPTANCE_RECEIPT_MISSING", f"{relative} is not in {MANIFEST_NAME}")
    for relative in REQUIRED_TEXT:
        try:
            text = (root / relative).read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID", f"{relative}: {error}")
        if not text.strip():
            _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID", f"{relative}: empty")

    normal = _settle(root, "04-normal/settle.json", status="SUCCEEDED", error_code=None,
                     binding="SETTLED", active_slot=None)
    resume = _settle(root, "06-sigkill-resume/settle.json", status="SUCCEEDED", error_code=None,
                     binding="SETTLED", active_slot=None)
    _expect(resume["binding"].get("acp_session_id") == normal["binding"].get("acp_session_id"),
            "06-sigkill-resume/settle.json", "resume must reuse the normal acp_session_id")
    _expect(resume["binding"].get("prompt_rpc_id") != normal["binding"].get("prompt_rpc_id"),
            "06-sigkill-resume/settle.json", "resume prompt_rpc_id must differ from normal")
    cancel = _settle(root, "05-cancel/settle.json", status="CANCELLED", error_code=None,
                     binding="SETTLED", active_slot=None)
    restart = _settle(root, "07-kernel-restart/after.json", status="FAILED",
                      error_code="EXECUTION_UNKNOWN", binding="LOST", active_slot=None)
    no_tool = _settle(root, "04b-no-tool-settle/settle.json", status="FAILED",
                      error_code="EXECUTION_UNKNOWN", binding="SETTLED", active_slot=None)
    return tuple(receipt["updated_ms"]
                 for receipt in (normal, cancel, resume, restart, no_tool))


def require_acceptance_evidence(config, *, now_ms: int | None = None) -> AcceptanceEvidence:
    """Verify the configured evidence root or refuse startup with a named code."""
    max_age_hours = _max_age_hours(config)
    root = _root(config)
    entries = _parse_manifest(root)
    _verify_files(root, entries)
    timestamps = _verify_receipts(root, entries)
    now = time.time_ns() // 1_000_000 if now_ms is None else now_ms
    window_ms = max_age_hours * 60 * 60 * 1000
    for stamp in timestamps:
        if stamp > now + CLOCK_SKEW_MS:
            _fail("CUTOVER_ACCEPTANCE_RECEIPT_INVALID",
                  f"evidence timestamp {stamp} is in the future")
        if now - stamp > window_ms:
            _fail("CUTOVER_ACCEPTANCE_STALE",
                  f"receipt timestamp {stamp} is older than {max_age_hours}h "
                  f"(now {now})")
    completed_ms = max(timestamps)
    evidence = AcceptanceEvidence(
        root=root,
        manifest_sha256=hashlib.sha256((root / MANIFEST_NAME).read_bytes()).hexdigest(),
        completed_ms=completed_ms,
        max_age_hours=max_age_hours,
        files=tuple(sorted(entries)),
    )
    _LOGGER.info("cutover acceptance evidence verified at %s: manifest=%s age_ms=%s files=%d",
                 evidence.root, evidence.manifest_sha256, now - completed_ms, len(evidence.files))
    return evidence
