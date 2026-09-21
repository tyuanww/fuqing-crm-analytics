"""
指标路由

前缀: /api/v1/metrics/*
"""

from datetime import date
from fastapi import APIRouter, HTTPException, Query, Response
from backend.contracts.crm_dashboard import (
    DashboardChannel, DashboardFilters, DashboardMembership, DashboardNetGsv,
    DashboardPurchases, DashboardReadiness)
from backend.db.connection import get_connection
from backend.services.metrics.dashboard_membership import query_dashboard_membership
from backend.services.metrics.dashboard_net_gsv import query_dashboard_net_gsv
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases
from backend.services.metrics.dashboard_source import query_dashboard_readiness
from typing import Optional, List

from backend.config import _default_start_date, _default_end_date
from backend.contracts.schemas import OverviewMetrics, TrendData
from backend.services.metrics_service import get_overview_metrics, get_daily_trend
from backend.services import check_future_date
from backend.routers.crm_dashboard import router as dashboard_router

router = APIRouter(prefix="/api/v1/metrics", tags=["指标"])
router.include_router(dashboard_router)


@router.get("/cutoff")
def get_metrics_cutoff():
    """Warehouse last pay_time as YYYY-MM-DD for dashboard default windows."""
    from backend.services.health.rfm_analysis.prewarm import warehouse_cutoff_date

    cutoff = warehouse_cutoff_date()
    return {"cutoff_date": cutoff.isoformat() if cutoff else None}


@router.get("/overview", response_model=OverviewMetrics)
def get_metrics_overview(
    response: Response,
    start_date: str = Query(default=_default_start_date(), description="开始日期 YYYY-MM-DD"),
    end_date: str = Query(default=_default_end_date(), description="结束日期 YYYY-MM-DD"),
    metric_type: str = Query(default="GMV", description="指标类型：GMV 或 GSV"),
    channel: Optional[str] = Query(default=None, description="渠道筛选（UI渠道名）"),
    exclude_channels: Optional[List[str]] = Query(default=None, description="排除的渠道列表"),
    compare_start_date: Optional[str] = Query(default=None, description="对比期开始日期（可选，覆盖自动Y-1推算）"),
    compare_end_date: Optional[str] = Query(default=None, description="对比期结束日期（可选，覆盖自动Y-1推算）"),
):
    """获取核心指标概览：GMV、订单数、客单价、新老客数量和GMV、会员指标、环比、同比变化"""
    if warning := check_future_date(start_date) or check_future_date(end_date):
        response.headers["X-Data-Warning"] = warning
    return get_overview_metrics(
        start_date, end_date, metric_type, channel, exclude_channels,
        compare_start_date, compare_end_date
    )


@router.get("/trend", response_model=TrendData)
def get_metrics_trend(
    response: Response,
    start_date: str = Query(default=_default_start_date(), description="开始日期 YYYY-MM-DD"),
    end_date: str = Query(default=_default_end_date(), description="结束日期 YYYY-MM-DD"),
    metric_type: str = Query(default="GMV", description="指标类型：GMV 或 GSV"),
    channel: Optional[str] = Query(default=None, description="渠道筛选（UI渠道名）"),
    exclude_channels: Optional[List[str]] = Query(default=None, description="排除的渠道列表"),
    compare_start_date: Optional[str] = Query(default=None, description="对比期开始日期（可选，覆盖自动Y-1推算）"),
    compare_end_date: Optional[str] = Query(default=None, description="对比期结束日期（可选，覆盖自动Y-1推算）"),
):
    """获取每日趋势数据（GMV、订单数、用户数），用于绘制折线图"""
    if warning := check_future_date(start_date) or check_future_date(end_date):
        response.headers["X-Data-Warning"] = warning
    return get_daily_trend(
        start_date, end_date, metric_type, channel, exclude_channels,
        compare_start_date, compare_end_date
    )


@router.get("/dashboard-purchases", response_model=DashboardPurchases)
def get_dashboard_purchases(
    response: Response,
    start_date: date,
    end_date: date,
    channel: DashboardChannel = '全店',
    exclude_low_price: bool = False,
):
    """看板同范围购买分母及AOV/AUS；日期含首尾，最多90天。"""
    filters = _purchase_filters(start_date, end_date, channel, exclude_low_price)
    if warning := check_future_date(start_date.isoformat()) or check_future_date(end_date.isoformat()):
        response.headers['X-Data-Warning'] = warning
    return query_dashboard_purchases(get_connection(), filters)


def _purchase_filters(start_date, end_date, channel, exclude_low_price):
    if end_date < start_date or (end_date - start_date).days >= 90:
        raise HTTPException(status_code=422, detail='日期范围无效：包含首尾，最多90天。')
    return DashboardFilters(
        start_date=start_date, end_date=end_date, channel=channel, exclude_low_price=exclude_low_price)


@router.get("/dashboard-readiness", response_model=DashboardReadiness)
def get_dashboard_readiness():
    """当前连接的指标来源具备程度；只读元数据，不扫描明细。"""
    return query_dashboard_readiness(get_connection())


@router.get("/dashboard-membership", response_model=DashboardMembership)
def get_dashboard_membership(
    response: Response,
    start_date: date,
    end_date: date,
    channel: DashboardChannel = '全店',
    exclude_low_price: bool = False,
):
    """成交时会员溢价；缺快照或事件时不可用，不使用当前 is_member。"""
    filters = _purchase_filters(start_date, end_date, channel, exclude_low_price)
    if warning := check_future_date(start_date.isoformat()) or check_future_date(end_date.isoformat()):
        response.headers['X-Data-Warning'] = warning
    return query_dashboard_membership(get_connection(), filters)


@router.get("/dashboard-net-gsv", response_model=DashboardNetGsv)
def get_dashboard_net_gsv(
    response: Response,
    start_date: date,
    end_date: date,
    refund_as_of: date,
    channel: DashboardChannel = '全店',
    exclude_low_price: bool = False,
):
    """扣实际成功退款的净额 GSV，与看板 GSV 分列。缺退款事件时不可用。"""
    filters = _purchase_filters(start_date, end_date, channel, exclude_low_price)
    if warning := check_future_date(start_date.isoformat()) or check_future_date(end_date.isoformat()):
        response.headers['X-Data-Warning'] = warning
    if check_future_date(refund_as_of.isoformat()):
        raise HTTPException(status_code=422, detail='退款截止日无效。')
    return query_dashboard_net_gsv(get_connection(), filters, refund_as_of)
