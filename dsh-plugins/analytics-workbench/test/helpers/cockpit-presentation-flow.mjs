/** Real browser + owned HTTP + persisted versions. Candidate producer is explicit synthetic, never a model claim. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sourceHash } from '../../src/free-page/presentation/model.mjs';

export async function checkPresentationFlow({ page, origin, backend, check, shot }) {
  const packageSource = process.env.COCKPIT_EXAMPLE_PACKAGE;
  const pkg = packageSource ? JSON.parse(await readFile(packageSource, 'utf8')) : {
    html: '<h1>合成卡片页</h1><button id="switch">切换筛选</button><section id="kpiGrid"></section>', css: '.kpi{padding:24px;margin:20px;border:1px solid #ccc}',
    js: `let count=42;window.render=()=>{kpiGrid.innerHTML='<div class="kpi" data-node="kpi-a"><div class="kpi__label"><span>卡片文案</span></div><div class="kpi__value">'+count+'<small>单</small></div></div><div class="kpi" data-node="kpi-b"><span>其他板块</span></div>';};render();document.querySelector('#switch').onclick=()=>{count++;render();};`, resources: [], node_map: [],
  };
  const prefix = '/api/v1/analytics/page-documents';
  const preview = await backend(prefix + '/previews', { title: 'standalone.html', session_id: 'native_session', package: pkg });
  let saved = (await backend(prefix + '/previews/' + preview.preview_id + '/confirm', {}, 'presentation-seed')).spec;
  await page.goto(origin + '/?ux=1&presentation=1');
  await page.evaluate(() => { window.selectionEvents = []; window.addEventListener('message', e => {
    if (e.data?.type === 'cockpit.selection') window.selectionEvents.push(e.data);
  }); });
  await page.getByTestId('library-html-preview').waitFor();
  const idle = () => page.waitForFunction(() => !window.cockpitFixture.pageStore.getSnapshot().busy && !window.cockpitFixture.aiClient.getSnapshot().busy);
  await page.locator('[data-product-id="page:' + saved.page_id + '"] .cockpit-product').click(); await idle();
  const button = async name => { await page.getByRole('button', { name, exact: true }).click(); await idle(); };
  const frame = page.frameLocator('[data-testid="library-html-preview"]');
  await button('编辑');
  const label = packageSource ? frame.locator('span[data-cockpit-target]').filter({ hasText: /^峰值日$/ }) : frame.locator('.kpi__label span[data-cockpit-target]').first();
  await label.waitFor(); await label.click();
  await page.getByTestId('html-replacement').fill('浏览器验收：新的卡片文案', { timeout: 5000 });
  await button('预览修改'); await button('确认保存');
  saved = (await backend(prefix + '/pages/' + saved.page_id)).spec;
  assert.equal(saved.version, 2); assert.equal(saved.package.js, pkg.js);
  await button('完成编辑');
  if (packageSource) await frame.locator('body').evaluate(() => window.RevenueReview.setScope('weekend'));
  else await frame.locator('#switch').click();
  await frame.getByText('浏览器验收：新的卡片文案', { exact: true }).waitFor();
  check('卡片文案通过真实浏览器与 HTTP 保存，筛选重渲染后保留且原 JS 不变');
  await button('用 AI 改');
  await frame.locator('[data-cockpit-target]').filter({ hasText: /^浏览器验收：新的卡片文案$/ }).click();
  await page.getByTestId('html-ai-composer').getByRole('textbox').fill('把这个卡片的文案改为 AI 确认文案，并加浅灰背景');
  await button('发送并进入对话');
  await page.getByTestId('fixture-native-chat').waitFor();
  const job = await page.evaluate(() => window.cockpitFixture.aiClient.getSnapshot().active);
  assert.ok(job.selection.rendered); assert.ok(job.instruction.includes('浅灰背景'));
  await page.getByTestId('cockpit-native-artifact').waitFor();
  await frame.getByText('浏览器验收：新的卡片文案', { exact: true }).waitFor();
  check('页内点击自动选中整张卡片，要求持久化并进入聊天宿主桩，右栏真实组件显示同一版本');
  const candidate = structuredClone(saved.package), record = candidate.presentation.edits[0];
  record.text = 'AI 确认文案';
  candidate.presentation.source_hash = sourceHash(candidate);
  candidate.presentation.edits.push({ target: { anchor: job.selection.rendered.anchor, path: job.selection.rendered.path }, text: null, style: { 'background-color': '#eeeeee' } });
  assert.ok(job.workspace.includes('library-board-http-'), 'candidate writes must stay in the owned temporary fixture');
  await writeFile(join(job.workspace, job.output_name), JSON.stringify(candidate));
  await page.getByRole('button', { name: '收取修改', exact: true }).click();
  await frame.getByText('AI 确认文案', { exact: true }).waitFor();
  assert.equal(await frame.locator('.kpi').filter({ hasText: 'AI 确认文案' }).evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(238, 238, 238)');
  await page.getByRole('button', { name: '预览原版本', exact: true }).click();
  await frame.getByText('浏览器验收：新的卡片文案', { exact: true }).waitFor();
  const confirmEndpoint = '**/api/v1/analytics/cockpit-ai/' + job.id + '/confirm';
  await page.route(confirmEndpoint, async route => { await route.fetch(); await route.abort('failed'); });
  await page.getByRole('button', { name: '确认保存新版本', exact: true }).click();
  await page.getByRole('button', { name: '重试保存并核对', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="ai-confirm"]')?.disabled === false);
  await page.unroute(confirmEndpoint);
  await page.evaluate(() => window.cockpitFixture.setMounted(false));
  await page.getByTestId('cockpit-native-artifact').waitFor({ state: 'detached' });
  await page.evaluate(job => window.cockpitFixture.openArtifact(job), job);
  await page.getByRole('button', { name: '重试保存并核对', exact: true }).click();
  await page.getByText('AI 修改已保存 · 版本 3', { exact: true }).waitFor();
  await frame.getByText('AI 确认文案', { exact: true }).waitFor();
  saved = (await backend(prefix + '/pages/' + saved.page_id)).spec;
  assert.equal(saved.version, 3); assert.equal(saved.package.js, pkg.js);
  assert.deepEqual(saved.package.presentation, candidate.presentation);
  check('确认已落盘但响应丢失：重建右栏仍保留核对状态，同一候选重试不增加版本');
  await shot('presentation-saved');
  check('右栏从冻结候选统一预览；查看原版后确认保存仍显示新版本，SQLite 源码与选区外内容保持');
  await page.reload(); await page.getByTestId('library-html-preview').waitFor();
  await page.evaluate(job => window.cockpitFixture.openArtifact(job), job);
  await frame.getByText('AI 确认文案', { exact: true }).waitFor();
  if (packageSource) {
    await frame.locator('body').evaluate(() => window.RevenueReview.setScope('all'));
    await frame.getByText('AI 确认文案', { exact: true }).waitFor();
    assert.ok(await frame.locator('#chartBars > *').count());
  }
  check('刷新后右栏重载已保存候选，显示文案和图表交互继续可用；未调用真实模型');
}
