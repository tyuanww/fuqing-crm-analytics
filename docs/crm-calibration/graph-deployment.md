# CRM 教材图谱查询与本机部署

2026-10-04 本地拆分候选：图谱工具现由独立[知识插件](../../dsh-plugins/knowledge/README.md)拥有，CRM Host 只提供版本化的会话身份能力。当前 Git 与带日期的杭州事实看 [STATUS](../../STATUS.md)。下方 2026-09-21 图谱数量及账号核验是历史现场证据，不替代新插件宿主验收。不修改 DSH 上游，不读 CRM 归档库，不扩大到未授权知识库。Neo4j 自动抽图、受限查询工具、真实模型调用、全图语义审核分开验收。

## 查询和权限

工具只接受已声明业务参数：图查询 `topic`（2–80字符）和 `limit`（1–20）；检索 `query`/`limit`；引用展开 `chunk_id`。只查部署允许且当前 CRM 账号被授权的教材。没有 SQL、Cypher、URL、库名、文档 ID 或凭据参数。使用固定只读 Cypher 和参数化主题；数据库名、文档标签来自校验后的部署配置。

WeKnora 本机 retrieve key 在空间内等同管理员，**不能**当 CRM 账号隔离。最小可维护映射是：当前对话 CRM 登录用户名 → 私有 `aclFile` 中该用户的 `knowledge_ids`。retrieve key 只在通过账号授权后作为部署取数凭据。未连接 CRM 返回 `NOT_CONNECTED`；账号未授权返回 `ACCESS_DENIED`。与保存分析同一 owner 语义：分享范围大于来源文档权限则拒绝，需为接收账号重新授权文档。

每次检索、图查询、引用展开都重新读取授权文件、文档状态和分块；授权、撤权、会话切换即时生效。服务不可用时拒绝访问，不返回历史缓存。跨文档关系若对端文档无权查看，整条关系丢弃，不泄露实体名、摘要或引用。查询中途撤权、文档删除/禁用/重新解析或版本变化失败关闭。

Neo4j 连接仅限 HTTP 回环地址。当前社区版部署使用本机既有账号，由代码限定只读语句；这不是数据库角色层面的只读授权。密钥文件和配置须为私有文件，模型只见业务参数与投影后的结果，错误正文和凭据不外传。请求限15秒、响应限512KiB，拒绝重定向；同一工具实例仅一个查询在途。查询不生成新的关系，也不额外调用抽取模型。

`OK` 表示取得有当前来源的关系；`NO_MATCH` 只表示指定图范围未命中；`UNAVAILABLE` 表示权限、配置或服务不可用（含 `NOT_CONNECTED`、`ACCESS_DENIED`）。拒绝关系全部被排除时返回 `REVIEW_REQUIRED`。不会拿文档命中冒充图命中。

## 原文、人工核对、版本和账本

只返回关系名称和两个实体共有的分块，不返回模型自行补写的实体属性。`evidence_refs` 是共享来源，不是关系正确性的证明。来源存在不等于关系正确。业务公式优先对照 `crm_knowledge_explain` 的已确认定义。

每条关系有审核状态：`verified`、`rejected`、`pending`、`version_stale`。没有可定位来源的关系不会进入 `relations`，而是以 `missing_source` 写入 `review_notes`；它不是人工审核状态。可配置私有 `reviewFile`：以精确三元组、分块 ID、当前文本 SHA256 记录 `verified` 或 `rejected` 及原因。拒绝优先，拒绝项从 `relations` 移入 `review_notes`；原数据库不删除。分块哈希变化后旧审阅标为 `version_stale` 并失效。

查询结果附带当前文档 `updated_at`/`processed_at`、分块内容哈希和审核记录。可选 `syncFile` 只记录观察时的文档时间；抽取未保存哈希时 `extraction_content_hashes_saved` 保持 false，不得事后补齐。`graph_sync=observed` 只表示时间戳与观察记录一致，不是抽取同版本证明。文档变更、重新解析、删除或图尚未同步时，旧引用与审核失效或标过期。重建、重新抽取及付费模型调用须另授权。

账本由 `scripts/crm-calibration/graph-ledger.mjs` 对部署范围点名生成，写入私有文件。关系分页上限 5000，达到上限时 `truncated=true`，不能把截断结果当成全部分母。2026-09-21 部署教材分母：**1374 个实体，1163 条有向关系**（未截断）。公式与高影响关系本批已核实 43、已拒绝 7；待核对 1113；版本过期 0；无来源 0。不能用会员溢价局部通过宣称全图完成。IPT 未命中不能推断教材没有 IPT。

## 配置与复现

插件使用 Node 24，以及 `plugin-kit/toolchain.json` 钉住的 DSH 0.1.7-rc.2；Python 3.14 只用于合成服务/验证。先按[插件说明](../../dsh-plugins/crm-knowledge/README.md)分别构建和验证，再准备私有配置。本轮未操作杭州；现役版本沿用 STATUS 的现场快照。以下是结构示例，ID和路径须使用实际部署值；不把凭据写入工具参数或公开仓库：

```json
{
  "weknoraOrigin": "http://127.0.0.1:18092",
  "neo4jOrigin": "http://127.0.0.1:17474",
  "database": "neo4j",
  "username": "neo4j",
  "knowledgeBaseId": "11111111-1111-1111-1111-111111111111",
  "knowledgeId": "22222222-2222-2222-2222-222222222222",
  "additionalKnowledgeIds": [],
  "weknoraKeyFile": "/private/weknora-retrieve.key",
  "neo4jPasswordFile": "/private/neo4j-password",
  "reviewFile": "/private/graph-review.json",
  "aclFile": "/private/graph-acl.json",
  "syncFile": "/private/graph-sync.json"
}
```

`aclFile` 必填：`{schema:"crm-graph-acl/v1", knowledge_base_id:"知识库UUID", grants:[{username, knowledge_ids}]}`。未列出的账号没有文档权限。`reviewFile` 可省略；若提供，格式为 `{schema:"crm-graph-review/v1", knowledge_id:"文档UUID", entries:[...]}`，每项含 `source, relation, target, verdict, reason, chunk_id, content_sha256`。`syncFile` 可省略，格式 `{schema:"crm-graph-sync/v1", knowledge_id, extraction_content_hashes_saved:false, document_updated_at, document_processed_at}`，不得把缺失的抽取哈希补成 true。所有私有文件权限0600，父目录0700。retrieve key 仍须与部署教材一致，不扩大到其他知识库。

账本（只读、不抽图）：

```sh
node scripts/crm-calibration/graph-ledger.mjs \
  --settings /private/graph-settings.json \
  --principal crm-username \
  --output /private/graph-ledger.json
```

```sh
node scripts/crm-calibration/prepare-profile.mjs \
  --output /absolute/new-private-output \
  --plugin /absolute/repository/dsh-plugins/crm-knowledge \
  --knowledge-plugin /absolute/repository/dsh-plugins/knowledge \
  --graph-settings /private/graph-settings.json
```

此命令只写新的输出目录，拒绝覆盖；不会修改现有 profile 或启停服务。输出 `host.patch.yml`、`preset/preset.yml`、`preset/agent.cordis.yml` 和带文件/独立包指纹的 `crm-profile-assets/v3` manifest。上例只配置在线图谱，公开合成查询/知识解释保持 NOT_AVAILABLE。需要这两项能力时分别传 `--metrics-origin` 和 `--knowledge-origin`，详见[独立服务边界](../operating/crm-plugin-service-boundary.md)。输出目录和已安装插件目录是运行依赖，不能随意移动或清理。

部署前保留旧 profile 与旧包并核对 Host 入口。在新隔离 profile 中装配两个固定候选包及生成的两个 preset 文件；v3 不再使用聚合 `tools.mjs`，不能向旧合包会话追加新知识工具。已有 `crm-knowledge-live-host` 时应由部署 owner 更新该条目的精确候选入口，不能再次插入同名条目，也不能覆盖其他 profile 项；生成的 Host 补丁适用于新 profile，不能盲目重复应用。教材检索/引用展开走知识插件的 `query_crm_knowledge_sources` 与 `expand_crm_knowledge_citation`，当前身份提供方仍要求连接 CRM。本生成器不迁移模型、凭据或其它知识库。

新增身份能力要求新的 CRM Host；仅替换 preset 无法让旧 Host 提供该能力。精确 DSH 的 profile 加载、受控重启、会话/WAL 和回退须先在隔离候选验证，现场切换按授权执行，本轮未运行。重启后重新连接 CRM；回退恢复对应的旧 profile 与旧包，不声称登录内存或服务数据能够自动回滚。禁止据此清空 runtime 或删除图数据卷。共享 `weknora_search` 不具备本合同的账号隔离，原生工具 guard 仅是选中图谱模块时的补充限制，不代替服务端权限。

## 验证层级

合成覆盖：双账号不同文档授权、授权/撤权、会话切换、缓存命中后仍鉴权、服务不可用拒绝缓存、跨文档关系不泄露、查询中途撤权、文档禁用/删除/版本变化、误连隔离、审核过期、引用可定位、参数注入和原生登录后工具卸载。

2026-09-21 本机：`admin` 可查部署教材，会员溢价分子/分母/衡量对象核实并定位第161页，误连隔离仍有效；`fqsw` 图查询与检索均为 `ACCESS_DENIED`，无关系或原文。账本分母见上一节。未重建抽图，未调用付费模型。私有原文、实际资料 ID、调用记录、账号和配置不进入公开仓库。

仍开放：其余 1113 条关系的人工核对、抽取时文本哈希、现役 6677 共享 `weknora_search`（本候选 preset 已隔离）、其他真实指标。本分支已实现 CRM 分析分享/撤销与文档 grants。销售快照/保存分析见[本轮记录](crm-assets-release-2026-09-21.md)；不把教材图谱关系保存为可信销售事实。真实业务口径与接入缺口见[真实指标接入清单](metric-readiness.md)。产品仍 PARTIAL。
