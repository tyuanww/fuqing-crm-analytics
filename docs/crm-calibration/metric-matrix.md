# 指标—公式—来源—缺口—验收矩阵

工作树现为 `codex/crm-analysis-board`（由 `codex/crm-metrics-closeout` 并入），公开主线 `64eb6e06` / v0.13.0.0，本分支候选 v0.14.0.0。不重做已上线 AOV/AUS 公式。真实归档只读元数据探针（DuckDB 1.5.3，512MB，未改写 131GB 文件）见本文件来源列。金额不入库。

验收分类：

- **A**：已实现且真实验收通过（可注明窗口范围）
- **B**：已实现，仅合成验证通过
- **C**：来源阻塞，列出最小字段、来源系统与解锁条件

| 指标 | 公式 | 来源 | 缺口 | 验收 |
|---|---|---|---|---|
| 看板 GSV | 支付日 `actual_amount`，排除购物金、交易关闭、`is_refund=TRUE`，再应用渠道/低价 | 现认证 `overview`/`trend`/`dashboard-purchases`；`orders` 字段齐全，`pay_time`/`channel` 有索引 | 水位、退款截止日未知 | **A** 短窗口基准闭合；本轮 10 组窗口/渠道只读复算与独立 SUM 一致（含 7/1–7/5 全店、7 日、7 月、跨期、货架/达播/直播/淘客/纯派样、剔除低价）。未知订单/买家为 0。归档未改写 |
| AOV | 看板 GSV ÷ 同范围正额有效订单 | 已上线 `GET /api/v1/metrics/dashboard-purchases` | 本人 UAT / 现役 HTTP 本轮未登录 | **A** 同上 10 组；不使用明细行均值 |
| AUS | 看板 GSV ÷ 同范围正额订单对应去重买家 | 同上；未知订单/买家单列 | 跨系统身份未证明 | **A** 同上 10 组；不以新客+老客代替 |
| 会员溢价 | 成交时会员 AUS ÷ 非会员 AUS | 合成 `crm-metrics/v1` 与新 `dashboard-membership`（需 `membership_at_purchase`） | 真实仅 `orders.is_member`、`membership_mark(order_id,is_member,loaded_at)` | **C** 真实；**B** 合成。解锁：成交时快照或入会/退会事件 |
| 净额 GSV | 窗口有效实付 − 截止日前成功退款 | 合成 `sales_window_summary`；新 `dashboard-net-gsv` 需退款事件表 | 真实无 `refunds` 事件；行上 `refund_amount`/`is_refund` 不能代替 | **C** 真实；**B** 合成。解锁：`refund_id,order_id,refunded_at,amount_minor,status=SUCCEEDED` 及父子归属 |
| 新老客 | 全店首次有效购买相对窗口起点，可按 `refund_as_of` 重算 | 合成销售查询 | `user_first_purchase.first_pay_date` 不能按退款截止重算 | **C** 真实；**B** 合成 |
| 复购 | 期初老客窗口内再次有效购买 | 合成 `existing_customer_repurchase` | 真实历史覆盖与商品退款归属 | **C** 真实；**B** 合成 |
| LTV | 新客首购起 N 日累计净消费，含首单，区分成熟 | 合成 `ltv_new_customer_n_day` | 同新老客 + 观察期水位 | **C** 真实；**B** 合成 |
| 派样收入表现 | 本期每人首次派样起自然日窗口内其他有效订单收入；未成熟单列 | 合成 `sample_followup` | 资格未核。真实有 `sample_received_at` 仍不能代替资格 | **C** 真实；**B** 合成。名称不是利润 ROI |
| 派样利润 ROI | 复购毛利 / 成本 | 无成本表 | `campaign_schedule` 无样品/媒体成本 | **C** 保持不可用 |

有界真实复算（DuckDB 1.5.3 只读，2 线程 / 2GB，未复制归档）：10 组窗口均与独立 `SUM(actual_amount)` 一致，短窗口基准金额闭合，未知订单/买家/异常金额均为 0，归档大小与 mtime 未变。现役 18093 HTTP 登录本轮失败，不作为模型查询证据。金额仅留在工作树 `.context/checks/metric-closeout-real/`，不进 Git。

新接口（认证、合同、调用方类型、工具展示；导出为认证 JSON）：

- `GET /api/v1/metrics/dashboard-readiness`
- `GET /api/v1/metrics/dashboard-membership`
- `GET /api/v1/metrics/dashboard-net-gsv?refund_as_of=`

模型工具不接受 SQL、路径或凭据。看板 GSV 与净额 GSV 分列，禁止对看板结果再扣退款。
