from dataclasses import replace
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import Mock

import duckdb
from pydantic import TypeAdapter, ValidationError
import pytest

from backend.contracts.crm_analysis import CrmSnapshotRequest
from backend.contracts.warehouse_snapshot import WarehouseSnapshotRequest
from backend.services.category_service import product_customer
from backend.services.warehouse_cache import AggregateCacheMissError
from backend.services.warehouse_runtime import purchases_semantic_revision, rfm_semantic_revision
from backend.services.warehouse_source import VerifiedWarehouseSource
from backend.tests.test_warehouse_product_runtime import runtime_case as runtime_case


EXPECTED = json.loads((Path(__file__).parent / 'fixtures/warehouse_reporting_windows.json').read_text())


@pytest.mark.parametrize('family', ['product', 'purchases'])
@pytest.mark.parametrize('start,end', [('2026-04-01', '2026-06-30'), ('2026-01-01', '2026-06-30'),
                                      ('2024-01-01', '2024-03-31'), ('2024-01-01', '2024-06-30')])
def test_reporting_contract_preserves_complete_dates_and_legacy_limit(family, start, end):
    filters = {'start_date': start, 'end_date': end}
    result = TypeAdapter(WarehouseSnapshotRequest).validate_python({'family': family, 'filters': filters})
    assert result.filters.model_dump(mode='json')['end_date'] == end
    with pytest.raises(ValidationError):
        CrmSnapshotRequest.model_validate(filters)


@pytest.mark.parametrize('start,end', [('2026-01-02', '2026-06-30'), ('2026-01-01', '2026-06-29'),
                                      ('2026-02-01', '2026-05-31'), ('2026-01-01', '2026-12-31')])
def test_partial_long_windows_remain_rejected(start, end):
    for family in ('product', 'purchases'):
        with pytest.raises(ValidationError):
            TypeAdapter(WarehouseSnapshotRequest).validate_python({
                'family': family, 'filters': {'start_date': start, 'end_date': end}})


@pytest.fixture
def reporting_runtime(runtime_case):
    runtime, spec, source_dir = runtime_case
    runtime.source.close()
    with duckdb.connect(str(spec.database_path)) as conn:
        conn.execute('DELETE FROM orders')
        conn.executemany("INSERT INTO orders VALUES (?, ?, ?::TIMESTAMP, ?, '货架', false, false, false, '已付款', '白膜')",
                         EXPECTED['historical_orders'] + EXPECTED['current_orders'])
        conn.execute('DROP TABLE user_first_purchase')
        conn.execute('CREATE TABLE user_first_purchase AS SELECT user_id, MIN(pay_time)::DATE AS first_pay_date FROM orders GROUP BY user_id')
    source = VerifiedWarehouseSource.seal(spec, source_dir, connect=lambda: duckdb.connect(str(spec.database_path), read_only=True))
    try:
        yield replace(runtime, source=source, semantic_revisions={**runtime.semantic_revisions,
                      'purchases': purchases_semantic_revision(), 'rfm': rfm_semantic_revision()})
    finally:
        source.close()


def test_full_windows_compute_distinct_users_and_purchase_denominators(reporting_runtime, monkeypatch):
    from backend.contracts.warehouse_snapshot import WarehouseDateFilters
    from backend.services import warehouse_purchases

    runtime = reporting_runtime
    actual = {}
    for name, expected in EXPECTED['windows'].items():
        filters = WarehouseDateFilters(start_date=expected['start'], end_date=expected['end'])
        with runtime.read(mode='compute'):
            purchases = warehouse_purchases.get_warehouse_purchases(filters)
            product = product_customer.get_product_customer_overview(expected['start'], expected['end'])
        row = next(value['current'] for value in product['products'] if value['display_name'] == '爆款面膜F')
        assert purchases.gsv_amount_fen == expected['gsv_yuan'] * 100
        assert purchases.coverage.buyers == purchases.aus.denominator == expected['buyers']
        assert purchases.coverage.orders == purchases.aov.denominator == expected['orders']
        assert purchases.aov.amount_fen == expected['aov_fen']
        assert purchases.aus.amount_fen == expected['aus_fen']
        for field in ('new_users', 'old_users', 'new_gsv', 'old_gsv'):
            assert row[field] == expected[field], (name, field, row)
        actual[name] = row['users']
    assert actual['H1'] == 4 and actual['H1'] != actual['Q1'] + actual['Q2']
    forbidden = Mock(side_effect=AssertionError('cached reporting window recomputed SQL'))
    monkeypatch.setattr(warehouse_purchases, 'query_dashboard_purchases', forbidden)
    monkeypatch.setattr(product_customer, '_period_metrics', forbidden)
    for expected in EXPECTED['windows'].values():
        with runtime.read():
            assert warehouse_purchases.get_warehouse_purchases(WarehouseDateFilters(
                start_date=expected['start'], end_date=expected['end'])).coverage.buyers == expected['buyers']
            product_customer.get_product_customer_overview(expected['start'], expected['end'])
    with runtime.read(), pytest.raises(AggregateCacheMissError):
        warehouse_purchases.get_warehouse_purchases(WarehouseDateFilters(start_date='2026-01-01', end_date='2026-06-30', channel='直播'))
    forbidden.assert_not_called()


def test_legacy_product_service_keeps_90_day_limit():
    with pytest.raises(ValueError, match='90'):
        product_customer.get_product_customer_overview('2026-01-01', '2026-06-30')


def test_reporting_prewarm_is_bounded_and_all_families_replay_hot(reporting_runtime, monkeypatch):
    from backend.services.warehouse_prewarm import WarmBudget, build_reporting_plan, run_warm_plan
    from backend.services import warehouse_purchases

    plan = build_reporting_plan(reporting_runtime, year=2026)
    assert len(plan.requests) == 18
    assert [request.query.period for request in plan.requests[::6]] == ['H1', 'Q1', 'Q2']
    assert {request.family for request in plan.requests} == {'product', 'purchases', 'analysis', 'r', 'f', 'm'}
    assert {(request.query.channel, request.query.metric_type, request.query.exclude_channels, request.query.compare_mode)
            for request in plan.requests} == {(None, 'GSV', (), 'default')}
    assert run_warm_plan(reporting_runtime, plan, WarmBudget(18, 20)).summary()['counts']['READY'] == 18
    forbidden = Mock(side_effect=AssertionError('hot replay executed purchases SQL'))
    monkeypatch.setattr(warehouse_purchases, 'query_dashboard_purchases', forbidden)
    hot = run_warm_plan(reporting_runtime, plan, WarmBudget(0, 20))
    assert hot.complete and hot.summary()['computed'] == 0
    assert hot.summary()['counts']['READY'] == 18
    forbidden.assert_not_called()


def test_reporting_cli_replays_all_18_results_in_a_fresh_process(reporting_runtime, tmp_path):
    runtime = reporting_runtime
    state = tmp_path / 'reporting-state'
    state.mkdir(mode=0o700)
    with runtime.read() as frame:
        source_path = frame.source.database_path
        source_id = frame.pin.identity.source_id
    root = Path(__file__).resolve().parents[2]
    env = {'PATH': os.environ['PATH'], 'PYTHONPATH': str(root), 'PYTHON_DOTENV_DISABLED': '1',
           'DUCKDB_PATH': str(source_path), 'FQ_WAREHOUSE_STATE_DIR': str(state),
           'FQ_WAREHOUSE_SOURCE_ID': source_id, 'FQ_WAREHOUSE_DATA_KIND': 'synthetic',
           'DUCKDB_MEMORY_LIMIT': '256MB', 'DUCKDB_THREADS': '1'}
    for budget in (18, 0):
        result = subprocess.run([sys.executable, '-m', 'scripts.etl.prewarm_verified_warehouse',
                                 '--execute', '--reporting-year', '2026', '--max-new-results', str(budget),
                                 '--max-seconds', '30'], cwd=root, env=env, capture_output=True, text=True, timeout=45)
        assert result.returncode == 0, result.stderr
        summary = json.loads(result.stdout)
        assert summary['expected'] == summary['counts']['READY'] == 18
        assert summary['computed'] == budget
