"""Append-only saved analyses for first-purchase SNAPSHOT assets.

Independent SQLite; not the jobs.py run kernel and not an HTTP/OpenAPI surface.
Facts are copied from a server-resolved SUCCEEDED operating result. Reopen
reads this store, not RunStore. Owner always comes from the server principal.
"""

from __future__ import annotations

import json
from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from pydantic import ValidationError

from backend.contracts.analytics_first_purchase import (
    METRIC_ID,
    METRIC_VERSION,
    QUERY_ID,
    QUERY_VERSION,
    FirstPurchaseFacts,
    FirstPurchaseQueryRequest,
    FirstPurchaseResult,
)
from backend.contracts.analytics_first_purchase_run import FIRST_PURCHASE_DATA_SCOPE
from backend.contracts.analytics_first_purchase_analysis import (
    FirstPurchaseAnalysisRef,
    FirstPurchaseSaveIdentity,
    FirstPurchaseSaveCommand,
    FirstPurchaseSavedProvenance,
    FirstPurchaseSaveResult,
    FirstPurchaseSaveReceipt,
    FirstPurchaseSaveSourceRef,
    FirstPurchaseSavedReceipt,
    FirstPurchaseUnknownSaveReceipt,
)
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, require
from backend.services.analytics.first_purchase.asset_state import (
    conflict,
    connect,
    initialize_sqlite,
    invalid,
    mapping,
    missing,
    new_id,
    now_ms,
    opaque,
    prior_row,
    reject_foreign_family,
    remember,
    timestamp,
    title_text,
    transaction,
    unprocessable,
    validate_key,
)
from backend.services.analytics.first_purchase.source import FirstPurchaseTrustedSource
from backend.services.analytics.resource_profile import canonical_json, content_hash

ANALYSIS_SCHEMA = "analytics-first-purchase-saved-analysis/v1"
VISUAL_SCHEMA = "analytics-visual-table/v1"
DATA_SCOPE = FIRST_PURCHASE_DATA_SCOPE
CAPABILITY_SAVE = "analysis:save"
CAPABILITY_READ = "analysis:read"
APPLICATION_ID = 1397572502  # SMF1; distinct from SMA1/SMC1/SMB0.
STATE_SCHEMA_VERSION = 1
KIND = "first_purchase_saved_analysis"
UNAVAILABLE = "分析状态暂不可用，请使用原请求标识查询或重试。"
DEFAULT_VISUAL = {"schema_version": VISUAL_SCHEMA, "kind": "TABLE"}
QUERY_REF = {"query_id": QUERY_ID, "query_version": QUERY_VERSION}
METRIC_REFS = [{"metric_id": METRIC_ID, "metric_version": METRIC_VERSION}]
SAVE_RECEIPT_OPERATION = "analysis:save-receipt/v1"
SAVE_ACTION_OPERATION = "analysis:save-action/v1"
SAVE_PROVENANCE_OPERATION = "analysis:save-provenance/v1"

_SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE analyses (
    analysis_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1),
    owner TEXT NOT NULL,
    title TEXT NOT NULL,
    request_json TEXT NOT NULL,
    visual_json TEXT NOT NULL,
    created_from_run_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    facts_json TEXT NOT NULL,
    limitations_json TEXT NOT NULL,
    filter_hash TEXT NOT NULL,
    data_version TEXT NOT NULL,
    evidence_digest TEXT NOT NULL,
    created_ms INTEGER NOT NULL,
    PRIMARY KEY(analysis_id, version)
);
CREATE INDEX analyses_owner ON analyses(owner, created_ms, analysis_id);
CREATE TABLE idempotency (
    actor TEXT NOT NULL, operation TEXT NOT NULL, target TEXT NOT NULL, key TEXT NOT NULL,
    request_hash TEXT NOT NULL, response_json TEXT NOT NULL, http_status INTEGER NOT NULL,
    PRIMARY KEY(actor, operation, target, key)
);
"""


def _visual_spec(value: object | None) -> dict[str, str]:
    if value is None:
        return dict(DEFAULT_VISUAL)
    payload = mapping(value, label="visual_spec")
    if payload != DEFAULT_VISUAL:
        raise unprocessable("本波只允许 TABLE 视觉配置。")
    return dict(DEFAULT_VISUAL)


def _decode_persisted(model, raw: str):
    """Stored wire documents must be complete, never repaired by model defaults."""
    try:
        payload = json.loads(raw)
        value = model.model_validate(payload)
        if canonical_json(payload) != canonical_json(value.model_dump(mode="json")):
            raise ValueError("persisted wire shape or types changed during validation")
        return value
    except (ValueError, TypeError) as error:
        raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True) from error


@dataclass(frozen=True)
class FirstPurchaseSavedAnalysisRecord:
    schema_version: str
    analysis_id: str
    version: int
    title: str
    query_ref: dict[str, str]
    metric_refs: list[dict[str, str]]
    filters: dict[str, Any]
    visual_spec: dict[str, str]
    created_from_run_id: str
    owner_id: str
    visibility: str
    endorsement: str
    data_mode: str
    snapshot: dict[str, Any]
    facts: dict[str, Any]
    data_version: str
    filter_hash: str
    limitations: list[str]
    created_at: str
    finite_mock: bool
    http_api: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "analysis_id": self.analysis_id,
            "version": self.version,
            "title": self.title,
            "query_ref": dict(self.query_ref),
            "metric_refs": [dict(item) for item in self.metric_refs],
            "filters": json.loads(canonical_json(self.filters)),
            "visual_spec": dict(self.visual_spec),
            "created_from_run_id": self.created_from_run_id,
            "owner_id": self.owner_id,
            "visibility": self.visibility,
            "endorsement": self.endorsement,
            "data_mode": self.data_mode,
            "snapshot": json.loads(canonical_json(self.snapshot)),
            "facts": json.loads(canonical_json(self.facts)),
            "data_version": self.data_version,
            "filter_hash": self.filter_hash,
            "limitations": list(self.limitations),
            "created_at": self.created_at,
            "finite_mock": True,
            "http_api": "NOT_CONNECTED",
        }


class FirstPurchaseSavedAnalysisStore:
    """Finite-mock first-purchase SNAPSHOT catalog. HTTP/OpenAPI is NOT_CONNECTED."""

    finite_mock = True
    http_api = "NOT_CONNECTED"

    def __init__(self, state_dir: Path, *, clock: Callable[[], int] = now_ms):
        original = Path(state_dir)
        self.directory = original.resolve(strict=True)
        self.path = self.directory / "first_purchase_analyses.sqlite3"
        self.clock = clock
        initialize_sqlite(
            original, self.path, application_id=APPLICATION_ID, schema_version=STATE_SCHEMA_VERSION,
            kind=KIND, ddl=_SCHEMA, unavailable=UNAVAILABLE,
        )

    def close(self) -> None:
        """Connections are per-call; callers drop the instance before reopen."""

    def _require(self, principal: AnalyticsPrincipal, capability: str) -> None:
        require(principal, capability, data_scope=DATA_SCOPE)

    def save_from_trusted_source(
        self,
        principal: AnalyticsPrincipal,
        key: str,
        *,
        title: str,
        visual_spec: dict[str, str] | None,
        trusted: FirstPurchaseTrustedSource,
    ) -> FirstPurchaseSavedAnalysisRecord:
        """Persist frozen SNAPSHOT facts from a server-resolved operating result."""
        return self._save(principal, key, title=title, visual_spec=visual_spec, trusted=trusted)

    def save_with_receipt(
        self, principal: AnalyticsPrincipal, key: str, *, identity: FirstPurchaseSaveIdentity,
        title: str, visual_spec: dict[str, str] | None, trusted: FirstPurchaseTrustedSource,
    ) -> FirstPurchaseSavedReceipt:
        """G0 storage seam only; not exposed as an enabled D15 write API.

        The future adapter must enforce candidate admission and freshness. An
        identity binds retries but grants no permission or save eligibility.
        """
        return self._save(principal, key, title=title, visual_spec=visual_spec, trusted=trusted, identity=identity)

    def _save(
        self, principal, key, *, title, visual_spec, trusted, identity=None, connection=None,
    ) -> FirstPurchaseSavedAnalysisRecord | FirstPurchaseSavedReceipt:
        self._require(principal, CAPABILITY_SAVE)
        key = validate_key(key)
        if identity is not None:
            identity = FirstPurchaseSaveIdentity.model_validate(identity)
        title = title_text(title)
        visual = _visual_spec(visual_spec)
        if trusted.owner_id != principal.actor_id:
            raise missing("analysis")
        reject_foreign_family(trusted.result)
        reject_foreign_family(trusted.request)
        try:
            request = FirstPurchaseQueryRequest.model_validate(trusted.request)
            result = FirstPurchaseResult.model_validate(trusted.result)
        except ValidationError as error:
            raise unprocessable("SUCCEEDED 结果不合法，不能保存。") from error
        if result.status != "OK" or result.facts is None:
            raise unprocessable("SUCCEEDED 但结果 REJECTED 或 facts 为空，不能保存为有效经营分析。")
        if content_hash(result.model_dump(mode="json")) != trusted.evidence_digest:
            raise unprocessable("evidence_digest 与 SUCCEEDED 结果不一致。")
        digest = content_hash({
            "title": title,
            "created_from_run_id": trusted.run_id,
            "filters": request.model_dump(mode="json"),
            "visual_spec": visual,
            "query_ref": QUERY_REF,
            "metric_refs": METRIC_REFS,
            "evidence_digest": trusted.evidence_digest,
            **({"save_identity": identity.model_dump(mode="json"), "idempotency_key": key} if identity else {}),
        })
        scope = nullcontext(connection) if connection is not None else transaction(self.path, unavailable=UNAVAILABLE)
        with scope as con:
            if identity is not None:
                prior = self._receipt_row(con, principal, key, identity, digest=digest)
                if prior is not None:
                    return prior
            else:
                prior = prior_row(con, principal, "analysis:save", "", key, digest, kind="analysis")
                if prior is not None:
                    return FirstPurchaseSavedAnalysisRecord(**json.loads(prior["response_json"]))
            analysis_id = new_id("analysis")
            created_ms = self.clock()
            record = self._insert(
                con, principal, analysis_id, 1, title, request, visual, trusted, result, created_ms,
            )
            if identity is not None:
                receipt = FirstPurchaseSavedReceipt(
                    identity=identity, idempotency_key=key, owner_id=principal.actor_id,
                    analysis_ref=FirstPurchaseAnalysisRef(analysis_id=analysis_id, version=1),
                    source_ref=FirstPurchaseSaveSourceRef(
                        created_from_run_id=trusted.run_id, evidence_digest=trusted.evidence_digest,
                    ),
                    durable_state_key=f"first-purchase-analysis:{analysis_id}:1",
                )
                # Both action and idempotency identities reserve the same result
                # in the existing transaction, not in a separate release journal.
                payload = receipt.model_dump(mode="json")
                remember(con, principal, SAVE_RECEIPT_OPERATION, "", key, digest, payload, 201, canonical_json)
                remember(con, principal, SAVE_ACTION_OPERATION, "", identity.action_id, digest, payload, 201, canonical_json)
                return receipt
            response = record.as_dict()
            remember(con, principal, "analysis:save", "", key, digest, response, 201, canonical_json)
            return FirstPurchaseSavedAnalysisRecord(**response)

    def save_admitted(
        self, principal: AnalyticsPrincipal, key: str, command: FirstPurchaseSaveCommand, *,
        authorize: Callable[[], None],
        resolve: Callable[[], tuple[FirstPurchaseTrustedSource, FirstPurchaseSaveResult]],
    ) -> FirstPurchaseSavedReceipt:
        """Public adapter transaction: reauthorize, replay, then evaluate a new write.

        Policy/source reads occur after acquiring the write lock. Replays compare
        the original normalized command without needing a live run or admission.
        Provenance and both receipt identities commit with the analysis.
        """
        self._require(principal, CAPABILITY_READ)
        self._require(principal, CAPABILITY_SAVE)
        key = validate_key(key)
        command = FirstPurchaseSaveCommand.model_validate(command)
        digest = content_hash({"command": command.model_dump(mode="json"), "idempotency_key": key})
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            authorize()
            prior = self._receipt_row(con, principal, key, command.identity)
            if prior is not None:
                row = self._provenance_row(con, principal, prior.analysis_ref.analysis_id, prior.analysis_ref.version)
                if row is None:
                    raise AnalyticsError(409, "LEGACY_RECEIPT_RECONCILE_REQUIRED", "已有旧回执，请查询回执而不是重新保存。")
                frozen = self._decode_provenance(row, prior.analysis_ref.analysis_id, prior.analysis_ref.version)
                if (frozen.identity != prior.identity
                        or frozen.provenance.permission_scope.owner_id != principal.actor_id
                        or frozen.provenance.source_refs.created_from_run_id != prior.source_ref.created_from_run_id
                        or frozen.provenance.source_refs.evidence_digest != prior.source_ref.evidence_digest):
                    raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True)
                if row["request_hash"] != digest:
                    raise conflict("analysis")
                return prior
            trusted, envelope = resolve()
            if trusted.run_id != command.created_from_run_id or trusted.evidence_digest != command.evidence_digest:
                raise AnalyticsError(409, "RESULT_CHANGED", "结果与预览不一致，请重新核对。")
            if envelope.identity != command.identity or not envelope.save_eligible:
                raise AnalyticsError(409, envelope.save_ineligible_reason or "SAVE_NOT_ELIGIBLE",
                                     "结果暂不符合保存条件，请重新核对来源、权限与有效期。")
            receipt = self._save(
                principal, key, identity=command.identity, title=command.title,
                visual_spec=None if command.visual_spec is None else command.visual_spec.model_dump(mode="json"),
                trusted=trusted, connection=con,
            )
            frozen = FirstPurchaseSavedProvenance(
                analysis_ref=receipt.analysis_ref, identity=command.identity, provenance=envelope.provenance,
            )
            remember(con, principal, SAVE_PROVENANCE_OPERATION, receipt.analysis_ref.analysis_id, "1",
                     digest, frozen.model_dump(mode="json"), 201, canonical_json)
            return receipt

    def result_already_saved(
        self, principal: AnalyticsPrincipal, key: str, identity: FirstPurchaseSaveIdentity,
        source: FirstPurchaseTrustedSource,
    ) -> bool:
        self._require(principal, CAPABILITY_READ)
        with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
            con.execute("BEGIN")
            receipt = self._receipt_row(con, principal, validate_key(key), identity)
        if receipt is None:
            return False
        if (receipt.source_ref.created_from_run_id != source.run_id
                or receipt.source_ref.evidence_digest != source.evidence_digest):
            raise conflict("analysis")
        return True

    @staticmethod
    def _provenance_row(con, principal, analysis_id, version):
        return con.execute(
            "SELECT request_hash, response_json FROM idempotency WHERE actor=? AND operation=? AND target=? AND key=?",
            (principal.actor_id, SAVE_PROVENANCE_OPERATION, analysis_id, str(version)),
        ).fetchone()

    @staticmethod
    def _decode_provenance(row, analysis_id, version):
        try:
            value = _decode_persisted(FirstPurchaseSavedProvenance, row["response_json"])
            if value.analysis_ref.analysis_id != analysis_id or value.analysis_ref.version != version:
                raise ValueError("mismatched provenance")
            return value
        except (ValueError, ValidationError) as error:
            raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True) from error

    def saved_provenance(self, principal: AnalyticsPrincipal, analysis_id: str, version: int | None = None):
        self._require(principal, CAPABILITY_READ)
        analysis_id = opaque(analysis_id, label="analysis_id")
        if version is not None and (type(version) is not int or version < 1):
            raise invalid("version 必须是从 1 起的整数。")
        with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
            con.execute("BEGIN")
            record = self._analysis_row(con, principal, analysis_id, version)
            row = self._provenance_row(con, principal, analysis_id, record["version"])
            if row is None:
                raise AnalyticsError(404, "PROVENANCE_NOT_RECORDED", "此旧版本没有 D15 来源记录，不推断其保存资格。")
            frozen = self._decode_provenance(row, analysis_id, record["version"])
            provenance = frozen.provenance
            if (provenance.permission_scope.owner_id != principal.actor_id
                    or provenance.source_refs.created_from_run_id != record["created_from_run_id"]
                    or provenance.source_refs.evidence_digest != record["evidence_digest"]
                    or provenance.query_scope.filter_hash != record["filter_hash"]):
                raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True)
            return frozen

    def lookup_save_receipt(
        self, principal: AnalyticsPrincipal, key: str, identity: FirstPurchaseSaveIdentity,
    ) -> FirstPurchaseSaveReceipt:
        """Read one committed receipt without RunStore, workers or any writes."""
        self._require(principal, CAPABILITY_READ)
        self._require(principal, CAPABILITY_SAVE)
        key = validate_key(key)
        identity = FirstPurchaseSaveIdentity.model_validate(identity)
        with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
            con.execute("BEGIN")
            receipt = self._receipt_row(con, principal, key, identity)
        return receipt or FirstPurchaseUnknownSaveReceipt(
            identity=identity, idempotency_key=key, owner_id=principal.actor_id,
        )

    @staticmethod
    def _receipt_row(con, principal, key, identity, *, digest=None):
        # One SELECT gives a single SQLite snapshot even if a writer commits
        # between lookups; it cannot observe only half of the two reservations.
        rows = con.execute(
            """SELECT request_hash, response_json FROM idempotency
               WHERE actor=? AND target='' AND
               ((operation=? AND key=?) OR (operation=? AND key=?))""",
            (principal.actor_id, SAVE_RECEIPT_OPERATION, key, SAVE_ACTION_OPERATION, identity.action_id),
        ).fetchall()
        if not rows:
            return None
        receipt = _decode_persisted(FirstPurchaseSavedReceipt, rows[0]["response_json"])
        if receipt.identity != identity or receipt.idempotency_key != key:
            raise conflict("analysis")
        if len(rows) != 2 or receipt.owner_id != principal.actor_id or any(
            row["response_json"] != rows[0]["response_json"] or row["request_hash"] != rows[0]["request_hash"]
            for row in rows
        ):
            raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True)
        if digest is not None and rows[0]["request_hash"] != digest:
            raise conflict("analysis")
        # Receipt rows alone are not proof that the named durable result still
        # exists (for example after an incomplete state restore). All callers
        # hold a read snapshot or write transaction across both checks.
        record = con.execute(
            "SELECT created_from_run_id, evidence_digest FROM analyses WHERE analysis_id=? AND version=? AND owner=?",
            (receipt.analysis_ref.analysis_id, receipt.analysis_ref.version, principal.actor_id),
        ).fetchone()
        if (record is None or record["created_from_run_id"] != receipt.source_ref.created_from_run_id
                or record["evidence_digest"] != receipt.source_ref.evidence_digest):
            raise AnalyticsError(503, "STATE_UNAVAILABLE", UNAVAILABLE, retryable=True)
        return receipt

    def publish_version(
        self,
        principal: AnalyticsPrincipal,
        key: str,
        analysis_id: str,
        *,
        base_version: int,
        title: str,
    ) -> FirstPurchaseSavedAnalysisRecord:
        self._require(principal, CAPABILITY_SAVE)
        key = validate_key(key)
        analysis_id = opaque(analysis_id, label="analysis_id")
        if type(base_version) is not int or base_version < 1:
            raise invalid("base_version 必须是从 1 起的整数。")
        new_title = title_text(title)
        digest = content_hash({
            "analysis_id": analysis_id,
            "base_version": base_version,
            "title": new_title,
        })
        with transaction(self.path, unavailable=UNAVAILABLE) as con:
            prior = prior_row(con, principal, "analysis:version", analysis_id, key, digest, kind="analysis")
            if prior is not None:
                return FirstPurchaseSavedAnalysisRecord(**json.loads(prior["response_json"]))
            row = self._analysis_row(con, principal, analysis_id, base_version)
            latest = con.execute(
                "SELECT MAX(version) FROM analyses WHERE analysis_id=? AND owner=?",
                (analysis_id, principal.actor_id),
            ).fetchone()[0]
            if latest != base_version:
                raise conflict("analysis")
            request = FirstPurchaseQueryRequest.model_validate(json.loads(row["request_json"]))
            visual = json.loads(row["visual_json"])
            snapshot = json.loads(row["snapshot_json"])
            facts = FirstPurchaseFacts.model_validate(json.loads(row["facts_json"]))
            created_ms = self.clock()
            con.execute(
                """INSERT INTO analyses (
                    analysis_id, version, owner, title, request_json, visual_json, created_from_run_id,
                    snapshot_json, facts_json, limitations_json, filter_hash, data_version,
                    evidence_digest, created_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    analysis_id, base_version + 1, principal.actor_id, new_title,
                    row["request_json"], canonical_json(visual), row["created_from_run_id"],
                    row["snapshot_json"], row["facts_json"], row["limitations_json"],
                    row["filter_hash"], row["data_version"], row["evidence_digest"], created_ms,
                ),
            )
            stored = self._analysis_row(con, principal, analysis_id, base_version + 1)
            record = self._record(stored)
            if record.snapshot != snapshot or record.facts != facts.model_dump(mode="json"):
                raise conflict("analysis")
            if canonical_json(record.filters) != canonical_json(request.model_dump(mode="json")):
                raise conflict("analysis")
            original_provenance = self._provenance_row(con, principal, analysis_id, base_version)
            if original_provenance is not None:
                frozen = self._decode_provenance(original_provenance, analysis_id, base_version)
                frozen = frozen.model_copy(update={
                    "analysis_ref": FirstPurchaseAnalysisRef(analysis_id=analysis_id, version=base_version + 1),
                })
                remember(con, principal, SAVE_PROVENANCE_OPERATION, analysis_id, str(base_version + 1),
                         original_provenance["request_hash"], frozen.model_dump(mode="json"), 201, canonical_json)
            response = record.as_dict()
            remember(con, principal, "analysis:version", analysis_id, key, digest, response, 201, canonical_json)
            return FirstPurchaseSavedAnalysisRecord(**response)

    def get(
        self, principal: AnalyticsPrincipal, analysis_id: str, version: int | None = None,
    ) -> FirstPurchaseSavedAnalysisRecord:
        self._require(principal, CAPABILITY_READ)
        analysis_id = opaque(analysis_id, label="analysis_id")
        if version is not None and (type(version) is not int or version < 1):
            raise invalid("version 必须是从 1 起的整数。")
        with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
            return self._record(self._analysis_row(con, principal, analysis_id, version))

    def list(self, principal: AnalyticsPrincipal) -> list[dict[str, Any]]:
        self._require(principal, CAPABILITY_READ)
        with connect(self.path, readonly=True, unavailable=UNAVAILABLE) as con:
            rows = con.execute(
                """SELECT a.* FROM analyses a
                   JOIN (
                       SELECT analysis_id, MAX(version) AS version
                       FROM analyses WHERE owner=? GROUP BY analysis_id
                   ) latest
                     ON a.analysis_id=latest.analysis_id AND a.version=latest.version
                   WHERE a.owner=?
                   ORDER BY a.created_ms DESC, a.analysis_id""",
                (principal.actor_id, principal.actor_id),
            ).fetchall()
            return [self._list_item(row) for row in rows]

    @staticmethod
    def _analysis_row(con, principal: AnalyticsPrincipal, analysis_id: str, version: int | None):
        if version is None:
            row = con.execute(
                """SELECT * FROM analyses WHERE analysis_id=? AND owner=?
                   ORDER BY version DESC LIMIT 1""",
                (analysis_id, principal.actor_id),
            ).fetchone()
        else:
            row = con.execute(
                "SELECT * FROM analyses WHERE analysis_id=? AND owner=? AND version=?",
                (analysis_id, principal.actor_id, version),
            ).fetchone()
        if row is None:
            raise missing("analysis")
        return row

    def _insert(
        self, con, principal, analysis_id, version, title, request, visual, trusted, result, created_ms,
    ) -> FirstPurchaseSavedAnalysisRecord:
        facts = FirstPurchaseFacts.model_validate(result.facts.model_dump(mode="json")).model_dump(mode="json")
        snapshot = {
            "run_id": trusted.run_id,
            "evidence_digest": trusted.evidence_digest,
            "resolved_filters": result.resolved_filters.model_dump(mode="json"),
            "data_snapshot_ref": result.data_snapshot_ref,
            "as_of": result.model_dump(mode="json")["as_of"],
        }
        con.execute(
            """INSERT INTO analyses (
                analysis_id, version, owner, title, request_json, visual_json, created_from_run_id,
                snapshot_json, facts_json, limitations_json, filter_hash, data_version,
                evidence_digest, created_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis_id, version, principal.actor_id, title,
                canonical_json(request.model_dump(mode="json")), canonical_json(visual),
                trusted.run_id, canonical_json(snapshot), canonical_json(facts),
                canonical_json(list(result.limitations)), result.filter_hash, result.data_version,
                trusted.evidence_digest, created_ms,
            ),
        )
        row = con.execute(
            "SELECT * FROM analyses WHERE analysis_id=? AND version=?",
            (analysis_id, version),
        ).fetchone()
        return self._record(row)

    def _record(self, row) -> FirstPurchaseSavedAnalysisRecord:
        request = json.loads(row["request_json"])
        snapshot = json.loads(row["snapshot_json"])
        return FirstPurchaseSavedAnalysisRecord(
            schema_version=ANALYSIS_SCHEMA,
            analysis_id=row["analysis_id"],
            version=row["version"],
            title=row["title"],
            query_ref=dict(QUERY_REF),
            metric_refs=[dict(item) for item in METRIC_REFS],
            filters=request,
            visual_spec=json.loads(row["visual_json"]),
            created_from_run_id=row["created_from_run_id"],
            owner_id=row["owner"],
            visibility="PRIVATE",
            endorsement="PERSONAL",
            data_mode="SNAPSHOT",
            snapshot=snapshot,
            facts=json.loads(row["facts_json"]),
            data_version=row["data_version"],
            filter_hash=row["filter_hash"],
            limitations=json.loads(row["limitations_json"]),
            created_at=timestamp(row["created_ms"]),
            finite_mock=True,
            http_api="NOT_CONNECTED",
        )

    @staticmethod
    def _list_item(row) -> dict[str, Any]:
        request = json.loads(row["request_json"])
        snapshot = json.loads(row["snapshot_json"])
        return {
            "schema_version": ANALYSIS_SCHEMA,
            "analysis_id": row["analysis_id"],
            "version": row["version"],
            "title": row["title"],
            "query_id": request["query_id"],
            "observation_days": request["observation_days"],
            "cohort_window": request["cohort_window"],
            "as_of": snapshot["as_of"],
            "data_mode": "SNAPSHOT",
            "visibility": "PRIVATE",
            "finite_mock": True,
            "http_api": "NOT_CONNECTED",
        }
