"""Explicit error codes for the second-entry API.

All failures are raised as ``HTTPException`` subclasses so FastAPI's standard
handler returns ``{"detail": {"error": "<CODE>", "message": "<text>"}}``.
"""

from __future__ import annotations

from fastapi import HTTPException


class SecondEntryError(HTTPException):
    """Base error carrying a stable machine-readable code."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code=status_code, detail={"error": code, "message": message})
        self.code = code


def dataset_not_found(dataset_id: str) -> SecondEntryError:
    return SecondEntryError(
        404,
        "DATASET_NOT_FOUND",
        f"数据集不存在: {dataset_id}",
    )


def invalid_sql(message: str) -> SecondEntryError:
    return SecondEntryError(400, "INVALID_SQL", message)


def query_failed(message: str) -> SecondEntryError:
    return SecondEntryError(400, "QUERY_FAILED", message)


def store_corrupt(message: str) -> SecondEntryError:
    return SecondEntryError(500, "STORE_CORRUPT", message)


def dataset_unavailable(message: str) -> SecondEntryError:
    return SecondEntryError(500, "DATASET_UNAVAILABLE", message)
