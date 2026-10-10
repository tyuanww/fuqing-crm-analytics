"""HTTP compatibility boundary for the isolated CRM/knowledge candidate services."""
import json
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

CONTRACT_HEADER = "X-ShineMage-Contract"
ROOT = Path(__file__).resolve().parent / "contracts"


class ServiceError(BaseModel):
    """Sanitized wire errors shared by the two public synthetic transports."""
    model_config = ConfigDict(extra="forbid", strict=True)
    status: Literal["UNAVAILABLE"]
    code: str
    message: str | None = None


def service_contract(domain: str) -> dict:
    if domain not in {"metrics", "knowledge"}:
        raise ValueError("unknown CRM service domain")
    return json.loads((ROOT / f"crm-{domain}-service.v1.json").read_text())


def bind_service_contract(app: FastAPI, domain: str, *, legacy_no_header: bool = False):
    contract = service_contract(domain)
    identity = f"{contract['contract']}/{contract['api_version']}"
    # Register before routes so OpenAPI and generated clients describe the
    # actual middleware/handler errors, not FastAPI's unused detail envelope.
    errors = {
        403: "Browser Origin rejected",
        409: "Service API identity mismatch",
        422: "Invalid request; input details are not echoed",
    }
    if domain == "metrics":
        errors[400] = "Metric contract or synthetic source rejected"
    app.router.responses.update({status: {"model": ServiceError, "description": description}
                                 for status, description in errors.items()})
    header_options = {
        "alias": CONTRACT_HEADER,
        "description": "Exact public synthetic service API identity; not an authentication credential.",
        "json_schema_extra": {"const": identity},
    }
    # Publish the transport requirement in OpenAPI as well as enforcing it in
    # middleware. The legacy metrics routes retain their optional-header window.
    if legacy_no_header:
        async def contract_header(_value: str | None = Header(default=None, **header_options)):
            pass
    else:
        async def contract_header(_value: str = Header(**header_options)):
            pass
    app.router.dependencies.append(Depends(contract_header))

    @app.middleware("http")
    async def compatible_request(request: Request, call_next):
        # This interface exposes only public synthetic fixtures, never account
        # data. Browser requests and redirects are not part of this transport.
        requested = request.headers.get(CONTRACT_HEADER)
        if request.headers.get("origin"):
            response = JSONResponse({"status": "UNAVAILABLE", "code": "ORIGIN_REJECTED"}, status_code=403)
        elif requested != identity and not (requested is None and legacy_no_header):
            response = JSONResponse({"status": "UNAVAILABLE", "code": "CONTRACT_MISMATCH"}, status_code=409)
        else:
            response = await call_next(request)
        response.headers[CONTRACT_HEADER] = identity
        response.headers["Cache-Control"] = "no-store"
        return response

    return contract
