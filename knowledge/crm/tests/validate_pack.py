#!/usr/bin/env python3
"""Structure, citation, and version consistency checks for the offline pack."""
from __future__ import annotations

import json
import re
from pathlib import Path

PACK_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACK_ROOT.parents[1]
SCHEMA = json.loads((PACK_ROOT / "schema" / "entity-types.json").read_text(encoding="utf-8"))

REAL_DATA_PATTERNS = [
    re.compile(r"1[3-9]\d{9}"),  # CN mobile
    re.compile(r"\b\d{17}[\dXx]\b"),  # id-like
]


def load(rel: str):
    path = PACK_ROOT / rel
    if not path.exists():
        raise FileNotFoundError(rel)
    return json.loads(path.read_text(encoding="utf-8"))


SKIP_CLAIM_KEYS = {
    "forbidden_claims",
    "honesty",
    "must",
    "sync_rule",
    "note",
    "description",
}


def walk_strings(obj, acc=None, skip_keys=None):
    acc = acc if acc is not None else []
    skip_keys = skip_keys or set()
    if isinstance(obj, str):
        acc.append(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in skip_keys:
                continue
            walk_strings(v, acc, skip_keys)
    elif isinstance(obj, list):
        for v in obj:
            walk_strings(v, acc, skip_keys)
    return acc


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    def err(msg: str) -> None:
        errors.append(msg)

    pack = load("pack.json")
    for key in (
        "pack_version",
        "metric_version",
        "code_baseline",
        "publication_status",
        "graph_runtime",
        "a_contract",
        "verified_implementation_count",
        "contains_real_data",
    ):
        if key not in pack:
            err(f"pack.json missing {key}")

    if pack.get("pack_version") != SCHEMA["pack_version"]:
        err("pack_version mismatch vs schema")
    if pack.get("metric_version") != "crm-metrics/v1":
        err("metric_version must be crm-metrics/v1")
    if pack.get("code_baseline") != "f9070431c3264e8e3d7c36524c87a7e232640789":
        err("code_baseline mismatch")
    if pack.get("publication_status") != "local_isolated_candidate":
        err("publication_status must remain local_isolated_candidate")
    if pack.get("contains_real_data") is not False:
        err("contains_real_data must be false")
    if pack.get("private_source_text_included") is not False:
        err("public pack must omit private source text")
    if pack.get("verified_implementation_count") != 0:
        err("verified_implementation_count must be 0 until A syncs verified status")

    rt = pack.get("graph_runtime") or {}
    for k in ("neo4j_started", "weknora_graph_enabled", "dsh_using_graph", "generative_extraction_used", "live_weknora_overwritten"):
        if rt.get(k) is not False:
            err(f"graph_runtime.{k} must be false")

    a = pack.get("a_contract") or {}
    if a.get("implementation_status") != "not_implemented":
        err("must not claim A implementation complete")
    if a.get("semantic_module_present") is True and a.get("c_verification_of_a_engine") not in ("not_run", None):
        if a.get("c_verification_of_a_engine") in ("synthetic_verified", "real_reconciled"):
            err("C must not promote A engine verification in this pack")

    files = {
        "textbook/excerpts.json": load("textbook/excerpts.json"),
        "textbook/capability-map.json": load("textbook/capability-map.json"),
        "code_snapshots/snapshots.json": load("code_snapshots/snapshots.json"),
        "definitions/decisions.json": load("definitions/decisions.json"),
        "definitions/metrics.json": load("definitions/metrics.json"),
        "definitions/concepts.json": load("definitions/concepts.json"),
        "definitions/cohorts.json": load("definitions/cohorts.json"),
        "definitions/data_requirements.json": load("definitions/data_requirements.json"),
        "definitions/source_fields.json": load("definitions/source_fields.json"),
        "definitions/capabilities.json": load("definitions/capabilities.json"),
        "definitions/strategies.json": load("definitions/strategies.json"),
        "definitions/evidence.json": load("definitions/evidence.json"),
        "definitions/cases.json": load("definitions/cases.json"),
        "definitions/documents.json": load("definitions/documents.json"),
        "graph/nodes.json": load("graph/nodes.json"),
        "graph/edges.json": load("graph/edges.json"),
        "graph/conflicts.json": load("graph/conflicts.json"),
        "graph/model.json": load("graph/model.json"),
        "queries/acceptance.json": load("queries/acceptance.json"),
    }

    for name, doc in files.items():
        if doc.get("pack_version") not in (None, pack["pack_version"]) and name not in {
            # pack.json already checked
        }:
            if "pack_version" in doc and doc["pack_version"] != pack["pack_version"]:
                err(f"{name} pack_version drift")
        if doc.get("metric_version") not in (None, pack["metric_version"]):
            err(f"{name} metric_version drift")

    decisions = files["definitions/decisions.json"]["items"]
    confirmed = [d for d in decisions if d.get("status") == "confirmed"]
    if len(confirmed) != 21:
        err(f"expected 21 confirmed decisions, got {len(confirmed)}")
    d019 = next((d for d in decisions if d["id"] == "D019"), None)
    if not d019 or d019.get("status") != "awaiting_source_verification":
        err("D019 must remain awaiting_source_verification")
    for d in decisions:
        if d.get("implementation_status") in SCHEMA["forbidden_implementation_claims_until_a_sync"]:
            err(f"decision {d['id']} claims forbidden implementation status")

    textbook = files["textbook/excerpts.json"]["items"]
    core = [t for t in textbook if t.get("ordinal") in range(1, 21)]
    if len({t["ordinal"] for t in core}) != 20:
        err(f"need 20 core textbook metrics, got {sorted({t.get('ordinal') for t in core})}")
    for t in textbook:
        if t.get("ocr_excerpt") is not None or t.get("content_omitted") is not True:
            err(f"{t['id']} private source content must not be distributed")
        if t.get("layer") != "textbook":
            err(f"{t['id']} layer must be textbook")
        if not t.get("slide"):
            err(f"{t['id']} missing slide")
        if t.get("implementation_status") not in ("not_implemented", "code_snapshot"):
            err(f"textbook {t['id']} must not be marked implemented")

    targets = files["definitions/metrics.json"]["items"]
    for m in targets:
        if m.get("layer") != "target_definition":
            err(f"{m['id']} must be target_definition")
        if m.get("implementation_status") != "not_implemented":
            err(f"{m['id']} implementation_status must be not_implemented")
        if m.get("verified_implementation"):
            err(f"{m['id']} must not set verified_implementation")
        if not m.get("decision_ids"):
            err(f"{m['id']} missing decision_ids")

    snapshots = files["code_snapshots/snapshots.json"]["items"]
    for s in snapshots:
        if s.get("layer") != "code_snapshot":
            err(f"{s['id']} layer")
        if s.get("implementation_status") != "code_snapshot":
            err(f"{s['id']} status")
        if not s.get("code_path") or not s.get("code_sha256"):
            err(f"{s['id']} missing path/sha")
        if len(s["code_sha256"]) != 64:
            err(f"{s['id']} sha length")

    nodes = files["graph/nodes.json"]["items"]
    edges = files["graph/edges.json"]["items"]
    evidence = files["definitions/evidence.json"]["items"]
    node_ids = {n["id"] for n in nodes}
    evidence_ids = {e["id"] for e in evidence}
    allowed_rel = set(SCHEMA["relation_types"])
    allowed_ent = set(SCHEMA["entity_types"]) | {"TextbookExcerpt"}

    for n in nodes:
        if n.get("type") == "TextbookExcerpt" and n.get("ocr_excerpt") is not None:
            err(f"node {n.get('id')} contains private source text")
        if n.get("type") not in allowed_ent:
            err(f"node {n.get('id')} type {n.get('type')} not allowed")
        if n.get("pack_version") != pack["pack_version"]:
            err(f"node {n.get('id')} pack_version")
        if n.get("metric_version") != pack["metric_version"]:
            err(f"node {n.get('id')} metric_version")
        if n.get("contains_real_data") is True:
            err(f"node {n.get('id')} contains_real_data")

    for e in edges:
        if e.get("type") not in allowed_rel:
            err(f"edge {e.get('id')} type {e.get('type')}")
        refs = e.get("evidence_refs") or []
        if not refs:
            err(f"edge {e.get('id')} missing evidence_refs")
        for r in refs:
            if r not in evidence_ids and not r.startswith("ev."):
                err(f"edge {e.get('id')} unknown evidence {r}")
            if r not in evidence_ids:
                err(f"edge {e.get('id')} evidence {r} not in evidence.json")
        if not e.get("extract_method"):
            err(f"edge {e.get('id')} missing extract_method")
        if e.get("extract_method") not in SCHEMA["extract_methods"]:
            err(f"edge {e.get('id')} extract_method {e.get('extract_method')}")
        if not e.get("review_status"):
            err(f"edge {e.get('id')} missing review_status")
        src, dst = e.get("from"), e.get("to")
        if src not in node_ids and not str(src).startswith("ev.") and src not in evidence_ids:
            # allow evidence ids and decision ids and code paths as endpoints for SUPPORTED_BY
            if src not in {d["id"] for d in decisions} and not str(src).startswith("backend/") and src not in node_ids:
                err(f"edge {e.get('id')} from {src} missing")
        if dst not in node_ids and dst not in evidence_ids and dst not in {d["id"] for d in decisions}:
            if not str(dst).startswith("ev.") and not str(dst).startswith("backend/"):
                err(f"edge {e.get('id')} to {dst} missing")
        if e.get("type") == "COMPUTED_BY" and e.get("review_status") == "verified":
            err(f"edge {e.get('id')} COMPUTED_BY must not be verified yet")

    conflicts = files["graph/conflicts.json"]["items"]
    if not any(c["id"] == "conflict.ipt.textbook_internal" for c in conflicts):
        err("missing IPT textbook internal conflict")
    ipt = next(c for c in conflicts if c["id"] == "conflict.ipt.textbook_internal")
    if ipt.get("resolution_status") == "resolved":
        err("must not mark IPT textbook conflict fully resolved by OCR")
    if not ipt.get("do_not_guess"):
        err("IPT conflict must keep do_not_guess")
    d019c = next((c for c in conflicts if c["id"] == "conflict.d019.source"), None)
    if not d019c or d019c.get("resolution_status") != "open":
        err("D019 conflict must remain open")

    queries = files["queries/acceptance.json"]["items"]
    required_q = {
        "q.aus.people_or_orders",
        "q.premium.1_2",
        "q.partial_refund",
        "q.new_member_conversion",
        "q.sample_roi_high",
        "q.textbook_vs_code",
        "q.doc_permission",
        "q.no_coupon_auth",
        "q.graph_runtime",
    }
    have_q = {q["id"] for q in queries}
    missing_q = required_q - have_q
    if missing_q:
        err(f"missing acceptance queries {sorted(missing_q)}")
    for q in queries:
        if "must" not in q:
            err(f"query {q.get('id')} missing expected behaviour")
        blob = json.dumps(q, ensure_ascii=False)
        if "代码已修复" in blob and "forbidden" not in json.dumps(q.get("forbidden_claims"), ensure_ascii=False):
            warnings.append(f"query {q['id']} mentions 代码已修复")

    cmap = files["textbook/capability-map.json"]["map"]
    if len(cmap.get("textbook_20_coverage") or []) != 20:
        err("capability map must cover 20 textbook items")

    strategies = files["definitions/strategies.json"]["items"]
    for s in strategies:
        if s.get("execution_authorized") is not False:
            err(f"strategy {s['id']} must not grant execution")

    cases = files["definitions/cases.json"]["items"]
    if files["definitions/cases.json"].get("contains_real_data") is not False:
        err("cases must declare contains_real_data false")
    for c in cases:
        if not c.get("synthetic"):
            err(f"case {c['id']} must be synthetic")

    blob = "\n".join(
        walk_strings(pack, skip_keys=SKIP_CLAIM_KEYS)
        + walk_strings(list(files.values()), skip_keys=SKIP_CLAIM_KEYS)
    )
    forbidden_phrases = [
        "Neo4j 已启用",
        "图服务已上线",
        "DSH 已使用图谱",
        "真实数据已对账",
        "代码已修复并上线",
        "已覆盖现役 WeKnora",
    ]
    for p in forbidden_phrases:
        if p in blob:
            err(f"pack text contains forbidden claim: {p}")
    if "/Users/" in json.dumps([pack, *files.values()], ensure_ascii=False):
        err("public pack contains a private machine path")
    for pat in REAL_DATA_PATTERNS:
        if pat.search(blob):
            err(f"possible real identity pattern {pat.pattern}")

    # A contract file is outside this tree; record sha only.
    expected_a_sha = "8fc60d5e935ec43bbe5cf8ae02349f95f6bcd90cb34dd4222031c17034eccf6a"
    if a.get("sha256") != expected_a_sha:
        warnings.append("A contract sha differs from C snapshot; re-sync required")
    if a.get("semantic_module_present") and a.get("implementation_status") == "not_implemented":
        # File presence is recorded; C still must not promote to verified.
        pass

    model = files["graph/model.json"]
    if model.get("neo4j") is not False and "neo4j" in model:
        if model.get("neo4j") is True:
            err("model.json must not claim neo4j")
    if model.get("node_count") != len(nodes):
        err("model.json node_count mismatch")
    if model.get("edge_count") != len(edges):
        err("model.json edge_count mismatch")

    result = {
        "kind": "crm-knowledge-offline-validation",
        "pack_version": pack.get("pack_version"),
        "metric_version": pack.get("metric_version"),
        "code_baseline": pack.get("code_baseline"),
        "result": "passed" if not errors else "failed",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "evidence": len(evidence),
            "conflicts": len(conflicts),
            "queries": len(queries),
            "target_metrics": len(targets),
            "textbook_core": len(core),
            "confirmed_decisions": len(confirmed),
        },
        "not_run": [
            "neo4j",
            "weknora_upload",
            "generative_extraction",
            "real_database",
            "dsh_reload",
            "git_commit_push_merge",
        ],
    }
    out = PACK_ROOT / "tests" / "validation-result.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    deliveries = REPO_ROOT / "docs" / "crm-calibration" / "deliveries" / "C"
    deliveries.mkdir(parents=True, exist_ok=True)
    (deliveries / "validation-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if errors:
        print("FAILED")
        for e in errors:
            print(" -", e)
        return 1
    print("PASSED")
    for w in warnings:
        print(" warning:", w)
    print(json.dumps(result["counts"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
