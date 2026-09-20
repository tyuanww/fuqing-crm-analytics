"""Read-only grain adapter. Does not compute AUS/AOV or write the archive."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any

from backend.services.crm_readonly.cache import IndependentResultCache, cache_key
from backend.services.crm_readonly.connection import OwnedConnection, close_owner, open_readonly_owner
from backend.services.crm_readonly.errors import (
    CancelledError,
    ForbiddenError,
    MetricNotApprovedError,
    NotConnectedError,
    SchemaMismatchError,
    SqlRejectedError,
    UnsupportedMetricError,
)
from backend.services.crm_readonly.fs import make_private_directory
from backend.services.crm_readonly.normalize import (
    assess_unavailability,
    declared_line,
    grain_line,
    grain_refund,
    limitation,
)
from backend.services.crm_readonly.permissions import bind_actor_scope, permission_version
from backend.services.crm_readonly.queries import (
    DECLARED_LINES_SQL,
    DECLARED_REFUNDS_SQL,
    GRAIN_LINES_SQL,
    GRAIN_REFUNDS_SQL,
    META_SQL,
    fetch_capped,
    business_time,
    bound_filters,
    line_params,
    refund_params,
)
from backend.services.crm_readonly.registry import SourceRegistry
from backend.services.crm_readonly.resources import MAX_CHANNEL_FILTERS, MAX_PRODUCT_FILTERS
from backend.services.crm_readonly.schema import inspect_schema
from backend.services.crm_readonly.versions import (
    ADAPTER_VERSION,
    MAPPING_VERSION,
    METRIC_VERSION,
    ORDER_LINE_FIELDS,
    QUERY_IDS,
    REFUND_EVENT_FIELDS,
)


@dataclass
class GrainRequest:
    source_id: str
    contains_real_data: bool
    metric_version: str
    query_id: str
    period_start: str
    period_end_exclusive: str
    refund_view: str
    refund_as_of: str
    data_through: str
    timezone: str = "Asia/Shanghai"
    channel_ids: list[str] | None = None
    product_ids: list[str] | None = None
    identity_scope: str = "STOREWIDE"
    observation_days: int | None = None
    amount_already_net: bool = False
    actor_scope: str = "server_filled"
    cohort_period_start: str | None = None
    cohort_period_end_exclusive: str | None = None
    path: str | None = None
    sql: str | None = None


@dataclass
class GrainResult:
    status: str
    source_id: str
    contains_real_data: bool
    synthetic: bool
    metric_version: str
    query_id: str
    mapping_version: str
    schema_version: str
    data_version: str
    data_through: str
    permission_version: str
    actor_scope: str
    resolved_filters: dict[str, Any]
    order_lines: list[dict[str, Any]]
    refund_events: list[dict[str, Any]]
    limitations: list[dict[str, Any]]
    query_ref: str
    implementation_status: str
    publication_status: str = "local_isolated_candidate"
    adapter_version: str = ADAPTER_VERSION
    real_database_connected: bool = False
    cache_hit: bool = False
    history_complete: bool = False
    coverage_start: str | None = None
    source_data_through: str | None = None
    capabilities: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        payload = {name: getattr(self, name) for name in self.__dataclass_fields__}
        payload.update({
            "order_line_fields": list(ORDER_LINE_FIELDS),
            "refund_event_fields": list(REFUND_EVENT_FIELDS),
        })
        return payload

    @classmethod
    def from_cache(cls, payload: dict[str, Any]) -> GrainResult:
        fields = {name: payload[name] for name in cls.__dataclass_fields__}
        fields["cache_hit"] = True
        return cls(**fields)

    def as_cache_payload(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__dataclass_fields__}


class CancelToken:
    def __init__(self) -> None:
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True


class CrmReadonlyAdapter:
    def __init__(
        self,
        registry: SourceRegistry,
        *,
        cache_dir: Path,
        temp_dir: Path,
        server_scope: str,
    ):
        self.registry = registry
        self.cache = IndependentResultCache(cache_dir)
        self.temp_dir = make_private_directory(temp_dir)
        self.server_scope = server_scope

    def materialize(self, request: GrainRequest, *, cancel: CancelToken | None = None) -> GrainResult:
        if request.path is not None or request.sql is not None:
            raise SqlRejectedError("arbitrary path and SQL are rejected")
        if request.metric_version != METRIC_VERSION:
            raise MetricNotApprovedError("metric_version is not crm-metrics/v1")
        if request.query_id not in QUERY_IDS:
            raise UnsupportedMetricError("query_id is not in the v1 set")
        if request.timezone != "Asia/Shanghai":
            raise ForbiddenError("timezone is not the contracted Asia/Shanghai")
        if request.identity_scope != "STOREWIDE":
            raise ForbiddenError("identity_scope is not STOREWIDE")
        if request.refund_view not in {"ORDER_COHORT_AS_OF", "REFUND_FLOW"}:
            raise ForbiddenError("refund_view is not contracted")
        actor = bind_actor_scope(request.actor_scope, server_scope=self.server_scope)
        source = self.registry.require_openable(request.source_id, want_real=request.contains_real_data)
        if actor != source.permission_scope:
            raise ForbiddenError("permission scope does not match the registered source")
        if cancel is not None and cancel.cancelled:
            raise CancelledError("query cancelled")

        conn = OwnedConnection(open_readonly_owner(source.path, self.temp_dir))
        try:
            inspected = inspect_schema(conn, kind=source.kind)
            meta_rows = fetch_capped(conn, META_SQL, [])
            if len(meta_rows) != 1:
                raise SchemaMismatchError("crm_source_meta must have exactly one row")
            meta = meta_rows[0]
            if bool(meta["contains_real_data"]):
                raise NotConnectedError("source meta claims real data")
            data_version = str(meta["data_version"])
            schema_version = str(inspected["schema_version"])
            # Caller filters describe reported facts, never the history/followup read set.
            bound_filters(request.channel_ids, cap=MAX_CHANNEL_FILTERS)
            bound_filters(request.product_ids, cap=MAX_PRODUCT_FILTERS)
            start = business_time(request.period_start)
            end = business_time(request.period_end_exclusive)
            if end <= start:
                raise SqlRejectedError("period_end_exclusive must be after period_start")
            water = min(business_time(request.data_through), business_time(str(meta["data_through"])))
            cutoff = min(business_time(request.refund_as_of), water)
            history_start = business_time(str(meta["coverage_start"]))
            read_start = history_start
            read_end = min(end, water)
            if request.query_id == "sample_followup":
                cohort_start = business_time(request.cohort_period_start or request.period_start)
                cohort_end = business_time(request.cohort_period_end_exclusive or request.period_end_exclusive)
                days = request.observation_days or 14
                if not 1 <= days <= 365 or cohort_end <= cohort_start:
                    raise SqlRejectedError("invalid cohort window")
                read_start = max(cohort_start, history_start)
                read_end = min(cohort_end + timedelta(days=days - 1), water)
            resolved = {
                "period_start": request.period_start,
                "period_end_exclusive": request.period_end_exclusive,
                "refund_view": request.refund_view,
                "refund_as_of": cutoff.isoformat(),
                "data_through": water.isoformat(),
                "timezone": request.timezone,
                "channel_ids": list(request.channel_ids) if request.channel_ids else None,
                "product_ids": list(request.product_ids) if request.product_ids else None,
                "identity_scope": request.identity_scope,
                "observation_days": request.observation_days,
                "amount_already_net": bool(meta["amount_already_net"]),
                "requested_amount_already_net": request.amount_already_net,
                "query_id": request.query_id,
                "cohort_period_start": request.cohort_period_start,
                "cohort_period_end_exclusive": request.cohort_period_end_exclusive,
                "history_complete": bool(meta["history_complete"]),
                "coverage_start": str(meta["coverage_start"]),
                "source_data_through": str(meta["data_through"]),
                "read_start": read_start.isoformat(),
                "read_end_exclusive": read_end.isoformat(),
                "adapter_version": ADAPTER_VERSION,
            }
            key = cache_key(
                source_id=source.source_id,
                data_version=data_version,
                schema_version=schema_version,
                mapping_version=MAPPING_VERSION,
                metric_version=METRIC_VERSION,
                permission_version=permission_version(),
                actor_scope=actor,
                resolved_filters=resolved,
                refund_as_of=cutoff.isoformat(),
            )
            cached = self.cache.get(key)
            if cached is not None:
                return GrainResult.from_cache(cached)

            if source.kind == "SYNTHETIC_CONTRACT_GRAIN":
                raw_lines = [] if read_end <= read_start else fetch_capped(conn, GRAIN_LINES_SQL, line_params(
                    read_start.isoformat(), read_end.isoformat(), [], []
                ))
                raw_refunds = fetch_capped(
                    conn, GRAIN_REFUNDS_SQL, refund_params(cutoff.isoformat(), sorted({str(row["order_id"]) for row in raw_lines}))
                )
                lines = [grain_line(row) for row in raw_lines]
                refunds = [grain_refund(row) for row in raw_refunds]
                extra_limits: list[dict] = []
            else:
                raw_lines = [] if read_end <= read_start else fetch_capped(conn, DECLARED_LINES_SQL, line_params(
                    read_start.isoformat(), read_end.isoformat(), [], []
                ))
                extra_limits = []
                lines = []
                for index, row in enumerate(raw_lines):
                    mapped, limits = declared_line(row, amount_unit=str(meta["amount_unit"]), index=index)
                    lines.append(mapped)
                    extra_limits.extend(limits)
                if inspected.get("has_refund_table"):
                    raw_refunds = fetch_capped(
                        conn, DECLARED_REFUNDS_SQL, refund_params(cutoff.isoformat(), sorted({str(row["order_id"]) for row in raw_lines}))
                    )
                    refunds = [grain_refund(row) for row in raw_refunds]
                else:
                    refunds = []
                    extra_limits.append(
                        limitation("MISSING_REFUND_LINES", "declared source has no refund event table", "refund_event")
                    )
            if cancel is not None and cancel.cancelled:
                raise CancelledError("query cancelled")
            limits = extra_limits + assess_unavailability(
                lines=lines,
                refunds=refunds,
                history_complete=bool(meta["history_complete"]),
                has_refund_lines=bool(inspected.get("has_refund_lines")),
                amount_already_net=bool(resolved["amount_already_net"]),
            )
            if water < business_time(request.data_through):
                limits.append(limitation("DATA_WATERMARK_CLAMPED", "effective data_through is capped by source availability", "data_through"))
            if cutoff < business_time(request.refund_as_of):
                limits.append(limitation("REFUND_CUTOFF_CLAMPED", "refund cutoff is capped by available data", "refund_as_of"))
            if request.amount_already_net and not meta["amount_already_net"]:
                limits.append(limitation("AMOUNT_SEMANTICS_MISMATCH", "caller cannot override source amount semantics", "amount_already_net"))
            capabilities = ["order_line_grain", "refund_event_grain"]
            if not inspected.get("has_refund_lines"):
                capabilities = ["order_line_grain", "order_net_only"]
            query_ref = "crmq_" + hashlib.sha256(key.encode()).hexdigest()[:24]
            result = GrainResult(
                status="OK" if not any(item["code"] in {"D019_SOURCE_UNVERIFIED", "AMOUNT_ALREADY_NET_CONFLICT", "AMOUNT_SEMANTICS_MISMATCH"} for item in limits) else "UNAVAILABLE",
                source_id=source.source_id,
                contains_real_data=False,
                synthetic=True,
                metric_version=METRIC_VERSION,
                query_id=request.query_id,
                mapping_version=MAPPING_VERSION,
                schema_version=schema_version,
                data_version=data_version,
                data_through=water.isoformat(),
                source_data_through=str(meta["data_through"]),
                history_complete=bool(meta["history_complete"]),
                coverage_start=str(meta["coverage_start"]),
                permission_version=permission_version(),
                actor_scope=actor,
                resolved_filters=resolved,
                order_lines=lines,
                refund_events=refunds,
                limitations=limits,
                query_ref=query_ref,
                implementation_status="synthetic_verified",
                cache_hit=False,
                capabilities=capabilities,
            )
            # Missing mapped status/amount is unavailable, not a guessed zero.
            if any(line.get("gross_paid_minor") is None or line.get("status") is None for line in lines):
                result.status = "UNAVAILABLE"
            self.cache.set(
                key,
                envelope={
                    "source_id": source.source_id,
                    "data_version": data_version,
                    "schema_version": schema_version,
                    "mapping_version": MAPPING_VERSION,
                    "metric_version": METRIC_VERSION,
                    "permission_version": permission_version(),
                    "actor_scope": actor,
                    "resolved_filters": resolved,
                    "refund_as_of": cutoff.isoformat(),
                },
                payload=result.as_cache_payload(),
            )
            return result
        finally:
            close_owner(conn)
