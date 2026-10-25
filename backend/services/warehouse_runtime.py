from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from pathlib import Path
import threading
from types import MappingProxyType
from typing import AsyncIterator, Iterator, Literal, Mapping

from backend.services.warehouse_cache import AggregateCache
from backend.services.warehouse_source import (
    PinnedWarehouseRead, VerifiedWarehouseSource, WarehouseSourceUnavailableError,
)


ReadMode = Literal["cache_only", "compute"]


@dataclass(frozen=True)
class WarehouseReadFrame:
    source: VerifiedWarehouseSource
    pin: PinnedWarehouseRead
    cache: AggregateCache
    mode: ReadMode
    semantic_revisions: Mapping[str, str]


@dataclass(frozen=True)
class WarehouseRuntime:
    source: VerifiedWarehouseSource
    cache: AggregateCache
    semantic_revisions: Mapping[str, str]
    read_limit: int = 2
    acquire_timeout: float = 5.0
    _slots: threading.BoundedSemaphore = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        if self.read_limit < 1 or self.acquire_timeout <= 0:
            raise ValueError("warehouse read limits must be positive")
        object.__setattr__(self, "semantic_revisions", MappingProxyType(dict(self.semantic_revisions)))
        object.__setattr__(self, "_slots", threading.BoundedSemaphore(self.read_limit))

    @asynccontextmanager
    async def async_read(self) -> AsyncIterator[WarehouseReadFrame]:
        from backend.services.dual_conn import ReadPoolTimeout

        task = asyncio.create_task(asyncio.to_thread(self._slots.acquire, timeout=self.acquire_timeout))
        try:
            acquired = await asyncio.shield(task)
        except asyncio.CancelledError as cancelled:
            while not task.done():
                try:
                    await asyncio.shield(task)
                except asyncio.CancelledError:
                    pass
            if task.result():
                self._slots.release()
            raise cancelled
        if not acquired:
            raise ReadPoolTimeout("verified warehouse read limit reached")
        try:
            with self.read() as frame:
                yield frame
        finally:
            self._slots.release()

    @contextmanager
    def read(self, *, mode: ReadMode = "cache_only") -> Iterator[WarehouseReadFrame]:
        from backend.services import dual_conn

        if dual_conn.get_request_connection() is not None:
            raise WarehouseSourceUnavailableError("warehouse read cannot replace a bound connection")
        with self.source.pin() as pin:
            frame = WarehouseReadFrame(self.source, pin, self.cache, mode, self.semantic_revisions)
            connection = dual_conn.RequestConnection(pin.connection, threading.RLock(), "read", warehouse=frame)
            query_token = dual_conn.set_query_type("read")
            connection_token = dual_conn._set_request_connection(connection)
            try:
                yield frame
            finally:
                dual_conn._reset_request_connection(connection_token)
                dual_conn.reset_query_type(query_token)


def current_warehouse_read() -> WarehouseReadFrame | None:
    from backend.services.dual_conn import get_request_connection

    request = get_request_connection()
    return request.warehouse if request is not None else None


def verified_metadata(connection) -> dict | None:
    frame = current_warehouse_read()
    if frame is None:
        return None
    native = getattr(connection, "_conn", connection)
    if native is not frame.pin.connection:
        raise WarehouseSourceUnavailableError("query connection does not match the verified source")
    return frame.pin.identity.metadata()


def product_semantic_revision() -> str:
    from backend.services.warehouse_cache import semantic_revision

    return semantic_revision(Path(__file__).resolve().parents[2], (
        "backend/services/category_service/product_customer.py",
        "backend/services/category_service/overview.py",
        "backend/services/category_service/_shared.py",
        "backend/services/category_service/data_version.py",
        "backend/services/asset_focus_service/_helpers.py",
        "backend/services/product_identity.py",
        "backend/semantic/filters.py",
        "backend/semantic/channels.py",
        "backend/semantic/calculations.py",
        "backend/semantic/time.py",
        "backend/semantic/metrics.py",
    ))
