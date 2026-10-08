# HTML headed 验收交接（2026-10-08）

> 后续 T14/T15 接续：原六项待补外审中的五项已取得 complete / 0 findings，探针 `html-host-browser-ui.probe.mjs` 两次 timeout，仍未关闭且不进行第三次续跑。固定 `ecaa86…` 包另有原生 200% 驾驶舱重排与正文可见观察；不是菜单/键盘焦点/读屏/真机验收。主 Agent 已核对原始 JSON、指纹、源码与截图，见[任务交接](shinemage-t14-html-ocr-20261008.md)和[集成核验](shinemage-parallel-closeout-20261008.md)。下文六项未完成等描述保留原执行时点；headed 25/25 未重跑，原探针 `browser_zoom_ui: NOT_RUN` 不改。

基线 `cb6f723c66df4a66117ef5edbf9aacd4a94d2065`。工作树 `/Users/hutou/.codex/worktrees/grok-html-ui-acceptance/fuqing-crm-analytics`，分支 `codex/grok-html-ui-acceptance`。本文件只记录任务 B。没有 commit、push、PR、合并、发布或部署。集成前已完整阅读 `DESIGN.md`。

## 修改文件

本轮改动：

| 文件 | SHA-256 | 动作 |
|---|---|---|
| `scripts/dsh-b0/html-host-browser-ui.probe.mjs` | `089c825781a43a61bcfbb1d79ed6a767a752af132e90d4d096854e949dff439e` | 帮助文字改为默认 4328；保存回读必须命中 `presentation.edits` |
| `scripts/dsh-b0/html-host-browser-ui-args.test.mjs` | `1d89e6a71459774882f5b3e7f3779bbfdd6c7742cb1dd37fe7ee0e12ed3b5501` | 可执行示例使用 4328；4381 只作为解析整数并被端口守卫拒绝 |

`scripts/dsh-b0/html-host-browser-ui-args.mjs` SHA-256 `6a41326395226ff3086c23a4f32a283e280b11d79f92aae29c3df540871e7454`。本轮审查后没有改它。

已有、本轮没有再改的插件源码：

- `dsh-plugins/analytics-workbench/src/client/cockpit-page-editor.tsx`
- `dsh-plugins/analytics-workbench/src/client/cockpit-workspace.tsx`
- `dsh-plugins/analytics-workbench/src/client/cockpit-workspace-style.ts`
- `dsh-plugins/analytics-workbench/src/client/html-selection-bridge.mjs`
- `dsh-plugins/analytics-workbench/src/client/html-selection-bridge.d.mts`
- `dsh-plugins/analytics-workbench/src/client/html-selection-bridge.test.mjs`

没有修改 `scripts/dsh-dev/ports.mjs`。4381 仍会被 `assertOwnedPort` 拒绝。

## 源码审查

现有 UI 修复保持原样，审查结论如下。

- iframe 内第一次 Escape 只清选区；没有选区时才发 `cockpit.exit-request`。
- `acceptExitRequest` 要求当前 frame、`origin=null`、channel、pageId、version，并且只有这四个字段。过期 frame、错误页面和附加字段不会退出。
- 编辑器先关 context panel，否则把退出交给 workspace 的原有 `guard`。未保存修改仍走离开保护。
- 消息回调放在 ref 里，effect 依赖 pageId、version 和 editing。
- `liveStatus` 是 cockpit 自己的状态行。`FreeHtmlLibraryApp` 的 `fhl-live` 不包住这个面板。绑定拒绝仍是 `role=alert`，条件没有放宽。
- 44×44 只加在 `.sm-library-workspace` 下指定按钮，不改 DSH 全局样式。
- 窄屏按钮在实际按下的那一项追加“当前”，并保持 `aria-pressed`。
- 未接通动作仍由原有 `disabled` 条件控制。本轮没有把它们改成可用。

## 当前包与 runner

源码没有新的 workbench 构建。当前源码仍对应既有包：

- tarball `/var/folders/tz/wswl3q3117v437rw68yd90gh0000gn/T/grok-html-ui-author-gapZ6s/workbench.tgz`
- 438812 字节，SHA-256 `ecaa86ddd41a88e563ae411be08897aeadb3a2ef408c00377f2b905dfaecae42`
- 输入 `.context/checks/grok-html-ui-20261008-r2-input.json`，SHA-256 `4162b33f09697ed39268a078f7185658c670b16fb429b90f9093198e8283db96`
- 574 份源码摘要与该输入一致
- r2 runner `dcc7675ebb2eb87da1b84635c78c146758fd97a0de7ba8d080f10348d9b4aa29`，文件未改
- r3 runner `089c825781a43a61bcfbb1d79ed6a767a752af132e90d4d096854e949dff439e`

临时 tarball 仍在系统临时目录。本文件只保存摘要，没有把包复制进 Git。

## 本轮命令

Node `/Users/hutou/homebrew/opt/node@24/bin/node` `24.19.0`。Python `/Users/hutou/homebrew/opt/python@3.14/bin/python3.14` `3.14.4`。Playwright `/Users/hutou/.gstack/repos/gstack/node_modules/playwright/index.mjs`。Chrome `154.0.8037.98`。端口 4328。

```text
node --test scripts/dsh-b0/html-host-browser-ui-args.test.mjs
```

退出码 0。4 PASS / 0 FAIL。

```text
node scripts/dsh-b0/html-host-browser-ui.probe.mjs \
  --input "$PWD/.context/checks/grok-html-ui-20261008-r2-input.json" \
  --output "$PWD/.context/checks/grok-html-ui-20261008-r3" \
  --python <Python 3.14.4 绝对路径> \
  --playwright <playwright/index.mjs 绝对路径> \
  --port 4328 \
  --run-isolated-host
```

退出码 0，用时 11.55 秒。结果目录 `.context/checks/grok-html-ui-20261008-r3/`。25 PASS / 0 FAIL。`headless=false`，`headless_fallback=false`，`launch.channel=chrome`，`profile=playwright-temporary`，`personal_profile=NOT_READ`。cleanup `all_owned_gone=true`，`owned_port_free=true`，结束后 4328 无监听。

保存回读 `explicit-save-then-version-readback`：version 2，`html_contains_saved_text=false`，`presentation_contains_saved_text=true`，`readback=presentation.edits text`。取消回退预览同样要求 `presentation.edits`。

`Browser.getWindowForTarget` 仍返回 `No web contents in the target`。这是窗口边界读取失败，结果里保留。启动参数和 `headless:false` 记录仍成立，不用这条 CDP 错误否定 headed，也不把它藏掉。

## 复用与未跑

r1 仍是 17 PASS / 8 FAIL，目录未改。r2 仍是 25 PASS / 0 FAIL，runner 摘要未改。r2 不能为新的 probe 断言背书；r3 才是新断言的 headed 结果。r3 复用的是同一 tarball 和同一份 574 源码输入，因为 workbench 源码没有变化。

以下保持 NOT_RUN，不能写成 PASS：浏览器原生 200% zoom、Windows 真正高对比度、真机触控、真实读屏、mobile device、axe、真实模型、杭州和生产。r3 里的 zoom 与 forced-colors 仍是 CDP / Playwright 模拟。`release_ready=false`。

## 主 Agent 集成

接收既有六份插件源码 diff、三份探针文件和本文件。不要覆盖 r1、r2。r3 的截图、`results.json` 和 stdout 日志在 git 忽略的 `.context/checks/`。若原始截图需要进入 Git，要另做归档；现在只有摘要在本文件。

帮助文字和参数测试的分工是：parser 接受 1024–65535 且不是 6677 的整数；执行时的共享端口守卫只允许 4325–4329 和 14327。4381 可以被解析，但不能运行。

## 主 Agent：OCR、人工补查与断言修复（2026-10-08）

证据在 `.context/checks/ocr-abc-20261008-r1/`，不覆盖 r1/r2/r3。

OCR session `321e624b-d495-47b7-a2b3-72c5a4b3be45` 状态 PARTIAL：桥接实现和测试 2/8 完成，无评论；3 份 TSX/CSS 文件与 3 份探针文件因 timeout 未完成。虽然 CLI 退出 0，不能说 8/8 通过。诊断为组审查范围过大且请求超时后，仅对失败 6 项发起限定 diff、low effort、8 分钟、200000 token 预算的补审 `6fc4b5b4-82e4-4615-8f4c-a891a220ab03`；仍因 budget/timeout 未完成，退出 1。并发在途请求使统计 token 为 298034；预算不是实际请求的精确硬上限。未继续盲重试。该 6 项的外部 OCR 覆盖仍未关闭。

主 Agent 人工核对 6 份产品源码、探针、类型声明和证据对应关系，确认 3 处探针假通过风险并修复：

1. 进入编辑必须在 `library-live` 观察到编辑状态，不能只把它放入 details。
2. 四档视口中取消、确认、历史、编辑四种按钮必须存在并满足尺寸要求；缺历史/编辑按钮也要失败。
3. 父页 Escape 单独从 `aria-pressed=true` 开始执行，要求 true→false，不能复用 iframe 已经退出的状态直接 PASS。

六份产品源码未改，未重建工作台包。新 runner SHA-256 为 `de75f75c222b72199b577298bf2bd28ebef79a082fcf680a144a464e54937d38`。仍使用原包 `ecaa86ddd41a88e563ae411be08897aeadb3a2ef408c00377f2b905dfaecae42`、原 r2 input；运行入口重新校验了 574 份源码摘要。

当前验证：

- `node --test scripts/dsh-b0/html-host-browser-ui-args.test.mjs dsh-plugins/analytics-workbench/src/client/html-selection-bridge.test.mjs`：13 PASS、0 FAIL；日志 `targeted-tests-after-review.log`。
- 原探针完整命令使用绝对 input/output/Python/Playwright 路径，Node 24.19.0，端口 4328，`--run-isolated-host`；本次新 output 为 `.context/checks/ocr-abc-20261008-r1/headed-after-review/`。退出 0，25 PASS、0 FAIL，Chrome 154.0.8037.98，headless=false，无 fallback；日志 `headed-after-review.log`。
- 新结果明确记录父页 Escape 的 before=true、after=false，编辑 live status 为“编辑中”，四档视口 hidden=false、too_small=false、无工作区横向溢出。
- cleanup 无错误，all_owned_gone=true、owned_port_free=true。仅本次拥有的临时进程被回收。

真实读屏、触控设备、Windows 高对比度、浏览器原生 zoom、真实模型、杭州及生产仍 NOT_RUN；release_ready=false。不以人工审查或 headed PASS 代替外部 OCR 未完成的 6 项。未 commit、push 或集成主成果树。

### 后续人工补核（2026-10-08）

对外部 OCR 未完成的 6 文件补核变更及调用边界：退出消息与页面版本/iframe 身份、离开协调器的 dirty/UNKNOWN 保护、局部样式和 disabled、状态文案、参数与实际端口守卫、包/源码摘要、保存回读及清理。未发现额外确认问题。逐文件摘要和检查项在 `.context/checks/abc-followup-20261008-r1/manual-review.json`。复用同字节 runner 的上一轮 25 项 headed 与 13 项单测，本轮未重跑、未修改产品或探针源码。外部 OCR 仍只有 2/8 完成，人工补核不改写该事实；不重复调用已超时/耗尽预算的审查。
