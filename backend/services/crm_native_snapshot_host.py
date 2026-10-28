from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, fields
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
from threading import BoundedSemaphore, Event
from time import monotonic

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.contracts.native_warehouse_snapshot import NativeWarehouseSnapshotRead
from backend.contracts.warehouse_snapshot import WarehouseSnapshot
from backend.services.analytics.access import AnalyticsError
from backend.services.analytics.first_purchase.asset_state import SHA256_HEX, now_ms
from backend.services.analytics.first_purchase.loopback_http import LoopbackHTTP, unique_object
from backend.services.crm_analysis import OWNER
from backend.services.crm_native_snapshot_source import (
    NATIVE_ID, REF_ID, SNAPSHOT_ID, NativeCrmIdentity, NativeCrmLease,
    NativeCrmSnapshotSource, NativeSnapshotAuthorization, NativeSnapshotExpectation, NativeSnapshotRead,
    OwnedSnapshotStore, _identity_valid, fault,
)

HANDLE = re.compile(r"^crm_op_[0-9a-f]{32}$")
REAUTH_HANDLE = re.compile(r"^crm_reauth_[0-9a-f]{32}$")
REAUTHORIZED = "native-crm-reauthorized-observation/v1"
INTENT = "native-crm-reauthorization-intent/v1"
OBSERVATION = "native-crm-snapshot-observation/v1"
RECEIPT = "native-crm-source-receipt/v1"
MAX_BUDGET_MS = 5000
MAX_BATCH = 16
MAX_BATCH_BYTES = 2 * 1024 * 1024


def read_service_token(path: Path) -> str:
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
    authorization: NativeSnapshotAuthorization | None = None


@dataclass(frozen=True)
class HostReauthorizationIntent:
    handle: str
    identity: NativeCrmIdentity
    refs: tuple[str, ...]


class NativeCrmHostClient:
    def __init__(self, *, origin: str, token_file: Path):
        LoopbackHTTP(origin, 1, 4096)
        self.origin = origin
        self._authorization = "Bearer " + read_service_token(token_file)

    def _call(self, path, body, deadline, maximum):
        remaining = min(_remaining(deadline), MAX_BUDGET_MS / 1000)
        budget = int(remaining * 1000)
        if budget < 1:
            raise fault("IDENTITY_UNAVAILABLE")
        try:
            status, raw = LoopbackHTTP(self.origin, remaining, maximum).request(
                "POST", path, self._authorization,
                json.dumps({**body, "budget_ms": budget}).encode("ascii"),
            )
            _remaining(deadline)
            if status in {401, 403, 404}:
                raise fault("UNAUTHENTICATED")
            if status != 200:
                raise fault("IDENTITY_UNAVAILABLE")
            return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
        except AnalyticsError:
            raise
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None

    @staticmethod
    def _observation(raw, handle, session_id):
        reauthorized = type(raw) is dict and raw.get("schema_version") == REAUTHORIZED
        keys = {"schema_version", "handle", "identity", "snapshot_id", "result_sha256"}
        if reauthorized:
            keys.add("authorization")
        if (type(raw) is not dict or set(raw) != keys
                    or raw["schema_version"] not in {OBSERVATION, REAUTHORIZED} or raw["handle"] != handle
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
        authority = None
        if reauthorized:
            value = raw["authorization"]
            if (type(value) is not dict or set(value) != {"ref_id", "ref_payload_sha256"}
                    or not isinstance(value["ref_id"], str) or not REF_ID.fullmatch(value["ref_id"])
                    or not isinstance(value["ref_payload_sha256"], str) or not SHA256_HEX.fullmatch(value["ref_payload_sha256"])):
                raise ValueError()
            authority = NativeSnapshotAuthorization(**value)
        return HostSnapshotObservation(handle, identity, raw["snapshot_id"], raw["result_sha256"], authority)

    def observe(self, handle: str, session_id: str, deadline: float) -> HostSnapshotObservation:
        if (not isinstance(handle, str) or not HANDLE.fullmatch(handle)
                or not isinstance(session_id, str) or not NATIVE_ID.fullmatch(session_id)):
            raise fault("INVALID_REQUEST")
        try:
            raw = self._call("/native-crm-source/introspect", {"handle": handle}, deadline, 4096)
            return self._observation(raw, handle, session_id)
        except AnalyticsError:
            raise
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None

    def observe_many(self, handles, session_id, deadline):
        if (not isinstance(handles, tuple) or not 1 <= len(handles) <= MAX_BATCH
                or any(not isinstance(handle, str) or not HANDLE.fullmatch(handle) for handle in handles)
                or len(set(handles)) != len(handles)
                or not isinstance(session_id, str) or not NATIVE_ID.fullmatch(session_id)):
            raise fault("INVALID_REQUEST")
        try:
            raw = self._call("/native-crm-source/introspect-many", {"handles": handles}, deadline, 65536)
            if (type(raw) is not dict or set(raw) != {"schema_version", "observations"}
                    or raw["schema_version"] != "native-crm-snapshot-observations/v1"
                    or not isinstance(raw["observations"], list) or len(raw["observations"]) != len(handles)):
                raise ValueError()
            values = {}
            for item in raw["observations"]:
                handle = item["handle"]
                if handle not in handles or handle in values:
                    raise ValueError()
                values[handle] = self._observation(item, handle, session_id)
            observations = tuple(values[handle] for handle in handles)
            if any(item.identity != observations[0].identity for item in observations):
                raise fault("UNAUTHENTICATED")
            return observations
        except AnalyticsError:
            raise
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None

    def observe_reauthorization(self, handle, session_id, refs, deadline):
        if (not isinstance(handle, str) or not REAUTH_HANDLE.fullmatch(handle)
                or not isinstance(session_id, str) or not NATIVE_ID.fullmatch(session_id)):
            raise fault("INVALID_REQUEST")
        try:
            raw = self._call("/native-crm-source/introspect-reauthorization", {"handle": handle}, deadline, 16384)
            if (type(raw) is not dict or set(raw) != {"schema_version", "handle", "identity", "refs"}
                    or raw["schema_version"] != INTENT or raw["handle"] != handle
                    or type(raw["identity"]) is not dict
                    or type(raw["refs"]) is not list or tuple(raw["refs"]) != refs):
                raise ValueError()
            identity = NativeCrmIdentity(**raw["identity"])
            if not _identity_valid(identity):
                raise ValueError()
            if identity.native_session_id != session_id:
                raise fault("UNAUTHENTICATED")
            return HostReauthorizationIntent(handle, identity, refs)
        except AnalyticsError:
            raise
        except Exception:
            raise fault("IDENTITY_UNAVAILABLE") from None


def inspect_sources(*, client, directory, store, handle, session_id, refs, deadline, check_active):
    check_active()
    intent = client.observe_reauthorization(handle, session_id, refs, deadline)

    def current():
        check_active()
        return client.observe_reauthorization(handle, session_id, refs, deadline) == intent

    lease = NativeCrmLease(intent.identity, current)
    source = NativeCrmSnapshotSource(directory=directory, store=store, provider=lambda: lease)
    values = source.inspect(refs, check_active=check_active)
    if not current():
        raise fault("UNAUTHENTICATED")
    check_active()
    return {"schema_version": "native-crm-source-inspection/v1", "sources": values}


def snapshot_value(ref_id, snapshot):
    if isinstance(snapshot, WarehouseSnapshot):
        raw = snapshot.model_dump_json()
        return NativeWarehouseSnapshotRead(
            ref_id=ref_id, snapshot_id=snapshot.snapshot_id, data_kind=snapshot.data_kind,
            result_sha256=snapshot.result_sha256, snapshot_json=raw,
            snapshot_json_sha256=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        ).model_dump(mode="json")
    return {"ref_id": ref_id, "snapshot": snapshot.model_dump(mode="json")}


class HostBoundSnapshotBatch:
    def __init__(self, *, client, directory, store, items, session_id, deadline, check_active):
        handles = tuple(item["handle"] for item in items)
        observations = client.observe_many(handles, session_id, deadline)

        def current():
            check_active()
            return client.observe_many(handles, session_id, deadline) == observations

        for item, observation in zip(items, observations):
            if observation.authorization is not None and observation.authorization.ref_id != item["ref_id"]:
                raise fault("NOT_FOUND")
        authorities = tuple(item.authorization for item in observations if item.authorization is not None)
        lease = NativeCrmLease(observations[0].identity, current, authorities)
        self.source = NativeCrmSnapshotSource(directory=directory, store=store, provider=lambda: lease)
        self.requests = tuple(NativeSnapshotRead(item["ref_id"], NativeSnapshotExpectation(
            observation.snapshot_id, observation.result_sha256)) for item, observation in zip(items, observations))
        self.check_active = check_active
        self.current = current

    def read(self):
        snapshots = self.source.read_many(self.requests, check_active=self.check_active)
        self.check_active()
        values = [snapshot_value(request.ref_id, snapshot) for request, snapshot in zip(self.requests, snapshots)]
        self.check_active()
        result = {"schema_version": "native-crm-source-read-many/v1", "items": values}
        if len(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()) > MAX_BATCH_BYTES:
            raise fault("SOURCE_UNAVAILABLE")
        if not self.current():
            raise fault("UNAUTHENTICATED")
        self.check_active()
        return result


class HostBoundSnapshotSource:
    def __init__(self, *, client: NativeCrmHostClient, directory: Path,
                 store: OwnedSnapshotStore, handle: str, session_id: str,
                 deadline: float, clock=now_ms):
        self.client, self.deadline = client, deadline
        self.observation = observation = client.observe(handle, session_id, deadline)

        def current():
            return client.observe(handle, session_id, deadline) == observation

        self.current = current
        lease = NativeCrmLease(observation.identity, current,
                               (observation.authorization,) if observation.authorization is not None else ())
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

    def _bound_ref(self, ref_id):
        if self.observation.authorization is not None and self.observation.authorization.ref_id != ref_id:
            raise fault("NOT_FOUND")

    def read(self, ref_id: str):
        self._bound_ref(ref_id)
        snapshot = self.source.read(ref_id)
        self._checked()
        return snapshot_value(ref_id, snapshot)

    def revoke(self, ref_id: str):
        self._bound_ref(ref_id)
        self.source.revoke(ref_id)
        self._checked()
        return {"ref_id": ref_id, "revoked": True}


def create_native_crm_source_app(*, store: OwnedSnapshotStore, directory: Path,
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
                    if len(body) > 4096:
                        raise fault("INVALID_REQUEST")
            raw = json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)
            if type(raw) is not dict or raw.get("operation") not in {"register", "read", "revoke", "read_many", "inspect"}:
                raise fault("INVALID_REQUEST")
            operation = raw["operation"]
            if (not isinstance(raw.get("session_id"), str) or not NATIVE_ID.fullmatch(raw["session_id"])
                    or type(raw["budget_ms"]) is not int or not 1 <= raw["budget_ms"] <= MAX_BUDGET_MS
                    ):
                raise fault("INVALID_REQUEST")
            if operation == "inspect":
                refs = raw.get("refs")
                if (set(raw) != {"operation", "handle", "session_id", "refs", "budget_ms"}
                        or not isinstance(raw["handle"], str) or not REAUTH_HANDLE.fullmatch(raw["handle"])
                        or type(refs) is not list or not 1 <= len(refs) <= 64
                        or any(not isinstance(ref, str) or not REF_ID.fullmatch(ref) for ref in refs)
                        or len(set(refs)) != len(refs)):
                    raise fault("INVALID_REQUEST")
            elif operation == "read_many":
                items = raw.get("items")
                if (set(raw) != {"operation", "items", "session_id", "budget_ms"}
                        or not isinstance(items, list) or not 1 <= len(items) <= MAX_BATCH
                        or any(type(item) is not dict or set(item) != {"handle", "ref_id"}
                               or not isinstance(item["handle"], str) or not HANDLE.fullmatch(item["handle"])
                               or not isinstance(item["ref_id"], str) or not REF_ID.fullmatch(item["ref_id"]) for item in items)
                        or len({item["handle"] for item in items}) != len(items)
                        or len({item["ref_id"] for item in items}) != len(items)):
                    raise fault("INVALID_REQUEST")
            else:
                required = {"operation", "handle", "session_id", "budget_ms"}
                if operation != "register":
                    required.add("ref_id")
                if (len(body) > 512 or set(raw) != required or not isinstance(raw["handle"], str)
                        or not HANDLE.fullmatch(raw["handle"])
                        or (operation != "register" and (not isinstance(raw["ref_id"], str)
                                                        or not REF_ID.fullmatch(raw["ref_id"])))):
                    raise fault("INVALID_REQUEST")
            deadline = began + raw["budget_ms"] / 1000
            _remaining(deadline)
            if not capacity.acquire(blocking=False):
                raise fault("IDENTITY_UNAVAILABLE")
            cancelled = Event()

            def check_active():
                _remaining(deadline)
                if cancelled.is_set():
                    raise fault("IDENTITY_UNAVAILABLE")

            def run():
                try:
                    if operation == "inspect":
                        return inspect_sources(client=client, directory=directory, store=store,
                                               handle=raw["handle"], session_id=raw["session_id"],
                                               refs=tuple(refs), deadline=deadline, check_active=check_active)
                    if operation == "read_many":
                        return HostBoundSnapshotBatch(client=client, directory=directory, store=store,
                                                      items=items, session_id=raw["session_id"], deadline=deadline,
                                                      check_active=check_active).read()
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
            async def watch_disconnect():
                while not future.done():
                    await asyncio.sleep(0.025)
                    if await request.is_disconnected():
                        cancelled.set()
                        return

            watcher = asyncio.create_task(watch_disconnect()) if operation in {"read_many", "inspect"} else None
            try:
                value = await asyncio.wait_for(asyncio.shield(future), timeout=_remaining(deadline))
            finally:
                cancelled.set()
                if watcher is not None:
                    watcher.cancel()
                    try:
                        await watcher
                    except asyncio.CancelledError:
                        pass
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
