# 当前 b75 包 headed 验收（2026-10-08）

**当前 candidate 包已有自己的 headed 观察记录：25 项 PASS、0 项 FAIL，退出码 0。** 这次跑的是包 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`、candidate `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`。旧包 `ecaa86…` 的 25 项没有被重跑，也没有被改写成这次结果。`release_ready` 仍为 false。没有修改产品源码，没有重新生成 candidate，没有写正式 journal。

运行前核对既有输入仍指向同一对象：author 581 个文件、源码摘要 576 项、5 个 lib 与输入一致，归档 tarball 438,511 字节且摘要仍是 b75。没有重建 author。解包后的 8 个成员与输入 `package_files` 一致；加载到宿主的 `package.json` 没有 build/test 脚本，工作树源码 `package.json` 仍保留那 4 个开发脚本。宿主读的是这次解出的包，不是工作树源码。

## 实际执行

工作树 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。Node 24.19.0、Python 3.14.4、上游 `477b4f42` 干净。原 runner `de75f75c222b72199b577298bf2bd28ebef79a082fcf680a144a464e54937d38`。端口守卫确认 4325–4329 与 14327 空闲后，使用允许端口 4328。HTTP fixture 自行绑定临时端口。输出目录在运行前不存在。

```text
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh-b0/html-host-browser-ui.probe.mjs \
  --input …/html-candidate-inputs-20261008/input.json \
  --output …/.context/checks/html-candidate-headed-b75-20261008 \
  --python /Users/hutou/homebrew/opt/python@3.14/bin/python3.14 \
  --playwright /Users/hutou/.gstack/repos/gstack/node_modules/playwright/index.mjs \
  --port 4328 --run-isolated-host
```

开始 `2026-10-08T10:04:43Z`，结束 `2026-10-08T10:04:55Z`，退出码 0。Chrome `154.0.8037.98`，`channel: chrome`，`headless: false`，临时 Playwright profile，未读取个人 profile。`Browser.getWindowForTarget` 仍返回 “No web contents in the target”；该错误已留在结果里，不单独否定 `headless: false`。

清理只覆盖本次进程：HTTP pid 8580 自行退出 0，宿主 pid 8588 收到 SIGTERM 后退出 0，浏览器关闭。`all_owned_gone` 与 `owned_port_free` 均为 true。结束后再次用原端口守卫确认 4325–4329 与 14327 空闲，没有残留 `html-host-browser` 进程。日志、12 张截图、`results.json` 与输入摘要都保留。

## 这 25 项证明到哪里

schema `html-ui-headed-browser-observation/v1`。范围是合成 HTML fixture、隔离 DSH web 与页面文档夹具。`contains_real_data` 为 false，`real_model` 为 NOT_RUN。

| 结果 | 范围 |
| --- | --- |
| 安全接收 8 成员并建立 peer link、headed 打开已保存 HTML、键盘进入编辑与嵌套选择、编辑阻断按钮/链接/表单、取消保留版本、显式保存后按 `presentation.edits` 回读、44px 与视口、回退到 v3、焦点环、Escape、侧栏焦点、Tab 顺序、768 键盘、非仅颜色的按下态、切页不泄漏草稿、绑定 HTML/JS/数据源拒绝、CSS 确认不改 HTML/JS、无未处理浏览器错误 | 当前 b75 包这次 headed 运行的 PASS |
| `zoom-200-edit-action-operable` | 方法是 `cdp-Emulation.setDeviceMetricsOverride`，`browser_zoom_ui` 为 NOT_RUN |
| `forced-colors-emulated-edit-text-remains` | 方法是 `chrome-emulated-forced-colors`，`windows_high_contrast` 为 NOT_RUN |
| `viewport-cancel-save-history-visible-and-44px` | 方法是 `playwright-setViewportSize`，`device` 为 NOT_RUN |

## 仍未由本项关闭

原生 View 菜单和 200% 人工焦点仍 NOT_RUN。已有 CUA 只能绑到用户 Chrome 的任务标签，不能绑定本次隔离窗口；本轮没有再试这条路由，也没有用 JS focus 或 Emulation 代替。

真实读屏、真机触控、移动设备、Windows 高对比度、axe、standalone 页面包、probe 外审、正式 WSL2 source/terminal/browser、真实模型与业务、正式 receipt 和 journal 都没有执行。本项不能代替它们。产品仍 PARTIAL，`release_ready=false`。

原始结果：[results.json](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/html-candidate-headed-b75-20261008/results.json)，SHA-256 `94a55fc113d9efb1bbe7b689a40998c8aa77133d0f32dafddef59f8247529d89`。机器摘要见 [shinemage-html-candidate-headed-20261008-validation.json](shinemage-html-candidate-headed-20261008-validation.json)。
