#!/usr/bin/env python3
"""Bounded TLC check and isolated SQLite mutation check for native page confirm."""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import types

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "backend/services/analytics/page_documents.py"
JAR_SHA = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
GUARD = "if binding_error is not None:\n                raise binding_error"


def method(tree, name):
    nodes = tree.body
    for part in name.split("."):
        found = [node for node in nodes if getattr(node, "name", None) == part]
        if len(found) != 1:
            raise ValueError(f"coverage target missing: {name}")
        node = found[0]
        nodes = node.body
    return node


def fingerprints(text):
    tree = ast.parse(text)
    confirm = method(tree, "PageDocumentStore.confirm")
    guards = [node for node in ast.walk(confirm) if isinstance(node, ast.If)
              and ast.unparse(node.test) == "binding_error is not None"
              and len(node.body) == 1 and isinstance(node.body[0], ast.Raise)
              and isinstance(node.body[0].exc, ast.Name) and node.body[0].exc.id == "binding_error"]
    if len(guards) > 1:
        raise ValueError("ambiguous source-error guard")
    present = bool(guards)
    if present:
        method(tree, "PageDocumentStore.confirm").body[-1].body.remove(guards[0])
    names = ["PageDocumentStore.confirm", "PageDocumentStore._confirmation", "PageDocumentStore._bind"]
    return present, {name: hashlib.sha256(ast.dump(method(tree, name)).encode()).hexdigest() for name in names}


def tlc(text, destination, jar):
    destination.mkdir(mode=0o700)
    model = destination / "NativePageConfirm.tla"
    model.write_text((ROOT / "scripts/formal/tla/NativePageConfirm.tla").read_text())
    guarded, _ = fingerprints(text)
    config = "SPECIFICATION Spec\nCONSTANT RejectSourceError = " + str(guarded).upper() + "\n"
    config += "INVARIANT NewRevisionRequiresSuccessfulSource\n"
    (destination / "NativePageConfirm.cfg").write_text(config)
    command = [os.environ.get("JAVA_BIN", "java"), "-cp", str(jar), "tlc2.TLC", "-terse", "-workers", "1",
               "-metadir", str(destination / "states"), "-config", str(destination / "NativePageConfirm.cfg"),
               str(model)]
    result = subprocess.run(command, cwd=destination, text=True, capture_output=True, timeout=30)
    output = result.stdout + result.stderr
    (destination / "tlc.log").write_text(output)
    return result.returncode, output


def sqlite_check(text, destination):
    destination.mkdir(mode=0o700)
    sys.path.insert(0, str(ROOT))
    from backend.contracts.competition_computed import DATA_SCOPE
    from backend.contracts.page_documents import PageDraft, PagePatchPreview
    from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
    from backend.services.analytics.page_context import PageRequestContext

    name = "native_page_confirm_" + destination.name.replace("-", "_")
    module = types.ModuleType(name)
    module.__file__ = str(destination / "page_documents.py")
    sys.modules[name] = module
    (destination / "page_documents.py").write_text(text)
    exec(compile(text, module.__file__, "exec"), module.__dict__)
    actor = AnalyticsPrincipal("formal-fixture", frozenset({"dashboard:read", "dashboard:update"}),
                               frozenset({DATA_SCOPE, "formal-result"}))

    def resolve(_actor, _session, _ref, **_kwargs):
        return module.ResolvedPageBinding("VERIFIED", frozenset({"formal-result"}))

    store = module.PageDocumentStore(destination, resolve_binding=resolve)
    draft = PageDraft.model_validate({"title": "授权保存验证", "session_id": "formal-session",
                                     "package": {"html": "<h1>增长复盘</h1>"},
                                     "binding_manifest": {"result_refs": ["formal-ref"], "bindings": []}})
    preview = store.generate(actor, draft)
    saved = store.confirm(actor, preview["preview_id"], "initial")
    page_id = saved["spec"]["page_id"]
    patch = store.patch(actor, page_id, PagePatchPreview(base_version=1, title="人工复核"))

    def unavailable(operation, **_kwargs):
        assert operation == "assertActive"
        raise AnalyticsError(503, "SOURCE_UNAVAILABLE", "synthetic source unavailable", retryable=True)

    context = PageRequestContext(actor, remote=unavailable)
    error, returned = None, None
    try:
        returned = store.confirm(actor, patch["preview_id"], "source-failed", source_context=context)
    except AnalyticsError as failure:
        error = failure.code
    with sqlite3.connect(store.path) as con:
        head = con.execute("SELECT version FROM heads WHERE page_id=?", (page_id,)).fetchone()[0]
        failed_receipts = con.execute("SELECT COUNT(*) FROM receipts WHERE key='source-failed'").fetchone()[0]
    protected = error == "SOURCE_UNAVAILABLE" and returned is None and head == 1 and failed_receipts == 0
    replay_verified = False
    if protected:
        committed = store.confirm(actor, patch["preview_id"], "retry-success")
        replay = store.confirm(actor, patch["preview_id"], "retry-success", source_context=context)
        replay_verified = replay == committed and replay["spec"]["version"] == 2
    receipt = {"protected": protected, "error": error, "head_after_source_failure": head,
               "success_receipts_after_source_failure": failed_receipts, "successful_retry_replayed": replay_verified}
    (destination / "result.json").write_text(json.dumps(receipt, indent=2) + "\n")
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or ROOT / ".context/formal-page-confirm" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(mode=0o700)
    jar = Path(os.environ.get("TLA_TOOLS_JAR", ROOT / ".context/formal-tools/tla2tools-1.7.4.jar")).resolve()
    if not jar.is_file() or hashlib.sha256(jar.read_bytes()).hexdigest() != JAR_SHA:
        raise ValueError("TLA+ Tools v1.7.4 with the pinned SHA-256 is required")
    record = json.loads((ROOT / "scripts/formal/native-page-confirm-coverage.json").read_text())
    text = SOURCE.read_text()
    _, actual = fingerprints(text)
    if actual != record["functions"]:
        raise ValueError("MODEL_SYNC_REQUIRED: covered confirm logic changed; inspect the model before updating coverage")
    for path, expected in record["dependencies"].items():
        if hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != expected:
            raise ValueError("MODEL_SYNC_REQUIRED: " + path)
    base_rc, _ = tlc(text, output / "baseline-tlc", jar)
    base = sqlite_check(text, output / "baseline-sqlite")
    if base_rc != 0 or not base["protected"] or not base["successful_retry_replayed"]:
        raise ValueError("CURRENT_CODE_FINDING: source-failed confirm is not protected; retain evidence")
    if text.count(GUARD) != 1:
        raise ValueError("exact scratch mutation target is unavailable")
    broken = text.replace(GUARD, "pass", 1)
    mutant_rc, mutant_output = tlc(broken, output / "mutant-tlc", jar)
    mutant = sqlite_check(broken, output / "mutant-sqlite")
    if mutant_rc == 0 or "Invariant NewRevisionRequiresSuccessfulSource is violated" not in mutant_output:
        raise ValueError("SELF_TEST_FAILED: TLC did not catch the removed real-code guard")
    if mutant["protected"] or mutant["head_after_source_failure"] != 2 or mutant["success_receipts_after_source_failure"] != 1:
        raise ValueError("SELF_TEST_FAILED: scratch mutation did not reproduce an unauthorized new revision")
    restored_rc, _ = tlc(SOURCE.read_text(), output / "restored-tlc", jar)
    restored = sqlite_check(SOURCE.read_text(), output / "restored-sqlite")
    if restored_rc or not restored["protected"] or not restored["successful_retry_replayed"]:
        raise ValueError("RESTORED_BASELINE_FAILED")
    if SOURCE.read_text() != text:
        raise ValueError("SOURCE_CHANGED_DURING_VERIFICATION")
    summary = {"status": "PASS", "sync_commit": record["sync_commit"], "concurrent_calls": 2,
               "preview_count": 1, "idempotency_key_count": 1, "baseline": base, "mutant": mutant,
               "restored": restored, "product_source_changed": False,
               "python": sys.version.split()[0], "tla_tools_version": "1.7.4", "jar_sha256": JAR_SHA,
               "limits": "Late source revalidation failure only; not CRM auth, quotas, DuckDB, HTML, browser or distributed revocation atomicity"}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"status": "PASS", "evidence": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
