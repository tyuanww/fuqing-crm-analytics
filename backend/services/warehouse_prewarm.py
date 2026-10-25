from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta
import hashlib
import math
import time
from typing import Callable, Literal

from backend.semantic.time import PeriodBuilder, shift_year_clamped
from backend.services.health.rfm_analysis.precompute_plan import (
    RfmPrecomputePolicy, RfmPrecomputeQuery, build_precompute_plan,
)
from backend.services.warehouse_cache import AggregateCacheMissError, canonical
from backend.services.warehouse_rfm import FIXED_PERIODS, WarehouseQueryError, resolve_verified_ranges
from backend.services.warehouse_runtime import WarehouseRuntime


Family = Literal["product", "analysis", "r", "f", "m"]
FAMILIES: tuple[Family, ...] = ("product", "analysis", "r", "f", "m")


@dataclass(frozen=True)
class FixedPeriodQuery:
    period: str
    anchor: str
    channel: str | None
    metric_type: str
    exclude_channels: tuple[str, ...]
    compare_mode: str

    def __post_init__(self):
        if self.period not in FIXED_PERIODS or self.compare_mode not in {"default", "auto_mom"}:
            raise ValueError("invalid fixed-period prewarm query")
        date.fromisoformat(self.anchor)

    @property
    def windows(self):
        return getattr(PeriodBuilder, self.period)(today=date.fromisoformat(self.anchor))

    @property
    def start(self) -> str:
        return self.windows["current"].start

    @property
    def end(self) -> str:
        return self.windows["current"].end

    @property
    def empty(self) -> bool:
        return any(value.empty for value in self.windows.values())

    @property
    def comparison(self) -> tuple[str | None, str | None]:
        if self.compare_mode == "default":
            return None, None
        previous = PeriodBuilder.mom(self.start, self.end)
        return previous.start, previous.end

    @property
    def ranges(self) -> dict:
        return resolve_verified_ranges(self.period, None, None, *self.comparison, today=date.fromisoformat(self.anchor))


@dataclass(frozen=True)
class WarmRequest:
    family: Family
    query: RfmPrecomputeQuery | FixedPeriodQuery

    @property
    def request_id(self) -> str:
        return hashlib.sha256(canonical(asdict(self)).encode()).hexdigest()


@dataclass(frozen=True)
class WarmPlan:
    source_revision: str
    semantic_revisions: tuple[tuple[str, str], ...]
    requests: tuple[WarmRequest, ...]

    @property
    def digest(self) -> str:
        return hashlib.sha256(canonical(asdict(self)).encode()).hexdigest()


@dataclass(frozen=True)
class WarmBudget:
    max_new_results: int
    max_seconds: float

    def __post_init__(self):
        if self.max_new_results < 0 or not math.isfinite(self.max_seconds) or self.max_seconds <= 0:
            raise ValueError("prewarm requires a nonnegative item limit and positive finite duration")


@dataclass(frozen=True)
class WarmOutcome:
    request_id: str
    status: Literal["READY", "INSUFFICIENT_COVERAGE", "PENDING", "FAILED"]
    computed: bool = False
    error_code: str | None = None


@dataclass(frozen=True)
class WarmReport:
    plan_digest: str
    source_revision: str
    outcomes: tuple[WarmOutcome, ...]
    elapsed_seconds: float

    @property
    def complete(self) -> bool:
        return any(value.status == "READY" for value in self.outcomes) and all(
            value.status in {"READY", "INSUFFICIENT_COVERAGE"} for value in self.outcomes
        )

    def summary(self) -> dict:
        return {
            "plan_digest": self.plan_digest, "source_revision": self.source_revision,
            "expected": len(self.outcomes), "complete": self.complete,
            "counts": {status: sum(value.status == status for value in self.outcomes)
                       for status in ("READY", "INSUFFICIENT_COVERAGE", "PENDING", "FAILED")},
            "computed": sum(value.computed for value in self.outcomes),
            "elapsed_seconds": self.elapsed_seconds,
        }


def _supports_product(query: RfmPrecomputeQuery) -> bool:
    if query.metric_type != "GSV" or query.empty:
        return False
    return all(
        0 <= (date.fromisoformat(values[1][:10]) - date.fromisoformat(values[0][:10])).days < 90
        for name, values in query.ranges.items() if name in {"current", "comp"}
    )


def build_warm_plan(
    runtime: WarehouseRuntime, *, policy: RfmPrecomputePolicy = RfmPrecomputePolicy(),
    families: tuple[Family, ...] = FAMILIES,
) -> WarmPlan:
    if not families or len(set(families)) != len(families) or not set(families) <= set(FAMILIES):
        raise ValueError("prewarm families must be nonempty, unique and supported")
    with runtime.read() as frame:
        identity = frame.pin.identity
        if not identity.data_start or not identity.data_cutoff:
            raise ValueError("prewarm requires a nonempty warehouse")
        catalog = build_precompute_plan(date.fromisoformat(identity.data_start),
                                        date.fromisoformat(identity.data_cutoff), policy=policy)
        requests = tuple(
            WarmRequest(family, query)
            for query in catalog.queries for family in families
            if family != "product" or _supports_product(query)
        )
        cutoff = date.fromisoformat(identity.data_cutoff)
        fixed = tuple(
            WarmRequest(family, FixedPeriodQuery(name, (shift_year_clamped(cutoff, years) + timedelta(days=1)).isoformat(),
                                                 channel, metric, excluded, mode))
            for years in range((policy.lookback_months + 11) // 12)
            for name in FIXED_PERIODS for metric in policy.metric_types for channel in policy.channels
            for excluded in policy.exclude_sets for mode in policy.compare_modes
            for family in families if family != "product"
        )
        requests = fixed + requests
        return WarmPlan(identity.revision, tuple(sorted(runtime.semantic_revisions.items())), requests)


def _call(request: WarmRequest) -> dict:
    from backend.contracts.category import ProductCustomerResponseV3
    from backend.contracts.rfm import RFMAnalysisResponse, RFMRFlowResponse, RFMFRFlowResponse, RFMMFlowResponse
    from backend.services.category_service.product_customer import get_product_customer_overview
    from backend.services.health.rfm_analysis.analysis import get_rfm_analysis
    from backend.services.rfm import get_rfm_r_flow, get_rfm_f_flow, get_rfm_m_flow

    query = request.query
    if query.empty:
        raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "RFM window has no complete data day")
    functions = {
        "product": (get_product_customer_overview, ProductCustomerResponseV3),
        "analysis": (get_rfm_analysis, RFMAnalysisResponse),
        "r": (get_rfm_r_flow, RFMRFlowResponse),
        "f": (get_rfm_f_flow, RFMFRFlowResponse),
        "m": (get_rfm_m_flow, RFMMFlowResponse),
    }
    function, contract = functions[request.family]
    dates = {"period": query.period} if isinstance(query, FixedPeriodQuery) else {"start_date": query.start, "end_date": query.end}
    result = function(**dates, metric_type=query.metric_type,
                      channel=query.channel, exclude_channels=list(query.exclude_channels) or None,
                      compare_start_date=query.comparison[0], compare_end_date=query.comparison[1])
    if request.family == "product" and any(
        result["coverage"][name] != "COMPLETE" for name in ("current_status", "comparison_status")
    ):
        raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "product periods exceed source coverage")
    contract.model_validate(result)
    return result


def run_warm_plan(
    runtime: WarehouseRuntime, plan: WarmPlan, budget: WarmBudget, *,
    clock: Callable[[], float] = time.monotonic,
) -> WarmReport:
    with runtime.read() as frame:
        if (frame.pin.identity.revision != plan.source_revision
                or tuple(sorted(frame.semantic_revisions.items())) != plan.semantic_revisions):
            raise ValueError("prewarm plan no longer matches the runtime")
    started, computed, failed = clock(), 0, False
    outcomes = []
    for request in plan.requests:
        newly_computed = False
        period_today = date.fromisoformat(request.query.anchor) if isinstance(request.query, FixedPeriodQuery) else None
        try:
            try:
                with runtime.read(period_today=period_today):
                    result = _call(request)
            except AggregateCacheMissError:
                if failed or computed >= budget.max_new_results or clock() - started >= budget.max_seconds:
                    outcomes.append(WarmOutcome(request.request_id, "PENDING"))
                    continue
                computed += 1
                with runtime.read(mode="compute", period_today=period_today):
                    result = _call(request)
                with runtime.read(period_today=period_today):
                    if _call(request) != result:
                        raise ValueError("prewarm readback differs from computed result")
                newly_computed = True
            outcomes.append(WarmOutcome(request.request_id, "READY", newly_computed))
        except WarehouseQueryError as exc:
            status = "INSUFFICIENT_COVERAGE" if exc.code == "INSUFFICIENT_COVERAGE" else "FAILED"
            failed = failed or status == "FAILED"
            outcomes.append(WarmOutcome(request.request_id, status, error_code=exc.code))
        except Exception as exc:
            failed = True
            outcomes.append(WarmOutcome(request.request_id, "FAILED", error_code=type(exc).__name__))
    return WarmReport(plan.digest, plan.source_revision, tuple(outcomes), clock() - started)
