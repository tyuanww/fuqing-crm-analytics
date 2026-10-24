from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, fields
import json
import os
from pathlib import Path
import re
import secrets
import stat
from threading import BoundedSemaphore
from time import monotonic

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.asset_state import SHA256_HEX, now_ms
from backend.services.analytics.first_purchase.loopback_http import LoopbackHTTP, unique_object
from backend.services.crm_analysis import OWNER, CrmAnalysisStore
from backend.services.crm_native_snapshot_source import (
    NATIVE_ID, REF_ID, SNAPSHOT_ID, NativeCrmIdentity, NativeCrmLease,
    NativeCrmSnapshotSource, NativeSnapshotExpectation, fault,
)

HANDLE = re.compile(r"^crm_op_[0-9a-f]{32}$")
OBSERVATION = "native-crm-snapshot-observation/v1"
RECEIPT = "native-crm-source-receipt/v1"
MAX_BUDGET_MS = 5000


def read_service_token(path: Path) -> str:
    """Only explicit instance credentials in an owned private directory are accepted."""
    try:
        directory = path.parent.lstat()
        if (not path.is_absolute() or path.parent.resolve(strict=True) != path.parent
                or not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.getuid()
                or directory.st_mode & 0o077):
            raise ValueError()
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                    or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size != 64):
                raise ValueError()
            raw = os.read(fd, 65)
        finally:
            os.close(fd)
        token = raw.decode("ascii")
        if not re.fullmatch(r"[0-9a-f]{64}", token):
            raise ValueError()
        return token
    except (OSError, ValueError, UnicodeError):
        raise ValueError("NATIVE_CRM_PRIVATE_SERVICE_TOKEN_REQUIRED") from None


def _remaining(deadline: float) -> float:
    remaining = deadline - monotonic()
    if remaining <= 0:
        raise fault("IDENTITY_UNAVAILABLE")
    return remaining


@dataclass(frozen=True)
class HostSnapshotObservation:
    handle: str
    identity: NativeCrmIdentity
    snapshot_id: str
    result_sha256: str


class NativeCrmHostClient:
    def __init__(self, *, origin: str, token_file: Path):
        LoopbackHTTP(origin, 1, 4096)
        self.origin = origin
        self._authorization = "Bearer " + read_service_token(token_file)

    def observe(self, handle: str, session_id: str, deadline: float) -> HostSnapshotObservation:
        if (not isinstance(handle, str) or not HANDLE.fullmatch(handle)
                or not isinstance(session_id, str) or not NATIVE_ID.fullmatch(session_id)):
            raise fault("INVALID_REQUEST")
        remaining = min(_remaining(deadline), MAX_BUDGET_MS / 1000)
        budget = int(remaining * 1000)
        if budget < 1:
            raise fault("IDENTITY_UNAVAILABLE")
        try:
            status, body = LoopbackHTTP(self.origin, remaining, 4096).request(
                "POST", "/native-crm-source/introspect", self._authorization,
                json.dumps({"handle": handle, "budget_ms": budget}).encode("ascii"),
            )
            _remaining(deadline)
            if status in {401, 403, 404}:
                raise fault("UNAUTHENTICATED")
            if status != 200:
                raise fault("IDENTITY_UNAVAILABLE")
            raw = json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)
            if (type(raw) is not dict or set(raw) != {
                    "schema_version", "handle", "identity", "snapshot_id", "result_sha256"}
                    or raw["schema_version"] != OBSERVATION or raw["handle"] != handle
                    or type(raw["identity"]) is not dict
                    or set(raw["identity"]) != {field.name for field in fields(NativeCrmIdentity)}):
                raise ValueError()
            identity = NativeCrmIdentity(**raw["identity"])
            if (not isinstance(identity.username, str) or not OWNER.fullmatch(identity.username)
                    or not isinstance(identity.native_session_id, str) or not NATIVE_ID.fullmatch(identity.native_session_id)
                    or not isinstance(identity.connection_generation, str)
                    or not NATIVE_ID.fullmatch(identity.connection_generation)
                    or type(identity.expires_at_ms) is not int
                    or not 0 < identity.expires_at_ms <= 2**53 - 1
                    or identity.data_kind not in {"real", "synthetic"}
                    or not isinstance(raw["snapshot_id"], str) or not SNAPSHOT_ID.fullmatch(raw["snapshot_id"])
                    or not isinstance(raw["result_sha256"], str) or not SHA256_HEX.fullmatch(raw["result_sha256"])):
                raise ValueError()
            if identity.native_session_id != session_id:
                raise fault("UNAUTHENTICATED")
            return HostSnapshotObservation(handle, identity, raw["snapshot_id"], raw["result_sha256"])
        except AnalyticsError:
            raise
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None


class HostBoundSnapshotSource:
    def __init__(self, *, client: NativeCrmHostClient, directory: Path,
                 store: CrmAnalysisStore, handle: str, session_id: str,
                 deadline: float, clock=now_ms):
        self.client, self.deadline = client, deadline
        self.observation = observation = client.observe(handle, session_id, deadline)

        def current():
            return client.observe(handle, session_id, deadline) == observation

        self.current = current
        lease = NativeCrmLease(observation.identity, current)
        self.source = NativeCrmSnapshotSource(
            directory=directory, store=store, provider=lambda: lease, clock=clock,
            expected_snapshot=NativeSnapshotExpectation(observation.snapshot_id, observation.result_sha256),
        )

    def _checked(self):
        if not self.current():
            raise fault("UNAUTHENTICATED")
        _remaining(self.deadline)

    def register(self):
        ref = self.source.register(self.observation.snapshot_id)
        self._checked()
        return {
            "schema_version": RECEIPT, "ref_id": ref.ref_id, "snapshot_id": ref.snapshot_id,
            "result_sha256": ref.result_sha256, "data_kind": ref.identity.data_kind,
            "expires_at_ms": ref.identity.expires_at_ms,
        }

    def read(self, ref_id: str):
        snapshot = self.source.read(ref_id)
        self._checked()
        return {"ref_id": ref_id, "snapshot": snapshot.model_dump(mode="json")}

    def revoke(self, ref_id: str):
        self.source.revoke(ref_id)
        self._checked()
        return {"ref_id": ref_id, "revoked": True}


def create_native_crm_source_app(*, store: CrmAnalysisStore, directory: Path,
                                 host_origin: str, token_file: Path) -> FastAPI:
    NativeCrmSnapshotSource(directory=directory, store=store)
    authorization = "Bearer " + read_service_token(token_file)
    client = NativeCrmHostClient(origin=host_origin, token_file=token_file)
    capacity = BoundedSemaphore(4)
    executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="native-crm-source")

    @asynccontextmanager
    async def lifespan(app):
        try:
            yield
        finally:
            await asyncio.to_thread(executor.shutdown, wait=True, cancel_futures=True)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def response(status, value):
        return JSONResponse(value, status_code=status, headers={
            "Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
        })

    @app.post("/native-crm-source")
    async def operate(request: Request):
        began = monotonic()
        headers = request.headers.getlist("authorization")
        if (len(headers) != 1 or not headers[0].isascii()
                or not secrets.compare_digest(headers[0], authorization)
                or "origin" in request.headers or "sec-fetch-site" in request.headers):
            return response(401, {"code": "UNAUTHENTICATED"})
        try:
            if (request.url.query or request.headers.get("content-type", "").lower()
                    not in {"application/json", "application/json; charset=utf-8"}):
                raise fault("INVALID_REQUEST")
            body = bytearray()
            async with asyncio.timeout(0.5):
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 512:
                        raise fault("INVALID_REQUEST")
            raw = json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)
            if type(raw) is not dict or raw.get("operation") not in {"register", "read", "revoke"}:
                raise fault("INVALID_REQUEST")
            operation = raw["operation"]
            required = {"operation", "handle", "session_id", "budget_ms"}
            if operation != "register":
                required.add("ref_id")
            if (set(raw) != required or not isinstance(raw["handle"], str) or not HANDLE.fullmatch(raw["handle"])
                    or not isinstance(raw["session_id"], str) or not NATIVE_ID.fullmatch(raw["session_id"])
                    or type(raw["budget_ms"]) is not int or not 1 <= raw["budget_ms"] <= MAX_BUDGET_MS
                    or (operation != "register" and (not isinstance(raw["ref_id"], str)
                                                    or not REF_ID.fullmatch(raw["ref_id"])))):
                raise fault("INVALID_REQUEST")
            deadline = began + raw["budget_ms"] / 1000
            _remaining(deadline)
            if not capacity.acquire(blocking=False):
                raise fault("IDENTITY_UNAVAILABLE")

            def run():
                try:
                    bound = HostBoundSnapshotSource(client=client, directory=directory, store=store,
                                                    handle=raw["handle"], session_id=raw["session_id"],
                                                    deadline=deadline)
                    return bound.register() if operation == "register" else getattr(bound, operation)(raw["ref_id"])
                finally:
                    capacity.release()

            try:
                future = asyncio.get_running_loop().run_in_executor(executor, run)
            except BaseException:
                capacity.release()
                raise
            future.add_done_callback(lambda done: None if done.cancelled() else done.exception())
            value = await asyncio.wait_for(asyncio.shield(future), timeout=_remaining(deadline))
            _remaining(deadline)
            if await request.is_disconnected():
                raise fault("IDENTITY_UNAVAILABLE")
            return response(200, value)
        except AnalyticsError as error:
            return response(error.status, {"code": error.code, "retryable": error.retryable})
        except (ValueError, UnicodeError, TypeError, KeyError):
            return response(400, {"code": "INVALID_REQUEST"})
        except Exception:
            return response(503, {"code": "IDENTITY_UNAVAILABLE", "retryable": True})

    return app
