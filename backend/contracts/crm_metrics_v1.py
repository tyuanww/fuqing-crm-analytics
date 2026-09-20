"""Wire contract for CRM metrics v1. Isolated from legacy overview schemas."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

METRIC_VERSION = "crm-metrics/v1"
QUERY_VERSION = "crm-metrics-query/v1"
SCHEMA_VERSION = "crm-metrics-wire/v1"
RFM_THRESHOLD_VERSION = "crm-rfm-thresholds/v1"

QUERY_IDS = (
    "sales_window_summary",
    "existing_customer_repurchase",
    "sample_followup",
)
REFUND_VIEWS = ("ORDER_COHORT_AS_OF", "REFUND_FLOW")
MEMBERSHIP = ("MEMBER", "NON_MEMBER", "UNKNOWN")
BUYER_CLASS = ("NEW", "OLD", "UNKNOWN_HISTORY")


class CrmMetricsModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MoneyFact(CrmMetricsModel):
    value: int | None
    currency: Literal["CNY"] = "CNY"
    unit: Literal["minor"] = "minor"
    scale: Literal[2] = 2
    empty_reason: str | None = None


class RatioFact(CrmMetricsModel):
    value: float | None
    unit: Literal["raw_ratio_0_1", "raw_ratio_diff", "multiple"]
    empty_reason: str | None = None


class CountFact(CrmMetricsModel):
    value: int | None
    unit: Literal["integer"] = "integer"
    empty_reason: str | None = None


class MetricRequest(CrmMetricsModel):
    source_id: str
    contains_real_data: bool
    metric_version: Literal["crm-metrics/v1"]
    query_id: Literal[
        "sales_window_summary",
        "existing_customer_repurchase",
        "sample_followup",
    ]
    period_start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    period_end_exclusive: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    refund_view: Literal["ORDER_COHORT_AS_OF", "REFUND_FLOW"]
    refund_as_of: str
    data_through: str
    timezone: Literal["Asia/Shanghai"] = "Asia/Shanghai"
    channel_ids: list[str] | None = None
    product_ids: list[str] | None = None
    identity_scope: Literal["STOREWIDE"] = "STOREWIDE"
    observation_days: int | None = Field(default=None, ge=1, le=365)
    amount_already_net: bool = False
    cohort_period_start: str | None = None
    cohort_period_end_exclusive: str | None = None
    actor_scope: str = "server_filled"


class ResolvedFilters(CrmMetricsModel):
    period_start: str
    period_end_exclusive: str
    refund_view: str
    refund_as_of: str
    data_through: str
    timezone: str
    channel_ids: list[str] | None
    product_ids: list[str] | None
    identity_scope: str
    observation_days: int | None = None
    amount_already_net: bool
    cohort_period_start: str | None = None
    cohort_period_end_exclusive: str | None = None
    yoy_period_start: str | None = None
    yoy_period_end_exclusive: str | None = None


class Limitation(CrmMetricsModel):
    code: str
    message: str
    related_fact: str | None = None


class MetricResult(CrmMetricsModel):
    status: Literal["OK", "UNAVAILABLE"]
    schema_version: Literal["crm-metrics-wire/v1"] = SCHEMA_VERSION
    query_version: Literal["crm-metrics-query/v1"] = QUERY_VERSION
    source_id: str
    contains_real_data: bool
    synthetic: bool
    metric_version: Literal["crm-metrics/v1"]
    query_id: str
    metric_id: str
    data_version: str
    mapping_version: str
    data_through: str
    resolved_filters: ResolvedFilters
    facts: dict[str, Any]
    limitations: list[Limitation]
    query_ref: str
    decision_ids: list[str]
    implementation_status: Literal["synthetic_verified", "not_implemented", "source_unverified"]
    publication_status: Literal["local_isolated_candidate"] = "local_isolated_candidate"
    real_business_acceptance: bool = False
    production_release: bool = False
    adapter_query_ref: str | None = None
    adapter_version: str | None = None
    permission_version: str | None = None
    actor_scope: str | None = None
    source_data_through: str | None = None
    coverage_start: str | None = None
    history_complete: bool | None = None


class ExplainRequest(CrmMetricsModel):
    topic: str
    metric_version: Literal["crm-metrics/v1"] = METRIC_VERSION


class ExplainResult(CrmMetricsModel):
    topic: str
    metric_version: str
    definition_review_status: str
    implementation_status: str
    unit: str | None
    formula: str | None
    decision_ids: list[str]
    evidence_refs: list[str]
    conflicts: list[str]
    capabilities: list[str]
    missing: list[str]
    synthetic: bool = True
    publication_status: Literal["local_isolated_candidate"] = "local_isolated_candidate"
