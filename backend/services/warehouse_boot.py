from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import re
from typing import Callable, Literal, Mapping

import duckdb
from fastapi import FastAPI

from backend.services.warehouse_cache import AggregateCache
from backend.services.warehouse_runtime import WarehouseRuntime, product_semantic_revision, purchases_semantic_revision, rfm_semantic_revision
from backend.services.warehouse_source import SourceState, VerifiedWarehouseSource, WarehouseSourceSpec


logger = logging.getLogger(__name__)
SETTINGS_KEYS = ("FQ_WAREHOUSE_STATE_DIR", "FQ_WAREHOUSE_SOURCE_ID", "FQ_WAREHOUSE_DATA_KIND")


def warehouse_runtime_requested(environ: Mapping[str, str] | None = None) -> bool:
    values = os.environ if environ is None else environ
    return any(key in values for key in SETTINGS_KEYS)


@dataclass(frozen=True)
class WarehouseRuntimeSettings:
    state_dir: Path
    source: WarehouseSourceSpec

    @classmethod
    def from_environment(cls, database_path: Path, environ: Mapping[str, str] | None = None) -> WarehouseRuntimeSettings | None:
        values = os.environ if environ is None else environ
        if not warehouse_runtime_requested(values):
            return None
        state, source_id, kind = (values.get(key, "").strip() for key in SETTINGS_KEYS)
        if not state or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}", source_id) or kind not in {"real", "synthetic"}:
            raise ValueError("warehouse mode requires a private state directory, source ID and real/synthetic data kind")
        source = WarehouseSourceSpec(database_path, source_id, "real" if kind == "real" else "synthetic")
        return cls(Path(state).absolute(), source)


def build_warehouse_runtime(
    settings: WarehouseRuntimeSettings, *, connect: Callable[[], duckdb.DuckDBPyConnection] | None = None,
    role: Literal["service", "prewarm"] = "service",
) -> WarehouseRuntime:
    if role not in {"service", "prewarm"}:
        raise ValueError("unsupported warehouse owner role")
    root = settings.state_dir
    info = root.stat()
    if not root.is_dir() or root.is_symlink() or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError("warehouse state directory must be private")
    source_dir = root / ("source" if role == "service" else "prewarm-source")
    cache_dir = root / "cache"
    source_dir.mkdir(mode=0o700, exist_ok=True)
    cache_dir.mkdir(mode=0o700, exist_ok=True)
    cache = AggregateCache(cache_dir / "aggregates.sqlite")
    semantics = {"product-customer/v3": product_semantic_revision(), "rfm": rfm_semantic_revision(), "purchases": purchases_semantic_revision()}
    from backend.services.dual_conn import ACTIVE_READ_LIMIT, open_matching_read_connection

    source = VerifiedWarehouseSource.seal(settings.source, source_dir, connect=connect or open_matching_read_connection)
    try:
        return WarehouseRuntime(source, cache, semantics, read_limit=ACTIVE_READ_LIMIT)
    except BaseException:
        source.close()
        raise


async def initialize_warehouse_runtime(
    settings: WarehouseRuntimeSettings, *, builder: Callable[[WarehouseRuntimeSettings], WarehouseRuntime] = build_warehouse_runtime,
) -> WarehouseRuntime:
    task = asyncio.create_task(asyncio.to_thread(builder, settings))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError as cancelled:
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except Exception:
                break
        if not task.cancelled() and task.exception() is None:
            task.result().source.close()
        raise cancelled


@asynccontextmanager
async def verified_warehouse_lifespan(application: FastAPI, settings: WarehouseRuntimeSettings):
    current = getattr(application.state, "warehouse_runtime", None)
    if current is not None and current.source.state != SourceState.CLOSED:
        raise RuntimeError("application already owns a warehouse runtime")
    runtime = await initialize_warehouse_runtime(settings)
    watchdog = None
    auth_task = None
    stop = asyncio.Event()
    try:
        current = getattr(application.state, "warehouse_runtime", None)
        if current is not None and current.source.state != SourceState.CLOSED:
            raise RuntimeError("application already owns a warehouse runtime")
        from backend.services.warehouse_snapshot import WarehouseSnapshotStore

        snapshots_dir = settings.state_dir / "snapshots"
        snapshots_dir.mkdir(mode=0o700, exist_ok=True)
        application.state.warehouse_snapshots = WarehouseSnapshotStore.create(snapshots_dir, settings.source.data_kind)
        application.state.warehouse_runtime = runtime
        from backend.db.memory_monitor import MemoryWatchdog
        from backend.services.auth_token_evictor import evict_idle_tokens_periodically

        watchdog = MemoryWatchdog(interval=5)
        watchdog.start()
        auth_task = asyncio.create_task(evict_idle_tokens_periodically(stop))
        yield
    finally:
        try:
            stop.set()
            if auth_task is not None:
                try:
                    await asyncio.wait_for(auth_task, timeout=5)
                except asyncio.TimeoutError:
                    logger.warning("warehouse auth evictor shutdown timed out")
        finally:
            try:
                if watchdog is not None:
                    watchdog.stop()
            finally:
                runtime.source.close()
