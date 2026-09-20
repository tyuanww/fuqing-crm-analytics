#!/usr/bin/env python3
"""Emit the importable offline CRM knowledge pack. No model calls, no Neo4j."""
from __future__ import annotations

import json
import sys
from collections import OrderedDict
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from pack_entities import (  # noqa: E402
    CODE_SNAPSHOT_METRICS,
    CONCEPTS,
    TARGET_METRICS,
    TEXTBOOK_EXCERPTS,
    VERIFIED_IMPLEMENTATIONS,
)
from pack_graph import (  # noqa: E402
    ACCEPTANCE_QUERIES,
    CAPABILITIES,
    CAPABILITY_MAP,
    CASES,
    COHORTS,
    CONFLICTS,
    DATA_REQUIREMENTS,
    EVIDENCE,
    SOURCE_FIELDS,
    STRATEGIES,
    build_edges,
    build_nodes,
)
from pack_records import (  # noqa: E402
    A_CONTRACT,
    CODE_BASELINE,
    CREATED_AT,
    DECISIONS,
    DOCUMENTS,
    METRIC_VERSION,
    PACK_VERSION,
    PUBLICATION,
    QUERY_VERSION,
    SNAPSHOT,
    TEXTBOOK,
    WIRE_SCHEMA_VERSION,
)

ROOT = TOOLS.parent


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT.parents[2]))
    except ValueError:
        return str(path)


def main() -> int:
    nodes = build_nodes()
    edges = build_edges()
    node_ids = {n["id"] for n in nodes}
    evidence_ids = {e["id"] for e in EVIDENCE}

    pack = OrderedDict(
        [
            ("kind", "offline_crm_knowledge_pack"),
            ("pack_version", PACK_VERSION),
            ("metric_version", METRIC_VERSION),
            ("query_version", QUERY_VERSION),
            ("wire_schema_version", WIRE_SCHEMA_VERSION),
            ("code_baseline", CODE_BASELINE),
            ("created_at", CREATED_AT),
            ("publication_status", PUBLICATION),
            ("contains_real_data", False),
            ("contains_credentials", False),
            ("content_scope", "public_definitions_synthetic_cases_private_source_indexes"),
            ("private_source_text_included", False),
            ("verified_implementation_count", len(VERIFIED_IMPLEMENTATIONS)),
            ("graph_runtime", {
                "neo4j_started": False,
                "weknora_graph_enabled": False,
                "dsh_using_graph": False,
                "generative_extraction_used": False,
                "live_weknora_overwritten": False,
            }),
            ("a_contract", A_CONTRACT),
            ("input_snapshot", SNAPSHOT),
            ("textbook", {
                "sha256": TEXTBOOK["sha256"],
                "ocr_sha256": TEXTBOOK["ocr_sha256"],
                "ocr_status": TEXTBOOK["ocr_status"],
                "core_slides": TEXTBOOK["core_slides"],
                "note": "OCR 未全本逐字校订。不根据 OCR 猜测解决已知冲突。",
            }),
            ("layers", ["textbook", "code_snapshot", "target_definition", "verified_implementation"]),
            ("honesty", [
                "目标定义不是代码已修复。",
                "离线图谱结构完成不等于图服务已上线或 DSH 已使用图谱。",
                "A 合同或实现状态更新后再同步本包。",
                "D019 仍为 awaiting_source_verification。",
            ]),
            ("counts", {
                "confirmed_decisions": sum(1 for d in DECISIONS if d["status"] == "confirmed"),
                "awaiting_source_verification": ["D019"],
                "textbook_core_metrics": 20,
                "target_metrics": len(TARGET_METRICS),
                "code_snapshot_metrics": len(CODE_SNAPSHOT_METRICS),
                "verified_implementations": 0,
                "nodes": len(nodes),
                "edges": len(edges),
                "conflicts": len(CONFLICTS),
                "acceptance_queries": len(ACCEPTANCE_QUERIES),
            }),
        ]
    )

    dump(ROOT / "pack.json", pack)
    dump(ROOT / "textbook" / "excerpts.json", {
        "pack_version": PACK_VERSION,
        "layer": "textbook",
        "ocr_status": TEXTBOOK["ocr_status"],
        "content_omitted": True,
        "note": "私有教材原文不随公开仓库分发；页码和引用仅用于本地授权核对，不是可公开读取的证据正文。",
        "items": TEXTBOOK_EXCERPTS,
    })
    dump(ROOT / "textbook" / "capability-map.json", {
        "pack_version": PACK_VERSION,
        "metric_version": METRIC_VERSION,
        "map": CAPABILITY_MAP,
    })
    dump(ROOT / "code_snapshots" / "snapshots.json", {
        "pack_version": PACK_VERSION,
        "layer": "code_snapshot",
        "code_baseline": CODE_BASELINE,
        "items": CODE_SNAPSHOT_METRICS,
    })
    dump(ROOT / "definitions" / "decisions.json", {
        "pack_version": PACK_VERSION,
        "metric_version": METRIC_VERSION,
        "source_sha256": SNAPSHOT["decisions_sha256"],
        "items": DECISIONS,
    })
    dump(ROOT / "definitions" / "metrics.json", {
        "pack_version": PACK_VERSION,
        "metric_version": METRIC_VERSION,
        "layer": "target_definition",
        "implementation_status": "not_implemented",
        "items": TARGET_METRICS,
    })
    dump(ROOT / "definitions" / "concepts.json", {"pack_version": PACK_VERSION, "items": CONCEPTS})
    dump(ROOT / "definitions" / "cohorts.json", {"pack_version": PACK_VERSION, "items": COHORTS})
    dump(ROOT / "definitions" / "data_requirements.json", {"pack_version": PACK_VERSION, "items": DATA_REQUIREMENTS})
    dump(ROOT / "definitions" / "source_fields.json", {
        "pack_version": PACK_VERSION,
        "mapping_status": "declared_not_verified",
        "items": SOURCE_FIELDS,
    })
    dump(ROOT / "definitions" / "capabilities.json", {"pack_version": PACK_VERSION, "items": CAPABILITIES})
    dump(ROOT / "definitions" / "strategies.json", {
        "pack_version": PACK_VERSION,
        "execution_authorized": False,
        "items": STRATEGIES,
    })
    dump(ROOT / "definitions" / "evidence.json", {"pack_version": PACK_VERSION, "items": EVIDENCE})
    dump(ROOT / "definitions" / "cases.json", {
        "pack_version": PACK_VERSION,
        "synthetic": True,
        "contains_real_data": False,
        "items": CASES,
    })
    dump(ROOT / "graph" / "nodes.json", {
        "pack_version": PACK_VERSION,
        "kind": "offline_logical_graph_nodes",
        "neo4j": False,
        "items": nodes,
    })
    dump(ROOT / "graph" / "edges.json", {
        "pack_version": PACK_VERSION,
        "kind": "offline_logical_graph_edges",
        "neo4j": False,
        "items": edges,
    })
    dump(ROOT / "graph" / "conflicts.json", {
        "pack_version": PACK_VERSION,
        "do_not_resolve_by_ocr_or_model": True,
        "items": CONFLICTS,
    })
    dump(ROOT / "graph" / "model.json", {
        "pack_version": PACK_VERSION,
        "metric_version": METRIC_VERSION,
        "description": "逻辑模型实例，不是 Neo4j 部署。",
        "node_count": len(nodes),
        "edge_count": len(edges),
        "node_ids_sample": sorted(node_ids)[:20],
        "relation_types_used": sorted({e["type"] for e in edges}),
        "entity_types_used": sorted({n["type"] for n in nodes}),
        "runtime": pack["graph_runtime"],
    })
    dump(ROOT / "queries" / "acceptance.json", {
        "pack_version": PACK_VERSION,
        "items": ACCEPTANCE_QUERIES,
    })
    dump(ROOT / "definitions" / "documents.json", {"pack_version": PACK_VERSION, "items": DOCUMENTS})

    files = []
    for p in sorted(ROOT.rglob("*")):
        if p.is_file() and "tools" not in p.parts and p.suffix in {".json", ".md", ".py"}:
            files.append(str(p.relative_to(ROOT)))
    pack["file_index_hint"] = "see knowledge/crm/README.md; private handoffs are not distributed"
    dump(ROOT / "pack.json", pack)

    print(f"emitted pack {PACK_VERSION} nodes={len(nodes)} edges={len(edges)} evidence={len(evidence_ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
