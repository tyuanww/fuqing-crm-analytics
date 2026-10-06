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

## 重复准备的第二处故障

代理修复通过正常 hooks 提交为 `8a70667fdb2b9fb84717c8c902b1204c0992eda6`。从该 clean SHA 运行 `dsh-preflight-crm-8a70667f`，prepare 的 `build:official` 报 `tsx: command not found`；失败保留于 `.context/release-preflight-runs/dsh-preflight-crm-8a70667f-6N4xOb/`。

检查固定 pnpm 11.7.0 的实际安装器及 `.modules.yaml` 后确认：fetch 将目录设为 `virtualStoreOnly=true` 并清掉入口链接，后续 install 的 `optimisticRepeatInstall` 根据缓存提前返回。对根 node_modules 下 `.bin`、`tsx`、`typescript` 执行 `ls -ld`，三者均返回 `No such file or directory`；这是该轮临时安装树的实际观测，上游源码和锁文件校验仍通过。

修复统一 fetch/install 参数，install 显式 `--config.optimistic-repeat-install=false`，保留 frozen lock、完整性与供应链检查；fetch 同时增加 `--ignore-scripts`，原生构建继续使用已有显式 rebuild 清单。没有修改 DSH/pnpm 源码或全局配置。

- `node --test scripts/dsh-b0/package-manager-env.test.mjs`：修复后 **3 PASS / 0 SKIP**。新增隔离包实际连续两轮 frozen fetch/install，命令入口可运行、lock 字节不变、即使允许的安装脚本也没有执行。初轮测试夹具的 file 包审批匹配不完整导致失败，改为精确本地 file spec 后通过，失败日志保留。
- 实际 `pipeline --prepare --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python`：**PASS**，含固定 DSH 官方 host/client 构建与来源/锁校验，不是仅测试复制实现。
- 完整 release suite **243 PASS / 0 FAIL / 0 SKIP**。该增量 OCR delegate **7/7** 覆盖（3 个代码/测试、4 个文档），0 skipped，无新增确认缺陷；语法、引用和 diff 检查通过。原始日志在 `.context/checks/candidate-8a70667f-20261006/` 的 `preflight.log`、`repeat-install-test.log`、`repeat-install-test-retry.log`、`prepare-fixed.log`、`release-suite-repeat-fix.log` 及 `repeat-review-*.json`。

这一步只修复本地候选准备的可重复性；完整 preflight、真实模型/浏览器和目标平台运行状态分别记账。
