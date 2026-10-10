# 首购 Host / 浏览器门禁 OCR 审核（2026-10-07）

结论：当前未提交的 Host、浏览器、CI 和文档共 **28/28 文件**完成审查；发现的两项中等问题与一项文档陈旧问题已修复，复核后无已确认未修复问题。此结论限于本批改动，不关闭产品 PARTIAL 或生产门禁。

## 方法与覆盖

使用用户点名的 `open-code-review-delegate`：实际执行 `ocr delegate preview --format json`、`ocr delegate rule --format json <files>`，由当前 Agent 阅读和审查，没有调用外部 LLM 或独立 reviewer。OCR 可审查文件 **17/17**；其按扩展名排除的 **11 个 Markdown** 另行全部人工核对，没有跳过。补用仓库 commit 前 `/review` 检查清单核对数据/状态锁、输入信任、子进程、状态消费者及 CI 边界；不把这个检查点声称为完整多模型或远端 PR 评审。

范围：两个 workflow、CLI、浏览器驱动、B0 环境及 pipeline、Host/service 共用校验、新 runtime/browser 门禁与测试夹具，以及 STATUS、TODO、计划、操作/参考文档和四份阶段证据。按文件状态的完整清单、规则、结论及文件摘要保存在 `.context/checks/first-purchase-host-browser-review-20261007/` 的 `preview.json`、`rules.json`、`review.json`、`checks.json`。本页为新增的第 29 个交付文件，另行检查。

## 发现与修复

| 级别 | 位置 | 问题与修复 |
|---|---|---|
| Medium / correctness | `scripts/release/runtime-host-evidence.mjs` | 原逻辑只要求 pytest stdout 包含 `1 passed`，矛盾的 failed/error/skipped 日志仍能写 observation。三项回归先复现 Missing expected rejection；修复为同时拒绝正数失败/错误/跳过，写状态之前失败，复核字节与 mtime 不变。 |
| Medium / test | `scripts/dsh-b0/pipeline.mjs` | browser verifier 已被 release suite 自动发现，但遗漏 B0 固定清单，两个 B0 CI job 不会运行它。已补入同一清单，保持原 HTTP 校验。 |
| Low / documentation | `docs/operating/first-purchase-save-admission.md` | 当前状态仍说目标浏览器未完成。已对齐实际 headless 五场景及 journal seq 5/6，保留 headed/移动端/无障碍和生产边界。 |

没有重打业务包、修改 DSH 上游、重写历史回执或改变现役服务。截图检查仅验证附件形状和摘要，字体/浏览器二进制及操作者清理观察不属于远端签名认证；这些已声明限制没有被误记成生产通过。固定 controller Git 对象必须保留，缺失历史仍 fail-closed。

## 本轮验证

| 命令 / 层级 | 本次结果 | 日志 |
|---|---|---|
| `node --test --test-name-pattern='contradictory pytest' scripts/release/runtime-host-evidence.test.mjs`，修复前 | **3 FAIL**，均为缺少预期拒绝；保留失败证据 | `pytest-negative-before.log` |
| `node --test scripts/release/runtime-host-evidence.test.mjs scripts/release/browser-host-evidence.test.mjs`，修复后 | **70 PASS / 0 SKIP / 0 FAIL** | `host-gates-after.log` |
| `node --test scripts/release/*.test.mjs` | **348 PASS / 0 SKIP / 0 FAIL**；包含上行 70 项，不重复计数 | `release-tests.log` |
| 固定 `B0_BUILD_UPSTREAM`，运行 package-manager-env / first-purchase-kernel-artifacts / first-purchase-runtime-artifacts / pinned-host-acceptance 四个 test 文件 | **52 PASS / 4 SKIP / 0 FAIL** | `host-env-tests-pinned.log` |
| 原 HTTP / browser 封套分别执行 `plugin verify-host` | **PASS**，分别返回原 seq 5/6，完整 journal 字节和 mtime 不变 | `actual-retries.json` 与两份 `*-retry.stdout` |
| 15 个固定候选输入 | 原摘要、大小、mtime 保留 | `actual-retries.json` |
| Node 语法、差异、链接、secret scan、B0 清单接入 | 见实际检查结果 | `checks.json` |

4 项跳过是需要显式 query/save receipt、Python 与 wheelhouse 的冷安装条件测试，本轮未重跑；不冒称完整 B0 pipeline、远端 CI 或 WSL 新执行通过。首次环境子集未给 `B0_BUILD_UPSTREAM`，为 47 PASS / 9 SKIP，随后补上已有固定 checkout 完成其中 5 项，无环境升级。

输入保护脚本首次把历史 seq 5 的 journal 当成不可变包比较，发生基线选择错误；已明确排除历史 journal 行，单独以本轮原 seq 6 摘要验证。两次实际 CLI 重试均未改 journal，错误记录保留在 `baseline-check-r1.json`。当前 journal SHA256 为 `792a180cb1c054c3e568c2b3d2e0aa9d4f38cc8f5d9095f598d73541bcd5407a`。

## 后续

本批通过审修后做本地 commit，正常运行 hooks，不 push 或发布。下一步核对目标 WSL 的在途崩溃、torn-frame 与 rc1→rc2 恢复输入，继续使用同一候选及隔离合成会话；旧版 runtime、profile 和业务状态分开核验，代码回退不等于数据回退。真实身份/模型/UAT、供应链、production activation/canary/rollback 和物理分仓仍开放。
