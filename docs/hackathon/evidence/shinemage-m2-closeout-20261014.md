# M2 任务卡当前收口账本（2026-10-14）

本账本把 M2-01 至 M2-10 的当前 disposition、可采纳证据和剩余外部条件固定在同一处。它用于收口验收事实，不授予 release、activation、canary、rollback 或主仓 DSH 切换。

## 当前 disposition

| 卡片 | 当前 disposition | 当前证据 | 收口条件 |
|---|---|---|---|
| M2-01 | `PASS / FORMAL_CANDIDATE_REGISTERED` | 主仓 formal candidate、两份 profile 快照和 journal seq 1–5 已登记 | 无新增本地动作；后续发布仍受独立门禁约束 |
| M2-02 | `PASS / FORMAL_BINDING_REGISTERED / CRM_UNBOUND_BY_CONTRACT` | page profile 带 service binding；CRM profile 按组合合同保持无绑定 | 不把 CRM 绑定写入默认组合 profile |
| M2-03 | `PASS / TARGET_PREFLIGHT_PASS / USER_AUTHORIZED_TEST_PROD` | 杭州 Linux x86_64 / WSL2 目标前置检查已通过 | 云服务器迁移后置；不等于已激活发布 |
| M2-04 | `PASS / TERMINAL_PASS / BROWSER_PASS` | 同一 candidate 的 source HTTP、terminal、candidate browser seq 5 和恢复回执 | 不把 M2-05、M2-06 或 M2-08 的缺口并入本卡 |
| M2-05 | `PARTIAL` | standalone 包、本地 Chromium、candidate headed browser、AX/Tab 证据已完成；最新环境盘查见[无障碍目标环境能力盘查](shinemage-m2-05-environment-capability-20261014.md) | 外部 VoiceOver/NVDA、完整人工键盘焦点、Windows 高对比度 |
| M2-06 | `PARTIAL / READONLY_PASS` | candidate 真实模型、WeKnora 只读、CRM GSV 7/7 通过；candidate CRM 通路恢复见[candidate CRM 通路恢复](shinemage-m2-06-candidate-tunnel-recovery-20261014.md)，当前工具面复核见[candidate 当前 CRM 工具面复核](shinemage-m2-06-current-tool-surface-20261014.md)，真实 CRM 只读 UAT 重跑见[真实 CRM 只读 UAT 重跑](shinemage-m2-06-real-uat-rerun-20261014.md)；合成 persistence/permission/recovery 165/165 通过 | 隔离测试数据下的 CRM 写入、权限负测、恢复和人工业务复核 |
| M2-07 | `BLOCKED` | 本地依赖图、CycloneDX projection、OSV、compact archive、opaque/native provenance、clean HOME 和 GitHub 发布者权限前置核验已完成；本地边界见[本地可关闭项复核](shinemage-m2-07-local-closure-readiness-20261014.md)与[发布者权限前置核验](shinemage-m2-07-publisher-preflight-20261014.md) | 最终 immutable artifact、完整 SBOM、publisher identity、正式签名/验签、撤销、干净机器安装回退、最终 SHA attestation |
| M2-08 | `NOT_RUN / RELEASE_GATES_REMAIN_OPEN` | rc2 internal preflight 和 WSL2 source HTTP 目标补验已完成 | M2-05～M2-07 关闭、15 分钟 SLI、正式 release/activation 授权、canary、rollback |
| M2-09 | `CANDIDATE_PASS_LIMITED / TARGET_NOT_RUN / MAIN_PIN_UNCHANGED` | alpha2 tracked candidate、9/9 pack、profile compatibility、组合 lifecycle、本机 browser/recovery 已完成 | 正式目标 browser/recovery 需要隔离 alpha2 runtime 和可审计 runner；之后才评审主仓适配与切换 |
| M2-10 | `PASS / RELEASE_GATES_REMAIN_OPEN` | 本账本、STATUS、TODOS 和证据链接已互相校验 | 外部条件变化后重新生成本账本，不把历史回执升级为当前 PASS |

## 当前全局结论

- 产品保持 `PARTIAL`。
- `release_ready=false`。
- `activation=NOT_RUN`。
- 主仓仍使用 DSH `0.1.7-rc.2 / 477b4f42…`，没有切换到 alpha2。
- 受保护的 `security-audit-skill/` 保持任务外未跟踪，不纳入清理。
- 本轮只修改文档和证据索引，没有代码改动，因此不触发 `open-code-review-delegate`。

## 仍需外部条件的事项

逐项的提供方、输入材料和执行动作见[M2 剩余外部条件交接清单](shinemage-m2-external-handoff-20261014.md)。

1. M2-05 需要真实读屏和 Windows 高对比度目标。
2. M2-06 需要隔离测试数据及 CRM 写入授权。
3. M2-07 需要最终发布材料和发布者身份。
4. M2-08 需要正式 release/activation 授权，不能由测试目标授权替代。
5. M2-09 需要隔离 alpha2 candidate runtime、真实目标浏览器操作和重启后页面回读；现有生产入口 helper 不得直接代替该 runner。

这些条件未满足前，正确的收口状态是 `PARTIAL / BLOCKED / NOT_RUN`，不能改写成正式发布通过。
