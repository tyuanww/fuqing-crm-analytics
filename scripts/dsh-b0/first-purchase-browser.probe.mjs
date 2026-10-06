/** Opt-in Chrome UI test. Fresh context, synthetic credentials, no production profile. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runFirstPurchaseBrowser({ modulePath, host, sessionId, output }) {
  assert.ok(isAbsolute(modulePath));
  const { chromium } = await import(pathToFileURL(modulePath).href);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let context, page;
  const errors = [], rows = [];
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(12000);
    await host.request('attach-workspace', { sessionId });
    const access = await host.request('web-access');
    await page.goto(access.launchUrl);
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.locator(`[data-row-key="session:${sessionId}"]`).click();
    const composer = page.locator('[data-composer-input][contenteditable="true"]');
    await composer.waitFor();
    const submit = async text => { await composer.fill(text); await composer.press('Enter'); };
    await submit('/first-purchase 查看合成首购路径');
    await page.getByText(/NOT_CONNECTED:/).first().waitFor();
    rows.push('native-composer-denies-query-before-crm-login');
    await page.getByRole('button', { name: '连接 CRM', exact: true }).click();
    await page.locator('input[name="username"]').fill('crm-owner');
    await page.locator('input[name="password"]').fill('synthetic-password');
    await page.getByRole('button', { name: '登录并连接当前对话' }).click();
    await page.getByRole('button', { name: 'CRM分析（已连接）' }).waitFor();
    rows.push('native-slot-crm-login');
    await submit('/first-purchase 查看合成首购路径');
    const result = page.getByTestId('analytics-first-purchase-tool-result');
    await result.waitFor({ state: 'attached', timeout: 45000 });
    if (!await result.isVisible()) await page.locator('button[data-turn-process][aria-expanded="false"]').click();
    if (!await result.isVisible()) await page.getByRole('button', { name: '已调用工具', exact: true }).click();
    await result.waitFor();
    assert.match(await result.innerText(), /SYNTHETIC/);
    const save = page.getByTestId('analytics-first-purchase-save-button');
    await save.waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="analytics-first-purchase-save-button"]')?.disabled);
    await save.click();
    await page.getByTestId('analytics-first-purchase-save-status').filter({ hasText: '已保存为独立分析版本。' }).waitFor();
    rows.push('native-command-real-loop-worker-and-confirmed-save');
    for (const name of ['加入驾驶舱', '导出', '发送']) assert.equal(await result.getByRole('button', { name, exact: true }).isDisabled(), true);
    await page.screenshot({ path: join(output, 'browser-saved.png'), fullPage: true });
    await page.reload();
    await page.locator(`[data-row-key="session:${sessionId}"]`).click();
    if (!await result.isVisible()) await page.locator('button[data-turn-process][aria-expanded="false"]').click();
    if (!await result.isVisible()) await page.getByRole('button', { name: '已调用工具', exact: true }).click();
    await page.getByTestId('analytics-first-purchase-save-status').filter({ hasText: '已保存为独立分析版本。' }).waitFor();
    rows.push('reload-reconciles-same-save-intent');
    const nativeSessionId = 'owned-browser-native';
    const native = await host.request('create-native-session', { sessionId: nativeSessionId });
    assert.ok(!native.tool_names.includes('analytics_first_purchase_query'));
    await host.request('attach-workspace', { sessionId: nativeSessionId });
    await page.reload();
    await page.locator(`[data-row-key="session:${sessionId}"]`).waitFor();
    // rc2 deliberately hides blank Sessions from the list. Its native New
    // Session action reuses the workspace's blank Session before creating one.
    await page.getByRole('button', { name: '新建会话', exact: true }).first().click();
    await page.getByText('Owned native', { exact: true }).first().waitFor();
    await submit('普通合成对话，不调用 CRM');
    await page.getByText('SYNTHETIC_NATIVE_FALLBACK_OK', { exact: true }).waitFor();
    rows.push('ordinary-native-composer-without-crm-login-or-business-preset');
    await page.screenshot({ path: join(output, 'browser-native.png'), fullPage: true });
    assert.deepEqual(errors, [], 'official browser page errors');
    return { ok: true, browser: 'Chrome headless', rows };
  } finally {
    try {
      if (page) {
        await writeFile(join(output, 'browser-last.txt'), await page.locator('body').innerText().catch(() => 'unavailable'), { mode: 0o600 });
        await page.screenshot({ path: join(output, 'browser-last.png'), fullPage: true }).catch(() => {});
      }
      await writeFile(join(output, 'browser-observations.json'), JSON.stringify({ rows, errors, driver: 'Chrome headless' }, null, 2), { mode: 0o600 });
    } finally {
      // A setup or evidence-write failure must not strand our Chrome process.
      try { await context?.close(); } finally { await browser.close(); }
    }
  }
}
