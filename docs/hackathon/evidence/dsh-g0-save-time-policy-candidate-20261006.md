# 关闭结果时效后的 clean 候选与 WSL 验收

2026-10-06，`codex/plugin-boundary-review`。承接[时效策略实现](./dsh-g0-save-time-policy-20261006.md)，本轮从已提交的 clean `48e7ddfc42191d0f32aa3508fa6b5a889ee76ceb` 生成新候选，完成实际本机与杭州隔离验收，并绑定原控制面的 journal。产品仍 PARTIAL，生产激活 BLOCKED。

本轮没有新增产品代码、升级依赖或修改 DSH。已核对[当前计划](../../plans/shinemage-plugin-platform-split.md)与[任务账本](../TODOS.md)，只关闭新包验证和回执绑定子项。结果陈旧/过期暂缓，登录/session、候选准入、来源与 UNKNOWN 恢复仍需校验。

## 固定输入与产物

| 对象 | 实际值 |
|---|---|
| 服务与插件来源 | `48e7ddfc42191d0f32aa3508fa6b5a889ee76ceb`；打包来源 `worktree_dirty=false` |
| 旧服务源码 | `56198c32a52d9822c7a3338d92b0fa077d1c61bc`；当前打包器重建的兼容基线，不冒充历史发布包 |
| 新服务 archive | 79537 B；`8f096a132ab00e128db98604e1b443033d8884c0b5981a1328463b520a71a5e7` |
| 新服务 manifest | `3fc00b9eb0a88006b5b094d0d444e2b51852d5245f09183608b122496ebf7f42` |
| 双包回执 | `3c896d3abf29e979d58a38576306a4bb3198e9337842deb1b56cd17cd1af659c` |
| 插件包 | 421582 B；`5efdbec5d0239bdd5ead109442a30430163b867d684bf0168cc31ca59a44321d`，与上一候选逐字节相同 |
| plugin candidate | `9f00fadb7257a46812b43958aee0b585329406ff340c6976fb8705cc73556ea5` |
| profile | `first-purchase-no-age-local`；`2e977772843457f573c6d9db12e955729b9db62a6de025a6e432cc79b9b8c21e` |
| journal | seq **4**；`fd8cfd66eaa96676d24aba2d1c03f31275d31ca417e17f9b2fba6a757d3f1cfa` |
| 固定 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |

该 profile 用于本地候选绑定，不自动为生产服务配置保存策略。插件 decoder 的源码/生成类型已支持 NOT_CHECKED，但保存 UI 仍 NOT_AVAILABLE；tarball 字节相同不代表已接通保存 UI。

## 本轮实际验证

证据根 `OUT=.context/checks/service-time-policy-clean-48e7ddfc-20261006`。Node 24.19.0 / pnpm 11.7.0，服务 Python 3.14.4。以下是本轮新执行结果，不累加上一轮的 163/71/70 项。

| 入口与范围 | 结果 | 原始证据（相对 OUT） |
|---|---|---|
| `scripts/dsh-b0/service-save-compatibility.py --baseline 56198c32… --candidate 48e7ddfc… --output …` | 源码隔离兼容 **9/9 PASS** | `source/receipt.json` |
| `node scripts/crm-calibration/service-package-compatibility.mjs`，同一源码对、两个独立 venv、离线 hash wheel 安装 | 实际 archive/HTTP **9/9 PASS** | `pair/receipt.json` |
| `node dsh-plugins/analytics-workbench/build.mjs /absolute/pinned-upstream` | 编译/构建 PASS | `plugin-build-r2.log` |
| 下述 5 文件 `node --test --test-concurrency=1` | **95 PASS / 0 FAIL / 0 SKIP** | `tests.log` |
| `node "$OUT/verify-packed-crm-save.mjs"`，同一新服务 archive、第三个离线 venv、当前严格 decoder | 本机 CRM 合成身份与关闭时效 **6/6 PASS** | `packed-crm-save-verification.json`、`probe-http.stdout` |
| `python3 "$OUT/target/execute.py" run`，实际杭州 WSL2/Python 3.14.4、UID 65534 | 固定服务场景 **14/14 PASS** | `target/result/receipt.json`、`target/target-run.log` |
| `plugin verify-service`、重复核验、旧回执拒绝和生产 gate 负测 | seq 4；131 文件不变；激活仍 BLOCKED | `verify-target.log`、`binding-verification.json` |

95 项测试文件为 `dsh-plugins/analytics-workbench/test/{built,first-purchase-saved-analysis-view}.test.mjs` 和 `scripts/release/{service-compatibility,plugin-service-evidence,service-target-evidence}.test.mjs`。编译后测试使用与构建相同的 `B0_BUILD_UPSTREAM`；这是受影响范围回归，不是完整 B0 或浏览器验收。

首次插件构建因默认 upstream 路径与已有 SDK 链接不一致失败，日志保留在 `plugin-build.log`。随后显式使用链接实际指向的公共工作树固定 checkout：`/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public/.context/dsh-b0/upstream-0.1.7-rc.2`，固定 SHA/lock/SDK 校验及构建通过。没有改链接或上游，也没有把首次失败计为通过。

本机 6 项通过真实 HTTP mock CRM `/api/v1/auth/me`，调用包内实际 CRM resolver，使用随机内存凭据和 `synthetic-demo` 身份。服务策略显式准入上述真实 candidate digest：一年旧结果输出 NOT_CHECKED；错误 candidate 和客户端覆写被拒绝且不落盘；保存/重试同一回执；撤权、失效 session、上游故障拒绝；重新打开服务/SQLite、无 RunStore/策略时仍能精确回放；UNKNOWN/冲突保留原记录。HTTP 响应通过当前 result/receipt/provenance decoder。它不是生产账号登录，也不是独立进程崩溃测试；后者由 WSL 固定场景覆盖。

## 杭州隔离范围与清理

通过现有 Tailscale SSH、严格 host-key 校验连接。只读前置确认 Linux x86_64、内核 `6.18.33.2-microsoft-standard-WSL2`、Python 3.14.4，以及现役端口/PID。新旧包依赖清单相同，复用且重验原 13 个固定 Linux wheel 和 synthetic seed；新准备清单重新绑定本次服务 manifest。单包 **3737600 B**，传输约 **19.99 秒**，不在线解析依赖。

固定 runner 摘要仍为 `08a1650f0c8af1bea785d9d2c30f8086e06c6757737e70b41c7a0f13c505df79`，4 个 helper 使用当前源码字节。输入清单摘要 `b051d55e8cb09af10aebcf3421b07eb7982ef775275df1f22adf45d26c271bdb`；现场回执摘要 `a0b062ac23c2a7bf59751ade5da61eea125132a38c89c953d3f6a5c94a72ec60`。

14 项覆盖两个包的预检/冷安装、旧状态读取、时效/候选/权限拒绝、保存冲突、SIGKILL 后精确回放与 UNKNOWN、旧服务只读、forward-fix、小库备份冷恢复、旧 writer 来源损失检出、双版本未知 schema 拒绝、输入和安装完整性。**这些固定场景使用 A64 合成准入和开启时效模式**，不能把本机 6 项 CRM/NOT_CHECKED 组合称为已在 WSL 通过。

10 个临时服务进程均已退出、安装/状态目录已回收；6677/18090/18092/18093/18094 的监听/PID 快照一致。下载 50 个回执/sidecar、校验摘要并通过本地门禁后，核对本次标记与传输摘要，仅删除专属 `/tmp/shinemage-service-acceptance-20261006-identity-3gt1fpbg`。没有操作旧 release/runtime 或真实业务数据。清理证据为 `target/result/cleanup-verification.json` 和 `target/owned-directory-cleanup.stdout`。

## Journal 与剩余边界

真实 `pnpm dsh plugin candidate` 绑定新的源码回执/profile；`plugin verify-service --candidate … --evidence … --state-path …` 先进入本机 artifact seq 3，再带 `--target-evidence … --target-input …` 追加 WSL seq 4。前三条 journal 原样保留；重复两种 CLI 后 131 个源证据、包、候选、目标输入/回执及 journal 的内容、长度、mtime 均不变。

旧 `80aba9c1` WSL 回执被当前 helper 摘要检查以 `SERVICE_TARGET_HELPER_DRIFT` 拒绝；另有服务配对差异，不能将旧回执移植到新包。`assertServicePromotion` 仍返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`。前一 `7edf7710` 证据目录的 67 个文件也保持原内容/长度/mtime。

下一步沿用 T3/T7/T14：接实际 CRM 身份与显式候选策略，补目标 NOT_CHECKED 链和保存 UI/浏览器，随后完成目标 DSH runtime/session/WAL、供应链与 G0/stop-go；物理分仓仍后置。本轮未发布、推送、重启或切换生产；合成准入不是生产授权，`release_ready=false`。

## 提交前审核

使用 `open-code-review-delegate` 的确定性 preview/rule，由当前 Agent 自审全部 **7/7** 文件，**0 skipped / 100%**。OCR 默认排除 Markdown，已逐项补审；未调用外部模型。复核本次测试、产物摘要、journal、清理回执和本地合成 probe，修正计划表中的旧候选 SHA 与 STATUS 的历史测试时态，未确认新的产品代码阻塞缺陷。

本次 195 个本地文档链接与 `git diff --check` 通过；未因纯文档调整重复运行已经通过的业务套件。审核清单、逐文件摘要与最终输入保留检查见证据根的 `review-summary.json`、`document-links.json` 和 `final-integrity.json`。本批按既有授权走正常 hooks 本地提交，候选仍绑定 `48e7ddfc`，不会因证据文档提交重打包。
