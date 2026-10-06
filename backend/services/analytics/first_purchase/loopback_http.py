"""Bounded domain HTTP transport. Literal loopback only; no proxy, redirect or retry."""
from dataclasses import dataclass, field
from ipaddress import ip_address
import socket
from time import monotonic
from urllib.parse import urlsplit

import h11

HEADER_LIMIT = 16 * 1024


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("HTTP_DUPLICATE_FIELD")
        result[key] = value
    return result


@dataclass(frozen=True)
class LoopbackHTTP:
    origin: str
    timeout_seconds: float
    body_limit: int
    _address: tuple[str, int] = field(init=False, repr=False)
    _family: int = field(init=False, repr=False)
    _host: str = field(init=False, repr=False)

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
            object.__setattr__(self, "_host", url.netloc)
        except (ValueError, TypeError):
            raise ValueError("LOOPBACK_ORIGIN_REQUIRED") from None
        if type(self.timeout_seconds) not in (int, float) or not 0 < self.timeout_seconds <= 5:
            raise ValueError("TIMEOUT_INVALID")
        if type(self.body_limit) is not int or not 1 <= self.body_limit <= 512 * 1024:
            raise ValueError("BODY_LIMIT_INVALID")

    def request(self, method: str, target: str, authorization: str, body: bytes = b"") -> tuple[int, bytes]:
        # Paths/methods are constants owned by adapters, not browser input.
        deadline = monotonic() + self.timeout_seconds
        protocol = h11.Connection(h11.CLIENT, max_incomplete_event_size=HEADER_LIMIT)
        headers = [("Host", self._host), ("Authorization", authorization), ("Accept", "application/json"),
                   ("Accept-Encoding", "identity"), ("Connection", "close")]
        if body:
            headers += [("Content-Type", "application/json"), ("Content-Length", str(len(body)))]
        wire = protocol.send(h11.Request(method=method, target=target, headers=headers))
        if body:
            wire += protocol.send(h11.Data(data=body))
        wire += protocol.send(h11.EndOfMessage())

        def remaining():
            seconds = deadline - monotonic()
            if seconds <= 0:
                raise TimeoutError("HTTP_DEADLINE")
            return seconds

        with socket.socket(self._family, socket.SOCK_STREAM) as channel:
            channel.settimeout(remaining())
            channel.connect(self._address)
            channel.settimeout(remaining())
            channel.sendall(wire)
            response = bytearray()
            wire_bytes, status = 0, None
            while True:
                remaining()
                event = protocol.next_event()
                if event is h11.NEED_DATA:
                    channel.settimeout(remaining())
                    data = channel.recv(4096)
                    wire_bytes += len(data)
                    if wire_bytes > HEADER_LIMIT + self.body_limit + 4096:
                        raise ValueError("HTTP_RESPONSE_LIMIT")
                    protocol.receive_data(data)
                elif isinstance(event, h11.Response):
                    header_size = len(event.reason) + 16 + sum(len(k) + len(v) + 4 for k, v in event.headers)
                    if status is not None or header_size > HEADER_LIMIT:
                        raise ValueError("HTTP_HEADER_LIMIT")
                    status = event.status_code
                    if status != 200:
                        return status, b""  # Never retain or reflect untrusted error bodies.
                    types = [v.lower() for k, v in event.headers if k == b"content-type"]
                    if len(types) != 1 or types[0] not in (b"application/json", b"application/json; charset=utf-8"):
                        raise ValueError("HTTP_CONTENT_TYPE_INVALID")
                    if any(k == b"content-encoding" and v.lower() != b"identity" for k, v in event.headers):
                        raise ValueError("HTTP_ENCODING_REJECTED")
                    for key, value in event.headers:
                        if key == b"content-length" and int(value) > self.body_limit:
                            raise ValueError("HTTP_BODY_LIMIT")
                elif isinstance(event, h11.Data):
                    response.extend(event.data)
                    if len(response) > self.body_limit:
                        raise ValueError("HTTP_BODY_LIMIT")
                elif isinstance(event, h11.EndOfMessage):
                    if status is None or event.headers or protocol.trailing_data[0]:
                        raise ValueError("HTTP_RESPONSE_INVALID")
                    return status, bytes(response)
                else:
                    raise ValueError("HTTP_RESPONSE_INVALID")
