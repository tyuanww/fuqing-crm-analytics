# M2-05 standalone 自动化无障碍补测（2026-10-13）

本轮在 source-owned `free-page/v1` 页面包上补充自动化无障碍证据。范围限定为 standalone 页面源码和本地 HTTP 页面，不代表 candidate DSH 宿主、真实读屏器、人工键盘操作或 Windows 实机高对比度环境。

## 输入与边界

- 页面包：`examples/cockpit-example/revenue-review.package.json`；
- 页面包 SHA-256：`e2ed8f1ceefd97fd1be673b710f24c5a9b90ca1f781725b785534fc1be2f23c`；
- 浏览器：固定上游依赖中的 Playwright `1.61.1`，实际 Chromium 为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；
- 页面服务：本机随机端口，仅提供页面包 HTML/CSS/JS；
- 数据与网络：示例数据，未连接 CRM、模型或 WeKnora；外部请求数为 `0`；
- 原始结果：[standalone-a11y-20261013/results.json](../../../.context/checks/cockpit-ui-ux/standalone-a11y-20261013/results.json)。

## 实际结果

结果文件状态为 `PARTIAL_AUTOMATED_PASS`，6 项均 PASS：

1. 页面语言、按钮名称/尺寸和图表 accessible name 可读取；
2. Chrome AX tree 暴露两个命名按钮和命名图表；
3. Tab 可到达“全部/周末”按钮，Enter 可切换 `aria-pressed` 状态；
4. Chromium `forced-colors: active` 模拟下按钮边界和图表仍有可见样式；
5. `prefers-reduced-motion: reduce` 与 390px 移动视口检查通过；
6. 页面无异常，且没有外部网络请求。

## 未关闭项

以下项目仍明确保持 `NOT_RUN`，不能由本轮自动化证据替代：

- candidate-bound headed browser 上的真实 screen reader；
- 人工完整键盘焦点与人工操作确认；
- Windows 实机高对比度模式。

因此 M2-05 继续保持 `ACCESSIBILITY_KEYBOARD_PARTIAL`，本证据只补强 standalone 页面子项，不改变 `product=PARTIAL`、`release_ready=false` 或 `activation=NOT_RUN`。
