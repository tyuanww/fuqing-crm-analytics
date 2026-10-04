"""Opt-in exact-Git-source service-state drill; synthetic and POSIX only.

No network, checkout, install, application deployment, real database path or
automatic approval. Two immutable service revisions run in separate processes.
The receipt records unsupported old writes even when the drill itself passes.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
from importlib.metadata import version
import io
import json
import os
import platform
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "backend/tests/first_purchase_service_compat_probe.py"
FIXTURES = {
    "backend/tests/fixtures/analytics_first_purchase_v1.json",
    "backend/tests/fixtures/analytics_first_purchase_v1_expected.json",
}


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, timeout=30).stdout


def commit(value):
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("use a full immutable commit SHA, not HEAD, a branch or tag")
    if git("rev-parse", "--verify", value + "^{commit}").decode().strip() != value:
        raise ValueError("commit identity mismatch")
    return value


def allowed(path):
    if path in FIXTURES:
        return True
    if not path.endswith(".py"):
        return False
    return (path in {"backend/__init__.py", "backend/services/__init__.py"}
            or (path.startswith("backend/analytics") and path.count("/") == 1)
            or path.startswith(("backend/contracts/", "backend/semantic/", "backend/services/analytics/")))


def export_source(sha, destination):
    paths = [p.decode() for p in git("ls-tree", "-r", "--name-only", "-z", sha, "--", "backend").split(b"\0") if p]
    paths = [p for p in paths if allowed(p)]
    if not FIXTURES.issubset(paths) or not paths or len(paths) > 1000:
        raise ValueError("bounded synthetic source closure unavailable")
    archive = git("archive", "--format=tar", sha, "--", *paths)
    if len(archive) > 64 * 1024 * 1024:
        raise ValueError("source archive too large")
    manifest = {}
    destination.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as source:
        for member in source:
            if member.isdir():
                continue
            if (member.name not in paths or not member.isfile() or member.size > 2 * 1024 * 1024
                    or ".." in PurePosixPath(member.name).parts or PurePosixPath(member.name).is_absolute()):
                raise ValueError("unsafe or non-source archive entry")
            payload = source.extractfile(member).read()
            target = destination / member.name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with target.open("xb") as output:
                output.write(payload)
            manifest[member.name] = hashlib.sha256(payload).hexdigest()
    if set(manifest) != set(paths):
        raise ValueError("incomplete exported source")
    return {"commit": sha, "files": manifest}


def run_probe(source, state, operation, log_directory):
    env = {
        "PATH": os.pathsep.join((str(Path(sys.executable).parent), "/usr/bin", "/bin")),
        "PYTHONPATH": str(source), "PYTHONNOUSERSITE": "1", "PYTHON_DOTENV_DISABLED": "1",
        "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1",
    }
    process = subprocess.Popen([sys.executable, str(PROBE), str(source), str(state), operation],
                               cwd=source, env=env, start_new_session=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        stdout, stderr = process.communicate(timeout=45)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate(timeout=5)
        (log_directory / (operation + ".stdout")).write_text(stdout)
        (log_directory / (operation + ".stderr")).write_text(stderr)
        raise RuntimeError(f"{operation}: owned child timed out") from None
    finally:
        # Only this child's process group, including any leftover owned worker.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    (log_directory / (operation + ".stdout")).write_text(stdout)
    (log_directory / (operation + ".stderr")).write_text(stderr)
    if process.returncode != 0:
        raise RuntimeError(f"{operation} failed; see isolated stderr log")
    result = json.loads(stdout)
    if result.get("case") != operation or result.get("status") != "PASS":
        raise ValueError("invalid probe evidence")
    return result


def backup_owned(source, destination):
    """SQLite online backup of ONLY state minted inside this drill."""
    destination.mkdir(mode=0o700)
    (destination / "analyses").mkdir(mode=0o700)
    name = "analyses/first_purchase_analyses.sqlite3"
    with closing(sqlite3.connect((source / name).as_uri() + "?mode=ro", uri=True)) as old:
        with closing(sqlite3.connect(destination / name)) as new:
            old.backup(new)
    os.chmod(destination / name, 0o600)
    shutil.copyfile(source / "context.json", destination / "context.json")
    shutil.copyfile(source / ".synthetic-save-compatibility", destination / ".synthetic-save-compatibility")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, help="full SHA before D15 save receipts")
    parser.add_argument("--candidate", required=True, help="full reviewed D15 SHA")
    parser.add_argument("--output", required=True, type=Path, help="new evidence directory (never overwritten)")
    args = parser.parse_args()
    if os.name != "posix" or sys.version_info < (3, 14) or sys.flags.optimize:
        parser.error("requires POSIX Python 3.14+ with assertions enabled")
    baseline, candidate = commit(args.baseline), commit(args.candidate)
    if baseline == candidate:
        parser.error("baseline and candidate must be different commits")
    output = args.output.absolute()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    report = {
        "schema_version": "shinemage-service-save-compatibility/v1", "status": "RUNNING",
        "scope": "local-posix-synthetic-sqlite-and-asgi", "release_ready": False,
        "baseline": baseline, "candidate": candidate,
        "probe_sha256": hashlib.sha256(PROBE.read_bytes()).hexdigest(),
        "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "python": sys.version.split()[0], "observations": [],
        "platform": {"system": platform.system(), "machine": platform.machine()},
        "dependency_mode": "shared-current-test-environment",
        "dependencies": {name: version(name) for name in ("fastapi", "pydantic", "starlette", "httpx", "psutil")},
    }
    try:
        with tempfile.TemporaryDirectory(prefix="d15-service-compat-") as temporary:
            root = Path(temporary)
            old, new, state = root / "old", root / "new", root / "state"
            report["sources"] = [export_source(baseline, old), export_source(candidate, new)]
            state.mkdir(mode=0o700)
            (state / ".synthetic-save-compatibility").write_text("owned-synthetic-state/v1\n")
            for code, operation in ((old, "seed-legacy"), (new, "upgrade"),
                                    (old, "old-readonly"), (new, "recover")):
                db = state / "analyses/first_purchase_analyses.sqlite3"
                before = hashlib.sha256(db.read_bytes()).hexdigest() if operation == "old-readonly" else None
                observation = run_probe(code, state, operation, output)
                if before is not None:
                    if hashlib.sha256(db.read_bytes()).hexdigest() != before:
                        raise ValueError("old read-only API changed the durable database")
                    observation["database_unchanged"] = True
                report["observations"].append(observation)
            restored = root / "restored"
            backup_owned(state, restored)
            restore_logs = output / "restored"
            restore_logs.mkdir()
            report["observations"].append({**run_probe(new, restored, "recover", restore_logs),
                                            "case": "cold-backup-restore"})
            # Characterize the forbidden path on a disposable clone, not state.
            unsafe = root / "unsupported-old-write"
            backup_owned(state, unsafe)
            report["observations"].append(run_probe(old, unsafe, "old-write", output))
            report["observations"].append(run_probe(new, unsafe, "detect-old-write", output))
            unknown = root / "unknown-schema"
            backup_owned(state, unknown)
            db = unknown / "analyses/first_purchase_analyses.sqlite3"
            with closing(sqlite3.connect(db)) as con:
                con.execute("PRAGMA user_version=99")
            digest = hashlib.sha256(db.read_bytes()).hexdigest()
            for label, code in (("old", old), ("new", new)):
                logs = output / label
                logs.mkdir()
                report["observations"].append({**run_probe(code, unknown, "unknown-schema", logs),
                                                "case": label + "-unknown-schema"})
                if hashlib.sha256(db.read_bytes()).hexdigest() != digest:
                    raise ValueError("unknown schema was modified")
            report.update(status="PASS", compatibility={
                "old_v1_to_candidate": "PASS",
                "candidate_state_old_readonly": "PASS_WITH_READ_ONLY_IDENTITY",
                "candidate_replay_after_old_read": "PASS",
                "candidate_forward_fix_and_backup_restore": "PASS",
                "candidate_state_old_writes": "BLOCKED_PROVENANCE_NOT_PRESERVED",
                "old_service_d15_api": "NOT_AVAILABLE",
                "unknown_state_schema": "REJECTED_WITHOUT_DB_CHANGE",
                "profile_rollback": "KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE",
            })
    except Exception as error:
        report.update(status="FAIL", error=f"{type(error).__name__}: {error}")
        raise
    finally:
        (output / "receipt.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in {"sources", "observations"}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
