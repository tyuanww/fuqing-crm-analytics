# 首购保存服务兼容窗口

本页记录 T3/T7 的合成状态兼容窗口。本机源码/精确包与后续 WSL 观测分别保留执行范围；DSH/profile、插件、analysis-service 和 durable state 分属不同 owner，切换插件不删除或降级服务状态。下表不能按相同 API 版本或 SQLite schema 推广到任意服务版本。

## 当前可复核窗口

- 旧服务：commit `56198c32a52d9822c7a3338d92b0fa077d1c61bc`，不提供 D15 保存/来源 API。
- 新服务：commit `a50bd42492195040efaa6989c90e4fe84030551c`，版本化保存门禁与回执。
- 状态 owner：analysis-service；`first_purchase_analyses.sqlite3`，application_id `1397572502`，SQLite schema 1。
- 数据仅为每次新建的 synthetic JSON/SQLite。2026-10-04 的源码对运行于同一锁环境；2026-10-05 改为两个实际 archive、两个独立 venv，各自从本机 wheelhouse 离线 hash 安装 13 项精确依赖。两版历史依赖锁相同（Python 3.14.4 / FastAPI 0.141.1 / Pydantic 2.13.5），所以验证了安装隔离，没有验证依赖版本升级。
- 2026-10-05 的包配对运行于 Darwin arm64。历史服务代码取自精确 Git tree，打包器/bootstrap/资源清单取自当时工作树，分别记入 `service_source` 和 `source`，不冒充曾发布的历史包。2026-10-06 同一双包另有 WSL 首购服务合成验收及 journal 接线，见本页末节；新 clean 包的本机结果单独列于下段，生产身份和目标 DSH runtime 仍未验证。

2026-10-06 审核提交 `2be518e584d3adfb0343be58049dc3c674cea2f9` 另生成 clean 首购候选，与同一旧服务源码对比，源码和实际双包分别 **9/9 PASS**，兼容结论与下表一致。两包打包来源均 `worktree_dirty=false`；这是新的 artifact 对，旧 WSL 观测不能移植。随后同一新双包另做 WSL 合成 **14/14 PASS**，绑定插件来源 `78779206`、candidate journal seq 4，见[候选绑定与现场证据](../hackathon/evidence/dsh-g0-service-candidate-binding-20261006.md)；[clean 服务准备记录](../hackathon/evidence/dsh-g0-service-clean-candidate-20261006.md)中的 NOT_RUN 属于此前阶段。生产身份/策略仍未完成。

`c95751f8` 之后的[身份 resolver 边界增量](../hackathon/evidence/dsh-g0-service-identity-boundary-20261006.md)已完成本地测试、8/8 提交前审核，并提交 `80aba9c1`。该 clean SHA 已生成新的服务双包，源码与实际离线包各 **9/9 PASS**，新候选 `4e49cc04…` 绑定本机服务回执、journal 第 3 条事件；插件 tarball 与上一候选相同。随后同一 `80aba9c1` 新双包另做 WSL synthetic **14/14 PASS** 并追加原 journal 第 4 条事件；10 个自有进程已退出，现役监听/PID 不变。没有将身份 adapter 或候选 digest 当作生产认证、供应链签名或保存准入。 后续[CRM HTTP 身份适配器](../hackathon/evidence/dsh-g0-crm-identity-adapter-20261006.md)已审修提交 `7edf7710`，该 clean 服务包完成源码/离线包各 9/9 与包内 adapter 5/5，本机单独验证，不继承本段 WSL 结论；它不改变 API/状态版本、候选 allowlist 或时限策略。

| 服务 / 状态 / 动作 | 结论 | 操作边界 |
|---|---|---|
| 新服务读取旧 v1 保存状态 | PASS | 记录/facts 不变；旧记录来源返回 PROVENANCE_NOT_RECORDED，不补造。 |
| 新服务配置 D15 策略后调用旧保存 API | 拒绝已验证 | VERSIONED_SAVE_REQUIRED，不能绕过候选/时间门禁。 |
| 旧服务读取 D15 状态 | 限只读身份 PASS | 可读保存快照；拒绝标题写入；数据库字节未变。旧 D15 API 为 404/NOT_AVAILABLE。 |
| 再恢复新服务，无 RunStore/无策略 | PASS | 原回执与命令精确重放，原分析/来源不变，不重新执行查询。 |
| 新服务标题 forward-fix | PASS | 新增版本 2，保留 facts/来源；原回执仍指向版本 1。 |
| 小型 SQLite 备份后在新目录、新进程恢复 | PASS | 原回执/来源和 title 幂等重放保持一致。仅冷恢复，不声称并发备份或生产 RPO/RTO。 |
| 旧服务以可写身份修改 D15 记录 | **BLOCKED** | 已在隔离副本确认：旧代码生成版本 3 时未复制 provenance，新服务读取最新版来源返回 PROVENANCE_NOT_RECORDED。 |
| 两版服务打开未知 schema 99 | 拒绝已验证 | 初始化失败，数据库摘要未变；不现场迁移。 |

## 回退规则

1. 回退插件/profile 时，保留与 D15 状态兼容的新 analysis-service；停用新保存入口也不删除已保存记录、回执或 provenance。
2. 若必须临时恢复旧服务，只允许配置无 `analysis:save` 的身份供读取。旧服务不能承担 D15 reconcile，界面应显示 NOT_AVAILABLE 并保留原请求身份，等待兼容服务恢复。
3. **不能仅因 schema 仍为 1 就把服务降级为可写。** 候选控制面已拒绝旧服务可写组合；接收/安装保留同一绑定，激活和回退在写 journal、修改指针或幂等返回前重新校验。源码、artifact 与既有 WSL 合成回执均已接线记账，但没有生产放行效力；所有声明该服务的现场激活仍拒绝，不表示已经验证生产身份和写权限。
4. 如果绕过限制已经用旧服务写入，先保留状态并恢复兼容服务核对原版本；不可把最新版本伪装为有来源的结果，不自动复制历史 provenance 或重跑查询来补齐。

## 候选和主机门禁

显式试验 profile 可增加 `service_binding`。默认 profile 不声明/启用 D15 保存；当前合同仅覆盖首购 analysis-service，不强迫纯展示插件依赖业务服务。

| 字段 | 当前合同 |
|---|---|
| `schema_version` / `service_id` | `dsh-service-binding/v1` / `analytics-first-purchase` |
| `source_sha` / `api_version` | 验证回执中的精确 40 位 baseline 或 candidate / `1.0.0`；相同 API 版本不等于任意源码兼容 |
| `state` | `owner=analysis-service`、`application_id=1397572502`、`schema_version=1`、`contract=analytics-first-purchase-saved-provenance/v1` |
| `access` | `read-only` 或 `read-write`；baseline 的 `read-write` 明确拒绝 |
| `lifecycle` / `rollback` | `external` / `preserve-service-and-state`；插件包不托管、删除或迁移服务数据 |
| `evidence_sha256` | `service-save-compatibility.py` 实际生成的 `receipt.json` 原字节 SHA-256 |

`plugin candidate` 与 `release --offline` 使用 `--service-evidence /absolute/receipt.json`；前者用 `--profile` 选择 profile，后者沿用 `DSH_PROFILE_MANIFEST`。控制面核对完整观测、源码对和当前 runner/probe 摘要，将原始回执快照嵌入 `service_compatibility` 并纳入候选摘要。只接受有界普通文件，链接/FIFO/缺字段/篡改/陈旧验证器均拒绝。回执是可复核的本机观测，并非签名的生产证明。

正式 `preflight` 和只读 `preflight --check` 也接受同一参数；兼容检查在联网/构建前执行，正式阶段将路径继续传给 release 并重验原字节。重复参数、缺值和失配均阻断，不能等到 runtime 构建完成才发现缺证据。

新 source release 的 `profile_snapshot` 必须对应实际 payload 文件和摘要；service proof 与包内 profile 不一致时接收失败。安装将绑定写入 marker 及既有 PREPARE_INTENT/PREPARED journal；激活/回退核对目标绑定、当前 marker 和历史激活绑定，删除 marker 中的服务字段也不能从该 journal 降成 legacy 路径。未声明服务的历史 release 保留原行为；不把它们追认成通过 D15 验收。

本机证据得到 `LOCAL_COMPATIBLE`、`release_ready=false` 和 `BLOCKED_SERVICE_PACKAGE_AND_HOST_EVIDENCE_REQUIRED`。实际激活返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`，没有 override。门禁不启动服务、不授予身份、不读取数据库；真正的目标身份只读性仍须现场验证。

完整 G0 放行仍需要生产身份/策略、供应链、生产形状时限/UNKNOWN、DSH UI/浏览器与目标 DSH runtime 证据。当前 `2be518e5` 双包已完成候选绑定与目标合成验收；后续服务源码变化须形成新包并取得对应证据。合成回执 `status=PASS` 只表示预期观测完成，包括旧写入不兼容的负面观测。源码候选接线和拒绝后的无副作用验证见[门禁证据](../hackathon/evidence/dsh-g0-service-gate-20261004.md)。

2026-10-04 完成新服务独立包与同版本 HTTP 恢复，见[当时证据](../hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。2026-10-05 的[精确包配对证据](../hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)覆盖上表全部 9 项观测；新回执 `shinemage-service-artifact-compatibility/v1` 记录两个 archive/manifest、安装后的实际依赖、wheel hash 和验证器摘要，始终 `release_ready=false` / `BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED`。它不替换现有 `service-save-compatibility.py` 的源码回执，也不能直接作为现有 `--service-evidence` 输入；没有据此解除 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`。

执行入口和失败记录见[跨版本验证证据](../hackathon/evidence/dsh-g0-service-save-compat-20261004.md)。

2026-10-05 增加 `plugin verify-service --candidate … --evidence /absolute/pair/receipt.json --state-path …`。它先重验候选原始 digest/profile/service gate 和已存在的 PREPARED journal，再核对同一源码对的包内外 manifest、每个允许文件、源码回执中的 code 摘要、当前 bootstrap/resource/recipe、精确依赖与 wheel 观测，最后追加 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`；新进程重试不重复记录。候选原文件与源码回执不变，artifact 回执不能代替 `--service-evidence`。

该命令返回 `LOCAL_SERVICE_ARTIFACTS_VERIFIED`，不是目标主机结论；`target_host=NOT_RUN`、`supply_chain=NOT_RUN`、`release_ready=false`。它复核已有安装观测而不重新安装 wheel、验证签名或执行包内代码。既有激活/回退门禁不消费此本机事件作放行依据，仍返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`。详见[本机接线证据](../hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)。

2026-10-06 的[WSL 首购合成验收](../hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)完成同一双包的 14 项检查，原 dirty 来源标记保留。`verify-service` 成对增加 `--target-evidence` 和 `--target-input` 后核对固定 runner、输入、日志与清理回执，并在原 journal 追加 `CANDIDATE_SERVICE_TARGET_OBSERVED`，见[接线证据](../hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。原 artifact 事件的 `target_host=NOT_RUN` 作为历史事实保留。新事件明确为 `UNATTESTED_OPERATOR_OBSERVATION` / `SYNTHETIC_A64_ONLY`；生产身份、来源签名与激活仍未通过，不能将这份旧包观测挪用给新包。
