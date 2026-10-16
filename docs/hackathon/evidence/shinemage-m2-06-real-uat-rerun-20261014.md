# M2-06 candidate 真实 CRM 只读 UAT 重跑（2026-10-14）

本轮在恢复 candidate 隧道、用户手工完成 CRM 登录并切换到 `CRM 只读验收` preset 后，重跑真实 CRM 只读 UAT。凭据、客户标识、原始业务行和金额明细不写入仓库。

## 运行边界

- candidate web：`127.0.0.1:4332`
- candidate bridge：`127.0.0.1:4336`
- preset：`CRM 只读验收`
- 模型：`DeepSeek-V41-Flash · High`
- CRM 状态：页面显示 `CRM分析（已连接）`
- 访问模式：只执行健康检查和 GSV 查询
- 禁止项：保存、分享、删除、激活、切换、设置、workspace/session 文件读取

## 只读结果

### 连接健康

`crm_service_health` 已实际调用一次，结果为：

```text
crm_login=LOGIN_BOUND
gsv=AVAILABLE
```

知识库、驾驶舱 board provider 和合成 CRM metrics service 在本次 preset 中没有暴露，保持 `NOT_AVAILABLE / NOT_RUN`，没有用合成结果代替真实业务结果。

### GSV 查询

`query_crm_dashboard_gsv` 已实际调用一次，参数为：

```text
start_date=2026-01-01
end_date=2026-01-07
channel=all
exclude_low_price=false
```

结构化回执：

- 来源为 `authenticated_crm_metrics_service`；
- `contains_real_data=true`；
- `synthetic=false`；
- 返回日期点 `7/7`，无缺失日期；
- `daily_sum_matches=true`，接口汇总与逐日复算一致；
- `warehouse_cutoff=2026-07-05`；
- `data_through` 为空；
- `backend_version_verified=false`，不把它写成后端版本已核验。

真实金额、客户标识和原始业务行只在候选页面短暂显示，没有写入本记录。

## 未运行项

以下项目保持 `NOT_RUN`，没有用本次 GSV 结果推断：

- AOV/AUS 购买查询；
- 会员溢价查询；
- 净额查询；
- readiness 查询；
- CRM 保存、权限失败、恢复和人工业务复核。

## 门禁结论

本轮关闭了 candidate 的真实模型/CRM 只读链路和 GSV 结构化查询子项：

```text
CANDIDATE_REAL_MODEL_PASS /
CRM_READONLY_PASS /
WEKNORA_READONLY_PASS /
CRM_GSV_STRUCTURAL_PASS /
CRM_WRITE_NOT_RUN
```

本轮没有代码修改，也没有改变 live 4328、主仓 profile/journal 或发布门禁。
