# 依赖 PR 联合验收（2026-09-20）

本轮处理新公开仓库的 #1–#10 自动升级提案。它们的独立绿灯不能代替组合验证；联合候选保留正常提交、推送和 CI 门禁，不切换现役服务。

## 候选版本

| 提案 | 依赖 | 原版本 → 候选 |
|---|---|---|
| #1 | pytest | 9.0.3 → 9.1.1 |
| #2 | DuckDB | 1.5.3 → 1.5.5 |
| #4 | PyArrow | 24.0.0 → 25.0.1 |
| #5 | Autoprefixer | 10.5.6 → 10.6.1 |
| #6 | annotated-types | 0.7.0 → 0.8.0 |
| #7 | VueUse | 14.3.0 → 15.0.0 |
| #8 | pandas | 3.0.2 → 3.0.5 |
| #9 | Vue plugin | 6.0.8 → 6.0.9 |
| #10 | Vite | 8.1.5 → 8.3.0 |

另外将前端 `js-yaml` override 从 4.3.1 更新至 4.3.2，修复 [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)。保留其他既有锁；不修改 DSH 固定工具链。

## TypeScript 7：兼容性阻断，未升级

#3 的前端 CI 在 `vue-tsc -b` 报 `ERR_PACKAGE_PATH_NOT_EXPORTED`：`typescript/lib/tsc` 不再导出。已核对当前发布的 vue-tsc 3.3.11，其默认入口仍解析该路径。相关[上游实现](https://github.com/vuejs/language-tools/blob/master/packages/tsc/index.ts)及[迁移讨论](https://github.com/vuejs/language-tools/issues/6167)仅作背景，项目失败日志是本次直接证据。

继续锁 TypeScript 6.0.3，保留 Vue SFC 类型检查。Dependabot 暂停 TypeScript 7 提案，其他依赖照常检查。恢复条件：有支持原生编译器的 Vue 类型检查发布版，在隔离候选验证全部 SFC、OpenAPI 类型生成、构建与单测后移除忽略规则。不能删除 `vue-tsc`、忽略类型错误或用 TypeScript 6 的结果冒充 TypeScript 7 通过。

## DuckDB 失败与归档边界

#2 首次 CI 的 `test_native_missing_role_rejected_without_facts` 返回 `EXECUTION_UNKNOWN`，不是预期的业务 REJECTED 结果。该首购计算使用 Python JSON 路径；尚无证据证明 DuckDB 1.5.5 是根因。失败记录保留，不将后续绿灯解释为根因已修复。

联合回归另发现两处测试将 worker 引擎写死为 1.5.3；现改为比较实际父进程驱动版本及源码修订，验证子进程没有加载不同引擎。保留全部手算结果、只读、资源配置和落盘断言；B0 独立环境仍使用自身 1.5.3 锁。

联合候选使用独立 Python 3.14 环境与精确新锁、小型合成夹具。现役归档服务仍使用原依赖环境。本次没有复制、读写或迁移真实归档库；现役 DuckDB 升级仍须按[备份恢复检查清单](duckdb-backup-upgrade-checklist.md)执行独立维护验收。

## 交付层级

CRM 指标 #11 已合入新 main（96ba94a），真实 AOV/AUS 及现役切换仍未验收。依赖候选的最终 CI、QA 与合并 SHA 以关联 PR 的交付记录为准；本文不预先声明这些门禁已通过。历史 PR 仅在替代候选完成验收后关闭并关联交付位置。

## 后续队列 #13–#18

#12 合并后出现的下一批提案分别核验，不套用上一批测试结果。组合候选升级 jsdom 30.1.0、anyio 4.15.1、urllib3 2.8.0、click 8.5.0，以及 Vitest / UI 5.0.1。

#17 的 `npm ci` 失败是旧 `@vitest/ui` 精确要求 Vitest 4；同步升级两者并把未来 Vitest 提案分组，保留正常 peer 校验，不使用 `--legacy-peer-deps`。jsdom 30 要求 Node 24.15+；本轮 Node 24.19 满足，CI 使用 Node 24。

#15 不能单独升级：当前发布的 Pydantic 2.13.5 精确依赖 pydantic-core 2.46.5，与 2.49.0 冲突。继续保留匹配版本，只忽略本次不兼容的 core 2.49.0 提案；待兼容父包发布后联合核验并移除该版本忽略。不绕过解析器，不把该项写成升级成功。

#12 的 main 后端取消测试出现一次启动事件超时，原日志未记录请求响应。后续 #19 补充真实 SQLite 占锁场景，使用原请求标识等待明确可重试状态，保留取消与物理退出断言；不宣称该次 CI 的精确触发原因已证实。最终状态以各 PR 与其 main CI 为准。

## Worker 状态读取修复

#19 的 PR CI 通过后，main CI 在另一条原生查询测试返回 `EXECUTION_UNKNOWN`，诊断阶段为 `state_read`。真实 SQLite 排他读锁夹具复现了同类故障路径；旧实现会因一次短暂不可读停止物理子进程。历史 CI 未保留完整 SQLite 错误码，因此不能断言每次历史失败都来自同一锁原因。

候选只对 SQLite BUSY/LOCKED 读取最多重试两次，每次保留原连接 100ms 超时并间隔 10ms。持续不可读、非锁数据库错误和缺失状态仍按原安全规则失败；不重新接纳请求、不重复启动 worker，不放宽权限、资源、取消或结果落盘条件。新增真实子进程与真实锁正反测试验证短锁恢复、长锁停止、单执行与租约释放；非锁错误不重试。修复前反证和合成回归保留在本地交付证据，完整 CI 以本候选 PR 为准。
