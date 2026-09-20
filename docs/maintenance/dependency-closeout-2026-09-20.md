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
