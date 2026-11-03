"""
老客健康分析仪表盘 - RFM完整分析（8象限人群分群）缓存层

QW2 Phase 2: uvicorn 单例 read_only, 缓存写操作需独立写连接
============================================================

背景：
- QW2 Phase 1 把 uvicorn DuckDB 单例改为 read_only（避免 ETL 跑批时锁冲突）
- 但 cache.py 4 个写路径（DDL/INSERT/DELETE）需要写入权限
- get_connection(read_only=False) 因单例已被锁定,仍返回 read_only 包装器
  → DuckDB 报 "Cannot execute CREATE on read-only database"

修复：
- cache.py 内部直接 duckdb.connect(..., access_mode=READ_WRITE) 拿临时写连接
- 短生命周期（每个写操作独立 open/close）,避开单例污染
- DuckDB 支持多读单写：uvicorn 持 read_only 单例时,仍可开独立写连接
- 函数签名尽量兼容（_write_db_cache 移除冗余 conn,_ensure_db_cache_table
  改为必传 write_conn,_read_db_cache 保留 conn 供 SELECT）
"""

import duckdb
import json
import logging
import threading
from uuid import uuid4
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

from ._shared import _cache_key, RFM_CACHE_TABLE
from .precompute_plan import RfmPrecomputePolicy, RfmPrecomputeReport, build_precompute_plan
from .period import (
    _build_rows,
    _run_rfm_period,
)

logger = logging.getLogger(__name__)
_CACHE_OPERATION_LOCK = threading.RLock()

# 缓存 TTL（小时）— 超过此时间的缓存视为陈旧，强制重算
RFM_CACHE_TTL_HOURS = 24
RFM_CACHE_RETENTION_HOURS = 48
RFM_CACHE_GENERATION_TABLE = "rfm_cache_generation"
RFM_CACHE_GENERATION_ROWS_TABLE = "rfm_analysis_cache_generation_rows"


class RFMCacheUnavailableError(RuntimeError):
    """RFM cache 基础设施不可用；HTTP 层应快速返回 503，禁止回退重查询。"""


class RFMCacheMissError(RFMCacheUnavailableError):
    """HTTP 请求组合尚未预热；必须 503，禁止同步执行三段 live RFM。"""


# ============================================================
# 写连接管理（QW2 Phase 2 关键修复）
# ============================================================

def _get_cache_conn() -> duckdb.DuckDBPyConnection:
    """拿 RFM cache 库独立单例写 conn (L4.67 治本: 业务库 + cache 库分离).

    Sprint 205+ PC2 RFM 雪崩根因治本:
    - 业务库 (fuqing_crm.duckdb) 跟 cache 库 (rfm_cache.duckdb) 跨文件
    - DuckDB 1.5+ strict mode 按 同文件 fingerprint 比对, 跨文件 0 冲突
    - 5 轮串行业务读 + cache 写 0 错, 5 线程并发 0 错 (PC2 100% 验证)
    - 配套 L4.65 + L4.66 + L4.67 永久规则: 任何 backend service 写 RFM cache,
      必走 get_cache_connection() (单例, 跟业务库 fingerprint 链完全解耦)
    """
    from backend.services.dual_conn import get_cache_connection
    return get_cache_connection()


def _ensure_db_cache_table(write_conn: duckdb.DuckDBPyConnection) -> None:
    """确保 RFM 缓存表存在（DDL 需可写连接）。

    QW2 Phase 2: 参数改为 write_conn（必传可写连接）,
    禁止传 read_only 连接（会报 "Cannot execute CREATE on read-only database"）。
    含 mtime_at_write 列用于缓存新鲜度校验。

    Stale 缓存修复：新增 orders_count_at_write 列（订单行数快照）。
    修复 ETL 续传后 max_pay_time 不变但 orders 行数恢复的情况——
    缓存键里只有 mtime（max_pay_time），行数变化时缓存键不刷新，
    导致旧缓存（基于砍数据后的 942K 用户）继续被读取。
    """
    write_conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {RFM_CACHE_TABLE} (
            cache_key     VARCHAR PRIMARY KEY,
            period        VARCHAR,
            start_date    VARCHAR,
            end_date      VARCHAR,
            channel       VARCHAR,
            metric_type   VARCHAR,
            ex_channels   VARCHAR,
            result_json   VARCHAR,
            mtime_at_write VARCHAR,
            orders_count_at_write BIGINT,
            computed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # 预计算结果按唯一 run generation 隔离，不能复用 ``data_version``：当天无
    # 新订单时 data_version/COUNT 不变，失败的半批预热仍必须与上一完整代共存。
    write_conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {RFM_CACHE_GENERATION_ROWS_TABLE} (
            cache_key     VARCHAR NOT NULL,
            period        VARCHAR,
            start_date    VARCHAR,
            end_date      VARCHAR,
            channel       VARCHAR,
            metric_type   VARCHAR,
            ex_channels   VARCHAR,
            result_json   VARCHAR,
            mtime_at_write VARCHAR,
            orders_count_at_write BIGINT,
            generation_id VARCHAR NOT NULL,
            computed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (generation_id, cache_key)
        )
    """)
    write_conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {RFM_CACHE_GENERATION_TABLE} (
            singleton_id        INTEGER PRIMARY KEY,
            active_generation_id VARCHAR NOT NULL,
            active_data_version VARCHAR NOT NULL,
            active_orders_count BIGINT,
            completed_at        TIMESTAMP NOT NULL
        )
    """)
    # 迁移：若表已有数据但缺新列,添加（兼容历史数据）
    for col_ddl in [
        f"ALTER TABLE {RFM_CACHE_TABLE} ADD COLUMN mtime_at_write VARCHAR",
        f"ALTER TABLE {RFM_CACHE_TABLE} ADD COLUMN orders_count_at_write BIGINT",
        # 兼容本修复早期曾创建、但尚未激活唯一 run id 的 marker 草案。
        f"ALTER TABLE {RFM_CACHE_GENERATION_TABLE} ADD COLUMN active_generation_id VARCHAR",
    ]:
        try:
            write_conn.execute(col_ddl)
        except Exception:
            pass  # 列已存在
    # L4.74 amend fix v3 (跟 L4.42 + L4.50 + L4.65.1 + L4.69.1 + L4.74 + L4.75 1:1 stable 永久规则链配套):
    # DuckDB 1.5+ UPSERT (INSERT OR REPLACE / ON CONFLICT) 内部 = DELETE + INSERT 路径,
    # 但 idx_period 索引触发 FATAL Error: Failed to delete all rows from index (index 锁冲突).
    # 修复 v3: DROP idx_period 索引 (cache 表只有 ~20 行, 全表扫也不慢), cache_key PRIMARY KEY 兜底.
    # 同时 DROP 老索引 (cache 表已有 idx_period 必须先删, 否则 DROP 报错).
    try:
        write_conn.execute(f"DROP INDEX IF EXISTS idx_{RFM_CACHE_TABLE}_period")
    except Exception:
        pass  # 老索引不存在
    # 不再 CREATE INDEX idx_period (跟 L4.50 0 业务代码改动 + cache 表小全表扫 1:1 stable 永久规则化沿用)


def _get_active_cache_generation(
    conn: duckdb.DuckDBPyConnection,
) -> Optional[Tuple[str, str, Optional[int], datetime]]:
    """返回最后一次完整通过 gate 的 generation；部分预热永不激活。"""
    row = conn.execute(
        f"SELECT active_generation_id, active_data_version, active_orders_count, completed_at "
        f"FROM {RFM_CACHE_GENERATION_TABLE} WHERE singleton_id = 1"
    ).fetchone()
    if not row or not row[0]:
        return None
    return str(row[0]), str(row[1]), row[2], row[3]


def _activate_cache_generation(
    conn: duckdb.DuckDBPyConnection,
    generation_id: str,
    data_version: str,
    orders_count: Optional[int],
) -> None:
    """原子切换最后完整代；必须只在完整 logical coverage gate 后调用。"""
    with _CACHE_OPERATION_LOCK:
        conn.execute(
            f"INSERT INTO {RFM_CACHE_GENERATION_TABLE} "
            "(singleton_id, active_generation_id, active_data_version, "
            "active_orders_count, completed_at) "
            "VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT (singleton_id) DO UPDATE SET "
            "active_generation_id = excluded.active_generation_id, "
            "active_data_version = excluded.active_data_version, "
            "active_orders_count = excluded.active_orders_count, "
            "completed_at = excluded.completed_at",
            [generation_id, data_version, orders_count],
        )


def _generation_within_stale_window(
    completed_at: Any,
    now: Optional[datetime] = None,
) -> bool:
    """只要 marker 时间有效，就持续服务最后完整代。

    PC2 尚无可与常驻 uvicorn 并存的自动刷新机制；给 active generation 设置
    48h 硬过期会在第 49 小时把所有热请求重新推向 miss。inactive generation 仍按
    48h retention 回收，active 则服务到下一次用户批准的维护窗成功切代。
    """
    del now  # 保留参数以兼容历史测试/调用方；active generation 不再按墙钟失效。
    if isinstance(completed_at, str):
        try:
            completed_at = datetime.fromisoformat(completed_at)
        except ValueError:
            return False
    return isinstance(completed_at, datetime)


def _read_db_cache(
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    channel: Optional[str],
    metric_type: str,
    exclude_channels: Optional[List[str]],
    data_version: str,
    conn: duckdb.DuckDBPyConnection,
    compare_start_date: Optional[str] = None,
    compare_end_date: Optional[str] = None,
    current_orders_count: Optional[int] = None,
    _allow_active_generation: bool = True,
    *,
    prev2_start_date: Optional[str] = None,
    prev2_end_date: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """从 DuckDB 预计算表读取缓存。

    ``conn`` 仅为兼容旧调用签名保留；业务库不包含完整 cache SSOT。
    Stale 检测：除 data_version 外,还比对 orders 行数快照,
    防止 ETL 续传后 max_pay_time 不变但行数变化导致缓存陈旧。
    """
    # L4.72.1 治本: SELECT 移出 except 块, 正常路径也跑 SELECT
    # Phase 1 第 2 个 Explore agent 100% 锁定: 旧代码 SELECT 在 except 块里,
    # 正常路径 try 块成功时**无 SELECT**, 直接 return None → 永远 cache miss
    # 治本后: 正常路径 + 异常路径 都跑 SELECT
    del conn  # cache storage 与业务查询连接严格分离
    try:
        with _CACHE_OPERATION_LOCK:
            cache_conn = _get_cache_conn()
            try:
                _ensure_db_cache_table(cache_conn)
            except Exception as init_error:
                raise RFMCacheUnavailableError(
                    f"RFM 缓存表初始化失败: {init_error}"
                ) from init_error

            active_generation = _get_active_cache_generation(cache_conn)
            active_usable = bool(
                _allow_active_generation
                and active_generation
                and _generation_within_stale_window(active_generation[3])
            )

            def _lookup(
                version: str,
                generation_id: Optional[str] = None,
            ) -> Tuple[str, Optional[Tuple[Any, ...]]]:
                candidate_key = _cache_key(
                    period,
                    start_date,
                    end_date,
                    channel,
                    metric_type,
                    exclude_channels,
                    version,
                    compare_start_date,
                    compare_end_date,
                    prev2_start_date=prev2_start_date,
                    prev2_end_date=prev2_end_date,
                )
                if generation_id:
                    candidate_row = cache_conn.execute(
                        f"SELECT result_json, mtime_at_write, orders_count_at_write, computed_at "
                        f"FROM {RFM_CACHE_GENERATION_ROWS_TABLE} "
                        "WHERE generation_id = ? AND cache_key = ?",
                        [generation_id, candidate_key],
                    ).fetchone()
                else:
                    candidate_row = cache_conn.execute(
                        f"SELECT result_json, mtime_at_write, orders_count_at_write, computed_at "
                        f"FROM {RFM_CACHE_TABLE} WHERE cache_key = ?",
                        [candidate_key],
                    ).fetchone()
                return candidate_key, candidate_row

            lookup_generation_id: Optional[str] = None
            if active_usable and active_generation is not None:
                lookup_generation_id = active_generation[0]
                lookup_version = active_generation[1]
                key, row = _lookup(
                    lookup_version,
                    lookup_generation_id,
                )
                if row is None:
                    # Active generation 只覆盖热周期；任意 custom 请求仍允许读取
                    # 当前 data_version 的 on-demand cache，随后才可能 live 计算。
                    lookup_generation_id = None
                    lookup_version = data_version
                    key, row = _lookup(lookup_version)
            else:
                lookup_version = data_version
                key, row = _lookup(lookup_version)
            if not row:
                return None

            matched_active_generation = bool(
                active_usable
                and active_generation is not None
                and lookup_generation_id == active_generation[0]
                and lookup_version == active_generation[1]
                and row[1] == active_generation[1]
                and (
                    active_generation[2] is None
                    or row[2] == active_generation[2]
                )
            )
        # 防御性校验：result_json 必须是有效 JSON dict
        try:
            parsed = json.loads(row[0])
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.warning(f"RFM 缓存损坏（无法解析 JSON）: key={key}, 清理该行: {e}")
            _try_delete_corrupt_row(
                key,
                row[1],
                row[2],
                row[3],
                generation_id=lookup_generation_id,
            )
            if lookup_generation_id:
                return _read_db_cache(
                    period,
                    start_date,
                    end_date,
                    channel,
                    metric_type,
                    exclude_channels,
                    data_version,
                    cache_conn,
                    compare_start_date,
                    compare_end_date,
                    current_orders_count=current_orders_count,
                    _allow_active_generation=False,
                    prev2_start_date=prev2_start_date,
                    prev2_end_date=prev2_end_date,
                )
            return None
        if not isinstance(parsed, dict):
            logger.warning(f"RFM 缓存损坏（不是 dict）: key={key}, type={type(parsed)}, 清理该行")
            _try_delete_corrupt_row(
                key,
                row[1],
                row[2],
                row[3],
                generation_id=lookup_generation_id,
            )
            if lookup_generation_id:
                return _read_db_cache(
                    period,
                    start_date,
                    end_date,
                    channel,
                    metric_type,
                    exclude_channels,
                    data_version,
                    cache_conn,
                    compare_start_date,
                    compare_end_date,
                    current_orders_count=current_orders_count,
                    _allow_active_generation=False,
                    prev2_start_date=prev2_start_date,
                    prev2_end_date=prev2_end_date,
                )
            return None
        # Stale 检测（mtime + 行数 + TTL 三重保护）
        stale, reason = is_stale(
            cached_mtime=row[1],
            cached_orders_count=row[2] if len(row) > 2 else None,
            cached_computed_at=row[3] if len(row) > 3 else None,
            current_mtime=data_version,
            current_orders_count=current_orders_count,
        )
        if stale:
            if matched_active_generation:
                logger.info(
                    "RFM cache stale-while-revalidate: active_generation=%s, reason=%s",
                    active_generation[0],
                    reason,
                )
                return parsed
            logger.info(f"RFM 缓存失效（{reason}）: key={key}")
            _try_delete_corrupt_row(
                key,
                row[1],
                row[2],
                row[3],
                generation_id=lookup_generation_id,
            )
            if lookup_generation_id:
                return _read_db_cache(
                    period,
                    start_date,
                    end_date,
                    channel,
                    metric_type,
                    exclude_channels,
                    data_version,
                    cache_conn,
                    compare_start_date,
                    compare_end_date,
                    current_orders_count=current_orders_count,
                    _allow_active_generation=False,
                    prev2_start_date=prev2_start_date,
                    prev2_end_date=prev2_end_date,
                )
            return None
        return parsed
    except RFMCacheUnavailableError:
        raise
    except Exception as e:
        logger.error(f"RFM DuckDB 缓存读取失败，拒绝回退 live SQL: {e}")
        raise RFMCacheUnavailableError("RFM 缓存暂不可用") from e


def is_stale(
    cached_mtime: Optional[str],
    cached_orders_count: Optional[int],
    cached_computed_at: Any,
    current_mtime: Optional[str],
    current_orders_count: Optional[int],
    now: Optional[datetime] = None,
    ttl_hours: int = RFM_CACHE_TTL_HOURS,
) -> Tuple[bool, Optional[str]]:
    """判断缓存行是否陈旧（失效）。

    三重判定（任一为真 → 陈旧 → DELETE + 重算）:
    1. mtime 推进:  当前 max_pay_time > 缓存时 max_pay_time
    2. 行数变化:   当前 orders.COUNT(*) != 缓存时 COUNT(*)
                   （修 ETL 续传场景：max_pay_time 不变但行数恢复 4.71M）
    3. TTL 超时:   computed_at 距 now > ttl_hours
                   （终极兜底：防止 mtime/行数恰巧都未变）

    Returns: (is_stale: bool, reason: Optional[str])
    """
    if now is None:
        now = datetime.now()

    # 1) mtime 推进
    if current_mtime and cached_mtime and str(current_mtime) > str(cached_mtime):
        return True, f"mtime 推进: {current_mtime} > {cached_mtime}"

    # 2) 行数变化
    if (current_orders_count is not None
            and cached_orders_count is not None
            and current_orders_count != cached_orders_count):
        return True, f"orders 行数变化: {current_orders_count} != {cached_orders_count}"

    # 3) TTL
    if cached_computed_at is not None:
        computed_dt: Optional[datetime] = None
        if isinstance(cached_computed_at, datetime):
            computed_dt = cached_computed_at
        elif isinstance(cached_computed_at, str):
            try:
                computed_dt = datetime.fromisoformat(cached_computed_at)
            except ValueError:
                computed_dt = None
        if computed_dt is not None:
            age = now - computed_dt
            if age > timedelta(hours=ttl_hours):
                return True, f"TTL 超时: {computed_dt} 距今 {age} > {ttl_hours}h"

    return False, None


def clear_rfm_cache() -> int:
    """手动维护命令：清空 RFM 缓存并重建表。

    正常 ETL 禁止调用；预计算采用“失败保旧、全量成功后按 retention prune”。

    Sprint 29+#198 简化版 (codex 推荐): 用 `DROP TABLE IF EXISTS` + `CREATE` 替代 `DELETE FROM`.
    DELETE 走 index, 遇到 index state corruption 会抛 "Failed to delete all rows from index"
    (Sprint 28+ 跑批实战: 12 行只删 8 行). DROP + CREATE 绕开 index 状态机, 永远成功.

    Returns: 被清理的行数（0 = 表为空 / 写连接失败）。
    """
    try:
        with _CACHE_OPERATION_LOCK:
            _wc = _get_cache_conn()
            _ensure_db_cache_table(_wc)
            cur = _wc.execute(f"SELECT COUNT(*) FROM {RFM_CACHE_TABLE}").fetchone()
            count = int(cur[0]) if cur else 0
            generation_row = _wc.execute(
                f"SELECT COUNT(*) FROM {RFM_CACHE_GENERATION_ROWS_TABLE}"
            ).fetchone()
            count += int(generation_row[0]) if generation_row else 0
            # Sprint 29+#198: DROP + CREATE 替代 DELETE (avoid index state corruption)
            _wc.execute(f"DROP TABLE IF EXISTS {RFM_CACHE_TABLE}")
            _wc.execute(f"DROP TABLE IF EXISTS {RFM_CACHE_GENERATION_ROWS_TABLE}")
            _wc.execute(f"DROP TABLE IF EXISTS {RFM_CACHE_GENERATION_TABLE}")
            _ensure_db_cache_table(_wc)  # 重建完整 schema；period 二级索引按 L4.74 治本保持禁用
        logger.info(f"RFM 缓存清空 (DROP + CREATE): 共 {count} 行")
        return count
    except Exception as e:
        logger.error(f"RFM 缓存清空失败: {e}")
        return 0


def _try_delete_corrupt_row(
    key: str,
    cached_mtime: Optional[str],
    cached_orders_count: Optional[int],
    cached_computed_at: Any,
    generation_id: Optional[str] = None,
) -> None:
    """仅删除仍与读取快照一致的坏行，避免并发刷新后的 TOCTOU 误删。"""
    try:
        with _CACHE_OPERATION_LOCK:
            _wc = _get_cache_conn()
            if generation_id:
                _wc.execute(
                    f"DELETE FROM {RFM_CACHE_GENERATION_ROWS_TABLE} "
                    "WHERE generation_id = ? AND cache_key = ? "
                    "AND mtime_at_write IS NOT DISTINCT FROM ? "
                    "AND orders_count_at_write IS NOT DISTINCT FROM ? "
                    "AND computed_at IS NOT DISTINCT FROM ?",
                    [
                        generation_id,
                        key,
                        cached_mtime,
                        cached_orders_count,
                        cached_computed_at,
                    ],
                )
            else:
                _wc.execute(
                    f"DELETE FROM {RFM_CACHE_TABLE} WHERE cache_key = ? "
                    "AND mtime_at_write IS NOT DISTINCT FROM ? "
                    "AND orders_count_at_write IS NOT DISTINCT FROM ? "
                    "AND computed_at IS NOT DISTINCT FROM ?",
                    [key, cached_mtime, cached_orders_count, cached_computed_at],
                )
    except Exception as e:
        logger.error(f"RFM 缓存损坏行无法清理: key={key}, {e}")
        raise RFMCacheUnavailableError("RFM 缓存损坏行无法安全清理") from e




def _write_db_cache(
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    channel: Optional[str],
    metric_type: str,
    exclude_channels: Optional[List[str]],
    data_version: str,
    result: Dict[str, Any],
    compare_start_date: Optional[str] = None,
    compare_end_date: Optional[str] = None,
    orders_count: Optional[int] = None,
    *,
    prev2_start_date: Optional[str] = None,
    prev2_end_date: Optional[str] = None,
) -> None:
    """写入 DuckDB 预计算缓存表（含 mtime_at_write 用于后续新鲜度校验）。

    QW2 Phase 2: 移除 conn 参数,内部 _get_cache_conn() 拿独立写连接
    完成 DDL+INSERT OR REPLACE。不再要求调用方传 conn（避免误用
    read_only 连接写,报 "Cannot execute CREATE on read-only database"）。

    Stale 修复：新增 orders_count 入参,持久化到 orders_count_at_write 列,
    下次读时与当前 orders.COUNT(*) 对比,行数变化即失效。

    防御性校验：仅写入有效的 dict 结果,防止污染缓存表。
    """
    # 防御性校验：result 必须是有效 dict
    if not isinstance(result, dict):
        logger.warning(f"RFM 缓存写入跳过：result 不是 dict（type={type(result)}）,可能是异常路径返回的 None")
        return

    try:
        result_json_str = json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        logger.warning(f"RFM 缓存写入跳过：json.dumps 失败 {e}")
        return

    key = _cache_key(
        period, start_date, end_date, channel, metric_type, exclude_channels,
        data_version, compare_start_date, compare_end_date,
        prev2_start_date=prev2_start_date, prev2_end_date=prev2_end_date,
    )
    ex_str = json.dumps(exclude_channels, ensure_ascii=False) if exclude_channels else ""
    try:
        with _CACHE_OPERATION_LOCK:
            _wc = _get_cache_conn()
            _ensure_db_cache_table(_wc)
            _wc.execute(
                f"INSERT OR REPLACE INTO {RFM_CACHE_TABLE} "
                f"(cache_key, period, start_date, end_date, channel, metric_type, ex_channels, result_json, mtime_at_write, orders_count_at_write, computed_at) "
                f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                [key, period or "", start_date or "", end_date or "",
                 channel or "", metric_type, ex_str, result_json_str, data_version, orders_count]
            )
    except Exception as e:
        # Sprint 205+ PC2 RFM 雪崩 治标 (L4.66 配套):
        # HTTP 路径下绝不能 swallow, 否则双 conn config 不一致时每次都重算全查询
        # → 雪崩 CPU/内存 + 用户看到 30s 超时 (实际 200 但 swallow 了)
        from backend.services.dual_conn import get_request_connection
        if get_request_connection() is not None:
            logger.error(f"[HTTP 路径] RFM DuckDB 缓存写入失败 (必须 raise): {e}")
            raise RFMCacheUnavailableError("RFM 缓存写入失败") from e
        logger.warning(f"RFM DuckDB 缓存写入失败 (非 HTTP, 可容忍): {e}")


def _prune_rfm_cache_after_success(
    write_conn: duckdb.DuckDBPyConnection,
    retention_hours: int = RFM_CACHE_RETENTION_HOURS,
) -> int:
    """完整预计算成功后回收旧代；失败/中断路径绝不调用。"""
    removed = 0
    with _CACHE_OPERATION_LOCK:
        for table_name in (RFM_CACHE_TABLE, RFM_CACHE_GENERATION_ROWS_TABLE):
            before_row = write_conn.execute(
                f"SELECT COUNT(*) FROM {table_name}"
            ).fetchone()
            if table_name == RFM_CACHE_GENERATION_ROWS_TABLE:
                write_conn.execute(
                    f"DELETE FROM {table_name} "
                    "WHERE computed_at < CURRENT_TIMESTAMP - (? * INTERVAL '1 hour') "
                    "AND generation_id IS DISTINCT FROM ("
                    f"SELECT active_generation_id FROM {RFM_CACHE_GENERATION_TABLE} "
                    "WHERE singleton_id = 1)",
                    [retention_hours],
                )
            else:
                write_conn.execute(
                    f"DELETE FROM {table_name} "
                    "WHERE computed_at < CURRENT_TIMESTAMP - (? * INTERVAL '1 hour')",
                    [retention_hours],
                )
            after_row = write_conn.execute(
                f"SELECT COUNT(*) FROM {table_name}"
            ).fetchone()
            before = int(before_row[0]) if before_row else 0
            after = int(after_row[0]) if after_row else 0
            removed += max(before - after, 0)
    return removed


def precompute_rfm_cache(*, policy: RfmPrecomputePolicy | None = None) -> RfmPrecomputeReport:
    from dataclasses import asdict
    import hashlib

    from backend.services.dual_conn import open_matching_read_connection

    try:
        write_conn = _get_cache_conn()
    except Exception as exc:
        raise RuntimeError("RFM 预计算失败: 无法打开写连接") from exc

    biz_conn = open_matching_read_connection()
    try:
        biz_conn.execute("BEGIN TRANSACTION")
        row = biz_conn.execute(
            "SELECT CAST(MIN(pay_time) AS DATE), CAST(MAX(pay_time) AS DATE), "
            "COUNT(*), MAX(pay_time)::TEXT FROM orders"
        ).fetchone()
        if not row or row[0] is None or row[1] is None:
            raise RuntimeError("RFM 预计算失败: 业务库没有可用日期")
        data_start, cutoff, orders_count, data_version = row
        plan = build_precompute_plan(
            data_start, cutoff, policy=policy if policy is not None else RfmPrecomputePolicy(),
        )
        generation_id = uuid4().hex
        with _CACHE_OPERATION_LOCK:
            _ensure_db_cache_table(write_conn)
        expected = {}
        outcomes = []
        ready = 0
        for query in plan.queries:
            key = query.key(data_version)
            if not query.covered(data_start, cutoff):
                outcomes.append({"query": asdict(query), "ranges": query.ranges, "key": key, "status": "INSUFFICIENT_COVERAGE"})
                continue
            ready += 1
            outcomes.append({"query": asdict(query), "ranges": query.ranges, "key": key, "status": "READY"})
            if key in expected:
                continue
            ranges = query.ranges
            values = [
                _run_rfm_period(
                    biz_conn, *ranges[name], query.channel, query.metric_type,
                    list(query.exclude_channels) or None,
                )
                for name in ("current", "comp", "prev2")
            ]
            labels = ranges["labels"]
            result = {
                "year_label": labels[0], "comp_year_label": labels[1],
                "prev2_year_label": labels[2], "metric_type": query.metric_type,
                **{
                    field: _build_rows(*(value[index] for value in values))
                    for index, field in enumerate(("rows", "same_channel_rows", "member_rows", "member_same_channel_rows"))
                },
            }
            encoded = json.dumps(result, ensure_ascii=False, default=str)
            expected[key] = hashlib.sha256(encoded.encode()).hexdigest()
            with _CACHE_OPERATION_LOCK:
                write_conn.execute(
                    f"INSERT INTO {RFM_CACHE_GENERATION_ROWS_TABLE} "
                    "(cache_key, period, start_date, end_date, channel, metric_type, ex_channels, "
                    "result_json, mtime_at_write, orders_count_at_write, generation_id) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [key, query.period.upper(), query.start, query.end, query.channel or "",
                     query.metric_type, json.dumps(query.exclude_channels, ensure_ascii=False),
                     encoded, data_version, orders_count, generation_id],
                )
            logger.info("RFM precompute materialized=%s logical=%s", len(expected), len(plan.queries))

        with _CACHE_OPERATION_LOCK:
            cursor = write_conn.execute(
                f"SELECT cache_key, result_json, mtime_at_write, orders_count_at_write "
                f"FROM {RFM_CACHE_GENERATION_ROWS_TABLE} WHERE generation_id = ?",
                [generation_id],
            )
            verified = {}
            while rows := cursor.fetchmany(64):
                for key, encoded, version, count in rows:
                    if version != data_version or count != orders_count:
                        raise RuntimeError("RFM 预计算来源回读不一致")
                    verified[key] = hashlib.sha256(encoded.encode()).hexdigest()
            if verified != expected:
                raise RuntimeError("RFM 预计算结果集合回读不完整")
            report = RfmPrecomputeReport(
                generation_id, plan.digest, len(plan.queries), ready,
                len(plan.queries) - ready, len(expected), len(verified),
            )
            if not report.complete:
                raise RuntimeError("RFM 预计算没有完整可用结果，保留上一代")
            write_conn.execute(
                "CREATE TABLE IF NOT EXISTS rfm_cache_precompute_reports "
                "(generation_id VARCHAR PRIMARY KEY, report_json VARCHAR NOT NULL, "
                "completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
            )
            receipt = {
                **asdict(report), "complete": report.complete,
                "data_start": str(data_start), "data_cutoff": str(cutoff),
                "data_version": data_version, "orders_count": orders_count,
                "policy": asdict(plan.policy), "queries": outcomes,
            }
            write_conn.execute("BEGIN TRANSACTION")
            try:
                write_conn.execute(
                    "INSERT INTO rfm_cache_precompute_reports (generation_id, report_json) VALUES (?, ?)",
                    [generation_id, json.dumps(receipt, ensure_ascii=False)],
                )
                _activate_cache_generation(write_conn, generation_id, data_version, orders_count)
                _prune_rfm_cache_after_success(write_conn)
                write_conn.execute("COMMIT")
            except BaseException:
                write_conn.execute("ROLLBACK")
                raise
        return report
    finally:
        biz_conn.close()
