# M2-06 candidate CRM 写入 UAT 认证前置阻塞（2026-10-15）

本轮已获得用户授权，在隔离 candidate 中执行临时 CRM 写入、回读、回退/删除和权限负测；live current、主仓 profile/journal 和真实生产业务均不在范围内。

## 执行前提

- candidate web：`127.0.0.1:4332`；candidate bridge：`127.0.0.1:4336`。
- CRM 页面状态：`CRM分析（已连接）`。
- preset：`PTC 模式`，用于检查实际写工具面。
- 测试标记：`M2-06-CANDIDATE-20261015`；原计划只创建一个可回退的 candidate 临时对象。
- 请求禁止读取 workspace/session、凭据、客户标识和原始业务行。

## 实际结果

1. PTC 新会话默认模型为 MiniMax-M3；请求在模型认证层返回 `AUTH / API 密钥无效`，没有进入 CRM 工具调用。
2. 在不读取或传递密钥的前提下，切换到候选页面中已登记的 DeepSeek-V41-Flash，再次发送同一受限请求；仍返回 `AUTH / API 密钥无效`，没有进入 CRM 工具调用。
3. 两次失败均发生在模型调用前；CRM 连接状态仍显示已连接，不能把它归因为 CRM 写接口、权限拒绝或回退逻辑。
4. 没有创建、保存、回读、删除、分享、激活、切换或修改任何业务对象；没有产生候选测试数据。

## 门禁结论

```text
CRM_WRITE_AUTH_BLOCKED
CRM_WRITE_NOT_RUN
CRM_PERMISSION_NEGATIVE_NOT_RUN
CRM_RECOVERY_NOT_RUN
CRM_DATA_MUTATION_COUNT=0
```

这条回执只说明当前 PTC 模型 provider 认证无效。要继续写入验收，需要授权人员在 candidate 受控 credentials service 中修复一个可用 provider，再重跑同一受限请求；密钥不得通过聊天、仓库、日志或证据文件传递。此前真实 CRM GSV 与 AOV/AUS 只读通过证据不受影响。
