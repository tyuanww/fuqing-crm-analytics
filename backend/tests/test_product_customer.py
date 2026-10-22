"""Product-level customer aggregation uses one user identity across SPU classes."""

from __future__ import annotations

import pytest

from backend.services.category_service import product_customer


def _insert_order(handle, order_id: str, user_id: str, pay_time: str, amount: float, spu_class: str):
    handle.execute(
        """
        INSERT INTO orders (
            order_id, user_id, pay_time, actual_amount, channel,
            is_member, is_goujinjin, is_refund, order_status,
            product_id, spu_tier, spu_product_class, spu_product_subclass, spu_category
        )
        VALUES (?, ?, ?, ?, '货架', FALSE, FALSE, FALSE, '已付款', '', '护肤', ?, ?, '护肤')
        """,
        [order_id, user_id, pay_time, amount, spu_class, spu_class],
    )


def test_product_customer_deduplicates_users_across_spu_classes(
    tmp_duckdb_with_synthetic_orders,
    monkeypatch,
):
    handle = tmp_duckdb_with_synthetic_orders
    handle.executemany(
        "INSERT INTO user_first_purchase VALUES (?, ?::DATE)",
        [
            ("u_classic_old", "2025-06-01"),
            ("u_classic_new", "2026-07-01"),
        ],
    )
    _insert_order(handle, "classic-old-1", "u_classic_old", "2026-07-02 10:00:00", 100, "经典膜")
    _insert_order(handle, "classic-old-2", "u_classic_old", "2026-07-02 11:00:00", 50, "【妆】经典膜")
    _insert_order(handle, "classic-new-1", "u_classic_new", "2026-07-03 10:00:00", 40, "经典膜")
    _insert_order(handle, "classic-old-prev", "u_classic_old", "2025-07-02 10:00:00", 80, "经典膜")
    _insert_order(handle, "classic-new-prev", "u_classic_new", "2025-07-03 10:00:00", 20, "经典膜")

    monkeypatch.setattr(product_customer, "get_connection", lambda: handle)
    result = product_customer.get_product_customer_overview(
        "2026-07-01",
        "2026-07-05",
        products=["经典膜"],
    )

    assert result["schema_version"] == "product-customer/v1"
    assert result["source"] == "orders+user_first_purchase"
    assert result["new_old_cutoff"] == "2026-06-30"
    assert result["comparison_new_old_cutoff"] == "2025-06-30"
    assert result["data_cutoff"] == "2026-07-03"
    product = result["products"][0]
    assert product["status"] == "OK"
    assert product["current"] == {
        "gsv": 190.0,
        "users": 2,
        "aus": 95.0,
        "old_gsv": 150.0,
        "old_users": 1,
        "old_aus": 150.0,
        "old_ratio": 0.7895,
        "new_gsv": 40.0,
        "new_users": 1,
        "new_aus": 40.0,
        "new_ratio": 0.2105,
        "member_gsv": 0.0,
        "member_users": 0,
        "member_aus": 0.0,
        "member_ratio": 0.0,
        "old_users_ratio": 0.5,
        "new_users_ratio": 0.5,
    }
    assert product["comparison"]["gsv"] == 100.0
    assert product["comparison"]["users"] == 2
    assert product["yoy"]["gsv"] == 0.9


def test_product_customer_rejects_unknown_products(monkeypatch, tmp_duckdb_with_synthetic_orders):
    monkeypatch.setattr(
        product_customer,
        "get_connection",
        lambda: tmp_duckdb_with_synthetic_orders,
    )
    with pytest.raises(ValueError, match="未登记商品"):
        product_customer.get_product_customer_overview(
            "2026-07-01",
            "2026-07-05",
            products=["不存在的商品"],
        )


def test_product_customer_uses_same_natural_day_last_year(monkeypatch, tmp_duckdb_with_synthetic_orders):
    monkeypatch.setattr(
        product_customer,
        "get_connection",
        lambda: tmp_duckdb_with_synthetic_orders,
    )
    result = product_customer.get_product_customer_overview(
        "2024-02-29",
        "2024-03-01",
        products=["经典膜"],
    )

    assert result["compare_start_date"] == "2023-02-28"
    assert result["compare_end_date"] == "2023-03-01"
    assert result["new_old_cutoff"] == "2024-01-31"
    assert result["comparison_new_old_cutoff"] == "2023-01-31"


def test_product_customer_rejects_gmv_until_amount_fields_are_neutral(monkeypatch, tmp_duckdb_with_synthetic_orders):
    monkeypatch.setattr(
        product_customer,
        "get_connection",
        lambda: tmp_duckdb_with_synthetic_orders,
    )
    with pytest.raises(ValueError, match="只支持 GSV"):
        product_customer.get_product_customer_overview(
            "2026-07-01",
            "2026-07-05",
            products=["经典膜"],
            metric_type="GMV",
        )


def test_product_customer_route_is_read_only_post():
    from backend.routers.category import router

    route = next(item for item in router.routes if item.path == "/api/v1/category/product-customer")
    assert route.methods == {"POST"}
