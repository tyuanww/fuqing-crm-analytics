"""Single main-owned binding table for the private native kernel surfaces.

P3-2 removes the scattered `/internal/native/*` literals and fixed port blocks.
The workbench author repo (`tyuanww/dsh-analytics-workbench`) keeps the reviewed
table; the FastAPI kernel reads its generated projection
`config/analytics-native-tools.v1.json`, and
`scripts/ci/analytics-native-tools-sync.mjs --check` keeps the two identical.
This module is the only backend reader: route mounting and the regression test
assert the mounted kernel routes against this table instead of hand-kept lists.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

TABLE_SCHEMA = "analytics-native-tools/v1"
REPOSITORY = Path(__file__).resolve().parents[3]
TABLE_PATH = REPOSITORY / "config" / "analytics-native-tools.v1.json"
KERNEL_FAMILIES = ("b0", "channel_followup", "first_purchase")
HTTP_METHODS = ("GET", "POST")


def validate_native_tools(table):
    """Fail closed on anything the route guard or model check cannot read."""
    if not isinstance(table, dict) or table.get("schema_version") != TABLE_SCHEMA:
        raise ValueError("native tools table schema_version")
    families = table.get("families")
    if not isinstance(families, list) or not families:
        raise ValueError("native tools table families")
    bounds = table.get("bounds")
    if not isinstance(bounds, dict) or any(
        type(bounds.get(key)) is not int or bounds[key] <= 0
        for key in ("payloadBytes", "contextTimeoutMs", "toolTimeoutMs")
    ):
        raise ValueError("native tools table bounds")
    sources = table.get("baseUrlSources")
    if not isinstance(sources, dict) or sources.get("kernel", {}).get("config") != "baseUrl" \
            or sources.get("bridge", {}).get("config") != "bridgeUrl":
        raise ValueError("native tools table baseUrlSources")
    surfaces = table.get("surfaces")
    if not isinstance(surfaces, list) or not surfaces:
        raise ValueError("native tools table surfaces")
    ids, routes = set(), set()
    for surface in surfaces:
        if not isinstance(surface, dict) or surface.get("id") in ids:
            raise ValueError("native tools table surface id")
        ids.add(surface.get("id"))
        if surface.get("side") not in {"kernel", "bridge"} or surface.get("method") not in HTTP_METHODS:
            raise ValueError(f"native tools table surface {surface.get('id')}")
        if not isinstance(surface.get("path"), str) or not surface["path"].startswith("/"):
            raise ValueError(f"native tools table surface path {surface.get('id')}")
        known = surface.get("families")
        if not isinstance(known, list) or not known or set(known) - set(families):
            raise ValueError(f"native tools table surface families {surface.get('id')}")
        if surface["side"] == "kernel" and (
            not surface["path"].startswith("/internal/native/") or set(known) - set(KERNEL_FAMILIES)
        ):
            raise ValueError(f"native tools table kernel surface {surface['id']}")
        route = (surface["method"], surface["path"])
        if route in routes:
            raise ValueError(f"native tools table duplicate route {route}")
        routes.add(route)
    return table


@lru_cache(maxsize=4)
def load_native_tools(path=None):
    """Read and validate the projection. Treat the returned table as read-only."""
    table_path = Path(path) if path is not None else TABLE_PATH
    return validate_native_tools(json.loads(table_path.read_text(encoding="utf-8")))


def kernel_surfaces(table, family):
    """Documented (method, path) pairs for one kernel family."""
    return tuple(sorted(
        (surface["method"], surface["path"])
        for surface in table["surfaces"]
        if surface["side"] == "kernel" and family in surface["families"]
    ))


def bridge_surfaces(table):
    return tuple(sorted(
        (surface["method"], surface["path"])
        for surface in table["surfaces"] if surface["side"] == "bridge"
    ))


def surface_models(table, surface_id, family):
    """Pydantic model names documented for one surface/family, for the contract test."""
    for surface in table["surfaces"]:
        if surface["id"] != surface_id:
            continue
        request = surface.get("request") or {}
        models = request.get("models") or {}
        response = surface.get("response") or {}
        response_models = response.get("models") or {}
        return models.get(family), response_models.get(family)
    raise ValueError(f"unknown native surface {surface_id}")


def mounted_kernel_routes(app):
    """GET/POST routes the app actually serves below /internal/native."""
    routes = set()
    for route in app.router.routes:
        path = getattr(route, "path", None)
        if not isinstance(path, str) or not path.startswith("/internal/native/"):
            continue
        for method in getattr(route, "methods", None) or ():
            if method in HTTP_METHODS:
                routes.add((method, path))
    return routes


def assert_native_routes(app, family, table=None):
    """Every mounted kernel route and nothing else must be in the binding table."""
    table = table if table is not None else load_native_tools()
    expected = set(kernel_surfaces(table, family))
    actual = mounted_kernel_routes(app)
    if actual != expected:
        raise ValueError(
            f"native route contract mismatch for {family}: "
            f"missing={sorted(expected - actual)} unexpected={sorted(actual - expected)}"
        )
    return expected
