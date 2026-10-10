"""Public knowledge explanations. No metrics engine, database, DSH or archive imports."""
from typing import Any

METRIC_VERSION = "crm-metrics/v1"
QUERY_SALES = "sales_window_summary"
QUERY_REPURCHASE = "existing_customer_repurchase"
QUERY_SAMPLE = "sample_followup"

EXPLAIN_TOPICS: dict[str, dict[str, Any]] = {
    "aus": {
        "formula": "同范围净额 / 去重已识别购买人数",
        "unit": "minor_per_buyer",
        "decision_ids": ["D001", "D006", "D018"],
        "evidence_refs": ["decision:D001", "ppt:slide:160", "contract:crm-metrics/v1"],
        "conflicts": ["旧 overview.avg_order_value 为明细行均，不是 AUS"],
        "capabilities": [QUERY_SALES],
        "missing": [],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "aov": {
        "formula": "同范围净额 / 去重有效订单数",
        "unit": "minor_per_order",
        "decision_ids": ["D001", "D006"],
        "evidence_refs": ["decision:D001", "contract:crm-metrics/v1"],
        "conflicts": ["不得用行均冒充客单价或每单金额"],
        "capabilities": [QUERY_SALES],
        "missing": [],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "member_premium": {
        "formula": "会员 AUS / 非会员 AUS（倍数）",
        "unit": "multiple",
        "decision_ids": ["D002", "D014", "D017"],
        "evidence_refs": ["decision:D002", "ppt:slide:161", "contract:crm-metrics/v1"],
        "conflicts": ["1.2 倍不是高 120%；高 20% 是 (1.2-1)"],
        "capabilities": [QUERY_SALES],
        "missing": ["真实成交时会员事件映射"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "gsv": {
        "formula": "实付 - 截至 refund_as_of 的成功退款；部分退保留有效购买，全退订单净额 0 且不计有效单",
        "unit": "minor",
        "decision_ids": ["D003", "D005", "D006"],
        "evidence_refs": ["decision:D003", "contract:crm-metrics/v1"],
        "conflicts": ["GSV_PREDICATE 排除全部 is_refund，与部分退净额原则不同"],
        "capabilities": [QUERY_SALES],
        "missing": ["D019 金额是否已净额"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "new_old": {
        "formula": "按窗口起点与全店首次有效购买比较；按报告退款截止重算；历史报告保留版本",
        "unit": None,
        "decision_ids": ["D004", "D018", "D020", "D021"],
        "evidence_refs": ["decision:D004", "decision:D021", "contract:crm-metrics/v1"],
        "conflicts": ["品类页用月初 cutoff 且 cutoff 当天算新客"],
        "capabilities": [QUERY_SALES, QUERY_REPURCHASE],
        "missing": ["真实全店历史覆盖"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "sample_followup": {
        "formula": "支付日起自然日观察；第1天=支付日；成熟后比较；每人第一笔派样归属渠道",
        "unit": "raw_ratio_0_1",
        "decision_ids": ["D009", "D010", "D011", "D022"],
        "evidence_refs": ["decision:D010", "decision:D011", "contract:crm-metrics/v1"],
        "conflicts": ["派样 ROI 名称保留但不是利润 ROI"],
        "capabilities": [QUERY_SAMPLE],
        "missing": ["真实派样资格映射"],
        "definition_review_status": "principles_confirmed_mapping_pending",
    },
    "new_member_conversion": {
        "formula": None,
        "unit": None,
        "decision_ids": ["D015", "D014"],
        "evidence_refs": ["decision:D015", "kg:DataRequirement:first_join_event"],
        "conflicts": ["订单 is_member 不能替代首次入会事件"],
        "capabilities": [],
        "missing": ["首次入会事件", "观察期成熟 cohort"],
        "definition_review_status": "principles_confirmed_mapping_pending",
        "implementation_status_override": "source_unverified",
    },
}


def explain_topic(topic: str) -> dict[str, Any]:
    key = topic.strip().lower()
    aliases = {
        "客单价": "aus",
        "每单金额": "aov",
        "会员溢价": "member_premium",
        "派样roi": "sample_followup",
        "派样": "sample_followup",
        "新老客": "new_old",
        "新会员转化": "new_member_conversion",
        "部分退款": "gsv",
        "gsv": "gsv",
    }
    resolved = aliases.get(key, key)
    spec = EXPLAIN_TOPICS.get(resolved)
    if spec is None:
        return {
            "topic": topic,
            "metric_version": METRIC_VERSION,
            "definition_review_status": "unknown_topic",
            "implementation_status": "not_implemented",
            "unit": None,
            "formula": None,
            "decision_ids": [],
            "evidence_refs": ["contract:crm-metrics/v1"],
            "conflicts": [],
            "capabilities": [],
            "missing": [f"无主题 {topic}"],
            "synthetic": True,
            "publication_status": "local_isolated_candidate",
        }
    return {
        "topic": resolved,
        "metric_version": METRIC_VERSION,
        "definition_review_status": spec["definition_review_status"],
        "implementation_status": spec.get("implementation_status_override") or "synthetic_verified",
        "unit": spec["unit"],
        "formula": spec["formula"],
        "decision_ids": spec["decision_ids"],
        "evidence_refs": spec["evidence_refs"],
        "conflicts": spec["conflicts"],
        "capabilities": spec["capabilities"],
        "missing": spec["missing"],
        "synthetic": True,
        "publication_status": "local_isolated_candidate",
        "real_business_acceptance": False,
        "code_fixed_in_legacy_services": False,
    }
