"""Synthetic runtime endpoints resolve to explicit loopback origins only."""
import pytest

from backend.services.analytics.runtime import HostBridge
from backend.services.analytics.runtime_ports import bridge_origin, kernel_origin, runtime_port_base


@pytest.mark.parametrize("base", [4315, 4325, 4335])
def test_legacy_isolated_block(base):
    origin = bridge_origin({"port_base": base})
    assert HostBridge(origin, "x" * 32).origin == f"http://127.0.0.1:{base + 1}"


@pytest.mark.parametrize("base", [True, "4335", 8000, 65535, None])
def test_invalid_legacy_block(base):
    with pytest.raises(ValueError):
        runtime_port_base({"port_base": base})


def test_configured_origins_replace_the_port_block():
    config = {"base_url": "http://127.0.0.1:8000", "bridge_url": "http://127.0.0.1:8001"}
    assert kernel_origin(config) == "http://127.0.0.1:8000"
    assert bridge_origin(config) == "http://127.0.0.1:8001"
    assert runtime_port_base(config) == 8000
    assert HostBridge("http://127.0.0.1:8001", "x" * 32).origin == "http://127.0.0.1:8001"
    # An explicit origin wins over an invalid legacy block and normalizes a trailing slash.
    assert runtime_port_base({"base_url": "http://127.0.0.1:8123/", "port_base": 8000}) == 8123
    assert bridge_origin({"port_base": 4325, "bridge_url": "http://127.0.0.1:9000"}) == "http://127.0.0.1:9000"


@pytest.mark.parametrize("origin", [
    "http://localhost:4336", "https://127.0.0.1:4336", "http://127.0.0.1:4336@evil.invalid",
    "http://evil.invalid:4336", "http://127.0.0.1:4336/api", "http://127.0.0.1", "http://10.0.0.1:4336", "",
])
def test_no_arbitrary_bridge_origin(origin):
    with pytest.raises(ValueError):
        HostBridge(origin, "x" * 32)


def test_short_or_non_string_tokens_are_refused():
    for token in ("x" * 31, "", None, 42):
        with pytest.raises(ValueError):
            HostBridge("http://127.0.0.1:5000", token)
