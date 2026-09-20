"""Build a small synthetic library. Never a real archive copy."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.services.crm_readonly.connection import close_owner, open_write_owner
from backend.services.crm_readonly.fs import make_private_directory
from backend.services.crm_readonly.registry import SourceRegistration
from backend.services.crm_readonly.versions import (
    DECLARED_ORDERS_SCHEMA_VERSION,
    GRAIN_SCHEMA_VERSION,
    MAPPING_VERSION,
    TIMEZONE,
)

DATABASE_NAME = "crm-readonly-synthetic.duckdb"

GRAIN_DDL = """
CREATE TABLE crm_source_meta (
    source_id VARCHAR,
    mapping_version VARCHAR,
    schema_version VARCHAR,
    data_version VARCHAR,
    contains_real_data BOOLEAN,
    timezone VARCHAR,
    currency VARCHAR,
    amount_unit VARCHAR,
    amount_already_net BOOLEAN,
    coverage_start VARCHAR,
    data_through VARCHAR,
    history_complete BOOLEAN
);
CREATE TABLE crm_order_line (
    order_id VARCHAR,
    line_id VARCHAR,
    user_id VARCHAR,
    paid_at TIMESTAMP,
    gross_paid_minor BIGINT,
    quantity INTEGER,
    product_id VARCHAR,
    channel VARCHAR,
    membership_at_purchase VARCHAR,
    is_sample BOOLEAN,
    status VARCHAR,
    event_seq INTEGER
);
CREATE TABLE crm_refund_event (
    refund_id VARCHAR,
    order_id VARCHAR,
    refunded_at TIMESTAMP,
    amount_minor BIGINT,
    product_id VARCHAR,
    line_id VARCHAR,
    status VARCHAR,
    event_seq INTEGER
);
"""

DECLARED_DDL = """
CREATE TABLE crm_source_meta (
    source_id VARCHAR,
    mapping_version VARCHAR,
    schema_version VARCHAR,
    data_version VARCHAR,
    contains_real_data BOOLEAN,
    timezone VARCHAR,
    currency VARCHAR,
    amount_unit VARCHAR,
    amount_already_net BOOLEAN,
    coverage_start VARCHAR,
    data_through VARCHAR,
    history_complete BOOLEAN
);
CREATE TABLE orders (
    order_id VARCHAR,
    sub_order_id VARCHAR,
    user_id VARCHAR,
    user_nickname VARCHAR,
    pay_time TIMESTAMP,
    actual_amount DECIMAL(12,2),
    quantity INTEGER,
    product_id VARCHAR,
    channel VARCHAR,
    is_member BOOLEAN,
    order_status VARCHAR,
    refund_amount DECIMAL(12,2),
    is_refund BOOLEAN,
    spu_type VARCHAR
);
CREATE TABLE refunds (
    refund_id VARCHAR,
    order_id VARCHAR,
    refunded_at TIMESTAMP,
    amount_minor BIGINT,
    product_id VARCHAR,
    line_id VARCHAR,
    status VARCHAR,
    event_seq INTEGER
);
"""


def _ts(value: str) -> datetime:
    from backend.services.crm_readonly.queries import business_time
    return business_time(value).replace(tzinfo=None)


def _write_meta(conn, meta: dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO crm_source_meta VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            meta["source_id"],
            meta["mapping_version"],
            meta["schema_version"],
            meta["data_version"],
            meta["contains_real_data"],
            meta["timezone"],
            meta["currency"],
            meta["amount_unit"],
            meta["amount_already_net"],
            meta["coverage_start"],
            meta["data_through"],
            meta["history_complete"],
        ],
    )


def data_version_for(lines: list[dict], refunds: list[dict], extra: dict | None = None) -> str:
    payload = {"lines": lines, "refunds": refunds, "extra": extra or {}}
    raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":")).encode()
    return "dver_" + hashlib.sha256(raw).hexdigest()


def build_synthetic_grain_source(
    directory: Path,
    *,
    source_id: str,
    lines: list[dict[str, Any]],
    refunds: list[dict[str, Any]] | None = None,
    history_complete: bool = True,
    amount_already_net: bool = False,
    coverage_start: str = "2026-09-01",
    data_through: str = "2026-09-20",
    permission_scope: str = "test-scope",
) -> SourceRegistration:
    root = make_private_directory(directory)
    path = root / DATABASE_NAME
    refunds = list(refunds or [])
    version = data_version_for(lines, refunds, {"history_complete": history_complete, "amount_already_net": amount_already_net, "coverage_start": coverage_start, "data_through": data_through})
    conn = open_write_owner(path)
    try:
        conn.execute(GRAIN_DDL)
        _write_meta(
            conn,
            {
                "source_id": source_id,
                "mapping_version": MAPPING_VERSION,
                "schema_version": GRAIN_SCHEMA_VERSION,
                "data_version": version,
                "contains_real_data": False,
                "timezone": TIMEZONE,
                "currency": "CNY",
                "amount_unit": "minor",
                "amount_already_net": amount_already_net,
                "coverage_start": coverage_start,
                "data_through": data_through,
                "history_complete": history_complete,
            },
        )
        for row in lines:
            conn.execute(
                """
                INSERT INTO crm_order_line VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    row["order_id"],
                    row["line_id"],
                    row.get("user_id"),
                    _ts(row["paid_at"]),
                    row["gross_paid_minor"],
                    row.get("quantity"),
                    row.get("product_id"),
                    row.get("channel"),
                    row["membership_at_purchase"],
                    row.get("is_sample"),
                    row["status"],
                    row["event_seq"],
                ],
            )
        for row in refunds:
            conn.execute(
                """
                INSERT INTO crm_refund_event VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    row["refund_id"],
                    row["order_id"],
                    _ts(row["refunded_at"]),
                    row["amount_minor"],
                    row.get("product_id"),
                    row.get("line_id"),
                    row.get("status", "SUCCEEDED"),
                    row["event_seq"],
                ],
            )
        conn.execute("CHECKPOINT")
    finally:
        close_owner(conn)
    os.chmod(path, 0o600)
    return SourceRegistration(
        source_id=source_id,
        kind="SYNTHETIC_CONTRACT_GRAIN",
        status="CONNECTED",
        path=path,
        contains_real_data=False,
        mapping_version=MAPPING_VERSION,
        schema_version=GRAIN_SCHEMA_VERSION,
        timezone=TIMEZONE,
        currency="CNY",
        amount_unit="minor",
        amount_already_net=amount_already_net,
        history_complete=history_complete,
        coverage_start=coverage_start,
        data_through=data_through,
        permission_scope=permission_scope,
    )


def build_synthetic_declared_orders_source(
    directory: Path,
    *,
    source_id: str,
    orders: list[dict[str, Any]],
    refunds: list[dict[str, Any]] | None = None,
    history_complete: bool = True,
    amount_already_net: bool = False,
    include_refund_table: bool = True,
    permission_scope: str = "test-scope",
    coverage_start: str = "2026-09-01",
    data_through: str = "2026-09-20",
) -> SourceRegistration:
    root = make_private_directory(directory)
    path = root / DATABASE_NAME
    refunds = list(refunds or [])
    version = data_version_for(orders, refunds, {"declared": True, "history_complete": history_complete, "amount_already_net": amount_already_net, "coverage_start": coverage_start, "data_through": data_through, "include_refund_table": include_refund_table})
    conn = open_write_owner(path)
    try:
        conn.execute(DECLARED_DDL)
        if not include_refund_table:
            conn.execute("DROP TABLE refunds")
        _write_meta(
            conn,
            {
                "source_id": source_id,
                "mapping_version": MAPPING_VERSION,
                "schema_version": DECLARED_ORDERS_SCHEMA_VERSION,
                "data_version": version,
                "contains_real_data": False,
                "timezone": TIMEZONE,
                "currency": "CNY",
                "amount_unit": "yuan_decimal_synthetic",
                "amount_already_net": amount_already_net,
                "coverage_start": coverage_start,
                "data_through": data_through,
                "history_complete": history_complete,
            },
        )
        for row in orders:
            conn.execute(
                """
                INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    row["order_id"],
                    row["sub_order_id"],
                    row.get("user_id"),
                    row.get("user_nickname", "SECRET-NAME"),
                    _ts(row["pay_time"]),
                    row["actual_amount"],
                    row.get("quantity"),
                    row.get("product_id"),
                    row.get("channel"),
                    row.get("is_member"),
                    row["order_status"],
                    row.get("refund_amount", 0),
                    row.get("is_refund", False),
                    row.get("spu_type"),
                ],
            )
        if include_refund_table:
            for row in refunds:
                conn.execute(
                    """
                    INSERT INTO refunds VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        row["refund_id"],
                        row["order_id"],
                        _ts(row["refunded_at"]),
                        row["amount_minor"],
                        row.get("product_id"),
                        row.get("line_id"),
                        row.get("status", "SUCCEEDED"),
                        row["event_seq"],
                    ],
                )
        conn.execute("CHECKPOINT")
    finally:
        close_owner(conn)
    os.chmod(path, 0o600)
    return SourceRegistration(
        source_id=source_id,
        kind="SYNTHETIC_DECLARED_ORDERS",
        status="CONNECTED",
        path=path,
        contains_real_data=False,
        mapping_version=MAPPING_VERSION,
        schema_version=DECLARED_ORDERS_SCHEMA_VERSION,
        timezone=TIMEZONE,
        currency="CNY",
        amount_unit="yuan_decimal_synthetic",
        amount_already_net=amount_already_net,
        history_complete=history_complete,
        coverage_start=coverage_start,
        data_through=data_through,
        permission_scope=permission_scope,
    )


def archive_placeholder(source_id: str = "crm-archive-candidate") -> SourceRegistration:
    return SourceRegistration(
        source_id=source_id,
        kind="DUCKDB_ARCHIVE_READ_ONLY",
        status="NOT_CONNECTED",
        path=None,
        contains_real_data=True,
        mapping_version=MAPPING_VERSION,
        schema_version="unverified",
        timezone=TIMEZONE,
        currency="CNY",
        amount_unit="unverified",
        amount_already_net=False,
        history_complete=False,
    )
