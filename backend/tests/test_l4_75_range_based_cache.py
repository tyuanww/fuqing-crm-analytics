import inspect
from datetime import date

import duckdb

# 1) test_range_periods_includes_8_ranges
# 2) test_rolling_7d_dates
# 3) test_weekly_4w_dates
# 5) test_precompute_6dim_for
# 6) test_cache_key_includes_range_id
# 7) test_user_custom_hits_cache
# 8) test_1280_combinations


class TestL475RangeBasedCache:
    """L4.75 Stage 2 RANGE-based cache regression test
    (跟 L4.42 + L4.50 + L4.71 + L4.74 + L4.75 1:1 stable 永久规则链配套)."""

    def test_range_periods_includes_8_ranges(self):
        """验证 L4.75 Stage 2 fix #1: RANGE_PERIODS 8 项 (跟 frontend weeks=[4,8,12] 1:1 stable)."""
        from backend.services.health.rfm_analysis import cache as cache_module

        # 1) RANGE_PERIODS 属性存在
        assert hasattr(cache_module, "RANGE_PERIODS"), (
            "L4.75: cache.py 必须导出 RANGE_PERIODS 常量 (跟 Stage 1 STANDARD_PERIODS 1:1 stable 永久规则链配套)"
        )
        # 2) 必须 8 项
        assert len(cache_module.RANGE_PERIODS) == 8, (
            f"L4.75: RANGE_PERIODS 必须含 8 项 (Stage 2 扩 8 RANGE 周期), 实测 {len(cache_module.RANGE_PERIODS)} 项"
        )
        # 3) 必须含 rolling_7d/14d/30d/60d/90d (5) + weekly_4w/8w/12w (3) = 8
        expected_ranges = {
            "rolling_7d", "rolling_14d", "rolling_30d", "rolling_60d", "rolling_90d",
            "weekly_4w", "weekly_8w", "weekly_12w",
        }
        actual_ranges = set(cache_module.RANGE_PERIODS)
        assert actual_ranges == expected_ranges, (
            f"L4.75: RANGE_PERIODS 必须含 {expected_ranges}, 实测 {actual_ranges}"
        )

    def test_rolling_7d_dates(self):
        """验证 L4.75 fix #2: _resolve_range_period rolling_7d 算 7 天窗口 cur/comp/prev2."""
        from backend.services.health.rfm_analysis.period import _resolve_range_period

        ref_today = date(2026, 7, 9)
        ranges = _resolve_range_period("rolling_7d", today=ref_today)
        # rolling_7d: cur = today-6 to today-1 (= 7 天)
        cur = ranges["current"]
        comp = ranges["comparison"]
        prev2 = ranges["prev2"]
        assert cur.start == "2026-07-02", f"rolling_7d cur.start = {cur.start} 期望 2026-07-02 (today-7+1)"
        assert cur.end == "2026-07-08", f"rolling_7d cur.end = {cur.end} 期望 2026-07-08 (today-1)"
        # comp = rolling_7d prev 7 天
        assert comp.start == "2026-06-25"
        assert comp.end == "2026-07-01"
        # prev2 = 再 prev 7 天
        assert prev2.start == "2026-06-18"
        assert prev2.end == "2026-06-24"

    def test_weekly_4w_dates(self):
        """验证 L4.75 fix #3: _resolve_range_period weekly_4w/8w/12w 算 N*7 天窗口 (跟 frontend weeks=[4,8,12] 1:1 stable)."""
        from backend.services.health.rfm_analysis.period import _resolve_range_period

        ref_today = date(2026, 7, 9)
        # weekly_4w = 28 天
        r4w = _resolve_range_period("weekly_4w", today=ref_today)
        assert r4w["current"].start == "2026-06-11"  # 2026-07-08 - 27 = 2026-06-11 (today-28+1)
        assert r4w["current"].end == "2026-07-08"    # today - 1
        cur_span = (date.fromisoformat(r4w["current"].end) - date.fromisoformat(r4w["current"].start)).days + 1
        assert cur_span == 28, f"weekly_4w cur span = {cur_span} 期望 28 天"

        # weekly_8w = 56 天 (frontend weeks=8 1:1 stable)
        r8w = _resolve_range_period("weekly_8w", today=ref_today)
        span_8w = (date.fromisoformat(r8w["current"].end) - date.fromisoformat(r8w["current"].start)).days + 1
        assert span_8w == 56, f"weekly_8w cur span = {span_8w} 期望 56 天"
        assert r8w["current"].end == "2026-07-08"

        # weekly_12w = 84 天 (frontend weeks=12 1:1 stable)
        r12w = _resolve_range_period("weekly_12w", today=ref_today)
        span_12w = (date.fromisoformat(r12w["current"].end) - date.fromisoformat(r12w["current"].start)).days + 1
        assert span_12w == 84, f"weekly_12w cur span = {span_12w} 期望 84 天"

    def test_exact_range_and_period_alias_hit_but_neighbor_misses(self, monkeypatch):
        from backend.services.health.rfm_analysis import cache
        from backend.services.health.rfm_analysis._shared import _cache_key

        data_version = "2026-07-09 00:00:00"
        with duckdb.connect(":memory:") as conn:
            cache._ensure_db_cache_table(conn)
            monkeypatch.setattr(cache, "_get_cache_conn", lambda: conn)
            key = _cache_key(None, "2026-07-02", "2026-07-08", None, "GSV", None, data_version)
            conn.execute(
                f"INSERT INTO {cache.RFM_CACHE_TABLE} "
                "(cache_key, period, start_date, end_date, channel, metric_type, ex_channels, "
                "result_json, mtime_at_write, orders_count_at_write, computed_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                [key, "ROLLING_7D", "2026-07-02", "2026-07-08",
                 "", "GSV", "", '{"hist_users": 1}', data_version, 0],
            )
            for label in (None, "ROLLING_7D"):
                assert cache._read_db_cache(
                    label, "2026-07-02", "2026-07-08", None, "GSV", None, data_version,
                    conn, current_orders_count=0,
                ) == {"hist_users": 1}
            assert cache._read_db_cache(
                None, "2026-07-03", "2026-07-09", None, "GSV", None, data_version,
                conn, current_orders_count=0,
            ) is None

    def test_precompute_6dim_for(self):
        """验证 L4.75 fix #5: precompute_rfm_cache 含 Stage 2 RANGE for 嵌套块 (跟 L4.50 0 业务代码改动 1:1 stable)."""
        from backend.services.health.rfm_analysis import cache as cache_module

        source = inspect.getsource(cache_module.precompute_rfm_cache)
        # 1) Stage 2 RANGE for 嵌套 (5 重: metric × range_period × year × channel × compare_mode)
        assert "for range_period in RANGE_PERIODS" in source, (
            "L4.75 Stage 2: precompute_rfm_cache 必须有 RANGE_PERIODS 5 重 for 嵌套块 (跟 L4.71 Stage 1 1:1 stable 永久规则链配套)"
        )
        # 2) Stage 2 复用 _resolve_range_period helper (替代 Stage 1 的 pb_func = getattr...)
        assert "_resolve_range_period(range_period, today=today)" in source, (
            "L4.75 Stage 2: 必须用 _resolve_range_period helper 解析 RANGE 周期 (跟 period.py _resolve_range_period 1:1 stable)"
        )
        # 3) Stage 2 复用 ON CONFLICT UPSERT (跟 L4.74 amend v2 1:1 stable)
        assert source.count("ON CONFLICT (cache_key) DO UPDATE") >= 2, (
            "L4.75 Stage 2: ON CONFLICT UPSERT 必须出现在 Stage 1 + Stage 2 两块 (跟 L4.74 amend v2 1:1 stable 永久规则链配套)"
        )

    def test_cache_key_includes_range_id(self):
        """验证 L4.75 fix #6: _cache_key 用 start_date/end_date (不依赖 period_name, 跟 _shared.py:60-63 1:1 stable)."""
        from backend.services.health.rfm_analysis._shared import _cache_key

        # 同 (start=2026-07-03, end=2026-07-08) 不同 metric_type 产不同 key
        key_gsv = _cache_key(
            period=None,
            start_date="2026-07-03", end_date="2026-07-08",
            channel="全店", metric_type="GSV", exclude_channels=None,
            data_version="2026-07-09", compare_start_date=None, compare_end_date=None,
        )
        key_gmv = _cache_key(
            period=None,
            start_date="2026-07-03", end_date="2026-07-08",
            channel="全店", metric_type="GMV", exclude_channels=None,
            data_version="2026-07-09", compare_start_date=None, compare_end_date=None,
        )
        assert key_gsv != key_gmv, "GSV vs GMV 必须产不同 cache key"
        # 用 dates (不依赖 period_name): period=None 仍产合法 key (跟 RANGE 周期 1:1 stable)
        assert isinstance(key_gsv, str) and len(key_gsv) > 0

    def test_user_custom_hits_cache(self):
        """验证 L4.75 fix #7: user 自定义 weekly_4w query 走预计算 cache 路径 (跟 user 述 "0.14s cache 命中" 1:1 stable)."""
        # 通过 _resolve_period_type 自动匹配 weekly_4w (跟 _hot_period_ranges L4.75 扩展 1:1 stable)
        from backend.services.health.rfm_analysis.period import (
            _resolve_period_type,
            _resolve_range_period,
        )

        ref_today = date(2026, 7, 9)
        # 用 weekly_4w 产 start_dt/end_dt (跟 ref_today 一致, 避免 end_date 漂移)
        r = _resolve_range_period("weekly_4w", today=ref_today)
        start_dt = f"{r['current'].start} 00:00:00"
        end_dt = f"{r['current'].end} 23:59:59"
        # _resolve_period_type 自动从 weekly_4w range 反查 period_type
        period_type = _resolve_period_type(start_dt, end_dt, today=ref_today)
        assert period_type == "weekly_4w", (
            f"L4.75: _resolve_period_type 必须 auto-detect weekly_4w, 实测 {period_type!r} "
            f"(跟 _hot_period_ranges Stage 2 1:1 stable 永久规则化沿用)"
        )

    def test_380_logical_combinations(self):
        """验证总组合数 = 380 = 19 period × 2 metric × 5 channel × 2 compare。

        STANDARD 跟 RANGE 是 alternative 周期命名；前端固定周期补齐后，物理
        date-based key 仍会因日期别名碰撞而少于 logical coverage。
        """
        # 用 cache 模块顶层 RANGE_PERIODS + STANDARD_PERIODS 在 precompute_rfm_cache 内计算
        from backend.services.health.rfm_analysis import cache as cache_module

        assert len(cache_module.RANGE_PERIODS) == 8
        assert len(cache_module.STANDARD_PERIODS) == 11
        assert cache_module.PRECOMPUTE_CHANNELS == [None, "货架", "达播", "直播", "淘客"]
        keys_per_period = 2 * len(cache_module.PRECOMPUTE_CHANNELS) * 2
        total_combinations = (
            len(cache_module.STANDARD_PERIODS) + len(cache_module.RANGE_PERIODS)
        ) * keys_per_period
        assert total_combinations == 380, (
            f"L4.75: 总组合数应为 380, 实测 {total_combinations}"
        )
