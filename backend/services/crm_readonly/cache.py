"""Independent result cache. Do not reuse the legacy RFM query cache module."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.services.crm_readonly.connection import close_owner, open_write_owner
from backend.services.crm_readonly.fs import make_private_directory, require_private_file
from backend.services.crm_readonly.resources import MAX_CACHE_BYTES
from backend.services.crm_readonly.versions import CACHE_SCHEMA_VERSION

CACHE_FILENAME = "crm-readonly-cache.duckdb"
CREATE_SQL = """
CREATE TABLE IF NOT EXISTS crm_readonly_cache (
    cache_key VARCHAR PRIMARY KEY,
    source_id VARCHAR NOT NULL,
    data_version VARCHAR NOT NULL,
    schema_version VARCHAR NOT NULL,
    mapping_version VARCHAR NOT NULL,
    metric_version VARCHAR NOT NULL,
    permission_version VARCHAR NOT NULL,
    actor_scope VARCHAR NOT NULL,
    resolved_filters_json VARCHAR NOT NULL,
    refund_as_of VARCHAR NOT NULL,
    payload_json VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL
)
"""


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def cache_key(
    *,
    source_id: str,
    data_version: str,
    schema_version: str,
    mapping_version: str,
    metric_version: str,
    permission_version: str,
    actor_scope: str,
    resolved_filters: dict[str, Any],
    refund_as_of: str,
) -> str:
    payload = {
        "source_id": source_id,
        "data_version": data_version,
        "schema_version": schema_version,
        "mapping_version": mapping_version,
        "metric_version": metric_version,
        "permission_version": permission_version,
        "actor_scope": actor_scope,
        "resolved_filters": resolved_filters,
        "refund_as_of": refund_as_of,
        "cache_schema": CACHE_SCHEMA_VERSION,
    }
    return "crmc_" + hashlib.sha256(canonical_json(payload).encode()).hexdigest()


class IndependentResultCache:
    def __init__(self, directory: Path):
        self.directory = make_private_directory(directory)
        self.path = self.directory / CACHE_FILENAME
        conn = open_write_owner(self.path)
        try:
            conn.execute(CREATE_SQL)
            conn.execute("CHECKPOINT")
        finally:
            close_owner(conn)
        os.chmod(self.path, 0o600)
        require_private_file(self.path, limit=MAX_CACHE_BYTES)

    def get(self, key: str) -> dict[str, Any] | None:
        conn = open_write_owner(self.path)
        try:
            rows = conn.execute(
                "SELECT payload_json FROM crm_readonly_cache WHERE cache_key = ?",
                [key],
            ).fetchall()
        finally:
            close_owner(conn)
        if not rows:
            return None
        return json.loads(rows[0][0])

    def set(self, key: str, *, envelope: dict[str, Any], payload: dict[str, Any]) -> None:
        conn = open_write_owner(self.path)
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO crm_readonly_cache (
                    cache_key, source_id, data_version, schema_version, mapping_version,
                    metric_version, permission_version, actor_scope, resolved_filters_json,
                    refund_as_of, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    key,
                    envelope["source_id"],
                    envelope["data_version"],
                    envelope["schema_version"],
                    envelope["mapping_version"],
                    envelope["metric_version"],
                    envelope["permission_version"],
                    envelope["actor_scope"],
                    canonical_json(envelope["resolved_filters"]),
                    envelope["refund_as_of"],
                    canonical_json(payload),
                    datetime.now(timezone.utc).replace(tzinfo=None),
                ],
            )
            conn.execute("CHECKPOINT")
        finally:
            close_owner(conn)
