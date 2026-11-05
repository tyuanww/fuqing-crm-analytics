"""Artifact expiry workflow: a weekly hard gate, not a soft reminder."""

from __future__ import annotations

import re
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "artifact-expiry.yml"
FULL_SHA_RE = re.compile(r"[0-9a-f]{40}")


def _workflow() -> dict:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def _events(document: dict) -> dict:
    # PyYAML resolves the bare `on` key to the boolean True.
    return document.get("on", document.get(True))


def test_workflow_is_weekly_with_manual_dispatch_only() -> None:
    events = _events(_workflow())
    assert set(events) == {"schedule", "workflow_dispatch"}
    assert len(events["schedule"]) == 1
    cron = events["schedule"][0]["cron"].split()
    assert len(cron) == 5
    minute, hour, day_of_month, month, day_of_week = cron
    assert minute.isdigit() and hour.isdigit()
    assert day_of_month == "*" and month == "*"
    assert day_of_week.isdigit() and 0 <= int(day_of_week) <= 7


def test_permissions_are_read_only_and_the_job_cannot_soft_fail() -> None:
    workflow = _workflow()
    assert workflow["permissions"] == {"contents": "read"}
    job = workflow["jobs"]["expiry"]
    assert job["runs-on"] == "ubuntu-24.04"
    assert job["timeout-minutes"] <= 10
    assert "continue-on-error" not in job
    assert all(step.get("continue-on-error") is not True for step in job["steps"])


def test_actions_are_pinned_and_checkout_keeps_credentials_out() -> None:
    steps = _workflow()["jobs"]["expiry"]["steps"]
    uses = [step["uses"] for step in steps if "uses" in step]
    assert any(action.startswith("actions/checkout@") for action in uses)
    assert any(action.startswith("actions/setup-node@") for action in uses)
    for action in uses:
        assert FULL_SHA_RE.fullmatch(action.rsplit("@", 1)[-1]), action
    checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
    assert checkout["with"]["persist-credentials"] is False
    setup_node = next(step for step in steps if step.get("uses", "").startswith("actions/setup-node@"))
    assert setup_node["with"]["node-version"] == "24.19.0"


def test_script_checks_the_checked_in_locks_and_writes_the_job_summary() -> None:
    steps = _workflow()["jobs"]["expiry"]["steps"]
    check = next(step for step in steps if step.get("name") == "Check tracked artifact expiry")
    assert "secrets.SHINEMAGE_PLUGIN_READ_TOKEN" in check["env"]["GH_TOKEN"]
    assert "scripts/release/check-artifact-expiry.mjs" in check["run"]
    assert "$GITHUB_STEP_SUMMARY" in check["run"]
    assert "exit \"$status\"" in check["run"]
    # The expiry table is produced by the script itself; the step must not
    # swallow the non-zero status while writing the summary.
    assert "PIPESTATUS" in check["run"]
    raw = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "continue-on-error" not in raw
