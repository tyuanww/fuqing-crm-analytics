# Host 快照来源接口

CRM Host 显式配置 `nativeSnapshot` 后，原生 `querySnapshot` 依次捕获快照、签发私有查询句柄、登记来源、权威回读并校验投影。成功结果保留原 `value`，增加字符串 `source_ref`。工具适配保留该字段，私有句柄不进入工具输出。

默认配置不启动来源服务或监听端口。当前是候选实现，真实 rc3 Host、页面 resolver、完整业务链路和杭州切换仍需独立验收。

2026-10-25，主仓 rc3 组合已将本接口的候选包锁定到 CRM 作者 `ed5940f`，并从真实 CI ZIP 完成严格接收。固定身份和未关闭项见[组合接收记录](../hackathon/evidence/dsh-native-host-composition-20261025.md)。包进入组合不自动启用 `nativeSnapshot`。

## 配置

Host 的 `nativeSnapshot` 必须同时包含以下字段。

| 字段 | 合同 |
|---|---|
| `introspectionPort` | 1 至 65535 的显式端口，监听字面量 `127.0.0.1` |
| `sourceOrigin` | 独立 Python 来源服务的 `http://127.0.0.1:端口` |
| `tokenFile` | 新实例服务令牌的绝对文件路径，文件 0600、目录 0700、当前 UID、单链接，禁止符号链接 |

服务令牌为 64 位小写十六进制，不是 CRM 登录令牌。两服务从明确的私有文件读取它，不输出内容。轮换需要显式重启两个候选实例，不读取现役认证状态。

Python 入口为 `scripts/crm-calibration/run_native_snapshot_source.py`。必需参数为 `--crm-state-dir`、`--state-dir`、`--data-kind`、`--host-origin`、`--token-file` 和 `--port`。CRM 状态必须已经存在；`--initialize` 在预先准备的私有目录独占初始化新引用状态，拒绝覆盖已有状态。运行使用项目锁定 Python 和指向仓库的绝对 `PYTHONPATH`。

来源服务单独运行，不挂载默认 CRM 或页面应用。它使用独立的四个工作线程。超出容量直接返回 503，使 `/auth/me` 回调保持独立执行容量。

## 内部调用

两端要求服务认证，不提供浏览器 CORS。带 Origin、错误令牌、重复 JSON 键、额外字段或未知动作的请求被拒绝。浏览器不能登记身份、关联事实、原始行或金额。

Host 的 `POST /native-crm-source/introspect` 接收 `handle` 和 `budget_ms`。Host 检查原登录 record、固定期限、live session 和连接代次，再用私有 CRM Bearer 核验账号。认证之后再次检查原授权，旧异步响应不能清除新登录。

Python 的 `POST /native-crm-source` 接收 `operation`、`handle`、`session_id` 和 `budget_ms`。`read`、`revoke` 还要求 `ref_id`。调用方必须是可信 Host，`session_id` 来自工具执行上下文，不是独立认证凭证。

| 动作 | 成功结果 |
|---|---|
| `register` | `native-crm-source-receipt/v1`，引用、快照、结果摘要、数据种类和期限 |
| `read` | `ref_id` 与权威 `CrmSnapshot` |
| `revoke` | `ref_id` 与 `revoked=true` |

`HostBoundSnapshotSource` 为每次操作创建独立冻结观察和 Source 实例。无参数 provider 返回同一租约，当前性回调在线复查完整观察，不滚动续期，不修改共享 `.provider`。数字始终从 `CrmAnalysisStore` 读取，Host 账本不复制结果。

Host 的 `readNativeSnapshot(sessionId, refId, signal)` 返回 `CrmSnapshot`；`revokeNativeSnapshot` 返回撤销回执。二者核对当前会话与私有 ref 索引。底层快照期望还会在持久状态事务内拒绝错配引用。

作者提交 `21a7368` 新增 `openNativeSnapshotLease(sessionId, signal)`，用于一次操作内固定原登录记录。返回冻结对象，包含 `identity`、原授权失效的 `signal`、`read(refId, signal)` 和 `assertCurrent(signal)`。打开调用的 signal 不绑定租约全生命周期，调用方必须把后续操作的取消信号继续传入。主仓组合已锁定该作者的严格包，并从 artifact `12571627062` 实际读回。接口进入候选组合不代表 Host 页面代理和 Workbench 已完成接线。

## 期限与撤权

每次成功登录生成独立连接代次。暂时非 live 的登录记录保留，但拒绝使用；恢复相同会话可以复用未过期登录。断开、到期、换号、重登和卸载清理句柄及 ref 索引。本入口只支持当前 grant 的引用操作，不因底层支持跨代次撤销而恢复旧索引。

整次查询最多 30 秒，包含 capture、登记和回读。每个来源子操作最多 5 秒，排队、网络、认证和回查共享剩余预算。不同进程不传递单调时钟绝对值。

超时或取消后不交付结果，不写入成功索引。同步线程可能继续完成已有事务，留下快照或未交付引用，不承诺跨进程回滚或强制停止线程。已交付数据无法收回，前后检查不提供严格原子撤权。

## 验证边界

测试使用小型合成 DuckDB、真实 CRM 快照及引用 SQLite。跨进程测试实际加载维护中的 Node Host access，经双向 HTTP 完成查询、登记、回读与撤销。认证服务为合成边界，不代表真实账号或原生 Connection 准入已验收。

跨仓入口为 `scripts/crm-calibration/test_native_snapshot_host_chain.py`，要求 `CRM_NATIVE_HOST_PLUGIN` 指向显式维护中的作者插件绝对目录。它拒绝回退到主仓历史副本，不属于普通后端默认矩阵；执行结果与固定候选包消费分别记录。

当前上游采用单 Host owner 模型。该接法不提供独立多用户隔离，不将浏览器标题、Cookie、单元测试或服务注册状态当作真实登录证据。RFM、商品来源及缓存不属于此经营聚合合同。
