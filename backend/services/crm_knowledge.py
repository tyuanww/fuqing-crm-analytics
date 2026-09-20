"""Bounded traversal of the public synthetic CRM pack; no model or graph server."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from backend.semantic.crm_metrics_v1 import explain_topic

PACK = Path(__file__).resolve().parents[2] / "knowledge" / "crm"
TOPICS = {
    "aus": ["metric.aus:target-v1"], "aov": ["metric.aov:target-v1"],
    "gsv": ["metric.gsv_net:target-v1"], "member_premium": ["metric.member_premium:target-v1"],
    "new_old": ["metric.new_buyer_share:target-v1"], "sample_followup": ["metric.sample_repeat_revenue:target-v1", "capability.profit_roi"],
    "new_member_conversion": ["capability.member_conversion", "data.first_join_event"],
    "items": ["metric.items_per_buyer:target-v1", "metric.ipt:target-v1", "conflict.ipt.textbook_internal"],
    "conflicts": ["conflict.aus.granularity", "conflict.ipt.textbook_internal", "conflict.d019.source"],
}
KEYWORDS = [("客单件", "items"), ("人均件数", "items"), ("ipt", "items"), ("会员溢价", "member_premium"), ("客单价", "aus"), ("每单金额", "aov"), ("部分退款", "gsv"), ("新会员转化", "new_member_conversion"), ("派样", "sample_followup"), ("教材与旧代码", "conflicts"), ("知识图谱", "runtime"), ("访问", "permission"), ("发券", "authorization")]


def read_items(rel: str) -> list[dict]:
    return json.loads((PACK / rel).read_text())["items"]


def explain_knowledge(topic: str) -> dict:
    canonical = next((key for word, key in KEYWORDS if word in topic.lower()), topic)
    base = explain_topic(canonical)
    key = base["topic"]
    seed_ids = set(TOPICS.get(key, []))
    nodes = read_items("graph/nodes.json")
    index = {node["id"]: node for node in nodes}
    metrics = read_items("definitions/metrics.json")
    evidence = read_items("definitions/evidence.json")
    edges = read_items("graph/edges.json")
    selected = set(seed_ids)
    # Include explicitly related conflicts/old formulas, then follow dependencies.
    selected.update(edge["to"] for edge in edges if edge["from"] in seed_ids and edge["type"] == "SUPERSEDES")
    selected.update(edge["from"] for edge in edges if edge["to"] in seed_ids and edge["type"] == "HAS_CONFLICT_SIDE")
    frontier = set(selected)
    relations = {}
    for _ in range(2):
        next_frontier = set()
        for edge in edges:
            if edge["from"] in frontier:
                relations[edge["id"]] = edge
                next_frontier.add(edge["to"])
        selected.update(next_frontier)
        frontier = next_frontier
    refs = {ref for edge in relations.values() for ref in edge["evidence_refs"]}
    metric = next((item for item in metrics if item["id"] in seed_ids), None)
    decision_ids = set(base["decision_ids"])
    for item_id in selected:
        decision_ids.update(index.get(item_id, {}).get("decision_ids", []))
        if item_id.startswith("D") and item_id[1:].isdigit():
            decision_ids.add(item_id)
    refs.update("ev.decision." + did for did in decision_ids)
    sources = [item for item in evidence if item["id"] in refs]
    context = [node for node in nodes if node["id"] in selected]
    if metric:
        base.update(formula=metric["formula"], definition_review_status="confirmed_principles")
    base.update(
        decision_ids=sorted(decision_ids), evidence_refs=sorted(item["id"] for item in sources),
        implementation_status="not_implemented", definition_layer="target_definition", definition=metric,
        sources=sources, relations=list(relations.values()), context_nodes=context,
        conflicts=[node["id"] for node in context if node.get("type") == "Conflict"],
        pack_version="crm-knowledge-offline/v1", graph_runtime="offline_dependency_graph",
        dsh_using_neo4j=False, code_fixed_in_legacy_services=False, execution_authorized=False,
        real_business_acceptance=False,
        content_scope="public_synthetic_pack_only", document_acl_connected=False,
        historical_snapshot_notice="definition、context_nodes 和关系中的实现状态来自 C 线旧快照；当前验证状态以顶层 implementation_status 为准，不代表旧业务服务已经迁移。",
    )
    if key == "member_premium":
        base["interpretation"] = "会员溢价 1.2 倍表示会员人均消费是非会员的 120%，相对高 20%。"
    if key == "sample_followup":
        base["interpretation"] = "派样 ROI 当前仅为复购收入表现；缺成本、利润和实验对照，不能推断利润回报或因果增量。"
    if key == "permission":
        base["missing"] = ["尚未连接私有文档权限系统；本工具只读取公开合成知识包。受限资料不能导入本候选。"]
    if key == "authorization":
        base["interpretation"] = "知识提供依据，不构成发券或触达授权；本插件没有外发工具。"
    if key == "runtime":
        base.update(implementation_status="runtime_not_assessed", missing=[])
        base["interpretation"] = "本工具只读取离线知识与依赖关系，不检查部署状态。在线教材图谱请调用 query_crm_knowledge_graph，是否接通以该工具的实际结果为准。"
    base["pack_sha256"] = hashlib.sha256((PACK / "pack.json").read_bytes()).hexdigest()
    receipt = PACK / "verification.json"
    if receipt.exists():
        report = json.loads(receipt.read_text())
        root = PACK.parents[1]
        valid = all((root / path).is_file() and hashlib.sha256((root / path).read_bytes()).hexdigest() == digest for path, digest in report.get("implementation_files", {}).items())
        if valid and report.get("implementation_files"):
            base["implementation_verification"] = report
            if metric and metric["id"] in report.get("verified_metric_ids", []):
                base["implementation_status"] = "synthetic_verified"
        elif metric and metric["id"] in report.get("verified_metric_ids", []):
            base["implementation_status"] = "verification_outdated"
            base["verification_note"] = "曾有合成验证记录，但当前文件指纹已变化；需要重新验证，不能据此声称未实现或已经验证通过。"
    return base
