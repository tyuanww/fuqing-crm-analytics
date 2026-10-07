#!/usr/bin/env python3
"""Bounded synthetic target observer for immutable metrics/knowledge archives.

The operator supplies isolated, read-only inputs and a fresh owned workspace.
This is an observation runner, not a production installer or admission gate.
It reuses secure-unpack.py, service-runtime.fixture.py and packaged service.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

DOMAINS = ("metrics", "knowledge")
MAX_FILE = 128 * 1024 * 1024
QUERY = {
    "source_id": "synthetic-crm-metrics", "contains_real_data": False,
    "metric_version": "crm-metrics/v1", "query_id": "sales_window_summary",
    "period_start": "2026-09-01", "period_end_exclusive": "2026-10-01",
    "refund_view": "ORDER_COHORT_AS_OF", "refund_as_of": "2026-09-21T00:00:00+08:00",
    "data_through": "2026-09-21T00:00:00+08:00",
}


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def digest(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_size <= MAX_FILE, "INPUT_FILE_INVALID")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n")


def verify_inputs(root, expected):
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), "INPUT_ROOT_INVALID")
    require(re.fullmatch(r"[0-9a-f]{64}", expected), "INPUT_DIGEST_INVALID")
    require(digest(root / "input-manifest.json") == expected, "INPUT_MANIFEST_DIGEST")
    manifest = json.loads((root / "input-manifest.json").read_text())
    require(manifest["scope"] == "crm-services-synthetic-target/v1" and manifest["release_ready"] is False,
            "INPUT_SCOPE")
    expected_files = manifest["files"]
    require(1 <= len(expected_files) <= 100, "INPUT_COUNT")
    actual = {}
    total = 0
    for path in root.rglob("*"):
        info = path.lstat()
        require(not stat.S_ISLNK(info.st_mode), "INPUT_LINK")
        if stat.S_ISDIR(info.st_mode):
            continue
        rel = path.relative_to(root).as_posix()
        if rel == "input-manifest.json":
            continue
        require(rel in expected_files, "INPUT_EXTRA")
        total += info.st_size
        require(total <= 256 * 1024 * 1024, "INPUT_BYTES")
        actual[rel] = {"bytes": info.st_size, "sha256": digest(path)}
        require(actual[rel] == expected_files[rel], "INPUT_DIGEST")
    require(set(actual) == set(expected_files), "INPUT_MISSING")
    return manifest


def wheel_inventory(directory, provenance, dependencies):
    """Reject extra files before the existing offline installer checks metadata."""
    require(set(provenance) == set(dependencies), "WHEEL_CLOSURE")
    expected = set()
    for name, row in provenance.items():
        filename = row["file"]
        require(Path(filename).name == filename and filename.endswith(".whl"), "WHEEL_NAME")
        require(row["version"] == dependencies[name], "WHEEL_VERSION")
        require(filename not in expected, "WHEEL_DUPLICATE")
        expected.add(filename)
        path = directory / filename
        require(path.stat().st_size == row["bytes"] and digest(path) == row["sha256"], "WHEEL_DIGEST")
    require({p.name for p in directory.iterdir()} == expected, "WHEEL_EXTRA_OR_MISSING")
    return provenance


def snapshot(root):
    result = {}
    for path in root.rglob("*"):
        info = path.lstat()
        rel = path.relative_to(root).as_posix()
        if stat.S_ISLNK(info.st_mode):
            result[rel] = {"link": os.readlink(path)}
        elif stat.S_ISDIR(info.st_mode):
            result[rel] = {"directory": True}
        else:
            result[rel] = {"bytes": info.st_size, "sha256": digest(path)}
        require(len(result) <= 20000, "INSTALL_ENTRY_LIMIT")
    return result


def stop_owned(process, grace=5):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
    require(process.poll() is not None, "PROCESS_NOT_REAPED")
    return {"pid": process.pid, "returncode": process.returncode, "reaped": True}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise RuntimeError("HTTP_REDIRECT_REJECTED")


def service_guard_program():
    return """import sys;sys.dont_write_bytecode=True
import atexit,importlib.abc,importlib.util,json,runpy
blocked=json.loads(sys.argv[1]); report=sys.argv[2]; attempts=[]
if 'duckdb' in blocked:
 assert importlib.util.find_spec('duckdb') is None and importlib.util.find_spec('_duckdb') is None
class Guard(importlib.abc.MetaPathFinder):
 def find_spec(self,fullname,path=None,target=None):
  if any(fullname==n or fullname.startswith(n+'.') for n in blocked):
   attempts.append(fullname);persist('blocked-attempt');raise ImportError('UNDECLARED_SERVICE_DEPENDENCY')
sys.meta_path.insert(0,Guard())
initial_loaded=[n for n in sys.modules if any(n==b or n.startswith(b+'.') for b in blocked)]
def persist(phase):
 with open(report,'w') as f:json.dump({'guard_installed':True,'blocked':blocked,'attempts':attempts,'loaded_at_guard_install':initial_loaded,'loaded_at_last_snapshot':[n for n in sys.modules if any(n==b or n.startswith(b+'.') for b in blocked)],'snapshot_phase':phase,'final_snapshot':phase=='normal-exit'},f)
atexit.register(persist,'normal-exit')
# SIGTERM may be re-raised by uvicorn without running atexit. Persist the
# installed guard before application imports; every forbidden attempt updates it.
persist('guard-installed')
sys.argv=sys.argv[3:]
runpy.run_path(sys.argv[0],run_name='__main__')"""


class Observer:
    def __init__(self, inputs, output, expected):
        self.inputs, self.output, self.expected = inputs, output, expected
        self.processes, self.observations = [], []
        self.environment = {"PATH": str(Path(sys.executable).parent) + ":/usr/bin:/bin",
                            "HOME": str(output), "TMPDIR": str(output / "tmp"),
                            "PYTHONDONTWRITEBYTECODE": "1", "PYTHON_DOTENV_DISABLED": "1",
                            "PYTHONNOUSERSITE": "1", "PIP_CONFIG_FILE": "/dev/null"}
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def observe(self, name, value=True):
        self.observations.append({"name": name, "status": "PASS", "value": value})
        dump(self.output / "progress.json", {"observations": self.observations, "release_ready": False})
        print(json.dumps({"observation": name, "status": "PASS"}), flush=True)

    def command(self, name, argv, timeout=90):
        dump(self.output / (name + ".command.json"), {"argv": argv, "cwd": str(self.output), "timeout": timeout})
        with (self.output / (name + ".stdout")).open("w") as out, (self.output / (name + ".stderr")).open("w") as err:
            process = subprocess.Popen(argv, cwd=self.output, env=self.environment, stdout=out, stderr=err,
                                       start_new_session=True)
            try:
                process.wait(timeout=timeout)
            finally:
                if process.poll() is None:
                    stop_owned(process)
        require(process.returncode == 0, "COMMAND_FAILED_" + name)
        path = self.output / (name + ".stdout")
        require(path.stat().st_size <= 1024 * 1024, "COMMAND_OUTPUT_LIMIT")
        return json.loads(path.read_text())

    def install(self):
        require(not self.output.exists(), "OUTPUT_EXISTS")
        self.output.mkdir(mode=0o700)
        (self.output / "tmp").mkdir(mode=0o700)
        records = {}
        for domain in DOMAINS:
            source = self.inputs / domain
            receipt = json.loads((source / "candidate-receipt.json").read_text())
            manifest = json.loads((source / "service-manifest.json").read_text())
            require(receipt["domain"] == manifest["domain"] == domain, "SERVICE_DOMAIN")
            archive = receipt["artifact"]
            require(Path(archive).name == archive and archive.endswith(".tar.zst"), "ARCHIVE_NAME")
            require(digest(source / archive) == receipt["sha256"], "ARCHIVE_DIGEST")
            require(digest(source / "service-manifest.json") == receipt["manifest_sha256"], "MANIFEST_DIGEST")
            deps = manifest["dependencies"]
            require(len(deps) == (14 if domain == "metrics" else 13), "DEPENDENCY_COUNT")
            require(("duckdb" in deps) == (domain == "metrics"), "DEPENDENCY_BOUNDARY")
            wheels = wheel_inventory(source / "wheels", json.loads((source / "wheel-provenance.json").read_text()), deps)
            app = self.output / (domain + "-app")
            self.command(domain + "-unpack", [sys.executable, "-I", str(self.inputs / "helpers/secure-unpack.py"),
                         str(source / archive), str(app), "--max-entries", "100", "--max-bytes", "8388608"])
            require(digest(app / "service-manifest.json") == receipt["manifest_sha256"], "UNPACKED_MANIFEST_DIGEST")
            runtime = self.command(domain + "-install", [sys.executable, "-I",
                str(self.inputs / "helpers/service-runtime.fixture.py"), str(app / "service-manifest.json"),
                str(self.output / (domain + "-venv")), "--wheelhouse", str(source / "wheels")])
            require(runtime["mode"] == "offline-hashed-wheel-install", "COLD_INSTALL_MODE")
            require(runtime["wheels"] == {n: {k: row[k] for k in ("file", "version", "sha256")} for n, row in wheels.items()},
                    "INSTALL_WHEEL_DRIFT")
            python = runtime["python"]
            inventory = self.command(domain + "-dependencies", [python, "-I", "-c",
                "import sys;sys.dont_write_bytecode=True;import importlib.metadata as m,json,re;"
                "print(json.dumps({re.sub(r'[-_.]+','-',d.metadata['Name'].lower()):d.version for d in m.distributions()}))"])
            require(inventory == deps, "INSTALLED_DEPENDENCY_CLOSURE")
            checked = self.command(domain + "-check", [python, "-I", str(app / "service.py"), "check"])
            require(checked["status"] == "SERVICE_PACKAGE_CHECK_PASS" and checked["manifest_sha256"] == receipt["manifest_sha256"],
                    "SERVICE_CHECK")
            records[domain] = {"python": python, "app": str(app), "dependencies": inventory,
                               "archive_sha256": receipt["sha256"], "manifest_sha256": receipt["manifest_sha256"],
                               "app_inventory": snapshot(app), "venv_inventory": snapshot(self.output / (domain + "-venv"))}
            self.observe(domain + "-cold-install-check", {"dependency_count": len(inventory), "archive": receipt["sha256"]})
        verify_inputs(self.inputs, self.expected)
        dump(self.output / "install-receipt.json", {"input_sha256": self.expected, "services": records, "release_ready": False})

    def start(self, domain, records, label):
        row = records[domain]
        blocked = ["backend.main", "backend.config", "backend.contracts.schemas", "backend.services.analytics",
                   "backend.analytics_app", "backend.analytics_first_purchase_analysis_app", "dotenv", "bcrypt", "httpx"]
        if domain == "knowledge":
            blocked += ["duckdb", "_duckdb", "backend.semantic", "backend.services.crm_readonly", "backend.crm_metrics_app"]
        else:
            blocked += ["backend.services.crm_knowledge", "backend.crm_knowledge_app"]
        imports_path = self.output / (label + "-imports.json")
        guard = service_guard_program()
        stdout = (self.output / (label + ".stdout")).open("w")
        stderr = (self.output / (label + ".stderr")).open("w")
        try:
            process = subprocess.Popen([row["python"], "-I", "-c", guard, json.dumps(blocked), str(imports_path),
                str(Path(row["app"]) / "service.py"), "serve", "--port", "0"], cwd=self.output, env=self.environment,
                stdout=stdout, stderr=stderr, start_new_session=True)
        finally:
            stdout.close()
            stderr.close()
        self.processes.append((label, process))
        deadline = time.monotonic() + 12
        receipt = None
        while time.monotonic() < deadline:
            require(process.poll() is None, "SERVICE_EARLY_EXIT_" + label)
            raw = (self.output / (label + ".stdout")).read_text()
            require(len(raw) <= 8192, "SERVICE_START_OUTPUT_LIMIT")
            if "\n" in raw:
                receipt = json.loads(raw.splitlines()[0])
                break
            time.sleep(0.05)
        require(receipt and receipt["status"] == "SERVICE_SOCKET_BOUND" and 1 <= receipt["port"] <= 65535,
                "SERVICE_START_TIMEOUT")
        require(receipt["manifest_sha256"] == row["manifest_sha256"], "SERVICE_IDENTITY")
        service = {"domain": domain, "process": process, "origin": "http://127.0.0.1:" + str(receipt["port"])}
        while time.monotonic() < deadline:
            try:
                self.request(service, "capabilities", 200)
                return service
            except (OSError, urllib.error.URLError):
                time.sleep(0.05)
        raise RuntimeError("SERVICE_NOT_READY")

    def request(self, service, path, expected, body=None, contract=True, origin=False):
        headers = {"Content-Type": "application/json"}
        if contract:
            headers["X-ShineMage-Contract"] = "crm-" + service["domain"] + "-service/1.0.0"
        if origin:
            headers["Origin"] = "https://synthetic.invalid"
        suffix = "/openapi.json" if path == "openapi" else "/api/v1/crm-" + service["domain"] + "/" + path
        request = urllib.request.Request(service["origin"] + suffix, headers=headers,
            data=None if body is None else json.dumps(body).encode())
        try:
            response = self.opener.open(request, timeout=4)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            require(response.status == expected, "HTTP_STATUS_" + str(response.status))
            require(response.headers.get("X-ShineMage-Contract") == "crm-" + service["domain"] + "-service/1.0.0", "HTTP_IDENTITY")
            raw = response.read(1024 * 1024 + 1)
        require(len(raw) <= 1024 * 1024, "HTTP_SIZE")
        return json.loads(raw)

    def require_stopped(self, service):
        require(service["process"].poll() is not None, "SERVICE_NOT_STOPPED")
        try:
            self.request(service, "capabilities", 200)
        except (OSError, urllib.error.URLError):
            return
        raise RuntimeError("STOPPED_SERVICE_STILL_REACHABLE")

    def http(self):
        receipt = json.loads((self.output / "install-receipt.json").read_text())
        require(receipt["input_sha256"] == self.expected, "INSTALL_INPUT_IDENTITY")
        records = receipt["services"]
        services = {}
        for domain in DOMAINS:
            app = Path(records[domain]["app"])
            require(app == self.output / (domain + "-app"), "INSTALL_APP_PATH")
            require(records[domain]["python"] == str(self.output / (domain + "-venv/bin/python")), "INSTALL_PYTHON_PATH")
            require(bool(os.statvfs(app).f_flag & os.ST_RDONLY), "INSTALL_NOT_READONLY")
            require(bool(os.statvfs(self.output / (domain + "-venv")).f_flag & os.ST_RDONLY), "VENV_NOT_READONLY")
            require(snapshot(app) == records[domain]["app_inventory"], "INSTALL_PRE_DRIFT")
            services[domain] = self.start(domain, records, domain + "-first")
            capability = self.request(services[domain], "capabilities", 200)
            require(capability["owner"] == ("crm-service" if domain == "metrics" else "knowledge-service"), "CAPABILITY_OWNER")
            self.observe(domain + "-capabilities")
            require(self.request(services[domain], "capabilities", 409, contract=False)["code"] == "CONTRACT_MISMATCH", "HEADER_NOT_REJECTED")
            require(self.request(services[domain], "capabilities", 403, origin=True)["code"] == "ORIGIN_REJECTED", "ORIGIN_NOT_REJECTED")
            self.observe(domain + "-header-origin-rejection")
            require(self.request(services[domain], "openapi", 200) == json.loads((app / "openapi.json").read_text()), "OPENAPI_DRIFT")
            self.observe(domain + "-openapi")
        for query in ("sales_window_summary", "existing_customer_repurchase", "sample_followup"):
            result = self.request(services["metrics"], "query", 200, {**QUERY, "query_id": query})
            require(result["source_id"] == "synthetic-crm-metrics" and result["metric_version"] == "crm-metrics/v1" and result["facts"], "METRIC_RESULT")
            self.observe("metric-" + query, {"result_sha256": hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()})
        require(self.request(services["metrics"], "query", 400, {**QUERY, "contains_real_data": True})["code"] == "FORBIDDEN", "REAL_DATA_NOT_REJECTED")
        self.observe("real-data-rejected")
        explanation = self.request(services["knowledge"], "explain", 200, {"topic": "客单价"})
        require("D001" in explanation["decision_ids"] and explanation["implementation_verification_scope"] == "not_evaluated_in_service_package"
                and explanation["implementation_status"] != "synthetic_verified" and explanation["real_business_acceptance"] is False, "KNOWLEDGE_RESULT")
        self.observe("knowledge-explanation")
        stop_owned(services["metrics"]["process"])
        self.require_stopped(services["metrics"])
        require(services["knowledge"]["process"].poll() is None, "KNOWLEDGE_EXITED")
        require(self.request(services["knowledge"], "explain", 200, {"topic": "客单价"}) == explanation, "KNOWLEDGE_CHANGED")
        services["metrics"] = self.start("metrics", records, "metrics-restart")
        self.request(services["metrics"], "query", 200, QUERY)
        self.observe("metrics-stop-restart-knowledge-unaffected")
        stop_owned(services["knowledge"]["process"])
        self.require_stopped(services["knowledge"])
        require(services["metrics"]["process"].poll() is None, "METRICS_EXITED")
        self.request(services["metrics"], "query", 200, QUERY)
        services["knowledge"] = self.start("knowledge", records, "knowledge-restart")
        require(self.request(services["knowledge"], "explain", 200, {"topic": "客单价"}) == explanation, "RESTART_KNOWLEDGE_CHANGED")
        self.observe("knowledge-stop-restart-metrics-unaffected")
        for _label, process in self.processes:
            stop_owned(process)
        guard_records = []
        for label, _process in self.processes:
            guarded = json.loads((self.output / (label + "-imports.json")).read_text())
            require(guarded["guard_installed"] is True and not guarded["attempts"] and not guarded["loaded_at_guard_install"] and not guarded["loaded_at_last_snapshot"], "IMPORT_BOUNDARY")
            guard_records.append({"label": label, "snapshot_phase": guarded["snapshot_phase"], "final_snapshot": guarded["final_snapshot"]})
        self.observe("no-forbidden-imports", {"scope": "continuous import hook rejects declared prefixes in fixed service code; not arbitrary code isolation", "snapshots": guard_records})
        for domain in DOMAINS:
            row = records[domain]
            self.command(domain + "-post-check", [row["python"], "-I", str(Path(row["app"]) / "service.py"), "check"])
            require(snapshot(Path(row["app"])) == row["app_inventory"], "INSTALL_POST_DRIFT")
            require(snapshot(self.output / (domain + "-venv")) == row["venv_inventory"], "VENV_POST_DRIFT")
        verify_inputs(self.inputs, self.expected)
        self.observe("readonly-install-and-inputs-unchanged")

    def cleanup(self):
        records = [{"label": label, **stop_owned(process)} for label, process in self.processes]
        if self.output.exists():
            dump(self.output / "cleanup.json", {"processes": records, "all_reaped": all(r["reaped"] for r in records)})
        return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--input-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--phase", choices=("install", "http"), required=True)
    args = parser.parse_args()
    require(sys.version_info[:2] == (3, 14) and os.geteuid() != 0, "NONROOT_PYTHON314_REQUIRED")
    require(args.output.is_absolute() and not args.output.is_symlink(), "OUTPUT_PATH")
    require(args.input.resolve() != args.output.resolve() and not args.output.is_relative_to(args.input), "OUTPUT_OVERLAPS_INPUT")
    verify_inputs(args.input, args.input_sha256)
    observer = Observer(args.input, args.output, args.input_sha256)
    # Reject an existing install destination before cleanup/report writes.
    require(args.phase != "install" or not args.output.exists(), "OUTPUT_EXISTS")
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(RuntimeError("INTERRUPTED")))
    status, error = "FAIL", None
    try:
        getattr(observer, args.phase)()
        status = "PASS"
    except BaseException as failure:
        error = type(failure).__name__ + ":" + str(failure)
    finally:
        cleanup = observer.cleanup()
        if args.output.exists():
            dump(args.output / (args.phase + "-result.json"), {"status": status, "error": error,
                 "observations": observer.observations, "cleanup": cleanup, "input_sha256": args.input_sha256,
                 "release_ready": False, "activation": "NOT_RUN"})
    require(status == "PASS", "TARGET_" + args.phase.upper() + "_FAILED")


if __name__ == "__main__":
    main()
