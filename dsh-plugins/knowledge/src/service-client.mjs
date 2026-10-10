/** Public knowledge domain only; private textbook access is a separate capability. */
import { createService } from './service-transport.generated.mjs';
export function createKnowledgeService(config = {}) {
  const service = createService(config.knowledgeOrigin, config.timeoutMs);
  return { availability: () => ({ knowledge: service.availability() }),
    explain: (topic, signal) => service.call('explain', { topic }, signal) };
}
