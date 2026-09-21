"""Member premium from membership_at_purchase. Never uses current is_member."""
from decimal import Decimal, ROUND_HALF_UP

from backend.contracts.crm_dashboard import (
    DashboardAverage, DashboardFilters, DashboardMembership, DashboardMembershipCoverage, DashboardMultiple)
from backend.semantic.dashboard_purchases import average_fen, money_fen
from backend.services.metrics.dashboard_purchases import dashboard_where
from backend.services.metrics.dashboard_source import inspect_dashboard_source

REQUIRED = ['orders.membership_at_purchase']
SOURCE = 'order line membership_at_purchase snapshot'
UNLOCK = '提供成交时 MEMBER/NON_MEMBER/UNKNOWN，或入会/退会事件；禁止用当前 is_member 倒推。'
LIMITS = [
    '比较对象为非会员 AUS；未知身份单列，不并入非会员。',
    '同一买家在窗口内入会前后分别归组。',
    '金额沿用看板 GSV 过滤，不再扣退款。',
]


def query_dashboard_membership(conn, filters: DashboardFilters) -> DashboardMembership:
    inventory = inspect_dashboard_source(conn)
    blocked = not inventory.has_membership_at_purchase
    if blocked:
        return DashboardMembership(
            status='UNAVAILABLE', filters=filters, reason='MEMBERSHIP_AT_PURCHASE_UNAVAILABLE',
            required_fields=REQUIRED, source_system='archive DuckDB orders.is_member',
            unlock=UNLOCK, member_gsv_amount_fen=None, non_member_gsv_amount_fen=None,
            unknown_member_gsv_amount_fen=None, coverage=None, member_aus=None, non_member_aus=None,
            premium=DashboardMultiple(value=None, reason='UNAVAILABLE'),
            limitations=[UNLOCK, *inventory.rejected_substitutes],
        )
    where, params = dashboard_where(filters)
    row = conn.execute(f'''
        WITH base AS (
            SELECT order_id, user_id, actual_amount,
                CASE
                    WHEN membership_at_purchase IN ('MEMBER', 'NON_MEMBER', 'UNKNOWN') THEN membership_at_purchase
                    ELSE 'UNKNOWN'
                END AS membership,
                order_id IS NULL OR TRIM(CAST(order_id AS VARCHAR)) = '' AS unknown_order,
                user_id IS NULL OR TRIM(CAST(user_id AS VARCHAR)) = '' AS unknown_buyer
            FROM orders o WHERE {where}
        ), order_totals AS (
            SELECT order_id, SUM(actual_amount) AS amount,
                CASE WHEN COUNT(DISTINCT membership) = 1 THEN MAX(membership) ELSE 'UNKNOWN' END AS membership
            FROM base WHERE NOT unknown_order GROUP BY order_id
        ), positive AS (
            SELECT * FROM order_totals WHERE amount > 0
        ), buyers AS (
            SELECT b.user_id, p.membership
            FROM base b JOIN positive p ON b.order_id = p.order_id
            WHERE NOT b.unknown_buyer
            GROUP BY b.user_id, p.membership
        )
        SELECT
            COALESCE((SELECT SUM(amount) FROM positive WHERE membership = 'MEMBER'), 0),
            COALESCE((SELECT SUM(amount) FROM positive WHERE membership = 'NON_MEMBER'), 0),
            COALESCE((SELECT SUM(amount) FROM positive WHERE membership = 'UNKNOWN'), 0),
            (SELECT COUNT(*) FROM positive WHERE membership = 'MEMBER'),
            (SELECT COUNT(*) FROM positive WHERE membership = 'NON_MEMBER'),
            (SELECT COUNT(*) FROM positive WHERE membership = 'UNKNOWN'),
            (SELECT COUNT(*) FROM buyers WHERE membership = 'MEMBER'),
            (SELECT COUNT(*) FROM buyers WHERE membership = 'NON_MEMBER'),
            (SELECT COUNT(*) FROM buyers WHERE membership = 'UNKNOWN'),
            (SELECT COUNT(*) FROM base WHERE unknown_order),
            (SELECT COUNT(*) FROM base WHERE unknown_buyer),
            (SELECT COUNT(*) FROM base WHERE actual_amount IS NULL OR NOT isfinite(actual_amount)),
            (SELECT COUNT(*) FROM base WHERE actual_amount < 0)
    ''', params).fetchone()
    member_gsv, non_gsv, unknown_gsv = (money_fen(row[0]), money_fen(row[1]), money_fen(row[2]))
    coverage = DashboardMembershipCoverage(
        member_orders=int(row[3]), non_member_orders=int(row[4]), unknown_member_orders=int(row[5]),
        member_buyers=int(row[6]), non_member_buyers=int(row[7]), unknown_member_buyers=int(row[8]),
        unknown_order_rows=int(row[9]), unknown_buyer_rows=int(row[10]),
        null_amount_rows=int(row[11]), negative_amount_rows=int(row[12]),
    )
    invalid = coverage.null_amount_rows > 0 or coverage.negative_amount_rows > 0
    member_aus = average_fen(member_gsv, coverage.member_buyers, unknown=False, invalid_amount=invalid,
                             unknown_reason='UNKNOWN_ORDER')
    non_aus = average_fen(non_gsv, coverage.non_member_buyers, unknown=False, invalid_amount=invalid,
                          unknown_reason='UNKNOWN_ORDER')
    premium = _premium(member_aus, non_aus, coverage.unknown_member_buyers > 0)
    return DashboardMembership(
        status='OK', filters=filters, reason=None, required_fields=REQUIRED, source_system=SOURCE,
        unlock=UNLOCK, member_gsv_amount_fen=member_gsv, non_member_gsv_amount_fen=non_gsv,
        unknown_member_gsv_amount_fen=unknown_gsv, coverage=coverage,
        member_aus=DashboardAverage(**member_aus), non_member_aus=DashboardAverage(**non_aus),
        premium=premium, limitations=LIMITS,
    )


def _premium(member_aus: dict, non_aus: dict, unknown_members: bool) -> DashboardMultiple:
    if member_aus['reason'] == 'INVALID_AMOUNT' or non_aus['reason'] == 'INVALID_AMOUNT':
        return DashboardMultiple(value=None, reason='INVALID_AMOUNT')
    if member_aus['amount_fen'] is None or non_aus['amount_fen'] is None or non_aus['amount_fen'] == 0:
        reason = 'ZERO_DENOMINATOR' if (member_aus['denominator'] == 0 or non_aus['denominator'] == 0) else 'INCOMPARABLE_BASE'
        return DashboardMultiple(value=None, reason=reason)
    value = float((Decimal(member_aus['amount_fen']) / Decimal(non_aus['amount_fen'])).quantize(
        Decimal('0.0001'), rounding=ROUND_HALF_UP))
    return DashboardMultiple(value=value, reason='UNKNOWN_IDENTITY' if unknown_members else None)
