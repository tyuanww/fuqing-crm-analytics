"""Synthetic closeout: membership/net fail closed; purchases cover extra windows."""
from datetime import date

import duckdb
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.contracts.crm_dashboard import DashboardFilters
from backend.services.metrics.dashboard_membership import query_dashboard_membership
from backend.services.metrics.dashboard_net_gsv import query_dashboard_net_gsv
from backend.services.metrics.dashboard_purchases import query_dashboard_purchases
from backend.services.metrics.dashboard_source import query_dashboard_readiness

FILTERS = DashboardFilters(start_date=date(2026, 7, 1), end_date=date(2026, 7, 5))
BASE = '''order_id VARCHAR, user_id VARCHAR, actual_amount DECIMAL(18,2), pay_time TIMESTAMP,
    channel VARCHAR, is_goujinjin BOOLEAN, is_refund BOOLEAN, order_status VARCHAR'''


def archive_like():
    db = duckdb.connect(':memory:')
    db.execute(f'CREATE TABLE orders({BASE}, is_member BOOLEAN, refund_amount DECIMAL(18,2), sample_received_at TIMESTAMP)')
    db.execute('CREATE TABLE membership_mark(order_id VARCHAR, is_member BOOLEAN, loaded_at TIMESTAMP)')
    db.execute('CREATE TABLE user_first_purchase(user_id VARCHAR, first_pay_date DATE)')
    return db


def grain():
    db = duckdb.connect(':memory:')
    db.execute(f'CREATE TABLE orders({BASE}, membership_at_purchase VARCHAR, parent_order_id VARCHAR)')
    return db


def put_archive(db, order, buyer, amount, *, channel='货架', refund=False, paid='2026-07-01 12:00:00',
                is_member=False):
    db.execute('INSERT INTO orders VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, 0, NULL)',
               [order, buyer, amount, paid, channel, refund, '交易成功', is_member])


def put_grain(db, order, buyer, amount, *, channel='货架', refund=False, paid='2026-07-01 12:00:00',
              member='NON_MEMBER', parent=None):
    db.execute('INSERT INTO orders VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?)',
               [order, buyer, amount, paid, channel, refund, '交易成功', member, parent or order])


def test_archive_readiness_blocks_member_and_refund_substitutes():
    db = archive_like()
    try:
        result = query_dashboard_readiness(db)
        by_id = {item.metric_id: item for item in result.metrics}
        assert result.inventory.has_dashboard_gsv_fields
        assert result.inventory.has_is_member_current
        assert result.inventory.has_sample_received_at
        assert not result.inventory.has_membership_at_purchase
        assert not result.inventory.has_refund_events
        assert by_id['aov'].acceptance_class == 'A'
        assert by_id['aus'].acceptance_class == 'A'
        assert by_id['member_premium'].acceptance_class == 'C'
        assert by_id['net_gsv'].acceptance_class == 'C'
        assert by_id['new_old'].acceptance_class == 'C'
        assert by_id['sampling_profit_roi'].acceptance_class == 'C'
        assert not by_id['member_premium'].source_present
        joined = ' '.join(result.inventory.rejected_substitutes)
        assert 'is_member' in joined and 'refund_amount' in joined
    finally:
        db.close()


def test_is_member_cannot_compute_premium():
    db = archive_like()
    try:
        put_archive(db, 'a', 'u1', 80, is_member=True)
        put_archive(db, 'b', 'u2', 40, is_member=False)
        result = query_dashboard_membership(db, FILTERS)
        assert result.status == 'UNAVAILABLE'
        assert result.reason == 'MEMBERSHIP_AT_PURCHASE_UNAVAILABLE'
        assert result.premium.value is None
        assert result.member_aus is None
    finally:
        db.close()


def test_membership_at_purchase_is_multiple_and_unknown_is_separate():
    db = grain()
    try:
        put_grain(db, 'm1', 'm', 200, member='MEMBER')
        put_grain(db, 'm1b', 'm', 0, member='MEMBER')
        put_grain(db, 'n1', 'n1', 50, member='NON_MEMBER')
        put_grain(db, 'n2', 'n2', 50, member='NON_MEMBER')
        put_grain(db, 'u', 'ux', 90, member='UNKNOWN')
        put_grain(db, 'join', 'both', 50, member='NON_MEMBER')
        put_grain(db, 'join2', 'both', 100, member='MEMBER', paid='2026-07-03 12:00:00')
        result = query_dashboard_membership(db, FILTERS)
        assert result.status == 'OK'
        assert query_dashboard_readiness(db).metrics[3].acceptance_class == 'B'
        assert result.member_gsv_amount_fen == 30000
        assert result.non_member_gsv_amount_fen == 15000
        assert result.member_aus.amount_fen == 15000
        assert result.non_member_aus.amount_fen == 5000
        assert result.coverage.unknown_member_buyers == 1
        assert result.coverage.member_buyers == 2
        assert result.premium.value == 3.0
        assert result.premium.reason == 'UNKNOWN_IDENTITY'
    finally:
        db.close()


def test_zero_denominator_premium_is_empty():
    db = grain()
    try:
        put_grain(db, 'm1', 'm', 80, member='MEMBER')
        result = query_dashboard_membership(db, FILTERS)
        assert result.premium.value is None
        assert result.premium.reason == 'ZERO_DENOMINATOR'
    finally:
        db.close()


def test_net_gsv_unavailable_without_events():
    db = archive_like()
    try:
        put_archive(db, 'a', 'u1', 100)
        result = query_dashboard_net_gsv(db, FILTERS, date(2026, 7, 31))
        assert result.status == 'UNAVAILABLE'
        assert result.reason == 'MISSING_REFUND_EVENTS'
        assert result.net_gsv_amount_fen is None
    finally:
        db.close()


def test_net_gsv_partial_full_and_cross_period():
    db = grain()
    try:
        db.execute('''CREATE TABLE refunds(
            refund_id VARCHAR, order_id VARCHAR, refunded_at TIMESTAMP, amount_minor BIGINT,
            product_id VARCHAR, line_id VARCHAR, status VARCHAR, parent_order_id VARCHAR)''')
        put_grain(db, 'keep', 'u1', 100)
        put_grain(db, 'part', 'u2', 100)
        put_grain(db, 'full', 'u3', 80)
        put_grain(db, 'later', 'u4', 50, paid='2026-07-04 12:00:00')
        db.execute("INSERT INTO refunds VALUES ('r1','part','2026-07-02 10:00:00',3000,'p','1','SUCCEEDED','part')")
        db.execute("INSERT INTO refunds VALUES ('r2','full','2026-07-02 10:00:00',8000,'p','1','SUCCEEDED','full')")
        db.execute("INSERT INTO refunds VALUES ('r3','later','2026-08-02 10:00:00',5000,'p','1','SUCCEEDED','later')")
        db.execute("INSERT INTO refunds VALUES ('r4','part','2026-07-02 10:00:00',1000,'p','1','PENDING','part')")
        put_grain(db, 'outside', 'u5', 200, paid='2026-06-01 12:00:00')
        db.execute("INSERT INTO refunds VALUES ('r5','outside','2026-07-02 10:00:00',20000,'p','1','SUCCEEDED','outside')")
        july = query_dashboard_net_gsv(db, FILTERS, date(2026, 7, 31))
        august = query_dashboard_net_gsv(db, FILTERS, date(2026, 8, 31))
        assert july.status == august.status == 'OK'
        assert july.gross_paid_fen == 33000
        assert july.succeeded_refund_fen == 11000
        assert july.net_gsv_amount_fen == 22000
        assert august.net_gsv_amount_fen == 17000
        dashboard = query_dashboard_purchases(db, FILTERS)
        assert dashboard.gsv_amount_fen == 33000
        assert dashboard.gsv_amount_fen != august.net_gsv_amount_fen
        assert query_dashboard_readiness(db).metrics[4].acceptance_class == 'B'
        assert july.parent_child_attributed is True
    finally:
        db.close()


def test_net_gsv_parent_key_requires_both_sides():
    db = duckdb.connect(':memory:')
    try:
        db.execute(f'CREATE TABLE orders({BASE})')
        db.execute('''CREATE TABLE refunds(
            refund_id VARCHAR, order_id VARCHAR, refunded_at TIMESTAMP, amount_minor BIGINT,
            status VARCHAR, parent_order_id VARCHAR)''')
        db.execute("INSERT INTO orders VALUES ('child','u',100,'2026-07-01 12:00:00','货架',FALSE,FALSE,'交易成功')")
        db.execute("INSERT INTO refunds VALUES ('r','child','2026-07-02 10:00:00',3000,'SUCCEEDED','parent')")
        result = query_dashboard_net_gsv(db, FILTERS, date(2026, 7, 31))
        assert result.status == 'OK'
        assert result.parent_child_attributed is False
        assert result.succeeded_refund_fen == 3000
        assert result.net_gsv_amount_fen == 7000
    finally:
        db.close()


def test_net_gsv_refund_flag_conflicts_with_events():
    db = grain()
    try:
        db.execute('''CREATE TABLE refunds(
            refund_id VARCHAR, order_id VARCHAR, refunded_at TIMESTAMP, amount_minor BIGINT,
            product_id VARCHAR, line_id VARCHAR, status VARCHAR, parent_order_id VARCHAR)''')
        put_grain(db, 'keep', 'u1', 100)
        put_grain(db, 'flagged', 'u2', 80, refund=True)
        db.execute("INSERT INTO refunds VALUES ('r','flagged','2026-07-02 10:00:00',8000,'p','1','SUCCEEDED','flagged')")
        result = query_dashboard_net_gsv(db, FILTERS, date(2026, 7, 31))
        assert result.status == 'UNAVAILABLE'
        assert result.reason == 'AMOUNT_ALREADY_NET_CONFLICT'
        assert result.net_gsv_amount_fen is None
    finally:
        db.close()


def test_net_gsv_over_refund_not_clipped():
    db = grain()
    try:
        db.execute('''CREATE TABLE refunds(
            refund_id VARCHAR, order_id VARCHAR, refunded_at TIMESTAMP, amount_minor BIGINT,
            product_id VARCHAR, line_id VARCHAR, status VARCHAR, parent_order_id VARCHAR)''')
        put_grain(db, 'o', 'u', 50)
        db.execute("INSERT INTO refunds VALUES ('r','o','2026-07-02 10:00:00',8000,'p','1','SUCCEEDED','o')")
        result = query_dashboard_net_gsv(db, FILTERS, date(2026, 7, 31))
        assert result.net_gsv_amount_fen == -3000
        assert any('OVER_REFUND' in item for item in result.limitations)
    finally:
        db.close()


def test_purchases_cross_period_and_channels():
    db = archive_like()
    try:
        put_archive(db, 'shelf', 'u1', 30, channel='货架', paid='2026-07-05 23:00:00')
        put_archive(db, 'live', 'u2', 70, channel='达播', paid='2026-07-05 23:00:00')
        put_archive(db, 'next', 'u3', 90, channel='货架', paid='2026-07-06 00:00:00')
        week = query_dashboard_purchases(db, DashboardFilters(start_date=date(2026, 7, 1), end_date=date(2026, 7, 7)))
        shelf = query_dashboard_purchases(db, DashboardFilters(
            start_date=date(2026, 7, 1), end_date=date(2026, 7, 5), channel='货架'))
        assert week.coverage.orders == 3
        assert week.gsv_amount_fen == 19000
        assert shelf.gsv_amount_fen == 3000
        assert shelf.coverage.buyers == 1
        empty = query_dashboard_purchases(db, DashboardFilters(
            start_date=date(2026, 7, 1), end_date=date(2026, 7, 5), channel='淘客'))
        assert empty.aov.reason == 'NO_PURCHASES'
        assert empty.aus.amount_fen is None
    finally:
        db.close()


def test_endpoints_auth_and_contract(monkeypatch):
    db = grain()
    put_grain(db, 'a', 'u1', 25, member='NON_MEMBER')
    from backend.routers import metrics
    monkeypatch.setattr(metrics, 'get_connection', lambda: db)
    monkeypatch.setattr(metrics, 'check_future_date', lambda _: None)
    app = FastAPI()
    app.include_router(metrics.router)
    try:
        with TestClient(app) as client:
            params = {'start_date': '2026-07-01', 'end_date': '2026-07-05'}
            ready = client.get('/api/v1/metrics/dashboard-readiness')
            assert ready.status_code == 200
            assert ready.json()['metrics'][0]['metric_id'] == 'dashboard_gsv'
            member = client.get('/api/v1/metrics/dashboard-membership', params=params)
            assert member.status_code == 200
            assert member.json()['status'] == 'OK'
            net = client.get('/api/v1/metrics/dashboard-net-gsv', params={**params, 'refund_as_of': '2026-07-31'})
            assert net.status_code == 200
            assert net.json()['status'] == 'UNAVAILABLE'
            assert client.get('/api/v1/metrics/dashboard-net-gsv', params=params).status_code == 422
    finally:
        db.close()


def test_anonymous_readiness_blocked(monkeypatch):
    from backend.main import app
    from backend.routers import metrics

    def forbidden():
        pytest.fail('unauthenticated request reached database')
    monkeypatch.setattr(metrics, 'get_connection', forbidden)
    client = TestClient(app, base_url='http://127.0.0.1')
    assert client.get('/api/v1/metrics/dashboard-readiness').status_code == 401
    assert client.get('/api/v1/metrics/dashboard-membership',
                      params={'start_date': '2026-07-01', 'end_date': '2026-07-05'}).status_code == 401
