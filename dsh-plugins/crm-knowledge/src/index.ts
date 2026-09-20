import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { schemas } from './contract.generated.js';
import { runCrmCliAsync } from './run.mjs';
import { CHANNELS, dashboardCapabilities, dashboardKnowledgeContext, queryDashboardGsv } from './dashboard.mjs';
import type {} from './dashboard-service.js';

export const name = 'crm-knowledge-candidate';
export const inject = ['tools'];

export function apply(ctx: Context, config: { python?: string } = {}): void {
  const run = (payload: unknown, signal?: AbortSignal) => runCrmCliAsync(payload, signal, config.python);
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_gsv',
    description: '查询用户认可的现有人群看板 GSV 总额和日趋势，复用 CRM 登录及指标接口。真实 GSV 优先使用此工具；不能改用合成查询或再扣退款。日期含首尾、最多90天；同看板渠道及剔除低价条件。登录须由宿主绑定当前会话，失败不回退其他资料源。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期 YYYY-MM-DD，包含当天' },
      channel: { type: 'string', enum: [...CHANNELS], description: '看板渠道，默认全店' },
      exclude_low_price: { type: 'boolean', description: '看板的剔除低价开关，默认 false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      const access = ctx.get('crmDashboard');
      return access ? access.query(exec.agent?.session.id, args, exec.signal)
        : queryDashboardGsv(args, { sessionId: exec.agent?.session.id, signal: exec.signal });
    },
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_metrics_v1',
    description: '查询 CRM 合成候选资料的销售表现、老客回购和派样后复购。金额为 CNY 分；保留未知和不可用原因，不能当作真实业务结果。',
    parameters: { request: { ...schemas.request, required: true } },
    output: { schema: schemas.output, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 35000, isConcurrencySafe: () => true,
    execute: async (args, exec) => run({ action: 'query', request: args.request }, exec.signal),
  }));
  ctx.tools.register(defineTool({
    name: 'crm_knowledge_explain',
    description: '读取本地 CRM 知识包的已确认指标定义、决议、教材出处和离线依赖关系。区分目标口径与合成验证；此工具不查询在线图谱，也不代表其他指标已经完成真实业务验收。',
    parameters: { topic: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 35000, isConcurrencySafe: () => true,
    execute: async (args, exec) => {
      const target = await run({ action: 'explain', topic: args.topic }, exec.signal);
      if (/\baus\b|\baov\b|客单价|每单金额/i.test(args.topic)) {
        target.preferred_operational_definition = {
          decision: '用户2026-09-20确认：真实AUS、AOV沿用当前看板GSV，扣退款净额版单列。',
          aus: '当前看板GSV / 同范围去重有效购买人数', aov: '当前看板GSV / 同范围去重有效订单数',
          buyer_count_status: 'pending_complete_buyer_count_and_unknowns',
          warning: '不能用旧avg_order_value明细行均值当作AOV，也不能用缺少未知身份的新客+老客人数替代完整购买人数。',
          real_business_acceptance: false,
          target_candidate_note: '本结果其余definition/formula为单列的crm-metrics/v1净额候选，不替换此运营默认。',
        };
      }
      if (!/gsv|退款|实收|实付|净额/i.test(args.topic)) return target;
      return { preferred_real_gsv: dashboardKnowledgeContext(), target_candidate: target,
        instruction: '真实看板 GSV 采用 preferred_real_gsv；target_candidate 是单列净额候选，不能静默替换。' };
    },
  }));
  ctx.tools.register(defineTool({
    name: 'crm_metrics_capabilities',
    description: '列出此隔离候选可执行的 CRM 查询及未接入的真实资料能力。',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (_args, exec) => ({
      synthetic_candidate: await run({ action: 'capabilities' }, exec.signal),
      dashboard: ctx.get('crmDashboard')?.capabilities(exec.agent?.session.id) ?? dashboardCapabilities(),
    }),
  }));
}
