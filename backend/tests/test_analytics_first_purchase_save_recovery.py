"""G0 service-state evidence: real child loss around SQLite COMMIT, synthetic only.

This tests the existing domain owner; it does not certify a D15 v2 candidate
receipt, profile activation, cross-version migration or production rollback.
"""

from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

import pytest

from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.tests.test_analytics_first_purchase_analysis import (
    analysis_counts,
    asset_actor,
    private_dir,
    succeed_first_purchase,
)

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(os.name != "posix", reason="owned POSIX child SIGKILL drill")

CHILD = r"""
import json
import os
import signal
import sys
from pathlib import Path
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.first_purchase import saved
from backend.services.analytics.first_purchase.source import resolve_trusted_first_purchase_source
from backend.services.analytics.jobs import RunStore
from backend.tests.analytics_run_support import profile

directory, run_id, operation, title = sys.argv[1:]
capabilities = {"analysis:save", "analysis:read", "run:read"}
if operation == "denied-replay":
    capabilities.remove("analysis:save")
actor = AnalyticsPrincipal("synthetic-demo", frozenset(capabilities), frozenset({"first-purchase-fixture"}))
runs = RunStore(Path(directory) / "state", profile(), family="first_purchase")
analyses = saved.FirstPurchaseSavedAnalysisStore(Path(directory) / "analyses")
try:
    source = resolve_trusted_first_purchase_source(runs, actor, run_id)
    if operation == "crash-before-commit":
        original = saved.remember
        def remember_and_crash(*args, **kwargs):
            original(*args, **kwargs)
            os.kill(os.getpid(), signal.SIGKILL)
        saved.remember = remember_and_crash
    result = analyses.save_from_trusted_source(actor, "g0-lost-receipt", title=title, visual_spec=None, trusted=source)
    if operation == "crash-after-commit":
        os.kill(os.getpid(), signal.SIGKILL)
    print(json.dumps({"status": "SAVED", "analysis": result.as_dict()}), flush=True)
except AnalyticsError as error:
    print(json.dumps({"status": error.status, "code": error.code}), flush=True)
"""


def child(directory, run_id, operation="save", title="G0 synthetic save"):
    return subprocess.run(
        [sys.executable, "-c", CHILD, str(directory), run_id, operation, title],
        cwd=ROOT,
        env={**os.environ, "PYTHONPATH": str(ROOT)},
        capture_output=True, text=True, timeout=30, check=False,
    )


def response(process):
    assert process.returncode == 0, process.stderr
    return json.loads(process.stdout)


@pytest.mark.parametrize("point,committed", [
    ("crash-before-commit", 0),
    ("crash-after-commit", 1),
])
def test_lost_save_receipt_replays_once_in_a_new_process(tmp_path, point, committed):
    _runs, _runtime, run = succeed_first_purchase(tmp_path)
    analyses = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    crashed = child(tmp_path, run.run_id, point)
    assert crashed.returncode == -signal.SIGKILL, crashed.stderr
    assert crashed.stdout == ""  # Caller has UNKNOWN, never a success acknowledgement.
    assert analysis_counts(analyses) == {"analyses": committed, "idempotency": committed}
    prior_ids = [row["analysis_id"] for row in analyses.list(asset_actor())]
    first = response(child(tmp_path, run.run_id))
    assert first["status"] == "SAVED"
    analysis = first["analysis"]
    assert analysis["snapshot"]["run_id"] == run.run_id
    assert analysis["facts"] == run.result.facts.model_dump(mode="json")
    if prior_ids:
        assert prior_ids == [analysis["analysis_id"]]
    replay = response(child(tmp_path, run.run_id))
    assert replay == first
    assert analysis_counts(analyses) == {"analyses": 1, "idempotency": 1}


def test_lost_receipt_conflict_and_permission_change_do_not_repeat_save(tmp_path):
    _runs, _runtime, run = succeed_first_purchase(tmp_path)
    analyses = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    assert child(tmp_path, run.run_id, "crash-after-commit").returncode == -signal.SIGKILL
    before = analyses.list(asset_actor())
    assert response(child(tmp_path, run.run_id, title="changed request"))["status"] == 409
    assert response(child(tmp_path, run.run_id, "denied-replay"))["status"] == 403
    assert analyses.list(asset_actor()) == before
    assert analysis_counts(analyses) == {"analyses": 1, "idempotency": 1}
    assert response(child(tmp_path, run.run_id))["analysis"]["analysis_id"] == before[0]["analysis_id"]


def test_service_state_is_preserved_and_can_be_forward_fixed_after_receipt_loss(tmp_path):
    _runs, _runtime, run = succeed_first_purchase(tmp_path)
    analyses = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    assert child(tmp_path, run.run_id, "crash-after-commit").returncode == -signal.SIGKILL
    original = response(child(tmp_path, run.run_id))["analysis"]
    analyses.close()
    restored = FirstPurchaseSavedAnalysisStore(tmp_path / "analyses")
    revised = restored.publish_version(
        asset_actor(), "g0-forward-fix", original["analysis_id"], base_version=1,
        title="G0 corrected title",
    )
    assert revised.version == 2
    assert revised.snapshot == original["snapshot"] and revised.facts == original["facts"]
    assert restored.get(asset_actor(), original["analysis_id"], 1).as_dict() == original
    # Old save replay keeps its immutable v1 response, not a new save or v2 rewrite.
    assert response(child(tmp_path, run.run_id))["analysis"] == original
    assert analysis_counts(restored) == {"analyses": 2, "idempotency": 2}


def test_incompatible_state_schema_is_rejected_without_rebuilding_assets(tmp_path):
    _runs, _runtime, run = succeed_first_purchase(tmp_path)
    analyses = FirstPurchaseSavedAnalysisStore(private_dir(tmp_path, "analyses"))
    saved = response(child(tmp_path, run.run_id))["analysis"]
    # Isolated fixture only: simulate a future state schema, never migrate real state.
    with closing(sqlite3.connect(analyses.path)) as con:
        con.execute("PRAGMA user_version=999")
    with pytest.raises(ValueError, match="schema differs"):
        FirstPurchaseSavedAnalysisStore(tmp_path / "analyses")
    with closing(sqlite3.connect(analyses.path)) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 999
        assert con.execute("SELECT analysis_id FROM analyses").fetchall() == [(saved["analysis_id"],)]
        assert con.execute("SELECT count(*) FROM idempotency").fetchone()[0] == 1
