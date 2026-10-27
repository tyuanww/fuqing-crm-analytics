"""Synthetic semantic selection only; does not prove authorization or page trust."""
from copy import deepcopy

import pytest

from backend.services.analytics.warehouse_fact_selection import (
    FactSelectionError, FactValue, ProductFact, PurchaseFact, RfmFact,
    select_fact, select_facts,
)
from backend.services.analytics.warehouse_page_projection import (
    PRODUCT_UNITS, PRODUCT_YOY_UNITS, RFM_UNITS, PROJECTION, warehouse_projection,
)
from backend.tests.test_warehouse_page_source import envelope, snapshot_case, source_value
from backend.tests.test_warehouse_native_source import capture
from backend.tests.test_warehouse_product_runtime import runtime_case

GROUPS = ('rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows')


def summary(family):
    return {'projection_version': PROJECTION, 'family': family,
            'GSV': -999, 'orders': -999, 'amount_fen': -999}


@pytest.mark.parametrize('metric,field,unit', [
    ('GSV', 'amount_fen', 'CNY fen'), ('AOV', 'amount_fen', 'CNY fen/order'),
    ('AUS', 'amount_fen', 'CNY fen/buyer'), ('orders', 'count', 'orders'),
    ('buyers', 'count', 'buyers'),
])
def test_purchase_uses_rows_and_exact_value(metric, field, unit):
    value = '900719925474099312345678901234567890'
    row = {'metric': metric, field: value, 'unit': unit}
    assert select_fact(summary('purchases'), [row], PurchaseFact(metric)) == FactValue(value, unit)
    row['unit'] = 'CNY'
    with pytest.raises(FactSelectionError):
        select_fact(summary('purchases'), [row], PurchaseFact(metric))


@pytest.mark.parametrize('family,key', [('analysis', 'rfm_segment'), ('r', 'r_segment'),
                                        ('f', 'f_segment'), ('m', 'm_segment')])
def test_four_groups_and_every_rfm_field(family, key):
    rows = [{'group': group, key: '近4-6月已购客',
             **dict.fromkeys(RFM_UNITS, i)} for i, group in enumerate(GROUPS)]
    for i, group in enumerate(GROUPS):
        for field, unit in RFM_UNITS.items():
            assert select_fact(summary(family), rows[::-1], RfmFact(group, '近4-6月已购客', field)) == FactValue(i, unit)
    with pytest.raises(FactSelectionError):
        select_fact(summary(family), rows, RfmFact('rows', '近4-6个月已购客', 'hist_users_current'))
    wrong = [{**rows[0], 'wrong_segment': rows[0][key]}]
    del wrong[0][key]
    with pytest.raises(FactSelectionError):
        select_fact(summary(family), wrong, RfmFact('rows', '近4-6月已购客', 'hist_users_current'))


def test_product_all_periods_over_64_cells_and_no_mutation():
    rows = [{'product': f'合成商品{i}', **{period: dict.fromkeys(units, i)
             for period, units in [('current', PRODUCT_UNITS), ('comparison', PRODUCT_UNITS),
                                   ('yoy', PRODUCT_YOY_UNITS)]}} for i in range(15)]
    selectors = [ProductFact(row['product'], period, field) for row in rows
                 for period, units in [('current', PRODUCT_UNITS), ('comparison', PRODUCT_UNITS),
                                       ('yoy', PRODUCT_YOY_UNITS)] for field in units]
    before = deepcopy(rows)
    values = select_facts(summary('product'), rows, selectors)
    expected = [FactValue(i, unit) for i in range(15) for units in
                (PRODUCT_UNITS, PRODUCT_UNITS, PRODUCT_YOY_UNITS) for unit in units.values()]
    assert len(values) > 64
    assert values == tuple(expected)
    assert rows == before


@pytest.mark.parametrize('family,rows,selector', [
    ('purchases', [{'metric': 'GSV', 'unit': 'CNY fen', 'amount_fen': None}], PurchaseFact('GSV')),
    ('analysis', [{'group': 'rows', 'rfm_segment': 'S', 'hist_users_current': None}], RfmFact('rows', 'S', 'hist_users_current')),
    ('product', [{'product': 'P', 'current': {'gsv': None}}], ProductFact('P', 'current', 'gsv')),
])
def test_null_missing_and_duplicate_rows(family, rows, selector):
    assert select_fact(summary(family), rows, selector).value is None
    with pytest.raises(FactSelectionError):
        select_fact(summary(family), rows * 2, selector)
    with pytest.raises(FactSelectionError):
        select_fact(summary(family), [], selector)
    if family == 'purchases':
        del rows[0]['amount_fen']
    elif family == 'analysis':
        del rows[0]['hist_users_current']
    else:
        del rows[0]['current']['gsv']
    with pytest.raises(FactSelectionError):
        select_fact(summary(family), rows, selector)


@pytest.mark.parametrize('selector', [ProductFact('P', 'current', '__class__'),
    ProductFact('P', 'yoy', 'member_gsv'), ProductFact('P', '../current', 'gsv'),
    ProductFact('', 'current', 'gsv'), ProductFact('missing-id', 'current', 'gsv'),
    PurchaseFact('gsv'), RfmFact('all', 'S', 'hist_users_current'),
    RfmFact('rows', '', 'hist_users_current'), RfmFact('rows', 'S', 'secret')])
def test_unknown_fields_and_identities_rejected(selector):
    family = 'product' if isinstance(selector, ProductFact) else 'purchases' if isinstance(selector, PurchaseFact) else 'analysis'
    rows = {
        'product': [{'product': 'P', 'current': {'gsv': 1}, 'yoy': {'member_gsv': 7}}],
        'purchases': [{'metric': 'GSV', 'unit': 'CNY fen', 'amount_fen': 1}],
        'analysis': [{'group': 'rows', 'rfm_segment': 'S', 'hist_users_current': 1}],
    }[family]
    with pytest.raises(FactSelectionError):
        select_fact(summary(family), rows, selector)


def test_duplicate_fields_and_wrong_family_rejected():
    selector = ProductFact('P', 'current', 'gsv')
    rows = [{'product': 'P', 'current': {'gsv': 1}}]
    with pytest.raises(FactSelectionError):
        select_facts(summary('product'), rows, [selector, selector])
    with pytest.raises(FactSelectionError):
        select_fact(summary('purchases'), [{'metric': 'GSV', 'unit': 'CNY fen', 'amount_fen': 1,
                                           'current': {'gsv': 7}}], ProductFact('GSV', 'current', 'gsv'))


@pytest.mark.parametrize('identity', ['', ' ', None])
def test_empty_source_identity_rejected(identity):
    with pytest.raises(FactSelectionError):
        select_fact(summary('product'), [{'product': identity, 'current': {'gsv': 1}}], ProductFact('P', 'current', 'gsv'))


@pytest.mark.parametrize('field', ['__class__', 'current.gsv', "gsv; DROP TABLE x", 'secret'])
def test_unknown_field_rejected_even_when_source_contains_it(field):
    with pytest.raises(FactSelectionError):
        select_fact(summary('product'), [{'product': 'P', 'current': {field: 7}}],
                    ProductFact('P', 'current', field))
    with pytest.raises(FactSelectionError):
        select_fact(summary('analysis'), [{'group': 'rows', 'rfm_segment': 'S', field: 7}],
                    RfmFact('rows', 'S', field))


@pytest.mark.parametrize('family,key', [('analysis', 'rfm_segment'), ('r', 'r_segment'),
                                       ('f', 'f_segment'), ('m', 'm_segment')])
def test_bigint_rfm_and_product(family, key):
    value = '900719925474099312345678901234567890'
    assert select_fact(summary(family), [{'group': 'rows', key: 'S', 'hist_users_current': value}],
                       RfmFact('rows', 'S', 'hist_users_current')) == FactValue(value, 'buyers')
    assert select_fact(summary('product'), [{'product': 'P', 'current': {'gsv': value}}],
                       ProductFact('P', 'current', 'gsv')) == FactValue(value, 'CNY')


def test_missing_group_does_not_fall_back_and_wrong_key_is_not_accepted():
    row = {'group': 'rows', 'rfm_segment': 'S', 'hist_users_current': 7}
    with pytest.raises(FactSelectionError):
        select_fact(summary('analysis'), [row], RfmFact('member_rows', 'S', 'hist_users_current'))
    with pytest.raises(FactSelectionError):
        select_fact(summary('analysis'), [{**row, 'r_segment': 'S'}], RfmFact('rows', 'S', 'hist_users_current'))


def test_missing_unit_period_and_duplicate_product_column_rejected():
    with pytest.raises(FactSelectionError):
        select_fact(summary('purchases'), [{'metric': 'GSV', 'amount_fen': 1}], PurchaseFact('GSV'))
    with pytest.raises(FactSelectionError):
        select_fact(summary('product'), [{'product': 'P'}], ProductFact('P', 'current', 'gsv'))
    with pytest.raises(FactSelectionError):
        select_fact(summary('product'), [{'product': 'P', 'current': None}], ProductFact('P', 'current', 'gsv'))


@pytest.mark.parametrize('value', ['not a number', 'NaN', 'Infinity', float('nan'), float('inf'), True])
def test_non_numeric_fact_values_rejected(value):
    row = {'metric': 'GSV', 'unit': 'CNY fen', 'amount_fen': value}
    with pytest.raises(FactSelectionError):
        select_fact(summary('purchases'), [row], PurchaseFact('GSV'))


@pytest.mark.parametrize('family', ['purchases', 'product', 'analysis', 'r', 'f', 'm'])
def test_select_from_actual_synthetic_warehouse_projection(snapshot_case, family):
    snapshot = capture(snapshot_case, family)
    result = snapshot['payload']['result']
    _, rows, meta, _ = warehouse_projection(envelope(snapshot), source_value()['ref'], 'synthetic')
    if family == 'purchases':
        assert select_fact(meta, rows, PurchaseFact('GSV')) == FactValue(result['gsv_amount_fen'], 'CNY fen')
    elif family == 'product':
        product = result['products'][0]
        assert select_fact(meta, rows, ProductFact(product['display_name'], 'current', 'gsv')) == FactValue(product['current']['gsv'], 'CNY')
    else:
        segment = {'analysis': 'rfm_segment', 'r': 'r_segment', 'f': 'f_segment', 'm': 'm_segment'}[family]
        row = result['rows'][0]
        assert select_fact(meta, rows, RfmFact('rows', row[segment], 'hist_users_current')) == FactValue(row['hist_users_current'], 'buyers')
