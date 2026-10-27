"""Host-owned fact request and view contracts for authorized warehouse snapshots."""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Identity = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")]
SegmentKey = Annotated[str, Field(min_length=1, max_length=200)]
DisplayName = Annotated[str, Field(min_length=1, max_length=200)]
FactField = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")]
Unit = Annotated[str, Field(min_length=1, max_length=64)]
FACT_MAX_ITEMS = 2000
FACT_MAX_RESPONSE_BYTES = 524288


class FactModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class PageFactReadRequest(FactModel):
    op: Literal["data.read"]
    mode: Literal["facts"]
    result_ref: Identity | None = None
    data_ref: Identity | None = None
    request_id: Identity | None = None
    instance_id: Identity | None = None

    @model_validator(mode="after")
    def single_reference(self):
        if (self.result_ref is None) == (self.data_ref is None):
            raise ValueError("exactly one result reference is required")
        return self


class PurchaseFactSelector(FactModel):
    kind: Literal["purchase"]
    metric: Literal["GSV", "AOV", "AUS", "orders", "buyers"]


class RfmFactSelector(FactModel):
    kind: Literal["rfm"]
    group: Literal["rows", "same_channel_rows", "member_rows", "member_same_channel_rows"]
    segment: SegmentKey
    field: FactField


class ProductFactSelector(FactModel):
    kind: Literal["product"]
    display_name: DisplayName
    period: Literal["current", "comparison", "yoy"]
    field: FactField


class PageFact(FactModel):
    selector: Annotated[PurchaseFactSelector | RfmFactSelector | ProductFactSelector, Field(discriminator="kind")]
    value: int | float | Annotated[str, Field(pattern=r"^-?[0-9]+$")] | None
    unit: Unit


class PageFactHostSource(FactModel):
    label: str
    endorses: Literal["result_provenance"]
    does_not_endorse: Literal["page_dom"]
    session_id: Identity | None


class PageFactExpected(FactModel):
    unit: str | None = None
    time_range: dict[str, str] | None = None
    result_version: Annotated[int, Field(ge=1)] | None = None


class PageFactView(FactModel):
    ok: Literal[True]
    op: Literal["data.read"]
    mode: Literal["facts"]
    result_ref: Identity
    data_ref: Identity
    result_version: Annotated[int, Field(ge=1)]
    summary: dict[str, Any]
    rows: Annotated[list[Any], Field(max_length=0)]
    cursor: None
    binding_state: Literal["BOUND_VERIFIED"]
    host_source: PageFactHostSource
    expected: PageFactExpected
    facts_schema_version: Literal["warehouse-facts/v1"]
    facts: Annotated[list[PageFact], Field(max_length=FACT_MAX_ITEMS)]
    expires_at_ms: int | None
