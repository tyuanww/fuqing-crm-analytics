"""G0 D15 storage receipts; no production admission, model or business data."""

from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.analytics_first_purchase_analysis_app import (
    PREFIX,
    RECEIPT_PREFIX,
    create_first_purchase_analysis_app,
)
from backend.contracts.analytics_first_purchase_analysis import FirstPurchaseSaveIdentity
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.tests.test_analytics_first_purchase_analysis import (
    OTHER,
    READER,
    TOKEN,
    analysis_counts,
    asset_actor,
    headers,
    make_registry,
    private_dir,
    succeed_first_purchase,
)

ROOT = Path(__file__).resolve().parents[2]


def identity(**changes):
    return FirstPurchaseSaveIdentity.model_validate({
        "schema_version": "analytics-first-purchase-save-identity/v1",
        "action_id": "save-action-1", "candidate_digest": "a" * 64, "correlation_id": "correlation-1",
        **changes,
    })


def fixture(tmp_path):
    runs, _, run = succeed_first_purchase(tmp_path)
    store = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    source = resolve_trusted_first_purchase_source(runs, asset_actor(), run.run_id)
    return store, source


def save(store, source, *, key="save-1", binding=None, title="G0 receipt"):
    return store.save_with_receipt(
        asset_actor(), key, identity=binding or identity(), title=title, visual_spec=None, trusted=source,
    )


def client(store, registry=None):
    # Deliberately no RunStore: receipt reconciliation cannot rerun the query.
    return TestClient(create_first_purchase_analysis_app(analysis_store=store, identities=registry or make_registry()))


def test_committed_receipt_reopens_without_runstore_and_preserves_v1_forward_fix(tmp_path):
    store, source = fixture(tmp_path)
    receipt = save(store, source)
    assert receipt.identity == identity()
    assert receipt.idempotency_key == "save-1" and receipt.owner_id == asset_actor().actor_id
    assert receipt.source_ref.evidence_digest == source.evidence_digest
    assert receipt.source_ref.created_from_run_id == source.run_id
    assert receipt.durable_state_key == f"first-purchase-analysis:{receipt.analysis_ref.analysis_id}:1"
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 2}
    with closing(sqlite3.connect(store.path)) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 1
    store.close()
    reopened = FirstPurchaseSavedAnalysisStore(tmp_path / "analyses")
    with client(reopened) as api:
        fetched = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(key="save-1"))
        assert fetched.status_code == 200, fetched.text
        assert fetched.json() == receipt.model_dump(mode="json")
        assert fetched.headers["cache-control"] == "no-store"
        old = api.get(f"{PREFIX}/{receipt.analysis_ref.analysis_id}", headers=headers())
        assert old.status_code == 200 and old.json()["schema_version"].endswith("saved-analysis/v1")
    fixed = reopened.publish_version(
        asset_actor(), "title-fix", receipt.analysis_ref.analysis_id, base_version=1, title="Forward fix",
    )
    assert fixed.version == 2
    assert reopened.lookup_save_receipt(asset_actor(), "save-1", identity()) == receipt
    assert save(reopened, source) == receipt
    assert analysis_counts(reopened) == {"analyses": 2, "idempotency": 3}


def test_unknown_is_read_only_and_does_not_claim_no_execution_or_create_an_action(tmp_path):
    store, _source = fixture(tmp_path)
    before = store.path.read_bytes()
    with client(store) as api:
        for _ in range(2):
            response = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(key="save-1"))
            assert response.status_code == 200
            body = response.json()
            assert body["status"] == "SAVE_UNKNOWN" and body["reason"] == "RECEIPT_NOT_FOUND"
            assert body["durable_state_key"] is None and body["analysis_ref"] is None and body["source_ref"] is None
    assert store.path.read_bytes() == before
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


@pytest.mark.parametrize("changes,key", [
    ({"candidate_digest": "b" * 64}, "save-1"),
    ({"correlation_id": "correlation-2"}, "save-1"),
    ({"action_id": "save-action-2"}, "save-1"),
    ({}, "save-2"),
])
def test_changed_identity_or_reused_key_is_conflict_for_save_and_reconcile(tmp_path, changes, key):
    store, source = fixture(tmp_path)
    save(store, source)
    binding = identity(**changes)
    with pytest.raises(AnalyticsError) as error:
        save(store, source, key=key, binding=binding)
    assert error.value.status == 409
    with client(store) as api:
        response = api.post(RECEIPT_PREFIX + "/reconcile", json=binding.model_dump(), headers=headers(key=key))
        assert response.status_code == 409
        assert "analysis_ref" not in response.text
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 2}


def test_replay_checks_current_permissions_and_request_body(tmp_path):
    store, source = fixture(tmp_path)
    original = save(store, source)
    with pytest.raises(AnalyticsError) as error:
        save(store, source, title="different")
    assert error.value.status == 409
    registry = make_registry()
    with client(store, registry) as api:
        for token in [READER, TOKEN]:
            if token == TOKEN:
                registry.grant(TOKEN, asset_actor(capabilities={"analysis:read"}))
            response = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(token, key="save-1"))
            assert response.status_code == 403
        other = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(OTHER, key="save-1"))
        assert other.status_code == 200 and other.json()["status"] == "SAVE_UNKNOWN"
        assert original.analysis_ref.analysis_id not in other.text
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 2}


def test_unknown_or_partial_schema_and_client_uploaded_proof_are_rejected(tmp_path):
    store, _source = fixture(tmp_path)
    with client(store) as api:
        correct = identity().model_dump()
        for payload in [
            {**correct, "schema_version": "analytics-first-purchase-save-identity/v99"},
            {k: v for k, v in correct.items() if k != "schema_version"},
            {**correct, "owner_id": "other-demo"},
            {**correct, "save_eligible": True},
            {**correct, "candidate_digest": "latest"},
        ]:
            response = api.post(RECEIPT_PREFIX + "/reconcile", json=payload, headers=headers(key="save-1"))
            assert response.status_code == 422
        missing = api.post(RECEIPT_PREFIX + "/reconcile", json=correct, headers=headers())
        assert missing.status_code == 428
        duplicate = [("authorization", f"Bearer {TOKEN}"), ("idempotency-key", "a"), ("idempotency-key", "b")]
        assert api.post(RECEIPT_PREFIX + "/reconcile", json=correct, headers=duplicate).status_code == 400
        # Identity alone is not a save command or proof of permission.
        assert api.post(RECEIPT_PREFIX, json=correct, headers=headers(key="save-1")).status_code == 422
        assert api.post(PREFIX, json={"created_from_run_id": "r", "title": "t", "identity": correct}, headers=headers(key="save-1")).status_code == 422
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


def test_concurrent_duplicate_saves_share_the_same_durable_state(tmp_path):
    store, source = fixture(tmp_path)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: save(store, source), range(4)))
    assert all(row == results[0] for row in results)
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 2}


def test_incomplete_receipt_state_is_unavailable_not_a_new_save(tmp_path):
    store, source = fixture(tmp_path)
    save(store, source)
    with closing(sqlite3.connect(store.path)) as con:
        con.execute("DELETE FROM idempotency WHERE operation=?", ("analysis:save-action/v1",))
        con.commit()
    with client(store) as api:
        response = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(key="save-1"))
        assert response.status_code == 503
    with pytest.raises(AnalyticsError) as error:
        save(store, source)
    assert error.value.status == 503
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 1}


@pytest.mark.parametrize("corruption", ["missing-analysis", "wrong-source"])
def test_receipt_cannot_claim_saved_without_matching_durable_analysis(tmp_path, corruption):
    store, source = fixture(tmp_path)
    original = save(store, source)
    with closing(sqlite3.connect(store.path)) as con, con:
        if corruption == "missing-analysis":
            con.execute("DELETE FROM analyses")
        else:
            con.execute("UPDATE analyses SET evidence_digest=?", ("b" * 64,))
    with client(store) as api:
        observed = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(key="save-1"))
        assert observed.status_code == 503, observed.text
    with pytest.raises(AnalyticsError) as error:
        save(store, source)
    assert error.value.status == 503
    assert original.analysis_ref.version == 1
    assert analysis_counts(store)["idempotency"] == 2


@pytest.mark.parametrize("field", ["schema_version", "api_version", "finite_mock", "state_schema_version"])
def test_missing_persisted_wire_fields_are_not_filled_from_model_defaults(tmp_path, field):
    store, source = fixture(tmp_path)
    receipt = save(store, source).model_dump(mode="json")
    del receipt[field]
    with closing(sqlite3.connect(store.path)) as con, con:
        con.execute("UPDATE idempotency SET response_json=?", (json.dumps(receipt),))
    with client(store) as api:
        observed = api.post(RECEIPT_PREFIX + "/reconcile", json=identity().model_dump(), headers=headers(key="save-1"))
        assert observed.status_code == 503, observed.text
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 2}


CHILD = r"""
import json, os, signal, sys
from pathlib import Path
from backend.services.analytics.first_purchase import saved
from backend.services.analytics.jobs import RunStore
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.tests.analytics_run_support import profile
from backend.tests.test_analytics_first_purchase_analysis import asset_actor
from backend.tests.test_analytics_first_purchase_save_receipts import identity
directory, run_id, operation = sys.argv[1:]
store = saved.FirstPurchaseSavedAnalysisStore(Path(directory) / 'analyses')
if operation == 'lookup':
    receipt = store.lookup_save_receipt(asset_actor(), 'save-1', identity())
else:
    runs = RunStore(Path(directory) / 'state', profile(), family='first_purchase')
    source = resolve_trusted_first_purchase_source(runs, asset_actor(), run_id)
    if operation in {'first-reservation', 'before-commit'}:
        remember = saved.remember
        def interrupted(con, principal, op, *args):
            remember(con, principal, op, *args)
            if op == ('analysis:save-receipt/v1' if operation == 'first-reservation' else 'analysis:save-action/v1'):
                os.kill(os.getpid(), signal.SIGKILL)
        saved.remember = interrupted
    receipt = store.save_with_receipt(asset_actor(), 'save-1', identity=identity(), title='G0 receipt', visual_spec=None, trusted=source)
    if operation == 'after-commit':
        os.kill(os.getpid(), signal.SIGKILL)
print(receipt.model_dump_json(), flush=True)
"""


@pytest.mark.skipif(os.name != "posix", reason="owned POSIX child SIGKILL drill")
@pytest.mark.parametrize("point,committed", [("first-reservation", 0), ("before-commit", 0), ("after-commit", 1)])
def test_crash_reconcile_and_replay_in_independent_processes(tmp_path, point, committed):
    store, source = fixture(tmp_path)

    def child(operation):
        return subprocess.run(
            [sys.executable, "-c", CHILD, str(tmp_path), source.run_id, operation],
            cwd=ROOT, env={**os.environ, "PYTHONPATH": str(ROOT)},
            capture_output=True, text=True, timeout=30, check=False,
        )

    crashed = child(point)
    assert crashed.returncode == -signal.SIGKILL, crashed.stderr
    assert crashed.stdout == ""
    assert analysis_counts(store) == {"analyses": committed, "idempotency": 2 * committed}
    observed = child("lookup")
    assert observed.returncode == 0, observed.stderr
    prior = json.loads(observed.stdout)
    assert prior["status"] == ("SAVED" if committed else "SAVE_UNKNOWN")
    retried = child("save")
    assert retried.returncode == 0, retried.stderr
    receipt = json.loads(retried.stdout)
    assert receipt["status"] == "SAVED"
    if committed:
        assert receipt == prior
    assert json.loads(child("lookup").stdout) == receipt
    assert json.loads(child("save").stdout) == receipt
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 2}
