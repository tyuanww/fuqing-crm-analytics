# M2-06 candidate 当前 CRM 工具面复核（2026-10-14）

本轮在恢复 candidate 隧道并由用户手动完成 CRM 登录后，复核当前对话是否暴露 CRM 工具。只观察候选页面和模型运行过程，没有批准 workspace/session 文件读取，没有执行 CRM 查询、保存、分享、删除或配置变更。

## 观察结果

- candidate 页面显示 `CRM分析（已连接）`，说明当前对话的 CRM 连接状态已建立。
- 模型选择为 `DeepSeek-V41-Flash · High`。
- 发起明确的只读 CRM UAT 请求后，模型没有直接调用 `crm_service_health` 或 `query_crm_dashboard_gsv`。
- 模型转而尝试读取 workspace 和 session 文件，并请求额外的 danger-full-access 权限；相关请求均被拒绝。
- 为防止超出 CRM 只读范围，本轮停止模型生成。
- 本轮没有产生 CRM 业务结果，没有执行真实查询，也没有写入业务数据。

## 结论

当前登录通路已恢复，但本次候选对话的 CRM provider tool surface 仍未暴露：

```text
CRM_LOGIN_BOUND / CRM_TOOL_SURFACE_EMPTY / READONLY_QUERY_NOT_RUN
```

这与既有 `LIVE_TOOL_SURFACE_EMPTY` 证据一致。问题不再是 CRM 登录或 SSH 通路，而是当前 session/preset 没有向模型注册 CRM 工具。不要通过授予 workspace/session 读取权限来绕过该缺口；应由 candidate runtime 的 preset/tool registration 修复后，再重新执行只读 UAT。
