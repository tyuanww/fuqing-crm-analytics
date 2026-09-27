import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const METHODS = new Set(['cloudflare-access', 'tailscale-acl', 'mtls-ip-allowlist', 'none']);
async function probe(url, expected, headers = {}, { releaseTag = null, sourceSha = null, requireIdentity = false } = {}) {
  if (!url) return { status: 'NOT_RUN', reason: 'url_missing' };
  try {
    const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const observedReleaseTag = response.headers.get('x-release-tag');
    const observedSourceSha = response.headers.get('x-source-sha');
    const statusCodeOk = expected.includes(response.status);
    const identityPresent = Boolean(observedReleaseTag && observedSourceSha);
    const identityMatches = !releaseTag || !sourceSha || (observedReleaseTag === releaseTag && observedSourceSha === sourceSha);
    const status = !statusCodeOk ? 'FAIL' : requireIdentity && !identityPresent ? 'NOT_RUN' : !identityMatches ? 'FAIL' : 'PASS';
    return { status, code: response.status, observed_release_tag: observedReleaseTag, observed_source_sha: observedSourceSha, ...(status === 'NOT_RUN' ? { reason: 'release_identity_headers_missing' } : {}) };
  } catch (error) { return { status: 'FAIL', reason: error.name === 'TimeoutError' ? 'timeout_is_not_negative_probe' : error.message }; }
}
export async function verifyOperatorGate({ method, positiveUrl, negativeUrl, operatorHeaders = {}, routeConfigPath = null, releaseTag = null, sourceSha = null }) {
  if (!METHODS.has(method)) throw new Error('OPERATOR_GATE_METHOD_INVALID');
  const routeConfigSha256 = routeConfigPath ? createHash('sha256').update(await readFile(routeConfigPath)).digest('hex') : null;
  if (method === 'none') return { status: 'PARTIAL', operator_gate_method: 'none', route_config_sha256: routeConfigSha256, reason: 'no operator isolation; hostname probe is cutover', positive_probe: { status: 'NOT_RUN' }, negative_probe: { status: 'NOT_RUN' } };
  if (!releaseTag || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')) return { status: 'NOT_RUN', operator_gate_method: method, route_config_sha256: routeConfigSha256, reason: 'expected release_tag and source_sha are required to bind the positive probe' };
  const positive = await probe(positiveUrl, [200], operatorHeaders, { releaseTag, sourceSha, requireIdentity: true });
  const negative = await probe(negativeUrl, [401, 403], {}, { requireIdentity: false });
  const status = positive.status === 'FAIL' || negative.status === 'FAIL' ? 'FAIL' : positive.status === 'NOT_RUN' || negative.status === 'NOT_RUN' ? 'NOT_RUN' : 'PASS';
  return { status, operator_gate_method: method, route_config_sha256: routeConfigSha256, positive_probe: positive, negative_probe: negative, started_at: new Date().toISOString(), ended_at: new Date().toISOString() };
}
export function evaluateSli(samples, { p95Ms = 1000, maxFiveXX = 0, maxAuthFailures = 0, maxPluginFailures = 0, maxPageFailures = 0 } = {}) {
  if (!Array.isArray(samples)) return { status: 'NOT_RUN', reason: 'samples must be an array', sample_count: 0, observation_window_ms: 0, p95_ms: null, five_xx: 0, auth_failures: 0, plugin_failures: 0, page_failures: 0 };
  const completeLatency = samples.every(item => Number.isFinite(item?.latency_ms) && item.latency_ms >= 0);
  const values = completeLatency ? samples.map(item => item.latency_ms).sort((a, b) => a - b) : []; const p95 = values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * .95) - 1)] : null;
  const failures = key => samples.filter(item => item[key] === true).length;
  const observed = samples.length > 0 && samples.every(item => Number.isFinite(item.observed_at));
  const windowMs = observed ? Math.max(...samples.map(item => item.observed_at)) - Math.min(...samples.map(item => item.observed_at)) : 0;
  const reason = !observed ? 'samples lack HTTP observation timestamps' : !completeLatency ? 'samples lack non-negative latency measurements' : windowMs < 900_000 ? '15-minute observation window is incomplete' : undefined;
  const result = { status: observed && completeLatency && samples.length >= 10 && windowMs >= 900_000 && p95 !== null && p95 <= p95Ms && failures('five_xx') <= maxFiveXX && failures('auth_failure') <= maxAuthFailures && failures('plugin_failure') <= maxPluginFailures && failures('page_failure') <= maxPageFailures ? 'PASS' : 'NOT_RUN', reason, sample_count: samples.length, observation_window_ms: windowMs, p95_ms: p95, five_xx: failures('five_xx'), auth_failures: failures('auth_failure'), plugin_failures: failures('plugin_failure'), page_failures: failures('page_failure') };
  return result;
}
