# M2-06 candidate CRM 写入 UAT 前置阻塞（2026-10-15）

本轮已获得用户授权，在隔离 candidate 中执行临时 CRM 写入、回读、回退/删除和权限负测；live current、主仓 profile/journal 和真实生产业务均不在范围内。

## 执行前提

- candidate web：`127.0.0.1:4332`；此前 candidate bridge 端口为 `127.0.0.1:4336`，本次重启后未作为写入验收入口使用。
- CRM 页面状态：首次尝试为 `CRM分析（已连接）`；为修复工具面而重启隔离 candidate 后，用户再次手工绑定，页面恢复为 `CRM分析（已连接）`。
- 初始 preset：`PTC 模式`，用于检查实际写工具面；该模式没有加载 CRM tool plugin。
- 隔离 candidate 临时增加 `CRM 写入验收` preset（只写入远端 candidate runtime 的临时 patch，未修改主仓代码、profile/journal 或 live），重启后已在 Aside preset 列表可见。
- 测试标记：`M2-06-CANDIDATE-20261015`；原计划只创建一个可回退的 candidate 临时对象。
- 请求禁止读取 workspace/session、凭据、客户标识和原始业务行。

## 实际结果

1. PTC 新会话默认模型为 MiniMax-M3；请求在模型认证层返回 `AUTH / API 密钥无效`，没有进入 CRM 工具调用。
2. 在不读取或传递密钥的前提下，切换到候选页面中已登记的 DeepSeek-V41-Flash，再次发送同一受限请求；仍返回 `AUTH / API 密钥无效`，没有进入 CRM 工具调用。
3. 两次失败均发生在模型调用前；CRM 连接状态仍显示已连接，不能把它归因为 CRM 写接口、权限拒绝或回退逻辑。
4. 诊断确认 PTC 未加载 CRM tool plugin，模型因工具面为空而尝试 workspace `run_code`；candidate runtime 没有可用 sandbox backend，额外权限请求被拒绝。没有读取或修改 workspace/session。
5. 为了继续受控验收，在隔离 candidate 追加临时 `CRM 写入验收` preset 并重启 candidate 进程；重启后用户重新绑定 CRM，页面显示 `CRM分析（已连接）`。
6. 打开候选 CRM 分析面板后，服务端明确返回“尚未配置独立的 CRM 分析存储”。候选 host 仍指向 `http://127.0.0.1:18093`，该端口由 `fuqing-crm-analytics-backend-1` 提供，并挂载 `/srv/shinemage/data`；它不是独立的临时写入数据库。为避免把 candidate 写入落到共享真实数据，未启用存储、未调用快照写入，也未修改该后端配置。
7. 没有创建、保存、回读、删除、分享、激活、切换或修改任何业务对象；没有产生候选测试数据。

## 门禁结论

```text
CRM_WRITE_TOOL_SURFACE_REPAIRED_IN_CANDIDATE
CRM_WRITE_STORAGE_NOT_CONFIGURED
CRM_WRITE_NOT_RUN
CRM_PERMISSION_NEGATIVE_NOT_RUN
CRM_RECOVERY_NOT_RUN
CRM_DATA_MUTATION_COUNT=0
```

这条回执同时记录两层阻塞：早先 PTC 的 MiniMax/DeepSeek provider 认证失败；修复候选工具面并重新绑定 CRM 后，真实 CRM 分析存储仍未配置，而且候选 host 指向共享真实后端。不能为了验收而打开共享后端写入。要继续真实 CRM 写入，需要单独的非生产 CRM storage origin/database、明确的数据隔离与回退方案；在此之前只能保持 `NOT_RUN`。此前真实 CRM GSV 与 AOV/AUS 只读通过证据不受影响。
