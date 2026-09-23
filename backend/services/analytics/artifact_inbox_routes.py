"""Authenticated candidate artifact inbox routes owned by the analytics plugin."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response

from backend.services.analytics.artifact_inbox import PREFIX


def artifact_inbox_router(store, principal, page_store=None):
    router = APIRouter(prefix=PREFIX)

    @router.post("", status_code=201)
    def intake(request: Request, body: dict, response: Response):
        response.headers["Cache-Control"] = "no-store"
        return store.intake(principal(request), body)

    @router.get("")
    def listing(request: Request, response: Response, status: str | None = None, limit: int = 100, offset: int = 0):
        response.headers["Cache-Control"] = "no-store"
        return store.list(principal(request), status=status, limit=limit, offset=offset)

    @router.get("/{artifact_id}")
    def get(artifact_id: str, request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        return store.get(principal(request), artifact_id)

    @router.post("/{artifact_id}/confirm")
    def confirm(artifact_id: str, request: Request, body: dict, response: Response):
        response.headers["Cache-Control"] = "no-store"
        return store.confirm(principal(request), artifact_id, body.get("page_id"), page_store=page_store)

    @router.post("/{artifact_id}/dismiss")
    def dismiss(artifact_id: str, request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        return store.dismiss(principal(request), artifact_id)

    return router
