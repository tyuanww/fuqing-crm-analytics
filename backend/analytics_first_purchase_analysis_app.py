"""Opt-in first-purchase saved-analysis HTTP. No application at import.

Reads/writes do not start runs, workers or models. OpenAPI generation opens no DB.
Minimal save interface for a Claude query card: POST created_from_run_id + title.
Card buttons and plugin root registration are out of this track.
"""

from __future__ import annotations

import re
import sqlite3
from typing import Callable, Protocol

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi

from backend.analytics_app import KEY_HEADER, _BodyLimit, _error_response, _single_header
from backend.contracts.analytics import AnalyticsErrorResponse
from backend.contracts.analytics_first_purchase_analysis import (
    ANALYSIS_SCHEMA,
    FirstPurchaseAnalysisCreateRequest,
    FirstPurchaseAnalysisTitleRequest,
    FirstPurchaseSavedAnalysis,
    FirstPurchaseSavedAnalysisList,
    FirstPurchaseSavedAnalysisListItem,
    FirstPurchaseSaveIdentity,
    FirstPurchaseSaveReceipt,
    FirstPurchaseSaveInspectRequest,
    FirstPurchaseSaveCommand,
    FirstPurchaseSaveResult,
    FirstPurchaseSavedReceipt,
    FirstPurchaseSavedProvenance,
    HTTP_API_CONNECTED,
)
from backend.contracts.analytics_first_purchase_run import FIRST_PURCHASE_HTTP_PREFIX
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, B0IdentityRegistry, require
from backend.services.analytics.first_purchase.asset_state import validate_key
from backend.services.analytics.first_purchase.saved import (
    FirstPurchaseSavedAnalysisRecord,
    FirstPurchaseSavedAnalysisStore,
)
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy, result_envelope
from backend.services.analytics.jobs import RunStore

PREFIX = FIRST_PURCHASE_HTTP_PREFIX + "/analyses"
RECEIPT_PREFIX = FIRST_PURCHASE_HTTP_PREFIX + "/save-receipts"
RESULT_PREFIX = FIRST_PURCHASE_HTTP_PREFIX + "/save-results"
VERSION_HEADER = {
    "name": "If-Match", "in": "header", "required": True,
    "schema": {"type": "string", "pattern": "^[1-9][0-9]{0,15}$"},
}


class FirstPurchaseIdentityResolver(Protocol):
    """Service-owned adapter: authenticate and return current immutable grants.

    The adapter owns credential verification and revocation. Candidate digests,
    client-supplied actors and plugin state are never identity credentials.
    Implementations must bound their own I/O; no identity snapshot is cached here.
    """

    def resolve(self, authorization: str | None) -> AnalyticsPrincipal: ...


def _identity_unavailable() -> AnalyticsError:
    return AnalyticsError(503, "IDENTITY_UNAVAILABLE", "身份服务暂不可用，请稍后重试。", retryable=True)


def _valid_identity_claim(value: object) -> bool:
    return (isinstance(value, str) and 1 <= len(value) <= 128 and bool(value.strip())
            and value.isprintable())


def _resolve_identity(registry: FirstPurchaseIdentityResolver, authorization: str | None) -> AnalyticsPrincipal:
    # Reject malformed credentials before handing them to a deployment adapter.
    if (not authorization or not authorization.startswith("Bearer ") or not 8 <= len(authorization) <= 1024
            or any(ord(char) < 33 or ord(char) > 126 for char in authorization[7:])):
        raise AnalyticsError(401, "UNAUTHENTICATED", "请提供有效的访问凭证。")
    try:
        actor = registry.resolve(authorization)
        if not isinstance(actor, AnalyticsPrincipal) or not _valid_identity_claim(actor.actor_id):
            raise _identity_unavailable()
        for grants in (actor.capabilities, actor.data_scopes):
            if (not isinstance(grants, frozenset) or len(grants) > 128
                    or any(not _valid_identity_claim(value) for value in grants)):
                raise _identity_unavailable()
        return actor
    except AnalyticsError as error:
        if error.status == 401:
            raise AnalyticsError(401, "UNAUTHENTICATED", "访问凭证无效或已失效，请重新认证。") from None
        if error.status == 403:
            raise AnalyticsError(403, "FORBIDDEN", "当前身份无权访问此服务。") from None
        raise _identity_unavailable() from None
    except Exception:
        # Do not pass provider messages, recovery URLs or exception context to HTTP/logs.
        raise _identity_unavailable() from None


def _analysis_version(request: Request) -> int:
    raw = _single_header(request, "if-match")
    if raw is None:
        raise AnalyticsError(428, "IF_MATCH_REQUIRED", "改标题需要最近一次 GET 返回的版本号。")
    if not re.fullmatch(r"[1-9][0-9]{0,15}", raw):
        raise AnalyticsError(400, "INVALID_VERSION", "If-Match 必须是正整数字符串。")
    return int(raw)


def http_analysis_document(record: FirstPurchaseSavedAnalysisRecord) -> FirstPurchaseSavedAnalysis:
    payload = record.as_dict()
    payload["http_api"] = HTTP_API_CONNECTED
    return FirstPurchaseSavedAnalysis.model_validate(payload)


def http_list_item(item: dict) -> FirstPurchaseSavedAnalysisListItem:
    payload = dict(item)
    payload["http_api"] = HTTP_API_CONNECTED
    return FirstPurchaseSavedAnalysisListItem.model_validate(payload)


def create_first_purchase_analysis_app(
    run_store: RunStore | None = None,
    analysis_store: FirstPurchaseSavedAnalysisStore | None = None,
    identities: FirstPurchaseIdentityResolver | None = None,
    *,
    runtime_ready: Callable[[], bool] | None = None,
    save_policy: Callable[[], FirstPurchaseSavePolicy | None] | None = None,
) -> FastAPI:
    app = FastAPI(title="Shine Mage First-Purchase Saved Analysis", version=ANALYSIS_SCHEMA,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(_BodyLimit)
    registry = identities if identities is not None else B0IdentityRegistry()

    def principal(request: Request):
        return _resolve_identity(registry, _single_header(request, "authorization"))

    def runs() -> RunStore:
        if run_store is None:
            raise AnalyticsError(503, "KERNEL_NOT_CONFIGURED", "查询任务内核尚未显式配置。")
        return run_store

    def analyses() -> FirstPurchaseSavedAnalysisStore:
        if analysis_store is None:
            raise AnalyticsError(503, "ANALYSIS_NOT_CONFIGURED", "分析资产库尚未显式配置。")
        return analysis_store

    @app.exception_handler(AnalyticsError)
    async def analytics_error(request: Request, error: AnalyticsError):
        return _error_response(error, request.state.analytics_request_id)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, _error: RequestValidationError):
        return _error_response(
            AnalyticsError(422, "INVALID_REQUEST", "请求与当前分析合同不匹配，请检查版本、字段和取值。"),
            request.state.analytics_request_id,
        )

    @app.exception_handler(sqlite3.DatabaseError)
    async def state_error(request: Request, _error: sqlite3.DatabaseError):
        return _error_response(
            AnalyticsError(503, "STATE_UNAVAILABLE", "分析状态暂不可用，请使用原请求标识查询或重试。", retryable=True),
            request.state.analytics_request_id,
        )

    errors = {code: {"model": AnalyticsErrorResponse} for code in (400, 401, 403, 404, 409, 410, 413, 422, 428, 429, 503)}

    def current_policy():
        try:
            policy = save_policy() if save_policy is not None else None
        except Exception:
            raise AnalyticsError(503, "SAVE_POLICY_UNAVAILABLE", "保存策略暂不可用，请稍后重试。", retryable=True) from None
        if policy is not None and not isinstance(policy, FirstPurchaseSavePolicy):
            raise AnalyticsError(503, "SAVE_POLICY_INVALID", "保存策略尚未正确配置。")
        return policy

    @app.post(RESULT_PREFIX + "/inspect", response_model=FirstPurchaseSaveResult,
              operation_id="analytics_first_purchase_save_result_inspect", responses=errors,
              openapi_extra={"parameters": [KEY_HEADER], "x-read-only": True})
    def inspect_save_result(payload: FirstPurchaseSaveInspectRequest, request: Request, response: Response):
        actor = principal(request)
        key = validate_key(_single_header(request, "idempotency-key"))
        source = resolve_trusted_first_purchase_source(runs(), actor, payload.created_from_run_id,
                                                       capability="analysis:read")
        stored = analyses().result_already_saved(actor, key, payload.identity, source)
        result = result_envelope(source, actor, payload.identity, current_policy(),
                                 checked_ms=analyses().clock(), already_saved=stored)
        response.headers["cache-control"] = "no-store"
        return result

    @app.post(RECEIPT_PREFIX, status_code=201, response_model=FirstPurchaseSavedReceipt,
              operation_id="analytics_first_purchase_save_receipt_create", responses=errors,
              openapi_extra={"parameters": [KEY_HEADER], "x-explicit-save-policy-required": True})
    def save_result(payload: FirstPurchaseSaveCommand, request: Request, response: Response):
        actor = principal(request)
        key = validate_key(_single_header(request, "idempotency-key"))

        def authorize():
            current = principal(request)
            if current.actor_id != actor.actor_id:
                raise AnalyticsError(403, "FORBIDDEN", "当前身份已变化，请重新核对。")
            for capability in ("analysis:read", "analysis:save"):
                require(current, capability, data_scope="first-purchase-fixture")

        def resolve():
            policy = current_policy()
            if policy is None:
                raise AnalyticsError(503, "SAVE_POLICY_NOT_CONFIGURED", "D15 保存尚未显式准入。")
            current = principal(request)
            source = resolve_trusted_first_purchase_source(runs(), current, payload.created_from_run_id)
            envelope = result_envelope(source, current, payload.identity, policy,
                                       checked_ms=analyses().clock(), already_saved=False)
            return source, envelope

        receipt = analyses().save_admitted(actor, key, payload, authorize=authorize, resolve=resolve)
        response.headers.update({"cache-control": "no-store", "location": f"{PREFIX}/{receipt.analysis_ref.analysis_id}"})
        return receipt

    @app.post(RECEIPT_PREFIX + "/reconcile", response_model=FirstPurchaseSaveReceipt,
              operation_id="analytics_first_purchase_save_receipt_reconcile", responses=errors,
              openapi_extra={"parameters": [KEY_HEADER], "x-read-only": True})
    def reconcile_save_receipt(payload: FirstPurchaseSaveIdentity, request: Request, response: Response):
        actor = principal(request)
        receipt = analyses().lookup_save_receipt(
            actor, validate_key(_single_header(request, "idempotency-key")), payload,
        )
        response.headers["cache-control"] = "no-store"
        return receipt

    @app.post(PREFIX, status_code=201, response_model=FirstPurchaseSavedAnalysis,
              operation_id="analytics_first_purchase_analysis_create", responses=errors,
              openapi_extra={"parameters": [KEY_HEADER]})
    def create_analysis(payload: FirstPurchaseAnalysisCreateRequest, request: Request, response: Response):
        actor = principal(request)
        if save_policy is not None:
            raise AnalyticsError(409, "VERSIONED_SAVE_REQUIRED", "此服务已启用 D15 保存门禁，请使用版本化保存接口。")
        visual = None if payload.visual_spec is None else payload.visual_spec.model_dump(mode="json")
        trusted = resolve_trusted_first_purchase_source(runs(), actor, payload.created_from_run_id)
        record = analyses().save_from_trusted_source(
            actor, validate_key(_single_header(request, "idempotency-key")),
            title=payload.title, visual_spec=visual, trusted=trusted,
        )
        document = http_analysis_document(record)
        response.headers.update({
            "cache-control": "no-store",
            "etag": str(document.version),
            "location": f"{PREFIX}/{document.analysis_id}",
        })
        return document

    @app.get(PREFIX, response_model=FirstPurchaseSavedAnalysisList,
             operation_id="analytics_first_purchase_analysis_list", responses=errors)
    def list_analyses(request: Request, response: Response):
        actor = principal(request)
        items = [http_list_item(row) for row in analyses().list(actor)]
        response.headers["cache-control"] = "no-store"
        return FirstPurchaseSavedAnalysisList(items=items)

    @app.get(PREFIX + "/{analysis_id}", response_model=FirstPurchaseSavedAnalysis,
             operation_id="analytics_first_purchase_analysis_get", responses=errors)
    def get_analysis(analysis_id: str, request: Request, response: Response, version: int | None = None):
        actor = principal(request)
        record = analyses().get(actor, analysis_id, version)
        document = http_analysis_document(record)
        response.headers.update({"cache-control": "no-store", "etag": str(document.version)})
        return document

    @app.get(PREFIX + "/{analysis_id}/provenance", response_model=FirstPurchaseSavedProvenance,
             operation_id="analytics_first_purchase_saved_provenance_get", responses=errors)
    def get_saved_provenance(analysis_id: str, request: Request, response: Response, version: int | None = None):
        actor = principal(request)
        document = analyses().saved_provenance(actor, analysis_id, version)
        response.headers["cache-control"] = "no-store"
        return document

    @app.post(PREFIX + "/{analysis_id}/versions", status_code=201, response_model=FirstPurchaseSavedAnalysis,
              operation_id="analytics_first_purchase_analysis_publish_title", responses=errors,
              openapi_extra={"parameters": [KEY_HEADER, VERSION_HEADER]})
    def publish_title(analysis_id: str, payload: FirstPurchaseAnalysisTitleRequest, request: Request, response: Response):
        actor = principal(request)
        record = analyses().publish_version(
            actor, validate_key(_single_header(request, "idempotency-key")), analysis_id,
            base_version=_analysis_version(request), title=payload.title,
        )
        document = http_analysis_document(record)
        response.headers.update({"cache-control": "no-store", "etag": str(document.version)})
        return document

    def openapi():
        if app.openapi_schema is None:
            schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
            schema.setdefault("components", {}).setdefault("securitySchemes", {})["AnalysisBearer"] = {
                "type": "http", "scheme": "bearer",
                "description": "Explicit local first-purchase analysis identity; not CRM auth.",
            }
            schema["security"] = [{"AnalysisBearer": []}]
            schema["x-saved-analysis-http"] = True
            schema["x-first-purchase-saved-analysis-http"] = True
            schema["x-not-b0-run-kernel"] = True
            schema["x-query-session-fence"] = False
            schema["x-shared-succeeded-source"] = True
            schema["x-d15-save-policy"] = "explicit-server-admission-required"
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = openapi
    app.state.runtime_ready = runtime_ready
    return app
