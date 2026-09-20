#!/usr/bin/env python3
"""Isolated CRM metrics v1 CLI. Synthetic fixtures only; no archive DB."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.semantic.crm_metrics_v1 import METRIC_VERSION  # noqa: E402
from backend.services.crm_readonly.runtime import query_candidate  # noqa: E402
from backend.services.crm_knowledge import explain_knowledge  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="crm-metrics/v1 synthetic query")
    parser.add_argument("--stdin", action="store_true", help="Read JSON {action, request|topic, fixture?}")
    parser.add_argument("--action", choices=("query", "explain", "capabilities"), default="query")
    parser.add_argument("--request-json")
    parser.add_argument("--topic")
    args = parser.parse_args(argv)

    payload = json.loads(sys.stdin.read() or "{}") if args.stdin else {}
    action = payload.get("action") or args.action
    if action == "explain":
        topic = payload.get("topic") or args.topic or "aus"
        json.dump(explain_knowledge(topic), sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    if action == "capabilities":
        json.dump({
            "metric_version": METRIC_VERSION,
            "queries": ["sales_window_summary", "existing_customer_repurchase", "sample_followup"],
            "synthetic_only": True,
            "real_archive": False,
            "d019": "unverified",
            "competition_scope_untouched": True,
        }, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    request = payload.get("request")
    if args.request_json:
        request = json.loads(args.request_json)
    if not request:
        raise SystemExit("query 需要 request")
    if "fixture" in payload:
        raise SystemExit("fixture is server-owned")
    result = query_candidate(request)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2, default=str)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
