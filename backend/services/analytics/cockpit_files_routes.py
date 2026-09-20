"""File intake and ONLYOFFICE callbacks. No arbitrary URL fetching or source-file writes."""
from __future__ import annotations

import json
import mimetypes
import re
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Request, Response

from backend.analytics_app import _single_header
from backend.services.analytics.cockpit_files import (
    MAX_FILE_BYTES, fault, sign_token, verify_token,
)

PREFIX = "/api/v1/analytics/cockpit-files"


async def object_body(request):
    try:
        body = await request.json()
    except (ValueError, UnicodeError):
        fault(422, "INVALID_BODY", "请求内容必须为 JSON 对象。")
    if not isinstance(body, dict):
        fault(422, "INVALID_BODY", "请求内容必须为 JSON 对象。")
    return body


def cockpit_files_router(store, principal, office=None, office_principal=None):
    router = APIRouter(prefix=PREFIX)

    def configured():
        if office is None:
            fault(503, "OFFICE_UNAVAILABLE", "文档编辑服务未配置；文件已保存在产物库。")
        return office

    def ticket_actor(ticket, purpose):
        settings = configured()
        ticket = verify_token(ticket, settings.secret)
        if ticket.get("purpose") != purpose or office_principal is None:
            fault(401, "INVALID_OFFICE_TOKEN", "文档访问凭据无效。")
        actor = office_principal()
        if actor.actor_id != ticket.get("actor"):
            fault(403, "FORBIDDEN", "文档身份已失效。")
        edit = store.edit(actor, ticket.get("key"))
        if edit["status"] == "CANCELLED":
            fault(409, "EDIT_CLOSED", "编辑会话已取消。")
        return actor, edit

    @router.get("")
    def listing(request: Request, offset: int = 0):
        return store.list(principal(request), offset)

    @router.get("/status")
    def status(request: Request):
        principal(request)
        return {"office_configured": office is not None, "max_file_bytes": MAX_FILE_BYTES}

    @router.post("", status_code=201)
    async def upload(request: Request, filename: str, origin: str | None = None):
        actor = principal(request)
        try:
            source = json.loads(origin) if origin else None
        except ValueError:
            fault(422, "INVALID_ORIGIN", "文件来源无效。")
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_FILE_BYTES:
                fault(413, "FILE_SIZE", "文件不能超过 20 MB。")
        return store.upload(actor, filename, bytes(data), _single_header(request, "idempotency-key"), source)

    @router.get("/office/content")
    def office_content(ticket: str):
        actor, edit = ticket_actor(ticket, "read")
        draft = store.draft(actor, edit["key"])
        filename, content = (draft["filename"], draft["content"]) if draft else store.content(actor, edit["file_id"], edit["last_version"])
        return Response(content, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream",
                        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    @router.post("/office/callback")
    async def callback(request: Request, ticket: str):
        settings = configured()
        actor, edit = ticket_actor(ticket, "callback")
        body = await object_body(request)
        authorization = _single_header(request, "authorization") or ""
        token = body.get("token") or authorization.removeprefix("Bearer ")
        signed = verify_token(token, settings.secret)
        signed = signed.get("payload", signed)
        if not isinstance(signed, dict) or signed.get("key") != edit["key"]:
            fault(401, "INVALID_OFFICE_TOKEN", "保存回执与文档不匹配。")
        for field in ("key", "status", "url", "userdata", "filetype"):
            if body.get(field) != signed.get(field):
                fault(401, "INVALID_OFFICE_TOKEN", "保存回执的签名不匹配。")
        receipt_id = signed.get("userdata")
        if receipt_id is not None and (not isinstance(receipt_id, str) or not re.fullmatch("[a-zA-Z0-9_-]{8,100}", receipt_id)):
            fault(422, "INVALID_RECEIPT", "保存请求标识无效。")
        if signed.get("status") == 7 and receipt_id:
            store.fail_save(actor, edit["key"], receipt_id)
            return {"error": 0}
        if signed.get("status") not in {2, 6}:
            return {"error": 0}
        download = signed.get("url", "")
        parsed = urlsplit(download)
        target = urlsplit(settings.base)
        if (parsed.scheme, parsed.netloc) != (target.scheme, target.netloc) or not parsed.path.startswith("/cache/") or parsed.username or parsed.fragment:
            fault(422, "INVALID_OFFICE_URL", "文档回调地址不在已配置的编辑服务内。")
        async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", download) as response:
                if response.status_code != 200:
                    fault(502, "OFFICE_DOWNLOAD", "编辑后的文档暂时无法下载，尚未保存。")
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_FILE_BYTES:
                        fault(413, "FILE_SIZE", "编辑后的文档超过 20 MB，尚未保存。")
        metadata = store.get(actor, edit["file_id"])
        ext = signed.get("filetype") or metadata["filename"].rsplit(".", 1)[-1]
        if not isinstance(ext, str) or not re.fullmatch("[a-z0-9]{1,8}", ext):
            fault(422, "INVALID_OFFICE_FILE", "文档格式无效。")
        filename = metadata["filename"].rsplit(".", 1)[0] + "." + ext
        store.stage_office(actor, edit["key"], filename, bytes(data))
        if signed.get("userdata"):
            store.commit_office(actor, edit["key"], filename, bytes(data), signed["userdata"])
        return {"error": 0}

    @router.get("/{file_id}")
    def metadata(file_id: str, request: Request):
        return store.get(principal(request), file_id)

    @router.get("/{file_id}/content")
    def content(file_id: str, request: Request, version: int | None = None):
        filename, content = store.content(principal(request), file_id, version)
        # Serve untrusted content only as download/binary; HTML preview is sandboxed by the client.
        return Response(content, media_type="application/octet-stream",
                        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    @router.post("/{file_id}/edit")
    def start_edit(file_id: str, request: Request):
        settings = configured()
        actor = principal(request)
        edit = store.begin_edit(actor, file_id)
        return settings.config(actor, edit)

    @router.get("/edits/{key}")
    def edit_status(key: str, request: Request):
        return store.edit(principal(request), key)

    @router.post("/edits/{key}/cancel")
    def cancel(key: str, request: Request):
        return store.cancel_edit(principal(request), key)

    @router.get("/edits/{key}/receipts/{receipt_id}")
    def receipt(key: str, receipt_id: str, request: Request):
        return store.save_receipt(principal(request), key, receipt_id)

    @router.post("/edits/{key}/save")
    async def save(key: str, request: Request):
        settings = configured()
        actor = principal(request)
        body = await object_body(request)
        receipt_id = body.get("receipt_id")
        if not isinstance(receipt_id, str) or not re.fullmatch("[a-zA-Z0-9_-]{8,100}", receipt_id):
            fault(422, "INVALID_RECEIPT", "保存请求标识无效。")
        receipt = store.save_receipt(actor, key, receipt_id, create=True)
        if receipt["status"] != "WAITING":
            return receipt
        command = {"c": "forcesave", "key": key, "userdata": receipt_id}
        async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False) as client:
            response = await client.post(settings.base + "/coauthoring/CommandService.ashx",
                                         json={**command, "token": sign_token(command, settings.secret)})
            if response.status_code != 200:
                fault(502, "OFFICE_SAVE", "编辑器保存请求失败，可用同一请求重试。")
            result = response.json()
        if result.get("error") not in {0, 4}:
            fault(502, "OFFICE_SAVE", "编辑器未接受保存请求。")
        # Error 4 can follow an accepted command whose callback is still in
        # flight. An earlier autosave draft cannot acknowledge this request.
        # Only its signed userdata callback may turn the receipt into SAVED.
        return {**store.save_receipt(actor, key, receipt_id), "editor_unchanged": result.get("error") == 4}

    return router
