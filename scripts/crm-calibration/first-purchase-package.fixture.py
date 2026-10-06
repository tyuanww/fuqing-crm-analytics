"""Test driver for a verified service archive, never shipped in the package.

Only seed uses the repository's synthetic worker. Serve/recover import the
unpacked application's verified files in a minimal dependency environment.
"""
from __future__ import annotations

import importlib.abc
import json
from pathlib import Path
import runpy
import socket
import sys

sys.dont_write_bytecode = True


def main():
    operation, source_arg, state_arg, *flags = sys.argv[1:]
    assert flags in ([], ["--without-age-check"])
    check_freshness = not flags
    source, state = Path(source_arg).resolve(), Path(state_arg).resolve()
    assert state.name == "analysis-state" and state.parent.name.startswith("crm-packed-service-")
    assert (state / ".synthetic-package-test").read_text() == "owned-synthetic-state/v1\n"
    if operation == "seed":
        sys.path.insert(0, str(source))
        from backend.analytics_first_purchase_fixture import create_first_purchase_fixture
        from backend.services.analytics.first_purchase.runtime import FirstPurchaseRuntime
        from backend.services.analytics.access import AnalyticsPrincipal
        from backend.services.analytics.jobs import RunStore
        from backend.services.analytics.resource_profile import B0ResourceProfile, B0_SMALL_FIXTURE_PROFILE

        actor = AnalyticsPrincipal("synthetic-demo",
                                  frozenset({"run:create", "run:read", "run:cancel", "analysis:read", "analysis:save"}),
                                  frozenset({"first-purchase-fixture"}))
        fixtures = source / "backend/tests/fixtures"
        fixture = create_first_purchase_fixture(json.loads((fixtures / "analytics_first_purchase_v1.json").read_text()))
        (state / "runs").mkdir(mode=0o700)
        runs = RunStore(state / "runs", B0ResourceProfile(**B0_SMALL_FIXTURE_PROFILE), family="first_purchase")
        runtime = FirstPurchaseRuntime(runs, fixture, lambda _: actor)
        request = json.loads((fixtures / "analytics_first_purchase_v1_expected.json").read_text())["request"]
        run = runtime.submit_and_execute(actor, "package-test-run", request)
        assert run.status == "SUCCEEDED"
        context = {"run_id": run.run_id, "generated_ms": round(run.updated_at.timestamp() * 1000),
                   "evidence_digest": run.evidence_digest}
        (state / "context.json").write_text(json.dumps(context))
        print(json.dumps({"status": "SYNTHETIC_SOURCE_READY"}))
        return
    assert operation in {"serve", "recover", "legacy-write", "legacy-readonly"}

    class DenyOtherServices(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            blocked = ("duckdb", "_duckdb", "httpx", "dotenv", "bcrypt", "backend.main", "backend.config",
                       "backend.contracts.schemas", "backend.services.crm_readonly", "backend.services.crm_knowledge",
                       "backend.crm_metrics_app", "backend.crm_knowledge_app", "backend.services.analytics.worker",
                       "backend.analytics_first_purchase_fixture", "backend.services.analytics.first_purchase.runtime")
            if any(fullname == name or fullname.startswith(name + ".") for name in blocked):
                raise ImportError("UNDECLARED_SERVICE_DEPENDENCY " + fullname)

    sys.meta_path.insert(0, DenyOtherServices())
    entry = runpy.run_path(str(source / "service.py"), run_name="verified_package")
    manifest, manifest_digest = entry["verify"]()
    assert manifest["domain"] == "first-purchase"
    sys.path.insert(0, str(source))
    import uvicorn
    from backend import analytics_first_purchase_analysis_app as api
    from backend.services.analytics.access import AnalyticsPrincipal, B0IdentityRegistry
    from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
    from backend.services.analytics.jobs import RunStore
    from backend.services.analytics.resource_profile import B0ResourceProfile, B0_SMALL_FIXTURE_PROFILE

    assert Path(api.__file__).resolve().is_relative_to(source)
    # Ephemeral test grants travel over a private pipe, never argv/logs/artifacts.
    credentials = json.loads(sys.stdin.buffer.read(4097))
    assert set(credentials) == {"writer", "reader"}
    registry = B0IdentityRegistry()
    for role, token in credentials.items():
        capabilities = {"run:read", "analysis:read"}
        if role == "writer" and operation != "legacy-readonly":
            capabilities.add("analysis:save")
        registry.grant(token, AnalyticsPrincipal("synthetic-demo", frozenset(capabilities),
                                                frozenset({"first-purchase-fixture"})))
    context = json.loads((state / "context.json").read_text())
    (state / "analyses").mkdir(mode=0o700, exist_ok=True)
    clock_ms = context["generated_ms"] + (0 if check_freshness else 365 * 24 * 60 * 60 * 1000)
    store = FirstPurchaseSavedAnalysisStore(state / "analyses", clock=lambda: clock_ms)
    runs = None
    if operation in {"serve", "legacy-write"} and (state / "runs").exists():
        runs = RunStore(state / "runs", B0ResourceProfile(**B0_SMALL_FIXTURE_PROFILE), family="first_purchase")
    options = {}
    if not operation.startswith("legacy-"):
        from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
        policy = None if operation == "recover" else FirstPurchaseSavePolicy(
            "package-synthetic-v1", frozenset({"a" * 64}), 1000, 2000)
        if operation != "recover" and not check_freshness:
            policy = FirstPurchaseSavePolicy("package-no-age-v1", frozenset({"a" * 64}), None, None,
                                             check_freshness=False)
        options["save_policy"] = lambda: policy
    app = api.create_first_purchase_analysis_app(runs, store, registry, **options)
    contract = json.loads((source / "openapi.json").read_text())
    assert app.openapi() == contract
    try:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen(64)
            print(json.dumps({"status": "SERVICE_SOCKET_BOUND", "port": sock.getsockname()[1],
                              "manifest_sha256": manifest_digest, "openapi": "MATCHED",
                              "scope": "isolated-package-synthetic-http"}), flush=True)
            uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False,
                                        lifespan="off")).run(sockets=[sock])
    finally:
        store.close()


if __name__ == "__main__":
    main()
