from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
import tempfile
import time


def _write_report(path: Path, value: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            json.dump(value, output, ensure_ascii=False, allow_nan=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    from backend.config import DUCKDB_PATH
    from backend.services.health.rfm_analysis.precompute_plan import RfmPrecomputePolicy
    from backend.services.warehouse_boot import WarehouseRuntimeSettings, build_warehouse_runtime
    from backend.services.warehouse_prewarm import FAMILIES, WarmBudget, build_reporting_plan, build_warm_plan, run_warm_plan

    parser = argparse.ArgumentParser(description="预热已封存仓库的商品与 RFM 聚合缓存")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--max-new-results", type=int, default=0)
    parser.add_argument("--max-seconds", type=float, default=300)
    parser.add_argument("--months", type=int, default=24)
    parser.add_argument("--reporting-year", type=int, help="仅预热指定年份 H1、Q1、Q2 的全店 GSV 默认口径")
    parser.add_argument("--families", nargs="+", choices=FAMILIES, default=list(FAMILIES))
    args = parser.parse_args(argv)
    try:
        budget = WarmBudget(args.max_new_results, args.max_seconds)
        policy = RfmPrecomputePolicy(lookback_months=args.months)
        if len(args.families) != len(set(args.families)):
            raise ValueError("prewarm families must be unique")
        if args.reporting_year is not None and not 2000 <= args.reporting_year <= 2099:
            raise ValueError("reporting year must be between 2000 and 2099")
        settings = WarehouseRuntimeSettings.from_environment(DUCKDB_PATH)
        if settings is None:
            raise ValueError("three FQ_WAREHOUSE settings are required")
    except ValueError as exc:
        parser.error(str(exc))
    started = time.monotonic()
    runtime = build_warehouse_runtime(settings, role="prewarm")
    seal_seconds = time.monotonic() - started
    try:
        plan = (build_reporting_plan(runtime, year=args.reporting_year, families=tuple(args.families))
                if args.reporting_year is not None else build_warm_plan(runtime, policy=policy, families=tuple(args.families)))
        report = run_warm_plan(runtime, plan, budget) if args.execute else None
        summary = report.summary() if report else {"plan_digest": plan.digest, "expected": len(plan.requests), "status": "PLANNED"}
        plan_document = asdict(plan)
        for value, request in zip(plan_document["requests"], plan.requests, strict=True):
            value["resolved_periods"] = None if request.query.empty else request.query.ranges
        _write_report(settings.state_dir / "prewarm-report.json", {
            "schema_version": "warehouse-warm-report/v1", "plan": plan_document,
            "report": asdict(report) if report else None, "summary": summary,
            "seal_seconds": seal_seconds,
        })
        print(json.dumps({**summary, "seal_seconds": seal_seconds}, ensure_ascii=False, allow_nan=False))
        if report is not None and any(value.status == "FAILED" for value in report.outcomes):
            return 1
        return 0 if report is None or report.complete else 3
    finally:
        runtime.source.close()


if __name__ == "__main__":
    raise SystemExit(main())
