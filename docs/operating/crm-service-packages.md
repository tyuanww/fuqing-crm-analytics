# CRM、知识与首购分析服务独立候选包

这是 T15 / T3 / T7 的 synthetic 交付入口。服务分别拥有应用包、资源清单、Python 依赖锁和进程。包不携带 DSH、插件、真实数据库、账号配置或主仓运行环境。首购保存的插件 UI 尚未接通；当前源码仍在同一 workspace，尚未物理分仓、发布或安装到杭州生产环境。首购固定双包已完成杭州临时隔离安装验收，详见[兼容窗口](../architecture/first-purchase-service-compatibility.md)，不代表其他服务或后续源码通过。

## 三个交付单元

| 单元 | 输入与 owner | 对外合同 | 包内资源 |
|---|---|---|---|
| `shinemage-crm-metrics-service` | [指标包清单](../../services/crm-metrics/package.json)，`crm-service` | `crm-metrics-service/1.0.0` | 唯一明确的 synthetic JSON，运行时创建并关闭自己的临时小型 DuckDB |
| `shinemage-crm-knowledge-service` | [知识包清单](../../services/crm-knowledge/package.json)，`knowledge-service` | `crm-knowledge-service/1.0.0` | `pack`、历史验证、节点、边、指标定义与证据索引共 6 份公开 JSON；没有私有源文件、数据库或 DuckDB 依赖 |
| `shinemage-analytics-first-purchase-service` | [首购包清单](../../services/analytics-first-purchase/package.json)，`analysis-service` | [服务身份及状态合同](../../backend/contracts/analytics-first-purchase-service.v1.json)，API 1.0.0 | 保存 API、权限/状态/来源逻辑与共享 RunStore 合同；无 fixture JSON、worker、DSH、知识资源和 DuckDB 依赖 |

服务软件版本初始为 `0.1.0rc1`，与产品 VERSION、DSH pin、API 版本分开。每份输入清单逐文件声明 source、打包后的 target 和 code/resource/bootstrap 归属；不通配复制 `backend/`、`knowledge/` 或仓库。领域实现只有一份源文件，打包原样复制，不生成第二套业务实现。

包内 `backend` 是应用的私有实现命名空间，使用[无副作用初始化入口](../../scripts/crm-calibration/service-namespace.py)，不加载旧 CRM 的聚合合同/语义导出。**各包使用独立目录、venv 和进程，不混装成共享 Python 库。** 首购包暂时保留共享 RunStore 及其协议依赖；这是受清单约束的服务内部闭包，不是已经拆开的查询服务 API。

## 本地打包和核对

前置：已有 Node 24、Python 3.14、zstd；Python 环境满足所选服务清单的精确依赖。打包命令不会下载、安装依赖、启动服务或发布。当前本仓的全量后端锁环境可用于构建；每个服务实际依赖更小，知识服务不需要 DuckDB。

```sh
node scripts/crm-calibration/package-service.mjs \
  --service metrics --python /absolute/locked-python3.14 \
  --output /absolute/new-metrics-candidate
node scripts/crm-calibration/package-service.mjs \
  --service knowledge --python /absolute/locked-python3.14 \
  --output /absolute/new-knowledge-candidate
node scripts/crm-calibration/package-service.mjs \
  --service first-purchase --python /absolute/locked-python3.14 \
  --output /absolute/new-analysis-candidate
```

每个新目录包含 `.tar.zst`、`service-manifest.json`、`candidate-receipt.json`。回执绑定 archive SHA-256、manifest SHA-256、Git 基线、dirty 状态及实际文件摘要。dirty 输入明确标为未审查候选；所有候选均 `release_ready=false`，签名/供应链、安装和激活初始为 `NOT_RUN`。同样输入产生相同包；输出目录已存在则拒绝，不覆盖旧候选。

打包按顺序完成：验证精确清单 → 拒绝源符号链接/越界/过大输入 → 复制允许的文件 → 生成依赖锁与摘要 → 扫描实际包内容的 secret → 在包内执行只读 `check` → 复查输入未改变 → 复用现有 release tar/zstd 打包器。候选回执最后写入；中断留下的无回执目录不能视为成功候选，使用新目录重试。

首购包额外在复制后、扫描前，从实际暂存 factory 和该包固定依赖生成 `openapi.json`（manifest 的 `role=contract`），生成器禁止 SQLite 连接、socket 连接/绑定与子进程启动。它不是沿用 B0 另一套依赖生成的 JSON：本次实测 FastAPI 0.136.1/Pydantic 2.13.2 与服务的 0.141.1/2.13.5 对回执 discriminator 的 schema 表达有差异。独立包的 schema 随 artifact 固定，并在最小依赖进程中与实际 HTTP factory 逐字段核对；现有 B0 合同与插件类型未修改。

首购包可额外指定 `--source <40位Git-SHA>`：只从该 Git tree 读取 `role=code` 的普通文件，并核对该 SHA 的 `requirements-lock.txt`。`source` 记录当前打包器所在工作树的 HEAD/dirty/清单摘要，`service_source` 另记实际服务 SHA/历史锁摘要；bootstrap、资源及配方仍来自当前工作树，不能把它当成历史已发布包。命令不 fetch、checkout 或改写分支。

仅跨版本验收的旧基线增加 `--compatibility-baseline`，使用[显式旧配方](../../services/analytics-first-purchase/compatibility-baseline.json)，保留旧 API 与 saved-analysis/v1；`0.0.0rc1` 是此次诊断重打包身份。该标志必须同时指定精确 SHA，不能给当前 D15 源码换个旧版本标签，状态常量和生成的 OpenAPI 会拒绝错误组合。

将 receipt 中的 archive digest 与实际文件核对后，使用现有安全解包器写入**新的**安装目录，再检查包内 manifest digest：

```sh
/absolute/locked-python3.14 scripts/release/secure-unpack.py \
  /absolute/candidate/shinemage-crm-metrics-service-0.1.0rc1.tar.zst \
  /absolute/new-metrics-install --max-entries 100 --max-bytes 8388608
/absolute/metrics-venv/bin/python -I /absolute/new-metrics-install/service.py check
```

`-I` 必须保留：忽略调用方 PYTHONPATH 和用户 site。`check` 验证 schema、身份、所有文件摘要、额外文件/链接、资源范围、Python 与精确依赖，不导入应用、不监听端口。检查通过只表示本地完整性和运行前置条件；清单自带的 hash 不是发布者签名，生产接收还须验证受信任 receipt/source。

## 显式启动与故障边界

以下是操作入口说明，不代表本轮已启动常驻实例。服务 owner 在批准的隔离环境中分别运行：

```sh
/absolute/metrics-venv/bin/python -I /absolute/metrics-install/service.py serve --port 18101
/absolute/knowledge-venv/bin/python -I /absolute/knowledge-install/service.py serve --port 18102
```

只监听 `127.0.0.1`，没有外部 host、reload、多 worker 或自动重启参数。端口 0 仅供拥有进程的临时测试自动分配。启动先输出 `SERVICE_SOCKET_BOUND` 和包身份，**不把绑定端口当成 HTTP 健康通过**；随后须带合同头探测 capabilities。默认关闭 access log，错误输出稳定代码，不回显资源内容。

通过 [profile 生成器](./crm-plugin-service-boundary.md) 分别配置两个 origin。服务停止不会触发插件偷偷启动 Python、访问旧主仓或改用真实数据。服务使用各自资源路径，不接受模型传入 SQL、文件路径或凭据。

独立指标服务要求合同 header，且不提供旧 `/crm-metrics/explain`；知识服务拥有 `/crm-knowledge/explain`。主仓的旧 Python factory/CLI 仍保留兼容 adapter。新的指标 [OpenAPI](../../backend/contracts/crm-metrics-service.openapi.json) 和插件 HTTP 类型对应独立服务；旧 [OpenAPI](../../backend/contracts/crm-metrics.openapi.json) 保留兼容窗口。

知识服务不再导入指标计算引擎。历史 `verification.json` 作为带来源的旧记录保留，独立包不会据此打开主仓文件，也不会把旧记录冒充当前验证；结果明确标记 `implementation_verification_scope=not_evaluated_in_service_package`。

首购包的 `service.py serve --port 0` 默认不配置身份、状态目录、RunStore 或保存策略；实际请求返回 401，不创建数据库，也不启用旧写入口。服务 owner 后续须通过公开 factory 注入受信任依赖。当前只有包外的[隔离测试驱动](../../scripts/crm-calibration/first-purchase-package.fixture.py)注入临时身份、合成状态和固定时钟；它不进入包，不是生产启动配置。生产鉴权与目标主机注入仍未交付。

## 首购服务身份与策略接入边界

`create_first_purchase_analysis_app(..., identities=resolver, save_policy=provider)` 的身份参数遵循同模块的 `FirstPurchaseIdentityResolver` 同步接口。服务 owner 负责验证凭证及其时效/撤销，返回现有 `AnalyticsPrincipal`；不要求继承 B0 注册表，也不依赖 DSH 或旧 CRM 登录代码。未配置身份时仍使用空 B0 注册表并拒绝访问，B0 fixture 不是生产认证。

- 请求使用 `Bearer ` 加非空、无空格的可见 ASCII token，整个 Authorization 最多 1024 字符；重复头仍按既有合同拒绝。actor 为非空可打印字符串，最多 128 字符；capabilities/data_scopes 必须为 `frozenset[str]`，每组最多 128 项，每项同样有界。空权限集合不会自动获权。
- resolver 每次请求与既有保存事务重验点重新调用；不缓存身份快照。保存重放和回执 reconcile 仍需当前读、写权限；只读身份可以读取其已有分析，不因此恢复保存资格。
- provider 的 401/403 映射为固定 `UNAUTHENTICATED`/`FORBIDDEN`，其他异常或无效 principal 返回可重试的 503 `IDENTITY_UNAVAILABLE`。接口不回传 provider 原消息、错误码或 recovery URL。provider 自己的日志脱敏、网络超时与 I/O 上界由其实现负责，当前接口没有替它完成生产验收。
- 策略 callback 失败返回可重试的 503 `SAVE_POLICY_UNAVAILABLE`，不写分析/回执；既有 `SAVE_POLICY_INVALID`、缺策略和候选拒绝规则保留。已经保存且身份仍获准的精确重放不依赖在线策略/source，不能因 provider 故障重复创建记录。
- `FirstPurchaseSavePolicy` 的 allowlist 与时限仍由服务 owner 显式提供，不能从客户端 candidate digest、插件本地状态或未签名 journal 自动放行。请求/响应字段、SQLite 合同与 13 项依赖锁未变；OpenAPI 适用范围说明已同步生成。

身份接缝 `80aba9c1` 的固定包已有[本机与 WSL 合成证据](../hackathon/evidence/dsh-g0-service-identity-boundary-20261006.md)，不证明真实 CRM 认证或生产保存准入。后续适配器增量单独验收如下。

### 可选的现有 CRM 账号适配

[CRMFirstPurchaseIdentityResolver](../../backend/services/analytics/first_purchase/crm_identity.py) 已纳入首购包的精确 code 清单，复用现有固定 `h11`，不增加依赖。它只向服务 owner 配置的 loopback CRM origin 请求 `GET /api/v1/auth/me`；对应现有 [CRM UserInfo 与 me](../../backend/routers/auth.py) 的 `username` / `is_admin` 合同，不导入旧 CRM 模块。

```python
from backend.services.analytics.first_purchase.crm_identity import CRMFirstPurchaseIdentityResolver

# 只构造 adapter；existing_crm_origin 由部署 owner 明确提供。
identities = CRMFirstPurchaseIdentityResolver(
    existing_crm_origin, allowed_usernames=frozenset({"admin"}), timeout_seconds=2.0,
)
# 随后由服务 owner 向既有 create_first_purchase_analysis_app 显式注入。
```

- 复用已登录 CRM 的 Bearer，每次重验，不接收或保管密码，不调用 login，不缓存 token/权限。只接受显式账号且当前 `is_admin=true`；用户名原样作为 actor，不映射成合成用户。仅授予 `run:read`、`analysis:read`、`analysis:save` 与现有 `first-purchase-fixture` scope，不扩到真实业务数据或其他插件。
- origin 必须是有端口的字面量 IPv4/IPv6 loopback HTTP 地址；禁止 DNS、路径、query、fragment、用户信息和代理。请求不发送 Cookie，不跟随重定向、不重试。单次校验默认总计 2 秒、最多允许配置为 5 秒；连接、请求与慢速响应共享同一截止时间。响应头至多 16 KiB、正文至多 4 KiB、线上总字节另有限额，拒绝压缩/升级和错误 schema。
- CRM 401/403 分别拒绝为未认证/无权限，其余失败为可重试 503 `IDENTITY_UNAVAILABLE`，不透传响应正文或凭证。保存事务内仍按既有检查点重验，认证服务故障时不能新写入分析/回执；没有承诺跨 CRM 和 SQLite 的分布式原子撤权。
- 旧 `POST /analyses` 仅保留原 B0 注册表的合成兼容行为，任何外部 resolver 即使漏配 policy callback 也返回 409 `VERSIONED_SAVE_REQUIRED`，不能绕过准入。默认 `service.py serve` 仍不注入 adapter、RunStore、状态或策略。通过身份校验不能自动填写 candidate allowlist 或有效期；定向测试已验证：策略未配置时保持 `POLICY_NOT_CONFIGURED`/禁用保存（见 [identity-alone 回归](../../backend/tests/test_analytics_first_purchase_crm_identity.py)）。公共知识插件无需 CRM，其他身份 provider 仍可通过原协议独立实现。

本增量[本地 134 项回归与实际包观测](../hackathon/evidence/dsh-g0-crm-identity-adapter-20261006.md)已通过；审修提交 `7edf7710` 的 clean 服务包另完成源码/离线包各 9/9、包内 adapter 5/5。新 plugin candidate/journal、真实 CRM 登录/会话撤销、生产候选准入、有效期与该包杭州验收仍未完成。现役服务和保存 UI 未切换。

## 验证与尚未完成的交付

```sh
# 实际 pack → 安全解包 → 最小依赖 venv → 三种服务 HTTP / 保存重启回放
CRM_SERVICE_PYTHON=/absolute/locked-python3.14 \
  node --test --test-concurrency=1 scripts/crm-calibration/service-package.test.mjs
# 本地/CI 共享后端入口，也运行同一组真实包验证
/absolute/locked-python3.14 scripts/run_backend_tests_bounded.py \
  backend/tests/test_crm_service_packages.py backend/tests/test_crm_service_contracts.py \
  backend/tests/test_service_artifact_compatibility.py
```

测试创建并清理本次拥有的应用目录、venv、小型合成库和端口；依赖从已有固定环境按包清单复制，不联网、不复制业务数据。覆盖三种指标查询、知识解释、OpenAPI 一致性、真实数据拒绝、单服务停止、确定性构建、缺资源/篡改/链接/额外文件/错误依赖/secret 拒绝和不覆盖既有候选。CI 的 Python job 配置 Node 24 与 zstd；远端 CI 是否通过须看该次实际运行。

首购场景使用仓库的实际合成 worker 预置一个成功任务；包外最小依赖进程只消费该小型状态，验证保存、无 RunStore/策略的重启回放、SAVE_UNKNOWN、权限/冲突拒绝及标题 forward-fix。最小依赖进程显式拒绝导入 DuckDB、CRM/知识应用、worker、httpx 等未声明模块。另有源文件/安装 manifest 的 FIFO 和合同生成副作用负测。

上述日常包测试按已安装的 lock closure 复制依赖；它不代替下面的 wheel 冷安装。Python 可执行文件、目标平台 wheelhouse、签名/SBOM/CVE、干净 reviewed SHA、受信任 receive、canary 与回退仍需独立证据；生产不能现场编译或在线解析浮动依赖。真实 CRM 看板、私有知识库权限和生产数据不在这些包的验收范围。CRM/知识插件已分别拆为候选包；首购初始包结果见[证据](../hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。T3/T7/T15 仍 PARTIAL，保存 UI 与现场激活门禁保持关闭。

## 精确旧/新包的 opt-in 兼容验证

前置：本地对象库有这两个完整 SHA、两个构建/seed Python 环境满足各自历史锁、已有对应平台的 wheelhouse。验证器不下载依赖或补 Git 历史；CI 浅克隆没有历史对象时不能伪报通过。wheelhouse 只能包含该服务闭包的 13 个固定 wheel，不接受源码包、重复/额外/错版本依赖；安装到新 venv 使用 `--no-index --no-deps --require-hashes`，并对实际安装的完整 dependency inventory 再核对一次。

```sh
node scripts/crm-calibration/service-package-compatibility.mjs \
  --baseline 56198c32a52d9822c7a3338d92b0fa077d1c61bc \
  --candidate a50bd42492195040efaa6989c90e4fe84030551c \
  --baseline-python /absolute/baseline-build-venv/bin/python \
  --candidate-python /absolute/candidate-build-venv/bin/python \
  --baseline-wheelhouse /absolute/baseline-wheels \
  --candidate-wheelhouse /absolute/candidate-wheels \
  --output /absolute/new-pair-evidence
```

生成 baseline/candidate 两个不可变 archive、manifest、candidate receipt，以及顶层 `receipt.json` 和逐场景进程日志。先安全解包、冷安装、校验包，再用旧源码的合成 worker 在包外生成一次隔离输入；9 项 HTTP 观测只从解包后的应用导入服务，不依赖主仓源码或 worker。临时状态始终新建，不接受已有生产数据库路径；完成或正常失败后回收本次进程和临时目录，保留 artifact/日志。

回执 `shinemage-service-artifact-compatibility/v1` 包含双 archive/manifest hash、实际 Python/依赖版本和 wheel hash。PASS 仅说明全部预期观测完成；其中旧服务可写破坏来源的观测会得到 `BLOCKED_PROVENANCE_NOT_PRESERVED`。失败/中断保留 FAIL 和已完成项目，退出码 2；已有输出目录拒绝覆盖，重试必须用新目录。SIGINT/SIGTERM 在当前有界构建步骤结束后中止并回收，SIGKILL 无法保证即时清理。

2026-10-05 的配对实测为 Darwin arm64 / Python 3.14.4，两个旧/新源码锁的 13 项版本相同；这是独立冷安装证据，不是跨依赖版本升级或 WSL 证据，后续 WSL 结果见本页末节。wheel hash 固定实际安装字节，不能证明发布者身份。包回执不可作为候选的 `--service-evidence` 输入，也不放行主机激活；通过下面的补充核验接入候选 journal。原始观测见[包配对证据](../hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)。

## 将包回执绑定已有候选

前置：已有绑定同一旧/新源码回执的 plugin candidate、其原 `profile.json`/plugin tarball 和 PREPARED journal；已有上一节实际双包产物。当前机器只需 Node 24、Python3 和 zstd 做有界安全解包，不安装依赖、不启动服务或读取数据库。

```sh
pnpm dsh plugin verify-service \
  --candidate /absolute/plugin-candidate/candidate.json \
  --evidence /absolute/service-pair/receipt.json \
  --state-path /absolute/plugin-state.json
```

核验原 candidate/profile/plugin pack/source gate → 同一服务源码对与 9 项观测 → 当前验证器/recipe 指纹 → 两个 archive 的实际字节和内外 manifest → 精确文件白名单、code 源码摘要、bootstrap/resource、依赖锁与安装观测 → 在原 journal 幂等追加 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`。记录候选、artifact evidence、两份 archive/manifest 和依赖观测 digest；失败退出 2，写 journal 前完成全部检查。重试会再次验文件，并返回同一 journal seq/digest，不改写 candidate。

PREPARED 回执必须存在于实际 journal，幂等缓存不能单独证明已准备。在取得 journal 写锁后再次核对前置 seq/digest，允许其他观测追加，拒绝历史被替换；重复回执也必须与实际 journal 对应。状态文件只接受不超过 64 MiB 的普通文件，拒绝链接、FIFO 和越界文件；没有自动轮转或删除历史。CLI 失败只打印稳定错误码，不回显断言差异、输入字段或子进程输出；例如 `PLUGIN_SERVICE_PREPARED_NOT_DURABLE`、`RELEASE_EVENT_PREREQUISITE_CHANGED`，未知错误为 `PLUGIN_SERVICE_VERIFICATION_FAILED`。保留原始输入和 journal 进行本地排查，不通过手工改缓存绕过。

不带目标参数时，成功为 `LOCAL_SERVICE_ARTIFACTS_VERIFIED`，始终 `release_ready=false`、`target_host=NOT_RUN`、`supply_chain=NOT_RUN`、`activation=BLOCKED_TARGET_HOST_AND_SUPPLY_CHAIN_REQUIRED`。本地 JSON/hash 不证明发布者身份；该命令不重新安装 wheel，不把记录中的平台升级为 WSL 验收。激活门禁仍阻断。实际 CLI、负测和重试证据见[接线记录](../hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)。

已有 WSL 合成现场回执时，在同一命令上增加两个成对参数：

```bash
pnpm dsh plugin verify-service \
  --candidate /absolute/plugin-candidate/candidate.json \
  --evidence /absolute/service-pair/receipt.json \
  --state-path /absolute/plugin-state.json \
  --target-evidence /absolute/target-result/receipt.json \
  --target-input /absolute/target-input/input-manifest.json
```

`target-result` 必须保留现场回执及完整日志、清理/生产监听 sidecar；`target-input` 保留固定双包、13 个 Linux wheel、合成 seed、helper 与输入 manifest。当前 v1 校验器只接受已审核的 2026-10-06 有限 runner 摘要；原字节存于 `scripts/release/test-fixtures/target-acceptance-20261006.py`，仅供追溯/测试，CLI 不执行它，不重新安装或连接杭州。新 runner 需单独审核及版本化，不能自动接受。

写 journal 前核对原候选、服务证据以及目标输入/日志，拒绝未知字段、路径逃逸、链接/特殊文件、缺场景、未清理进程和虚假生产声明。复用原 artifact 事件后追加 `CANDIDATE_SERVICE_TARGET_OBSERVED`，在同一写锁下校验前置事件；若在两事件之间中断，重试沿用 artifact 事件后继续。相同参数重试会重验所有文件；原始 receipt 不被改写，幂等冲突不会覆盖历史。

成功为 `LOCAL_WSL_SYNTHETIC_SERVICE_OBSERVATION_VERIFIED`，同时返回 `evidence_authenticity=UNATTESTED_OPERATOR_OBSERVATION`、`candidate_policy=SYNTHETIC_A64_ONLY`。这只绑定首购服务的既有合成观测，不证明真实身份/候选准入、签名来源或其他服务；生产激活仍 BLOCKED。验证失败退出 2，只输出稳定错误码。实际 CLI 和本次测试见[目标回执接线证据](../hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。

## 安装前的目标主机只读预检

先完成上述包核验，再在拟安装服务的 WSL2 内运行。准备所选 manifest 和**对应目标平台**的固定 wheelhouse；`--manifest-sha256` 必须取自已经核验的候选回执，不能凭重新计算未知文件的摘要替代来源核验。当前仅支持首购分析服务。

```sh
pnpm dsh plugin service-preflight \
  --python /absolute/existing-python3.14 \
  --manifest /absolute/service-manifest.json \
  --manifest-sha256 VERIFIED_MANIFEST_SHA256 \
  --wheelhouse /absolute/target-platform-wheels
```

使用所选解释器的既有 pip/packaging 计算实际 Python/ABI/平台标签和 Requires-Python，不联网、不安装依赖。Python 必须为 3.14；WSL2 当前按 Linux 内核中的 `microsoft` 与 `wsl2` 标记识别，其他环境或无法识别的自定义内核保持 BLOCKED。wheelhouse 必须只含清单的精确闭包，每项恰好一个 wheel；拒绝缺项、多项、源码包、错误版本/元数据、符号链接和特殊文件。普通输入读取有界；manifest 最多 256 KiB，单 wheel 最多 64 MiB，总 wheel 最多 256 MiB。

每个 wheel 还须包含与名称/版本一致的唯一顶层 dist-info、WHEEL 1.0 和 METADATA；WHEEL 内部标签必须等于文件名展开后的标签，不能通过改名把 Mac wheel 变成 Linux wheel。按当前 Python/平台评估 Requires-Dist marker，所有生效依赖必须由锁定清单中的版本满足。当前精确服务锁不请求 extras，生效的 extras 或直接 URL 依赖明确拒绝；未生效的可选依赖不误报。该检查只处理有界元数据，不验证整个 wheel 的可安装性、全部文件内容或二进制可加载性，仍需要冷安装。
JSON 合同为 `shinemage-service-target-preflight/v1`，包含 manifest 摘要、平台事实、检查结果和每个 wheel 的摘要。全部匹配返回 `SERVICE_TARGET_PREFLIGHT_PASS`/退出 0；环境不匹配为 `…_BLOCKED`/退出 2；输入损坏为 `…_INVALID`/退出 2，只输出稳定错误码。该命令不校验完整 archive、不验证发布者身份、不导入或安装服务，也不写 candidate/journal；始终 `release_ready=false`、`activation=BLOCKED`，冷安装/身份状态/HTTP 恢复/供应链仍 NOT_RUN。

例如 macOS arm64 的 `pydantic-core` wheel 不能充当 WSL 平台依赖；主机预检通过后仍须由目标平台离线冷安装和真实服务恢复观测证明可运行。当前实现与本机/隔离测试见[预检证据](../hackathon/evidence/dsh-g0-service-target-preflight-20261006.md)。

## 已完成的首购 WSL 合成验收

2026-10-06 已将原固定双包和对应 Linux wheel 传到杭州专属临时目录，在现有低权限账号下复用上述预检、安全解包、离线 venv 和包外 fixture，实际完成 **14/14 检查**；包括权限拒绝、保存幂等、SIGKILL 后恢复、旧服务只读、合成小库备份恢复及未知 schema 拒绝。进程和安装目录回收后，生产入口监听/PID 快照不变。具体输入摘要、命令、失败和成功回执见[现场证据](../hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)。

传送测试状态时，archive 必须显式保留状态目录 `0700`，不能只打包文件而丢失目录权限；本次首次启动被此约束正确拒绝，修正夹具后在新目录重跑。复用原不可变应用包，生产端不编译、无在线依赖解析。常规插件 UI/工具变化仍只需要更新相应插件；此次冷安装是独立后端服务的验收，不意味着每次插件更新都重装 DSH 和所有服务。

本次身份、候选准入 digest 与时钟仍是合成 fixture；原包的 dirty 来源标记保留。目标回执现已通过上面的可选参数核验并接入原 journal；真实身份/状态策略、生产时间窗口、最终 reviewed 包与供应链仍未关闭，保存 UI 和生产激活保持关闭。旧版可写降级会丢失来源，回退插件时应保留新版服务与 durable state。其他服务、官方 DSH 宿主、真实业务/浏览器未由此验收覆盖。
