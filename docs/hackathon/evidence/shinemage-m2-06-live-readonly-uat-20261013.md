# M2-06 live 只读模型与工具面验收（2026-10-13）

本轮使用用户已登录的 live `app.tyuan.chat`，账号标识仅作为页面状态观察，没有读取或输出凭据。该结果属于 live 业务 UAT 证据，不抵扣隔离 candidate 的 Aside session 绑定，也不改变 live current。

## 实际流程

1. 在 live 页面创建新会话，模型显示 `DeepSeek-V41-Flash · High`。
2. 发送一条明确的只读验收指令，要求先检查 CRM/WeKnora 工具，再尝试 CRM GSV 查询和 WeKnora 只读检索；明确禁止保存、分享、删除、修改设置和提交业务数据。
3. 等待模型完成后读取页面回执，并保留“未编造结果”的限制说明。

## 页面回执

| 能力 | 实际回执 |
|---|---|
| `crm_service_health` | `NOT_EXPOSED → NOT_RUN`，当前会话不存在该工具 |
| `query_crm_dashboard_gsv` | `NOT_EXPOSED → NOT_RUN`，未产生 CRM 数据、来源或水位回执 |
| WeKnora 检索 | `NOT_EXPOSED → NOT_RUN`，没有来源名称或来源标识 |
| 模型行为 | 明确拒绝用 README、仓库文件或模型文本替代业务工具结果 |
| 写操作 | 未保存、分享、删除、改设置或提交业务数据 |

页面同时显示，当前会话只有通用工具以及 `free_html_page_generate`；该工具只交付页面源码包，不能替代 CRM 健康检查、GSV 查询或 WeKnora 检索。

## 结论与边界

本轮真实模型行为通过了“工具缺失时不编造”的安全边界，但真实 CRM/WeKnora 数据验收没有通过，因为 provider/tool surface 没有加载到该会话。M2-06 当前为 `PARTIAL_REAL_UAT / CRM_TOOL_NOT_EXPOSED`。保存、权限失败、恢复、人工业务复核仍未执行；隔离 candidate 仍为 `CANDIDATE_BOOT_PASS / ASIDE_SESSION_NOT_BOUND`。

