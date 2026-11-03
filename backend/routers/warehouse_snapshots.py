from fastapi import APIRouter, Depends, Header, Request, Response

from backend.contracts.warehouse_snapshot import WarehouseSnapshot, WarehouseSnapshotRequest
from backend.services.crm_analysis import fail
from backend.services.warehouse_runtime import current_warehouse_read
from backend.services.warehouse_source import WarehouseSourceUnavailableError


router = APIRouter(prefix="/api/v1/metrics/warehouse-snapshots", tags=["仓库聚合快照"])


def snapshot_context(request: Request, response: Response):
    owner = getattr(request.state, "username", None)
    if not owner:
        fail("AUTH_REQUIRED", 401)
    store = getattr(request.app.state, "warehouse_snapshots", None)
    if store is None:
        raise WarehouseSourceUnavailableError("warehouse snapshot store is not ready")
    response.headers["Cache-Control"] = "no-store"
    return store, owner


@router.post("", response_model=WarehouseSnapshot)
def capture_snapshot(body: WarehouseSnapshotRequest, context=Depends(snapshot_context),
                     idempotency_key: str | None = Header(default=None)):
    frame = current_warehouse_read()
    if frame is None:
        raise WarehouseSourceUnavailableError("warehouse source is not bound")
    store, owner = context
    return store.capture(owner, idempotency_key, body, frame)


@router.get("/{snapshot_id}", response_model=WarehouseSnapshot)
def read_snapshot(snapshot_id: str, context=Depends(snapshot_context)):
    store, owner = context
    return store.read_owned_snapshot(owner, snapshot_id)
