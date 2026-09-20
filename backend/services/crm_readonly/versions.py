"""Pinned versions consumed from crm-metrics/v1. B does not own the formula contract."""

from __future__ import annotations

METRIC_VERSION = "crm-metrics/v1"
QUERY_VERSION = "crm-metrics-query/v1"
WIRE_SCHEMA_VERSION = "crm-metrics-wire/v1"
MAPPING_VERSION = "crm-mapping/v1-declared"
PERMISSION_VERSION = "crm-permission/v1"
ADAPTER_VERSION = "crm-readonly-adapter/v1.1"
CACHE_SCHEMA_VERSION = "crm-readonly-cache/v2"
GRAIN_SCHEMA_VERSION = "crm-metrics-grain/v1"
DECLARED_ORDERS_SCHEMA_VERSION = "declared-archive-orders/v1"
TIMEZONE = "Asia/Shanghai"
CURRENCY = "CNY"
AMOUNT_UNIT = "minor"
AMOUNT_SCALE = 2

ORDER_LINE_FIELDS = (
    "order_id",
    "line_id",
    "user_id",
    "paid_at",
    "gross_paid_minor",
    "quantity",
    "product_id",
    "channel",
    "membership_at_purchase",
    "is_sample",
    "status",
    "event_seq",
)
REFUND_EVENT_FIELDS = (
    "refund_id",
    "order_id",
    "refunded_at",
    "amount_minor",
    "product_id",
    "line_id",
    "status",
    "event_seq",
)
MEMBERSHIP_VALUES = ("MEMBER", "NON_MEMBER", "UNKNOWN")
ORDER_STATUS_VALUES = ("PAID", "CANCELLED")
REFUND_STATUS_VALUES = ("SUCCEEDED",)
EMPTY_REASONS = (
    "ZERO_DENOMINATOR",
    "INCOMPARABLE_BASE",
    "UNKNOWN_IDENTITY",
    "IMMATURE",
    "EMPTY_MATURE_COHORT",
    "MISSING_REFUND_LINES",
    "INSUFFICIENT_HISTORY",
    "PRODUCT_NET_UNAVAILABLE",
    "AMOUNT_ALREADY_NET_CONFLICT",
    "UNIDENTIFIED_BUYERS_IN_SCOPE",
    "OVER_REFUND",
    "CAPABILITY_UNAVAILABLE",
    "D019_SOURCE_UNVERIFIED",
)
QUERY_IDS = (
    "sales_window_summary",
    "existing_customer_repurchase",
    "sample_followup",
)
ALLOWED_SOURCE_KINDS = (
    "SYNTHETIC_CONTRACT_GRAIN",
    "SYNTHETIC_DECLARED_ORDERS",
    "DUCKDB_ARCHIVE_READ_ONLY",
)
