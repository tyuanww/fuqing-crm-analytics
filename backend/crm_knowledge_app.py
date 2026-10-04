"""Independently mountable public synthetic knowledge API. No DSH or account data."""
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.contracts.crm_knowledge_v1 import KnowledgeExplainRequest, KnowledgeExplanation
from backend.crm_service_contracts import bind_service_contract


def create_crm_knowledge_app(*, pack_path: Path | None = None, verify_local_implementation: bool = True) -> FastAPI:
    app = FastAPI(title="CRM knowledge candidate", version="1.0.0", docs_url=None, redoc_url=None)
    contract = bind_service_contract(app, "knowledge")

    @app.exception_handler(RequestValidationError)
    async def invalid(_request: Request, _error: RequestValidationError):
        return JSONResponse({"status": "UNAVAILABLE", "code": "INVALID_REQUEST"}, status_code=422)

    @app.get(f"{contract['base_path']}/capabilities")
    def capabilities():
        return {**contract, "real_business_acceptance": False, "document_acl_connected": False}

    @app.post(f"{contract['base_path']}/explain")
    def explain(body: KnowledgeExplainRequest) -> KnowledgeExplanation:
        from backend.services.crm_knowledge import explain_knowledge
        return KnowledgeExplanation.model_validate(explain_knowledge(
            body.topic, pack=pack_path, verify_local_implementation=verify_local_implementation,
        ))

    return app
