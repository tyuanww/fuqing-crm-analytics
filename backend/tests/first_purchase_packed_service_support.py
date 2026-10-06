"""Owned saved-analysis process for the explicit artifact/official-host drill."""
import json
import os
from pathlib import Path
import select
import signal
import subprocess
from time import monotonic, sleep

import httpx

ROOT = Path(__file__).resolve().parents[2]


class PackedFirstPurchaseService:
    def __init__(self, specification, state, candidate_digest, crm_origin):
        self.spec = specification
        self.state = state
        self.digest = candidate_digest
        self.crm_origin = crm_origin
        self.path = state / "analyses/first_purchase_analyses.sqlite3"
        self.output = state / "service-processes"
        self.output.mkdir(mode=0o700)
        with (state / ".owned-first-purchase-host").open("x") as handle:
            handle.write("owned-synthetic-host/v1\n" + candidate_digest + "\n")
        self.process = self.error_log = None
        self.receipts = []
        self.port = 0

    def start(self):
        assert self.process is None
        index = len(self.receipts)
        self.error_log = (self.output / f"service-{index}.stderr").open("x")
        try:
            python = self.spec["python"]
            self.process = subprocess.Popen([python, "-I", "-B", str(ROOT / "scripts/dsh-b0/first-purchase-service.probe.py"),
                self.spec["app"], str(self.state), self.digest, self.spec["manifest_sha256"], str(self.port)],
                cwd=self.state, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.error_log, text=True,
                env={"PATH": str(Path(python).parent) + os.pathsep + "/usr/bin:/bin", "HOME": str(self.state),
                     "TMPDIR": str(self.state), "PYTHONPATH": "/repository-not-available", "PYTHON_DOTENV_DISABLED": "1"})
            self.process.stdin.write(json.dumps({"crm_origin": self.crm_origin,
                "query_runtime": self.spec.get("query_runtime", "workspace-synthetic-kernel")}))
            self.process.stdin.close()
            assert select.select([self.process.stdout], [], [], 20)[0], "HOST_SERVICE_START_TIMEOUT"
            line = self.process.stdout.readline(65537)
            assert line and len(line) < 65537, "HOST_SERVICE_START_FAILED"
            receipt = json.loads(line)
            assert receipt["status"] == "SERVICE_SOCKET_BOUND"
            assert receipt["manifest_sha256"] == self.spec["manifest_sha256"]
            assert receipt["candidate_digest"] == self.digest and receipt["pid"] == self.process.pid
            assert type(receipt["port"]) is int and 0 < receipt["port"] <= 65535
            assert not self.port or receipt["port"] == self.port
            self.port = receipt["port"]
            self.origin = f"http://127.0.0.1:{self.port}"
            self.receipts.append(receipt)
            deadline = monotonic() + 5
            with httpx.Client(trust_env=False, timeout=0.5) as client:
                while True:
                    try:
                        if client.get(self.origin + "/api/v1/analytics-first-purchase/analyses").status_code == 401:
                            return self
                    except httpx.TransportError:
                        pass
                    assert monotonic() < deadline, "HOST_SERVICE_HTTP_NOT_READY"
                    sleep(0.02)
        except BaseException:
            self.stop()
            raise

    def stop(self):
        process = self.process
        forced = False
        try:
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    forced = True
                    process.kill()
                    process.wait(timeout=5)
                if not process.stdin.closed:
                    process.stdin.close()
                process.stdout.close()
                if not self.receipts or self.receipts[-1]["pid"] != process.pid:
                    self.receipts.append({"pid": process.pid, "status": "START_FAILED"})
                self.receipts[-1].update(exit_code=process.returncode, forced_kill=forced, process_exited=True,
                    cleanup_ok=not forced and process.returncode in (0, -signal.SIGTERM))
        finally:
            if self.error_log is not None:
                self.error_log.close()
            self.process = self.error_log = None
            (self.output / "processes.json").write_text(json.dumps(self.receipts, indent=2) + "\n")

    def restart(self):
        self.stop()
        assert self.receipts[-1]["cleanup_ok"], "HOST_SERVICE_CLEANUP_FAILED"
        return self.start()

    def __enter__(self):
        return self.start()

    def __exit__(self, exception_type, *_):
        self.stop()
        if exception_type is None:
            assert self.receipts and all(row["cleanup_ok"] for row in self.receipts), "HOST_SERVICE_CLEANUP_FAILED"
