"""Optional CRM /auth/me adapter. No login, password, token cache or CRM imports.

Only the first-purchase synthetic scope is granted. Query execution additionally
requires allow_query=True; existing saved-analysis deployments keep it disabled.
The service owner explicitly
selects an existing administrator; a successful identity check never admits a
candidate or configures a save policy. Default application startup stays closed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import re

from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.first_purchase.identity import validate_authorization
from backend.services.analytics.first_purchase.loopback_http import LoopbackHTTP, unique_object

_USERNAME = re.compile(r"[A-Za-z0-9_.@-]{1,64}\Z")


def _unavailable():
    return AnalyticsError(503, "IDENTITY_UNAVAILABLE", "身份服务暂不可用，请稍后重试。", retryable=True)


@dataclass(frozen=True)
class CRMFirstPurchaseIdentityResolver:
    """Bounded, uncached identity check against one explicitly trusted loopback.

    Both the configured account allowlist and CRM's current is_admin grant must
    match. Username remains the actor ID; no alias to a fixture's owner is made.
    Literal loopback avoids DNS/proxies. Redirects and cookies are never used.
    timeout_seconds bounds the entire connection/request/response, including
    slowly streamed headers/body; h11 is already in the service's pinned lock.
    """

    origin: str
    allowed_usernames: frozenset[str]
    timeout_seconds: float = 2.0
    allow_query: bool = False
    _http: LoopbackHTTP = field(init=False, repr=False)

    def __post_init__(self):
        try:
            object.__setattr__(self, "_http", LoopbackHTTP(self.origin, self.timeout_seconds, 4096))
        except ValueError as error:
            raise ValueError("CRM_IDENTITY_" + str(error)) from None
        if (type(self.allowed_usernames) is not frozenset or not 1 <= len(self.allowed_usernames) <= 128
                or any(not isinstance(name, str) or not _USERNAME.fullmatch(name)
                       for name in self.allowed_usernames)):
            raise ValueError("CRM_IDENTITY_EXPLICIT_ACCOUNTS_REQUIRED")
        if type(self.allow_query) is not bool:
            raise ValueError("CRM_IDENTITY_QUERY_GRANT_INVALID")

    def resolve(self, authorization: str | None) -> AnalyticsPrincipal:
        validate_authorization(authorization)
        try:
            payload = json.loads(self._request(authorization).decode("utf-8"), object_pairs_hook=unique_object)
            if (not isinstance(payload, dict) or set(payload) != {"username", "is_admin"}
                    or not isinstance(payload["username"], str) or not _USERNAME.fullmatch(payload["username"])
                    or type(payload["is_admin"]) is not bool):
                raise ValueError("CRM_IDENTITY_RESPONSE_INVALID")
            if payload["username"] not in self.allowed_usernames or not payload["is_admin"]:
                raise AnalyticsError(403, "FORBIDDEN", "当前身份无权访问此服务。")
            capabilities = frozenset({"run:read", "analysis:read", "analysis:save"})
            if self.allow_query:
                capabilities |= frozenset({"run:create", "run:cancel"})
            return AnalyticsPrincipal(payload["username"],
                                      capabilities,
                                      frozenset({"first-purchase-fixture"}))
        except AnalyticsError:
            raise
        except Exception:
            # Provider bodies and credentials never escape via response or exception context.
            raise _unavailable() from None

    def _request(self, authorization: str) -> bytes:
        status, body = self._http.request("GET", "/api/v1/auth/me", authorization)
        if status == 401:
            raise AnalyticsError(401, "UNAUTHENTICATED", "访问凭证无效或已失效，请重新认证。")
        if status == 403:
            raise AnalyticsError(403, "FORBIDDEN", "当前身份无权访问此服务。")
        if status != 200:
            raise _unavailable()
        return body
