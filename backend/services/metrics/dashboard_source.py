"""Bounded schema inventory. Metadata only; never scans fact tables or copies archives."""
from backend.contracts.crm_dashboard import DashboardReadiness, DashboardSourceInventory, MetricReadinessItem

DASHBOARD_GSV_FIELDS = {
    'order_id', 'user_id', 'actual_amount', 'pay_time', 'channel',
    'is_goujinjin', 'is_refund', 'order_status',
}
MEMBERSHIP_EVENTS = ('membership_events', 'member_join_leave', 'membership_history')
REFUND_EVENT_TABLES = ('crm_refund_event', 'refund_events', 'refunds')
REFUND_EVENT_FIELDS = {'refund_id', 'order_id', 'refunded_at', 'amount_minor', 'status'}
COST_TABLES = ('costs', 'sample_cost', 'campaign_cost', 'gross_profit')


def _tables(conn) -> set[str]:
    rows = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    return {str(row[0]) for row in rows}


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'main' AND table_name = ?",
        [table],
    ).fetchall()
    return {str(row[0]) for row in rows}


def inspect_dashboard_source(conn) -> DashboardSourceInventory:
    tables = _tables(conn)
    orders = _columns(conn, 'orders') if 'orders' in tables else set()
    first = _columns(conn, 'user_first_purchase') if 'user_first_purchase' in tables else set()
    refund_table = next((name for name in REFUND_EVENT_TABLES if name in tables), None)
    refund_cols = _columns(conn, refund_table) if refund_table else set()
    has_refund_events = refund_table is not None and REFUND_EVENT_FIELDS <= refund_cols
    rejected = []
    if 'is_member' in orders or 'membership_mark' in tables:
        rejected.append('orders.is_member/membership_mark 是当前或回填身份，不能作成交时快照。')
    if {'refund_amount', 'refund_status', 'is_refund'} & orders:
        rejected.append('orders.refund_amount/refund_status/is_refund 不是带成功时间的退款事件。')
    if first == {'user_id', 'first_pay_date'} or 'first_pay_date' in first:
        rejected.append('user_first_purchase.first_pay_date 不能按退款截止日重算首购。')
    return DashboardSourceInventory(
        tables=sorted(tables),
        has_dashboard_gsv_fields=DASHBOARD_GSV_FIELDS <= orders,
        has_membership_at_purchase='membership_at_purchase' in orders,
        has_membership_events=any(name in tables for name in MEMBERSHIP_EVENTS),
        has_is_member_current='is_member' in orders or 'membership_mark' in tables,
        has_refund_events=has_refund_events,
        has_refund_succeeded_at=has_refund_events,
        has_parent_order_id=('parent_order_id' in orders) and ('parent_order_id' in refund_cols),
        has_first_purchase_as_of=False,
        has_sample_qualification=False,
        has_sample_received_at='sample_received_at' in orders,
        has_cost_profit=any(name in tables for name in COST_TABLES),
        rejected_substitutes=rejected,
    )


def query_dashboard_readiness(conn) -> DashboardReadiness:
    inventory = inspect_dashboard_source(conn)
    items = [
        _item(
            'dashboard_gsv', '看板 GSV', 'A' if inventory.has_dashboard_gsv_fields else 'C',
            '支付日 actual_amount，排除购物金、交易关闭、is_refund=TRUE，再应用渠道/低价',
            'orders via FilterBuilder GSV',
            '水位与退款截止日未知',
            ['orders.actual_amount', 'pay_time', 'channel', 'is_goujinjin', 'is_refund', 'order_status'],
            inventory.has_dashboard_gsv_fields,
            unlock='已有看板服务；扩充窗口不改公式',
        ),
        _item(
            'aov', '每单金额 AOV', 'A' if inventory.has_dashboard_gsv_fields else 'C',
            '看板GSV ÷ 同范围正额有效订单数',
            'GET /api/v1/metrics/dashboard-purchases',
            '继续扩充日期/渠道覆盖',
            ['orders.order_id', 'actual_amount'],
            inventory.has_dashboard_gsv_fields,
            unlock='沿用已上线 dashboard-purchases，不重做公式',
        ),
        _item(
            'aus', '客单价 AUS', 'A' if inventory.has_dashboard_gsv_fields else 'C',
            '看板GSV ÷ 同范围正额订单对应去重买家',
            'GET /api/v1/metrics/dashboard-purchases',
            '继续扩充日期/渠道覆盖；跨系统身份未证明',
            ['orders.user_id', 'order_id', 'actual_amount'],
            inventory.has_dashboard_gsv_fields,
            unlock='沿用已上线 dashboard-purchases，不以新客+老客代替',
        ),
        _item(
            'member_premium', '会员溢价倍数', 'B' if inventory.has_membership_at_purchase else 'C',
            '成交时会员AUS ÷ 非会员AUS',
            'orders.membership_at_purchase 或入会/退会事件',
            '真实库仅有 is_member/membership_mark，不能倒推历史',
            ['membership_at_purchase 或 (join_at, leave_at, user_id)', '正额订单/买家'],
            inventory.has_membership_at_purchase,
            unlock='提供成交时身份快照或入会/退会事件，未知单列',
        ),
        _item(
            'net_gsv', '净额 GSV', 'B' if inventory.has_refund_events else 'C',
            '窗口内有效实付 − 退款截止日前成功退款；amount_already_net 时禁止再扣',
            'refund_event(refund_id, order_id, refunded_at, amount_minor, status=SUCCEEDED)',
            '真实库无退款事件表；行上 refund_amount/is_refund 不能代替',
            ['refund_id', 'order_id', 'refunded_at', 'amount_minor', 'status'],
            inventory.has_refund_events,
            unlock='接入成功退款流水、父子订单归属与退款截止日',
        ),
        _item(
            'new_old', '新老客', 'C',
            '全店首次有效购买相对窗口起点；可按 refund_as_of 重算',
            '全店身份域 + 完整历史订单/退款',
            'user_first_purchase.first_pay_date 不能按退款截止日重算',
            ['user_id 命名空间', 'history_complete', 'refund_as_of 首购'],
            False,
            unlock='可按截止日重算的全店首购历史，并标明覆盖起点',
        ),
        _item(
            'repurchase', '复购', 'C',
            '期初老客在窗口内再次有效购买',
            'crm-metrics/v1 existing_customer_repurchase（合成）',
            '真实历史覆盖与商品退款归属未核',
            ['首购历史', 'refund_event', 'identity_scope=STOREWIDE'],
            False,
            unlock='与新老客相同的可重算历史，外加商品净额键',
        ),
        _item(
            'ltv', 'LTV', 'C',
            '新客首次有效支付起 N 日累计净消费，含首单，区分成熟度',
            'crm-metrics/v1 ltv_new_customer_n_day（合成）',
            '缺可重算首购与退款截止',
            ['first_valid_paid_at as_of refund cutoff', 'observation_days', 'refund_event'],
            False,
            unlock='与新老客相同来源，并提供观察窗口完整水位',
        ),
        _item(
            'sampling_revenue', '派样复购收入表现', 'C',
            '本期每人首次派样起自然日窗口内其他有效订单收入；未成熟单列',
            '派样资格 + 订单关联 + 支付日起点',
            '资格规则未核；sample_received_at 存在仍不能代替资格确认',
            ['is_sample 资格定义', 'order_id', 'paid_at', 'observation_days'],
            False,
            unlock='确认零价/赠品/取消是否计入，以及首次归属键',
        ),
        _item(
            'sampling_profit_roi', '派样利润 ROI', 'C',
            '复购毛利 / 样品与投放成本',
            '成本与毛利',
            '无成本表，保持不可用',
            ['sample_cost', 'media_cost', 'gross_profit'],
            inventory.has_cost_profit,
            unlock='提供样品/券/媒体成本与毛利合同后再命名利润 ROI',
        ),
    ]
    return DashboardReadiness(
        inventory=inventory, metrics=items,
        limitations=[
            'A/B/C 以指标矩阵为准；本接口只根据当前连接的表结构判断来源是否具备。',
            '元数据查询不扫描订单明细，不改写归档。',
            *inventory.rejected_substitutes,
        ],
    )


def _item(metric_id, name, klass, formula, source, gap, fields, present, unlock) -> MetricReadinessItem:
    return MetricReadinessItem(
        metric_id=metric_id, name=name, acceptance_class=klass, formula=formula, source=source,
        gap=gap, required_fields=fields, source_system='archive DuckDB main' if present or klass == 'A' else 'missing',
        unlock=unlock, source_present=present,
    )
