"""Source whitelist. Paths are server-owned, never taken from a request body."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.services.crm_readonly.errors import (
    ForbiddenError,
    NotConnectedError,
    PathRejectedError,
)
from backend.services.crm_readonly.fs import require_private_file
from backend.services.crm_readonly.resources import MAX_SOURCE_BYTES
from backend.services.crm_readonly.versions import ALLOWED_SOURCE_KINDS


@dataclass(frozen=True)
class SourceRegistration:
    source_id: str
    kind: str
    status: str
    path: Path | None
    contains_real_data: bool
    mapping_version: str
    schema_version: str
    timezone: str
    currency: str
    amount_unit: str
    amount_already_net: bool
    history_complete: bool
    coverage_start: str | None = None
    data_through: str | None = None
    permission_scope: str = "test-scope"


class SourceRegistry:
    def __init__(self, sources: list[SourceRegistration]):
        seen: dict[str, SourceRegistration] = {}
        for item in sources:
            if item.kind not in ALLOWED_SOURCE_KINDS:
                raise PathRejectedError(f"unsupported source kind: {item.kind}")
            if item.source_id in seen:
                raise PathRejectedError(f"duplicate source_id: {item.source_id}")
            seen[item.source_id] = item
        self._sources = seen

    def get(self, source_id: str) -> SourceRegistration:
        if source_id not in self._sources:
            raise PathRejectedError("source_id is not in the whitelist")
        return self._sources[source_id]

    def require_openable(self, source_id: str, *, want_real: bool) -> SourceRegistration:
        source = self.get(source_id)
        if source.contains_real_data != want_real:
            raise ForbiddenError("contains_real_data does not match the registered source")
        if source.status != "CONNECTED":
            raise NotConnectedError("registered source is not connected")
        if source.contains_real_data:
            raise NotConnectedError("real archive access is not enabled this period")
        if source.path is None:
            raise NotConnectedError("source has no server-owned path")
        require_private_file(source.path, limit=MAX_SOURCE_BYTES)
        return source
