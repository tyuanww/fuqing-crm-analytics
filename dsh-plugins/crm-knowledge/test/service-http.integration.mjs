import test from 'node:test';
import assert from 'node:assert/strict';
import { serveCrmServices } from './service.fixture.mjs';
import { createMetricsService } from '../src/service-client.mjs';
import { explainPublicKnowledge } from './knowledge-http.mjs';

test('separate service processes fail independently and retain the healthy domain', async t => {
  const fixture = await serveCrmServices(t);
  const services = createMetricsService(fixture.config);
  assert.notEqual(fixture.config.metricsOrigin, fixture.config.knowledgeOrigin);
  assert.equal((await services.capabilities()).synthetic_only, true);
  assert.equal((await explainPublicKnowledge(fixture.config.knowledgeOrigin, '客单价')).pack_version, 'crm-knowledge-offline/v1');
  await fixture.stop.metrics();
  assert.equal((await services.capabilities()).reason.code, 'SERVICE_UNAVAILABLE');
  assert.ok((await explainPublicKnowledge(fixture.config.knowledgeOrigin, '客单价')).decision_ids.includes('D001'));
  await fixture.stop.knowledge();
  assert.equal((await explainPublicKnowledge(fixture.config.knowledgeOrigin, '客单价')).reason.code, 'SERVICE_UNAVAILABLE');
});
