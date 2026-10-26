
from __future__ import annotations

from datetime import date, datetime
from typing import Any


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def orders_data_version(conn: Any) -> dict[str, Any]:
    from backend.services.warehouse_runtime import verified_metadata

    if source := verified_metadata(conn):
        return source
    row = conn.execute(
        """
        SELECT
            CAST(MIN(pay_time) AS DATE),
            CAST(MAX(pay_time) AS DATE)
        FROM orders
        """
    ).fetchone()
    data_start = _iso(row[0]) if row else None
    data_cutoff = _iso(row[1]) if row else None
    return {"data_start": data_start, "data_cutoff": data_cutoff, "data_version": "unknown"}
