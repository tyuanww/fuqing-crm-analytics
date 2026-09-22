"""Isolated free-page documents + result-access HTTP. Never the live 6677 web.

One uvicorn process, loopback only. Mounts create_page_app with an explicit
page_state_dir (small SQLite under --state-dir) and an explicit
PageResultAccess on the same app, so page persistence and the authorized
result bridge live outside any BoardSpec HTTP and outside the archived
business DuckDB. The token arrives through PAGE_DOCUMENTS_HTTP_TOKEN; a
request without the matching bearer stays 401.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

import uvicorn  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from backend.services.analytics.access import AnalyticsPrincipal, B0IdentityRegistry  # noqa: E402
from backend.services.analytics.page_documents_routes import create_page_app  # noqa: E402
from backend.services.analytics.page_result_access import PageResultAccess  # noqa: E402
from backend.services.analytics.cockpit_files import OfficeSettings  # noqa: E402


def build_app(*, state_dir: Path, token: str):
    registry = B0IdentityRegistry()
    principal = AnalyticsPrincipal(
        "page_http_local",
        frozenset({"analysis:read", "analysis:save", "dashboard:read", "dashboard:update"}),
        frozenset({"competition-diagnosis-fixture", "free-page-result-fixture", "brand-a"}),
    )
    registry.grant(token, principal)
    office = None
    config_path = os.environ.get("COCKPIT_OFFICE_CONFIG")
    if config_path:
        config_file = Path(config_path)
        if config_file.stat().st_mode & 0o077:
            raise ValueError("Office config must be private (chmod 600)")
        config = json.loads(config_file.read_text())
        office = OfficeSettings(config["base"], config["callback_base"], config["secret"])
    elif os.environ.get("COCKPIT_OFFICE_BASE"):
        office = OfficeSettings(os.environ["COCKPIT_OFFICE_BASE"], os.environ["COCKPIT_OFFICE_CALLBACK_BASE"],
                                os.environ["COCKPIT_OFFICE_JWT_SECRET"])
    app = create_page_app(
        identities=registry,
        page_state_dir=state_dir,
        result_access=PageResultAccess(),
        office=office,
        office_principal=lambda: registry.resolve("Bearer " + token),
    )
    # The page is opened from the local dev UI or from https://app.tyuan.chat.
    # Those are different origins from this API, so browsers preflight.
    # Credentials stay off: the page script sends the bearer itself.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1", "http://localhost", "https://app.tyuan.chat"],
        allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "HEAD", "OPTIONS"],
        allow_headers=["authorization", "content-type", "idempotency-key", "if-match"],
        expose_headers=["etag", "x-request-id"],
        max_age=600,
    )
    return app


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--state-dir", required=True, type=Path)
    args = parser.parse_args()
    if args.host != "127.0.0.1":
        print("page http must bind 127.0.0.1", file=sys.stderr)
        return 2
    if args.port == 6677:
        print("page http must not bind the live web port 6677", file=sys.stderr)
        return 2
    token = os.environ.get("PAGE_DOCUMENTS_HTTP_TOKEN", "")
    if not (32 <= len(token) <= 1017):
        print("PAGE_DOCUMENTS_HTTP_TOKEN must be 32-1017 chars", file=sys.stderr)
        return 2
    app = build_app(state_dir=args.state_dir, token=token)
    print(f"page-http ready on http://127.0.0.1:{args.port}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", access_log=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
