import test from 'node:test';
import assert from 'node:assert/strict';
import { serveCrmServices } from './service.fixture.mjs';
import { createCrmServices } from '../src/service-client.mjs';

test('separate service processes fail independently and retain the healthy domain', async t => {
  const fixture = await serveCrmServices(t);
  const services = createCrmServices(fixture.config);
  assert.notEqual(fixture.config.metricsOrigin, fixture.config.knowledgeOrigin);
  assert.equal((await services.capabilities()).synthetic_only, true);
  assert.equal((await services.explain('客单价')).pack_version, 'crm-knowledge-offline/v1');
  await fixture.stop.metrics();
  assert.equal((await services.capabilities()).reason.code, 'SERVICE_UNAVAILABLE');
  assert.ok((await services.explain('客单价')).decision_ids.includes('D001'));
  await fixture.stop.knowledge();
  assert.equal((await services.explain('客单价')).reason.code, 'SERVICE_UNAVAILABLE');
});
