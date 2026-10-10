# 候选链完整增量审核（2026-10-06）

按用户要求使用 open-code-review-delegate，由当前 Agent 审核 `2a89790b42326376f0808e0896b0a78877bd28ba..0a183b6f` 的六个提交，不限于最后一次文档提交。OCR 负责文件选择和规则解析，没有外部模型调用。

## 覆盖与修正

原始 **22/22 文件，0 skipped，100%**：OCR 选择 11 个代码/测试文件；11 份因扩展名被排除的 Markdown 全部补审。检查完整目标证据解析器、归档 runner、负测、CLI、journal 前置历史/幂等、代理环境、重复 frozen 安装、profile 测试与产物证据；归档 runner 只读，不执行或修改。

没有确认新的代码缺陷。修正两处文档状态：相邻的[服务兼容窗口](../../architecture/first-purchase-service-compatibility.md)仍说 artifact 未接线、WSL 未验证，现明确历史本机、已有 WSL 合成观测和未完成生产门禁；[目标接线证据](./dsh-g0-service-target-gate-20261006.md)补上实际提交 `356862bf`，保留原验证时点。额外修改文档及本记录同样检查差异和本地引用。

## 本次验证

固定 Node 24.19.0、pnpm 11.7.0、已有 Python 3.14.4 环境。

- `node --test --test-concurrency=1 scripts/release/*.test.mjs scripts/dsh-b0/package-manager-env.test.mjs scripts/dsh-b0/pinned-host-acceptance.test.mjs`：**249 PASS、0 FAIL、2 SKIP**；两项因未设置 `B0_BUILD_UPSTREAM` 跳过。
- 显式指定现有固定 rc2 checkout，重跑 `pinned-host-acceptance.test.mjs`：**4 PASS、0 FAIL、0 SKIP**，补齐上述两项。两次合计 **251 个不同用例通过**，不把重复检查累加成新覆盖。此处为启动前保护测试，没有重新运行十场景宿主演练。
- 对 `9902bdd9` 的 7 文件 bundle 重新调用 `verifyPreflight()`：8 阶段记录、摘要、来源、文件集合 PASS；没有重建或把历史执行当作本次 preflight。
- 对两个既有插件候选实际重跑 `plugin verify-host`，仍为各自 seq 3；对既有 WSL 首购回执实际重跑 `plugin verify-service`，仍为 seq 4。候选、包、输入、回执与 journal 共 **120 文件**的 SHA/大小/mtime 不变。
- Markdown 本地引用、归档 runner SHA/AST、JS 语法及 `git diff --check` 通过。

机器证据：`.context/checks/full-review-0a183b6f-20261006/` 的 `preview.json`、`rules.json`、`review-summary.json`、`tests.log`、`host-guard-tests.log`、`artifacts-reverified.json`、`document-validation.json`。代码未改，不重复在线 audit、完整构建或远端验收。

## 交付边界

本轮审核后按正常 hooks 本地提交；无 push、发布或生产切换。`release_ready=false` 保留。本轮不重读真实 DuckDB、不连接杭州、不启动现役服务。

下一项为从本次审核后的 clean SHA 生成首购服务候选，实际重跑源码/精确包兼容性并记录新摘要；旧 WSL 观测不挪用于新包。生产身份/状态策略、生产形状时限/UNKNOWN、供应链、目标 DSH runtime、浏览器和物理分仓仍开放。
