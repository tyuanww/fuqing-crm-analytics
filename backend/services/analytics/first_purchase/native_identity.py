"""Opt-in native-session identity via the authenticated Host's CRM capability.

The Host keeps CRM credentials; this adapter caches neither them nor grants.
An identity observation cannot be reused as a bearer token or reassigned owner.
"""
import secrets

from backend.contracts.analytics_first_purchase_analysis import FirstPurchaseSessionIdentity
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal

QUERY_CAPABILITIES = frozenset({"run:create", "run:read", "run:cancel"})


class NativeSessionIdentityResolver:
    def __init__(self, bridge, session_id: str, gateway_token: str):
        self.bridge, self.session_id, self._gateway_token = bridge, session_id, gateway_token

    def resolve(self, authorization: str | None) -> AnalyticsPrincipal:
        if (not isinstance(authorization, str) or not authorization.isascii()
                or not secrets.compare_digest(authorization, "Bearer " + self._gateway_token)):
            raise AnalyticsError(401, "UNAUTHENTICATED", "需要受信入口能力。")
        try:
            response = self.bridge.call("identity", {"session_id": self.session_id})
            if (isinstance(response, dict) and set(response) == {"session_id", "denied"}
                    and response["session_id"] == self.session_id
                    and response["denied"] in ("UNAUTHENTICATED", "FORBIDDEN")):
                raise AnalyticsError(401 if response["denied"] == "UNAUTHENTICATED" else 403,
                                     response["denied"], "当前 CRM 账号未连接或无权执行查询。")
            if (not isinstance(response, dict) or set(response) != {"session_id", "identity"}
                    or response["session_id"] != self.session_id):
                raise ValueError()
            identity = FirstPurchaseSessionIdentity.model_validate(response["identity"])
            # Defaults are useful at the producer only, never for an incomplete observation.
            if identity.model_dump(mode="json") != response["identity"]:
                raise ValueError()
            return AnalyticsPrincipal(identity.owner_id, QUERY_CAPABILITIES, frozenset({identity.data_scope}))
        except AnalyticsError as error:
            if error.status in (401, 403):
                raise AnalyticsError(error.status, "UNAUTHENTICATED" if error.status == 401 else "FORBIDDEN",
                                     "当前 CRM 账号未连接或无权执行查询。") from None
            raise AnalyticsError(503, "IDENTITY_UNAVAILABLE", "身份服务暂不可用，请稍后重试。", retryable=True) from None
        except Exception:
            raise AnalyticsError(503, "IDENTITY_UNAVAILABLE", "身份服务暂不可用，请稍后重试。", retryable=True) from None
