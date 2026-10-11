# 主仓公共合同入口本地应用（2026-10-11）

用户已将上一条暂缓答复更正为授权。本轮已在主仓 5390667c / codex/shinemage-abc-local-candidate 应用已审的 12 路径增量，并完成必要修复与验证；没有 commit、push、PR 更新、合并、发布、部署或删除。VERSION 仍为 0.20.0.0。

## 应用与职责

主仓默认 pipeline 现在接收三仓固定真实 CI 的 31 份公共编译材料，在独占暂存目录运行原 15 个合同生成器、槽位和主题拒绝／漂移断言。三份 CI 工作流接入相同准备器；共享路径选择保留真实失败检查。原生成器逐字节未变，C0 contract_hash 仍为 317110700f6043bf0cab5f3a505775c11f437f34742d02be40e52f446a11b25d。私有插件行为仍由作者 CI 维护。

此次公共材料来自 Workbench 6c5adc9f、CRM c4b1c91e、Brand 0b8c8a79。运行包组合锁仍绑定 Workbench e9223289、CRM 5a839fa8；本次 B0 不代表最新作者包的 candidate、宿主或业务验收。旧副本、直接调用的原生成器、显式 legacy 入口及保留合同／缺输入守卫未删除。

准确前后摘要见[已应用 12 路径](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/applied-product-final-r2.json)。[此前隔离提案](shinemage-public-contract-main-cutover-proposal-20261011.md)原样保留，不把其 NOT_APPLIED 时点改写为本轮事实。

## 本轮实际验证

| 范围 | 结果 | 原始记录 |
|---|---|---|
| 新入口完整本地 B0 r2 | exit 0；Python 855 PASS / 41 subtests PASS；23 warnings 保留 | [执行](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/full-b0-r2-execution.json)、[stdout](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/full-b0-r2.stdout)、[stderr](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/full-b0-r2.stderr) |
| 同次 Node | 27 组各自 0 FAIL；9 次跳过保留原因，不合并 PASS 数 | [解析账本](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/full-b0-parsed-summary-r2.json) |
| 原合同暂存入口 | 原 15 生成器 exit 0；槽位 4 PASS、主题负测／漂移 2 PASS；193 个输入未变 | [实际回执](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/contracts-stage-r1/checks.json) |
| 主仓坏输入与进程守卫 | 28 PASS / 0 FAIL / 0 SKIP | [TAP](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/guard-tests-r2.stdout)、[执行](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/guard-tests-r2-execution.json) |
| 实际共享路径 pytest | 34 PASS | [输出](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/path-tests-r2.stdout) |
| 来源负对照 | 31 个主仓旧资料、3 个作者 manifest 均 EPERM | [34 路径](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/source-negative-r1.stdout) |
| 工作流 | 三份 YAML 解析通过；新工作流 CI NOT_RUN | 本任务目录 workflow-*.yml-execution.json |
| OCR delegate | 可审 11/11、排除测试人工 1/1；无开放发现；外部模型 NOT_RUN | [主 Agent 报告](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/review-integration-r1/host-review.json) |

完整 B0 在独立验证目录执行，2934 个允许源文件与当前主仓实际字节一致；固定上游和 build-tools 只读，网络限合成 localhost。没有复制真实业务数据库。该策略拒绝指定来源，不是整机 deny-default。新远程下载准备路径尚未实跑，新主仓 hosted CI NOT_RUN。

## 保留失败与本地修复

首轮路径检查 33 PASS / 1 FAIL：py_compile 显式向主仓缓存写入，被只读策略拒绝。仅将验证包装的缓存定向到独占目录后 34 项通过，不修改产品断言。

完整 B0 首轮在输出超限负测失败。8 次实际嵌套复现均为第一次自有组 SIGKILL 成功、重复发送返回 EPERM，再在 exit 得到 ESRCH；重复错误覆盖了原输出超限原因。已在原授权中的两个路径补幂等终止，第一次真正的信号失败仍报错；增强原负测验证真实派生进程被回收。修复后 8 次实际复现均保留 PUBLIC_CONTRACT_OUTPUT_LIMIT，完整 B0 使用新的目录重跑通过。[原诊断](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/process-group-diagnosis-r1.json)、[修复后](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/process-group-diagnosis-r2.json)、[补充增量](/Users/hutou/.codex/tasks/shinemage-contract-main-apply-20261011-hr6_6va9/integration-fix-r1.patch)均留存。

另有一次临时直接命令漏了固定输入环境，4 PASS / 4 FAIL；完整输出在会话工具记录，任务目录保留失败说明，未为该包装错误放宽产品。此前提案阶段的失败和 JSON 文件名勘误也保持原样。

## 尚未完成

本轮主仓修改仍未提交；PR #119 的既有远端 CI 不能抵扣当前 dirty 字节。最新来源正式包及两锁提案见[独立包记录](shinemage-current-author-formal-packs-20261011.md)，尚未绑定主仓。新 candidate/journal、同包目标／服务／宿主／回退、真实模型与业务 UAT、正式分发均未在本轮执行。Cordis 声明 4.0.2 与固定环境 4.0.4 的严格安装仍 OPEN。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false。

机器摘要：[validation JSON](shinemage-public-contract-main-cutover-20261011-validation.json)。
