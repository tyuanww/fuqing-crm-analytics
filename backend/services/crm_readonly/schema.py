"""Whitelist table/column inspection. Extra undeclared tables are drift."""

from __future__ import annotations

from backend.services.crm_readonly.errors import SchemaMismatchError
from backend.services.crm_readonly.versions import (
    DECLARED_ORDERS_SCHEMA_VERSION,
    GRAIN_SCHEMA_VERSION,
)

GRAIN_TABLES = {
    "crm_source_meta": {
        "source_id",
        "mapping_version",
        "schema_version",
        "data_version",
        "contains_real_data",
        "timezone",
        "currency",
        "amount_unit",
        "amount_already_net",
        "coverage_start",
        "data_through",
        "history_complete",
    },
    "crm_order_line": {
        "order_id",
        "line_id",
        "user_id",
        "paid_at",
        "gross_paid_minor",
        "quantity",
        "product_id",
        "channel",
        "membership_at_purchase",
        "is_sample",
        "status",
        "event_seq",
    },
    "crm_refund_event": {
        "refund_id",
        "order_id",
        "refunded_at",
        "amount_minor",
        "product_id",
        "line_id",
        "status",
        "event_seq",
    },
}

DECLARED_REQUIRED = {
    "crm_source_meta": GRAIN_TABLES["crm_source_meta"],
    "orders": {
        "order_id",
        "sub_order_id",
        "user_id",
        "pay_time",
        "actual_amount",
        "quantity",
        "product_id",
        "channel",
        "is_member",
        "order_status",
        "refund_amount",
        "is_refund",
        "spu_type",
    },
}
DECLARED_OPTIONAL = {"refunds"}
DECLARED_FORBIDDEN_SELECT = {
    "user_nickname",
    "province",
    "city",
    "influencer_name",
    "influencer_id",
    "seller_note",
}


def _tables(connection) -> set[str]:
    rows = connection.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    return {str(row[0]) for row in rows}


def _columns(connection, table: str) -> set[str]:
    rows = connection.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'main' AND table_name = ?",
        [table],
    ).fetchall()
    return {str(row[0]) for row in rows}


def inspect_schema(connection, *, kind: str) -> dict:
    tables = _tables(connection)
    if kind == "SYNTHETIC_CONTRACT_GRAIN":
        expected = set(GRAIN_TABLES)
        extra = tables - expected
        missing = expected - tables
        if extra or missing:
            raise SchemaMismatchError(f"grain tables mismatch extra={sorted(extra)} missing={sorted(missing)}")
        for table, required in GRAIN_TABLES.items():
            have = _columns(connection, table)
            if not required <= have:
                raise SchemaMismatchError(f"{table} missing columns {sorted(required - have)}")
        return {"schema_version": GRAIN_SCHEMA_VERSION, "tables": sorted(tables), "has_refund_lines": True}
    if kind == "SYNTHETIC_DECLARED_ORDERS":
        extra = tables - set(DECLARED_REQUIRED) - DECLARED_OPTIONAL
        missing = set(DECLARED_REQUIRED) - tables
        if extra or missing:
            raise SchemaMismatchError(
                f"declared-orders tables mismatch extra={sorted(extra)} missing={sorted(missing)}"
            )
        for table, required in DECLARED_REQUIRED.items():
            have = _columns(connection, table)
            if not required <= have:
                raise SchemaMismatchError(f"{table} missing columns {sorted(required - have)}")
        refund_cols = _columns(connection, "refunds") if "refunds" in tables else set()
        has_refund_lines = {"refund_id", "order_id", "refunded_at", "amount_minor"} <= refund_cols and (
            "product_id" in refund_cols or "line_id" in refund_cols
        )
        return {
            "schema_version": DECLARED_ORDERS_SCHEMA_VERSION,
            "tables": sorted(tables),
            "has_refund_table": "refunds" in tables,
            "has_refund_lines": has_refund_lines,
            "has_sample_received_at": "sample_received_at" in _columns(connection, "orders"),
        }
    raise SchemaMismatchError(f"unsupported schema kind {kind}")
