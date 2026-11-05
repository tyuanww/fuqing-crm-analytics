"""P3-3d family-scoped cutover and its acceptance-evidence gate.

The cutover policy is a static split: ``b0`` and ``first_purchase`` (the
kernel-owned synthetic automation families) move to ACP, while ``channel_followup``
(user chat, H5) stays on the bridge. A CP is never enabled by configuration
alone: ``build_host_transport`` and ``runtime_app`` refuse an ACP-enabling
switch until the real-host evidence root verifies.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path

import pytest

from backend.analytics_runtime import build_host_transport, runtime_app
from backend.services.analytics.acp_transport import AcpTransport
from backend.services.analytics.cutover_acceptance import (
    CutoverAcceptanceError,
    require_acceptance_evidence,
)
from backend.services.analytics.jobs import (
    TRANSPORT_ACP,
    TRANSPORT_BRIDGE,
    TransportPolicy,
)
from backend.tests.cutover_evidence import (
    evidence_config,
    now_ms,
    settle_receipt,
    write_acceptance_evidence,
    write_manifest,
)
from backend.tests.analytics_run_support import actor, make_store, synthetic_fixture
from backend.tests.test_analytics_native_runtime import Receiver
from backend.tests.test_analytics_query_jobs import make_query_store, query_accept
from backend.tests.test_analytics_query_runtime import query_config

GATEWAY = "g" * 32
CALLBACK = "c" * 32
RUNTIME = "r" * 32
SESSION = "native-session"
FIRST_PURCHASE_SNAPSHOT = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "analytics_first_purchase_v1.json")
    .read_text(encoding="utf-8")
)


def b0_config(tmp_path, *, transport="bridge", evidence=None):
    fixture = synthetic_fixture(tmp_path / "fixture")
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    os.chmod(state, 0o700)
    config = {
        "state_dir": str(state),
        "session_id": SESSION,
        "gateway_token": GATEWAY,
        "runtime_token": RUNTIME,
        "fixture": asdict(fixture),
        "transport": transport,
        "method_package_digest": "a" * 64,
    }
    if evidence is not None:
        config.update(evidence_config(evidence))
    return config


def acp_receiver(tmp_path):
    return AcpTransport(
        cwd=str(tmp_path),
        env={},
        callback_token=CALLBACK,
        spawn=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("not spawned")),
    )


def routes(app, prefix):
    found = set()
    for route in app.router.routes:
        path = getattr(route, "path", "")
        if isinstance(path, str) and path.startswith(prefix):
            for method in getattr(route, "methods", ()) or ():
                if method in {"GET", "POST"}:
                    found.add((method, path))
    return found


def native_request(key):
    return {"sessionId": SESSION, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": "合成渠道"}], "clientTimeZone": "Asia/Shanghai"}


def recorded_transport(store, run_id):
    from backend.tests.analytics_run_support import sqlite_connection
    with sqlite_connection(store.path) as con:
        return con.execute("SELECT transport FROM dispatch_intents WHERE run_id=?", (run_id,)).fetchone()[0]


# ---------------------------------------------------------------------------
# Family-scoped selection
# ---------------------------------------------------------------------------


def test_cutover_routes_only_automation_families_to_acp():
    policy = TransportPolicy.from_config({"transport": "cutover"})

    assert policy.select("b0", "native-1") == ("acp", "mode=cutover")
    assert policy.select("first_purchase", "native-1") == ("acp", "mode=cutover")
    # H5 applies before the cutover split: query never reaches ACP.
    assert policy.select("channel_followup", "native-1") == ("bridge", "query_family_bridge_only")
    assert policy.transports_for("b0") == frozenset({TRANSPORT_ACP})
    assert policy.transports_for("first_purchase") == frozenset({TRANSPORT_ACP})
    assert policy.transports_for("channel_followup") == frozenset({TRANSPORT_BRIDGE})
    assert policy.executes("acp", "b0") is True
    assert policy.executes("bridge", "b0") is False
    assert policy.executes("bridge", "channel_followup") is True
    assert policy.executes("acp", "channel_followup") is False
    # A family-scoped policy cannot answer without the family.
    with pytest.raises(ValueError, match="cutover transport requires"):
        policy.executes("acp")


def test_cutover_does_not_change_the_default_bridge():
    default = TransportPolicy.from_config({})
    assert default.mode == TRANSPORT_BRIDGE
    assert default.transports_for("b0") == frozenset({TRANSPORT_BRIDGE})
    assert default.select("b0", "native-1") == ("bridge", "mode=bridge")


def test_cutover_policy_records_the_routed_transport(tmp_path):
    b0_store = make_store(tmp_path / "b0", family="b0",
                          transport_policy=TransportPolicy.from_config({"transport": "cutover"}))
    conv = b0_store.create_conversation(actor(), "native", _conversation_request(),
                                        runtime_session_id=SESSION)
    from backend.contracts.analytics import AnalyticsRunRequest
    b0_run = b0_store.accept(actor(), conv.conversation_id, "native-b0", AnalyticsRunRequest(question="合成渠道"),
                             native_request=native_request("native-b0"))
    assert recorded_transport(b0_store, b0_run.run_id) == "acp"

    query_store = make_query_store(
        tmp_path / "query", transport_policy=TransportPolicy.from_config({"transport": "cutover"}))
    query_run = query_accept(query_store)
    assert recorded_transport(query_store, query_run.run_id) == "bridge"


def test_default_b0_runtime_still_mounts_only_bridge_callbacks(tmp_path):
    app = runtime_app(b0_config(tmp_path), bridge=Receiver())
    assert routes(app, "/internal/native/") == {
        ("GET", "/internal/native/context"),
        ("POST", "/internal/native/fixture"),
        ("POST", "/internal/native/prompt"),
        ("POST", "/internal/native/run-context"),
    }
    assert routes(app, "/internal/acp/") == set()


# ---------------------------------------------------------------------------
# Acceptance-evidence gate
# ---------------------------------------------------------------------------


def test_cutover_refuses_without_acceptance_evidence():
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0"})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_NOT_CONFIGURED"


def test_acp_transport_also_refuses_without_acceptance_evidence(tmp_path):
    config = {"transport": "acp", "acp_cwd": str(tmp_path), "state_dir": str(tmp_path / "state"),
              "runtime_token": RUNTIME}
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport(config)
    assert refused.value.code == "CUTOVER_ACCEPTANCE_NOT_CONFIGURED"


def test_cutover_refuses_a_missing_evidence_root(tmp_path):
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0",
                              "acceptance_evidence_dir": str(tmp_path / "missing")})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_ROOT_MISSING"


def test_cutover_refuses_an_untrusted_manifest(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root)
    (root / "04-normal" / "settle.json").write_text(
        (root / "04-normal" / "settle.json").read_text(encoding="utf-8") + "\n", encoding="utf-8")
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0", **evidence_config(root)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_DIGEST_MISMATCH"


def test_cutover_refuses_a_malformed_manifest(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root)
    (root / "MANIFEST.sha256").write_text("not a manifest\n", encoding="utf-8")
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0", **evidence_config(root)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_MANIFEST_INVALID"


def test_cutover_refuses_a_missing_settle_receipt(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root)
    write_manifest(root, omit=("05-cancel/settle.json",))
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0", **evidence_config(root)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_RECEIPT_MISSING"


def test_cutover_refuses_a_receipt_that_no_longer_parses(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root)
    (root / "04-normal" / "settle.json").write_text("{not json", encoding="utf-8")
    write_manifest(root)
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0", **evidence_config(root)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_RECEIPT_INVALID"


def test_cutover_refuses_a_listed_file_that_is_missing(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root)
    (root / "04c-shutdown" / "reaped.txt").unlink()
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0", **evidence_config(root)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_FILE_MISSING"


def test_cutover_refuses_stale_evidence(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root, updated_ms=now_ms() - 25 * 60 * 60 * 1000)
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0",
                              **evidence_config(root, max_age_hours=24)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_STALE"


def test_cutover_refuses_inconsistent_settle_metadata(tmp_path):
    root = tmp_path / "evidence"
    write_acceptance_evidence(root)
    bad = settle_receipt(status="FAILED", error_code=None, binding="SETTLED")
    (root / "04-normal" / "settle.json").write_text(
        json.dumps(bad, indent=2, sort_keys=True), encoding="utf-8")
    write_manifest(root)
    with pytest.raises(CutoverAcceptanceError) as refused:
        build_host_transport({"transport": "cutover", "family": "b0", **evidence_config(root)})
    assert refused.value.code == "CUTOVER_ACCEPTANCE_RECEIPT_INVALID"


def test_cutover_accepts_verified_evidence(tmp_path):
    root = write_acceptance_evidence(tmp_path / "evidence")
    evidence = require_acceptance_evidence(evidence_config(root))
    assert evidence.root == root.resolve()
    assert evidence.files and "04-normal/settle.json" in evidence.files

    config = {"transport": "cutover", "family": "b0", "acp_cwd": str(tmp_path),
              "state_dir": str(tmp_path / "state"), **evidence_config(root)}
    host = build_host_transport(config)
    try:
        assert isinstance(host, AcpTransport)
    finally:
        host.close()


# ---------------------------------------------------------------------------
# Route split: cutover keeps the query family on the bridge
# ---------------------------------------------------------------------------


def test_b0_cutover_needs_only_gateway_and_retires_bridge_callbacks(tmp_path):
    evidence = write_acceptance_evidence(tmp_path / "evidence")
    receiver = acp_receiver(tmp_path)
    try:
        app = runtime_app(b0_config(tmp_path, transport="cutover", evidence=evidence), bridge=receiver)
        assert routes(app, "/internal/native/") == {
            ("GET", "/internal/native/context"),
            ("POST", "/internal/native/prompt"),
        }
        assert routes(app, "/internal/acp/") == {
            ("POST", "/internal/acp/run-context"),
            ("POST", "/internal/acp/tool-call"),
        }
    finally:
        receiver.close()


def test_query_cutover_keeps_every_bridge_callback_and_mounts_no_acp_route(tmp_path):
    config = query_config(tmp_path)
    config["transport"] = "cutover"
    app = runtime_app(config, bridge=Receiver())
    assert ("POST", "/internal/native/channel-followup") in routes(app, "/internal/native/")
    assert ("POST", "/internal/native/run-context") in routes(app, "/internal/native/")
    assert routes(app, "/internal/acp/") == set()


def test_first_purchase_cutover_retires_bridge_tool_callbacks(tmp_path):
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    os.chmod(state, 0o700)
    evidence = write_acceptance_evidence(tmp_path / "evidence")
    config = {
        "state_dir": str(state),
        "session_id": "session-first-purchase",
        "gateway_token": GATEWAY,
        "snapshot": FIRST_PURCHASE_SNAPSHOT,
        "method_package_digest": "b" * 64,
        "family": "first_purchase",
        "identity_mode": "synthetic",
        "transport": "cutover",
        **evidence_config(evidence),
    }
    receiver = acp_receiver(tmp_path)
    try:
        app = runtime_app(config, bridge=receiver)
        assert routes(app, "/internal/native/") == {
            ("GET", "/internal/native/context"),
            ("POST", "/internal/native/first-purchase/cancel"),
            ("POST", "/internal/native/prompt"),
        }
        assert routes(app, "/internal/acp/") == {
            ("POST", "/internal/acp/run-context"),
            ("POST", "/internal/acp/tool-call"),
        }
    finally:
        receiver.close()


def test_first_purchase_cutover_keeps_bridge_only_for_crm_identity(tmp_path):
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    os.chmod(state, 0o700)
    evidence = write_acceptance_evidence(tmp_path / "evidence")
    host = build_host_transport({
        "transport": "cutover",
        "family": "first_purchase",
        "identity_mode": "crm-session",
        "state_dir": str(state),
        "acp_cwd": str(tmp_path),
        "bridge_url": "http://127.0.0.1:5001",
        "runtime_token": RUNTIME,
        **evidence_config(evidence),
    })
    from backend.services.analytics.runtime import HostBridge
    from backend.services.analytics.transport import RoutedTransport
    try:
        assert isinstance(host, RoutedTransport)
        assert isinstance(host.bridge, HostBridge)
        assert isinstance(host.acp, AcpTransport)
        # The explicit availability predicate stays intact.
        assert host.canary_available is True
    finally:
        host.close()


def _conversation_request():
    from backend.contracts.analytics import AnalyticsConversationRequest
    return AnalyticsConversationRequest()
