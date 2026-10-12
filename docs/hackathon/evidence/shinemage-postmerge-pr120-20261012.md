# PR #120 合并后核验

- 仓库：`tyuanww/fuqing-crm-analytics`
- PR：[#120](https://github.com/tyuanww/fuqing-crm-analytics/pull/120)，普通 merge
- 合并提交：`e04caca7e7e3ce37e990ac820cebd7dda5615585`
- 父提交：`5943d4be8ee2f0061c57a4afdb980dfae9a8dc88` 与 `8800ebd802b3e04656ccea5391c61617d1924932`
- 新 main CI：[38167688143](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38167688143)，head 为 `e04caca7e7e3ce37e990ac820cebd7dda5615585`，结论 `success`

## CI 结果

`changes / changes`、`lint`、`test`、`b0-contract-build` 和 `merge-gate` 均 SUCCESS。`dependency-audit`、`ground-truth-lint`、`docker-smoke`、`frontend` 和 `contract-filterbuilder-lint` 按路径矩阵 SKIPPED。

`test` 工件包含 12 个 JUnit 文件、3315 个唯一 testcase，0 failure、0 error、80 skipped。工件 `backend-check-evidence` 的 ID 为 `11712444898`，大小为 83340 字节，API digest 与下载后的 SHA-256 都是 `f973825eeb8662867e8882f59e7f23d1370e837bbd36ab922b3d80c076b0aeed`。

`b0-contract-build` 的日志标记为 `862 passed, 23 warnings, 41 subtests passed` 和 `B0 main checks passed`。warnings 保留为日志事实，不把跳过项计作通过。

## 边界

集成工作树仍停在 feature 分支 `codex/shinemage-abc-local-candidate` 的 `8800ebd802b3e04656ccea5391c61617d1924932`，没有自动切换到 main。唯一未跟踪项是用户明确保留的 `security-audit-skill/`，本次没有读取、修改、暂存或清理它。

本次合并与 main CI 不生成新的 candidate/journal，也不改变当前两份 profile 没有 `service_binding` 的事实。当前组合的服务、目标、terminal、browser、恢复链、真实 CRM/WeKnora/模型、standalone 页面包和 SDK 分发仍按 [STATUS](../../../STATUS.md) 保持未关闭。
