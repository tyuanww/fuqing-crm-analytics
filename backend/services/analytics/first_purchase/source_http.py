"""Read a frozen source from the query owner; never opens its RunStore/SQLite."""
from dataclasses import dataclass, field
import json

from backend.contracts.analytics_first_purchase_source import (
    FirstPurchaseSourceRequest, FirstPurchaseSourceResponse, SOURCE_BODY_LIMIT, SOURCE_PREFIX,
)
from backend.services.analytics.access import AnalyticsError, require
from backend.services.analytics.first_purchase.identity import validate_authorization
from backend.services.analytics.first_purchase.loopback_http import LoopbackHTTP, unique_object
from backend.services.analytics.first_purchase.source import FirstPurchaseTrustedSource
from backend.services.analytics.resource_profile import canonical_json


def source_unavailable():
    return AnalyticsError(503, "SOURCE_UNAVAILABLE", "查询来源服务暂不可用，请核对原回执后重试。", retryable=True)


@dataclass(frozen=True)
class HTTPFirstPurchaseSourceResolver:
    """Explicit trusted loopback origin; current CRM credential forwarded once.

    It is not a credential broker, cache or distributed transaction. A source is
    an immutable snapshot authenticated by its query owner at read time. Saving
    it never changes query state; successful receipt replay needs no query I/O.
    """

    origin: str
    timeout_seconds: float = 2.0
    _http: LoopbackHTTP = field(init=False, repr=False)

    def __post_init__(self):
        try:
            object.__setattr__(self, "_http", LoopbackHTTP(self.origin, self.timeout_seconds, SOURCE_BODY_LIMIT))
        except ValueError as error:
            raise ValueError("QUERY_SOURCE_" + str(error)) from None

    def resolve(self, principal, run_id, *, capability, authorization):
        require(principal, capability, data_scope="first-purchase-fixture")
        require(principal, "run:read", data_scope="first-purchase-fixture")
        authorization = validate_authorization(authorization)
        payload = FirstPurchaseSourceRequest(schema_version="first-purchase-source-request/v1",
                                             run_id=run_id, capability=capability)
        try:
            status, body = self._http.request("POST", SOURCE_PREFIX + "/resolve", authorization,
                                              payload.model_dump_json().encode())
            errors = {
                401: ("UNAUTHENTICATED", "访问凭证无效或已失效，请重新认证。"),
                403: ("FORBIDDEN", "当前身份无权访问查询来源。"),
                404: ("NOT_FOUND", "任务不存在或当前身份不可见。"),
                409: ("SOURCE_CONFLICT", "查询来源与冻结合同不一致。"),
                422: ("SOURCE_NOT_SAVEABLE", "查询来源尚未形成可保存的完整结果。"),
            }
            if status in errors:
                raise AnalyticsError(status, *errors[status])
            if status != 200:
                raise source_unavailable()
            raw = json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)
            source = FirstPurchaseSourceResponse.model_validate(raw)
            wire = source.model_dump(mode="json")
            if (canonical_json(raw) != canonical_json(wire) or source.run_id != run_id
                    or source.owner_id != principal.actor_id):
                raise ValueError("SOURCE_BINDING_MISMATCH")
            result = wire["result"]
            return FirstPurchaseTrustedSource(
                run_id=source.run_id, status=source.status, owner_id=source.owner_id,
                query_id=result["query_id"], query_version=result["query_version"],
                metric_id=result["metric_id"], metric_version=result["metric_version"],
                data_version=result["data_version"], filter_hash=result["filter_hash"],
                evidence_digest=source.evidence_digest, request=wire["request"], result=result,
                primary_result_ref=source.primary_result_ref, method_package_digest=source.method_package_digest,
                generated_at=wire["generated_at"], source_layer="query_source_http_v1",
            )
        except AnalyticsError:
            raise
        except Exception:
            raise source_unavailable() from None
