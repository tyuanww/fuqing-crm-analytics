# 首购保存服务兼容窗口

本页记录 T3/T7 的本机合成状态结论。DSH/profile、插件、analysis-service 和 durable state 分属不同 owner；切换插件不删除或降级服务状态。下表是固定源码对的实测窗口，不能按相同 API 版本或 SQLite schema 推广到任意服务版本。

## 当前可复核窗口

- 旧服务：commit `56198c32a52d9822c7a3338d92b0fa077d1c61bc`，不提供 D15 保存/来源 API。
- 新服务：commit `a50bd42492195040efaa6989c90e4fe84030551c`，版本化保存门禁与回执。
- 状态 owner：analysis-service；`first_purchase_analyses.sqlite3`，application_id `1397572502`，SQLite schema 1。
- 数据仅为本次新建的 synthetic JSON/SQLite。两个服务源码分别从固定 Git tree 导出；运行环境为同一 Python 3.14.4 / FastAPI 0.141.1 / Pydantic 2.13.5。未验证独立安装依赖、WSL、最终服务包或生产认证。

| 服务 / 状态 / 动作 | 结论 | 操作边界 |
|---|---|---|
| 新服务读取旧 v1 保存状态 | PASS | 记录/facts 不变；旧记录来源返回 PROVENANCE_NOT_RECORDED，不补造。 |
| 新服务配置 D15 策略后调用旧保存 API | 拒绝已验证 | VERSIONED_SAVE_REQUIRED，不能绕过候选/时间门禁。 |
| 旧服务读取 D15 状态 | 限只读身份 PASS | 可读保存快照；拒绝标题写入；数据库字节未变。旧 D15 API 为 404/NOT_AVAILABLE。 |
| 再恢复新服务，无 RunStore/无策略 | PASS | 原回执与命令精确重放，原分析/来源不变，不重新执行查询。 |
| 新服务标题 forward-fix | PASS | 新增版本 2，保留 facts/来源；原回执仍指向版本 1。 |
| 小型 SQLite 备份后在新目录、新进程恢复 | PASS | 原回执/来源和 title 幂等重放保持一致。仅冷恢复，不声称并发备份或生产 RPO/RTO。 |
| 旧服务以可写身份修改 D15 记录 | **BLOCKED** | 已在隔离副本确认：旧代码生成版本 3 时未复制 provenance，新服务读取最新版来源返回 PROVENANCE_NOT_RECORDED。 |
| 两版服务打开未知 schema 99 | 拒绝已验证 | 初始化失败，数据库摘要未变；不现场迁移。 |

## 回退规则

1. 回退插件/profile 时，保留与 D15 状态兼容的新 analysis-service；停用新保存入口也不删除已保存记录、回执或 provenance。
2. 若必须临时恢复旧服务，只允许配置无 `analysis:save` 的身份供读取。旧服务不能承担 D15 reconcile，界面应显示 NOT_AVAILABLE 并保留原请求身份，等待兼容服务恢复。
3. **不能仅因 schema 仍为 1 就把服务降级为可写。** 候选/激活控制面尚需消费此兼容约束，并拒绝旧服务写入组合；目前本页与验证回执是证据，不是已经接通的生产防护。
4. 如果绕过限制已经用旧服务写入，先保留状态并恢复兼容服务核对原版本；不可把最新版本伪装为有来源的结果，不自动复制历史 provenance 或重跑查询来补齐。

完整 G0 放行仍需要精确服务包及依赖窗口、候选/激活门禁接线、生产形状时限/UNKNOWN、DSH UI/浏览器与目标平台证据。本机验证回执固定 `release_ready=false`；`status=PASS` 只表示预期观测完成，包括旧写入不兼容的负面观测。

执行入口和失败记录见[跨版本验证证据](../hackathon/evidence/dsh-g0-service-save-compat-20261004.md)。
