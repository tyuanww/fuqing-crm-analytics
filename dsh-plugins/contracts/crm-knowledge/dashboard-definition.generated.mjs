// Generated from dsh-plugins/crm-knowledge/contracts/dashboard-definition.v1.mjs; do not edit.
// source_sha256: 91947e554e9b05571a069e2dc5f5f1427c08f57b93a939882dbec9a1b0c646d8
/** CRM owns this read-only semantic definition; no account data or runtime. */
export const dashboardDefinition = {
    metric_version: 'dashboard-gsv/observed-v1',
    default_for_real_gsv: 'query_crm_dashboard_gsv',
    definition: '复用现有人群看板：按支付日汇总 actual_amount，排除购物金、交易关闭及 is_refund=TRUE 的明细，再应用相同渠道和剔除低价筛选。',
    accepted_baseline: '用户已确认现有看板 GSV 为接入基准；此处不公开私有业务金额。',
    difference_from_target: 'crm-metrics/v1 的扣实际退款净额仍是单列候选。现看板会排除被标记退款的明细，不能将两者等同，不能对看板结果再扣退款。',
    refund_as_of_supported: false,
    other_metrics_calibrated: false,
    source_refs: ['backend/semantic/calculations.py', 'backend/services/metrics/overview.py', 'docs/crm-calibration/public-release.md'],
  };
