# 九包组合后续预检（2026-10-12）

本轮在新的任务隔离目录重新准备当前九包组合输入，并使用固定 Node `24.19.0`、Python `3.14.4` 与 DSH `0.1.7-rc.2` / `477b4f42` 做静态合同核对。主仓 profile、candidate、journal、服务和目标均未写入或启动。

## 已完成

- 两份当前 profile 与组合锁摘要保持一致：CRM/Knowledge 双包 profile 和默认七插件 profile 共 9 个正式包。
- `readCompositionInputs` 成功读取并校验 2 + 7 个插件，领域选择、包身份、manifest digest 和 Cordis `4.0.4` 守卫均通过。
- 本次准备回执的锁摘要为 `be215557…`，`preparation.json` SHA-256 为 `a2f486d3…`；隔离输出目录为 `/Users/hutou/.codex/tasks/shinemage-next-composition-preflight-20261012-r1`。

## 仍未关闭

- 两份当前 profile 的 `service_binding` 都是缺失状态。没有目标服务绑定，不能生成正式组合 candidate/journal。
- 官方 resolver 需要已构建的 pinned DSH runtime。固定源码 checkout 虽然是 SHA `477b4f42…`，但缺少 `apps/cli/lib/bin.js`；因此 resolver / host 继续记为 `NOT_RUN`。
- 非生产 WSL2、terminal、browser、recovery、真实模型/CRM/WeKnora/UAT、standalone、SDK 分发和 DSH 升级保持原状态。

机器摘要见[validation JSON](shinemage-composition-next-preflight-20261012-validation.json)。本记录只证明组合输入仍可复现，不构成 candidate、宿主或发布准入。
