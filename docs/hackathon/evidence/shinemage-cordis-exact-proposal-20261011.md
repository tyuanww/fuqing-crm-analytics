# Cordis 精确版本校准提案（2026-10-11，隔离验证，未应用）

固定官方 DSH/dsh-tools `0.1.7-rc.2` 要求 Cordis `~4.0.4`，CRM/Knowledge 原正式包精确声明 `4.0.2`，普通严格解析已在[上一轮证据](shinemage-cordis-strict-peer-20261011.md)中实际拒绝。本轮在两个独立作者仓的精确提交 clone 中准备 `4.0.4` 修订及主仓配套守卫，并验证普通 npm 锁解析、安装与导入；没有应用到原作者仓或主仓运行代码。机器记录见[validation JSON](shinemage-cordis-exact-proposal-20261011-validation.json)。

## 修订范围

- CRM、Knowledge 各七个路径：精确 peer、输入预检、打包检查、原作者守卫测试及三份开发说明。包 ID、版本、exports、业务源码、kit、固定 SDK 配方和既有 CI workflow 不改。
- 主仓七个路径仅在隔离副本修订：profile/组合守卫与运行回执改为精确 `4.0.4`，原夹具同步，新负测覆盖旧 `4.0.2`、范围与其他补丁版本。原来源、摘要、公开导出、权限、service binding 和防覆盖门禁保留。
- 两包五份运行 JS 与旧正式包逐字节相同。新普通内容包除 peer 变化外，仍有内容打包与正式打包的历史差别：README 成员、manifest scripts；不能冒充正式 pack 或沿用旧 candidate 身份。

## 实际结果

Node 24.19.0、Python 3.14.4、pnpm 11.28.2、npm 11.17.0；作者构建使用既有固定上游 `477b4f42…` 和只读 build-tools，不重编 DSH、不安装新全局环境。

| 范围 | 本轮结果 |
|---|---|
| CRM 离线安装、预检、严格 host/client 构建、内容包 | 各 exit 0 |
| CRM 本包行为 | 103 PASS / 0 FAIL / 0 SKIP；作者守卫 15 PASS 另记 |
| Knowledge 离线安装、预检、严格类型检查/构建、内容包 | 各 exit 0 |
| Knowledge 五个测试文件 | graph 22、service-client 5、package 5、identity 12、author-boundary 9，各 0 FAIL / 0 SKIP，不加总成平台通过 |
| 主仓四入口合同回归 | 同次 41 PASS / 0 FAIL / 0 SKIP，固定 Python 显式绑定 |
| 官方 npm 严格锁解析 | exit 0；官方 DSH、dsh-tools、11 项 SDK peer 与两份修订内容包同根解析，Cordis 精确 4.0.4 |
| 普通 `npm ci` | exit 0；strict-peer-deps、strict-ssl 保持，ignore-scripts，不执行生命周期；安装前后 lock 摘要相同 |
| 普通 Node 导入 | CRM index/host、Knowledge index/graph-tools 四入口全部导入，peer 解析均位于该独占 npm node_modules；未调用 apply、未启动宿主或服务 |

锁文件 378338 字节，SHA-256 `e7b5d62b7ef76a19195b619024e5c9a13f9e63da3cd18bef0ca2f7ac50477e56`，613 条 package 记录包含根和两份本地包；610 条 registry 记录都有官方 npm HTTPS 地址和 SHA-512 声明。这是锁/安装输入记录，不等于全量来源变换或 SDK 分发审计。

TLS 使用既有系统 CA，未关闭验证、未用 force/legacy-peer-deps、未修改系统信任或个人 npm 配置。安装使用独占 cache 和空 user/global npm 配置，导入在禁网沙箱执行。作者验证只拒绝列明主仓业务/脚本源码、九个原作者仓和另一修订副本，允许固定 SDK/build-tools；不是整机 deny-default。

CRM 普通包 SHA-256 `c275ed7515338c9cfec676f9c818603203f0080c79eb78a3f523cddce5b3d521`，236798 字节、6 成员；Knowledge 普通包 `46cfc722ec8732b2edd473ab69bb73fa83a36665ffb57e57d9439d955e233d7f`，16144 字节、5 成员。两者只属于隔离提案，正式 pack/candidate 为 NOT_RUN。

## 审查与失败留存

沿用 `open-code-review-delegate`：OCR CLI 只做路径选择与规则解析，主 Agent 审查实际隔离增量。15/15 代码/JSON 文件、另六份 Markdown 人工审查，未发现本增量的 Critical/High；没有外部 LLM 审查或子 Agent。主仓 OCR 在原树上只选择七个对应路径，其他原有修改明确排除；实际审查对象为隔离提案差异，不把原树已审字节算成新的修订。

首次沙箱中文路径被 JSON 转义后未匹配，负对照退出 1，原 policy、命令及日志保留；r2 使用实际 Unicode 路径，每个作者验证的 13 份列明源码读取各被 EPERM 拒绝，固定输入与自己的 manifest 可读。首次主仓四入口退出 0，但 Python 未显式绑定，本轮以固定解释器的 r2 为准，不相加。首次主仓补丁路径归一化错误导致 apply-check 失败，旧补丁保留；只使用下面的主仓 r2 补丁。三个可用补丁对原仓 `git apply --check` 均 exit 0，尚未应用。

## 应用顺序与未关闭项

原交接明确要求保留精确 `4.0.2`，本轮仅交付可审查修订；需 owner 授权校准合同。授权后先应用两份作者补丁，按功能提交并验证新 CI，再由干净固定新提交生成正式包及新摘要。主仓配套守卫必须等对应新正式包和输入锁齐备后再应用；当前锁仍绑定旧包，提前单独改主仓守卫会正确拒绝这些旧包。

普通 npm 安装/导入通过只关闭本提案的这一层，不代表完整 DSH host、模型、CRM/WeKnora、目标 terminal/browser、WSL、恢复或正式 candidate 准入。未重跑原完整 B0、旧 headed/WSL 或 SDK 全量查询，没有新 Git 提交、push、PR、merge、发布、部署、远端配置或删除。

可用补丁及 SHA-256：

- `patches/crm-cordis-exact-r1.patch`：`7f69c15cc0bda4005d52178d6fcd69b78e5a4d4cae63701821f879bac7c2fc36`
- `patches/knowledge-cordis-exact-r1.patch`：`9b2ac976b3f931d02a79f69cad9aac5c98c35171c0fa8cd393d4d9f96fbdd5b6`
- `patches/main-cordis-exact-r2.patch`：`f39d754e4248927e6944ec01eeefae854e0290c305a882455980babf36684d7f`

任务目录：`/Users/hutou/.codex/tasks/shinemage-cordis-contract-proposal-20261011-xm0wt693`。原主仓 HEAD `5390667c`、Workbench 八文件及其他八个作者仓不变；原 46 个受保护输入逐字节核对一致。主仓只新增本证据对并同步五份当前说明，原产品未改。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false，VERSION 0.20.0.0。
