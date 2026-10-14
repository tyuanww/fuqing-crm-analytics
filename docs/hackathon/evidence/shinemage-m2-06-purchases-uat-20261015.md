# M2-06 candidate 真实 CRM AOV / AUS 只读 UAT（2026-10-15）

本轮在杭州隔离 candidate `127.0.0.1:4332` 的已登录 CRM 对话中补跑真实购买聚合查询。没有触碰 live `4328`，没有读取或输出凭据、客户标识或原始业务行。

## 运行边界

- CRM 状态：`LOGIN_BOUND`，页面显示 `CRM分析（已连接）`。
- 查询窗口：`2026-01-01` 至 `2026-01-07`，`channel=all`，`exclude_low_price=false`。
- 工具：`query_crm_dashboard_purchases`。
- 禁止项：保存、分享、删除、修改设置、激活、切换、workspace/session 文件读取和快照持久化。

## 结构化回执

- `status=OK`，合同 `crm-dashboard-purchases/v1`，指标版本 `dashboard-gsv-purchases/v1`。
- 来源为 `authenticated_crm_metrics_service`，`contains_real_data=true`，`synthetic=false`。
- AOV 和 AUS 均成功返回，阻断原因为 `null`；本次未知订单/买家标识、未知金额、空值金额和负值金额均为 0。
- 返回覆盖完整窗口；明细行、订单和买家层级满足 `rows ≥ orders ≥ buyers`。零元订单单独列出，未计入购买分母。
- 购买聚合分子与同窗口 `query_crm_dashboard_gsv` 的 GSV 分值完全一致，未出现分子漂移；独立复算只保留取整误差说明。
- `workspace/session` 级对账工具未暴露，保持 `NOT_EXPOSED / NOT_RUN`；结果未写入快照、分析或驾驶舱。
- 本轮没有执行保存、分享、删除、激活、切换、设置或提交动作。

## 门禁结论

本轮关闭 candidate 真实 CRM 购买只读子项：

```text
CRM_PURCHASES_READONLY_PASS
CRM_AOV_AUS_STRUCTURAL_PASS
CRM_WRITE_NOT_RUN
CRM_WORKSPACE_SNAPSHOT_NOT_EXPOSED
```

这条回执不代表 CRM 保存、权限失败、恢复、人工业务复核或正式发布通过；这些项目仍等待隔离写入授权和相应测试数据。
