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

T3/T7 继续 PARTIAL：新 adapter 的 clean 候选、真实 CRM 会话/撤权与目标平台接入、真实 candidate allowlist、可信策略配置及生产时限仍待完成。供应链、目标 DSH/session/WAL、浏览器/真实 UAT 和物理分仓沿用 G0/stop-go；本轮没有 GitHub push/发布、生产切换或真实数据访问。
