# 当前组合 candidate 的 terminal 目标验收（2026-10-13）

在用户授权的杭州目标 `100.93.46.46` 上，使用 composition candidate `125c8e53…` 和 service source `f9726f68…`，以当前目标 release `dsh-0.20.0.0-r3` 加载九个正式 pack、两份 profile 资产，在独占临时 runtime 中执行 terminal / recovery drill。现役 DSH 未替换，candidate 未激活。

本轮 5 个场景全部 PASS：

- 九包组合 roster 装载并核对 CRM profile 模块；
- CRM/Knowledge 工具集可见；
- 合成模型原生对话闭环；
- 受控重启后会话前缀保持一致；
- 挂起请求导致进程丢失后，重启恢复 durable session 前缀并继续响应。

原始回执和组合封套绑定如下：

| 项 | 值 |
|---|---|
| candidate digest | `125c8e538816835cad212048b8fd0302d98588d704b09de559789df9bf6e6bdb` |
| service source | `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| target input SHA | `c2bffa80db9c9f6ab5584b303d71833f0b0298c765f5aafc8f1a1aa02fa1ab22` |
| target receipt SHA | `1f4ceeea68b6e9125dccd1315a6c5946f5170d00306e3a93b2136f44d19044f7` |
| runner SHA | `271cc3a080985b81c023e4b911b97f0b6d59d0c965fdb5db583a95969cea3794` |
| platform | Linux x86_64 / WSL2, Python 3.14.4 |
| composition journal | seq `4`, `COMPOSITION_TERMINAL_HOST_OBSERVED`, digest `e3ad59c3…` |
| cleanup | `OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED` |

本轮只使用 synthetic SSE model 和临时 profile/runtime，没有真实模型、CRM、WeKnora 或生产业务数据。terminal 与进程丢失恢复已关闭对应子项；browser、cross-version、供应链、生产身份、真实业务 UAT、activation、canary、rollback 和 release gate 仍保持独立门禁，`release_ready=false`。目标 receipt 以 root UID 读取固定 release artifact，未改动现役服务。
