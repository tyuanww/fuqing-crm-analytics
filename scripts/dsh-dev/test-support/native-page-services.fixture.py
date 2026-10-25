import json
import os
from pathlib import Path
import sys
from threading import Thread
from time import monotonic, sleep

def main():
    ROOT = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(ROOT))

    import duckdb
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    import uvicorn
    from backend.services.crm_analysis import CrmAnalysisStore
    from backend.services.crm_native_snapshot_source import NativeCrmSnapshotSource
    from backend.services.crm_native_snapshot_host import create_native_crm_source_app

    config = json.loads(sys.stdin.readline())
    root = Path(config['root'])
    os.environ.update(PYTHON_DOTENV_DISABLED='1', FQ_CRM_PASSWORDS='fixture-user:native-fixture-password',
                      FQ_CRM_ADMINS='fixture-user', FQ_CRM_ANALYSIS_STATE_DIR=str(root / 'assets'),
                      FQ_CRM_ANALYSIS_DATA_KIND='synthetic', DUCKDB_PATH=str(root / 'fixture.duckdb'))
    from backend.routers import auth, crm_dashboard
    from backend.db import connection

    with duckdb.connect(str(root / 'fixture.duckdb')) as con:
        con.execute('CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, actual_amount DOUBLE, channel VARCHAR, pay_time TIMESTAMP, is_refund BOOLEAN, is_goujinjin BOOLEAN, order_status VARCHAR)')
        con.execute("INSERT INTO orders VALUES ('order1','user1',80.01,'货架','2026-01-01',false,false,'交易成功')")
    store = CrmAnalysisStore(root / 'assets', 'synthetic')
    NativeCrmSnapshotSource.create(directory=root / 'refs', store=store)
    crm = FastAPI()
    crm.include_router(auth.router)
    crm.include_router(crm_dashboard.router, prefix='/api/v1/metrics')
    state = {'available': True, 'authenticated': True}

    @crm.middleware('http')
    async def authenticate(request, call_next):
        if request.url.path.startswith('/api/v1/metrics') or request.url.path == '/api/v1/auth/me':
            if not state['available']:
                return JSONResponse({}, status_code=503)
            if not state['authenticated']:
                return JSONResponse({}, status_code=401)
            try:
                request.state.username = auth.get_current_username(request)
            except Exception:
                return JSONResponse({}, status_code=401)
        return await call_next(request)

    source = create_native_crm_source_app(store=store, directory=root / 'refs', host_origin=config['hostOrigin'], token_file=Path(config['tokenFile']))
    if '--check-crm' in sys.argv:
        from fastapi.testclient import TestClient
        with TestClient(crm) as client:
            login = client.post('/api/v1/auth/login', json={'username': 'fixture-user', 'password': 'native-fixture-password'})
            assert login.status_code == 200, login.text
            headers = {'authorization': 'Bearer ' + login.json()['token'], 'idempotency-key': 'component-check'}
            assert client.get('/api/v1/auth/me', headers=headers).status_code == 200
            captured = client.post('/api/v1/metrics/dashboard-snapshots', headers=headers, json={
                'start_date': '2026-01-01', 'end_date': '2026-01-02', 'channel': '全店', 'exclude_low_price': False})
            assert captured.status_code == 200, captured.text
            assert captured.json()['result']['gsv_amount_fen'] == 8001
            print(json.dumps({'checked': 'actual-crm-auth-capture', 'gsv_amount_fen': 8001}), flush=True)
        connection.close_connection()
        raise SystemExit(0)

    servers = [uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, log_level='critical', access_log=False))
               for app, port in [(crm, config['crmPort']), (source, config['sourcePort'])]]
    threads = [Thread(target=server.run) for server in servers]
    try:
        for thread in threads:
            thread.start()
        deadline = monotonic() + 8
        while not all(server.started for server in servers) and monotonic() < deadline:
            sleep(.01)
        assert all(server.started for server in servers), 'owned services failed to start'
        print(json.dumps({'ready': True}), flush=True)
        for line in sys.stdin:
            command = json.loads(line)
            if command['op'] == 'close':
                break
            if command['op'] == 'state':
                state.update(command['value'])
            print(json.dumps({'ok': True}), flush=True)
    finally:
        for server in servers:
            server.should_exit = True
        for thread in threads:
            thread.join(7)
        connection.close_connection()
        assert all(not thread.is_alive() for thread in threads)


if __name__ == "__main__":
    main()
