"""C offline pack checks after copy into the integrator tree."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from backend.semantic.crm_metrics_v1 import METRIC_VERSION, explain_topic

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "knowledge" / "crm"


def test_c_pack_validate_and_honesty():
    proc = subprocess.run(
        [sys.executable, str(PACK / "tests" / "validate_pack.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    pack = json.loads((PACK / "pack.json").read_text(encoding="utf-8"))
    assert pack["metric_version"] == METRIC_VERSION
    assert pack["code_baseline"] == "f9070431c3264e8e3d7c36524c87a7e232640789"
    assert pack["contains_real_data"] is False
    assert pack["graph_runtime"]["neo4j_started"] is False
    assert pack["graph_runtime"]["dsh_using_graph"] is False
    assert pack["verified_implementation_count"] == 0
    assert pack["publication_status"] == "local_isolated_candidate"


def test_acceptance_questions_do_not_claim_legacy_fixed():
    questions = json.loads((PACK / "queries" / "acceptance.json").read_text(encoding="utf-8"))["items"]
    mapping = {
        "q.aus.people_or_orders": "客单价",
        "q.premium.1_2": "会员溢价",
        "q.partial_refund": "部分退款",
        "q.new_member_conversion": "新会员转化",
        "q.sample_roi": "派样ROI",
    }
    for item in questions:
        topic = mapping.get(item["id"])
        if not topic:
            continue
        result = explain_topic(topic)
        blob = json.dumps(result, ensure_ascii=False)
        assert result["code_fixed_in_legacy_services"] is False
        assert "代码已修复并上线" not in blob
        primary = next((d for d in (item.get("expected_decision_ids") or []) if d != "D019"), None)
        if primary:
            assert primary in result["decision_ids"]


def test_runtime_reads_confirmed_definitions_and_citations():
    from backend.services.crm_knowledge import explain_knowledge
    cases = [
        ("客单价是除订单还是除人？", "D001", 160),
        ("会员溢价 1.2 是高120%吗？", "D002", 161),
        ("部分退款100退30怎么算？", "D003", None),
        ("客单件到底除人数还是除订单？", "D007", 160),
    ]
    for question, decision, slide in cases:
        result = explain_knowledge(question)
        assert decision in result["decision_ids"]
        assert any(item["id"] == "ev.decision." + decision for item in result["sources"])
        if slide:
            assert any(item.get("slide") == slide for item in result["sources"])
        assert result["relations"]
        assert result["real_business_acceptance"] is False or result["code_fixed_in_legacy_services"] is False


def test_runtime_preserves_capability_gaps_and_conflicts():
    from backend.services.crm_knowledge import explain_knowledge
    member = explain_knowledge("能算新会员转化吗？")
    assert any(node["id"] == "data.first_join_event" for node in member["context_nodes"])
    assert member["implementation_status"] == "not_implemented"
    sample = explain_knowledge("派样ROI为什么这么高？")
    assert "仅为复购收入表现" in sample["interpretation"]
    assert any(node["id"] == "capability.profit_roi" for node in sample["context_nodes"])
    conflict = explain_knowledge("教材与旧代码谁是对的？")
    assert "conflict.ipt.textbook_internal" in conflict["conflicts"]
    assert "conflict.d019.source" in conflict["conflicts"]


def test_runtime_never_authorizes_external_actions_or_claims_graph_server():
    from backend.services.crm_knowledge import explain_knowledge
    assert explain_knowledge("按这条知识立即发券")["execution_authorized"] is False
    permission = explain_knowledge("用户不能访问某文档")
    assert permission["content_scope"] == "public_synthetic_pack_only"
    assert permission["document_acl_connected"] is False
    runtime = explain_knowledge("知识图谱是不是已经给 DSH 用了？")
    assert runtime["dsh_using_neo4j"] is False
    assert runtime["implementation_status"] == "runtime_not_assessed"
    assert runtime["missing"] == []
    assert "query_crm_knowledge_graph" in runtime["interpretation"]
    assert "不检查部署状态" in runtime["interpretation"]


def test_verification_receipt_is_bound_to_current_files(tmp_path, monkeypatch):
    import hashlib
    import shutil
    from backend.services import crm_knowledge
    pack = tmp_path / "knowledge/crm"
    shutil.copytree(PACK, pack)
    implementation = tmp_path / "engine.py"
    implementation.write_text("verified candidate fixture")
    receipt = {
        "implementation_files": {"engine.py": hashlib.sha256(implementation.read_bytes()).hexdigest()},
        "verified_metric_ids": ["metric.aus:target-v1"],
    }
    (pack / "verification.json").write_text(json.dumps(receipt))
    monkeypatch.setattr(crm_knowledge, "PACK", pack)
    assert crm_knowledge.explain_knowledge("客单价")["implementation_status"] == "synthetic_verified"
    implementation.write_text("changed after verification")
    result = crm_knowledge.explain_knowledge("客单价")
    assert result["implementation_status"] == "verification_outdated"
    assert "不能据此声称未实现" in result["verification_note"]
    assert "旧快照" in result["historical_snapshot_notice"]
    assert "implementation_verification" not in result
