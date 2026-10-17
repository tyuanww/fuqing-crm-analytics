# M2-07 单人 owner governance exception（2026-10-16）

当前项目只有一名全栈开发者。原流程假设必须有另一位发布负责人和第二位 verifier，因此把技术 closure 卡在当前团队未配置的组织角色上。

可重跑的 census 入口是：

```sh
node scripts/release/m2-07-owner-role-census.mjs
```

本次 census 的真实结果是：`project-owner` 同时承担 `operator`、`approver` 和 `technical_verifier`，其他公司 actor 为 `0`。这个事实支持 owner-operated 技术路径，不构成公司正式签名或第二人独立批准。

在 2026-10-16 记录时，owner exception 允许以下本地技术证据继续执行：

- 固定 Node `v24.19.0` 的 production-only consumer closure；
- 新 staging、HOME、cache 和进程的 same-owner replay；
- owner-local cryptographic binding；
- owner-operated clean-machine 技术回放和 rc2 rollback。

它不允许把本地结果改写为公司 publisher identity、公司签名、revocation PASS、正式 final attestation 或 formal clean-machine receipt。当时治理状态为 `OWNER_EXCEPTION_RECORDED_FORMAL_COMPANY_EXCEPTION_PENDING`；后续接受结果见 [owner governance acceptance](m2-07-owner-governance-acceptance-20261017.md)。正式发布状态继续：

```text
M2-07=BLOCKED
M2-08=NOT_RUN
release_ready=false
```
