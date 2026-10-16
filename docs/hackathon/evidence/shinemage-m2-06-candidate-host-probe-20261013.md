# M2-06 candidate CRM host 路由探针（2026-10-13）

本轮在已经通过 peer 图修复的隔离 candidate runtime 内，通过 DSH 自身的一次性 launch token 做本地 RPC 探针。该探针不依赖 Aside 登录，不调用模型，不读取 CRM/WeKnora 数据，也不读取凭据。

## 实际结果

| 检查 | 结果 |
|---|---|
| DSH launch token exchange | HTTP `303`，候选 cookie 建立成功 |
| 临时 workspace | 创建成功，仅位于 candidate 的临时目录 |
| 临时 session | `m2-06-candidate-uat` 创建成功，未发送 prompt |
| CRM host route | `POST /api/crm-knowledge/connection` HTTP `200` |
| CRM connection status | `{ "ok": true, "connected": false, "username": null }` |
| CRM 业务查询 | `NOT_RUN` |
| 模型调用 | `NOT_RUN` |
| WeKnora 检索 | `NOT_RUN` |

这说明修复后的 candidate 宿主已经加载 CRM host 路由；当前缺口是该 session 尚未通过 CRM 登录建立绑定，而不是 `session-controller` 导入失败。Aside 的 live 登录仍未传递到 `127.0.0.1:4332`，浏览器 candidate UAT 继续保持 `ASIDE_SESSION_NOT_BOUND`。

## 结论

`CANDIDATE_CRM_HOST_ROUTE_PASS / CRM_SESSION_NOT_CONNECTED`。这条探针不能替代真实 CRM 账号登录、GSV 查询、WeKnora 检索、模型调用或人工 UAT。产品仍 `PARTIAL`，`release_ready=false`。
