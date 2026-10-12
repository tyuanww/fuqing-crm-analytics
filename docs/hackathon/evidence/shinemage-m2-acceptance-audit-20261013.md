# M2 任务卡当前审计（2026-10-13）

这份矩阵把当前隔离 candidate、journal、目标回执、live browser 观察和真实业务前置核验放在同一张账上。它是状态审计，不是发布授权，也没有改变主仓 profile、现役 DSH 或生产数据。

| 卡片 | 当前状态 | 下一条件 |
|---|---|---|
| M2-01 | `ISOLATED_CANDIDATE_PREPARED / MAIN_NOT_REGISTERED` | 主仓正式 profile/journal 接线授权 |
| M2-02 | `ISOLATED_EVIDENCE_BOUND / MAIN_PROFILE_UNBOUND` | 主仓两份 profile 的 `service_binding` |
| M2-03 | `TARGET_PREFLIGHT_PASS / CANDIDATE_NOT_ATTACHED` | candidate 附着目标的独立授权 |
| M2-04 | `TERMINAL_PASS / BROWSER_NOT_RUN` | 同一 candidate 的 browser receipt |
| M2-05 | `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_STANDALONE_NOT_RUN` | `COCKPIT_EXAMPLE_PACKAGE`、candidate-bound browser、读屏、高对比度 |
| M2-06 | `NOT_RUN_PRECONDITIONS_MISSING` | 用户登录、真实模型/CRM/WeKnora 权限和人工 UAT |
| M2-07 | `BLOCKED` | 上游替换、来源归档、发布者身份、SBOM、签名、撤销和干净机器 |
| M2-08 | `NOT_RUN` | M2-04 至 M2-07 关闭并取得发布授权 |
| M2-09 | `DEFERRED` | 新官方 DSH 候选和兼容矩阵 |
| M2-10 | `OPEN` | 各卡继续独立收口后再做最终发布结论 |

当前隔离 journal 只到 seq 4：candidate intent、candidate prepared、source HTTP target observation 和 terminal host observation。主仓正式 profile/journal 仍未注册，`release_ready=false`、activation `NOT_RUN`。本轮没有代码改动、没有 push、没有生产切换；受保护的 `security-audit-skill/` 保持未跟踪。
