# 原生会话的 CRM 快照引用

`NativeCrmSnapshotSource` 是可信进程内的来源注册器。它把现有 CRM 聚合快照关联到账号、原生对话和连接代次，只持久化引用元数据。每次读取重新访问 `CrmAnalysisStore`，数字和金额仍由权威快照维护。

本模块不注册 HTTP 路由。显式 Host 适配与独立内部服务见 [Host 来源接口](native-crm-host-source.md)。页面 resolver 与结果读取桥仍需接线，不能据此宣称真实聊天到画布已经验收。

## 当前会话来源

组合根注入无参数 provider。它返回 `NativeCrmLease`，包含冻结的 `NativeCrmIdentity` 及动态 `is_current()` 回调。身份字段为 CRM 用户名、原生 session ID、连接代次、有效期毫秒和数据种类。用户名保留 CRM 原值，支持 `@`。

provider 负责核实真实账号与会话归属、连接代次不复用以及及时撤权。浏览器提供的 owner、session 或 Cookie 不能直接构造这个授权。模块在操作前后核对当前身份、有效期和回调；缺 provider、未连接或无法核实当前性时拒绝访问，不分配 B0 fixture scopes。

现有 Vue CRM 将 Bearer 令牌保存在标签级 `sessionStorage`，后端校验 `Authorization`。单独复制 Cookie 不能代替此认证；现场验证应复用已登录页面或可信 Host 的既有连接，不导出令牌给画布。

## 注册、读取与撤销

`register(snapshot_id)` 的唯一业务输入是已有的 `crm_s_` 快照 ID。它通过新增的 `read_owned_snapshot()` 限制为账号自有快照；原有 `read()` 的共享能力保留。注册器不接收 rows、金额、owner、scope 或凭据。

返回引用固定完整快照摘要、结果摘要、数据种类、来源协议版本、原生身份和到期上限。唯一键包含账号、对话、连接代次与 snapshot ID。同一 grant 重试返回同一引用，不续期；已撤销的引用不能通过重注册恢复。

`read(ref_id)` 只接受已登记的不透明引用。它核对当前账号、对话和连接代次，检查撤销及有效期，然后从 CRM 权威库回读并核对完整快照摘要。回读后与返回前再次检查引用自身期限，不能因当前 lease 续期而延长旧引用。上游临时存储故障保留可重试的 503，隐藏原始错误详情。修改返回对象不会改变权威快照或下次读取结果。

`revoke(ref_id)` 为当前账号、当前原生对话写入永久 tombstone，可撤销该对话旧连接代次的引用。重复撤销幂等，不恢复权限。明确的新登录 grant 可以为同一快照登记不同引用，旧 tombstone 继续有效，不要求重复计算同一个快照。

可选的 `NativeSnapshotExpectation` 固定允许的 snapshot ID 与结果摘要。注册在写入引用前核对它，读取与撤销在解析引用后核对它。Host 包装层强制采用查询句柄对应的期望，只暴露无快照参数的 `register()`。账号所有权不能代替原生查询关联。

## 私有状态生命周期

`NativeCrmSnapshotSource.create()` 在显式私有目录独占创建数据库。普通构造函数只接受已完成初始化且格式完整的既有状态，不能重建或覆盖撤销记录。目录由调用者拥有且不开放组或其他用户权限，数据库和 sidecar 同样检查属主、类型、权限与链接。

状态使用独立 application ID、schema、namespace 和数据种类，按创建 DDL 校验实际 schema，拒绝缺表、额外触发器或不兼容约束。撤销只忽略同一 ref_id 的重复，并读回 tombstone 后才报告成功；其他约束失败或实际写入被跳过不能当作成功。它不使用固定写入 `finite_mock=true` 的 B0 初始化器，也不修改共享 helper 默认行为。新实例只能恢复引用元数据，不能恢复登录；读取仍需 provider 重新证明当前 grant。

注册、读取和撤销按注册表事务排序，再访问 CRM 库。撤销提交后开始的读取会拒绝该引用。已经返回的数据无法收回；前后回调检查不等于与外部授权源严格原子。摘要核对内容一致性，认证仍由 provider 承担。文件权限检查不防御恶意同 UID 进程或旧备份回滚。

## 验证边界

`backend/tests/test_crm_native_snapshot_source.py` 使用真实 `CrmAnalysisStore`、小型合成 DuckDB 与私有 SQLite，覆盖来源回读、共享拒绝、账号与对话隔离、换连接、过期、迟到结果、撤销与重注册、摘要变化、并发登记及新进程回读。provider 在这些测试中是显式合成身份，不构成真实宿主登录证明。

Host 适配及查询关联有独立的合成跨进程验证。固定候选包消费、真实 rc3 Host 登录、页面接线和浏览器业务 UAT 仍需分别验收。本模块未读取 Cookie 或认证存储，未改密码，未部署或切换杭州。
