"""Second-entry CSV/Excel datasets and read-only SQL.

Public surface:
- ``DatasetMeta`` / ``QueryResult`` request and response shapes
- ``DatasetStore`` manifest-backed storage
- ``ingest_upload`` CSV/XLSX ingestion
- ``query_dataset`` / ``get_dataset_detail`` read-only query helpers
"""

from backend.services.second_entry.ingest import (
    MAX_COLUMNS,
    MAX_FILE_BYTES,
    MAX_ROWS,
    ingest_upload,
)
from backend.services.second_entry.models import (
    DatasetColumn,
    DatasetDetail,
    DatasetMeta,
    DatasetPreview,
    QueryRequest,
    QueryResult,
)
from backend.services.second_entry.query import (
    DEFAULT_ROW_LIMIT,
    MAX_ROW_LIMIT,
    dataset_preview,
    execute_readonly_sql,
    query_dataset,
    validate_readonly_sql,
)
from backend.services.second_entry.store import DatasetStore

__all__ = [
    "DatasetColumn",
    "DatasetDetail",
    "DatasetMeta",
    "DatasetPreview",
    "DatasetStore",
    "DEFAULT_ROW_LIMIT",
    "MAX_COLUMNS",
    "MAX_FILE_BYTES",
    "MAX_ROW_LIMIT",
    "MAX_ROWS",
    "QueryRequest",
    "QueryResult",
    "dataset_preview",
    "execute_readonly_sql",
    "ingest_upload",
    "query_dataset",
    "validate_readonly_sql",
]
