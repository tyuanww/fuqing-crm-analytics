"""Exercise CRM from a real release payload without checkout import fallbacks."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

import duckdb
import pytest


ROOT = Path(__file__).resolve().parents[2]
PROBE = r"""
import json
from pathlib import Path
import sys

payload = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(payload))
from backend.main import app
from fastapi.testclient import TestClient
from backend.services.warehouse_source import SourceState

client = TestClient(app)
assert client.get('/api/v1/health').status_code == 200
assert client.get('/api/v1/metrics/cutoff').status_code == 401
login = client.post('/api/v1/auth/login', json={
    'username': 'payload_user', 'password': 'synthetic-payload-password',
})
assert login.status_code == 200, login.text
headers = {'Authorization': 'Bearer ' + login.json()['token']}
unready = client.get('/api/v1/metrics/cutoff', headers=headers)
assert unready.status_code == 503, unready.text
assert unready.headers['X-Aggregate-Cache-Status'] == 'unavailable'

with TestClient(app) as client:
    runtime = app.state.warehouse_runtime
    assert runtime.source.state == SourceState.READY
    assert client.get('/api/v1/health').status_code == 200
    assert client.get('/api/v1/metrics/cutoff').status_code == 401
    cutoff = client.get('/api/v1/metrics/cutoff', headers=headers)
    assert cutoff.status_code == 200, cutoff.text
    assert cutoff.json() == {'cutoff_date': '2026-07-05'}
    daily = client.post('/api/v1/ad-hoc/daily-gsv', headers=headers, json={
        'start_date': '2026-07-01', 'end_date': '2026-07-05',
    })
    assert daily.status_code == 200, daily.text
    assert sum(row[1] for row in daily.json()['rows']) == 170
    unsupported = client.post('/api/v1/ad-hoc/ai-sandbox-execute', headers=headers, json={})
    assert unsupported.status_code == 422, unsupported.text
    assert unsupported.json()['error']['code'] == 'UNSUPPORTED_OPERATION'

    from scripts.ad_hoc_queries.registry import get
    assert get('list-endpoints').run()
    for name, module in tuple(sys.modules.items()):
        if name == 'backend' or name.startswith(('backend.', 'scripts.')):
            source = getattr(module, '__file__', None)
            if source is not None:
                assert Path(source).resolve().is_relative_to(payload), (name, source)

assert runtime.source.state == SourceState.CLOSED
closed = client.get('/api/v1/metrics/cutoff', headers=headers)
assert closed.status_code == 503, closed.text
print(json.dumps({'startup': 'ready', 'shutdown': 'closed', 'auth': 'enforced'}))
"""


def _run_owned_process(args, *, cwd, env, timeout):
    process = subprocess.Popen(
        args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise
    return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)


def test_timeout_reaps_owned_descendant_and_preserves_unrelated_peer(tmp_path):
    pids_file = tmp_path / "owned-pids.json"
    peer = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", "import time; time.sleep(60)"],
        cwd=tmp_path, env={}, start_new_session=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        with pytest.raises(subprocess.TimeoutExpired):
            _run_owned_process(
                [sys.executable, "-I", "-B", "-c", """
import json
import os
from pathlib import Path
import subprocess
import sys
import time
child = subprocess.Popen([sys.executable, '-I', '-B', '-c', 'import time; time.sleep(60)'])
Path(sys.argv[1]).write_text(json.dumps([os.getpid(), child.pid]))
time.sleep(60)
""", str(pids_file)],
                cwd=tmp_path, env={}, timeout=2,
            )
        assert pids_file.is_file(), "timeout fixture did not start its descendant"
        leader, descendant = json.loads(pids_file.read_text())
        with pytest.raises(ChildProcessError):
            os.waitpid(leader, os.WNOHANG)
        deadline = time.monotonic() + 2
        while True:
            state = subprocess.run(
                ["ps", "-o", "stat=", "-p", str(descendant)],
                cwd=tmp_path, capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            if not state or state.startswith("Z") or time.monotonic() >= deadline:
                break
            time.sleep(0.05)
        assert not state or state.startswith("Z"), f"owned descendant {descendant} survived timeout ({state})"
        assert peer.poll() is None, "timeout cleanup killed an unrelated process"
    finally:
        if pids_file.is_file():
            leader, _ = json.loads(pids_file.read_text())
            try:
                os.killpg(leader, signal.SIGKILL)
            except ProcessLookupError:
                pass
        peer.kill()
        peer.wait(timeout=5)


def test_release_payload_starts_verified_crm_without_checkout(tmp_path):
    node = shutil.which("node")
    assert node is not None, "release payload regression requires Node"
    assert shutil.which("zstd") is not None, "release packer requires zstd"
    work = tmp_path / "independent-cwd"
    work.mkdir()
    home = tmp_path / "home"
    home.mkdir()
    state = tmp_path / "warehouse-state"
    state.mkdir(mode=0o700)
    database = tmp_path / "synthetic.duckdb"
    with duckdb.connect(str(database)) as conn:
        conn.execute(
            "CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, pay_time TIMESTAMP, "
            "actual_amount DECIMAL(18,2), channel VARCHAR, is_member BOOLEAN, is_goujinjin BOOLEAN, "
            "is_refund BOOLEAN, order_status VARCHAR, spu_product_class VARCHAR)"
        )
        conn.execute(
            "INSERT INTO orders VALUES "
            "('s1','old','2025-07-02',80,'货架',false,false,false,'已付款','白膜'),"
            "('s2','old','2026-07-02',100,'货架',true,false,false,'已付款','白膜'),"
            "('s3','new','2026-07-04',20,'货架',false,false,false,'已付款','白膜'),"
            "('s4','other','2026-07-05',50,'直播',false,false,false,'已付款','黑膜')"
        )
        conn.execute(
            "CREATE TABLE user_first_purchase AS SELECT user_id, "
            "MIN(pay_time)::DATE AS first_pay_date FROM orders GROUP BY user_id"
        )
    original_digest = hashlib.sha256(database.read_bytes()).hexdigest()
    env = {
        "PATH": os.pathsep.join((str(Path(sys.executable).parent), os.environ.get("PATH", os.defpath))),
        "HOME": str(home), "TMPDIR": str(tmp_path), "PYTHON_DOTENV_DISABLED": "1",
        "DUCKDB_PATH": str(database), "FUQING_DB_PATH": str(database),
        "CACHE_DUCKDB_PATH": str(tmp_path / "legacy-cache.duckdb"),
        "FQ_WAREHOUSE_STATE_DIR": str(state), "FQ_WAREHOUSE_SOURCE_ID": "synthetic-payload",
        "FQ_WAREHOUSE_DATA_KIND": "synthetic", "FQ_PRIVATE_TMP": str(tmp_path / "private"),
        "FQ_DUCKDB_TEMP_ROOT": str(tmp_path / "duckdb-tmp"),
        "DUCKDB_MEMORY_LIMIT": "512MB", "DUCKDB_THREADS": "1",
        "FQ_CRM_PASSWORDS": "payload_user:synthetic-payload-password",
        "FQ_CRM_ADMINS": "payload_user", "HEALTH_API_KEY": "synthetic-payload-health-key",
    }
    for name in (
        "SHOP_DATA_SOURCE", "MEMBER_DATA_SOURCE", "SPU_MAPPING_SOURCE", "SHOP_STATUS_SOURCE",
        "VISITOR_DATA_SOURCE", "VISITOR_XLSX_FILE", "CAMPAIGN_SCHEDULE_SOURCE", "CHANNEL_RULES_SOURCE",
        "TAOKE_DATA_SOURCE", "TAOKE_PRODUCT_SOURCE", "LIVE_DATA_SOURCE", "DMP_DATA_DIR",
    ):
        env[name] = str(tmp_path / "unused-inputs" / name.lower())
    artifact = tmp_path / "crm.tar.zst"
    payload = tmp_path / "received"
    build = _run_owned_process(
        [node, "--input-type=module", "-e", """
import { pathToFileURL } from 'node:url';
const [rootDir, output] = process.argv.slice(1);
const { collectAllowlist, packArtifact } = await import(pathToFileURL(rootDir + '/scripts/release/artifact.mjs'));
const allowlist = await collectAllowlist(rootDir);
console.log(JSON.stringify(await packArtifact({ rootDir, allowlist, output })));
""", str(ROOT), str(artifact)],
        cwd=work, env=env, timeout=120,
    )
    assert build.returncode == 0, build.stdout + build.stderr
    unpack = _run_owned_process(
        [sys.executable, "-I", "-B", str(ROOT / "scripts/release/secure-unpack.py"),
         str(artifact), str(payload)],
        cwd=work, env=env, timeout=120,
    )
    assert unpack.returncode == 0, unpack.stdout + unpack.stderr
    probe = _run_owned_process(
        [sys.executable, "-I", "-B", "-c", PROBE, str(payload)],
        cwd=work, env=env, timeout=90,
    )
    (tmp_path / "startup.stdout").write_text(probe.stdout)
    (tmp_path / "startup.stderr").write_text(probe.stderr)
    assert hashlib.sha256(database.read_bytes()).hexdigest() == original_digest
    assert probe.returncode == 0, probe.stdout + probe.stderr
    assert json.loads(probe.stdout.splitlines()[-1]) == {
        "startup": "ready", "shutdown": "closed", "auth": "enforced",
    }
    worker = _run_owned_process(
        [sys.executable, "-I", "-B", str(payload / "scripts/query_worker.py"),
         "--duckdb-path", str(database), "--memory-limit", "512MB", "--sql", "SELECT 7 AS synthetic_value"],
        cwd=work, env=env, timeout=30,
    )
    assert worker.returncode == 0, worker.stdout + worker.stderr
    assert json.loads(worker.stdout)["rows"] == [[7]]
    assert hashlib.sha256(database.read_bytes()).hexdigest() == original_digest
