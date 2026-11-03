import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from backend.contracts.crm_analysis import CrmSnapshot
from backend.services.analytics.warehouse_page_projection import warehouse_projection, purchases_rows
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.page_context import PageAccessPolicy, PageRequestContext
from backend.services.analytics.page_documents import ResolvedPageBinding
from backend.services.analytics.page_result_access import AuthorizedSnapshot
from backend.services.analytics.first_purchase.asset_state import now_ms

PROJECTION = "crm-page-aggregate/v1"
NATIVE_POLICY = PageAccessPolicy("native-page-documents", "native-crm-aggregate", edit_tenant="native-pages")
ERRORS = {
    (401, "UNAUTHENTICATED"), (404, "NOT_FOUND"), (403, "RESULT_REVOKED"),
    (409, "RESULT_STALE"), (409, "RESULT_UNAVAILABLE"),
    (503, "SOURCE_UNAVAILABLE"), (503, "STATE_UNAVAILABLE"), (503, "IDENTITY_UNAVAILABLE"),
}
MESSAGES = {401: "请重新连接当前对话的 CRM。", 404: "结果不存在或当前对话不可见。",
            403: "结果授权已撤销。", 409: "结果来源或有效期已变化。", 503: "结果来源暂不可用，请重试。"}


def source_error(status=503, code="SOURCE_UNAVAILABLE"):
    if (status, code) not in ERRORS:
        status, code = 503, "SOURCE_UNAVAILABLE"
    return AnalyticsError(status, code, MESSAGES[status], retryable=status == 503)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class NativePageSource:
    def __init__(self, callback_origin):
        parsed = urllib.parse.urlsplit(callback_origin)
        if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port
                or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password):
            raise ValueError("private loopback callback required")
        self.callback = callback_origin + "/native-pages/callback"
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())

    def authenticate(self, request):
        lease = request.headers.get("x-native-page-lease", "")
        if (len(request.headers.getlist("x-native-page-lease")) != 1 or len(lease) != 64
                or "origin" in request.headers or "sec-fetch-site" in request.headers):
            raise source_error(401, "UNAUTHENTICATED")

        def remote(operation, **fields):
            body = json.dumps({"operation": operation, **fields}).encode()
            req = urllib.request.Request(self.callback, data=body, method="POST", headers={
                "Authorization": "Bearer " + lease, "Content-Type": "application/json"})
            try:
                with self.opener.open(req, timeout=5) as response:
                    raw = response.read(524289)
                    if len(raw) > 524288:
                        raise source_error()
                    return json.loads(raw)
            except urllib.error.HTTPError as error:
                try:
                    value = json.loads(error.read(8192))
                    code = value.get("error", {}).get("code")
                except (ValueError, TypeError, AttributeError):
                    code = None
                raise source_error(error.code, code) from None
            except (OSError, ValueError, TypeError):
                raise source_error() from None

        auth = remote("authenticate", method=request.method, path=request.url.path,
                      query=request.url.query, body_sha256=request.state.page_body_sha256,
                      idempotency_key=request.headers.get("idempotency-key"))
        try:
            if (set(auth) != {"actor_id", "capabilities", "data_scopes", "deadline_ms"}
                    or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", auth["actor_id"])
                    or set(auth["capabilities"]) != {"dashboard:read", "dashboard:update"}
                    or set(auth["data_scopes"]) != {NATIVE_POLICY.document_scope, NATIVE_POLICY.result_scope}
                    or type(auth["deadline_ms"]) is not int or auth["deadline_ms"] <= now_ms()):
                raise ValueError("invalid private grant")
            actor = AnalyticsPrincipal(auth["actor_id"], frozenset(auth["capabilities"]), frozenset(auth["data_scopes"]))
            return PageRequestContext(actor, auth["deadline_ms"], remote)
        except (ValueError, TypeError, KeyError):
            raise source_error() from None

    def read(self, context, session, ref, *, target_key=()):
        context.check_active()
        if context.remote is None:
            raise source_error(401, "UNAUTHENTICATED")
        value = context.remote("read", session_id=session, ref=ref)
        old = context.observations.setdefault((session, ref), value)
        if old != value:
            raise source_error(409, "RESULT_STALE")
        try:
            identity = value["identity"]
            if identity["native_session_id"] != session or value["ref"] != ref:
                raise source_error(404, "NOT_FOUND")
            expires = identity["expires_at_ms"]
            if type(expires) is not int or now_ms() >= expires:
                raise source_error(409, "RESULT_STALE")
            if value["snapshot"].get("schema_version") == "native-warehouse-snapshot-read/v1":
                snapshot, rows, metadata, time_range = warehouse_projection(value["snapshot"], ref, identity["data_kind"])
                projection = metadata["projection_version"]
                key = (context.actor.actor_id, session, identity["connection_generation"], value["epoch"], ref,
                       snapshot.result_sha256, projection, snapshot.snapshot_id, snapshot.warehouse.data_version,
                       snapshot.warehouse.semantic_revision, *target_key)
                return AuthorizedSnapshot(
                    result_ref=ref, owner=context.actor.actor_id, unit="per-row", time_range=time_range,
                    queried_at=snapshot.captured_at.isoformat(), source=projection, result_version=1,
                    expires_at_ms=expires, rows=tuple(rows), data_scope=NATIVE_POLICY.result_scope,
                    session_id=session, authorization_key=key, metadata=metadata)
            snapshot = CrmSnapshot.model_validate(value["snapshot"])
            raw = value["snapshot"]["result"]
            digest = hashlib.sha256(json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            if digest != snapshot.result_sha256 or snapshot.data_kind != identity["data_kind"]:
                raise source_error(409, "RESULT_STALE")
            result = snapshot.result.model_dump(mode="json")
            rows = purchases_rows(result)
            key = (context.actor.actor_id, session, identity["connection_generation"], value["epoch"], ref,
                   snapshot.result_sha256, PROJECTION, *target_key)
            return AuthorizedSnapshot(
                result_ref=ref, owner=context.actor.actor_id, unit="per-row",
                time_range={"start": result["filters"]["start_date"], "end": result["filters"]["end_date"]},
                queried_at=value["snapshot"]["captured_at"], source=PROJECTION, result_version=1,
                expires_at_ms=expires, rows=tuple(rows), data_scope=NATIVE_POLICY.result_scope,
                session_id=session, authorization_key=key,
                metadata={"projection_version": PROJECTION, "filters": result["filters"],
                          "coverage": result["coverage"], "limitations": result["limitations"],
                          "date_bounds": "inclusive", "data_through": result["data_through"],
                          "refund_as_of": result["refund_as_of"], "data_kind": snapshot.data_kind})
        except (ValueError, TypeError, KeyError, AttributeError):
            raise source_error() from None

    def resolve_binding(self, actor, session, ref, *, source_context):
        snapshot = self.read(source_context, session, ref)
        if snapshot.owner != actor.actor_id:
            raise source_error(404, "NOT_FOUND")
        return ResolvedPageBinding("VERIFIED", frozenset({NATIVE_POLICY.result_scope}))
