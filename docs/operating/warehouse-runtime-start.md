# 启动已验证来源的隔离实例

本流程启动独立后端，不切换现役实例。先准备新的私有状态目录和端口，再设置三个字段。本文不提供真实账号、密码或模型凭据。

```sh
mkdir -m 700 /absolute/path/to/warehouse-state
export FQ_WAREHOUSE_STATE_DIR=/absolute/path/to/warehouse-state
export FQ_WAREHOUSE_SOURCE_ID=registered-source
export FQ_WAREHOUSE_DATA_KIND=synthetic
```

`FQ_WAREHOUSE_DATA_KIND` 使用已登记来源的 `real` 或 `synthetic`。不要从文件名、行数或 HTTP 登录状态推断数据类别。使用原有配置指定 `DUCKDB_PATH`、内存、线程和 spill 预算。按已有入口启动后端并保留 lifespan。配置来源只读，状态及缓存路径使用新目录。

三个字段任一出现即请求新模式。缺字段、空字段或非法值会阻止启动。冷阶段重新验证内容身份，不从旧回执或修改时间恢复。第一次封存可能产生排序 spill，启动预算须包含该成本。

新模式不能与 `FQ_LOCAL_DEMO_NO_LOGIN=1` 混用。独立连接 helper 不打开旧库或提高 owner 的内存预算。认证、会话心跳和通知控制面不依赖业务来源就绪。跨域预检由现有 CORS 校验，实际查询仍执行来源门禁。

已登记查询为商品新老客、八象限及 R/F/M、GSV 概览与趋势、购买分母、仓库截止日，以及 `daily-gsv` 和 `daily-gsv-multi-period` 两个日序列 POST。其余旧看板接口返回 `UNSUPPORTED_OPERATION`，避免读到未登记来源的文件缓存或派生表。新模式也拒绝 Mission 和旧快照创建接口；两者尚未适配仓库来源身份。历史快照仍保留原始身份，读取历史不代表来自当前仓库。完整前端尚未迁移或验收。

启动成功后，应用发布同一 `WarehouseRuntime`。HTTP 商品与 RFM 查询只读其持久聚合缓存。启动阶段不运行旧缓存建表、manifest invalidation 或后台 best-effort 预热。缓存尚未预热时，查询返回明确 miss。已有代码和合成验收不代表真实数据已经跑完。

关闭实例时，只释放本次来源、内存监控和认证维护任务。来源对象保留 `CLOSED` 状态，后续读取返回不可用。取消冷启动会等待本次 worker 完成，并释放其连接和目录锁。同一状态目录拒绝第二个存活 owner。

未运行 lifespan或来源尚未就绪时，已请求的新模式返回 `503`，不回落旧连接池。认证和健康控制面仍可独立响应。三个字段均未配置时沿用原启动路径。

先用 `python -m pytest backend/tests/test_warehouse_boot.py backend/tests/test_auth_evictor_lifespan.py` 检查启动、关闭、失败及取消。真实来源的封存资源、缓存覆盖与浏览器业务链另行验收。
