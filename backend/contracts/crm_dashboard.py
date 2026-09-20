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
