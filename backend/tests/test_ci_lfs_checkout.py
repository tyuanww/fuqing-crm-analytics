"""Asset-consuming CI jobs fetch bytes without depending on a Git LFS transport.

Audit 2026-11-04: all 112 LFS objects (14.7 MB) live under ``docs/hackathon/``
and ``diagrams/``; the code trees contain zero. The one brand byte the B0 and
release paths consume is excluded from LFS in ``.gitattributes`` and is stored
as a normal Git blob, so a plain checkout already receives real bytes. The jobs
below therefore must not request an LFS transport, and must still not persist
checkout credentials.
"""
from pathlib import Path
import subprocess

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


@pytest.mark.parametrize("workflow,job_name", [
    ("lint.yml", "b0-contract-build"),
    ("lint.yml", "frontend"),
    ("lint.yml", "docker-smoke"),
    ("dsh-b0.yml", "b0-contract-build"),
    ("b0-prepare-cache.yml", "b0-prepare-cache"),
])
def test_asset_consumers_do_not_request_an_lfs_transport(workflow, job_name):
    document = yaml.safe_load((WORKFLOWS / workflow).read_text())
    steps = document["jobs"][job_name]["steps"]
    checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
    assert checkout["with"]["persist-credentials"] is False
    assert checkout["with"].get("lfs") is not True


@pytest.mark.parametrize("path", [
    "frontend-vue3/src/assets/brand/shine-mage.png",
    "frontend-vue3/public/shine-mage-mark.svg",
    "frontend-vue3/src/App.vue",
    "frontend-vue3/src/composables/useFilterSync.ts",
])
def test_consumed_assets_are_not_lfs_pointer_bytes(path):
    # The old jobs hydrated LFS for assets that are plain Git blobs. If one of
    # these inputs ever becomes LFS-tracked, the no-LFS checkout would silently
    # hand a pointer to the build, so fail here instead.
    result = subprocess.run(
        ["git", "check-attr", "filter", "--", path],
        cwd=ROOT, capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 0, result.stderr
    assert not result.stdout.rstrip().endswith(": lfs"), (
        f"{path} is LFS-tracked but CI no longer hydrates LFS: {result.stdout.strip()}"
    )


@pytest.mark.parametrize('path', [
    'frontend-vue3/src/assets/brand/logo.png',
    'frontend-vue3/public/shine-mage-mark.svg',
    'frontend-vue3/src/App.vue',
    'frontend-vue3/src/composables/useFilterSync.ts',
])
def test_b0_path_filter_includes_external_assets_and_legacy_seams(path):
    from scripts.ci.pre_push_path_class import verification_plan
    document = yaml.safe_load((ROOT / '.github/workflows/lint.yml').read_text())
    events = document.get('on', document.get(True))
    assert 'pull_request' in events
    assert document['jobs']['changes']['uses'] == './.github/workflows/check-plan.yml'
    assert "needs.changes.outputs.b0 == 'true'" in document['jobs']['b0-contract-build']['if']
    dispatch = yaml.safe_load((ROOT / '.github/workflows/dsh-b0.yml').read_text())
    dispatch_on = dispatch.get('on', dispatch.get(True))
    assert 'pull_request' not in dispatch_on
    assert 'workflow_dispatch' in dispatch_on
    assert 'changes' not in dispatch['jobs']
    assert verification_plan([path])['b0'] is True
