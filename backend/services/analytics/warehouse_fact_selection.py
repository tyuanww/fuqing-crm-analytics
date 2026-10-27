"""Pure selection from a complete, already authorized warehouse v1 projection.

No authorization, provenance verification, formatting or page certification occurs
here. Product names identify rows only within the supplied snapshot. Callers own
snapshot identity, completeness and authorization before calling these functions.
"""
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
import math
import re
from typing import Literal
from backend.contracts.page_facts import FACT_MAX_ITEMS

from backend.services.analytics.warehouse_page_projection import (
    PRODUCT_UNITS, PRODUCT_YOY_UNITS, PROJECTION, RFM_UNITS,
)


class FactSelectionError(ValueError):
    """Invalid projection, selector or source fact."""


class FactBudgetExceeded(FactSelectionError):
    """A complete view exceeds the bounded fact count."""


@dataclass(frozen=True)
class PurchaseFact:
    metric: Literal['GSV', 'AOV', 'AUS', 'orders', 'buyers']


@dataclass(frozen=True)
class RfmFact:
    group: Literal['rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows']
    segment: str
    field: str


@dataclass(frozen=True)
class ProductFact:
    display_name: str
    period: Literal['current', 'comparison', 'yoy']
    field: str


FactSelector = PurchaseFact | RfmFact | ProductFact


@dataclass(frozen=True)
class FactValue:
    value: int | float | str | None
    unit: str


_PURCHASE_FIELDS = {
    'GSV': ('amount_fen', 'CNY fen'),
    'AOV': ('amount_fen', 'CNY fen/order'),
    'AUS': ('amount_fen', 'CNY fen/buyer'),
    'orders': ('count', 'orders'),
    'buyers': ('count', 'buyers'),
}
_RFM_KEYS = {'analysis': 'rfm_segment', 'r': 'r_segment', 'f': 'f_segment', 'm': 'm_segment'}
_GROUPS = ('rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows')


def _identity(value: object) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise FactSelectionError('missing or empty identity')
    return value


def selector_mapping(selector: FactSelector) -> dict:
    kind = (
        'purchase' if isinstance(selector, PurchaseFact)
        else 'rfm' if isinstance(selector, RfmFact)
        else 'product'
    )
    return {'kind': kind, **asdict(selector)}


def _required(row: Mapping, field: str):
    if field not in row:
        raise FactSelectionError('missing field')
    return row[field]


def _unique_rows(rows: Sequence[Mapping], family: str) -> dict:
    indexed = {}
    for row in rows:
        if not isinstance(row, Mapping):
            raise FactSelectionError('invalid row')
        if family in _RFM_KEYS:
            group = _identity(row.get('group'))
            if group not in _GROUPS:
                raise FactSelectionError('unknown group')
            key_field = _RFM_KEYS[family]
            if any(key in row for key in _RFM_KEYS.values() if key != key_field):
                raise FactSelectionError('wrong segment key')
            key = (group, _identity(row.get(key_field)))
        else:
            key = _identity(row.get('metric' if family == 'purchases' else 'product'))
            if family == 'purchases' and key not in _PURCHASE_FIELDS:
                raise FactSelectionError('unknown metric')
        if key in indexed:
            raise FactSelectionError('duplicate row identity')
        indexed[key] = row
    return indexed


def select_facts(
    summary: Mapping, rows: Sequence[Mapping], selectors: Sequence[FactSelector],
) -> tuple[FactValue, ...]:
    """Select exact source values in request order; never truncate or coerce null.

    Duplicate addresses are rejected rather than silently overwriting fields.
    Unit catalogs are those of v1; purchase units must also match the source row.
    """
    family = summary.get('family')
    if summary.get('projection_version') != PROJECTION or family not in (*_RFM_KEYS, 'purchases', 'product'):
        raise FactSelectionError('unsupported projection')
    indexed = _unique_rows(rows, family)
    seen = set()
    facts = []
    for selector in selectors:
        if not isinstance(selector, (PurchaseFact, RfmFact, ProductFact)):
            raise FactSelectionError('unknown selector')
        if selector in seen:
            raise FactSelectionError('duplicate fact address')
        seen.add(selector)
        if isinstance(selector, PurchaseFact):
            if family != 'purchases' or selector.metric not in _PURCHASE_FIELDS:
                raise FactSelectionError('unknown purchase metric or wrong family')
            key = selector.metric
            field, unit = _PURCHASE_FIELDS[key]
        elif isinstance(selector, RfmFact):
            if family not in _RFM_KEYS or selector.group not in _GROUPS or selector.field not in RFM_UNITS:
                raise FactSelectionError('unknown RFM field, group or wrong family')
            key = (selector.group, _identity(selector.segment))
            field, unit = selector.field, RFM_UNITS[selector.field]
        else:
            if family != 'product' or selector.period not in ('current', 'comparison', 'yoy'):
                raise FactSelectionError('unknown product period or wrong family')
            units = PRODUCT_YOY_UNITS if selector.period == 'yoy' else PRODUCT_UNITS
            if selector.field not in units:
                raise FactSelectionError('unknown product field')
            key = _identity(selector.display_name)
            field, unit = selector.field, units[selector.field]
        if key not in indexed:
            raise FactSelectionError('missing row identity')
        row = indexed[key]
        if isinstance(selector, PurchaseFact) and _required(row, 'unit') != unit:
            raise FactSelectionError('purchase unit mismatch')
        if isinstance(selector, ProductFact):
            row = _required(row, selector.period)
            if not isinstance(row, Mapping):
                raise FactSelectionError('missing product period fields')
        value = _required(row, field)
        if (value is not None and (
            type(value) not in (int, float, str)
            or (type(value) is float and not math.isfinite(value))
            or (type(value) is str and not re.fullmatch(r'-?[0-9]+', value))
        )):
            raise FactSelectionError('invalid fact value')
        facts.append(FactValue(value, unit))
    return tuple(facts)


def select_fact(summary: Mapping, rows: Sequence[Mapping], selector: FactSelector) -> FactValue:
    return select_facts(summary, rows, (selector,))[0]


def snapshot_facts(summary: Mapping, rows: Sequence[Mapping]) -> list[dict]:
    family = summary.get('family')
    if len(rows) > FACT_MAX_ITEMS:
        raise FactBudgetExceeded('fact budget exceeded')
    indexed = _unique_rows(rows, family)
    width = (len(_PURCHASE_FIELDS) if family == 'purchases' else len(RFM_UNITS)
             if family in _RFM_KEYS else 2 * len(PRODUCT_UNITS) + len(PRODUCT_YOY_UNITS))
    count = width if family == 'purchases' else width * len(indexed)
    if count > FACT_MAX_ITEMS:
        raise FactBudgetExceeded('fact budget exceeded')
    if family == 'purchases':
        selectors = [PurchaseFact(metric) for metric in _PURCHASE_FIELDS]
    elif family in _RFM_KEYS:
        selectors = [RfmFact(group, segment, field)
                     for group, segment in indexed for field in RFM_UNITS]
    elif family == 'product':
        coverage = summary.get('coverage', {})
        if (summary.get('status') != 'OK' or coverage.get('current_status') != 'COMPLETE'
                or coverage.get('comparison_status') != 'COMPLETE'):
            raise FactSelectionError('incomplete product coverage')
        selectors = [ProductFact(product, period, field)
                     for product in indexed
                     for period, fields in (('current', PRODUCT_UNITS), ('comparison', PRODUCT_UNITS), ('yoy', PRODUCT_YOY_UNITS))
                     for field in fields]
    else:
        raise FactSelectionError('unsupported fact family')
    selected = select_facts(summary, rows, selectors)
    return [{'selector': selector_mapping(selector), 'value': fact.value, 'unit': fact.unit}
            for selector, fact in zip(selectors, selected, strict=True)]
