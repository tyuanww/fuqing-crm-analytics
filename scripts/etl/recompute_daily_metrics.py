#!/usr/bin/env python3
"""用统一口径重算 daily_metrics，并输出逐日差异报告。

背景
----
生产 DuckDB 的 daily_metrics 混用了三套历史 ETL 口径：

1. 2026-05-25 及以前：order_count 与 gsv 均按有效单；
2. 2026-05-26 .. 2026-06-18：order_count 变成全部单，gsv 既不是有效单口径
   也不是全部单口径（历史写入时点与当前退款状态不一致）；
3. 2026-06-19 起：同一行 order_count 用全部单，而 gsv 用有效单。

本工具只读打开 source，按下面的单一口径重算，并把旧表作为对照写入
report.json。它不会写 source，也不会覆盖生产库。

口径来源
--------
- GSV 谓词：``backend/semantic/calculations.py`` 的 ``GSV_PREDICATE``；
- GMV 基础谓词：``backend/semantic/filters.py::OrderFilters.gmv_base``；
- 新老客：``backend/services/metrics/overview.py``，按
  ``user_first_purchase.first_pay_date`` 与当日比较；
- 表结构：``backend/database.py`` 的 13 列 daily_metrics；
- 视图：``scripts/ci/e2e_schema.sql`` 的 ``v_valid_orders``。

谓词（所有表达式都在以 ``orders o`` 为源的 ``base`` CTE 上求值）
----------------------------------------------------------------
V = 有效单（GSV 口径）::

    is_goujinjin = FALSE AND order_status != '交易关闭' AND is_refund = FALSE

G = GMV 基础口径（含退款，排除购物金与交易关闭）::

    is_goujinjin = FALSE AND order_status != '交易关闭'

A = 全部单（仅排除 pay_time IS NULL；只用于报告对照）::

    TRUE

日期与窗口
----------
- 日期维度：``CAST(pay_time AS DATE)``；
- 截止日：``MAX(CAST(orders.pay_time AS DATE))``，不硬编码；
- 起始日：优先 ``MIN(daily_metrics.date)``，表不存在或为空时回退
  ``MIN(CAST(orders.pay_time AS DATE))``；
- 逐日输出覆盖整个窗口，窗口内无订单的日期补 0。

合并 user_first_purchase 前先按 user_id 取 ``MIN(first_pay_date)``，避免
一对多 JOIN 放大订单金额。没有 first_pay_date 记录的用户不计入新客/老客。

每条指标的精确定义（与 report.json 的 definitions 字段一致）
------------------------------------------------------------
- ``date``：``CAST(pay_time AS DATE)``。
- ``gmv``：G 口径金额::

      SUM(CASE WHEN G THEN actual_amount ELSE 0 END)

- ``gsv``：V 口径金额::

      SUM(CASE WHEN V THEN actual_amount ELSE 0 END)

- ``order_count``：V 口径去重订单数::

      COUNT(DISTINCT CASE WHEN V THEN order_id END)

- ``gsv_order_count``：V 口径去重订单数，与 order_count 使用同一表达式::

      COUNT(DISTINCT CASE WHEN V THEN order_id END)

  历史 13 列 schema 里 order_count 是 GMV 单量、gsv_order_count 是 GSV
  单量；统一到有效单口径后两者必然相等。保留两列只为兼容原 schema，
  并在 report.json 中明确标注。

- ``new_user_count``：当日有效单中，first_pay_date = 当日的去重用户数::

      COUNT(DISTINCT CASE WHEN V AND first_pay_date = date THEN user_id END)

- ``old_user_count``：当日有效单中，first_pay_date < 当日的去重用户数::

      COUNT(DISTINCT CASE WHEN V AND first_pay_date < date THEN user_id END)

- ``member_gmv``：G 口径会员金额::

      SUM(CASE WHEN G AND is_member = TRUE THEN actual_amount ELSE 0 END)

- ``member_gsv``：V 口径会员金额::

      SUM(CASE WHEN V AND is_member = TRUE THEN actual_amount ELSE 0 END)

- ``member_count``：V 口径会员去重用户数::

      COUNT(DISTINCT CASE WHEN V AND is_member = TRUE THEN user_id END)

- ``avg_order_value``：V 口径客单价 = gsv / gsv_order_count，无有效单时为 0::

      gsv / NULLIF(gsv_order_count, 0)

- ``new_user_gmv``：新客有效单金额（字段名沿用历史 schema，实际是有效单口径）::

      SUM(CASE WHEN V AND first_pay_date = date THEN actual_amount ELSE 0 END)

- ``old_user_gmv``：老客有效单金额::

      SUM(CASE WHEN V AND first_pay_date < date THEN actual_amount ELSE 0 END)

报告对照列（不写入输出表，避免改变 13 列 schema）：

- ``all_order_count``：``COUNT(DISTINCT order_id)``，全部单去重订单数；
- ``all_order_rows``：``COUNT(*)``，全部单明细行数；
- ``all_order_gmv``：``SUM(actual_amount)``，全部单金额；
- ``valid_order_rows``：``COUNT(*)`` under V，有效单明细行数；
- ``gmv_order_count``：``COUNT(DISTINCT CASE WHEN G THEN order_id END)``；
- ``all_user_count``：全部单去重用户数；
- ``valid_user_count``：有效单去重用户数。

安全约束
--------
- ``duckdb.connect(source, read_only=True)``，连接参数不可绕过；
- ``--output`` 必须是目录，且不能与 source 所在目录相同；
- 输出库先写临时文件再原子替换，输出目录外不落盘；
- ``--verify-only`` 只读：不创建输出目录、不写任何文件、只打印摘要；
- 运行前后校验 source 的 size/mtime，并确保没有新建 ``<source>.wal``。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:  # pragma: no cover - 远程独立运行时回退到内联常量
    from backend.semantic.calculations import GSV_PREDICATE as _SEMANTIC_GSV_PREDICATE
except ImportError:  # pragma: no cover
    _SEMANTIC_GSV_PREDICATE = (
        "is_goujinjin = FALSE AND order_status != '交易关闭' AND is_refund = FALSE"
    )


# 口径常量：GSV 谓词优先从 semantic SSOT 导入；远端单独运行脚本时使用内联副本。
# backend/tests/test_recompute_daily_metrics.py 会断言两者逐字一致。
GSV_PREDICATE: str = _SEMANTIC_GSV_PREDICATE
GMV_ORDER_PREDICATE: str = "is_goujinjin = FALSE AND order_status != '交易关闭'"
ALL_ORDER_PREDICATE: str = "TRUE"

OUTPUT_DB_NAME = "daily_metrics_recomputed.duckdb"
REPORT_NAME = "report.json"

# backend/database.py 的 13 列顺序，输出表逐字沿用。
OUTPUT_COLUMNS: tuple[str, ...] = (
    "date",
    "gmv",
    "gsv",
    "order_count",
    "gsv_order_count",
    "new_user_count",
    "old_user_count",
    "member_gmv",
    "member_gsv",
    "member_count",
    "avg_order_value",
    "new_user_gmv",
    "old_user_gmv",
)

COUNT_COLUMNS = frozenset(
    {
        "order_count",
        "gsv_order_count",
        "new_user_count",
        "old_user_count",
        "member_count",
        "member_user_count",
        "user_count",
        "all_order_count",
        "all_order_rows",
        "valid_order_rows",
        "gmv_order_count",
        "all_user_count",
        "valid_user_count",
    }
)

MONEY_TOLERANCE = 0.01
COUNT_TOLERANCE = 0

CREATE_TABLE_SQL = """
    CREATE TABLE daily_metrics (
        date DATE PRIMARY KEY,
        gmv DECIMAL(14,2),
        gsv DECIMAL(14,2),
        order_count INTEGER,
        gsv_order_count INTEGER,
        new_user_count INTEGER,
        old_user_count INTEGER,
        member_gmv DECIMAL(14,2),
        member_gsv DECIMAL(14,2),
        member_count INTEGER,
        avg_order_value DECIMAL(10,2),
        new_user_gmv DECIMAL(14,2),
        old_user_gmv DECIMAL(14,2)
    )
"""

DEFINITIONS: dict[str, Any] = {
    "predicates": {
        "valid_order_V": GSV_PREDICATE,
        "gmv_base_G": GMV_ORDER_PREDICATE,
        "all_orders_A": ALL_ORDER_PREDICATE,
    },
    "metrics": {
        "date": "CAST(pay_time AS DATE)",
        "gmv": "SUM(CASE WHEN G THEN actual_amount ELSE 0 END)",
        "gsv": "SUM(CASE WHEN V THEN actual_amount ELSE 0 END)",
        "order_count": "COUNT(DISTINCT CASE WHEN V THEN order_id END)",
        "gsv_order_count": "COUNT(DISTINCT CASE WHEN V THEN order_id END)",
        "new_user_count": (
            "COUNT(DISTINCT CASE WHEN V AND first_pay_date = date THEN user_id END)"
        ),
        "old_user_count": (
            "COUNT(DISTINCT CASE WHEN V AND first_pay_date < date THEN user_id END)"
        ),
        "member_gmv": (
            "SUM(CASE WHEN G AND is_member = TRUE THEN actual_amount ELSE 0 END)"
        ),
        "member_gsv": (
            "SUM(CASE WHEN V AND is_member = TRUE THEN actual_amount ELSE 0 END)"
        ),
        "member_count": (
            "COUNT(DISTINCT CASE WHEN V AND is_member = TRUE THEN user_id END)"
        ),
        "avg_order_value": "gsv / NULLIF(gsv_order_count, 0)",
        "new_user_gmv": (
            "SUM(CASE WHEN V AND first_pay_date = date THEN actual_amount ELSE 0 END)"
        ),
        "old_user_gmv": (
            "SUM(CASE WHEN V AND first_pay_date < date THEN actual_amount ELSE 0 END)"
        ),
        "all_order_count": "COUNT(DISTINCT order_id)",
        "all_order_rows": "COUNT(*)",
        "all_order_gmv": "SUM(actual_amount)",
        "valid_order_rows": "COUNT(*) over V",
        "gmv_order_count": "COUNT(DISTINCT CASE WHEN G THEN order_id END)",
        "all_user_count": "COUNT(DISTINCT user_id)",
        "valid_user_count": "COUNT(DISTINCT CASE WHEN V THEN user_id END)",
    },
    "notes": [
        "order_count 与 gsv_order_count 在统一有效单口径下相等，保留两列仅为兼容 13 列 schema。",
        "new_user_* / old_user_* 以 user_first_purchase.first_pay_date 为准；无记录用户不计入新老客。",
        "avg_order_value 为 gsv / gsv_order_count（有效单客单价），不是明细行 AVG。",
        "order_count / all_order_count 为每日去重订单数；valid_order_rows / all_order_rows 为明细行数，两者单位不同。",
    ],
}


class RecomputeError(RuntimeError):
    """输入或只读安全校验失败。"""


def _as_float(value: Any) -> float:
    if value is None:
        return 0.0
    return float(value)


def _as_int(value: Any) -> int:
    if value is None:
        return 0
    return int(value)


def _round_money(value: Any) -> float:
    return round(_as_float(value), 2)


def _fingerprint(path: Path) -> dict[str, int]:
    stat = path.stat()
    return {"size": int(stat.st_size), "mtime_ns": int(stat.st_mtime_ns)}


def _table_exists(conn: Any, table_name: str) -> bool:
    row = conn.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE lower(table_name) = lower(?)
        """,
        [table_name],
    ).fetchone()
    return bool(row and row[0])


def _table_columns(conn: Any, table_name: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE lower(table_name) = lower(?)
        ORDER BY ordinal_position
        """,
        [table_name],
    ).fetchall()
    return [str(row[0]) for row in rows]


def _detect_date_column(columns: list[str]) -> str | None:
    lowered = {column.lower(): column for column in columns}
    for candidate in ("date", "d"):
        if candidate in lowered:
            return lowered[candidate]
    return None


def _fetch_recomputed_rows(
    conn: Any,
    start: date,
    end: date,
    has_user_first_purchase: bool,
) -> list[dict[str, Any]]:
    if has_user_first_purchase:
        user_join = """
            LEFT JOIN (
                SELECT user_id, MIN(first_pay_date) AS first_pay_date
                FROM user_first_purchase
                GROUP BY user_id
            ) u ON o.user_id = u.user_id
        """
        first_pay_date_expr = "u.first_pay_date"
    else:
        user_join = ""
        first_pay_date_expr = "CAST(NULL AS DATE)"

    sql = f"""
        WITH base AS (
            SELECT
                CAST(o.pay_time AS DATE) AS d,
                o.order_id,
                o.user_id,
                o.actual_amount,
                o.is_member,
                o.is_goujinjin,
                o.order_status,
                o.is_refund,
                {first_pay_date_expr} AS first_pay_date
            FROM orders o
            {user_join}
            WHERE o.pay_time IS NOT NULL
              AND CAST(o.pay_time AS DATE) BETWEEN ? AND ?
        )
        SELECT
            d,
            COALESCE(SUM(CASE WHEN {GMV_ORDER_PREDICATE} THEN actual_amount ELSE 0 END), 0) AS gmv,
            COALESCE(SUM(CASE WHEN {GSV_PREDICATE} THEN actual_amount ELSE 0 END), 0) AS gsv,
            COUNT(DISTINCT CASE WHEN {GSV_PREDICATE} THEN order_id END) AS order_count,
            COUNT(DISTINCT CASE WHEN {GSV_PREDICATE} THEN order_id END) AS gsv_order_count,
            COUNT(DISTINCT CASE WHEN {GSV_PREDICATE} AND first_pay_date = d THEN user_id END)
                AS new_user_count,
            COUNT(DISTINCT CASE WHEN {GSV_PREDICATE} AND first_pay_date < d THEN user_id END)
                AS old_user_count,
            COALESCE(SUM(CASE WHEN {GMV_ORDER_PREDICATE} AND is_member = TRUE
                              THEN actual_amount ELSE 0 END), 0) AS member_gmv,
            COALESCE(SUM(CASE WHEN {GSV_PREDICATE} AND is_member = TRUE
                              THEN actual_amount ELSE 0 END), 0) AS member_gsv,
            COUNT(DISTINCT CASE WHEN {GSV_PREDICATE} AND is_member = TRUE THEN user_id END)
                AS member_count,
            COALESCE(SUM(CASE WHEN {GSV_PREDICATE} AND first_pay_date = d
                              THEN actual_amount ELSE 0 END), 0) AS new_user_gmv,
            COALESCE(SUM(CASE WHEN {GSV_PREDICATE} AND first_pay_date < d
                              THEN actual_amount ELSE 0 END), 0) AS old_user_gmv,
            COUNT(DISTINCT order_id) AS all_order_count,
            COUNT(*) AS all_order_rows,
            COALESCE(SUM(actual_amount), 0) AS all_order_gmv,
            COUNT(DISTINCT CASE WHEN {GMV_ORDER_PREDICATE} THEN order_id END) AS gmv_order_count,
            SUM(CASE WHEN {GSV_PREDICATE} THEN 1 ELSE 0 END) AS valid_order_rows,
            COUNT(DISTINCT user_id) AS all_user_count,
            COUNT(DISTINCT CASE WHEN {GSV_PREDICATE} THEN user_id END) AS valid_user_count
        FROM base
        GROUP BY d
        ORDER BY d
    """
    cursor = conn.execute(sql, [start, end])
    columns = [item[0] for item in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _fetch_stored_rows(
    conn: Any,
    date_column: str,
    start: date,
    end: date,
) -> dict[date, dict[str, Any]]:
    quoted = date_column.replace('"', '""')
    cursor = conn.execute(
        f'SELECT * FROM daily_metrics WHERE "{quoted}" BETWEEN ? AND ? ORDER BY "{quoted}"',
        [start, end],
    )
    columns = [item[0] for item in cursor.description]
    rows: dict[date, dict[str, Any]] = {}
    for raw in cursor.fetchall():
        record = dict(zip(columns, raw))
        day = record[date_column]
        if isinstance(day, datetime):
            day = day.date()
        rows[day] = record
    return rows


def _fetch_window(
    conn: Any,
    date_column: str | None,
) -> tuple[date, date, str, date | None, datetime | None]:
    stored_min: date | None = None
    if date_column is not None:
        quoted = date_column.replace('"', '""')
        row = conn.execute(f'SELECT MIN("{quoted}") FROM daily_metrics').fetchone()
        stored_min = row[0] if row else None
        if isinstance(stored_min, datetime):
            stored_min = stored_min.date()

    order_bounds = conn.execute(
        """
        SELECT MIN(CAST(pay_time AS DATE)), MAX(CAST(pay_time AS DATE)), MAX(pay_time)
        FROM orders
        WHERE pay_time IS NOT NULL
        """
    ).fetchone()
    order_min, order_max, max_pay_time = order_bounds
    if isinstance(order_min, datetime):
        order_min = order_min.date()
    if isinstance(order_max, datetime):
        order_max = order_max.date()

    if order_max is None:
        raise RecomputeError("orders 表没有非空 pay_time，无法确定截止日")

    if stored_min is not None:
        start = stored_min
        start_basis = f"MIN(daily_metrics.{date_column})"
    else:
        if order_min is None:
            raise RecomputeError("orders 与 daily_metrics 都没有可用日期")
        start = order_min
        start_basis = "MIN(CAST(orders.pay_time AS DATE))"

    if start > order_max:
        raise RecomputeError(
            f"窗口起始日 {start.isoformat()} 晚于 orders 截止日 {order_max.isoformat()}"
        )

    end_basis = "MAX(CAST(orders.pay_time AS DATE))"
    return start, order_max, f"{start_basis}; {end_basis}", stored_min, max_pay_time


def _iter_dates(start: date, end: date) -> list[date]:
    days = (end - start).days
    return [start + timedelta(days=offset) for offset in range(days + 1)]


def _metric_from_row(row: dict[str, Any], column: str) -> float | int | None:
    value = row.get(column)
    if value is None:
        return None
    if column in COUNT_COLUMNS:
        return _as_int(value)
    return _round_money(value)


def _delta(
    stored: float | int | None,
    recomputed: float | int | None,
    *,
    count: bool,
) -> dict[str, Any] | None:
    if stored is None or recomputed is None:
        return None
    stored_value: float | int = _as_int(stored) if count else _round_money(stored)
    recomputed_value: float | int = (
        _as_int(recomputed) if count else _round_money(recomputed)
    )
    delta: float | int = round(recomputed_value - stored_value, 2) if not count else (
        int(recomputed_value) - int(stored_value)
    )
    tolerance = COUNT_TOLERANCE if count else MONEY_TOLERANCE
    if abs(delta) <= tolerance:
        direction = "equal"
    elif delta > 0:
        direction = "recomputed_higher"
    else:
        direction = "recomputed_lower"

    magnitude_pct: float | None = None
    if stored_value != 0:
        magnitude_pct = round((delta / stored_value) * 100, 4)

    return {
        "stored": stored_value,
        "recomputed": recomputed_value,
        "delta": delta,
        "magnitude_pct": magnitude_pct,
        "direction": direction,
    }


def _count_caliber(stored: Any, valid: Any, all_orders: Any) -> str | None:
    if stored is None:
        return None
    stored_int = _as_int(stored)
    if stored_int == _as_int(valid):
        return "valid"
    if stored_int == _as_int(all_orders):
        return "all"
    return "other"


def _money_caliber(stored: Any, valid: Any) -> str | None:
    if stored is None:
        return None
    if abs(_as_float(stored) - _as_float(valid)) <= MONEY_TOLERANCE:
        return "valid"
    return "other"


def _segment_label(count_caliber: str | None, gsv_caliber: str | None) -> str:
    if count_caliber is None:
        return "missing_stored_row"
    return f"{count_caliber}_order_count+{gsv_caliber}_gsv"


def _sum_stored(records: list[dict[str, Any]], columns: list[str]) -> dict[str, Any]:
    totals: dict[str, Any] = {}
    for column in columns:
        if column == "avg_order_value":
            # 日均客单价不能相加，窗口值在循环后按 gsv / order_count 重算。
            continue
        if column in COUNT_COLUMNS:
            totals[column] = sum(
                _as_int(record["stored"].get(column))
                for record in records
                if record.get("stored")
            )
        else:
            totals[column] = _round_money(
                sum(
                    _as_float(record["stored"].get(column))
                    for record in records
                    if record.get("stored")
                )
            )
    if "avg_order_value" in columns:
        order_count = _as_int(totals.get("order_count"))
        totals["avg_order_value"] = (
            round(_as_float(totals.get("gsv")) / order_count, 2) if order_count else 0.0
        )
    totals["days_with_stored_row"] = sum(1 for record in records if record.get("stored"))
    return totals


def _sum_recomputed(records: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, Any] = {}
    for column in OUTPUT_COLUMNS:
        if column == "date":
            continue
        if column == "avg_order_value":
            continue
        if column in COUNT_COLUMNS:
            totals[column] = sum(
                _as_int(record["recomputed"].get(column)) for record in records
            )
        else:
            totals[column] = _round_money(
                sum(_as_float(record["recomputed"].get(column)) for record in records)
            )

    gsv_total = _as_float(totals.get("gsv"))
    order_total = _as_int(totals.get("gsv_order_count"))
    totals["avg_order_value"] = round(gsv_total / order_total, 2) if order_total else 0.0
    for column in (
        "all_order_count",
        "all_order_rows",
        "all_order_gmv",
        "gmv_order_count",
        "valid_order_rows",
        "all_user_count",
        "valid_user_count",
    ):
        value = sum(_as_float(record["contrast"].get(column)) for record in records)
        totals[column] = _as_int(value) if column in COUNT_COLUMNS else _round_money(value)
    return totals


def _build_daily_records(
    start: date,
    end: date,
    recomputed_by_day: dict[date, dict[str, Any]],
    stored_by_day: dict[date, dict[str, Any]],
    stored_columns: list[str],
    date_column: str | None,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    comparable_columns = [
        column
        for column in stored_columns
        if column != date_column and column in OUTPUT_COLUMNS and column != "date"
    ]

    for day in _iter_dates(start, end):
        raw_recomputed = recomputed_by_day.get(day)
        if raw_recomputed is None:
            recomputed = {
                column: (0 if column in COUNT_COLUMNS else 0.0)
                for column in OUTPUT_COLUMNS
                if column != "date"
            }
            contrast = {
                "all_order_count": 0,
                "all_order_rows": 0,
                "all_order_gmv": 0.0,
                "gmv_order_count": 0,
                "valid_order_rows": 0,
                "all_user_count": 0,
                "valid_user_count": 0,
            }
        else:
            recomputed = {
                column: _metric_from_row(raw_recomputed, column)
                for column in OUTPUT_COLUMNS
                if column != "date"
            }
            recomputed["avg_order_value"] = (
                round(
                    _as_float(raw_recomputed.get("gsv"))
                    / _as_int(raw_recomputed.get("gsv_order_count")),
                    2,
                )
                if _as_int(raw_recomputed.get("gsv_order_count"))
                else 0.0
            )
            contrast = {
                "all_order_count": _as_int(raw_recomputed.get("all_order_count")),
                "all_order_rows": _as_int(raw_recomputed.get("all_order_rows")),
                "all_order_gmv": _round_money(raw_recomputed.get("all_order_gmv")),
                "gmv_order_count": _as_int(raw_recomputed.get("gmv_order_count")),
                "valid_order_rows": _as_int(raw_recomputed.get("valid_order_rows")),
                "all_user_count": _as_int(raw_recomputed.get("all_user_count")),
                "valid_user_count": _as_int(raw_recomputed.get("valid_user_count")),
            }

        stored_raw = stored_by_day.get(day)
        stored = None
        if stored_raw is not None:
            stored = {
                column: _metric_from_row(stored_raw, column)
                for column in stored_columns
                if column != date_column
            }

        diffs: dict[str, Any] = {}
        if stored is not None:
            for column in comparable_columns:
                diff = _delta(
                    stored.get(column),
                    recomputed.get(column),
                    count=column in COUNT_COLUMNS,
                )
                if diff is not None:
                    diffs[column] = diff

        count_caliber = _count_caliber(
            None if stored is None else stored.get("order_count"),
            recomputed.get("order_count"),
            contrast.get("all_order_count"),
        )
        gsv_caliber = _money_caliber(
            None if stored is None else stored.get("gsv"),
            recomputed.get("gsv"),
        )

        records.append(
            {
                "date": day.isoformat(),
                "stored": stored,
                "recomputed": recomputed,
                "contrast": contrast,
                "diff": diffs,
                "caliber": {
                    "order_count": count_caliber,
                    "gsv": gsv_caliber,
                },
            }
        )
    return records


def _build_segments(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not records:
        return []

    groups: list[list[dict[str, Any]]] = []
    for record in records:
        caliber = (
            record["caliber"]["order_count"],
            record["caliber"]["gsv"],
        )
        if not groups:
            groups.append([record])
            continue
        previous = groups[-1][0]["caliber"]
        if (previous["order_count"], previous["gsv"]) == caliber:
            groups[-1].append(record)
        else:
            groups.append([record])

    segments: list[dict[str, Any]] = []
    for group in groups:
        count_caliber = group[0]["caliber"]["order_count"]
        gsv_caliber = group[0]["caliber"]["gsv"]
        stored_columns = [
            column
            for column in (group[0]["stored"] or {})
            if column not in ("date", "d")
        ]
        stored_totals = _sum_stored(group, stored_columns) if stored_columns else {}
        recomputed_totals = _sum_recomputed(group)

        deltas: dict[str, Any] = {}
        if stored_totals:
            for column in ("order_count", "gsv", "member_gsv", "avg_order_value"):
                diff = _delta(
                    stored_totals.get(column),
                    recomputed_totals.get(column),
                    count=column in COUNT_COLUMNS,
                )
                if diff is not None:
                    deltas[column] = diff

        segments.append(
            {
                "label": _segment_label(count_caliber, gsv_caliber),
                "start": group[0]["date"],
                "end": group[-1]["date"],
                "days": len(group),
                "stored_days": sum(1 for record in group if record.get("stored")),
                "calibers": {
                    "order_count": count_caliber,
                    "gsv": gsv_caliber,
                },
                "stored": stored_totals,
                "recomputed": recomputed_totals,
                "deltas": deltas,
            }
        )
    return segments


def _build_report(
    *,
    source: Path,
    verify_only: bool,
    start: date,
    end: date,
    window_basis: str,
    stored_min: date | None,
    max_pay_time: datetime | None,
    stored_columns: list[str],
    date_column: str | None,
    has_user_first_purchase: bool,
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    segments = _build_segments(records)
    stored_totals = _sum_stored(records, [
        column for column in stored_columns if column != date_column
    ]) if stored_columns else {}
    recomputed_totals = _sum_recomputed(records)

    drift: dict[str, Any] = {}
    if stored_totals:
        for column in ("order_count", "gsv", "member_gsv", "avg_order_value"):
            diff = _delta(
                stored_totals.get(column),
                recomputed_totals.get(column),
                count=column in COUNT_COLUMNS,
            )
            if diff is not None:
                drift[column] = diff

    warnings: list[str] = []
    if not has_user_first_purchase:
        warnings.append(
            "source 没有 user_first_purchase 表：new/old_user_* 全部为 0，无法按首购日判定新老客。"
        )
    if stored_columns and date_column is None:
        warnings.append(
            "daily_metrics 存在但找不到 date/d 日期列，未做逐日对照。"
        )
    if not stored_columns:
        warnings.append("source 没有 daily_metrics 表或表为空，报告只包含重算结果。")
    if stored_totals and "order_count" in stored_totals:
        stored_count = _as_int(stored_totals.get("order_count"))
        valid_rows = _as_int(recomputed_totals.get("valid_order_rows"))
        all_rows = _as_int(recomputed_totals.get("all_order_rows"))
        if stored_count and valid_rows and all_rows:
            warnings.append(
                "窗口合计单位提示：daily_metrics.order_count 是每日去重订单数之和；"
                f"本次重算 order_count={_as_int(recomputed_totals.get('order_count'))}，"
                f"有效单明细行={valid_rows}，全部单明细行={all_rows}。"
                "历史对比中的 464844/447522/541066 混用了去重订单数与明细行数。"
            )

    return {
        "tool": "recompute_daily_metrics",
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "verify_only" if verify_only else "recompute",
        "source": str(source),
        "source_schema": {
            "daily_metrics_columns": stored_columns,
            "date_column": date_column,
            "has_user_first_purchase": has_user_first_purchase,
        },
        "output": None,
        "window": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": (end - start).days + 1,
            "basis": window_basis,
            "stored_min": stored_min.isoformat() if stored_min else None,
            "max_pay_time": max_pay_time.isoformat() if max_pay_time else None,
        },
        "definitions": DEFINITIONS,
        "segments": segments,
        "totals": {
            "stored": stored_totals,
            "recomputed": recomputed_totals,
            "contrast": {
                "all_order_count": recomputed_totals.get("all_order_count"),
                "all_order_rows": recomputed_totals.get("all_order_rows"),
                "all_order_gmv": recomputed_totals.get("all_order_gmv"),
                "gmv_order_count": recomputed_totals.get("gmv_order_count"),
                "valid_order_rows": recomputed_totals.get("valid_order_rows"),
                "all_user_count": recomputed_totals.get("all_user_count"),
                "valid_user_count": recomputed_totals.get("valid_user_count"),
            },
            "unit_note": (
                "order_count / gsv_order_count 为每日去重订单数的窗口合计；"
                "valid_order_rows / all_order_rows 为明细行数，二者不可直接比较。"
            ),
        },
        "drift": drift,
        "daily": records,
        "warnings": warnings,
    }


def _validate_output(source: Path, output: Path) -> Path:
    output_dir = output.expanduser().resolve()
    if output_dir == source.parent:
        raise ValueError(
            f"--output 不能与 source 同目录（{output_dir}）；"
            "请指定独立目录，避免任何覆盖 source 的风险"
        )
    if output_dir.exists() and not output_dir.is_dir():
        raise ValueError(f"--output 已存在且不是目录：{output_dir}")
    if (output_dir / OUTPUT_DB_NAME).resolve() == source:
        raise ValueError("--output 解析后的输出库路径与 source 相同，拒绝执行")
    return output_dir


def _write_output(
    output_dir: Path,
    output_rows: list[tuple[Any, ...]],
    report: dict[str, Any],
) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / OUTPUT_DB_NAME
    report_path = output_dir / REPORT_NAME
    tmp_db = output_dir / f".{OUTPUT_DB_NAME}.{os.getpid()}.tmp"
    tmp_report = output_dir / f".{REPORT_NAME}.{os.getpid()}.tmp"

    for path in (tmp_db, tmp_report):
        if path.exists():
            path.unlink()

    try:
        import duckdb

        conn = duckdb.connect(str(tmp_db))
        try:
            conn.execute(CREATE_TABLE_SQL)
            conn.executemany(
                """
                INSERT INTO daily_metrics VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                """,
                output_rows,
            )
            conn.execute("CHECKPOINT")
        finally:
            conn.close()

        report["output"] = {
            "directory": str(output_dir),
            "database": str(db_path),
            "report": str(report_path),
            "table": "daily_metrics",
            "rows": len(output_rows),
        }
        tmp_report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(tmp_db, db_path)
        os.replace(tmp_report, report_path)
    except Exception:
        for path in (tmp_db, tmp_report):
            if path.exists():
                path.unlink()
        raise

    return {"database": str(db_path), "report": str(report_path)}


def _output_tuple(record: dict[str, Any]) -> tuple[Any, ...]:
    recomputed = record["recomputed"]
    return (
        date.fromisoformat(record["date"]),
        recomputed["gmv"],
        recomputed["gsv"],
        recomputed["order_count"],
        recomputed["gsv_order_count"],
        recomputed["new_user_count"],
        recomputed["old_user_count"],
        recomputed["member_gmv"],
        recomputed["member_gsv"],
        recomputed["member_count"],
        recomputed["avg_order_value"],
        recomputed["new_user_gmv"],
        recomputed["old_user_gmv"],
    )


def _print_summary(report: dict[str, Any]) -> None:
    mode = report["mode"]
    print(f"daily_metrics recompute ({mode})")
    print(f"source: {report['source']}")
    print(
        "window: "
        f"{report['window']['start']} .. {report['window']['end']} "
        f"({report['window']['days']} days; {report['window']['basis']})"
    )
    stored_schema = report["source_schema"]["daily_metrics_columns"]
    print(
        "stored schema: "
        + (", ".join(stored_schema) if stored_schema else "(no daily_metrics)")
    )

    stored = report["totals"]["stored"]
    recomputed = report["totals"]["recomputed"]
    contrast = report["totals"]["contrast"]
    if stored:
        print(
            "stored daily-sum: "
            f"order_count={stored.get('order_count', 'n/a')} "
            f"gsv={stored.get('gsv', 'n/a')} "
            f"member_gsv={stored.get('member_gsv', 'n/a')}"
        )
    print(
        "recomputed valid: "
        f"order_count={recomputed.get('order_count')} "
        f"gsv_order_count={recomputed.get('gsv_order_count')} "
        f"gsv={recomputed.get('gsv')} "
        f"gmv={recomputed.get('gmv')} "
        f"avg_order_value={recomputed.get('avg_order_value')}"
    )
    print(
        "all-orders contrast: "
        f"distinct_orders={contrast.get('all_order_count')} "
        f"order_rows={contrast.get('all_order_rows')} "
        f"gmv={contrast.get('all_order_gmv')} "
        f"valid_order_rows={contrast.get('valid_order_rows')}"
    )

    for column, diff in report["drift"].items():
        print(
            f"drift {column}: stored={diff['stored']} -> recomputed={diff['recomputed']} "
            f"delta={diff['delta']} ({diff['direction']}, "
            f"{diff['magnitude_pct']}% of stored)"
        )

    print("segments:")
    for index, segment in enumerate(report["segments"], start=1):
        stored_segment = segment["stored"]
        recomputed_segment = segment["recomputed"]
        count_delta = segment["deltas"].get("order_count")
        gsv_delta = segment["deltas"].get("gsv")

        def _delta_text(diff: dict[str, Any] | None) -> str:
            if not diff:
                return "delta=n/a"
            return (
                f"delta={diff['delta']} "
                f"({diff['magnitude_pct']}%, {diff['direction']})"
            )

        print(
            f"  [{index}] {segment['start']}..{segment['end']} "
            f"({segment['days']}d, {segment['label']}) "
            f"order_count stored={stored_segment.get('order_count', 'n/a')} "
            f"recomputed={recomputed_segment.get('order_count', 'n/a')} "
            f"{_delta_text(count_delta)}; "
            f"gsv stored={stored_segment.get('gsv', 'n/a')} "
            f"recomputed={recomputed_segment.get('gsv', 'n/a')} "
            f"{_delta_text(gsv_delta)}"
        )

    if mode == "verify_only":
        print("no files written (read-only verify-only)")
    for warning in report["warnings"]:
        print(f"note: {warning}")


def run(
    source: str | Path,
    output: str | Path = ".context/daily-metrics-recompute",
    *,
    verify_only: bool = False,
) -> dict[str, Any]:
    """执行重算或只读校验，返回 report dict。

    verify_only=True 时不会创建输出目录、不会写数据库或 report.json。
    """
    try:
        import duckdb
    except ImportError as exc:  # pragma: no cover - 环境缺依赖时给出明确错误
        raise RecomputeError("缺少 duckdb 依赖，无法执行重算") from exc

    source_path = Path(source).expanduser().resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"source 不存在或不是文件：{source_path}")

    output_dir: Path | None = None
    if not verify_only:
        output_dir = _validate_output(source_path, Path(output))

    before = _fingerprint(source_path)
    wal_path = Path(str(source_path) + ".wal")
    wal_before = wal_path.exists()

    conn = duckdb.connect(str(source_path), read_only=True)
    try:
        if not _table_exists(conn, "orders"):
            raise RecomputeError(f"source 缺少 orders 表：{source_path}")

        stored_columns: list[str] = []
        date_column: str | None = None
        if _table_exists(conn, "daily_metrics"):
            stored_columns = _table_columns(conn, "daily_metrics")
            date_column = _detect_date_column(stored_columns)

        has_user_first_purchase = _table_exists(conn, "user_first_purchase")

        start, end, window_basis, stored_min, max_pay_time = _fetch_window(
            conn, date_column
        )
        recomputed_rows = _fetch_recomputed_rows(
            conn, start, end, has_user_first_purchase
        )
        recomputed_by_day = {row["d"]: row for row in recomputed_rows}

        stored_by_day: dict[date, dict[str, Any]] = {}
        if date_column is not None:
            stored_by_day = _fetch_stored_rows(conn, date_column, start, end)
    finally:
        conn.close()

    after = _fingerprint(source_path)
    if before != after:
        raise RecomputeError(
            "source 在运行期间发生变化，拒绝继续："
            f"before={before} after={after}"
        )
    if not wal_before and wal_path.exists():
        raise RecomputeError(f"运行期间在 source 旁新建了 WAL：{wal_path}")

    records = _build_daily_records(
        start,
        end,
        recomputed_by_day,
        stored_by_day,
        stored_columns,
        date_column,
    )
    report = _build_report(
        source=source_path,
        verify_only=verify_only,
        start=start,
        end=end,
        window_basis=window_basis,
        stored_min=stored_min,
        max_pay_time=max_pay_time,
        stored_columns=stored_columns,
        date_column=date_column,
        has_user_first_purchase=has_user_first_purchase,
        records=records,
    )
    report["source_fingerprint"] = {"before": before, "after": after}

    if verify_only:
        _print_summary(report)
        return report

    output_rows = [_output_tuple(record) for record in records]
    assert output_dir is not None
    written = _write_output(output_dir, output_rows, report)
    print(f"wrote {written['database']} ({len(output_rows)} rows)")
    print(f"wrote {written['report']}")
    _print_summary(report)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="用统一口径重算 daily_metrics（只读 source，输出独立 DuckDB + report.json）",
    )
    parser.add_argument("--source", required=True, help="源 DuckDB 路径（只读打开）")
    parser.add_argument(
        "--output",
        default=".context/daily-metrics-recompute",
        help="输出目录（默认 .context/daily-metrics-recompute，必须与 source 不同目录）",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="只读校验：不写文件，只打印与现有 daily_metrics 的差异摘要",
    )
    args = parser.parse_args(argv)

    try:
        run(args.source, args.output, verify_only=args.verify_only)
    except (ValueError, FileNotFoundError, RecomputeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # duckdb.Error 等运行期错误
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
