# T14/T15 HTML 外审与原生 200% 观察（2026-10-08）

本文件只属于任务树 `/Users/hutou/.codex/worktrees/shinemage-t14-html-ocr/fuqing-crm-analytics`。它不改 STATUS、TODOS、AGENTS、VERSION、CHANGELOG、验证总入口、平台总设计、pipeline、正式 profile、candidate 或 journal。未提交、未推送、未开 PR。

## 工作树与起始快照

- 任务树：`/Users/hutou/.codex/worktrees/shinemage-t14-html-ocr/fuqing-crm-analytics`
- HEAD：`e577f41b9247e3ac56052e21f84daed9dd32f163`（detached）
- 起始内容：该 HEAD，加上与集成树当时完全一致的未提交文件。交付前再次比对，34 个 porcelain 路径与集成树逐字节相同，`content_mismatch` 为 0。
- 集成树 `/Users/hutou/.codex/worktrees/shinemage-abc-integration/fuqing-crm-analytics` 仍是同一 HEAD，本任务没有 checkout、reset 或 stash 它。
- 这 34 个文件是继承快照，不是本任务成果。其中包含共享的 STATUS、TODOS、verification、pipeline 和架构文档，本任务没有再改它们。
- 本任务相对起始快照的唯一新增产品文件是本交接。六份审查对象没有工作区改动。`.context/` 被 git 忽略，证据只放在新目录。

没有可应用到产品源码的 diff。运行包字节没有变化。

## 六份外审对象

来源是原会话 `321e624b-d495-47b7-a2b3-72c5a4b3be45` 的 `coverage.failed`，不是“3 个 UI + 3 个探针”的概括。审查范围是 `cb6f723c66df4a66117ef5edbf9aacd4a94d2065..e577f41b9247e3ac56052e21f84daed9dd32f163` 的单文件 diff。`html-selection-bridge.mjs` 与 `.test.mjs` 原会话已完成，本轮不重审。

| 文件 | 本轮外审 | 证据 | 是否关闭 |
|---|---|---|---|
| `dsh-plugins/analytics-workbench/src/client/cockpit-workspace-style.ts` | 首轮 complete，0 条发现，27359 tokens，66.779s，ocr exit 0 | `review-1-style.json`，session `6816c298-a534-4e63-928c-950490cb5797`，fingerprint `da8ac81aeef37071ae6bc647a1c502ec8bcfb59a0e0620cb5ecdfffa36986d94` | 关闭 |
| `scripts/dsh-b0/html-host-browser-ui-args.mjs` | 首轮 complete，0 条发现，26864 tokens，57.214s，ocr exit 0 | `review-4-args.json`，session `58602684-bc5b-46d2-8259-1b9705e5731c`，fingerprint `55ce8c9fc059031ce4a388a98fe4c17569a8f8be61c2880ade8cb2f187176356` | 关闭 |
| `dsh-plugins/analytics-workbench/src/client/cockpit-page-editor.tsx` | 首轮 timeout；一次 resume 后 complete，0 条发现，59966 tokens，176.051s，ocr exit 0 | `review-3-editor.json` 与 `resume-editor.json`，续跑前 session `5d18cf19-815b-491b-8a21-75c3be567cc1`，fingerprint `d30ac7dd357822c1e944ada39a10f4d63d9e504013ec2e65fda674f5ad94b8c4` | 关闭 |
| `scripts/dsh-b0/html-host-browser-ui-args.test.mjs` | 首轮 timeout；一次 resume 后 complete，0 条发现，59404 tokens，162.145s，ocr exit 0 | `review-5-args-test.json` 与 `resume-args-test.json`，续跑前 session `3127571a-3eb0-4971-afc0-9338e7a3db7c`，fingerprint `03e3ed101632479ccd70f87e845c0a8ba24cdfc8dff009f80ffafd14bfd87276` | 关闭 |
| `dsh-plugins/analytics-workbench/src/client/cockpit-workspace.tsx` | 首轮 timeout，173730 tokens；一次 resume 后 complete，0 条发现，105743 tokens，190.734s，ocr exit 0 | `review-2-workspace.json` 与 `resume-workspace.json`，续跑前 session `60a9c142-be51-432e-a634-6bae6177e7ae`，fingerprint `42d6fa9d54280dcf38420cdc69afb1f39527d491f661bb9b1fec69a07f3b789a` | 关闭 |
| `scripts/dsh-b0/html-host-browser-ui.probe.mjs` | 首轮 timeout，156640 tokens，480.702s，ocr exit 1；一次 resume 再 timeout，本轮 0 token、0 次工具调用，481.509s，ocr exit 1。plan_task 等响应头 300008ms，main_task 179950ms | `review-6-probe.json` 与 `resume-probe.json`，首轮 session `5aa66d1d-9eb9-4dc5-a14a-f05abb63c376`，fingerprint `7d52953072ef1d7212e31247e38765d6eb35f73246ce43bbadf47b5807e02ac0` | 未关闭 |

两轮包装脚本的 Python 退出码都是 0，只表示脚本本身跑完。不能把包装退出码当成 6/6 外审通过。预算保持 200000，没有第三次续跑，没有新账户。

本机阅读了五份已完成 diff，以及探针的启动、端口、headed 断言、CDP 缩放、forced-colors 和清理段落。没有发现需要改源码的缺陷。这段本机阅读不能抵扣探针的外审。

## 命令与日志

证据目录：`/Users/hutou/.codex/worktrees/shinemage-t14-html-ocr/fuqing-crm-analytics/.context/checks/t14-html-ocr-20261008/`

| 动作 | 命令 | 退出码 | 原始位置 |
|---|---|---|---|
| 六文件首轮，一文件一批，concurrency 1，effort low，max-tools 50，预算 200000；小文件 timeout 4，探针 timeout 8 | `python3 /tmp/t14-html-ocr/run-reviews.py` | 包装 0；ocr 0/1/1/0/1/1 | 目录内 `review-1` 到 `review-6` 的 json/err/stdout；批处理日志在会话终端 `call-fb371b47-4714-4546-bb97-323522ca72de-36.log` |
| 对四个 timeout 各 resume 一次，timeout 8，预算仍 200000 | `python3 /tmp/t14-html-ocr/resume-reviews.py` | 包装 0；editor/args-test/workspace 的 ocr 为 0，probe 为 1 | `resume-*.json`、`.err`、`.stdout`，以及 `/tmp/t14-html-ocr/resume.log` |
| 隔离驾驶舱原生 200%，第一次导航停在会话页 | Node 24.19.0 运行 `/tmp/t14-html-ocr/native-zoom-cockpit.mjs` | 0，结果 NOT_RUN | `native-zoom-200/result.json`、`cockpit.png`，`/tmp/t14-html-ocr/native-zoom.log` |
| 同一机制，修正导航后进入驾驶舱 | 同上，输出改到 `native-zoom-200-r2` | 0，reflow PASS | `native-zoom-200-r2/result.json`、`shell.png`、`cockpit.png`，`/tmp/t14-html-ocr/native-zoom-r2.log` |

固定包 `ecaa86ddd41a88e563ae411be08897aeadb3a2ef408c00377f2b905dfaecae42` 在观察前复核过 SHA-256。上游 `477b4f420553e8a52c2fbccc464d7561b239c443` 与 `apps/cli/lib/bin.js` 只读复用。Python 3.14.4 只启动了这次观察自己的夹具进程。

## 体验缺项

| 原缺项 | 本轮动作 | 证据 | 是否关闭 |
|---|---|---|---|
| 浏览器原生 200% 下驾驶舱重排 | Chrome 154.0.8037.98 隔离 profile 写入 `partition.default_zoom_level = {x: 3.8017840169239308}`。没有 Playwright viewport，没有 `Emulation.*`。宿主端口 4328，调试端口 4329，都先确认空闲 | r2：outer 1280×826，inner 640×369，devicePixelRatio 4，visualViewport.scale 1，documentScrollWidth 640。驾驶舱内可见「项目驾驶舱」、`html-ui-plain` 和「合成 HTML 标题」 | 关闭这一项观察。没有点击「查看」菜单。键盘焦点环没有在 200% 下重测：程序化 focus 的 outline-style 是 none |
| 真实读屏 | `voiceOverOnOffKey` 为 0。VoiceOver 是系统开关，不能只对隔离实例打开 | 本机读取 | NOT_RUN |
| 真机触控或移动设备 | `devicectl list devices` 与 USB 的 iPhone、iPad、Android 都没有设备 | 本机读取 | NOT_RUN |
| Windows 真实高对比度 | `~/Applications` 与 `/Applications` 没有 Parallels、VMware、UTM、VirtualBox 或 Windows | 本机读取 | NOT_RUN |
| standalone `COCKPIT_EXAMPLE_PACKAGE` | 按已确认事实保持未执行，没有再搜索或做替代页 | 无新跑 | NOT_RUN |
| 真实模型、杭州、生产、旧业务 DuckDB | 未接触 | 无新跑 | NOT_RUN |
| 已通过的 headed 25/25、B0、服务专项、shell/tool、查询冷安装、十场更新 | 源码和包字节都没变，没有重跑 | 沿用既有证据 | 同字节沿用 |

r1 的失败保留在 `native-zoom-200/`。它证明缩放偏好已写入，但点击停在宿主会话页，不能当成驾驶舱通过。

观察结束后 4325–4329、14327、9334、9335 都没有监听，没有本任务残留的 Chrome、夹具或宿主进程。

## 原计划里实际关闭的子项

- 六项未完成外审中的五项：style、args、editor、args-test、workspace。指纹与各自失败轮相同，完成记录里 `coverage.failed` 为空。
- 固定包 `ecaa86…` 上的驾驶舱原生 200% 横向重排和正文可见。探针里的 `browser_zoom_ui: NOT_RUN` 仍指 CDP `Emulation.setDeviceMetricsOverride`，不能改写成这次通过。

仍缺：

- 探针这一份的外部审查完成结果。
- 真实读屏、真机触控、Windows 高对比度、View 菜单点击、200% 下的键盘焦点环。
- 真实 `COCKPIT_EXAMPLE_PACKAGE`、真实模型和目标包现场。

## 给主 Agent 的集成建议

不需要改共享入口，也不需要重打包。旧 headed 25/25 的 runner `de75f75c222b72199b577298bf2bd28ebef79a082fcf680a144a464e54937d38` 和包 `ecaa86…` 仍然有效。

集成证据可以引用本目录的五项 complete JSON，以及 `native-zoom-200-r2/result.json`。请继续把探针外审记为未完成，不要用本机阅读、工作区 OCR delegate 21/21 或人工补查抵扣。不要把读屏、真机、Windows 高对比度或 standalone 示例改成 PASS。
