"""Authenticated dashboard aggregate contract; independent of net-refund metrics."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DashboardChannel = Literal['全店', '纯派样', '货架', '达播', '直播', '淘客', '微博', 'U先派样', '百补派样', '赠品&0.01', '其他']


class DashboardModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class DashboardFilters(DashboardModel):
    start_date: date
    end_date: date
    channel: DashboardChannel = '全店'
    exclude_low_price: bool = False


class DashboardCoverage(DashboardModel):
    rows: int = Field(ge=0)
    orders: int = Field(ge=0)
    buyers: int = Field(ge=0)
    unknown_order_rows: int = Field(ge=0)
    unknown_buyer_rows: int = Field(ge=0)
    unknown_order_amount_fen: int
    unknown_buyer_amount_fen: int
    null_amount_rows: int = Field(ge=0)
    negative_amount_rows: int = Field(ge=0)
    zero_amount_orders: int = Field(ge=0)
    zero_only_buyers: int = Field(ge=0)


class DashboardAverage(DashboardModel):
    amount_fen: int | None
    denominator: int = Field(ge=0)
    reason: Literal['NO_PURCHASES', 'UNKNOWN_ORDER', 'UNKNOWN_BUYER', 'INVALID_AMOUNT'] | None


class DashboardPurchases(DashboardModel):
    schema_version: Literal['crm-dashboard-purchases/v1'] = 'crm-dashboard-purchases/v1'
    metric_version: Literal['dashboard-gsv-purchases/v1'] = 'dashboard-gsv-purchases/v1'
    filters: DashboardFilters
    gsv_amount_fen: int
    coverage: DashboardCoverage
    aov: DashboardAverage
    aus: DashboardAverage
    data_through: None = None
    refund_as_of: None = None
    limitations: list[str]


class DashboardSourceInventory(DashboardModel):
    schema_version: Literal['crm-dashboard-source/v1'] = 'crm-dashboard-source/v1'
    tables: list[str]
    has_dashboard_gsv_fields: bool
    has_membership_at_purchase: bool
    has_membership_events: bool
    has_is_member_current: bool
    has_refund_events: bool
    has_refund_succeeded_at: bool
    has_parent_order_id: bool
    has_first_purchase_as_of: bool
    has_sample_qualification: bool
    has_sample_received_at: bool
    has_cost_profit: bool
    rejected_substitutes: list[str]


class MetricReadinessItem(DashboardModel):
    metric_id: str
    name: str
    acceptance_class: Literal['A', 'B', 'C']
    formula: str
    source: str
    gap: str
    required_fields: list[str]
    source_system: str
    unlock: str
    source_present: bool


class DashboardReadiness(DashboardModel):
    schema_version: Literal['crm-dashboard-readiness/v1'] = 'crm-dashboard-readiness/v1'
    metric_version: Literal['dashboard-readiness/v1'] = 'dashboard-readiness/v1'
    inventory: DashboardSourceInventory
    metrics: list[MetricReadinessItem]
    data_through: None = None
    refund_as_of: None = None
    limitations: list[str]


class DashboardMultiple(DashboardModel):
    value: float | None
    unit: Literal['multiple'] = 'multiple'
    reason: Literal['UNAVAILABLE', 'ZERO_DENOMINATOR', 'INCOMPARABLE_BASE', 'UNKNOWN_IDENTITY', 'INVALID_AMOUNT', 'NO_PURCHASES'] | None


class DashboardMembershipCoverage(DashboardModel):
    member_orders: int = Field(ge=0)
    non_member_orders: int = Field(ge=0)
    unknown_member_orders: int = Field(ge=0)
    member_buyers: int = Field(ge=0)
    non_member_buyers: int = Field(ge=0)
    unknown_member_buyers: int = Field(ge=0)
    unknown_order_rows: int = Field(ge=0)
    unknown_buyer_rows: int = Field(ge=0)
    null_amount_rows: int = Field(ge=0)
    negative_amount_rows: int = Field(ge=0)


class DashboardMembership(DashboardModel):
    schema_version: Literal['crm-dashboard-membership/v1'] = 'crm-dashboard-membership/v1'
    metric_version: Literal['dashboard-member-premium/v1'] = 'dashboard-member-premium/v1'
    status: Literal['OK', 'UNAVAILABLE']
    filters: DashboardFilters
    reason: Literal['MEMBERSHIP_AT_PURCHASE_UNAVAILABLE'] | None
    required_fields: list[str]
    source_system: str
    unlock: str
    member_gsv_amount_fen: int | None
    non_member_gsv_amount_fen: int | None
    unknown_member_gsv_amount_fen: int | None
    coverage: DashboardMembershipCoverage | None
    member_aus: DashboardAverage | None
    non_member_aus: DashboardAverage | None
    premium: DashboardMultiple | None
    data_through: None = None
    refund_as_of: None = None
    limitations: list[str]


class DashboardNetGsv(DashboardModel):
    schema_version: Literal['crm-dashboard-net-gsv/v1'] = 'crm-dashboard-net-gsv/v1'
    metric_version: Literal['dashboard-net-gsv/v1'] = 'dashboard-net-gsv/v1'
    status: Literal['OK', 'UNAVAILABLE']
    filters: DashboardFilters
    refund_as_of: date | None
    reason: Literal['MISSING_REFUND_EVENTS', 'AMOUNT_ALREADY_NET_CONFLICT'] | None
    required_fields: list[str]
    source_system: str
    unlock: str
    gross_paid_fen: int | None
    succeeded_refund_fen: int | None
    net_gsv_amount_fen: int | None
    parent_child_attributed: bool
    data_through: None = None
    limitations: list[str]
