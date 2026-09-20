"""Server-filled actor scope. Models cannot self-assert admin."""

from __future__ import annotations

from backend.services.crm_readonly.errors import ForbiddenError
from backend.services.crm_readonly.versions import PERMISSION_VERSION


def permission_version() -> str:
    return PERMISSION_VERSION


def bind_actor_scope(requested: str | None, *, server_scope: str) -> str:
    if not server_scope or not str(server_scope).strip():
        raise ForbiddenError("actor_scope must be filled by the server")
    if requested in (None, "", "server_filled"):
        return server_scope
    if requested != server_scope:
        raise ForbiddenError("actor_scope cannot be expanded by the caller")
    return server_scope
