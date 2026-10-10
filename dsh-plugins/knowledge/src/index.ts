import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createKnowledgeService } from './service-client.mjs';
import { dashboardDefinition } from './dashboard-definition.generated.mjs';

export const name = 'shinemage-knowledge';
export const inject = ['tools'];

export function apply(ctx: Context, config: { knowledgeOrigin?: string } = {}): void {
  const services = createKnowledgeService(config);
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'knowledge: cancel owned explanation requests');
  ctx.tools.register(defineTool({
    name: 'crm_knowledge_explain',
    description: '通过独立知识服务读取公开合成知识包的已确认指标定义、决议、教材出处和离线依赖关系。服务未配置时返回 NOT_AVAILABLE。区分目标口径与合成验证；此工具不查询在线图谱，也不代表真实业务验收。',
    parameters: { topic: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 35000, isConcurrencySafe: () => true,
    execute: async (args, exec) => {
      const signal = AbortSignal.any([exec.signal, lifetime.signal]);
      signal.throwIfAborted();
      const target = await services.explain(args.topic, signal);
      signal.throwIfAborted();
      if (target.status === 'NOT_AVAILABLE') return target;
      if (/\baus\b|\baov\b|客单价|每单金额/i.test(args.topic)) {
        target.preferred_operational_definition = {
          decision: '用户2026-09-20确认：真实AUS、AOV沿用当前看板GSV，扣退款净额版单列。',
          aus: '当前看板GSV / 同范围去重有效购买人数', aov: '当前看板GSV / 同范围去重有效订单数',
          buyer_count_status: 'query_crm_dashboard_purchases_returns_coverage_requires_backend_deployment',
          warning: '不能用旧avg_order_value明细行均值当作AOV，也不能用缺少未知身份的新客+老客人数替代完整购买人数。',
          real_business_acceptance: false,
          target_candidate_note: '本结果其余definition/formula为单列的crm-metrics/v1净额候选，不替换此运营默认。',
        };
      }
      if (/会员溢价|member.?premium/i.test(args.topic)) {
        target.preferred_operational_definition = {
          formula: '成交时会员AUS / 非会员AUS', tool: 'query_crm_dashboard_membership',
          warning: '不能用当前 is_member 倒推历史；缺成交时快照或入会/退会事件时返回不可用。',
        };
      }
      if (/净额|net.?gsv|实际退款/i.test(args.topic)) {
        target.preferred_operational_definition = {
          formula: '有效实付 − 截止日前成功退款', tool: 'query_crm_dashboard_net_gsv',
          warning: '与看板GSV分列；不能对看板结果再扣退款。缺退款事件时不可用。',
        };
      }
      if (!/gsv|退款|实收|实付|净额/i.test(args.topic)) return target;
      return { preferred_real_gsv: structuredClone(dashboardDefinition), target_candidate: target,
        instruction: '真实看板 GSV 采用 preferred_real_gsv；target_candidate 是单列净额候选，不能静默替换。' };
    },
  }));
}
