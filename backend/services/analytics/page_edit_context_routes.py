"""HTTP seam for server-owned edit contexts. Request bodies are parsed by the service."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response
from starlette.concurrency import run_in_threadpool

from backend.analytics_app import _single_header

PREFIX = "/api/v1/analytics/page-edit-contexts"


def page_edit_context_router(store, principal, context=None):
    router = APIRouter(prefix=PREFIX)

    def actor(request, response):
        response.headers["Cache-Control"] = "no-store"
        return principal(request)

    def source(request):
        return context(request) if context else None

    @router.get("/overlay")
    def read_overlay(page_id: str, version: int, request: Request, response: Response):
        return {
            "page_id": page_id,
            "version": version,
            "overlays": store.overlay(actor(request, response), page_id, version),
        }

    @router.post("", status_code=201)
    async def create(request: Request, response: Response):
        payload = await request.json()
        return await run_in_threadpool(lambda: store.create(actor(request, response), payload))

    @router.post("/{context_id}/native")
    def native(context_id: str, request: Request, response: Response):
        return store.native_handoff(actor(request, response), context_id)

    @router.post("/{context_id}/patches")
    async def patches(context_id: str, request: Request, response: Response, page_id: str | None = None):
        payload = await request.json()
        return await run_in_threadpool(lambda: store.apply(actor(request, response), context_id, payload,
                                       _single_header(request, "idempotency-key"), page_id=page_id))

    @router.post("/{context_id}/patches/{preview_id}/confirm")
    def confirm(context_id: str, preview_id: str, request: Request, response: Response):
        return store.confirm(actor(request, response), context_id, preview_id,
                             _single_header(request, "idempotency-key"), source_context=source(request))

    @router.get("/{context_id}/patches/{preview_id}/receipt")
    def receipt(context_id: str, preview_id: str, request: Request, response: Response):
        return store.recover(actor(request, response), context_id, preview_id)

    @router.post("/{context_id}/patches/{preview_id}/receipt")
    def acknowledge(context_id: str, preview_id: str, request: Request, response: Response):
        return store.acknowledge(actor(request, response), context_id, preview_id)

    return router
