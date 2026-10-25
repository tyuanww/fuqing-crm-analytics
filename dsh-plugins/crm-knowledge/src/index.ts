import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { schemas } from './contract.generated.js';
import { createMetricsService, unavailableSchema } from './service-client.mjs';
import { CHANNELS, CHANNEL_QUERY_DESCRIPTION, dashboardCapabilities, queryDashboardGsv, queryDashboardPurchases,
  queryDashboardReadiness, queryDashboardMembership, queryDashboardNetGsv,
  queryProductCustomer, queryRfmSnapshot } from './dashboard.mjs';
import type {} from './dashboard-service.js';

type KnowledgeBaseHealth = {
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  execution: 'NOT_RUN';
  reason: string | null;
  provider: 'weknora' | 'legacy-crm-knowledge' | null;
  tools: string[];
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('CRM result contains a non-finite number');
    return value as JsonValue;
  }
  if (Array.isArray(value)) return value.map(item => jsonValue(item));
  if (typeof value === 'object') {
    const output: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) output[key] = jsonValue(item);
    }
    return output;
  }
  throw new TypeError(`CRM result contains unsupported value: ${typeof value}`);
}

export const name = 'crm-knowledge-candidate';
export const inject = ['tools'];

export function apply(ctx: Context, config: { metricsOrigin?: string; registerTools?: boolean } = {}): void {
  if (config.registerTools === false) return;
  const services = createMetricsService(config);
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'crm: cancel owned tool requests');
  async function owned<T>(caller: AbortSignal, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = AbortSignal.any([caller, lifetime.signal]);
    signal.throwIfAborted();
    const value = await action(signal);
    // A provider may finish after disposal even if it ignores cancellation.
    signal.throwIfAborted();
    return value;
  }
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_snapshot',
    description: '查询看板 GSV、AOV、AUS 及覆盖，并由 CRM 服务保存不可变的结果快照，供用户稍后保存分析、加入驾驶舱。仅接受日期/渠道/剔除低价；不接受模型提供的数字。需要当前对话 CRM 登录和独立快照存储；失败不回退合成资料。保存分析和驾驶舱引用由用户在 CRM 分析窗口确认。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期，含首尾、最多90天' },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '是否剔除低价，默认false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      const result = typeof access?.querySnapshot === 'function' ? await access.querySnapshot(exec.agent?.session.id, args, signal)
        : { ok: false, code: 'HOST_UPGRADE_REQUIRED', message: '当前宿主尚未加载 CRM 快照能力，请在维护窗口更新后重试。' };
      return { ok: result.ok, snapshot: 'value' in result ? result.value ?? null : null,
        code: 'code' in result ? result.code ?? null : null, message: 'message' in result ? result.message ?? null : null };
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_gsv',
    description: '查询用户认可的现有人群看板 GSV、日趋势，以及概览里已算出的新客和老客。真实 GSV 优先使用此工具；不能改用合成查询或再扣退款。audience 来自首购日，不是会员身份。会员溢价用 query_crm_dashboard_membership，净额用 query_crm_dashboard_net_gsv，指标缺口用 query_crm_dashboard_readiness。warehouse_cutoff 是仓库最后支付日。日期含首尾、最多90天。登录须由宿主绑定当前会话，失败不回退其他资料源。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期 YYYY-MM-DD，包含当天' },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '看板的剔除低价开关，默认 false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      const result = access ? await access.query(exec.agent?.session.id, args, signal)
        : await queryDashboardGsv(args, { sessionId: exec.agent?.session.id, signal });
      return jsonValue(result);
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_purchases',
    description: '查询看板口径的每单金额AOV、客单价AUS及订单/买家覆盖情况。金额分子沿用看板GSV；空值必须连同原因解释，不得用旧明细行均值、新老客人数或净额候选替代。需要新版CRM聚合接口和当前对话登录，日期最多90天。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期 YYYY-MM-DD，包含当天' },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '看板的剔除低价开关，默认 false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      const result = access ? await access.queryPurchases(exec.agent?.session.id, args, signal)
        : await queryDashboardPurchases(args, { sessionId: exec.agent?.session.id, signal });
      return jsonValue(result);
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_product_customer_cohorts',
    description: '查询任意已登记商品的新客、老客和会员拆分。产品映射到多个 SPU class 时按 user_id 去重，不把多个品类人数相加。公开结果只返回 display_name、覆盖状态和指标，原始商品身份留在 Host 内部。products 可传原始商品名或唯一 display_name。可省略 products 查询全部商品；日期最多90天。请求超过仓库数据截止日时返回 INSUFFICIENT_COVERAGE，不把未覆盖日期填零。真实业务查询必须使用当前对话的 CRM 登录。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期，含首尾、最多90天' },
      products: {
        type: 'array',
        items: { type: 'string' },
        description: '已登记商品名称，最多15个；省略时返回全部商品。不要猜测商品名。',
      },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '是否剔除低价渠道，默认 false' },
      compare_start_date: { type: 'string', description: '可选对比期开始日期 YYYY-MM-DD' },
      compare_end_date: { type: 'string', description: '可选对比期结束日期 YYYY-MM-DD' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 35000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      return typeof access?.queryProductCustomer === 'function'
        ? access.queryProductCustomer(exec.agent?.session.id, args, signal)
        : queryProductCustomer(args, { sessionId: exec.agent?.session.id, signal });
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_rfm_snapshot',
    description: '读取杭州预计算的 RFM 八象限加已购客TTL快照。缓存未命中或缓存不可用时明确返回不可用，不在 Web 请求内现场扫描业务库。返回当期/去年/前年、全店/本渠道/会员四组细分，并带稳定 snapshot_id 和仓库截止日。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期，含首尾、最多90天' },
      metric_type: { type: 'string', enum: ['GSV', 'GMV'], description: '金额口径，默认 GSV' },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '是否剔除低价渠道，默认 false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      return typeof access?.queryRfmSnapshot === 'function'
        ? access.queryRfmSnapshot(exec.agent?.session.id, args, signal)
        : queryRfmSnapshot(args, { sessionId: exec.agent?.session.id, signal });
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_metrics_v1',
    description: '查询 CRM 合成候选资料的销售表现、老客回购和派样后复购。金额为 CNY 分；保留未知和不可用原因，不能当作真实业务结果。',
    parameters: { request: { ...schemas.request, required: true } },
    output: { schema: { oneOf: [schemas.output, unavailableSchema] }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 35000, isConcurrencySafe: () => true,
    execute: async (args, exec) => owned(exec.signal, signal => services.query(args.request, signal)),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_readiness',
    description: '查询当前 CRM 连接下各指标的来源具备程度与 A/B/C 验收分类。只读元数据，不返回业务明细或 SQL。缺字段时保持不可用。',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      return access ? access.queryReadiness(exec.agent?.session.id, args, signal)
        : queryDashboardReadiness(args, { sessionId: exec.agent?.session.id, signal });
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_membership',
    description: '查询成交时会员溢价（会员AUS/非会员AUS）。需要成交时身份快照；不能用当前会员身份倒推。缺来源时返回不可用原因。日期含首尾、最多90天。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期 YYYY-MM-DD，包含当天' },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '看板的剔除低价开关，默认 false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      return access ? access.queryMembership(exec.agent?.session.id, args, signal)
        : queryDashboardMembership(args, { sessionId: exec.agent?.session.id, signal });
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_dashboard_net_gsv',
    description: '查询扣实际成功退款的净额GSV，与看板GSV分列。必须提供退款截止日；缺退款事件时不可用，不能用 is_refund 代替。',
    parameters: {
      start_date: { type: 'string', required: true, description: '开始日期 YYYY-MM-DD（Asia/Shanghai）' },
      end_date: { type: 'string', required: true, description: '结束日期 YYYY-MM-DD，包含当天' },
      refund_as_of: { type: 'string', required: true, description: '退款截止日 YYYY-MM-DD，含当天' },
      channel: { type: 'string', enum: [...CHANNELS], description: CHANNEL_QUERY_DESCRIPTION },
      exclude_low_price: { type: 'boolean', description: '看板的剔除低价开关，默认 false' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 30000, isConcurrencySafe: () => false,
    execute: async (args, exec) => owned(exec.signal, async signal => {
      const access = ctx.get('crmDashboard');
      return access ? access.queryNetGsv(exec.agent?.session.id, args, signal)
        : queryDashboardNetGsv(args, { sessionId: exec.agent?.session.id, signal });
    }),
  }));
  ctx.tools.register(defineTool({
    name: 'crm_metrics_capabilities',
    description: '列出当前可执行的 CRM 查询。purchases_backend_contract 只是合同名，不是故障。未调用的工具状态是 unknown，不能写成后端不可用。',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (_args, exec) => owned(exec.signal, async signal => ({
      synthetic_candidate: await services.capabilities(signal),
      dashboard: ctx.get('crmDashboard')?.capabilities(exec.agent?.session.id) ?? dashboardCapabilities(),
    })),
  }));
  ctx.tools.register(defineTool({
    name: 'crm_service_health',
    description: '查看当前对话是否已连接 CRM，以及 Purchases、快照、知识库、驾驶舱工具各自的真实状态。没有调用结果时保持 unknown。知识库在 18092，不提供 GSV 或驾驶舱接口。',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (_args, exec) => owned(exec.signal, async () => {
      const dashboard = ctx.get('crmDashboard')?.capabilities(exec.agent?.session.id) ?? dashboardCapabilities();
      const pageTool = ctx.tools.get('free_html_page_generate', exec.agent);
      const boardTool = ctx.tools.get('competition_board_catalog', exec.agent);
      const weknoraSearch = ctx.tools.get('weknora_search', exec.agent);
      const weknoraRead = ctx.tools.get('weknora_read_document', exec.agent);
      const legacyKnowledge = ctx.tools.get('query_crm_knowledge_sources', exec.agent);
      const knowledgeBase: KnowledgeBaseHealth = weknoraSearch && weknoraRead
        ? { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null, provider: 'weknora',
            tools: ['weknora_search', 'weknora_read_document'] }
        : legacyKnowledge
          ? { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null, provider: 'legacy-crm-knowledge', tools: [] }
          : { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'KNOWLEDGE_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE',
              provider: null, tools: [] };
      return {
        crm_login: typeof dashboard.connection_state === 'string' ? dashboard.connection_state : 'NOT_CONNECTED',
        gsv: 'unknown_until_query_crm_dashboard_gsv_is_called',
        purchases: 'unknown_until_query_crm_dashboard_purchases_is_called',
        product_customer: 'unknown_until_query_crm_product_customer_cohorts_is_called',
        rfm_snapshot: 'unknown_until_query_crm_rfm_snapshot_is_called',
        snapshot: 'unknown_until_query_crm_dashboard_snapshot_is_called',
        knowledge_base: knowledgeBase,
        synthetic_services: services.availability(),
        knowledge_explanation: ctx.tools.get('crm_knowledge_explain', exec.agent)
          ? { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null }
          : { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'KNOWLEDGE_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE' },
        page_delivery: pageTool
          ? { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null }
          : { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'PAGE_PROVIDER_NOT_INSTALLED_OR_NOT_VISIBLE' },
        board_tools: boardTool
          ? { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null }
          : { status: 'NOT_AVAILABLE', execution: 'NOT_RUN', reason: 'BOARD_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE' },
        absent_names: ['copyright'],
      };
    }),
  }));
}
