"""Verify the optional identity adapter from an actual minimal service install."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import runpy
import secrets
import sys
from threading import Thread

sys.dont_write_bytecode = True
source = Path(sys.argv[1]).resolve()
assert sys.flags.isolated
entry = runpy.run_path(str(source / "service.py"), run_name="verified_package")
entry["verify"]()
sys.path.insert(0, str(source))

from backend.services.analytics.first_purchase import crm_identity  # noqa: E402
from backend.services.analytics.access import AnalyticsError  # noqa: E402

assert Path(crm_identity.__file__).resolve().is_relative_to(source)
token = secrets.token_hex(24)
reply = {"status": 200, "username": "package-demo", "is_admin": True}
observations = []


class Identity(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        assert self.path == "/api/v1/auth/me" and self.headers["Authorization"] == "Bearer " + token
        body = json.dumps({"username": reply["username"], "is_admin": reply["is_admin"]}).encode()
        self.send_response(reply["status"])
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


with HTTPServer(("127.0.0.1", 0), Identity) as server:
    server.timeout = 1
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    try:
        adapter = crm_identity.CRMFirstPurchaseIdentityResolver(
            f"http://127.0.0.1:{server.server_port}", frozenset({"package-demo"}))
        actor = adapter.resolve("Bearer " + token)
        assert actor.actor_id == "package-demo" and actor.capabilities == frozenset({"run:read", "analysis:read", "analysis:save"})
        observations.append("existing-crm-account")
        for change, status, label in [
            ({"is_admin": False}, 403, "revoked-admin"),
            ({"is_admin": True, "username": "another-admin"}, 403, "unapproved-account"),
            ({"status": 401}, 401, "revoked-session"),
            ({"status": 503}, 503, "identity-outage"),
        ]:
            reply.update(change)
            try:
                adapter.resolve("Bearer " + token)
            except AnalyticsError as error:
                assert error.status == status and error.retryable is (status == 503)
            else:
                raise AssertionError("IDENTITY_UNEXPECTEDLY_ACCEPTED")
            observations.append(label)
    finally:
        server.shutdown()
        thread.join(timeout=2)
        assert not thread.is_alive()
print(json.dumps({"status": "PASS", "scope": "packed-service-synthetic-crm-identity", "observations": observations}))
