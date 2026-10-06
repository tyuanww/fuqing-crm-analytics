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
| `POST /session-identity` | 只读，body 必须为 `{}`。重新校验当前身份及三项 query 权限；返回 `first-purchase-session-identity/v1`。不接受 owner/session/token 字段，不创建 run、不启用保存。 |
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
| CRM host `@shine-mage/dsh-crm-knowledge/host` | `firstPurchaseOrigin` | 已验收分析服务的 literal loopback HTTP origin；仅 identity/inspect/save/reconcile 四种固定操作，无代理/重定向。 |
| workbench 根 Host 插件 | `firstPurchaseCandidateDigest` | 经核验的当前候选完整 SHA-256；必须同时被服务端 allowlist 准入，不能由浏览器指定新候选。 |
| CRM host | 可选 `shinemage-first-purchase-access/v1` | 当前 DSH session 的可撤销 lease；token 不输出给 workbench、浏览器、模型或磁盘。 |
| 独立分析服务 | 现有 CRM identity resolver + RunStore + save policy | 每次校验当前 CRM 账号/权限、run owner、来源与候选；继续显式关闭结果年龄检查。 |

保存卡片只调用 DSH authenticated Connection 的 `POST /api/analytics-first-purchase/save`，要求可信 Origin、JSON、自定义 UI header，拒绝跨站来源与 query string。请求 8 KiB、响应 512 KiB 上限；Host/relay/browser 时限分别为 12/10/15 秒。未配置、未连接、不可读或不可保存时显示原因，未连接的驾驶舱/导出/发送保持禁用。

卡片先核对原回执和服务端资格，只有显式“确认保存分析”才写入。保存前将 identity/run/title/evidence digest 留在当前浏览器 localStorage，按账号、session、run、call 分区，不保存 token/password/facts。存储不可用或原记录损坏时拒绝新保存；不自动清理旧标识。超时/丢失 ACK 返回 SAVE_UNKNOWN，核对不到回执也不能声称未执行；明确重试只发送原请求。候选变化后仅核对旧 identity，禁止用新 identity 替代未知请求。换浏览器或删除这些记录可能失去旧候选定位，因此现场验收仍须覆盖恢复和人工查回执路径。

CRM 连接事件取消旧请求、清空旧显示；服务器撤销 grant 后不发布迟到结果。卡片直接展示服务端 `NOT_CHECKED`，不把它标作 FRESH，不取消会话有效期。

上述保存卡片阶段只验证固定 synthetic-demo 的 HTTP 来源，见[该阶段证据](../hackathon/evidence/dsh-g0-save-ui-20261006.md)。后续查询归属接缝见下节；既有 fixture 不会被管理员接管。

## 原生查询的 CRM 归属接缝（2026-10-06）

本地隔离场景可以显式配置两端，缺一端就拒绝访问：

- 原生查询 factory 的 `identity_mode="crm-session"`。未指定仍是既有 synthetic 演练模式；不会自动切换现有状态。CRM 模式拒绝旧 `asset_capabilities`，保存必须走独立版本化服务。
- 独立保存服务 owner 构造 `CRMFirstPurchaseIdentityResolver(..., allow_query=True)`。默认为 `False`；当前账号 allowlist、CRM `/auth/me` 管理员权限、合成数据 scope 继续逐次检查。准入候选及保存策略另行配置，身份结果不代表生产放行。

查询内核经已有 runtime token 保护的 Host bridge 读取当前原生 session 的身份观察。workbench 只调用 CRM 的可撤销 lease；CRM token 仍只在其 host 闭包及到配置服务的 Authorization 中出现。Host 只接受登记且仍存在的 session；服务 owner 与 lease username 必须一致。身份观察不缓存、不落盘，不是可复用令牌；缺插件、旧服务不支持接口、错误合同或超时均拒绝。

RunStore 沿用原生 session 的唯一持久绑定。新 run 的 owner 和权限 scope 来自服务身份；同一 session 换账号，或把历史 synthetic-demo session 改接 CRM，返回 `SESSION_ALREADY_BOUND`。必须显式准备独立 session/隔离状态，不能改写原 owner 或把旧结果授予管理员。相同账号重启后重放原 request 仍返回原 run。

未登录/退出/明确撤权与服务不可用分开处理：前者拒绝访问并停止派发；后者返回 `IDENTITY_UNAVAILABLE`，暂停派发、保留原排队任务，恢复后沿用原 request。活动任务继续遵循现有 deadline、worker 退出和 UNKNOWN 证据规则，不把网络故障伪称为账号撤权。

本次实际 HTTP 验证使用合成 CRM 账号、真实查询 worker 和隔离 SQLite，覆盖查询→保存→ACK 丢失→回执恢复/重放。Host 调度接收器是受控夹具，**不代表官方 DSH 或浏览器验收**。现有 B0 演练 gateway 在登录前检查查询权限，不能直接当作 CRM 登录/生产入口；下一步须在固定官方宿主验证受控 admission、登录路由/Cookie、会话恢复与卡片，再生成 clean 候选。默认启动、生产 profile 和杭州现役未改变。见[本次证据](../hackathon/evidence/dsh-g0-native-crm-owner-20261006.md)。

后续独立官方宿主验证已完成 Cookie/Origin、CRM 登录、原生 loop/worker、保存回执和重启重新登录，见[官方 Host HTTP 证据](../hackathon/evidence/dsh-g0-official-crm-http-20261006.md)。该阶段查询准入由私有测试驱动器发起；最新官方命令与浏览器增量见下节。官方 Cookie 绑定 authority，验证重启时应保持同一监听地址，不能把更换随机端口后的 401 误判为凭据持久化失败。

## 官方原生命令准入（2026-10-06，本地合成 profile）

workbench 在显式 first-purchase runtime family、登记 session 和固定 B0 loopback 端口下，通过官方 `commands.register` 注册以下命令。未配置或普通其他会话返回 NOT_AVAILABLE，仍可继续原生对话；不覆盖 composer、`session/prompt` 或共享 `/api` interceptor。

```text
/first-purchase 查看合成首购路径
/first-purchase-status [run_id]
/first-purchase-cancel run <run_id>
```

先在官方原生槽位连接 CRM，再在输入框提交查询。Host 原生命令 ID 映射为 `fp-<commandId>`，由既有内核受理并交给原生 Agent Loop，不新增 ledger 或调度器。Host 的 `B0_GATEWAY_TOKEN` 必须与自有 kernel 的 gateway credential 一致，只在 Host 私有环境注入，不能写入 profile、浏览器包、模型提示或日志；它不替代 CRM 身份。适配层只访问固定 loopback 路径，12 秒时限、512 KiB 响应上限，未知/不完整受理回执不显示成功。

查询请求超时或丢失响应返回 ADMISSION_UNKNOWN，先用只读 status 查看当前账号会话最近五个任务或指定任务，不自动重发。状态读取继续重验 CRM。取消只接受明确的 run，卡片内部则用 `call <call_id>` 经原 session journal 找到精确 request；不以“当前会话最新任务”代替。CANCEL_ACCEPTED 仅表示受理，WORKER_ACTIVE/CANCEL_UNKNOWN 不能显示已停止。切换会话后丢弃迟到回复。

rc2 空会话尚无原生历史面板时，插件只经公开 `command/executed` 与会话 input notice 展示自己命令的结果；其他命令与原生行为不变。首购卡片独立注册自己的工具名，不依赖 shine-query 的全局开关。官方原生工具折叠默认行为保留。

本次 HTTP 整链和 Chrome headless 五项观测分别实际通过，见[证据](../hackathon/evidence/dsh-g0-native-command-browser-20261006.md)。仍仅为本地源码、合成 CRM/JSON、mock 模型和隔离 SQLite；新 clean 候选、目标主机、headed/无障碍/真实模型与业务验收仍开放，不代表生产保存已启用。


## 查询服务与保存服务的存储边界（2026-10-07）

新增领域合同 `first-purchase-frozen-source/v1`，API `1.0.0`。提供方是查询内核，消费方是独立分析保存服务；Pydantic/生成的 [OpenAPI](../../backend/contracts/analytics-first-purchase-source.openapi.json) 由本领域维护，不加入 DSH 核心或公共插件 ABI。当前只接合成首购数据。未知 schema/API 版本拒绝；发布组合以后用固定源码与包摘要绑定合同，当前源码通过不等于旧包支持它。

- 查询 owner 显式调用 `create_first_purchase_source_app(run_store, identities)`，或向原 native factory 传入 `source_identities`，才挂载 `POST /api/v1/analytics-first-purchase/sources/resolve`。该接口只读冻结 SUCCEEDED 来源，无派发、数据迁移或资产写入。
- 请求只包含 schema、run ID 和 `analysis:read|analysis:save` 目的。查询服务独立验证同一 Bearer 的当前账号、scope、权限和 run owner；不信任浏览器传来的 actor、权限、事实、SQLite 路径或 candidate。
- 保存 owner 显式注入 `HTTPFirstPurchaseSourceResolver(origin)`，且 `run_store=None`。origin 目前仅支持同机字面 loopback HTTP；不解析 DNS、不用代理、不跟随重定向/设置 Cookie，不缓存凭证或结果。每次请求默认总时限 2 秒（配置上限 5 秒），响应 512 KiB，头 16 KiB；重复字段、缺字段、类型修补、摘要/owner/run/请求结果不一致均拒绝。
- 原单体/合成路径仍使用本地 resolver，同时配置本地 RunStore 与其他 resolver 会拒绝启动。HTTP 模式不允许通过旧 `POST /analyses` 绕过候选准入。
- 新保存取得本地写锁后读取来源，远程调用完成后再次检查当前身份和保存策略，再原子提交分析、来源和两种回执。慢来源可能导致其他写请求返回可重试的 `STATE_UNAVAILABLE`；恢复后按原标识核对/重试，不新建动作来绕过。
- 回执重放先验证当前账号与权限；相同请求可直接返回原回执，不依赖查询服务在线或旧候选仍准入。冲突仍拒绝。新保存在来源服务不可用时返回 `SOURCE_UNAVAILABLE`，不会伪称未执行或自动补写。

这是经过身份验证的不可变来源快照与本地事务，不是跨服务分布式事务。权限检查之后的外部撤权无法与本地提交形成同一数据库事务；若未来要求严格跨服务原子撤权，需要单独版本化授权租约，不以本次结果作保证。现阶段代码没有数据库迁移、复制或删除；profile 回退也不删除已保存分析。

已完成独立进程/官方 Host 的本机合成验证，证据见[本轮记录](../hackathon/evidence/dsh-g0-first-purchase-source-http-20261007.md)。新 clean 双包、Linux/WSL、远端凭据传递/传输保护、生产账号准入仍是后续 gate；当前默认部署未切换。
