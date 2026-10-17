# M2 任务卡当前收口账本（2026-10-15）

本账本把 M2-01 至 M2-10 的当前 disposition、可采纳证据和剩余外部条件固定在同一处。它用于收口验收事实，不授予 release、activation、canary、rollback 或主仓 DSH 切换。

## 当前 disposition

| 卡片 | 当前 disposition | 当前证据 | 收口条件 |
|---|---|---|---|
| M2-01 | `PASS / FORMAL_CANDIDATE_REGISTERED` | 主仓 formal candidate、两份 profile 快照和 journal seq 1–5 已登记 | 无新增本地动作；后续发布仍受独立门禁约束 |
| M2-02 | `PASS / FORMAL_BINDING_REGISTERED / CRM_UNBOUND_BY_CONTRACT` | page profile 带 service binding；CRM profile 按组合合同保持无绑定 | 不把 CRM 绑定写入默认组合 profile |
| M2-03 | `PASS / TARGET_PREFLIGHT_PASS / USER_AUTHORIZED_TEST_PROD` | 杭州 Linux x86_64 / WSL2 目标前置检查已通过 | 云服务器迁移后置；不等于已激活发布 |
| M2-04 | `PASS / TERMINAL_PASS / BROWSER_PASS` | 同一 candidate 的 source HTTP、terminal、candidate browser seq 5 和恢复回执 | 不把 M2-05、M2-06 或 M2-08 的缺口并入本卡 |
| M2-05 | `PASS / WINDOWS_A11Y_PASS` | standalone 包、本地 Chromium、candidate headed browser、AX/Tab、Windows 高对比度、Narrator 和用户人工听读回执均已完成；见[Windows 现场验收](shinemage-m2-05-windows-20261014.md)与[读屏人工听读补验](shinemage-m2-05-screen-reader-20261015.md) | 无新增本地动作；人工回执未附远端音频文件，来源已明确记录 |
| M2-06 | `PASS / REAL_SHARE_READ_PASS / REAL_REVOKE_READ_DENIED_PASS / REAL_REVOKE_PERSISTED_PASS / REAL_CLEANUP_PASS` | 隔离 candidate 在独立 `18099` storage 中完成真实快照、分析保存/回读、临时 `admin1` 成功分享与读取、owner 撤权、撤权后 `404/NOT_FOUND` 和持久化复核；临时容器、状态目录与账号已回收，live `4328`、共享 `18093` 未改变；证据见[CRM 保存、回读与权限合同复核](shinemage-m2-06-contract-gate-20261015.md)与[隔离 candidate 真实分享与撤权回执](shinemage-m2-06-real-revoke-20261015.md) | 无新增本地动作；产品仍受 M2-07 与后续 release 门禁约束 |
| M2-07 | `BLOCKED / RC2_LOCAL_MATERIALS_READY` | 当前 rc2 开发 SDK 的隔离准备、归档/closure、OSV、CycloneDX projection、opaque/native provenance、clean HOME、preflight、publisher identity 和 50/50 本地合同回归均已留证；当前可见检查目录只有 archive/receive/closure 元数据和报告，没有可供正式接收、安装或签名的 artifact 字节；OSV 发现 29 个唯一公告，当前 closure 的 17 个 binary/native coverage gaps 已逐项分组并定义处理动作；完整 alpha2 development archive 的 70 个 secret-pattern 命中和 827 个 coverage gaps 已完成逐类 disposition，但仍 fail-closed；见[rc2 本地 SDK 材料](shinemage-m2-07-rc2-local-materials-20261015.md)、[当前 pin closure 复核](shinemage-m2-07-current-pin-closure-recheck-20261015.md)、[rc2 artifact 可用性盘查](shinemage-m2-07-rc2-artifact-availability-20261015.md)、[rc2 closure gap disposition](shinemage-m2-07-rc2-gap-disposition-20261015.md)、[本地门禁回归](shinemage-m2-07-local-gate-rerun-20261015.md)、[完整 archive triage](shinemage-m2-07-full-archive-triage-20261015.md) | 最终 immutable artifact、完整 SBOM、publisher identity、正式签名/验签、撤销、干净机器安装回退、最终 SHA attestation；当前本机 GPG secret key 为 0、cosign 缺失，不能把开发材料提升为正式发布通过 |
| M2-08 | `NOT_RUN / RELEASE_GATES_REMAIN_OPEN` | rc2 internal preflight 和 WSL2 source HTTP 目标补验已完成 | M2-05～M2-07 关闭、15 分钟 SLI、正式 release/activation 授权、canary、rollback |
| M2-09 | `CANDIDATE_PASS_LIMITED / TARGET_BROWSER_SYNTHETIC_PASS / TARGET_RECOVERY_SYNTHETIC_PASS / FORMAL_TARGET_NOT_RUN / MAIN_PIN_UNCHANGED` | alpha2 tracked candidate、9/9 pack、profile compatibility、组合 lifecycle、本机与授权目标 synthetic headed browser/history/board 及重启回读已完成；最新回执明确 `formal_company_evidence=false` | 正式目标 browser/recovery 需要非 synthetic、可审计 alpha2 runtime/runner 和重启后页面回读；之后才评审主仓适配与切换 |
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

1. M2-05 的读屏语音已由用户在同一 Windows 目标人工确认通过；回执来源和未附音频文件的限制见[读屏人工听读补验](shinemage-m2-05-screen-reader-20261015.md)。
2. M2-06 已在独立 `18099` storage candidate 中完成真实保存/回读、成功分享、共享读取、owner 撤权、撤权后 `404/NOT_FOUND`、持久化复核和清理；live `4328` 与共享 `18093` 未改变。
3. M2-07 需要最终发布材料和发布者身份。
4. M2-08 需要正式 release/activation 授权，不能由测试目标授权替代。
5. M2-09 的隔离 synthetic headed browser/history/board 与候选重启回读已完成，正式公司目标 browser/recovery 仍需非 synthetic、可审计 runner；现有生产入口 helper 不得直接代替该 runner。

这些条件未满足前，正确的收口状态是 `PARTIAL / BLOCKED / NOT_RUN`，不能改写成正式发布通过。
