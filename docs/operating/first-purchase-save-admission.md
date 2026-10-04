# D15 首购保存：服务端准入与回执

本入口是 analysis-service 的合成数据合同，API `1.0.0`。它不启动 DSH/CRM、连接真实数据库或决定发布。公开合同使用 `/api/v1/analytics-first-purchase`，不把 `/internal/native` 变成插件 API。

## 服务配置

`create_first_purchase_analysis_app(..., save_policy=provider)` 接收服务 owner 显式注入的策略提供函数。每次检查或新写入重新取策略，函数返回不可变 `FirstPurchaseSavePolicy` 或 `None`：

- `policy_version`：有版本的服务策略标识。
- `admitted_candidates`：精确 SHA-256 集合，由部署 owner 根据候选审核/准入证据提供；HTTP 请求不能向集合增加条目。
- `max_age_ms`、`expires_after_ms`：明确的毫秒阈值，满足 `0 < max_age_ms < expires_after_ms <= 2147483647`。上限是整数范围约束，不是产品 SLA。没有生产默认值。

当前原生 app/profile 未接入该 provider，生产保存 UI 仍是 `NOT_AVAILABLE`。本轮测试使用 1000/2000 ms 的可控时钟，不能拿这两个数当成生产参数。策略注入只证明服务边界；签名、来源、宿主/服务兼容窗口和 D4-C 放行仍由候选门禁负责。

## HTTP 顺序

所有请求使用显式 B0 Bearer 身份；响应 `Cache-Control: no-store`。这个本地身份表不是生产登录方案。

| 接口 | 请求与含义 |
|---|---|
| `POST /save-results/inspect` | 只读；`schema_version=analytics-first-purchase-save-inspect/v1`、identity、created_from_run_id，及 `Idempotency-Key`。返回服务结果、provenance、freshness 和保存资格。 |
| `POST /save-receipts` | `schema_version=analytics-first-purchase-save-command/v1`、相同 identity/run、预览 evidence_digest、title、可选 TABLE visual_spec，及同一幂等键。显式确认后发起；客户端不能上传 facts、owner、freshness 或 save_eligible。 |
| `POST /save-receipts/reconcile` | 只读；原 identity 与幂等键。即使运行任务或候选策略已移除，仍可查询 SAVED/SAVE_UNKNOWN；重新检查当前 read/save 权限。 |
| `GET /analyses/{analysis_id}/provenance?version=1` | 读取保存当时的来源证据，不需要 RunStore。必须有 read 权限且是记录 owner；旧记录没有来源旁证时返回 PROVENANCE_NOT_RECORDED，不补造字段。 |

identity schema 为 `analytics-first-purchase-save-identity/v1`，含 action_id、candidate_digest、correlation_id。identity 和幂等键用于关联与去重，本身不是授权凭据。保存前预览不是一次性授权；服务取得 SQLite 写锁后重新解析身份、候选、冻结结果及有效期。

## 结果与有效期

独立 `analytics-first-purchase-save-result/v1` 包含原 first-purchase result、identity、result_state、provenance、save_eligible 和 save_ineligible_reason。provenance 的 environment 固定 `synthetic`，并保留 data_time_window、query_scope、permission_scope、source_refs、candidate_digest、generated_at 和 freshness。

`generated_at` 来自同一 RunStore 读事务中 SUCCEEDED 的终态时间；它既不是历史数据的 as_of，也不是页面刷新时间。freshness 相对该时间计算，重复读取不会延长有效期：

- 未到 max_age_ms：FRESH；达到阈值即 STALE；达到 expires_after_ms 即 EXPIRED。
- 策略/生成时间缺失或时钟早于生成时间：UNKNOWN，拒绝新保存。
- 只有 SUCCESS_UNSAVED、完整来源、当前 read/save 权限、被准入的精确候选和 FRESH 同时成立才允许保存。
- 已保存显示 SAVED/ALREADY_SAVED。保存后的 provenance 是不可变历史观察，里面的 FRESH 不表示今天仍可再次保存。

错误使用既有 `error.code` 合同：无策略为 503/SAVE_POLICY_NOT_CONFIGURED，候选未准入、过期、来源变化和命令冲突为 409，撤权为 401/403；未发生新的持久写入。SAVE_UNKNOWN 只表示未看到已提交回执，不能解释为“确定没有执行”。

## 幂等、兼容与恢复

分析记录、action/幂等键两份索引、provenance 旁证在既有 SQLite 同一事务提交。提交前中断全部回滚；提交后响应丢失用原请求查询/重放，只返回原版本。精确重放先检查当前权限和原命令摘要，无需重新执行任务或通过新的候选/时间窗口；修改标题、run、evidence、identity 或键不算重放。

查询/重放在同一事务快照内检查两份回执索引及实际分析版本的 owner、run 和 evidence。残缺恢复导致记录丢失或来源不一致时返回 503/STATE_UNAVAILABLE，不报告 SAVED，也不自动重建记录。服务自身落盘的回执/provenance 必须保留完整 wire 字段；缺失版本或依赖模型默认值修补的内容同样拒绝。

上述拒绝路径已验证：`test_analytics_first_purchase_save_api.py` 覆盖候选/时钟/来源和实际 provider→consumer 响应，`test_analytics_first_purchase_save_receipts.py` 覆盖回执损坏与残缺恢复；本次结果见[审核证据](../hackathon/evidence/dsh-g0-save-review-20261004.md)。

SQLite schema 仍为 1，无迁移。保存旁证使用现有幂等表中的独立 operation；旧 saved-analysis/native-receipt/cockpit v1 的字段不变，PINNED 继续表示固定快照。已有 v1 保存保留；服务显式配置 D15 provider 后，旧 POST analyses 返回 VERSIONED_SAVE_REQUIRED，避免绕过新门禁。纯标题 forward-fix 保留原 facts 和 provenance，创建新版本；原保存回执仍指向原版本，profile 回退不删除数据。

插件严格 decoder 与类型见 `first-purchase-save-model.mjs/.d.mts`；它不读取本地时钟决定资格，也不改变现有 UI。验证命令与证据见[本轮记录](../hackathon/evidence/dsh-g0-save-admission-20261004.md)。跨服务版本兼容、生产策略/认证接线、UI 和现场验收继续 PARTIAL/NOT_RUN。
