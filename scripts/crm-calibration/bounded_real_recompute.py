#!/usr/bin/env python3
"""Bounded real GSV/AOV/AUS expansion. DuckDB 1.5.3 read-only; never copies the archive."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = Path(os.environ.get(
    'FQ_BOUNDED_ARCHIVE',
    '/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/data/processed/fuqing_crm.duckdb'))
LIVE = os.environ.get('FQ_BOUNDED_CRM_ORIGIN', 'http://127.0.0.1:18093')
OUT = ROOT / '.context' / 'checks' / 'metric-closeout-real'
BASELINE_FEN = os.environ.get('FQ_BOUNDED_BASELINE_FEN', '').strip()
WINDOWS = [
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '全店', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-07', 'channel': '全店', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-31', 'channel': '全店', 'exclude_low_price': False},
    {'start_date': '2026-06-28', 'end_date': '2026-07-05', 'channel': '全店', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '货架', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '达播', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '直播', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '淘客', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '纯派样', 'exclude_low_price': False},
    {'start_date': '2026-07-01', 'end_date': '2026-07-05', 'channel': '全店', 'exclude_low_price': True},
]
BASELINE_WINDOW = ('2026-07-01', '2026-07-05', '全店', False)


def _public(row):
    coverage = row['purchases']['coverage']
    return {
        'filters': row['filters'], 'ok': row['ok'], 'elapsed_seconds': row['elapsed_seconds'],
        'unknown_order_rows': coverage['unknown_order_rows'], 'unknown_buyer_rows': coverage['unknown_buyer_rows'],
        'null_amount_rows': coverage['null_amount_rows'], 'negative_amount_rows': coverage['negative_amount_rows'],
        'zero_amount_orders': coverage['zero_amount_orders'], 'zero_only_buyers': coverage['zero_only_buyers'],
        'aov_reason': row['purchases']['aov']['reason'], 'aus_reason': row['purchases']['aus']['reason'],
        'gsv_matches_independent': row['gsv_matches_independent'],
        'overview_matches_purchases': row.get('overview_matches_purchases'),
        'baseline_matches': row.get('baseline_matches'),
    }


def main():
    import duckdb
    if duckdb.__version__ != '1.5.3':
        raise SystemExit(f'refuse archive engine upgrade: {duckdb.__version__}')
    if not ARCHIVE.is_file():
        raise SystemExit('archive missing')
    sys.path.insert(0, str(ROOT))
    os.environ['PYTHON_DOTENV_DISABLED'] = '1'
    from datetime import date
    from backend.contracts.crm_dashboard import DashboardFilters
    from backend.services.metrics.dashboard_purchases import dashboard_where, query_dashboard_purchases
    from backend.services.metrics.dashboard_source import query_dashboard_readiness
    from backend.semantic.dashboard_purchases import money_fen
    OUT.mkdir(parents=True, exist_ok=True)
    before = ARCHIVE.stat()
    started = time.monotonic()
    con = duckdb.connect(str(ARCHIVE), read_only=True, config={'threads': '2', 'memory_limit': '2GB'})
    public_rows = []
    private_rows = []
    try:
        readiness = query_dashboard_readiness(con).model_dump(mode='json')
        for item in WINDOWS:
            filters = DashboardFilters(
                start_date=date.fromisoformat(item['start_date']),
                end_date=date.fromisoformat(item['end_date']),
                channel=item['channel'], exclude_low_price=item['exclude_low_price'])
            t0 = time.monotonic()
            purchases = query_dashboard_purchases(con, filters)
            where, params = dashboard_where(filters)
            independent = con.execute(
                f'SELECT COALESCE(SUM(actual_amount),0) FROM orders o WHERE {where}', params).fetchone()[0]
            elapsed = round(time.monotonic() - t0, 3)
            gsv_fen = purchases.gsv_amount_fen
            independent_fen = money_fen(independent)
            payload = {
                'filters': item, 'ok': True, 'elapsed_seconds': elapsed,
                'purchases': purchases.model_dump(mode='json'),
                'gsv_matches_independent': gsv_fen == independent_fen,
                'independent_gsv_fen': independent_fen,
            }
            if (item['start_date'], item['end_date'], item['channel'], item['exclude_low_price']) == BASELINE_WINDOW:
                payload['baseline_matches'] = None if not BASELINE_FEN else gsv_fen == int(BASELINE_FEN)
            private_rows.append(payload)
            public_rows.append(_public(payload))
            flag = 'PASS' if payload['gsv_matches_independent'] else 'FAIL'
            print(flag, item['start_date'], item['end_date'], item['channel'],
                  'lowprice=' + str(item['exclude_low_price']), 'unknown_orders=' + str(purchases.coverage.unknown_order_rows),
                  'unknown_buyers=' + str(purchases.coverage.unknown_buyer_rows), f'{elapsed}s')
    finally:
        con.close()
    after = ARCHIVE.stat()
    unchanged = (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns)
    http = _http_readiness_and_sample()
    summary = {
        'engine': 'duckdb-1.5.3-readonly', 'archive_unchanged': unchanged,
        'elapsed_seconds': round(time.monotonic() - started, 3),
        'windows': public_rows, 'http': http,
        'readiness_classes': {item['metric_id']: item['acceptance_class'] for item in readiness['metrics']},
        'rejected_substitutes': readiness['inventory']['rejected_substitutes'],
        'source_present': {item['metric_id']: item['source_present'] for item in readiness['metrics']},
    }
    (OUT / 'public-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    private = OUT / 'private-amounts.json'
    private.write_text(json.dumps({'windows': private_rows, 'readiness': readiness}, ensure_ascii=False, indent=2))
    private.chmod(0o600)
    if not unchanged or any(not row['gsv_matches_independent'] for row in public_rows):
        raise SystemExit('bounded real recompute failed')
    print('ARCHIVE_UNCHANGED', unchanged, 'WINDOWS', len(public_rows))


def _http_readiness_and_sample():
    creds = os.environ.get('FQ_CRM_PASSWORDS', '')
    if not creds or ':' not in creds:
        return {'status': 'SKIPPED', 'reason': 'FQ_CRM_PASSWORDS not in environment'}
    user, password = creds.split(',', 1)[0].split(':', 1)
    try:
        login = _json('POST', f'{LIVE}/api/v1/auth/login', {'username': user.strip(), 'password': password})
        token = login.get('token')
        if not token:
            return {'status': 'FAIL', 'reason': 'login missing token'}
        headers = {'Authorization': f'Bearer {token}'}
        me = _json('GET', f'{LIVE}/api/v1/auth/me', headers=headers)
        if me.get('username') != user.strip():
            return {'status': 'FAIL', 'reason': 'account mismatch'}
        params = 'start_date=2026-07-01&end_date=2026-07-05&channel=%E5%85%A8%E5%BA%97&exclude_low_price=false'
        purchases = _json('GET', f'{LIVE}/api/v1/metrics/dashboard-purchases?{params}', headers=headers)
        overview = _json('GET', f'{LIVE}/api/v1/metrics/overview?start_date=2026-07-01&end_date=2026-07-05&metric_type=GSV',
                         headers=headers)
        from backend.semantic.dashboard_purchases import money_fen
        match = purchases.get('gsv_amount_fen') == money_fen(overview.get('amount'))
        return {
            'status': 'PASS' if match else 'FAIL',
            'username_present': True,
            'overview_matches_purchases': match,
            'unknown_order_rows': purchases.get('coverage', {}).get('unknown_order_rows'),
            'unknown_buyer_rows': purchases.get('coverage', {}).get('unknown_buyer_rows'),
        }
    except urllib.error.HTTPError as exc:
        return {'status': 'FAIL', 'reason': f'HTTP_{exc.code}'}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError) as exc:
        return {'status': 'FAIL', 'reason': type(exc).__name__}


def _json(method, url, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={'Accept': 'application/json', **(headers or {})})
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode())


if __name__ == '__main__':
    main()
