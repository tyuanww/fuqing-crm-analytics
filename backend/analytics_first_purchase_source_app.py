"""Explicit query-owned source HTTP. Schema generation opens no state or network."""
import sqlite3

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from backend.analytics_app import _BodyLimit, _error_response, _single_header
from backend.contracts.analytics import AnalyticsErrorResponse
from backend.contracts.analytics_first_purchase_source import (
    FirstPurchaseSourceRequest, FirstPurchaseSourceResponse, SOURCE_SCHEMA, SOURCE_PREFIX, SOURCE_BODY_LIMIT,
)
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.identity import FirstPurchaseIdentityResolver, resolve_identity
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.services.analytics.resource_profile import canonical_json


def create_first_purchase_source_app(run_store=None, identities: FirstPurchaseIdentityResolver | None = None):
    app = FastAPI(title="ShineMage First-Purchase Query Source", version="1.0.0",
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(_BodyLimit)

    @app.exception_handler(AnalyticsError)
    async def analytics_error(request, error):
        return _error_response(error, request.state.analytics_request_id)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, _error):
        return _error_response(AnalyticsError(422, "INVALID_REQUEST", "请求与来源合同不匹配。"),
                               request.state.analytics_request_id)

    @app.exception_handler(sqlite3.DatabaseError)
    async def unavailable(request, _error):
        return _error_response(AnalyticsError(503, "SOURCE_UNAVAILABLE", "查询来源暂不可用。", retryable=True),
                               request.state.analytics_request_id)

    @app.post(SOURCE_PREFIX + "/resolve", response_model=FirstPurchaseSourceResponse,
              operation_id="first_purchase_source_resolve",
              responses={code: {"model": AnalyticsErrorResponse} for code in (400, 401, 403, 404, 409, 413, 422, 503)},
              openapi_extra={"x-read-only": True})
    def resolve(payload: FirstPurchaseSourceRequest, request: Request):
        if identities is None or run_store is None:
            raise AnalyticsError(503, "SOURCE_NOT_CONFIGURED", "查询来源服务尚未显式配置。")
        actor = resolve_identity(identities, _single_header(request, "authorization"))
        try:
            source = resolve_trusted_first_purchase_source(run_store, actor, payload.run_id,
                                                           capability=payload.capability)
            document = FirstPurchaseSourceResponse(
                schema_version=SOURCE_SCHEMA, api_version="1.0.0", run_id=source.run_id, owner_id=source.owner_id,
                status=source.status, primary_result_ref=source.primary_result_ref,
                method_package_digest=source.method_package_digest, generated_at=source.generated_at,
                evidence_digest=source.evidence_digest, request=source.request, result=source.result,
            ).model_dump(mode="json")
            if len(canonical_json(document).encode()) > SOURCE_BODY_LIMIT:
                raise ValueError("SOURCE_RESPONSE_LIMIT")
        except ValueError:
            raise AnalyticsError(503, "SOURCE_INVALID", "冻结来源不满足当前服务合同。", retryable=True) from None
        return JSONResponse(document, headers={"cache-control": "no-store"})

    def openapi():
        if app.openapi_schema is None:
            schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
            schema.setdefault("components", {}).setdefault("securitySchemes", {})["SourceBearer"] = {
                "type": "http", "scheme": "bearer",
            }
            schema["security"] = [{"SourceBearer": []}]
            schema["x-query-owned-frozen-source"] = SOURCE_SCHEMA
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = openapi
    return app
