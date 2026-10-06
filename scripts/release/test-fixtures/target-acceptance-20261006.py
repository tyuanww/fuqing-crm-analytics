"""One-run acceptance evidence adapter; not a production installer or gate.

Consumes the already verified immutable service pair and local synthetic seed.
Existing repository helpers own preflight, unpack, offline install and HTTP app.
"""

import hashlib
import json
import os
from pathlib import Path
import platform
import secrets
import selectors
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "result"
PYTHON = "/usr/local/bin/python3.14"
BASE = "/api/v1/analytics-first-purchase"
DB = "analyses/first_purchase_analyses.sqlite3"
MARKER = "owned-synthetic-state/v1\n"
credentials = {"writer": secrets.token_hex(32), "reader": secrets.token_hex(32)}
active = None
temporary = None
processes = []
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def digest(path):
    require(
        path.is_file()
        and not path.is_symlink()
        and path.stat().st_size < 64 * 1024 * 1024,
        "INPUT_FILE_INVALID",
    )
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def redact(value):
    for token in credentials.values():
        value = value.replace(token, "[REDACTED]")
    return value


def verify_inputs(expected):
    require(digest(ROOT / "input-manifest.json") == expected, "INPUT_MANIFEST_DIGEST")
    inventory = json.loads((ROOT / "input-manifest.json").read_text())
    require(
        inventory["scope"] == "synthetic-service-target-acceptance-only"
        and inventory["release_ready"] is False,
        "INPUT_SCOPE",
    )
    actual = set()
    for p in ROOT.rglob("*"):
        require(not p.is_symlink(), "INPUT_LINK")
        if p.is_dir():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel == "input-manifest.json":
            continue
        require(rel in inventory["files"], "INPUT_EXTRA")
        row = inventory["files"][rel]
        require(
            digest(p) == row["sha256"] and p.stat().st_size == row["bytes"],
            "INPUT_DIGEST",
        )
        actual.add(rel)
    require(actual == set(inventory["files"]), "INPUT_MISSING")
    return inventory


def environment():
    return {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": str(temporary),
        "TMPDIR": str(temporary),
        "PYTHON_DOTENV_DISABLED": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PIP_CONFIG_FILE": "/dev/null",
    }


def command(args, name, timeout=90):
    proc = subprocess.Popen(
        args,
        cwd=temporary,
        env=environment(),
        start_new_session=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait(timeout=5)
    (OUT / (name + ".stdout")).write_text(redact(stdout))
    (OUT / (name + ".stderr")).write_text(redact(stderr))
    require(proc.returncode == 0, "COMMAND_FAILED_" + name)
    return json.loads(stdout)


def request(path, expected, body=None, role="writer", key="target-save", version=None):
    headers = {"Content-Type": "application/json", "Idempotency-Key": key}
    if role:
        headers["Authorization"] = "Bearer " + credentials[role]
    if version is not None:
        headers["If-Match"] = str(version)
    req = urllib.request.Request(
        active["origin"] + BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        headers=headers,
    )
    try:
        response = opener.open(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        require(response.status == expected, "HTTP_STATUS_" + str(response.status))
        raw = response.read(1024 * 1024 + 1)
    require(len(raw) <= 1024 * 1024, "HTTP_SIZE")
    return json.loads(raw)


def start(label, operation, state, name):
    global active
    require(active is None, "PROCESS_OWNERSHIP")
    runtime = runtimes[label]
    proc = subprocess.Popen(
        [
            runtime["python"],
            "-I",
            "-B",
            str(ROOT / "helpers/first-purchase-package.fixture.py"),
            operation,
            str(runtime["app"]),
            str(state),
        ],
        cwd=temporary,
        env=environment(),
        start_new_session=True,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    active = {"proc": proc, "name": name, "prefix": "", "origin": None}
    processes.append({"pid": proc.pid, "operation": operation, "case": name})
    proc.stdin.write(json.dumps(credentials))
    proc.stdin.close()
    proc.stdin = None
    with selectors.DefaultSelector() as selector:
        selector.register(proc.stdout, selectors.EVENT_READ)
        require(selector.select(15), "SERVICE_START_TIMEOUT")
        line = proc.stdout.readline(65537)
    active["prefix"] = line
    require(line.endswith("\n") and len(line) <= 65536, "SERVICE_START_RECEIPT")
    bound = json.loads(line)
    require(
        bound["status"] == "SERVICE_SOCKET_BOUND"
        and bound["manifest_sha256"] == pair["artifacts"][label]["manifest_sha256"]
        and bound["openapi"] == "MATCHED"
        and type(bound["port"]) is int
        and 0 < bound["port"] < 65536,
        "SERVICE_IDENTITY",
    )
    active["origin"] = "http://127.0.0.1:" + str(bound["port"])
    active["port"] = bound["port"]
    processes[-1]["port"] = bound["port"]
    for _ in range(80):
        try:
            request("/analyses", 401, role=None)
            return
        except (OSError, RuntimeError):
            require(proc.poll() is None, "SERVICE_EXITED")
            time.sleep(0.025)
    raise RuntimeError("HTTP_NOT_READY")


def stop(crash=False):
    global active
    if active is None:
        return
    owned = active
    active = None
    proc = owned["proc"]
    if proc.poll() is None:
        os.killpg(proc.pid, signal.SIGKILL if crash else signal.SIGTERM)
    try:
        stdout, stderr = proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        stdout, stderr = proc.communicate(timeout=5)
    (OUT / (owned["name"] + ".stdout")).write_text(redact(owned["prefix"] + stdout))
    (OUT / (owned["name"] + ".stderr")).write_text(redact(stderr))
    if "port" in owned:
        with socket.socket() as sock:
            sock.settimeout(0.5)
            require(
                sock.connect_ex(("127.0.0.1", owned["port"])) != 0,
                "OWNED_PORT_NOT_RELEASED",
            )
    processes[-1]["exit_code"] = proc.returncode
    processes[-1]["stopped"] = True


def observed(name, **extra):
    report["observations"].append({"case": name, "status": "PASS", **extra})
    dump(OUT / "receipt.json", report)
    print(json.dumps({"stage": name, "status": "PASS"}), flush=True)


def backup_state(state, label):
    parent = temporary / ("crm-packed-service-" + label)
    parent.mkdir(mode=0o700)
    target = parent / "analysis-state"
    (target / "analyses").mkdir(parents=True, mode=0o700)
    old = sqlite3.connect((state / DB).as_uri() + "?mode=ro", uri=True)
    new = sqlite3.connect(target / DB)
    try:
        old.backup(new)
    finally:
        new.close()
        old.close()
    shutil.copyfile(state / "context.json", target / "context.json")
    (target / ".synthetic-package-test").write_text(MARKER)
    return target


def cancelled(signum, frame):
    raise RuntimeError("ACCEPTANCE_CANCELLED")


require(
    len(sys.argv) == 2 and sys.flags.isolated and not sys.flags.optimize, "INVOCATION"
)
require(
    platform.system() == "Linux"
    and "microsoft" in platform.release().lower()
    and "wsl2" in platform.release().lower()
    and os.getuid() == 65534,
    "UNPRIVILEGED_WSL2_REQUIRED",
)
inventory = verify_inputs(sys.argv[1])
OUT.mkdir(mode=0o700)
signal.signal(signal.SIGTERM, cancelled)
signal.signal(signal.SIGINT, cancelled)
report = {
    "schema_version": "shinemage-service-target-acceptance-observation/v1",
    "status": "RUNNING",
    "scope": "actual-wsl2-isolated-synthetic-http",
    "input_sha256": sys.argv[1],
    "release_ready": False,
    "activation": "BLOCKED",
    "supply_chain": "NOT_RUN",
    "production_identity": "NOT_RUN",
    "journal_binding": "NOT_RUN",
    "observations": [],
    "platform": {
        "system": platform.system(),
        "machine": platform.machine(),
        "kernel": platform.release(),
        "python": platform.python_version(),
        "uid": os.getuid(),
    },
    "artifacts": {},
}
dump(OUT / "receipt.json", report)
try:
    temporary = Path(
        tempfile.mkdtemp(prefix="crm-packed-service-wsl-", dir=ROOT.parent)
    )
    pair = json.loads((ROOT / "pair/receipt.json").read_text())
    require(pair["status"] == "PASS" and pair["release_ready"] is False, "PAIR_SCOPE")
    wheels = json.loads((ROOT / "wheel-preparation.json").read_text())["wheels"]
    require(
        {p.name for p in (ROOT / "wheels").iterdir()}
        == {r["file"] for r in wheels.values()},
        "WHEEL_CLOSURE",
    )
    for row in wheels.values():
        require(
            digest(ROOT / "wheels" / row["file"]) == row["sha256"],
            "WHEEL_SOURCE_DIGEST",
        )
    runtimes = {}
    for label in ("baseline", "candidate"):
        record = pair["artifacts"][label]
        folder = ROOT / "pair" / label
        archive = folder / record["artifact"]
        manifest = folder / "service-manifest.json"
        require(
            archive.parent == folder
            and digest(archive) == record["sha256"]
            and digest(manifest) == record["manifest_sha256"],
            "PAIR_ARTIFACT_DIGEST",
        )
        preflight = command(
            [
                PYTHON,
                "-I",
                "-B",
                str(ROOT / "helpers/service-target-preflight.py"),
                "--manifest",
                str(manifest),
                "--manifest-sha256",
                record["manifest_sha256"],
                "--wheelhouse",
                str(ROOT / "wheels"),
            ],
            label + "-preflight",
        )
        require(
            preflight["status"] == "SERVICE_TARGET_PREFLIGHT_PASS", "PREFLIGHT_BLOCKED"
        )
        app = temporary / (label + "-app")
        command(
            [
                PYTHON,
                "-I",
                "-B",
                str(ROOT / "helpers/secure-unpack.py"),
                str(archive),
                str(app),
                "--max-entries",
                "100",
                "--max-bytes",
                "8388608",
            ],
            label + "-unpack",
        )
        require(
            digest(app / "service-manifest.json") == record["manifest_sha256"],
            "UNPACKED_MANIFEST",
        )
        runtime = command(
            [
                PYTHON,
                "-I",
                "-B",
                str(ROOT / "helpers/service-runtime.fixture.py"),
                str(app / "service-manifest.json"),
                str(temporary / (label + "-venv")),
                "--wheelhouse",
                str(ROOT / "wheels"),
            ],
            label + "-cold-install",
        )
        require(runtime["mode"] == "offline-hashed-wheel-install", "INSTALL_MODE")
        check = command(
            [runtime["python"], "-I", "-B", str(app / "service.py"), "check"],
            label + "-check",
        )
        require(
            check["manifest_sha256"] == record["manifest_sha256"], "INSTALLED_MANIFEST"
        )
        installed = command(
            [
                runtime["python"],
                "-I",
                "-B",
                "-c",
                'import importlib.metadata as m,json;print(json.dumps({d.metadata["Name"].lower().replace("_","-"):d.version for d in m.distributions()}))',
            ],
            label + "-inventory",
        )
        require(
            installed == json.loads(manifest.read_text())["dependencies"],
            "INSTALLED_CLOSURE",
        )
        for name, row in runtime["wheels"].items():
            require(
                row["sha256"] == wheels[name]["sha256"]
                and row["version"] == wheels[name]["version"],
                "INSTALLED_WHEEL_DIGEST",
            )
        runtimes[label] = {"python": runtime["python"], "app": app}
        report["artifacts"][label] = {
            "archive_sha256": record["sha256"],
            "manifest_sha256": record["manifest_sha256"],
            "service_source": record["service_source"],
            "installed": installed,
            "wheels": runtime["wheels"],
        }
        observed(label + "-preflight-cold-install", dependencies=len(installed))
    state = temporary / "analysis-state"
    command(
        [
            PYTHON,
            "-I",
            "-B",
            str(ROOT / "helpers/secure-unpack.py"),
            str(ROOT / "synthetic-seed.tar"),
            str(state),
            "--max-entries",
            "30",
            "--max-bytes",
            "1048576",
        ],
        "seed-unpack",
    )
    seed = json.loads((ROOT / "synthetic-seed.json").read_text())
    require(
        seed["source"] == pair["baseline"] and seed["release_ready"] is False,
        "SEED_SOURCE",
    )
    require(
        {p.relative_to(state).as_posix() for p in state.rglob("*") if p.is_file()}
        == {r["path"] for r in seed["files"]},
        "SEED_INVENTORY",
    )
    for row in seed["files"]:
        require(digest(state / row["path"]) == row["sha256"], "SEED_DIGEST")
    context = json.loads((state / "context.json").read_text())
    identity = {
        "schema_version": "analytics-first-purchase-save-identity/v1",
        "action_id": "target-save",
        "candidate_digest": "a" * 64,
        "correlation_id": "target-synthetic-correlation",
    }
    save = {
        "schema_version": "analytics-first-purchase-save-command/v1",
        "identity": identity,
        "created_from_run_id": context["run_id"],
        "title": "synthetic WSL D15",
        "evidence_digest": context["evidence_digest"],
    }
    start("baseline", "legacy-write", state, "legacy-seed")
    legacy = request(
        "/analyses",
        201,
        {"created_from_run_id": context["run_id"], "title": "synthetic legacy"},
        key="legacy",
    )
    stop()
    observed("legacy-save")
    start("candidate", "serve", state, "candidate-save")
    require(request("/analyses/" + legacy["analysis_id"], 200) == legacy, "LEGACY_READ")
    require(
        request("/analyses/" + legacy["analysis_id"] + "/provenance", 404)["error"][
            "code"
        ]
        == "PROVENANCE_NOT_RECORDED",
        "LEGACY_PROVENANCE",
    )
    observed("legacy-state-upgrade")
    inspected = request(
        "/save-results/inspect",
        200,
        {
            "schema_version": "analytics-first-purchase-save-inspect/v1",
            "identity": identity,
            "created_from_run_id": context["run_id"],
        },
    )
    require(
        inspected["save_eligible"]
        and inspected["provenance"]["freshness"]["freshness_state"] == "FRESH",
        "FRESHNESS",
    )
    require(
        request(
            "/save-receipts",
            409,
            {**save, "identity": {**identity, "candidate_digest": "b" * 64}},
        )["error"]["code"]
        == "CANDIDATE_NOT_ADMITTED",
        "ADMISSION",
    )
    require(
        request("/save-receipts", 403, save, role="reader")["error"]["code"]
        == "FORBIDDEN",
        "PERMISSION",
    )
    require(len(request("/analyses", 200)["items"]) == 1, "DENIED_SAVE_WROTE")
    observed("freshness-admission-and-permission")
    saved = request("/save-receipts", 201, save)
    require(
        saved["status"] == "SAVED" and request("/save-receipts", 201, save) == saved,
        "IDEMPOTENCY",
    )
    require(
        request("/save-receipts", 409, {**save, "title": "conflict"})["error"]["code"]
        == "CONFLICT",
        "SAVE_CONFLICT",
    )
    path = "/analyses/" + saved["analysis_ref"]["analysis_id"]
    original = request(path, 200)
    provenance = request(path + "/provenance", 200)
    stop(crash=True)
    observed("save-conflict-and-owned-process-crash")
    start("candidate", "recover", state, "crash-replay")
    require(
        request("/save-receipts/reconcile", 200, identity) == saved
        and request("/save-receipts", 201, save) == saved,
        "CRASH_REPLAY",
    )
    require(len(request("/analyses", 200)["items"]) == 2, "DUPLICATE_SAVE")
    require(request(path + "/provenance", 200) == provenance, "CRASH_PROVENANCE")
    require(
        request(
            "/save-receipts/reconcile",
            200,
            {**identity, "action_id": "unseen-action"},
            key="unseen",
        )["status"]
        == "SAVE_UNKNOWN",
        "UNKNOWN",
    )
    stop()
    observed("crash-reconcile-idempotency-and-unknown")
    before = digest(state / DB)
    start("baseline", "legacy-readonly", state, "old-readonly")
    require(request(path, 200) == original, "OLD_READ")
    require(
        request(path + "/versions", 403, {"title": "forbidden"}, version=1)["error"][
            "code"
        ]
        == "FORBIDDEN",
        "OLD_WRITE_DENIED",
    )
    request("/save-receipts/reconcile", 404, identity)
    stop()
    require(digest(state / DB) == before, "OLD_READ_CHANGED_STATE")
    observed("old-service-readonly-fallback", database_unchanged=True)
    start("candidate", "recover", state, "forward-fix")
    require(
        request("/save-receipts/reconcile", 200, identity) == saved,
        "REPLAY_AFTER_OLD_READ",
    )
    fixed = request(
        path + "/versions",
        201,
        {"title": "synthetic corrected"},
        key="forward-fix",
        version=1,
    )
    require(
        fixed["version"] == 2 and fixed["facts"] == original["facts"], "FORWARD_FIX"
    )
    require(
        request(path + "/provenance", 200)["provenance"] == provenance["provenance"],
        "FORWARD_FIX_PROVENANCE",
    )
    require(
        request(
            "/analyses",
            409,
            {"created_from_run_id": context["run_id"], "title": "bypass"},
            key="bypass",
        )["error"]["code"]
        == "VERSIONED_SAVE_REQUIRED",
        "BYPASS",
    )
    stop()
    observed("candidate-forward-fix")
    restored = backup_state(state, "restored")
    start("candidate", "recover", restored, "cold-restore")
    require(
        request("/save-receipts/reconcile", 200, identity) == saved
        and request("/save-receipts", 201, save) == saved,
        "RESTORE_REPLAY",
    )
    require(
        request(path, 200)["version"] == 2
        and len(request("/analyses", 200)["items"]) == 2,
        "RESTORE_STATE",
    )
    stop()
    observed("synthetic-backup-cold-restore")
    unsafe = backup_state(state, "unsupported-old-write")
    start("baseline", "legacy-write", unsafe, "unsupported-old-write")
    require(
        request(
            path + "/versions",
            201,
            {"title": "synthetic unsupported downgrade"},
            key="old-write",
            version=2,
        )["version"]
        == 3,
        "OLD_WRITE",
    )
    stop()
    start("candidate", "recover", unsafe, "detect-old-write")
    require(
        request(path + "/provenance", 404)["error"]["code"]
        == "PROVENANCE_NOT_RECORDED",
        "DOWNGRADE_PROVENANCE",
    )
    require(
        request("/save-receipts/reconcile", 200, identity) == saved, "DOWNGRADE_RECEIPT"
    )
    stop()
    observed(
        "unsupported-old-write-detected", downgrade="BLOCKED_PROVENANCE_NOT_PRESERVED"
    )
    unknown = backup_state(state, "unknown-schema")
    connection = sqlite3.connect(unknown / DB)
    try:
        connection.execute("PRAGMA user_version=99")
    finally:
        connection.close()
    before = digest(unknown / DB)
    for label, operation in (("baseline", "legacy-readonly"), ("candidate", "recover")):
        name = label + "-unknown-schema"
        try:
            start(label, operation, unknown, name)
        except (RuntimeError, ValueError):
            stop()
            require(
                "schema differs" in (OUT / (name + ".stderr")).read_text(),
                "WRONG_SCHEMA_FAILURE",
            )
        else:
            stop()
            raise RuntimeError("UNKNOWN_SCHEMA_ACCEPTED")
        require(digest(unknown / DB) == before, "UNKNOWN_SCHEMA_CHANGED_DB")
        observed(name, rejected=True, database_unchanged=True)
    for label, runtime in runtimes.items():
        command(
            [
                runtime["python"],
                "-I",
                "-B",
                str(runtime["app"] / "service.py"),
                "check",
            ],
            label + "-final-check",
        )
    verify_inputs(sys.argv[1])
    observed("input-and-installed-artifact-integrity")
    report["status"] = "PASS"
    report["compatibility"] = {
        "profile_rollback": "KEEP_CANDIDATE_SERVICE_AND_DURABLE_STATE",
        "old_service_write": "BLOCKED_PROVENANCE_NOT_PRESERVED",
        "identity": "EPHEMERAL_SYNTHETIC_ONLY",
        "candidate_policy": "SYNTHETIC_A64_ONLY",
    }
except Exception as error:
    report["status"] = "FAIL"
    report["error"] = type(error).__name__ + ":" + redact(str(error))[:300]
finally:
    try:
        stop()
        report["processes"] = processes
        require(all(p.get("stopped") for p in processes), "PROCESS_CLEANUP_INCOMPLETE")
        if temporary:
            require(
                temporary.parent == ROOT.parent
                and temporary.name.startswith("crm-packed-service-wsl-"),
                "CLEANUP_OWNERSHIP",
            )
            shutil.rmtree(temporary)
        report["cleanup"] = "OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED"
    except Exception as error:
        report["status"] = "FAIL"
        report["cleanup"] = "FAILED"
        report["cleanup_error"] = type(error).__name__
    dump(OUT / "receipt.json", report)
print(
    json.dumps(
        {
            "status": report["status"],
            "observations": len(report["observations"]),
            "release_ready": False,
        }
    ),
    flush=True,
)
sys.exit(0 if report["status"] == "PASS" else 2)
