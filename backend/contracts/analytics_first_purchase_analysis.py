"""HTTP contract for saved first-purchase SNAPSHOT analyses.

Store documents keep http_api=NOT_CONNECTED. This surface is CONNECTED only.
Channel follow-up saved-analysis/v1 is a different family and is not accepted.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from backend.contracts.analytics import AnalyticsModel, OpaqueId
from backend.contracts.analytics_first_purchase import (
    DATA_VERSION,
    METRIC_ID,
    METRIC_VERSION,
    QUERY_ID,
    QUERY_VERSION,
    SNAPSHOT_ID,
    FirstPurchaseFacts,
    FirstPurchaseFixedWindow,
    FirstPurchaseQueryRequest,
    FirstPurchaseResolvedFilters,
    FirstPurchaseResult,
    QueryDateTime,
    Sha256Hex,
)

ANALYSIS_SCHEMA = "analytics-first-purchase-saved-analysis/v1"
VISUAL_SCHEMA = "analytics-visual-table/v1"
HTTP_API_CONNECTED = "CONNECTED"


class FirstPurchaseVisualSpec(AnalyticsModel):
    schema_version: Literal["analytics-visual-table/v1"] = VISUAL_SCHEMA
    kind: Literal["TABLE"] = "TABLE"


class FirstPurchaseAnalysisCreateRequest(AnalyticsModel):
    created_from_run_id: OpaqueId
    title: Annotated[str, Field(min_length=1, max_length=120)]
    visual_spec: FirstPurchaseVisualSpec | None = None

    @field_validator("title")
    @classmethod
    def title_text(cls, value: str) -> str:
        title = value.strip()
        if not title or any(ord(ch) < 32 or ord(ch) == 127 for ch in title):
            raise ValueError("title must be 1-120 characters without controls")
        return title


class FirstPurchaseAnalysisTitleRequest(AnalyticsModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]

    @field_validator("title")
    @classmethod
    def title_text(cls, value: str) -> str:
        return FirstPurchaseAnalysisCreateRequest.title_text(value)


class FirstPurchaseQueryRef(AnalyticsModel):
    query_id: Literal["first_purchase_product_path"] = QUERY_ID
    query_version: Literal["first-purchase-path-query/v1"] = QUERY_VERSION


class FirstPurchaseMetricRef(AnalyticsModel):
    metric_id: Literal["first_purchase_product_n_day_finished"] = METRIC_ID
    metric_version: Literal["first-purchase-path-metric/v1"] = METRIC_VERSION


class FirstPurchaseSavedSnapshot(AnalyticsModel):
    run_id: OpaqueId
    evidence_digest: Sha256Hex
    resolved_filters: FirstPurchaseResolvedFilters
    data_snapshot_ref: Literal["synthetic-first-purchase-v1"] = SNAPSHOT_ID
    as_of: str


class FirstPurchaseSavedAnalysis(AnalyticsModel):
    schema_version: Literal["analytics-first-purchase-saved-analysis/v1"] = ANALYSIS_SCHEMA
    analysis_id: OpaqueId
    version: Annotated[int, Field(strict=True, ge=1)]
    title: str
    query_ref: FirstPurchaseQueryRef
    metric_refs: list[FirstPurchaseMetricRef]
    filters: FirstPurchaseQueryRequest
    visual_spec: FirstPurchaseVisualSpec
    created_from_run_id: OpaqueId
    owner_id: OpaqueId
    visibility: Literal["PRIVATE"]
    endorsement: Literal["PERSONAL"]
    data_mode: Literal["SNAPSHOT"]
    snapshot: FirstPurchaseSavedSnapshot
    facts: FirstPurchaseFacts
    data_version: Literal["synthetic-first-purchase-data/v1"] = DATA_VERSION
    filter_hash: Sha256Hex
    limitations: list[str]
    created_at: str
    finite_mock: Literal[True]
    http_api: Literal["CONNECTED"] = HTTP_API_CONNECTED


class FirstPurchaseSavedAnalysisListItem(AnalyticsModel):
    schema_version: Literal["analytics-first-purchase-saved-analysis/v1"] = ANALYSIS_SCHEMA
    analysis_id: OpaqueId
    version: Annotated[int, Field(strict=True, ge=1)]
    title: str
    query_id: Literal["first_purchase_product_path"] = QUERY_ID
    observation_days: Literal[30, 60, 90]
    cohort_window: FirstPurchaseFixedWindow
    as_of: str
    data_mode: Literal["SNAPSHOT"]
    visibility: Literal["PRIVATE"]
    finite_mock: Literal[True]
    http_api: Literal["CONNECTED"] = HTTP_API_CONNECTED


class FirstPurchaseSavedAnalysisList(AnalyticsModel):
    schema_version: Literal["analytics-first-purchase-saved-analysis/v1"] = ANALYSIS_SCHEMA
    items: list[FirstPurchaseSavedAnalysisListItem]


class FirstPurchaseSaveIdentity(AnalyticsModel):
    """Correlation, not authorization or proof that a candidate is approved."""

    schema_version: Literal["analytics-first-purchase-save-identity/v1"]
    action_id: OpaqueId
    candidate_digest: Sha256Hex
    correlation_id: OpaqueId


class FirstPurchaseAnalysisRef(AnalyticsModel):
    analysis_id: OpaqueId
    version: Annotated[int, Field(strict=True, ge=1)]


class FirstPurchaseSaveSourceRef(AnalyticsModel):
    service_owner: Literal["analytics-first-purchase"] = "analytics-first-purchase"
    data_scope: Literal["first-purchase-fixture"] = "first-purchase-fixture"
    created_from_run_id: OpaqueId
    evidence_digest: Sha256Hex


class FirstPurchaseSaveReceiptBase(AnalyticsModel):
    schema_version: Literal["analytics-first-purchase-save-receipt/v1"] = "analytics-first-purchase-save-receipt/v1"
    api_version: Literal["1.0.0"] = "1.0.0"
    service_owner: Literal["analytics-first-purchase"] = "analytics-first-purchase"
    state_schema_version: Literal[1] = 1
    identity: FirstPurchaseSaveIdentity
    idempotency_key: Annotated[str, Field(min_length=1, max_length=200, pattern=r"^[!-~]+$")]
    owner_id: OpaqueId
    finite_mock: Literal[True] = True


class FirstPurchaseSavedReceipt(FirstPurchaseSaveReceiptBase):
    status: Literal["SAVED"] = "SAVED"
    analysis_ref: FirstPurchaseAnalysisRef
    source_ref: FirstPurchaseSaveSourceRef
    durable_state_key: Annotated[str, Field(min_length=1, max_length=256)]
    reason: None = None

    @model_validator(mode="after")
    def state_key_matches_ref(self):
        expected = f"first-purchase-analysis:{self.analysis_ref.analysis_id}:{self.analysis_ref.version}"
        if self.durable_state_key != expected:
            raise ValueError("durable state key must name the immutable analysis version")
        return self


class FirstPurchaseUnknownSaveReceipt(FirstPurchaseSaveReceiptBase):
    """No committed receipt visible; never proof that a request was not received."""

    status: Literal["SAVE_UNKNOWN"] = "SAVE_UNKNOWN"
    analysis_ref: None = None
    source_ref: None = None
    durable_state_key: None = None
    reason: Literal["RECEIPT_NOT_FOUND"] = "RECEIPT_NOT_FOUND"


FirstPurchaseSaveReceipt = Annotated[
    FirstPurchaseSavedReceipt | FirstPurchaseUnknownSaveReceipt, Field(discriminator="status"),
]


class FirstPurchaseSaveInspectRequest(AnalyticsModel):
    schema_version: Literal["analytics-first-purchase-save-inspect/v1"]
    identity: FirstPurchaseSaveIdentity
    created_from_run_id: OpaqueId


class FirstPurchaseSaveCommand(FirstPurchaseAnalysisCreateRequest):
    schema_version: Literal["analytics-first-purchase-save-command/v1"]
    identity: FirstPurchaseSaveIdentity
    evidence_digest: Sha256Hex


class FirstPurchaseFreshness(AnalyticsModel):
    """NOT_CHECKED records an explicit server policy, never a fresh-time claim."""

    freshness_state: Literal["FRESH", "STALE", "EXPIRED", "UNKNOWN", "NOT_CHECKED"]
    freshness_checked_at: QueryDateTime
    freshness_stale_at: QueryDateTime | None
    freshness_expires_at: QueryDateTime | None
    policy_version: OpaqueId | None
    max_age_ms: Annotated[int, Field(strict=True, gt=0)] | None
    expires_after_ms: Annotated[int, Field(strict=True, gt=0)] | None
    reason: Literal["WITHIN_WINDOW", "MAX_AGE_REACHED", "EXPIRED", "POLICY_NOT_CONFIGURED",
                    "GENERATION_TIME_UNAVAILABLE", "CLOCK_BEFORE_GENERATION", "DISABLED_BY_POLICY"]

    @model_validator(mode="after")
    def explicit_time_policy(self):
        windows = (self.max_age_ms, self.expires_after_ms, self.freshness_stale_at, self.freshness_expires_at)
        if self.freshness_state == "NOT_CHECKED" or self.reason == "DISABLED_BY_POLICY":
            if (self.freshness_state != "NOT_CHECKED" or self.reason != "DISABLED_BY_POLICY"
                    or self.policy_version is None or any(value is not None for value in windows)):
                raise ValueError("unchecked age requires an explicit policy and no time windows")
        elif self.policy_version is None:
            if (self.freshness_state != "UNKNOWN" or self.reason != "POLICY_NOT_CONFIGURED"
                    or any(value is not None for value in windows)):
                raise ValueError("missing policy cannot establish freshness")
        elif (self.max_age_ms is None or self.expires_after_ms is None
              or not self.max_age_ms < self.expires_after_ms <= 2_147_483_647):
            raise ValueError("checked age requires positive ordered time windows")
        return self


class FirstPurchasePermissionScope(AnalyticsModel):
    owner_id: OpaqueId
    data_scope: Literal["first-purchase-fixture"] = "first-purchase-fixture"
    can_read: bool
    can_save: bool


class FirstPurchaseProvenanceSourceRefs(FirstPurchaseSaveSourceRef):
    primary_result_ref: OpaqueId | None
    method_package_digest: Sha256Hex | None


class FirstPurchaseSaveProvenance(AnalyticsModel):
    environment: Literal["synthetic"] = "synthetic"
    data_time_window: FirstPurchaseFixedWindow
    query_scope: FirstPurchaseResolvedFilters
    permission_scope: FirstPurchasePermissionScope
    source_refs: FirstPurchaseProvenanceSourceRefs
    candidate_digest: Sha256Hex
    generated_at: QueryDateTime | None
    freshness: FirstPurchaseFreshness


FirstPurchaseSaveReason = Literal[
    "ALREADY_SAVED", "PROVENANCE_INCOMPLETE", "PERMISSION_DENIED", "CANDIDATE_NOT_ADMITTED",
    "POLICY_NOT_CONFIGURED", "RESULT_STALE", "RESULT_EXPIRED", "FRESHNESS_UNKNOWN",
]


class FirstPurchaseSaveResult(AnalyticsModel):
    """Separate envelope; native receipt/v1 and cockpit PINNED keep their meaning."""

    schema_version: Literal["analytics-first-purchase-save-result/v1"] = "analytics-first-purchase-save-result/v1"
    api_version: Literal["1.0.0"] = "1.0.0"
    identity: FirstPurchaseSaveIdentity
    result_state: Literal["SUCCESS_UNSAVED", "SAVED", "PARTIAL"]
    result: FirstPurchaseResult
    provenance: FirstPurchaseSaveProvenance
    save_eligible: bool
    save_ineligible_reason: FirstPurchaseSaveReason | None
    finite_mock: Literal[True] = True

    @model_validator(mode="after")
    def coherent_eligibility(self):
        if self.identity.candidate_digest != self.provenance.candidate_digest:
            raise ValueError("identity and provenance must bind the same candidate")
        if self.save_eligible:
            if (self.result_state != "SUCCESS_UNSAVED" or self.result.status != "OK"
                    or self.provenance.freshness.freshness_state not in {"FRESH", "NOT_CHECKED"}
                    or not self.provenance.permission_scope.can_save
                    or not self.provenance.permission_scope.can_read
                    or self.provenance.generated_at is None
                    or self.provenance.source_refs.primary_result_ref is None
                    or self.provenance.source_refs.method_package_digest is None
                    or self.save_ineligible_reason is not None):
                raise ValueError("only a complete authorized result allowed by its time policy can be eligible")
        elif self.save_ineligible_reason is None:
            raise ValueError("an ineligible result must explain why")
        return self


class FirstPurchaseSavedProvenance(AnalyticsModel):
    """Immutable evidence at save time, not a fresh authorization to save again."""

    schema_version: Literal["analytics-first-purchase-saved-provenance/v1"] = "analytics-first-purchase-saved-provenance/v1"
    api_version: Literal["1.0.0"] = "1.0.0"
    analysis_ref: FirstPurchaseAnalysisRef
    identity: FirstPurchaseSaveIdentity
    provenance: FirstPurchaseSaveProvenance
    finite_mock: Literal[True] = True

    @model_validator(mode="after")
    def saved_evidence_is_complete(self):
        p = self.provenance
        if (self.identity.candidate_digest != p.candidate_digest or p.generated_at is None
                or p.freshness.freshness_state not in {"FRESH", "NOT_CHECKED"} or not p.permission_scope.can_read
                or not p.permission_scope.can_save or p.source_refs.primary_result_ref is None
                or p.source_refs.method_package_digest is None):
            raise ValueError("saved provenance must preserve the complete admitted save observation")
        return self
