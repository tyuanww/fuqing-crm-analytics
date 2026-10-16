# 当前测试与生产目标授权记录（2026-10-13）

用户确认把杭州现有入口 `100.93.46.46` 同时作为当前测试和生产验收目标；后续有条件时再迁移云服务器生产端口。本决定解除“缺少非生产 WSL2 目标”的环境阻塞，但不等于 candidate 已注册、业务 UAT 已通过或生产已激活。

## 影响范围

- M2-03 的目标角色更新为 `authorized-test-and-production`，目标前置回执保持 `SERVICE_TARGET_PREFLIGHT_PASS`。
- 当前隔离 composition candidate `125c8e53…` 的 source HTTP（journal seq 3）和 terminal/recovery（journal seq 4）仍是同一目标上的 candidate-bound synthetic 证据。
- 云服务器迁移不作为本轮前置条件，另建升级/迁移候选时再做兼容矩阵和切换授权。
- M2-04 的 candidate-bound browser、M2-05 的 standalone/无障碍、M2-06 的真实模型/CRM/WeKnora/UAT、M2-07 供应链、activation/canary/rollback 仍按各自门禁执行。

## 明确边界

本记录没有写入主仓正式 profile/journal，没有替换或激活现役 DSH，没有读取真实业务数据，没有调用真实模型，也没有 push。当前产品仍 `PARTIAL`，`release_ready=false`；`security-audit-skill/` 仍保持任务外未跟踪。

关联证据：[授权生产目标前置预检](shinemage-production-target-preflight-20261013.md)、[当前组合 source HTTP 目标验收](shinemage-composition-source-http-target-20261013.md)、[当前组合 terminal 目标验收](shinemage-composition-terminal-target-20261013.md)。
