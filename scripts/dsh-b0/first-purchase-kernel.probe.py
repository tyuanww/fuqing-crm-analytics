"""Test-only private-pipe driver for an independently installed query artifact.

HTTP is the real shipped API; pipe operations only drive the existing dispatcher
and read observations. No test endpoint is installed in the application.
"""
import hashlib
import importlib.abc
import json
import os
from pathlib import Path
import re
import socket
import sys
import threading
from time import monotonic, sleep

sys.dont_write_bytecode = True


def emit(value):
    print(json.dumps(value, allow_nan=False), flush=True)


def verify(source, expected):
    raw = (source / "kernel-manifest.json").read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected, "HOST_KERNEL_MANIFEST_CHANGED"
    manifest = json.loads(raw)
    assert manifest["scope"] == "synthetic-composition-only" and manifest["release_ready"] is False
    actual = set()
    for path in source.rglob("*"):
        assert not path.is_symlink(), "HOST_KERNEL_SYMLINK"
        if path.is_file():
            actual.add(path.relative_to(source).as_posix())
    assert actual == set(manifest["files"]) | {"kernel-manifest.json"}
    for name, row in manifest["files"].items():
        assert name.startswith("backend/") and all(p not in ("", ".", "..") for p in name.split("/"))
        assert (source / name).stat().st_size == row["bytes"] <= 2 * 1024 * 1024
        data = (source / name).read_bytes()
        assert len(data) == row["bytes"] and hashlib.sha256(data).hexdigest() == row["sha256"]
    return manifest


class DenyLegacy(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if any(fullname == name or fullname.startswith(name + ".") for name in
               ("backend.main", "backend.config", "backend.routers", "backend.tests", "dotenv", "httpx")):
            raise ImportError("HOST_KERNEL_UNDECLARED_IMPORT " + fullname)


def main():
    source_arg, state_arg, digest, expected = sys.argv[1:]
    source, state = Path(source_arg), Path(state_arg)
    assert sys.flags.isolated and sys.version_info[:2] == (3, 14)
    assert source.is_absolute() and state.is_absolute() and not source.is_symlink() and not state.is_symlink()
    source, state = source.resolve(strict=True), state.resolve(strict=True)
    assert not state.is_relative_to(source)
    assert (state / ".owned-first-purchase-host").read_text() == "owned-synthetic-host/v1\n" + digest + "\n"
    manifest = verify(source, expected)
    config = json.loads(sys.stdin.buffer.readline(65537))
    source_http = "source_contract" in config
    assert set(config) == {"state_dir", "runtime_token", "gateway_token", "session_id", "snapshot",
                           "method_package_digest", "identity_mode", "port_base"} | (
                               {"source_contract", "crm_origin"} if source_http else set())
    assert Path(config["state_dir"]).resolve(strict=True) == state / "state"
    assert config["identity_mode"] == "crm-session" and config["port_base"] == 4335
    sys.meta_path.insert(0, DenyLegacy())
    sys.path.insert(0, str(source))
    import uvicorn
    from backend.analytics_first_purchase_native import create_first_purchase_native_app
    from backend.services.analytics.access import AnalyticsPrincipal
    from backend.services.analytics import worker
    assert worker.REPO_ROOT == source, "HOST_KERNEL_WORKER_SOURCE"
    identities = None
    if source_http:
        assert config["source_contract"] == "first-purchase-frozen-source/v1"
        assert re.fullmatch(r"http://127\.0\.0\.1:[1-9][0-9]{0,4}", config["crm_origin"])
        from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
        identities = CRMFirstPurchaseIdentityResolver(config["crm_origin"], frozenset({"crm-owner"}), allow_query=True)
    app = create_first_purchase_native_app(config, **({"source_identities": identities} if source_http else {}))
    store, dispatcher = app.state.store, app.state.dispatcher
    principal = AnalyticsPrincipal("crm-owner", frozenset({"run:create", "run:read", "run:cancel"}),
                                   frozenset({"first-purchase-fixture"}))
    events = []
    def observe(point, payload):
        if point in {"worker:spawned", "worker:exited"}:
            # No tokens, fixture payload, or client request are persisted here.
            events.append({"event": point, "pid": payload["pid"],
                           **({"exit_code": payload["exit_code"]} if "exit_code" in payload else {})})
    app.state.workers.fault_hook = observe
    def origins():
        modules = {name: Path(module.__file__).resolve() for name, module in list(sys.modules.items())
                   if (name == "backend" or name.startswith("backend.")) and getattr(module, "__file__", None)}
        assert modules and all(path.is_relative_to(source) for path in modules.values())
        return {name: path.relative_to(source).as_posix() for name, path in sorted(modules.items())}
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", 4335))
        sock.listen(64)
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False, lifespan="off"))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]})
        thread.start()
        try:
            deadline = monotonic() + 5
            while not server.started:
                assert thread.is_alive() and monotonic() < deadline, "HOST_KERNEL_HTTP_NOT_READY"
                sleep(0.01)
            emit({"status": "KERNEL_SOCKET_BOUND", "pid": os.getpid(), "port": 4335,
                  "manifest_sha256": expected, "source_sha": manifest["source_sha"], "imports": origins(),
                  **({"source_contract": config["source_contract"]} if source_http else {}),
                  "worker_root": str(worker.REPO_ROOT), "python": sys.executable, "release_ready": False})
            for line in sys.stdin.buffer:
                assert len(line) <= 4096, "HOST_KERNEL_PIPE_LIMIT"
                command = json.loads(line)
                assert isinstance(command, dict) and set(command) <= {"op", "run_id", "active_only"}
                operation = command["op"]
                if operation == "start":
                    dispatcher.start()
                    value = None
                elif operation == "tick":
                    dispatcher.tick()
                    value = None
                elif operation == "get":
                    value = store.get(principal, command["run_id"]).model_dump(mode="json")
                elif operation == "workers":
                    value = store.worker_records(active_only=command.get("active_only", True))
                elif operation == "stop":
                    break
                else:
                    raise ValueError("HOST_KERNEL_PIPE_OPERATION")
                emit({"ok": True, "value": value})
        finally:
            server.should_exit = True
            thread.join(10)
            dispatcher.close()
            assert not thread.is_alive(), "HOST_KERNEL_HTTP_CLEANUP"
            assert not store.worker_records(), "HOST_KERNEL_ACTIVE_WORKER"
            verify(source, expected)
            emit({"status": "KERNEL_STOPPED", "pid": os.getpid(), "imports": origins(), "workers": events,
                  "active_workers": 0, "integrity": "PASS"})


if __name__ == "__main__":
    main()
