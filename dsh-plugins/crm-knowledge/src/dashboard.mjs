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
    fields: ['gsv_amount', 'daily_gsv'], channels: [...CHANNELS],
    definition: dashboardKnowledgeContext(),
    note: '仅在登录页面连接当前对话；请求时重新验证 CRM 登录。现有 CRM 账号权限适用，尚无按渠道授权能力。',
  };
}

function parseDate(value, code) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail(code);
  const result = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) fail(code);
  return result;
}

function validateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST');
  const keys = ['start_date', 'end_date', 'channel', 'exclude_low_price'];
  if (Object.keys(input).some(key => !keys.includes(key))) fail('INVALID_REQUEST');
  const start = parseDate(input.start_date, 'INVALID_REQUEST');
  const end = parseDate(input.end_date, 'INVALID_REQUEST');
  if (end < start || (end - start) / DAY >= 90) fail('INVALID_REQUEST');
  const channel = input.channel === undefined ? '全店' : input.channel;
  const excludeLowPrice = input.exclude_low_price === undefined ? false : input.exclude_low_price;
  if (!CHANNELS.includes(channel) || typeof excludeLowPrice !== 'boolean') fail('INVALID_REQUEST');
  return { start_date: input.start_date, end_date: input.end_date, channel, exclude_low_price: excludeLowPrice };
}

function validateBinding(binding, sessionId) {
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
export async function queryDashboardGsv(input, options = {}) {
  const { sessionId, signal, binding = null, timeoutMs = 25000 } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combined.throwIfAborted();
    const filters = validateRequest(input);
    const base = validateBinding(binding, sessionId);
    const me = await getJson(base, '/api/v1/auth/me', new URLSearchParams(), binding, combined);
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    const params = new URLSearchParams({ start_date: filters.start_date, end_date: filters.end_date, metric_type: 'GSV' });
    if (filters.channel !== '全店') params.set('channel', filters.channel);
    if (filters.exclude_low_price) for (const channel of LOW_PRICE_CHANNELS) params.append('exclude_channels', channel);
    const overview = await getJson(base, '/api/v1/metrics/overview', params, binding, combined);
    const trend = await getJson(base, '/api/v1/metrics/trend', params, binding, combined);
    combined.throwIfAborted();
    return normalizeDashboard(overview, trend, filters, binding.dataKind);
  } catch (error) {
    const code = signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'TIMEOUT' : error instanceof DashboardError ? error.code : 'UPSTREAM_ERROR';
    return { status: 'UNAVAILABLE', schema_version: 'crm-dashboard-read/v1', metric_version: VERSION, reason: { code, message: MESSAGES[code] } };
  }
}
