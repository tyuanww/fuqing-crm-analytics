"""Whitelist SQL templates. No caller SQL, no path interpolation."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from backend.services.crm_readonly.errors import RowLimitExceededError, SqlRejectedError
from backend.services.crm_readonly.resources import MAX_CHANNEL_FILTERS, MAX_PRODUCT_FILTERS, MAX_ROWS

GRAIN_LINES_SQL = """
SELECT order_id, line_id, user_id, paid_at, gross_paid_minor, quantity,
       product_id, channel, membership_at_purchase, is_sample, status, event_seq
FROM crm_order_line
WHERE paid_at >= ? AND paid_at < ?
  AND (? = 0 OR list_contains(?, channel))
  AND (? = 0 OR list_contains(?, product_id))
ORDER BY paid_at, event_seq, order_id, line_id
LIMIT ?
"""

GRAIN_REFUNDS_SQL = """
SELECT refund_id, order_id, refunded_at, amount_minor, product_id, line_id, status, event_seq
FROM crm_refund_event
WHERE refunded_at <= ?
  AND list_contains(?, order_id)
ORDER BY refunded_at, event_seq, refund_id
LIMIT ?
"""

DECLARED_LINES_SQL = """
SELECT order_id, sub_order_id, user_id, pay_time, actual_amount, quantity,
       product_id, channel, is_member, order_status, refund_amount, is_refund, spu_type
FROM orders
WHERE pay_time >= ? AND pay_time < ?
  AND (? = 0 OR list_contains(?, channel))
  AND (? = 0 OR list_contains(?, product_id))
ORDER BY pay_time, order_id, sub_order_id
LIMIT ?
"""

DECLARED_REFUNDS_SQL = """
SELECT refund_id, order_id, refunded_at, amount_minor, product_id, line_id, status, event_seq
FROM refunds
WHERE refunded_at <= ?
  AND list_contains(?, order_id)
ORDER BY refunded_at, event_seq, refund_id
LIMIT ?
"""

META_SQL = "SELECT * FROM crm_source_meta LIMIT 2"


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SqlRejectedError("date must be YYYY-MM-DD") from exc


def window_start(value: str) -> datetime:
    return datetime.combine(parse_date(value), datetime.min.time())


def window_end_exclusive(value: str) -> datetime:
    return datetime.combine(parse_date(value), datetime.min.time())


def business_time(value: str) -> datetime:
    """An ISO date is midnight; timestamps denote exact instants in Shanghai."""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SqlRejectedError("invalid ISO timestamp") from exc
    tz = ZoneInfo("Asia/Shanghai")
    return (dt.replace(tzinfo=tz) if dt.tzinfo is None else dt.astimezone(tz))


def bound_filters(values: list[str] | None, *, cap: int) -> list[str]:
    items = list(values or [])
    if len(items) > cap:
        raise SqlRejectedError("filter list exceeds cap")
    for item in items:
        if not isinstance(item, str) or not item or len(item) > 128:
            raise SqlRejectedError("invalid filter value")
    return items


def fetch_capped(connection, sql: str, params: list, *, cap: int = MAX_ROWS) -> list:
    if sql not in {GRAIN_LINES_SQL, GRAIN_REFUNDS_SQL, DECLARED_LINES_SQL, DECLARED_REFUNDS_SQL, META_SQL}:
        raise SqlRejectedError("SQL is not in the whitelist")
    cursor = connection.execute(sql, params)
    rows = cursor.fetchall()
    if len(rows) >= cap:
        raise RowLimitExceededError("query reached the row cap")
    description = [col[0] for col in (cursor.description or [])]
    return [dict(zip(description, row, strict=True)) for row in rows]


def line_params(period_start: str, period_end_exclusive: str, channels: list[str], products: list[str]) -> list:
    start = business_time(period_start).replace(tzinfo=None)
    end = business_time(period_end_exclusive).replace(tzinfo=None)
    if end <= start:
        raise SqlRejectedError("period_end_exclusive must be after period_start")
    ch = bound_filters(channels, cap=MAX_CHANNEL_FILTERS)
    pr = bound_filters(products, cap=MAX_PRODUCT_FILTERS)
    return [start, end, len(ch), ch, len(pr), pr, MAX_ROWS]


def refund_params(refund_as_of: str, order_ids: list[str]) -> list:
    return [business_time(refund_as_of).replace(tzinfo=None), order_ids, MAX_ROWS]
