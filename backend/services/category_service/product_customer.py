
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

from backend.db.connection import get_connection
from backend.semantic.calculations import yoy_absolute, yoy_ratio
from backend.semantic.time import PeriodBuilder
from backend.services.asset_focus_service._helpers import (
    PRODUCT_TO_SPU_CLASSES,
    PRODUCT_TO_SPU_CLASSES_OTHER,
)
from backend.services.product_identity import PRODUCT_DISPLAY_NAMES, resolve_product_names
from backend.services.warehouse_cache import (
    AggregateCacheMissError, AggregateCacheUnavailableError, AggregateKey,
)
from backend.services.warehouse_runtime import current_warehouse_read

from .overview import _build_category_period_filter
from .data_version import orders_data_version


PRODUCT_GROUPS: dict[str, list[str]] = {
    **PRODUCT_TO_SPU_CLASSES,
    **PRODUCT_TO_SPU_CLASSES_OTHER,
}
if set(PRODUCT_DISPLAY_NAMES) != set(PRODUCT_GROUPS):
    raise RuntimeError("商品展示映射与商品分组目录不一致")

_ZERO_METRICS: dict[str, float | int] = {
    "gsv": 0.0,
    "users": 0,
    "aus": 0.0,
    "old_gsv": 0.0,
    "old_users": 0,
    "old_aus": 0.0,
    "old_ratio": 0.0,
    "new_gsv": 0.0,
    "new_users": 0,
    "new_aus": 0.0,
    "new_ratio": 0.0,
    "member_gsv": 0.0,
    "member_users": 0,
    "member_aus": 0.0,
    "member_ratio": 0.0,
    "old_users_ratio": 0.0,
    "new_users_ratio": 0.0,
}


def _validate_range(start_date: str, end_date: str) -> tuple[date, date]:
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise ValueError("日期必须是 YYYY-MM-DD") from exc
    if end < start:
        raise ValueError("结束日期不能早于开始日期")
    from backend.semantic.reporting_window import warehouse_window_allowed

    if (end - start).days >= 90 and (current_warehouse_read() is None or not warehouse_window_allowed(start, end)):
        raise ValueError("商品新老客查询窗口最多 90 天")
    return start, end


def _default_comparison(start: date, end: date) -> tuple[str, str]:
    period = PeriodBuilder.yoy(start.isoformat(), end.isoformat())
    return period.start, period.end


@contextmanager
def _read_transaction(conn: Any):
    conn.execute("BEGIN TRANSACTION")
    try:
        yield
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def _coverage(
    start: date,
    end: date,
    compare_start: date,
    compare_end: date,
    data_cutoff: Optional[date],
    data_start: Optional[date],
) -> dict[str, Any]:
    if data_cutoff is None or data_start is None:
        return {
            "data_cutoff": None,
            "current_status": "INSUFFICIENT",
            "comparison_status": "INSUFFICIENT",
        }
    return {
        "data_cutoff": data_cutoff.isoformat(),
        "current_status": (
            "COMPLETE"
            if data_start <= start <= end <= data_cutoff
            else "INSUFFICIENT"
        ),
        "comparison_status": (
            "COMPLETE"
            if data_start <= compare_start <= compare_end <= data_cutoff
            else "INSUFFICIENT"
        ),
    }


def _group_expression(names: Iterable[str]) -> tuple[str, list[str]]:
    branches: list[str] = []
    params: list[str] = []
    for name in names:
        classes = PRODUCT_GROUPS[name]
        placeholders = ",".join("?" for _ in classes)
        branches.append(f"WHEN TRIM(o.spu_product_class) IN ({placeholders}) THEN ?")
        params.extend(classes)
        params.append(name)
    return "CASE " + " ".join(branches) + " END", params


def _metrics(row: tuple[Any, ...] | None) -> dict[str, float | int]:
    if row is None:
        return dict(_ZERO_METRICS)
    (
        gsv,
        users,
        old_gsv,
        old_users,
        new_gsv,
        new_users,
        member_gsv,
        member_users,
    ) = row
    gsv = float(gsv or 0)
    users = int(users or 0)
    old_gsv = float(old_gsv or 0)
    old_users = int(old_users or 0)
    new_gsv = float(new_gsv or 0)
    new_users = int(new_users or 0)
    member_gsv = float(member_gsv or 0)
    member_users = int(member_users or 0)
    return {
        "gsv": round(gsv, 2),
        "users": users,
        "aus": round(gsv / users, 2) if users else 0.0,
        "old_gsv": round(old_gsv, 2),
        "old_users": old_users,
        "old_aus": round(old_gsv / old_users, 2) if old_users else 0.0,
        "old_ratio": round(old_gsv / gsv, 4) if gsv else 0.0,
        "new_gsv": round(new_gsv, 2),
        "new_users": new_users,
        "new_aus": round(new_gsv / new_users, 2) if new_users else 0.0,
        "new_ratio": round(new_gsv / gsv, 4) if gsv else 0.0,
        "member_gsv": round(member_gsv, 2),
        "member_users": member_users,
        "member_aus": round(member_gsv / member_users, 2) if member_users else 0.0,
        "member_ratio": round(member_gsv / gsv, 4) if gsv else 0.0,
        "old_users_ratio": round(old_users / users, 4) if users else 0.0,
        "new_users_ratio": round(new_users / users, 4) if users else 0.0,
    }


def _yoy(current: dict[str, float | int], comparison: dict[str, float | int]) -> dict[str, Optional[float]]:
    return {
        "gsv": yoy_absolute(current["gsv"], comparison["gsv"]),
        "users": yoy_absolute(current["users"], comparison["users"]),
        "aus": yoy_absolute(current["aus"], comparison["aus"]),
        "old_gsv": yoy_absolute(current["old_gsv"], comparison["old_gsv"]),
        "old_users": yoy_absolute(current["old_users"], comparison["old_users"]),
        "old_aus": yoy_absolute(current["old_aus"], comparison["old_aus"]),
        "new_gsv": yoy_absolute(current["new_gsv"], comparison["new_gsv"]),
        "new_users": yoy_absolute(current["new_users"], comparison["new_users"]),
        "new_aus": yoy_absolute(current["new_aus"], comparison["new_aus"]),
        "old_ratio_ppt": yoy_ratio(current["old_ratio"], comparison["old_ratio"]),
        "new_ratio_ppt": yoy_ratio(current["new_ratio"], comparison["new_ratio"]),
        "old_users_ratio_ppt": yoy_ratio(current["old_users_ratio"], comparison["old_users_ratio"]),
        "new_users_ratio_ppt": yoy_ratio(current["new_users_ratio"], comparison["new_users_ratio"]),
    }


def _period_metrics(
    conn: Any,
    *,
    start_date: str,
    end_date: str,
    cutoff: str,
    names: list[str],
    metric_type: str,
    channel: Optional[str],
    exclude_channels: list[str],
) -> dict[str, dict[str, float | int]]:
    where_sql, where_params = _build_category_period_filter(
        start_date, end_date, metric_type, channel, exclude_channels,
    )
    group_sql, group_params = _group_expression(names)
    amount_cond = "o.actual_amount >= 0" if metric_type == "GSV" else "o.actual_amount > 0"
    sql = f"""
    WITH period_orders AS (
        SELECT
            {group_sql} AS product_name,
            o.user_id,
            o.actual_amount,
            o.is_member,
            CASE WHEN ufp.first_pay_date > DATE(?) THEN 1 ELSE 0 END AS is_new
        FROM orders o
        LEFT JOIN user_first_purchase ufp ON o.user_id = ufp.user_id
        WHERE {where_sql}
          AND o.spu_product_class IS NOT NULL
          AND ({amount_cond})
    )
    SELECT
        product_name,
        SUM(actual_amount) AS total_gsv,
        COUNT(DISTINCT user_id) AS total_users,
        SUM(CASE WHEN is_new = 0 THEN actual_amount ELSE 0 END) AS old_gsv,
        COUNT(DISTINCT CASE WHEN is_new = 0 THEN user_id END) AS old_users,
        SUM(CASE WHEN is_new = 1 THEN actual_amount ELSE 0 END) AS new_gsv,
        COUNT(DISTINCT CASE WHEN is_new = 1 THEN user_id END) AS new_users,
        SUM(CASE WHEN is_member THEN actual_amount ELSE 0 END) AS member_gsv,
        COUNT(DISTINCT CASE WHEN is_member THEN user_id END) AS member_users
    FROM period_orders
    WHERE product_name IS NOT NULL
    GROUP BY product_name
    """
    params = [*group_params, cutoff, *where_params]
    assert sql.count("?") == len(params)
    rows = conn.execute(sql, params).fetchall()
    return {str(row[0]): _metrics(tuple(row[1:])) for row in rows}


def _assert_first_purchase_complete(
    conn: Any,
    *,
    start_date: str,
    end_date: str,
    names: list[str],
    metric_type: str,
    channel: Optional[str],
    exclude_channels: list[str],
) -> None:
    where_sql, where_params = _build_category_period_filter(
        start_date, end_date, metric_type, channel, exclude_channels,
    )
    group_sql, group_params = _group_expression(names)
    amount_cond = "o.actual_amount >= 0" if metric_type == "GSV" else "o.actual_amount > 0"
    sql = f"""
    SELECT COUNT(DISTINCT o.user_id)
    FROM orders o
    LEFT JOIN user_first_purchase ufp ON o.user_id = ufp.user_id
    WHERE {where_sql}
      AND o.spu_product_class IS NOT NULL
      AND ({amount_cond})
      AND ({group_sql}) IS NOT NULL
      AND ufp.first_pay_date IS NULL
    """
    params = [*where_params, *group_params]
    if int(conn.execute(sql, params).fetchone()[0] or 0) > 0:
        raise ValueError("首购历史不完整，无法可靠区分新客和老客")


def get_product_customer_overview(
    start_date: str,
    end_date: str,
    *,
    products: Optional[list[str]] = None,
    metric_type: str = "GSV",
    channel: Optional[str] = None,
    exclude_channels: Optional[list[str]] = None,
    compare_start_date: Optional[str] = None,
    compare_end_date: Optional[str] = None,
) -> dict[str, Any]:
    """Aggregate product cohorts after deduplicating users across SPU classes."""
    start, end = _validate_range(start_date, end_date)
    if metric_type != "GSV":
        raise ValueError("商品新老客当前只支持 GSV")

    names = list(PRODUCT_GROUPS) if products is None else resolve_product_names(products)
    if not names:
        raise ValueError("至少选择一个商品")

    if bool(compare_start_date) != bool(compare_end_date):
        raise ValueError("对比期起止日期必须同时提供")
    if compare_start_date and compare_end_date:
        _validate_range(compare_start_date, compare_end_date)
    else:
        compare_start_date, compare_end_date = _default_comparison(start, end)

    cutoff = (start - timedelta(days=1)).isoformat()
    compare_start = datetime.strptime(compare_start_date, "%Y-%m-%d").date()
    compare_cutoff = (compare_start - timedelta(days=1)).isoformat()
    excluded = list(exclude_channels or [])
    selected_names = names
    frame = current_warehouse_read()
    cache_key = None
    if frame is not None:
        identity = frame.pin.identity
        coverage = _coverage(start, end, compare_start,
                             date.fromisoformat(compare_end_date),
                             date.fromisoformat(identity.data_cutoff) if identity.data_cutoff else None,
                             date.fromisoformat(identity.data_start) if identity.data_start else None)
        if coverage["current_status"] == coverage["comparison_status"] == "COMPLETE":
            cache_key = AggregateKey.for_query(
                "product-customer/v3", identity, frame.semantic_revisions["product-customer/v3"],
                {"start_date": start_date, "end_date": end_date,
                 "compare_start_date": compare_start_date, "compare_end_date": compare_end_date,
                 "metric_type": metric_type, "channel": channel, "exclude_channels": excluded},
            )
            cached = frame.cache.get(cache_key)
            if cached is not None:
                if cached.get("data_version") != identity.revision:
                    raise AggregateCacheUnavailableError("product cache does not match its source")
                return _select_products(cached, selected_names)
            if frame.mode == "cache_only":
                raise AggregateCacheMissError("所选商品数据范围尚未预热")
            names = list(PRODUCT_GROUPS)

    conn = get_connection()
    with _read_transaction(conn):
        source = orders_data_version(conn)
        data_start = datetime.strptime(source["data_start"], "%Y-%m-%d").date() if source["data_start"] else None
        data_cutoff = datetime.strptime(source["data_cutoff"], "%Y-%m-%d").date() if source["data_cutoff"] else None
        compare_start = datetime.strptime(compare_start_date, "%Y-%m-%d").date()
        coverage = _coverage(
            start,
            end,
            compare_start,
            datetime.strptime(compare_end_date, "%Y-%m-%d").date(),
            data_cutoff,
            data_start,
        )
        complete = (
            coverage["current_status"] == "COMPLETE"
            and coverage["comparison_status"] == "COMPLETE"
        )
        if complete:
            _assert_first_purchase_complete(
                conn,
                start_date=start_date,
                end_date=end_date,
                names=names,
                metric_type=metric_type,
                channel=channel,
                exclude_channels=excluded,
            )
            _assert_first_purchase_complete(
                conn,
                start_date=compare_start_date,
                end_date=compare_end_date,
                names=names,
                metric_type=metric_type,
                channel=channel,
                exclude_channels=excluded,
            )
            current = _period_metrics(
                conn,
                start_date=start_date,
                end_date=end_date,
                cutoff=cutoff,
                names=names,
                metric_type=metric_type,
                channel=channel,
                exclude_channels=excluded,
            )
            comparison = _period_metrics(
                conn,
                start_date=compare_start_date,
                end_date=compare_end_date,
                cutoff=compare_cutoff,
                names=names,
                metric_type=metric_type,
                channel=channel,
                exclude_channels=excluded,
            )

    result = []
    if complete:
        for name in names:
            current_metrics = current.get(name, dict(_ZERO_METRICS))
            comparison_metrics = comparison.get(name, dict(_ZERO_METRICS))
            result.append({
                "name": name,
                "display_name": PRODUCT_DISPLAY_NAMES[name],
                "spu_classes": list(PRODUCT_GROUPS[name]),
                "status": "OK" if current_metrics["users"] > 0 else "EMPTY",
                "current": current_metrics,
                "comparison": comparison_metrics,
                "yoy": _yoy(current_metrics, comparison_metrics),
            })

    response = {
        "schema_version": "product-customer/v3",
        "status": "OK" if complete else "INSUFFICIENT_COVERAGE",
        "source": "orders+user_first_purchase",
        "date_start": start_date,
        "date_end": end_date,
        "compare_start_date": compare_start_date,
        "compare_end_date": compare_end_date,
        "new_old_cutoff": cutoff,
        "comparison_new_old_cutoff": compare_cutoff,
        "data_cutoff": coverage["data_cutoff"],
        "data_version": source["data_version"],
        "coverage": coverage,
        "metric_type": metric_type,
        "channel": channel,
        "exclude_channels": excluded,
        "products": result,
    }
    if cache_key is not None:
        frame.cache.put(cache_key, response)
    return _select_products(response, selected_names)


def _select_products(result: dict, names: list[str]) -> dict:
    products = {product["name"]: product for product in result["products"]}
    return {**result, "products": [products[name] for name in names if name in products]}
