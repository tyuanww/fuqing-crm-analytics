"""Query-owned frozen result exchange; no SQLite/layout or plugin contracts."""
from typing import Literal
from datetime import datetime, time
from zoneinfo import ZoneInfo
from hashlib import sha256

from pydantic import field_serializer, model_validator

from backend.contracts.analytics import AnalyticsModel, OpaqueId
from backend.contracts.analytics_first_purchase import (
    FirstPurchaseQueryRequest, FirstPurchaseResult, QueryDateTime, Sha256Hex,
    REGISTERED_CHANNELS, canonical_rfc3339, canonical_json,
)

SOURCE_PREFIX = "/api/v1/analytics-first-purchase/sources"
SOURCE_SCHEMA = "first-purchase-frozen-source/v1"
SOURCE_BODY_LIMIT = 512 * 1024
SourceCapability = Literal["analysis:read", "analysis:save"]


class FirstPurchaseSourceRequest(AnalyticsModel):
    schema_version: Literal["first-purchase-source-request/v1"]
    run_id: OpaqueId
    capability: SourceCapability


class FirstPurchaseSourceResponse(AnalyticsModel):
    # All fields required on the wire. The consumer also checks a canonical
    # round trip so defaults/coercion in nested legacy models cannot repair input.
    schema_version: Literal["first-purchase-frozen-source/v1"]
    api_version: Literal["1.0.0"]
    run_id: OpaqueId
    owner_id: OpaqueId
    status: Literal["SUCCEEDED"]
    primary_result_ref: OpaqueId
    method_package_digest: Sha256Hex
    generated_at: QueryDateTime
    evidence_digest: Sha256Hex
    request: FirstPurchaseQueryRequest
    result: FirstPurchaseResult

    @field_serializer("generated_at")
    def serialize_generated_at(self, value):
        return canonical_rfc3339(value)

    @model_validator(mode="after")
    def frozen_binding(self):
        result, request = self.result, self.request
        if result.status != "OK" or result.facts is None:
            raise ValueError("source requires a completed operating result")
        if sha256(canonical_json(result.model_dump(mode="json")).encode()).hexdigest() != self.evidence_digest:
            raise ValueError("source evidence digest mismatch")
        filters = result.resolved_filters
        zone = ZoneInfo(request.timezone)
        if (datetime.combine(request.cohort_window.start_date, time.min, zone) != filters.resolved_cohort_start
                or datetime.combine(request.cohort_window.end_date, time.min, zone) != filters.resolved_cohort_end
                or request.observation_days != filters.observation_days
                or request.timezone != filters.timezone
                or request.data_snapshot_ref != result.data_snapshot_ref
                or sorted(request.channel_ids or REGISTERED_CHANNELS) != list(filters.channel_ids)):
            raise ValueError("source request/result binding mismatch")
        return self
