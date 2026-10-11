# 主仓公共合同消费者迁移提案（2026-10-11）

这是 **12 产品路径的隔离提案，尚未应用主仓**。主仓为 `5390667c` / `codex/shinemage-abc-local-candidate`，暂存区空，VERSION 仍 `0.20.0.0`。本轮只写当前说明和本证据对，没有主仓 commit、push、PR 更新、合并、发布、部署或删除。

## 输入与迁移范围

三仓来自此前已实际下载并用 run/jobs/artifact API 核对的 Ubuntu PR CI。当前只读接收并重新核对固定 ZIP、manifest 和 31 个成员；没有再次执行作者的私有行为检查。来源边界见[作者实际交付](shinemage-generated-contracts-owner-delivery-20261011.md)。

| owner | 固定来源 | 实际 PR CI | 编译材料 |
|---|---|---|---|
| workbench | `6c5adc9f` | [38126014921](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38126014921) | 28 |
| crm | `c4b1c91e` | [38126019403](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/38126019403) | 2 |
| brand | `0b8c8a79` | [38125655260](https://github.com/tyuanww/dsh-shine-brand/actions/runs/38125655260) | 1 |

材料包含生成类型、负向 TypeScript 断言、schema、常量、冻结 C0 夹具及公开声明／目录，不是可安装插件包。它们不能继承正式 pack、candidate/journal、宿主或业务准入。

提案只添加公共合同锁、固定 CI 接收／有界 ZIP reader、合同暂存检查器及守卫，并修改 pipeline、三份工作流与共享路径选择。原 15 个生成器逐字节保留。暂存目录仅写入主仓维护的 162 份 canonical 文件和 31 份材料，读固定 build-tools；不把作者树复制到主仓，也不构建 DSH 或业务插件。

完整文件与前后摘要见[12 路径应用清单](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/main-local-cutover-plan-r1.json)。可应用增量：[product-delta-r1.patch](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/product-delta-r1.patch)，SHA-256 `47f2aa8b1c9c51f08c381fda0106ab2c3b37b0f18800a6e13def283bbe14668e`；对当前主仓 `git apply --check` exit 0。该检查没有应用补丁。

## 实际验证

下列结果各自记账，不累加成本轮总体 PASS：

| 范围 | 当前结果 | 原始入口／结果 |
|---|---|---|
| 坏输入、ZIP／文件／环境输出、编译进程守卫 | 28 PASS / 0 FAIL / 0 SKIP，exit 0 | [隔离命令](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/guard-tests-isolated-final-r2-execution.json)、[TAP](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/guard-tests-isolated-final-r2.stdout) |
| 实际共享路径选择 pytest | 34 PASS，exit 0 | [原始输出](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/path-checks-r1.stdout) |
| 原 15 份合同生成器 | 15 次 exit 0 | [检查回执](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/verify-stage-final-r2/checks.json)、[真实命令](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/stage-positive-final-r2-execution.json) |
| 原槽位合同 | 4 PASS / 0 FAIL / 0 SKIP | 同一检查回执与各自日志 |
| 原主题拒绝与漂移合同 | 2 PASS / 0 FAIL / 0 SKIP | 同一检查回执；主题私有行为保留在作者 CI |
| 来源不可读负对照 | 31 个主仓旧资料＋3 个作者 manifest，均 EPERM | [34 路径结果](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/source-negative-final-r2.stdout) |
| 增量 OCR delegate | 可审 11/11、排除测试人工 1/1；无开放发现 | [选择](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/review-final-r1/preview.json)、[主 Agent 审查](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/review-final-r1/host-review.json) |
| 三份工作流 | YAML／步骤解析通过 | [静态记录](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/workflow-path-validation-r1.json)；新工作流 CI NOT_RUN |

隔离策略拒绝指定旧插件内容、三个原作者目录和网络外连，只读固定 build-tools；不是整机 deny-default。检查结束后全部 193 份暂存输入未变，原 C0 hash 保持 `317110700f6043bf0cab5f3a505775c11f437f34742d02be40e52f446a11b25d`。临时输出使用独占目录，不能重复执行到既有结果目录。编译 timeout／输出超限终止本次自有进程组，不操作无关实例。

## 保留的失败与审查修复

首次守卫 19 PASS / 2 FAIL：重复 ZIP 的测试夹具复用 ZipInfo 已修；另有子进程超时。最终隔离 r1 是 27 PASS / 1 FAIL，重复 ZIP 在同步 Python 管道上超时；单独 6 次复现均返回预期拒绝，底层原因未证实。现改用有界异步通信，15 秒截止及全部摘要检查不变，最终隔离 r2 28 项通过。不能把失败写成通过或声称根因已证明。

合同 r2 曾缺 C0 provenance 测试输入；只补显式 canonical 列表，没有改生成器或重写 C0 hash。r4 包装误用了不存在的 `python-r4`，失败 stderr 保留。r5 包装复用了 r4 JSON 文件名，因此该 JSON 的实际内容属于 r5，r4 原执行 JSON 没有留存；[命名勘误](/Users/hutou/.codex/tasks/shinemage-contract-main-cutover-proposal-20261011-b4muxq9k/historical-execution-name-note-r1.json)明确记账，原文件不再改写。新的 runner 使用互不复用的独占开始／结束记录。

本轮审查关闭了有界读后的并发增长、GITHUB_ENV 别名覆盖、FIFO 阻塞和编译超时残留后代四处问题。OCR 只提供文件筛选与规则，实际审查由当前主 Agent 完成；外部模型未执行。预启动脚本语法及 OCR 默认 Markdown 被当 JSON 的包装失败也保留，均不冒充产品测试。

## 尚未执行与剩余边界

主仓新入口尚未切换。新接收 helper 的远程下载路径、切换后的完整 B0、新主仓 CI、新正式包／candidate／journal、宿主／服务／真实模型和业务 UAT 均 NOT_RUN。此前领域入口 B0 r4 只覆盖此前应用字节，不抵扣本提案。

当前[主仓 PR #119](https://github.com/tyuanww/fuqing-crm-analytics/pull/119)仍 OPEN，head `5390667c`，merge state CLEAN，4 项 SUCCESS、6 项 SKIPPED，其中 B0 SKIPPED；没有失败不代表未提交迁移或本提案的完整 CI 通过。

原生成器的单独直接入口仍按旧资料工作；缺输入／主仓合同守卫和静态边界扫描也尚未退役。旧 `dsh-plugins/` 不删。CRM/Knowledge 的 Cordis `4.0.2` 声明与固定 `4.0.4` 的适用兼容仍 OPEN。SDK 分发 BLOCKED；产品 PARTIAL，release_ready=false。

下一动作仅在明确授权后应用上述 12 路径并补必要主仓验证和当前说明；Git 提交、推送、PR、合并、发布、部署及删除分别按实际授权执行。

机器摘要：[validation JSON](shinemage-public-contract-main-cutover-proposal-20261011-validation.json)。
