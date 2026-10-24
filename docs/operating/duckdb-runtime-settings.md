# DuckDB 运行时资源配置

CRM 的连接配置由 `backend/services/dual_conn.py` 的 `configure_connection()` 维护。启动校验、业务读池、业务写单例、缓存单例和独立 RFM 连接均在首次查询前应用配置。初始化失败时关闭新连接，不发布到池或单例。

## 内存和线程

- `DUCKDB_MEMORY_LIMIT` 设置默认内存预算。未设置时由 `backend/resource_budget.py` 按可用资源决定。
- `FQ_READ_MEMORY_LIMIT` 可覆盖业务连接预算，包含启动校验。
- `FQ_CACHE_MEMORY_LIMIT` 单独控制缓存库预算。
- `DUCKDB_THREADS` 为正整数，未设置时使用资源预算模块的默认值。

配置通过运行时 `SET` 应用，不加入 DuckDB 的文件连接指纹。同文件的普通连接仍可使用相同读写模式打开。内存预算不是进程 RSS 硬限制。

## 临时磁盘

| 环境变量 | 默认值 | 合同 |
| --- | --- | --- |
| `FQ_DUCKDB_TEMP_ROOT` | 未设置 | 配置时必须为绝对路径。目录创建或设置失败时拒绝连接，不回退到业务库旁。 |
| `FQ_DUCKDB_TEMP_LIMIT` | `4GiB` | 正整数及容量单位，支持 B、KB 至 TB、KiB 至 TiB，大小写不限。不接受零、负数或 unlimited。 |

配置根目录后，业务库使用 `<root>/<pid>/business`，缓存库使用 `<root>/<pid>/cache`。两者是不同数据库文件，分别使用自己的内存和临时磁盘预算。上限是每个数据库实例的上限，不是整个进程或目录的总配额。

连接池全部关闭后，新连接重新应用配置。同进程同数据库的 sibling 连接保留相同目录，已有 spill 时不重复切换目录。

未设置 `FQ_DUCKDB_TEMP_ROOT` 时，继续使用 DuckDB 的默认临时目录和磁盘设置。只读挂载业务库的部署需要显式配置可写的隔离根目录，并另设进程和磁盘资源限制。不要给业务库目录增加写权限。

## 验证范围

`backend/tests/test_analytics_resource_budget.py` 使用小型合成 DuckDB，覆盖真实 spill、sibling 兼容、清池后重连，以及目录、SET 和 ATTACH 初始化失败后的连接与许可释放。`backend/tests/test_startup_validation.py` 检查启动 COUNT 和 MAX 查询前的实际配置。

这些回归不证明杭州候选已启动，不证明真实 RFM 全量预热或近两年筛选覆盖。现场验收与生产切换仍是独立步骤。
