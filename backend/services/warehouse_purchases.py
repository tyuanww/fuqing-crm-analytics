from datetime import date

from pydantic import ValidationError

from backend.contracts.crm_dashboard import DashboardPurchases
from backend.contracts.warehouse_snapshot import WarehouseDateFilters
from backend.db.connection import get_connection
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases
from backend.services.warehouse_cache import AggregateCacheMissError, AggregateCacheUnavailableError, AggregateKey
from backend.services.warehouse_rfm import WarehouseQueryError
from backend.services.warehouse_runtime import current_warehouse_read
from backend.services.warehouse_source import WarehouseSourceUnavailableError


def get_warehouse_purchases(filters: WarehouseDateFilters) -> DashboardPurchases:
    frame = current_warehouse_read()
    if frame is None:
        raise WarehouseSourceUnavailableError("purchase aggregate requires a verified source")
    identity = frame.pin.identity
    if (not identity.data_start or not identity.data_cutoff
            or not date.fromisoformat(identity.data_start) <= filters.start_date <= filters.end_date <= date.fromisoformat(identity.data_cutoff)):
        raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "购买指标日期超出仓库覆盖范围")
    key = AggregateKey.for_query("purchases", identity, frame.semantic_revisions["purchases"], filters.model_dump(mode="json"))
    cached = frame.cache.get(key)
    if cached is not None:
        try:
            result = DashboardPurchases.model_validate(cached)
        except ValidationError as exc:
            raise AggregateCacheUnavailableError("purchase cache violates its result contract") from exc
        if result.filters.model_dump(mode="json") != filters.model_dump(mode="json"):
            raise AggregateCacheUnavailableError("purchase cache filters do not match the query")
        return result
    if frame.mode == "cache_only":
        raise AggregateCacheMissError("所选购买指标尚未预热")
    result = query_dashboard_purchases(get_connection(), filters)
    with frame.source.pin():
        frame.cache.put(key, result.model_dump(mode="json"))
    return result
