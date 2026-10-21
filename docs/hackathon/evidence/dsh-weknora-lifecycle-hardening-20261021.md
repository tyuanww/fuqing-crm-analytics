# DSH 问数工具面与 WeKnora 生命周期强化复测

日期：2026-10-21（北京时间）。

## 结论

杭州 owner-operated v5 现场已更新 WeKnora 适配层和 scope helper。`shinemage-dsh.service` 为 `active/running`，`NRestarts=0`，4328、18090–18094、18098 均按预期监听，启动日志错误匹配为 `0`。query 包仍为 `0.0.0-query.11`，插件页 `2/2` 组件运行中。

本次修复保留原来的项目库 allowlist，并增加三项生命周期保护：

- `weknora_read_document` 在读取前后各核对一次文档元数据；请求期间文档发生跨库变更时丢弃结果并返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。
- 两个 WeKnora 工具注册进入 `ctx.effect`，插件卸载时逆序释放注册。
- 第二个工具注册失败时，同一 effect 中已经注册的工具会立即逆序清理；注册与清理都失败时保留聚合错误。

机器回执见 [JSON](dsh-weknora-lifecycle-hardening-20261021.json)。本次事务清理前的 helper 与 overlay 保存在 `/srv/shinemage/dsh/recovery/weknora-registration-cleanup-20261021/`。硬刷新后插件页显示 `0.0.0-query.11`，`2/2` 组件运行中。

字节演进顺序是明确的：query.11 初始现场为 helper `7e49863d…` / overlay `bb6a9215…`；随后读取后校验与 effect 释放版为 `4c94a4fd…` / `d542e6bf…`；最终事务注册清理版为 `e060ecd5…` / `8d544df2…`。审计 manifest 随后仅刷新 scope 标签与观测时间到 `8ef9c40c…`，adapter 和 helper 字节不变，也没有重启服务。各段分别有 query.11 初始回执、`weknora-scope-hardening-20261021` 和 `weknora-registration-cleanup-20261021` 恢复目录，不是同一快照的冲突值。

## 线上字节

| 文件 | 变更前 SHA-256 | 变更后 SHA-256 |
|---|---|---|
| `weknora.mjs` | `1c2e223d…f976e2` | `fc928415…b4ee8` |
| `weknora-production-scope.mjs` | `4c94a4fd…381fe` | `e060ecd5…d663` |
| `weknora-production-overlay.v1.json` | `d542e6bf…4489` | `8ef9c40c…73a7` |

live 模块探针使用线上 adapter、helper 和 `retrieve.key`，没有输出 token 或文档正文。

## 工具面与模型路由

真实浏览器会话 `session-1605afec-9e3b-432e-b05a-219ea5bd0a85` 的持久化请求头记录：

- 预设：`crm-query`
- provider/model/reasoning：`deepseek-account / deepseek-flash / off`
- 页面显示：`DeepSeek-V4.1-Flash / Off`
- `bash`、`terminal_open`、`read`、`write` 不在 schema。
- `weknora_search`、`weknora_read_document`、`free_html_page_generate` 可见。
- `list_agents` 仍由上层组合出现在 schema；实际调用返回 `CRM_QUERY_TOOL_NOT_ALLOWED: list_agents`，说明执行 guard 生效。

保留 `list_agents` 可见是当前 DSH scoped-tool 组合的限制。宿主不能用 allowlist 安全移除所有继承工具，因为 query.10 的 all-tools restriction 同时移除了 CRM、WeKnora 和页面业务工具；因此 query.11 采用“已知继承工具 masking + 12 工具执行 allowlist”。

## WeKnora 正向与负向探针

- 项目资料库搜索：浏览器在“问数智能体”中真实调用一次 `weknora_search`，返回 8 条 passage，范围仅为 `1c4627e2-dfc1-48ca-aeef-2c00b53da5f8`；回答明确区分教材定义/案例模拟数据与真实经营数据。
- 项目资料文档读取：PASS。
- 部署验收库搜索：`WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。
- 跨库文档读取：读取正文前返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`，没有返回正文。
- 工具生命周期：探针卸载后注册表为 `0`。
- 工具注册事务：线上 helper 的第二个注册抛错后，第一个已注册工具被清理，探针返回 `WEKNORA_TRANSACTIONAL_CLEANUP_PASS`。
- tenant-wide 文档名查询 `/api/v1/knowledge/search`：网络路径中不存在。

实际网络路径只出现项目库 passage 搜索、项目文档元数据、项目 chunk 读取，以及跨库读取前的元数据核对。

## WeKnora 配置盘点

三个知识库保持隔离：

| 知识库 | 文档 | ready chunk | active embedding | graph | 状态 |
|---|---:|---:|---:|---|---|
| 项目资料 | 7 | 385 | 385 | 开启 | 全部 completed/enabled |
| 部署验收（合成资料） | 3 | 3 | 3 | 关闭 | 全部 completed/enabled |
| 权限隔离验收（空库） | 0 | 0 | 0 | 关闭 | 空库 |

三库均无待处理子任务或错误。embedding 全部为 `bge-m3:567m` / 1024 维；KnowledgeQA 与 Rerank 均指向 `MiniMax-M3`。项目资料使用 800/100 分块和本地存储。Neo4j 合计 1656 节点、1519 条关系。

容器 `WeKnora-app`、`WeKnora-docreader`、`WeKnora-postgres` 为 healthy；Redis、Neo4j 和前端容器运行中。active resource 共 194 个，其中 185 个 page PNG（约 43.6 MB）和 9 个源文件；本轮只盘点，没有删除或重分类这些资源。共享、组织、数据源和标签计数均为 `0`。

### 服务端检索 Key 范围

`DSH 本机只读检索`（`tenant_api_keys.id=1`、tenant `10000`）仍使用 tenant scope，但服务端 `knowledge_base_ids` 已从项目库与部署验收库收窄为仅项目库。`capabilities` 继续只有 `retrieve`，`full_access=false`，本次更新没有改变 `api_key`、`key_hash`、token 或服务进程。

2026-10-21 09:46:22Z 在一个 SQL 事务内执行受限更新；更新条件同时校验 key id、tenant、name、scope、capability、未撤销状态和原两库集合。配置保留在 `/srv/shinemage/dsh/recovery/weknora-retrieval-key-scope-20261021/`：

- `api-key-1-before.raw` / `.tsv`：原两库元数据快照，SHA-256 分别为 `9a658ecd…4e3d` / `619b6e09…56`。
- `api-key-1-after.raw` / `.tsv`：单项目库元数据快照，SHA-256 分别为 `13726db9…15d` / `7180faee…9a`。
- `receipt.json`：只含非秘密元数据、更新条件和回滚目录，SHA-256 `74751cf8…d7`，文件和目录权限均为 owner-only。

服务端权限复测使用同一 token，不输出 token 或正文：

- 项目库 `/api/v1/knowledge-search`：HTTP `200`，返回 3 条结果。
- 部署验收库同一搜索：HTTP `403`，`API key scope does not allow one or more knowledge bases`。
- 项目库文档元数据：HTTP `200`，`knowledge_base_id` 为项目库。
- 部署验收库文档元数据：HTTP `403`，未返回文档正文。

服务端拒绝跨库元数据时，live adapter 在该前置检查处以 `WEKNORA_DOCUMENT_SCOPE_CHECK_FAILED` fail-closed，不会进入正文读取；这与允许元数据后再由 adapter 比较知识库 ID 的历史 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED` 结果不同，当前应以服务端 `403` 和 fail-closed 为准。

回滚时从 `api-key-1-before.tsv` 恢复两个知识库 ID，不需要轮换 token。回滚后 adapter 的项目库 fail-closed allowlist 仍独立生效。

### Postgres 检索引擎显式配置

Workspace `hutou's Workspace`（tenant `10000`）原先的 `retriever_engines` 为 `{"engines":[]}`，运行依赖 `RETRIEVE_DRIVER=postgres` 的隐式默认。2026-10-21 已把租户配置显式固定为以下两条路径，不重启 DSH 或 WeKnora：

```json
{
  "engines": [
    {"retriever_type": "keywords", "retriever_engine_type": "postgres"},
    {"retriever_type": "vector", "retriever_engine_type": "postgres"}
  ]
}
```

三个知识库的 `vector_store_id` 继续为 `NULL`。这是 Postgres env-store 的正确合同：Postgres 和 SQLite 只能通过 `RETRIEVE_DRIVER` 的 env store 使用，不允许注册成 DB-managed VectorStore；`vector_store_id` 在 KB 创建后也不可变。因此当前单机 ParadeDB 部署没有安全、可操作的 per-KB store 需要创建。

配置前、后租户行保存在 `/srv/shinemage/dsh/recovery/weknora-retriever-config-20261021/`，SHA-256 分别为 `2fc7196e57bf808edefb822cd770f8e6eec24ff985a18f6df1c07104d0d9a087` 和 `36502e1b218903e62c2dcec29eba97d70ef7d8e79fc7ce714b032d39e3990392`。恢复时把该 tenant 的 `retriever_engines` 写回 `{"engines":[]}` 即可，不涉及向量数据迁移。

配置后验证：

- production scope wrapper 项目库搜索返回 3 条 passage，范围为 `1c4627e2-dfc1-48ca-aeef-2c00b53da5f8`。
- 显式搜索部署验收库返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。
- 直接调用 WeKnora `/api/v1/knowledge-search` 返回 HTTP `200`，命中仅来自项目库。
- `shinemage-dsh.service` 与 WeKnora 容器保持运行，没有因本配置重启。

## 测试

- `node --test scripts/ops/weknora-production-scope.test.mjs dsh-plugins/query-agent/test/package.test.mjs`：`30/30 PASS`
- `node --test scripts/release/plugin-pack.test.mjs`：`45/45 PASS`
- `node --test scripts/ci/pregate-runner.test.mjs`：`6/6 PASS`，另 `bash -n scripts/ci/pregate-runner.sh` 通过

新增回归覆盖：

- 读取期间 scope 变化后结果被丢弃
- WeKnora 工具 effect 释放和逆序注销
- 第二个工具注册失败时清理已注册工具
- pre-gate 不在 Git 仓库时明确失败
- overlapping `files` wildcard 去重
- 配置 bundle 的拼接动态 import 被拒绝

## 收口验证

以下结果对应 query.11、WeKnora scope 与打包修复合并后的代码树；命令和日志摘要用于区分真实执行、历史回执和未运行项。

| 检查 | 命令 | 结果 | 证据 |
|---|---|---|---|
| 完整 backend | `.context/checks/service-runtime-py314-20261021/bin/python -m pytest -q backend/tests` | `exit 0`；`3286 passed / 85 skipped / 0 failed / 6 warnings`，1811.3 秒 | `full-backend-r2`，日志 SHA-256 `6be369bc6cd7b3c8b78a5f389fb156b94c16ea7968d45ce4ca9ea0fff956029c` |
| 固定输入 B0 r8（历史） | `node scripts/dsh-b0/pipeline.mjs --check --python /Users/hutou/homebrew/bin/python3.14` | `exit 0`；Python `862 passed`、41 subtests passed、23 warnings；Node 主组 `555 passed / 4 skipped / 0 failed`，其余组无失败 | `full-b0-r8`，HEAD `bad09decfeb6`，日志 SHA-256 `5a47d4a2c9d114fd53d9b21bda263f9492f9fcb3add96035f802d20be73fe0e9` |
| 固定输入 B0 r10（当前） | `node scripts/dsh-b0/pipeline.mjs --check --python /Users/hutou/homebrew/bin/python3.14` | `exit 0`；Python `862 passed`、41 subtests passed、23 warnings；Node 主组 `586 passed / 4 skipped / 0 failed`，其余组无失败 | `full-b0-r10`，HEAD `fff0dc5f` 加本轮待提交候选树，526.5 秒，日志 SHA-256 `94db0842eaac5091ac26fc4e33a61e6bca5f308eedb5d56e58ad1cc161f5a5c1` |
| 定向 Node 回归 | `node --test --test-concurrency=1 scripts/ops/weknora-production-scope.test.mjs dsh-plugins/query-agent/test/package.test.mjs scripts/release/plugin-pack.test.mjs scripts/ci/pregate-runner.test.mjs` | `81 passed / 0 failed / 0 skipped` | query + WeKnora `30/30`、plugin-pack `45/45`、pregate runner `6/6` |
| Git/产物检查 | `git diff --check`、`jq empty`、`bash -n`、`node --check` | 全部 `exit 0` | 本回执提交前的最终工作树 |

完整 backend 的实际执行提交为 `fa618859`；之后到当前候选树的差异只涉及 `.gstack/`、文档、Node release/profile 测试、发布工具与 runtime provenance，没有改变 `backend/` 或 Python 服务源码，因此没有把后端结果重标为新的 Python 字节。完整 B0 r8 在 `bad09dec` 上重跑并覆盖新增证据漂移守卫及 IM 归档路径回归；r9 的唯一失败为固定 Workbench 几何测试的 15 秒子进程超时，同一测试在独占运行中先以 411ms 单独通过，r10 又以 82ms 通过，未修改超时。r10 在 `fff0dc5f` 加本轮待提交候选树上覆盖 query/WeKnora 与 pre-gate 新增用例、IM 归档同一句柄读取和动态模块加载守卫。opt-in、NOT_RUN 和按原因跳过的项继续保留，不计作通过。

## 未完成

- CRM 当前对话尚未登录，真实只读经营指标 UAT 仍为 `NOT_CONNECTED`。
- 这不是正式签名 release、canary 或杭州正式切换；`release_ready=false`。
- page PNG 资源是否仍有外部页面引用未在本轮回执中证明，因此没有清理。
