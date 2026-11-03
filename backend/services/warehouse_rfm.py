from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Literal

from backend.services.warehouse_cache import AggregateCacheMissError, AggregateKey, canonical
from backend.services.warehouse_runtime import WarehouseReadFrame


class WarehouseQueryError(ValueError):
    def __init__(self, code: Literal["INVALID_REQUEST", "INSUFFICIENT_COVERAGE"], message: str):
        super().__init__(message)
        self.code = code


FIXED_PERIODS = ("wtd", "mtd", "ytd", "q1", "q2", "q3", "q4", "yesterday", "last90days", "last180days", "last365days")


def resolve_verified_ranges(period, start_date, end_date, compare_start_date, compare_end_date, *, today: date | None = None) -> dict:
    from backend.semantic.time import PeriodBuilder
    from backend.services.rfm import _shared

    if (start_date is None) != (end_date is None) or (compare_start_date is None) != (compare_end_date is None):
        raise WarehouseQueryError("INVALID_REQUEST", "RFM 起止日期必须同时提供")
    if period is not None and (not isinstance(period, str) or period.lower() not in FIXED_PERIODS):
        raise WarehouseQueryError("INVALID_REQUEST", "RFM 固定周期无效")
    if period is not None and start_date is not None:
        raise WarehouseQueryError("INVALID_REQUEST", "固定周期和明确日期不能同时提供")
    try:
        for value in (start_date, end_date, compare_start_date, compare_end_date):
            if value is not None and date.fromisoformat(value).isoformat() != value:
                raise ValueError("date must use YYYY-MM-DD")
        if period is not None or start_date is None:
            windows = getattr(PeriodBuilder, (period or "mtd").lower())(today=today or _shared.date.today())
            if any(window.empty for window in windows.values()):
                raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "所选 RFM 固定周期尚无完整数据日")
            ranges = {
                name: (windows[key].start_dt, windows[key].end_dt, windows[key].cutoff)
                for name, key in (("current", "current"), ("comp", "comparison"), ("prev2", "prev2"))
            }
            ranges["labels"] = tuple(ranges[name][0][:4] for name in ("current", "comp", "prev2"))
        else:
            ranges = _shared._resolve_date_ranges(None, start_date, end_date, compare_start_date, compare_end_date)
        if (period is not None or start_date is None) and compare_start_date is not None:
            override = _shared._resolve_date_ranges(None, ranges["current"][0][:10], ranges["current"][1][:10],
                                                    compare_start_date, compare_end_date)
            ranges = {**ranges, "comp": override["comp"]}
        return ranges
    except WarehouseQueryError:
        raise
    except (TypeError, ValueError) as exc:
        raise WarehouseQueryError("INVALID_REQUEST", "RFM 日期范围无效") from exc


@dataclass(frozen=True)
class ResolvedRfmQuery:
    periods: tuple[tuple[str, str, str], ...]
    labels: tuple[str, str, str]
    metric_type: str
    channel: str | None
    exclude_channels: tuple[str, ...]
    extra_json: str


def rfm_cache_key(
    frame: WarehouseReadFrame, endpoint: str, ranges: dict,
    metric_type: str, channel: str | None, exclude_channels: list[str] | None,
    *, extra: dict | None = None,
) -> AggregateKey:
    if metric_type not in {"GSV", "GMV"}:
        raise WarehouseQueryError("INVALID_REQUEST", "RFM 指标必须是 GSV 或 GMV")
    periods = tuple(tuple(ranges[name]) for name in ("current", "comp", "prev2"))
    identity = frame.pin.identity
    start = date.fromisoformat(identity.data_start) if identity.data_start else None
    cutoff = date.fromisoformat(identity.data_cutoff) if identity.data_cutoff else None
    try:
        covered = start is not None and cutoff is not None and all(
            start <= date.fromisoformat(values[0][:10]) <= date.fromisoformat(values[1][:10]) <= cutoff
            for values in periods
        )
        if extra and extra.get("as_of"):
            covered = covered and start <= date.fromisoformat(extra["as_of"][:10]) <= cutoff
    except (TypeError, ValueError) as exc:
        raise WarehouseQueryError("INVALID_REQUEST", "RFM 日期范围无效") from exc
    if not covered:
        raise WarehouseQueryError("INSUFFICIENT_COVERAGE", "所选 RFM 三期超出数据覆盖范围")
    query = ResolvedRfmQuery(
        periods, tuple(values[0][:4] for values in periods), metric_type, channel,
        tuple(exclude_channels or []), canonical(extra or {}),
    )
    return AggregateKey.for_query(endpoint, identity, frame.semantic_revisions["rfm"], asdict(query))


def get_verified_rfm_analysis(
    frame: WarehouseReadFrame, ranges: dict, metric_type: str,
    channel: str | None, exclude_channels: list[str] | None,
) -> dict:
    from backend.services.health.rfm_analysis.period import _build_rows, _run_rfm_period_live

    key = rfm_cache_key(frame, "rfm/analysis", ranges, metric_type, channel, exclude_channels)
    cached = frame.cache.get(key)
    if cached is not None:
        return cached
    if frame.mode != "compute":
        raise AggregateCacheMissError("所选 RFM 组合尚未预热")
    values = [
        _run_rfm_period_live(frame.pin.connection, *ranges[name], channel, metric_type, exclude_channels)
        for name in ("current", "comp", "prev2")
    ]
    result = {
        "year_label": ranges["current"][0][:4], "comp_year_label": ranges["comp"][0][:4],
        "prev2_year_label": ranges["prev2"][0][:4], "metric_type": metric_type,
        **{
            field: _build_rows(*(value[index] for value in values))
            for index, field in enumerate(("rows", "same_channel_rows", "member_rows", "member_same_channel_rows"))
        },
    }
    frame.cache.put(key, result)
    return result
