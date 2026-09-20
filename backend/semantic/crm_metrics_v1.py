"""CRM metrics v1: frozen calculation contract and pure engine.

metric_version = crm-metrics/v1. Does not open DuckDB, HTTP, archives, or
credentials. Real-source mapping (D019) stays unverified.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Sequence
from zoneinfo import ZoneInfo

from backend.semantic.calculations import yoy_absolute
from backend.semantic.time import shift_year_clamped

METRIC_VERSION = "crm-metrics/v1"
QUERY_VERSION = "crm-metrics-query/v1"
SCHEMA_VERSION = "crm-metrics-wire/v1"
DATA_VERSION = "synthetic-crm-metrics-data/v1"
MAPPING_VERSION = "synthetic-identity/v1"
RFM_THRESHOLD_VERSION = "crm-rfm-thresholds/v1"
TIMEZONE_NAME = "Asia/Shanghai"
TZ = ZoneInfo(TIMEZONE_NAME)
CURRENCY = "CNY"
AMOUNT_UNIT = "minor"
AMOUNT_SCALE = 2

QUERY_SALES = "sales_window_summary"
QUERY_REPURCHASE = "existing_customer_repurchase"
QUERY_SAMPLE = "sample_followup"

DECISIONS_SALES = (
    "D001", "D002", "D003", "D004", "D005", "D006", "D007",
    "D013", "D014", "D016", "D017", "D018", "D020", "D021",
)
DECISIONS_REPURCHASE = ("D004", "D006", "D008", "D018", "D020", "D021")
DECISIONS_SAMPLE = ("D009", "D010", "D011", "D022")

SAMPLE_ROI_DISCLAIMER = "当前只是复购收入表现，不是利润回报或因果增量"

RFM_THRESHOLDS = {
    "version": RFM_THRESHOLD_VERSION,
    "r_days": [30, 90, 180, 365],
    "f_distinct_valid_orders": [1, 2, 3, 4],
    "m_declared_yuan": [100, 300, 500, 1000],
}

MEMBER_MEMBER = "MEMBER"
MEMBER_NON = "NON_MEMBER"
MEMBER_UNKNOWN = "UNKNOWN"
STATUS_PAID = "PAID"
STATUS_CANCELLED = "CANCELLED"
VIEW_ORDER = "ORDER_COHORT_AS_OF"
VIEW_REFUND = "REFUND_FLOW"


class MetricContractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def as_dt(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def as_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return as_dt(value).date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def period_bounds(start: date | str, end_exclusive: date | str, tz=TZ) -> tuple[datetime, datetime]:
    start_d = as_date(start)
    end_d = as_date(end_exclusive)
    start_dt = datetime.combine(start_d, time.min, tzinfo=tz)
    end_dt = datetime.combine(end_d, time.min, tzinfo=tz)
    if end_dt <= start_dt:
        raise MetricContractError("INVALID_PERIOD", "period_end_exclusive 必须晚于 period_start")
    return start_dt, end_dt


def natural_day_window(start_at: datetime | str, observation_days: int) -> dict[str, Any]:
    if observation_days < 1:
        raise MetricContractError("INVALID_WINDOW", "observation_days 必须 >= 1")
    start_at_dt = as_dt(start_at)
    day_1 = start_at_dt.date()
    day_n = day_1 + timedelta(days=observation_days - 1)
    exclusive_end = datetime.combine(day_n + timedelta(days=1), time.min, tzinfo=start_at_dt.tzinfo)
    return {
        "day_1": day_1.isoformat(),
        "day_n": day_n.isoformat(),
        "exclusive_end": exclusive_end,
        "observation_days": observation_days,
    }


def is_mature(exclusive_end: datetime, data_through: datetime | str) -> bool:
    return as_dt(data_through) >= as_dt(exclusive_end)


def yoy_period(start: date | str, end_exclusive: date | str) -> tuple[date, date]:
    # Shift the last included day before restoring the exclusive bound. Shifting
    # Feb 29 as an exclusive bound would otherwise collapse the Feb 28 window.
    return (shift_year_clamped(as_date(start), 1),
            shift_year_clamped(as_date(end_exclusive) - timedelta(days=1), 1) + timedelta(days=1))


def money(value: int | None, reason: str | None = None) -> dict[str, Any]:
    return {"value": value, "currency": CURRENCY, "unit": AMOUNT_UNIT, "scale": AMOUNT_SCALE, "empty_reason": reason}


def ratio(value: float | None, unit: str, reason: str | None = None) -> dict[str, Any]:
    if value is not None:
        value = round(float(value), 4)
    return {"value": value, "unit": unit, "empty_reason": reason}


def count(value: int | None, reason: str | None = None) -> dict[str, Any]:
    return {"value": value, "unit": "integer", "empty_reason": reason}


def _canon(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def make_query_ref(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_canon(payload).encode("utf-8")).hexdigest()[:16]


def _clean_id(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


@dataclass(frozen=True)
class OrderLine:
    order_id: str
    line_id: str
    user_id: str | None
    paid_at: datetime
    gross_paid_minor: int
    quantity: int | None
    product_id: str | None
    channel: str | None
    membership_at_purchase: str
    is_sample: bool
    status: str
    event_seq: int = 0


@dataclass(frozen=True)
class RefundEvent:
    refund_id: str
    order_id: str
    refunded_at: datetime
    amount_minor: int
    product_id: str | None
    line_id: str | None
    status: str = "SUCCEEDED"
    event_seq: int = 0


@dataclass(frozen=True)
class LineNet:
    line_id: str
    product_id: str | None
    channel: str | None
    gross_minor: int
    quantity: int | None


@dataclass(frozen=True)
class OrderNet:
    order_id: str
    user_id: str | None
    paid_at: datetime
    channel: str | None
    membership: str
    is_sample: bool
    status: str
    event_seq: int
    gross_minor: int
    refund_minor: int
    net_minor: int
    over_refund: bool
    product_net_available: bool
    product_net: dict[str, int]
    lines: tuple[LineNet, ...]
    unattributed_refund_minor: int


@dataclass
class NormalizedBasket:
    source_id: str
    data_version: str
    mapping_version: str
    contains_real_data: bool
    lines: tuple[OrderLine, ...]
    refunds: tuple[RefundEvent, ...]
    timezone: str = TIMEZONE_NAME
    currency: str = CURRENCY
    history_complete: bool = True
    coverage_start: str | None = None


def parse_line(raw: dict[str, Any]) -> OrderLine:
    membership = str(raw.get("membership_at_purchase") or MEMBER_UNKNOWN)
    if membership not in (MEMBER_MEMBER, MEMBER_NON, MEMBER_UNKNOWN):
        membership = MEMBER_UNKNOWN
    status = str(raw.get("status") or STATUS_PAID)
    return OrderLine(
        order_id=str(raw["order_id"]),
        line_id=str(raw["line_id"]),
        user_id=_clean_id(raw.get("user_id")),
        paid_at=as_dt(raw["paid_at"]),
        gross_paid_minor=int(raw["gross_paid_minor"]),
        quantity=None if raw.get("quantity") is None else int(raw["quantity"]),
        product_id=_clean_id(raw.get("product_id")),
        channel=_clean_id(raw.get("channel")),
        membership_at_purchase=membership,
        is_sample=bool(raw.get("is_sample", False)),
        status=status,
        event_seq=int(raw.get("event_seq") or 0),
    )


def parse_refund(raw: dict[str, Any]) -> RefundEvent:
    return RefundEvent(
        refund_id=str(raw["refund_id"]),
        order_id=str(raw["order_id"]),
        refunded_at=as_dt(raw["refunded_at"]),
        amount_minor=int(raw["amount_minor"]),
        product_id=_clean_id(raw.get("product_id")),
        line_id=_clean_id(raw.get("line_id")),
        status=str(raw.get("status") or "SUCCEEDED"),
        event_seq=int(raw.get("event_seq") or 0),
    )


def basket_from_dict(raw: dict[str, Any]) -> NormalizedBasket:
    return NormalizedBasket(
        source_id=str(raw.get("source_id") or "synthetic-crm-metrics"),
        data_version=str(raw.get("data_version") or DATA_VERSION),
        mapping_version=str(raw.get("mapping_version") or MAPPING_VERSION),
        contains_real_data=bool(raw.get("contains_real_data", False)),
        lines=tuple(parse_line(item) for item in raw.get("lines") or ()),
        refunds=tuple(parse_refund(item) for item in raw.get("refunds") or ()),
        timezone=str(raw.get("timezone") or TIMEZONE_NAME),
        currency=str(raw.get("currency") or CURRENCY),
        history_complete=bool(raw.get("history_complete", True)),
        coverage_start=raw.get("coverage_start"),
    )


def load_basket(path: str | Path) -> NormalizedBasket:
    return basket_from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def compute_order_nets(
    lines: Sequence[OrderLine],
    refunds: Sequence[RefundEvent],
    refund_as_of: datetime | str,
    *,
    amount_already_net: bool = False,
) -> list[OrderNet]:
    cutoff = as_dt(refund_as_of)
    by_order: dict[str, list[OrderLine]] = {}
    for line in lines:
        by_order.setdefault(line.order_id, []).append(line)
    by_refund: dict[str, list[RefundEvent]] = {}
    for refund in refunds:
        if refund.status != "SUCCEEDED":
            continue
        if as_dt(refund.refunded_at) > cutoff:
            continue
        by_refund.setdefault(refund.order_id, []).append(refund)

    orders: list[OrderNet] = []
    for order_id, order_lines in by_order.items():
        order_lines = sorted(order_lines, key=lambda item: (item.event_seq, item.line_id))
        head = min(order_lines, key=lambda item: (item.paid_at, item.event_seq, item.line_id))
        if head.status == STATUS_CANCELLED or any(item.status == STATUS_CANCELLED for item in order_lines):
            continue
        channels = {item.channel for item in order_lines}
        memberships = {item.membership_at_purchase for item in order_lines}
        channel = next(iter(channels)) if len(channels) == 1 else None
        membership = next(iter(memberships)) if len(memberships) == 1 else MEMBER_UNKNOWN
        users = {item.user_id for item in order_lines}
        user_id = next(iter(users)) if len(users) == 1 else None
        gross = sum(item.gross_paid_minor for item in order_lines)
        applied = by_refund.get(order_id, [])
        if amount_already_net and applied:
            raise MetricContractError(
                "AMOUNT_ALREADY_NET_CONFLICT",
                "原金额已净额时不得再扣退款事件",
            )
        refund_minor = 0 if amount_already_net else sum(item.amount_minor for item in applied)
        net = gross - refund_minor
        line_index = {item.line_id: item for item in order_lines}
        unattributed = 0
        product_refund: dict[str, int] = {}
        attributed = True
        if not amount_already_net:
            for refund in applied:
                if refund.line_id:
                    src = line_index.get(refund.line_id)
                    if src is None or not src.product_id:
                        attributed = False
                        unattributed += refund.amount_minor
                        continue
                    product_refund[src.product_id] = product_refund.get(src.product_id, 0) + refund.amount_minor
                elif refund.product_id:
                    product_refund[refund.product_id] = product_refund.get(refund.product_id, 0) + refund.amount_minor
                else:
                    attributed = False
                    unattributed += refund.amount_minor
        product_gross: dict[str, int] = {}
        for item in order_lines:
            if item.product_id:
                product_gross[item.product_id] = product_gross.get(item.product_id, 0) + item.gross_paid_minor
        product_net = {
            product_id: product_gross.get(product_id, 0) - product_refund.get(product_id, 0)
            for product_id in set(product_gross) | set(product_refund)
        }
        orders.append(
            OrderNet(
                order_id=order_id,
                user_id=user_id,
                paid_at=head.paid_at,
                channel=channel,
                membership=membership,
                is_sample=any(item.is_sample for item in order_lines),
                status=STATUS_PAID,
                event_seq=head.event_seq,
                gross_minor=gross,
                refund_minor=refund_minor,
                net_minor=net,
                over_refund=net < 0,
                product_net_available=attributed,
                product_net=product_net,
                lines=tuple(
                    LineNet(
                        line_id=item.line_id,
                        product_id=item.product_id,
                        channel=item.channel,
                        gross_minor=item.gross_paid_minor,
                        quantity=item.quantity,
                    )
                    for item in order_lines
                ),
                unattributed_refund_minor=unattributed,
            )
        )
    return sorted(orders, key=lambda item: (item.paid_at, item.event_seq, item.order_id))


def _in_period(moment: datetime, start: datetime, end: datetime) -> bool:
    return start <= moment < end


def _channel_ok(order: OrderNet, channel_ids: Sequence[str] | None) -> bool:
    if not channel_ids:
        return True
    if order.channel in channel_ids:
        return True
    return any(line.channel in channel_ids for line in order.lines)


def _product_ok(order: OrderNet, product_ids: Sequence[str] | None) -> bool:
    if not product_ids:
        return True
    wanted = set(product_ids)
    return any(line.product_id in wanted for line in order.lines)


def _selected_amount(order: OrderNet, product_ids: Sequence[str] | None, channel_ids: Sequence[str] | None) -> tuple[int | None, bool]:
    if channel_ids and any(line.channel not in channel_ids for line in order.lines):
        # The normalized order retains product refunds, not line/channel nets.
        # Never substitute gross line amounts or allocate refunds by guesswork.
        return None, False
    if product_ids:
        if not order.product_net_available:
            return None, False
        return sum(order.product_net.get(pid, 0) for pid in set(product_ids)), True
    return order.net_minor, True


def _selected_lines(order: OrderNet, products, channels) -> list[LineNet]:
    return [line for line in order.lines
            if (not products or line.product_id in products)
            and (not channels or line.channel in channels)]


def valid_purchase(order: OrderNet) -> bool:
    return order.status == STATUS_PAID and order.net_minor > 0 and not order.over_refund


def first_valid_purchase(orders: Sequence[OrderNet], user_id: str) -> OrderNet | None:
    matched = [item for item in orders if item.user_id == user_id and valid_purchase(item)]
    if not matched:
        return None
    return min(matched, key=lambda item: (item.paid_at, item.event_seq, item.order_id))


def buyer_class(order: OrderNet, all_orders: Sequence[OrderNet], period_start: datetime) -> str:
    if not order.user_id:
        return "UNIDENTIFIED"
    first = first_valid_purchase(all_orders, order.user_id)
    if first is None:
        return "UNKNOWN_HISTORY"
    if first.paid_at < period_start:
        return "OLD"
    return "NEW"


def _limit(code: str, message: str, related: str | None = None) -> dict[str, str | None]:
    return {"code": code, "message": message, "related_fact": related}


def _divide_aus(amount: int, buyers: int) -> dict[str, Any]:
    if buyers <= 0:
        return money(None, "ZERO_DENOMINATOR")
    return money(amount // buyers if amount % buyers == 0 else amount // buyers)
    # keep integer minor; remainder is truncated toward zero. Tests use exact division.


def _divide_ratio(num: int, den: int, unit: str = "raw_ratio_0_1") -> dict[str, Any]:
    if den <= 0:
        return ratio(None, unit, "ZERO_DENOMINATOR")
    return ratio(num / den, unit)


def _yoy_abs(current: int | None, base: int | None) -> dict[str, Any]:
    if current is None or base is None:
        return ratio(None, "raw_ratio_0_1", "INCOMPARABLE_BASE")
    if base == 0:
        return ratio(None, "raw_ratio_0_1", "INCOMPARABLE_BASE")
    return ratio(yoy_absolute(current, base), "raw_ratio_0_1")


def sales_window_summary(request: dict[str, Any], basket: NormalizedBasket) -> dict[str, Any]:
    start, end = period_bounds(request["period_start"], request["period_end_exclusive"])
    refund_as_of = as_dt(request["refund_as_of"])
    data_through = as_dt(request["data_through"])
    channels = request.get("channel_ids")
    products = request.get("product_ids")
    view = request.get("refund_view") or VIEW_ORDER
    limitations: list[dict[str, Any]] = [
        _limit("D019_SOURCE_UNVERIFIED", "真实源字段/金额语义尚未核验；本结果仅合成样例", "source")
    ]
    if basket.contains_real_data or request.get("contains_real_data"):
        raise MetricContractError("FORBIDDEN", "本候选入口拒绝真实数据")

    all_orders = compute_order_nets(
        basket.lines, basket.refunds, refund_as_of,
        amount_already_net=bool(request.get("amount_already_net")),
    )
    yoy_start, yoy_end = yoy_period(request["period_start"], request["period_end_exclusive"])
    yoy_start_dt, yoy_end_dt = period_bounds(yoy_start, yoy_end)

    def window_orders(lo: datetime, hi: datetime) -> list[OrderNet]:
        picked = [
            item for item in all_orders
            if _in_period(item.paid_at, lo, hi) and _channel_ok(item, channels) and _product_ok(item, products)
        ]
        return picked

    if view == VIEW_REFUND:
        order_index = {item.order_id: item for item in all_orders}
        flow = []
        blocked = False
        for refund in basket.refunds:
            if refund.status != "SUCCEEDED" or not _in_period(as_dt(refund.refunded_at), start, end) or refund.refunded_at > refund_as_of:
                continue
            order = order_index.get(refund.order_id)
            if order is None:
                blocked = True
                continue
            if not _channel_ok(order, channels) or not _product_ok(order, products):
                continue
            if channels and any(line.channel not in channels for line in order.lines):
                blocked = True
                continue
            if products:
                product = refund.product_id
                if refund.line_id:
                    product = next((line.product_id for line in order.lines if line.line_id == refund.line_id), None)
                if product is None:
                    blocked = True
                    continue
                if product not in products:
                    continue
            flow.append(refund)
        if blocked:
            reason = "PRODUCT_NET_UNAVAILABLE" if products else "CHANNEL_NET_UNAVAILABLE" if channels else "INSUFFICIENT_HISTORY"
            limitations.append(_limit(reason, "退款原订单或商品归属不完整", "refund_flow_amount"))
            return _result(request, basket, QUERY_SALES, {"refund_flow_amount": money(None, reason), "refund_event_count": count(None, reason), "view": VIEW_REFUND}, limitations, start, end, yoy_start, yoy_end)
        amount = sum(item.amount_minor for item in flow)
        facts = {
            "refund_flow_amount": money(amount),
            "refund_event_count": count(len(flow)),
            "view": VIEW_REFUND,
        }
        return _result(request, basket, QUERY_SALES, facts, limitations, start, end, yoy_start, yoy_end)

    picked = window_orders(start, end)
    product_blocked = any(not _selected_amount(item, products, channels)[1] for item in picked)
    if product_blocked:
        reason = "PRODUCT_NET_UNAVAILABLE" if products else "CHANNEL_NET_UNAVAILABLE"
        limitations.append(_limit(reason, "退款或订单净额无法完整归属所选商品/渠道", "gsv_amount"))
        facts = {
            "gsv_amount": money(None, reason),
            "gmv_amount": money(sum(line.gross_minor for item in picked for line in _selected_lines(item, products, channels))),
            "valid_order_count": count(None, reason),
            "buyer_count": count(None, reason),
            "aus": money(None, reason),
            "aov": money(None, reason),
            "line_average_diagnostic": money(None, reason),
        }
        return _result(request, basket, QUERY_SALES, facts, limitations, start, end, yoy_start, yoy_end)

    amounts: list[tuple[OrderNet, int]] = []
    for order in picked:
        value, ok = _selected_amount(order, products, channels)
        if not ok or value is None:
            product_blocked = True
            break
        amounts.append((order, value))
    if product_blocked:
        limitations.append(_limit("PRODUCT_NET_UNAVAILABLE", "商品净额不可用", "gsv_amount"))

    gmv = sum(line.gross_minor for order, _ in amounts for line in _selected_lines(order, products, channels))
    gsv = sum(value for _, value in amounts)
    valid = [(order, value) for order, value in amounts if value > 0 and not order.over_refund]
    identified = [(order, value) for order, value in valid if order.user_id]
    unidentified = [(order, value) for order, value in valid if not order.user_id]
    buyers = {order.user_id for order, _ in identified}
    valid_orders = {order.order_id for order, _ in valid}
    line_count = sum(len(_selected_lines(order, products, channels)) for order, _ in valid)
    paid_qty = 0
    qty_complete = True
    for order, _ in valid:
        for line in _selected_lines(order, products, channels):
            if line.quantity is None:
                qty_complete = False
            else:
                paid_qty += line.quantity

    identified_gsv = sum(value for _, value in identified)
    unidentified_gsv = sum(value for _, value in unidentified)
    if unidentified:
        limitations.append(_limit(
            "UNIDENTIFIED_BUYERS_IN_SCOPE",
            "存在无法关联买家的有效订单，AUS 仅使用已识别范围",
            "aus",
        ))

    aus = money(None, "ZERO_DENOMINATOR") if not buyers else money(identified_gsv // len(buyers) if identified_gsv % len(buyers) == 0 else int(identified_gsv / len(buyers)))
    if buyers and identified_gsv % len(buyers) == 0:
        aus = money(identified_gsv // len(buyers))
    elif buyers:
        aus = money(int(identified_gsv / len(buyers)))
    aov = money(None, "ZERO_DENOMINATOR") if not valid_orders else money(int(sum(v for _, v in valid) / len(valid_orders)))
    if valid_orders and sum(v for _, v in valid) % len(valid_orders) == 0:
        aov = money(sum(v for _, v in valid) // len(valid_orders))
    line_avg = money(None, "ZERO_DENOMINATOR") if line_count == 0 else money(int(sum(v for _, v in valid) / line_count))

    if not basket.history_complete:
        limitations.append(_limit("INSUFFICIENT_HISTORY", "历史不完整；可见期初购买可证明老客，窗口内首次可见购买不能证明新客", "new_buyer_count"))
    classes = {"NEW": [0, set()], "OLD": [0, set()], "UNKNOWN_HISTORY": [0, set()]}
    for order, value in identified:
        klass = buyer_class(order, all_orders, start)
        if klass == "NEW" and not basket.history_complete:
            klass = "UNKNOWN_HISTORY"
        classes[klass][0] += value
        classes[klass][1].add(order.user_id)
    new_amt, new_buyers = classes["NEW"]
    old_amt, old_buyers = classes["OLD"]
    unk_amt, unk_buyers = classes["UNKNOWN_HISTORY"]
    class_sum = new_amt + old_amt + unk_amt
    if class_sum != identified_gsv:
        limitations.append(_limit("DECOMPOSITION_MISMATCH", "新+老+未知应与已识别 GSV 闭合", "gsv_identified"))

    member_amt = 0
    member_buyers: set[str] = set()
    non_amt = 0
    non_buyers: set[str] = set()
    unknown_member_amt = 0
    unknown_member_buyers: set[str] = set()
    for order, value in identified:
        if order.membership == MEMBER_MEMBER:
            member_amt += value
            member_buyers.add(order.user_id)  # type: ignore[arg-type]
        elif order.membership == MEMBER_NON:
            non_amt += value
            non_buyers.add(order.user_id)  # type: ignore[arg-type]
        else:
            unknown_member_amt += value
            unknown_member_buyers.add(order.user_id)  # type: ignore[arg-type]

    member_aus = money(None, "ZERO_DENOMINATOR") if not member_buyers else money(member_amt // len(member_buyers) if member_amt % len(member_buyers) == 0 else int(member_amt / len(member_buyers)))
    non_aus = money(None, "ZERO_DENOMINATOR") if not non_buyers else money(non_amt // len(non_buyers) if non_amt % len(non_buyers) == 0 else int(non_amt / len(non_buyers)))
    if member_aus["value"] is None or non_aus["value"] is None or non_aus["value"] == 0:
        premium = ratio(None, "multiple", "ZERO_DENOMINATOR" if not member_buyers or not non_buyers else "INCOMPARABLE_BASE")
    else:
        premium = ratio(member_aus["value"] / non_aus["value"], "multiple")

    if unknown_member_buyers:
        limitations.append(_limit("UNKNOWN_IDENTITY", "成交时会员状态未知已单列，不并入非会员", "member_unknown_buyer_count"))

    over = [order.order_id for order, _ in amounts if order.over_refund]
    if over:
        limitations.append(_limit("OVER_REFUND", f"退款超过实付，未静默截零: {','.join(over)}", "gsv_amount"))

    yoy_picked = window_orders(yoy_start_dt, yoy_end_dt)
    yoy_gsv = 0
    yoy_ok = True
    for order in yoy_picked:
        value, ok = _selected_amount(order, products, channels)
        if not ok or value is None:
            yoy_ok = False
            break
        yoy_gsv += value
    gsv_yoy = _yoy_abs(gsv if not product_blocked else None, yoy_gsv if yoy_ok else None)
    if basket.coverage_start and as_dt(basket.coverage_start) > yoy_start_dt:
        gsv_yoy = ratio(None, "raw_ratio_0_1", "INSUFFICIENT_HISTORY")
        limitations.append(_limit("INSUFFICIENT_HISTORY", "同比基期不在完整数据覆盖范围", "gsv_yoy"))

    frequency = (
        {"value": round(len(identified) / len(buyers), 4), "unit": "orders_per_buyer", "empty_reason": None}
        if buyers else {"value": None, "unit": "orders_per_buyer", "empty_reason": "ZERO_DENOMINATOR"}
    )
    ipt = {"value": None, "unit": "paid_items_per_order", "empty_reason": "CAPABILITY_UNAVAILABLE"}
    units_per_buyer = {"value": None, "unit": "paid_items_per_buyer", "empty_reason": "CAPABILITY_UNAVAILABLE"}
    if qty_complete and valid_orders:
        ipt = {"value": round(paid_qty / len(valid_orders), 4), "unit": "paid_items_per_order", "empty_reason": None}
    if qty_complete and buyers:
        identified_qty = sum(line.quantity for order, _ in identified for line in _selected_lines(order, products, channels))
        units_per_buyer = {"value": round(identified_qty / len(buyers), 4), "unit": "paid_items_per_buyer", "empty_reason": None}
    if not qty_complete:
        limitations.append(_limit("CAPABILITY_UNAVAILABLE", "没有退件数量时不猜净件数；仅支付件数在完整 quantity 时可用", "net_quantity"))

    facts = {
        "gmv_amount": money(gmv),
        "gsv_amount": money(gsv),
        "gsv_identified": money(identified_gsv),
        "gsv_unidentified": money(unidentified_gsv),
        "valid_order_count": count(len(valid_orders)),
        "buyer_count": count(len(buyers)),
        "unidentified_order_count": count(len({order.order_id for order, _ in unidentified})),
        "aus": aus,
        "aov": aov,
        "line_average_diagnostic": line_avg,
        "new_buyer_count": count(len(new_buyers)),
        "old_buyer_count": count(len(old_buyers)),
        "unknown_history_buyer_count": count(len(unk_buyers)),
        "new_gsv_amount": money(new_amt),
        "old_gsv_amount": money(old_amt),
        "unknown_history_gsv_amount": money(unk_amt),
        "new_buyer_share": _divide_ratio(len(new_buyers), len(buyers)),
        "old_buyer_share": _divide_ratio(len(old_buyers), len(buyers)),
        "new_amount_share": _divide_ratio(new_amt, identified_gsv) if identified_gsv else ratio(None, "raw_ratio_0_1", "ZERO_DENOMINATOR"),
        "old_amount_share": _divide_ratio(old_amt, identified_gsv) if identified_gsv else ratio(None, "raw_ratio_0_1", "ZERO_DENOMINATOR"),
        "member_buyer_count": count(len(member_buyers)),
        "non_member_buyer_count": count(len(non_buyers)),
        "member_unknown_buyer_count": count(len(unknown_member_buyers)),
        "member_gsv_amount": money(member_amt),
        "non_member_gsv_amount": money(non_amt),
        "member_unknown_gsv_amount": money(unknown_member_amt),
        "member_aus": member_aus,
        "non_member_aus": non_aus,
        "member_premium_multiple": premium,
        "frequency_orders_per_buyer": frequency,
        "items_per_order_paid": ipt,
        "items_per_buyer_paid": units_per_buyer,
        "net_quantity": count(None, "CAPABILITY_UNAVAILABLE"),
        "gsv_yoy": gsv_yoy,
        "uv_daily_sum": count(None, "CAPABILITY_UNAVAILABLE"),
        "uv_cycle_unique": count(None, "CAPABILITY_UNAVAILABLE"),
        "rfm_threshold_version": RFM_THRESHOLD_VERSION,
        "rfm_r_bucket_days": RFM_THRESHOLDS["r_days"],
        "view": VIEW_ORDER,
        "refund_as_of": refund_as_of.isoformat(),
        "storewide_unique_buyers": count(len(buyers)),
        "member_plus_nonmember_buyers_not_storewide_unique": count(len(member_buyers) + len(non_buyers)),
    }
    limitations.append(_limit("CAPABILITY_UNAVAILABLE", "日UV累计与周期去重 UV 本源不具备访问事件", "uv_cycle_unique"))
    return _result(
        request, basket, QUERY_SALES, facts, limitations, start, end, yoy_start, yoy_end,
        extra_filters={"data_through": data_through.isoformat()},
        decisions=DECISIONS_SALES,
    )


def existing_customer_repurchase(request: dict[str, Any], basket: NormalizedBasket) -> dict[str, Any]:
    start, end = period_bounds(request["period_start"], request["period_end_exclusive"])
    refund_as_of = as_dt(request["refund_as_of"])
    channels = request.get("channel_ids")
    products = request.get("product_ids")
    limitations = [_limit("D019_SOURCE_UNVERIFIED", "真实历史覆盖未核验；本结果仅合成样例", "opening_old_customers")]
    if basket.contains_real_data or request.get("contains_real_data"):
        raise MetricContractError("FORBIDDEN", "本候选入口拒绝真实数据")
    all_orders = compute_order_nets(
        basket.lines, basket.refunds, refund_as_of,
        amount_already_net=bool(request.get("amount_already_net")),
    )
    users = {order.user_id for order in all_orders if order.user_id}
    opening: set[str] = set()
    unknown_history: set[str] = set()
    for user_id in users:
        first = first_valid_purchase(all_orders, user_id)
        if first is None:
            unknown_history.add(user_id)
            continue
        if first.paid_at < start:
            opening.add(user_id)
        elif not basket.history_complete:
            unknown_history.add(user_id)
    if unknown_history:
        limitations.append(_limit("INSUFFICIENT_HISTORY", "部分身份无法重算首次有效购买，已单列未知", "unknown_history_count"))

    product_blocked = False
    if products:
        historical: set[str] = set()
        for order in all_orders:
            if not order.user_id or order.paid_at >= start:
                continue
            if not order.product_net_available:
                if valid_purchase(order) and _product_ok(order, products):
                    product_blocked = True
                continue
            if any(order.product_net.get(pid, 0) > 0 for pid in products):
                historical.add(order.user_id)
        opening = opening & historical
        facts_note = "product_historical_set"
    else:
        facts_note = "storewide_old_customers"

    window_buyers: set[str] = set()
    window_amount = 0
    for order in all_orders:
        if not order.user_id or order.user_id not in opening:
            continue
        if not _in_period(order.paid_at, start, end):
            continue
        if not _channel_ok(order, channels) or not _product_ok(order, products):
            continue
        value, ok = _selected_amount(order, products, channels)
        if not ok or value is None:
            product_blocked = True
            continue
        if value > 0 and not order.over_refund:
            window_buyers.add(order.user_id)
            window_amount += value
    if product_blocked:
        limitations.append(_limit("PRODUCT_NET_UNAVAILABLE" if products else "CHANNEL_NET_UNAVAILABLE", "历史人群或当期订单净额无法完整归属所选范围", "repurchase_gsv"))

    repurchase_buyers = window_buyers & opening
    rate = _divide_ratio(len(repurchase_buyers), len(opening)) if opening else ratio(None, "raw_ratio_0_1", "ZERO_DENOMINATOR")
    aus = money(None, "ZERO_DENOMINATOR")
    if repurchase_buyers:
        aus = money(window_amount // len(repurchase_buyers) if window_amount % len(repurchase_buyers) == 0 else int(window_amount / len(repurchase_buyers)))
    facts = {
        "opening_old_customers": count(len(opening)),
        "repurchase_buyers": count(len(repurchase_buyers)),
        "repurchase_rate": rate,
        "repurchase_gsv": money(window_amount),
        "repurchase_aus": aus,
        "unknown_history_count": count(len(unknown_history)),
        "cohort_kind": facts_note,
        "identity_scope": request.get("identity_scope") or "STOREWIDE",
    }
    if not basket.history_complete or product_blocked:
        reason = "INSUFFICIENT_HISTORY" if not basket.history_complete else "PRODUCT_NET_UNAVAILABLE" if products else "CHANNEL_NET_UNAVAILABLE"
        facts["observed_opening_old_customers"] = count(len(opening))
        facts["opening_old_customers"] = count(None, reason)
        facts["repurchase_buyers"] = count(None, reason)
        facts["repurchase_rate"] = ratio(None, "raw_ratio_0_1", reason)
        facts["repurchase_gsv"] = money(None, reason)
        facts["repurchase_aus"] = money(None, reason)
        limitations.append(_limit(reason, "回购人群覆盖或商品净额不完整，不能把可见子集冒充完整回购率", "repurchase_rate"))
    yoy_start, yoy_end = yoy_period(request["period_start"], request["period_end_exclusive"])
    return _result(request, basket, QUERY_REPURCHASE, facts, limitations, start, end, yoy_start, yoy_end, decisions=DECISIONS_REPURCHASE)


def sample_followup(request: dict[str, Any], basket: NormalizedBasket) -> dict[str, Any]:
    observation_days = int(request.get("observation_days") or 14)
    cohort_start = request.get("cohort_period_start") or request["period_start"]
    cohort_end = request.get("cohort_period_end_exclusive") or request["period_end_exclusive"]
    start, end = period_bounds(cohort_start, cohort_end)
    refund_as_of = as_dt(request["refund_as_of"])
    data_through = as_dt(request["data_through"])
    channels = request.get("channel_ids")
    limitations = [
        _limit("D019_SOURCE_UNVERIFIED", "派样资格（零价/赠品/取消）真实规则未核验；合成样例以 is_sample 为准", "sample_cohort"),
        _limit("SAMPLE_ROI_DISCLAIMER", SAMPLE_ROI_DISCLAIMER, "sampling_roi"),
    ]
    if basket.contains_real_data or request.get("contains_real_data"):
        raise MetricContractError("FORBIDDEN", "本候选入口拒绝真实数据")
    all_orders = compute_order_nets(
        basket.lines, basket.refunds, refund_as_of,
        amount_already_net=bool(request.get("amount_already_net")),
    )
    samples = [
        item for item in all_orders
        if item.is_sample and item.user_id and _in_period(item.paid_at, start, end)
    ]
    first_by_user: dict[str, OrderNet] = {}
    for sample in sorted(samples, key=lambda item: (item.paid_at, item.event_seq, item.order_id)):
        assert sample.user_id is not None
        if sample.user_id not in first_by_user:
            first_by_user[sample.user_id] = sample
    attributed = list(first_by_user.values())
    if channels:
        attributed = [item for item in attributed if item.channel in channels]

    mature_users: list[OrderNet] = []
    immature_users: list[OrderNet] = []
    for sample in attributed:
        window = natural_day_window(sample.paid_at, observation_days)
        if is_mature(window["exclusive_end"], data_through):
            mature_users.append(sample)
        else:
            immature_users.append(sample)

    def later_valid(sample: OrderNet) -> list[OrderNet]:
        window = natural_day_window(sample.paid_at, observation_days)
        found = []
        for order in all_orders:
            if order.user_id != sample.user_id:
                continue
            if order.order_id == sample.order_id:
                continue
            if order.is_sample:
                continue
            if not valid_purchase(order):
                continue
            if order.paid_at <= sample.paid_at and not (
                order.paid_at == sample.paid_at and (order.event_seq, order.order_id) > (sample.event_seq, sample.order_id)
            ):
                continue
            if order.paid_at >= window["exclusive_end"]:
                continue
            found.append(order)
        return found

    repeat_users = []
    repeat_amount = 0
    for sample in mature_users:
        later = later_valid(sample)
        if later:
            repeat_users.append(sample.user_id)
            repeat_amount += sum(item.net_minor for item in later)

    if not mature_users:
        rate = ratio(None, "raw_ratio_0_1", "EMPTY_MATURE_COHORT")
        roi = money(None, "EMPTY_MATURE_COHORT")
    else:
        rate = _divide_ratio(len(repeat_users), len(mature_users))
        roi = money(repeat_amount)

    if basket.coverage_start and as_dt(basket.coverage_start) > start:
        rate = ratio(None, "raw_ratio_0_1", "INSUFFICIENT_HISTORY")
        roi = money(None, "INSUFFICIENT_HISTORY")
        limitations.append(_limit("INSUFFICIENT_HISTORY", "派样队列起点早于资料覆盖；无法确认统计期第一笔派样", "sample_cohort"))
    facts = {
        "sample_cohort_count": count(len(attributed)),
        "mature_cohort_count": count(len(mature_users)),
        "immature_count": count(len(immature_users)),
        "repeat_buyers": count(len(repeat_users)),
        "repeat_rate": rate,
        "repeat_revenue": money(repeat_amount),
        "sampling_roi": roi,
        "sampling_roi_kind": "repeat_revenue_performance",
        "sampling_roi_disclaimer": SAMPLE_ROI_DISCLAIMER,
        "observation_days": observation_days,
        "attribution": "first_sample_in_period_then_channel_filter",
        "same_order_split_is_not_repeat": True,
    }
    yoy_start, yoy_end = yoy_period(request["period_start"], request["period_end_exclusive"])
    return _result(
        request, basket, QUERY_SAMPLE, facts, limitations, start, end, yoy_start, yoy_end,
        extra_filters={
            "observation_days": observation_days,
            "cohort_period_start": as_date(cohort_start).isoformat(),
            "cohort_period_end_exclusive": as_date(cohort_end).isoformat(),
            "data_through": data_through.isoformat(),
        },
        decisions=DECISIONS_SAMPLE,
    )


def ltv_new_customer_n_day(request: dict[str, Any], basket: NormalizedBasket, user_id: str, observation_days: int) -> dict[str, Any]:
    """Default LTV: first valid payment + storewide later nets for N natural days."""
    if not basket.history_complete:
        return {"value": None, "empty_reason": "INSUFFICIENT_HISTORY", "includes_first_order": True}
    refund_as_of = as_dt(request["refund_as_of"])
    data_through = as_dt(request["data_through"])
    all_orders = compute_order_nets(
        basket.lines, basket.refunds, refund_as_of,
        amount_already_net=bool(request.get("amount_already_net")),
    )
    first = first_valid_purchase(all_orders, user_id)
    if first is None:
        return {"value": None, "empty_reason": "INSUFFICIENT_HISTORY", "includes_first_order": True}
    window = natural_day_window(first.paid_at, observation_days)
    mature = is_mature(window["exclusive_end"], data_through)
    total = 0
    for order in all_orders:
        if order.user_id != user_id or not valid_purchase(order):
            continue
        if order.paid_at < first.paid_at:
            continue
        if order.paid_at >= window["exclusive_end"]:
            continue
        if order.order_id == first.order_id or order.paid_at > first.paid_at or (
            order.paid_at == first.paid_at and (order.event_seq, order.order_id) >= (first.event_seq, first.order_id)
        ):
            total += order.net_minor
    return {
        "value": total if mature else None,
        "empty_reason": None if mature else "IMMATURE",
        "includes_first_order": True,
        "storewide_follow_on": True,
        "mature": mature,
        "window": {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in window.items()},
    }


def _result(
    request: dict[str, Any],
    basket: NormalizedBasket,
    query_id: str,
    facts: dict[str, Any],
    limitations: list[dict[str, Any]],
    start: datetime,
    end: datetime,
    yoy_start: date,
    yoy_end: date,
    extra_filters: dict[str, Any] | None = None,
    decisions: Sequence[str] = (),
) -> dict[str, Any]:
    filters = {
        "period_start": start.date().isoformat(),
        "period_end_exclusive": end.date().isoformat(),
        "refund_view": request.get("refund_view") or VIEW_ORDER,
        "refund_as_of": as_dt(request["refund_as_of"]).isoformat(),
        "data_through": as_dt(request["data_through"]).isoformat(),
        "timezone": request.get("timezone") or TIMEZONE_NAME,
        "channel_ids": request.get("channel_ids"),
        "product_ids": request.get("product_ids"),
        "identity_scope": request.get("identity_scope") or "STOREWIDE",
        "observation_days": request.get("observation_days"),
        "amount_already_net": bool(request.get("amount_already_net")),
        "cohort_period_start": request.get("cohort_period_start"),
        "cohort_period_end_exclusive": request.get("cohort_period_end_exclusive"),
        "yoy_period_start": yoy_start.isoformat(),
        "yoy_period_end_exclusive": yoy_end.isoformat(),
    }
    if extra_filters:
        filters.update(extra_filters)
    payload = {
        "metric_version": METRIC_VERSION,
        "query_id": query_id,
        "data_version": basket.data_version,
        "filters": filters,
        "facts": facts,
    }
    return {
        "status": "OK",
        "schema_version": SCHEMA_VERSION,
        "query_version": QUERY_VERSION,
        "source_id": basket.source_id,
        "contains_real_data": False,
        "synthetic": True,
        "metric_version": METRIC_VERSION,
        "query_id": query_id,
        "metric_id": query_id,
        "data_version": basket.data_version,
        "mapping_version": basket.mapping_version,
        "data_through": filters["data_through"],
        "resolved_filters": filters,
        "facts": facts,
        "limitations": limitations,
        "query_ref": make_query_ref(payload),
        "decision_ids": list(decisions),
        "implementation_status": "synthetic_verified",
        "publication_status": "local_isolated_candidate",
        "real_business_acceptance": False,
        "production_release": False,
    }


QUERY_HANDLERS = {
    QUERY_SALES: sales_window_summary,
    QUERY_REPURCHASE: existing_customer_repurchase,
    QUERY_SAMPLE: sample_followup,
}


def run_query(request: dict[str, Any], basket: NormalizedBasket) -> dict[str, Any]:
    if request.get("metric_version") != METRIC_VERSION:
        raise MetricContractError("METRIC_NOT_APPROVED", f"需要 {METRIC_VERSION}")
    query_id = request.get("query_id")
    handler = QUERY_HANDLERS.get(query_id)
    if handler is None:
        raise MetricContractError("UNSUPPORTED_METRIC", f"未知 query_id: {query_id}")
    if (query_id != QUERY_SALES and request.get("refund_view") == VIEW_REFUND) or (
        query_id == QUERY_SAMPLE and request.get("product_ids")
    ):
        raise MetricContractError("UNSUPPORTED_FILTER", "该查询尚不支持此筛选组合，不能忽略筛选返回全量结果")
    if request.get("timezone") not in (None, TIMEZONE_NAME):
        raise MetricContractError("INVALID_REQUEST", "timezone 必须是 Asia/Shanghai")
    return handler(request, basket)


def default_synthetic_path() -> Path:
    return Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "crm_metrics_v1" / "synthetic-store-v1.json"


def result_cache_key(
    source_id: str,
    data_version: str,
    mapping_version: str,
    metric_version: str,
    resolved_filters: dict[str, Any],
    actor_scope: str,
    query_id: str = QUERY_SALES,
) -> str:
    return make_query_ref({
        "source_id": source_id,
        "data_version": data_version,
        "mapping_version": mapping_version,
        "metric_version": metric_version,
        "query_id": query_id,
        "resolved_filters": resolved_filters,
        "actor_scope": actor_scope,
    })


class IsolatedResultCache:
    """In-process candidate cache. Not rfm/cache.py and not an archive writer."""

    def __init__(self):
        self._store: dict[str, dict[str, Any]] = {}

    def get(self, key: str) -> dict[str, Any] | None:
        return self._store.get(key)

    def set(self, key: str, value: dict[str, Any]) -> None:
        self._store[key] = value


class SyntheticReadonlySource:
    """JSON fixture reader for the isolated loop. Not a real DuckDB archive adapter."""

    def __init__(self, path: str | Path | None = None):
        self.path = Path(path) if path else default_synthetic_path()
        allowed = default_synthetic_path().resolve()
        if self.path.resolve() != allowed:
            raise MetricContractError("FORBIDDEN", "合成源只允许默认夹具路径")
        self.basket = load_basket(self.path)
        if self.basket.contains_real_data:
            raise MetricContractError("FORBIDDEN", "合成源不得含真实数据")
        self.cache = IsolatedResultCache()

    def capabilities(self) -> dict[str, Any]:
        return {
            "source_id": self.basket.source_id,
            "kind": "SYNTHETIC_JSON_READ_ONLY",
            "contains_real_data": False,
            "metric_version": METRIC_VERSION,
            "queries": [QUERY_SALES, QUERY_REPURCHASE, QUERY_SAMPLE],
            "d019": "unverified",
        }

    def execute(self, request: dict[str, Any]) -> dict[str, Any]:
        result = run_query(request, self.basket)
        key = result_cache_key(
            self.basket.source_id,
            self.basket.data_version,
            self.basket.mapping_version,
            result["metric_version"],
            result["resolved_filters"],
            str(request.get("actor_scope") or "server_filled"),
            result["query_id"],
        )
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        self.cache.set(key, result)
        return result


EXPLAIN_TOPICS: dict[str, dict[str, Any]] = {
    "aus": {
        "formula": "同范围净额 / 去重已识别购买人数",
        "unit": "minor_per_buyer",
        "decision_ids": ["D001", "D006", "D018"],
        "evidence_refs": ["decision:D001", "ppt:slide:160", "contract:crm-metrics/v1"],
        "conflicts": ["旧 overview.avg_order_value 为明细行均，不是 AUS"],
        "capabilities": [QUERY_SALES],
        "missing": [],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "aov": {
        "formula": "同范围净额 / 去重有效订单数",
        "unit": "minor_per_order",
        "decision_ids": ["D001", "D006"],
        "evidence_refs": ["decision:D001", "contract:crm-metrics/v1"],
        "conflicts": ["不得用行均冒充客单价或每单金额"],
        "capabilities": [QUERY_SALES],
        "missing": [],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "member_premium": {
        "formula": "会员 AUS / 非会员 AUS（倍数）",
        "unit": "multiple",
        "decision_ids": ["D002", "D014", "D017"],
        "evidence_refs": ["decision:D002", "ppt:slide:161", "contract:crm-metrics/v1"],
        "conflicts": ["1.2 倍不是高 120%；高 20% 是 (1.2-1)"],
        "capabilities": [QUERY_SALES],
        "missing": ["真实成交时会员事件映射"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "gsv": {
        "formula": "实付 - 截至 refund_as_of 的成功退款；部分退保留有效购买，全退订单净额 0 且不计有效单",
        "unit": "minor",
        "decision_ids": ["D003", "D005", "D006"],
        "evidence_refs": ["decision:D003", "contract:crm-metrics/v1"],
        "conflicts": ["GSV_PREDICATE 排除全部 is_refund，与部分退净额原则不同"],
        "capabilities": [QUERY_SALES],
        "missing": ["D019 金额是否已净额"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "new_old": {
        "formula": "按窗口起点与全店首次有效购买比较；按报告退款截止重算；历史报告保留版本",
        "unit": None,
        "decision_ids": ["D004", "D018", "D020", "D021"],
        "evidence_refs": ["decision:D004", "decision:D021", "contract:crm-metrics/v1"],
        "conflicts": ["品类页用月初 cutoff 且 cutoff 当天算新客"],
        "capabilities": [QUERY_SALES, QUERY_REPURCHASE],
        "missing": ["真实全店历史覆盖"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "sample_followup": {
        "formula": "支付日起自然日观察；第1天=支付日；成熟后比较；每人第一笔派样归属渠道",
        "unit": "raw_ratio_0_1",
        "decision_ids": ["D009", "D010", "D011", "D022"],
        "evidence_refs": ["decision:D010", "decision:D011", "contract:crm-metrics/v1"],
        "conflicts": ["派样 ROI 名称保留但不是利润 ROI"],
        "capabilities": [QUERY_SAMPLE],
        "missing": ["真实派样资格映射"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "new_member_conversion": {
        "formula": None,
        "unit": None,
        "decision_ids": ["D015", "D014"],
        "evidence_refs": ["decision:D015", "kg:DataRequirement:first_join_event"],
        "conflicts": ["订单 is_member 不能替代首次入会事件"],
        "capabilities": [],
        "missing": ["首次入会事件", "观察期成熟 cohort"],
        "definition_review_status": "principles_confirmed_mapping_pending",
        "implementation_status_override": "source_unverified",
    },
}


def explain_topic(topic: str) -> dict[str, Any]:
    key = topic.strip().lower()
    aliases = {
        "客单价": "aus",
        "每单金额": "aov",
        "会员溢价": "member_premium",
        "派样roi": "sample_followup",
        "派样": "sample_followup",
        "新老客": "new_old",
        "新会员转化": "new_member_conversion",
        "部分退款": "gsv",
        "gsv": "gsv",
    }
    resolved = aliases.get(key, key)
    spec = EXPLAIN_TOPICS.get(resolved)
    if spec is None:
        return {
            "topic": topic,
            "metric_version": METRIC_VERSION,
            "definition_review_status": "unknown_topic",
            "implementation_status": "not_implemented",
            "unit": None,
            "formula": None,
            "decision_ids": [],
            "evidence_refs": ["contract:crm-metrics/v1"],
            "conflicts": [],
            "capabilities": [],
            "missing": [f"无主题 {topic}"],
            "synthetic": True,
            "publication_status": "local_isolated_candidate",
        }
    return {
        "topic": resolved,
        "metric_version": METRIC_VERSION,
        "definition_review_status": spec["definition_review_status"],
        "implementation_status": spec.get("implementation_status_override") or "synthetic_verified",
        "unit": spec["unit"],
        "formula": spec["formula"],
        "decision_ids": spec["decision_ids"],
        "evidence_refs": spec["evidence_refs"],
        "conflicts": spec["conflicts"],
        "capabilities": spec["capabilities"],
        "missing": spec["missing"],
        "synthetic": True,
        "publication_status": "local_isolated_candidate",
        "real_business_acceptance": False,
        "code_fixed_in_legacy_services": False,
    }
