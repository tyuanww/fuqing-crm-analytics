"""D15 public admission tests. Owned synthetic RunStore and isolated SQLite only."""

from __future__ import annotations

from contextlib import closing, contextmanager
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.analytics_first_purchase_analysis_app import PREFIX, RECEIPT_PREFIX, RESULT_PREFIX, create_first_purchase_analysis_app
from backend.contracts.analytics_first_purchase_analysis import FirstPurchaseSaveCommand
from backend.services.analytics.first_purchase import saved
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy, result_envelope
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.tests.test_analytics_first_purchase_analysis import (
    OTHER, TOKEN, analysis_counts, asset_actor, headers, make_registry, private_dir, succeed_first_purchase,
)
from backend.tests.test_analytics_first_purchase_save_receipts import identity

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def gate(tmp_path):
    runs, _, run = succeed_first_purchase(tmp_path)
    generated_ms = round(run.updated_at.timestamp() * 1000)
    state = {"now": generated_ms, "policy": FirstPurchaseSavePolicy("test-policy-v1", frozenset({"a" * 64}), 1000, 2000)}
    store = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"), clock=lambda: state["now"])
    registry = make_registry()
    app = create_first_purchase_analysis_app(runs, store, registry, save_policy=lambda: state["policy"])
    command = {
        "schema_version": "analytics-first-purchase-save-command/v1", "identity": identity().model_dump(),
        "created_from_run_id": run.run_id, "title": "受控合成快照", "evidence_digest": run.evidence_digest,
    }
    with TestClient(app) as api:
        yield api, store, state, registry, runs, command


def inspect(api, command, **options):
    return api.post(RESULT_PREFIX + "/inspect", json={
        "schema_version": "analytics-first-purchase-save-inspect/v1",
        "identity": command["identity"], "created_from_run_id": command["created_from_run_id"],
    }, headers=headers(key="save-1"), **options)


def save(api, command, **options):
    return api.post(RECEIPT_PREFIX, json=command, headers=headers(key="save-1"), **options)


def test_public_save_persists_provenance_and_reopens_after_policy_and_run_disappear(gate):
    api, store, state, registry, _, command = gate
    result = inspect(api, command)
    assert result.status_code == 200, result.text
    before = result.json()
    assert before["save_eligible"] and before["result_state"] == "SUCCESS_UNSAVED"
    assert before["provenance"]["freshness"]["freshness_state"] == "FRESH"
    # Historical data as_of is not confused with server execution time.
    assert before["provenance"]["generated_at"] != before["result"]["as_of"]
    first = save(api, command)
    assert first.status_code == 201, first.text
    assert first.headers["cache-control"] == "no-store"
    receipt = first.json()
    ref = receipt["analysis_ref"]
    state["now"] += 3000
    assert inspect(api, command).json()["save_ineligible_reason"] == "ALREADY_SAVED"
    state["policy"] = None
    reopened = FirstPurchaseSavedAnalysisStore(store.directory)
    with TestClient(create_first_purchase_analysis_app(analysis_store=reopened, identities=registry)) as recovered:
        again = save(recovered, command)
        assert again.status_code == 201 and again.json() == receipt
        frozen = recovered.get(f'{PREFIX}/{ref["analysis_id"]}/provenance', headers=headers()).json()
        assert frozen["provenance"] == before["provenance"]
        assert frozen["identity"] == command["identity"]
        assert frozen["finite_mock"] is True
        # A changed command may not hide behind a previously successful identity.
        changed = save(recovered, {**command, "title": "changed"})
        assert changed.status_code == 409
        other = recovered.get(f'{PREFIX}/{ref["analysis_id"]}/provenance', headers=headers(OTHER))
        assert other.status_code == 404
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


@pytest.mark.parametrize(("delta", "freshness", "reason"), [
    (-1, "UNKNOWN", "FRESHNESS_UNKNOWN"), (999, "FRESH", None),
    (1000, "STALE", "RESULT_STALE"), (1999, "STALE", "RESULT_STALE"),
    (2000, "EXPIRED", "RESULT_EXPIRED"),
])
def test_server_time_boundaries_and_no_sliding_expiry(gate, delta, freshness, reason):
    api, store, state, _, _, command = gate
    original = inspect(api, command).json()["provenance"]
    state["now"] += delta
    result = inspect(api, command).json()
    assert result["provenance"]["generated_at"] == original["generated_at"]
    assert result["provenance"]["freshness"]["freshness_expires_at"] == original["freshness"]["freshness_expires_at"]
    assert result["provenance"]["freshness"]["freshness_state"] == freshness
    assert result["save_ineligible_reason"] == reason
    response = save(api, command)
    assert response.status_code == (201 if reason is None else 409), response.text
    if reason:
        assert response.json()["error"]["code"] == reason
        assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


@pytest.mark.parametrize("change", ["candidate", "policy", "permission", "token", "source"])
def test_inspect_is_not_authorization_rechecks_before_write(gate, change):
    api, store, state, registry, _, command = gate
    assert inspect(api, command).json()["save_eligible"]
    if change == "candidate":
        state["policy"] = replace(state["policy"], admitted_candidates=frozenset())
    elif change == "policy":
        state["policy"] = None
    elif change == "permission":
        registry.grant(TOKEN, asset_actor(capabilities={"analysis:read", "run:read"}))
        visible = inspect(api, command)
        assert visible.status_code == 200 and visible.json()["save_ineligible_reason"] == "PERMISSION_DENIED"
    elif change == "token":
        registry.revoke(TOKEN)
    else:
        command = {**command, "evidence_digest": "b" * 64}
    response = save(api, command)
    assert response.status_code == {"candidate": 409, "policy": 503, "permission": 403, "token": 401, "source": 409}[change]
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


def test_default_disabled_v1_guard_and_untrusted_fields(gate):
    api, store, _, registry, runs, command = gate
    legacy = api.post(PREFIX, json={"created_from_run_id": command["created_from_run_id"], "title": "bypass"},
                      headers=headers(key="legacy"))
    assert legacy.status_code == 409 and legacy.json()["error"]["code"] == "VERSIONED_SAVE_REQUIRED"
    with TestClient(create_first_purchase_analysis_app(runs, store, registry)) as disabled:
        assert inspect(disabled, command).json()["save_ineligible_reason"] == "POLICY_NOT_CONFIGURED"
        assert save(disabled, command).status_code == 503
    for field, value in {"save_eligible": True, "owner_id": "other", "generated_at": "2099-01-01",
                         "provenance": {}, "facts": {}, "freshness_state": "FRESH"}.items():
        assert save(api, {**command, field: value}).status_code == 422
    assert save(api, {**command, "schema_version": "v999"}).status_code == 422
    missing_schema = {key: value for key, value in command.items() if key != "schema_version"}
    assert save(api, missing_schema).status_code == 422
    assert api.post(RECEIPT_PREFIX, json=command, headers=headers()).status_code == 428
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


def test_waiting_for_write_lock_does_not_freeze_eligibility_or_permissions(gate):
    api, store, state, registry, _, command = gate
    real_transaction = saved.transaction

    @contextmanager
    def delayed(*args, **kwargs):
        with real_transaction(*args, **kwargs) as con:
            state["now"] += 2000
            yield con

    with patch.object(saved, "transaction", delayed):
        response = save(api, command)
    assert response.status_code == 409 and response.json()["error"]["code"] == "RESULT_EXPIRED"
    state["now"] -= 2000

    @contextmanager
    def revoked(*args, **kwargs):
        with real_transaction(*args, **kwargs) as con:
            registry.revoke(TOKEN)
            yield con

    with patch.object(saved, "transaction", revoked):
        assert save(api, command).status_code == 401
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


def test_partial_provenance_cannot_grant_a_save(gate):
    _, _, state, _, runs, command = gate
    source = resolve_trusted_first_purchase_source(runs, asset_actor(), command["created_from_run_id"])
    for field in ("generated_at", "primary_result_ref", "method_package_digest"):
        envelope = result_envelope(replace(source, **{field: None}), asset_actor(), identity(), state["policy"],
                                   checked_ms=state["now"], already_saved=False)
        assert envelope.result_state == "PARTIAL"
        assert envelope.save_eligible is False and envelope.save_ineligible_reason == "PROVENANCE_INCOMPLETE"
    assert round(datetime.fromisoformat(source.generated_at).timestamp() * 1000) == state["now"]


def test_provenance_failure_rolls_back_all_three_identity_rows(gate):
    api, store, _, _, _, command = gate
    original = saved.remember

    def fail(con, actor, operation, *args, **kwargs):
        if operation == saved.SAVE_PROVENANCE_OPERATION:
            raise RuntimeError("owned fault after receipt before provenance")
        return original(con, actor, operation, *args, **kwargs)

    with patch.object(saved, "remember", fail), pytest.raises(RuntimeError, match="owned fault"):
        save(api, command)
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}
    assert save(api, command).status_code == 201
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


def test_forward_fix_preserves_frozen_provenance_and_original_receipt(gate):
    api, store, state, _, _, command = gate
    receipt = save(api, command).json()
    ref = receipt["analysis_ref"]
    provenance = store.saved_provenance(asset_actor(), ref["analysis_id"], 1)
    state["now"] += 10000
    store.publish_version(asset_actor(), "rename", ref["analysis_id"], base_version=1, title="新标题")
    fixed = store.saved_provenance(asset_actor(), ref["analysis_id"], 2)
    assert fixed.provenance == provenance.provenance and fixed.analysis_ref.version == 2
    assert save(api, command).json() == receipt
    assert store.get(asset_actor(), ref["analysis_id"], 1).schema_version.endswith("saved-analysis/v1")
    assert FirstPurchaseSaveCommand.model_validate(command).title == command["title"]


def test_real_http_documents_cross_the_plugin_decoder(gate):
    api, _, state, _, _, command = gate
    unknown = api.post(RECEIPT_PREFIX + "/reconcile", json=command["identity"], headers=headers(key="save-1")).json()
    fresh = inspect(api, command).json()
    state["now"] += 1000
    stale = inspect(api, command).json()
    state["now"] -= 1000
    receipt = save(api, command).json()
    frozen = api.get(f'{PREFIX}/{receipt["analysis_ref"]["analysis_id"]}/provenance', headers=headers()).json()
    observed = subprocess.run(
        [shutil.which("node") or "node", str(ROOT / "dsh-plugins/analytics-workbench/test/first-purchase-save-contract.probe.mjs")],
        input=json.dumps({"fresh": fresh, "stale": stale, "receipt": receipt, "unknown": unknown, "frozen": frozen}),
        cwd=ROOT, text=True, capture_output=True, timeout=15, check=False,
    )
    assert observed.returncode == 0, observed.stderr
    assert "D15_WIRE_DECODER PASS" in observed.stdout


def test_concurrent_public_saves_reserve_one_complete_record(gate):
    api, store, _, _, _, command = gate
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: save(api, command), range(4)))
    assert all(response.status_code == 201 for response in responses)
    assert all(response.json() == responses[0].json() for response in responses)
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


def test_corrupt_saved_provenance_fails_closed_without_recreating_analysis(gate):
    api, store, _, _, _, command = gate
    ref = save(api, command).json()["analysis_ref"]
    with closing(sqlite3.connect(store.path)) as con, con:
        con.execute("UPDATE idempotency SET response_json='{}' WHERE operation=?", (saved.SAVE_PROVENANCE_OPERATION,))
    assert save(api, command).status_code == 503
    assert api.get(f'{PREFIX}/{ref["analysis_id"]}/provenance', headers=headers()).status_code == 503
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


def test_missing_provenance_wire_version_is_not_silently_restored(gate):
    api, store, _, _, _, command = gate
    ref = save(api, command).json()["analysis_ref"]
    with closing(sqlite3.connect(store.path)) as con, con:
        row = con.execute("SELECT response_json FROM idempotency WHERE operation=?", (saved.SAVE_PROVENANCE_OPERATION,)).fetchone()
        payload = json.loads(row[0])
        del payload["schema_version"]
        con.execute("UPDATE idempotency SET response_json=? WHERE operation=?",
                    (json.dumps(payload), saved.SAVE_PROVENANCE_OPERATION))
    response = api.get(f'{PREFIX}/{ref["analysis_id"]}/provenance', headers=headers())
    assert response.status_code == 503, response.text
    assert save(api, command).status_code == 503
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


CHILD = r"""
import json, os, signal, sys
from pathlib import Path
from fastapi.testclient import TestClient
from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app, RECEIPT_PREFIX
from backend.services.analytics.first_purchase import saved
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
from backend.services.analytics.jobs import RunStore
from backend.tests.analytics_run_support import profile
from backend.tests.test_analytics_first_purchase_analysis import make_registry, headers
directory, operation, raw, clock = sys.argv[1:]
command = json.loads(raw)
store = saved.FirstPurchaseSavedAnalysisStore(Path(directory) / "analyses", clock=lambda: int(clock))
runs = None if operation == "replay" else RunStore(Path(directory) / "state", profile(), family="first_purchase")
policy = None if operation == "replay" else lambda: FirstPurchaseSavePolicy("test-policy-v1", frozenset({"a"*64}), 1000, 2000)
original = saved.remember
def interrupted(con, actor, op, *args):
    if op == saved.SAVE_PROVENANCE_OPERATION and operation == "before-provenance":
        os.kill(os.getpid(), signal.SIGKILL)
    original(con, actor, op, *args)
    if op == saved.SAVE_PROVENANCE_OPERATION and operation == "after-provenance":
        os.kill(os.getpid(), signal.SIGKILL)
saved.remember = interrupted
with TestClient(create_first_purchase_analysis_app(runs, store, make_registry(), save_policy=policy)) as api:
    response = api.post(RECEIPT_PREFIX, json=command, headers=headers(key="save-1"))
    assert response.status_code == 201, response.text
    if operation == "after-commit":
        os.kill(os.getpid(), signal.SIGKILL)
    print(response.text, flush=True)
"""


@pytest.mark.skipif(os.name != "posix", reason="owned POSIX child SIGKILL drill")
@pytest.mark.parametrize(("point", "committed"), [
    ("before-provenance", 0), ("after-provenance", 0), ("after-commit", 1),
])
def test_public_save_crash_has_no_provenance_gap_and_can_replay_without_run(gate, point, committed):
    _, store, state, _, _, command = gate

    def child(operation):
        return subprocess.run(
            [sys.executable, "-c", CHILD, str(store.directory.parent), operation, json.dumps(command), str(state["now"])],
            cwd=ROOT, env={**os.environ, "PYTHONPATH": str(ROOT)}, text=True, capture_output=True, timeout=20, check=False,
        )

    crashed = child(point)
    assert crashed.returncode == -signal.SIGKILL, crashed.stderr
    assert crashed.stdout == ""
    assert analysis_counts(store) == {"analyses": committed, "idempotency": 3 * committed}
    recovered = child("replay" if committed else "resume")
    assert recovered.returncode == 0, recovered.stderr
    receipt = json.loads(recovered.stdout)
    frozen = store.saved_provenance(asset_actor(), receipt["analysis_ref"]["analysis_id"], 1)
    assert frozen.identity.model_dump() == command["identity"]
    replayed = child("replay")
    assert replayed.returncode == 0, replayed.stderr
    assert json.loads(replayed.stdout) == receipt
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}
