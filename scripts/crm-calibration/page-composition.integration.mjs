/** Actual public page-tool composition from verified fixed packs; no model. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadComposition } from './composition-inputs.mjs';
const runtime = await loadComposition({ scope: 'page', page: true });
after(() => runtime.dispose());
const { Context, mountAgentLoopTestDependencies, crm, page } = runtime;

for (const order of ['crm-first', 'page-first']) {
  test(`${order}: page tools can unload without breaking CRM or native tools`, async t => {
    const ctx = new Context(); t.after(() => ctx.fiber.dispose());
    await mountAgentLoopTestDependencies(ctx);
    const nativeNames = ctx.tools.schemas().map(row => row.name).sort();
    const first = await ctx.plugin(order === 'crm-first' ? crm : page);
    const second = await ctx.plugin(order === 'crm-first' ? page : crm);
    const pageInstance = order === 'crm-first' ? second : first;
    const crmInstance = order === 'crm-first' ? first : second;
    const agent = { session: { id: 'crm-page-composition' } };
    let callId = 0;
    const execute = (name, args = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, callId: `composition-${++callId}`, signal });
    assert.deepEqual((await execute('crm_service_health')).value.page_delivery, { status: 'AVAILABLE', execution: 'NOT_RUN', reason: null });
    const args = { request_id: 'page-gen-composition123', package: { html: '<h1>synthetic fixture</h1>' } };
    const result = await execute('free_html_page_generate', args);
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(result.value.status, 'PACKAGE_RECEIVED');
    assert.equal(result.value.published, false);
    assert.equal(result.value.session_id, agent.session.id);
    assert.equal((await execute('free_html_page_generate', { ...args, package: { html: '' } })).value.status, 'REFUSED');
    const abort = new AbortController(); abort.abort();
    assert.equal((await execute('free_html_page_generate', args, abort.signal)).isError, true);
    await pageInstance.dispose();
    assert.equal((await execute('crm_service_health')).value.page_delivery.status, 'NOT_AVAILABLE');
    assert.equal((await execute('free_html_page_generate', args)).isError, true);
    await crmInstance.dispose();
    assert.deepEqual(ctx.tools.schemas().map(row => row.name).sort(), nativeNames);
  });
}

test('unloading CRM leaves the page provider executable', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await mountAgentLoopTestDependencies(ctx);
  await ctx.plugin(page);
  const instance = await ctx.plugin(crm);
  await instance.dispose();
  assert.equal(ctx.tools.get('crm_service_health'), undefined);
  const result = await ctx.tools.execute({ name: 'free_html_page_generate',
    arguments: { request_id: 'page-gen-independent123', package: { html: '<p>synthetic</p>' } },
    agent: { session: { id: 'page-without-crm' } }, callId: 'page-without-crm', signal: new AbortController().signal });
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.equal(result.value.status, 'PACKAGE_RECEIVED');
});
