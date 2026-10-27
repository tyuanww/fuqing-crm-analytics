from datetime import date, timedelta

from backend.semantic.time import PeriodBuilder
from backend.services.health.rfm_analysis.precompute_plan import build_precompute_plan
from backend.services.rfm._shared import _resolve_date_ranges


class TestRFMPrecomputeCalendar:
    def test_precompute_mtd_matches_period_builder_at_warehouse_cutoff(self):
        cutoff = date(2026, 7, 5)
        plan = build_precompute_plan(date(2020, 1, 1), cutoff)
        frontend = PeriodBuilder.mtd(today=cutoff + timedelta(days=1))["current"]
        assert (frontend.start, frontend.end) == ("2026-07-01", "2026-07-05")
        assert any((query.start, query.end) == (frontend.start, frontend.end) for query in plan.queries)

    def test_unavailable_future_windows_are_not_marked_covered(self):
        plan = build_precompute_plan(date(2020, 1, 1), date(2026, 7, 5))
        future = [query for query in plan.queries if query.end > "2026-07-05"]
        assert future and all(not query.covered(plan.data_start, plan.cutoff) for query in future)

    def test_original_fixed_periods_remain_selectable(self):
        plan = build_precompute_plan(date(2020, 1, 1), date(2026, 7, 5))
        assert {
            "yesterday", "WTD", "MTD", "YTD", "Q1", "Q2", "Q3", "Q4",
            "last90days", "last180days", "last365days",
        } <= {query.period for query in plan.queries}

    def test_historical_year_changes_current_dates_and_key(self):
        plan = build_precompute_plan(date(2020, 1, 1), date(2026, 7, 5))
        queries = [query for query in plan.queries if query.period == "MTD" and query.channel is None
                   and query.metric_type == "GSV" and not query.exclude_channels and query.compare_mode == "default"]
        assert {(query.start, query.end) for query in queries} == {
            ("2026-07-01", "2026-07-05"), ("2025-07-01", "2025-07-05"),
        }
        assert len({query.key("synthetic") for query in queries}) == 2

    def test_precomputed_query_matches_explicit_http_dates(self):
        plan = build_precompute_plan(date(2020, 1, 1), date(2026, 7, 5))
        for query in plan.queries:
            assert query.ranges == _resolve_date_ranges(None, query.start, query.end, *query.comparison)


class TestL474CacheEndDateDocumentation:
    """L4.74 cache end_date fix 文档化验证 (跟 L4.42 + L4.50 + L4.13 + L4.20 1:1 stable 永久规则链配套)."""

    def test_changelog_mentions_l474_cache_end_date(self):
        """L4.74 文档在 CHANGELOG 近窗或 history（滚动后仍可检索）。"""
        from pathlib import Path

        repo_root = Path(__file__).resolve().parents[2]
        parts = []
        for rel in ("CHANGELOG.md", "docs/history/CHANGELOG_HISTORY.md"):
            p = repo_root / rel
            if p.exists():
                parts.append(p.read_text(encoding="utf-8"))
        content = "\n".join(parts)
        assert content, "CHANGELOG.md / history 均不存在"
        assert "L4.74" in content and ("cache end_date" in content or "cache_end_date" in content), (
            "L4.74 fix 文档化: CHANGELOG 或 CHANGELOG_HISTORY 必须包含 L4.74 cache end_date fix entry, "
            "跟 L4.20 SSOT 反漂移 1:1 stable 永久规则链配套."
        )

