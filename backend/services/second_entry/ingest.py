"""CSV/XLSX ingestion into one DuckDB file per dataset."""

from __future__ import annotations

import io
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import duckdb

from backend.services.second_entry.errors import SecondEntryError, dataset_unavailable
from backend.services.second_entry.models import DatasetColumn, DatasetMeta
from backend.services.second_entry.store import DatasetStore

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_ROWS = 200_000
MAX_COLUMNS = 200
TABLE_NAME = "data"
SUPPORTED_SUFFIXES = frozenset({".csv", ".xlsx"})


def _display_filename(filename: str) -> str:
    """Keep a display name only; never use client input as a path."""
    cleaned = (filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    return cleaned or "upload"


def _read_dataframe(filename: str, content: bytes):
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise SecondEntryError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            f"仅支持 CSV 或 XLSX 文件，收到: {suffix or '(无扩展名)'}",
        )

    # pandas/openpyxl are imported lazily so app startup does not pay for them.
    import pandas as pd

    try:
        if suffix == ".csv":
            frame = pd.read_csv(
                io.BytesIO(content),
                encoding="utf-8-sig",
                nrows=MAX_ROWS + 1,
            )
        else:
            frame = pd.read_excel(
                io.BytesIO(content),
                engine="openpyxl",
                nrows=MAX_ROWS + 1,
            )
    except pd.errors.EmptyDataError as exc:
        raise SecondEntryError(422, "EMPTY_DATASET", "文件没有可解析的数据") from exc
    except Exception as exc:  # noqa: BLE001 - parser raises many library-specific types
        logger.warning("second-entry parse failed for %s: %s", filename, type(exc).__name__)
        raise SecondEntryError(
            422,
            "INVALID_FILE_FORMAT",
            f"无法解析文件（{suffix}），请确认文件格式正确",
        ) from exc

    if frame is None or frame.shape[1] == 0 or frame.shape[0] == 0:
        raise SecondEntryError(422, "EMPTY_DATASET", "文件没有可导入的数据行")
    if frame.shape[0] > MAX_ROWS:
        raise SecondEntryError(
            422,
            "TOO_MANY_ROWS",
            f"数据行数 {frame.shape[0]} 超过上限 {MAX_ROWS}",
        )
    if frame.shape[1] > MAX_COLUMNS:
        raise SecondEntryError(
            422,
            "TOO_MANY_COLUMNS",
            f"数据列数 {frame.shape[1]} 超过上限 {MAX_COLUMNS}",
        )

    _normalise_columns(frame)
    return frame


def _normalise_columns(frame) -> None:
    """Make column names strings, non-empty and unique before CREATE TABLE."""
    seen: set[str] = set()
    normalised: list[str] = []
    for index, raw_name in enumerate(frame.columns):
        name = str(raw_name).strip().replace("\x00", "")
        if not name:
            name = f"column_{index + 1}"
        candidate = name
        suffix = 2
        while candidate in seen:
            candidate = f"{name}_{suffix}"
            suffix += 1
        seen.add(candidate)
        normalised.append(candidate)
    frame.columns = normalised


def _create_dataset_db(path: Path, frame) -> list[DatasetColumn]:
    connection = duckdb.connect(str(path))
    try:
        connection.register("_second_entry_incoming", frame)
        try:
            connection.execute(
                f'CREATE TABLE "{TABLE_NAME}" AS SELECT * FROM _second_entry_incoming'
            )
            described = connection.execute(f'DESCRIBE "{TABLE_NAME}"').fetchall()
        finally:
            connection.unregister("_second_entry_incoming")
    finally:
        connection.close()
    return [DatasetColumn(name=str(row[0]), dtype=str(row[1])) for row in described]


def _remove_duckdb_artifacts(path: Path) -> None:
    for candidate in (path, Path(f"{path}.wal")):
        try:
            candidate.unlink(missing_ok=True)
        except OSError:  # pragma: no cover - best effort cleanup
            pass


def ingest_upload(
    store: DatasetStore,
    filename: str,
    content: bytes,
) -> DatasetMeta:
    """Validate, parse and persist one upload, returning its metadata."""
    display_name = _display_filename(filename)
    byte_size = len(content)

    if byte_size == 0:
        raise SecondEntryError(422, "EMPTY_FILE", "上传文件为空")
    if byte_size > MAX_FILE_BYTES:
        raise SecondEntryError(
            413,
            "FILE_TOO_LARGE",
            f"文件大小 {byte_size} 字节超过上限 {MAX_FILE_BYTES} 字节",
        )

    frame = _read_dataframe(display_name, content)

    store.ensure_ready()
    dataset_id = uuid.uuid4().hex
    final_path = store.dataset_path(dataset_id)
    building_path = store.root / f".{dataset_id}.building.duckdb"

    try:
        columns = _create_dataset_db(building_path, frame)
        os.replace(building_path, final_path)
    except SecondEntryError:
        _remove_duckdb_artifacts(building_path)
        raise
    except Exception as exc:  # noqa: BLE001 - disk/DuckDB failure boundary
        _remove_duckdb_artifacts(building_path)
        logger.exception("second-entry failed to create DuckDB for %s", display_name)
        raise dataset_unavailable("无法写入数据集分析库") from exc

    meta = DatasetMeta(
        id=dataset_id,
        filename=display_name,
        columns=columns,
        row_count=int(frame.shape[0]),
        byte_size=byte_size,
        created_at=datetime.now(timezone.utc),
        path=str(final_path),
    )
    try:
        store.add(meta)
    except Exception:
        _remove_duckdb_artifacts(final_path)
        raise
    return meta
