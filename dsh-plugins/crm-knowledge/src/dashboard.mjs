/** Read the accepted dashboard through its authenticated API. No DB/SQL fallback. */
export const CHANNELS = Object.freeze(['全店', '纯派样', '货架', '达播', '直播', '淘客', '微博', 'U先派样', '百补派样', '赠品&0.01', '其他']);
export const LOW_PRICE_CHANNELS = Object.freeze(['U先派样', '百补派样', '赠品&0.01', '其他']);
const VERSION = 'dashboard-gsv/observed-v1';
const MAX_BYTES = 256 * 1024;
const DAY = 86400000;
const MESSAGES = Object.freeze({
  INVALID_REQUEST: '请提供真实的起止日期（含首尾、最多90天）、看板渠道及是否剔除低价；不接受 SQL、地址、凭据或退款截止日。',
  NOT_CONNECTED: '当前对话尚未连接 CRM，请点击对话中的“连接 CRM”。不要在聊天中发送密码或令牌。',
  SESSION_NOT_BOUND: '当前 DSH 会话没有此 CRM 登录的授权绑定。',
  INVALID_BINDING: 'CRM 宿主连接配置无效；仅支持固定回环地址及明确的账号、会话绑定。',
  AUTH_EXPIRED: 'CRM 登录缺失或已过期，需要在宿主重新登录绑定。',
  ACCESS_DENIED: 'CRM 服务拒绝此次访问。',
  ACCOUNT_MISMATCH: 'CRM 登录账号与宿主绑定账号不一致。',
  SERVICE_BUSY: 'CRM 服务当前被占用，请稍后重试。',
  UPSTREAM_ERROR: 'CRM 服务未能返回有效结果；没有改用其他资料源。',
  INVALID_RESPONSE: 'CRM 返回内容不符合看板 GSV 合同，未输出业务金额。',
  INCONSISTENT_RESULT: '看板概览与日趋势金额不一致，未输出业务金额，请核对数据版本或接口。',
  DATA_WARNING: 'CRM 接口返回数据警告，本次结果暂不可用；请在看板核对查询区间与数据水位。',
  TIMEOUT: 'CRM 查询超时；未自动重试。',
  CANCELLED: 'CRM 查询已取消。',
});
class DashboardError extends Error {
  constructor(code) { super(MESSAGES[code]); this.code = code; }
}
const fail = code => { throw new DashboardError(code); };

export function dashboardKnowledgeContext() {
  return {
    metric_version: VERSION,
    default_for_real_gsv: 'query_crm_dashboard_gsv',
    definition: '复用现有人群看板：按支付日汇总 actual_amount，排除购物金、交易关闭及 is_refund=TRUE 的明细，再应用相同渠道和剔除低价筛选。',
    accepted_baseline: '用户已确认现有看板 GSV 为接入基准；此处不公开私有业务金额。',
    difference_from_target: 'crm-metrics/v1 的扣实际退款净额仍是单列候选。现看板会排除被标记退款的明细，不能将两者等同，不能对看板结果再扣退款。',
    refund_as_of_supported: false,
    other_metrics_calibrated: false,
    source_refs: ['backend/semantic/calculations.py', 'backend/services/metrics/overview.py', 'docs/crm-calibration/public-release.md'],
  };
}

export function dashboardCapabilities(connectionState = 'NOT_CONNECTED') {
  return {
    tool: 'query_crm_dashboard_gsv', metric_version: VERSION,
    connection_state: connectionState,
    authentication_checked_on_each_query: true, max_days: 90,
    saved_analysis: { capture_tool: 'query_crm_dashboard_snapshot', schema_version: 'crm-result-snapshot/v1',
      scope: 'private_crm_account', saves_require_user_confirmation: true, store_configuration_required: true },
    fields: ['gsv_amount', 'daily_gsv'], purchases_tool: 'query_crm_dashboard_purchases', purchases_requires_backend: 'crm-dashboard-purchases/v1', channels: [...CHANNELS],
    readiness_tool: 'query_crm_dashboard_readiness', membership_tool: 'query_crm_dashboard_membership',
    net_gsv_tool: 'query_crm_dashboard_net_gsv',
    definition: dashboardKnowledgeContext(),
    note: '仅在登录页面连接当前对话；请求时重新验证 CRM 登录。会员溢价与净额GSV缺来源时返回不可用，不使用当前 is_member 或行上退款标记代替。',
  };
}

function parseDate(value, code) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail(code);
  const result = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) fail(code);
  return result;
}

export function validateBinding(binding, sessionId) {
  if (!binding) fail('NOT_CONNECTED');
  if (!sessionId || binding.sessionId !== sessionId) fail('SESSION_NOT_BOUND');
  if (typeof binding.token !== 'string' || !binding.token || binding.token.length > 8192 || /\s/.test(binding.token) ||
      typeof binding.username !== 'string' || !binding.username || !['real', 'synthetic'].includes(binding.dataKind)) fail('INVALID_BINDING');
  return dashboardOrigin(binding.baseUrl);
}

export function dashboardOrigin(value) {
  let base;
  try { base = new URL(value); } catch { fail('INVALID_BINDING'); }
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname) ||
      base.username || base.password || base.search || base.hash || base.pathname !== '/') fail('INVALID_BINDING');
  return base.origin;
}

function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_RESPONSE');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) fail('INVALID_RESPONSE');
  const result = (BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))) * (match[1] ? -1n : 1n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) fail('INVALID_RESPONSE');
  return Number(result);
}
function money(amount) {
  const absolute = BigInt(amount) < 0n ? -BigInt(amount) : BigInt(amount);
  return { amount_fen: amount, amount_yuan: `${amount < 0 ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`, currency: 'CNY' };
}
function projectAverage(item) {
  if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.denominator) || item.denominator < 0) fail('INVALID_RESPONSE');
  if (item.reason) {
    if (item.amount_fen !== null) fail('INVALID_RESPONSE');
    return { amount_fen: null, amount_yuan: null, currency: 'CNY', denominator: item.denominator, reason: item.reason };
  }
  if (!Number.isSafeInteger(item.amount_fen) || item.denominator === 0) fail('INVALID_RESPONSE');
  return { ...money(item.amount_fen), denominator: item.denominator, reason: null };
}

/** Never forwards arbitrary upstream fields, error bodies, headers, or credentials. */
export function normalizeDashboard(overview, trend, filters, dataKind) {
  if (!overview || !trend || overview.metric_type !== 'GSV' || trend.metric_type !== 'GSV' ||
      overview.date_range?.start !== filters.start_date || overview.date_range?.end !== filters.end_date ||
      !Array.isArray(trend.dates) || !Array.isArray(trend.amounts) || trend.dates.length !== trend.amounts.length || trend.dates.length > 90) fail('INVALID_RESPONSE');
  const amount = cents(overview.amount);
  let previous = '';
  let sum = 0n;
  const daily = trend.dates.map((date, index) => {
    parseDate(date, 'INVALID_RESPONSE');
    if (date < filters.start_date || date > filters.end_date || date <= previous) fail('INVALID_RESPONSE');
    previous = date;
    const value = cents(trend.amounts[index]); sum += BigInt(value);
    return { date, ...money(value) };
  });
  if (sum !== BigInt(amount)) fail('INCONSISTENT_RESULT');
  const dates = new Set(trend.dates);
  const missing = [];
  for (let date = parseDate(filters.start_date, 'INVALID_REQUEST'); date <= parseDate(filters.end_date, 'INVALID_REQUEST'); date += DAY) {
    const text = new Date(date).toISOString().slice(0, 10);
    if (!dates.has(text)) missing.push(text);
  }
  return {
    status: 'OK', schema_version: 'crm-dashboard-read/v1', metric_version: VERSION,
    source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real', synthetic: dataKind === 'synthetic',
    filters: { ...filters, metric_type: 'GSV', timezone: 'Asia/Shanghai', end_inclusive: true, exclude_channels: filters.exclude_low_price ? [...LOW_PRICE_CHANNELS] : [] },
    gsv: money(amount), daily, reconciliation: { daily_sum_matches: true, dates_not_returned: missing },
    data_through: null, refund_as_of: null, backend_version_verified: false,
    limitations: ['仅接入现看板 GSV；没有输出或校准客单价、会员溢价及同比。', '接口没有返回可确认的数据水位或退款截止日。', '日趋势未返回的日期不补0；不能区分无成交与资料缺失。', '概览与趋势为两次请求，并非数据库快照；一致性校验仅覆盖金额。'],
    definition: dashboardKnowledgeContext(),
  };
}

async function getJson(base, path, params, binding, signal) {
  const url = new URL(path, base);
  url.search = params.toString();
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${binding.token}`, Accept: 'application/json' } });
  try {
    if (response.status === 401) fail('AUTH_EXPIRED');
    if (response.status === 403) fail('ACCESS_DENIED');
    if (response.status === 409 || response.status === 423 || response.status === 429) fail('SERVICE_BUSY');
    if (!response.ok) fail('UPSTREAM_ERROR');
    if (response.headers.has('x-data-warning')) fail('DATA_WARNING');
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) fail('INVALID_RESPONSE');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) fail('INVALID_RESPONSE');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BYTES) fail('INVALID_RESPONSE');
      chunks.push(Buffer.from(chunk));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('INVALID_RESPONSE'); }
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}

/** Trusted options are supplied by the host, not included in the tool parameter schema. */
async function queryDashboard(input, options, purchases = false) {
  const { sessionId, signal, binding = null, timeoutMs = 25000 } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combined.throwIfAborted();
    const filters = validateRequest(input);
    const base = validateBinding(binding, sessionId);
    const me = await getJson(base, '/api/v1/auth/me', new URLSearchParams(), binding, combined);
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    if (purchases) {
      const params = new URLSearchParams({ ...filters, exclude_low_price: String(filters.exclude_low_price) });
      const aggregate = await getJson(base, '/api/v1/metrics/dashboard-purchases', params, binding, combined);
      combined.throwIfAborted();
      return normalizePurchases(aggregate, filters, binding.dataKind);
    }
    const params = new URLSearchParams({ start_date: filters.start_date, end_date: filters.end_date, metric_type: 'GSV' });
    if (filters.channel !== '全店') params.set('channel', filters.channel);
    if (filters.exclude_low_price) for (const channel of LOW_PRICE_CHANNELS) params.append('exclude_channels', channel);
    const overview = await getJson(base, '/api/v1/metrics/overview', params, binding, combined);
    const trend = await getJson(base, '/api/v1/metrics/trend', params, binding, combined);
    combined.throwIfAborted();
    return normalizeDashboard(overview, trend, filters, binding.dataKind);
  } catch (error) {
    let code = 'UPSTREAM_ERROR';
    if (signal?.aborted) code = 'CANCELLED';
    else if (timeout.aborted) code = 'TIMEOUT';
    else if (error instanceof DashboardError) code = error.code;
    return { status: 'UNAVAILABLE', schema_version: purchases ? 'crm-dashboard-purchases/v1' : 'crm-dashboard-read/v1', metric_version: purchases ? 'dashboard-gsv-purchases/v1' : VERSION, reason: { code, message: MESSAGES[code] } };
  }
}


export const queryDashboardGsv = (input, options = {}) => queryDashboard(input, options);
export const queryDashboardPurchases = (input, options = {}) => queryDashboard(input, options, true);

const NAMED = Object.freeze({
  '/api/v1/metrics/dashboard-readiness': ['crm-dashboard-readiness/v1', 'dashboard-readiness/v1'],
  '/api/v1/metrics/dashboard-membership': ['crm-dashboard-membership/v1', 'dashboard-member-premium/v1'],
  '/api/v1/metrics/dashboard-net-gsv': ['crm-dashboard-net-gsv/v1', 'dashboard-net-gsv/v1'],
});

async function queryNamed(input, options, path, extraKeys, normalize) {
  const { sessionId, signal, binding = null, timeoutMs = 25000 } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const [schema, version] = NAMED[path];
  try {
    combined.throwIfAborted();
    const base = validateBinding(binding, sessionId);
    const me = await getJson(base, '/api/v1/auth/me', new URLSearchParams(), binding, combined);
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    let filters = null;
    const params = new URLSearchParams();
    if (path.includes('readiness')) {
      if (input && typeof input === 'object' && Object.keys(input).length) fail('INVALID_REQUEST');
    } else {
      filters = validateRequest(input, extraKeys);
      if (extraKeys.includes('refund_as_of')) {
        if (typeof input?.refund_as_of !== 'string') fail('INVALID_REQUEST');
        parseDate(input.refund_as_of, 'INVALID_REQUEST');
        filters = { ...filters, refund_as_of: input.refund_as_of };
      }
      for (const [key, value] of Object.entries(filters)) params.set(key, String(value));
    }
    const aggregate = await getJson(base, path, params, binding, combined);
    combined.throwIfAborted();
    return normalize(aggregate, filters, binding.dataKind);
  } catch (error) {
    let code = 'UPSTREAM_ERROR';
    if (signal?.aborted) code = 'CANCELLED';
    else if (timeout.aborted) code = 'TIMEOUT';
    else if (error instanceof DashboardError) code = error.code;
    return { status: 'UNAVAILABLE', schema_version: schema, metric_version: version, reason: { code, message: MESSAGES[code] } };
  }
}

export function validateRequest(input, extraKeys = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST');
  const keys = ['start_date', 'end_date', 'channel', 'exclude_low_price', ...extraKeys];
  if (Object.keys(input).some(key => !keys.includes(key))) fail('INVALID_REQUEST');
  const start = parseDate(input.start_date, 'INVALID_REQUEST');
  const end = parseDate(input.end_date, 'INVALID_REQUEST');
  if (end < start || (end - start) / DAY >= 90) fail('INVALID_REQUEST');
  const channel = input.channel === undefined ? '全店' : input.channel;
  const excludeLowPrice = input.exclude_low_price === undefined ? false : input.exclude_low_price;
  if (!CHANNELS.includes(channel) || typeof excludeLowPrice !== 'boolean') fail('INVALID_REQUEST');
  return { start_date: input.start_date, end_date: input.end_date, channel, exclude_low_price: excludeLowPrice };
}

/** Validate and project aggregates; never forward arbitrary server metadata. */
export function normalizePurchases(value, filters, dataKind) {
  if (value?.schema_version !== 'crm-dashboard-purchases/v1' || value.metric_version !== 'dashboard-gsv-purchases/v1' ||
      !Number.isSafeInteger(value.gsv_amount_fen) || value.data_through !== null || value.refund_as_of !== null ||
      Object.keys(filters).some(key => value.filters?.[key] !== filters[key])) fail('INVALID_RESPONSE');
  /** @type {Record<string, number>} */
  const coverage = {};
  for (const key of ['rows', 'orders', 'buyers', 'unknown_order_rows', 'unknown_buyer_rows',
    'unknown_order_amount_fen', 'unknown_buyer_amount_fen', 'null_amount_rows', 'negative_amount_rows',
    'zero_amount_orders', 'zero_only_buyers']) {
    const item = value.coverage?.[key];
    if (!Number.isSafeInteger(item) || (!key.endsWith('_amount_fen') && item < 0)) fail('INVALID_RESPONSE');
    coverage[key] = item;
  }
  for (const key of ['orders', 'buyers', 'unknown_order_rows', 'unknown_buyer_rows', 'null_amount_rows', 'negative_amount_rows']) {
    if (coverage[key] > coverage.rows) fail('INVALID_RESPONSE');
  }
  if (coverage.zero_amount_orders + coverage.orders > coverage.rows || coverage.zero_only_buyers + coverage.buyers > coverage.rows) fail('INVALID_RESPONSE');
  /** @type {Record<string, {amount_fen: number | null, amount_yuan: string | null, denominator: number, reason: string | null, currency: string}>} */
  const averages = {};
  for (const [name, key, unknownKey, unknownReason] of [
    ['aov', 'orders', 'unknown_order_rows', 'UNKNOWN_ORDER'],
    ['aus', 'buyers', 'unknown_buyer_rows', 'UNKNOWN_BUYER'],
  ]) {
    const item = value[name];
    let expectedReason = null;
    if (coverage.null_amount_rows || coverage.negative_amount_rows) expectedReason = 'INVALID_AMOUNT';
    else if (coverage[unknownKey]) expectedReason = unknownReason;
    else if (name === 'aus' && coverage.unknown_order_rows) expectedReason = 'UNKNOWN_ORDER';
    else if (coverage[key] === 0) expectedReason = 'NO_PURCHASES';
    if (!item || item.denominator !== coverage[key] || item.reason !== expectedReason) fail('INVALID_RESPONSE');
    if (expectedReason) {
      if (item.amount_fen !== null) fail('INVALID_RESPONSE');
      averages[name] = { amount_fen: null, amount_yuan: null, currency: 'CNY', denominator: item.denominator, reason: expectedReason };
    } else {
      const numerator = BigInt(value.gsv_amount_fen), denominator = BigInt(item.denominator);
      if (numerator < 0n || !Number.isSafeInteger(item.amount_fen) ||
          BigInt(item.amount_fen) !== (2n * numerator + denominator) / (2n * denominator)) fail('INCONSISTENT_RESULT');
      averages[name] = { ...money(item.amount_fen), denominator: item.denominator, reason: null };
    }
  }
  return {
    status: 'OK', schema_version: value.schema_version, metric_version: value.metric_version,
    source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real', synthetic: dataKind === 'synthetic',
    filters: { ...filters, timezone: 'Asia/Shanghai', end_inclusive: true },
    gsv: money(value.gsv_amount_fen), coverage, ...averages,
    data_through: null, refund_as_of: null,
    limitations: ['AOV为每单金额，AUS为按购买人数计算的客单价；分子沿用看板GSV，净额版单列。',
      '未知标识或异常金额会阻断对应均值；零元订单和仅零元买家另列，不计购买分母。',
      '同次聚合按源订单和买家标识去重，尚不证明跨系统身份完整；数据水位和退款截止日未知。'],
  };
}

export const queryDashboardReadiness = (input, options = {}) =>
  queryNamed(input, options, '/api/v1/metrics/dashboard-readiness', [], normalizeReadiness);
export const queryDashboardMembership = (input, options = {}) =>
  queryNamed(input, options, '/api/v1/metrics/dashboard-membership', [], normalizeMembership);
export const queryDashboardNetGsv = (input, options = {}) =>
  queryNamed(input, options, '/api/v1/metrics/dashboard-net-gsv', ['refund_as_of'], normalizeNetGsv);

export function normalizeReadiness(value, _filters, dataKind) {
  if (value?.schema_version !== 'crm-dashboard-readiness/v1' || value.metric_version !== 'dashboard-readiness/v1'
      || !Array.isArray(value.metrics) || value.metrics.length > 20) fail('INVALID_RESPONSE');
  const metrics = value.metrics.map(item => {
    if (!item || !['A', 'B', 'C'].includes(item.acceptance_class) || typeof item.metric_id !== 'string'
        || typeof item.source_present !== 'boolean') fail('INVALID_RESPONSE');
    return {
      metric_id: item.metric_id, name: item.name, acceptance_class: item.acceptance_class,
      formula: item.formula, source: item.source, gap: item.gap, required_fields: item.required_fields,
      source_system: item.source_system, unlock: item.unlock, source_present: item.source_present,
    };
  });
  return {
    status: 'OK', schema_version: value.schema_version, metric_version: value.metric_version,
    source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real',
    synthetic: dataKind === 'synthetic', metrics,
    rejected_substitutes: value.inventory?.rejected_substitutes ?? [],
    limitations: value.limitations ?? [],
  };
}

export function normalizeMembership(value, filters, dataKind) {
  if (value?.schema_version !== 'crm-dashboard-membership/v1' || value.metric_version !== 'dashboard-member-premium/v1') fail('INVALID_RESPONSE');
  if (value.status === 'UNAVAILABLE') {
    if (value.reason !== 'MEMBERSHIP_AT_PURCHASE_UNAVAILABLE' || (value.premium?.value !== null && value.premium?.value !== undefined)) fail('INVALID_RESPONSE');
    return {
      status: 'UNAVAILABLE', schema_version: value.schema_version, metric_version: value.metric_version,
      source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real',
      synthetic: dataKind === 'synthetic', reason: value.reason, required_fields: value.required_fields,
      unlock: value.unlock, limitations: value.limitations ?? [],
    };
  }
  if (value.status !== 'OK' || Object.keys(filters).some(key => value.filters?.[key] !== filters[key])) fail('INVALID_RESPONSE');
  return {
    status: 'OK', schema_version: value.schema_version, metric_version: value.metric_version,
    source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real',
    synthetic: dataKind === 'synthetic', filters,
    member_gsv: money(value.member_gsv_amount_fen), non_member_gsv: money(value.non_member_gsv_amount_fen),
    unknown_member_gsv: money(value.unknown_member_gsv_amount_fen),
    member_aus: projectAverage(value.member_aus), non_member_aus: projectAverage(value.non_member_aus),
    premium: value.premium,
    coverage: value.coverage, limitations: value.limitations ?? [],
  };
}

export function normalizeNetGsv(value, filters, dataKind) {
  if (value?.schema_version !== 'crm-dashboard-net-gsv/v1' || value.metric_version !== 'dashboard-net-gsv/v1') fail('INVALID_RESPONSE');
  if (value.status === 'UNAVAILABLE') {
    if (!['MISSING_REFUND_EVENTS', 'AMOUNT_ALREADY_NET_CONFLICT'].includes(value.reason)
        || (value.net_gsv_amount_fen !== null && value.net_gsv_amount_fen !== undefined)) fail('INVALID_RESPONSE');
    return {
      status: 'UNAVAILABLE', schema_version: value.schema_version, metric_version: value.metric_version,
      source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real',
      synthetic: dataKind === 'synthetic', reason: value.reason, required_fields: value.required_fields,
      unlock: value.unlock, limitations: value.limitations ?? [],
    };
  }
  const expected = { start_date: filters.start_date, end_date: filters.end_date, channel: filters.channel,
    exclude_low_price: filters.exclude_low_price };
  if (value.status !== 'OK' || Object.keys(expected).some(key => value.filters?.[key] !== expected[key])) fail('INVALID_RESPONSE');
  if (!Number.isSafeInteger(value.net_gsv_amount_fen) || !Number.isSafeInteger(value.gross_paid_fen)
      || value.net_gsv_amount_fen !== value.gross_paid_fen - value.succeeded_refund_fen) fail('INCONSISTENT_RESULT');
  return {
    status: 'OK', schema_version: value.schema_version, metric_version: value.metric_version,
    source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real',
    synthetic: dataKind === 'synthetic', filters, refund_as_of: value.refund_as_of,
    gross_paid: money(value.gross_paid_fen), succeeded_refund: money(value.succeeded_refund_fen),
    net_gsv: money(value.net_gsv_amount_fen), parent_child_attributed: value.parent_child_attributed === true,
    limitations: ['净额GSV与看板GSV分列，不能对看板结果再扣退款。', ...(value.limitations ?? [])],
  };
}
