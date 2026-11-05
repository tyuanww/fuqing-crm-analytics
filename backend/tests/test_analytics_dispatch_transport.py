"""P3-3d: the persisted dispatch transport and its fail-closed readers.

The transport column is additive on a v2 state file: an old row keeps the
bridge default it actually ran on and ``user_version`` stays 2. New intents
record the selected transport before any transport sees them, claim and ACP
binding read that value, and a missing/unknown recorded value refuses instead
of silently picking a path at execution time.
"""

from __future__ import annotations

import pytest

from backend.contracts.analytics import (
    AnalyticsConversationRequest,
    AnalyticsRunRequest,
)
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.jobs import (
    TRANSPORT_ACP,
    TRANSPORT_BRIDGE,
    TransportPolicy,
    _intent_transport,
)
from backend.tests.analytics_run_support import actor, make_store, sqlite_connection

SESSION = "native-session"


def native_request(key):
    return {"sessionId": SESSION, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": "合成渠道"}], "clientTimeZone": "Asia/Shanghai"}


def make_conversation(store):
    return store.create_conversation(
        actor(), "native", AnalyticsConversationRequest(), runtime_session_id=SESSION)


def accept_native(store, conversation, key):
    return store.accept(actor(), conversation.conversation_id, key,
                        AnalyticsRunRequest(question="合成渠道"), native_request=native_request(key))


def recorded_transport(store, run_id):
    with sqlite_connection(store.path) as con:
        return con.execute("SELECT transport FROM dispatch_intents WHERE run_id=?", (run_id,)).fetchone()[0]


def test_new_intents_record_the_transport_and_a_bridge_run_is_unchanged(tmp_path):
    store = make_store(tmp_path / "state")
    conversation = make_conversation(store)
    run = accept_native(store, conversation, "native-1")
    assert recorded_transport(store, run.run_id) == TRANSPORT_BRIDGE
    intent = store.claim_next(lambda _owner: actor())
    assert intent is not None and intent.transport == TRANSPORT_BRIDGE
    # The default policy owns only the bridge; an ACP-recorded row is not
    # executable here and would be fenced rather than moved to the bridge.
    assert store.transport_policy.executes(TRANSPORT_BRIDGE) is True
    assert store.transport_policy.executes(TRANSPORT_ACP) is False


def test_acp_runs_record_acp_without_changing_the_rest(tmp_path):
    store = make_store(tmp_path / "state", transport_policy=TransportPolicy(mode="acp"))
    conversation = make_conversation(store)
    run = accept_native(store, conversation, "native-1")
    assert recorded_transport(store, run.run_id) == TRANSPORT_ACP
    intent = store.claim_next(lambda _owner: actor())
    assert intent is not None and intent.transport == TRANSPORT_ACP
    assert store.bind_acp_attempt(intent.run_id, intent.attempt_id, SESSION, "acp-1", "4", 1) is True


def test_the_transport_column_is_additive_on_an_existing_v2_state_file(tmp_path):
    store = make_store(tmp_path / "state")
    conversation = make_conversation(store)
    first = accept_native(store, conversation, "native-1")
    second = accept_native(store, conversation, "native-2")
    with sqlite_connection(store.path) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 2
        before = con.execute(
            "SELECT run_id, request_id, state FROM dispatch_intents ORDER BY rowid").fetchall()
        # The exact pre-PR v2 shape: no transport column at all.
        con.execute("ALTER TABLE dispatch_intents DROP COLUMN transport")
        assert "transport" not in {
            row[1] for row in con.execute("PRAGMA table_info(dispatch_intents)").fetchall()}

    reopened = make_store(tmp_path / "state")
    with sqlite_connection(reopened.path) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 2
        columns = {row[1] for row in con.execute("PRAGMA table_info(dispatch_intents)").fetchall()}
        assert "transport" in columns
        after = con.execute(
            "SELECT run_id, request_id, state FROM dispatch_intents ORDER BY rowid").fetchall()
        assert after == before
        assert [row[0] for row in con.execute(
            "SELECT transport FROM dispatch_intents ORDER BY rowid").fetchall()] == ["bridge", "bridge"]
    # The migrated rows stay ordinary bridge work; the old evidence is intact.
    assert reopened.claim_next(lambda _owner: actor()).run_id == first.run_id
    assert reopened.get(actor(), second.run_id).status == "QUEUED"


def test_a_missing_or_unknown_transport_refuses_claim_and_binding(tmp_path):
    store = make_store(tmp_path / "state")
    conversation = make_conversation(store)
    run = accept_native(store, conversation, "native-1")
    with sqlite_connection(store.path) as con:
        # The CHECK constraint is the schema-level guard; corrupt state files
        # are the reason the reader must also refuse instead of defaulting.
        con.execute("PRAGMA ignore_check_constraints=ON")
        con.execute("UPDATE dispatch_intents SET transport='carrier-pigeon' WHERE run_id=?", (run.run_id,))
    with pytest.raises(AnalyticsError) as refused:
        store.claim_next(lambda _owner: actor())
    assert refused.value.code == "DISPATCH_TRANSPORT_INVALID"
    assert store.get(actor(), run.run_id).status == "QUEUED"

    with sqlite_connection(store.path) as con:
        con.execute("UPDATE dispatch_intents SET transport='bridge' WHERE run_id=?", (run.run_id,))
    intent = store.claim_next(lambda _owner: actor())
    with sqlite_connection(store.path) as con:
        con.execute("PRAGMA ignore_check_constraints=ON")
        con.execute("UPDATE dispatch_intents SET transport='carrier-pigeon' WHERE run_id=?", (run.run_id,))
    # ACP never prompts an attempt whose recorded path is not ACP.
    assert store.bind_acp_attempt(intent.run_id, intent.attempt_id, SESSION, "acp-1", "4", 1) is False
    with pytest.raises(AnalyticsError):
        _intent_transport(None)
    with pytest.raises(AnalyticsError):
        _intent_transport({"transport": None})


def test_a_transport_this_runtime_cannot_serve_is_fenced_not_rerouted(tmp_path):
    acp_store = make_store(tmp_path / "state", transport_policy=TransportPolicy(mode="acp"))
    run = accept_native(acp_store, make_conversation(acp_store), "native-1")
    # A rollback to the bridge runtime must never execute the recorded ACP
    # attempt on the bridge; the attempt is fenced with no side effect.
    bridge_store = make_store(tmp_path / "state")
    assert bridge_store.claim_next(lambda _owner: actor()) is None
    snapshot = bridge_store.get(actor(), run.run_id)
    assert (snapshot.status, snapshot.diagnostics.error_code) == ("FAILED", "RUNTIME_REJECTED")
    with sqlite_connection(bridge_store.path) as con:
        assert con.execute("SELECT state FROM dispatch_intents WHERE run_id=?",
                           (run.run_id,)).fetchone()[0] == "EXITED"


def test_recover_fences_an_active_run_recorded_for_another_runtime(tmp_path):
    store = make_store(tmp_path / "state")
    run = accept_native(store, make_conversation(store), "native-1")
    intent = store.claim_next(lambda _owner: actor())
    assert intent.transport == TRANSPORT_BRIDGE
    acp_store = make_store(tmp_path / "state", transport_policy=TransportPolicy(mode="acp"))
    # This process cannot observe the bridge attempt, so it must release the
    # unique slot with honest uncertainty instead of handing it to ACP.
    assert acp_store.recover() == []
    snapshot = acp_store.get(actor(), run.run_id)
    assert (snapshot.status, snapshot.diagnostics.error_code) == ("FAILED", "EXECUTION_UNKNOWN")
    assert snapshot.diagnostics.execution_active is False
