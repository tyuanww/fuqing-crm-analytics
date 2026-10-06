# 干净候选 preflight 网络故障与修复（2026-10-06）

在 `codex/plugin-boundary-review` 完成 WSL 接线审核并通过正常 hooks 提交 `356862bf22a1c4fc67f96904f1baffa21fadc2c2` 后，使用 `config/dsh-profile.crm-knowledge.rc2.json` 开始正式候选准备。DSH 仍固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 未变。

## 实际故障与原因

1. `pnpm dsh preflight --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python --source-sha 356862bf22a1c4fc67f96904f1baffa21fadc2c2 --tag dsh-preflight-crm-356862bf`：prepare PASS（115140 ms），audit FAIL。npm bulk advisory 接口返回百度 HTML，无法解析为 JSON；直接 TLS 连接也超时。失败目录为 `.context/release-preflight-runs/dsh-preflight-crm-356862bf-xYp20Q/`，未生成可复核完整 bundle。
2. 只读查看本机网络配置发现系统使用 loopback 代理；显式通过该代理向同一 HTTPS advisory 端点请求，TLS 校验通过且返回合法 JSON。但原 `pipeline --audit` 仍失败：它只保留 HOME/CI/SYSTEMROOT 等变量，丢弃调用者设置的代理。
3. 插件重建另被已有 SDK 符号链接的旧 checkout 路径阻断。检查确认 CRM/知识的 node_modules 只有生成目录与 62 条依赖链接；原目录已移入本次 ignored 证据目录留存，重新按相同固定 SHA 的任务专用 checkout 建立链接后双包 build PASS。共享链接目标、已跟踪源码及 DSH 上游源码没有重写。

## 修复和验证

- 在既有 package-manager environment helper 中只挑选 8 个标准大小写代理变量；仅显式 Git fetch、pnpm manager 获取/下载/安装/audit 消费它。离线 build/rebuild/check、测试和业务宿主不使用这份 transport 环境。
- 不传递 `NODE_TLS_REJECT_UNAUTHORIZED`、`NODE_OPTIONS`、npm TLS/audit 绕过参数、模型凭据或数据路径；不改全局代理、DNS、Git 或 package-manager 配置。
- `node --test scripts/dsh-b0/package-manager-env.test.mjs`：**2 PASS / 0 SKIP**，含实际子进程接收代理、拒绝危险/业务变量，以及固定 Corepack 嵌套 shell。
- 经当前命令显式代理重新执行实际 `pipeline.mjs --audit --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python`：**PASS / No known vulnerabilities found**。仅审计本项目 build-tools 闭包，不是完整 DSH runtime 的 SBOM/CVE 或来源签名证明。
- `node scripts/dsh.mjs test`：**243 PASS / 0 FAIL / 0 SKIP**。OCR delegate 原始 **7/7** 文件全部覆盖（3 个代码/测试、4 个补审文档），0 skipped，没有新增确认缺陷。JS 语法、文档本地链接及 `git diff --check` 通过；正常 hooks 本地提交后，正式 preflight 需从新 clean SHA 用新 tag 重跑，旧失败不能覆盖。

原始证据位于 `.context/checks/candidate-356862bf-20261006/`：`preflight.log`、`audit-proxy.log`（修复前失败）、`audit-fixed.log`、`npm-audit-probe.json`、`proxy-regression.log`、`plugin-build.log`（旧链接失败）、`plugin-build-retry.log`、`knowledge-build.log` 和 `dependency-links-before.json`。旧插件候选仅绑定 `356862bf`，不冒充网络修复后的源码。

同目录的 `release-suite-proxy-fix.log`、`proxy-review-preview.json`、`proxy-review-rules.json`、`proxy-review-summary.json` 与 `proxy-document-validation.json` 保存本次修复验证和审核范围。

本轮没有上线、push、发布、迁移或读取真实 DuckDB；生产和物理分仓门禁保留。
