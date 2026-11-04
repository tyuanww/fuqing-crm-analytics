#!/usr/bin/env python3
"""RFM 预热可执行入口：按 dashboard 默认窗口写隔离缓存并产出覆盖报告。

背景
----
``backend/services/health/rfm_analysis/prewarm.py`` 里的 ``dashboard_windows()``
/ ``prewarm_common_windows()`` 只在 CRM 进程启动时由后台线程调用。隔离实例的
缓存库为空时没有任何可验证的预热覆盖，也没有「跑完了、缺了哪个窗口」的凭据。
本脚本是同一套窗口口径的独立可执行入口：

- 窗口集合与 ``dashboard_windows(cutoff)`` 完全一致（同名、同裁剪、同去重）；
- 每个窗口调用现有 ``get_rfm_analysis(..., allow_live_compute=True)`` 写缓存；
- 每个窗口后直接读缓存表校验该窗口确实有行；
- 产出 JSON 覆盖报告（cutoff、每窗口 start/end/status/rows/耗时、missing、
  缓存文件路径与前后大小）。

安全边界
--------
- ``--cache-duckdb`` 必须是隔离缓存库，绝不允许等于生产业务库
  ``/srv/shinemage/data/processed/fuqing_crm.duckdb``（或 ``DUCKDB_PATH`` /
  ``FUQING_DB_PATH`` 指向的库）。
- 相对路径必须落在仓库工作目录（当前目录）内，跨目录请用绝对路径。
- ``--cache-duckdb`` 先解析并写入 ``CACHE_DUCKDB_PATH``，之后才 import
  backend 模块，保证 backend.config 读到的是隔离缓存路径。
- 业务库只通过 ``read_request_context("prewarm")`` 借只读连接，不写生产库。

用法
----
    PYTHONPATH=. python scripts/etl/prewarm_rfm_cache.py \\
        --cache-duckdb /srv/shinemage/validation/<instance>/legacy-cache/rfm_cache.duckdb \\
        --report .context/rfm-prewarm-report.json

    # 只演练窗口，不动缓存
    PYTHONPATH=. python scripts/etl/prewarm_rfm_cache.py --dry-run --cutoff 2026-07-05

退出码：0 全窗口有行；1 存在 missing/error（报告照常写出）；2 配置/参数错误。
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import time

# 生产业务库路径：RFM 预热只允许写隔离缓存，这条路径永远拒绝。
PRODUCTION_DB_PATH = Path("/srv/shinemage/data/processed/fuqing_crm.duckdb")

DEFAULT_REPORT_PATH = ".context/rfm-prewarm-report.json"
METRIC_TYPE = "GSV"

# 与 prewarm.dashboard_windows() 的 builder 顺序一致；顺序决定去重时保留哪个名字。
WINDOW_ORDER = (
    "yesterday",
    "wtd",
    "mtd",
    "ytd",
    "last180",
    "last365",
    "q1",
    "q2",
    "q3",
    "q4",
)


class PrewarmConfigError(ValueError):
    """参数/路径配置不合法；退出码 2，不触碰缓存库。"""


def _window_builders() -> dict:
    """惰性 import：调用前 CACHE_DUCKDB_PATH 必须已写好。"""
    from backend.semantic.time import PeriodBuilder

    return {
        "yesterday": PeriodBuilder.yesterday,
        "wtd": PeriodBuilder.wtd,
        "mtd": PeriodBuilder.mtd,
        "ytd": PeriodBuilder.ytd,
        "last180": PeriodBuilder.last180days,
        "last365": PeriodBuilder.last365days,
        "q1": PeriodBuilder.q1,
        "q2": PeriodBuilder.q2,
        "q3": PeriodBuilder.q3,
        "q4": PeriodBuilder.q4,
    }


def named_windows(
    cutoff: date,
    names: list[str] | None = None,
) -> list[tuple[str, date, date]]:
    """按名字返回 ``dashboard_windows`` 口径的窗口。

    与 ``dashboard_windows(cutoff)`` 使用同一裁剪函数、同一 builder 顺序、同一
    「先到先得」去重；``names=None`` 时结果与 ``dashboard_windows(cutoff)``
    逐项相等（见 test_named_windows_match_dashboard_windows）。
    子集只保留被请求的名字，再去重，避免不同 cutoff 下 q3/MTD 折叠时整窗丢失。
    """
    from backend.services.health.rfm_analysis.prewarm import _clip_current_window

    builders = _window_builders()
    today = cutoff + timedelta(days=1)
    selected = set(WINDOW_ORDER if names is None else names)
    out: list[tuple[str, date, date]] = []
    seen: set[tuple[date, date]] = set()
    for name in WINDOW_ORDER:
        if name not in selected:
            continue
        pair = _clip_current_window(builders[name](today=today)["current"], cutoff)
        if pair is None or pair in seen:
            continue
        seen.add(pair)
        out.append((name, pair[0], pair[1]))
    return out


def _forbidden_db_paths() -> set[Path]:
    paths = {PRODUCTION_DB_PATH.resolve()}
    for env_name in ("DUCKDB_PATH", "FUQING_DB_PATH"):
        raw = os.environ.get(env_name, "").strip()
        if raw:
            paths.add(Path(raw).expanduser().resolve())
    return paths


def resolve_cache_path(value: str | None) -> Path:
    """解析并校验 --cache-duckdb（未传时取 CACHE_DUCKDB_PATH）。"""
    raw = value if value is not None else os.environ.get("CACHE_DUCKDB_PATH", "").strip()
    if not raw:
        raise PrewarmConfigError(
            "未指定隔离缓存库：请传 --cache-duckdb 或设置 CACHE_DUCKDB_PATH"
        )
    candidate = Path(raw).expanduser()
    cwd = Path.cwd().resolve()
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (cwd / candidate).resolve()
        if cwd not in resolved.parents:
            raise PrewarmConfigError(
                "相对路径 --cache-duckdb 必须位于仓库工作目录内；跨目录请使用绝对路径："
                f"{raw}"
            )
    if resolved in _forbidden_db_paths():
        raise PrewarmConfigError(
            f"拒绝写入生产业务库：{resolved}。RFM 预热只允许写隔离缓存库"
            "（--cache-duckdb / CACHE_DUCKDB_PATH）。"
        )
    if resolved.is_dir():
        raise PrewarmConfigError(f"--cache-duckdb 指向目录而不是 DuckDB 文件：{resolved}")
    return resolved


def resolve_report_path(value: str) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate


def cache_file_bytes(path: Path) -> int:
    try:
        return path.stat().st_size
    except FileNotFoundError:
        return 0


def _parse_cutoff(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"cutoff 必须是 YYYY-MM-DD：{raw}") from exc


def _parse_windows(raw: str) -> list[str]:
    tokens = [token.strip().lower() for token in raw.split(",") if token.strip()]
    if not tokens:
        raise argparse.ArgumentTypeError("--windows 不能为空（all 或逗号分隔窗口名）")
    if "all" in tokens:
        if len(tokens) != 1:
            raise argparse.ArgumentTypeError("--windows all 不能与其他窗口名混用")
        return list(WINDOW_ORDER)
    unknown = [token for token in tokens if token not in WINDOW_ORDER]
    if unknown:
        raise argparse.ArgumentTypeError(
            f"未知窗口 {unknown}；可选：all 或 {','.join(WINDOW_ORDER)}"
        )
    requested = set(tokens)
    return [name for name in WINDOW_ORDER if name in requested]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="预热 RFM dashboard 默认窗口并产出覆盖报告",
    )
    parser.add_argument(
        "--cache-duckdb",
        default=None,
        help="隔离缓存 DuckDB 路径；默认取环境变量 CACHE_DUCKDB_PATH（须在 import backend 前设置）",
    )
    parser.add_argument(
        "--cutoff",
        type=_parse_cutoff,
        default=None,
        help="数据截止日 YYYY-MM-DD；默认 orders.max(pay_time)",
    )
    parser.add_argument(
        "--windows",
        type=_parse_windows,
        default=list(WINDOW_ORDER),
        help="all 或逗号分隔：yesterday,wtd,mtd,ytd,last180,last365,q1..q4",
    )
    parser.add_argument(
        "--report",
        default=DEFAULT_REPORT_PATH,
        help=f"覆盖报告 JSON 路径（默认 {DEFAULT_REPORT_PATH}）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印窗口，不调用 RFM 计算、不写缓存",
    )
    return parser


def _resolve_cutoff(explicit: date | None) -> date:
    if explicit is not None:
        return explicit
    from backend.services.health.rfm_analysis.prewarm import warehouse_cutoff_date

    cutoff = warehouse_cutoff_date()
    if cutoff is None:
        raise PrewarmConfigError("orders.max(pay_time) 为空，无法确定预热 cutoff")
    return cutoff


def _read_request_context():
    """借只读业务连接；测试里 monkeypatch 掉，避免打开真实 DuckDB。"""
    from backend.services.dual_conn import read_request_context

    return read_request_context("prewarm")


def _execute_window(start: date, end: date) -> None:
    """单个窗口走现有 RFM 入口写缓存；故意不吞异常，由调用方原样记录。"""
    from backend.services.health.rfm_analysis import get_rfm_analysis

    get_rfm_analysis(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        metric_type=METRIC_TYPE,
        allow_live_compute=True,
    )


def _cache_row_count(start: date, end: date) -> int:
    """读缓存表校验该窗口有行（默认 channel/无排除渠道口径）。"""
    from backend.services.health.rfm_analysis.cache import RFM_CACHE_TABLE, _get_cache_conn

    row = _get_cache_conn().execute(
        f"SELECT COUNT(*) FROM {RFM_CACHE_TABLE} "
        "WHERE start_date = ? AND end_date = ? AND metric_type = ? "
        "AND channel = '' AND ex_channels = ''",
        [start.isoformat(), end.isoformat(), METRIC_TYPE],
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _close_connections() -> None:
    """关闭本进程打开的单例连接，让缓存文件写出最终大小。"""
    try:
        from backend.services.dual_conn import close_all_connections

        close_all_connections()
    except Exception as exc:  # noqa: BLE001 - 关闭失败不能吃掉覆盖报告
        print(f"WARN: 关闭 DuckDB 连接失败：{exc}", file=sys.stderr)


def _run_windows(windows, dry_run: bool) -> list[dict]:
    entries: list[dict] = []
    for name, start, end in windows:
        started = time.perf_counter()
        entry: dict = {
            "name": name,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "status": "dry_run" if dry_run else "pending",
            "rows": 0,
        }
        if not dry_run:
            try:
                _execute_window(start, end)
                rows = _cache_row_count(start, end)
                entry["rows"] = rows
                entry["status"] = "ok" if rows > 0 else "missing"
            except Exception as exc:  # noqa: BLE001 - 原样记录失败窗口，不重试掩盖
                entry["status"] = "error"
                entry["rows"] = 0
                entry["error"] = f"{type(exc).__name__}: {exc}"
        entry["elapsed_sec"] = round(time.perf_counter() - started, 3)
        entries.append(entry)
        print(
            f"[{entry['status']}] {name:<9} {entry['start']}..{entry['end']} "
            f"rows={entry['rows']} {entry['elapsed_sec']}s"
            + (f" error={entry['error']}" if entry.get("error") else "")
        )
    return entries


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        cache_path = resolve_cache_path(args.cache_duckdb)
        report_path = resolve_report_path(args.report)
        # 关键顺序：先落环境变量，再 import backend（backend.config 在 import 时读）。
        os.environ["CACHE_DUCKDB_PATH"] = str(cache_path)
        before_bytes = cache_file_bytes(cache_path)
        cutoff = _resolve_cutoff(args.cutoff)
    except PrewarmConfigError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    windows = named_windows(cutoff, args.windows)
    if not windows:
        print(f"WARN: cutoff={cutoff} 下没有可用窗口（全部被裁剪或去重）", file=sys.stderr)

    print(
        f"cutoff={cutoff.isoformat()} windows={len(windows)} "
        f"cache={cache_path} dry_run={args.dry_run}"
    )
    if args.dry_run:
        entries = _run_windows(windows, dry_run=True)
    else:
        with _read_request_context():
            entries = _run_windows(windows, dry_run=False)
        _close_connections()

    after_bytes = cache_file_bytes(cache_path)
    missing = [entry["name"] for entry in entries if entry["status"] in ("missing", "error")]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "cutoff": cutoff.isoformat(),
        "metric_type": METRIC_TYPE,
        "cache_duckdb": str(cache_path),
        "cache_file": {
            "path": str(cache_path),
            "before_bytes": before_bytes,
            "after_bytes": after_bytes,
            "delta_bytes": after_bytes - before_bytes,
            "before_exists": before_bytes > 0,
        },
        "windows": entries,
        "total": len(entries),
        "ok_count": sum(1 for entry in entries if entry["status"] == "ok"),
        "missing": missing,
        "missing_count": len(missing),
    }

    try:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    except OSError as exc:
        print(f"ERROR: 覆盖报告写入失败 {report_path}: {exc}", file=sys.stderr)
        return 2

    print(
        f"total={report['total']} ok={report['ok_count']} "
        f"missing={report['missing_count']} report={report_path}"
    )
    if missing:
        print(f"MISSING: {', '.join(missing)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
