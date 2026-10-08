"""Owned HTTP source fixture, no business inputs or real credentials."""

import json
import socket
import sys
from pathlib import Path
from threading import Thread
from time import monotonic, sleep
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from backend.services.analytics.access import AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.page_documents import ResolvedPageBinding
from backend.services.analytics.page_documents_routes import create_page_app
from backend.analytics_competition_app import create_competition_app
from backend.services.analytics.competition_diagnosis.synthetic import (
    materialize_synthetic_source,
)
from backend.tests.test_competition_computed_results import snapshot

root = Path(sys.argv[1])
assert root.is_absolute() and root.name == "http-state"
root.mkdir(mode=0o700)
for name in ["pages", "source", "boards", "diagnosis"]:
    (root / name).mkdir(mode=0o700)
token = "html-host-isolated-synthetic-token-32chars"
ids = B0IdentityRegistry()
ids.grant(
    token,
    AnalyticsPrincipal(
        "alice",
        frozenset(
            {"analysis:read", "analysis:save", "dashboard:read", "dashboard:update"}
        ),
        frozenset({"competition-diagnosis-fixture", "brand-a"}),
    ),
)


def resolve(actor, session, result):
    assert session == "html-host-synthetic" and result == "result_fixture_1"
    return ResolvedPageBinding("VERIFIED", frozenset({"brand-a"}))


app = create_page_app(
    identities=ids, page_state_dir=root / "pages", resolve_binding=resolve
)
source = materialize_synthetic_source(root / "source", snapshot())
competition = create_competition_app(
    identities=ids,
    diagnosis_source=source,
    diagnosis_state_dir=root / "diagnosis",
    board_state_dir=root / "boards",
)
app.include_router(competition.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[sys.argv[2]],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["authorization", "content-type", "idempotency-key"],
)
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            log_level="error",
            access_log=False,
            loop="asyncio",
            http="h11",
            ws="none",
            lifespan="off",
        )
    )
    t = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    t.start()
    try:
        deadline = monotonic() + 10
        while not server.started:
            if not t.is_alive() or monotonic() > deadline:
                raise RuntimeError("owned HTTP readiness")
            sleep(0.01)
        print(
            json.dumps(
                {"port": listener.getsockname()[1], "contains_real_data": False}
            ),
            flush=True,
        )
        sys.stdin.readline()
    finally:
        server.should_exit = True
        t.join(timeout=10)
        assert not t.is_alive(), "OWNED_HTTP_CLEANUP"
