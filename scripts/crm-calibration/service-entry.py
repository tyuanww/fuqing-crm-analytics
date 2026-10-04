#!/usr/bin/env python3
"""Verify and run one immutable, synthetic-only service application directory."""
from __future__ import annotations

import argparse
import hashlib
from importlib.metadata import PackageNotFoundError, version
import json
from pathlib import Path, PurePosixPath
import re
import socket
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
MAX_BYTES = 8 * 1024 * 1024
IDENTITIES = {
    "metrics": ("shinemage-crm-metrics-service", "crm-metrics-service", "crm-service", "synthetic_only"),
    "knowledge": ("shinemage-crm-knowledge-service", "crm-knowledge-service", "knowledge-service", "public_synthetic_pack_only"),
}


def fail(code: str):
    raise ValueError(code)


def relative_path(value):
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value:
        fail("SERVICE_PATH_INVALID")
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in {"", ".", ".."} for p in value.split("/")):
        fail("SERVICE_PATH_INVALID")
    return path


def verify():
    """Local integrity/readiness only. This is not signature or release approval."""
    if not sys.flags.isolated:
        fail("SERVICE_ISOLATED_PYTHON_REQUIRED")
    manifest_path = ROOT / "service-manifest.json"
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 256 * 1024:
        fail("SERVICE_MANIFEST_INVALID")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    required = {"schema_version", "domain", "name", "version", "api_version", "owner", "scope", "python", "dependencies", "files", "source", "release_ready"}
    if set(manifest) != required or manifest["schema_version"] != "shinemage-service-package/v1" or manifest["release_ready"] is not False:
        fail("SERVICE_MANIFEST_INVALID")
    domain = manifest["domain"]
    if domain not in IDENTITIES:
        fail("SERVICE_DOMAIN_INVALID")
    name, contract, owner, scope = IDENTITIES[domain]
    if (manifest["name"], manifest["owner"], manifest["scope"], manifest["api_version"]) != (name, owner, scope, "1.0.0"):
        fail("SERVICE_IDENTITY_MISMATCH")
    if not isinstance(manifest["version"], str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:rc\d+)?", manifest["version"]):
        fail("SERVICE_VERSION_INVALID")
    source = manifest["source"]
    if not isinstance(source, dict) or set(source) != {"commit", "worktree_dirty", "inputs_manifest", "inputs_sha256"}:
        fail("SERVICE_SOURCE_INVALID")
    if (not re.fullmatch(r"[0-9a-f]{40}", str(source["commit"]))
            or type(source["worktree_dirty"]) is not bool
            or source["inputs_manifest"] != f"services/crm-{domain}/package.json"
            or not re.fullmatch(r"[0-9a-f]{64}", str(source["inputs_sha256"]))):
        fail("SERVICE_SOURCE_INVALID")
    if manifest["python"] != "3.14" or sys.version_info[:2] != (3, 14):
        fail("SERVICE_PYTHON_MISMATCH")
    files = manifest["files"]
    if not isinstance(files, dict) or not 1 <= len(files) <= 100:
        fail("SERVICE_FILES_INVALID")
    if not {"service.py", "requirements.lock", "openapi.json", "backend/__init__.py", "backend/contracts/__init__.py", "backend/services/__init__.py"} <= files.keys():
        fail("SERVICE_FILES_INVALID")
    total = 0
    for rel, item in files.items():
        relative_path(rel)
        if not isinstance(item, dict) or set(item) != {"sha256", "bytes", "source", "role"}:
            fail("SERVICE_FILE_RECORD_INVALID")
        relative_path(item["source"])
        if item["role"] not in {"code", "resource", "bootstrap", "lock"} or not re.fullmatch(r"[0-9a-f]{64}", str(item["sha256"])):
            fail("SERVICE_FILE_RECORD_INVALID")
        if type(item["bytes"]) is not int or not 0 <= item["bytes"] <= 2 * 1024 * 1024:
            fail("SERVICE_SIZE_LIMIT")
        target = ROOT / rel
        if any(p.is_symlink() for p in [target, *target.parents] if p != ROOT and ROOT in p.parents):
            fail("SERVICE_LINK_REJECTED")
        if not target.is_file() or target.stat().st_size != item["bytes"]:
            fail("SERVICE_FILE_MISSING_OR_SIZE")
        total += item["bytes"]
        if total > MAX_BYTES:
            fail("SERVICE_SIZE_LIMIT")
        if hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
            fail("SERVICE_DIGEST_MISMATCH")
    actual = set()
    allowed_dirs = {parent.as_posix() for rel in files for parent in PurePosixPath(rel).parents}
    for path in ROOT.rglob("*"):
        if path.is_symlink():
            fail("SERVICE_LINK_REJECTED")
        if path.is_file():
            actual.add(path.relative_to(ROOT).as_posix())
            if len(actual) > 101:
                fail("SERVICE_UNDECLARED_FILE")
        elif not path.is_dir():
            fail("SERVICE_SPECIAL_FILE_REJECTED")
        elif path.relative_to(ROOT).as_posix() not in allowed_dirs:
            fail("SERVICE_UNDECLARED_FILE")
    if actual != set(files) | {"service-manifest.json"}:
        fail("SERVICE_UNDECLARED_FILE")
    dependencies = manifest["dependencies"]
    if not isinstance(dependencies, dict) or not dependencies or any(
        not re.fullmatch(r"[a-z0-9-]+", key) or not isinstance(pin, str) or not re.fullmatch(r"\d+(?:\.\d+)+(?:[a-z]+\d+)?", pin)
        for key, pin in dependencies.items()
    ):
        fail("SERVICE_DEPENDENCY_LOCK_INVALID")
    expected_lock = "".join(f"{key}=={pin}\n" for key, pin in sorted(dependencies.items()))
    if (ROOT / "requirements.lock").read_text() != expected_lock:
        fail("SERVICE_DEPENDENCY_LOCK_MISMATCH")
    for key, pin in dependencies.items():
        try:
            installed = version(key)
        except PackageNotFoundError:
            fail("SERVICE_DEPENDENCY_MISSING")
        if installed != pin:
            fail("SERVICE_DEPENDENCY_VERSION_MISMATCH")
    contract_doc = json.loads((ROOT / f"backend/contracts/crm-{domain}-service.v1.json").read_text())
    if any(contract_doc.get(key) != value for key, value in {"contract": contract, "api_version": "1.0.0", "owner": owner, "scope": scope}.items()):
        fail("SERVICE_API_IDENTITY_MISMATCH")
    if domain == "metrics":
        fixture = json.loads((ROOT / "resources/synthetic-store-v1.json").read_text())
        if fixture.get("contains_real_data") is not False or fixture.get("source_id") != "synthetic-crm-metrics":
            fail("SERVICE_SYNTHETIC_RESOURCE_REQUIRED")
    else:
        pack = json.loads((ROOT / "resources/knowledge/pack.json").read_text())
        if any(pack.get(key) is not False for key in ("contains_real_data", "contains_credentials", "private_source_text_included")):
            fail("SERVICE_PUBLIC_RESOURCE_REQUIRED")
    return manifest, hashlib.sha256(manifest_bytes).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "serve"))
    parser.add_argument("--port", type=int)
    args = parser.parse_args()
    if args.command == "serve" and (args.port is None or not 0 <= args.port <= 65535):
        parser.error("serve requires --port 0..65535; host is always 127.0.0.1")
    manifest, digest = verify()
    receipt = {"name": manifest["name"], "version": manifest["version"], "manifest_sha256": digest, "scope": manifest["scope"], "release_ready": False}
    if args.command == "check":
        print(json.dumps({"status": "SERVICE_PACKAGE_CHECK_PASS", **receipt}), flush=True)
        return
    # This directory is the verified artifact, never a discovered Git checkout.
    # -I discards PYTHONPATH/user site; only this process owns the listening socket.
    sys.path.insert(0, str(ROOT))
    import uvicorn
    if manifest["domain"] == "metrics":
        from backend.crm_metrics_app import create_crm_metrics_app
        app = create_crm_metrics_app(synthetic_path=ROOT / "resources/synthetic-store-v1.json", legacy_adapter=False)
    else:
        from backend.crm_knowledge_app import create_crm_knowledge_app
        app = create_crm_knowledge_app(pack_path=ROOT / "resources/knowledge", verify_local_implementation=False)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", args.port))
        sock.listen(64)
        print(json.dumps({"status": "SERVICE_SOCKET_BOUND", "port": sock.getsockname()[1], **receipt}), flush=True)
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False, lifespan="off"))
        server.run(sockets=[sock])


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        # Do not expose paths, malformed resources or dependency details in logs.
        code = str(error) if re.fullmatch(r"SERVICE_[A-Z_]+", str(error)) else "SERVICE_PACKAGE_BLOCKED"
        print(code, file=sys.stderr)
        raise SystemExit(2)
