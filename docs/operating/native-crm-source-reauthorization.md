# 原快照的显式重新授权

本接口恢复同账号、同原 DSH 会话中的持久快照访问。它不重新查询业务数据库，不更新原快照，也不修改看板版本、绑定或编辑内容。当前为已推送的草稿候选，两作者 CI 与本地组合严格接收通过，尚未进入隔离真实验收或公网。

## 浏览器合同

入口为 CRM 现有 `POST /api/crm-knowledge/connection`，沿用原生 Connection 登录、受信 Origin、JSON 和 `x-crm-ui: 1` 检查。

| 操作 | 输入字段 | 成功 value |
|---|---|---|
| `source_authorization_preview` | `operation`、`session_id`、`refs` | `preview_id`、`expires_at_ms`、`sources` |
| `source_authorization_confirm` | `operation`、`session_id`、`preview_id` | `authorized_refs`、`expires_at_ms` |

成功封套为 `{ok: true, value: ...}`。错误封套为 `{ok: false, code, message}`，文案不包含上游异常。`refs` 为 1 至 64 个唯一引用，顺序保留。账号与登录代次由 Host 核实，浏览器不能提交身份或业务数据。

预览最多有效 60 秒，且不超过当前登录期限。每个登录最多保留两个未过期预览或确认回执。确认重新检查全部原来源。相同票的重试返回相同回执，仍检查当前登录及来源。授权有效期不超过当前登录期限。

`sources` 每项包含 `ref_id`、`ref_payload_sha256`、`snapshot_id`、`source_sha256`、`result_sha256`、`projection_version`、`data_kind` 和 `captured_at`。时间来自原快照。它不包含业务结果、登录令牌或私有句柄。

## 私有来源合同

Host 为一次核验创建 `crm_reauth_` 句柄，绑定当前登录记录和完整引用集合，操作结束即删除。来源服务通过受认证的 `POST /native-crm-source/introspect-reauthorization` 核实该意图。普通 `crm_op_` 查询句柄不能代替授权意图。

来源服务的 `inspect` 操作接受 `operation`、`handle`、`session_id`、`refs` 和 `budget_ms`。预算上限为 5000 毫秒。来源逐项核对引用归属、原会话、数据种类、摘要、投影和撤销记录，再读取本人原快照并核对摘要。任一来源失败则整批拒绝。该操作只返回元数据，不写引用库，不激活授权。

确认全部检查通过后，Host 在最终预算和容量检查之后同步发布整批授权。新观察使用 `native-crm-reauthorized-observation/v1`，在原观察字段上增加 `authorization`，只包含准确的 `ref_id` 和 `ref_payload_sha256`。普通观察 v1 形状保持不变。

Python 的 `NativeCrmLease.authorizations` 默认为空。普通引用继续要求原登录代次和期限。只有当前可信 Host 为准确引用及其完整摘要提供新授权时，旧代次引用才可按当前登录期限读取。单读、批读和末次复核共用同一判定，始终保留归属、原会话、摘要、撤权和在线当前性检查。

## 工作台行为

已保存页的“来源与源码”提供预览及确认入口。有未保存修改时禁用。预览展示原快照时间和来源标识，确认仅刷新当前页面版本的来源读取，不拉取服务端的新版本。

网络异常、503 或确认回执丢失时，可在原票到期前重试确认。切页、产生未保存修改或票到期后，旧响应不能发布到当前界面。来源撤销或变化要求重新预览，撤销墓碑不能通过重新授权恢复。

## 状态与回退

新授权只存在于当前 Host 登录内存。断开、重登、到期或 Host 重启会清除授权；下一登录必须再次显式确认。来源服务重启可继续核实仍有效的 Host 证明。

原引用 SQLite、快照、页面及覆盖层均不迁移。旧 runtime 不识别新观察，按原规则拒绝旧引用。未返回确认回执不代表跨进程回滚，调用方用原票核实结果。

本地验证及尚未关闭的交付范围见[重新授权验收记录](../hackathon/evidence/dsh-source-reauthorization-20261028.md)。
