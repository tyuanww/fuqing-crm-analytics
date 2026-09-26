# rc2 release-level UAT evidence template

每次候选只填写一个 ledger；七组必须全部出现。`PASS` 必须有开始/结束时间和脱敏证据引用；没有现场环境时保持 `NOT_RUN`，完整真实业务另记 `PARTIAL`。

| 组别 | 最小场景 | 前置条件/通过标准 | owner | 状态 | started_at | ended_at | evidence_ref | 备注 |
|---|---|---|---|---|---|---|---|---|
| auth | 一次性 token、过期、重放、Origin、Cookie、401 | 正向/负向身份与 CSRF/CORS 结果可回读 | NOT_ASSIGNED | NOT_RUN | | | | 真实 HTTPS/host 未运行 |
| native | 原生对话、输入/加载/结果/错误、刷新 | 原生 loop 可用，插件失败不覆盖标题/会话/工具合同 | NOT_ASSIGNED | NOT_RUN | | | | 浏览器 UAT 未运行 |
| plugin | 插件加载/失败回退、权限和工具合同 | 能力矩阵与 `NOT_AVAILABLE` 原因可见 | NOT_ASSIGNED | NOT_RUN | | | | 真实宿主未运行 |
| page | page HTTP origin/CORS、预览/编辑/保存状态 | origin/CORS/disabled 状态与回执符合合同 | NOT_ASSIGNED | NOT_RUN | | | | page HTTP/浏览器未运行 |
| crm | synthetic CRM/health contract | 隔离 synthetic fixture health 与权限通过 | NOT_ASSIGNED | NOT_RUN | | | | 真实业务不在范围 |
| weknora | synthetic retrieval/permission smoke | synthetic retrieval 与拒绝路径可复现 | NOT_ASSIGNED | NOT_RUN | | | | 真实数据卷不读取 |
| recovery | cancel/conflict/unknown receipt、回退 | receipt 可恢复、回退条件和旧 target 有记录 | NOT_ASSIGNED | NOT_RUN | | | | 杭州回退演练未运行 |

未接通保存/导出/发送保持 `disabled/NOT_AVAILABLE`。真实模型和真实业务结论单列 `PARTIAL`。
