"""Independent free-page asset and bridge contract. Not BoardSpec.

schema_version is free-page/v1. HTML/CSS/JavaScript are the source package;
there is no component catalogue and no INVALID_BOARD.
"""
from __future__ import annotations

from typing import Annotated, Literal, Union
import hashlib
import json
import re

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

SCHEMA_VERSION = "free-page/v1"
BRIDGE_PROTOCOL = "free-page-bridge/v1"
IDENTITY = r"^[A-Za-z0-9_.:-]{1,128}$"
Opaque = Annotated[str, Field(min_length=1, max_length=128, pattern=IDENTITY)]
Title = Annotated[str, Field(min_length=1, max_length=160, pattern=r"\S")]
Version = Annotated[int, Field(ge=1, le=9007199254740991)]
BindingState = Literal["UNBOUND_SAMPLE", "BOUND_VERIFIED", "BOUND_STALE"]
PageOperation = Literal["GENERATE", "PATCH", "SAVE", "ROLLBACK"]
PreviewStatus = Literal["PENDING", "APPLIED", "CANCELLED"]
NodeKind = Literal["static_element", "dynamic_region", "whole_page"]
ReadMode = Literal["summary", "page", "range"]
BRIDGE_MAX_RESPONSE_BYTES = 65536
BRIDGE_MAX_CUMULATIVE_ROWS = 2000
PACKAGE_MAX_BYTES = 2_000_000
HTML_MAX_CHARS = 1_048_576
STYLE_MAX_CHARS = 524_288

PAGE_ERRORS = {
    "VERSION_CONFLICT": 409,
    "NOT_FOUND": 404,
    "FORBIDDEN": 403,
    "PREVIEW_EXPIRED": 409,
    "PREVIEW_CANCELLED": 409,
    "IDEMPOTENCY_CONFLICT": 409,
    "INVALID_PAGE": 422,
    "RESULT_UNAVAILABLE": 409,
    "RESULT_STALE": 409,
    "RESULT_REVOKED": 403,
    "MAPPING_STALE": 409,
    "SCOPE_REQUIRES_CONFIRMATION": 409,
    "RESOURCE_HASH_MISMATCH": 409,
    "PACKAGE_TOO_LARGE": 413,
    "BRIDGE_UNKNOWN_OP": 400,
    "BRIDGE_NONCE": 409,
    "BRIDGE_EXPIRED_INSTANCE": 409,
    "BINDING_CORRUPT": 409,
    "INVALID_EDIT": 422,
    "INVALID_CAS": 422,
    "INVALID_EDIT_CONTEXT": 422,
    "CAS_CONFLICT": 409,
    "EDIT_EXPIRED": 409,
    "CAPABILITY_DENIED": 403,
    "SCOPE_VIOLATION": 422,
}


class PageModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


PACKAGE_TOO_LARGE_TYPE = "package_too_large"


def unique(values):
    if len(set(values)) != len(values):
        raise ValueError("items must be unique")
    return values


def is_package_too_large(error: BaseException) -> bool:
    details = getattr(error, "errors", None)
    if callable(details):
        for item in details():
            if item.get("type") == PACKAGE_TOO_LARGE_TYPE:
                return True
            if "超过大小上限" in str(item.get("msg", "")):
                return True
        return False
    return "超过大小上限" in str(error)


class PageResource(PageModel):
    resource_id: Opaque
    content_type: Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._+-]+/[A-Za-z0-9._+-]+$")]
    sha256: Annotated[str, Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")]
    byte_length: Annotated[int, Field(ge=0, le=PACKAGE_MAX_BYTES)]


class PageNodeMapEntry(PageModel):
    node_id: Opaque
    kind: NodeKind
    selector: Annotated[str, Field(min_length=1, max_length=512, pattern=r"\S")]


class PageElementKey(PageModel):
    attribute: Literal['id', 'data-node', 'data-page-block', 'data-page-field', 'class', 'text']
    value: Annotated[str, Field(min_length=1, max_length=2000)]

    @model_validator(mode='after')
    def identity_value(self):
        if self.attribute == 'text':
            if not self.value.strip():
                raise ValueError('empty text identity')
        elif not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.:-]{0,159}', self.value):
            raise ValueError('invalid element identity')
        return self


class PageElementStep(PageModel):
    tag: Annotated[str, Field(min_length=1, max_length=80, pattern=r'^[a-z][a-z0-9-]*$')]
    key: PageElementKey | None = None


class PageElementTarget(PageModel):
    anchor: PageElementKey
    path: Annotated[list[PageElementStep], Field(max_length=64)]

    @model_validator(mode='after')
    def keyed_root(self):
        if self.anchor.attribute in {'class', 'text'}:
            raise ValueError('root requires an explicit identity')
        return self


PRESENTATION_STYLES = frozenset(('color background-color font-size font-weight font-style font-family line-height letter-spacing text-align text-decoration white-space border border-color border-width border-style border-radius padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left display gap row-gap column-gap grid-template-columns flex-direction flex-wrap align-items justify-content order max-width min-width width').split())


class PagePresentationEdit(PageModel):
    target: PageElementTarget
    text: Annotated[str, Field(max_length=20000)] | None = None
    style: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode='after')
    def declarative_only(self):
        if self.text is None and not self.style:
            raise ValueError('empty presentation edit')
        if len(self.style) > 32 or any(k not in PRESENTATION_STYLES or not 0 < len(v) <= 160
                or not re.fullmatch(r'[A-Za-z0-9#.,%() /+\-]+', v)
                or re.search(r'url|expression|var\s*\(|!important', v, re.I) for k, v in self.style.items()):
            raise ValueError('unsupported presentation style')
        return self


class PagePresentation(PageModel):
    version: Literal[1] = 1
    source_hash: Annotated[str, Field(pattern=r'^[0-9a-f]{64}$')]
    edits: Annotated[list[PagePresentationEdit], Field(max_length=2000)] = Field(default_factory=list)

    @model_validator(mode='after')
    def unique_targets(self):
        unique([json.dumps(e.target.model_dump(exclude_none=True), sort_keys=True) for e in self.edits])
        return self


def page_source_hash(html, css='', js=''):
    return hashlib.sha256(json.dumps([html, css, js], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


class PagePackage(PageModel):
    html: Annotated[str, Field(min_length=1, max_length=HTML_MAX_CHARS)]
    css: Annotated[str, Field(max_length=STYLE_MAX_CHARS)] = ""
    js: Annotated[str, Field(max_length=STYLE_MAX_CHARS)] = ""
    resources: Annotated[list[PageResource], Field(max_length=32)] = Field(default_factory=list)
    node_map: Annotated[list[PageNodeMapEntry], Field(max_length=2000)] = Field(default_factory=list)
    presentation: PagePresentation | None = None

    @model_validator(mode="after")
    def distinct_and_sized(self):
        if not self.html.strip():
            raise ValueError("html must contain visible source")
        unique([item.resource_id for item in self.resources])
        unique([item.node_id for item in self.node_map])
        encoded = len(self.html.encode()) + len(self.css.encode()) + len(self.js.encode())
        encoded += sum(item.byte_length for item in self.resources)
        if self.presentation is not None:
            if self.presentation.source_hash != page_source_hash(self.html, self.css, self.js):
                raise ValueError('presentation source changed; explicitly rebind edits before saving')
            encoded += len(self.presentation.model_dump_json().encode())
        if encoded > PACKAGE_MAX_BYTES:
            raise ValueError("页面源码包超过大小上限。")
        return self


class PageBinding(PageModel):
    binding_id: Opaque
    result_ref: Opaque
    node_id: Opaque | None = None
    data_ref: Opaque | None = None
    mode: ReadMode = "summary"


class PageBindingManifest(PageModel):
    bindings: Annotated[list[PageBinding], Field(max_length=64)] = Field(default_factory=list)
    result_refs: Annotated[list[Opaque], Field(max_length=64)] = Field(default_factory=list)

    @model_validator(mode="after")
    def consistent_refs(self):
        unique([item.binding_id for item in self.bindings])
        unique(self.result_refs)
        declared = set(self.result_refs)
        for item in self.bindings:
            if item.result_ref not in declared:
                raise ValueError("binding result_ref must be listed in result_refs")
        return self


OriginPath = Annotated[str, Field(min_length=1, max_length=512)]


def workspace_origin_path(value: str | None) -> str | None:
    if value is None:
        return None
    path = value.replace("\\", "/").removeprefix("./")
    parts = path.split("/")
    if (
        not path
        or path.startswith("/")
        or "://" in path
        or "\0" in path
        or any(part in {"", ".", ".."} for part in parts)
    ):
        raise ValueError("origin_path must be a workspace-relative file path")
    return path


class PageDraft(PageModel):
    title: Title
    session_id: Opaque | None
    package: PagePackage
    binding_manifest: PageBindingManifest = Field(default_factory=PageBindingManifest)
    origin_path: OriginPath | None = None
    origin_file_id: Opaque | None = None

    @model_validator(mode="after")
    def source_is_explicit(self):
        if self.session_id is None and self.origin_file_id is None:
            raise ValueError("页面必须有来源会话或手动添加的文件")
        if self.session_id is None and self.binding_manifest.result_refs:
            raise ValueError("手动添加的页面不能声明已验证结果绑定")
        if self.binding_manifest.result_refs and self.package.presentation and self.package.presentation.edits:
            raise ValueError("业务绑定页面不能覆盖显示数据或局部样式")
        return self

    @field_validator("origin_path")
    @classmethod
    def origin_is_relative(cls, value: str | None) -> str | None:
        return workspace_origin_path(value)


class PageDocument(PageDraft):
    schema_version: Literal["free-page/v1"] = SCHEMA_VERSION
    page_id: Opaque
    version: Version
    binding_state: BindingState

    @model_validator(mode="after")
    def binding_matches_refs(self):
        unbound = len(self.binding_manifest.result_refs) == 0
        if unbound and self.binding_state != "UNBOUND_SAMPLE":
            raise ValueError("无 result_refs 时只能是 UNBOUND_SAMPLE")
        if not unbound and self.binding_state == "UNBOUND_SAMPLE":
            raise ValueError("未绑定页不能声明 result_refs")
        return self


class PagePatchPreview(PageModel):
    """D6: patch preview of source and/or manifest. Confirm is a separate call."""
    base_version: Version
    title: Title | None = None
    package: PagePackage | None = None
    binding_manifest: PageBindingManifest | None = None

    @model_validator(mode="after")
    def nonempty_nonnull(self):
        fields = self.model_fields_set - {"base_version"}
        if not fields or any(getattr(self, key) is None for key in fields):
            raise ValueError("a patch must have explicit non-null changes")
        return self


class PageSavePreview(PageModel):
    """D9: explicit save of the host in-memory draft. Exit-edit is not save."""
    base_version: Version
    title: Title
    package: PagePackage
    binding_manifest: PageBindingManifest


class PageRollbackPreview(PageModel):
    base_version: Version
    to_version: Version

    @model_validator(mode="after")
    def earlier_target(self):
        if self.to_version >= self.base_version:
            raise ValueError("rollback target must be older than the current base_version")
        return self


class PageSnapshot(PageModel):
    spec: PageDocument


class PagePreview(PageModel):
    preview_id: Opaque
    status: PreviewStatus
    operation: PageOperation
    base_version: Annotated[int, Field(ge=0, le=9007199254740991)]
    expires_at_ms: int
    snapshot: PageSnapshot


class PageRevision(PageModel):
    version: Version
    operation: PageOperation
    created_at_ms: int


# free-page-edit/v1 is additive. PagePackage and PageDocument stay free-page/v1.
EDIT_SCHEMA = "free-page-edit/v1"
EDIT_CONTEXT_SCHEMA = "free-page-edit-context/v1"
EDIT_CHANNELS = ("presentation", "source", "logic")
EDIT_ACTIONS = ("insert", "update", "delete", "move", "replace")
EDIT_ENCODINGS = ("overlay", "bytes")
EDIT_ERROR_CODES = (
    "INVALID_EDIT", "INVALID_CAS", "INVALID_EDIT_CONTEXT", "CAS_CONFLICT", "VERSION_CONFLICT",
    "EDIT_EXPIRED", "CAPABILITY_DENIED", "SCOPE_VIOLATION", "IDEMPOTENCY_CONFLICT", "FORBIDDEN",
    "MAPPING_STALE",
)
EditChannel = Literal["presentation", "source", "logic"]
EditAction = Literal["insert", "update", "delete", "move", "replace"]
EditEncoding = Literal["overlay", "bytes"]
SHA256 = Annotated[str, Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")]
Capability = Annotated[str, Field(min_length=1, max_length=64, pattern=IDENTITY)]
SAFE_MAX = 9007199254740991


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _contains(outer: "SourceRange", inner: "SourceRange") -> bool:
    return inner.start >= outer.start and inner.end <= outer.end


def _overlaps(left: "SourceRange", right: "SourceRange") -> bool:
    return left.start < right.end and right.start < left.end


def _sha256(value: object) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(char in "0123456789abcdef" for char in value)


def _string_map(value: dict[str, str] | None, label: str) -> None:
    if value is None:
        return
    _require(1 <= len(value) <= 32, f"INVALID_EDIT: {label} 为空或过多")
    for key, item in value.items():
        _require(
            isinstance(key, str) and key.strip() and len(key) <= 64 and isinstance(item, str) and len(item) <= 512,
            f"INVALID_EDIT: {label} 项非法",
        )


class SourceRange(PageModel):
    start: Annotated[int, Field(ge=0, le=PACKAGE_MAX_BYTES)]
    end: Annotated[int, Field(ge=0, le=PACKAGE_MAX_BYTES)]

    @model_validator(mode="after")
    def ordered(self):
        _require(self.end >= self.start, "INVALID_EDIT: source range end is before start")
        return self


class PresentationOverlay(PageModel):
    """Presentation writes style, text, and attributes. They do not splice source bytes."""
    text: Annotated[str, Field(max_length=8000)] | None = None
    attributes: dict[str, Annotated[str, Field(max_length=512)]] | None = None
    style: dict[str, Annotated[str, Field(max_length=512)]] | None = None

    @model_validator(mode="after")
    def nonempty_overlay(self):
        _string_map(self.attributes, "attributes")
        _string_map(self.style, "style")
        _require(self.text is not None or self.attributes is not None or self.style is not None, "INVALID_EDIT: overlay 不能为空")
        return self


class NodeRef(PageModel):
    page_id: Opaque
    node_id: Opaque
    kind: NodeKind
    selector: Annotated[str, Field(min_length=1, max_length=512, pattern=r"\S")] | None = None
    source_range: SourceRange | None = None
    mapping_token: Opaque
    source_hash: SHA256
    region_hash: SHA256

    @model_validator(mode="after")
    def locator_present(self):
        _require(self.selector is not None or self.source_range is not None, "INVALID_EDIT: NodeRef 需要 selector 或 source range")
        if self.source_range is not None:
            _require(self.source_range.end > self.source_range.start, "INVALID_EDIT: 节点 source range 不能为空")
        return self


class SelectedScope(PageModel):
    page_id: Opaque
    node_id: Opaque
    source_range: SourceRange | None = None

    @model_validator(mode="after")
    def scope_range_nonempty(self):
        if self.source_range is not None:
            _require(self.source_range.end > self.source_range.start, "INVALID_EDIT: selected scope range 不能为空")
        return self


class CAS(PageModel):
    """Compare-and-swap precondition. Hashes bind an edit to its exact region."""
    base_version: Version
    source_hash: SHA256
    region_hash: SHA256
    idempotency_key: Annotated[str, Field(min_length=1, max_length=200)]

    @field_validator("idempotency_key")
    @classmethod
    def idempotency_key_is_visible(cls, value: str) -> str:
        _require(value == value.strip(), "INVALID_CAS: 幂等键非法")
        return value


class EditOperation(PageModel):
    schema_version: Literal["free-page-edit/v1"] = EDIT_SCHEMA
    operation_id: Opaque
    channel: EditChannel
    action: EditAction
    selected_scope: SelectedScope
    capabilities: Annotated[list[Capability], Field(min_length=1, max_length=16)]
    node: NodeRef
    cas: CAS
    encoding: EditEncoding
    payload: str | PresentationOverlay | None = None
    byte_length: Annotated[int, Field(ge=0, le=PACKAGE_MAX_BYTES)] = 0
    splice: SourceRange | None = None
    destination: SourceRange | None = None
    expected_region_hash: SHA256 | None = None

    @model_validator(mode="after")
    def channel_rules(self):
        unique(self.capabilities)
        _require(f"edit:{self.channel}" in self.capabilities, "CAPABILITY_DENIED: 缺少通道能力")
        _require(self.selected_scope.page_id == self.node.page_id, "SCOPE_VIOLATION: scope 与节点 page_id 不一致")
        _require(self.selected_scope.node_id == self.node.node_id, "SCOPE_VIOLATION: scope 与节点 node_id 不一致")
        _require(
            self.cas.source_hash == self.node.source_hash and self.cas.region_hash == self.node.region_hash,
            "CAS_CONFLICT: CAS hash 与节点不一致",
        )
        if self.node.source_range is not None and self.selected_scope.source_range is not None:
            _require(
                _contains(self.selected_scope.source_range, self.node.source_range),
                "SCOPE_VIOLATION: 节点范围超出 selected scope",
            )
        if self.channel == "presentation":
            self._presentation()
        else:
            self._source_or_logic()
        return self

    def _presentation(self) -> None:
        _require(self.encoding == "overlay", "INVALID_EDIT: presentation 必须使用 overlay")
        _require(self.byte_length == 0, "INVALID_EDIT: overlay 的 byte_length 必须为 0")
        _require(self.splice is None and self.expected_region_hash is None, "INVALID_EDIT: presentation 不能声明字节覆盖")
        if self.action == "delete":
            _require(self.payload is None and self.destination is None, "INVALID_EDIT: presentation delete 不能携带 payload")
            return
        _require(isinstance(self.payload, PresentationOverlay), "INVALID_EDIT: overlay payload 必须是对象")
        if self.action == "move":
            _require(self.destination is not None, "INVALID_EDIT: move 必须声明 destination")
            _require(
                self.node.source_range is not None and self.selected_scope.source_range is not None,
                "INVALID_EDIT: move 必须有 source range",
            )
            _require(_contains(self.node.source_range, self.destination), "SCOPE_VIOLATION: destination 超出节点范围")
            _require(
                _contains(self.selected_scope.source_range, self.destination),
                "SCOPE_VIOLATION: destination 超出 selected scope",
            )
            return
        _require(self.destination is None, "INVALID_EDIT: 只有 move 可以携带 destination")

    def _source_or_logic(self) -> None:
        _require(self.encoding == "bytes", "INVALID_EDIT: source/logic 必须使用 bytes，不能静默覆盖")
        _require(
            self.node.source_range is not None and self.selected_scope.source_range is not None,
            "INVALID_EDIT: source/logic 必须声明 source range，不能覆盖未知字节",
        )
        _require(self.expected_region_hash == self.node.region_hash, "CAS_CONFLICT: expected_region_hash 与节点 region_hash 不一致")
        _require(self.splice is not None, "INVALID_EDIT: source/logic 缺少 splice，不能覆盖未知字节")
        _require(_contains(self.node.source_range, self.splice), "SCOPE_VIOLATION: splice 超出节点 source range")
        if self.action == "insert":
            _require(self.splice.start == self.splice.end and self.destination is None, "INVALID_EDIT: insert 必须是范围内的插入点")
            self._bytes(allow_empty=False)
            return
        if self.action == "delete":
            _require(
                self.splice.end > self.splice.start and self.payload is None and self.byte_length == 0 and self.destination is None,
                "INVALID_EDIT: delete 不得携带 payload",
            )
            return
        if self.action == "move":
            _require(self.splice.end > self.splice.start and self.destination is not None, "INVALID_EDIT: move 必须声明源区间和 destination")
            _require(_contains(self.node.source_range, self.destination), "SCOPE_VIOLATION: destination 超出节点范围")
            _require(not _overlaps(self.splice, self.destination), "INVALID_EDIT: move 的源区间与目标区间重叠")
            self._bytes(allow_empty=False)
            return
        _require(self.destination is None and self.splice.end > self.splice.start, "INVALID_EDIT: update/replace 必须声明非空 splice")
        if self.action == "replace":
            _require(
                self.splice.start == self.node.source_range.start and self.splice.end == self.node.source_range.end,
                "INVALID_EDIT: replace 必须精确覆盖节点 source range，不能留下未声明字节",
            )
        self._bytes(allow_empty=True)

    def _bytes(self, *, allow_empty: bool) -> None:
        _require(isinstance(self.payload, str), "INVALID_EDIT: bytes payload 与 byte_length 不一致")
        _require(len(self.payload.encode("utf-8")) == self.byte_length, "INVALID_EDIT: bytes payload 与 byte_length 不一致")
        if not allow_empty:
            _require(self.byte_length > 0, "INVALID_EDIT: 字节操作不能为空")


class EditContext(PageModel):
    schema_version: Literal["free-page-edit-context/v1"] = EDIT_CONTEXT_SCHEMA
    edit_context_id: Opaque
    user_id: Opaque
    tenant_id: Opaque
    page_id: Opaque
    version: Version
    selected_node: NodeRef
    capabilities: Annotated[list[Capability], Field(min_length=0, max_length=16)]
    created_at: Annotated[int, Field(ge=0, le=SAFE_MAX)]
    expires_at: Annotated[int, Field(ge=0, le=SAFE_MAX)]
    ttl_ms: Annotated[int, Field(ge=1, le=86_400_000)]

    @model_validator(mode="after")
    def ttl_matches_selected_node(self):
        unique(self.capabilities)
        _require(self.selected_node.page_id == self.page_id, "INVALID_EDIT_CONTEXT: selected node 与 page_id 不一致")
        _require(self.expires_at == self.created_at + self.ttl_ms, "INVALID_EDIT_CONTEXT: expires_at 必须等于 created_at + ttl_ms")
        return self


def _fail(code: str, message: str) -> dict:
    return {"ok": False, "error": {"code": code, "message": message}}


def _validation_decision(exc: ValidationError, fallback: str) -> dict:
    for item in exc.errors():
        loc = item.get("loc", ())
        if item.get("type") == "literal_error" and loc and loc[-1] == "action":
            return _fail("INVALID_EDIT", "未知 operation")
        if item.get("type") == "literal_error" and loc and loc[-1] == "channel":
            return _fail("INVALID_EDIT", "未知 channel")
    blob = " ".join(str(item.get("msg", "")) for item in exc.errors())
    for code in EDIT_ERROR_CODES:
        if code in blob:
            return _fail(code, blob)
    if any(item.get("type") == "extra_forbidden" for item in exc.errors()):
        return _fail(fallback, "含未知字段")
    return _fail(fallback, blob or "字段非法")


def parse_node_ref(raw: object) -> dict:
    try:
        return {"ok": True, "value": NodeRef.model_validate(raw)}
    except ValidationError as exc:
        return _validation_decision(exc, "INVALID_EDIT")


def parse_edit_operation(raw: object) -> dict:
    if not isinstance(raw, dict):
        return _fail("INVALID_EDIT", "EditOperation 必须是对象")
    data = dict(raw)
    payload = data.get("payload")
    if data.get("encoding") == "overlay" and isinstance(payload, dict):
        try:
            data["payload"] = PresentationOverlay.model_validate(payload)
        except ValidationError as exc:
            return _validation_decision(exc, "INVALID_EDIT")
    try:
        return {"ok": True, "value": EditOperation.model_validate(data)}
    except ValidationError as exc:
        return _validation_decision(exc, "INVALID_EDIT")


def parse_edit_context(raw: object) -> dict:
    try:
        return {"ok": True, "value": EditContext.model_validate(raw)}
    except ValidationError as exc:
        return _validation_decision(exc, "INVALID_EDIT_CONTEXT")


def cas_fingerprint(cas: CAS) -> str:
    return f"{cas.base_version}\0{cas.source_hash}\0{cas.region_hash}\0{cas.idempotency_key}"


def evaluate_cas(cas: CAS, *, version: object, source_hash: object, region_hash: object, prior: dict | None = None) -> dict:
    if not isinstance(cas, CAS):
        return _fail("INVALID_CAS", "CAS 必须是对象")
    if prior is not None:
        if not isinstance(prior.get("idempotency_key"), str) or not isinstance(prior.get("fingerprint"), str):
            return _fail("INVALID_CAS", "幂等回执非法")
        if prior["idempotency_key"] == cas.idempotency_key:
            if prior["fingerprint"] != cas_fingerprint(cas):
                return _fail("IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同的 CAS")
            return {"ok": True, "value": {"replay": True, "cas": cas}}
    if isinstance(version, bool) or not isinstance(version, int) or version < 1 or not _sha256(source_hash) or not _sha256(region_hash):
        return _fail("INVALID_CAS", "当前版本非法")
    if version != cas.base_version:
        return _fail("VERSION_CONFLICT", "base_version 与当前版本不一致")
    if source_hash != cas.source_hash or region_hash != cas.region_hash:
        return _fail("CAS_CONFLICT", "source_hash 或 region_hash 与当前区域不一致")
    return {"ok": True, "value": {"replay": False, "cas": cas}}


def _same_range(left: SourceRange | None, right: SourceRange | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return left.start == right.start and left.end == right.end


def admit_edit(
    context: EditContext,
    operation: EditOperation,
    *,
    actor_user_id: object,
    actor_tenant_id: object,
    now_ms: object,
    version: object,
    source_hash: object,
    region_hash: object,
    prior: dict | None = None,
) -> dict:
    if not isinstance(context, EditContext) or not isinstance(operation, EditOperation):
        return _fail("INVALID_EDIT", "admit 需要已校验的合同对象")
    if isinstance(now_ms, bool) or not isinstance(now_ms, int) or now_ms < 0:
        return _fail("INVALID_EDIT_CONTEXT", "now_ms 非法")
    if now_ms < context.created_at:
        return _fail("INVALID_EDIT_CONTEXT", "上下文尚未生效")
    if now_ms >= context.expires_at:
        return _fail("EDIT_EXPIRED", "编辑上下文已过期")
    if actor_user_id != context.user_id or actor_tenant_id != context.tenant_id:
        return _fail("FORBIDDEN", "编辑上下文不属于当前用户或租户")
    if operation.node.page_id != context.page_id or operation.selected_scope.page_id != context.page_id:
        return _fail("SCOPE_VIOLATION", "操作页面超出编辑上下文")
    if operation.node.node_id != context.selected_node.node_id:
        return _fail("SCOPE_VIOLATION", "操作节点超出 selected node")
    selected = context.selected_node
    node = operation.node
    if (
        selected.kind != node.kind
        or selected.selector != node.selector
        or selected.mapping_token != node.mapping_token
        or not _same_range(selected.source_range, node.source_range)
    ):
        return _fail("MAPPING_STALE", "selected node 与操作节点映射不一致")
    if selected.source_hash != node.source_hash or selected.region_hash != node.region_hash:
        return _fail("CAS_CONFLICT", "上下文节点 hash 与操作不一致")
    if any(item not in context.capabilities for item in operation.capabilities):
        return _fail("CAPABILITY_DENIED", "上下文未授予操作所需能力")
    if context.version != operation.cas.base_version:
        return _fail("VERSION_CONFLICT", "上下文版本与 CAS base_version 不一致")
    decision = evaluate_cas(
        operation.cas, version=version, source_hash=source_hash, region_hash=region_hash, prior=prior,
    )
    if not decision["ok"]:
        return decision
    return {"ok": True, "value": {"context": context, "operation": operation, "cas": decision["value"]}}


class PageListItem(PageModel):
    page_id: Opaque
    title: Title
    version: Version
    session_id: Opaque | None
    binding_state: BindingState
    origin_path: OriginPath | None = None
    origin_file_id: Opaque | None = None

    @field_validator("origin_path")
    @classmethod
    def origin_is_relative(cls, value: str | None) -> str | None:
        return workspace_origin_path(value)


class PageList(PageModel):
    items: list[PageListItem]


class PageCancelResult(PageModel):
    preview_id: Opaque
    status: Literal["CANCELLED"]


class PageBridgeHandshake(PageModel):
    protocol: Literal["free-page-bridge/v1"] = BRIDGE_PROTOCOL
    instance_id: Opaque
    page_id: Opaque
    version: Version
    nonce: Opaque


class PageBridgeEnvelope(PageModel):
    protocol: Literal["free-page-bridge/v1"] = BRIDGE_PROTOCOL
    instance_id: Opaque
    request_id: Opaque
    nonce: Opaque
    seq: Annotated[int, Field(ge=0, le=9007199254740991)]


class PageDataReadRequest(PageBridgeEnvelope):
    op: Literal["data.read"]
    result_ref: Opaque
    mode: ReadMode = "summary"
    cursor: Annotated[str, Field(min_length=1, max_length=256)] | None = None
    limit: Annotated[int, Field(ge=1, le=50)] = 50


class PageDataCancelRequest(PageBridgeEnvelope):
    op: Literal["data.cancel"]


class PageDataChunkEvent(PageBridgeEnvelope):
    op: Literal["data.chunk"]
    unit: Annotated[str, Field(min_length=1, max_length=24)] | None = None
    time_range: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    queried_at: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    source: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    row_count: Annotated[int, Field(ge=0, le=BRIDGE_MAX_CUMULATIVE_ROWS)] | None = None
    byte_length: Annotated[int, Field(ge=0, le=BRIDGE_MAX_RESPONSE_BYTES)] | None = None


class PageDataEndEvent(PageBridgeEnvelope):
    op: Literal["data.end"]


class PageDataErrorEvent(PageBridgeEnvelope):
    op: Literal["data.error"]
    code: Literal[
        "RESULT_UNAVAILABLE", "RESULT_STALE", "RESULT_REVOKED", "FORBIDDEN",
        "BRIDGE_NONCE", "BRIDGE_EXPIRED_INSTANCE", "BRIDGE_UNKNOWN_OP", "PACKAGE_TOO_LARGE",
    ]
    message: Annotated[str, Field(min_length=1, max_length=500)]


class PageBindingStateEvent(PageBridgeEnvelope):
    op: Literal["binding.state"]
    binding_state: BindingState


PageBridgeRequest = Annotated[Union[PageDataReadRequest, PageDataCancelRequest], Field(discriminator="op")]
PageBridgeEvent = Annotated[
    Union[PageDataChunkEvent, PageDataEndEvent, PageDataErrorEvent, PageBindingStateEvent],
    Field(discriminator="op"),
]

FORBIDDEN_BRIDGE_OPS = ("sql", "save", "http.fetch", "credential.read")


def _optional_omit_null(schema: dict, *fields: str) -> None:
    """D6 omit-fields: optional properties are absent, not explicit null."""
    props = schema.get("properties") or {}
    for name in fields:
        item = props.get(name)
        if not isinstance(item, dict):
            continue
        item.pop("default", None)
        options = item.get("anyOf")
        if not options:
            continue
        non_null = [option for option in options if option.get("type") != "null"]
        if len(non_null) != 1:
            continue
        replacement = dict(non_null[0])
        for key in ("title", "description"):
            if key in item and key not in replacement:
                replacement[key] = item[key]
        props[name] = replacement


def page_documents_openapi() -> dict:
    """Offline type source. HTTP tests also check actual route model bindings."""
    schemas = {}
    for model in (
        PageResource, PageNodeMapEntry, PagePackage, PageBinding, PageBindingManifest,
        PageDraft, PageDocument, PagePatchPreview, PageSavePreview, PageRollbackPreview,
        PageSnapshot, PagePreview, PageRevision, PageListItem, PageList, PageCancelResult,
        SourceRange, SelectedScope, PresentationOverlay, NodeRef, CAS, EditOperation, EditContext,
        PageBridgeHandshake, PageDataReadRequest, PageDataCancelRequest,
        PageDataChunkEvent, PageDataEndEvent, PageDataErrorEvent, PageBindingStateEvent,
    ):
        schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
        schemas.update(schema.pop("$defs", {}))
        schemas[model.__name__] = schema
    # These additive fields remain optional for existing free-page/v1 callers.
    for model, field in [('PagePackage', 'presentation'), ('PageElementStep', 'key'), ('PagePresentationEdit', 'text')]:
        schemas[model]['properties'][field].pop('default', None)
    _optional_omit_null(schemas["PagePatchPreview"], "title", "package", "binding_manifest")
    _optional_omit_null(schemas["PageDraft"], "origin_path", "origin_file_id")
    _optional_omit_null(schemas["PageDocument"], "origin_path", "origin_file_id")
    _optional_omit_null(schemas["PageListItem"], "origin_path", "origin_file_id")
    def json_ref(name):
        return {"$ref": f"#/components/schemas/{name}"}
    preview_ok = {"description": "Page preview", "content": {"application/json": {"schema": json_ref("PagePreview")}}}
    snapshot_ok = {"description": "Committed snapshot", "content": {"application/json": {"schema": json_ref("PageSnapshot")}}}
    def body(name):
        return {"required": True, "content": {"application/json": {"schema": json_ref(name)}}}
    page_param = {"name": "page_id", "in": "path", "required": True, "schema": {"type": "string", "pattern": IDENTITY}}
    preview_param = {"name": "preview_id", "in": "path", "required": True, "schema": {"type": "string", "pattern": IDENTITY}}
    idempotency = {"name": "Idempotency-Key", "in": "header", "required": True,
                   "schema": {"type": "string", "minLength": 1, "maxLength": 200}}
    return {
        "openapi": "3.1.0",
        "info": {"title": "Free Page Documents", "version": "free-page/v1",
                 "description": "Independent HTML page assets. Not BoardSpec. D6=PATCH confirm, D9=SAVE."},
        "x-page-http": True,
        "x-free-page-schema": SCHEMA_VERSION,
        "x-b0-board-spec-untouched": "board-spec/v1",
        "x-page-operations": ["GENERATE", "PATCH", "SAVE", "ROLLBACK"],
        "x-binding-states": ["UNBOUND_SAMPLE", "BOUND_VERIFIED", "BOUND_STALE"],
        "x-bridge-protocol": BRIDGE_PROTOCOL,
        "x-bridge-forbidden-ops": list(FORBIDDEN_BRIDGE_OPS),
        "x-page-errors": PAGE_ERRORS,
        "x-edit-schema": EDIT_SCHEMA,
        "x-edit-context-schema": EDIT_CONTEXT_SCHEMA,
        "x-edit-channels": list(EDIT_CHANNELS),
        "x-edit-actions": list(EDIT_ACTIONS),
        "x-edit-encodings": list(EDIT_ENCODINGS),
        "x-edit-presentation": "overlay",
        "x-edit-source-logic": "hashed-byte-splice",
        "x-bridge-budget": {
            "max_response_bytes": BRIDGE_MAX_RESPONSE_BYTES,
            "max_cumulative_rows": BRIDGE_MAX_CUMULATIVE_ROWS,
        },
        "paths": {
            "/api/v1/analytics/page-documents/previews": {
                "post": {"operationId": "page_generate", "requestBody": body("PageDraft"),
                         "responses": {"201": preview_ok}},
            },
            "/api/v1/analytics/page-documents/previews/{preview_id}": {
                "get": {"operationId": "page_preview", "parameters": [preview_param],
                        "responses": {"200": preview_ok}},
            },
            "/api/v1/analytics/page-documents/previews/{preview_id}/confirm": {
                "post": {"operationId": "page_confirm", "parameters": [preview_param, idempotency],
                         "responses": {"200": snapshot_ok}},
            },
            "/api/v1/analytics/page-documents/previews/{preview_id}/cancel": {
                "post": {"operationId": "page_cancel", "parameters": [preview_param],
                         "responses": {"200": {"description": "Cancelled",
                                               "content": {"application/json": {"schema": json_ref("PageCancelResult")}}}}},
            },
            "/api/v1/analytics/page-documents/pages": {
                "get": {"operationId": "page_list",
                        "responses": {"200": {"description": "Metadata list",
                                              "content": {"application/json": {"schema": json_ref("PageList")}}}}},
            },
            "/api/v1/analytics/page-documents/pages/{page_id}": {
                "get": {"operationId": "page_get", "parameters": [page_param],
                        "responses": {"200": snapshot_ok}},
            },
            "/api/v1/analytics/page-documents/pages/{page_id}/versions": {
                "get": {"operationId": "page_history", "parameters": [page_param],
                        "responses": {"200": {"description": "History",
                                              "content": {"application/json": {
                                                  "schema": {"type": "array", "items": json_ref("PageRevision")}}}}}},
            },
            "/api/v1/analytics/page-documents/pages/{page_id}/patch-preview": {
                "post": {"operationId": "page_patch", "parameters": [page_param],
                         "requestBody": body("PagePatchPreview"), "responses": {"201": preview_ok}},
            },
            "/api/v1/analytics/page-documents/pages/{page_id}/save-preview": {
                "post": {"operationId": "page_save", "parameters": [page_param],
                         "requestBody": body("PageSavePreview"), "responses": {"201": preview_ok}},
            },
            "/api/v1/analytics/page-documents/pages/{page_id}/rollback-preview": {
                "post": {"operationId": "page_rollback", "parameters": [page_param],
                         "requestBody": body("PageRollbackPreview"), "responses": {"201": preview_ok}},
            },
        },
        "components": {"schemas": schemas},
    }
