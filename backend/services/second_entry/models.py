"""Wire shapes for the second-entry dataset feature."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

DEFAULT_ROW_LIMIT = 1000
MAX_ROW_LIMIT = 5000


class DatasetColumn(BaseModel):
    """One stored column, with the physical DuckDB type."""

    name: str
    dtype: str


class DatasetMeta(BaseModel):
    """Metadata persisted in ``manifest.json`` and returned by the API."""

    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    filename: str
    columns: list[DatasetColumn]
    row_count: int = Field(ge=0)
    byte_size: int = Field(ge=0)
    created_at: datetime
    path: str


class DatasetPreview(BaseModel):
    """First rows of a dataset, shaped like a query result."""

    columns: list[str]
    rows: list[list[Any]]
    truncated: bool = False


class DatasetDetail(DatasetMeta):
    """Metadata plus a bounded preview for the detail endpoint."""

    preview: DatasetPreview


class QueryRequest(BaseModel):
    """Request body for ``POST /api/second-entry/query``."""

    dataset_id: str
    sql: str
    limit: int = Field(
        default=DEFAULT_ROW_LIMIT,
        ge=1,
        le=MAX_ROW_LIMIT,
        description="Maximum rows returned; server default 1000, hard maximum 5000.",
    )


class QueryResult(BaseModel):
    """Table-shaped read-only query response."""

    columns: list[str]
    rows: list[list[Any]]
    truncated: bool = False
