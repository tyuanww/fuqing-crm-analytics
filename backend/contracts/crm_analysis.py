"""Immutable CRM result → private analysis → cockpit reference / board contracts."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from backend.contracts.crm_dashboard import DashboardFilters, DashboardModel, DashboardPurchases

AssetId = Annotated[str, Field(pattern=r"^crm_[sarb]_[0-9a-f]{32}$")]
DataKind = Literal["real", "synthetic"]
CrmMetric = Literal["gsv", "aov", "aus", "orders", "buyers"]
BlockId = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,31}$")]
Access = Literal["owner", "shared"]


def clean_text(value: str, *, empty=False, max_len=120) -> str:
    value = value.strip()
    if (not value and not empty) or len(value) > max_len or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("文本不能包含控制字符，且须符合长度要求")
    return value


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
    result: DashboardPurchases
    result_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


KnowledgeId = Annotated[str, Field(pattern=r"^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$")]


class CrmKnowledgeCitation(DashboardModel):
    schema_version: Literal["crm-knowledge-citation/v1"] = "crm-knowledge-citation/v1"
    knowledge_id: KnowledgeId
    knowledge_base_id: KnowledgeId
    chunk_id: KnowledgeId
    content_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    updated_at: str | None = None
    processed_at: str | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return clean_text(value, max_len=200)

    @field_validator("updated_at", "processed_at")
    @classmethod
    def clean_version(cls, value):
        if value is None:
            return value
        if not isinstance(value, str) or not value or len(value) > 64 or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("文档版本标记无效")
        return value


class CrmBindCitations(DashboardModel):
    citations: list[CrmKnowledgeCitation] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_chunks(self):
        ids = [item.chunk_id for item in self.citations]
        if len(set(ids)) != len(ids):
            raise ValueError("引用分块不能重复")
        return self


class CrmSaveAnalysis(DashboardModel):
    snapshot_id: AssetId
    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: str = ""

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return clean_text(value)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return clean_text(value, empty=True, max_len=500)


class CrmPatchAnalysis(DashboardModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: str = ""
    base_revision: int = Field(ge=1, le=10_000_000)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return clean_text(value)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return clean_text(value, empty=True, max_len=500)


class CrmAnalysis(DashboardModel):
    schema_version: Literal["crm-saved-analysis/v1"] = "crm-saved-analysis/v1"
    analysis_id: AssetId
    title: str
    description: str = ""
    saved_at: datetime
    updated_at: datetime | None = None
    revision: int = Field(default=1, ge=1, le=10_000_000)
    snapshot: CrmSnapshot
    knowledge_citations: list[CrmKnowledgeCitation] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def fill_updated(self):
        if self.updated_at is None:
            self.updated_at = self.saved_at
        return self


class CrmAnalysisSummary(DashboardModel):
    schema_version: Literal["crm-saved-analysis-summary/v1"] = "crm-saved-analysis-summary/v1"
    analysis_id: AssetId
    title: str
    description: str
    saved_at: datetime
    updated_at: datetime
    revision: int = Field(ge=1, le=10_000_000)
    snapshot_id: AssetId
    filters: DashboardFilters
    access: Access


class CrmAnalysisPage(DashboardModel):
    schema_version: Literal["crm-analysis-page/v1"] = "crm-analysis-page/v1"
    data_kind: DataKind
    items: list[CrmAnalysisSummary]
    next_cursor: str | None = None


class CrmAddReference(DashboardModel):
    analysis_id: AssetId


class CrmCockpitReference(DashboardModel):
    schema_version: Literal["crm-cockpit-reference/v1"] = "crm-cockpit-reference/v1"
    reference_id: AssetId
    added_at: datetime
    analysis: CrmAnalysis


class CrmShareRequest(DashboardModel):
    username: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.@-]{1,64}$")]


class CrmShareGrant(DashboardModel):
    username: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.@-]{1,64}$")]
    granted_at: datetime


class CrmShareList(DashboardModel):
    schema_version: Literal["crm-analysis-shares/v1"] = "crm-analysis-shares/v1"
    analysis_id: AssetId
    grants: list[CrmShareGrant]


class CrmLibrary(DashboardModel):
    schema_version: Literal["crm-library/v1"] = "crm-library/v1"
    data_kind: DataKind
    snapshots: list[CrmSnapshot]
    analyses: list[CrmAnalysis]
    references: list[CrmCockpitReference]
    snapshots_truncated: bool
    analyses_truncated: bool
    references_truncated: bool


class CrmBoardLayout(DashboardModel):
    x: int = Field(ge=0, le=12)
    y: int = Field(ge=0, le=40)
    w: int = Field(ge=3, le=12)
    h: int = Field(ge=3, le=40)

    @model_validator(mode="after")
    def inside_grid(self):
        if self.x + self.w > 12 or self.y + self.h > 40:
            raise ValueError("组件布局超出 12×40 网格")
        return self


class CrmBoardDisplay(DashboardModel):
    tone: Literal["neutral", "accent", "muted"] = "neutral"
    density: Literal["comfortable", "compact"] = "comfortable"
    value_format: Literal["standard", "compact"] = "standard"
    show_coverage: bool = True


class CrmBoardComponentDraft(DashboardModel):
    block_id: BlockId
    title: Annotated[str, Field(min_length=1, max_length=120)]
    analysis_id: AssetId
    snapshot_id: AssetId
    metric: CrmMetric
    layout: CrmBoardLayout
    display: CrmBoardDisplay = CrmBoardDisplay()

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return clean_text(value)


class CrmMetricValue(DashboardModel):
    amount_fen: int | None = None
    denominator: int | None = None
    reason: str | None = None
    count: int | None = None


class CrmBoardComponent(CrmBoardComponentDraft):
    filters: DashboardFilters
    metric_version: Literal["dashboard-gsv-purchases/v1"]
    value: CrmMetricValue
    result_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class CrmBoardWrite(DashboardModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: str = ""
    components: list[CrmBoardComponentDraft] = Field(min_length=1, max_length=12)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return clean_text(value)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return clean_text(value, empty=True, max_len=500)

    @model_validator(mode="after")
    def unique_blocks(self):
        ids = [item.block_id for item in self.components]
        if len(set(ids)) != len(ids):
            raise ValueError("组件编号不能重复")
        boxes = [item.layout for item in self.components]
        for index, left in enumerate(boxes):
            for right in boxes[index + 1:]:
                if not (left.x + left.w <= right.x or right.x + right.w <= left.x
                        or left.y + left.h <= right.y or right.y + right.h <= left.y):
                    raise ValueError("组件布局不能重叠")
        return self


class CrmBoardPatch(CrmBoardWrite):
    base_revision: int = Field(ge=1, le=10_000_000)


class CrmBoard(DashboardModel):
    schema_version: Literal["crm-board/v1"] = "crm-board/v1"
    board_id: AssetId
    title: str
    description: str = ""
    saved_at: datetime
    updated_at: datetime
    revision: int = Field(ge=1, le=10_000_000)
    components: list[CrmBoardComponent] = Field(min_length=1, max_length=12)


class CrmBoardSummary(DashboardModel):
    schema_version: Literal["crm-board-summary/v1"] = "crm-board-summary/v1"
    board_id: AssetId
    title: str
    description: str
    saved_at: datetime
    updated_at: datetime
    revision: int
    component_count: int = Field(ge=1, le=12)


class CrmBoardPage(DashboardModel):
    schema_version: Literal["crm-board-page/v1"] = "crm-board-page/v1"
    data_kind: DataKind
    items: list[CrmBoardSummary]
    next_cursor: str | None = None
