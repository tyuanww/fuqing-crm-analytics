"""Isolated CRM metrics candidate app. Synthetic source only; no archive DB."""
from __future__ import annotations
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.contracts.crm_metrics_v1 import ExplainRequest, MetricRequest, MetricResult
from backend.crm_service_contracts import bind_service_contract
from backend.semantic.crm_metrics_v1 import METRIC_VERSION, MetricContractError
from backend.services.crm_readonly.runtime import query_candidate
from backend.services.crm_readonly.errors import CrmReadonlyError

PREFIX = "/api/v1/crm-metrics"


def create_crm_metrics_app(*, synthetic_path: Path | None = None, legacy_adapter: bool = True) -> FastAPI:
    app = FastAPI(title="CRM metrics v1 candidate", version=METRIC_VERSION if legacy_adapter else "1.0.0", docs_url=None, redoc_url=None)
    # Existing local Python consumers retain the old routes during migration.
    # New plugin consumers must negotiate the exact API identity on every call.
    contract = bind_service_contract(app, "metrics", legacy_no_header=legacy_adapter)
    @app.exception_handler(CrmReadonlyError)
    async def source_error(_request: Request, error: CrmReadonlyError):
        return JSONResponse({"status": "UNAVAILABLE", "code": error.code, "message": str(error)}, status_code=400)

    @app.exception_handler(MetricContractError)
    async def contract_error(_request: Request, error: MetricContractError):
        return JSONResponse({"status": "UNAVAILABLE", "code": error.code, "message": error.message}, status_code=400)

    @app.exception_handler(RequestValidationError)
    async def invalid(_request: Request, _error: RequestValidationError):
        return JSONResponse({"status": "UNAVAILABLE", "code": "INVALID_REQUEST", "message": "请求与 crm-metrics/v1 不符"}, status_code=422)

    @app.get(f"{PREFIX}/capabilities")
    def capabilities():
        return {
            **contract,
            "metric_version": METRIC_VERSION,
            "queries": ["sales_window_summary", "existing_customer_repurchase", "sample_followup"],
            "synthetic_only": True,
            "real_archive": False,
            "d019": "unverified",
            "competition_scope_untouched": True,
            "publication_status": "local_isolated_candidate",
        }

    @app.post(f"{PREFIX}/query")
    def query(body: MetricRequest) -> MetricResult:
        result = query_candidate(body.model_dump(), fixture_path=synthetic_path)
        return MetricResult.model_validate(result)

    if legacy_adapter:
        @app.post(f"{PREFIX}/explain")
        def explain(body: ExplainRequest):
            # Legacy adapter only; excluded from the standalone metrics app.
            from backend.services.crm_knowledge import explain_knowledge
            return explain_knowledge(body.topic)

    return app
