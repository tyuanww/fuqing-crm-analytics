"""Explicit loopback runtime origins for the isolated synthetic runners.

P3-2 replaces the three-entry port allowlist with a configured origin: the
deployment passes `base_url` (kernel) and `bridge_url` (Host bridge) in the
runtime setup, matching the plugin `Config`. The legacy `port_base` block stays
as the transitional fallback so existing B0 harness invocations keep working.
`bridge_origin` keeps its +1 derivation only for that legacy path.

The security property that remains: a configured origin must be a bare
`http://127.0.0.1:<port>` root. Remote hosts, TLS, credentials, paths, queries
and fragments are rejected before any bearer token is sent.
"""

from urllib.parse import urlsplit

HOST = "127.0.0.1"
LEGACY_PORT_BASES = (4315, 4325, 4335)


def loopback_origin(value, name):
    """Validate and normalize one explicit loopback origin."""
    if not isinstance(value, str) or not value or len(value) > 128:
        raise ValueError(f"{name} must be a bare http://127.0.0.1 origin")
    parts = urlsplit(value)
    if parts.scheme != "http" or parts.hostname != HOST or parts.username is not None or parts.password is not None \
            or parts.path not in ("", "/") or parts.query or parts.fragment:
        raise ValueError(f"{name} must be a bare http://127.0.0.1 origin")
    if parts.port is None or not 1 <= parts.port <= 65535:
        raise ValueError(f"{name} must name an explicit loopback port")
    return f"http://{HOST}:{parts.port}"


def runtime_port_base(config):
    """Bind/derive port. An explicit base_url owns the port; else the legacy block."""
    explicit = config.get("base_url")
    if explicit is not None:
        return urlsplit(loopback_origin(explicit, "base_url")).port
    value = config.get("port_base", 4315)
    if type(value) is not int or value not in LEGACY_PORT_BASES:
        raise ValueError("invalid isolated analytics port block")
    return value


def kernel_origin(config):
    explicit = config.get("base_url")
    if explicit is not None:
        return loopback_origin(explicit, "base_url")
    return f"http://{HOST}:{runtime_port_base(config)}"


def bridge_origin(config):
    explicit = config.get("bridge_url")
    if explicit is not None:
        return loopback_origin(explicit, "bridge_url")
    return f"http://{HOST}:{runtime_port_base(config) + 1}"
