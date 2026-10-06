"""Own one query process; all application/worker imports come from its artifact."""
import json
import os
from pathlib import Path
import select
import subprocess

from backend.contracts.analytics_first_purchase_kernel import FirstPurchaseKernelSnapshot

ROOT = Path(__file__).resolve().parents[2]


class PackedFirstPurchaseKernel:
    def __init__(self, specification, state, digest, config):
        self.spec, self.state, self.digest, self.config = specification, state, digest, config
        self.path = state / "state/runs.sqlite3"
        self.output = state / "kernel-processes"
        self.output.mkdir(mode=0o700)
        self.process = self.error_log = None
        self.receipts = []
        self.origin = "http://127.0.0.1:4335"

    def receive(self):
        assert select.select([self.process.stdout], [], [], 20)[0], "HOST_KERNEL_PIPE_TIMEOUT"
        raw = self.process.stdout.readline(1024 * 1024 + 1)
        assert raw and len(raw) <= 1024 * 1024, "HOST_KERNEL_PIPE_FAILED"
        return json.loads(raw)

    def call(self, operation, **kwargs):
        self.process.stdin.write(json.dumps({"op": operation, **kwargs}) + "\n")
        self.process.stdin.flush()
        reply = self.receive()
        assert reply["ok"] is True
        return reply["value"]

    def start(self):
        self.call("start")

    def tick(self):
        self.call("tick")

    def get(self, principal, run_id):
        assert principal.actor_id == "crm-owner"
        return FirstPurchaseKernelSnapshot.model_validate(self.call("get", run_id=run_id))

    def worker_records(self, *, active_only=True):
        return self.call("workers", active_only=active_only)

    def launch(self):
        assert self.process is None
        self.error_log = (self.output / f"kernel-{len(self.receipts)}.stderr").open("x")
        try:
            python = self.spec["python"]
            self.process = subprocess.Popen([python, "-I", "-B", str(ROOT / "scripts/dsh-b0/first-purchase-kernel.probe.py"),
                self.spec["app"], str(self.state), self.digest, self.spec["manifest_sha256"]],
                cwd=self.state, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.error_log, text=True,
                env={"PATH": str(Path(python).parent) + os.pathsep + "/usr/bin:/bin", "HOME": str(self.state),
                     "TMPDIR": str(self.state), "PYTHONPATH": "/repository-not-available", "PYTHON_DOTENV_DISABLED": "1"})
            self.process.stdin.write(json.dumps(self.config) + "\n")
            self.process.stdin.flush()
            receipt = self.receive()
            assert receipt["status"] == "KERNEL_SOCKET_BOUND" and receipt["pid"] == self.process.pid
            assert receipt["manifest_sha256"] == self.spec["manifest_sha256"] and receipt["port"] == 4335
            assert receipt["worker_root"] == self.spec["app"] and receipt["python"] == python
            self.receipts.append(receipt)
            return self.origin
        except BaseException:
            self.close()
            raise

    def close(self):
        process = self.process
        if process is None:
            if self.error_log is not None:
                self.error_log.close()
                self.error_log = None
            return
        forced = False
        stopped = None
        try:
            # Closing the private pipe also works when bootstrap failed before handshake.
            try:
                process.stdin.close()
            except BrokenPipeError:
                pass
            try:
                stopped = self.receive()
            except (AssertionError, ValueError):
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                forced = True
                process.kill()
                process.wait(timeout=5)
            if not self.receipts or self.receipts[-1]["pid"] != process.pid:
                self.receipts.append({"pid": process.pid, "status": "START_FAILED"})
            self.receipts[-1].update(exit_code=process.returncode, forced_kill=forced, stopped=stopped,
                cleanup_ok=not forced and process.returncode == 0 and bool(stopped) and stopped.get("status") == "KERNEL_STOPPED")
        finally:
            process.stdout.close()
            self.error_log.close()
            self.process = self.error_log = None
            (self.output / "processes.json").write_text(json.dumps(self.receipts, indent=2) + "\n")

    def restart(self):
        self.close()
        assert self.receipts[-1]["cleanup_ok"], "HOST_KERNEL_CLEANUP_FAILED"
        self.launch()
        self.start()
        self.tick()

    def __enter__(self):
        return self.launch()

    def __exit__(self, exception_type, *_):
        self.close()
        if exception_type is None:
            assert all(row["cleanup_ok"] for row in self.receipts), "HOST_KERNEL_CLEANUP_FAILED"
