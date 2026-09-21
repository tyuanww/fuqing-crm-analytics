"""One bounded aggregate over the dashboard filter; no first-purchase join or DB writes."""
from backend.contracts.crm_dashboard import DashboardFilters, DashboardPurchases
from backend.semantic.dashboard_purchases import average_fen, money_fen
from backend.semantic.filters import FilterBuilder, MetricType

LOW_PRICE_CHANNELS = ['U先派样', '百补派样', '赠品&0.01', '其他']


def dashboard_where(filters: DashboardFilters, metric_type: MetricType = MetricType.GSV):
    """Shared parameterized dashboard window; GSV excludes is_refund, GMV does not."""
    fb = FilterBuilder().with_metric_type(metric_type).with_time_range(
        filters.start_date.isoformat(), filters.end_date.isoformat())
    if filters.channel != '全店':
        fb.with_channels([filters.channel])
    if filters.exclude_low_price:
        fb.with_exclude_channels(LOW_PRICE_CHANNELS)
    return fb.build()


def query_dashboard_purchases(conn, filters: DashboardFilters) -> DashboardPurchases:
    where, params = dashboard_where(filters)
    row = conn.execute(f'''
        WITH base AS (
            SELECT order_id, user_id, actual_amount,
                order_id IS NULL OR TRIM(CAST(order_id AS VARCHAR)) = '' AS unknown_order,
                user_id IS NULL OR TRIM(CAST(user_id AS VARCHAR)) = '' AS unknown_buyer
            FROM orders o WHERE {where}
        ), order_totals AS (
            SELECT order_id, SUM(actual_amount) AS amount FROM base
            WHERE NOT unknown_order GROUP BY order_id
        ), buyer_totals AS (
            SELECT b.user_id, SUM(b.actual_amount) AS amount,
                MAX(CASE WHEN ot.amount > 0 THEN 1 ELSE 0 END) AS has_positive_order
            FROM base b LEFT JOIN order_totals ot ON b.order_id = ot.order_id
            WHERE NOT b.unknown_buyer GROUP BY b.user_id
        )
        SELECT COALESCE(SUM(actual_amount), 0), COUNT(*),
            (SELECT COUNT(*) FROM order_totals WHERE amount > 0),
            (SELECT COUNT(*) FROM buyer_totals WHERE has_positive_order = 1),
            COUNT(*) FILTER (WHERE unknown_order), COUNT(*) FILTER (WHERE unknown_buyer),
            COALESCE(SUM(actual_amount) FILTER (WHERE unknown_order), 0),
            COALESCE(SUM(actual_amount) FILTER (WHERE unknown_buyer), 0),
            COUNT(*) FILTER (WHERE actual_amount IS NULL OR NOT isfinite(actual_amount)),
            COUNT(*) FILTER (WHERE actual_amount < 0),
            (SELECT COUNT(*) FROM order_totals WHERE amount = 0),
            (SELECT COUNT(*) FROM buyer_totals WHERE has_positive_order = 0 AND amount = 0)
        FROM base
    ''', params).fetchone()
    keys = ('rows', 'orders', 'buyers', 'unknown_order_rows', 'unknown_buyer_rows',
            'unknown_order_amount_fen', 'unknown_buyer_amount_fen', 'null_amount_rows',
            'negative_amount_rows', 'zero_amount_orders', 'zero_only_buyers')
    coverage = {key: money_fen(value) if key.endswith('_amount_fen') else int(value)
                for key, value in zip(keys, row[1:], strict=True)}
    amount = money_fen(row[0])
    invalid = coverage['null_amount_rows'] > 0 or coverage['negative_amount_rows'] > 0
    aov = average_fen(amount, coverage['orders'], unknown=coverage['unknown_order_rows'] > 0,
                      invalid_amount=invalid,
                      unknown_reason='UNKNOWN_ORDER')
    aus = average_fen(amount, coverage['buyers'], unknown=coverage['unknown_buyer_rows'] > 0 or coverage['unknown_order_rows'] > 0,
                      invalid_amount=invalid,
                      unknown_reason='UNKNOWN_BUYER' if coverage['unknown_buyer_rows'] else 'UNKNOWN_ORDER')
    return DashboardPurchases(filters=filters, gsv_amount_fen=amount, coverage=coverage, aov=aov, aus=aus,
        limitations=[
            '金额复用看板GSV，不再扣退款；净额版另列。',
            '金额与分母来自同一次聚合；未使用首购表或新客加老客人数。',
            '缺失标识或异常金额使对应均值不可用；零元订单不计购买分母，另列订单数和仅零元买家数。',
            '订单和买家以源order_id/user_id去重；尚不证明跨系统身份一致。',
            '数据水位与退款截止日未知；金额沿用看板舍入，均值按分四舍五入。',
        ])
