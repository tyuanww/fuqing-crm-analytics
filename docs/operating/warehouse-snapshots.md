# 仓库聚合快照接口

此接口是后端候选。[私有来源服务](native-warehouse-source.md)已支持新快照读取；CRM 作者调用方及画布各板块投影尚未接通，不能据此宣称聊天到看板已验收。

`POST /api/v1/metrics/warehouse-snapshots` 创建当前账号的不可变聚合快照。请求包含 `family` 和 `filters`，并提供 `Idempotency-Key`。支持 `purchases`、`product`、`analysis`、`r`、`f`、`m`。接口只在已验证来源模式中创建，不接受客户端的结果、数据类别、版本或 SQL。

购买分母与商品使用明确日期，最多 90 天。商品支持映射商品列表及可选比较期；购买分母保持原有 GSV、订单、买家、AOV、AUS 范围。RFM 筛选用 `window.kind=dates` 指定起止日期，或用 `window.kind=period` 指定固定周期。固定周期保留原比较期和第三期，不能换成自由日期计算。完整字段由 OpenAPI 的 `WarehouseSnapshotRequest` 定义。

商品与 RFM 创建只读取已验证聚合缓存；未热返回明确 miss，所需日期超出来源范围则返回覆盖不足，不保存零值快照。购买分母沿用已登记的有界订单聚合。新快照带 `crm_w_` 标识、`crm-warehouse-result-snapshot/v1` 版本、实际各期日期、来源身份、数据与计算版本及结果摘要。类别取自已绑定来源；与存储类别不一致即拒绝。

每个 HTTP 请求固定一次业务日期。命名周期的解析、查询与回执共用该日期。幂等摘要包含来源、语义、规范筛选和实际日期；数据或日期变化后复用同一 key 返回冲突。相同请求重试返回同一快照。快照与回执在一个 SQLite 事务中提交，计算在写事务外执行。

`GET /api/v1/metrics/warehouse-snapshots/{snapshot_id}` 按当前账号读取历史快照。历史保留原始来源，不改标为当前仓库；读取历史不要求原 DuckDB 仍处于打开状态。其他账号不可读取。快照内容、存储摘要或回执指向不一致时返回不可用，不现场重算掩盖损坏。

存储位于私有状态根目录的 `snapshots/warehouse_snapshots.sqlite3`，每个账号最多 2,000 个快照。快照摘要绑定命名空间、owner、标识和完整内容；回执另绑定 key、请求摘要和目标，并核对目标的实际查询。存储与可失效的计算缓存分开，也不迁移旧 CRM 分析库、分享或组板。旧 `crm_s_` 模型、序列化及哈希保持原样。

`python -m pytest backend/tests/test_warehouse_snapshot.py` 覆盖真实合成 SQL、六个板块、缺覆盖与 miss、不伪标类别、来源变化、固定周期日期、跨账号、并发回执、损坏和新进程落盘读取。真实模型、浏览器、原生授权与页面编辑验收仍需分别完成。
