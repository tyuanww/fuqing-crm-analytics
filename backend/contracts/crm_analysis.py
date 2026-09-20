"""Immutable CRM result → private analysis → cockpit reference contracts."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from backend.contracts.crm_dashboard import DashboardModel, DashboardPurchases, DashboardFilters

AssetId = Annotated[str, Field(pattern=r"^crm_[sar]_[0-9a-f]{32}$")]
DataKind = Literal["real", "synthetic"]


class CrmSnapshotRequest(DashboardFilters):
    @model_validator(mode="after")
    def bounded_window(self):
        if not (2000 <= self.start_date.year <= self.end_date.year <= 2099):
            raise ValueError("日期必须位于2000至2099年")
        if not 0 <= (self.end_date - self.start_date).days < 90:
            raise ValueError("日期含首尾，最多90天")
        return self


class CrmSnapshot(DashboardModel):
    schema_version: Literal["crm-result-snapshot/v1"] = "crm-result-snapshot/v1"
    snapshot_id: AssetId
    captured_at: datetime
    data_kind: DataKind
    # A captured aggregate, not a database backup or a verified data watermark.
    result: DashboardPurchases
    result_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class CrmSaveAnalysis(DashboardModel):
    snapshot_id: AssetId
    title: Annotated[str, Field(min_length=1, max_length=120)]

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("标题不能为空或包含控制字符")
        return value


class CrmAnalysis(DashboardModel):
    schema_version: Literal["crm-saved-analysis/v1"] = "crm-saved-analysis/v1"
    analysis_id: AssetId
    title: str
    saved_at: datetime
    snapshot: CrmSnapshot


class CrmAddReference(DashboardModel):
    analysis_id: AssetId


class CrmCockpitReference(DashboardModel):
    schema_version: Literal["crm-cockpit-reference/v1"] = "crm-cockpit-reference/v1"
    reference_id: AssetId
    added_at: datetime
    analysis: CrmAnalysis


class CrmLibrary(DashboardModel):
    schema_version: Literal["crm-library/v1"] = "crm-library/v1"
    data_kind: DataKind
    snapshots: list[CrmSnapshot]
    analyses: list[CrmAnalysis]
    references: list[CrmCockpitReference]
    snapshots_truncated: bool
    analyses_truncated: bool
    references_truncated: bool
