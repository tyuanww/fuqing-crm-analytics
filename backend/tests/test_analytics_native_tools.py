"""P3-2: the backend mounts exactly the kernel surfaces in the shared binding table."""

from __future__ import annotations

import copy
import os
from dataclasses import asdict

import pytest

from backend.analytics_first_purchase_native import (
    FirstPurchaseNativeContextRequest,
    FirstPurchaseNativeStep,
)
from backend.analytics_runtime import (
    AcpContextRequest,
    AcpToolCall,
    NativeContextRequest,
    NativePrompt,
    NativeStep,
    QueryNativeStep,
    runtime_app,
)
from backend.contracts.analytics_first_purchase_kernel import (
    FirstPurchaseNativePrompt,
    FirstPurchaseNativeReceipt,
)
from backend.contracts.analytics_query_run import AnalyticsQueryNativePrompt, AnalyticsQueryNativeReceipt
from backend.services.analytics.native_tools import (
    KERNEL_FAMILIES,
    assert_native_routes,
    bridge_surfaces,
    kernel_surfaces,
    load_native_tools,
    mounted_kernel_routes,
    surface_models,
    validate_native_tools,
)
from backend.services.analytics.runtime import BRIDGE_OPERATIONS, HostBridge
from backend.tests.analytics_run_support import synthetic_fixture
from backend.tests.test_analytics_first_purchase_native import native_app
from backend.tests.test_analytics_native_runtime import Receiver
from backend.tests.test_analytics_query_runtime import query_config

GATEWAY = "g" * 40
RUNTIME = "r" * 40
MODELS = {
    "AcpContextRequest": AcpContextRequest,
    "AcpToolCall": AcpToolCall,
    "NativeContextRequest": NativeContextRequest,
    "NativeStep": NativeStep,
    "NativePrompt": NativePrompt,
    "QueryNativeStep": QueryNativeStep,
    "AnalyticsQueryNativePrompt": AnalyticsQueryNativePrompt,
    "AnalyticsQueryNativeReceipt": AnalyticsQueryNativeReceipt,
    "FirstPurchaseNativeContextRequest": FirstPurchaseNativeContextRequest,
    "FirstPurchaseNativeStep": FirstPurchaseNativeStep,
    "FirstPurchaseNativePrompt": FirstPurchaseNativePrompt,
    "FirstPurchaseNativeReceipt": FirstPurchaseNativeReceipt,
}


def b0_config(tmp_path):
    tmp_path.mkdir(mode=0o700, parents=True, exist_ok=True)
    fixture = synthetic_fixture(tmp_path / "fixture")
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    os.chmod(state, 0o700)
    return {"state_dir": str(state), "session_id": "native-session", "gateway_token": GATEWAY,
            "runtime_token": RUNTIME, "fixture": asdict(fixture)}


def family_apps(tmp_path):
    for name in ("b0", "query", "first-purchase"):
        (tmp_path / name).mkdir(mode=0o700, parents=True, exist_ok=True)
    return {
        "b0": runtime_app(b0_config(tmp_path / "b0"), bridge=Receiver()),
        "channel_followup": runtime_app(query_config(tmp_path / "query"), bridge=Receiver()),
        "first_purchase": native_app(tmp_path / "first-purchase"),
    }


def test_table_is_valid_and_scoped(tmp_path):
    table = load_native_tools()
    assert table["schema_version"] == "analytics-native-tools/v2"
    assert set(KERNEL_FAMILIES) == {"b0", "channel_followup", "first_purchase"}
    assert [(method, path) for method, path in bridge_surfaces(table)] == [
        ("POST", "/cancel"), ("POST", "/dispatch"), ("POST", "/health"),
        ("POST", "/identity"), ("POST", "/observe"),
    ]
    for family in KERNEL_FAMILIES:
        routes = kernel_surfaces(table, family)
        assert routes, family
        assert all(method in {"GET", "POST"} and path.startswith("/internal/native/") for method, path in routes)
    assert kernel_surfaces(table, "b0") == (("GET", "/internal/native/context"), ("POST", "/internal/native/fixture"),
                                             ("POST", "/internal/native/prompt"), ("POST", "/internal/native/run-context"))
    assert kernel_surfaces(table, "b0", {"acp"}) == (
        ("POST", "/internal/acp/run-context"),
        ("POST", "/internal/acp/tool-call"),
    )
    assert kernel_surfaces(table, "b0", {"gateway"}) == (
        ("GET", "/internal/native/context"),
        ("POST", "/internal/native/prompt"),
    )
    assert kernel_surfaces(table, "channel_followup", {"acp"}) == ()


def test_schema_v1_is_refused_because_transport_is_mandatory(tmp_path):
    table = copy.deepcopy(load_native_tools())
    table["schema_version"] = "analytics-native-tools/v1"
    with pytest.raises(ValueError, match="NATIVE_TOOLS_SCHEMA_V1_REFUSED"):
        validate_native_tools(table)


def test_a_surface_without_a_transport_is_refused(tmp_path):
    table = copy.deepcopy(load_native_tools())
    del table["surfaces"][0]["transport"]
    with pytest.raises(ValueError, match="surface transport"):
        validate_native_tools(table)


def test_an_acp_surface_must_live_under_the_acp_prefix(tmp_path):
    table = copy.deepcopy(load_native_tools())
    for surface in table["surfaces"]:
        if surface["transport"] == "acp":
            surface["path"] = "/internal/native/wrong"
            break
    with pytest.raises(ValueError, match="kernel surface"):
        validate_native_tools(table)


def test_every_family_mounts_exactly_the_documented_kernel_routes(tmp_path):
    for family, app in family_apps(tmp_path).items():
        assert mounted_kernel_routes(app) == set(kernel_surfaces(load_native_tools(), family)), family
        assert_native_routes(app, family)


def test_undeclared_kernel_routes_fail_closed(tmp_path):
    app = family_apps(tmp_path)["b0"]
    app.add_api_route("/internal/native/rogue", lambda: {"ok": True}, methods=["POST"])
    with pytest.raises(ValueError, match="native route contract mismatch"):
        assert_native_routes(app, "b0")
    with pytest.raises(ValueError, match="native route contract mismatch"):
        assert_native_routes(app, "channel_followup")


def test_documented_request_and_receipt_models_keep_the_wire_fields():
    table = load_native_tools()
    for surface in table["surfaces"]:
        if surface["side"] != "kernel":
            continue
        request = surface.get("request")
        if request is not None:
            for family, model in (request.get("models") or {}).items():
                if model is None:  # documented raw-dict payload, no Pydantic envelope
                    continue
                assert model in MODELS, f"{surface['id']} {family} model {model}"
                assert set(MODELS[model].model_fields) == set(request["fields"]), f"{surface['id']} {family}"
        response = surface.get("response")
        if response is not None:
            for family, model in (response.get("models") or {}).items():
                if model is None:
                    continue
                assert set(MODELS[model].model_fields) == set(response["fields"]), f"{surface['id']} {family}"
        # A surface without a model (raw dict receipt) still has no model fields to check.
        for family in surface["families"]:
            request_model, response_model = surface_models(table, surface["id"], family)
            assert request_model in {None, *MODELS}, f"{surface['id']} {family} request"
            assert response_model in {None, *MODELS}, f"{surface['id']} {family} response"


def test_bridge_client_only_calls_documented_operations():
    # runtime.py ships in the standalone first-purchase kernel file list, so it
    # cannot import the table at runtime; this check keeps the two in sync.
    assert BRIDGE_OPERATIONS == {path.lstrip("/") for _method, path in bridge_surfaces(load_native_tools())}
    bridge = HostBridge("http://127.0.0.1:5000", "x" * 32)
    assert bridge.origin == "http://127.0.0.1:5000"
    with pytest.raises(ValueError, match="unsupported bridge operation"):
        bridge.call("rogue", {})
