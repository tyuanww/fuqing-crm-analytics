"""Small isolated DuckDB only; independent hand-computed dashboard denominators."""
from datetime import date

import duckdb
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.contracts.crm_dashboard import DashboardFilters
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases


@pytest.fixture
def conn():
    with duckdb.connect(':memory:') as db:
        db.execute('''CREATE TABLE orders(order_id VARCHAR, user_id VARCHAR, actual_amount DECIMAL(18,2),
            pay_time TIMESTAMP, channel VARCHAR, is_goujinjin BOOLEAN, is_refund BOOLEAN, order_status VARCHAR)''')
        yield db


def put(db, order, buyer, amount, channel='货架', refund=False, paid='2026-07-01 12:00:00'):
    db.execute('INSERT INTO orders VALUES (?, ?, ?, ?, ?, FALSE, ?, ?)',
               [order, buyer, amount, paid, channel, refund, '交易成功'])


def query(db, **extra):
    return query_dashboard_purchases(db, DashboardFilters(start_date=date(2026, 7, 1), end_date=date(2026, 7, 5), **extra))


def test_multi_line_order_and_buyer_without_first_purchase_row(conn):
    put(conn, 'a', 'u1', 60)
    put(conn, 'a', 'u1', 40)
    put(conn, 'b', 'u1', 50)
    put(conn, 'c', 'u2', 50)
    put(conn, 'refund', 'u3', 900, refund=True)
    put(conn, 'outside', 'u4', 900, paid='2026-07-06 00:00:00')
    result = query(conn)
    assert result.gsv_amount_fen == 20000
    assert result.coverage.rows == 4
    assert result.coverage.orders == 3
    assert result.coverage.buyers == 2
    assert result.aov.amount_fen == 6667
    assert result.aus.amount_fen == 10000
    assert result.aov.reason is result.aus.reason is None
    # No first-purchase table exists, and the service must not close its owner's connection.
    assert conn.execute('SELECT COUNT(*) FROM orders').fetchone()[0] == 6


@pytest.mark.parametrize('missing', [None, '', '   '])
def test_unknown_keys_block_only_corresponding_mean(conn, missing):
    put(conn, missing, 'known', 40)
    put(conn, 'known', missing, 60)
    result = query(conn)
    assert result.gsv_amount_fen == 10000
    assert result.aov.amount_fen is result.aus.amount_fen is None
    assert result.aov.reason == 'UNKNOWN_ORDER'
    assert result.aus.reason == 'UNKNOWN_BUYER'
    assert result.coverage.unknown_order_amount_fen == 4000
    assert result.coverage.unknown_buyer_amount_fen == 6000


@pytest.mark.parametrize('amount,reason', [(-1, 'INVALID_AMOUNT'), (None, 'INVALID_AMOUNT')])
def test_anomalies_not_silently_guessed(conn, amount, reason):
    put(conn, 'a', 'u1', amount)
    put(conn, 'b', 'u2', 20)
    result = query(conn)
    assert result.aov.reason == result.aus.reason == reason
    assert result.aov.amount_fen is result.aus.amount_fen is None


def test_empty_is_no_purchases_and_not_zero_average(conn):
    result = query(conn)
    assert result.gsv_amount_fen == 0
    assert result.aov.reason == result.aus.reason == 'NO_PURCHASES'
    assert result.aov.amount_fen is None


def test_combined_channel_and_low_price_share_dashboard_filter(conn):
    put(conn, 'a', 'u1', 10, channel='U先派样')
    put(conn, 'b', 'u2', 20, channel='百补派样')
    put(conn, 'c', 'u3', 30)
    assert query(conn, channel='纯派样').gsv_amount_fen == 3000
    assert query(conn, exclude_low_price=True).gsv_amount_fen == 3000
    assert query(conn, channel='纯派样', exclude_low_price=True).coverage.rows == 0


def test_microsecond_end_and_half_up(conn):
    put(conn, 'a', 'u1', '0.01', paid='2026-07-05 23:59:59.999999')
    put(conn, 'b', 'u2', '0.02')
    result = query(conn)
    assert result.gsv_amount_fen == 3
    assert result.aov.amount_fen == 2


def test_endpoint_contract_and_reject_unbounded_dates(conn, monkeypatch):
    from backend.routers import metrics
    monkeypatch.setattr(metrics, 'get_connection', lambda: conn)
    monkeypatch.setattr(metrics, 'check_future_date', lambda _: None)
    app = FastAPI()
    app.include_router(metrics.router)
    put(conn, 'a', 'u1', 25)
    with TestClient(app) as client:
        params = {'start_date': '2026-07-01', 'end_date': '2026-07-05'}
        result = client.get('/api/v1/metrics/dashboard-purchases', params=params)
        assert result.status_code == 200, result.text
        assert result.json()['aov']['amount_fen'] == 2500
        for extra in [{'end_date': '2026-06-30'}, {'end_date': '2027-01-01'}, {'channel': "x' OR 1=1"}, {'start_date': '2026-02-30'}]:
            assert client.get('/api/v1/metrics/dashboard-purchases', params={**params, **extra}).status_code == 422


def test_main_auth_blocks_anonymous_purchase_query(monkeypatch):
    from backend.main import app
    from backend.routers import metrics
    def forbidden():
        pytest.fail('unauthenticated request reached database')
    monkeypatch.setattr(metrics, 'get_connection', forbidden)
    # No lifespan: never starts legacy database services.
    client = TestClient(app, base_url='http://127.0.0.1')
    result = client.get('/api/v1/metrics/dashboard-purchases',
                        params={'start_date': '2026-07-01', 'end_date': '2026-07-05'})
    assert result.status_code == 401


def test_zero_orders_and_zero_only_buyers_are_separate(conn):
    put(conn, 'paid', 'buyer', 100)
    put(conn, 'paid', 'buyer', 0)  # Free line on a paid order does not remove the order.
    put(conn, 'gift', 'gift-only', 0)
    put(conn, 'gift2', 'buyer', 0)  # Paid buyer is not a zero-only buyer.
    result = query(conn)
    assert result.gsv_amount_fen == 10000
    assert result.coverage.orders == result.coverage.buyers == 1
    assert result.coverage.zero_amount_orders == 2
    assert result.coverage.zero_only_buyers == 1
    assert result.aov.amount_fen == result.aus.amount_fen == 10000


def test_only_free_orders_have_no_purchase_average(conn):
    put(conn, 'gift', 'gift-only', 0)
    result = query(conn)
    assert result.gsv_amount_fen == 0
    assert result.aov.reason == result.aus.reason == 'NO_PURCHASES'
    assert result.coverage.orders == result.coverage.buyers == 0
    assert result.coverage.zero_amount_orders == result.coverage.zero_only_buyers == 1


def test_unknown_order_cannot_establish_a_paid_buyer(conn):
    put(conn, None, 'known', 100)
    result = query(conn)
    assert result.coverage.buyers == 0
    assert result.aus.reason == 'UNKNOWN_ORDER'
    assert result.aus.amount_fen is None


def test_numerator_matches_existing_dashboard_calculation(conn, monkeypatch):
    from backend.services.metrics import overview
    monkeypatch.setattr(overview, 'get_connection', lambda: conn)
    put(conn, 'a', 'u1', 120)
    put(conn, 'a', 'u1', 30)
    put(conn, 'b', 'u2', 0)
    put(conn, 'refund', 'u3', 900, refund=True)
    baseline = overview.calculate_metrics('2026-07-01', '2026-07-05', 'GSV')
    result = query(conn)
    assert result.gsv_amount_fen == round(baseline['amount'] * 100) == 15000
    assert result.coverage.orders == 1
    assert baseline['order_count'] == 2  # Intentional: confirmed zero-order exclusion only in new means.
