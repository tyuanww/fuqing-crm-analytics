import { dashboardDefinition } from './dashboard-definition.generated.mjs';
import { createHash } from 'node:crypto';
/** Read the accepted dashboard through its authenticated API. No DB/SQL fallback. */
export const LEAF_CHANNELS = Object.freeze(['货架', '达播', '直播', '淘客', '微博', 'U先派样', '百补派样', '赠品&0.01', '其他']);
export const CHANNELS = Object.freeze(['全店', '纯派样', ...LEAF_CHANNELS]);
export const LOW_PRICE_CHANNELS = Object.freeze(['U先派样', '百补派样', '赠品&0.01', '其他']);
export const CHANNEL_QUERY_DESCRIPTION = '看板渠道，默认全店。全店是九个叶子渠道之和；纯派样是 U先派样 + 百补派样，已经包含在这九个叶子里。禁止把全店或纯派样和叶子渠道相加，也禁止把纯派样和它的两个子渠道相加。';

export function channelRole(channel) {
  if (channel === '全店') return { role: 'store_total', add_with_leaves: false, equals: 'leaf_partition' };
  if (channel === '纯派样') return { role: 'aggregate', add_with_leaves: false, equals: ['U先派样', '百补派样'] };
  return { role: 'leaf', add_with_leaves: true, equals: channel };
}

export function channelHierarchy() {
  return {
    leaf_partition: [...LEAF_CHANNELS],
    aggregates: [
      { channel: '全店', role: 'store_total', equals: 'sum of leaf_partition' },
      { channel: '纯派样', role: 'aggregate', equals: ['U先派样', '百补派样'] },
    ],
    sum_rule: 'Only leaf_partition sums to 全店. 纯派样 is already inside that sum. A total that includes both 纯派样 and U先派样 or 百补派样 is double counting.',
  };
}
const VERSION = 'dashboard-gsv/observed-v1';
const PRODUCT_CUSTOMER_VERSION = 'product-customer/v3';
const RFM_SNAPSHOT_VERSION = 'rfm-snapshot/v1';
const RFM_SEGMENTS = Object.freeze([
  '重要价值客户', '重要保持客户', '重要发展客户', '重要挽留客户',
  '一般价值客户', '一般保持客户', '一般发展客户', '一般挽留客户', '已购客TTL',
]);
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
  SERVICE_UNAVAILABLE: 'CRM 服务暂不可用或所选 RFM 范围尚未预热；没有改用其他资料源。',
  UPSTREAM_ERROR: 'CRM 服务未能返回有效结果；没有改用其他资料源。',
  INVALID_RESPONSE: 'CRM 返回内容不符合所需数据合同，未输出业务金额或分群。',
  INCONSISTENT_RESULT: '看板概览与日趋势金额不一致，未输出业务金额，请核对数据版本或接口。',
  INSUFFICIENT_COVERAGE: '请求区间超出仓库数据截止日，未输出业务金额或人数。',
  UNKNOWN_PRODUCT: '请求中的商品未在已登记商品映射中找到，未进行模糊匹配或返回商品数据。',
  DATA_WARNING: 'CRM 接口返回数据警告，本次结果暂不可用；请在看板核对查询区间与数据水位。',
  TIMEOUT: 'CRM 查询超时；未自动重试。',
  CANCELLED: 'CRM 查询已取消。',
  BACKEND_UPGRADE_REQUIRED: 'CRM 后端尚未升级到 product-customer/v3。',
});
class DashboardError extends Error {
  constructor(code) { super(MESSAGES[code]); this.code = code; }
}
const fail = code => { throw new DashboardError(code); };

export function dashboardKnowledgeContext() { return structuredClone(dashboardDefinition); }

export function dashboardCapabilities(connectionState = 'NOT_CONNECTED') {
  return {
    tool: 'query_crm_dashboard_gsv', metric_version: VERSION,
    connection_state: connectionState,
    authentication_checked_on_each_query: true, max_days: 90,
    saved_analysis: { capture_tool: 'query_crm_dashboard_snapshot', schema_version: 'crm-result-snapshot/v1',
      scope: 'private_crm_account', saves_require_user_confirmation: true, store_configuration_required: true },
    fields: ['gsv_amount', 'daily_gsv'], purchases_tool: 'query_crm_dashboard_purchases',
    purchases_backend_contract: 'crm-dashboard-purchases/v1',
    purchases_runtime_status: 'unknown_until_query_crm_dashboard_purchases_is_called',
    channels: [...CHANNELS], channel_hierarchy: channelHierarchy(),
    readiness_tool: 'query_crm_dashboard_readiness', membership_tool: 'query_crm_dashboard_membership',
    net_gsv_tool: 'query_crm_dashboard_net_gsv',
    product_customer_tool: 'query_crm_product_customer_cohorts',
    product_customer_schema: PRODUCT_CUSTOMER_VERSION,
    rfm_snapshot_tool: 'query_crm_rfm_snapshot',
    rfm_snapshot_schema: RFM_SNAPSHOT_VERSION,
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
function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** First-purchase audience already returned by the overview. Not membership. */
export function projectAudience(overview) {
  const newUsers = count(overview?.new_users);
  const oldUsers = count(overview?.old_users);
  if (newUsers === null || oldUsers === null) return null;
  return {
    source: 'user_first_purchase',
    definition: '新客是首购日晚于窗口开始前一天的买家；老客是首购日不晚于该日的买家。',
    new_users: newUsers,
    old_users: oldUsers,
    new_user_amount_yuan: finite(overview.new_user_amount),
    old_user_amount_yuan: finite(overview.old_user_amount),
    new_user_ratio: finite(overview.new_user_ratio),
    old_user_ratio: finite(overview.old_user_ratio),
  };
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
  let calendarDayCount = 0;
  for (let date = parseDate(filters.start_date, 'INVALID_REQUEST'); date <= parseDate(filters.end_date, 'INVALID_REQUEST'); date += DAY) {
    calendarDayCount += 1;
    const text = new Date(date).toISOString().slice(0, 10);
    if (!dates.has(text)) missing.push(text);
  }
  return {
    status: 'OK', schema_version: 'crm-dashboard-read/v1', metric_version: VERSION,
    source: 'authenticated_crm_metrics_service', contains_real_data: dataKind === 'real', synthetic: dataKind === 'synthetic',
    filters: { ...filters, metric_type: 'GSV', timezone: 'Asia/Shanghai', end_inclusive: true, exclude_channels: filters.exclude_low_price ? [...LOW_PRICE_CHANNELS] : [] },
    gsv: money(amount), daily, returned_day_count: daily.length, calendar_day_count: calendarDayCount, channel_role: channelRole(filters.channel),
    audience: projectAudience(overview),
    reconciliation: { daily_sum_matches: true, dates_not_returned: missing },
    data_through: null, warehouse_cutoff: null, refund_as_of: null, backend_version_verified: false,
    limitations: ['客单价和会员溢价不从概览转发；会员溢价用 query_crm_dashboard_membership，净额用 query_crm_dashboard_net_gsv。', 'data_through 仍为空；warehouse_cutoff 是仓库最后支付日，不是每条指标的截止时刻。', '日趋势未返回的日期不补0；不能区分无成交与资料缺失。', 'returned_day_count 是趋势实际返回的天数，calendar_day_count 是请求区间的日历天数。缺日不补 0，日均不要用返回点数代替整段日历。', '概览与趋势为两次请求，并非数据库快照；一致性校验仅覆盖金额。'],
    definition: dashboardKnowledgeContext(),
  };
}

async function readJsonResponse(response, invalidRequestCode = 'INVALID_REQUEST') {
  try {
    if (response.status === 401) fail('AUTH_EXPIRED');
    if (response.status === 403) fail('ACCESS_DENIED');
    if (response.status === 400 || response.status === 422) fail(invalidRequestCode);
    if (response.status === 503) fail('SERVICE_UNAVAILABLE');
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

async function getJson(base, path, params, binding, signal, invalidRequestCode = 'INVALID_REQUEST') {
  const url = new URL(path, base);
  url.search = params.toString();
  return readJsonResponse(await fetch(url, { method: 'GET', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${binding.token}`, Accept: 'application/json' } }), invalidRequestCode);
}

async function postJson(base, path, body, binding, signal, extraHeaders = {}, invalidRequestCode = 'INVALID_REQUEST') {
  const url = new URL(path, base);
  return readJsonResponse(await fetch(url, {
    method: 'POST', redirect: 'error', signal,
    headers: {
      Authorization: `Bearer ${binding.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }), invalidRequestCode);
}

async function readWarehouseCutoff(base, binding, signal) {
  const cutoff = await getJson(base, '/api/v1/metrics/cutoff', new URLSearchParams(), binding, signal);
  if (typeof cutoff?.cutoff_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff.cutoff_date)) {
    fail(cutoff?.cutoff_date === null ? 'SERVICE_UNAVAILABLE' : 'INVALID_RESPONSE');
  }
  parseDate(cutoff.cutoff_date, 'INVALID_RESPONSE');
  return cutoff.cutoff_date;
}

function assertWithinWarehouseCutoff(filters, cutoff) {
  if (filters.end_date > cutoff || (filters.compare_end_date && filters.compare_end_date > cutoff)) {
    fail('INSUFFICIENT_COVERAGE');
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
      assertWithinWarehouseCutoff(filters, await readWarehouseCutoff(base, binding, combined));
      return normalizePurchases(aggregate, filters, binding.dataKind);
    }
    const params = new URLSearchParams({ start_date: filters.start_date, end_date: filters.end_date, metric_type: 'GSV' });
    if (filters.channel !== '全店') params.set('channel', filters.channel);
    if (filters.exclude_low_price) for (const channel of LOW_PRICE_CHANNELS) params.append('exclude_channels', channel);
    const overview = await getJson(base, '/api/v1/metrics/overview', params, binding, combined);
    const trend = await getJson(base, '/api/v1/metrics/trend', params, binding, combined);
    combined.throwIfAborted();
    const result = normalizeDashboard(overview, trend, filters, binding.dataKind);
    const cutoffDate = await readWarehouseCutoff(base, binding, combined);
    result.warehouse_cutoff = cutoffDate;
    assertWithinWarehouseCutoff(filters, cutoffDate);
    return result;
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

export async function queryProductCustomer(input, options = {}) {
  const { sessionId, signal, binding = null, timeoutMs = 25000 } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combined.throwIfAborted();
    const filters = validateProductCustomerRequest(input);
    const base = validateBinding(binding, sessionId);
    const me = await getJson(base, '/api/v1/auth/me', new URLSearchParams(), binding, combined);
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    const value = await postJson(base, '/api/v1/category/product-customer', {
      start_date: filters.start_date,
      end_date: filters.end_date,
      ...(filters.products ? { products: filters.products } : {}),
      metric_type: 'GSV',
      ...(filters.channel !== '全店' ? { channel: filters.channel } : {}),
      exclude_channels: filters.exclude_low_price ? [...LOW_PRICE_CHANNELS] : [],
      ...(filters.compare_start_date ? {
        compare_start_date: filters.compare_start_date,
        compare_end_date: filters.compare_end_date,
      } : {}),
    }, binding, combined, { 'X-ShineMage-Product-Customer-Version': PRODUCT_CUSTOMER_VERSION }, 'UNKNOWN_PRODUCT');
    combined.throwIfAborted();
    const warehouseCutoff = await readWarehouseCutoff(base, binding, combined);
    assertWithinWarehouseCutoff(filters, warehouseCutoff);
    return normalizeProductCustomer(value, filters, binding.dataKind, warehouseCutoff);
  } catch (error) {
    let code = 'UPSTREAM_ERROR';
    if (signal?.aborted) code = 'CANCELLED';
    else if (timeout.aborted) code = 'TIMEOUT';
    else if (error instanceof DashboardError) code = error.code;
    return {
      status: 'UNAVAILABLE',
      schema_version: PRODUCT_CUSTOMER_VERSION,
      reason: { code, message: MESSAGES[code] },
    };
  }
}

export async function queryRfmSnapshot(input, options = {}) {
  const { sessionId, signal, binding = null, timeoutMs = 25000 } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combined.throwIfAborted();
    const filters = validateRfmSnapshotRequest(input);
    const base = validateBinding(binding, sessionId);
    const me = await getJson(base, '/api/v1/auth/me', new URLSearchParams(), binding, combined);
    if (me?.username !== binding.username) fail('ACCOUNT_MISMATCH');
    const params = new URLSearchParams({
      start_date: filters.start_date,
      end_date: filters.end_date,
      metric_type: filters.metric_type,
    });
    if (filters.channel !== '全店') params.set('channel', filters.channel);
    if (filters.exclude_low_price) {
      for (const channel of LOW_PRICE_CHANNELS) params.append('exclude_channels', channel);
    }
    const value = await getJson(base, '/api/v1/customer-health/rfm-analysis', params, binding, combined, 'INSUFFICIENT_COVERAGE');
    combined.throwIfAborted();
    const cutoff = await getJson(base, '/api/v1/metrics/cutoff', new URLSearchParams(), binding, combined);
    if (typeof cutoff?.cutoff_date !== 'string') fail('INVALID_RESPONSE');
    parseDate(cutoff.cutoff_date, 'INVALID_RESPONSE');
    const warehouseCutoff = cutoff.cutoff_date;
    assertWithinWarehouseCutoff(filters, warehouseCutoff);
    return normalizeRfmSnapshot(value, filters, binding.dataKind, warehouseCutoff);
  } catch (error) {
    let code = 'UPSTREAM_ERROR';
    if (signal?.aborted) code = 'CANCELLED';
    else if (timeout.aborted) code = 'TIMEOUT';
    else if (error instanceof DashboardError) code = error.code;
    return {
      status: 'UNAVAILABLE',
      schema_version: RFM_SNAPSHOT_VERSION,
      reason: { code, message: MESSAGES[code] },
    };
  }
}

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
    if (filters) {
      assertWithinWarehouseCutoff(filters, await readWarehouseCutoff(base, binding, combined));
    }
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

export function validateProductCustomerRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST');
  const keys = ['start_date', 'end_date', 'products', 'channel', 'exclude_low_price',
    'compare_start_date', 'compare_end_date'];
  if (Object.keys(input).some(key => !keys.includes(key))) fail('INVALID_REQUEST');
  const dates = validateRequest({
    start_date: input.start_date,
    end_date: input.end_date,
    channel: input.channel,
    exclude_low_price: input.exclude_low_price,
  });
  let products;
  if (input.products !== undefined) {
    if (!Array.isArray(input.products) || input.products.length < 1 || input.products.length > 20 ||
        input.products.some(name => typeof name !== 'string' || !name.trim() ||
          name.trim() !== name || [...name].length > 80) ||
        new Set(input.products).size !== input.products.length) fail('INVALID_REQUEST');
    products = [...input.products];
  }
  const hasCompareStart = input.compare_start_date !== undefined;
  const hasCompareEnd = input.compare_end_date !== undefined;
  if (hasCompareStart !== hasCompareEnd) fail('INVALID_REQUEST');
  let compare;
  if (hasCompareStart) {
    const compareStart = parseDate(input.compare_start_date, 'INVALID_REQUEST');
    const compareEnd = parseDate(input.compare_end_date, 'INVALID_REQUEST');
    if (compareEnd < compareStart || (compareEnd - compareStart) / DAY >= 90) fail('INVALID_REQUEST');
    compare = {
      compare_start_date: input.compare_start_date,
      compare_end_date: input.compare_end_date,
    };
  }
  return { ...dates, products, ...compare };
}

function productMetric(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RESPONSE');
  const keys = ['gsv', 'users', 'aus', 'old_gsv', 'old_users', 'old_aus', 'old_ratio',
    'new_gsv', 'new_users', 'new_aus', 'new_ratio', 'member_gsv', 'member_users',
    'member_aus', 'member_ratio', 'old_users_ratio', 'new_users_ratio'];
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) fail('INVALID_RESPONSE');
  for (const key of ['gsv', 'aus', 'old_gsv', 'old_aus', 'new_gsv', 'new_aus',
    'member_gsv', 'member_aus', 'old_ratio', 'new_ratio', 'member_ratio',
    'old_users_ratio', 'new_users_ratio']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0) fail('INVALID_RESPONSE');
  }
  for (const key of ['users', 'old_users', 'new_users', 'member_users']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail('INVALID_RESPONSE');
  }
  for (const key of ['old_ratio', 'new_ratio', 'member_ratio', 'old_users_ratio', 'new_users_ratio']) {
    if (value[key] > 1) fail('INVALID_RESPONSE');
  }
  if (value.old_users + value.new_users !== value.users ||
      Math.abs(value.old_gsv + value.new_gsv - value.gsv) > 0.02 ||
      value.member_users > value.users || value.member_gsv > value.gsv + 0.02) fail('INVALID_RESPONSE');
  const ratios = [
    ['old_ratio', value.old_gsv, value.gsv],
    ['new_ratio', value.new_gsv, value.gsv],
    ['member_ratio', value.member_gsv, value.gsv],
    ['old_users_ratio', value.old_users, value.users],
    ['new_users_ratio', value.new_users, value.users],
  ];
  for (const [key, numerator, denominator] of ratios) {
    const expected = denominator === 0 ? 0 : numerator / denominator;
    if (Math.abs(value[key] - expected) > 0.0002) fail('INVALID_RESPONSE');
  }
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

function productYoY(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RESPONSE');
  const keys = ['gsv', 'users', 'aus', 'old_gsv', 'old_users', 'old_aus', 'new_gsv',
    'new_users', 'new_aus', 'old_ratio_ppt', 'new_ratio_ppt',
    'old_users_ratio_ppt', 'new_users_ratio_ppt'];
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) fail('INVALID_RESPONSE');
  return Object.fromEntries(keys.map(key => {
    const item = value[key];
    if (item !== null && (typeof item !== 'number' || !Number.isFinite(item))) fail('INVALID_RESPONSE');
    return [key, item];
  }));
}

function sameNaturalDayLastYear(value) {
  const current = new Date(parseDate(value, 'INVALID_RESPONSE'));
  const year = current.getUTCFullYear() - 1;
  const month = current.getUTCMonth();
  const day = current.getUTCDate();
  const previous = new Date(Date.UTC(year, month, day));
  if (previous.getUTCMonth() !== month) previous.setUTCDate(0);
  return previous.toISOString().slice(0, 10);
}

function previousMonthEnd(value) {
  const current = new Date(parseDate(value, 'INVALID_RESPONSE'));
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

function filterBase(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'products'));
}

export function normalizeProductCustomer(value, filters, dataKind, warehouseCutoff = null) {
  if (value?.schema_version === 'product-customer/v2') fail('BACKEND_UPGRADE_REQUIRED');
  if (value?.schema_version !== PRODUCT_CUSTOMER_VERSION || value.source !== 'orders+user_first_purchase' ||
      value.date_start !== filters.start_date || value.date_end !== filters.end_date ||
      value.metric_type !== 'GSV' || (value.channel ?? '全店') !== filters.channel ||
      !Array.isArray(value.exclude_channels) || !Array.isArray(value.products) || value.products.length > 20 ||
      typeof value.new_old_cutoff !== 'string' || typeof value.comparison_new_old_cutoff !== 'string') fail('INVALID_RESPONSE');
  const expectedCompareStart = filters.compare_start_date ?? sameNaturalDayLastYear(filters.start_date);
  const expectedCompareEnd = filters.compare_end_date ?? sameNaturalDayLastYear(filters.end_date);
  if (value.compare_start_date !== expectedCompareStart || value.compare_end_date !== expectedCompareEnd ||
      value.new_old_cutoff !== previousMonthEnd(filters.start_date) ||
      value.comparison_new_old_cutoff !== previousMonthEnd(expectedCompareStart)) fail('INVALID_RESPONSE');
  if (value.data_cutoff !== null) parseDate(value.data_cutoff, 'INVALID_RESPONSE');
  if (!value.coverage || typeof value.coverage !== 'object' ||
      (value.coverage.data_cutoff !== null && typeof value.coverage.data_cutoff !== 'string') ||
      !['COMPLETE', 'INSUFFICIENT'].includes(value.coverage.current_status) ||
      !['COMPLETE', 'INSUFFICIENT'].includes(value.coverage.comparison_status)) fail('INVALID_RESPONSE');
  if (value.coverage.data_cutoff !== value.data_cutoff) fail('INVALID_RESPONSE');
  if (!['OK', 'INSUFFICIENT_COVERAGE'].includes(value.status)) fail('INVALID_RESPONSE');
  const expectedExcluded = filters.exclude_low_price ? [...LOW_PRICE_CHANNELS] : [];
  if (value.exclude_channels.length !== expectedExcluded.length ||
      value.exclude_channels.some((channel, index) => channel !== expectedExcluded[index])) fail('INVALID_RESPONSE');
  if (value.status === 'INSUFFICIENT_COVERAGE') {
    if (value.products.length !== 0) fail('INVALID_RESPONSE');
    return {
      status: 'INSUFFICIENT_COVERAGE',
      schema_version: PRODUCT_CUSTOMER_VERSION,
      source: value.source,
      contains_real_data: dataKind === 'real',
      synthetic: dataKind === 'synthetic',
      filters: { ...filterBase(filters), timezone: 'Asia/Shanghai', end_inclusive: true },
      compare_start_date: value.compare_start_date,
      compare_end_date: value.compare_end_date,
      new_old_cutoff: value.new_old_cutoff,
      comparison_new_old_cutoff: value.comparison_new_old_cutoff,
      data_cutoff: value.data_cutoff,
      coverage: value.coverage,
      products: [],
    };
  }
  if (value.products.length === 0) fail('INVALID_RESPONSE');
  const names = new Set();
  const displayNames = new Set();
  const products = value.products.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name || names.has(item.name) ||
        typeof item.display_name !== 'string' || !item.display_name || displayNames.has(item.display_name) ||
        !Array.isArray(item.spu_classes) ||
        !['OK', 'EMPTY'].includes(item.status) ||
        !item.spu_classes.every(name => typeof name === 'string' && name)) fail('INVALID_RESPONSE');
    names.add(item.name);
    displayNames.add(item.display_name);
    const current = productMetric(item.current);
    const comparison = productMetric(item.comparison);
    if (item.status === 'EMPTY' && current.users !== 0) fail('INVALID_RESPONSE');
    if (item.status === 'OK' && current.users === 0) fail('INVALID_RESPONSE');
    return {
      display_name: item.display_name,
      status: item.status,
      current,
      comparison,
      yoy: productYoY(item.yoy),
    };
  });
  if (filters.products && (value.products.length !== filters.products.length ||
      filters.products.some(requested => !value.products.some(item =>
        requested === item.name || requested === item.display_name)))) fail('INVALID_RESPONSE');
  return {
    status: 'OK',
    schema_version: PRODUCT_CUSTOMER_VERSION,
    source: value.source,
    contains_real_data: dataKind === 'real',
    synthetic: dataKind === 'synthetic',
    filters: {
      ...filterBase(filters),
      ...(filters.products ? { products: products.map(item => item.display_name) } : {}),
      timezone: 'Asia/Shanghai',
      end_inclusive: true,
    },
    compare_start_date: value.compare_start_date,
    compare_end_date: value.compare_end_date,
    new_old_cutoff: value.new_old_cutoff,
    comparison_new_old_cutoff: value.comparison_new_old_cutoff,
    data_cutoff: value.data_cutoff,
    coverage: value.coverage,
    warehouse_cutoff: warehouseCutoff,
    products,
    limitations: [
      '新老客按商品映射到多个 SPU class 后，以 user_id 去重，不直接相加品类人数。',
      '新老客截止日沿用品类看板的期初月界口径，结果中显式返回该日期。',
      '订单表与 DMP 资产使用不同用户定义，不能跨来源相加。',
    ],
  };
}

export function validateRfmSnapshotRequest(input) {
  const keys = ['start_date', 'end_date', 'metric_type', 'channel', 'exclude_low_price'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !keys.includes(key))) fail('INVALID_REQUEST');
  const metricType = input.metric_type === undefined ? 'GSV' : input.metric_type;
  if (!['GSV', 'GMV'].includes(metricType)) fail('INVALID_REQUEST');
  const dates = validateRequest({
    start_date: input.start_date,
    end_date: input.end_date,
    channel: input.channel,
    exclude_low_price: input.exclude_low_price,
  });
  return { ...dates, metric_type: metricType };
}

const RFM_ROW_FIELDS = Object.freeze([
  'rfm_segment', 'hist_users_current', 'repurchase_users_current', 'repurchase_rate_current',
  'repurchase_gsv_current', 'repurchase_gsv_ratio_current', 'hist_users_comp',
  'repurchase_users_comp', 'repurchase_rate_comp', 'repurchase_gsv_comp',
  'repurchase_gsv_ratio_comp', 'hist_users_prev2', 'repurchase_users_prev2',
  'repurchase_rate_prev2', 'repurchase_gsv_prev2', 'repurchase_gsv_ratio_prev2',
  'yoy_hist_users', 'yoy_repurchase_users', 'yoy_repurchase_rate',
  'yoy_repurchase_gsv', 'yoy_repurchase_gsv_ratio_ppt',
]);

function rfmRows(value) {
  if (!Array.isArray(value) || value.length > 100) fail('INVALID_RESPONSE');
  const seen = new Set();
  return value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.rfm_segment !== 'string' || !row.rfm_segment || seen.has(row.rfm_segment)) fail('INVALID_RESPONSE');
    seen.add(row.rfm_segment);
    const projected = {};
    for (const key of RFM_ROW_FIELDS) {
      if (!(key in row)) fail('INVALID_RESPONSE');
      const item = row[key];
      if (key === 'rfm_segment') {
        projected[key] = item;
      } else if (key.startsWith('yoy_')) {
        if (item !== null && (typeof item !== 'number' || !Number.isFinite(item))) fail('INVALID_RESPONSE');
        projected[key] = item;
      } else if (key.includes('users_')) {
        if (!Number.isSafeInteger(item) || item < 0) fail('INVALID_RESPONSE');
        projected[key] = item;
      } else {
        if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) fail('INVALID_RESPONSE');
        if ((key.includes('rate_') || key.includes('ratio_')) && item > 1) fail('INVALID_RESPONSE');
        projected[key] = item;
      }
    }
    return projected;
  });
}

export function normalizeRfmSnapshot(value, filters, dataKind, warehouseCutoff = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.year_label !== 'string' || typeof value.comp_year_label !== 'string' ||
      typeof value.prev2_year_label !== 'string' || value.metric_type !== filters.metric_type) fail('INVALID_RESPONSE');
  const rows = rfmRows(value.rows);
  const sameChannelRows = rfmRows(value.same_channel_rows);
  const memberRows = rfmRows(value.member_rows);
  const memberSameChannelRows = rfmRows(value.member_same_channel_rows);
  for (const group of [rows, sameChannelRows, memberRows, memberSameChannelRows]) {
    if (group.length !== RFM_SEGMENTS.length ||
        group.some((row, index) => row.rfm_segment !== RFM_SEGMENTS[index])) {
      fail('INVALID_RESPONSE');
    }
  }
  const snapshotId = 'rfm_' + createHash('sha256').update(JSON.stringify({
    filters,
    year_label: value.year_label,
    comp_year_label: value.comp_year_label,
    prev2_year_label: value.prev2_year_label,
    metric_type: value.metric_type,
    rows,
    same_channel_rows: sameChannelRows,
    member_rows: memberRows,
    member_same_channel_rows: memberSameChannelRows,
    warehouse_cutoff: warehouseCutoff,
  })).digest('hex');
  return {
    status: 'OK',
    schema_version: RFM_SNAPSHOT_VERSION,
    snapshot_id: snapshotId,
    source: 'authenticated_crm_rfm_cache',
    contains_real_data: dataKind === 'real',
    synthetic: dataKind === 'synthetic',
    filters: { ...filters, timezone: 'Asia/Shanghai', end_inclusive: true },
    year_label: value.year_label,
    comp_year_label: value.comp_year_label,
    prev2_year_label: value.prev2_year_label,
    metric_type: value.metric_type,
    rows,
    same_channel_rows: sameChannelRows,
    member_rows: memberRows,
    member_same_channel_rows: memberSameChannelRows,
    warehouse_cutoff: warehouseCutoff,
    limitations: [
      'RFM 结果必须来自杭州预计算缓存；缓存未命中不会在 Web 请求内现场计算。',
      'RFM 契约没有独立 data_cutoff；展示时必须同时显示 filters 区间和 warehouse_cutoff。',
      '新老客与 8 象限定义来自当前 RFM 服务版本，不能与其他分群词表直接混用。',
    ],
  };
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
    gsv: money(value.gsv_amount_fen), coverage, ...averages, channel_role: channelRole(filters.channel),
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
    synthetic: dataKind === 'synthetic', filters, channel_role: channelRole(filters.channel),
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
    synthetic: dataKind === 'synthetic', filters, channel_role: channelRole(filters.channel), refund_as_of: value.refund_as_of,
    gross_paid: money(value.gross_paid_fen), succeeded_refund: money(value.succeeded_refund_fen),
    net_gsv: money(value.net_gsv_amount_fen), parent_child_attributed: value.parent_child_attributed === true,
    limitations: ['净额GSV与看板GSV分列，不能对看板结果再扣退款。', ...(value.limitations ?? [])],
  };
}
