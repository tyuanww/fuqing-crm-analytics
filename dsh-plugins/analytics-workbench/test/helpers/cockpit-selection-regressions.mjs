import assert from 'node:assert/strict';

/** Review regressions use the mounted production UI and real isolated HTTP store. */
export async function checkSelectionRegressions({ page, idle, click, check, shot }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const frame = page.frameLocator('[data-testid="library-html-preview"]');
  let serial = 0;
  const importHtml = async html => {
    await page.evaluate(async ({ html, path }) => {
      const store = window.cockpitFixture.pageStore;
      if (store.hasUnsavedChanges()) await store.discardForLeave();
      store.exitEdit();
      await store.previewImport({ html, path, sessionId: 'native_session' });
      if (!store.getSnapshot().importCandidate) throw new Error(store.getSnapshot().message);
      await store.confirmImport();
    }, { html, path: 'selection-regression-' + (++serial) + '.html' });
    await idle(); await click('编辑');
    await page.getByLabel('选择内容').waitFor();
  };
  const choose = label => page.getByLabel('选择内容').selectOption({ label });
  const save = async text => {
    await page.getByTestId('html-replacement').fill(text);
    await click('预览修改'); await click('确认保存');
  };

  await importHtml('<p data-shine-node="source_1">First</p><p>Second</p>');
  await frame.locator('p').nth(1).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="html-replacement"]')?.value === 'Second');
  await choose('p · First'); assert.equal(await page.getByTestId('html-replacement').inputValue(), 'First');
  await choose('p · Second'); assert.equal(await page.getByTestId('html-replacement').inputValue(), 'Second');
  await click('用 AI 修改此选区');
  await page.getByTestId('html-ai-composer').getByRole('textbox').fill('只修改第二段');
  await click('发送并进入对话');
  const selectedHtml = await page.evaluate(() => {
    const scope = window.cockpitFixture.aiClient.getSnapshot().active.selection;
    const html = window.cockpitFixture.pageStore.getSnapshot().current.package.html;
    return [...html].slice(scope.start, scope.end).join('');
  });
  assert.equal(selectedHtml, '<p>Second</p>');
  await click('放弃本次修改');
  await page.getByTestId('html-ai-composer').getByRole('button', { name: '取消', exact: true }).click();
  await save('Edited Second');
  assert.deepEqual(await frame.locator('p').allTextContents(), ['First', 'Edited Second']);
  check('R1：混合映射与临时标识，鼠标/下拉/AI 均定位第二段，保存不误改第一段');

  await importHtml('<section><h1>Editable heading</h1><svg viewBox="0 0 10 10"><path d="M0 0" /></svg><math><mi>x</mi><mspace width="1em" /></math><p>Static footer</p></section>');
  await choose('h1 · Editable heading');
  assert.equal(await frame.locator('svg [data-cockpit-target],math [data-cockpit-target]').count(), 0);
  await click('用 AI 修改此选区');
  await page.getByTestId('html-ai-composer').getByRole('textbox').fill('只修改这个标题');
  await click('发送并进入对话');
  assert.equal(await page.evaluate(() => window.cockpitFixture.aiClient.getSnapshot().active.status), 'WAITING');
  await click('放弃本次修改');
  await page.getByTestId('html-ai-composer').getByRole('button', { name: '取消', exact: true }).click();
  await save('Edited heading');
  assert.equal(await frame.locator('h1').innerText(), 'Edited heading');
  assert.equal(await frame.locator('p').innerText(), 'Static footer');
  assert.equal(await frame.locator('svg path').count(), 1);
  await choose('p · Static footer');
  check('R2：SVG/MathML 自闭合标签旁的静态文字可手动保存、可通过后端 AI 选区校验');

  await importHtml('<html><body><p id="dynamic">Source text</p><p>Static sibling</p><script>document.getElementById("dynamic").textContent="Runtime text";</script></body></html>');
  assert.equal(await frame.locator('#dynamic').innerText(), 'Runtime text');
  assert.notEqual(await frame.locator('#dynamic').getAttribute('data-cockpit-target'), null);
  assert.equal(await page.getByLabel('选择内容').locator('option').filter({ hasText: 'Source text' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '用 AI 修改此选区', exact: true }).count(), 0);
  await choose('p · Static sibling'); await save('Edited sibling');
  assert.equal(await frame.locator('#dynamic').innerText(), 'Runtime text');
  assert.equal(await frame.locator('p').nth(1).innerText(), 'Edited sibling');
  await choose('p · Runtime text'); await save('Edited dynamic display');
  assert.equal(await frame.locator('#dynamic').innerText(), 'Edited dynamic display');
  assert.match(await page.evaluate(() => window.cockpitFixture.pageStore.getSnapshot().current.package.js), /Runtime text/);

  await importHtml('<p id="late">Original late text</p><p>Still static</p><script>window.changeLater=()=>document.getElementById("late").textContent="Changed later";</script>');
  await choose('p · Original late text');
  await page.getByTestId('html-replacement').fill('Keep my draft');
  await frame.locator('#late').evaluate(() => window.changeLater());
  await page.waitForFunction(() => document.querySelector('[data-testid="html-preview-patch"]')?.disabled === false);
  assert.equal(await page.getByTestId('html-replacement').inputValue(), 'Keep my draft');
  assert.equal(await page.getByLabel('选择内容').locator('option').filter({ hasText: 'Original late text' }).count(), 0);
  await click('预览修改'); await click('确认保存');
  assert.equal(await frame.locator('#late').innerText(), 'Keep my draft');
  assert.equal(await page.evaluate(() => window.cockpitFixture.pageStore.getSnapshot().current.version), 2);
  await click('暂停预览'); assert.equal(await page.getByLabel('选择内容').count(), 0);
  await page.locator('.cockpit-document-tools').getByRole('button', { name: '恢复预览', exact: true }).click();
  await idle(); await choose('p · Still static');
  check('R3：具有稳定身份的脚本文字可保存显示修改；延迟重渲染保留草稿、原脚本和其他文字');

  await importHtml('<section><a href="#safe"><span>Dynamic link</span></a><p>Safe text</p></section>');
  // Import already rejects executable URLs; model candidates use a different
  // server path. Exercise the runtime guard with a harmless attribute mutation.
  await frame.locator('a').evaluate(node => node.setAttribute('href', 'javascript:void(0)'));
  await page.waitForFunction(() => [...document.querySelectorAll('select option')].every(node => !node.textContent.includes('Dynamic link')));
  assert.equal(await frame.locator('a [data-cockpit-target],a[data-cockpit-target],section[data-cockpit-target]').count(), 0);
  assert.equal(await page.getByLabel('选择内容').locator('option').filter({ hasText: 'Dynamic link' }).count(), 0);
  await choose('p · Safe text'); await save('Edited safe text');
  assert.equal(await frame.locator('p').innerText(), 'Edited safe text');
  check('R6：动态链接、其祖先和子节点不进入可编辑列表，普通兄弟文字仍可保存');

  await importHtml('<p>Hello<span> world </span>!</p>');
  await choose('span · world');
  assert.equal(await page.getByTestId('html-replacement').inputValue(), ' world ');
  await save(' earth ');
  assert.equal(await frame.locator('p').textContent(), 'Hello earth !');
  const savedHtml = await page.evaluate(() => window.cockpitFixture.pageStore.getSnapshot().current.package.html);
  assert.equal(savedHtml, '<p>Hello<span> earth </span>!</p>');
  check('R4：行内文本编辑保留首尾空格，保存后的源文与显示均正确');

  const startAI = async () => {
    await click('用 AI 改'); await choose('span · earth');
    await page.getByTestId('html-ai-composer').getByRole('textbox').fill('把此处改为 hello');
    await click('发送并进入对话');
  };
  await click('完成编辑'); await startAI(); await click('放弃本次修改');
  const endpoint = '**/api/v1/analytics/cockpit-ai';
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: { message: '隔离验证：新 AI 请求暂不可用' } }) }));
  await startAI();
  assert.equal(await page.getByRole('alert').filter({ hasText: '隔离验证：新 AI 请求暂不可用' }).isVisible(), true);
  assert.equal(await page.locator('.cockpit-ai-complete').getAttribute('open'), null);
  await shot('04-visible-ai-error');
  await page.unroute(endpoint); await startAI();
  assert.equal(await page.getByText('隔离验证：新 AI 请求暂不可用', { exact: true }).count(), 0);
  await click('放弃本次修改');
  check('R5：新 AI 请求失败可见且具有 alert 提示，旧状态保持折叠，重试后错误清除');
}
