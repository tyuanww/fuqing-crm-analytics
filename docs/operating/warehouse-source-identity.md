# 业务来源内容身份

`backend/services/warehouse_source.py` 提供后端内部来源 lease。它目前是独立基础组件，尚未替换商品、品类或 RFM 查询中的旧数据版本。

## 封存与内容 revision

`VerifiedWarehouseSource.seal()` 接收 `WarehouseSourceSpec`、已有私有状态目录和创建自有原生只读连接的 `connect`。调用方负责连接的内存、线程和 spill 预算，封存器取得该连接的生命周期所有权。

当前范围为单个只读物理 DuckDB 的 `orders` 和 `user_first_purchase` 实表，支持文本、布尔、整数、Decimal、日期和时间戳列。浮点、JSON、嵌套类型、生成列、非二进制默认排序规则、视图、多库 attachment、错误路径和可写连接被拒绝。普通列默认值和列级排序规则纳入表定义摘要。状态目录只允许一个存活 owner，POSIX 文件锁在进程退出后释放。当前支持 macOS 和 Linux，包括 WSL2。

内容摘要包含依赖 schema、表定义、排序后的逐行 SHA-256、重复行数、来源名、数据类别、时区、编码协议和 DuckDB 版本。支持类型的行编码使用固定版本的 DuckDB JSON，摘要保留 NULL、字段关联和金额类型。行重排不改变内容 revision，同额分类或首购修正会改变 revision。它不使用 max、count、sum 或文件修改时间代替内容身份。

封存只通过原生游标分批读取摘要。大表排序仍会消耗 CPU、内存和可能的 spill，不能把该操作当作热请求。`WarehouseSourceSpec.data_kind` 是调用方登记的信息，封存器不推断数据是生产还是合成。

## 读取与关闭

`source.pin()` 返回 `PinnedWarehouseRead`，其中连接与身份来自同一存活来源。它从 owner 的原生连接创建自有只读游标，不重新按路径打开未验证的来源。文件绑定只用于检测路径替换，不构成内容证明。

来源状态依次为 `READY`、`CLOSING`、`CLOSED`。`close()` 拒绝新增读者，已有读者退出后释放底层连接和目录锁。路径替换使来源失效，后续读取需要重新封存。

`warehouse-source.json` 是使用 fsync 和原子替换写入的封存回执。它不是存活 lease，不能仅凭旧文件恢复 `READY`。重新封存会重新计算内容身份。同内容可以得到相同 revision，但 `source_epoch` 随 owner 更新。

## 业务迁移边界

内容身份不能证明首购历史完整、派生表新鲜或用户获授权。RFM 无 lineage 的预计算表不能自动继承新 revision。商品持久缓存、RFM 两层缓存、快照类型及页面来源绑定仍需各自迁移和验收。

本单元仅完成合成小库验证。真实大库封存、缓存集成和业务 UAT 尚未执行。
