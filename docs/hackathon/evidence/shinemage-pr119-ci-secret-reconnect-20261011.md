# PR #119 私有输入接通与 CLI 状态修复（2026-10-11）

本记录接续[此前交付](shinemage-main-pr119-delivery-20261011.md)，以[机器记录](shinemage-pr119-ci-secret-reconnect-20261011-validation.json)中的提交和运行对象为准。此前缺 Secret 的失败保持原文；不把各阶段 PASS 相加，也不把本地修复当作新 head 的远端通过。

## 已实际接通的配置

用户已在主仓 Actions Secrets 保存 `SHINEMAGE_PLUGIN_READ_TOKEN`，元数据更新时间为 `2026-10-11T13:53:57Z`。表单按无到期方式准备，凭据由用户生成和保存；本轮没有读取 Token 值或从 Secret 逆推 Token 实际期限。三个固定工件变量保持既有值。

在真实 hosted runner 上，Workbench 作者证据、领域作者证据与库输入、三仓公开合同、九个正式组合包四类 receiver 均 PASS。四个输入仓是 Workbench、CRM、shine-brand 与 board-components；主仓默认 GITHUB_TOKEN 没有被用来抵扣这些读取，也没有把个人 gh 登录复制到 CI。

[主 CI 38143827126 / attempt 2](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38143827126) 对 `fc46b243` 已 SUCCESS，B0 与 merge-gate PASS；其他轴按该 run 实际结果记账，ground-truth-lint 按既有条件跳过。真实 Ubuntu 后端为 3235 PASS / 80 SKIP / 0 FAIL，12 JUnit、3315 个唯一 testcase、重复 0；原结果提交争用用例实际 PASS。该结果不能称为随后新 head 的整体通过。

## 后续 preflight 的真实失败与修复

`4c28df71` 仅补充 preflight 的只读 checkout 路径诊断。[新 preflight 38147405200](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38147405200) 对 `f1f1d500` 越过四类输入读取后，明确输出 `?? .local/state/gh/device-id`，随后按原 `RELEASE_BLOCKED_DIRTY_WORKTREE` 门禁退出 2。这是受限 gh 子进程没有 HOME 且没有独立状态目录时的相对路径副作用，不是插件源码漂移。此前只知道“dirty:1 files”的日志没有被覆盖。

`f861a895` 只改组合 receiver 与对应测试。现有独占下载目录同时作为 `GH_CONFIG_DIR` 和 `XDG_STATE_HOME`，CLI 状态随既有 finally 回收；不继承个人登录、不改 HOME、不忽略或删除 checkout 文件、不放宽干净工作区检查。离线命令回归在旧实现上实际失败，修复后四类 receiver 相关测试单次合跑为 59 PASS / 0 FAIL / 0 SKIP，exit 0。真实新 head 的 preflight 仍须按 [PR #119 checks](https://github.com/tyuanww/fuqing-crm-analytics/pull/119/checks) 核对，记录时尚未执行该修复提交的 hosted 验证。

## 本地推送与故障注入修正

正常 pre-push 首先遇到 macOS 的 SIGKILL 故障注入竞态：发送信号的工作线程可在进程真正终止前继续提交。40 个独占子进程实验有 30 次继续执行；`f1f1d500` 让子进程停在指定崩溃点，修复后的 40 次都以 SIGKILL 退出且没有继续。保存测试文件 71 PASS / 0 FAIL / 0 SKIP，实际落盘、行数、恢复与 replay 断言保留；生产保存代码未改。

首次重试的完整后端与前端已通过，但因本轮遗漏创建 B0 独占输出根目录而被拒绝；这份 ENOENT 日志保留。补齐新的空目录与五份固定输入后，正常 push exit 0，无 hook 绕过；`4c28df71` 与 `f1f1d500` 已推送。该 head 完整后端 3237 PASS / 78 SKIP / 0 FAIL、12 JUnit 无重复；前端 build 与 29 文件 / 223 单测、完整本地 B0 `--check` 分别通过。作者 core 仍归固定作者 CI，不累计为本轮源实现测试。

## 后续边界与留存

真实组合 artifact `11704150412` 及其 SHA-256 未改，到期为 `2026-10-25T13:24:26Z`；Token 无到期不会延长 Actions artifact 的期限。到期后沿原流程实际上传固定输入、验证新 ID/digest，再更新变量。

本次配置与 CI/test 修复不生成 candidate/journal，不改变包、peer、SDK 或 VERSION，不继承旧宿主/WSL/生产验收。当前组合正式服务/目标/terminal/browser/恢复、真实模型/CRM/WeKnora/UAT、standalone、兼容 peer 和 SDK 分发仍按原门禁单列。产品 PARTIAL，release_ready=false，VERSION 0.20.0.0；PR 未合并，未发布或部署。

原始材料在 `/Users/hutou/.codex/tasks/shinemage-main-pr-delivery-20261011-5rn503ab/`：Secret 元数据回读、两轮真实工作流日志、后端 artifact/摘要绑定、SIGKILL 前后实验、保存测试 JUnit、push-r7/r8/r9 及 result、gh 状态修复前后日志、OCR 逐字节审查。四类 receiver 定向首轮缺固定输入而失败/跳过的日志也保留，成功的是带固定输入的 r2。任务外 `security-audit-skill/` 和历史证据保持原样。
