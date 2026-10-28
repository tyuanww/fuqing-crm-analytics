# 原快照重新授权接口

本接口恢复同一 CRM 账号、同一原 DSH 会话中的快照访问。系统不重新查询业务数据库，不更新快照，也不修改看板版本、绑定或编辑内容。

## 浏览器请求

入口为 `POST /api/crm-knowledge/connection`。请求沿用原生 Connection 登录、受信 Origin、JSON 和 `x-crm-ui: 1` 检查。账号和登录代次由 CRM Host 核实，浏览器不能提交身份或业务数据。

两种操作都要求 `operation` 和 `session_id`。

| operation | 其他输入字段 | 成功 value |
|---|---|---|
| `source_authorization_preview` | `refs` | `preview_id`、`expires_at_ms`、`sources` |
| `source_authorization_confirm` | `preview_id` | `authorized_refs`、`expires_at_ms` |

成功响应为 `{ok: true, value: ...}`。错误响应为 `{ok: false, code, message}`，不返回上游异常。

`refs` 接受 1 至 64 个唯一引用，并保留顺序。预览最多有效 60 秒，且不超过当前登录期限。每次登录最多保留两个未过期预览或确认回执。确认时重新核实全部来源。重试同一预览返回相同回执，仍检查当前登录和来源状态。

`sources` 每项包含 `ref_id`、`ref_payload_sha256`、`snapshot_id`、`source_sha256`、`result_sha256`、`projection_version`、`data_kind` 和 `captured_at`。时间来自原快照。响应不包含业务结果、登录令牌或私有句柄。

## 私有来源请求

CRM Host 为一次核验创建 `crm_reauth_` 句柄，绑定当前登录记录和完整引用集合，操作结束即删除。来源服务通过受认证的 `POST /native-crm-source/introspect-reauthorization` 核实授权意图。普通 `crm_op_` 查询句柄不能代替授权意图。

来源服务的 `inspect` 操作要求 `operation`、`handle`、`session_id`、`refs` 和 `budget_ms`，预算上限为 5000 毫秒。服务核对引用归属、原会话、数据种类、摘要、投影和撤销记录，再读取本人原快照并核对摘要。任一项失败即拒绝整批。该操作只返回元数据，不写引用库，也不激活授权。

全部检查通过后，CRM Host 在预算和容量检查后同步发布整批授权。新观察使用 `native-crm-reauthorized-observation/v1`，在原观察字段上增加 `authorization`，其中只有准确的 `ref_id` 和 `ref_payload_sha256`。普通观察 v1 的字段保持不变。

## 读取与工作台行为

`NativeCrmLease.authorizations` 默认为空。普通读取继续要求原登录代次和期限。只有当前可信 CRM Host 为准确引用及其完整摘要提供新授权，旧引用才能按当前登录期限读取。单读、批读和末次复核保留归属、原会话、摘要、撤权及在线当前性检查。

已保存页的**来源与源码**提供预览及确认入口。有未保存修改时禁用。预览显示原快照时间和来源标识；确认后只刷新当前版本的来源读取，不拉取服务端的新版本。

网络异常、503 或确认回执丢失时，可在预览到期前使用同一 `preview_id` 重试。切页、产生未保存修改或预览到期后，旧响应不能更新当前界面。来源变化要求重新预览；已撤销引用不能恢复。

## 授权失效与回退

新授权只存在于当前 CRM Host 登录内存。断开、重登、到期或 Host 重启会清除授权，下一次登录必须重新确认。来源服务重启后，可以继续核实仍有效的 Host 证明。

原引用 SQLite、快照、页面和编辑覆盖层均不迁移。旧运行时不识别新观察，继续按原规则拒绝旧引用。未收到确认回执不代表授权已回滚，调用方使用原预览核实结果。

实现及验收状态见[重新授权验收记录](../hackathon/evidence/dsh-source-reauthorization-20261028.md)。
