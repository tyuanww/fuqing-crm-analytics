# 当前组合 candidate 的 source HTTP 目标验收（2026-10-13）

在用户授权的杭州目标 `100.93.46.46` 上，使用当前 composition candidate `125c8e53…` 和 service source `f9726f68…`，以 UID 65534、Python 3.14.4、Linux x86_64 / WSL2 运行 `synthetic-source-http-target-input/v2` 的 source drill。

本轮执行了 10 个 source HTTP / service recovery 场景，全部 PASS：

- 两个服务包的目标平台离线冷安装和 wheel/manifest 校验。
- 独立 HTTP owner、物理 query worker、认证/权限边界和保存幂等。
- SIGKILL 后 durable replay、未知新保存 fail-closed、备份冷恢复和 query restart replay。
- 输入、安装产物、进程退出与临时目录清理。

原始回执绑定如下：

| 项 | 值 |
|---|---|
| candidate digest | `125c8e538816835cad212048b8fd0302d98588d704b09de559789df9bf6e6bdb` |
| service source | `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| target input SHA | `b1c5de00bec17cde54ac53ebc9ef8ee273dd678683ea7a470d8e81ee137c4d96` |
| target receipt SHA | `40a59cfe2b5d5bb852d543d4dc83d7f33e5387d29cb8767727d1748df2009cf3` |
| composition journal | seq `3`, `COMPOSITION_SOURCE_HTTP_TARGET_OBSERVED`, digest `b4fe1e63…` |
| cleanup | `OWNED_PROCESSES_AND_INSTALLS_REMOVED` |

本轮只运行了 candidate 绑定的 synthetic service source drill，没有替换现役 DSH、写入生产业务数据或执行 activation。source HTTP 与服务内恢复已关闭这一子项；terminal、browser、真实模型/CRM/WeKnora/UAT、发布和 rollback 仍保持独立门禁。
