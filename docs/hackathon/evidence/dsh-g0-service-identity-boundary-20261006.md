# 首购服务身份接缝与故障边界（2026-10-06）

上一批 clean 首购绑定文档已完成 OCR delegate **4/4** 审核、70 项门禁测试及真实回执重验，通过正常 hooks 本地提交 `c95751f83448f7d16414797b8f74f8735f18fd85`。本页记录提交之后的下一步源码增量，实施阶段未提交或发布；本批后续审核单列于文末，不将前批覆盖宣称为本增量的审核结果。

## 实现范围

首购 HTTP factory 增加由服务 owner 实现的同步 `FirstPurchaseIdentityResolver` 协议，沿用现有 `AnalyticsPrincipal`。显式传入的 adapter 即使布尔值为 false 也不再被空 B0 注册表替换。接口只检查凭证格式、身份形状与不可变权限集合；实际认证、过期、撤销与 I/O 时限属于 provider，未实现生产认证。

身份与策略 provider 的异常在服务边界变成固定脱敏错误；不反射原消息、provider code 或 recovery URL。身份返回 401/403 或可重试的 503 `IDENTITY_UNAVAILABLE`；策略故障为可重试的 503 `SAVE_POLICY_UNAVAILABLE`。无效输入/身份及 provider 失败不会落盘分析或幂等回执。保存重放与 reconcile 保留当前读、写权限要求，已有只读分析访问保持原合同。

只修改首购 app 与其 API 测试，没有添加依赖/包文件，没有改 HTTP schema、SQLite schema、DSH/插件、固定 runner 或默认生产配置。默认身份仍为空，策略仍显式注入；本页不授予任何真实 candidate 保存资格。

## 本次验证

固定环境：Python **3.14.4**、Node **24.19.0**；服务测试使用现有锁环境，合同生成使用 B0 固定 Python。所有状态来自临时 synthetic RunStore/SQLite；不读取真实 DuckDB，不访问杭州或真实模型。

| 检查 | 本次实际结果 |
|---|---|
| 修改前新增边界负测 | 17 FAIL，23 未选中；原实现暴露 adapter 替换、无效身份未校验、错误/策略异常未统一等接缝缺口。原日志保留 |
| 聚焦保存 API | 42 PASS（含 19 个新边界用例）；计入下一行，不能重复相加 |
| 保存/回执/恢复及既有分析四文件 | **74 PASS**，0 FAIL / 0 SKIP；约 28.6 秒、峰值进程树 RSS 0.22 GiB |
| 实际首购 archive 专项 | **1 PASS**；仓库外最小 13 项依赖环境执行 HTTP 保存、拒绝/冲突、重启回放、UNKNOWN、forward-fix、受控进程回收与确定性打包 |
| OpenAPI 与生成 TypeScript | PASS，digest `3b45ef6df28219827343f9b1bcc0c6c8c35f46dd05790b340ed1f266c9a702b4`，合同未变 |
| Ruff / `git diff --check` | PASS |
| 文档与既有产物保留 | 170 个相对文档链接有效；原 129 个输入/产物/journal 的 SHA、大小与 mtime 不变 |

第一次修复后发现新增测试错误地期待读身份可以 reconcile；既有合同明确同时要求 `analysis:read` 与 `analysis:save`。修正测试以保留该边界，再验证恢复权限可查原回执、完全撤销返回 401，原记录不变。失败报告保留，不以放宽权限消除失败。

实际包专项本次 archive 为 **76427 B**，SHA-256 `15188c9796855b43c3b569dfb436e9a1a7dd3f381e0b109740b35bdb4c7eb8a4`，manifest `a1b25ff29de452e51f7ce9db0b3976c46f8dba1883317c30609b232f2b276acb`。它是 dirty 工作树的临时测试包，测试后清理；不是 clean 发布候选。该场景验证既有 B0 fixture 的包内运行，独立身份 adapter 的故障/撤权验证来自上述源代码 API 测试，不冒充实际生产 provider 或 WSL 验收。

```sh
SERVICE_PYTHON="$PWD/.context/checks/service-package-pair-20261005/build-venv/bin/python"
"$SERVICE_PYTHON" scripts/run_backend_tests_bounded.py \
  backend/tests/test_analytics_first_purchase_analysis.py \
  backend/tests/test_analytics_first_purchase_save_api.py \
  backend/tests/test_analytics_first_purchase_save_receipts.py \
  backend/tests/test_analytics_first_purchase_save_recovery.py \
  --report-dir .context/checks/service-identity-boundary-20261006/regression

CRM_SERVICE_PYTHON="$SERVICE_PYTHON" node --test --test-concurrency=1 \
  --test-name-pattern='^first-purchase archive' scripts/crm-calibration/service-package.test.mjs

node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check \
  --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python
"$SERVICE_PYTHON" -m ruff check backend/analytics_first_purchase_analysis_app.py \
  backend/tests/test_analytics_first_purchase_save_api.py
git diff --check
```

已存在的 report 目录不能覆盖；再次运行选新输出目录。原始证据根 `.context/checks/service-identity-boundary-20261006/`：`before.log`、`before-exit.json`、`focused.log`、`focused/`、`regression.log`、`regression/`、`package.log`、`contract.log`、`ruff.log`、`diff-check.log`、`final-checks.json`。首次权限预期错误的 bounded 报告另保留在 `.context/checks/20261006T064820501195Z/`。

## 仍未关闭

- T3/T7 仍 PARTIAL：实际生产身份/撤权来源、真实 plugin candidate allowlist、可信策略来源及生产 freshness/UNKNOWN 时限未接通。当前协议不提供签名认证、网络 timeout 或隔离外部 provider 的运行时。
- 新代码已按下方记录从审核后的 clean commit 形成服务包并绑定本机 candidate；该新包的目标主机证据尚待取得。旧 `2be518e5` 双包、`afcdae56…` candidate、seq 4 与 WSL 14 项证据继续仅适用于原字节，不能给本增量背书。
- 供应链、目标 DSH runtime/session/WAL、浏览器/真实 UAT、生产激活和物理分仓仍按原 G0/stop-go 关闭。保存 UI 维持 NOT_AVAILABLE；本轮没有 push、Release、生产切换或真实数据访问。

## 提交前 OCR delegate 审核

同日继续执行 OCR `delegate preview/rule`。原始 **8/8 文件 reviewed，0 skipped，coverage 100%**：首购 app、保存 API 测试，以及 STATUS、TODO、拆分计划、兼容窗口、服务包说明和本页。OCR 只自动选中 app；测试因 `default_path`、六份 Markdown 因 `unsupported_ext` 被排除，全部按对应规则补审。

已追踪 factory → 身份/策略边界 → 保存事务/reconcile/只读查询，以及包资源清单、默认启动、旧源码/包回执范围。未确认新阻塞缺陷。异常上下文的主动抑制用于防止外部 provider 信息进入 HTTP/日志，不把通用规则建议的异常链透传套在此安全边界；生产 provider 的超时与日志责任仍是明确开放项。

当前 Python 检查输入 SHA-256 为 `8d96cee79d42c6155dcc042ef06ba0b21c2b7c27e256a3ebdc73a991754982d9`，与上方 74 项通过报告完全一致；本轮核对报告，不重复运行或声称新通过次数。审核期间只追加状态说明，未再改变应用/测试。原始选择、规则和对应性核验保存在 `.context/checks/service-identity-review-20261006/{preview.json,rules.json,source-check.json,review-summary.json}`；随后通过正常 hooks 本地提交，生成 clean 服务候选另行记录。

## 审核后 clean 服务候选与本机接线

身份接口批次已正常提交 **`80aba9c1facb34fd890cbc5eb9a2f2697140f245`**，提交后工作树干净，未 push。pre-commit 的 import、test-order 和 ground-truth 检查实际执行；既有 18 处 test-order WARN 未阻断，没有绕过 hooks。以下产物均在修改本段文档之前生成，打包来源 `worktree_dirty=false`。

本次重新执行固定旧源码 `56198c32a52d9822c7a3338d92b0fa077d1c61bc` → 新源码 `80aba9c1…`：源码 synthetic SQLite/ASGI **9/9 PASS**；两个实际 archive、两个独立 venv，从已有 wheelhouse 以 hash 离线安装各自 13 项固定依赖后的 HTTP **9/9 PASS**。旧 writer 来源丢失继续作为预期负测被检出，禁止将其降级为可写；未知 schema 拒绝时小库字节不变。与上一轮的 74 项报告复核是不同层级，不能混算测试数。

| 对象 | 本次固定值 |
|---|---|
| candidate 服务包 | 76478 B / SHA-256 `270cf084aaa6ac327ab9eba1357313d4390e411cd012b915a51ae4394f39fb5e` |
| candidate manifest | `ab5cfcdf193d140dba7faa303aba858aeef3265cd5920eb5b9a264fd2c056b37` |
| baseline 服务包 | 66646 B / `ab77dc53b9fca6c5d5d90a04683a47c1380777d934626faa043c06b8da8d764a`；旧源码配当前打包器，不冒充历史发布包 |
| 源码回执 | `a133bac605dd4f56eacc79024532252638a8362514872d1923021e7e2124be9b` |
| 实际包回执 | `1a302500e129347f1ab11cfa9d0186eecc37255ef997981e8a3e5d3c6b69a7f2` |
| 新 candidate / profile digest | `4e49cc04b2b38391dcb90a60cd510a53a6f4d3a4160aadf63fb7c09b84bee127` / `59333fdec84e69691e7891465a8ca7b83bd705ffca7114325fe21a3f1006bf79` |
| 插件 tarball | 421582 B / `5efdbec5d0239bdd5ead109442a30430163b867d684bf0168cc31ca59a44321d`，与上一候选逐字节相同 |

先核对 `78779206..80aba9c1` 的插件、toolchain、打包器和合同输入无变化，再通过原 `plugin candidate` 生成新 profile/服务绑定。复用现有固定编译产物，新 tarball 与原包逐字节一致；没有重建 DSH 或插件，没有修改上游、依赖或生产 profile。新 candidate 的来源记录为当前 clean 提交，插件文件本身未变。

实际 `pnpm dsh plugin verify-service` 复核新源码回执、双包和安装观测，追加原控制面的 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`，journal 共 3 条。再次 CLI 执行及提供旧 WSL 回执的拒绝路径均未改动本次 58 个输入/产物/状态文件的摘要、长度、mtime；旧回执返回退出码 **2 / SERVICE_TARGET_PAIR_MISMATCH**。原候选的 129 个文件也保持不变。现有激活校验函数的本地调用仍返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`，没有操作生产主机。

证据根 `.context/checks/service-identity-clean-80aba9c1-20261006/` 保存 `source.log`、`pair.log`、固定 `source/`/`pair/`、`service-binding.json`、`source-gate.json`、`verification.json`、`profile.json`、`plugin-candidate/`、`plugin-state.json`、`verify-service*.log`、`old-target-rejected.log` 和 `candidate-verification.json`。runner 正常完成其 finally 回收；本机 runner 不记录各进程 PID，未宣称本次有独立逐 PID 回收证据。

命令沿用[clean 服务验证入口](./dsh-g0-service-clean-candidate-20261006.md)，candidate 参数改为完整 `80aba9c1…`、输出改为上述新目录；`plugin candidate` 指定本次 `profile.json`、源码回执和独立显式 `plugin-state.json`，`verify-service` 指定同一候选与包回执。后续纯证据文档提交不改变本表的来源，也不要求重打包。

新包 **WSL/生产身份/真实候选准入/时限/供应链仍 NOT_RUN，release_ready=false**。本次仅本机 Darwin arm64 验证，未连接杭州、读取真实库、push、发布或激活；既有 WSL 14 项不迁移到新服务包。
