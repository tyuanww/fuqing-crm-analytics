"""Curated offline CRM knowledge records (lane C).

Layers are kept separate:
  textbook / code_snapshot / target_definition / verified_implementation
No record in this module is a verified implementation. Target formulas
are transcribed from confirmed decisions, not from OCR guesses.
"""
from __future__ import annotations

PACK_VERSION = "crm-knowledge-offline/v1"
METRIC_VERSION = "crm-metrics/v1"
QUERY_VERSION = "crm-metrics-query/v1"
WIRE_SCHEMA_VERSION = "crm-metrics-wire/v1"
RFM_THRESHOLD_VERSION = "crm-rfm-thresholds/v1"
CODE_BASELINE = "f9070431c3264e8e3d7c36524c87a7e232640789"
PUBLICATION = "local_isolated_candidate"
CREATED_AT = "2026-09-20"

A_CONTRACT = {
    "path": "backend/contracts/crm_metrics_v1.py",
    "sha256": "8fc60d5e935ec43bbe5cf8ae02349f95f6bcd90cb34dd4222031c17034eccf6a",
    "semantic_path": "backend/semantic/crm_metrics_v1.py",
    "semantic_sha256": "7d52b6f5311629502ddf280810e1755bddc387e38bdf6b876f446e7068266131",
    "semantic_module_present": True,
    "compose_path": "backend/semantic/crm_metrics_compose.py",
    "compose_sha256": "5d5dc30074654923380a009f277265fdac8d1fae8f1ea2ca1740d646a3b84788",
    "query_ids": [
        "sales_window_summary",
        "existing_customer_repurchase",
        "sample_followup",
    ],
    "implementation_status": "not_implemented",
    "c_verification_of_a_engine": "not_run",
    "sync_rule": "A合同或实现状态更新后再同步本知识包，不提前宣称功能已完成。",
    "note": "A 工作树已出现 semantic 模块与测试文件。C 只记录指纹，不把文件存在当成合成验收、真实对账或 DSH 已接入。",
}

SNAPSHOT = {
    "root": "private_input_snapshot_not_distributed",
    "manifest_sha256": "56d51f225d98797f3a13dce884f0f4ec6a7701aaaff6d54b4d2dd5e703e70844",
    "decisions_sha256": "4ebbcc3a3495232cac48b674d789e7cafdd45077a67ba8370cd9dcc4086c825f",
    "reconciliation_sha256": "b3ed3aa6968cc8d507318c21cc271688b762d30962f84d09d9fa2ccb5ae8ddea",
    "knowledge_graph_design_sha256": "906cf0a8706a8037cd636df1091786dbbd182bf5a4bbf55d05e0af9275980d8f",
    "evidence_manifest_sha256": "a6713aa3ad224fb3b5051650f3a1c3dc0643a468b154ec47aa1b859518c2877a",
}

TEXTBOOK = {
    "path": "private_source_not_distributed",
    "sha256": "1bd779a9ea526f3405138d00e2b745a2ba955ad7e882a345ab958748f0611631",
    "slides": 168,
    "ocr_path": "private_ocr_not_distributed",
    "ocr_sha256": "dea6261ba17ea82fa6e6e781ebb33c17a5448d1e02c753634e672c6870b0b10e",
    "ocr_status": "machine_ocr_uncorrected",
    "core_slides": [160, 161],
    "supporting_slides": [24, 25, 30, 32, 33, 34, 140],
}

CODE_SHA = {
    "backend/services/metrics/overview.py": "91d370461b89e7ab47c8e7b33200b035a5b4ffb2e3f513827495f82f0699cc59",
    "backend/services/category_service/overview.py": "6205625fc25e15f914b26917d5f12031e7971b1b67f7ba8aff6f87c1fe1d9345",
    "backend/services/metrics/competition_compute.py": "ad085b5725e5f23e6f360b7bae147be066cb782dddc94e8648136347cda66cd5",
    "backend/services/category_service/basket.py": "b3213780f29df1b67f5782fe75f35d4f3cb7a01d838464b4b252c018a9382a14",
    "backend/services/category_service/repurchase/standard.py": "952eca2c73063fd5ec0249b9154649609c6fedbd1c2f655769e2c305312c8bf4",
    "backend/services/sampling_service.py": "39e43a595f942ce473a680a2165029f4a712b114299e2621b5f9a5cafc3d09df",
    "backend/services/lifetime_value_service.py": "e7f737ed008dae93d94dd70948c42c8cc31318ebfc14c0505d32dde58e7d79aa",
    "backend/services/visitor_service.py": "f2f8fe96903a759ea67dcd73887930aaa133a36065737aa461cbd3905e6cc936",
    "backend/semantic/calculations.py": "066156eccd03d584c644f0a777b94190502c773e102cf5d67c92a041a6d7b6e9",
    "backend/semantic/segments.py": "25570eb641232299b71837001b1d9a1bb0bbfd831f0f508847fbfc1f9aed658a",
    "backend/semantic/metrics.py": "22f650c543e7e1e0d5018ed0dedc8f333399512cc650ec7a0db61514d5d3d0cb",
    "backend/semantic/lifetime_value.py": "98df05cd317b5c6d2ab7a4d4be00d0bb4fa7c937546c7943689a4d32cfc07342",
    "backend/contracts/metrics.py": "8c49dbda46d9e6d8b0a9e09b11e4daaa279933d35556a086f40edfb778f696a8",
    "backend/contracts/types.py": "fc1558c9f522e2fa8bd330584f01822752d8075f524da7efd529c97a4732b6dd",
    "backend/contracts/sampling.py": "05f78128f87ba74728779d34b51abcd251440c74b0fa8917f6d21f8eb9e53c08",
    "backend/services/rfm/cache.py": "36c50fd2515aca52768f124a76a1ee66103a467f5ae5b0e5e47bd3b90812c8a4",
    "backend/services/rfm/extended.py": "3a9df8f2dd0cc9b1e74ccd3801370a1edcd896cf7f85fbf3713e6ad3e4d9cd75",
    "backend/services/rfm/f_flow.py": "ef7f2ecc8d45c0ba1c101cc6f06a0c338a4ad07bdd9b9bc59fd49969dbc19ea5",
    "scripts/etl/load.py": "787cdd320a2b94c7d04f2e621e71d280139716a2b046b26ab4e4df29dfd6d366",
    "backend/db/init.py": "ba43c132e78409f43f9abf2323e46c4f5e5c749ac2b4c876e9715af1ba240ae4",
    "backend/services/analytics/queries.py": "9f41498a7ac06d7577a6d41173e892c540b5a8c07da0b3073c7c32c1b6f94711",
    "dsh-plugins/analytics-workbench/src/competition-agent/family.mjs": "9e7b32dd184e84400b0769413ac939334f89fe2bec37ad46a9f35d3cb6f2af90",
    "dsh-plugins/analytics-workbench/src/competition-agent/boundary.mjs": "c82ff0265110dc50b11a58e3d18ecaff3fe6661992c7c159313c7cb70414377c",
}


def _base(**extra):
    out = {
        "pack_version": PACK_VERSION,
        "metric_version": METRIC_VERSION,
        "code_baseline": CODE_BASELINE,
        "publication_status": PUBLICATION,
        "contains_real_data": False,
    }
    out.update(extra)
    return out


DOCUMENTS = [
    _base(
        id="doc.textbook.cst-pptx",
        type="DocumentVersion",
        title="私有 CRM 教材（仅引用索引）",
        nature="textbook_original",
        sha256=TEXTBOOK["sha256"],
        slides=TEXTBOOK["slides"],
        permission_scope="local_review_only",
        not_live_weknora=True,
    ),
    _base(
        id="doc.textbook.cst-ocr-2026-09-20",
        type="DocumentVersion",
        title="同一 PPT 的本机 OCR 表现",
        nature="textbook_ocr",
        sha256=TEXTBOOK["ocr_sha256"],
        ocr_status=TEXTBOOK["ocr_status"],
        same_source_as="doc.textbook.cst-pptx",
        note="OCR 与原件是同一来源的不同表现，不算两份独立证据。不根据 OCR 猜测解决冲突。",
        not_live_weknora=True,
    ),
    _base(
        id="doc.decisions.json",
        type="DocumentVersion",
        title="口径决议",
        nature="confirmed_decisions",
        sha256=SNAPSHOT["decisions_sha256"],
        path="docs/crm-calibration/decisions.json",
    ),
    _base(
        id="doc.metric-reconciliation",
        type="DocumentVersion",
        title="指标核对表",
        nature="reconciliation",
        sha256=SNAPSHOT["reconciliation_sha256"],
        path="docs/crm-calibration/metric-reconciliation.md",
    ),
    _base(
        id="doc.knowledge-graph-design",
        type="DocumentVersion",
        title="CRM 知识图谱设计",
        nature="design",
        sha256=SNAPSHOT["knowledge_graph_design_sha256"],
        path="docs/crm-calibration/knowledge-graph-design.md",
    ),
    _base(
        id="doc.a-contract.crm-metrics-v1",
        type="DocumentVersion",
        title="A 线合同 crm-metrics/v1（只读引用）",
        nature="wire_contract",
        sha256=A_CONTRACT["sha256"],
        path=A_CONTRACT["path"],
        implementation_status="not_implemented",
        note="C 不复制或改写合同公式。文件存在不等于验收通过。",
    ),
    _base(
        id="doc.a-semantic.crm-metrics-v1",
        type="DocumentVersion",
        title="A 线 semantic 计算模块指纹",
        nature="a_candidate_engine",
        sha256=A_CONTRACT["semantic_sha256"],
        path=A_CONTRACT["semantic_path"],
        implementation_status="not_implemented",
        c_verification="not_run",
        note="只记录 SHA。C 未运行 A 测试，不宣称 synthetic_verified 或真实对账。",
    ),
]

for path, sha in CODE_SHA.items():
    DOCUMENTS.append(
        _base(
            id=f"doc.code.{path.replace('/', '.').replace('.', '_')}"[:120],
            type="DocumentVersion",
            title=f"源码快照 {path}",
            nature="code_snapshot",
            path=path,
            sha256=sha,
        )
    )

# Stable document ids for frequently cited code.
DOC_OVERVIEW = "doc.code.overview"
DOC_CATEGORY = "doc.code.category_overview"
DOC_COMPETITION = "doc.code.competition_compute"
DOC_SAMPLING = "doc.code.sampling"
DOC_LTV = "doc.code.ltv"
DOC_VISITOR = "doc.code.visitor"
DOC_CALC = "doc.code.calculations"
DOC_BASKET = "doc.code.basket"
DOC_REPURCHASE = "doc.code.category_repurchase"
DOC_SEGMENTS = "doc.code.segments"
DOC_CONTRACT_METRICS = "doc.code.contract_metrics"
DOC_ETL = "doc.code.etl_load"
DOC_INIT = "doc.code.db_init"
DOC_RFM_CACHE = "doc.code.rfm_cache"

# Override generated ids for the files we cite by short name.
_SHORT_DOCS = {
    "backend/services/metrics/overview.py": DOC_OVERVIEW,
    "backend/services/category_service/overview.py": DOC_CATEGORY,
    "backend/services/metrics/competition_compute.py": DOC_COMPETITION,
    "backend/services/sampling_service.py": DOC_SAMPLING,
    "backend/services/lifetime_value_service.py": DOC_LTV,
    "backend/services/visitor_service.py": DOC_VISITOR,
    "backend/semantic/calculations.py": DOC_CALC,
    "backend/services/category_service/basket.py": DOC_BASKET,
    "backend/services/category_service/repurchase/standard.py": DOC_REPURCHASE,
    "backend/semantic/segments.py": DOC_SEGMENTS,
    "backend/contracts/metrics.py": DOC_CONTRACT_METRICS,
    "scripts/etl/load.py": DOC_ETL,
    "backend/db/init.py": DOC_INIT,
    "backend/services/rfm/cache.py": DOC_RFM_CACHE,
}
for doc in DOCUMENTS:
    path = doc.get("path")
    if path in _SHORT_DOCS:
        doc["id"] = _SHORT_DOCS[path]


DECISIONS = [
    {"id": "D001", "topic": "客单价与每单金额", "status": "confirmed", "answer": "客单价按购买人数（AUS），每单金额（AOV）单列。", "scope": "命名与分母原则", "implementation_status": "not_implemented", "remaining_dependencies": ["有效购买、身份去重、金额和时间范围"]},
    {"id": "D002", "topic": "会员溢价比较对象", "status": "confirmed", "answer": "会员人均消费额 ÷ 非会员人均消费额。", "scope": "AUS 比较对象", "implementation_status": "not_implemented", "remaining_dependencies": ["会员历史映射、可比范围、显示单位"]},
    {"id": "D003", "topic": "GSV 部分退款", "status": "confirmed", "answer": "计入扣实际退款后的余额：100 元退30元计70元，全退计0元。", "scope": "金额原则", "implementation_status": "not_implemented", "remaining_dependencies": ["源金额是否已净额", "退款事件、日期和商品关联"]},
    {"id": "D004", "topic": "新老客分界", "status": "confirmed", "answer": "默认按所选窗口起点划分，月报按月初。", "scope": "分类截点", "implementation_status": "not_implemented", "remaining_dependencies": ["全店首购历史完整度和有效购买版本"]},
    {"id": "D005", "topic": "跨期退款", "status": "confirmed", "answer": "同时保留原订单期净额与退款发生期视图；运营默认回算原订单月份，并显示退款截止日。", "scope": "报告视图和运营默认", "implementation_status": "not_implemented", "remaining_dependencies": ["带日期成功退款事件和数据截止"]},
    {"id": "D006", "topic": "GSV 有效人数与订单", "status": "confirmed", "answer": "部分退款仍算有效购买，全退订单排除；用户若还有其他有效订单仍算购买人数。", "scope": "有效购买计数", "implementation_status": "not_implemented", "remaining_dependencies": ["订单完整净额、去重身份和其他排除规则"]},
    {"id": "D007", "topic": "购买频次与件数", "status": "confirmed", "answer": "频次按去重有效订单，同一订单多行只算一次；人均件数除人数、每单件数IPT除订单数；没有退件数量不猜净件数。", "scope": "频次粒度与件数名称", "implementation_status": "not_implemented", "remaining_dependencies": ["有效件数与退件字段映射；不能由退款金额推断退件数量"]},
    {"id": "D008", "topic": "商品招新、连带、回购", "status": "confirmed", "answer": "商品招新人数占比和新客金额占比分列；人数连带与订单连带分列；商品回购分子限定历史买过该商品者再次购买。", "scope": "商品指标名称、分母与历史集合约束", "implementation_status": "not_implemented", "remaining_dependencies": ["SKU/SPU/品类层级、相同筛选范围"]},
    {"id": "D009", "topic": "派样观察起点", "status": "confirmed", "answer": "支付后开始跟踪观察。", "scope": "派样主观察起点", "implementation_status": "not_implemented", "remaining_dependencies": ["样品与派样订单识别规则的真实源映射", "支付事件时间精度"]},
    {"id": "D010", "topic": "观察窗口和成熟度", "status": "confirmed", "answer": "按自然日，起点当天算第1天，第N天结束后比较；未满观察期单列，不计入最终复购率，同一订单不算再次购买。", "scope": "派样及新客N日窗口和成熟度", "implementation_status": "not_implemented", "window_spec": "业务时区；第1天为起点日期，第N天为起点日期+N-1；窗口结束为第N天次日00:00（不含）。仅纳入起点事件之后的其他有效订单。", "remaining_dependencies": ["起点时间精度、同时间戳事件顺序、业务时区与数据完整截止时刻"]},
    {"id": "D011", "topic": "派样 ROI 名称", "status": "confirmed", "answer": "保留名称“派样 ROI”，显著注明当前只是复购收入表现；不当作已算出的利润回报或因果增量。", "scope": "名称与解释边界", "implementation_status": "not_implemented", "remaining_dependencies": ["展示显著说明和导出一致；利润ROI/ROAS另需成本/利润/归因合同"]},
    {"id": "D012", "topic": "LTV/cohort 后续收入", "status": "confirmed", "answer": "默认新客首次有效支付起N日累计净消费，包含首单、统计全店后续购买、区分成熟度；旧指定日期购买者次日起收入单独命名。", "scope": "LTV目标定义与旧指标区分", "implementation_status": "not_implemented", "remaining_dependencies": ["首购历史和退款截止"]},
    {"id": "D013", "topic": "商品退款分配", "status": "confirmed", "answer": "优先真实退款明细；缺失时只报整单净额，受影响商品净额暂不可用，不做比例估算。", "scope": "退款无法定位商品时的能力边界", "implementation_status": "not_implemented", "remaining_dependencies": ["真实退款行关联和完整性"]},
    {"id": "D014", "topic": "会员消费归组时点", "status": "confirmed", "answer": "按每笔成交当时身份，入会前后分别归组；历史身份缺失单列未知。", "scope": "会员/非会员消费比较", "implementation_status": "not_implemented", "remaining_dependencies": ["交易时点会员事件映射", "新/老会员存量与转化仍须首次入会数据"]},
    {"id": "D015", "topic": "UV 与入会率", "status": "confirmed", "answer": "保留并明确标日UV累计口径；周期去重转化另列，数据不具备时说明。", "scope": "访客入会率名称与分母边界", "implementation_status": "not_implemented", "remaining_dependencies": ["访问身份或原生周期 UV，入会/绑卡事件"]},
    {"id": "D016", "topic": "同比日历与 RFM 阈值", "status": "confirmed", "answer": "同比按去年同日；2月29日对应去年2月28日，显示实际区间；活动可另选对比期；RFM保留现有阈值版本并标实际天数，不直接换教材阈值。", "scope": "同比日历与RFM阈值保留原则", "implementation_status": "not_implemented", "remaining_dependencies": ["时间区间实现与闰日样例、阈值版本登记和后续品类适配验证"]},
    {"id": "D017", "topic": "数值单位", "status": "confirmed", "answer": "占比0.25显示25%，占比变化0.05显示5个百分点，会员溢价显示倍数；在合同中明确单位并核对调用方。", "scope": "比例、百分点和倍数展示", "implementation_status": "not_implemented", "remaining_dependencies": ["旧服务/合同/调用方逐字段适配"]},
    {"id": "D018", "topic": "未知状态与分解", "status": "confirmed", "answer": "未知身份单列；无法计算显示—和原因，不填0；新客+老客+未知与同口径总额闭合。", "scope": "空值、未知与总额分解", "implementation_status": "not_implemented", "remaining_dependencies": ["真实数据缺失率、覆盖阈值和显示验证"]},
    {"id": "D019", "topic": "真实源字段、金额、渠道与过滤", "status": "awaiting_source_verification", "proposal": "登记粒度、原金额是否已扣退款、货币、税运费/优惠、赠品/购物金/关闭订单、渠道展开与键；TTL去重重算。", "implementation_status": "not_implemented", "remaining_dependencies": ["实际目标与锁兼容确认后，只读schema及有界数据核验"], "note": "不是请用户猜字段；尚未连接真实源。不得用 OCR 或模型猜测关闭。"},
    {"id": "D020", "topic": "默认首购历史范围", "status": "confirmed", "answer": "默认全店新老客，渠道新客和商品新客另列；历史不足注明可见历史首次购买。", "scope": "业务分类范围", "implementation_status": "not_implemented", "remaining_dependencies": ["店铺/平台身份命名空间和全店历史覆盖；全退重算遵循D021"]},
    {"id": "D021", "topic": "全额退款后首购身份", "status": "confirmed", "answer": "按报告退款截止日重算首次有效购买，历史报告保留当时版本。", "scope": "全额退款对首购身份的影响", "implementation_status": "not_implemented", "remaining_dependencies": ["全历史退款事件和截止时点"]},
    {"id": "D022", "topic": "重复派样cohort归属", "status": "confirmed", "answer": "按人取统计期内第一笔派样，归属该笔渠道，避免重复计人。", "scope": "重复派样的默认起点与渠道归属", "implementation_status": "not_implemented", "remaining_dependencies": ["真实派样渠道与商品识别", "同时间戳的确定性排序及歧义处理", "cohort先归属再按渠道筛选的合同验证"]},
]

for d in DECISIONS:
    d.update(
        {
            "type": "Decision",
            "pack_version": PACK_VERSION,
            "metric_version": METRIC_VERSION,
            "code_baseline": CODE_BASELINE,
            "confirmed_by": "user" if d["status"] == "confirmed" else None,
            "layer": "target_definition" if d["status"] == "confirmed" else "awaiting_source_verification",
            "contains_real_data": False,
        }
    )

CONFIRMED_DECISION_IDS = [d["id"] for d in DECISIONS if d["status"] == "confirmed"]
assert len(CONFIRMED_DECISION_IDS) == 21
assert "D019" not in CONFIRMED_DECISION_IDS
