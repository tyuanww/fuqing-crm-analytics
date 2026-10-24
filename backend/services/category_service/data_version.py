"""Stable source metadata shared by category and product cohort queries."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def orders_data_version(conn: Any) -> dict[str, str | None]:
    """Return a cheap append/update-sensitive version for the orders source.

    The dashboard and product cohort endpoints must expose the same source
    version before a frontend table combines their results.  The order count,
    date bounds, and amount total catch both normal ETL appends and corrections
    that keep the latest payment date unchanged.
    """
    row = conn.execute(
        """
        SELECT
            CAST(MIN(pay_time) AS DATE),
            CAST(MAX(pay_time) AS DATE),
            COUNT(*),
            CAST(COALESCE(SUM(actual_amount), 0) AS DECIMAL(38, 2))
        FROM orders
        """
    ).fetchone()
    data_start = _iso(row[0]) if row else None
    data_cutoff = _iso(row[1]) if row else None
    count = int(row[2] or 0) if row else 0
    amount = str(row[3] or "0.00") if row else "0.00"
    version = f"orders-v1:{data_start or '-'}:{data_cutoff or '-'}:{count}:{amount}"
    return {"data_start": data_start, "data_cutoff": data_cutoff, "data_version": version}
