"""Map declared rows onto crm-metrics/v1 grain. Never fill missing with zero."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from backend.services.crm_readonly.versions import (
    MEMBERSHIP_VALUES,
    ORDER_LINE_FIELDS,
    ORDER_STATUS_VALUES,
    REFUND_EVENT_FIELDS,
    REFUND_STATUS_VALUES,
)

SAMPLE_CHANNELS = frozenset({"U先派样", "百补派样"})
PAID_STATUS_DECLARED = frozenset({"交易成功", "PAID"})
CANCELLED_STATUS_DECLARED = frozenset({"交易关闭", "CANCELLED"})


def limitation(code: str, message: str, related_fact: str | None = None) -> dict[str, str | None]:
    return {"code": code, "message": message, "related_fact": related_fact}


def yuan_decimal_to_minor(value: object) -> int:
    try:
        amount = Decimal(str(value))
        minor = amount * 100
        if minor != minor.to_integral_value():
            raise ValueError("amount is not an exact yuan decimal")
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("amount is not an exact yuan decimal") from exc
    return int(minor)


def _as_datetime(value: object) -> str:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None).isoformat(sep=" ")
    return str(value)


def _membership(value: object) -> str:
    if value is True:
        return "MEMBER"
    if value is False:
        return "NON_MEMBER"
    if value in MEMBERSHIP_VALUES:
        return str(value)
    return "UNKNOWN"


def _order_status(value: object) -> str | None:
    text = str(value) if value is not None else ""
    if text in ORDER_STATUS_VALUES:
        return text
    if text in PAID_STATUS_DECLARED:
        return "PAID"
    if text in CANCELLED_STATUS_DECLARED:
        return "CANCELLED"
    return None


def grain_line(row: dict[str, Any]) -> dict[str, Any]:
    out = {key: row.get(key) for key in ORDER_LINE_FIELDS}
    if out["membership_at_purchase"] not in MEMBERSHIP_VALUES:
        out["membership_at_purchase"] = "UNKNOWN"
    if out["status"] not in ORDER_STATUS_VALUES:
        out["status"] = None
    if out["gross_paid_minor"] is not None:
        out["gross_paid_minor"] = int(out["gross_paid_minor"])
    if out["event_seq"] is not None:
        out["event_seq"] = int(out["event_seq"])
    if out["paid_at"] is not None:
        out["paid_at"] = _as_datetime(out["paid_at"])
    return out


def grain_refund(row: dict[str, Any]) -> dict[str, Any]:
    out = {key: row.get(key) for key in REFUND_EVENT_FIELDS}
    if out["status"] not in REFUND_STATUS_VALUES:
        out["status"] = None
    if out["amount_minor"] is not None:
        out["amount_minor"] = int(out["amount_minor"])
    if out["event_seq"] is not None:
        out["event_seq"] = int(out["event_seq"])
    if out["refunded_at"] is not None:
        out["refunded_at"] = _as_datetime(out["refunded_at"])
    return out


def declared_line(row: dict[str, Any], *, amount_unit: str, index: int) -> tuple[dict[str, Any], list[dict]]:
    limits: list[dict] = []
    status = _order_status(row.get("order_status"))
    if status is None:
        limits.append(limitation("CAPABILITY_UNAVAILABLE", "order_status is not mapped", "status"))
    if amount_unit != "yuan_decimal_synthetic":
        limits.append(limitation("D019_SOURCE_UNVERIFIED", "archive amount unit is unverified", "gross_paid_minor"))
        minor = None
    else:
        try:
            minor = yuan_decimal_to_minor(row["actual_amount"])
        except (KeyError, ValueError):
            minor = None
            limits.append(limitation("CAPABILITY_UNAVAILABLE", "actual_amount cannot be converted", "gross_paid_minor"))
    spu = str(row.get("spu_type") or "")
    channel = row.get("channel")
    is_sample = None
    if channel in SAMPLE_CHANNELS or "小样" in spu:
        is_sample = True
    elif channel is not None:
        is_sample = False
    else:
        limits.append(limitation("D019_SOURCE_UNVERIFIED", "sample identity is unverified", "is_sample"))
    line = {
        "order_id": row.get("order_id"),
        "line_id": row.get("sub_order_id"),
        "user_id": row.get("user_id"),
        "paid_at": _as_datetime(row["pay_time"]) if row.get("pay_time") is not None else None,
        "gross_paid_minor": minor,
        "quantity": row.get("quantity"),
        "product_id": row.get("product_id"),
        "channel": channel,
        "membership_at_purchase": _membership(row.get("is_member")),
        "is_sample": is_sample,
        "status": status,
        "event_seq": index + 1,
    }
    if not line["user_id"]:
        line["user_id"] = None
        limits.append(limitation("UNKNOWN_IDENTITY", "user_id is missing", "user_id"))
    return grain_line(line), limits


def assess_unavailability(
    *,
    lines: list[dict[str, Any]],
    refunds: list[dict[str, Any]],
    history_complete: bool,
    has_refund_lines: bool,
    amount_already_net: bool,
) -> list[dict]:
    limits: list[dict] = []
    if not history_complete:
        limits.append(limitation("INSUFFICIENT_HISTORY", "visible history is incomplete", "first_purchase"))
    product_refunds = [row for row in refunds if row.get("product_id") or row.get("line_id")]
    if refunds and (not has_refund_lines or not product_refunds or len(product_refunds) != len(refunds)):
        limits.append(
            limitation(
                "PRODUCT_NET_UNAVAILABLE",
                "refunds cannot be allocated to products",
                "product_net",
            )
        )
        if not has_refund_lines or not product_refunds:
            limits.append(
                limitation(
                    "MISSING_REFUND_LINES",
                    "refund events have no product or line keys",
                    "refund_event",
                )
            )
    if amount_already_net and refunds:
        limits.append(
            limitation(
                "AMOUNT_ALREADY_NET_CONFLICT",
                "amount_already_net=true; succeeding refunds must not be subtracted again",
                "gross_paid_minor",
            )
        )
    gross_by_order: dict[str, int] = {}
    for line in lines:
        if line.get("gross_paid_minor") is None or line.get("order_id") is None:
            continue
        gross_by_order[line["order_id"]] = gross_by_order.get(line["order_id"], 0) + int(line["gross_paid_minor"])
    refund_by_order: dict[str, int] = {}
    for refund in refunds:
        if refund.get("amount_minor") is None or refund.get("order_id") is None:
            continue
        refund_by_order[refund["order_id"]] = refund_by_order.get(refund["order_id"], 0) + int(refund["amount_minor"])
    for order_id, refund_total in refund_by_order.items():
        gross = gross_by_order.get(order_id)
        if gross is not None and refund_total > gross:
            limits.append(limitation("OVER_REFUND", f"refund exceeds gross for {order_id}", "amount_minor"))
    unidentified = any(line.get("user_id") in (None, "") for line in lines)
    if unidentified:
        limits.append(limitation("UNIDENTIFIED_BUYERS_IN_SCOPE", "some rows have no user_id", "user_id"))
    return _dedupe(limits)


def _dedupe(items: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for item in items:
        key = (item.get("code"), item.get("related_fact"), item.get("message"))
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out
