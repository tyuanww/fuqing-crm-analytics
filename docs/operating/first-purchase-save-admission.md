# D15 首购保存：服务端准入与回执

本入口是 analysis-service 的合成数据合同，API `1.0.0`。它不启动 DSH/CRM、连接真实数据库或决定发布。公开合同使用 `/api/v1/analytics-first-purchase`，不把 `/internal/native` 变成插件 API。

## 服务配置

`create_first_purchase_analysis_app(..., save_policy=provider)` 接收服务 owner 显式注入的策略提供函数。每次检查或新写入重新取策略，函数返回不可变 `FirstPurchaseSavePolicy` 或 `None`：

- `policy_version`：有版本的服务策略标识。
- `admitted_candidates`：精确 SHA-256 集合，由部署 owner 根据候选审核/准入证据提供；HTTP 请求不能向集合增加条目。
- `check_freshness`：仅限服务端配置的关键字参数，默认 `True` 保留已有时限策略；显式 `False` 表示暂不检查结果年龄。缺策略不等于关闭时效。
- `max_age_ms`、`expires_after_ms`：开启检查时满足 `0 < max_age_ms < expires_after_ms <= 2147483647`；关闭时必须同时为 `None`。不接受超大期限冒充永久新鲜，也不把空阈值自动解释为关闭。

当前原生 app/profile 未接入该 provider，生产保存 UI 仍是 `NOT_AVAILABLE`。本轮测试使用 1000/2000 ms 的可控时钟，不能拿这两个数当成生产参数。策略注入只证明服务边界；签名、来源、宿主/服务兼容窗口和 D4-C 放行仍由候选门禁负责。

2026-10-06 用户决定：**陈旧和过期判断暂缓，不再等待生产阈值确认**。当前接入采用如下服务策略；`admitted_candidate_digests` 必须由 owner 提供真实审核准入集合，不得直接取自请求：

```python
from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy

policy = FirstPurchaseSavePolicy(
    "save-no-age-v1", frozenset(admitted_candidate_digests),
    None, None, check_freshness=False,
)
```

这只关闭结果年龄判断。身份/session 撤销、请求超时、候选准入、来源完整性、冲突及 SAVE_UNKNOWN 恢复仍按原合同执行；没有因此启用生产保存。

## HTTP 顺序

所有请求使用服务 owner 接入的 Bearer 身份；响应 `Cache-Control: no-store`。合成测试可用 B0 身份表；现有 CRM 账号可使用[独立 HTTP resolver](./crm-service-packages.md#可选的现有-crm-账号适配)，本地适配测试不代表真实登录已验收。

| 接口 | 请求与含义 |
|---|---|
| `POST /save-results/inspect` | 只读；`schema_version=analytics-first-purchase-save-inspect/v1`、identity、created_from_run_id，及 `Idempotency-Key`。返回服务结果、provenance、freshness 和保存资格。 |
| `POST /save-receipts` | `schema_version=analytics-first-purchase-save-command/v1`、相同 identity/run、预览 evidence_digest、title、可选 TABLE visual_spec，及同一幂等键。显式确认后发起；客户端不能上传 facts、owner、freshness 或 save_eligible。 |
| `POST /save-receipts/reconcile` | 只读；原 identity 与幂等键。即使运行任务或候选策略已移除，仍可查询 SAVED/SAVE_UNKNOWN；重新检查当前 read/save 权限。 |
| `GET /analyses/{analysis_id}/provenance?version=1` | 读取保存当时的来源证据，不需要 RunStore。必须有 read 权限且是记录 owner；旧记录没有来源旁证时返回 PROVENANCE_NOT_RECORDED，不补造字段。 |

identity schema 为 `analytics-first-purchase-save-identity/v1`，含 action_id、candidate_digest、correlation_id。identity 和幂等键用于关联与去重，本身不是授权凭据。保存前预览不是一次性授权；服务取得 SQLite 写锁后重新解析身份、候选、冻结结果及当前时效策略。

## 结果与有效期

独立 `analytics-first-purchase-save-result/v1` 包含原 first-purchase result、identity、result_state、provenance、save_eligible 和 save_ineligible_reason。provenance 的 environment 固定 `synthetic`，并保留 data_time_window、query_scope、permission_scope、source_refs、candidate_digest、generated_at 和 freshness。

`generated_at` 来自同一 RunStore 读事务中 SUCCEEDED 的终态时间；它既不是历史数据的 as_of，也不是页面刷新时间。关闭检查时返回 `NOT_CHECKED / DISABLED_BY_POLICY`，保留策略版本和检查时间，两个阈值及两个截止时间均为 null；不计算年龄或时钟先后，不宣称结果新鲜，生成时间与其他来源字段仍必需。开启检查时相对生成时间计算，重复读取不会延长有效期：

- 未到 max_age_ms：FRESH；达到阈值即 STALE；达到 expires_after_ms 即 EXPIRED。
- 策略/生成时间缺失或时钟早于生成时间：UNKNOWN，拒绝新保存。
- 只有 SUCCESS_UNSAVED、完整来源、当前 read/save 权限、被准入的精确候选和允许的时效状态（FRESH 或显式策略的 NOT_CHECKED）同时成立才允许保存。UNKNOWN 不因此获准。
- 已保存显示 SAVED/ALREADY_SAVED。保存后的 provenance 是不可变历史观察，FRESH 或 NOT_CHECKED 均不授予今天再次保存的权限。

错误使用既有 `error.code` 合同：无策略为 503/SAVE_POLICY_NOT_CONFIGURED，候选未准入、过期、来源变化和命令冲突为 409，撤权为 401/403；未发生新的持久写入。SAVE_UNKNOWN 只表示未看到已提交回执，不能解释为“确定没有执行”。

## 幂等、兼容与恢复

分析记录、action/幂等键两份索引、provenance 旁证在既有 SQLite 同一事务提交。提交前中断全部回滚；提交后响应丢失用原请求查询/重放，只返回原版本。精确重放先检查当前权限和原命令摘要，无需重新执行任务或通过新的候选/时间窗口；修改标题、run、evidence、identity 或键不算重放。

查询/重放在同一事务快照内检查两份回执索引及实际分析版本的 owner、run 和 evidence。残缺恢复导致记录丢失或来源不一致时返回 503/STATE_UNAVAILABLE，不报告 SAVED，也不自动重建记录。服务自身落盘的回执/provenance 必须保留完整 wire 字段；缺失版本或依赖模型默认值修补的内容同样拒绝。

上述拒绝路径已验证：`test_analytics_first_purchase_save_api.py` 覆盖候选/时钟/来源和实际 provider→consumer 响应，`test_analytics_first_purchase_save_receipts.py` 覆盖回执损坏与残缺恢复；本次结果见[审核证据](../hackathon/evidence/dsh-g0-save-review-20261004.md)。

SQLite schema 仍为 1，无迁移。保存旁证使用现有幂等表中的独立 operation；旧 saved-analysis/native-receipt/cockpit v1 的字段不变，PINNED 继续表示固定快照。已有 v1 保存保留；服务显式配置 D15 provider 后，旧 POST analyses 返回 VERSIONED_SAVE_REQUIRED，避免绕过新门禁。纯标题 forward-fix 保留原 facts 和 provenance，创建新版本；原保存回执仍指向原版本，profile 回退不删除数据。

NOT_CHECKED 扩展了严格枚举，旧 D15 服务/插件不能保证识别。启用关闭时效的策略前须绑定支持同一 OpenAPI 摘要的服务与消费者；已写入此类来源后保留兼容服务和原状态，不能因 SQLite/API 版本未变而可写降级。旧 FRESH 记录仍按原语义读取，不回写为 NOT_CHECKED。本轮实际包覆盖两种模式的重启回放；历史跨包/WSL 回执不代表新模式已在目标机通过，见[本次证据](../hackathon/evidence/dsh-g0-save-time-policy-20261006.md)。

插件严格 decoder 与类型见 `first-purchase-save-model.mjs/.d.mts`；它不读取本地时钟决定资格；初次实现当时未改变 UI，当前卡片接线见下节。验证命令与证据见[本轮记录](../hackathon/evidence/dsh-g0-save-admission-20261004.md)。固定源码对的[兼容窗口](../architecture/first-purchase-service-compatibility.md)已实测：旧服务仅允许只读身份，D15 可写状态禁止随 profile 降级。候选/接收/激活/回退已消费显式 `service_binding`，但本机证据仅允许准备 candidate；现场激活仍 fail closed。服务包/依赖窗口、目标主机证据验证器、生产策略/run 身份、真实宿主/浏览器和现场验收继续 PARTIAL/NOT_RUN；本地 UI 接线见下节。

## CRM 会话与 workbench 卡片接线（2026-10-06）

默认关闭，尚未修改任何生产 profile。已有 Host 插件行可显式传入以下非凭据配置；这不是发布准入，也不自动启动分析服务：

| Owner | 配置/合同 | 用途 |
|---|---|---|
| CRM host `@shine-mage/dsh-crm-knowledge/host` | `firstPurchaseOrigin` | 已验收分析服务的 literal loopback HTTP origin；只允许 inspect/save/reconcile 三个固定路径，无代理/重定向。 |
| workbench 根 Host 插件 | `firstPurchaseCandidateDigest` | 经核验的当前候选完整 SHA-256；必须同时被服务端 allowlist 准入，不能由浏览器指定新候选。 |
| CRM host | 可选 `shinemage-first-purchase-access/v1` | 当前 DSH session 的可撤销 lease；token 不输出给 workbench、浏览器、模型或磁盘。 |
| 独立分析服务 | 现有 CRM identity resolver + RunStore + save policy | 每次校验当前 CRM 账号/权限、run owner、来源与候选；继续显式关闭结果年龄检查。 |

浏览器只调用 DSH authenticated Connection 的 `POST /api/analytics-first-purchase/save`，要求可信 Origin、JSON、自定义 UI header，拒绝跨站来源与 query string。请求 8 KiB、响应 512 KiB 上限；Host/relay/browser 时限分别为 12/10/15 秒。未配置、未连接、不可读或不可保存时显示原因，未连接的驾驶舱/导出/发送保持禁用。

卡片先核对原回执和服务端资格，只有显式“确认保存分析”才写入。保存前将 identity/run/title/evidence digest 留在当前浏览器 localStorage，按账号、session、run、call 分区，不保存 token/password/facts。存储不可用或原记录损坏时拒绝新保存；不自动清理旧标识。超时/丢失 ACK 返回 SAVE_UNKNOWN，核对不到回执也不能声称未执行；明确重试只发送原请求。候选变化后仅核对旧 identity，禁止用新 identity 替代未知请求。换浏览器或删除这些记录可能失去旧候选定位，因此现场验收仍须覆盖恢复和人工查回执路径。

CRM 连接事件取消旧请求、清空旧显示；服务器撤销 grant 后不发布迟到结果。卡片直接展示服务端 `NOT_CHECKED`，不把它标作 FRESH，不取消会话有效期。

**当前限制**：`analytics_first_purchase_native.py` 仍是独立 B0 synthetic 运行时，actor 固定 synthetic-demo。接上真实管理员并不授予它读取/保存该账号 run 的权限；本轮没有别名映射或管理员绕过。下一步需在隔离固定 DSH 中证明查询 run 与 CRM 身份一致，以及实际 Cookie、路由、卸载/重启和浏览器流程。已核对[本轮证据](../hackathon/evidence/dsh-g0-save-ui-20261006.md)：当前只通过本地源码/HTTP/jsdom，不代签生产或 headed Chrome。
