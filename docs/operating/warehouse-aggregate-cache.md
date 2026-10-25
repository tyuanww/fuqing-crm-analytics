# 已验证来源的聚合缓存

`WarehouseRuntime` 将一个存活的 `VerifiedWarehouseSource`、独立的 `AggregateCache` 和语义摘要绑定到请求。当前支持商品新老客，尚未接入默认应用启动。RFM 两层缓存、真实大库跑数和浏览器验收尚未完成。

## 读取模式

`runtime.read(mode="compute")` 供显式离线计算使用。`runtime.async_read()` 固定使用 `cache_only`，限制并发和等待时间。`QueryRouterMiddleware` 在应用的 `state.warehouse_runtime` 存在时使用该实例，不打开旧连接池。未设置该实例时继续使用原路径。

请求的 `RequestConnection` 同时携带原生只读游标和 `WarehouseReadFrame`。商品及品类的数据版本读取该 frame 的身份，连接不匹配则拒绝。业务函数的 `close()` 不关闭请求游标，来源 owner 在最后一个读者退出后释放。取消请求须等待后台查询实际结束，连续取消也不能提前释放游标。

## 商品结果

持久键包含来源 revision、商品 SQL 与映射依赖摘要、明确的当前期、比较期、指标、渠道和排除列表。离线请求一次保存全部映射商品。合法单品和多商品请求按调用方顺序读取子集，共用同一物化结果。不同来源、代码或日期不共用结果。

覆盖不足沿用 `INSUFFICIENT_COVERAGE` 和空商品列表，不写入零值缓存。完整窗口未预热时，HTTP 返回 `503`，`X-Aggregate-Cache-Status` 为 `miss`。来源或缓存不可用时返回 `503` 和 `unavailable`。这两种失败都不触发现场商品聚合。

## 独立持久存储

`AggregateCache` 使用现有私有目录中的独立 SQLite 文件，目录权限为 `0700`，文件权限为 `0600`。存储使用 WAL，读取和写入各自关闭连接，不持有业务 DuckDB 的写锁。

每行包含完整键描述、规范 JSON 结果及其 SHA-256。读取校验键和载荷摘要。相同键重复写入相同结果可重试，不同结果触发冲突。写入在一个事务中提交，进程在提交前退出保留上一结果。未知数据库、公开文件、软链接和损坏结果被拒绝。

当前合成验证覆盖真实 SQL、HTTP 单品与批量调用、新来源重开、等额分类修正失效、持久回读、并发写入和进程中断。它不证明真实数据热集已经生成，也不承诺未预热筛选的响应速度。

对应命令为 `python -m pytest backend/tests/test_warehouse_cache.py backend/tests/test_warehouse_product_runtime.py backend/tests/test_query_router_event_loop.py`。
