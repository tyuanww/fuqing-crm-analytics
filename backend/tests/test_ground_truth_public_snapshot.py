"""Imported historical documents require exact indexed provenance, never a path-only skip."""
import hashlib
import importlib.util
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("public_snapshot_ground_truth", ROOT / ".githooks/check_review_ground_truth.py")
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


@pytest.fixture
def snapshot(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    subprocess.run(["git", "init", "-q"], check=True)
    document = tmp_path / "docs/history.md"
    document.parent.mkdir()
    document.write_text("Historical claim: missing implementation\n")
    manifest = tmp_path / checker.PUBLIC_SNAPSHOT_MANIFEST
    manifest.parent.mkdir()
    manifest.write_text(hashlib.sha256(document.read_bytes()).hexdigest() + "  docs/history.md\n")
    monkeypatch.setattr(checker, "PUBLIC_SNAPSHOT_MANIFEST_SHA", hashlib.sha256(manifest.read_bytes()).hexdigest())
    subprocess.run(["git", "add", "."], check=True)
    return document, manifest


def test_exact_indexed_document_is_historical_but_unstaged_edits_are_not_checked(snapshot):
    document, _ = snapshot
    assert checker.verified_public_snapshot_document("docs/history.md")
    assert checker.check_file("docs/history.md") == []
    document.write_text("A new unsupported claim: missing implementation\n")
    assert checker.verified_public_snapshot_document("docs/history.md")
    subprocess.run(["git", "add", "docs/history.md"], check=True)
    assert not checker.verified_public_snapshot_document("docs/history.md")
    assert checker.check_file("docs/history.md")


def test_edited_manifest_cannot_bless_changed_document(snapshot):
    document, manifest = snapshot
    document.write_text("Another unsupported claim: missing implementation\n")
    manifest.write_text(hashlib.sha256(document.read_bytes()).hexdigest() + "  docs/history.md\n")
    subprocess.run(["git", "add", "."], check=True)
    assert not checker.verified_public_snapshot_document("docs/history.md")
    assert checker.check_file("docs/history.md")


def test_unlisted_documents_and_code_are_not_exempt(snapshot):
    document, _ = snapshot
    other = document.parent / "current.md"
    other.write_text("The feature is missing\n")
    subprocess.run(["git", "add", "."], check=True)
    assert not checker.verified_public_snapshot_document("docs/current.md")
    assert not checker.verified_public_snapshot_document("backend/example.py")
    assert checker.check_file("docs/current.md")


def test_missing_indexed_manifest_fails_closed(snapshot):
    _, manifest = snapshot
    manifest.unlink()
    subprocess.run(["git", "add", "-u"], check=True)
    assert not checker.verified_public_snapshot_document("docs/history.md")


def test_committed_mode_reads_commit_not_index(snapshot):
    document, _ = snapshot
    subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"], check=True)
    assert checker.verified_public_snapshot_document("docs/history.md", committed=True)
    document.write_text("Changed claim: missing implementation\n")
    subprocess.run(["git", "add", "docs/history.md"], check=True)
    assert not checker.verified_public_snapshot_document("docs/history.md")
    assert checker.verified_public_snapshot_document("docs/history.md", committed=True)
    subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "change"], check=True)
    assert not checker.verified_public_snapshot_document("docs/history.md", committed=True)
    assert checker.check_file("docs/history.md", committed=True)
