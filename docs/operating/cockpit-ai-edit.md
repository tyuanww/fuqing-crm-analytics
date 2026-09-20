# 用原生 AI 修改产物

本功能是本地候选，验收边界见 [本轮报告](../hackathon/COCKPIT-AI-EDIT-2026-09-20.md)。沿用[本地文档服务](cockpit-office-local.md)与原生模型设置，不另接provider或复制凭据。

1. 在驾驶舱选择产物，先保存或放弃手动编辑，点击“用 AI 改”。历史会话文件先保存独立副本。
2. 原生对话会打开本次产物修改任务。描述需要修改的内容；模型完成后回驾驶舱。
3. 点击“收取修改”，比较原版本和修改后预览。Office/表格/PDF预览是只读；CSV首次打开需要确认编码/分隔符。
4. 点击“确认保存新版本”。保存回执未知时保留页面，用同一按钮重试核对；不要重建任务代替核对。

候选会保留，刷新后可以继续。原文件有新版本时，旧候选不会覆盖它，应放弃旧任务、基于新版本重做。若需继续修改已经收取的候选，先放弃该候选，再基于正式版本创建新任务；已经收取的内容不会被模型后续写入替换。

页面候选超过底层预览的30分钟有效期后，确认时会基于同一份固化候选续建预览并再次检查版本；不会重新读取模型的工作文件。页面数据权限撤销后，任务列表和重复打开请求也按当前权限过滤或拒绝。

“放弃本次修改”只关闭候选；若原生对话还在运行，需要在对话里停止。带业务绑定的HTML只允许AI修改CSS；扫描PDF没有OCR。真实模型在本轮测试profile中因缺少API Key未验收。

## 本地接入合同

所有普通请求使用现有产物服务Bearer身份及dashboard读/写权限；页面任务再核验页面数据权限。固定前缀 `/api/v1/analytics/cockpit-ai`，请求模型纳入本地FastAPI OpenAPI；客户端类型在 `cockpit-ai-client.d.mts`。

| 方法/路径 | 内容 |
|---|---|
| GET `/?offset=0` | 当前用户仍有权访问的未完成任务；每页100条，按`next_offset`继续，null表示结束 |
| POST `/` | `{id: ai_UUIDv4, target_kind: file或page, target_id, base_version}`；稳定id重试返回同一任务 |
| GET `/{id}` | 任务状态、基线、原生会话身份及专用目录；不是正式保存回执 |
| POST `/{id}/collect` | 固化固定候选路径；不接收任意路径或URL |
| GET `/{id}/comparison` | 有界文本差异与原件/候选大小、hash |
| GET `/{id}/content?variant=source或candidate` | 受鉴权的二进制内容；HTML仅在沙箱展示 |
| GET `/{id}/viewer?variant=...` | 签名的ONLYOFFICE只读配置；签名内容URL仅限本任务和变体 |
| POST `/{id}/confirm` | `{candidate_hash}`；CAS+幂等确认，返回SAVED及saved_version |
| POST `/{id}/cancel` | 关闭候选；不删除原件或停止模型 |

状态为 WAITING → READY → SAVED，或 CANCELLED。目录位于显式page_state_dir的 `files/ai-workspaces/ai_UUID`，只含任务说明、输入副本和模型工作文件；不保存HTTP令牌。文件服务与DSH须运行在同一本机，才可直接打开这个目录。

文档预览使用 ONLYOFFICE 官方 [`mode: view`](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/viewing/) 和 [`permissions.edit: false`](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/permissions/)，不把编辑器的AI菜单当成原生AI接线。
