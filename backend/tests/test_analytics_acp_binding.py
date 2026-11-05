"""P3-3d preparation: the persisted ACP session/attempt binding.

The binding is the second no-double-dispatch fence from the design: one row per
``(run_id, attempt_id)``, a BOUND -> SETTLED | LOST CAS cell, and a kernel
restart that fences every unsettled binding instead of silently re-dispatching
the old attempt. These tests use the real SQLite store, not a mock.
"""

from __future__ import annotations

import pytest

from backend.contracts.analytics import (
    AnalyticsConversationRequest,
    AnalyticsRunRequest,
)
from backend.services.analytics.jobs import ExecutionObservation
from backend.tests.analytics_run_support import (
    actor,
    make_store,
    sqlite_connection,
    successful_step,
)

SESSION = "native-session"


def native_request(key="native-1"):
    return {"sessionId": SESSION, "requestId": key, "mode": "queue",
            "content": [{"type": "text", "text": "合成渠道"}], "clientTimeZone": "Asia/Shanghai"}


def bound_run(tmp_path):
    store = make_store(tmp_path / "state")
    conversation = store.create_conversation(
        actor(), "native", AnalyticsConversationRequest(), runtime_session_id=SESSION,
    )
    run = store.accept(actor(), conversation.conversation_id, "native-1",
                       AnalyticsRunRequest(question="合成渠道"), native_request=native_request())
    return store, run


def bind(store, intent, *, acp_session="acp-session-1", rpc="4"):
    return store.bind_acp_attempt(intent.run_id, intent.attempt_id, intent.session_id,
                                  acp_session, rpc, 1)


def test_binding_is_unique_per_attempt_and_the_state_cell_is_one_way(tmp_path):
    store, _run = bound_run(tmp_path)
    intent = store.claim_next(lambda _owner: actor())

    assert bind(store, intent) is True
    # The design's second fence: a second transport/path cannot bind the attempt.
    assert bind(store, intent, acp_session="acp-session-2") is False
    binding = store.acp_binding(intent.run_id, intent.attempt_id)
    assert (binding.session_id, binding.acp_session_id, binding.prompt_rpc_id, binding.generation) == (
        SESSION, "acp-session-1", "4", 1)
    assert binding.state == "BOUND"

    assert store.settle_acp_binding(intent.run_id, intent.attempt_id, "SETTLED") is True
    assert store.acp_binding(intent.run_id, intent.attempt_id).state == "SETTLED"
    assert store.settle_acp_binding(intent.run_id, intent.attempt_id, "SETTLED") is True
    assert store.settle_acp_binding(intent.run_id, intent.attempt_id, "LOST") is False
    with pytest.raises(ValueError):
        store.settle_acp_binding(intent.run_id, intent.attempt_id, "BOUND")


def test_binding_requires_a_live_attempt_and_valid_correlation(tmp_path):
    store, _run = bound_run(tmp_path)
    # Still QUEUED (no active slot): dispatching never happened, so binding is
    # a programming error rather than a legitimate recovery record.
    with pytest.raises(ValueError):
        store.bind_acp_attempt("run_missing", "attempt_missing", SESSION, "acp-session", "1", 0)
    intent = store.claim_next(lambda _owner: actor())
    for bad in ("", None, "x" * 201):
        with pytest.raises(ValueError):
            store.bind_acp_attempt(intent.run_id, intent.attempt_id, bad, "acp-session", "1", 1)
        with pytest.raises(ValueError):
            store.bind_acp_attempt(intent.run_id, intent.attempt_id, SESSION, bad, "1", 1)
    with pytest.raises(ValueError):
        store.bind_acp_attempt(intent.run_id, intent.attempt_id, SESSION, "acp-session", "1", -1)
    with pytest.raises(ValueError):
        store.bind_acp_attempt(intent.run_id, intent.attempt_id, SESSION, "acp-session", "1", True)


def test_kernel_restart_fences_unsettled_bindings_as_lost_and_keeps_the_slot(tmp_path):
    store, _run = bound_run(tmp_path)
    intent = store.claim_next(lambda _owner: actor())
    assert bind(store, intent) is True

    # A new RunStore on the same directory is exactly what a kernel restart
    # sees; its recover() must fence the unsettled binding, not forget it.
    fresh = make_store(tmp_path / "state")
    recovered = fresh.recover()
    assert [row.attempt_id for row in recovered] == [intent.attempt_id]
    binding = fresh.acp_binding(intent.run_id, intent.attempt_id)
    assert binding.state == "LOST"
    # The unique active slot is retained; the old attempt is never claimed again.
    assert fresh.claim_next(lambda _owner: actor()) is None
    assert bind(fresh, intent, acp_session="acp-session-2") is False


def test_terminal_observe_settles_the_binding_and_unknown_keeps_it_bound(tmp_path):
    store, run = bound_run(tmp_path)
    intent = store.claim_next(lambda _owner: actor())
    assert bind(store, intent) is True
    step = successful_step(store, intent)
    unsettled = ExecutionObservation(intent.run_id, intent.attempt_id, intent.session_id,
                                     intent.request_id, False, "UNKNOWN")
    store.observe(actor(), unsettled)
    assert store.get(actor(), run.run_id).status == "UNKNOWN"
    assert store.acp_binding(intent.run_id, intent.attempt_id).state == "BOUND"

    settled = ExecutionObservation(intent.run_id, intent.attempt_id, intent.session_id,
                                   intent.request_id, True, "SUCCEEDED", step.step_id)
    snapshot = store.observe(actor(), settled)
    assert snapshot.status == "SUCCEEDED"
    assert store.acp_binding(intent.run_id, intent.attempt_id).state == "SETTLED"


def test_a_persisted_binding_blocks_redispatch_even_if_the_run_is_queued(tmp_path):
    store, run = bound_run(tmp_path)
    # Simulate a recovered data file that still says QUEUED while a binding
    # proves the attempt already left the kernel. The claim must fence it.
    with sqlite_connection(store.path) as con:
        attempt_id = con.execute("SELECT attempt_id FROM runs WHERE run_id=?", (run.run_id,)).fetchone()[0]
        con.execute("INSERT INTO acp_bindings VALUES (?, ?, ?, ?, ?, 1, 'BOUND', 1, 1)",
                    (run.run_id, attempt_id, SESSION, "acp-old", "1"))
    assert store.claim_next(lambda _owner: actor()) is None
    snapshot = store.get(actor(), run.run_id)
    assert (snapshot.status, snapshot.diagnostics.error_code) == ("FAILED", "EXECUTION_UNKNOWN")
    assert snapshot.diagnostics.execution_active is False


def test_the_binding_table_is_additive_on_an_existing_v2_state_file(tmp_path):
    store, _run = bound_run(tmp_path)
    with sqlite_connection(store.path) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 2
        con.execute("DROP TABLE acp_bindings")
    # Reopening a v2 store without the table must create it without touching
    # user_version, the profile hash or any existing evidence.
    reopened = make_store(tmp_path / "state")
    with sqlite_connection(reopened.path) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 2
        tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert "acp_bindings" in tables
    assert reopened.acp_binding("run_missing", "attempt_missing") is None
