"""Second-entry dataset HTTP API.

Scope: upload CSV/XLSX, list/inspect datasets, and run one read-only SELECT.
Authentication follows the existing router pattern: ``backend/main.py``'s
global ``auth_middleware`` protects every path except its explicit allowlist,
so this router declares no per-endpoint auth dependency (same as metrics.py).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile

from backend.services.second_entry import ingest as ingest_service
from backend.services.second_entry.models import (
    DatasetDetail,
    DatasetMeta,
    QueryRequest,
    QueryResult,
)
from backend.services.second_entry.query import dataset_preview, query_dataset
from backend.services.second_entry.store import DatasetStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/second-entry", tags=["第二入口 CSV/Excel"])


@router.post("/datasets", response_model=DatasetMeta)
async def upload_dataset(file: UploadFile = File(...)) -> DatasetMeta:
    """Upload a CSV/XLSX file and persist it as a queryable dataset."""
    try:
        content = await file.read(ingest_service.MAX_FILE_BYTES + 1)
    finally:
        await file.close()
    return ingest_service.ingest_upload(
        DatasetStore.from_env(),
        file.filename or "",
        content,
    )


@router.get("/datasets", response_model=list[DatasetMeta])
def list_datasets() -> list[DatasetMeta]:
    """List datasets known to the configured store."""
    return DatasetStore.from_env().list()


@router.get("/datasets/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: str) -> DatasetDetail:
    """Return one dataset's metadata plus a 10-row preview."""
    return dataset_preview(DatasetStore.from_env(), dataset_id, limit=10)


@router.post("/query", response_model=QueryResult)
def run_query(body: QueryRequest) -> QueryResult:
    """Run one read-only SELECT/WITH query against a single dataset."""
    return query_dataset(DatasetStore.from_env(), body)
