# 首购服务复用现有 CRM 身份（2026-10-06）

本轮在 `codex/plugin-boundary-review@c1892186` 的干净工作树继续。用户确认复用现有 CRM 管理员账号；未要求新增账号或角色体系。未在仓库、日志或证据保存所提供的密码，也未进行真实账号登录。生产 freshness/expiry 尚未确认，保存继续禁用。

## 范围与独立性

- 可选 `CRMFirstPurchaseIdentityResolver` 通过现有 `/api/v1/auth/me` 验证 Bearer，显式账号名单与当前管理员授权均须匹配。每次重新请求，用户名保持为来源 owner，不新增 token 表或账号数据库。
- 使用已固定的 `h11` 与标准库 socket；总截止时间、头/正文/线上字节上限、严格 JSON 合同、拒绝重定向/压缩、错误脱敏均在 adapter 内实现。配置仅接受显式 loopback 地址，不使用 DNS、代理、Cookie 或自动重试。
- 适配器归首购服务清单，不依赖旧 CRM 实现、DSH 或插件；依赖锁仍为原 13 项。默认启动仍拒绝访问；候选准入、时限与身份分开，真实业务 data scope 没有启用。
- 新测试接入既有 B0 pipeline；实际包专项增加在仓库外最小 venv 中运行的身份测试，不把主仓环境或 fixture 打进应用包。请求/响应字段与 SQLite schema 未改变；OpenAPI 补充外部身份与旧入口适用范围，离线重生成 JSON 和 TypeScript 摘要。

## 实际验证

| 范围 | 本轮结果 |
|---|---|
| 首轮 adapter 定向 | 60 PASS；随后纳入下一行，不重复计数 |
| 服务锁环境，身份/分析/保存 API/回执/恢复五文件 | **134 PASS**，0 FAIL / 0 SKIP；修复后重跑 29.79 秒测试时间，峰值 RSS 约 0.22 GiB |
| 实际首购包，仓库外最小 13 项依赖 | **1 PASS**，含现有保存/重启/恢复场景及 5 项 adapter 观测：接受现有账号、撤销管理员权限、拒绝未准入账号、会话失效、认证服务故障 |
| 服务兼容/包证据/目标观测三文件 | **90 PASS / 0 SKIP** |
| B0 固定环境、ResourceWarning 升格错误 | 同一 60 项 adapter 用例 PASS，不重复计入 134 项；仅既有 Starlette 弃用提示 |
| OpenAPI/TypeScript | PASS；最终 digest `a32c455af4c564f308adbb743a65e888da864b8718a2e02a5202ada7c53f9b09`，字段未变 |
| Ruff、差异 | PASS |

新增 HTTP 测试使用本次拥有的临时 loopback server，包括慢速 headers/body 的总超时、重复 JSON 字段、错误身份、重定向、超大响应和协议错误；认证失败不会留下新分析或幂等回执。复用一个已保存结果时仍验证当前身份，撤权拒绝、恢复后返回同一回执。缺策略时即使身份通过也不能保存，其他真实用户名不能冒用 `synthetic-demo` 的结果。

独立包首次运行失败为 `SERVICE_DEPENDENCY_VERSION_MISMATCH`：本次调用封装对 venv Python 做了 `Path.resolve()`，解引用到系统解释器，丢失锁环境。改用不解引用的绝对 venv 路径后通过；未修改依赖或绕过包校验。失败 `package.log` 与成功 `package-r2.log` 均保留。

成功的临时测试 archive 为 **78986 B**，SHA-256 `87412eb74e971523df90651519079014ecfb9fe4e9579aeeb4848a549619d9d2`，manifest `f36f758767d8cabb760a87274f9c0b434c7a2a44788a161fe72ad20b37d756c9`。这是下方 OCR 修复后第三次包专项的产物（`package-r3.log`），dirty 源码的隔离测试产物，测试结束回收，不是 clean 发布候选。

```sh
SERVICE_PYTHON="$PWD/.context/checks/service-package-pair-20261005/build-venv/bin/python"
"$SERVICE_PYTHON" scripts/run_backend_tests_bounded.py \
  backend/tests/test_analytics_first_purchase_crm_identity.py \
  backend/tests/test_analytics_first_purchase_analysis.py \
  backend/tests/test_analytics_first_purchase_save_api.py \
  backend/tests/test_analytics_first_purchase_save_receipts.py \
  backend/tests/test_analytics_first_purchase_save_recovery.py \
  --report-dir .context/checks/service-crm-identity-20261006/regression-r2
CRM_SERVICE_PYTHON="$SERVICE_PYTHON" node --test --test-concurrency=1 \
  --test-name-pattern='^first-purchase archive' scripts/crm-calibration/service-package.test.mjs
node --test --test-concurrency=1 scripts/release/service-compatibility.test.mjs \
  scripts/release/plugin-service-evidence.test.mjs scripts/release/service-target-evidence.test.mjs
node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check \
  --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python
```

已有证据目录不可覆盖，复跑请另选新目录。原始证据根 `.context/checks/service-crm-identity-20261006/`，保留初轮与最终 `regression-r2/`、`package-r3.log`、`service-gates-r2.log`、`b0-adapter-r2.log`、`contract-r2.log`、Ruff 和 OCR preview/rules。测试服务器/服务和小型 synthetic 状态由本次测试清理。

## OCR delegate 审核中修复的缺口

**P1：旧写入口可绕过保存准入。** 首次 adapter 测试只覆盖 D15。继续跟踪 factory 的旧 `POST /analyses` 后发现：自定义身份 resolver 已通过、但 `save_policy` callback 未配置时，旧入口直接创建分析。新增真实 HTTP 负测先得到 **201 而非 409**，留下 `legacy-before-source/` 的 1 FAIL / 58 PASS；首次试用 runner 不支持的 `--pytest-arg` 参数仅为命令错误，另存 `legacy-before.log`，不计作代码负测。

修复后，旧写入口仅允许原始 `B0IdentityRegistry` 的历史合成场景；所有外部 resolver（含 CRM adapter）均须使用版本化保存，缺准入策略时无法写入。默认服务仍无身份/状态，原 B0 fixture 兼容行为由既有测试覆盖。OpenAPI 增加 `x-legacy-b0-identity-only` 并修正身份说明，字段与状态版本不变；JSON/TS 离线同步。

此修复后，五文件 134 项、独立包、B0 的 60 项和 90 项服务门禁均重新执行通过；上表只报最终结果，初轮日志不覆盖。OCR delegate 覆盖全部 **16/16 文件，0 skipped，100%**，工具默认排除的 9 份文档/测试/生成类型已补审。已确认的旧入口 P1 缺陷完成修复，无剩余已确认缺陷；审核覆盖及保存摘要见 `review-summary.json`。

## 现场证据的边界与后续

本轮先完成上一个 `80aba9c1` 固定双包的杭州 WSL **14/14 PASS**，真实 CLI 绑定原候选 journal seq 4，10 个临时 PID/目录已回收，生产监听/PID 不变，见[该包现场记录](./dsh-g0-service-identity-boundary-20261006.md)。本页新增 adapter 不在该包内，不继承其现场结论。

T3/T7 继续 PARTIAL：新 adapter 的 clean 服务包已完成下节验证；新插件候选绑定、真实 CRM 会话/撤权与目标平台接入、真实 candidate allowlist、可信策略配置及生产时限仍待完成。供应链、目标 DSH/session/WAL、浏览器/真实 UAT 和物理分仓沿用 G0/stop-go；本轮没有 GitHub push/发布、生产切换或真实数据访问。

## 审核提交后的固定服务包

已通过正常 hooks 本地提交 **`7edf771050cbcfcf31ad4a88b679e62ad31bf651`**；工作树干净后生成以下产物，没有 push。首次 commit 被文档实证检查拦截，已为“未配置策略拒绝保存”补充实际回归链接，再通过原 hook，没有绕过。18 处既有 test-order WARN 保持非阻断。

使用同一固定基线 `56198c32a52d9822c7a3338d92b0fa077d1c61bc`，源码 SQLite/ASGI **9/9 PASS**；两个实际 archive 各自使用已有 wheelhouse 的 13 项锁依赖、两个新 venv，离线 HTTP 兼容 **9/9 PASS**。另外安全解包同一新 archive，在第三个离线最小 venv 执行包内 adapter，**5/5** 身份观测 PASS。没有重新构建 DSH 或运行时插件。

| 对象 | 固定值 |
|---|---|
| candidate 服务包 | **79049 B** / `26b07aa7a62d62b18610c4d8badddd649c58542c35dcd80e5c5faed00b4f99df` |
| candidate manifest | `86b6c5ebfcd66647d2601e3fbcc87680337c9052019b521e282b6d8de79171d6` |
| baseline 服务包 | 66647 B / `b968944d212d66ad4d93f79124e1d00e75b93abe5093c9d447fac5ec4d05687a`；旧代码与当前配方，不冒作历史发布包 |
| baseline manifest | `a5a9da1f0be4037e1d8d174ea37e8133c8e2ef458fd3863c6e41cb347eb4a444` |
| 源码回执 | `64454bfd18d49354d6b7eed97d965109274d6d9a9f19093c29cea60ceab7199f` |
| 实际包回执 | `e1291bcbe63e5b6d3ab1bbfb2111d8b0dcc7d9a2fba5cdff00649967a9a077b0` |

两包 `source.worktree_dirty=false`；candidate 的实际服务代码来源与配方均为 `7edf7710`。通过现有 `prepareServiceCompatibility` / `verifyServiceArtifactEvidence` 得到 `LOCAL_SERVICE_ARTIFACTS_VERIFIED`。提供 `80aba9c1` 的 WSL 回执时得到 `SERVICE_TARGET_PAIR_MISMATCH`；实际本地调用激活门禁仍抛出 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`，没有网络或主机动作。

证据根 `.context/checks/service-crm-identity-clean-7edf7710-20261006/`：`source.log`、`pair.log`、`source/`、`pair/`、`service-binding.json`、`source-gate.json`、`artifact-verification.json`、`adapter-verification.json` 与 `gate-verification.json`。源码/包配对命令沿用[clean 服务入口](./dsh-g0-service-clean-candidate-20261006.md)，candidate 改为完整 `7edf7710…`、output 改为本根目录。临时应用/venv 均由 runner finally 回收；配对 runner 不记录各进程 PID，不将空列表当作独立逐 PID 证明。

额外 adapter 冷安装检查首次因其隔离 PATH 未包含已有 zstd 而失败，临时目录已回收；补入明确的本机工具目录后通过，未安装或替换依赖。另一次本地断言误把 Node 错误正文（附摘要 diff）与单一错误码做全字符串相等；改为核对首行错误码，验证器始终正确拒绝旧 WSL 回执。原日志和 `gate-check-initial.json` 说明保留。

**本节只完成 clean 服务包。** 新 plugin candidate/journal 绑定、WSL/真实 CRM 现场验证、生产保存策略与供应链仍 NOT_RUN；`release_ready=false`。后续纯证据文档提交不改变本表服务来源，不需为文档重打包。旧 129 个产物与 `80aba9c1` 候选的 131 个产物/回执/journal 均已核对保留。
