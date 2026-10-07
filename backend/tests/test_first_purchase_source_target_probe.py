"""Target drill rejects damaged/unscoped input before creating runtime state."""
import hashlib
import json
from pathlib import Path
import runpy

import pytest

PROBE = Path(__file__).resolve().parents[2] / "scripts/dsh-b0/first-purchase-source-target.probe.py"


@pytest.fixture
def sealed(tmp_path):
    root = tmp_path.resolve() / "input"
    root.mkdir()
    (root / "fixture.json").write_text("{}")
    doc = {"schema_version": "synthetic-source-http-target-input/v1", "release_ready": False,
           "candidate_digest": "a" * 64, "source_sha": "b" * 40,
           "files": {"fixture.json": {"bytes": 2, "sha256": hashlib.sha256(b"{}").hexdigest()}}}
    return root, doc, runpy.run_path(str(PROBE))["verify_inputs"]


def seal(root, doc):
    data = json.dumps(doc).encode()
    (root / "input.json").write_bytes(data)
    return hashlib.sha256(data).hexdigest()


@pytest.mark.parametrize("mutation,code", [
    ("tamper", "INPUT_CHANGED"), ("extra", "INPUT_INVENTORY"), ("symlink", "INPUT_CHANGED"),
    ("escape", "INPUT_ENTRY"), ("production", "INPUT_SCOPE"), ("digest", "INPUT_DIGEST"),
])
def test_reject_changed_or_unscoped_transfer(sealed, mutation, code):
    root, doc, verify = sealed
    if mutation == "production":
        doc["release_ready"] = True
    elif mutation == "escape":
        doc["files"]["../outside"] = doc["files"].pop("fixture.json")
    digest = seal(root, doc)
    if mutation == "tamper":
        (root / "fixture.json").write_text("[]")
    elif mutation == "extra":
        (root / "surprise.py").write_text("pass")
    elif mutation == "symlink":
        outside = root.parent / "outside"
        outside.write_text("{}")
        (root / "fixture.json").unlink()
        (root / "fixture.json").symlink_to(outside)
    elif mutation == "digest":
        digest = "0" * 64
    with pytest.raises(ValueError, match=code):
        verify(root, digest)
    assert not (root.parent / "result").exists()
    assert not list(root.parent.glob("source-http-owned-*"))


def test_unchanged_transfer_can_be_verified_without_mutation(sealed):
    root, doc, verify = sealed
    digest = seal(root, doc)
    before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in root.iterdir()}
    assert verify(root, digest) == doc
    assert verify(root, digest) == doc
    assert before == {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in root.iterdir()}
