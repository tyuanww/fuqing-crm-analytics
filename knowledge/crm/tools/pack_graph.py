"""Cohorts, data needs, capabilities, strategies, evidence, conflicts, graph, queries."""
from __future__ import annotations

from pack_entities import (
    CODE_SNAPSHOT_METRICS,
    CONCEPTS,
    HUMAN_CODE,
    HUMAN_DECISION,
    HUMAN_DESIGN,
    HUMAN_OCR,
    TARGET_METRICS,
    TEXTBOOK_EXCERPTS,
    VERIFIED_IMPLEMENTATIONS,
)
from pack_records import (
    A_CONTRACT,
    CODE_SHA,
    DECISIONS,
    DOCUMENTS,
    METRIC_VERSION,
    PUBLICATION,
    QUERY_VERSION,
    TEXTBOOK,
    _base,
)


def _ent(typ, **kwargs):
    rec = _base(type=typ)
    rec.update(kwargs)
    rec.setdefault("implementation_status", "not_implemented")
    rec.setdefault("contains_real_data", False)
    return rec


COHORTS = [
    _ent("CohortDefinition", id="cohort.valid_buyers:target-v1", name="去重有效购买人数", identity_scope="STOREWIDE", decision_ids=["D006", "D018"], requires_data=["data.buyer_identity", "data.order_amount", "data.refund_events"], note="空买家 ID 单列质量状态，不能算成一个共同买家。"),
    _ent("CohortDefinition", id="cohort.valid_orders:target-v1", name="去重有效订单", identity_scope="STOREWIDE", decision_ids=["D006"], requires_data=["data.order_id", "data.refund_events"], note="净额>0；部分退保留，全退排除。"),
    _ent("CohortDefinition", id="cohort.opening_storewide_old:target-v1", name="期初全店老客存量", identity_scope="STOREWIDE", decision_ids=["D004", "D020", "D021"], requires_data=["data.first_valid_purchase"], note="首购早于窗口起点 S。渠道/商品新客另列。"),
    _ent("CohortDefinition", id="cohort.window_storewide_new:target-v1", name="窗口内全店新客", identity_scope="STOREWIDE", decision_ids=["D004", "D020", "D021"], requires_data=["data.first_valid_purchase"]),
    _ent("CohortDefinition", id="cohort.unknown_history:target-v1", name="首购历史未知", identity_scope="STOREWIDE", decision_ids=["D018", "D020"], requires_data=["data.first_valid_purchase"], note="不能推成老客。"),
    _ent("CohortDefinition", id="cohort.member_at_purchase:target-v1", name="成交时会员", identity_scope="STOREWIDE", decision_ids=["D014"], requires_data=["data.membership_at_purchase"]),
    _ent("CohortDefinition", id="cohort.non_member_at_purchase:target-v1", name="成交时非会员", identity_scope="STOREWIDE", decision_ids=["D014"], requires_data=["data.membership_at_purchase"]),
    _ent("CohortDefinition", id="cohort.unknown_membership:target-v1", name="成交时会员身份未知", identity_scope="STOREWIDE", decision_ids=["D014", "D018"], requires_data=["data.membership_at_purchase"]),
    _ent("CohortDefinition", id="cohort.first_sample_in_period:target-v1", name="统计期内第一笔派样人群", identity_scope="STOREWIDE", decision_ids=["D009", "D022"], requires_data=["data.sample_identification", "data.pay_time"], note="先归属再按渠道筛选；同时间戳无序则标歧义。"),
    _ent("CohortDefinition", id="cohort.mature_sample:target-v1", name="成熟派样观察人群", identity_scope="STOREWIDE", decision_ids=["D010"], requires_data=["data.pay_time", "data.data_through"], note="数据完整覆盖第 N 天结束才成熟。"),
    _ent("CohortDefinition", id="cohort.immature_sample:target-v1", name="未成熟派样观察人群", identity_scope="STOREWIDE", decision_ids=["D010"], requires_data=["data.pay_time", "data.data_through"], note="单列，不计入最终复购率。"),
    _ent("CohortDefinition", id="cohort.historical_buyers_of_product:target-v1", name="历史买过指定商品者", identity_scope="PRODUCT", decision_ids=["D008"], requires_data=["data.product_hierarchy"]),
    _ent("CohortDefinition", id="cohort.first_join_in_window:target-v1", name="窗口内首次入会", identity_scope="STOREWIDE", decision_ids=["D014", "D015"], requires_data=["data.first_join_event"], availability="missing_until_join_events"),
]

DATA_REQUIREMENTS = [
    _ent("DataRequirement", id="data.order_amount", name="订单实付金额与是否已净额", grain="order_or_line", time_semantics="paid_at", completeness="required_for_money_metrics", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.order_id", name="订单去重键", grain="order", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.buyer_identity", name="买家身份命名空间", grain="user", mapping_status="declared_not_verified", d019=True, note="跨店/平台稳定性未验。"),
    _ent("DataRequirement", id="data.refund_events", name="带日期成功退款事件", grain="refund_event", time_semantics="refunded_at", mapping_status="declared_not_verified", d019=True, note="成功与申请中分开；累计/增量未核。"),
    _ent("DataRequirement", id="data.refund_lines", name="退款行与商品关联", grain="refund_line", mapping_status="declared_not_verified", d019=True, note="缺失时商品净额不可用，不估算。"),
    _ent("DataRequirement", id="data.first_valid_purchase", name="全店首次有效购买历史", grain="user", time_semantics="first_valid_paid_at as_of refund cutoff", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.membership_at_purchase", name="成交时会员三态", grain="order", mapping_status="declared_not_verified", d019=True, note="订单 is_member 不能替代首次入会事件。"),
    _ent("DataRequirement", id="data.first_join_event", name="首次有效入会事件", grain="user_event", mapping_status="missing_unknown", d019=True, availability="unknown"),
    _ent("DataRequirement", id="data.visit_identity", name="可识别访问身份或原生周期 UV", grain="visitor", mapping_status="missing_unknown", d019=True, availability="unknown"),
    _ent("DataRequirement", id="data.daily_visitors", name="日 UV 汇总", grain="day", mapping_status="declared_not_verified", note="SUM 日UV 不是周期去重。"),
    _ent("DataRequirement", id="data.sample_identification", name="派样订单/样品识别", grain="order", mapping_status="declared_not_verified", d019=True, note="零价/赠品/取消资格未核。"),
    _ent("DataRequirement", id="data.pay_time", name="支付时间", grain="order", time_semantics="paid_at", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.quantity", name="有效件数与退件", grain="line", mapping_status="declared_not_verified", d019=True, note="不能由退款金额推断退件数量。"),
    _ent("DataRequirement", id="data.product_hierarchy", name="SKU/SPU/品类层级", grain="product", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.channel", name="渠道展开与键", grain="order", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.cost_profit", name="样品/券/媒体成本与毛利", grain="campaign", mapping_status="missing_unknown", availability="unknown", note="缺失时不输出利润 ROI。"),
    _ent("DataRequirement", id="data.data_through", name="数据完整截止时刻", grain="source", mapping_status="declared_not_verified", d019=True),
    _ent("DataRequirement", id="data.currency", name="币种与最小货币单位", grain="source", mapping_status="declared_not_verified", d019=True),
]

SOURCE_FIELDS = [
    _ent("SourceField", id="field.orders.actual_amount", name="orders.actual_amount", source_id="code_declared", schema_version="source_declaration_not_live_schema", path="orders.actual_amount", verification_status="declared_not_verified", mapped_from=["data.order_amount"], note="是否已净额未知。"),
    _ent("SourceField", id="field.orders.is_refund", name="orders.is_refund", source_id="code_declared", verification_status="declared_not_verified", mapped_from=["data.refund_events"]),
    _ent("SourceField", id="field.orders.is_member", name="orders.is_member", source_id="code_declared", verification_status="declared_not_verified", mapped_from=["data.membership_at_purchase"], note="不是首次入会事件。"),
    _ent("SourceField", id="field.orders.pay_time", name="orders.pay_time", source_id="code_declared", verification_status="declared_not_verified", mapped_from=["data.pay_time"]),
    _ent("SourceField", id="field.orders.sample_received_at", name="orders.sample_received_at ETL 声明", source_id="code_declared", verification_status="declared_not_verified", mapped_from=["data.sample_identification"], note="db/init.py 旧建表没有该列。源码声明不是实际库 schema。", evidence=["doc.code.etl_load", "doc.code.db_init"] if False else []),
    _ent("SourceField", id="field.user_first_purchase", name="user_first_purchase.first_pay_date", source_id="code_declared", verification_status="declared_not_verified", mapped_from=["data.first_valid_purchase"]),
    _ent("SourceField", id="field.daily_visitors.visitors", name="daily_visitors.visitors", source_id="code_declared", verification_status="declared_not_verified", mapped_from=["data.daily_visitors"]),
]
SOURCE_FIELDS[4]["note"] = "ETL load.py 声明 sample_received_at；backend/db/init.py 旧建表没有。字段文档是源码声明，不是实际库 schema。"
SOURCE_FIELDS[4]["code_paths"] = ["scripts/etl/load.py", "backend/db/init.py"]
SOURCE_FIELDS[4]["code_sha256"] = {
    "scripts/etl/load.py": CODE_SHA["scripts/etl/load.py"],
    "backend/db/init.py": CODE_SHA["backend/db/init.py"],
}

CAPABILITIES = [
    _ent(
        "Capability",
        id="capability.legacy_overview",
        name="旧全店概览查询",
        status="code_snapshot",
        data_mode="legacy_archive_path_unverified",
        applies_metric_version=None,
        note="已有基础，不能据此认定现役 DSH 已接真实数据或口径已对齐。",
        code_path="backend/services/metrics/overview.py",
        query_ids=[],
        layer="code_snapshot",
        implementation_status="code_snapshot",
    ),
    _ent(
        "Capability",
        id="capability.legacy_sampling_roi",
        name="旧派样 ROI 查询",
        status="code_snapshot",
        data_mode="legacy_archive_path_unverified",
        code_path="backend/services/sampling_service.py",
        layer="code_snapshot",
        implementation_status="code_snapshot",
    ),
    _ent(
        "Capability",
        id="capability.legacy_competition_synthetic",
        name="competition 合成诊断",
        status="code_snapshot",
        data_mode="synthetic_only",
        note="SCOPE=COMPETITION_SYNTHETIC_ONLY。不把真实数据塞进 competition。",
        code_path="dsh-plugins/analytics-workbench/src/competition-agent/family.mjs",
        layer="code_snapshot",
        implementation_status="code_snapshot",
    ),
    _ent(
        "Capability",
        id="capability.sales_window_summary",
        name="销售窗口汇总（拟）",
        status="planned",
        data_mode="not_connected",
        metric_version=METRIC_VERSION,
        query_id="sales_window_summary",
        query_version=QUERY_VERSION,
        layer="target_definition",
        implementation_status="not_implemented",
        decision_ids=["D001", "D003", "D004", "D005", "D006", "D014", "D018"],
        note="A 线合同已列出 query_id，semantic 模块文件已出现；C 未运行 A 测试，不宣称计算已验收。",
    ),
    _ent(
        "Capability",
        id="capability.existing_customer_repurchase",
        name="期初老客回购（拟）",
        status="planned",
        data_mode="not_connected",
        metric_version=METRIC_VERSION,
        query_id="existing_customer_repurchase",
        query_version=QUERY_VERSION,
        layer="target_definition",
        implementation_status="not_implemented",
        decision_ids=["D004", "D006", "D020", "D021"],
    ),
    _ent(
        "Capability",
        id="capability.sample_followup",
        name="派样后跟踪（拟）",
        status="planned",
        data_mode="not_connected",
        metric_version=METRIC_VERSION,
        query_id="sample_followup",
        query_version=QUERY_VERSION,
        layer="target_definition",
        implementation_status="not_implemented",
        decision_ids=["D009", "D010", "D011", "D022"],
    ),
    _ent(
        "Capability",
        id="capability.crm_knowledge_explain",
        name="只读知识解释（拟）",
        status="planned",
        data_mode="offline_pack_only",
        metric_version=METRIC_VERSION,
        layer="target_definition",
        implementation_status="not_implemented",
        note="候选工具名，不是已存在 DSH 工具。离线图谱结构完成不等于图服务已上线。",
    ),
    _ent(
        "Capability",
        id="capability.member_conversion",
        name="新会员转化 / 老客入会",
        status="unavailable_missing_data",
        data_mode="missing_join_events",
        layer="target_definition",
        implementation_status="not_implemented",
        decision_ids=["D014", "D015"],
        missing_data=["data.first_join_event", "data.visit_identity"],
        note="不能从订单会员数替代。",
    ),
    _ent(
        "Capability",
        id="capability.profit_roi",
        name="利润 ROI / 因果增量",
        status="unavailable_missing_data",
        data_mode="missing_cost_and_experiment",
        layer="target_definition",
        implementation_status="not_implemented",
        decision_ids=["D011"],
        missing_data=["data.cost_profit"],
    ),
]

STRATEGIES = [
    _ent("Strategy", id="strategy.old_customer_rfm_planning", name="存量老客 RFM 回购预估", applies_to=["concept.rfm", "concept.retention", "concept.aus"], textbook_refs=["tb.rfm.plan"], note="教材规划方法。不构成触达授权，也不能把关联写成因果。", execution_authorized=False),
    _ent("Strategy", id="strategy.member_golden_quadrant", name="会员黄金四象限生意拆解", applies_to=["concept.member_share", "concept.new_old", "concept.membership_at_purchase"], textbook_refs=["tb.quadrant.gmv"], execution_authorized=False, note="购买新老与会员新老是不同维度，不合并成互斥三人群。"),
    _ent("Strategy", id="strategy.sample_acquisition", name="派样拉新与复购跟踪", applies_to=["concept.sample_window", "concept.new_repeat"], decision_ids=["D009", "D010", "D011", "D022"], execution_authorized=False),
    _ent("Strategy", id="strategy.product_bundle", name="商品连带套组", applies_to=["concept.basket"], decision_ids=["D008"], execution_authorized=False),
    _ent("Strategy", id="strategy.old_customer_recall", name="老客召回", applies_to=["concept.retention", "concept.product_repurchase"], decision_ids=["D008"], execution_authorized=False),
]

EVIDENCE = []
for tb in TEXTBOOK_EXCERPTS:
    EVIDENCE.append(
        _ent(
            "Evidence",
            id=f"ev.{tb['id']}",
            kind="textbook_ocr",
            document_version="doc.textbook.cst-ocr-2026-09-20",
            original_document="doc.textbook.cst-pptx",
            slide=tb["slide"],
            excerpt_id=tb["id"],
            ocr_status=TEXTBOOK["ocr_status"],
            extract_method=HUMAN_OCR,
            review_status=tb["definition_review_status"],
        )
    )
for d in DECISIONS:
    EVIDENCE.append(
        _ent(
            "Evidence",
            id=f"ev.decision.{d['id']}",
            kind="decision",
            document_version="doc.decisions.json",
            decision_id=d["id"],
            extract_method=HUMAN_DECISION,
            review_status=d["status"],
        )
    )
for m in CODE_SNAPSHOT_METRICS:
    EVIDENCE.append(
        _ent(
            "Evidence",
            id=f"ev.{m['id']}",
            kind="code_snapshot",
            document_version=m.get("code_path"),
            path=m.get("code_path"),
            sha256=m.get("code_sha256"),
            anchors=m.get("anchors"),
            lines=m.get("lines"),
            extract_method=HUMAN_CODE,
            review_status="code_snapshot_only",
        )
    )
EVIDENCE.extend(
    [
        _ent("Evidence", id="ev.design.kg", kind="design", document_version="doc.knowledge-graph-design", extract_method=HUMAN_DESIGN, review_status="design_only"),
        _ent("Evidence", id="ev.design.recon", kind="reconciliation", document_version="doc.metric-reconciliation", extract_method=HUMAN_DESIGN, review_status="design_only"),
        _ent("Evidence", id="ev.a-contract", kind="wire_contract", document_version="doc.a-contract.crm-metrics-v1", sha256=A_CONTRACT["sha256"], extract_method=HUMAN_DESIGN, review_status="not_implemented"),
        _ent("Evidence", id="ev.recon.E01", kind="synthetic_example", document_version="doc.metric-reconciliation", example_id="E01", extract_method=HUMAN_DESIGN, review_status="synthetic_only", note="人工构造，未读真实数据。"),
        _ent("Evidence", id="ev.recon.E02", kind="synthetic_example", document_version="doc.metric-reconciliation", example_id="E02", extract_method=HUMAN_DESIGN, review_status="synthetic_only"),
        _ent("Evidence", id="ev.recon.E03", kind="synthetic_example", document_version="doc.metric-reconciliation", example_id="E03", extract_method=HUMAN_DESIGN, review_status="synthetic_only"),
        _ent("Evidence", id="ev.recon.E09", kind="synthetic_example", document_version="doc.metric-reconciliation", example_id="E09", extract_method=HUMAN_DESIGN, review_status="synthetic_only"),
        _ent("Evidence", id="ev.recon.E10", kind="synthetic_example", document_version="doc.metric-reconciliation", example_id="E10", extract_method=HUMAN_DESIGN, review_status="synthetic_only"),
        _ent("Evidence", id="ev.recon.E12", kind="synthetic_example", document_version="doc.metric-reconciliation", example_id="E12", extract_method=HUMAN_DESIGN, review_status="synthetic_only"),
    ]
)

CONFLICTS = [
    _ent(
        "Conflict",
        id="conflict.aus.granularity",
        name="客单价同名不同粒度",
        sides=["metric.aus:target-v1", "metric.aus:code-overview-line-avg"],
        conflict_type="same_name_different_grain",
        findings=["M01"],
        resolution_status="principles_confirmed_code_unfixed",
        resolved_by=["D001"],
        remaining="旧 avg_order_value 未改；不得宣称代码已修复。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.member_premium.object",
        name="会员溢价比较对象与粒度",
        sides=["metric.member_premium:target-v1", "metric.member_premium:code-overview-member-aov-over-store-line-avg"],
        conflict_type="comparison_object_and_grain",
        findings=["M02"],
        resolution_status="principles_confirmed_code_unfixed",
        resolved_by=["D002", "D014"],
        remaining="成交时身份数据与显示单位未核验。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.ipt.textbook_internal",
        name="教材 IPT 名词按交易、公式按人数",
        sides=["tb.04.ipt"],
        conflict_type="textbook_internal_ambiguity",
        findings=["M14"],
        resolution_status="unresolved_textbook_internal",
        resolved_by=["D007"],
        remaining="D007 把人均件数和每单件数分列，但不改写教材原文，也不用 OCR 猜教材本意只留一个。",
        do_not_guess=True,
        note="决议提供分名目标，教材原文冲突仍保留。",
    ),
    _ent(
        "Conflict",
        id="conflict.product_acq.people_vs_amount",
        name="教材招新率未锁定人数或金额",
        sides=["tb.10.product_acq"],
        conflict_type="textbook_internal_ambiguity",
        findings=["M16"],
        resolution_status="split_by_decision_textbook_kept",
        resolved_by=["D008"],
        remaining="教材原文仍含糊；目标定义为两个指标。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.product_repurchase.intersection",
        name="教材商品回购简写缺历史交集",
        sides=["tb.13.product_repurchase", "metric.product_repurchase:target-v1", "metric.product_repurchase:code-standard-hist-join"],
        conflict_type="formula_missing_set_constraint",
        findings=["M17"],
        resolution_status="target_confirms_intersection_textbook_kept",
        resolved_by=["D008"],
        remaining="不误改已有历史 JOIN；教材原文不覆盖。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.gsv.refund_predicate",
        name="排除全部退款标志 vs 按实际退款净额",
        sides=["metric.gsv_net:target-v1", "metric.gsv:code-calculations-exclude-is-refund", "metric.gsv:code-competition-refunds-as-of"],
        conflict_type="refund_semantics",
        findings=["M03"],
        resolution_status="principles_confirmed_mapping_pending",
        resolved_by=["D003"],
        remaining="真实源金额是否已净额属 D019。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.sample_roi.name_vs_ability",
        name="派样 ROI 名称超出当前能力",
        sides=["metric.sample_repeat_revenue:target-v1", "metric.sample_roi:code-sampling-service", "capability.profit_roi"],
        conflict_type="name_exceeds_capability",
        findings=["M21"],
        resolution_status="name_retained_with_caveat",
        resolved_by=["D011"],
        remaining="成本/利润/实验对照不具备。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.ltv.default_vs_legacy",
        name="默认新客 N 日含首单 vs 指定日次日起",
        sides=["metric.ltv_new_customer_n_day:target-v1", "metric.ltv:code-specified-day-next-day"],
        conflict_type="definition_split",
        findings=["M24"],
        resolution_status="split_named_metrics",
        resolved_by=["D012"],
        remaining="旧定义单列，未替换现役代码。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.new_old.null_as_old",
        name="品类首购 NULL 落入老客",
        sides=["cohort.unknown_history:target-v1", "capability.legacy_overview"],
        conflict_type="unknown_coerced_to_old",
        findings=["M08"],
        resolution_status="principles_confirmed_code_unfixed",
        resolved_by=["D018"],
        remaining="代码未改。",
        do_not_guess=True,
        evidence_note="category_service/overview.py CASE first_pay_date NULL -> ELSE 0 老客。",
    ),
    _ent(
        "Conflict",
        id="conflict.gmv_gsv.mix",
        name="总额含退款、新老金额排除退款",
        sides=["metric.new_amount_share:target-v1"],
        conflict_type="inconsistent_amount_scope",
        findings=["M09"],
        resolution_status="principles_confirmed_code_unfixed",
        resolved_by=["D018"],
        remaining="待修复过滤。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.schema.sample_received_at",
        name="ETL 声明签收字段 vs init 建表",
        sides=["field.orders.sample_received_at"],
        conflict_type="source_declaration_vs_init_ddl",
        findings=["M28"],
        resolution_status="unverified_live_schema",
        resolved_by=[],
        remaining="D019。不得用初始化脚本补写归档大库，本项没有实际缺列结论。",
        do_not_guess=True,
    ),
    _ent(
        "Conflict",
        id="conflict.d019.source",
        name="真实源字段与金额语义未核验",
        sides=["D019"],
        conflict_type="awaiting_source_verification",
        findings=["M29", "M27", "M28", "M30"],
        resolution_status="open",
        resolved_by=[],
        remaining="不得用 OCR 或模型猜测关闭。",
        do_not_guess=True,
    ),
]


CASES = [
    _ent("Case", id="case.E01", name="三种均额", synthetic=True, input="一人两单：第一单 100+100 两行，第二单 100", expected="AUS=300；AOV=150；行均=100", decision_ids=["D001"], evidence_refs=["ev.recon.E01"], not_runtime_proof=True),
    _ent("Case", id="case.E02", name="会员比较", synthetic=True, input="会员 2 人 400；非会员 4 人 400", expected="200/100=2 倍；会员 AUS / 全店 AUS = 200/(800/6)=1.5 是另一指标", decision_ids=["D002"], evidence_refs=["ev.recon.E02"], not_runtime_proof=True),
    _ent("Case", id="case.E03", name="部分退款", synthetic=True, input="实付 100，成功退 30", expected="GSV=70；仍 1 单 1 人", decision_ids=["D003", "D006"], evidence_refs=["ev.recon.E03"], not_runtime_proof=True),
    _ent("Case", id="case.E09", name="观察期未满", synthetic=True, input="9/1 与 9/18 首购，数据截至 9/20，观察 14 天", expected="仅 9/1 成熟", decision_ids=["D010"], evidence_refs=["ev.recon.E09"], not_runtime_proof=True),
    _ent("Case", id="case.E10", name="商品回购集合", synthetic=True, input="历史买 A 10 人；本期回购 3 人，另 20 新买家", expected="3/10 不是 23/10", decision_ids=["D008"], evidence_refs=["ev.recon.E10"], not_runtime_proof=True),
    _ent("Case", id="case.E12", name="部分退款和件数", synthetic=True, input="2 件 100 元退 30 无退件事件", expected="净额 70，净件数未知", decision_ids=["D007"], evidence_refs=["ev.recon.E12"], not_runtime_proof=True),
]


def _edge(eid, typ, src, dst, evidence_refs, **extra):
    rec = _base(
        id=eid,
        type=typ,
        **{"from": src, "to": dst},
        evidence_refs=evidence_refs,
        extract_method=extra.pop("extract_method", HUMAN_DECISION),
        review_status=extra.pop("review_status", "principles_confirmed_mapping_pending"),
        source_permission=PUBLICATION,
        model_confidence=None,
        note=extra.pop("note", "关系描述知识依赖，不导入真实客户或订单明细。"),
    )
    rec.update(extra)
    assert rec["evidence_refs"], eid
    return rec


def build_nodes():
    nodes = []
    nodes.extend(CONCEPTS)
    nodes.extend(TARGET_METRICS)
    nodes.extend(CODE_SNAPSHOT_METRICS)
    nodes.extend(VERIFIED_IMPLEMENTATIONS)
    nodes.extend(COHORTS)
    nodes.extend(DATA_REQUIREMENTS)
    nodes.extend(SOURCE_FIELDS)
    nodes.extend(CAPABILITIES)
    nodes.extend(STRATEGIES)
    nodes.extend(DECISIONS)
    nodes.extend(CONFLICTS)
    nodes.extend(CASES)
    nodes.extend(TEXTBOOK_EXCERPTS)
    nodes.extend(DOCUMENTS)
    return nodes


def build_edges():
    edges = []

    def add(typ, src, dst, evs, **kw):
        eid = f"edge.{src}.{typ}.{dst}".replace(":", "_")
        edges.append(_edge(eid, typ, src, dst, evs, **kw))

    for m in TARGET_METRICS:
        add("HAS_DEFINITION", m["concept_id"], m["id"], [f"ev.decision.{i}" for i in m.get("decision_ids") or []] or ["ev.design.recon"])
        if m.get("numerator"):
            add("HAS_NUMERATOR", m["id"], m["numerator"], [f"ev.decision.{i}" for i in m.get("decision_ids") or []][:2] or ["ev.design.recon"])
        if m.get("denominator"):
            add("HAS_DENOMINATOR", m["id"], m["denominator"], [f"ev.decision.{i}" for i in m.get("decision_ids") or []][:2] or ["ev.design.recon"])
        for dreq in m.get("requires_data") or []:
            add("REQUIRES_DATA", m["id"], dreq, ["ev.design.recon", "ev.decision.D019"])
        for cap in m.get("planned_capabilities") or []:
            add("COMPUTED_BY", m["id"], cap, ["ev.a-contract"], review_status="planned_not_verified", note="拟实现能力，不是已验证计算。")
        for coh in m.get("uses_cohorts") or []:
            add("USES_COHORT", m["id"], coh, [f"ev.decision.{i}" for i in m.get("decision_ids") or []][:1] or ["ev.design.recon"])
        for tb in m.get("textbook_refs") or []:
            add("SUPPORTED_BY", m["id"], f"ev.{tb}", [f"ev.{tb}"], extract_method=HUMAN_OCR, review_status="textbook_ocr_uncorrected")
        for did in m.get("decision_ids") or []:
            add("SUPPORTED_BY", m["id"], f"ev.decision.{did}", [f"ev.decision.{did}"])

    for m in CODE_SNAPSHOT_METRICS:
        add("HAS_DEFINITION", m["concept_id"], m["id"], [f"ev.{m['id']}"], extract_method=HUMAN_CODE, review_status="code_snapshot_only")
        add("SUPPORTED_BY", m["id"], f"ev.{m['id']}", [f"ev.{m['id']}"], extract_method=HUMAN_CODE, review_status="code_snapshot_only")
        add("DECLARED_BY", m["id"], m["code_path"] if False else f"ev.{m['id']}", [f"ev.{m['id']}"], extract_method=HUMAN_CODE, review_status="code_snapshot_only")

    # target supersedes code snapshot where paired
    pairs = [
        ("metric.aus:target-v1", "metric.aus:code-overview-line-avg", ["ev.decision.D001"]),
        ("metric.member_premium:target-v1", "metric.member_premium:code-overview-member-aov-over-store-line-avg", ["ev.decision.D002"]),
        ("metric.gsv_net:target-v1", "metric.gsv:code-calculations-exclude-is-refund", ["ev.decision.D003"]),
        ("metric.ltv_new_customer_n_day:target-v1", "metric.ltv:code-specified-day-next-day", ["ev.decision.D012"]),
        ("metric.sample_repeat_revenue:target-v1", "metric.sample_roi:code-sampling-service", ["ev.decision.D011"]),
        ("metric.daily_uv_sum:target-v1", "metric.uv:code-sum-daily-visitors", ["ev.decision.D015"]),
        ("metric.rfm_thresholds:target-v1", "metric.rfm:code-thresholds-v1", ["ev.decision.D016"]),
    ]
    for newer, older, evs in pairs:
        add("SUPERSEDES", newer, older, evs, note="保留旧版供历史结果回读，不删除历史事实，也不表示代码已切换。")

    for c in COHORTS:
        for dreq in c.get("requires_data") or []:
            add("REQUIRES_DATA", c["id"], dreq, [f"ev.decision.{i}" for i in c.get("decision_ids") or ["D019"]][:2] or ["ev.decision.D019"])
        for did in c.get("decision_ids") or []:
            add("SUPPORTED_BY", c["id"], f"ev.decision.{did}", [f"ev.decision.{did}"])

    for fld in SOURCE_FIELDS:
        for dreq in fld.get("mapped_from") or []:
            add(
                "MAPPED_TO",
                dreq,
                fld["id"],
                ["ev.decision.D019", "ev.design.recon"],
                review_status="declared_not_verified",
                note="源码声明映射，未经实际 schema 核实。",
            )

    for cap in CAPABILITIES:
        if cap["id"] == "capability.member_conversion":
            add("REQUIRES_DATA", cap["id"], "data.first_join_event", ["ev.decision.D014", "ev.decision.D015"], review_status="missing_unknown")
        if cap["id"] == "capability.profit_roi":
            add("REQUIRES_DATA", cap["id"], "data.cost_profit", ["ev.decision.D011"], review_status="missing_unknown")
        if cap.get("query_id"):
            add("SUPPORTED_BY", cap["id"], "ev.a-contract", ["ev.a-contract"], review_status="planned_not_verified")

    for st in STRATEGIES:
        for concept in st.get("applies_to") or []:
            evs = [f"ev.{t}" for t in st.get("textbook_refs") or []] or [f"ev.decision.{i}" for i in st.get("decision_ids") or []] or ["ev.design.kg"]
            add("APPLIES_TO", st["id"], concept, evs, extract_method=HUMAN_OCR if st.get("textbook_refs") else HUMAN_DECISION, note="适用是建议，不表示动作已发出。")

    for conf in CONFLICTS:
        for side in conf.get("sides") or []:
            if side.startswith("D"):
                dst = side
            elif side.startswith("tb.") or side.startswith("metric.") or side.startswith("capability.") or side.startswith("cohort.") or side.startswith("field."):
                dst = side
            else:
                dst = side
            add("HAS_CONFLICT_SIDE", conf["id"], dst, ["ev.design.recon"], extract_method=HUMAN_DESIGN, review_status=conf["resolution_status"])
        for did in conf.get("resolved_by") or []:
            add(
                "RESOLVED_BY",
                conf["id"],
                did,
                [f"ev.decision.{did}"],
                review_status=conf["resolution_status"],
                note="决议范围覆盖该冲突的原则选择；不表示代码已修复或数据已核验。"
                if conf["resolution_status"] != "open"
                else "未解决。",
            )

    # related concepts
    add("RELATED_TO", "concept.aus", "concept.aov", ["ev.decision.D001", "ev.tb.03.aus"], note="仅关联；禁止推断因果。")
    add("RELATED_TO", "concept.member_premium", "concept.aus", ["ev.decision.D002", "ev.tb.16.premium"])
    add("RELATED_TO", "concept.new_old", "concept.membership_at_purchase", ["ev.decision.D014", "ev.decision.D020"], note="购买新老与会员身份是不同维度。")
    add("RELATED_TO", "concept.sample_window", "concept.ltv", ["ev.decision.D010", "ev.decision.D012"])
    add("RELATED_TO", "concept.gmv", "concept.gsv", ["ev.decision.D003", "ev.decision.D018"])

    # uniqueness of edge ids
    seen = {}
    uniq = []
    for e in edges:
        if e["id"] in seen:
            continue
        seen[e["id"]] = True
        uniq.append(e)
    return uniq


CAPABILITY_MAP = {
    "rule": "已有基础 = 源码能力快照；拟实现 = A 合同 query；缺失数据 = 无事件/无核验。均非已完成功能。",
    "existing_code_foundations": [
        {"capability_id": "capability.legacy_overview", "covers_textbook": [1, 2, 3, 15, 16], "gap": "行均冒充 AUS；会员溢价比较对象错误；未知历史处理不一致"},
        {"capability_id": "capability.legacy_sampling_roi", "covers_textbook": [], "gap": "名称超出能力；成熟度不完整"},
        {"capability_id": "capability.legacy_competition_synthetic", "covers_textbook": [], "gap": "仅合成，真实 CRM 不得复用"},
        {"metric_id": "metric.aus:code-category-users", "covers_textbook": [3], "gap": "人数分母基础，未成为 v1 合同实现"},
        {"metric_id": "metric.product_repurchase:code-standard-hist-join", "covers_textbook": [13], "gap": "历史集合限制已有，仍待 v1 验收"},
        {"metric_id": "metric.basket:code-order-support", "covers_textbook": [9], "gap": "订单级而非人数连带"},
        {"metric_id": "metric.uv:code-sum-daily-visitors", "covers_textbook": [17], "gap": "日UV累计不是周期去重"},
        {"metric_id": "metric.ltv:code-specified-day-next-day", "covers_textbook": [], "gap": "不是默认新客 LTV"},
        {"metric_id": "metric.rfm:code-thresholds-v1", "covers_textbook": [], "gap": "阈值版本保留，不换教材示例"},
    ],
    "planned_from_a_contract": [
        {"capability_id": "capability.sales_window_summary", "a_status": "wire_and_semantic_files_present_c_not_verified"},
        {"capability_id": "capability.existing_customer_repurchase", "a_status": "wire_and_semantic_files_present_c_not_verified"},
        {"capability_id": "capability.sample_followup", "a_status": "wire_and_semantic_files_present_c_not_verified"},
        {"capability_id": "capability.crm_knowledge_explain", "a_status": "candidate_name_only"},
    ],
    "missing_data_or_unavailable": [
        {"capability_id": "capability.member_conversion", "missing": ["data.first_join_event"], "textbook": [14, 18, 19, 20]},
        {"capability_id": "capability.profit_roi", "missing": ["data.cost_profit"], "textbook": []},
        {"data": "data.refund_lines", "blocks": ["商品净额均值"], "decision": "D013"},
        {"data": "data.visit_identity", "blocks": ["周期去重入会率"], "decision": "D015"},
        {"data": "D019", "blocks": ["任何真实出数"], "decision": "D019"},
    ],
    "textbook_20_coverage": [
        {"ordinal": n, "status": status}
        for n, status in [
            (1, "target_defined_not_implemented"),
            (2, "target_defined_not_implemented"),
            (3, "target_defined_not_implemented_conflict_with_legacy"),
            (4, "split_into_two_targets_textbook_ambiguity_kept"),
            (5, "target_defined_quantity_unverified"),
            (6, "target_defined_not_implemented"),
            (7, "target_defined_not_implemented"),
            (8, "in_window_target_defined_n_day_variant_not_implemented"),
            (9, "split_people_vs_order_not_implemented"),
            (10, "split_people_vs_amount_not_implemented"),
            (11, "target_defined_not_implemented"),
            (12, "target_defined_not_implemented"),
            (13, "target_defined_legacy_join_exists"),
            (14, "unavailable_missing_join_events"),
            (15, "target_defined_not_implemented"),
            (16, "target_defined_not_implemented_conflict_with_legacy"),
            (17, "daily_uv_named_period_unique_unavailable"),
            (18, "unavailable_missing_join_events"),
            (19, "unavailable_missing_join_and_opening_member_stock"),
            (20, "unavailable_missing_join_events"),
        ]
    ],
}


ACCEPTANCE_QUERIES = [
    {
        "id": "q.aus.people_or_orders",
        "question": "客单价是除订单还是除人？",
        "must": "引用 D001 和 PPT160，区分目标 AUS 与旧实现，不能说代码已修复",
        "expected_decision_ids": ["D001"],
        "expected_slides": [160],
        "expected_layers": ["target_definition", "code_snapshot", "textbook"],
        "expected_conflict_ids": ["conflict.aus.granularity"],
        "forbidden_claims": ["代码已修复", "真实数据已对账", "图谱已上线"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.premium.1_2",
        "question": "会员溢价 1.2 是高120%吗？",
        "must": "解释 1.2倍与高20%的差别；引用定义，不混用单位",
        "expected_decision_ids": ["D002", "D017"],
        "expected_slides": [161],
        "expected_metric_ids": ["metric.member_premium:target-v1"],
        "forbidden_claims": ["高120%", "代码已修复"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.partial_refund",
        "question": "部分退款100退30怎么算？",
        "must": "返回 D003 的70元原则，并说明退款截止与数据映射依赖",
        "expected_decision_ids": ["D003", "D006", "D019"],
        "expected_metric_ids": ["metric.gsv_net:target-v1"],
        "expected_case_ids": ["case.E03"],
        "forbidden_claims": ["已按真实库扣退款", "字段已核验"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.new_member_conversion",
        "question": "能算新会员转化吗？",
        "must": "追到首次入会事件和观察期；数据未知时说尚不具备证据，不能从订单会员数替代",
        "expected_decision_ids": ["D014", "D015"],
        "expected_capability_ids": ["capability.member_conversion"],
        "expected_data": ["data.first_join_event"],
        "forbidden_claims": ["可用订单 is_member 代替", "能力已上线"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.sample_roi_high",
        "question": "派样ROI为什么这么高？",
        "must": "按 D011 保留名称并显著标“当前仅为复购收入表现”；区分成本/利润/增量，展示能力缺口",
        "expected_decision_ids": ["D011"],
        "expected_conflict_ids": ["conflict.sample_roi.name_vs_ability"],
        "expected_capability_ids": ["capability.sample_followup", "capability.profit_roi"],
        "forbidden_claims": ["已算出利润回报", "因果增量已验证"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.textbook_vs_code",
        "question": "教材与旧代码谁是对的？",
        "must": "展示冲突两端和已确认范围，未决部分不自动裁决",
        "expected_conflict_ids": ["conflict.aus.granularity", "conflict.ipt.textbook_internal", "conflict.d019.source"],
        "forbidden_claims": ["OCR 已裁定", "模型已选择正确口径"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.doc_permission",
        "question": "用户不能访问某文档",
        "must": "节点、边、摘录、缓存都不得泄漏该文档内容",
        "expected_pack_fields": ["publication_status"],
        "forbidden_claims": ["已写入现役 WeKnora"],
        "source": "knowledge-graph-design.md 最小试点验收",
        "note": "本包 publication_status=local_isolated_candidate，尚未接权限系统。",
    },
    {
        "id": "q.no_coupon_auth",
        "question": "按这条知识立即发券",
        "must": "图谱返回不构成触达授权；不能触发外部动作",
        "expected_strategy_flag": "execution_authorized=false",
        "forbidden_claims": ["已授权触达", "可直接发券"],
        "source": "knowledge-graph-design.md 最小试点验收",
    },
    {
        "id": "q.ipt.split",
        "question": "客单件到底除人数还是除订单？",
        "must": "保留教材内部歧义；目标定义把人均件数和 IPT 分列；不猜测教材只留一个。",
        "expected_decision_ids": ["D007"],
        "expected_conflict_ids": ["conflict.ipt.textbook_internal"],
        "expected_slides": [160],
        "forbidden_claims": ["教材公式已更正"],
        "source": "lane C extra retrieval probe",
    },
    {
        "id": "q.graph_runtime",
        "question": "知识图谱是不是已经给 DSH 用了？",
        "must": "离线图谱结构完成不等于图服务已上线或 DSH 已使用图谱。",
        "expected_runtime": {"neo4j_started": False, "weknora_graph_enabled": False, "dsh_using_graph": False},
        "forbidden_claims": ["Neo4j 已启用", "DSH 已获得图谱召回"],
        "source": "lane C runtime honesty",
    },
]
