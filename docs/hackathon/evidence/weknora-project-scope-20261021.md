# WeKnora 生产检索范围收窄

日期：2026-10-21（北京时间）。

> 本页保留范围收窄和后续强制 allowlist 修复的历史过程；最终读取后校验、工具 effect 事务释放和线上字节以[生命周期强化回执](dsh-weknora-lifecycle-hardening-20261021.md)为准。

## 范围

本轮只收窄 DSH 的 WeKnora 检索范围，不改 WeKnora 文档、分块、向量、图谱、共享权限或 Neo4j 数据。目标是把生产 DSH 检索限定到“项目资料”库，同时保留 WeKnora 页面中的“部署验收（合成资料）”供独立验收。

## 改动前

- 适配层：`/srv/shinemage/dsh/current/inputs/page/brand-weknora/weknora.mjs`
- SHA-256：`1a327dfa0fbb9016830c7556f713f30d1b36358a772a7529092bdbadef816a76`
- 关键配置：同时检索项目资料 `1c4627e2-dfc1-48ca-aeef-2c00b53da5f8` 和部署验收 `9a4ea853-9466-4d27-8d4e-d8e8bd5a8018`
- 旧会话：`session-6b406f67-3692-4bc6-a9a8-372fa5ed45de`
- 旧工具结果：`8 passage(s) ... (searched: 1c4627e2..., 9a4ea853...)`
- 远端回滚副本：`/srv/shinemage/dsh/recovery/weknora-retrieval-scope-20261021/weknora.mjs.before`，权限 `0600 root:root`

## 改动后

- `knowledgeBaseIds` 只保留项目资料 `1c4627e2-dfc1-48ca-aeef-2c00b53da5f8`
- 部署验收库继续存在于 WeKnora，但不再进入 DSH 检索
- SHA-256：`ca563e88a3eabe574787ed2b7afe013afcd88b0b89f9ca712bd8bbb35e3a594e`
- 权限：`0600 root:root`

## 验证

- 受控重启后 `shinemage-dsh.service` 与 `shinemage-dsh-promo-enter.service` 均为 `active/running`
- 4328、18091、18093 正常监听，裸 Web 返回 `401`
- `NRestarts=0`，服务日志未发现 error、exception、failed、unhandled 或 panic
- 新会话：`session-6d1ee42e-030d-4c0f-a636-f7b1ea7d1022`
- Agent 预设：`crm-query`
- 请求 header：34 个工具，不含 `bash` 或任何 `terminal_*`，仍包含 `weknora_search`
- 新工具结果：`8 passage(s) ... (searched: 1c4627e2-dfc1-48ca-aeef-2c00b53da5f8)`
- 新会话中部署验收库 ID `9a4ea853-9466-4d27-8d4e-d8e8bd5a8018` 出现次数为 0
- 回答仍返回项目资料文档来源；CRM 未连接时返回 `NOT_CONNECTED`
- 独立知识插件和工具实现继续保留；面向用户的 `crm-query` 从 `0.0.0-query.8` 起移除未配置服务的 `crm_knowledge_explain` 和私有教材图谱工具，公开口径统一由 WeKnora 项目资料检索提供。该阶段维护源为 `0.0.0-query.9`，只修正 DSH 配置型 bundle 的元数据，不增加工具 peer；当前维护源已前进到 `0.0.0-query.11`

## 后续强制 allowlist 修复

上述原始验证只证明“未显式指定 scope 时默认检索项目资料”，不能证明参数不可越过。后续 query.9 浏览器负测发现：显式传入部署验收库 `9a4ea853-9466-4d27-8d4e-d8e8bd5a8018` 后，`weknora_search` 仍搜索该库并返回 3 篇 synthetic 文档。因此原 `ca563e88…` 适配器只完成默认收窄，未完成生产范围强制。

现已用 DSH 原生工具注册的薄包装修复，第三方 WeKnora 包不变：

- 不再注册 `weknora_list_knowledge_bases`。
- `weknora_search` 只接受项目资料库 allowlist；非数组筛选、其他 ID 和无法证明归属的文档 ID 搜索直接返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。
- 普通 `weknora_search` 禁用了上游 tenant-wide 文档名 enrichment；实测网络路径只有项目库 passage 检索 `/api/v1/knowledge-search`，不会先调用跨可见库的 `/api/v1/knowledge/search`。
- `weknora_read_document` 要求非空文档 ID，并先查元数据核对 `knowledge_base_id`；缺失 ID、不属于项目库或元数据不可用时 fail-closed。
- 浏览器复测中，项目库正查成功；部署验收库搜索和跨库文档读取均被拒绝。
- 新适配器 SHA-256 为 `3cee71585582befe222de54a9063a37d0dacbf7ed1ec31eaee88922a84bf2a53`，最终 scope helper 为 `94ee280908884918ac3c43d5be9fd71c1d2a0c1cfe0fb13eff2010b2998ee33c`，远端回滚副本位于 `/srv/shinemage/dsh/recovery/weknora-production-scope-20261021/`；最终输入防护和 tenant-wide enrichment 修复前的文件均另存为带 `.before-*` 后缀的副本。
- 09 月/10 月早期固定输入 manifest 不覆盖后续 live overlay；现保留原字节，并新增 `weknora-production-overlay.v1.json`（`f40e73372b07bf6887408bf3bd6fd35026b13df6399cc61aa890ed42ac37b90e`）记录当前 adapter、helper、preset、brand globals、package origin 和 scope。该 sidecar 不包含 `retrieve.key`，服务启动不依赖它。
- 完整现场过程与 query.9 结果见 [query.9/WeKnora 强化范围回执](dsh-query9-weknora-scope-20261021.md)。

## WeKnora 全量只读复核

- 三个知识库保持隔离：“项目资料”7 篇、“部署验收（合成资料）”3 篇、“权限隔离验收（空库）”0 篇；合计 10 篇文档均为 `completed/enabled`，待处理子任务与错误均为 0
- 项目资料库有 385 个 active chunk、385 个 `index_status=ready` 的向量索引和 385 个 1024 维 active embedding；另有 174 个软删历史 chunk，不进入活动检索
- 部署验收库有 3 个 active chunk、3 个 1024 维 active embedding；它只用于独立验收，不进入 DSH 检索
- 分块配置为 800/100，模型为 MiniMax-M3，embedding 为 `bge-m3:567m`，向量驱动为 PostgreSQL，存储为系统本地目录
- 项目资料 `graph_enabled=true`；容器 `NEO4J_ENABLE=true`。Neo4j 实测为 1656 个节点、1519 条关系，与人工校准图和机器候选图的合计一致
- 资源表有 194 个 active resource：9 个已绑定知识源文件，185 个页面 PNG 合计约 43.6 MB 未绑定；本轮未删除或改写资源
- 共享空间、组织共享和数据源均为 0；本轮未扩大 WeKnora 权限

组合输入中的 Knowledge source/manifest 已前进到 `ef8960ed…` / `83dca334…`，tarball 仍是 `870fdeea…`；同源 build receipt 记录 generated tree 未变，固定 Node 24 的严格 pack/profile 回归 `55/55 PASS`，因此这是“来源重绑、运行字节相同”，不是 pack 摘要漂移。

## 回滚

若需回滚，只恢复 `/srv/shinemage/dsh/recovery/weknora-production-scope-20261021/weknora.mjs` 并受控重启 DSH；该备份是强制 allowlist 修复前的 `ca563e88…` 适配器，只恢复默认收窄行为。回滚不会改动 WeKnora 数据。
