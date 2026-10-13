# M2 任务卡当前审计（2026-10-13）

这份矩阵把当前隔离 candidate、journal、目标回执、live browser 观察和真实业务前置核验放在同一张账上。它是状态审计，不是发布授权，也没有改变主仓 profile、现役 DSH 或生产数据。

| 卡片 | 当前状态 | 下一条件 |
|---|---|---|
| M2-01 | `FORMAL_CANDIDATE_REGISTERED / RELEASE_GATES_OPEN` | 候选 browser 已有 seq 5；继续收口剩余发布门禁 |
| M2-02 | `FORMAL_BINDING_REGISTERED / CRM_UNBOUND_BY_CONTRACT` | 保持 CRM profile 按组合合同无绑定，继续收口 UAT 与发布门禁 |
| M2-03 | `TARGET_PREFLIGHT_PASS / USER_AUTHORIZED_TEST_PROD` | candidate 已登记到主仓 journal；激活和发布另按门禁授权 |
| M2-04 | `TERMINAL_PASS / BROWSER_PASS` | standalone/accessibility 与剩余 release gates |
| M2-05 | `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS / STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL` | 真实读屏、人工完整键盘焦点、Windows 高对比度 |
| M2-06 | `CANDIDATE_REAL_MODEL_PASS / CRM_READONLY_PASS / WEKNORA_READONLY_PASS / LIVE_TOOL_SURFACE_EMPTY` | 保存、权限失败、恢复和人工业务复核；live 标准会话工具面仍 `NOT_EXPOSED / NOT_RUN` |
| M2-07 | `BLOCKED` | 上游替换、来源归档、发布者身份、SBOM、签名、撤销和干净机器 |
| M2-08 | `NOT_RUN` | M2-04 至 M2-07 关闭并取得发布授权 |
| M2-09 | `CANDIDATE_RUNTIME_PASS / STATIC_MATRIX_PASS / ISOLATED_PLUGIN_ADAPTATION_PASS / MAIN_PIN_UNCHANGED / CROSS_VERSION_NOT_RUN` | 组合生命周期/browser/recovery、cross-version，之后再决定主仓 peer/toolchain 适配与切换 |
| M2-10 | `PASS / RELEASE_GATES_REMAIN_OPEN` | 各卡继续独立收口，外部门禁变化后刷新矩阵 |

当前正式 candidate journal 已到 seq 5：candidate intent、candidate prepared、source HTTP target observation、terminal host observation 和 browser host observation。另有 headed Tab 焦点部分观察，但没有为它追加 journal 事件。主仓正式 profile/journal 已登记，`release_ready=false`、activation `NOT_RUN`。本次文档复核没有新增代码改动；此前页面包、探针和 DSH 兼容矩阵代码已分别完成审查并本地提交。本轮没有 push、没有生产切换；受保护的 `security-audit-skill/` 保持未跟踪。

用户已确认杭州入口同时承担当前测试与生产验收，云服务器迁移后置；该决定解除 M2-03 的目标环境阻塞，但不改变真实业务、供应链和正式发布门禁。详见[当前测试与生产目标授权记录](shinemage-production-target-authorization-20261013.md)。

真实 UAT 已有分层实跑：live 标准会话的 WeKnora 来源观察与 CRM 只读看板重试加载 PASS，但工具面仍缺少 `query_crm_dashboard_gsv`；隔离 candidate 在用户手工保存 provider 凭据并绑定 CRM 当前对话后，真实模型、WeKnora 只读检索和 CRM GSV 7/7 日结构化查询 PASS。保存、权限失败、恢复和人工业务复核保持 `NOT_RUN`。详见[真实模型、WeKnora 与 CRM UAT 实跑](shinemage-real-business-uat-20261013.md)和[候选真实 UAT 证据](shinemage-m2-06-candidate-real-uat-20261013.md)。
