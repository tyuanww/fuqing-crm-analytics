# CRM 教材图谱查询与本机部署

公开主线为 `64eb6e06`（v0.13.0.0）。本轮在已合图谱查询上补质量账本、原文版本绑定和 CRM 账号文档权限，并入 `codex/crm-analysis-board`（v0.14.0.0 候选，未切 6677）。不修改 DSH 上游，不读 CRM 归档库，不扩大到未授权知识库。Neo4j 自动抽图、受限查询工具、真实模型调用、全图语义审核是分开验收；局部通过不能宣称全图完成。

## 查询和权限

工具只接受已声明业务参数：图查询 `topic`（2–80字符）和 `limit`（1–20）；检索 `query`/`limit`；引用展开 `chunk_id`。只查部署允许且当前 CRM 账号被授权的教材。没有 SQL、Cypher、URL、库名、文档 ID 或凭据参数。使用固定只读 Cypher 和参数化主题；数据库名、文档标签来自校验后的部署配置。

WeKnora 本机 retrieve key 在空间内等同管理员，**不能**当 CRM 账号隔离。最小可维护映射是：当前对话 CRM 登录用户名 → 私有 `aclFile` 中该用户的 `knowledge_ids`。retrieve key 只在通过账号授权后作为部署取数凭据。未连接 CRM 返回 `NOT_CONNECTED`；账号未授权返回 `ACCESS_DENIED`。与保存分析同一 owner 语义：分享范围大于来源文档权限则拒绝，需为接收账号重新授权文档。

每次检索、图查询、引用展开都重新读取授权文件、文档状态和分块；授权、撤权、会话切换即时生效。服务不可用时拒绝访问，不返回历史缓存。跨文档关系若对端文档无权查看，整条关系丢弃，不泄露实体名、摘要或引用。查询中途撤权、文档删除/禁用/重新解析或版本变化失败关闭。

Neo4j 连接仅限 HTTP 回环地址。当前社区版部署使用本机既有账号，由代码限定只读语句；这不是数据库角色层面的只读授权。密钥文件和配置须为私有文件，模型只见业务参数与投影后的结果，错误正文和凭据不外传。请求限15秒、响应限512KiB，拒绝重定向；同一工具实例仅一个查询在途。查询不生成新的关系，也不额外调用抽取模型。

`OK` 表示取得有当前来源的关系；`NO_MATCH` 只表示指定图范围未命中；`UNAVAILABLE` 表示权限、配置或服务不可用（含 `NOT_CONNECTED`、`ACCESS_DENIED`）。拒绝关系全部被排除时返回 `REVIEW_REQUIRED`。不会拿文档命中冒充图命中。

## 原文、人工核对、版本和账本

只返回关系名称和两个实体共有的分块，不返回模型自行补写的实体属性。`evidence_refs` 是共享来源，不是关系正确性的证明。来源存在不等于关系正确。业务公式优先对照 `crm_knowledge_explain` 的已确认定义。

每条关系有审核状态：`verified`、`rejected`、`pending`、`version_stale`、`missing_source`。可配置私有 `reviewFile`：以精确三元组、分块 ID、当前文本 SHA256 记录 `verified` 或 `rejected` 及原因。拒绝优先，拒绝项从 `relations` 移入 `review_notes`；原数据库不删除。分块哈希变化后旧审阅标为 `version_stale` 并失效。

查询结果附带当前文档 `updated_at`/`processed_at`、分块内容哈希和审核记录。可选 `syncFile` 只记录观察时的文档时间；抽取未保存哈希时 `extraction_content_hashes_saved` 保持 false，不得事后补齐。`graph_sync=observed` 只表示时间戳与观察记录一致，不是抽取同版本证明。文档变更、重新解析、删除或图尚未同步时，旧引用与审核失效或标过期。重建、重新抽取及付费模型调用须另授权。

账本由 `scripts/crm-calibration/graph-ledger.mjs` 对部署范围点名生成，写入私有文件。关系分页上限 5000，达到上限时 `truncated=true`，不能把截断结果当成全部分母。2026-09-21 部署教材分母：**1374 个实体，1163 条有向关系**（未截断）。公式与高影响关系本批已核实 43、已拒绝 7；待核对 1113；版本过期 0；无来源 0。不能用会员溢价局部通过宣称全图完成。IPT 未命中不能推断教材没有 IPT。

## 配置与复现

使用现有固定 Node 24、Python 3.14+、DSH 0.1.6-alpha.2。先按[插件说明](../../dsh-plugins/crm-knowledge/README.md)构建和验证，再准备私有配置。以下是结构示例，ID和路径须使用实际部署值；不把凭据写入工具参数或公开仓库：

```json
{
  "weknoraOrigin": "http://127.0.0.1:18092",
  "neo4jOrigin": "http://127.0.0.1:17474",
  "database": "neo4j",
  "username": "neo4j",
  "knowledgeBaseId": "11111111-1111-1111-1111-111111111111",
  "knowledgeId": "22222222-2222-2222-2222-222222222222",
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
  --python /absolute/python3.14 \
  --graph-settings /private/graph-settings.json
```

此命令只写新的输出目录，拒绝覆盖；不会修改现有 profile 或启停服务。输出 `host.patch.yml`、`preset/` 和带文件哈希的 manifest。模块 URL 带构建哈希，避免长期宿主复用旧模块；Python 显式传给该 preset，不再改整个进程的环境变量。输出目录和插件 checkout 是运行依赖，不能随意移动或清理。

部署时先备份目标 preset 的三个文件，核对已有 host 入口。如果尚无 CRM host，将生成的具体 `file:///.../lib/host.js` 插入一次；固定 DSH 版不能通过包子入口稳定发现登录 client。已有 `crm-knowledge-live-host` 时不重复插入，也不覆盖其他 profile 项。将 `preset/` 中三个文件放入所选 harness 的 `.agent-presets/crm-knowledge/`，保留生成目录中的 tools 模块。新建会话选择“CRM 知识与指标”。教材检索/引用展开走本插件的 `query_crm_knowledge_sources` 与 `expand_crm_knowledge_citation`，须已连接 CRM。若同一宿主仍加载 dsh-weknora 的共享 retrieve 工具，那不是本轮账号隔离；本插件不修改 DSH 上游，也不把它当作 ACL 完成。本生成器不迁移模型、凭据或其它知识库。

首次本机接入只更新 preset，现有 host、登录与会话保持原进程；新会话加载新工具，已经运行的会话仍可能持有旧模块。切换到主仓后，若旧实例依赖待清理工作树，须保留原 runtime 受控重启 DSH，并重新验证登录与查询后再清理；对话历史保留，内存中的 CRM 登录须重新绑定。撤回时恢复三个 preset 备份并验证；不清空 runtime，不删图数据卷。

## 验证层级

合成覆盖：双账号不同文档授权、授权/撤权、会话切换、缓存命中后仍鉴权、服务不可用拒绝缓存、跨文档关系不泄露、查询中途撤权、文档禁用/删除/版本变化、误连隔离、审核过期、引用可定位、参数注入和原生登录后工具卸载。

2026-09-21 本机：`admin` 可查部署教材，会员溢价分子/分母/衡量对象核实并定位第161页，误连隔离仍有效；`fqsw` 图查询与检索均为 `ACCESS_DENIED`，无关系或原文。账本分母见上一节。未重建抽图，未调用付费模型。私有原文、实际资料 ID、调用记录、账号和配置不进入公开仓库。

仍开放：其余 1113 条关系的人工核对、抽取时文本哈希、现役 6677 共享 `weknora_search`（本候选 preset 已隔离）、其他真实指标。本分支已实现 CRM 分析分享/撤销与文档 grants。销售快照/保存分析见[本轮记录](crm-assets-release-2026-09-21.md)；不把教材图谱关系保存为可信销售事实。真实业务口径与接入缺口见[真实指标接入清单](metric-readiness.md)。产品仍 PARTIAL。
