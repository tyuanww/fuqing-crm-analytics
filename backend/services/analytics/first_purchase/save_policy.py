"""Service-owned D15 admission. No DSH, release journal or production defaults."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from backend.contracts.analytics_first_purchase import FirstPurchaseResult, parse_query_datetime
from backend.contracts.analytics_first_purchase_analysis import (
    FirstPurchaseFreshness,
    FirstPurchasePermissionScope,
    FirstPurchaseProvenanceSourceRefs,
    FirstPurchaseSaveIdentity,
    FirstPurchaseSaveProvenance,
    FirstPurchaseSaveResult,
)
from backend.services.analytics.access import AnalyticsPrincipal
from backend.services.analytics.first_purchase.asset_state import opaque, sha256_hex
from backend.services.analytics.first_purchase.source import FirstPurchaseTrustedSource


@dataclass(frozen=True)
class FirstPurchaseSavePolicy:
    """Explicit server configuration; client digests never populate admission.

    The deploy owner must admit reviewed candidates outside this service. Test
    policy windows are not measured production SLAs. Replace this immutable
    value to revoke a candidate; every new write reads the provider again.
    """

    policy_version: str
    admitted_candidates: frozenset[str]
    max_age_ms: int
    expires_after_ms: int

    def __post_init__(self):
        opaque(self.policy_version, label="policy_version")
        if type(self.admitted_candidates) is not frozenset:
            raise ValueError("candidate admission must be an immutable set")
        for digest in self.admitted_candidates:
            sha256_hex(digest, label="candidate_digest")
        if (type(self.max_age_ms) is not int or type(self.expires_after_ms) is not int
                or not 0 < self.max_age_ms < self.expires_after_ms <= 2_147_483_647):
            raise ValueError("explicit positive ordered millisecond windows are required")


def result_envelope(
    source: FirstPurchaseTrustedSource, principal: AnalyticsPrincipal, identity: FirstPurchaseSaveIdentity,
    policy: FirstPurchaseSavePolicy | None, *, checked_ms: int, already_saved: bool,
) -> FirstPurchaseSaveResult:
    result = FirstPurchaseResult.model_validate(source.result)
    checked_at = datetime.fromtimestamp(checked_ms / 1000, tz=timezone.utc)
    generated_at = None if source.generated_at is None else parse_query_datetime(source.generated_at)
    stale_at = expires_at = None
    state, reason = "UNKNOWN", "POLICY_NOT_CONFIGURED"
    if policy is not None:
        reason = "GENERATION_TIME_UNAVAILABLE"
        if generated_at is not None:
            stale_at = generated_at + timedelta(milliseconds=policy.max_age_ms)
            expires_at = generated_at + timedelta(milliseconds=policy.expires_after_ms)
            if checked_at < generated_at:
                reason = "CLOCK_BEFORE_GENERATION"
            elif checked_at >= expires_at:
                state, reason = "EXPIRED", "EXPIRED"
            elif checked_at >= stale_at:
                state, reason = "STALE", "MAX_AGE_REACHED"
            else:
                state, reason = "FRESH", "WITHIN_WINDOW"
    permission = FirstPurchasePermissionScope(
        owner_id=principal.actor_id,
        can_read="analysis:read" in principal.capabilities and "first-purchase-fixture" in principal.data_scopes,
        can_save="analysis:save" in principal.capabilities and "first-purchase-fixture" in principal.data_scopes,
    )
    complete = bool(generated_at and source.primary_result_ref and source.method_package_digest)
    if already_saved:
        blocked = "ALREADY_SAVED"
    elif not complete:
        blocked = "PROVENANCE_INCOMPLETE"
    elif not permission.can_read or not permission.can_save:
        blocked = "PERMISSION_DENIED"
    elif policy is None:
        blocked = "POLICY_NOT_CONFIGURED"
    elif identity.candidate_digest not in policy.admitted_candidates:
        blocked = "CANDIDATE_NOT_ADMITTED"
    else:
        blocked = {"STALE": "RESULT_STALE", "EXPIRED": "RESULT_EXPIRED", "UNKNOWN": "FRESHNESS_UNKNOWN"}.get(state)
    return FirstPurchaseSaveResult(
        identity=identity, result_state="SAVED" if already_saved else "SUCCESS_UNSAVED" if complete else "PARTIAL",
        result=result,
        provenance=FirstPurchaseSaveProvenance(
            data_time_window=source.request["cohort_window"], query_scope=result.resolved_filters,
            permission_scope=permission,
            source_refs=FirstPurchaseProvenanceSourceRefs(
                created_from_run_id=source.run_id, evidence_digest=source.evidence_digest,
                primary_result_ref=source.primary_result_ref, method_package_digest=source.method_package_digest,
            ),
            candidate_digest=identity.candidate_digest, generated_at=generated_at,
            freshness=FirstPurchaseFreshness(
                freshness_state=state, freshness_checked_at=checked_at,
                freshness_stale_at=stale_at, freshness_expires_at=expires_at,
                policy_version=policy.policy_version if policy else None,
                max_age_ms=policy.max_age_ms if policy else None,
                expires_after_ms=policy.expires_after_ms if policy else None, reason=reason,
            ),
        ),
        save_eligible=blocked is None, save_ineligible_reason=blocked,
    )
