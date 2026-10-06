"""Current native query -> CRM-owned save over HTTP, with real synthetic worker.

The Host protocol receiver is controlled here; this is not a DSH/browser result.
"""
import json
import os
from pathlib import Path
import select
import shutil
import subprocess

from fastapi import FastAPI, Request, Response
import httpx

from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
from backend.analytics_first_purchase_native import create_first_purchase_native_app
from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.tests.test_analytics_first_purchase_analysis import analysis_counts, private_dir
from backend.tests.test_analytics_first_purchase_native import EXPECTED, RUNTIME, SESSION, auth, fp_actor, native_prompt, runtime_headers
from backend.tests.test_analytics_first_purchase_native_identity import config
from backend.tests.test_analytics_first_purchase_save_ui import serve
from backend.tests.test_analytics_native_runtime import Receiver

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "synthetic-query-save-token-0000000000"


class HTTPIdentityReceiver(Receiver):
    origin = None

    def call(self, operation, payload):
        if operation != "identity":
            return super().call(operation, payload)
        with httpx.Client(trust_env=False, timeout=3) as client:
            response = client.post(self.origin + "/identity", json=payload, headers=runtime_headers())
            response.raise_for_status()
            return response.json()


def test_fresh_crm_owner_native_query_save_ack_loss_and_replay_over_http(tmp_path):
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

    bridge = HTTPIdentityReceiver()
    app = create_first_purchase_native_app(config(tmp_path), bridge=bridge)
    runs = app.state.store
    saved = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    policy = FirstPurchaseSavePolicy("crm-query-no-age-v1", frozenset({"a" * 64}), None, None, check_freshness=False)
    node = shutil.which(os.environ.get("NODE", "node"))
    assert node is not None
    with serve(crm) as crm_origin:
        service = create_first_purchase_analysis_app(runs, saved,
            CRMFirstPurchaseIdentityResolver(crm_origin, frozenset({"crm-owner"}), allow_query=True),
            save_policy=lambda: policy)
        with serve(service) as service_origin, serve(app) as kernel_origin:
            process = subprocess.Popen([node, str(ROOT / "dsh-plugins/analytics-workbench/test/first-purchase-native-crm.probe.mjs")],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=tmp_path)

            def command(value):
                process.stdin.write(json.dumps(value) + "\n")
                process.stdin.flush()
                assert select.select([process.stdout], [], [], 15)[0], "owned plugin probe timed out"
                line = process.stdout.readline()
                if not line:
                    raise AssertionError(process.stderr.read())
                assert TOKEN not in line
                return json.loads(line)

            dispatcher = app.state.dispatcher
            try:
                bridge.origin = command({"crm_origin": crm_origin, "service_origin": service_origin,
                    "session_id": SESSION, "runtime_token": RUNTIME})["origin"]
                dispatcher.start()
                dispatcher.tick()
                with httpx.Client(base_url=kernel_origin, trust_env=False, timeout=15) as client:
                    # No synthetic fallback before CRM login; no row is accepted.
                    assert client.post("/internal/native/prompt", json=native_prompt(), headers=auth()).status_code == 401
                    assert command({"operation": "login"}) == {"ok": True}
                    accepted = client.post("/internal/native/prompt", json=native_prompt(), headers=auth())
                    assert accepted.status_code == 202, accepted.text
                    run_id = accepted.json()["run_id"]
                    dispatcher.tick()
                    query = client.post("/internal/native/first-purchase", headers=runtime_headers(), json={
                        "session_id": SESSION, "request_id": "req-1", "call_id": "call-1", "request": EXPECTED["request"],
                    })
                    assert query.status_code == 200, query.text
                    assert query.json()["result"] is not None
                    bridge.outcome, bridge.exited, bridge.tool_calls = "SUCCEEDED", True, ["call-1"]
                    dispatcher.tick()
                    result = runs.get(fp_actor("crm-owner"), run_id)
                    assert result.status == "SUCCEEDED"
                    assert len(runs.worker_records(active_only=False)) == 1
                    assert not runs.worker_records()
                    receipt = command({"operation": "save", "run_id": run_id})
                    assert receipt == {"ok": True, "saved": True, "writes": 1, "owner": "crm-owner", "freshness": "NOT_CHECKED"}
                    command({"operation": "disconnect"})
                    assert client.get("/internal/native/context", headers=auth()).status_code == 401
                    command({"operation": "login"})
                    assert client.get("/internal/native/context", headers=auth()).status_code == 200
                    state["allowed"] = False
                    assert client.post("/internal/native/prompt", json=native_prompt("revoked"), headers=auth()).status_code == 401
            finally:
                dispatcher.close()
                process.stdin.close()
                try:
                    process.wait(timeout=6)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)
                error = process.stderr.read()
                process.stdout.close()
                process.stderr.close()
            assert process.returncode == 0, error
    assert checks and all(checks)
    assert analysis_counts(saved)["analyses"] == 1
