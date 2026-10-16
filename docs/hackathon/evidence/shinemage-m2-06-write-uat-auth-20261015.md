# M2-06 candidate CRM 写入 UAT 前置阻塞（2026-10-15）

本轮已获得用户授权，在隔离 candidate 中执行临时 CRM 写入、回读、回退/删除和权限负测；live current、主仓 profile/journal 和真实生产业务均不在范围内。

## 执行前提

- candidate web：`127.0.0.1:4332`；此前 candidate bridge 端口为 `127.0.0.1:4336`，本次重启后未作为写入验收入口使用。
- CRM 页面状态：首次尝试为 `CRM分析（已连接）`；为修复工具面而重启隔离 candidate 后，用户再次手工绑定，页面恢复为 `CRM分析（已连接）`。
- 初始 preset：`PTC 模式`，用于检查实际写工具面；该模式没有加载 CRM tool plugin。
- 隔离 candidate 临时增加 `CRM 写入验收` preset（只写入远端 candidate runtime 的临时 patch，未修改主仓代码、profile/journal 或 live），重启后已在 Aside preset 列表可见。
- 测试标记：`M2-06-CANDIDATE-20261015`；原计划只创建一个可回退的 candidate 临时对象。
- 请求禁止读取 workspace/session、凭据、客户标识和原始业务行。

## 2026-10-15 后续修复与隔离存储

- 为避免共享 `18093` 后端承载 candidate 写入，已在同一目标启动临时容器 `shinemage-m2-06-crm-storage-r1`，监听 `127.0.0.1:18099`；CRM 分析 SQLite 状态目录独立且 owner-only，DuckDB 与来源目录只读挂载，容器 root filesystem 为只读。健康检查返回 HTTP 200。该容器只服务当前 candidate，不改变 live current。
- 候选 host patch 已改为 `http://127.0.0.1:18099`；直接打开隔离 `CrmAnalysisStore` 的 `library` 与 `search_analyses` 均成功，空库读取不再返回 `STATE_UNAVAILABLE`。启动时只读 DuckDB 的 RFM cache 预热失败不影响 CRM 看板查询路径，未写入真实数据。
- 诊断确认候选进程读取的是 `home/.dsh/.credentials.yaml`。只将候选已有上层凭据文件中的 DeepSeek/Minimax 引用合并到该候选文件，未输出或复制到 live；重启后在候选标准会话发送 `Reply READY only.`，模型返回 `READY`，模型凭据门禁已恢复。
- 切换到 `CRM 写入验收` preset 后，新会话的 CRM 绑定仍按设计是会话级隔离；本轮首次重跑因该新会话尚未绑定 CRM 返回 `NOT_CONNECTED`，没有创建快照或分析，隔离状态库的业务对象数保持 0。

## 实际结果

1. PTC 新会话默认模型为 MiniMax-M3；请求在模型认证层返回 `AUTH / API 密钥无效`，没有进入 CRM 工具调用。
2. 在不读取或传递密钥的前提下，切换到候选页面中已登记的 DeepSeek-V41-Flash，再次发送同一受限请求；仍返回 `AUTH / API 密钥无效`，没有进入 CRM 工具调用。
3. 两次失败均发生在模型调用前；CRM 连接状态仍显示已连接，不能把它归因为 CRM 写接口、权限拒绝或回退逻辑。
4. 诊断确认 PTC 未加载 CRM tool plugin，模型因工具面为空而尝试 workspace `run_code`；candidate runtime 没有可用 sandbox backend，额外权限请求被拒绝。没有读取或修改 workspace/session。
5. 为了继续受控验收，在隔离 candidate 追加临时 `CRM 写入验收` preset 并重启 candidate 进程；重启后用户重新绑定 CRM，页面显示 `CRM分析（已连接）`。
6. 打开候选 CRM 分析面板后，旧 host 曾明确返回“尚未配置独立的 CRM 分析存储”；该 host 指向共享真实后端，未启用共享写入。随后已完成 `18099` 独立存储容器与状态目录接线，隔离存储本身可读；尚未在绑定 CRM 的写入会话中重跑保存流程。
7. 切换到写入 preset 后首次重跑，模型正确拒绝在 `NOT_CONNECTED` 状态下查询或写入；随后用户在同一写入会话完成 CRM 绑定，模型按 90 天上限将 2025 年拆为五个无重叠窗口，五次 `query_crm_dashboard_snapshot` 均返回 `ok=true`，五条对象写入独立 candidate SQLite，GSV 合计为 `179,409,532.85`。
8. 模型没有暴露“按标题保存分析”或“按 ID 回读已保存分析”的工具；本轮没有伪造标题、数字或回读结果。为完成隔离恢复，停止独立 storage 容器后删除本轮五条 `assets/receipts`，重启容器，健康检查返回 200，`library("admin")` 回到空库（assets/receipts/grants/command_receipts 均为 0）。

## 门禁结论

```text
CRM_WRITE_TOOL_SURFACE_REPAIRED_IN_CANDIDATE
CRM_WRITE_STORAGE_ISOLATED_READY
CRM_WRITE_SESSION_REBIND_REQUIRED
CRM_WRITE_SNAPSHOT_PASS
CRM_ANALYSIS_SAVE_NOT_EXPOSED
CRM_ANALYSIS_READBACK_NOT_EXPOSED
CRM_PERMISSION_NEGATIVE_NOT_RUN
CRM_RECOVERY_PASS
CRM_DATA_MUTATION_COUNT=5_ISOLATED_THEN_CLEANED
```

这条回执记录四层事实：早先 PTC 的 MiniMax/DeepSeek provider 认证失败；候选凭据路径修复后模型调用已恢复；独立 CRM storage 已就绪且真实 CRM 只读查询与五窗口快照写入通过；快照已在隔离恢复中清空。模型没有暴露分析标题保存或按 ID 回读接口，权限负测仍需有暴露的明确对象共享/读取接口后再执行；这轮没有写入 live 或共享真实后端。此前真实 CRM GSV 与 AOV/AUS 只读通过证据不受影响。
