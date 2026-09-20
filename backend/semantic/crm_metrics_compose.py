"""Validate and compose the source-owned grain envelope with v1 calculations."""
from __future__ import annotations

from typing import Any

from backend.semantic.crm_metrics_v1 import (
    MetricContractError, _result, as_dt, basket_from_dict, make_query_ref,
    period_bounds, run_query, yoy_period,
)


def basket_from_grain(grain: Any) -> dict[str, Any]:
    payload = grain.as_dict() if hasattr(grain, "as_dict") else dict(grain)
    if payload.get("contains_real_data"):
        raise MetricContractError("FORBIDDEN", "composed query rejects real data")
    return {
        "source_id": payload["source_id"], "data_version": payload["data_version"],
        "mapping_version": payload["mapping_version"], "contains_real_data": False,
        "lines": payload["order_lines"], "refunds": payload["refund_events"],
        "history_complete": payload.get("history_complete", False),
        "coverage_start": payload.get("coverage_start"),
    }


def run_composed_query(metric_request: dict[str, Any], grain: Any) -> dict[str, Any]:
    payload = grain.as_dict() if hasattr(grain, "as_dict") else dict(grain)
    for key in ("source_id", "metric_version", "query_id", "contains_real_data"):
        if metric_request.get(key) != payload.get(key):
            raise MetricContractError("GRAIN_REQUEST_MISMATCH", f"grain {key} differs from request")
    resolved = payload["resolved_filters"]
    # Do not allow an already materialized grain to be relabelled by the caller.
    for key in ("period_start", "period_end_exclusive", "refund_view", "channel_ids", "product_ids", "identity_scope", "observation_days", "cohort_period_start", "cohort_period_end_exclusive"):
        if (metric_request.get(key) or None) != (resolved.get(key) or None):
            raise MetricContractError("GRAIN_REQUEST_MISMATCH", f"grain filter {key} differs from request")
    for key in ("data_through", "refund_as_of"):
        if as_dt(resolved[key]) > as_dt(metric_request[key]):
            raise MetricContractError("GRAIN_REQUEST_MISMATCH", f"grain exceeds requested {key}")
    if metric_request.get("actor_scope", "server_filled") not in ("server_filled", payload["actor_scope"]):
        raise MetricContractError("FORBIDDEN", "grain permission differs from caller")
    effective = {**metric_request, **{key: resolved[key] for key in ("data_through", "refund_as_of", "amount_already_net")}}
    raw = basket_from_grain(payload)
    limits = list(payload["limitations"])
    missing_refunds = "refund_event_grain" not in payload["capabilities"] and not resolved["amount_already_net"]
    if payload["status"] != "OK" or missing_refunds:
        # Never parse missing amounts/statuses into guessed zeroes or PAID defaults.
        raw.update(lines=[], refunds=[])
        basket = basket_from_dict(raw)
        start, end = period_bounds(effective["period_start"], effective["period_end_exclusive"])
        ys, ye = yoy_period(effective["period_start"], effective["period_end_exclusive"])
        result = _result(effective, basket, effective["query_id"], {}, limits, start, end, ys, ye)
        result.update(status="UNAVAILABLE", implementation_status="source_unverified")
    else:
        basket = basket_from_dict(raw)
        result = run_query(effective, basket)
        result["limitations"] = list({(item["code"], item.get("related_fact"), item["message"]): item for item in limits + result["limitations"]}.values())
    result.update(adapter_query_ref=payload["query_ref"], permission_version=payload["permission_version"], actor_scope=payload["actor_scope"], source_data_through=payload.get("source_data_through"), coverage_start=payload.get("coverage_start"), history_complete=payload.get("history_complete", False), adapter_version=payload["adapter_version"])
    result["query_ref"] = make_query_ref({"engine_query_ref": result["query_ref"], "adapter_query_ref": payload["query_ref"], "permission_version": payload["permission_version"], "actor_scope": payload["actor_scope"]})
    return result
