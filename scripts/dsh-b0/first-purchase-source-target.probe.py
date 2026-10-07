"""Opt-in synthetic query/save artifact drill. No DSH or production deployment.

Inputs are sealed before transfer; Linux wheels have their own receipt instead
of rewriting the Mac archive receipt. The controller imports no backend code.
"""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import runpy
import secrets
import select
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

sys.dont_write_bytecode = True
BASE = "/api/v1/analytics-first-purchase"
MARKER = "owned-synthetic-host/v1\n"
CONTRACT = "first-purchase-frozen-source/v1"


def require(condition, code):
    if not condition:
        raise ValueError(code)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def verify_inputs(root, expected):
    require(root.is_absolute() and not any(p.is_symlink() for p in (root, *root.parents)), "INPUT_PATH")
    require(re.fullmatch(r"[0-9a-f]{64}", expected) and sha(root / "input.json") == expected, "INPUT_DIGEST")
    doc = json.loads((root / "input.json").read_bytes())
    require(set(doc) == {"schema_version", "release_ready", "candidate_digest", "source_sha", "files"}
            and doc["schema_version"] == "synthetic-source-http-target-input/v1"
            and doc["release_ready"] is False, "INPUT_SCOPE")
    require(re.fullmatch(r"[0-9a-f]{64}", doc["candidate_digest"])
            and re.fullmatch(r"[0-9a-f]{40}", doc["source_sha"]), "INPUT_IDENTITY")
    require(isinstance(doc["files"], dict) and 1 <= len(doc["files"]) <= 100, "INPUT_COUNT")
    total = 0
    for name, row in doc["files"].items():
        rel = PurePosixPath(name)
        require(not rel.is_absolute() and rel.as_posix() == name and "\\" not in name
                and all(part not in ("", ".", "..") for part in name.split("/")), "INPUT_ENTRY")
        path = root / name
        require(set(row) == {"bytes", "sha256"} and type(row["bytes"]) is int
                and 0 <= row["bytes"] <= 64 * 1024 * 1024, "INPUT_RECORD")
        require(not any(p.is_symlink() for p in (path, *path.parents)) and path.is_file()
                and path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], "INPUT_CHANGED")
        total += row["bytes"]
    require(total <= 96 * 1024 * 1024, "INPUT_SIZE")
    actual = set()
    for path in root.rglob("*"):
        require(not path.is_symlink() and (path.is_dir() or path.is_file()), "INPUT_SYMLINK_OR_DEVICE")
        if path.is_file():
            actual.add(path.relative_to(root).as_posix())
    require(actual == set(doc["files"]) | {"input.json"}, "INPUT_INVENTORY")
    return doc


def query_child(source, state, digest, expected, fixture):
    require((state / ".owned-first-purchase-host").read_text() == MARKER + digest + "\n", "STATE_OWNER")
    verifier = runpy.run_path(str(Path(__file__).with_name("first-purchase-kernel.probe.py")))
    manifest = verifier["verify"](source, expected)
    config = json.loads(sys.stdin.buffer.read(4097))
    require(set(config) == {"crm_origin"} and re.fullmatch(r"http://127\.0\.0\.1:[1-9][0-9]{0,4}", config["crm_origin"]), "CRM_ORIGIN")
    sys.meta_path.insert(0, verifier["DenyLegacy"]())
    sys.path.insert(0, str(source))
    import uvicorn
    from backend.analytics_first_purchase_fixture import create_first_purchase_fixture
    from backend.analytics_first_purchase_source_app import create_first_purchase_source_app
    from backend.services.analytics.access import AnalyticsPrincipal
    from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
    from backend.services.analytics.first_purchase.runtime import FirstPurchaseRuntime
    from backend.services.analytics.jobs import RunStore
    from backend.services.analytics.resource_profile import B0ResourceProfile, B0_SMALL_FIXTURE_PROFILE
    from backend.services.analytics import worker

    require(worker.REPO_ROOT == source, "WORKER_PACKAGE_ROOT")
    snapshot = json.loads((fixture / "snapshot.json").read_bytes())
    require(snapshot["scope"] == "synthetic" and snapshot["contains_real_data"] is False, "SYNTHETIC_ONLY")
    sealed = create_first_purchase_fixture(snapshot)
    request = json.loads((fixture / "expected.json").read_bytes())["request"]
    actor = AnalyticsPrincipal("crm-owner", frozenset({"run:create", "run:read", "run:cancel", "analysis:save", "analysis:read"}),
                               frozenset({"first-purchase-fixture"}))
    (state / "runs").mkdir(mode=0o700, exist_ok=True)
    runs = RunStore(state / "runs", B0ResourceProfile(**B0_SMALL_FIXTURE_PROFILE), family="first_purchase")
    runtime = FirstPurchaseRuntime(runs, sealed, lambda _: actor)
    result = runtime.submit_and_execute(actor, "wsl-source-drill", request)
    require(result.status == "SUCCEEDED", "QUERY_WORKER_FAILED")
    records = runs.worker_records(active_only=False)
    require(len(records) == 1 and not runs.worker_records() and records[0]["exit_code"] == 0, "WORKER_REPLAY")
    app = create_first_purchase_source_app(runs, CRMFirstPurchaseIdentityResolver(
        config["crm_origin"], frozenset({"crm-owner"}), allow_query=True))
    modules = {name: Path(module.__file__).resolve() for name, module in list(sys.modules.items())
               if name.startswith("backend.") and getattr(module, "__file__", None)}
    require(modules and all(p.is_relative_to(source) for p in modules.values()), "QUERY_IMPORT_ORIGIN")
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", 4335))
        sock.listen(64)
        print(json.dumps({"status": "QUERY_SOURCE_BOUND", "pid": os.getpid(), "port": 4335,
            "manifest_sha256": expected, "source_sha": manifest["source_sha"], "run_id": result.run_id,
            "evidence_digest": result.evidence_digest, "worker_pid": records[0]["pid"], "worker_count": 1,
            "worker_exit_code": 0, "imports": {k: v.relative_to(source).as_posix() for k, v in modules.items()}}), flush=True)
        uvicorn.Server(uvicorn.Config(app, access_log=False, log_level="warning", lifespan="off")).run(sockets=[sock])


class Drill:
    def __init__(self, root, expected, local):
        self.root, self.expected = root, expected
        self.input = verify_inputs(root, expected)
        require(sys.flags.isolated and not sys.flags.optimize and sys.version_info[:2] == (3, 14), "ISOLATED_314_REQUIRED")
        wsl = platform.system() == "Linux" and "microsoft" in platform.release().lower() and "wsl2" in platform.release().lower()
        require(local or (wsl and os.getuid() == 65534), "UNPRIVILEGED_WSL2_REQUIRED")
        self.out = root.parent / "result"
        self.out.mkdir(mode=0o700)
        self.temp = Path(tempfile.mkdtemp(prefix="source-http-owned-", dir=root.parent))
        self.token = secrets.token_urlsafe(32)
        self.identity = {"enabled": True, "admin": True, "username": "crm-owner"}
        self.processes, self.active = [], {}
        self.server = self.thread = None
        self.report = {"schema_version": "source-http-target-observation/v1", "status": "RUNNING",
            "scope": "local-synthetic-package-http" if local else "actual-wsl2-synthetic-package-http",
            "input_sha256": expected, "source_sha": self.input["source_sha"],
            "candidate_digest": self.input["candidate_digest"], "release_ready": False,
            "dsh_host": "NOT_RUN", "activation": "BLOCKED", "supply_chain": "NOT_RUN",
            "platform": {"system": platform.system(), "machine": platform.machine(), "kernel": platform.release(),
                         "python": platform.python_version(), "uid": os.getuid()}, "observations": [], "artifacts": {}}

    def env(self):
        zstd = shutil.which("zstd")
        require(zstd is not None, "ZSTD_REQUIRED")
        return {"PATH": os.pathsep.join((str(Path(sys.executable).parent), str(Path(zstd).parent), "/usr/local/bin", "/usr/bin", "/bin")),
                "HOME": str(self.temp), "TMPDIR": str(self.temp), "PYTHON_DOTENV_DISABLED": "1"}

    def command(self, args, name):
        proc = subprocess.Popen(args, cwd=self.temp, env=self.env(), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            stdout, stderr = proc.communicate(timeout=90)
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate(timeout=5)
        (self.out / (name + ".stdout")).write_text(stdout.replace(self.token, "[REDACTED]"))
        (self.out / (name + ".stderr")).write_text(stderr.replace(self.token, "[REDACTED]"))
        require(proc.returncode == 0, "COMMAND_FAILED_" + name)
        return json.loads(stdout)

    def observed(self, name, **extra):
        self.report["observations"].append({"case": name, "status": "PASS", **extra})
        dump(self.out / "receipt.json", self.report)
        print(json.dumps({"stage": name, "status": "PASS"}), flush=True)

    def install(self, label):
        from pip._vendor.packaging.tags import sys_tags
        folder = self.root / label
        manifest_path = folder / ("kernel-manifest.json" if label == "query" else "service-manifest.json")
        manifest = json.loads(manifest_path.read_bytes())
        require(manifest["release_ready"] is False, "NOT_PRODUCTION_PACKAGE")
        if label == "query":
            require(manifest["source_sha"] == self.input["source_sha"] and manifest["scope"] == "synthetic-composition-only", "QUERY_IDENTITY")
        helper = runpy.run_path(str(self.root / "helpers/service-target-preflight.py"))
        wheels = helper["wheel_inventory"](self.root / (label + "-wheels"), manifest["dependencies"], set(sys_tags()))
        require(all(r["compatible"] and r["python_compatible"] for r in wheels.values()), "WHEEL_PLATFORM")
        app = self.temp / (label + "-app")
        self.command([sys.executable, "-I", "-B", str(self.root / "helpers/secure-unpack.py"),
            str(folder / "archive.tar.zst"), str(app), "--max-entries", "100", "--max-bytes", "8388608"], label + "-unpack")
        require(sha(app / manifest_path.name) == sha(manifest_path), "INSTALLED_MANIFEST")
        runtime = self.command([sys.executable, "-I", "-B", str(self.root / "helpers/service-runtime.fixture.py"),
            str(app / manifest_path.name), str(self.temp / (label + "-venv")), "--wheelhouse",
            str(self.root / (label + "-wheels"))], label + "-install")
        require(runtime["mode"] == "offline-hashed-wheel-install", "OFFLINE_INSTALL")
        installed = self.command([runtime["python"], "-I", "-B", "-c",
            'import importlib.metadata as m,json;print(json.dumps({d.metadata["Name"].lower().replace("_","-"):d.version for d in m.distributions()}))'], label + "-dependencies")
        require(installed == manifest["dependencies"] and all(runtime["wheels"][k]["sha256"] == row["sha256"] for k, row in wheels.items()), "DEPENDENCY_CLOSURE")
        self.report["artifacts"][label] = {"archive_sha256": sha(folder / "archive.tar.zst"), "manifest_sha256": sha(manifest_path),
                                          "installed": installed, "wheels": runtime["wheels"]}
        self.observed(label + "-platform-offline-cold-install", dependencies=len(installed))
        return {"python": runtime["python"], "app": app, "manifest": sha(manifest_path)}

    def start(self, label, state, name):
        require(label not in self.active, "PROCESS_ALREADY_OWNED")
        runtime = self.runtimes[label]
        if label == "query":
            args = [str(Path(__file__)), "query", str(runtime["app"]), str(state), self.input["candidate_digest"],
                    runtime["manifest"], str(self.root / "fixtures")]
            config = {"crm_origin": self.crm_origin}
        else:
            args = [str(self.root / "helpers/first-purchase-service.probe.py"), str(runtime["app"]), str(state),
                    self.input["candidate_digest"], runtime["manifest"], "0"]
            config = {"crm_origin": self.crm_origin, "query_runtime": "independent-offline-query-artifact",
                      "source_contract": CONTRACT, "source_origin": "http://127.0.0.1:4335"}
        log = (self.out / (name + ".stderr")).open("x")
        try:
            proc = subprocess.Popen([runtime["python"], "-I", "-B", *args], cwd=state, env=self.env(), stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE, stderr=log, text=True, start_new_session=True)
        except BaseException:
            log.close()
            raise
        row = {"name": name, "pid": proc.pid, "stopped": False}
        self.processes.append(row)
        self.active[label] = {"proc": proc, "log": log, "row": row, "name": name}
        proc.stdin.write(json.dumps(config))
        proc.stdin.close()
        proc.stdin = None
        require(select.select([proc.stdout], [], [], 25)[0], "CHILD_START_TIMEOUT")
        line = proc.stdout.readline(1024 * 1024 + 1)
        require(0 < len(line) <= 1024 * 1024 and self.token not in line, "CHILD_HANDSHAKE")
        bound = json.loads(line)
        require(bound["pid"] == proc.pid and bound["manifest_sha256"] == runtime["manifest"], "CHILD_IDENTITY")
        require(bound["status"] == ("QUERY_SOURCE_BOUND" if label == "query" else "SERVICE_SOCKET_BOUND"), "CHILD_SCOPE")
        if label == "save":
            require(bound["sqlite_scope"] == "saved-analysis-only" and bound["sqlite_files"] == ["analyses/first_purchase_analyses.sqlite3"], "SAVE_STORAGE_OWNER")
        row["port"] = bound["port"]
        self.active[label]["bound"] = bound
        dump(self.out / (name + ".json"), bound)
        for _ in range(100):
            require(proc.poll() is None, "CHILD_EXITED")
            with socket.socket() as sock:
                sock.settimeout(0.1)
                if sock.connect_ex(("127.0.0.1", bound["port"])) == 0:
                    return bound
            time.sleep(0.02)
        raise ValueError("CHILD_NOT_READY")

    def stop(self, label, crash=False):
        owned = self.active.pop(label, None)
        if owned is None:
            return
        proc = owned["proc"]
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGKILL if crash else signal.SIGTERM)
        try:
            stdout, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            stdout, _ = proc.communicate(timeout=5)
        finally:
            owned["log"].close()
        (self.out / (owned["name"] + ".stdout")).write_text(stdout.replace(self.token, "[REDACTED]"))
        owned["row"].update(stopped=True, exit_code=proc.returncode, intentional_crash=crash)
        if "port" in owned["row"]:
            with socket.socket() as sock:
                sock.settimeout(0.5)
                require(sock.connect_ex(("127.0.0.1", owned["row"]["port"])) != 0, "OWNED_PORT_BUSY")
        return proc.returncode

    def request(self, label, path, expected, body=None, *, authorized=True):
        identity = (body or {}).get("identity", body or {})
        headers = {"Content-Type": "application/json", "Idempotency-Key": identity.get("action_id", "source-target-read")}
        if authorized:
            headers["Authorization"] = "Bearer " + self.token
        port = self.active[label]["bound"]["port"]
        req = urllib.request.Request(f"http://127.0.0.1:{port}" + BASE + path,
            data=None if body is None else json.dumps(body).encode(), headers=headers)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            response = opener.open(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(1024 * 1024 + 1)
            require(response.status == expected, "HTTP_STATUS_" + str(response.status) + "_" + path)
        require(len(raw) <= 1024 * 1024 and self.token.encode() not in raw, "HTTP_RESPONSE_LIMIT")
        return json.loads(raw)

    def state(self, name):
        state = self.temp / name
        state.mkdir(mode=0o700)
        (state / ".owned-first-purchase-host").write_text(MARKER + self.input["candidate_digest"] + "\n")
        (state / "analyses").mkdir(mode=0o700)
        return state

    def execute(self):
        query_receipt = json.loads((self.root / "query/receipt.json").read_bytes())
        pair = json.loads((self.root / "save/pair.json").read_bytes())
        save_receipt = pair["artifacts"]["candidate"]
        candidate = json.loads((self.root / "candidate.json").read_bytes())
        require(query_receipt["source_sha"] == pair["candidate"] == save_receipt["service_source"]["commit"]
                == candidate["source_sha"] == self.input["source_sha"] and pair["status"] == "PASS"
                and candidate["candidate_digest"] == self.input["candidate_digest"], "CANDIDATE_SOURCE_BINDING")
        for label, record, name in (("query", query_receipt, "kernel-manifest.json"), ("save", save_receipt, "service-manifest.json")):
            require(record["release_ready"] is False and sha(self.root / label / "archive.tar.zst") == record["sha256"]
                    and sha(self.root / label / name) == record["manifest_sha256"], "ARCHIVE_RECEIPT_BINDING")
        owner = self
        class CRM(BaseHTTPRequestHandler):
            def do_GET(self):
                valid = self.path == "/api/v1/auth/me" and self.headers.get("Authorization") == "Bearer " + owner.token
                status = 200 if valid and owner.identity["enabled"] else 401
                data = json.dumps({"username": owner.identity["username"], "is_admin": owner.identity["admin"]} if status == 200 else {}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_):
                pass

        with socket.socket() as check:
            check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            check.bind(("127.0.0.1", 4335))  # A busy port fails; never stop its owner.
        self.runtimes = {label: self.install(label) for label in ("query", "save")}
        contract = "backend/contracts/analytics_first_purchase_source.py"
        require(sha(self.runtimes["query"]["app"] / contract) == sha(self.runtimes["save"]["app"] / contract), "SOURCE_CONTRACT_MISMATCH")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), CRM)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.crm_origin = "http://127.0.0.1:" + str(self.server.server_port)
        query_state, save_state = self.state("query-owner"), self.state("save-owner")
        query = self.start("query", query_state, "query-initial")
        self.start("save", save_state, "save-initial")
        self.observed("independent-http-owner-and-physical-query-worker", worker_pid=query["worker_pid"])
        payload = {"schema_version": "first-purchase-source-request/v1", "run_id": query["run_id"], "capability": "analysis:save"}
        source = self.request("query", "/sources/resolve", 200, payload)
        require(source["owner_id"] == "crm-owner" and source["evidence_digest"] == query["evidence_digest"], "SOURCE_BINDING")
        self.request("query", "/sources/resolve", 401, payload, authorized=False)
        self.request("query", "/sources/resolve", 422, {**payload, "owner_id": "crm-owner"})
        self.identity["admin"] = False
        self.request("query", "/sources/resolve", 403, payload)
        self.identity["admin"] = True
        self.observed("source-authentication-schema-and-permission")
        identity = {"schema_version": "analytics-first-purchase-save-identity/v1", "action_id": "target-save",
                    "candidate_digest": self.input["candidate_digest"], "correlation_id": "target-correlation"}
        save = {"schema_version": "analytics-first-purchase-save-command/v1", "identity": identity,
                "created_from_run_id": query["run_id"], "title": "WSL synthetic source HTTP", "evidence_digest": query["evidence_digest"]}
        inspected = self.request("save", "/save-results/inspect", 200,
            {"schema_version": "analytics-first-purchase-save-inspect/v1", "identity": identity, "created_from_run_id": query["run_id"]})
        require(inspected["save_eligible"] and inspected["provenance"]["freshness"]["freshness_state"] == "NOT_CHECKED", "SAVE_ADMISSION")
        saved = self.request("save", "/save-receipts", 201, save)
        require(saved["status"] == "SAVED" and self.request("save", "/save-receipts", 201, save) == saved, "SAVE_IDEMPOTENCE")
        self.request("save", "/save-receipts", 409, {**save, "title": "conflicting retry"})
        self.observed("http-save-no-age-policy-idempotency-and-conflict")
        require(self.stop("query") in (0, -signal.SIGTERM), "QUERY_CLEAN_EXIT")
        require(self.stop("save", crash=True) == -signal.SIGKILL, "SAVE_CRASH_EXIT")
        self.start("save", save_state, "save-after-crash")
        require(self.request("save", "/save-receipts/reconcile", 200, identity) == saved
                and self.request("save", "/save-receipts", 201, save) == saved, "OFFLINE_REPLAY")
        self.observed("query-offline-save-sigkill-and-durable-replay")
        new_identity = {**identity, "action_id": "another-action"}
        require(self.request("save", "/save-receipts/reconcile", 200, new_identity)["status"] == "SAVE_UNKNOWN", "UNKNOWN")
        require(self.request("save", "/save-receipts", 503, {**save, "identity": new_identity})["error"]["code"] == "SOURCE_UNAVAILABLE", "OFFLINE_NEW_SAVE")
        self.identity["admin"] = False
        self.request("save", "/save-receipts", 403, save)
        self.identity["admin"] = True
        require(len(self.request("save", "/analyses", 200)["items"]) == 1, "DUPLICATE_ANALYSIS")
        require(self.stop("save") in (0, -signal.SIGTERM), "SAVE_CLEAN_EXIT")
        self.observed("unknown-new-save-fail-closed-and-live-revocation")
        restored = self.state("restored-save-owner")
        db = "analyses/first_purchase_analyses.sqlite3"
        before = sha(save_state / db)
        original, backup = sqlite3.connect((save_state / db).as_uri() + "?mode=ro", uri=True), sqlite3.connect(restored / db)
        try:
            original.backup(backup)
        finally:
            original.close()
            backup.close()
        require(sha(save_state / db) == before, "BACKUP_CHANGED_SOURCE")
        self.start("save", restored, "save-cold-restore")
        require(self.request("save", "/save-receipts/reconcile", 200, identity) == saved
                and self.request("save", "/save-receipts", 201, save) == saved
                and len(self.request("save", "/analyses", 200)["items"]) == 1, "RESTORED_REPLAY")
        require(self.stop("save") in (0, -signal.SIGTERM), "RESTORED_EXIT")
        self.observed("synthetic-backup-cold-restore-without-query")
        replay = self.start("query", query_state, "query-restart")
        require(replay["run_id"] == query["run_id"] and replay["worker_pid"] == query["worker_pid"]
                and self.request("query", "/sources/resolve", 200, payload) == source, "QUERY_RESTART_REPLAY")
        require(self.stop("query") in (0, -signal.SIGTERM), "QUERY_REPLAY_EXIT")
        self.observed("query-restart-reuses-run-and-exited-worker")
        for label, runtime in self.runtimes.items():
            if label == "save":
                self.command([runtime["python"], "-I", "-B", str(runtime["app"] / "service.py"), "check"], "save-final-integrity")
            else:
                runpy.run_path(str(self.root / "helpers/first-purchase-kernel.probe.py"))["verify"](runtime["app"], runtime["manifest"])
        verify_inputs(self.root, self.expected)
        self.observed("input-and-installed-artifact-integrity")

    def run(self):
        def interrupted(*_):
            raise RuntimeError("OWNED_DRILL_INTERRUPTED")
        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        try:
            self.execute()
            self.report["status"] = "PASS"
        except Exception as error:
            self.report.update(status="FAIL", error=(type(error).__name__ + ":" + str(error)).replace(self.token, "[REDACTED]")[:300])
        finally:
            errors = []
            for label in list(self.active):
                try:
                    self.stop(label)
                except Exception as error:
                    errors.append(type(error).__name__)
            if self.server:
                self.server.shutdown()
                self.server.server_close()
                self.thread.join(5)
                if self.thread.is_alive():
                    errors.append("CRM_THREAD_ALIVE")
            self.report["processes"] = self.processes
            if not all(row["stopped"] for row in self.processes):
                errors.append("CHILD_NOT_REAPED")
            require(self.temp.parent == self.root.parent and self.temp.name.startswith("source-http-owned-"), "TEMP_OWNER")
            if not errors:
                shutil.rmtree(self.temp)
            self.report["cleanup"] = "OWNED_PROCESSES_AND_INSTALLS_REMOVED" if not errors else errors
            if errors:
                self.report["status"] = "FAIL"
            dump(self.out / "receipt.json", self.report)
        print(json.dumps({"status": self.report["status"], "checks": len(self.report["observations"]), "release_ready": False}), flush=True)
        return 0 if self.report["status"] == "PASS" else 2


if __name__ == "__main__":
    os.umask(0o077)
    require(sys.flags.isolated and not sys.flags.optimize, "ISOLATED_UNOPTIMIZED_REQUIRED")
    if sys.argv[1] == "query":
        query_child(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4], sys.argv[5], Path(sys.argv[6]))
    else:
        require(sys.argv[1] in {"run-wsl", "run-local"} and len(sys.argv) == 4, "EXPLICIT_DRILL_MODE")
        sys.exit(Drill(Path(sys.argv[2]), sys.argv[3], sys.argv[1] == "run-local").run())
