"""scripts/etl/prewarm_rfm_cache.py 的参数、窗口与报告合同测试。

全部用例都在内存里替换 RFM 计算与缓存读取，不打开任何真实 DuckDB：
- get_rfm_analysis → monkeypatch（写入路径）
- _cache_row_count → monkeypatch（缓存读校验路径）
- _read_request_context → nullcontext（不借真实只读连接）
"""

from __future__ import annotations

from contextlib import nullcontext
from datetime import date
import json
import os
from pathlib import Path

import pytest

from scripts.etl import prewarm_rfm_cache as cli


def _read_report(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _patch_no_db(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_read_request_context", lambda: nullcontext())


def _patch_compute(monkeypatch, rows_by_window: dict[tuple[str, str], int]):
    """替换 RFM 计算与缓存读校验；返回记录到的计算调用。"""
    calls: list[dict] = []

    def fake_rfm_analysis(**kwargs):
        calls.append(kwargs)
        return {"period": "stub"}

    def fake_cache_row_count(start: date, end: date) -> int:
        return rows_by_window.get((start.isoformat(), end.isoformat()), 0)

    monkeypatch.setattr(
        "backend.services.health.rfm_analysis.get_rfm_analysis", fake_rfm_analysis
    )
    monkeypatch.setattr(cli, "_cache_row_count", fake_cache_row_count)
    return calls


def test_parse_args_defaults(tmp_path, monkeypatch):
    cache = tmp_path / "isolated" / "rfm_cache.duckdb"
    monkeypatch.setenv("CACHE_DUCKDB_PATH", str(cache))

    args = cli.build_parser().parse_args([])

    assert args.cache_duckdb is None
    assert args.cutoff is None
    assert args.windows == list(cli.WINDOW_ORDER)
    assert args.report == cli.DEFAULT_REPORT_PATH
    assert args.dry_run is False
    assert cli.resolve_cache_path(args.cache_duckdb) == cache.resolve()


def test_parse_windows_all_and_subset():
    parser = cli.build_parser()

    assert parser.parse_args(["--windows", "all"]).windows == list(cli.WINDOW_ORDER)
    assert parser.parse_args(["--windows", "wtd,yesterday,last180"]).windows == [
        "yesterday",
        "wtd",
        "last180",
    ]
    # 重复项按固定顺序收敛，不重复跑同一窗口
    assert parser.parse_args(["--windows", "q2,q2"]).windows == ["q2"]

    with pytest.raises(SystemExit) as excinfo:
        parser.parse_args(["--windows", "yesterday,not_a_window"])
    assert excinfo.value.code == 2

    with pytest.raises(SystemExit) as excinfo:
        parser.parse_args(["--windows", "all,yesterday"])
    assert excinfo.value.code == 2


def test_missing_cache_path_is_config_error(monkeypatch):
    monkeypatch.delenv("CACHE_DUCKDB_PATH", raising=False)

    with pytest.raises(cli.PrewarmConfigError):
        cli.resolve_cache_path(None)


def test_named_windows_match_dashboard_windows():
    from backend.services.health.rfm_analysis.prewarm import dashboard_windows

    for cutoff in (date(2026, 7, 5), date(2026, 1, 1), date(2026, 11, 2)):
        assert [
            (start, end) for _name, start, end in cli.named_windows(cutoff)
        ] == dashboard_windows(cutoff)


def test_named_windows_subset_keeps_folded_window():
    # cutoff=2026-07-05 时 q3 与 MTD 同区间：all 模式去重保留 MTD，
    # 但显式点名 q3 时仍必须预热该物理窗口。
    assert cli.named_windows(date(2026, 7, 5), ["q3"]) == [
        ("q3", date(2026, 7, 1), date(2026, 7, 5))
    ]


def test_dry_run_does_not_write_cache(tmp_path, monkeypatch):
    cache = tmp_path / "cache.duckdb"
    report = tmp_path / "report.json"

    def _must_not_run(*_args, **_kwargs):
        raise AssertionError("dry-run 不得调用 RFM 计算或缓存读取")

    monkeypatch.setattr(cli, "_execute_window", _must_not_run)
    monkeypatch.setattr(cli, "_cache_row_count", _must_not_run)
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            str(cache),
            "--cutoff",
            "2026-07-05",
            "--dry-run",
            "--report",
            str(report),
        ]
    )

    assert rc == 0
    assert not cache.exists()
    data = _read_report(report)
    assert data["dry_run"] is True
    assert data["total"] == 8  # q3 与 MTD 同区间被折叠，q4 起点在 cutoff 之后
    assert {entry["status"] for entry in data["windows"]} == {"dry_run"}
    assert data["missing"] == []
    assert data["cache_file"]["before_bytes"] == 0
    assert data["cache_file"]["after_bytes"] == 0


def test_report_fields_and_missing(tmp_path, monkeypatch):
    cache = tmp_path / "cache.duckdb"
    report = tmp_path / "nested" / "rfm-prewarm-report.json"
    calls = _patch_compute(monkeypatch, {})

    counts = {
        ("2026-07-05", "2026-07-05"): 1,
        ("2026-06-29", "2026-07-05"): 0,
    }

    def fake_cache_row_count(start: date, end: date) -> int:
        if start == date(2026, 7, 1):
            raise RuntimeError("cache read boom")
        return counts.get((start.isoformat(), end.isoformat()), 0)

    monkeypatch.setattr(cli, "_cache_row_count", fake_cache_row_count)
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            str(cache),
            "--cutoff",
            "2026-07-05",
            "--windows",
            "yesterday,wtd,mtd",
            "--report",
            str(report),
        ]
    )

    assert rc == 1
    data = _read_report(report)
    assert data["cutoff"] == "2026-07-05"
    assert data["dry_run"] is False
    assert data["metric_type"] == "GSV"
    assert data["total"] == 3
    assert data["ok_count"] == 1
    assert data["missing"] == ["wtd", "mtd"]
    assert data["missing_count"] == 2
    assert [entry["name"] for entry in data["windows"]] == ["yesterday", "wtd", "mtd"]
    assert [entry["status"] for entry in data["windows"]] == ["ok", "missing", "error"]
    assert [entry["rows"] for entry in data["windows"]] == [1, 0, 0]
    assert [entry["start"] for entry in data["windows"]] == [
        "2026-07-05",
        "2026-06-29",
        "2026-07-01",
    ]
    assert [entry["end"] for entry in data["windows"]] == [
        "2026-07-05",
        "2026-07-05",
        "2026-07-05",
    ]
    assert all("elapsed_sec" in entry for entry in data["windows"])
    assert "cache read boom" in data["windows"][2]["error"]
    assert data["cache_file"]["path"] == str(cache)
    assert data["cache_file"]["before_exists"] is False
    # 三个窗口都调用了 RFM 入口，失败窗口也保留调用记录
    assert len(calls) == 3
    assert all(call["metric_type"] == "GSV" for call in calls)
    assert all(call["allow_live_compute"] is True for call in calls)
    assert report.parent.is_dir()


def test_cache_file_size_delta_is_reported(tmp_path, monkeypatch):
    cache = tmp_path / "cache.duckdb"
    cache.write_bytes(b"x" * 10)
    report = tmp_path / "report.json"
    _patch_compute(monkeypatch, {("2026-07-05", "2026-07-05"): 1})

    def fake_execute(_start: date, _end: date) -> None:
        cache.write_bytes(b"y" * 100)

    monkeypatch.setattr(cli, "_execute_window", fake_execute)
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            str(cache),
            "--cutoff",
            "2026-07-05",
            "--windows",
            "yesterday",
            "--report",
            str(report),
        ]
    )

    assert rc == 0
    data = _read_report(report)
    assert data["cache_file"]["before_bytes"] == 10
    assert data["cache_file"]["after_bytes"] == 100
    assert data["cache_file"]["delta_bytes"] == 90


def test_production_cache_path_rejected(tmp_path, monkeypatch):
    def _must_not_run(*_args, **_kwargs):
        raise AssertionError("生产库路径必须在任何 backend 计算前被拒绝")

    monkeypatch.setattr(cli, "_execute_window", _must_not_run)
    report = tmp_path / "report.json"

    rc = cli.main(
        [
            "--cache-duckdb",
            "/srv/shinemage/data/processed/fuqing_crm.duckdb",
            "--cutoff",
            "2026-07-05",
            "--report",
            str(report),
        ]
    )

    assert rc == 2
    assert not report.exists()


def test_business_db_env_path_rejected(tmp_path, monkeypatch):
    business = tmp_path / "business.duckdb"
    business.write_bytes(b"")
    monkeypatch.setenv("DUCKDB_PATH", str(business))

    with pytest.raises(cli.PrewarmConfigError):
        cli.resolve_cache_path(str(business))


def test_relative_cache_path_outside_workdir_rejected(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    outside = tmp_path.parent / "outside-prewarm-cache.duckdb"

    rc = cli.main(
        [
            "--cache-duckdb",
            "../outside-prewarm-cache.duckdb",
            "--cutoff",
            "2026-07-05",
            "--report",
            str(tmp_path / "report.json"),
        ]
    )

    assert rc == 2
    assert not outside.exists()


def test_relative_cache_path_inside_workdir_allowed(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    _patch_compute(monkeypatch, {("2026-07-05", "2026-07-05"): 1})
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            "sub/rfm_cache.duckdb",
            "--cutoff",
            "2026-07-05",
            "--windows",
            "yesterday",
            "--report",
            "report.json",
        ]
    )

    assert rc == 0
    data = _read_report(tmp_path / "report.json")
    assert data["cache_duckdb"] == str((tmp_path / "sub" / "rfm_cache.duckdb").resolve())


def test_cache_env_is_set_before_backend_work(tmp_path, monkeypatch):
    cache = tmp_path / "cache.duckdb"
    seen: dict[str, str] = {}

    def fake_execute(_start: date, _end: date) -> None:
        seen["env"] = os.environ.get("CACHE_DUCKDB_PATH", "")

    monkeypatch.setattr(cli, "_execute_window", fake_execute)
    monkeypatch.setattr(cli, "_cache_row_count", lambda _start, _end: 1)
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            str(cache),
            "--cutoff",
            "2026-07-05",
            "--windows",
            "yesterday",
            "--report",
            str(tmp_path / "report.json"),
        ]
    )

    assert rc == 0
    assert seen["env"] == str(cache.resolve())


def test_default_cutoff_uses_warehouse_cutoff(tmp_path, monkeypatch):
    cache = tmp_path / "cache.duckdb"
    report = tmp_path / "report.json"
    monkeypatch.setattr(
        "backend.services.health.rfm_analysis.prewarm.warehouse_cutoff_date",
        lambda: date(2026, 7, 5),
    )
    _patch_compute(monkeypatch, {("2026-07-05", "2026-07-05"): 1})
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            str(cache),
            "--windows",
            "yesterday",
            "--report",
            str(report),
        ]
    )

    assert rc == 0
    assert _read_report(report)["cutoff"] == "2026-07-05"


def test_error_does_not_stop_later_windows(tmp_path, monkeypatch):
    cache = tmp_path / "cache.duckdb"
    report = tmp_path / "report.json"
    calls: list[str] = []

    def fake_execute(start: date, _end: date) -> None:
        calls.append(start.isoformat())
        if start == date(2026, 7, 5):
            raise RuntimeError("boom on yesterday")

    monkeypatch.setattr(cli, "_execute_window", fake_execute)
    monkeypatch.setattr(cli, "_cache_row_count", lambda _start, _end: 1)
    _patch_no_db(monkeypatch)

    rc = cli.main(
        [
            "--cache-duckdb",
            str(cache),
            "--cutoff",
            "2026-07-05",
            "--windows",
            "yesterday,wtd",
            "--report",
            str(report),
        ]
    )

    assert rc == 1
    data = _read_report(report)
    assert [entry["status"] for entry in data["windows"]] == ["error", "ok"]
    assert data["windows"][0]["error"].startswith("RuntimeError: boom on yesterday")
    assert calls == ["2026-07-05", "2026-06-29"]
