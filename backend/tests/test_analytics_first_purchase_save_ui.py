"""Current JS CRM grant -> workbench -> real HTTP service; owned synthetic state only."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
from threading import Thread
from time import monotonic, sleep

from fastapi import FastAPI, Request, Response
import uvicorn

from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.tests.test_analytics_first_purchase_analysis import analysis_counts, private_dir, succeed_first_purchase

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "synthetic-ui-only-token-0000000000"


@contextmanager
def serve(app):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(64)
        origin = f"http://127.0.0.1:{sock.getsockname()[1]}"
        server = uvicorn.Server(uvicorn.Config(app, log_level="critical", access_log=False, lifespan="off"))
        thread = Thread(target=server.run, kwargs={"sockets": [sock]})
        thread.start()
        try:
            deadline = monotonic() + 5
            while not server.started and thread.is_alive() and monotonic() < deadline:
                sleep(0.01)
            assert server.started
            yield origin
        finally:
            server.should_exit = True
            thread.join(timeout=5)
            assert not thread.is_alive(), "owned fixture server did not stop"


def test_crm_login_save_unknown_reconcile_and_replay_over_real_http(tmp_path):
    crm = FastAPI()
    checks = []

    @crm.post("/api/v1/auth/login")
    async def login(request: Request):
        if await request.json() != {"username": "synthetic-demo", "password": "synthetic-password"}:
            return Response(status_code=401)
        return {"username": "synthetic-demo", "token": TOKEN, "is_admin": True}

    @crm.get("/api/v1/auth/me")
    def me(request: Request):
        accepted = request.headers.get("authorization") == "Bearer " + TOKEN
        checks.append(accepted)
        if not accepted:
            return Response(status_code=401)
        return {"username": "synthetic-demo", "is_admin": True}

    runs, _, run = succeed_first_purchase(tmp_path)
    store = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    policy = FirstPurchaseSavePolicy("ui-no-age-v1", frozenset({"a" * 64}), None, None, check_freshness=False)
    node = shutil.which(os.environ.get("NODE", "node"))
    assert node is not None, "Node 24 is required for the actual plugin probe"
    with serve(crm) as crm_origin:
        app = create_first_purchase_analysis_app(runs, store,
            CRMFirstPurchaseIdentityResolver(crm_origin, frozenset({"synthetic-demo"})), save_policy=lambda: policy)
        with serve(app) as service_origin:
            result = subprocess.run([node, str(ROOT / "dsh-plugins/analytics-workbench/test/first-purchase-save-http.probe.mjs")],
                input=json.dumps({"crm_origin": crm_origin, "service_origin": service_origin, "run_id": run.run_id}),
                text=True, capture_output=True, timeout=35, cwd=tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "FIRST_PURCHASE_SAVE_HTTP PASS checks=7" in result.stdout
    assert checks and all(checks)
    assert analysis_counts(store)["analyses"] == 1
