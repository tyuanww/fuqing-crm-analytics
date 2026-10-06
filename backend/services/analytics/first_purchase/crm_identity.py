"""Optional CRM /auth/me adapter. No login, password, token cache or CRM imports.

Only the first-purchase synthetic scope is granted. The service owner explicitly
selects an existing administrator; a successful identity check never admits a
candidate or configures a save policy. Default application startup stays closed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from ipaddress import ip_address
import json
import re
import socket
from time import monotonic
from urllib.parse import urlsplit

import h11

from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal

_USERNAME = re.compile(r"[A-Za-z0-9_.@-]{1,64}\Z")
_HEADER_LIMIT = 16 * 1024
_BODY_LIMIT = 4096
_WIRE_LIMIT = _HEADER_LIMIT + _BODY_LIMIT + 4096


def _unavailable():
    return AnalyticsError(503, "IDENTITY_UNAVAILABLE", "身份服务暂不可用，请稍后重试。", retryable=True)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("CRM_IDENTITY_DUPLICATE_FIELD")
        result[key] = value
    return result


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
    _address: tuple[str, int] = field(init=False, repr=False)
    _family: int = field(init=False, repr=False)
    _host_header: str = field(init=False, repr=False)

    def __post_init__(self):
        try:
            if (not isinstance(self.origin, str) or len(self.origin) > 128
                    or any(ord(c) < 33 or ord(c) > 126 for c in self.origin)):
                raise ValueError()
            url = urlsplit(self.origin)
            address = ip_address(url.hostname or "")
            if (url.scheme != "http" or not self.origin.startswith("http://")
                    or not address.is_loopback or not url.port or url.username is not None
                    or url.password is not None or url.path or url.query or url.fragment
                    or self.origin != "http://" + url.netloc or "%" in url.netloc):
                raise ValueError()
            object.__setattr__(self, "_address", (str(address), url.port))
            object.__setattr__(self, "_family", socket.AF_INET6 if address.version == 6 else socket.AF_INET)
            object.__setattr__(self, "_host_header", url.netloc)
        except (ValueError, TypeError):
            raise ValueError("CRM_IDENTITY_LOOPBACK_ORIGIN_REQUIRED") from None
        if (type(self.allowed_usernames) is not frozenset or not 1 <= len(self.allowed_usernames) <= 128
                or any(not isinstance(name, str) or not _USERNAME.fullmatch(name)
                       for name in self.allowed_usernames)):
            raise ValueError("CRM_IDENTITY_EXPLICIT_ACCOUNTS_REQUIRED")
        if type(self.timeout_seconds) not in (int, float) or not 0 < self.timeout_seconds <= 5:
            raise ValueError("CRM_IDENTITY_TIMEOUT_INVALID")

    def resolve(self, authorization: str | None) -> AnalyticsPrincipal:
        if (not isinstance(authorization, str) or not authorization.startswith("Bearer ")
                or not 8 <= len(authorization) <= 1024
                or any(ord(c) < 33 or ord(c) > 126 for c in authorization[7:])):
            raise AnalyticsError(401, "UNAUTHENTICATED", "请提供有效的访问凭证。")
        try:
            payload = json.loads(self._request(authorization).decode("utf-8"), object_pairs_hook=_unique_object)
            if (not isinstance(payload, dict) or set(payload) != {"username", "is_admin"}
                    or not isinstance(payload["username"], str) or not _USERNAME.fullmatch(payload["username"])
                    or type(payload["is_admin"]) is not bool):
                raise ValueError("CRM_IDENTITY_RESPONSE_INVALID")
            if payload["username"] not in self.allowed_usernames or not payload["is_admin"]:
                raise AnalyticsError(403, "FORBIDDEN", "当前身份无权访问此服务。")
            return AnalyticsPrincipal(payload["username"],
                                      frozenset({"run:read", "analysis:read", "analysis:save"}),
                                      frozenset({"first-purchase-fixture"}))
        except AnalyticsError:
            raise
        except Exception:
            # Provider bodies and credentials never escape via response or exception context.
            raise _unavailable() from None

    def _request(self, authorization: str) -> bytes:
        deadline = monotonic() + self.timeout_seconds
        protocol = h11.Connection(h11.CLIENT, max_incomplete_event_size=_HEADER_LIMIT)
        request = protocol.send(h11.Request(method="GET", target="/api/v1/auth/me", headers=[
            ("Host", self._host_header), ("Authorization", authorization),
            ("Accept", "application/json"), ("Accept-Encoding", "identity"), ("Connection", "close"),
        ])) + protocol.send(h11.EndOfMessage())

        def remaining():
            seconds = deadline - monotonic()
            if seconds <= 0:
                raise TimeoutError("CRM_IDENTITY_DEADLINE")
            return seconds

        with socket.socket(self._family, socket.SOCK_STREAM) as channel:
            channel.settimeout(remaining())
            channel.connect(self._address)
            channel.settimeout(remaining())
            channel.sendall(request)
            body = bytearray()
            wire_bytes = 0
            received_headers = False
            while True:
                remaining()
                event = protocol.next_event()
                if event is h11.NEED_DATA:
                    channel.settimeout(remaining())
                    data = channel.recv(4096)
                    wire_bytes += len(data)
                    if wire_bytes > _WIRE_LIMIT:
                        raise ValueError("CRM_IDENTITY_RESPONSE_LIMIT")
                    protocol.receive_data(data)
                elif isinstance(event, h11.Response):
                    header_size = len(event.reason) + 16 + sum(len(k) + len(v) + 4 for k, v in event.headers)
                    if received_headers or header_size > _HEADER_LIMIT:
                        raise ValueError("CRM_IDENTITY_HEADER_LIMIT")
                    received_headers = True
                    if event.status_code == 401:
                        raise AnalyticsError(401, "UNAUTHENTICATED", "访问凭证无效或已失效，请重新认证。")
                    if event.status_code == 403:
                        raise AnalyticsError(403, "FORBIDDEN", "当前身份无权访问此服务。")
                    if event.status_code != 200:
                        raise ValueError("CRM_IDENTITY_STATUS_INVALID")
                    types = [v.lower() for k, v in event.headers if k == b"content-type"]
                    if len(types) != 1 or types[0] not in (b"application/json", b"application/json; charset=utf-8"):
                        raise ValueError("CRM_IDENTITY_CONTENT_TYPE_INVALID")
                    if any(k == b"content-encoding" and v.lower() != b"identity" for k, v in event.headers):
                        raise ValueError("CRM_IDENTITY_ENCODING_REJECTED")
                    for key, value in event.headers:
                        if key == b"content-length" and int(value) > _BODY_LIMIT:
                            raise ValueError("CRM_IDENTITY_BODY_LIMIT")
                elif isinstance(event, h11.Data):
                    body.extend(event.data)
                    if len(body) > _BODY_LIMIT:
                        raise ValueError("CRM_IDENTITY_BODY_LIMIT")
                elif isinstance(event, h11.EndOfMessage):
                    if not received_headers or event.headers or protocol.trailing_data[0]:
                        raise ValueError("CRM_IDENTITY_RESPONSE_INVALID")
                    return bytes(body)
                else:
                    # Reject informational/upgrade responses, truncated replies and protocol pauses.
                    raise ValueError("CRM_IDENTITY_RESPONSE_INVALID")
