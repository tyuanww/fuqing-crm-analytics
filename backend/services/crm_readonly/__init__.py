"""Isolated CRM read-only adapter. Independent of legacy RFM cache and ETL."""

from backend.services.crm_readonly.adapter import CancelToken, CrmReadonlyAdapter, GrainRequest, GrainResult
from backend.services.crm_readonly.errors import CrmReadonlyError
from backend.services.crm_readonly.mapping import inventory_document
from backend.services.crm_readonly.registry import SourceRegistration, SourceRegistry
from backend.services.crm_readonly.synthetic import (
    archive_placeholder,
    build_synthetic_declared_orders_source,
    build_synthetic_grain_source,
)
from backend.services.crm_readonly.versions import MAPPING_VERSION, METRIC_VERSION

__all__ = [
    "CancelToken",
    "CrmReadonlyAdapter",
    "CrmReadonlyError",
    "GrainRequest",
    "GrainResult",
    "MAPPING_VERSION",
    "METRIC_VERSION",
    "SourceRegistration",
    "SourceRegistry",
    "archive_placeholder",
    "build_synthetic_declared_orders_source",
    "build_synthetic_grain_source",
    "inventory_document",
]
