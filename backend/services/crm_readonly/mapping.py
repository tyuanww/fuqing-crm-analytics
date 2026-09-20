"""Declared source-field inventory. Not a verified archive schema."""

from __future__ import annotations

from typing import Any

from backend.services.crm_readonly.versions import (
    GRAIN_SCHEMA_VERSION,
    MAPPING_VERSION,
    ORDER_LINE_FIELDS,
    REFUND_EVENT_FIELDS,
)

# verification_status:
#   declared_not_verified — present in source code / ETL DDL, real DB not opened
#   declared_schema_conflict — multiple source declarations disagree
#   missing_declared — contract needs it; no declared table/column
#   synthetic_only — exists only in this period's synthetic grain
#   unused_by_v1_grain — declared column not mapped into crm-metrics/v1 grain

INVENTORY: list[dict[str, Any]] = [
    {
        "logical": "order_id",
        "grain": "order_line.order_id",
        "declared_sources": [
            "orders.order_id (backend/db/init.py, scripts/etl/load.py, scripts/ci/e2e_schema.sql)",
            "fact_order_header.order_id / src_order_header.order_id (warehouse facts.py)",
        ],
        "verification_status": "declared_not_verified",
        "notes": "行粒度主键在归档声明中是 (order_id, sub_order_id)。",
    },
    {
        "logical": "line_id",
        "grain": "order_line.line_id",
        "declared_sources": [
            "orders.sub_order_id as declared line grain",
            "fact_order_line.line_id / src_order_line.line_id",
        ],
        "verification_status": "declared_not_verified",
        "notes": "归档声明没有独立 line_id 列；映射用 sub_order_id。",
    },
    {
        "logical": "user_id",
        "grain": "order_line.user_id",
        "declared_sources": ["orders.user_id", "user_first_purchase.user_id"],
        "verification_status": "declared_not_verified",
        "notes": "跨店/平台命名空间未核实；空值不得填零，标 UNKNOWN_IDENTITY。",
    },
    {
        "logical": "paid_at",
        "grain": "order_line.paid_at",
        "declared_sources": ["orders.pay_time", "src_order_header.paid_at"],
        "verification_status": "declared_not_verified",
        "notes": "时区候选 Asia/Shanghai，D019 未核实。order_time 不是支付起点。",
    },
    {
        "logical": "gross_paid_minor",
        "grain": "order_line.gross_paid_minor",
        "declared_sources": [
            "orders.amount DECIMAL(12,2)",
            "orders.actual_amount DECIMAL(12,2)",
            "src_order_header.gross_paid_minor BIGINT",
        ],
        "verification_status": "declared_not_verified",
        "notes": (
            "合同要求整数分。归档声明为 DECIMAL 元。actual_amount 是否已净额未核实；"
            "合成 declared-orders 显式登记 yuan_decimal_synthetic。"
            "amount_already_net=true 时禁止再减退款。"
        ),
    },
    {
        "logical": "quantity",
        "grain": "order_line.quantity",
        "declared_sources": ["orders.quantity INTEGER", "src_order_line.quantity BIGINT"],
        "verification_status": "declared_not_verified",
        "notes": "无退件数字段；不能由退款金额推断净件数。",
    },
    {
        "logical": "product_id",
        "grain": "order_line.product_id / refund_event.product_id",
        "declared_sources": ["orders.product_id", "src_order_line.product_id", "spu_mapping.product_id"],
        "verification_status": "declared_not_verified",
        "notes": "SKU/SPU 映射有效期未核实。",
    },
    {
        "logical": "channel",
        "grain": "order_line.channel",
        "declared_sources": ["orders.channel", "backend/semantic/channels.py CHANNEL_FUNNEL"],
        "verification_status": "declared_not_verified",
        "notes": "漏斗是 ETL 声明，不是已核验真源。",
    },
    {
        "logical": "membership_at_purchase",
        "grain": "order_line.membership_at_purchase",
        "declared_sources": ["orders.is_member BOOLEAN", "membership_mark.is_member"],
        "verification_status": "declared_not_verified",
        "notes": "成交时标记不能替代首次入会事件；NULL → UNKNOWN。",
    },
    {
        "logical": "is_sample",
        "grain": "order_line.is_sample",
        "declared_sources": [
            "orders.channel in {U先派样, 百补派样}",
            "orders.spu_type 含 小样",
            "orders.sample_received_at (仅 load.py DDL)",
        ],
        "verification_status": "declared_schema_conflict",
        "notes": (
            "init.py 与 e2e_schema.sql 的 orders 无 sample_received_at；load.py 有。"
            "零价/赠品/购物金/取消订单是否算派样属 D019，合成不得替真实资格定性。"
        ),
    },
    {
        "logical": "status",
        "grain": "order_line.status",
        "declared_sources": ["orders.order_status", "orders.is_refund", "order_status_override"],
        "verification_status": "declared_not_verified",
        "notes": "声明值含 交易成功/交易关闭。合同枚举只有 PAID/CANCELLED。",
    },
    {
        "logical": "event_seq",
        "grain": "order_line.event_seq / refund_event.event_seq",
        "declared_sources": [],
        "verification_status": "missing_declared",
        "notes": "归档无此列。合成 grain 显式写入；declared-orders 仅派生排序，标 derived_not_source_column。",
    },
    {
        "logical": "refund_event",
        "grain": "refund_event.*",
        "declared_sources": [
            "orders.refund_amount / refund_status / is_refund (行上累计，不是事件)",
            "competition 测试表 refunds(order_id, refunded_at, amount)",
            "src_refund / fact_order_refund (无 product_id/line_id)",
        ],
        "verification_status": "declared_not_verified",
        "notes": (
            "无行级退款时只提供整单净额，商品净额 PRODUCT_NET_UNAVAILABLE，不估算分摊。"
            "超额退款 OVER_REFUND，不截成 0。"
        ),
    },
    {
        "logical": "refund product/line allocation",
        "grain": "refund_event.product_id / line_id",
        "declared_sources": [],
        "verification_status": "missing_declared",
        "notes": "warehouse 退款无商品键。D013 已确认：缺失则商品净额不可用。",
    },
    {
        "logical": "first_purchase_history",
        "grain": "not in v1 grain; capability",
        "declared_sources": ["user_first_purchase.first_pay_date DATE"],
        "verification_status": "declared_not_verified",
        "notes": "DATE 无 as_of 重算。历史不全 → INSUFFICIENT_HISTORY，不得把可见最早单当终身首购。",
    },
    {
        "logical": "daily_visitors",
        "grain": "not in v1 grain",
        "declared_sources": ["daily_visitors.visitors / new_members / member_join_rate"],
        "verification_status": "declared_not_verified",
        "notes": "日 UV 累计与周期去重 UV 分开；首期查询不开放 cycle_unique_uv。",
    },
    {
        "logical": "user_nickname, geo, influencer, seller_note",
        "grain": "not selected",
        "declared_sources": ["orders.user_nickname / province / city / influencer_* / seller_note"],
        "verification_status": "unused_by_v1_grain",
        "notes": "只读适配禁止选出；测试断言不泄漏。",
    },
    {
        "logical": "rfm_query_cache / rfm_analysis_cache",
        "grain": "forbidden reuse",
        "declared_sources": ["backend/services/rfm/cache.py", "e2e_schema.sql"],
        "verification_status": "unused_by_v1_grain",
        "notes": "get() 在非只读路由可建表/失效删除。新缓存独立文件与 owner。",
    },
]


def inventory_document() -> dict[str, Any]:
    return {
        "mapping_version": MAPPING_VERSION,
        "metric_version": "crm-metrics/v1",
        "real_database_connected": False,
        "d019_status": "awaiting_source_verification",
        "order_line_fields": list(ORDER_LINE_FIELDS),
        "refund_event_fields": list(REFUND_EVENT_FIELDS),
        "grain_schema_version": GRAIN_SCHEMA_VERSION,
        "items": INVENTORY,
        "schema_declaration_conflicts": [
            {
                "column": "orders.sample_received_at",
                "present_in": ["scripts/etl/load.py"],
                "absent_in": ["backend/db/init.py", "backend/database.py", "scripts/ci/e2e_schema.sql"],
            }
        ],
    }
