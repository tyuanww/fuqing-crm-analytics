# M2-05 Windows headed / 高对比度 / AX 现场验收（2026-10-14）

本记录收口用户授权的 Tailscale Windows 目标 `hangzhou-windows / 100.85.47.82`（“人事-台式”）。验收使用仓库已登记的 source-owned `free-page/v1` 页面包，不使用 CRM、模型、WeKnora 或任何真实业务数据。

## 目标与输入

- 目标：Windows 10 x64，build 19045，交互会话 1；通过 Tailscale 访问，未改杭州 live DSH/CRM/WeKnora 服务。
- 浏览器：独立 headed Chrome `154.0.8037.98`，临时用户目录 `CodexM205Chrome`，仅为本轮验收创建。
- 页面来源：`examples/cockpit-example/revenue-review.package.json`，source-owned 页面包提交 `fcee92a9`，SHA-256 `e2ed8f1ceefd97fd1be673b710f24c5a9b90ca1f781725b785534fc1be2f23c`。
- 页面复制到 Windows 临时 `file:///C:/Users/Administrator/AppData/Local/CodexM205Chrome/index.html`；页面本身明确显示“示例数据 / 未绑定 CRM、模型或 WeKnora 业务结果”。

## 实际回执

| 子项 | 结果 | 证据 |
| --- | --- | --- |
| Windows headed 页面 | PASS | `windows-final.json`、`windows-high-contrast.png` |
| Chrome AX 树 | PASS | `windows-ax.json`：RootWebArea、heading、navigation、region、button、image 均有可读名称 |
| 键盘 Tab / Enter | PASS | `windows-keyboard.json`：`全部 → Tab → 周末`，Enter 后 `scope=weekend`、`aria-pressed=周末:true`，7 个柱图仍存在且无横向溢出 |
| Windows 高对比度 | PASS | 交互会话 `SystemParametersInfo` 从 `dwFlags=126` 临时切换到 `127`；Chrome `forced-colors: active=true`，正文背景为黑色、按钮边框为系统高亮色；截图留存 |
| Windows Narrator 运行时 | READY / 部分回执 | `Narrator.exe` 在会话 1 启动，真实欢迎界面出现；页面 AX 树可读。当前控制通道不录制远端音频，因此没有把语音播报冒充为已观测通过 |

高对比度测试完成后，系统设置从 `dwFlags=127` 恢复为 `126`，Chrome 回到 `forced-colors=false`；Narrator、临时计划任务、临时 Chrome、临时页面目录、SSH CDP 转发和本地 HTTP 入口均已停止或移除。没有触碰用户原有 Chrome 进程。

## M2-05 状态解释

本轮关闭了 Windows headed、Windows 高对比度、Chrome AX 和 headed 键盘交互子项，并补齐了真实 Windows Narrator 启动证据。由于远程通道没有音频回执，完整“读屏器听读内容”仍保留为 `NOT_OBSERVED`；因此 M2-05 总状态更新为：

`WINDOWS_HEADED_PASS / WINDOWS_HIGH_CONTRAST_PASS / WINDOWS_AX_PASS / WINDOWS_KEYBOARD_PASS / SCREEN_READER_RUNTIME_READY / SCREEN_READER_AUDIO_NOT_OBSERVED`

这组证据只覆盖 M2-05 页面与无障碍验收，不改变产品 `PARTIAL`、`release_ready=false`、M2-07 供应链门禁或 M2-08 发布/激活门禁。
