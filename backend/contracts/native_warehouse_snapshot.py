import hashlib
from typing import Annotated, Literal

from pydantic import Field, model_validator

from backend.contracts.crm_analysis import DataKind
from backend.contracts.crm_dashboard import DashboardModel
from backend.contracts.warehouse_snapshot import Digest, WarehouseSnapshotId


class NativeWarehouseSnapshotRead(DashboardModel):
    schema_version: Literal["native-warehouse-snapshot-read/v1"] = "native-warehouse-snapshot-read/v1"
    ref_id: Annotated[str, Field(pattern=r"^crm_ref_[0-9a-f]{32}$")]
    snapshot_id: WarehouseSnapshotId
    data_kind: DataKind
    result_sha256: Digest
    snapshot_json: Annotated[str, Field(max_length=262144)]
    snapshot_json_sha256: Digest

    @model_validator(mode="after")
    def exact_snapshot_bytes(self):
        value = self.snapshot_json.encode("utf-8")
        if len(value) > 262144 or hashlib.sha256(value).hexdigest() != self.snapshot_json_sha256:
            raise ValueError("warehouse snapshot JSON differs")
        return self
