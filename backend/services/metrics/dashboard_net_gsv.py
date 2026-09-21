"""Net GSV from dated succeeded refund events. Never subtracts from dashboard GSV."""
from backend.contracts.crm_dashboard import DashboardFilters, DashboardNetGsv
from backend.semantic.dashboard_purchases import money_fen
from backend.semantic.filters import MetricType
from backend.services.metrics.dashboard_purchases import dashboard_where
from backend.services.metrics.dashboard_source import REFUND_EVENT_TABLES, inspect_dashboard_source

REQUIRED = ['refund_id', 'order_id', 'refunded_at', 'amount_minor', 'status=SUCCEEDED']
UNLOCK = '接入成功退款流水、成功时间、父子订单归属与退款截止日；不能用 is_refund 或行上累计退款代替。'


def query_dashboard_net_gsv(conn, filters: DashboardFilters, refund_as_of) -> DashboardNetGsv:
    inventory = inspect_dashboard_source(conn)
    if not inventory.has_refund_events:
        return DashboardNetGsv(
            status='UNAVAILABLE', filters=filters, refund_as_of=refund_as_of,
            reason='MISSING_REFUND_EVENTS', required_fields=REQUIRED,
            source_system='archive DuckDB orders.refund_amount/is_refund',
            unlock=UNLOCK, gross_paid_fen=None, succeeded_refund_fen=None, net_gsv_amount_fen=None,
            parent_child_attributed=False,
            limitations=[UNLOCK, '看板 GSV 已排除 is_refund=TRUE，不能再对其扣退款。',
                         *inventory.rejected_substitutes],
        )
    tables = set(inventory.tables)
    refund_table = next(name for name in REFUND_EVENT_TABLES if name in tables)
    use_parent = inventory.has_parent_order_id
    parent = 'o.parent_order_id' if use_parent else 'o.order_id'
    refund_parent = 'r.parent_order_id' if use_parent else 'r.order_id'
    where, params = dashboard_where(filters, MetricType.GMV)
    order_cols = {str(row[0]) for row in conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'main' AND table_name = 'orders'").fetchall()}
    if 'is_refund' in order_cols:
        flagged = conn.execute(
            f'SELECT COUNT(*) FROM orders o WHERE {where} AND o.is_refund = TRUE', params).fetchone()[0]
        if flagged:
            return DashboardNetGsv(
                status='UNAVAILABLE', filters=filters, refund_as_of=refund_as_of,
                reason='AMOUNT_ALREADY_NET_CONFLICT', required_fields=REQUIRED,
                source_system='orders.is_refund + refund events',
                unlock='实付已按退款标记处理时不能再减退款事件；两侧只保留一套。',
                gross_paid_fen=None, succeeded_refund_fen=None, net_gsv_amount_fen=None,
                parent_child_attributed=False,
                limitations=['amount_already_net 冲突：窗口内存在 is_refund=TRUE 行，且同时有退款事件。'],
            )
    as_of = refund_as_of.isoformat()
    row = conn.execute(f'''
        WITH paid AS (
            SELECT {parent} AS order_key, SUM(actual_amount) AS amount
            FROM orders o WHERE {where}
              AND o.order_id IS NOT NULL AND TRIM(CAST(o.order_id AS VARCHAR)) != ''
            GROUP BY 1
        ), refunds AS (
            SELECT {refund_parent} AS order_key, SUM(amount_minor) AS amount_minor
            FROM {refund_table} r
            INNER JOIN paid p ON p.order_key = {refund_parent}
            WHERE r.status = 'SUCCEEDED' AND r.refunded_at < ?
              AND r.order_id IS NOT NULL AND TRIM(CAST(r.order_id AS VARCHAR)) != ''
            GROUP BY 1
        )
        SELECT COALESCE((SELECT SUM(amount) FROM paid), 0),
               COALESCE((SELECT SUM(amount_minor) FROM refunds), 0)
    ''', [*params, f'{as_of} 23:59:59.999999']).fetchone()
    gross = money_fen(row[0])
    refunded = int(row[1] or 0)
    limitations = [
        '净额 GSV 与看板 GSV 分列；不在看板结果上再扣退款。',
        'gross 使用非购物金且非交易关闭的实付；只扣窗口内订单在截止日前的成功退款。',
        '部分退款保留余额；全退后净额可为 0；超额退款不截成 0。',
        '订单与退款两侧都有 parent_order_id 时按父单键归属，否则按 order_id。',
    ]
    if refunded > gross:
        limitations.append('OVER_REFUND：成功退款超过窗口实付，净额未截零。')
    return DashboardNetGsv(
        status='OK', filters=filters, refund_as_of=refund_as_of, reason=None,
        required_fields=REQUIRED, source_system=f'{refund_table} succeeded events',
        unlock=UNLOCK, gross_paid_fen=gross, succeeded_refund_fen=refunded,
        net_gsv_amount_fen=gross - refunded, parent_child_attributed=use_parent,
        limitations=limitations,
    )
