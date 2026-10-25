from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, model_validator

from backend.contracts.category import ProductCustomerResponseV3
from backend.contracts.crm_analysis import CrmSnapshotRequest, DataKind
from backend.contracts.crm_dashboard import DashboardChannel, DashboardModel, DashboardPurchases
from backend.contracts.rfm import RFMAnalysisResponse, RFMFRFlowResponse, RFMMFlowResponse, RFMRFlowResponse


Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
WarehouseSnapshotId = Annotated[str, Field(pattern=r"^crm_w_[0-9a-f]{32}$")]


class WarehouseProvenance(DashboardModel):
    source_id: Annotated[str, Field(min_length=1, max_length=120)]
    data_kind: DataKind
    data_version: Annotated[str, Field(pattern=r"^warehouse-v1:[0-9a-f]{64}$")]
    semantic_revision: Digest
    data_start: date
    data_cutoff: date
    orders_count: int = Field(ge=1)
    data_timezone: Annotated[str, Field(min_length=1, max_length=120)]


class SnapshotWindow(DashboardModel):
    start: date
    end: date
    cutoff: date

    @model_validator(mode="after")
    def valid_window(self):
        if self.end < self.start or self.cutoff != self.start - timedelta(days=1):
            raise ValueError("快照范围或历史分界无效")
        return self


class ProductSnapshotFilters(CrmSnapshotRequest):
    products: Annotated[list[Annotated[str, Field(min_length=1, max_length=80)]], Field(min_length=1, max_length=15)] | None = None
    compare_start_date: date | None = None
    compare_end_date: date | None = None

    @model_validator(mode="after")
    def comparison_window(self):
        if (self.compare_start_date is None) != (self.compare_end_date is None):
            raise ValueError("对比期起止日期必须同时提供")
        if self.compare_start_date is not None:
            if not 2000 <= self.compare_start_date.year <= self.compare_end_date.year <= 2099:
                raise ValueError("日期必须位于2000至2099年")
            if not 0 <= (self.compare_end_date - self.compare_start_date).days < 90:
                raise ValueError("对比期含首尾，最多90天")
        return self


class ExplicitSnapshotWindow(DashboardModel):
    kind: Literal["dates"]
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def valid_window(self):
        if not 2000 <= self.start_date.year <= self.end_date.year <= 2099 or self.end_date < self.start_date:
            raise ValueError("日期必须位于2000至2099年，且结束日期不能早于开始日期")
        return self


class FixedSnapshotWindow(DashboardModel):
    kind: Literal["period"]
    period: Literal["wtd", "mtd", "ytd", "q1", "q2", "q3", "q4", "yesterday", "last90days", "last180days", "last365days"]


class RfmSnapshotFilters(DashboardModel):
    window: Annotated[ExplicitSnapshotWindow | FixedSnapshotWindow, Field(discriminator="kind")]
    metric_type: Literal["GSV", "GMV"] = "GSV"
    channel: DashboardChannel = "全店"
    exclude_low_price: bool = False
    compare_start_date: date | None = None
    compare_end_date: date | None = None

    @model_validator(mode="after")
    def comparison_pair(self):
        if (self.compare_start_date is None) != (self.compare_end_date is None):
            raise ValueError("对比期起止日期必须同时提供")
        if self.compare_start_date is not None:
            if (not 2000 <= self.compare_start_date.year <= self.compare_end_date.year <= 2099
                    or self.compare_end_date < self.compare_start_date):
                raise ValueError("对比期日期范围无效")
        return self


class PurchasesSnapshotRequest(DashboardModel):
    family: Literal["purchases"]
    filters: CrmSnapshotRequest


class ProductSnapshotRequest(DashboardModel):
    family: Literal["product"]
    filters: ProductSnapshotFilters


class RfmSnapshotRequest(DashboardModel):
    family: Literal["analysis", "r", "f", "m"]
    filters: RfmSnapshotFilters


WarehouseSnapshotRequest = Annotated[
    PurchasesSnapshotRequest | ProductSnapshotRequest | RfmSnapshotRequest, Field(discriminator="family"),
]


class PurchasesSnapshotPayload(PurchasesSnapshotRequest):
    periods: tuple[SnapshotWindow]
    result: DashboardPurchases


class ProductSnapshotPayload(ProductSnapshotRequest):
    periods: tuple[SnapshotWindow, SnapshotWindow]
    result: ProductCustomerResponseV3


class RfmSnapshotPayloadBase(DashboardModel):
    filters: RfmSnapshotFilters
    periods: tuple[SnapshotWindow, SnapshotWindow, SnapshotWindow]


class AnalysisSnapshotPayload(RfmSnapshotPayloadBase):
    family: Literal["analysis"]
    result: RFMAnalysisResponse


class RSnapshotPayload(RfmSnapshotPayloadBase):
    family: Literal["r"]
    result: RFMRFlowResponse


class FSnapshotPayload(RfmSnapshotPayloadBase):
    family: Literal["f"]
    result: RFMFRFlowResponse


class MSnapshotPayload(RfmSnapshotPayloadBase):
    family: Literal["m"]
    result: RFMMFlowResponse


WarehouseSnapshotPayload = Annotated[
    PurchasesSnapshotPayload | ProductSnapshotPayload | AnalysisSnapshotPayload | RSnapshotPayload | FSnapshotPayload | MSnapshotPayload,
    Field(discriminator="family"),
]


class WarehouseSnapshot(DashboardModel):
    schema_version: Literal["crm-warehouse-result-snapshot/v1"] = "crm-warehouse-result-snapshot/v1"
    snapshot_id: WarehouseSnapshotId
    captured_at: AwareDatetime
    warehouse: WarehouseProvenance
    payload: WarehouseSnapshotPayload
    result_sha256: Digest

    @property
    def data_kind(self) -> DataKind:
        return self.warehouse.data_kind
