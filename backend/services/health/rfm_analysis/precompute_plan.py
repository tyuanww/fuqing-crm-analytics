from __future__ import annotations

from calendar import monthrange
from dataclasses import asdict, dataclass
from datetime import date, timedelta
import hashlib
import json

from backend.semantic.channels import CHANNEL_ORDER
from backend.semantic.time import PeriodBuilder, shift_year_clamped
from backend.services.rfm._shared import _resolve_date_ranges

from ._shared import _cache_key
from .period import _hot_period_ranges


@dataclass(frozen=True)
class RfmPrecomputePolicy:
    lookback_months: int = 24
    channels: tuple[str | None, ...] = (None, "纯派样", *CHANNEL_ORDER)
    metric_types: tuple[str, ...] = ("GSV", "GMV")
    exclude_sets: tuple[tuple[str, ...], ...] = (
        (), ("U先派样", "百补派样", "赠品&0.01", "其他"),
    )
    compare_modes: tuple[str, ...] = ("default", "auto_mom")

    def __post_init__(self):
        if not 1 <= self.lookback_months <= 60:
            raise ValueError("lookback_months must be between 1 and 60")
        if not self.channels or len(set(self.channels)) != len(self.channels):
            raise ValueError("channels must be nonempty and unique")
        if not set(self.channels) <= {None, "纯派样", *CHANNEL_ORDER}:
            raise ValueError("unsupported precompute channel")
        if not self.metric_types or not set(self.metric_types) <= {"GSV", "GMV"}:
            raise ValueError("unsupported precompute metric")
        if not self.compare_modes or not set(self.compare_modes) <= {"default", "auto_mom"}:
            raise ValueError("unsupported precompute comparison")
        for values in (self.metric_types, self.exclude_sets, self.compare_modes):
            if not values or len(set(values)) != len(values):
                raise ValueError("precompute dimensions must be nonempty and unique")


@dataclass(frozen=True)
class RfmPrecomputeQuery:
    period: str
    start: str
    end: str
    channel: str | None
    metric_type: str
    exclude_channels: tuple[str, ...]
    compare_mode: str
    empty: bool = False

    @property
    def comparison(self) -> tuple[str | None, str | None]:
        if self.compare_mode == "default":
            return None, None
        previous = PeriodBuilder.mom(self.start, self.end)
        return previous.start, previous.end

    @property
    def ranges(self) -> dict:
        return _resolve_date_ranges(None, self.start, self.end, *self.comparison)

    def covered(self, data_start: date, cutoff: date) -> bool:
        return not self.empty and all(
            data_start <= date.fromisoformat(values[0][:10])
            <= date.fromisoformat(values[1][:10]) <= cutoff
            for name, values in self.ranges.items() if name != "labels"
        )

    def key(self, data_version: str) -> str:
        ranges = self.ranges
        return _cache_key(
            None, self.start, self.end, self.channel, self.metric_type,
            list(self.exclude_channels) or None, data_version, *self.comparison,
            prev2_start_date=ranges["prev2"][0][:10],
            prev2_end_date=ranges["prev2"][1][:10],
        )


@dataclass(frozen=True)
class RfmPrecomputePlan:
    data_start: date
    cutoff: date
    policy: RfmPrecomputePolicy
    queries: tuple[RfmPrecomputeQuery, ...]

    @property
    def digest(self) -> str:
        raw = json.dumps(asdict(self), default=str, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode()).hexdigest()


@dataclass(frozen=True)
class RfmPrecomputeReport:
    generation_id: str
    plan_digest: str
    expected: int
    ready: int
    insufficient: int
    materialized: int
    verified: int

    @property
    def complete(self) -> bool:
        return self.ready + self.insufficient == self.expected and self.verified == self.materialized > 0


def _month_start(value: date, offset: int) -> date:
    ordinal = value.year * 12 + value.month - 1 + offset
    year, month = divmod(ordinal, 12)
    return date(year, month + 1, 1)


def build_precompute_plan(
    data_start: date, cutoff: date, *,
    policy: RfmPrecomputePolicy = RfmPrecomputePolicy(),
) -> RfmPrecomputePlan:
    if data_start > cutoff:
        raise ValueError("warehouse has no available date window")
    first_month = _month_start(cutoff, 1 - policy.lookback_months)
    windows = []
    for years in range((policy.lookback_months + 11) // 12):
        anchor = shift_year_clamped(cutoff, years) + timedelta(days=1)
        for name, ranges in _hot_period_ranges(anchor):
            current = ranges["current"]
            windows.append((name, current.start, current.end, current.empty))
    for offset in range(policy.lookback_months):
        start = _month_start(first_month, offset)
        end = date(start.year, start.month, monthrange(start.year, start.month)[1])
        if end <= cutoff:
            windows.append((f"MONTH_{start:%Y_%m}", start.isoformat(), end.isoformat(), False))
        if start.month in (1, 4, 7, 10):
            quarter_end = _month_start(start, 3) - timedelta(days=1)
            if quarter_end <= cutoff:
                windows.append((f"QUARTER_{start:%Y_%m}", start.isoformat(), quarter_end.isoformat(), False))
        if start.month == 1 and date(start.year, 12, 31) <= cutoff:
            windows.append((f"YEAR_{start.year}", start.isoformat(), f"{start.year}-12-31", False))
    windows.sort(key=lambda row: row[0].upper().startswith("Q"))
    queries = tuple(
        RfmPrecomputeQuery(name, start, end, channel, metric, excluded, mode, empty)
        for name, start, end, empty in windows
        for metric in policy.metric_types for channel in policy.channels
        for excluded in policy.exclude_sets for mode in policy.compare_modes
    )
    return RfmPrecomputePlan(data_start, cutoff, policy, queries)
