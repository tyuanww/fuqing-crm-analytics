/** CRM domain only. No knowledge implementation or implicit service selection. */
import { createService } from './service-transport.generated.mjs';
export { unavailableSchema, serviceOrigin } from './service-transport.generated.mjs';
export function createMetricsService(config = {}) {
  const service = createService(config.metricsOrigin, config.timeoutMs);
  return { availability: () => ({ metrics: service.availability() }),
    query: (request, signal) => service.call('query', request, signal),
    capabilities: signal => service.call('capabilities', undefined, signal) };
}
