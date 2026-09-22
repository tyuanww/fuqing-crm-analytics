"""HTTP seam for server-owned edit contexts. Request bodies are parsed by the service."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response

from backend.analytics_app import _single_header

PREFIX = "/api/v1/analytics/page-edit-contexts"


def page_edit_context_router(store, principal):
    router = APIRouter(prefix=PREFIX)

    def actor(request, response):
        response.headers["Cache-Control"] = "no-store"
        return principal(request)

    @router.get("/overlay")
    def read_overlay(page_id: str, version: int, request: Request, response: Response):
        return {
            "page_id": page_id,
            "version": version,
            "overlays": store.overlay(actor(request, response), page_id, version),
        }

    @router.post("", status_code=201)
    async def create(request: Request, response: Response):
        return store.create(actor(request, response), await request.json())

    @router.post("/{context_id}/native")
    async def native(context_id: str, request: Request, response: Response):
        return store.native_handoff(actor(request, response), context_id)

    @router.post("/{context_id}/patches")
    async def patches(context_id: str, request: Request, response: Response, page_id: str | None = None):
        return store.apply(actor(request, response), context_id, await request.json(),
                           _single_header(request, "idempotency-key"), page_id=page_id)

    @router.post("/{context_id}/patches/{preview_id}/confirm")
    async def confirm(context_id: str, preview_id: str, request: Request, response: Response):
        return store.confirm(actor(request, response), context_id, preview_id,
                             _single_header(request, "idempotency-key"))

    @router.get("/{context_id}/patches/{preview_id}/receipt")
    def receipt(context_id: str, preview_id: str, request: Request, response: Response):
        return store.recover(actor(request, response), context_id, preview_id)

    @router.post("/{context_id}/patches/{preview_id}/receipt")
    def acknowledge(context_id: str, preview_id: str, request: Request, response: Response):
        return store.acknowledge(actor(request, response), context_id, preview_id)

    return router
