"""Shared identity validation for the query-source and saved-analysis services."""
from typing import Protocol

from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal


class FirstPurchaseIdentityResolver(Protocol):
    """Owner-configured, bounded, uncached authentication and current grants."""

    def resolve(self, authorization: str | None) -> AnalyticsPrincipal: ...


def identity_unavailable() -> AnalyticsError:
    return AnalyticsError(503, "IDENTITY_UNAVAILABLE", "身份服务暂不可用，请稍后重试。", retryable=True)


def validate_authorization(authorization: str | None) -> str:
    if (not isinstance(authorization, str) or not authorization.startswith("Bearer ")
            or not 8 <= len(authorization) <= 1024
            or any(ord(char) < 33 or ord(char) > 126 for char in authorization[7:])):
        raise AnalyticsError(401, "UNAUTHENTICATED", "请提供有效的访问凭证。")
    return authorization


def _valid_claim(value: object) -> bool:
    return (isinstance(value, str) and 1 <= len(value) <= 128 and bool(value.strip())
            and value.isprintable())


def resolve_identity(registry: FirstPurchaseIdentityResolver, authorization: str | None) -> AnalyticsPrincipal:
    validate_authorization(authorization)
    try:
        actor = registry.resolve(authorization)
        if not isinstance(actor, AnalyticsPrincipal) or not _valid_claim(actor.actor_id):
            raise identity_unavailable()
        for grants in (actor.capabilities, actor.data_scopes):
            if (not isinstance(grants, frozenset) or len(grants) > 128
                    or any(not _valid_claim(value) for value in grants)):
                raise identity_unavailable()
        return actor
    except AnalyticsError as error:
        if error.status == 401:
            raise AnalyticsError(401, "UNAUTHENTICATED", "访问凭证无效或已失效，请重新认证。") from None
        if error.status == 403:
            raise AnalyticsError(403, "FORBIDDEN", "当前身份无权访问此服务。") from None
        raise identity_unavailable() from None
    except Exception:
        # Never expose provider bodies, URLs, credentials or exception context.
        raise identity_unavailable() from None
