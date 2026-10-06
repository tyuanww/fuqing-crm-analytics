"""Query/save boundary against real owned loopback HTTP; synthetic state only."""
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import select
import shutil
import subprocess
import sys
from threading import Event

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.analytics_first_purchase_analysis_app import PREFIX, RECEIPT_PREFIX, create_first_purchase_analysis_app
from backend.analytics_first_purchase_source_app import create_first_purchase_source_app
from backend.contracts.analytics_first_purchase_source import SOURCE_PREFIX, SOURCE_BODY_LIMIT
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
from backend.services.analytics.first_purchase.source_http import HTTPFirstPurchaseSourceResolver
from backend.tests.test_analytics_first_purchase_analysis import (
    TOKEN, OTHER, analysis_counts, asset_actor, headers, private_dir,
)
from backend.tests.test_analytics_first_purchase_crm_identity import identity_server, response
from backend.tests import test_analytics_first_purchase_save_api as save_support
from backend.tests.test_analytics_first_purchase_save_api import inspect, save
from backend.tests.test_analytics_first_purchase_save_ui import serve

ROOT = Path(__file__).resolve().parents[2]
gate = save_support.gate


def request_for(run_id, capability="analysis:save"):
    return {"schema_version": "first-purchase-source-request/v1", "run_id": run_id, "capability": capability}


@pytest.fixture
def source(gate):
    _, _, _, registry, runs, command = gate
    app = create_first_purchase_source_app(runs, registry)
    with TestClient(app) as api:
        frozen = api.post(SOURCE_PREFIX + "/resolve", json=request_for(command["created_from_run_id"]), headers=headers())
        assert frozen.status_code == 200, frozen.text
        yield app, frozen.json(), api


def test_source_reads_frozen_owner_and_rejects_missing_grants_or_spoofed_input(source, gate):
    _, frozen, api = source
    _, store, _, registry, runs, command = gate
    payload = request_for(command["created_from_run_id"])
    before = runs.get(asset_actor(), payload["run_id"]).model_dump(mode="json")
    ok = api.post(SOURCE_PREFIX + "/resolve", json=payload, headers=headers())
    assert ok.headers["cache-control"] == "no-store" and frozen["owner_id"] == "synthetic-demo"
    assert api.post(SOURCE_PREFIX + "/resolve", json=payload, headers=headers(OTHER)).status_code == 404
    assert api.post(SOURCE_PREFIX + "/resolve", json=payload).status_code == 401
    for extra in ({"actor_id": "synthetic-demo"}, {"capability": "run:create"}, {"schema_version": "v2"}):
        assert api.post(SOURCE_PREFIX + "/resolve", json={**payload, **extra}, headers=headers()).status_code == 422
    registry.grant(TOKEN, asset_actor(capabilities={"run:read", "analysis:read"}))
    assert api.post(SOURCE_PREFIX + "/resolve", json=payload, headers=headers()).status_code == 403
    assert api.post(SOURCE_PREFIX + "/resolve", json=request_for(payload["run_id"], "analysis:read"), headers=headers()).status_code == 200
    assert runs.get(asset_actor(), payload["run_id"]).model_dump(mode="json") == before
    assert not runs.worker_records() and analysis_counts(store)["analyses"] == 0


def test_http_reader_save_and_unknown_replay_survive_query_outage_and_save_reopen(source, gate):
    app, _, _ = source
    _, store, state, registry, _, command = gate
    with serve(app) as origin:
        reader = HTTPFirstPurchaseSourceResolver(origin)
        trusted = reader.resolve(asset_actor(), command["created_from_run_id"], capability="analysis:read",
                                 authorization="Bearer " + TOKEN)
        assert trusted.source_layer == "query_source_http_v1"
        with TestClient(create_first_purchase_analysis_app(analysis_store=store, identities=registry,
                source_resolver=reader, save_policy=lambda: state["policy"])) as api:
            assert inspect(api, command).json()["save_eligible"]
            receipt = save(api, command)
            assert receipt.status_code == 201, receipt.text
    # New connection/store instance; unavailable query must not prevent ACK replay.
    reopened = FirstPurchaseSavedAnalysisStore(store.path.parent, clock=lambda: state["now"])
    with TestClient(create_first_purchase_analysis_app(analysis_store=reopened, identities=registry,
            source_resolver=reader, save_policy=lambda: state["policy"])) as api:
        assert inspect(api, command).status_code == 503
        assert save(api, command).json() == receipt.json()
        found = api.post(RECEIPT_PREFIX + "/reconcile", json=command["identity"], headers=headers(key="save-1"))
        assert found.json() == receipt.json()
        changed = {**command, "title": "changed same intent"}
        assert save(api, changed).status_code == 409
        new = deepcopy(command)
        new["identity"]["action_id"] = "new-action"
        blocked = api.post(RECEIPT_PREFIX, json=new, headers=headers(key="save-2"))
        assert blocked.status_code == 503 and blocked.json()["error"]["code"] == "SOURCE_UNAVAILABLE"
        registry.grant(TOKEN, asset_actor(capabilities={"analysis:read", "run:read"}))
        assert save(api, command).status_code == 403
    assert analysis_counts(reopened) == {"analyses": 1, "idempotency": 3}


@pytest.mark.parametrize("mutation", ["owner", "run", "digest", "request", "version", "extra", "missing", "coercion", "partial"])
def test_untrusted_source_cannot_be_repaired_or_written(source, gate, mutation, caplog):
    _, frozen, _ = source
    _, store, state, registry, _, command = gate
    bad = deepcopy(frozen)
    if mutation == "owner":
        bad["owner_id"] = "other-demo"
    elif mutation == "run":
        bad["run_id"] = "another-run"
    elif mutation == "digest":
        bad["evidence_digest"] = "0" * 64
    elif mutation == "request":
        bad["request"]["observation_days"] = 90
    elif mutation == "version":
        bad["api_version"] = "2.0.0"
    elif mutation == "extra":
        bad["secret"] = "private-provider-value"
    elif mutation == "missing":
        del bad["result"]["schema_version"]
    elif mutation == "coercion":
        bad["result"]["facts"]["cohort_enrolled_count"] = str(bad["result"]["facts"]["cohort_enrolled_count"])
    elif mutation == "partial":
        bad["primary_result_ref"] = None
    with identity_server() as (server, origin):
        server.reply = response(json.dumps(bad).encode())
        with TestClient(create_first_purchase_analysis_app(analysis_store=store, identities=registry,
                source_resolver=HTTPFirstPurchaseSourceResolver(origin), save_policy=lambda: state["policy"])) as api:
            result = save(api, command)
            assert result.status_code == 503 and result.json()["error"]["code"] == "SOURCE_UNAVAILABLE"
            assert "private-provider-value" not in result.text + caplog.text and TOKEN not in result.text + caplog.text
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


@pytest.mark.parametrize("fault", ["redirect", "limit", "duplicate", "slow", "truncated", "gzip", "header"])
def test_source_transport_bounds_errors_and_never_follows_redirects(source, fault):
    _, frozen, _ = source
    wire = json.dumps(frozen).encode()
    with identity_server() as (state, origin):
        if fault == "redirect":
            state.reply = response(status=302, extra=b"Location: http://example.invalid/token\r\n")
        elif fault == "limit":
            state.reply = response(b"x" * (SOURCE_BODY_LIMIT + 1))
        elif fault == "duplicate":
            state.reply = response(wire[:-1] + b',"owner_id":"synthetic-demo"}')
        elif fault == "slow":
            state.chunks = [(bytes([b]), 0.04) for b in response(wire)]
        elif fault == "truncated":
            state.reply = response(wire)[:-100]
        elif fault == "gzip":
            state.reply = response(wire, extra=b"Content-Encoding: gzip\r\n")
        elif fault == "header":
            state.reply = response(wire, extra=b"Content-Type: application/json\r\n")
        with pytest.raises(AnalyticsError) as caught:
            HTTPFirstPurchaseSourceResolver(origin, timeout_seconds=0.15).resolve(
                asset_actor(), frozen["run_id"], capability="analysis:save", authorization="Bearer " + TOKEN)
        assert caught.value.code == "SOURCE_UNAVAILABLE" and caught.value.retryable
        assert len(state.requests) == 1


def test_source_configuration_is_explicit_and_ambiguous_selection_is_rejected(gate):
    _, store, _, registry, runs, _ = gate
    with pytest.raises(ValueError, match="SOURCE_AMBIGUOUS"):
        create_first_purchase_analysis_app(runs, store, registry,
                                           source_resolver=HTTPFirstPurchaseSourceResolver("http://127.0.0.1:1"))
    with TestClient(create_first_purchase_source_app()) as api:
        assert api.post(SOURCE_PREFIX + "/resolve", json=request_for("run-1"), headers=headers()).status_code == 503
    for origin in ("http://localhost:1", "http://10.1.1.1:1", "http://127.0.0.1:1/?token=x"):
        with pytest.raises(ValueError, match="QUERY_SOURCE_LOOPBACK_ORIGIN_REQUIRED"):
            HTTPFirstPurchaseSourceResolver(origin)


@pytest.mark.parametrize("change", ["permission", "identity", "policy"])
def test_revocation_while_source_is_in_flight_cannot_commit(source, gate, change):
    app, _, _ = source
    _, store, state, registry, _, command = gate
    with serve(app) as origin:
        reader = HTTPFirstPurchaseSourceResolver(origin)

        class ChangeAfterRead:
            def resolve(self, *args, **kwargs):
                frozen = reader.resolve(*args, **kwargs)
                if change == "permission":
                    registry.grant(TOKEN, asset_actor(capabilities={"run:read", "analysis:read"}))
                elif change == "identity":
                    registry.grant(TOKEN, asset_actor("other-demo"))
                else:
                    state["policy"] = None
                return frozen

        with TestClient(create_first_purchase_analysis_app(analysis_store=store, identities=registry,
                source_resolver=ChangeAfterRead(), save_policy=lambda: state["policy"])) as api:
            result = save(api, command)
            assert result.status_code == (503 if change == "policy" else 403)
    assert analysis_counts(store) == {"analyses": 0, "idempotency": 0}


def test_slow_source_contention_recovers_same_receipt_without_duplicate_write(source, gate):
    app, _, _ = source
    _, store, state, registry, _, command = gate
    entered, release = Event(), Event()
    with serve(app) as origin:
        reader = HTTPFirstPurchaseSourceResolver(origin)

        class SlowRead:
            def resolve(self, *args, **kwargs):
                frozen = reader.resolve(*args, **kwargs)
                entered.set()
                assert release.wait(5), "owned source wait timed out"
                return frozen

        with TestClient(create_first_purchase_analysis_app(analysis_store=store, identities=registry,
                source_resolver=SlowRead(), save_policy=lambda: state["policy"])) as api:
            with ThreadPoolExecutor(max_workers=1) as pool:
                first = pool.submit(save, api, command)
                try:
                    assert entered.wait(3)
                    contention = save(api, command)
                    assert contention.status_code == 503 and contention.json()["error"]["code"] == "STATE_UNAVAILABLE"
                finally:
                    release.set()
                receipt = first.result(timeout=5)
            assert receipt.status_code == 201, receipt.text
            assert save(api, command).json() == receipt.json()
    assert analysis_counts(store) == {"analyses": 1, "idempotency": 3}


@contextmanager
def isolated_save_process(directory, origin):
    """Only analysis path and query URL are given to child; audit rejects other DB opens."""
    from backend.tests.test_analytics_first_purchase_save_receipts import identity
    config = {"state": str(directory), "origin": origin, "candidate": identity().candidate_digest}
    process = subprocess.Popen([sys.executable, "-B", str(Path(__file__).with_name("first_purchase_source_http_process.py"))],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=ROOT,
        env={"PATH": str(Path(sys.executable).parent) + ":/usr/bin:/bin", "PYTHONPATH": str(ROOT),
             "PYTHONNOUSERSITE": "1", "PYTHON_DOTENV_DISABLED": "1", "PYTHONDONTWRITEBYTECODE": "1"})
    try:
        process.stdin.write(json.dumps(config) + "\n")
        process.stdin.flush()
        assert select.select([process.stdout], [], [], 10)[0], "save process handshake timed out"
        line = process.stdout.readline()
        assert line, "save process startup failed"
        value = json.loads(line)
        assert value["pid"] == process.pid
        yield value["origin"]
    finally:
        process.stdin.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        evidence = process.stdout.read()
        error = process.stderr.read()
        process.stdout.close()
        process.stderr.close()
        assert process.returncode == 0, error
        result = json.loads(evidence)
        assert result["stopped"] and result["sqlite_files"] == ["first_purchase_analyses.sqlite3"]
        (directory.parent / f"save-process-{process.pid}.json").write_text(json.dumps({
            **result, "pid": process.pid, "exit_code": process.returncode,
            "scope": "synthetic-source-http-storage-boundary", "release_ready": False,
        }, indent=2) + "\n")


def test_separate_save_process_opens_only_its_own_db_and_restarts_without_query(source, gate, tmp_path):
    app, _, _ = source
    command = gate[-1]
    saved_dir = private_dir(tmp_path, "separate-service-state")
    with serve(app) as query_origin:
        with isolated_save_process(saved_dir, query_origin) as origin:
            with httpx.Client(base_url=origin, trust_env=False, timeout=5, headers=headers(key="save-1")) as api:
                receipt = api.post(RECEIPT_PREFIX, json=command)
                assert receipt.status_code == 201, receipt.text
    with isolated_save_process(saved_dir, query_origin) as origin:
        with httpx.Client(base_url=origin, trust_env=False, timeout=5, headers=headers(key="save-1")) as api:
            assert api.post(RECEIPT_PREFIX, json=command).json() == receipt.json()
            assert api.post(RECEIPT_PREFIX + "/reconcile", json=command["identity"]).json() == receipt.json()
            assert len(api.get(PREFIX).json()["items"]) == 1


@pytest.mark.parametrize("name", ["analytics-first-purchase", "analytics-first-purchase-kernel"])
def test_source_boundary_imports_from_actual_package_allowlists_without_workspace(name, tmp_path):
    recipe = json.loads((ROOT / "services" / name / "package.json").read_text())
    stage = tmp_path / name
    stage.mkdir()
    for target, item in recipe["files"].items():
        source = item if isinstance(item, str) else item["source"]
        destination = stage / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / source, destination)
    program = r'''
import importlib.abc, pathlib, sys
root=pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
class Guard(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname in {'backend.main', 'backend.config', 'backend.routers', 'backend.db', 'backend.tests', 'dotenv'}:
            raise RuntimeError('PACKAGE_IMPORTED_UNRELATED_SOURCE')
sys.meta_path.insert(0, Guard())
def offline(event, args):
    if event in {'sqlite3.connect', 'socket.connect', 'subprocess.Popen'}:
        raise RuntimeError('PACKAGE_OPENED_STATE_OR_NETWORK')
sys.addaudithook(offline)
from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
from backend.services.analytics.first_purchase.source_http import HTTPFirstPurchaseSourceResolver
app=create_first_purchase_analysis_app(source_resolver=HTTPFirstPurchaseSourceResolver('http://127.0.0.1:1'))
assert app.openapi()['x-first-purchase-saved-analysis-http']
if sys.argv[2].endswith('-kernel'):
    from backend.analytics_first_purchase_native import create_first_purchase_native_app
    from backend.analytics_first_purchase_source_app import create_first_purchase_source_app
    from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver
    identities=CRMFirstPurchaseIdentityResolver('http://127.0.0.1:1', frozenset({'synthetic-demo'}))
    assert create_first_purchase_source_app(identities=identities).openapi()['x-query-owned-frozen-source']
for name, module in list(sys.modules.items()):
    if name == 'backend' or name.startswith('backend.'):
        path=getattr(module, '__file__', None)
        if path: assert pathlib.Path(path).resolve().is_relative_to(root), name
print('PACKAGE_SOURCE_BOUNDARY_IMPORT_PASS')
'''
    result = subprocess.run([sys.executable, "-I", "-B", "-c", program, str(stage), name],
        cwd=stage, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "PACKAGE_SOURCE_BOUNDARY_IMPORT_PASS"
