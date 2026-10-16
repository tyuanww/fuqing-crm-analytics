# M2-05 无障碍目标环境能力盘查（2026-10-14）

本记录只盘查当前 macOS/Aside 环境能覆盖的验收范围，不启用系统级 VoiceOver、不修改页面、不上传页面包。

## 当前环境

- 主机：macOS 26.5.2（Darwin 25.5.0），Apple M5 arm64。
- 当前可见应用：Aside、Google Chrome、Terminal；Aside 与 Chrome 均在运行。
- 当前屏幕包含本机 Retina 显示器与远程镜像显示器；没有发现 Parallels、VMware、UTM 或 VirtualBox 应用。
- macOS VoiceOver 状态读取为 `voiceOverOnOffKey=0`，因此当前没有开启系统级 VoiceOver。
- 现有 Aside Computer Use 可以读取 AX/DOM 状态、执行 Tab/Enter 并记录焦点回执；已有 26 步和 28 步 candidate 焦点证据。

## 可在当前环境完成的范围

1. candidate 页面可达性、Tab 顺序、Enter 激活和焦点回执复核；
2. 页面 AX/DOM 名称与隐藏控件 triage；
3. Chrome/Aside headed 桌面和 viewport 观察；
4. 页面包的自动化 AX、键盘与 forced-colors 模拟检查。

这些结果只能作为人工键盘和自动化辅助证据，不能替代真实读屏器或系统级高对比度模式。

## 当前环境无法关闭的门禁

- **真实读屏**：VoiceOver 当前关闭；本轮不启用系统级 VoiceOver。没有 NVDA/Windows 目标，不能形成 VoiceOver/NVDA 真实读屏回执。
- **Windows 高对比度**：当前主机为 macOS，且本机未发现 Windows 虚拟机入口；浏览器 forced-colors 模拟不等价于 Windows 实机高对比度。
- **完整人工键盘验收**：Aside 可继续补充焦点序列，但仍需人工逐控件确认视觉焦点环、跳过链接、焦点回收和异常路径，现有记录仍为 `ACCESSIBILITY_KEYBOARD_PARTIAL`。

## 结论

当前 macOS/Aside 环境可以继续补强 candidate 的焦点遍历与 AX 证据；真实 VoiceOver/NVDA 和 Windows 高对比度必须在对应目标环境完成。M2-05 保持：

`PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS / STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL`

本盘查不改变 `product=PARTIAL`、`release_ready=false` 或 `activation=NOT_RUN`。
