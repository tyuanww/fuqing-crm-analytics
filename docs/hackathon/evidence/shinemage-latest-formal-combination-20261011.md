# 最新来源正式包的合成组合验证（2026-10-11）

Workbench `6c5adc9f`、CRM `c4b1c91e` 的最新正式包已在指定源码拒读、仅 localhost 联网的条件下实际运行原两条公共组合入口：**9 PASS / 0 FAIL / 0 SKIP，exit 0**。主仓两份输入锁仍未应用，新 candidate／journal 和正式宿主准入没有生成。

## 本次实际输入与运行

| 插件 | 干净来源 SHA | 正式回执 SHA-256 | tarball SHA-256 |
|---|---|---|---|
| Workbench | 6c5adc9faa04f692d5d4b3028af4f945ab49dfe4 | 0af61dabbab9a2205fb1d9ff3a2eec7e8194800d9af3f9043b0a5587a81edc12 | e41df9f5a8f7031c092319222543c8d723ca644c0c9d69b2ae53f13257e9b79e |
| CRM | c4b1c91eaa4fa645deb7951614c1937eb76db143 | 4663cce02776fa68913a41829d8ca0712fa44bf1c7642844326d80de40af2158 | 0da9f8edd40b17a92377aa4b35d219229c8461b942060a7dd0e12265343500fd |

正式包来源和逐成员核对见[此前正式包记录](shinemage-current-author-formal-packs-20261011.md)。其他七包、两份原 profile、公开合同断言和私有 core 计划保持。此次执行读取的是独立提案准备目录，没有先修改主仓锁；两份实际 runtime-inputs 均绑定当前 CRM，page 还绑定当前 Workbench。

固定 Node 24.19.0 与既有 Python 3.14.4 验证环境，官方 resolver 来自上游 477b4f42。入口是 `scripts/crm-calibration/knowledge-composition.integration.mjs` 和 `page-composition.integration.mjs`，启动／结束为 2026-10-11T10:02:23.252254+00:00 至 2026-10-11T10:02:25.808909+00:00。运行没有重新安装 pnpm 或 SDK；runtime-inputs 的 pnpm 11.7.0 字段属于上游固定锁校验。

九项覆盖 CRM／知识的加载顺序与 scope 卸载、合成 login grant／可选 lease、断开或卸载后隔离迟到引用，以及页面工具与 CRM／原生工具的独立卸载。查询和知识 HTTP 都是合成夹具，不是真实 WeKnora 或真实 CRM。见[实际命令](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/combination-r1-execution.json)、[原始 TAP](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/combination-r1.stdout)、[知识运行输入](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/runs/knowledge/runtime-inputs.json)、[页面运行输入](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/runs/page/runtime-inputs.json)。数字不与作者 CI 或完整 B0 相加。

## 隔离、清理与审查

九个主仓插件 manifest 和九个原作者 manifest 的 18 项负对照均为 EPERM；策略拒绝列明插件／领域及作者目录内容，并保留主仓控制层和固定 SDK 读取，不是整机不可读。[策略](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/source-localhost-only-r1.sb)、[负对照](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/source-negative-r1.json)。实际运行前后 198 个受保护文件、porcelain 和空暂存区一致。

本次自有进程组 38361 已退出，无剩余组成员，没有停止无关进程。采样未捕获临时监听端口，不能据此宣称完整端口归属／关闭验收；[清理记录](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/owned-process-cleanup-r1.json)保留这一限制。首份包装脚本在解析阶段 SyntaxError，没有启动测试；原脚本和失败说明保留，修正包装后才生成本次实际执行记录。

两锁提案由 OCR delegate 选择 2／2 JSON，并由主 Agent 完成全内容及语义差异审查，无开放发现；外部模型 NOT_RUN。只改变 Workbench／CRM 来源回执及同来源 Workbench CI 归属，其他七包、profile、保留断言、not_covered 和 release_ready 不变。见[审查报告](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/review-two-lock-r1/host-review.json)、[两路径应用清单](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/main-local-binding-plan-r3.json)、[当前 apply --check](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/main-apply-check-r1.json)。尚未应用。

## 远端只读核对与剩余边界

本次只核对主仓 PR #119、Workbench PR #1、CRM PR #1：都 OPEN／CLEAN，head 分别为 5390667c、6c5adc9f、c4b1c91e。主仓现有提交 4 SUCCESS／6 SKIPPED，其中 B0 是 SKIPPED；Workbench 四项、CRM 两项 SUCCESS。没有新远程运行或修改，这些检查不覆盖主仓当前 dirty 增量，也不代表九仓全部重新核对。见[带时间的原始只读汇总](/Users/hutou/.codex/tasks/shinemage-latest-formal-combination-20261011-lxx9zyru/pr-readonly-summary-r1.json)。

主仓锁仍绑定 Workbench e9223289／CRM 5a839fa8。下一步仅两锁的本地应用、必要验证和当前说明同步需单独授权；此前授权已完成的 12 路径合同入口另见[本轮应用记录](shinemage-public-contract-main-cutover-20261011.md)。严格 peer 安装、完整宿主、官方 plugin add、新 candidate／journal、同包服务／目标／回退及真实模型／业务／WeKnora 仍未在本轮执行。Cordis 声明 4.0.2、实际解析 4.0.4 的冲突仍 OPEN。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false；没有 commit、push、PR 更新、合并、发布、部署或删除。

机器摘要：[validation JSON](shinemage-latest-formal-combination-20261011-validation.json)。
