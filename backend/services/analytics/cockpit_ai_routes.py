"""Authenticated native AI exchange and immutable, read-only candidate previews."""
import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fastapi import APIRouter, Request, Response

from backend.services.analytics.cockpit_files import KINDS, fault, sign_token, verify_token

class AISelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: int = Field(strict=True, ge=0)
    end: int = Field(strict=True, gt=0)
    html_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class AIBegin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^ai_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    target_kind: Literal["file", "page"]
    target_id: str = Field(min_length=1, max_length=160)
    base_version: int = Field(strict=True, ge=1)
    selection: AISelection | None = None


class AIConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


PREFIX = "/api/v1/analytics/cockpit-ai"


def cockpit_ai_router(store, principal, office=None, office_principal=None):
    router = APIRouter(prefix=PREFIX)

    @router.get("")
    def listing(request: Request, offset: int = 0):
        return store.list(principal(request), offset)

    @router.post("", status_code=201)
    def begin(body: AIBegin, request: Request):
        return store.begin(principal(request), body.target_kind, body.target_id, body.base_version, body.id, body.selection.model_dump() if body.selection else None)

    @router.get("/office-content")
    def office_content(ticket: str):
        if office is None or office_principal is None:
            fault(503, "OFFICE_UNAVAILABLE", "文档预览服务未配置。")
        claim = verify_token(ticket, office.secret)
        actor = office_principal()
        if claim.get("purpose") != "ai-preview" or claim.get("actor") != actor.actor_id:
            fault(403, "FORBIDDEN", "候选预览凭据不匹配。")
        job = store.get(actor, claim.get("job"))
        if job["status"] == "CANCELLED":
            fault(409, "AI_EDIT_CLOSED", "此 AI 修改任务已关闭。")
        filename, content = store.content(actor, job["id"], claim.get("variant"))
        return Response(content, media_type="application/octet-stream", headers={"Cache-Control": "no-store"})

    @router.get("/{job_id}")
    def status(job_id: str, request: Request):
        return store.get(principal(request), job_id)

    @router.post("/{job_id}/collect")
    def collect(job_id: str, request: Request):
        return store.collect(principal(request), job_id)

    @router.get("/{job_id}/comparison")
    def comparison(job_id: str, request: Request):
        return store.comparison(principal(request), job_id)

    @router.post("/{job_id}/confirm")
    def confirm(job_id: str, body: AIConfirm, request: Request):
        return store.confirm(principal(request), job_id, body.candidate_hash)

    @router.post("/{job_id}/cancel")
    def cancel(job_id: str, request: Request):
        return store.cancel(principal(request), job_id)

    @router.get("/{job_id}/content")
    def content(job_id: str, request: Request, variant: str = "candidate"):
        _, data = store.content(principal(request), job_id, variant)
        return Response(data, media_type="application/octet-stream", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    @router.get("/{job_id}/viewer")
    def viewer(job_id: str, request: Request, variant: str = "candidate"):
        actor = principal(request)
        if office is None:
            fault(503, "OFFICE_UNAVAILABLE", "文档预览服务未配置。")
        store.get(actor, job_id)
        filename, _ = store.content(actor, job_id, variant)
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext not in KINDS or ext in {"html", "htm"}:
            fault(422, "AI_HTML_VIEWER", "HTML 请使用页面预览。")
        claim = {"purpose": "ai-preview", "actor": actor.actor_id, "job": job_id, "variant": variant, "exp": int(time.time()) + 3600}
        config = {
            "documentType": "cell" if KINDS[ext] == "spreadsheet" else "pdf" if ext == "pdf" else "word",
            "document": {"fileType": ext, "key": job_id + "-" + variant,
                         "title": filename, "url": office.callback_base + PREFIX + "/office-content?ticket=" + sign_token(claim, office.secret),
                         "permissions": {"edit": False, "review": False, "comment": False, "fillForms": False, "download": False, "print": False}},
            "editorConfig": {"mode": "view", "lang": "zh-CN", "customization": {"compactHeader": True}},
            "height": "100%", "width": "100%",
        }
        return {"script_url": office.base + "/web-apps/apps/api/documents/api.js", "config": {**config, "token": sign_token(config, office.secret)}}

    return router
