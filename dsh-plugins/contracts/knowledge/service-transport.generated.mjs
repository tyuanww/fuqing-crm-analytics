// Generated from the domain HTTP transport template. Do not edit.
/** Domain service transport template. Emitted into each plugin; never loaded from the main repository at runtime. */
import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools';
import { serviceContract, serviceSchemas } from './service-contract.generated.mjs';

const HEADER = 'X-ShineMage-Contract';
const MAX_BYTES = 2 * 1024 * 1024;
const schemas = Object.fromEntries(Object.entries(serviceSchemas).map(([key, value]) => [key, valueSchemaSpecToJsonSchema(value)]));
const messages = {
  SERVICE_NOT_CONFIGURED: '未配置此独立服务，请由维护者在 profile 中设置服务地址。',
  INVALID_CONFIGURATION: '服务配置无效；仅接受显式回环地址和受限超时。',
  CONTRACT_MISMATCH: '服务 API 版本与插件合同不兼容，请核对服务版本。',
  INVALID_RESPONSE: '服务返回不符合合同，未使用部分结果。',
  SERVICE_UNAVAILABLE: '服务暂不可用；未自动重试或改用其他资料源。',
  INVALID_REQUEST: '请求不符合当前合成服务合同。',
  TIMEOUT: '服务请求超时；未自动重试。',
};

/** @type {import('@deepseek-ai/dsh-tools').ValueSchemaSpec} */
export const unavailableSchema = { type: 'object', additionalProperties: false, properties: {
  status: { type: 'string', const: 'NOT_AVAILABLE', required: true },
  service: { type: 'string', required: true },
  reason: { type: 'object', required: true, additionalProperties: false, properties: {
    code: { type: 'string', required: true }, message: { type: 'string', required: true },
  } },
  synthetic: { type: 'boolean', const: true, required: true },
  real_business_acceptance: { type: 'boolean', const: false, required: true },
} };
const unavailable = code => ({ status: 'NOT_AVAILABLE', service: serviceContract.contract,
  reason: { code, message: messages[code] }, synthetic: true, real_business_acceptance: false });
class ServiceFailure extends Error {
  constructor(code) { super(messages[code]); this.code = code; }
}
const fail = code => { throw new ServiceFailure(code); };

export function serviceOrigin(value) {
  let url; try { url = new URL(value); } catch { fail('INVALID_CONFIGURATION'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('INVALID_CONFIGURATION');
  return url.origin;
}

async function readJson(response) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) fail('INVALID_RESPONSE');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) fail('INVALID_RESPONSE');
  const reader = response.body?.getReader(); if (!reader) fail('INVALID_RESPONSE');
  let bytes = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > MAX_BYTES) fail('INVALID_RESPONSE');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ServiceFailure) throw error;
    fail('INVALID_RESPONSE');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createService(origin, timeoutMs = 30000) {
  let binding;
  if (origin !== undefined) {
    try { binding = { origin: serviceOrigin(origin) }; }
    catch { binding = { invalid: true }; }
  }
  const validTimeout = Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30000;
  const availability = () => !binding ? unavailable('SERVICE_NOT_CONFIGURED')
    : binding.invalid || !validTimeout ? unavailable('INVALID_CONFIGURATION')
      : { status: 'CONFIGURED_NOT_RUN', contract: serviceContract.contract, api_version: serviceContract.api_version };
  async function call(operation, payload, signal) {
    signal?.throwIfAborted();
    if (!serviceContract.operations.includes(operation)) fail('INVALID_REQUEST');
    const input = schemas[operation + 'Request'];
    if (input && validateJsonSchemaValue(input, payload).length) fail('INVALID_REQUEST');
    if (operation === 'explain' && (typeof payload?.topic !== 'string' || !payload.topic.trim() || payload.topic.length > 512)) fail('INVALID_REQUEST');
    const ready = availability(); if (ready.status === 'NOT_AVAILABLE') return ready;
    const contract = serviceContract, identity = contract.contract + '/' + contract.api_version;
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await fetch(binding.origin + contract.base_path + '/' + operation, {
        method: payload === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { [HEADER]: identity, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: combined,
      });
      if (response.headers.get(HEADER) !== identity || response.status === 409) fail('CONTRACT_MISMATCH');
      if (!response.ok) fail(response.status === 400 || response.status === 422 ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE');
      const result = await readJson(response);
      if (operation === 'capabilities') {
        for (const key of ['contract', 'api_version', 'scope', 'base_path', 'compatibility']) {
          if (result?.[key] !== contract[key]) fail('INVALID_RESPONSE');
        }
        if (!Array.isArray(result.operations) || contract.operations.some(op => !result.operations.includes(op))) fail('INVALID_RESPONSE');
        if (contract.contract === 'crm-metrics-service' && (result.synthetic_only !== true || result.real_archive !== false || result.metric_version !== 'crm-metrics/v1')) fail('INVALID_RESPONSE');
        return result;
      }
      const schema = schemas[operation + 'Response'];
      if (validateJsonSchemaValue(schema, result).length) fail('INVALID_RESPONSE');
      if (operation === 'query' && (result.contains_real_data !== false || result.synthetic !== true ||
          result.real_business_acceptance !== false || result.production_release !== false ||
          result.source_id !== payload.source_id || result.query_id !== payload.query_id)) fail('INVALID_RESPONSE');
      if (operation === 'explain' && !/^[a-f0-9]{64}$/.test(result.pack_sha256)) fail('INVALID_RESPONSE');
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      return unavailable(timeout.aborted ? 'TIMEOUT' : error instanceof ServiceFailure ? error.code : 'SERVICE_UNAVAILABLE');
    } finally { if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {}); }
  }
  return { availability, call };
}
