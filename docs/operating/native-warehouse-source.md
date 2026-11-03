# 原生仓库快照来源

私有来源服务支持旧 `crm_s_` 快照及新 `crm_w_` 仓库快照。新结果读取复用当前账号、原生会话、连接代次、期限和撤权检查。ID、schema、类别与引用投影必须对应；读取失败不搜索另一存储。

`run_native_snapshot_source.py` 的 `--crm-state-dir` 指向已有旧分析库，`--warehouse-snapshot-dir` 指向已有仓库快照目录。至少指定一项。两项均配置时使用显式目录分派，类别须一致；仅配置仓库目录时不打开或初始化旧库。来源服务不创建业务快照，也不执行 DuckDB 查询。

旧引用保持 `crm-snapshot/v1` 投影，已有内容和摘要不变。新引用使用 `crm-warehouse-snapshot/v1`。来源状态 SQLite 沿用原结构，按引用保存投影版本。旧代码不能读取新类型，回退不将新引用转换成旧类型。

旧私有读取仍返回 `ref_id` 与 `snapshot`。新读取返回 `native-warehouse-snapshot-read/v1`，包含 `ref_id`、`snapshot_id`、`data_kind`、`result_sha256`、`snapshot_json` 与 `snapshot_json_sha256`。

| 字段 | 含义 |
| --- | --- |
| `snapshot_json` | 完整快照 JSON 的不透明字符串，UTF-8 最多 256 KiB。中间层按字符串转发，不解析后重编码。 |
| `snapshot_json_sha256` | 上述 UTF-8 字节的 SHA-256，用于验证传输是否保留原文。 |
| `result_sha256` | 仓库快照内规范化结果的摘要，由权威存储及原生引用核验。它与字节摘要用途不同。 |

此格式保留浮点表示及超出 JavaScript 安全整数范围的整数。消费者仍需核对当前引用、身份和结果摘要，再按仓库快照类型解析；字节摘要不能代替授权。

Python 来源服务与合成 host 已支持新格式。CRM 作者插件和 Workbench 消费者尚未适配，完整聊天、生成、编辑和重开仍未验收。

`python -m pytest backend/tests/test_warehouse_native_source.py` 覆盖六类新快照、旧引用不变、显式存储分派、类别错配、跨账号与代次、撤权、投影错标及私有读取。JavaScript 传输用例调用真实 Node；无 Node 时明确跳过，不计作已验证。
