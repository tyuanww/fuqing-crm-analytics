"""Opt-in real pinned Host/HTTP, synthetic CRM/model/JSON only; no browser claim."""
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
from time import monotonic, sleep

from fastapi import FastAPI, Request, Response
import httpx
import pytest

from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
from backend.analytics_first_purchase_native import create_first_purchase_native_app
from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.tests.analytics_run_support import sqlite_connection
from backend.tests.test_analytics_first_purchase_analysis import analysis_counts, private_dir
from backend.tests.test_analytics_first_purchase_native import RUNTIME, SESSION, auth, fp_actor, native_prompt
from backend.tests.test_analytics_first_purchase_native_identity import config
from backend.tests.test_analytics_first_purchase_save_ui import serve

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "synthetic-query-save-token-0000000000"


@pytest.mark.skipif(not os.environ.get("B0_NATIVE_CRM_HOST_UPSTREAM"), reason="explicit pinned Host opt-in required")
def test_official_host_crm_query_save_and_reauthentication_after_restart(tmp_path):
    upstream = Path(os.environ["B0_NATIVE_CRM_HOST_UPSTREAM"])
    assert upstream.is_absolute()
    node = shutil.which(os.environ.get("NODE", "node"))
    assert node is not None
    process = subprocess.Popen([node, str(ROOT / "scripts/dsh-b0/first-purchase-crm-host.probe.mjs")],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=tmp_path)
    dispatcher = None
    errors = []

    def receive():
        assert select.select([process.stdout], [], [], 60)[0], "owned official Host timed out"
        line = process.stdout.readline()
        if not line:
            errors.append(process.stderr.read())
            raise AssertionError(errors[-1])
        assert TOKEN not in line and RUNTIME not in line
        return json.loads(line)

    def command(value):
        process.stdin.write(json.dumps(value) + "\n")
        process.stdin.flush()
        return receive()

    crm, checks, state = FastAPI(), [], {"allowed": True}

    @crm.post("/api/v1/auth/login")
    async def login(request: Request):
        if await request.json() != {"username": "crm-owner", "password": "synthetic-password"}:
            return Response(status_code=401)
        return {"username": "crm-owner", "token": TOKEN, "is_admin": True}

    @crm.get("/api/v1/auth/me")
    def me(request: Request):
        valid = request.headers.get("authorization") == "Bearer " + TOKEN
        checks.append(valid)
        if not valid or not state["allowed"]:
            return Response(status_code=401)
        return {"username": "crm-owner", "is_admin": True}

    try:
        digest = receive()["method_digest"]
        # Explicit fixed B0 port block only. Bind fails if someone else owns it.
        app = create_first_purchase_native_app({**config(tmp_path), "port_base": 4335,
                                               "method_package_digest": digest})
        runs, dispatcher = app.state.store, app.state.dispatcher
        saved = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
        policy = FirstPurchaseSavePolicy("official-host-no-age-v1", frozenset({"a" * 64}), None, None,
                                         check_freshness=False)
        with serve(crm) as crm_origin:
            service = create_first_purchase_analysis_app(runs, saved,
                CRMFirstPurchaseIdentityResolver(crm_origin, frozenset({"crm-owner"}), allow_query=True),
                save_policy=lambda: policy)
            with serve(service) as service_origin, serve(app, port=4335) as kernel_origin:
                assert command({"upstream": str(upstream), "output": str(tmp_path / "official-host"),
                    "crm_origin": crm_origin, "service_origin": service_origin,
                    "session_id": SESSION, "runtime_token": RUNTIME, "port_base": 4335}) == {"ready": True}
                dispatcher.start()
                dispatcher.tick()
                with httpx.Client(base_url=kernel_origin, trust_env=False, timeout=15) as client:
                    assert client.post("/internal/native/prompt", json=native_prompt(), headers=auth()).status_code == 401
                    assert command({"operation": "login"}) == {"ok": True, "connected": True}
                    accepted = client.post("/internal/native/prompt", json=native_prompt(), headers=auth())
                    assert accepted.status_code == 202, accepted.text
                    run_id = accepted.json()["run_id"]
                    deadline = monotonic() + 40
                    while True:
                        dispatcher.tick()
                        result = runs.get(fp_actor("crm-owner"), run_id)
                        if result.status in {"SUCCEEDED", "FAILED", "CANCELLED", "NEEDS_INPUT"}:
                            break
                        assert monotonic() < deadline, f"official Host query did not finish: {result.status}"
                        sleep(0.05)
                    assert result.status == "SUCCEEDED", result.model_dump(mode="json")
                    assert result.result is not None
                    assert result.diagnostics.dispatch_attempts == 1
                    assert len(runs.worker_records(active_only=False)) == 1 and not runs.worker_records()
                    with sqlite_connection(runs.path) as db:
                        call_id = db.execute("SELECT call_id FROM steps WHERE run_id=? AND step_id=?",
                                             (run_id, result.primary_result_ref)).fetchone()[0]
                    assert command({"operation": "save", "run_id": run_id, "call_id": call_id}) == {
                        "ok": True, "saved": True, "writes": 1}
                    assert command({"operation": "restart"}) == {"ok": True, "preserved": True}
                    # DSH retains its own cookie and journal, CRM credentials are intentionally gone.
                    assert client.get("/internal/native/context", headers=auth()).status_code == 401
                    assert command({"operation": "login"}) == {"ok": True, "connected": True}
                    replay = client.post("/internal/native/prompt", json=native_prompt(), headers=auth())
                    assert replay.status_code == 202 and replay.json()["run_id"] == run_id
                    dispatcher.tick()
                    assert runs.get(fp_actor("crm-owner"), run_id).diagnostics.dispatch_attempts == 1
                    assert command({"operation": "disconnect"}) == {"ok": True, "connected": False}
                    assert client.get("/internal/native/context", headers=auth()).status_code == 401
        assert checks and all(checks)
        assert analysis_counts(saved)["analyses"] == 1
    finally:
        if dispatcher is not None:
            dispatcher.close()
        process.stdin.close()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.terminate()  # Its handler closes only its owned Host/model children.
            process.wait(timeout=15)
        error = process.stderr.read()
        process.stdout.close()
        process.stderr.close()
        assert process.returncode == 0, "\n".join([*errors, error])
