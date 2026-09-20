"""Candidate entry: server-owned synthetic fixture -> read-only adapter -> engine.

The fixture path, source registry and permission scope are never model parameters.
Each invocation owns a tiny temporary source/cache and closes every connection.
"""
from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.contracts.crm_metrics_v1 import MetricRequest, MetricResult
from backend.semantic.crm_metrics_compose import run_composed_query
from backend.semantic.crm_metrics_v1 import MetricContractError, default_synthetic_path
from backend.services.crm_readonly import CrmReadonlyAdapter, GrainRequest, SourceRegistry, build_synthetic_grain_source


def query_candidate(request: dict) -> dict:
    body = MetricRequest.model_validate(request)
    fixture = json.loads(default_synthetic_path().read_text())
    if body.contains_real_data or fixture["contains_real_data"]:
        raise MetricContractError("FORBIDDEN", "candidate is synthetic only")
    if body.source_id != fixture["source_id"]:
        raise MetricContractError("UNKNOWN_SOURCE", "source_id is not registered")
    with TemporaryDirectory(prefix="crm-candidate-") as directory:
        base = Path(directory)
        for name in ("source", "cache", "tmp"):
            (base / name).mkdir(mode=0o700)
        source = build_synthetic_grain_source(
            base / "source", source_id=fixture["source_id"],
            lines=fixture["lines"], refunds=fixture["refunds"],
            coverage_start=fixture["coverage_start"], data_through=fixture["data_through"],
            history_complete=fixture["history_complete"],
            permission_scope="crm-local-synthetic/v1",
        )
        adapter = CrmReadonlyAdapter(SourceRegistry([source]), cache_dir=base / "cache", temp_dir=base / "tmp", server_scope=source.permission_scope)
        args = body.model_dump()
        grain = adapter.materialize(GrainRequest(**args))
        result = run_composed_query(args, grain)
        return MetricResult.model_validate(result).model_dump()
