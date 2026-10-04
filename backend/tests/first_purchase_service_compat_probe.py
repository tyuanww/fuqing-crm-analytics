"""Child probe for exact-source compatibility; only the runner's synthetic state.

This file is a test driver, never an application entrypoint. Each invocation
imports one immutable source tree through an explicit absolute PYTHONPATH.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from backend import analytics_first_purchase_analysis_app as api_module
from backend.analytics_first_purchase_fixture import create_first_purchase_fixture
from backend.services.analytics.access import AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.first_purchase.runtime import FirstPurchaseRuntime
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.services.analytics.jobs import RunStore
from backend.services.analytics.resource_profile import B0ResourceProfile, B0_SMALL_FIXTURE_PROFILE

BASE = "/api/v1/analytics-first-purchase"
TOKEN = "compatibility-fixture-token-" + "x" * 40
CAPABILITIES = {"run:create", "run:read", "run:cancel", "analysis:read", "analysis:save"}


def principal(readonly=False):
    return AnalyticsPrincipal("synthetic-demo",
                              frozenset({"analysis:read", "run:read"} if readonly else CAPABILITIES),
                              frozenset({"first-purchase-fixture"}))


def headers(key="d15-save", version=None):
    result = {"authorization": f"Bearer {TOKEN}", "idempotency-key": key}
    if version is not None:
        result["if-match"] = str(version)
    return result


def checked(response, status):
    assert response.status_code == status, (response.status_code, response.text)
    return response.json()


def private_dir(root, name):
    directory = root / name
    directory.mkdir(mode=0o700, exist_ok=True)
    return directory


def main():
    source, state, operation = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3]
    assert source.is_absolute() and state.is_absolute()
    assert state.parent.name.startswith("d15-service-compat-")
    assert (state / ".synthetic-save-compatibility").read_text() == "owned-synthetic-state/v1\n"
    assert Path(api_module.__file__).resolve().is_relative_to(source)
    context_path = state / "context.json"
    context = json.loads(context_path.read_text()) if context_path.exists() else {}
    if operation == "unknown-schema":
        try:
            FirstPurchaseSavedAnalysisStore(state / "analyses")
        except ValueError as error:
            assert "schema differs" in str(error), str(error)
            print(json.dumps({"case": operation, "status": "PASS", "rejected": True}))
            return
        raise AssertionError("unknown schema was accepted")

    registry = B0IdentityRegistry()
    registry.grant(TOKEN, principal(operation == "old-readonly"))
    store = FirstPurchaseSavedAnalysisStore(private_dir(state, "analyses"),
                                           clock=lambda: context.get("generated_ms", 1))
    runs = None
    options = {}
    if operation in {"seed-legacy", "upgrade"}:
        runs = RunStore(private_dir(state, "runs"), B0ResourceProfile(**B0_SMALL_FIXTURE_PROFILE),
                        family="first_purchase")
    if operation == "seed-legacy":
        fixtures = source / "backend/tests/fixtures"
        fixture = create_first_purchase_fixture(json.loads((fixtures / "analytics_first_purchase_v1.json").read_text()))
        runtime = FirstPurchaseRuntime(runs, fixture, lambda _: principal())
        request = json.loads((fixtures / "analytics_first_purchase_v1_expected.json").read_text())["request"]
        run = runtime.submit_and_execute(principal(), "compat-run", request)
        assert run.status == "SUCCEEDED"
        context.update(run_id=run.run_id, generated_ms=round(run.updated_at.timestamp() * 1000),
                       evidence_digest=run.evidence_digest)
    if operation == "upgrade":
        from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
        options["save_policy"] = lambda: FirstPurchaseSavePolicy(
            "compat-synthetic-v1", frozenset({"a" * 64}), 1000, 2000)
    app = api_module.create_first_purchase_analysis_app(runs, store, registry, **options)
    with TestClient(app) as client:
        if operation == "seed-legacy":
            legacy = checked(client.post(BASE + "/analyses", headers=headers("legacy-save"), json={
                "created_from_run_id": context["run_id"], "title": "synthetic legacy",
            }), 201)
            context["legacy"] = legacy
        elif operation == "upgrade":
            old = context["legacy"]
            assert checked(client.get(BASE + "/analyses/" + old["analysis_id"], headers=headers()), 200) == old
            assert checked(client.get(BASE + "/analyses/" + old["analysis_id"] + "/provenance",
                                      headers=headers()), 404)["error"]["code"] == "PROVENANCE_NOT_RECORDED"
            assert checked(client.post(BASE + "/analyses", headers=headers("bypass"), json={
                "created_from_run_id": context["run_id"], "title": "bypass",
            }), 409)["error"]["code"] == "VERSIONED_SAVE_REQUIRED"
            command = {
                "schema_version": "analytics-first-purchase-save-command/v1",
                "identity": {"schema_version": "analytics-first-purchase-save-identity/v1",
                             "action_id": "compat-save", "candidate_digest": "a" * 64,
                             "correlation_id": "compat-correlation"},
                "created_from_run_id": context["run_id"], "title": "synthetic D15",
                "evidence_digest": context["evidence_digest"],
            }
            receipt = checked(client.post(BASE + "/save-receipts", headers=headers(), json=command), 201)
            analysis_id = receipt["analysis_ref"]["analysis_id"]
            provenance = checked(client.get(BASE + "/analyses/" + analysis_id + "/provenance",
                                            headers=headers()), 200)
            record = checked(client.get(BASE + "/analyses/" + analysis_id, headers=headers()), 200)
            context.update(command=command, receipt=receipt, provenance=provenance, record=record)
        elif operation == "old-readonly":
            record = context["record"]
            assert checked(client.get(BASE + "/analyses/" + record["analysis_id"],
                                      headers=headers()), 200) == record
            checked(client.post(BASE + "/save-receipts/reconcile", headers=headers(),
                                json=context["command"]["identity"]), 404)
            assert checked(client.post(BASE + "/analyses/" + record["analysis_id"] + "/versions",
                                       headers=headers("forbidden", record["version"]),
                                       json={"title": "forbidden"}), 403)["error"]["code"] == "FORBIDDEN"
        elif operation == "recover":
            command, receipt = context["command"], context["receipt"]
            assert checked(client.post(BASE + "/save-receipts/reconcile", headers=headers(),
                                       json=command["identity"]), 200) == receipt
            assert len(checked(client.get(BASE + "/analyses", headers=headers()), 200)["items"]) == 2
            # No RunStore and no admission provider: exact replay only.
            assert checked(client.post(BASE + "/save-receipts", headers=headers(), json=command), 201) == receipt
            analysis_id = receipt["analysis_ref"]["analysis_id"]
            first_provenance = checked(client.get(BASE + "/analyses/" + analysis_id + "/provenance?version=1",
                                                  headers=headers()), 200)
            assert first_provenance == context["provenance"]
            fixed = checked(client.post(BASE + "/analyses/" + analysis_id + "/versions",
                                        headers=headers("forward-fix", 1), json={"title": "synthetic corrected"}), 201)
            assert fixed["version"] == 2 and fixed["facts"] == context["record"]["facts"]
            latest = checked(client.get(BASE + "/analyses/" + analysis_id + "/provenance",
                                        headers=headers()), 200)
            assert latest["analysis_ref"]["version"] == 2
            assert latest["provenance"] == first_provenance["provenance"]
            assert checked(client.post(BASE + "/save-receipts/reconcile", headers=headers(),
                                       json=command["identity"]), 200) == receipt
        elif operation == "old-write":
            analysis_id = context["receipt"]["analysis_ref"]["analysis_id"]
            current = checked(client.get(BASE + "/analyses/" + analysis_id, headers=headers()), 200)
            changed = checked(client.post(BASE + "/analyses/" + analysis_id + "/versions",
                                          headers=headers("unsafe-old-title", current["version"]),
                                          json={"title": "synthetic unsupported downgrade"}), 201)
            assert changed["facts"] == current["facts"]
        elif operation == "detect-old-write":
            analysis_id = context["receipt"]["analysis_ref"]["analysis_id"]
            latest = checked(client.get(BASE + "/analyses/" + analysis_id, headers=headers()), 200)
            assert latest["version"] == 3
            assert checked(client.get(BASE + "/analyses/" + analysis_id + "/provenance",
                                      headers=headers()), 404)["error"]["code"] == "PROVENANCE_NOT_RECORDED"
            assert checked(client.post(BASE + "/save-receipts/reconcile", headers=headers(),
                                       json=context["command"]["identity"]), 200) == context["receipt"]
        else:
            raise AssertionError("unknown operation")
    if operation in {"seed-legacy", "upgrade"}:
        context_path.write_text(json.dumps(context, ensure_ascii=False))
    store.close()
    print(json.dumps({"case": operation, "status": "PASS",
                      "source_import": str(Path(api_module.__file__).resolve().relative_to(source))}))


if __name__ == "__main__":
    main()
