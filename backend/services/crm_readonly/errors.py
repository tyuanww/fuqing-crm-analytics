"""Typed failures for the isolated CRM read-only adapter."""

from __future__ import annotations


class CrmReadonlyError(Exception):
    code = "CRM_READONLY_ERROR"

    def __init__(self, message: str, *, code: str | None = None):
        super().__init__(message)
        if code is not None:
            self.code = code


class ForbiddenError(CrmReadonlyError):
    code = "FORBIDDEN"


class NotConnectedError(CrmReadonlyError):
    code = "NOT_CONNECTED"


class SchemaMismatchError(CrmReadonlyError):
    code = "SCHEMA_MISMATCH"


class MetricNotApprovedError(CrmReadonlyError):
    code = "METRIC_NOT_APPROVED"


class UnsupportedMetricError(CrmReadonlyError):
    code = "UNSUPPORTED_METRIC"


class SourceBusyError(CrmReadonlyError):
    code = "SOURCE_BUSY"


class QueryTimeoutError(CrmReadonlyError):
    code = "QUERY_TIMEOUT"


class CancelledError(CrmReadonlyError):
    code = "CANCELLED"


class PathRejectedError(CrmReadonlyError):
    code = "PATH_REJECTED"


class SqlRejectedError(CrmReadonlyError):
    code = "SQL_REJECTED"


class RowLimitExceededError(CrmReadonlyError):
    code = "ROW_LIMIT_EXCEEDED"
