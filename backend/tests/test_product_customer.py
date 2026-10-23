"""Product-level customer aggregation uses one user identity across SPU classes."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

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


def test_product_display_names_form_one_disjoint_unique_alias_space():
    internal_names = set(product_customer.PRODUCT_DISPLAY_NAMES)
    display_names = set(product_customer.PRODUCT_DISPLAY_NAMES.values())
    assert internal_names.isdisjoint(display_names)
    assert len(display_names) == len(product_customer.PRODUCT_DISPLAY_NAMES)
    assert product_customer.PRODUCT_DISPLAY_NAMES["白膜"] == "爆款面膜F"
    assert product_customer.PRODUCT_DISPLAY_NAMES["黑膜"] == "爆款面膜G"
    assert product_customer.PRODUCT_DISPLAY_NAMES["祛痘精华"] == "爆款精华A"


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
        "2026-07-03",
        products=["经典膜"],
    )

    assert result["schema_version"] == "product-customer/v3"
    assert result["status"] == "OK"
    assert result["coverage"]["current_status"] == "COMPLETE"
    assert result["coverage"]["comparison_status"] == "COMPLETE"
    assert result["source"] == "orders+user_first_purchase"
    assert result["new_old_cutoff"] == "2026-06-30"
    assert result["comparison_new_old_cutoff"] == "2025-06-30"
    assert result["data_cutoff"] == "2026-07-03"
    product = result["products"][0]
    assert product["status"] == "OK"
    assert product["display_name"] == product_customer.PRODUCT_DISPLAY_NAMES["经典膜"]
    assert product["display_name"].startswith("爆款面膜")
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


def test_product_customer_refuses_queries_after_data_cutoff(
    monkeypatch,
    tmp_duckdb_with_synthetic_orders,
):
    handle = tmp_duckdb_with_synthetic_orders
    handle.execute(
        "INSERT INTO user_first_purchase VALUES (?, ?::DATE)",
        ["u_coverage", "2026-07-01"],
    )
    _insert_order(handle, "coverage-order", "u_coverage", "2026-07-03 10:00:00", 100, "经典膜")
    monkeypatch.setattr(product_customer, "get_connection", lambda: handle)

    result = product_customer.get_product_customer_overview(
        "2026-07-06",
        "2026-07-07",
        products=["经典膜"],
    )

    assert result["schema_version"] == "product-customer/v3"
    assert result["status"] == "INSUFFICIENT_COVERAGE"
    assert result["products"] == []
    assert result["coverage"]["data_cutoff"] == "2026-07-03"
    assert result["coverage"]["current_status"] == "INSUFFICIENT"


def test_product_customer_uses_window_start_minus_one_for_mid_month_windows(
    monkeypatch,
    tmp_duckdb_with_synthetic_orders,
):
    handle = tmp_duckdb_with_synthetic_orders
    handle.execute(
        "INSERT INTO user_first_purchase VALUES (?, ?::DATE)",
        ["u_mid_month", "2026-07-01"],
    )
    _insert_order(handle, "mid-month-order", "u_mid_month", "2026-07-20 10:00:00", 100, "经典膜")
    monkeypatch.setattr(product_customer, "get_connection", lambda: handle)

    result = product_customer.get_product_customer_overview(
        "2026-07-15",
        "2026-07-20",
        products=["经典膜"],
        compare_start_date="2025-07-15",
        compare_end_date="2025-07-20",
    )

    assert result["new_old_cutoff"] == "2026-07-14"
    assert result["comparison_new_old_cutoff"] == "2025-07-14"
    assert result["products"][0]["current"]["new_users"] == 0
    assert result["products"][0]["current"]["old_users"] == 1
    assert result["data_version"].startswith("orders-v1:")


def test_product_customer_refuses_queries_before_data_start(
    monkeypatch,
    tmp_duckdb_with_synthetic_orders,
):
    monkeypatch.setattr(product_customer, "get_connection", lambda: tmp_duckdb_with_synthetic_orders)
    result = product_customer.get_product_customer_overview(
        "2023-07-01",
        "2023-07-03",
        products=["经典膜"],
        compare_start_date="2022-07-01",
        compare_end_date="2022-07-03",
    )

    assert result["status"] == "INSUFFICIENT_COVERAGE"
    assert result["products"] == []
    assert result["coverage"]["current_status"] == "INSUFFICIENT"
    assert result["coverage"]["comparison_status"] == "INSUFFICIENT"


def test_product_customer_refuses_unknown_first_purchase_history(
    monkeypatch,
    tmp_duckdb_with_synthetic_orders,
):
    handle = tmp_duckdb_with_synthetic_orders
    _insert_order(handle, "missing-first-purchase", "u_missing_first", "2026-06-20 10:00:00", 100, "经典膜")
    monkeypatch.setattr(product_customer, "get_connection", lambda: handle)

    with pytest.raises(ValueError, match="首购历史不完整"):
        product_customer.get_product_customer_overview(
            "2026-06-15",
            "2026-06-20",
            products=["经典膜"],
        )


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


def test_product_customer_accepts_unique_display_name_alias(
    monkeypatch,
    tmp_duckdb_with_synthetic_orders,
):
    monkeypatch.setattr(
        product_customer,
        "get_connection",
        lambda: tmp_duckdb_with_synthetic_orders,
    )
    _insert_order(
        tmp_duckdb_with_synthetic_orders,
        "alias-order",
        "alias-user",
        "2026-07-03 10:00:00",
        100,
        "经典膜",
    )
    tmp_duckdb_with_synthetic_orders.execute(
        "INSERT INTO user_first_purchase VALUES (?, ?::DATE)",
        ["alias-user", "2026-07-03"],
    )
    display_name = product_customer.PRODUCT_DISPLAY_NAMES["经典膜"]
    result = product_customer.get_product_customer_overview(
        "2026-07-01",
        "2026-07-03",
        products=[display_name],
    )

    assert result["products"][0]["name"] == "经典膜"
    assert result["products"][0]["display_name"] == display_name


def test_product_customer_rejects_duplicate_raw_and_display_selection(
    monkeypatch,
    tmp_duckdb_with_synthetic_orders,
):
    monkeypatch.setattr(
        product_customer,
        "get_connection",
        lambda: tmp_duckdb_with_synthetic_orders,
    )
    display_name = product_customer.PRODUCT_DISPLAY_NAMES["经典膜"]
    with pytest.raises(ValueError, match="商品选择重复"):
        product_customer.get_product_customer_overview(
            "2026-07-01",
            "2026-07-05",
            products=["经典膜", display_name],
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
    assert result["new_old_cutoff"] == "2024-02-28"
    assert result["comparison_new_old_cutoff"] == "2023-02-27"


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


def test_product_customer_batch_route_serializes_bounded_windows(monkeypatch):
    from types import SimpleNamespace
    from backend.contracts.category import ProductCustomerBatchRequest
    from backend.routers.category import get_product_customer_batch_api, router

    route = next(item for item in router.routes if item.path == "/api/v1/category/product-customer/batch")
    assert route.methods == {"POST"}

    calls = []

    def fake_query(start_date, end_date, **kwargs):
        calls.append((start_date, end_date, kwargs))
        return {
            "schema_version": "product-customer/v3",
            "status": "OK",
            "source": "orders+user_first_purchase",
            "data_version": "orders-v1:fixture",
            "products": [],
        }

    monkeypatch.setattr("backend.routers.category.get_product_customer_overview", fake_query)
    result = get_product_customer_batch_api(
        ProductCustomerBatchRequest(ranges=[
            {"start_date": "2026-07-01", "end_date": "2026-07-05"},
            {"start_date": "2026-07-06", "end_date": "2026-07-10"},
        ]),
        SimpleNamespace(headers={"X-ShineMage-Product-Customer-Version": "product-customer/v3"}),
    )
    assert len(result["results"]) == 2
    assert [item[:2] for item in calls] == [
        ("2026-07-01", "2026-07-05"),
        ("2026-07-06", "2026-07-10"),
    ]


def test_product_customer_request_rejects_more_than_registered_products():
    from pydantic import ValidationError
    from backend.contracts.category import ProductCustomerRequest

    with pytest.raises(ValidationError):
        ProductCustomerRequest(
            start_date="2026-07-01",
            end_date="2026-07-05",
            products=[f"商品{i}" for i in range(16)],
        )


def test_product_customer_batch_requires_v3_contract(monkeypatch):
    from types import SimpleNamespace
    from backend.contracts.category import ProductCustomerBatchRequest
    from backend.routers.category import get_product_customer_batch_api

    body = ProductCustomerBatchRequest(ranges=[
        {"start_date": "2026-07-01", "end_date": "2026-07-05"},
    ])
    with pytest.raises(HTTPException) as error:
        get_product_customer_batch_api(body, SimpleNamespace(headers={
            "X-ShineMage-Product-Customer-Version": "product-customer/v2",
        }))
    assert error.value.status_code == 400


def test_product_customer_version_negotiation_keeps_v2_during_rollout():
    from backend.routers.category import select_product_customer_response

    result = {
        "schema_version": "product-customer/v3",
        "status": "OK",
        "products": [],
        "coverage": {},
    }
    assert select_product_customer_response(result, "product-customer/v3") is result
    v2 = select_product_customer_response(result, "product-customer/v2")
    assert v2["schema_version"] == "product-customer/v2"

    insufficient = {**result, "status": "INSUFFICIENT_COVERAGE"}
    with pytest.raises(HTTPException) as coverage_error:
        select_product_customer_response(insufficient, "product-customer/v2")
    assert coverage_error.value.status_code == 422

    with pytest.raises(HTTPException) as version_error:
        select_product_customer_response(result, "product-customer/v9")
    assert version_error.value.status_code == 400
