from backend.contracts.native_warehouse_snapshot import NativeWarehouseSnapshotRead
from backend.contracts.warehouse_snapshot import WarehouseSnapshot
from backend.services.crm_analysis import digest

PROJECTION = "crm-warehouse-page-aggregate/v1"
PRODUCT_UNITS = {
    "gsv": "CNY", "users": "buyers", "aus": "CNY/buyer",
    "old_gsv": "CNY", "old_users": "buyers", "old_aus": "CNY/buyer", "old_ratio": "ratio",
    "new_gsv": "CNY", "new_users": "buyers", "new_aus": "CNY/buyer", "new_ratio": "ratio",
    "member_gsv": "CNY", "member_users": "buyers", "member_aus": "CNY/buyer", "member_ratio": "ratio",
    "old_users_ratio": "ratio", "new_users_ratio": "ratio",
}
PRODUCT_YOY_UNITS = dict.fromkeys((
    "gsv", "users", "aus", "old_gsv", "old_users", "old_aus", "new_gsv", "new_users", "new_aus",
), "change_ratio") | dict.fromkeys(("old_ratio_ppt", "new_ratio_ppt", "old_users_ratio_ppt", "new_users_ratio_ppt"), "ratio_difference")
RFM_UNITS = {
    f"{metric}_{period}": unit
    for period in ("current", "comp", "prev2")
    for metric, unit in (("hist_users", "buyers"), ("repurchase_users", "buyers"),
                         ("repurchase_rate", "ratio"), ("repurchase_gsv", "CNY"), ("repurchase_gsv_ratio", "ratio"))
} | {"yoy_hist_users": "change_ratio", "yoy_repurchase_users": "change_ratio",
     "yoy_repurchase_rate": "ratio_difference", "yoy_repurchase_gsv": "change_ratio",
     "yoy_repurchase_gsv_ratio_ppt": "ratio_difference"}


def purchases_rows(result):
    return [{"metric": "GSV", "unit": "CNY fen", "amount_fen": result["gsv_amount_fen"]},
            {"metric": "AOV", "unit": "CNY fen/order", **result["aov"]},
            {"metric": "AUS", "unit": "CNY fen/buyer", **result["aus"]},
            {"metric": "orders", "unit": "orders", "count": result["coverage"]["orders"]},
            {"metric": "buyers", "unit": "buyers", "count": result["coverage"]["buyers"]}]


def browser_exact(value):
    if type(value) is int and abs(value) > 9007199254740991:
        return str(value)
    if isinstance(value, dict):
        return {key: browser_exact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [browser_exact(item) for item in value]
    return value


def warehouse_projection(value, ref, data_kind):
    envelope = NativeWarehouseSnapshotRead.model_validate(value)
    snapshot = WarehouseSnapshot.model_validate_json(envelope.snapshot_json)
    if (envelope.ref_id != ref or envelope.snapshot_id != snapshot.snapshot_id
            or envelope.data_kind != data_kind or snapshot.data_kind != data_kind
            or envelope.result_sha256 != snapshot.result_sha256
            or digest(snapshot.payload.model_dump(mode="json")) != snapshot.result_sha256):
        raise ValueError("warehouse source differs")
    payload = snapshot.payload.model_dump(mode="json")
    result, family = payload["result"], payload["family"]
    metadata = {"projection_version": PROJECTION, "family": family,
                "snapshot_id": snapshot.snapshot_id, "result_sha256": snapshot.result_sha256,
                "warehouse": snapshot.warehouse.model_dump(mode="json"), "filters": payload["filters"],
                "periods": payload["periods"], "date_bounds": "inclusive", "data_kind": snapshot.data_kind,
                "integer_encoding": "unsafe-integers-as-decimal-strings"}
    if family == "purchases":
        rows = purchases_rows(result)
        metadata.update({key: result[key] for key in ("coverage", "limitations", "data_through", "refund_as_of")})
    elif family == "product":
        if result["data_version"] != snapshot.warehouse.data_version:
            raise ValueError("product source differs")
        rows = [{"product": product["display_name"], "status": product["status"],
                 "current": product["current"], "comparison": product["comparison"], "yoy": product["yoy"]}
                for product in result["products"]]
        metadata.update(status=result["status"], coverage=result["coverage"],
                        column_units={"current": PRODUCT_UNITS, "comparison": PRODUCT_UNITS, "yoy": PRODUCT_YOY_UNITS})
    else:
        if result["metric_type"] != payload["filters"]["metric_type"]:
            raise ValueError("RFM metric differs")
        rows = [{"group": group, **row} for group in ("rows", "same_channel_rows", "member_rows", "member_same_channel_rows")
                for row in result[group]]
        metadata.update(column_units=RFM_UNITS,
                        year_labels={key: result[key] for key in ("year_label", "comp_year_label", "prev2_year_label")})
    period = payload["periods"][0]
    return snapshot, browser_exact(rows), browser_exact(metadata), {"start": period["start"], "end": period["end"]}
