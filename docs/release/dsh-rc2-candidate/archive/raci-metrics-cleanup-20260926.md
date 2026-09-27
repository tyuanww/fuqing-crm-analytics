# T12 operations contract template（2026-09-26）

## RACI

| 活动 | Release owner | Product owner | 杭州 host operator | Security reviewer | QA/UX |
|---|---|---|---|---|---|
| artifact receive / publication receipt | A/R | I | C | C | I |
| loopback healthcheck / service ownership | A | I | R | C | I |
| 七组 release-level UAT | A | A | R | C | R |
| cutover / rollback authorization | C | A | R | C | I |
| 稳定窗口后清理旧 release | A | C | R | C | I |

当前候选没有现场 owner 绑定；以上角色保持模板值，不代表授权或现场完成。

## 指标 ledger

| 指标 | 单位 | 当前状态 | 值 | evidence_ref |
|---|---|---|---|---|
| TTHW（准备机器） | seconds | NOT_MEASURED | | |
| lead-time（候选到可接收 artifact） | seconds | NOT_MEASURED | | |
| MTTR（回退到健康旧 release） | seconds | NOT_MEASURED | | |

不得用提交数量或历史测试时间替代这三个指标；现场至少记录开始/结束时间、候选 SHA、artifact tag 和脱敏日志引用。

## Failure-mode runbook

| 触发 | 立即动作 | 终止条件 | 回执 |
|---|---|---|---|
| manifest/allowlist/secret scan 失败 | 停止 receive，保留原 release | 不得激活 | receive failure receipt |
| service/readiness/healthcheck 失败 | 停止 cutover，按旧 target 回退 | 旧 target 未健康前不清理 | rollback receipt |
| auth/CORS/operator negative probe 失败 | 停止 hostname 验证 | 未获得隔离和授权不切换 | operator evidence |
| action unknown/conflict 或关键路径 5xx | 保留 durable journal，人工 reconcile | 不凭超时推断成功 | action/reconcile receipt |

## Cleanup receipt template

在稳定窗口、产品 owner 和明确删除授权尚未具备时，receipt 必须保持 `NOT_RUN`，`deleted_paths` 为空。禁止删除旧 runtime、旧 release、数据或 WAL 来“清理”证据。

```json
{
  "schema_version": "cleanup-receipt/v1",
  "release_tag": "dsh-<candidate>",
  "owner": "NOT_ASSIGNED",
  "status": "NOT_RUN",
  "stable_window": "NOT_RUN",
  "deleted_paths": [],
  "reason": "stable window and explicit deletion authorization are not available",
  "started_at": null,
  "completed_at": null,
  "evidence_ref": null
}
```
