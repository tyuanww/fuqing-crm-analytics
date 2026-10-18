# subagent duplicate registration upstream gap

本回执记录 `tool "subagent" is already registered in this scope` 的 upstream 缺口。

## 当前结果

- disposable runtime 已通过禁用重复条目恢复 synthetic headed UI readback。
- standard、cordis、ptc 三个 preset 都需要处理重复 `tool-subagent` 和 `tool-subagent-fork`。
- 该 workaround 只作用于 disposable runtime。
- DSH upstream checkout 没有修改。

## 正式修复要求

DSH upstream 需要在 restored session activation 时对 delegation tool registrations 做稳定去重或命名空间隔离。每个 tool id 只能注册一次。upstream 还需要一个 restore regression test，覆盖 standard、cordis 和 ptc preset 的组合。

在 upstream 修复合并并重新构建前，项目只能保留 candidate-only workaround。该问题不应被写成正式 upstream PASS。

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```
