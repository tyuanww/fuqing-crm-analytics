"""Versioned dashboard endpoint, registered under the existing authenticated API."""
from functools import lru_cache
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response

from backend.contracts.crm_analysis import CrmAddReference, CrmAnalysis, CrmCockpitReference, CrmLibrary, CrmSaveAnalysis, CrmSnapshot, CrmSnapshotRequest

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


@router.get("/crm-analyses/{asset_id}", response_model=CrmAnalysis)
def read_crm_analysis(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.read(owner, "analysis", asset_id)


@router.post("/crm-cockpit-references", response_model=CrmCockpitReference)
def add_crm_reference(body: CrmAddReference, context=Depends(library_context),
                      idempotency_key: str | None = Header(default=None)):
    store, owner = context
    return store.pin(owner, idempotency_key, body)


@router.get("/crm-cockpit-references/{asset_id}", response_model=CrmCockpitReference)
def read_crm_reference(asset_id: str, context=Depends(library_context)):
    store, owner = context
    return store.read(owner, "reference", asset_id)
