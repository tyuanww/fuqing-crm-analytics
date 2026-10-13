# M2-06 candidate 真实模型、CRM 与 WeKnora 只读 UAT（2026-10-13）

本记录补充前序 candidate 凭据门禁。用户在杭州授权目标的隔离 candidate `127.0.0.1:4332` 的 Models 页面手工保存 DeepSeek provider 凭据，并在 CRM 连接表单手工完成当前对话绑定。凭据没有经过聊天、仓库、日志或证据文件；本记录只保存脱敏状态和结构化门禁结果。live `4328` 未切换，CRM profile/journal 未被候选业务凭据污染。

## 输入与权限边界

| 项目 | 实际观察 |
|---|---|
| candidate runtime | `m2-06-candidate-r4`, web `4332`, bridge `4336` |
| DSH pin | `0.1.7-rc.2` / upstream `477b4f42` |
| DSH 会话 | `hutou`，临时 `uat-probe-workspace` |
| 访问模式 | `仅可查看` |
| 模型 | `DeepSeek-V41-Flash · High` |
| CRM 绑定 | 当前对话 `LOGIN_BOUND`，由用户手工完成 |
| CRM 请求 | `query_crm_dashboard_gsv` 一次，`2026-01-01` 至 `2026-01-07`，`channel=all`，`exclude_low_price=false` |
| 业务写入 | 未执行保存、分享、删除、激活、切换、设置或提交 |

## 结果

### 真实模型与 WeKnora

候选模型调用成功，WeKnora 只读检索与来源引用完成。回答区分知识库静态资料和实时业务数据，没有把教材或合成资料冒充实时 CRM 数据。`weknora_search` 与来源读取均在只读范围内；未调用写入工具。

结论：`REAL_MODEL_PASS / WEKNORA_READONLY_PASS`。

### CRM GSV

第一步 `crm_service_health` 返回 `crm_login=LOGIN_BOUND`。随后仅调用一次 `query_crm_dashboard_gsv`，页面显示：

- `Status: OK`；来源为 `authenticated_crm_metrics_service`，`contains_real_data=true`，`synthetic=false`；
- schema 为 `crm-dashboard-read/v1`，指标版本为 `dashboard-gsv/observed-v1`，时区 `Asia/Shanghai`；
- 指定日期范围返回 `7/7` 个日点，无缺口，`daily_sum_matches=true`；
- `backend_version_verified=false`，`warehouse_cutoff=2026-07-05`，`data_through` 为空；
- GSV 总额、趋势行和受众金额按本次脱敏要求不写入记录，客户标识和原始业务行未输出。

结论：`CRM_READONLY_GSV_PASS / REAL_DATA_STRUCTURAL_CHECK_PASS`。这次结果只证明只读查询链路和结构化回执，不关闭 AOV、会员、净 GSV、purchases、snapshot、保存、权限失败、恢复或人工业务复核。

## 门禁结论

M2-06 从 `CANDIDATE_MODEL_MISSING_CREDENTIAL` 推进为 `CANDIDATE_REAL_MODEL_PASS / CRM_READONLY_PASS / WEKNORA_READONLY_PASS / LIVE_TOOL_SURFACE_EMPTY`。live 标准会话此前仍未暴露 CRM/WeKnora 工具，保持其独立的 `NOT_EXPOSED / NOT_RUN` 事实；本次 candidate 结果不能替代 standalone、完整无障碍、SDK 供应链、release、activation、canary 或 rollback。产品仍为 `PARTIAL`，`release_ready=false`，activation `NOT_RUN`。
