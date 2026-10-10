import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile, rename, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  parseProbeArguments,
  validateProbeInputs,
  verifyReceivedMembers,
} from "./html-host-browser-inputs.mjs";
import {
  cleanupOwnedResources,
  stopOwnedChild,
  installProbeInterruption,
  fetchProbeResponse,
} from "./html-host-browser-cleanup.mjs";
const HELP = `Usage: node scripts/dsh-b0/html-host-browser.probe.mjs
  --input /absolute/reviewed-inputs.json --output /absolute/new/.context/checks/run
  --python /absolute/python3.14 --playwright /absolute/playwright/index.mjs
  [--port 4328] --check | --run-isolated-host
Read-only check or explicit synthetic full official host + headless Chrome. No SDK preparation,
source build, real model, business data or production access. Existing outputs are never adopted.`;
if (process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}
const options = parseProbeArguments(process.argv.slice(2));
const verified = await validateProbeInputs(options);
const { root, output: out, input, upstream } = verified;
const base = dirname(fileURLToPath(import.meta.url));
const observedScripts = {};
for (const name of [
  "html-host-browser.probe.mjs",
  "html-host-browser-inputs.mjs",
  "html-host-browser-cleanup.mjs",
  "html-host-browser-host.fixture.mjs",
  "html-host-browser-http.fixture.py",
]) {
  observedScripts[name] = await readFile(join(base, name));
}
const backendProvenance = {};
for (const name of [
  "backend/services/analytics/page_documents.py",
  "backend/services/analytics/cockpit_ai.py",
  "backend/services/analytics/page_documents_routes.py",
  "backend/contracts/page_documents.py",
]) {
  backendProvenance[name] = createHash("sha256")
    .update(await readFile(join(root, name)))
    .digest("hex");
}
const origin = "http://127.0.0.1:" + options.port;
const { assertFree } = await import(
  pathToFileURL(join(root, "scripts/dsh-dev/ports.mjs")).href
);
await assertFree(options.port);
if (options.check) {
  console.log(
    JSON.stringify({
      status: "PASS",
      scope: "read-only-html-host-inputs",
      archive_sha256: input.archive_sha256,
      source_count: verified.source_count,
      release_ready: false,
    }),
  );
  process.exit(0);
}
await mkdir(out, { mode: 0o700 });
await mkdir(join(out, "harness-snapshots"), { mode: 0o700 });
const harnessProvenance = {};
for (const [name, bytes] of Object.entries(observedScripts)) {
  await writeFile(join(out, "harness-snapshots", name), bytes, {
    mode: 0o600,
    flag: "wx",
  });
  harnessProvenance[name] = createHash("sha256").update(bytes).digest("hex");
}
for (const n of [
  "home",
  "tmp",
  "workspace",
  "dsh-home",
  "agents-home",
  "dsh-plugins",
])
  await mkdir(join(out, n), { mode: 0o700 });
const { materializePluginPeerLinks } = await import(
  pathToFileURL(join(root, "scripts/release/promotion.mjs")).href
);
const { findReadyUrl, redactLaunchLog } = await import(
  pathToFileURL(join(root, "scripts/dsh-dev/launch-url.mjs")).href
);
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  rows = [],
  errors = [],
  network = [],
  owned = [];
let httpChild,
  host,
  browser,
  model,
  httpExit,
  hostExit,
  httpLog = "",
  hostLog = "",
  readyTimer;
let browserClosing;
const closeBrowser = () => browserClosing ??= browser.close();
const check = (id, details = {}) => {
  rows.push({ id, status: "PASS", ...details });
  console.log("PASS " + id);
};
let cleanup = {};
const json = (name, value) =>
  writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
await json("execution-inputs.json", {
  source_state: input.source_state,
  source_count: verified.source_count,
  input_sha256: verified.input_sha256,
  archive_sha256: input.archive_sha256,
  backend: backendProvenance,
  harness: harnessProvenance,
  real_model: "NOT_RUN",
  release_ready: false,
});
const interruption = installProbeInterruption(() => {
  // Only signal instances spawned by this run. Finally owns escalation/reaping.
  for (const child of [host, httpChild]) {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM'); } catch (error) { errors.push(error.message); }
    }
  }
  if (browser) void closeBrowser().catch(error => errors.push(error.message));
  model?.closeAllConnections();
});
const probeRequest = (url, init) => fetchProbeResponse(url, init, { signal: interruption.signal });
try {
  assert.equal(sha(await readFile(input.archive)), input.archive_sha256);
  execFileSync(
    options.python,
    [
      join(root, "scripts/release/secure-unpack.py"),
      input.archive,
      join(out, "extracted"),
      "--max-entries",
      "100",
      "--max-bytes",
      "20971520",
    ],
    { cwd: out, timeout: 30000, encoding: "utf8" },
  );
  await verifyReceivedMembers(join(out, "extracted"), input.package_files);
  await rename(
    join(out, "extracted/package"),
    join(out, "dsh-plugins/workbench"),
  );
  await symlink(upstream, join(out, "upstream"), "dir");
  const peer = await materializePluginPeerLinks(out);
  const installed = join(out, "dsh-plugins/workbench");
  const files = {};
  for (const key of Object.keys(input.package_files)) {
    const rel = key.replace(/^package\//, "");
    const b = await readFile(join(installed, rel));
    files[key] = sha(b);
    assert.equal(files[key], input.package_files[key]);
  }
  await json("package-install.json", {
    archive_sha256: input.archive_sha256,
    files,
    peer,
  });
  check("immutable-plugin-safe-receive-and-peer-link", {
    members: Object.keys(files).length,
  });
  interruption.signal.throwIfAborted();
  httpChild = spawn(
    options.python,
    [
      join(base, "html-host-browser-http.fixture.py"),
      join(out, "http-state"),
      origin,
    ],
    {
      cwd: root,
      env: {
        PATH: dirname(process.execPath) + ":/usr/bin:/bin",
        PYTHONPATH: root,
        PYTHONNOUSERSITE: "1",
        PYTHON_DOTENV_DISABLED: "1",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  owned.push(httpChild.pid);
  httpExit = new Promise((resolve) => {
    httpChild.once("error", (e) => resolve({ error: e.message }));
    httpChild.once("exit", (code, signal) => resolve({ code, signal }));
  });
  httpChild.stderr.on("data", (b) => {
    httpLog += b;
  });
  const lines = createInterface({ input: httpChild.stdout });
  const ready = await Promise.race([
    interruption.aborted.then(reason => { throw reason; }),
    new Promise((resolve, reject) =>
      lines.once("line", (l) => {
        try {
          resolve(JSON.parse(l));
        } catch (e) {
          reject(e);
        }
      }),
    ),
    httpExit.then((x) => {
      throw Error("HTTP_START " + JSON.stringify(x) + httpLog);
    }),
    new Promise((_, reject) => {
      readyTimer = setTimeout(() => reject(Error("HTTP_READY_TIMEOUT")), 15000);
    }),
  ]).finally(() => {
    clearTimeout(readyTimer);
    lines.close();
  });
  assert.equal(ready.contains_real_data, false);
  const httpOrigin = "http://127.0.0.1:" + ready.port,
    token = "html-host-isolated-synthetic-token-32chars",
    headers = {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    };
  const api = async (path, body, key, expected) => {
    const r = await probeRequest(httpOrigin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...headers, ...(key ? { "idempotency-key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const j = await r.json();
    assert.equal(
      r.status,
      expected ?? (body === undefined ? 200 : 200),
      JSON.stringify(j),
    );
    return j;
  };
  const prefix = "/api/v1/analytics/page-documents";
  const content =
    '<!doctype html><html><head><style>body{margin:16px}section{padding:12px}button,a,input{min-height:24px}#nested{color:rgb(40,40,40)}</style></head><body><section id="parent"><h1 id="heading">合成 HTML 标题</h1><p id="nested">可编辑嵌套文字 <span id="child">子元素文字</span></p><button id="action" onclick="window.actionCount++">动作按钮</button><a id="link" href="#destination" onclick="window.actionCount++">页内链接</a><form id="form" onsubmit="window.actionCount++;event.preventDefault()"><input id="input" value="synthetic"><button id="submit" type="submit">表单提交</button></form><p id="destination">目标内容</p><canvas id="canvas" width="30" height="20"></canvas><svg viewBox="0 0 10 10"><path d="M0 0L10 10" /></svg></section><script>window.actionCount=0;</script></body></html>';
  const generate = async (title, pkg, binding) => {
    const p = await api(
      prefix + "/previews",
      {
        title,
        session_id: "html-host-synthetic",
        package: pkg,
        ...(binding ? { binding_manifest: binding } : {}),
      },
      null,
      201,
    );
    assert.equal(
      (await api(prefix + "/pages")).items.some((x) => x.title === title),
      false,
    );
    return (
      await api(
        prefix + "/previews/" + p.preview_id + "/confirm",
        {},
        "seed-" + title,
      )
    ).spec;
  };
  const plain = await generate("html-host-plain", {
    html: content,
    css: "",
    js: "",
    resources: [],
    node_map: [],
  });
  const second = await generate("html-host-second", {
    html: '<main><h1 id="second">第二页面原文</h1></main>',
    css: "",
    js: "",
    resources: [],
    node_map: [],
  });
  const boundPkg = {
    html: '<div data-shine-node="n_title">绑定合成指标：10</div>',
    css: '[data-shine-node="n_title"]{color:#333333}',
    js: "",
    resources: [],
    node_map: [
      {
        node_id: "n_title",
        kind: "static_element",
        selector: '[data-shine-node="n_title"]',
      },
    ],
  };
  const bound = await generate("html-host-bound", boundPkg, {
    result_refs: ["result_fixture_1"],
    bindings: [
      {
        binding_id: "bind_1",
        result_ref: "result_fixture_1",
        node_id: "n_title",
      },
    ],
  });
  await json("seed-pages.json", { plain, second, bound });
  check("generate-preview-explicit-confirm-and-package-contract", {
    pages: 3,
    bound_state: bound.binding_state,
  });
  interruption.signal.throwIfAborted();
  model = createServer((req, res) => {
    let body = "";
    req.on("data", (b) => (body += b));
    req.on("end", () => {
      network.push({
        path: req.url,
        bytes: Buffer.byteLength(body),
        scope: "synthetic-text-only",
      });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = [
        [
          "message_start",
          {
            type: "message_start",
            message: {
              id: "html-fixture",
              type: "message",
              role: "assistant",
              model: "deepseek-v4-flash",
              content: [],
              usage: { input_tokens: 1, output_tokens: 0 },
            },
          },
        ],
        [
          "content_block_start",
          {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "text",
              text: "SYNTHETIC_HTML_HOST_NO_MODEL_WRITE",
            },
          },
        ],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        [
          "message_delta",
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 1 },
          },
        ],
        ["message_stop", { type: "message_stop" }],
      ];
      res.end(
        ev
          .map(
            ([n, d]) => "event: " + n + "\ndata: " + JSON.stringify(d) + "\n\n",
          )
          .join(""),
      );
    });
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  const modelOrigin = "http://127.0.0.1:" + model.address().port;
  const patch = join(out, "host.patch.json");
  await writeFile(
    patch,
    JSON.stringify([
      ...[
        "session-title-llm",
        "llm-pi-ai",
        "web-search-deepseek",
        "web-fetch-http",
        "session-telemetry-otel",
        "session-log-deepseek",
        "plugin-package-inventory-deepseek",
        "hmr",
      ].map((id) => ({ id, disabled: true })),
      {
        id: "llm-deepseek",
        config: {
          apiKeyEnv: "DEEPSEEK_API_KEY",
          baseURL: modelOrigin,
          thinking: "disabled",
          reasoningEffort: "off",
          maxTokens: 1024,
          retryPolicy: { mode: "normal", maxRetries: 0 },
        },
      },
      {
        insert: [
          {
            id: "owned-html-workbench",
            name: pathToFileURL(join(installed, "lib/index.js")).href,
          },
          {
            id: "owned-html-fixture",
            name: pathToFileURL(
              join(base, "html-host-browser-host.fixture.mjs"),
            ).href,
            config: { upstream, workspace: join(out, "workspace"), httpOrigin },
          },
        ],
      },
    ]),
    { mode: 0o600 },
  );
  interruption.signal.throwIfAborted();
  host = spawn(
    process.execPath,
    [
      join(upstream, "apps/cli/lib/bin.js"),
      "--profile",
      "web",
      "--patch",
      patch,
      "--host",
      "127.0.0.1",
      "--port",
      String(options.port),
      "--no-open",
    ],
    {
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
    },
  );
  owned.push(host.pid);
  hostExit = new Promise((resolve) => {
    host.once("error", (e) => resolve({ error: e.message }));
    host.once("exit", (code, signal) => resolve({ code, signal }));
  });
  host.stdout.on("data", (b) => {
    hostLog = (hostLog + b).slice(-2 * 1024 * 1024);
  });
  host.stderr.on("data", (b) => {
    hostLog = (hostLog + b).slice(-2 * 1024 * 1024);
  });
  let launch;
  const deadline = Date.now() + 45000;
  while (
    !launch &&
    Date.now() < deadline &&
    host.exitCode === null &&
    host.signalCode === null
  ) {
    interruption.signal.throwIfAborted();
    launch = findReadyUrl(hostLog, origin);
    await sleep(100);
  }
  assert.ok(launch, "HOST_NOT_READY " + redactLaunchLog(hostLog));
  const exchanged = await probeRequest(launch, { redirect: "manual" });
  const cookie = exchanged.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  await exchanged.arrayBuffer();
  assert.ok(cookie);
  let rpc = 0;
  const native = async (method, request) => {
    const r = await probeRequest(origin + "/api/" + method, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "html-" + ++rpc,
        method,
        payload: { args: { request } },
      }),
    });
    const j = await r.json();
    assert.equal(j.result?.ok, true, JSON.stringify(j));
    return j.result.value;
  };
  const workspace = await native("workspace/create", {
    path: join(out, "workspace"),
  });
  await native("session/create", {
    workspaceId: workspace.workspace.workspaceId,
    sessionId: "html-host-synthetic",
  });
  const seeded = await probeRequest(origin + "/__html_host_seed__", {
    method: "POST",
    headers: { cookie, origin },
  });
  assert.equal(seeded.status, 200, await seeded.text());
  const { chromium } = await import(pathToFileURL(options.playwright).href);
  interruption.signal.throwIfAborted();
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    // The runner owns signal cleanup; Playwright's SIGINT handler exits the
    // entire Node process (130) before our HTTP/host receipt can be written.
    handleSIGINT: false,
    handleSIGTERM: false,
    args: ["--use-mock-keychain"],
  });
  interruption.signal.throwIfAborted();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (
      [origin, httpOrigin].includes(u.origin) ||
      u.protocol === "data:" ||
      u.protocol === "blob:"
    )
      return route.continue();
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(launch);
  const continuation = page.getByRole("button", { name: "继续", exact: true });
  await continuation.waitFor();
  await continuation.click();
  await page.locator('[data-row-key="session:html-host-synthetic"]').click();
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor();
  await page.screenshot({
    path: join(out, "01-native-shell.png"),
    fullPage: true,
  });
  check("exact-official-host-and-original-native-composer", {
    browser: browser.version(),
    port: options.port,
  });
  await page.getByRole("button", { name: "驾驶舱", exact: true }).click();
  await page.getByTestId("library-workspace").waitFor();
  const idle = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="library-workspace"]')
          ?.getAttribute("aria-busy") !== "true",
    );
  const button = async (n) => {
    await page.getByRole("button", { name: n, exact: true }).click();
    await idle();
  };
  const open = async (p) => {
    const item = page.locator(
      '[data-product-id="page:' + p.page_id + '"] .cockpit-product',
    );
    await item.waitFor({ state: "attached" });
    if (!(await item.isVisible())) await button("产物列表");
    await item.click();
    await page.getByTestId("library-html-preview").waitFor();
    await idle();
  };
  await open(plain);
  const frame = page.frameLocator('[data-testid="library-html-preview"]');
  // Edit changes iframe srcdoc asynchronously. A visible #child may still
  // belong to the old read-only document, so wait for the bridge's eligibility
  // marker before dispatching a click (not merely for workspace aria-busy).
  const select = (selector) =>
    frame.locator(selector + "[data-cockpit-target]").click();
  await frame.locator("#heading").waitFor();
  assert.doesNotMatch(
    await frame.locator("body").innerText(),
    /<\/(?:head|body|html)>/i,
  );
  assert.equal(
    await frame
      .locator("body")
      .evaluate(() => getComputedStyle(document.body).marginTop),
    "16px",
  );
  check("immutable-client-slot-loads-and-opens-persisted-html");
  check("full-document-preview-keeps-head-styles-without-wrapper-text");
  await button("编辑");
  await select("#child");
  await page.getByTestId("html-replacement").waitFor();
  assert.equal(
    await page.getByTestId("html-replacement").inputValue(),
    "子元素文字",
  );
  await frame.locator("#heading").click();
  assert.equal(
    await page.getByTestId("html-replacement").inputValue(),
    "合成 HTML 标题",
  );
  check("nested-parent-and-child-selection-do-not-alias");
  for (const id of ["action", "link", "submit"])
    await frame.locator("#" + id).click();
  assert.equal(
    await frame.locator("body").evaluate(() => window.actionCount),
    0,
  );
  assert.equal(await frame.locator("body").evaluate(() => location.hash), "");
  check("edit-mode-blocks-button-link-and-form-actions");
  for (const selector of ["#canvas", "svg"]) {
    await frame.locator(selector).click();
    await button("来源与源码");
    await page.getByTestId("html-source-editor").waitFor();
    assert.ok(
      (await page.getByTestId("html-source-editor").inputValue()).includes(
        selector === "#canvas" ? "<canvas" : "<svg",
      ),
    );
    assert.equal(
      (await api(prefix + "/pages/" + plain.page_id)).spec.version,
      1,
    );
    await page.getByTestId("cockpit-sidebar-close").click();
  }
  check("canvas-and-svg-have-controlled-source-access-without-saving");
  await frame.locator("#heading").click();
  await page.getByTestId("html-replacement").fill("首次真实宿主改字");
  await frame.getByText("首次真实宿主改字", { exact: true }).waitFor();
  assert.equal((await api(prefix + "/pages/" + plain.page_id)).spec.version, 1);
  await page.screenshot({
    path: join(out, "02a-inline-unsaved.png"),
    fullPage: true,
  });
  await button("保存");
  await frame.getByText("首次真实宿主改字", { exact: true }).waitFor();
  assert.equal((await api(prefix + "/pages/" + plain.page_id)).spec.version, 2);
  check("manual-live-preview-does-not-save-until-explicit-toolbar-save");
  await button("版本历史");
  await page
    .locator(".cockpit-history-row")
    .filter({ hasText: "版本 1" })
    .getByRole("button")
    .click();
  await page.getByTestId("html-confirm").click();
  await page
    .getByTestId("library-pathbar")
    .getByText("版本 3", { exact: true })
    .waitFor();
  assert.equal((await api(prefix + "/pages/" + plain.page_id)).spec.version, 3);
  if (await page.getByTestId("cockpit-sidebar-close").count())
    await page.getByTestId("cockpit-sidebar-close").click();
  check("version-history-rollback-creates-v3-preserves-v2");
  await button("来源与源码");
  await page.getByTestId("html-source-editor").fill("<p>旧页未保存草稿</p>");
  await button("放弃源码草稿");
  await open(second);
  await button("来源与源码");
  assert.ok(
    !(await page.getByTestId("html-source-editor").inputValue()).includes(
      "旧页未保存草稿",
    ),
  );
  if (await page.getByTestId("cockpit-sidebar-close").count())
    await page.getByTestId("cockpit-sidebar-close").click();
  check("page-switch-never-leaks-source-draft");
  await open(bound);
  await button("编辑");
  await select('[data-shine-node="n_title"]');
  await page
    .getByRole("button", { name: "用 AI 修改此选区", exact: true })
    .click();
  await page
    .getByTestId("html-ai-composer")
    .getByRole("textbox")
    .fill("仅修改当前绑定页的 CSS 颜色");
  await button("发送并进入对话");
  await page.getByTestId("html-source-editor").waitFor();
  await page.getByLabel("源码文件").selectOption("html");
  assert.equal(await page.getByTestId("html-source-editor").isDisabled(), true);
  await page.getByLabel("源码文件").selectOption("js");
  assert.equal(await page.getByTestId("html-source-editor").isDisabled(), true);
  await page.getByLabel("源码文件").selectOption("css");
  assert.equal(
    await page.getByTestId("html-source-editor").isDisabled(),
    false,
  );
  check("bound-ai-selection-routes-to-css-only-controlled-source");
  const boundSource = (await api(prefix + "/pages/" + bound.page_id)).spec;
  await page
    .getByTestId("html-source-editor")
    .fill('[data-shine-node="n_title"]{color:#555555}');
  await page.getByTestId("html-source-preview").click();
  await page.getByTestId("html-confirm").click();
  await page
    .getByTestId("library-pathbar")
    .getByText("版本 2", { exact: true })
    .waitFor();
  const boundAfter = (await api(prefix + "/pages/" + bound.page_id)).spec;
  assert.equal(boundAfter.version, 2);
  assert.equal(boundAfter.package.html, boundSource.package.html);
  assert.equal(boundAfter.package.js, boundSource.package.js);
  assert.notEqual(boundAfter.package.css, boundSource.package.css);
  check("bound-css-only-change-keeps-html-js-resources-mappings");
  await page.screenshot({
    path: join(out, "02-bound-css.png"),
    fullPage: true,
  });

  await json("versions-before-ai.json", {
    plain: (await api(prefix + "/pages/" + plain.page_id)).spec,
    bound: boundAfter,
  });
  const aiPrefix = "/api/v1/analytics/cockpit-ai";
  const produce = async (job, pkg, label) => {
    const ws = join(out, "http-state/pages/files/ai-workspaces");
    assert.ok(job.workspace.startsWith(ws + "/"), "CANDIDATE_OWNED_ROOT");
    const bytes = JSON.stringify(pkg);
    await writeFile(join(job.workspace, job.output_name), bytes, {
      mode: 0o600,
      flag: "wx",
    });
    await json(label + "-producer.json", {
      producer: "explicit-synthetic-file-writer-not-model",
      job_id: job.id,
      workspace_relative: job.workspace.slice(out.length + 1),
      filename: job.output_name,
      bytes: Buffer.byteLength(bytes),
      sha256: sha(bytes),
    });
  };
  for (const field of ["html", "js"]) {
    const id = "ai_" + crypto.randomUUID();
    const job = await api(
      aiPrefix,
      {
        id,
        target_kind: "page",
        target_id: bound.page_id,
        base_version: 2,
        instruction: "Synthetic rejected " + field,
      },
      null,
      201,
    );
    const source = JSON.parse(
      await readFile(join(job.workspace, job.source_name), "utf8"),
    );
    const candidate = structuredClone(source);
    candidate[field] += " ".repeat(field === "html" ? 1 : 2);
    await produce(job, candidate, "bound-reject-" + field);
    const rejected = await api(aiPrefix + "/" + id + "/collect", {}, null, 422);
    assert.equal(rejected.error.code, "AI_BOUND_CONTENT");
    assert.equal(
      (await api(prefix + "/pages/" + bound.page_id)).spec.version,
      2,
    );
    await api(aiPrefix + "/" + id + "/cancel", {});
  }
  check("bound-html-js-candidate-rejected-by-real-http-service");
  if (await page.getByTestId("cockpit-sidebar-close").count())
    await page.getByTestId("cockpit-sidebar-close").click();
  await open(plain);
  await button("编辑");
  await select("#child");
  await button("用 AI 修改此选区");
  await page
    .getByTestId("html-ai-composer")
    .getByRole("textbox")
    .fill("合成验收，仅修改此子元素文案");
  await button("发送并进入对话");
  await page.getByTestId("cockpit-native-artifact").waitFor();
  const jobs = await api(aiPrefix);
  const job = jobs.items.find(
    (j) => j.instruction === "合成验收，仅修改此子元素文案",
  );
  assert.ok(job);
  assert.ok(
    job.selection || job.edit_context?.allowed_scope === "exact_source_range",
  );
  const source = JSON.parse(
      await readFile(join(job.workspace, job.source_name), "utf8"),
    ),
    candidate = structuredClone(source);
  if (job.selection?.rendered) {
    candidate.presentation ??= {
      version: 1,
      source_hash: sha(
        JSON.stringify([source.html, source.css ?? "", source.js ?? ""]),
      ),
      edits: [],
    };
    const target = {
      anchor: job.selection.rendered.anchor,
      path: job.selection.rendered.path,
    };
    candidate.presentation.edits = candidate.presentation.edits.filter(
      (e) => JSON.stringify(e.target) !== JSON.stringify(target),
    );
    candidate.presentation.edits.push({
      target,
      text: "AI 合成候选子元素",
      style: {},
    });
  } else {
    const range =
      job.selection ??
      job.edit_context.allowed_ranges.find((r) => r.file === "html");
    assert.ok(range);
    const s = [...candidate.html],
      before = s.slice(range.start, range.end).join("");
    assert.ok(before.includes("子元素文字"));
    candidate.html =
      s.slice(0, range.start).join("") +
      before.replace("子元素文字", "AI 合成候选子元素") +
      s.slice(range.end).join("");
  }
  await produce(job, candidate, "ai-selection");
  await json("ai-job-observed.json", job);
  check("real-host-native-ai-handoff-persists-same-selection-and-workspace", {
    real_model: "NOT_RUN",
    producer: "explicit synthetic writer",
  });
  await page.getByRole("button", { name: "收取修改", exact: true }).click();
  await page
    .frameLocator('[data-testid="ai-html-preview"] iframe')
    .getByText("AI 合成候选子元素", { exact: true })
    .waitFor();
  assert.doesNotMatch(
    await page
      .frameLocator('[data-testid="ai-html-preview"] iframe')
      .locator("body")
      .innerText(),
    /<\/(?:head|body|html)>/i,
  );
  assert.equal((await api(prefix + "/pages/" + plain.page_id)).spec.version, 3);
  await page.screenshot({
    path: join(out, "03-ai-candidate-preview.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "确认保存新版本", exact: true })
    .click();
  await page.getByText("AI 修改已保存 · 版本 4", { exact: true }).waitFor();
  const aiSaved = (await api(prefix + "/pages/" + plain.page_id)).spec;
  assert.equal(aiSaved.version, 4);
  assert.equal(aiSaved.package.js, source.js);
  await json("ai-saved-v4.json", aiSaved);
  check("actual-candidate-file-collected-previewed-and-confirmed-v4");
  await page.screenshot({ path: join(out, "04-ai-saved.png"), fullPage: true });
  assert.deepEqual(errors, []);
  check("no-unhandled-browser-errors");
  await json("network-observation.json", {
    model_requests: network,
    real_model: "NOT_RUN",
  });
} catch (error) {
  rows.push({ id: "probe", status: "FAIL", detail: error.stack });
  console.error(error.stack);
  process.exitCode = 1;
  if (browser && !interruption.signal.aborted) {
    const p = browser.contexts()[0]?.pages()[0];
    if (p) {
      const diagnostics = await cleanupOwnedResources([], [
        ['failure.png', () => p.screenshot({ path: join(out, 'failure.png'), fullPage: true, timeout: 3000 }), 4000],
        ['failure.txt', async () => writeFile(join(out, 'failure.txt'), await p.locator('body').innerText({ timeout: 3000 })), 4000],
      ]);
      errors.push(...diagnostics.errors.map(item => item.detail));
    }
  }
} finally {
  try {
  const actions = [];
  if (browser) actions.push(["browser", closeBrowser, 8000]);
  if (host)
    actions.push([
      "host",
      () => stopOwnedChild({ child: host, exit: hostExit }),
      12000,
    ]);
  if (model)
    actions.push([
      "model",
      () => {
        model.closeAllConnections();
        return new Promise((resolve, reject) =>
          model.close((error) => (error ? reject(error) : resolve())),
        );
      },
      5000,
    ]);
  if (httpChild)
    actions.push([
      "http",
      () =>
        stopOwnedChild({
          child: httpChild,
          exit: httpExit,
          graceful: () => httpChild.stdin.end(),
          graceMs: 12000,
          termMs: 3000,
          killMs: 3000,
        }),
      32000,
    ]);
  cleanup = await cleanupOwnedResources(actions, [
    [
      "host.log",
      () => writeFile(join(out, "host.log"), redactLaunchLog(hostLog)),
    ],
    ["http.log", () => writeFile(join(out, "http.log"), httpLog)],
  ]);
  cleanup.owned_pids = owned;
  cleanup.errors.push(...interruption.errors.map(detail => ({ name: 'interrupt', detail })));
  cleanup.all_owned_gone = owned.every((p) => {
    try {
      process.kill(p, 0);
      return false;
    } catch (e) {
      return e.code === "ESRCH";
    }
  });
  try {
    await assertFree(options.port);
    cleanup.owned_port_free = true;
  } catch {
    cleanup.owned_port_free = false;
  }
  if (
    cleanup.errors.length ||
    !cleanup.all_owned_gone ||
    !cleanup.owned_port_free
  ) {
    rows.push({ id: "owned-cleanup", status: "FAIL" });
    process.exitCode = 1;
  }
  if (interruption.signal.aborted) {
    rows.push({ id: 'interrupted', status: 'FAIL', detail: interruption.signal.reason.message });
    process.exitCode = 1;
  }
  await json("results.json", {
    input_sha256: verified.input_sha256,
    source_count: verified.source_count,
    owned_port: options.port,
    schema: "html-host-synthetic-browser-observation/v1",
    head: input.head,
    source_state: input.source_state ?? "observed-matching-author-inputs",
    archive_sha256: input.archive_sha256,
    runner_sha256: harnessProvenance["html-host-browser.probe.mjs"],
    harness_provenance: harnessProvenance,
    backend_provenance: backendProvenance,
    rows,
    errors,
    cleanup,
    interrupted: interruption.signal.aborted,
    interruption_reason: interruption.signal.aborted ? interruption.signal.reason.message : null,
    full_dsh_shell: true,
    real_model: "NOT_RUN",
    headed: "NOT_RUN",
    mobile: "NOT_RUN",
    screen_reader: "NOT_RUN",
    wsl: "NOT_RUN",
    production: "NOT_RUN",
    release_ready: false,
    contains_real_data: false,
  });
  console.log(
    JSON.stringify({
      pass: rows.filter((x) => x.status === "PASS").length,
      fail: rows.filter((x) => x.status === "FAIL").length,
      cleanup,
    }),
  );
  } finally {
    interruption.dispose();
  }
}
