"""
老客健康分析仪表盘 - RFM完整分析（8象限人群分群）

基于R/F/M三维评分，将用户划分为8个经典象限，计算各象限回购率。
逻辑同R区间分析，仅将 r_segment 替换为 rfm_segment（8象限+TTL）。
"""

import duckdb
import hashlib
import logging
from typing import List, Optional

from backend.config import DUCKDB_PATH
from backend.semantic.filters import VALID_ORDER_BASE
from backend.semantic.time import PeriodBuilder

# 语义层统一口径：禁止在SQL中硬编码有效订单条件（向后兼容别名）
_VALID_BASE = VALID_ORDER_BASE

logger = logging.getLogger(__name__)

# DuckDB 文件路径（用于数据版本感知）
DB_FILE = DUCKDB_PATH

# RFM 缓存表名
RFM_CACHE_TABLE = "rfm_analysis_cache"
RFM_CACHE_QUERY_VERSION = "rfm-exact-window-v2-member-cohort"


def _fetch_max_pay_time(conn: duckdb.DuckDBPyConnection) -> str:
    """从现有连接查询数据版本（orders.max_pay_time）。"""
    row = conn.execute("SELECT MAX(pay_time)::TEXT FROM orders").fetchone()
    return row[0] or "no_data"


def _cache_key(
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    channel: Optional[str],
    metric_type: str,
    exclude_channels: Optional[List[str]],
    data_version: str,
    compare_start_date: Optional[str] = None,
    compare_end_date: Optional[str] = None,
    *,
    prev2_start_date: Optional[str] = None,
    prev2_end_date: Optional[str] = None,
) -> str:
    """
    生成缓存键文件名。

    缓存键包含数据版本（orders.max_pay_time），ETL刷新后自动失效所有历史缓存。

    注意：data_version 必须由调用方通过 get_connection() 获取后传入，
    禁止在函数内部新建连接（会导致 DuckDB 配置冲突）。
    """
    dv = data_version
    parts = [RFM_CACHE_QUERY_VERSION, dv]
    if start_date and end_date:
        parts.append(f"{start_date}_{end_date}")
        if not (compare_start_date and compare_end_date and prev2_start_date and prev2_end_date):
            defaults = PeriodBuilder.free(start_date, end_date)
            if not (compare_start_date and compare_end_date):
                comparison = defaults["comparison"]
                compare_start_date, compare_end_date = comparison.start, comparison.end
            if not (prev2_start_date and prev2_end_date):
                previous = defaults["prev2"]
                prev2_start_date, prev2_end_date = previous.start, previous.end
    elif period:
        parts.append(period.upper())
    if channel and channel != "全店":
        safe_ch = channel.replace("'", "''")
        parts.append(f"ch_{safe_ch}")
    parts.append(metric_type)
    if exclude_channels:
        ch_str = ",".join(sorted(exclude_channels))
        ch_hash = hashlib.md5(ch_str.encode()).hexdigest()[:8]
        parts.append(f"ex_{ch_hash}")
    if compare_start_date and compare_end_date:
        parts.append(f"cmp_{compare_start_date}_{compare_end_date}")
    if prev2_start_date and prev2_end_date:
        parts.append(f"prev2_{prev2_start_date}_{prev2_end_date}")
    return "_".join(parts) + ".json"


# ============================================================
# RFM 8象限顺序定义
# ============================================================
RFM_SEGMENT_ORDER = [
    "重要价值客户",
    "重要保持客户",
    "重要发展客户",
    "重要挽留客户",
    "一般价值客户",
    "一般保持客户",
    "一般发展客户",
    "一般挽留客户",
    "已购客TTL",
]


# ============================================================
# RFM 分析计算层
# 注意：RFM 分析使用全量口径（截至 cutoff_dt 的所有历史用户），
# 与 user_rfm 预计算表（lookback_days=30/90/180）口径独立，禁止混用。
# ============================================================
