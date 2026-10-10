"""Owned composition fixture: verified saved-analysis package, external query state.

Run only through the opt-in official-host test in its isolated dependency venv.
No repository modules, real CRM, worker, DuckDB, or production policy are loaded.
"""
import hashlib
import importlib.abc
import json
import os
from pathlib import Path
import re
import runpy
import socket
import sys
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True


class DenyRepositoryServices(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        blocked = ("duckdb", "_duckdb", "httpx", "dotenv", "bcrypt", "backend.main", "backend.config",
                   "backend.analytics_first_purchase_native", "backend.analytics_first_purchase_fixture",
                   "backend.services.analytics.worker", "backend.services.analytics.first_purchase.runtime",
                   "backend.services.crm_readonly", "backend.services.crm_knowledge")
        if any(fullname == name or fullname.startswith(name + ".") for name in blocked):
            raise ImportError("HOST_SERVICE_UNDECLARED_IMPORT " + fullname)


def main():
    source_arg, state_arg, digest, expected_manifest, port_arg = sys.argv[1:]
    source, state = Path(source_arg), Path(state_arg)
    assert sys.flags.isolated and sys.version_info[:2] == (3, 14)
    assert source.is_absolute() and state.is_absolute()
    assert not source.is_symlink() and not state.is_symlink()
    source, state = source.resolve(strict=True), state.resolve(strict=True)
    assert not state.is_relative_to(source)
    assert re.fullmatch(r"[a-f0-9]{64}", digest)
    assert re.fullmatch(r"[a-f0-9]{64}", expected_manifest)
    assert (state / ".owned-first-purchase-host").read_text() == "owned-synthetic-host/v1\n" + digest + "\n"
    assert hashlib.sha256((source / "service-manifest.json").read_bytes()).hexdigest() == expected_manifest
    config = json.loads(sys.stdin.buffer.read(4097))
    source_http = "source_contract" in config
    assert set(config) == {"crm_origin", "query_runtime"} | ({"source_contract", "source_origin"} if source_http else set())
    assert config["query_runtime"] in {"workspace-synthetic-kernel", "independent-offline-query-artifact"}
    opened = set()
    if source_http:
        assert config["source_contract"] == "first-purchase-frozen-source/v1"
        assert config["query_runtime"] == "independent-offline-query-artifact"
        assert config["source_origin"] == "http://127.0.0.1:4335"
        def own_sqlite_only(event, args):
            if event == "sqlite3.connect":
                raw = str(args[0])
                uri = urlsplit(raw)
                path = Path(unquote(uri.path) if uri.scheme == "file" and not uri.netloc else raw).resolve()
                assert path == state / "analyses/first_purchase_analyses.sqlite3", "HOST_SERVICE_QUERY_DB_FORBIDDEN"
                opened.add(path.relative_to(state).as_posix())
        sys.addaudithook(own_sqlite_only)
    # This drill cannot contact a production CRM: the parent owns a literal IPv4 loopback.
    assert re.fullmatch(r"http://127\.0\.0\.1:[1-9][0-9]{0,4}", config["crm_origin"])
    port = int(port_arg)
    assert 0 <= port <= 65535
    sys.meta_path.insert(0, DenyRepositoryServices())
    entry = runpy.run_path(str(source / "service.py"), run_name="verified_package")
    manifest, manifest_digest = entry["verify"]()
    assert manifest["domain"] == "first-purchase" and manifest_digest == expected_manifest
    sys.path.insert(0, str(source))
    import uvicorn
    from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
    from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
    from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
    from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore

    def import_origins():
        modules = {name: Path(module.__file__).resolve() for name, module in list(sys.modules.items())
                   if (name == "backend" or name.startswith("backend.")) and getattr(module, "__file__", None)}
        assert modules and all(path.is_relative_to(source) for path in modules.values())
        return {name: path.relative_to(source).as_posix() for name, path in sorted(modules.items())}

    runs = reader = None
    if source_http:
        from backend.services.analytics.first_purchase.source_http import HTTPFirstPurchaseSourceResolver
        reader = HTTPFirstPurchaseSourceResolver(config["source_origin"])
    else:
        from backend.services.analytics.jobs import RunStore
        from backend.services.analytics.resource_profile import B0ResourceProfile, B0_SMALL_FIXTURE_PROFILE
        runs = RunStore(state / "state", B0ResourceProfile(**B0_SMALL_FIXTURE_PROFILE), family="first_purchase")
    store = FirstPurchaseSavedAnalysisStore(state / "analyses")
    policy = FirstPurchaseSavePolicy("official-host-no-age-v1", frozenset({digest}), None, None, check_freshness=False)
    try:
        options = {"source_resolver": reader} if source_http else {}
        app = create_first_purchase_analysis_app(runs, store,
            CRMFirstPurchaseIdentityResolver(config["crm_origin"], frozenset({"crm-owner"}), allow_query=True),
            save_policy=lambda: policy, **options)
        assert app.openapi() == json.loads((source / "openapi.json").read_text())
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", port))
            sock.listen(64)
            print(json.dumps({"status": "SERVICE_SOCKET_BOUND", "port": sock.getsockname()[1],
                "pid": os.getpid(), "manifest_sha256": manifest_digest, "candidate_digest": digest,
                "openapi": "MATCHED", "imports": import_origins(), "scope": "saved-analysis-artifact-only",
                **({"source_contract": config["source_contract"], "sqlite_scope": "saved-analysis-only",
                    "sqlite_files": sorted(opened)} if source_http else {}),
                "query_runtime": config["query_runtime"], "release_ready": False}), flush=True)
            uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False, lifespan="off")).run(sockets=[sock])
        import_origins()
        entry["verify"]()
    finally:
        store.close()


if __name__ == "__main__":
    main()
