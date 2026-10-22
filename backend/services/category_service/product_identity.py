"""Stable product identities for user-facing product cohort results."""

from __future__ import annotations

from types import MappingProxyType
from typing import Iterable

PRODUCT_DISPLAY_NAMES = MappingProxyType({
    "传明酸面膜": "爆款面膜A",
    "凉茶面膜": "爆款面膜B",
    "水杨酸涂抹面膜": "爆款面膜C",
    "童颜乳酸面膜": "爆款面膜D",
    "经典膜": "爆款面膜E",
    "凉茶次抛": "爆款次抛A",
    "童颜乳酸次抛": "爆款次抛B",
    "凉茶水乳": "爆款水乳A",
    "胶原水乳": "爆款水乳B",
    "凉茶面霜": "爆款面霜",
    "医用凝胶": "爆款凝胶",
    "医用洁面": "爆款洁面",
    "白膜": "爆款品类A",
    "祛痘精华": "爆款品类B",
    "黑膜": "爆款品类C",
})

PRODUCT_ALIASES = MappingProxyType({
    **{name: name for name in PRODUCT_DISPLAY_NAMES},
    **{display_name: name for name, display_name in PRODUCT_DISPLAY_NAMES.items()},
})


def resolve_product_names(products: Iterable[str]) -> list[str]:
    if len(set(PRODUCT_DISPLAY_NAMES.values())) != len(PRODUCT_DISPLAY_NAMES):
        raise RuntimeError("商品展示名必须唯一")
    names: list[str] = []
    for product in products:
        name = PRODUCT_ALIASES.get(product)
        if name is None:
            raise ValueError(f"未登记商品: {product}")
        if name in names:
            raise ValueError(f"商品选择重复: {product}")
        names.append(name)
    return names
