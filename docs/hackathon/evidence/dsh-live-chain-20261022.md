# DSH 真实问数与页面链路复核

日期：2026-10-22（北京时间）。

## 结论

新会话知识库问答、HTML 页面生成、驾驶舱保存和真实文本编辑已经通过实际 UI 与
SQLite revision 联合验证。页面不是静态预览：版本 2 在刷新后仍可从页面库恢复。

CRM 数据链路也已完成真实 UI 联调：问数智能体取得看板 GSV 快照、全部 15 个商品的
新老客结果和 RFM 9 分群，并生成保存为版本 2 的真实数据驾驶舱。

## 已通过

| 环节 | 实测结果 |
|---|---|
| 新会话知识库 | 问数智能体检索 WeKnora，返回 3 个引用文档 |
| HTML 生成 | `page-gen-growth-board-live-20261022-r1`，`PACKAGE_RECEIVED` |
| 商品新老客 | 15 个商品，当前期与对比期 coverage 均为 `COMPLETE` |
| 任意单品复核 | `爆款面膜F` 单商品查询与全商品表中的当期/对比期指标逐项一致 |
| RFM | 9 个分群，杭州真实预计算缓存 |
| GSV 快照 | `[REDACTED_REAL_SNAPSHOT_ID]` |
| RFM 快照 | `[REDACTED_REAL_SNAPSHOT_ID]` |
| 驾驶舱保存 | `[REDACTED_REAL_PAGE_ID]`，版本 2 |
| 真实编辑 | 执行摘要建议改为“建议（已复核）”文案 |
| 持久化 | 页面显示、版本历史和 SQLite `PATCH` revision 一致 |
| 预设 roster | `crm-query` 返回名称“问数智能体”，无 `broken` |
| CRM 账号认证 | `admin` 账号级校验通过 |
| 服务 | DSH `active`，CRM `18093=200`，前端 `18094=200` |

## 修复

- page-tool 发布精确的 `node_map` 字段：`node_id`、`kind`、`selector`。
- `kind` 枚举为 `static_element`、`dynamic_region`、`whole_page`。
- 资源结构明确为 `resource_id`、`content_type`、`sha256`、`byte_length`。
- 移除 DSH 工具 DSL 不支持的 `pattern` 和 `minimum`，改用字段描述。
- 校验失败时直接返回合法字段和枚举值，模型可按拒绝原因修复。
- CRM 授权不再因为会话暂时不活跃而删除；查询仍要求当前会话活跃。
- 省略商品过滤时不再输出 `products: undefined`，商品结果通过 DSH 无损 JSON 校验。

## 运行身份

- Workbench `page-tools.js`：`0a5e031ba5e5b7f8570e13a10f3aac0c0697c36b228210d60a46b3b33b934ba7`
- CRM `host.js`：`7abd766babc90f1f2ab5e7399ba799e5c1406c73572d749119e1c0c1ea454570`
- 页面：`[REDACTED_REAL_PAGE_ID]`
- 收件箱 artifact：`artifact_63904bd466d34293b1c02ee890a14d0b`，状态 `SAVED`
- 页面 head：版本 2

## 审计观察

- 商品查询没有独立 snapshot_id，页面明确将其标为“仅工具结果”；不能与 GSV 或 RFM
  快照混算。
- 单品查询返回 1 个商品；金额、用户数及新老客人数已与全商品结果逐项复核，具体真实数值不写入公开仓库。
- 净额 GSV、退款截止日、新客 30 日回购基线仍不可用，页面将其列为决策验证缺口。
- 页面目前显示 `UNBOUND_SAMPLE`，真实数字已写入源码包并保持只读，但尚未建立
  result_ref 级绑定 manifest。

## 待完成

- Vue 页面登录后的商品新老客交互 UAT。
- 商品结果到 `result_ref` 的显式绑定 manifest。
- 页面候选确认偶发出现“保存待核对”；本轮页面和编辑版本均已由 SQLite 证明保存成功，但回执对账仍需复核。
