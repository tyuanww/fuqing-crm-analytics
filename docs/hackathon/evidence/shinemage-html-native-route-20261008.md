# HTML 原生输入路由启动前核验（2026-10-08）

本轮只核对当前 CUA 的受支持路由，不启动 DSH、HTTP fixture、模型 stub 或新的 Chrome 进程。没有修改产品代码、旧证据、candidate 或 journal，没有提交。

核验澄清了上轮限制：**受控任务 tab 路由存在，隔离 profile/原生窗口路由没有得到支持。** 因此原生菜单点击与 200% 下 Tab 焦点仍为 `NOT_RUN`，不是产品失败。

## 实际调用与观察

1. 重读 AGENTS、DESIGN 和上轮交接，再通过 `cua.rewriteDocumentation()` 读取当前 API。
2. 调用 `cua.createBrowserTab("chrome", "about:blank", {sessionName: "🧪 HTML准入路由"})`，返回 browser `1`（extension）中的任务 tab `199372801`。该 tab 可以精确绑定；没有导航至产品页面。
3. 一次 `cua.getApp("Google Chrome")` 原生状态显示：`sessionName` 对应一个标签组，新空白 tab 被加到用户已有 Chrome 窗口，并未创建独立 profile 或窗口；原个人标签仍为当前页。工具自动返回现有活动窗口 AX，本轮没有主动浏览该页面、向它输入或把其内容抄入证据。
4. 当前文档的 `createBrowserTab` options 只有 `visible`、`sessionName`；没有 profile、user-data-dir 或专用原生窗口选项。macOS `getApp` 支持名称、路径、Bundle ID，文档将精确 `windowId` 路由限定为 Linux/Windows。
5. 隔离实例要求未满足，因此不启动服务、不重复旧控制器。调用 `routeTab.close()`，仅关闭本轮空白 tab。

没有点击原生菜单，没有改变缩放，没有发送 Tab，没有使用 AppleScript、JS focus、CSS 注入或 Emulation。没有截图，不能以此声称任何焦点或重排通过。4328/4329 本轮核验无监听。

## 接续条件

若保持独立 Chrome profile 的隔离边界，需要工具提供可绑定该实例的原生输入路由，或者在该隔离窗口中进行人工操作。`sessionName` 的任务标签组不能被表述为独立浏览器 profile。当前证据不支持为了菜单验收改用个人窗口。

上轮新包 `b75d90…` 的启动与清理记录、旧包 `ecaa86…` 的 headed 25/25 和原生 200% reflow 观察全部保持原状态。两项未跑、外审 probe 未完成、standalone 无真实包等门禁不变，`release_ready=false`。

[机器核验](shinemage-html-native-route-20261008.json)记录实际方法、task tab 身份、接口限制、关闭和端口结果。原始 JSON 在本任务树 `.context/checks/html-native-route-20261008/route-check.json`。
