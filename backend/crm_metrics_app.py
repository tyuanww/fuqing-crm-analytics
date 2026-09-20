"""Isolated CRM metrics candidate app. Synthetic source only; no archive DB."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.contracts.crm_metrics_v1 import ExplainRequest, MetricRequest, MetricResult
from backend.semantic.crm_metrics_v1 import METRIC_VERSION, MetricContractError
from backend.services.crm_readonly.runtime import query_candidate
from backend.services.crm_readonly.errors import CrmReadonlyError
from backend.services.crm_knowledge import explain_knowledge

PREFIX = "/api/v1/crm-metrics"


def create_crm_metrics_app() -> FastAPI:
    app = FastAPI(title="CRM metrics v1 candidate", version=METRIC_VERSION, docs_url=None, redoc_url=None)
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
        result = query_candidate(body.model_dump())
        return MetricResult.model_validate(result)

    @app.post(f"{PREFIX}/explain")
    def explain(body: ExplainRequest):
        return explain_knowledge(body.topic)

    return app
