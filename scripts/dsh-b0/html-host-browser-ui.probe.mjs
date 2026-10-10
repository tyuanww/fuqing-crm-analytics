import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile, rename, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { parseUiProbeArguments } from "./html-host-browser-ui-args.mjs";
import {
  validateProbeInputs,
  verifyReceivedMembers,
} from "./html-host-browser-inputs.mjs";
import {
  cleanupOwnedResources,
  stopOwnedChild,
  installProbeInterruption,
  fetchProbeResponse,
} from "./html-host-browser-cleanup.mjs";

const HELP = `Usage: node scripts/dsh-b0/html-host-browser-ui.probe.mjs
  --input /absolute/reviewed-inputs.json --output /absolute/new/.context/checks/run
  --python /absolute/python3.14 --playwright /absolute/playwright/index.mjs
  [--port 4328] --check | --run-isolated-host
Default port is 4328. The argument parser accepts an integer from 1024 to 65535 other than 6677.
Execution then uses the shared port guard, which allows only 4325-4329 and 14327.
4381 is not an execution port; the guard rejects it. Do not pass it to a run.
Headed Chrome only. A failed headed launch is NOT_RUN and is never retried headless.
Synthetic fixture only. No SDK preparation, real model, business data, or production access.`;
if (process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const options = parseUiProbeArguments(process.argv.slice(2));
const verified = await validateProbeInputs(options);
const { root, output: out, input, upstream } = verified;
const base = dirname(fileURLToPath(import.meta.url));
if (options.check) {
  console.log(
    JSON.stringify({
      status: "PASS",
      scope: "read-only-html-ui-probe-inputs",
      headed: options.run ? "REQUIRED" : "NOT_RUN",
      headless_fallback: false,
      archive_sha256: input.archive_sha256,
      source_count: verified.source_count,
      release_ready: false,
    }),
  );
  process.exit(0);
}
assert.equal(options.headed, true, "HTML_UI_PROBE_HEADED_REQUIRED");
assert.equal(options.headlessFallback, false, "HTML_UI_PROBE_NO_HEADLESS_FALLBACK");

const observedScripts = {};
for (const name of [
  "html-host-browser-ui.probe.mjs",
  "html-host-browser-ui-args.mjs",
  "html-host-browser-inputs.mjs",
  "html-host-browser-cleanup.mjs",
  "html-host-browser-host.fixture.mjs",
  "html-host-browser-http.fixture.py",
]) {
  observedScripts[name] = await readFile(join(base, name));
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const backendProvenance = {};
for (const name of [
  "backend/services/analytics/page_documents.py",
  "backend/services/analytics/cockpit_ai.py",
  "backend/services/analytics/page_documents_routes.py",
  "backend/contracts/page_documents.py",
]) {
  backendProvenance[name] = sha(await readFile(join(root, name)));
}
const origin = "http://127.0.0.1:" + options.port;
const { assertFree } = await import(
  pathToFileURL(join(root, "scripts/dsh-dev/ports.mjs")).href
);
await assertFree(options.port);
await mkdir(out, { mode: 0o700 });
const harnessProvenance = {};
for (const [name, bytes] of Object.entries(observedScripts)) {
  harnessProvenance[name] = sha(bytes);
}
for (const n of ["home", "tmp", "workspace", "dsh-home", "agents-home", "dsh-plugins"]) {
  await mkdir(join(out, n), { mode: 0o700 });
}
const json = (name, value) =>
  writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const rows = [];
const errors = [];
const network = [];
const owned = [];
let httpChild, host, browser, model, httpExit, hostExit, page;
let httpLog = "";
let hostLog = "";
let headedState = "NOT_RUN";
let headedReason = null;
let browserVersion = null;
let windowBounds = null;
const launchOptions = {
  channel: "chrome",
  headless: false,
  handleSIGINT: false,
  handleSIGTERM: false,
  args: ["--use-mock-keychain", "--no-first-run", "--disable-sync"],
};
let cleanup = {};
let browserClosing;
const closeBrowser = () => browserClosing ??= browser.close();
const record = (id, ok, details = {}) => {
  rows.push({ id, status: ok ? "PASS" : "FAIL", ...details });
  console.log((ok ? "PASS " : "FAIL ") + id);
  if (!ok) process.exitCode = 1;
};
const shot = async (name) => {
  if (!page || page.isClosed()) return;
  await page.screenshot({ path: join(out, name), timeout: 8000 });
};

await json("execution-inputs.json", {
  source_state: input.source_state,
  source_count: verified.source_count,
  input_sha256: verified.input_sha256,
  archive_sha256: input.archive_sha256,
  backend: backendProvenance,
  harness: harnessProvenance,
  headed_required: true,
  headless_fallback: false,
  real_model: "NOT_RUN",
  release_ready: false,
});
const interruption = installProbeInterruption(() => {
  for (const child of [host, httpChild]) {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGTERM"); } catch (error) { errors.push(error.message); }
    }
  }
  if (browser) void closeBrowser().catch((error) => errors.push(error.message));
  model?.closeAllConnections();
}, { timeoutMs: 600000 });
const probeRequest = (url, init) =>
  fetchProbeResponse(url, init, { signal: interruption.signal, timeoutMs: 15000 });

try {
  assert.equal(sha(await readFile(input.archive)), input.archive_sha256);
  execFileSync(options.python, [
    join(root, "scripts/release/secure-unpack.py"),
    input.archive, join(out, "extracted"),
    "--max-entries", "100", "--max-bytes", "20971520",
  ], { cwd: out, timeout: 30000, encoding: "utf8" });
  await verifyReceivedMembers(join(out, "extracted"), input.package_files);
  await rename(join(out, "extracted/package"), join(out, "dsh-plugins/workbench"));
  await symlink(upstream, join(out, "upstream"), "dir");
  const { materializePluginPeerLinks } = await import(
    pathToFileURL(join(root, "scripts/release/promotion.mjs")).href
  );
  const { findReadyUrl, redactLaunchLog } = await import(
    pathToFileURL(join(root, "scripts/dsh-dev/launch-url.mjs")).href
  );
  const peer = await materializePluginPeerLinks(out);
  const installed = join(out, "dsh-plugins/workbench");
  await json("package-install.json", { archive_sha256: input.archive_sha256, peer });
  record("immutable-plugin-safe-receive-and-peer-link", true, {
    members: Object.keys(input.package_files).length,
  });
  interruption.signal.throwIfAborted();
  httpChild = spawn(options.python, [
    join(base, "html-host-browser-http.fixture.py"),
    join(out, "http-state"),
    origin,
  ], {
    cwd: root,
    env: {
      PATH: dirname(process.execPath) + ":/usr/bin:/bin",
      PYTHONPATH: root,
      PYTHONNOUSERSITE: "1",
      PYTHON_DOTENV_DISABLED: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  owned.push(httpChild.pid);
  httpExit = new Promise((resolve) => {
    httpChild.once("error", (error) => resolve({ error: error.message }));
    httpChild.once("exit", (code, signal) => resolve({ code, signal }));
  });
  httpChild.stderr.on("data", (chunk) => { httpLog += chunk; });
  const lines = createInterface({ input: httpChild.stdout });
  let readyTimer;
  const ready = await Promise.race([
    interruption.aborted.then((reason) => { throw reason; }),
    new Promise((resolve, reject) => lines.once("line", (line) => {
      try { resolve(JSON.parse(line)); } catch (error) { reject(error); }
    })),
    httpExit.then((result) => { throw new Error("HTTP_START " + JSON.stringify(result) + httpLog); }),
    new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error("HTTP_READY_TIMEOUT")), 15000); }),
  ]).finally(() => { clearTimeout(readyTimer); lines.close(); });
  assert.equal(ready.contains_real_data, false);
  const httpOrigin = "http://127.0.0.1:" + ready.port;
  const token = "html-host-isolated-synthetic-token-32chars";
  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
  const api = async (path, body, key, expected) => {
    const response = await probeRequest(httpOrigin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...headers, ...(key ? { "idempotency-key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    assert.equal(response.status, expected ?? 200, JSON.stringify(payload));
    return payload;
  };
  const prefix = "/api/v1/analytics/page-documents";
  const content = "<!doctype html><html><head><style>body{margin:16px}section{padding:12px}button,a,input{min-height:24px}#nested{color:rgb(40,40,40)}</style></head><body><section id=\"parent\"><h1 id=\"heading\">合成 HTML 标题</h1><p id=\"nested\">可编辑嵌套文字 <span id=\"child\">子元素文字</span></p><button id=\"action\" onclick=\"window.actionCount++\">动作按钮</button><a id=\"link\" href=\"#destination\" onclick=\"window.actionCount++\">页内链接</a><form id=\"form\" onsubmit=\"window.actionCount++;event.preventDefault()\"><input id=\"input\" value=\"synthetic\"><button id=\"submit\" type=\"submit\">表单提交</button></form><p id=\"destination\">目标内容</p></section><script>window.actionCount=0;</script></body></html>";
  const generate = async (title, pkg, binding) => {
    const preview = await api(prefix + "/previews", {
      title, session_id: "html-host-synthetic", package: pkg,
      ...(binding ? { binding_manifest: binding } : {}),
    }, null, 201);
    return (await api(prefix + "/previews/" + preview.preview_id + "/confirm", {}, "ui-seed-" + title)).spec;
  };
  const plain = await generate("html-ui-plain", { html: content, css: "", js: "", resources: [], node_map: [] });
  const second = await generate("html-ui-second", {
    html: "<main><h1 id=\"second\">第二页面原文</h1></main>", css: "", js: "", resources: [], node_map: [],
  });
  const boundPkg = {
    html: "<div data-shine-node=\"n_title\">绑定合成指标：10</div>",
    css: "[data-shine-node=\"n_title\"]{color:#333333}",
    js: "",
    resources: [],
    node_map: [{ node_id: "n_title", kind: "static_element", selector: "[data-shine-node=\"n_title\"]" }],
  };
  const bound = await generate("html-ui-bound", boundPkg, {
    result_refs: ["result_fixture_1"],
    bindings: [{ binding_id: "bind_1", result_ref: "result_fixture_1", node_id: "n_title" }],
  });
  await json("seed-pages.json", { plain, second, bound, synthetic: true, real_model: "NOT_RUN" });
  model = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      network.push({ path: req.url, bytes: Buffer.byteLength(body), scope: "synthetic-text-only" });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
    });
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  const modelOrigin = "http://127.0.0.1:" + model.address().port;
  const patch = join(out, "host.patch.json");
  await writeFile(patch, JSON.stringify([
    ...["session-title-llm", "llm-pi-ai", "web-search-deepseek", "web-fetch-http", "session-telemetry-otel", "session-log-deepseek", "plugin-package-inventory-deepseek", "hmr"].map((id) => ({ id, disabled: true })),
    { id: "llm-deepseek", config: { apiKeyEnv: "DEEPSEEK_API_KEY", baseURL: modelOrigin, thinking: "disabled", reasoningEffort: "off", maxTokens: 1024, retryPolicy: { mode: "normal", maxRetries: 0 } } },
    { insert: [
      { id: "owned-html-workbench", name: pathToFileURL(join(installed, "lib/index.js")).href },
      { id: "owned-html-fixture", name: pathToFileURL(join(base, "html-host-browser-host.fixture.mjs")).href, config: { upstream, workspace: join(out, "workspace"), httpOrigin } },
    ] },
  ]), { mode: 0o600 });
  interruption.signal.throwIfAborted();
  host = spawn(process.execPath, [
    join(upstream, "apps/cli/lib/bin.js"),
    "--profile", "web", "--patch", patch, "--host", "127.0.0.1",
    "--port", String(options.port), "--no-open",
  ], {
    cwd: join(out, "workspace"),
    env: {
      PATH: dirname(process.execPath) + ":/usr/bin:/bin",
      HOME: join(out, "home"),
      TMPDIR: join(out, "tmp"),
      DSH_HOME: join(out, "dsh-home"),
      DSH_AGENTS_HOME: join(out, "agents-home"),
      DSH_TELEMETRY_DISABLED: "1",
      DSH_ANALYTICS_UI_ONLY: "1",
      DEEPSEEK_API_KEY: "synthetic",
      DEEPSEEK_BASE_URL: modelOrigin,
      COMPETITION_HTTP_BASE: httpOrigin,
      COMPETITION_HTTP_TOKEN: token,
      SHINE_BOARD: "on",
      SHINE_QUERY: "off",
      LANG: "en_US.UTF-8",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  owned.push(host.pid);
  hostExit = new Promise((resolve) => {
    host.once("error", (error) => resolve({ error: error.message }));
    host.once("exit", (code, signal) => resolve({ code, signal }));
  });
  host.stdout.on("data", (chunk) => { hostLog = (hostLog + chunk).slice(-2 * 1024 * 1024); });
  host.stderr.on("data", (chunk) => { hostLog = (hostLog + chunk).slice(-2 * 1024 * 1024); });
  let launch;
  const deadline = Date.now() + 60000;
  while (!launch && Date.now() < deadline && host.exitCode === null && host.signalCode === null) {
    interruption.signal.throwIfAborted();
    launch = findReadyUrl(hostLog, origin);
    await sleep(100);
  }
  assert.ok(launch, "HOST_NOT_READY " + redactLaunchLog(hostLog));
  const exchanged = await probeRequest(launch, { redirect: "manual" });
  const cookie = exchanged.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
  await exchanged.arrayBuffer();
  assert.ok(cookie);
  let rpc = 0;
  const native = async (method, request) => {
    const response = await probeRequest(origin + "/api/" + method, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "html-ui-" + ++rpc, method, payload: { args: { request } } }),
    });
    const payload = await response.json();
    assert.equal(payload.result?.ok, true, JSON.stringify(payload));
    return payload.result.value;
  };
  const workspaceInfo = await native("workspace/create", { path: join(out, "workspace") });
  await native("session/create", { workspaceId: workspaceInfo.workspace.workspaceId, sessionId: "html-host-synthetic" });
  const seeded = await probeRequest(origin + "/__html_host_seed__", { method: "POST", headers: { cookie, origin } });
  assert.equal(seeded.status, 200, await seeded.text());
  const { chromium } = await import(pathToFileURL(options.playwright).href);
  interruption.signal.throwIfAborted();
  try {
    browser = await chromium.launch(launchOptions);
    headedState = "RUN";
    browserVersion = browser.version();
  } catch (error) {
    headedState = "NOT_RUN";
    headedReason = error instanceof Error ? error.message : String(error);
    record("headed-chrome-launch", false, {
      headed: "NOT_RUN",
      headless_fallback: false,
      detail: headedReason,
    });
    throw error;
  }
  try {
    const session = await browser.newBrowserCDPSession();
    const target = await session.send("Browser.getWindowForTarget");
    windowBounds = (await session.send("Browser.getWindowBounds", { windowId: target.windowId })).bounds;
    await session.detach();
  } catch (error) {
    windowBounds = { unavailable: error instanceof Error ? error.message : String(error) };
  }
  record("headed-chrome-launch", true, {
    headed: "RUN",
    headless: false,
    browser: browserVersion,
    window: windowBounds,
    profile: "playwright-temporary",
    personal_profile: "NOT_READ",
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if ([origin, httpOrigin].includes(url.origin) || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    return route.abort("blockedbyclient");
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(launch);
  const continuation = page.getByRole("button", { name: "继续", exact: true });
  await continuation.waitFor();
  await continuation.click();
  await page.locator('[data-row-key="session:html-host-synthetic"]').click();
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor();
  await page.getByRole("button", { name: "驾驶舱", exact: true }).click();
  const workspace = page.getByTestId("library-workspace");
  await workspace.waitFor();
  const idle = () => page.waitForFunction(() => document.querySelector('[data-testid="library-workspace"]')?.getAttribute("aria-busy") !== "true");
  const frame = page.frameLocator('[data-testid="library-html-preview"]');
  const versionOf = async (spec) => (await api(prefix + "/pages/" + spec.page_id)).spec;
  const overlayText = (spec) => (spec?.package?.presentation?.edits ?? [])
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join("\n");
  const openPage = async (spec) => {
    const item = page.locator('[data-product-id="page:' + spec.page_id + '"] .cockpit-product');
    await item.waitFor({ state: "attached" });
    if (!(await item.isVisible())) await workspace.getByRole("button", { name: "产物列表", exact: true }).click();
    await item.click();
    await page.getByTestId("library-html-preview").waitFor();
    await idle();
  };
  const activeInfo = () => page.evaluate(() => {
    const el = document.activeElement;
    const root = document.querySelector('[data-testid="library-workspace"]');
    return {
      testid: el?.getAttribute?.("data-testid") ?? null,
      label: el?.getAttribute?.("aria-label") ?? null,
      text: (el?.innerText || "").replace(/\s+/g, " ").slice(0, 80),
      insideWorkspace: Boolean(el && root?.contains(el)),
      tag: el?.tagName ?? null,
    };
  });
  const liveText = () => page.evaluate(() => [...document.querySelectorAll("[aria-live], [role=status], [role=alert]")].map((node) => ({
    role: node.getAttribute("role"),
    live: node.getAttribute("aria-live"),
    testid: node.getAttribute("data-testid"),
    text: (node.innerText || "").replace(/\s+/g, " ").slice(0, 240),
  })));
  const boxOf = async (locator) => {
    if (!(await locator.count()) || !(await locator.first().isVisible())) return { present: false };
    const data = await locator.first().evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        present: true, width: rect.width, height: rect.height, x: rect.x, y: rect.y,
        text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 80),
        disabled: Boolean(el.disabled),
        background: style.backgroundColor, color: style.color, fontWeight: style.fontWeight,
        textDecoration: style.textDecorationLine, borderStyle: style.borderStyle, borderWidth: style.borderTopWidth,
      };
    });
    const view = page.viewportSize();
    data.inViewport = data.x < view.width && data.y < view.height && data.x + data.width > 0 && data.y + data.height > 0;
    data.meets44 = data.width >= 43.5 && data.height >= 43.5;
    return data;
  };
  const overflowOf = () => page.evaluate(() => {
    const root = document.querySelector('[data-testid="library-workspace"]');
    const doc = document.documentElement;
    return {
      page: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth },
      workspace: root ? { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth } : null,
    };
  });
  const reveal = async (name) => {
    const button = workspace.getByRole("button", { name, exact: true });
    if (await button.count() && await button.isVisible()) return boxOf(button);
    const toggle = workspace.getByRole("button", { name: /^画布预览/ });
    if (await toggle.count() && await toggle.isVisible()) await toggle.click();
    if (!(await button.count()) || !(await button.isVisible())) return { present: false, revealed_by: "unavailable" };
    const box = await boxOf(button);
    box.revealed_by = "画布预览";
    return box;
  };

  await openPage(plain);
  await shot("01-headed-1280-open.png");
  record("headed-open-saved-html", true, { viewport: page.viewportSize(), browser: browserVersion });

  await phase("edit-nested-preview-cancel-save-readback", async () => {
    const edit = workspace.getByTestId("cockpit-edit-btn");
    await edit.focus();
    await page.keyboard.press("Enter");
    await idle();
    const entered = await activeInfo();
    const enteredLive = await liveText();
    await frame.locator("#child[data-cockpit-target]").waitFor();
    await frame.locator("#child").focus();
    await frame.locator("#child").press("Enter");
    await page.getByTestId("html-replacement").waitFor();
    const childValue = await page.getByTestId("html-replacement").inputValue();
    await frame.locator("#heading").focus();
    await frame.locator("#heading").press("Enter");
    const headingValue = await page.getByTestId("html-replacement").inputValue();
    record("keyboard-enter-edit-and-nested-selection", childValue === "子元素文字" && headingValue === "合成 HTML 标题" && enteredLive.some((item) => item.testid === "library-live" && /编辑/.test(item.text)), {
      entered_focus: entered, childValue, headingValue,
      live: enteredLive, live_mentions_edit: enteredLive.some((item) => /编辑/.test(item.text)),
    });
    for (const id of ["action", "link", "submit"]) await frame.locator("#" + id).click();
    const actions = await frame.locator("body").evaluate(() => ({ count: window.actionCount, hash: location.hash }));
    record("edit-mode-blocks-button-link-and-form", actions.count === 0 && actions.hash === "", actions);
    await page.getByTestId("html-replacement").fill("界面验收待取消");
    await frame.getByText("界面验收待取消", { exact: true }).waitFor();
    assert.equal((await versionOf(plain)).version, 1);
    await page.getByTestId("html-replacement").focus();
    await page.keyboard.press("Escape");
    const leave = page.getByTestId("leave-prompt");
    const leaveVisible = await leave.isVisible().catch(() => false);
    if (leaveVisible) await page.getByTestId("leave-discard").click();
    await idle();
    const afterCancel = await frame.locator("body").innerText();
    const cancelVersion = (await versionOf(plain)).version;
    record("inline-preview-cancel-keeps-saved-version", cancelVersion === 1 && !afterCancel.includes("界面验收待取消"), {
      leave_prompt: leaveVisible, version: cancelVersion,
    });
    await shot("02-after-cancel.png");
    if ((await edit.getAttribute("aria-pressed")) !== "true") {
      await edit.focus();
      await page.keyboard.press("Enter");
      await idle();
    }
    await frame.locator("#heading[data-cockpit-target]").click();
    await page.getByTestId("html-replacement").fill("界面验收已保存");
    await frame.getByText("界面验收已保存", { exact: true }).waitFor();
    await edit.click();
    await idle();
    await frame.getByText("界面验收已保存", { exact: true }).waitFor();
    const saved = await versionOf(plain);
    const savedPresentation = overlayText(saved).includes("界面验收已保存");
    record("explicit-save-then-version-readback", saved.version === 2 && savedPresentation, {
      version: saved.version,
      html_contains_saved_text: saved.package.html.includes("界面验收已保存"),
      presentation_contains_saved_text: savedPresentation,
      readback: "presentation.edits text",
    });
    await shot("03-saved-v2.png");
  });

  await phase("version-preview-cancel-then-confirm", async () => {
    await workspace.getByRole("button", { name: "版本历史", exact: true }).click();
    await idle();
    const rollback = workspace.locator(".cockpit-history-row").filter({ hasText: "版本 1" }).getByRole("button", { name: "预览回退", exact: true });
    await rollback.waitFor();
    await rollback.click();
    await page.getByTestId("html-patch-preview").waitFor();
    assert.equal((await versionOf(plain)).version, 2);
    const sizes = {};
    for (const width of [1280, 768, 375, 320]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : width >= 768 ? 1024 : 812 });
      await sleep(200);
      const cancel = await reveal("取消预览");
      const confirm = await reveal("确认保存");
      const history = await boxOf(workspace.getByRole("button", { name: "版本历史", exact: true }));
      const edit = await boxOf(workspace.getByTestId("cockpit-edit-btn"));
      let cancelOperable = false;
      let confirmOperable = false;
      if (cancel.present) cancelOperable = await workspace.getByRole("button", { name: "取消预览", exact: true }).click({ trial: true }).then(() => true, () => false);
      if (confirm.present) confirmOperable = await page.getByTestId("html-confirm").click({ trial: true }).then(() => true, () => false);
      const flow = await overflowOf();
      sizes[String(width)] = { cancel, confirm, history, edit, cancelOperable, confirmOperable, flow };
      await shot("viewport-" + width + ".png");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await json("viewport-measurements.json", sizes);
    const tooSmall = Object.values(sizes).some((item) =>
      [item.cancel, item.confirm, item.history, item.edit].some((box) => box.present && !box.meets44));
    const hidden = Object.values(sizes).some((item) =>
      [item.cancel, item.confirm, item.history, item.edit].some((box) => !box.present) || !item.cancelOperable || !item.confirmOperable);
    const pluginOverflow = Object.entries(sizes).filter(([, item]) => item.flow.workspace && item.flow.workspace.scrollWidth > item.flow.workspace.clientWidth + 1).map(([width]) => Number(width));
    record("viewport-cancel-save-history-visible-and-44px", !tooSmall && !hidden && pluginOverflow.length === 0, {
      too_small: tooSmall, hidden, plugin_overflow_widths: pluginOverflow, method: "playwright-setViewportSize", device: "NOT_RUN",
    });
    const cancelBox = sizes["1280"].cancel;
    await workspace.getByRole("button", { name: "取消预览", exact: true }).click();
    await idle();
    const stayed = await versionOf(plain);
    const stayedPresentation = overlayText(stayed).includes("界面验收已保存");
    record("rollback-preview-cancel-keeps-v2", stayed.version === 2 && stayedPresentation, {
      version: stayed.version, cancel_box: cancelBox,
      html_contains_saved_text: stayed.package.html.includes("界面验收已保存"),
      presentation_contains_saved_text: stayedPresentation,
      readback: "presentation.edits text",
    });
    await workspace.getByRole("button", { name: "版本历史", exact: true }).click();
    const rollbackAgain = workspace.locator(".cockpit-history-row").filter({ hasText: "版本 1" }).getByRole("button", { name: "预览回退", exact: true });
    await rollbackAgain.waitFor();
    await rollbackAgain.click();
    await page.getByTestId("html-confirm").click();
    await idle();
    const rolled = await versionOf(plain);
    const visible = await frame.locator("body").innerText();
    record("rollback-confirm-readback-v3", rolled.version === 3 && visible.includes("合成 HTML 标题") && !visible.includes("界面验收已保存"), {
      version: rolled.version,
    });
    await shot("04-rollback-v3.png");
  });

  await phase("keyboard-focus-live-region", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const edit = workspace.getByTestId("cockpit-edit-btn");
    await edit.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const ring = await edit.evaluate((el) => {
      const style = getComputedStyle(el);
      let node = el.parentElement;
      let background = "rgb(255, 255, 255)";
      while (node) {
        const color = getComputedStyle(node).backgroundColor;
        const match = color.match(/[\d.]+/g)?.map(Number);
        if (match && (match.length < 4 || match[3] > 0.9)) { background = color; break; }
        node = node.parentElement;
      }
      return {
        outline: style.outline, outlineColor: style.outlineColor, offset: style.outlineOffset, background,
        focusVisible: el.matches(":focus-visible"), active: document.activeElement === el,
      };
    });
    const ratio = contrast(ring.outlineColor, ring.background);
    record("focus-ring-contrast-on-edit-action", ring.focusVisible && ring.active && Number.isFinite(ratio) && ratio >= 3 && !/none/.test(ring.outline), {
      ...ring, contrast: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null, threshold: 3,
      method: "keyboard-tab-focus-visible-computed-style", screen_reader: "NOT_RUN",
    });
    if ((await edit.getAttribute("aria-pressed")) !== "true") {
      await edit.focus();
      await page.keyboard.press("Enter");
      await idle();
    }
    await frame.locator("#child[data-cockpit-target]").waitFor();
    await frame.locator("#child").focus();
    await frame.locator("#child").press("Enter");
    await page.getByTestId("html-replacement").waitFor();
    await frame.locator("#child").press("Escape");
    await sleep(200);
    const afterFirstEscape = (await edit.getAttribute("aria-pressed")) === "true";
    const selectionCleared = (await page.getByTestId("html-replacement").count()) === 0;
    await frame.locator("body").press("Escape");
    await sleep(200);
    const stillEditing = (await edit.getAttribute("aria-pressed")) === "true";
    record("escape-inside-preview-exits-edit", afterFirstEscape && selectionCleared && !stillEditing, {
      aria_pressed_after_first_escape: afterFirstEscape,
      selection_cleared_before_exit: selectionCleared,
      aria_pressed_after_second_escape: stillEditing,
      note: "first iframe Escape clears the selection; second iframe Escape asks the parent to exit",
    });
    // Exercise the parent shortcut from an editing state, independently of iframe Escape.
    if ((await edit.getAttribute("aria-pressed")) !== "true") {
      await edit.click();
      await idle();
    }
    const parentBefore = await edit.getAttribute("aria-pressed");
    await edit.focus();
    await page.keyboard.press("Escape");
    await sleep(200);
    const afterParent = await edit.getAttribute("aria-pressed");
    record("escape-on-parent-exits-edit", parentBefore === "true" && afterParent !== "true", {
      aria_pressed_before: parentBefore, aria_pressed: afterParent,
    });
    if (afterParent !== "true") {
      await edit.focus();
      await page.keyboard.press("Enter");
      await idle();
    }
    await page.getByTestId("cockpit-sidebar-close").focus();
    await page.keyboard.press("Enter");
    await sleep(200);
    const restored = await activeInfo();
    record("sidebar-close-restores-focus", restored.testid === "cockpit-edit-btn", { restored });
    await edit.focus();
    await page.keyboard.press("Enter");
    await idle();
    const sequence = [];
    for (let index = 0; index < 50; index += 1) {
      await page.keyboard.press("Tab");
      const info = await activeInfo();
      sequence.push(info);
      if (info?.testid === "cockpit-sidebar-close") break;
    }
    const names = sequence.map((item) => item?.testid || item?.label || item?.text).filter(Boolean);
    record("tab-order-reaches-editor-close", names.includes("cockpit-sidebar-close"), { sequence: names });
    await json("keyboard-sequence.json", sequence);
    await page.setViewportSize({ width: 768, height: 1024 });
    await sleep(150);
    const settingsToggle = workspace.getByRole("button", { name: /^编辑设置/ });
    let openedMobileSettings = false;
    if (await settingsToggle.count() && await settingsToggle.isVisible() && !(await page.getByTestId("cockpit-sidebar-close").isVisible().catch(() => false))) {
      await settingsToggle.focus();
      await page.keyboard.press("Enter");
      await sleep(200);
      openedMobileSettings = true;
    }
    const narrowSequence = [];
    await edit.focus();
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press("Tab");
      const info = await activeInfo();
      narrowSequence.push(info?.testid || info?.text || null);
      if (info?.testid === "cockpit-sidebar-close") break;
    }
    record("keyboard-768-reaches-editor-actions", narrowSequence.includes("cockpit-sidebar-close"), {
      sequence: narrowSequence, viewport: "768x1024", opened_mobile_settings_before_tab: openedMobileSettings,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await sleep(150);
    const previewToggle = workspace.getByRole("button", { name: /^画布预览/ });
    const releasedSettings = workspace.getByRole("button", { name: /^编辑设置/ });
    if (await previewToggle.count() && await releasedSettings.count()) {
      if ((await previewToggle.getAttribute("aria-pressed")) !== "true") await previewToggle.click();
      const cue = (el) => {
        const style = getComputedStyle(el);
        return {
          pressed: el.getAttribute("aria-pressed"),
          text: (el.innerText || "").trim(),
          background: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          nonColor: JSON.stringify({
            fontWeight: style.fontWeight,
            textDecoration: style.textDecorationLine,
            borderStyle: style.borderStyle,
            borderWidth: style.borderTopWidth,
            text: (el.innerText || "").trim(),
          }),
        };
      };
      const pressed = await previewToggle.evaluate(cue);
      await releasedSettings.click();
      const released = await previewToggle.evaluate(cue);
      const colorOnly = pressed.nonColor === released.nonColor;
      record("mobile-pressed-state-not-color-only", !colorOnly, { pressed, released });
      await previewToggle.click();
    } else {
      record("mobile-pressed-state-not-color-only", false, { present: false });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  await phase("page-switch-does-not-leak-source-draft", async () => {
    if ((await workspace.getByTestId("cockpit-edit-btn").getAttribute("aria-pressed")) !== "true") {
      await workspace.getByTestId("cockpit-edit-btn").click();
      await idle();
    }
    await workspace.getByRole("button", { name: "来源与源码", exact: true }).click();
    await page.getByTestId("html-source-editor").fill("<p>旧页未保存草稿</p>");
    const item = page.locator('[data-product-id="page:' + second.page_id + '"] .cockpit-product');
    if (!(await item.isVisible())) await workspace.getByRole("button", { name: "产物列表", exact: true }).click();
    await item.click();
    const leave = page.getByTestId("leave-prompt");
    await leave.waitFor();
    await shot("05-leave-prompt.png");
    await page.getByTestId("leave-discard").click();
    await idle();
    await page.getByTestId("library-html-preview").waitFor();
    await workspace.getByRole("button", { name: "来源与源码", exact: true }).click();
    const leaked = (await page.getByTestId("html-source-editor").inputValue()).includes("旧页未保存草稿");
    const title = await frame.locator("body").innerText();
    record("page-switch-never-leaks-source-draft", !leaked && title.includes("第二页面原文"), { leaked });
    if (await page.getByTestId("cockpit-sidebar-close").count()) await page.getByTestId("cockpit-sidebar-close").click();
  });

  await phase("bound-page-css-only", async () => {
    await openPage(bound);
    await workspace.getByTestId("cockpit-edit-btn").click();
    await idle();
    await workspace.getByRole("button", { name: "来源与源码", exact: true }).click();
    const select = page.getByLabel("源码文件");
    await select.selectOption("html");
    const htmlDisabled = await page.getByTestId("html-source-editor").isDisabled();
    const htmlNote = workspace.locator(".cockpit-muted", { hasText: "绑定页面的 HTML/JavaScript 受保护" });
    const htmlLive = await htmlNote.evaluate((el) => Boolean(el.closest("[aria-live], [role=status], [role=alert]"))).catch(() => false);
    await select.selectOption("js");
    const jsDisabled = await page.getByTestId("html-source-editor").isDisabled();
    await select.selectOption("css");
    const cssDisabled = await page.getByTestId("html-source-editor").isDisabled();
    const dataControls = await workspace.evaluate(() => [...document.querySelectorAll("input, textarea, select")].filter((el) => {
      const label = el.getAttribute("aria-label") || el.closest("label")?.innerText || "";
      return /数据来源|数据源|result_ref|binding/i.test(label) && !el.disabled;
    }).map((el) => el.getAttribute("data-testid") || el.tagName));
    record("bound-html-js-and-data-source-rejected-in-ui", htmlDisabled && jsDisabled && !cssDisabled && dataControls.length === 0, {
      htmlDisabled, jsDisabled, cssDisabled, data_source_editors: dataControls, rejection_in_live_region: htmlLive,
    });
    record("bound-rejection-is-live-region", htmlLive, { rejection_in_live_region: htmlLive });
    const before = await versionOf(bound);
    await page.getByTestId("html-source-editor").fill("[data-shine-node=\"n_title\"]{color:#555555}");
    await page.getByTestId("html-source-preview").click();
    await page.getByTestId("html-patch-preview").waitFor();
    await workspace.getByRole("button", { name: "取消预览", exact: true }).click();
    await idle();
    const cancelled = await versionOf(bound);
    record("bound-css-preview-cancel-keeps-version", cancelled.version === before.version && cancelled.package.css === before.package.css, {
      version: cancelled.version,
    });
    await page.getByTestId("html-source-editor").fill("[data-shine-node=\"n_title\"]{color:#555555}");
    await page.getByTestId("html-source-preview").click();
    await page.getByTestId("html-confirm").click();
    await idle();
    const after = await versionOf(bound);
    record("bound-css-confirm-keeps-html-js", after.version === before.version + 1 && after.package.html === before.package.html && after.package.js === before.package.js && after.package.css !== before.package.css, {
      version: after.version,
    });
    await shot("06-bound-css.png");
  });

  await phase("zoom-200-reflow", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 640, height: 450, deviceScaleFactor: 2, mobile: false,
    });
    await sleep(250);
    const edit = await boxOf(workspace.getByTestId("cockpit-edit-btn"));
    let operable = false;
    if (edit.present) operable = await workspace.getByTestId("cockpit-edit-btn").click({ trial: true }).then(() => true, () => false);
    const flow = await overflowOf();
    const live = await liveText();
    await shot("07-zoom-200.png");
    await client.send("Emulation.clearDeviceMetricsOverride");
    await client.detach();
    record("zoom-200-edit-action-operable", edit.present && operable && !(flow.workspace && flow.workspace.scrollWidth > flow.workspace.clientWidth + 1), {
      method: "cdp-Emulation.setDeviceMetricsOverride",
      css_viewport: { width: 640, height: 450 },
      deviceScaleFactor: 2,
      approximates: "1280x900 window at 200% browser zoom",
      browser_zoom_ui: "NOT_RUN",
      edit, operable, flow, live_count: live.length,
    });
  });

  await phase("forced-colors-emulation", async () => {
    const client = await context.newCDPSession(page);
    try {
      await client.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
      await sleep(150);
      const sample = await workspace.getByTestId("cockpit-edit-btn").evaluate((el) => {
        const style = getComputedStyle(el);
        return { text: el.innerText, borderStyle: style.borderStyle, outlineStyle: style.outlineStyle, color: style.color, background: style.backgroundColor };
      });
      await shot("08-forced-colors-emulated.png");
      record("forced-colors-emulated-edit-text-remains", Boolean(sample.text?.trim()), {
        sample, method: "chrome-emulated-forced-colors", windows_high_contrast: "NOT_RUN",
      });
    } finally {
      await client.send("Emulation.setEmulatedMedia", { features: [] }).catch(() => {});
      await client.detach();
    }
  });

  record("no-unhandled-browser-errors", errors.length === 0, { errors });
  await json("network-observation.json", { model_requests: network, real_model: "NOT_RUN", producer: "not-invoked" });

  async function phase(id, action) {
    try {
      await action();
    } catch (error) {
      record(id, false, { detail: String(error?.stack || error).slice(0, 2500) });
      await shot("fail-" + id + ".png").catch(() => {});
    }
  }
} catch (error) {
  if (!rows.some((row) => row.id === "probe")) {
    rows.push({ id: "probe", status: "FAIL", detail: String(error?.stack || error).slice(0, 2500) });
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
  if (page && !interruption.signal.aborted) await shot("failure.png").catch(() => {});
} finally {
  try {
    const actions = [];
    if (browser) actions.push(["browser", closeBrowser, 8000]);
    if (host) actions.push(["host", () => stopOwnedChild({ child: host, exit: hostExit }), 12000]);
    if (model) actions.push(["model", () => {
      model.closeAllConnections();
      return new Promise((resolve, reject) => model.close((error) => error ? reject(error) : resolve()));
    }, 5000]);
    if (httpChild) actions.push(["http", () => stopOwnedChild({
      child: httpChild, exit: httpExit, graceful: () => httpChild.stdin.end(), graceMs: 12000, termMs: 3000, killMs: 3000,
    }), 32000]);
    const { redactLaunchLog } = await import(pathToFileURL(join(root, "scripts/dsh-dev/launch-url.mjs")).href);
    cleanup = await cleanupOwnedResources(actions, [
      ["host.log", () => writeFile(join(out, "host.log"), redactLaunchLog(hostLog))],
      ["http.log", () => writeFile(join(out, "http.log"), httpLog)],
    ]);
    cleanup.owned_pids = owned;
    cleanup.errors.push(...interruption.errors.map((detail) => ({ name: "interrupt", detail })));
    cleanup.all_owned_gone = owned.every((pid) => {
      try { process.kill(pid, 0); return false; } catch (error) { return error.code === "ESRCH"; }
    });
    try { await assertFree(options.port); cleanup.owned_port_free = true; }
    catch { cleanup.owned_port_free = false; }
    if (cleanup.errors.length || !cleanup.all_owned_gone || !cleanup.owned_port_free) {
      rows.push({ id: "owned-cleanup", status: "FAIL" });
      process.exitCode = 1;
    }
    if (interruption.signal.aborted) {
      rows.push({ id: "interrupted", status: "FAIL", detail: interruption.signal.reason?.message });
      process.exitCode = 1;
    }
    await json("results.json", {
      schema: "html-ui-headed-browser-observation/v1",
      input_sha256: verified.input_sha256,
      source_count: verified.source_count,
      owned_port: options.port,
      head: input.head,
      archive_sha256: input.archive_sha256,
      runner_sha256: harnessProvenance["html-host-browser-ui.probe.mjs"],
      rows,
      errors,
      cleanup,
      headed: headedState,
      headless: false,
      headless_fallback: false,
      headed_reason: headedReason,
      browser: browserVersion,
      window: windowBounds,
      launch: { channel: "chrome", headless: false, profile: "playwright-temporary" },
      mobile_device: "NOT_RUN",
      touch_device: "NOT_RUN",
      screen_reader: "NOT_RUN",
      accessibility_scanner: "NOT_RUN",
      real_model: "NOT_RUN",
      wsl: "NOT_RUN",
      production: "NOT_RUN",
      release_ready: false,
      contains_real_data: false,
    });
    console.log(JSON.stringify({
      headed: headedState,
      pass: rows.filter((row) => row.status === "PASS").length,
      fail: rows.filter((row) => row.status === "FAIL").length,
      cleanup_ok: Boolean(cleanup.owned_port_free && cleanup.all_owned_gone),
    }));
  } finally {
    interruption.dispose();
  }
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function contrast(first, second) {
  const parse = (color) => (color.match(/[\d.]+/g) ?? []).map(Number);
  const lum = (parts) => 0.2126 * channel(parts[0] ?? 0) + 0.7152 * channel(parts[1] ?? 0) + 0.0722 * channel(parts[2] ?? 0);
  const [left, right] = [lum(parse(first)), lum(parse(second))].sort((a, b) => b - a);
  return (left + 0.05) / (right + 0.05);
}
