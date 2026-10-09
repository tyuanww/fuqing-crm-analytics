# 当前 b75 HTML headed 交接的独立只读核对

2026-10-08，本次只读取交接、原始 JSON、固定包、限定源码和截图文件，没有启动浏览器、DSH、服务，没有重跑测试或扫描端口。结论：原始证据与交接的 **25 PASS / 0 FAIL** 观察范围一致，未发现身份或观察结果矛盾；有两项原始来源局限，详见下文。此核对不是又一轮 25 项执行，`release_ready=false`。

## 已核对

- 当前工作树 detached HEAD 为 `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`，没有 tracked 产品源码差异。candidate `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0` 的源码提交为 `bd647352d02402c679b04172855e40ec8f2d96a5`；两提交的插件目录无差异。
- 本次原始 `results.json` SHA-256 为 `94a55fc113d9efb1bbe7b689a40998c8aa77133d0f32dafddef59f8247529d89`，25 个唯一观察 ID 全部 PASS。`execution-inputs.json` 的 6 个 runner/helper 和 4 个 backend 摘要与当前实际文件相符。
- input 摘要 `6edbb79b5faff4eeb2c3ea2f9fa165fc2cc02d1e89025fc0d63eb2cd7541bf42`、576 份 author/当前源码、5 份 author lib 均对应；438511 字节的包 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b` 与 candidate、原始结果及实际加载目录的 8 个成员逐字节一致。加载包没有开发 scripts；源清单保留 4 个 scripts。runner 仍是 `de75f75c222b72199b577298bf2bd28ebef79a082fcf680a144a464e54937d38`。
- 12 张 PNG 都实际存在，完整 PNG 结构和逐块 CRC 成立；逐文件 SHA-256、大小与尺寸已写入独立 JSON。这只是截图文件完整性核对，没有将其扩大成新的视觉验收。
- 原始 cleanup 写明 browser/model 清理 PASS，HTTP PID 8580 和 host PID 8588 都已退出、exit code 0，`all_owned_gone=true`，`owned_port_free=true` 对应本次 owned 4328。没有重新检查当前系统进程。

## 证据来源的两项局限

1. Grok 交接与用户交回说明报告顶层探针 exit 0；当前原始目录没有保存顶层进程 stdout/退出回执。原始 JSON 中 host/http 子进程 exit 0 不能替代顶层退出码。此处保留为交接声明，未补造 `exit.json`。
2. 交接 metadata 的前后 4325–4329、14327 均 FREE，没有独立原始扫描日志。原始 runner/cleanup 可支持 selected 4328 的检查，不能扩大成独立核验全部这些端口。

这两项不推翻可核对的 25 个原始观察，但主 Agent 汇总时应保留其来源层级，不改 Grok 的历史文件。

## 未扩大观察范围

原始 `Browser.getWindowForTarget: No web contents in the target` 仍在。200% 行是 CDP `Emulation.setDeviceMetricsOverride`，原生 `browser_zoom_ui=NOT_RUN`；forced-colors 是 Chrome 模拟，Windows 真实高对比度 NOT_RUN；窄屏是 Playwright viewport，真机 NOT_RUN。

焦点行是自动化过程：runner 先 `.focus()` 设置起点，再发送 `Shift+Tab`/`Tab`，读取 `:focus-visible` 和计算样式；它不是人工物理键盘，也不是原生 200% 下的焦点验收。原生查看菜单/200% Tab、真实读屏、真机触控、standalone、未关闭的 probe 外审、正式目标 receipt/journal、真实模型和真实业务均保持原状态。没有重试 CUA 或第三次外审，没有创建正式 receipt/journal。

## 保存后截图的既有提示观察

主 Agent 指出 `03-saved-v2.png` 同时有“版本 2”“界面验收已保存”和两条未保存提示。本次只读看了当前及旧 ecaa 的同名截图，两者都有该现象。runner 466–480 行先执行修改/Escape/放弃负例，485–502 行随后保存并回读版本 2，再截图。

“有未保存修改”来自 workspace 的 guard `setNotice`，成功保存路径没有清除该 notice；“浏览中。退出编辑未保存”更直接来自 `commitTextDrafts()` 成功后调用的 `exitEdit()` 固定文案（workspace 439 行、store 609–612 行）。因此不能把两条都解释成前序负例残留，也不能把文案当作实际未落盘的证据。旧包已有相同现象，25 项的保存断言只覆盖版本与 `presentation.edits`，未覆盖成功后提示清理/文案准确性。这是既有提示歧义的范围说明，没有修改源码或制造新的候选回归结论。路径、摘要与源码位置见 `saved-status-note.json`。

## 原始记录和精简归档

- [Grok headed 交接](shinemage-html-candidate-headed-20261008.md)、[原交接 metadata](shinemage-html-candidate-headed-20261008-validation.json)、[原 HTML 收口记录](shinemage-html-line-closeout-20261008.md)均保持原字节。
- 本次原始逐项记录：`.context/checks/html-candidate-headed-review-20261008/review.json`；只读核对器 `review.py`。其中 335 条文件/字段断言是本次证据核对数量，不是产品测试数。
- `archive-manifest.json` 给出 29 份文件、1650125 字节的精简显式清单和哈希，包括 12 张截图、原始 JSON、脱敏 host/http 日志、输入、candidate、原包、4 份 Grok 文档及本次核对器/记录。清单尚未执行复制；本次 review MD/validation/manifest 和 `saved-status-note.json`（含旧截图引用）自身由主 Agent 另行一起收录。
- 不递归归档运行 HOME、profile、会话、SQLite/WAL、缓存、host.patch、依赖树或 upstream 链接；不删除它们。详细路径和摘要见[本次 validation](shinemage-html-candidate-headed-review-20261008-validation.json)。
