"""Versioned dashboard endpoint, registered under the existing authenticated API."""
from functools import lru_cache
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response

from backend.contracts.crm_analysis import (
    CrmAddReference, CrmAnalysis, CrmAnalysisPage, CrmBindCitations, CrmBoard, CrmBoardPage,
    CrmBoardPatch, CrmBoardWrite, CrmCockpitReference, CrmLibrary, CrmPatchAnalysis,
    CrmSaveAnalysis, CrmShareList, CrmShareRequest, CrmSnapshot, CrmSnapshotRequest,
)

router = APIRouter()


@lru_cache(maxsize=4)
def configured_store(directory, data_kind):
    from backend.services.crm_analysis import CrmAnalysisStore
    return CrmAnalysisStore(Path(directory), data_kind)


def library_context(request: Request, response: Response):
    from backend.services.crm_analysis import fail
    owner = getattr(request.state, "username", None)
    if not owner:
        fail("AUTH_REQUIRED", 401)
    directory = os.getenv("FQ_CRM_ANALYSIS_STATE_DIR")
    data_kind = os.getenv("FQ_CRM_ANALYSIS_DATA_KIND")
    if not directory or data_kind not in {"real", "synthetic"} or not Path(directory).is_absolute():
        fail("STATE_NOT_CONFIGURED")
    try:
        store = configured_store(directory, data_kind)
    except (ValueError, OSError):
        fail("STATE_UNAVAILABLE")
    response.headers["Cache-Control"] = "no-store"
    return store, owner


@router.post("/dashboard-snapshots", response_model=CrmSnapshot)
def capture_dashboard_snapshot(filters: CrmSnapshotRequest, context=Depends(library_context),
                               idempotency_key: str | None = Header(default=None)):
    from backend.services import check_future_date
    from backend.db.connection import get_connection
    from backend.services.metrics.dashboard_purchases import query_dashboard_purchases
    if check_future_date(filters.start_date.isoformat()) or check_future_date(filters.end_date.isoformat()):
        raise HTTPException(422, {"code": "DATA_WARNING", "message": "查询区间包含未来日期，未生成快照。"})
    store, owner = context
    return store.capture(owner, idempotency_key, filters, lambda value: query_dashboard_purchases(get_connection(), value))


@router.get("/crm-library", response_model=CrmLibrary)
def read_crm_library(context=Depends(library_context)):
    store, owner = context
    return store.library(owner)


@router.get("/dashboard-snapshots/{asset_id}", response_model=CrmSnapshot)
def read_crm_snapshot(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.read(owner, "snapshot", asset_id)


@router.post("/crm-analyses", response_model=CrmAnalysis)
def save_crm_analysis(body: CrmSaveAnalysis, context=Depends(library_context),
                      idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.save(owner, idempotency_key, body)


@router.get("/crm-analyses", response_model=CrmAnalysisPage)
def search_crm_analyses(context=Depends(library_context), q: str = Query(default=""),
                        cursor: str | None = Query(default=None),
                        limit: int = Query(default=20, ge=1, le=20),
                        scope: str = Query(default="owned")):
    store, owner = context
    return store.search_analyses(owner, q=q, cursor=cursor, limit=limit, scope=scope)


@router.get("/crm-analyses/{asset_id}", response_model=CrmAnalysis)
def read_crm_analysis(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.read(owner, "analysis", asset_id)


@router.patch("/crm-analyses/{asset_id}", response_model=CrmAnalysis)
def patch_crm_analysis(asset_id: str, body: CrmPatchAnalysis, context=Depends(library_context),
                       idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.patch_analysis(owner, idempotency_key, asset_id, body)


@router.get("/crm-analyses/{asset_id}/shares", response_model=CrmShareList)
def list_crm_analysis_shares(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.list_shares(owner, asset_id)


@router.post("/crm-analyses/{asset_id}/shares", response_model=CrmShareList)
def share_crm_analysis(asset_id: str, body: CrmShareRequest, context=Depends(library_context),
                       idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.share(owner, idempotency_key, asset_id, body.username)


@router.post("/crm-analyses/{asset_id}/shares/{username}/revoke", response_model=CrmShareList)
def revoke_crm_analysis_share(asset_id: str, username: str, context=Depends(library_context),
                              idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.unshare(owner, idempotency_key, asset_id, username)


@router.post("/crm-analyses/{asset_id}/knowledge-citations", response_model=CrmAnalysis)
def bind_crm_analysis_citations(asset_id: str, body: CrmBindCitations, context=Depends(library_context),
                                idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.bind_citations(owner, idempotency_key, asset_id, body)


@router.post("/crm-cockpit-references", response_model=CrmCockpitReference)
def add_crm_reference(body: CrmAddReference, context=Depends(library_context),
                      idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.pin(owner, idempotency_key, body)


@router.get("/crm-cockpit-references/{asset_id}", response_model=CrmCockpitReference)
def read_crm_reference(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.read(owner, "reference", asset_id)


@router.post("/crm-boards", response_model=CrmBoard)
def save_crm_board(body: CrmBoardWrite, context=Depends(library_context),
                   idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.save_board(owner, idempotency_key, body)


@router.get("/crm-boards", response_model=CrmBoardPage)
def search_crm_boards(context=Depends(library_context), q: str = Query(default=""),
                      cursor: str | None = Query(default=None),
                      limit: int = Query(default=20, ge=1, le=20)):
    store, owner = context
    return store.search_boards(owner, q=q, cursor=cursor, limit=limit)


@router.get("/crm-boards/{asset_id}", response_model=CrmBoard)
def read_crm_board(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.read(owner, "board", asset_id)


@router.patch("/crm-boards/{asset_id}", response_model=CrmBoard)
def patch_crm_board(asset_id: str, body: CrmBoardPatch, context=Depends(library_context),
                    idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.patch_board(owner, idempotency_key, asset_id, body)
