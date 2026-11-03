from copy import deepcopy
import io
import json
import sqlite3
from types import SimpleNamespace

import pytest
from starlette.datastructures import Headers

from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.native_page_source import NativePageSource, source_error
from backend.services.analytics.page_context import PageRequestContext
from backend.services.analytics.first_purchase.asset_state import now_ms
from backend.tests.test_native_page_source import actor, source_value, editable_page, post
from backend.tests.test_native_page_source import native as native


@pytest.fixture
def batch():
    source = NativePageSource("http://127.0.0.1:18192")
    refs = tuple(f"crm_ref_{index:032x}" for index in range(35))
    original = source_value()
    state = {"values": {ref: {**deepcopy(original), "ref": ref} for ref in refs},
             "many": [], "single": 0, "error": None}

    def remote(operation, **fields):
        if operation == "assertActive":
            return {"active": True}
        state["single"] += 1
        return deepcopy(state["values"][fields["ref"]])

    def many(session, selected):
        state["many"].append(selected)
        if state["error"]:
            raise source_error(*state["error"])
        values = [deepcopy(state["values"][ref]) for ref in selected]
        return source._batch_values({"values": values}, session, selected)

    context = PageRequestContext(actor(), now_ms() + 10000, remote, remote_many=many)
    return source, context, state, refs


def test_prefetch_reuses_only_current_request_and_revalidation_reads_every_source_again(batch):
    source, context, state, refs = batch
    selected = refs[:7]
    context.prefetch("native-session", selected)
    for ref in selected:
        value = source.read(context, "native-session", ref)
        assert value.rows[0]["amount_fen"] == 8001
    assert state["single"] == 0 and state["many"] == [selected]
    context.revalidate()
    assert state["many"] == [selected, selected]
    for ref in selected:
        state["values"][ref]["epoch"] = "changed"
    with pytest.raises(AnalyticsError) as denied:
        context.revalidate()
    assert denied.value.code == "RESULT_STALE"
    assert all(value["epoch"] == "epoch1" for value in context.observations.values())


def test_prefetch_and_revalidation_split_existing_large_manifests_into_bounded_batches(batch):
    _, context, state, refs = batch
    context.prefetch("native-session", refs)
    assert [len(selected) for selected in state["many"]] == [16, 16, 3]
    context.revalidate()
    assert [len(selected) for selected in state["many"]] == [16, 16, 3, 16, 16, 3]


def test_request_deadline_stops_before_the_next_batch(batch, monkeypatch):
    _, context, state, refs = batch
    clock = {"now": 1}
    monkeypatch.setattr("backend.services.analytics.page_context.now_ms", lambda: clock["now"])
    context.deadline_ms = 100
    original = context.remote_many

    def elapsed(session, selected):
        values = original(session, selected)
        clock["now"] = 101
        return values

    context.remote_many = elapsed
    with pytest.raises(AnalyticsError) as denied:
        context.prefetch("native-session", refs)
    assert denied.value.code == "SOURCE_UNAVAILABLE"
    assert len(state["many"]) == 1


@pytest.mark.parametrize("damage", ["missing", "duplicate", "extra", "session", "generation", "epoch", "epoch-type", "generation-type"])
def test_batch_callback_rejects_an_incomplete_or_mixed_result_set(batch, damage):
    source, _, state, refs = batch
    selected = refs[:2]
    values = [deepcopy(state["values"][ref]) for ref in selected]
    if damage == "missing":
        values.pop()
    elif damage == "duplicate":
        values[1] = values[0]
    elif damage == "extra":
        values[1]["ref"] = refs[2]
    elif damage == "session":
        values[1]["identity"]["native_session_id"] = "other-session"
    elif damage == "generation":
        values[1]["identity"]["connection_generation"] = "replacement"
    elif damage == "epoch":
        values[1]["epoch"] = "replacement"
    elif damage == "epoch-type":
        for value in values:
            value["epoch"] = {}
    else:
        for value in values:
            value["identity"]["connection_generation"] = {}
    with pytest.raises(AnalyticsError) as denied:
        source._batch_values({"values": values}, "native-session", selected)
    assert denied.value.code == "SOURCE_UNAVAILABLE"


def test_prefetch_cannot_bypass_late_source_failure_when_confirming_a_page(native, batch):
    client, app, _ = native
    _, context, state, refs = batch
    spec = editable_page(client)
    made = post(client, f"page-documents/pages/{spec['page_id']}/patch-preview",
                json={"base_version": 1, "title": "批量来源确认"})
    assert made.status_code == 201, made.text
    original = context.remote_many
    state["values"]["crm_ref_" + "a" * 32] = deepcopy(next(iter(state["values"].values())))
    state["values"]["crm_ref_" + "a" * 32]["ref"] = "crm_ref_" + "a" * 32

    def fail_after_prefetch(session, selected):
        if state["many"]:
            raise source_error(503, "SOURCE_UNAVAILABLE")
        return original(session, selected)

    context.remote_many = fail_after_prefetch
    with pytest.raises(AnalyticsError) as denied:
        app.state.page_store.confirm(actor(), made.json()["preview_id"], "late-batch", source_context=context)
    assert denied.value.code == "SOURCE_UNAVAILABLE"
    with sqlite3.connect(app.state.page_store.path) as con:
        assert con.execute("SELECT version FROM heads WHERE page_id=?", (spec["page_id"],)).fetchone()[0] == 1
        assert con.execute("SELECT COUNT(*) FROM receipts WHERE key='late-batch'").fetchone()[0] == 0


@pytest.mark.parametrize("maximum", [None, 16, 0, 17, "16", 16.0, True])
def test_batch_is_enabled_only_by_the_explicit_host_capability(maximum):
    source = NativePageSource("http://127.0.0.1:18192")
    grant = {"actor_id": actor().actor_id, "capabilities": sorted(actor().capabilities),
             "data_scopes": sorted(actor().data_scopes), "deadline_ms": now_ms() + 10000}
    if maximum is not None:
        grant["source_batch_max"] = maximum

    class Transport:
        def open(self, *_args, **_kwargs):
            return io.BytesIO(json.dumps(grant).encode())

    source.opener = Transport()
    request = SimpleNamespace(headers=Headers({"x-native-page-lease": "a" * 64}), method="POST",
        state=SimpleNamespace(page_body_sha256="b" * 64), url=SimpleNamespace(path="/private", query=""))
    if maximum is None or type(maximum) is int and maximum == 16:
        context = source.authenticate(request)
        assert (context.remote_many is not None) == (maximum == 16)
    else:
        with pytest.raises(AnalyticsError) as denied:
            source.authenticate(request)
        assert denied.value.code == "SOURCE_UNAVAILABLE"
