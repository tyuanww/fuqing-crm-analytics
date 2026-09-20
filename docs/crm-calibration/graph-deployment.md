# CRM 教材图谱查询与本机部署

本轮在 #216 基础上补充 `query_crm_knowledge_graph` 和可生成的 profile 资产。不修改 DSH 上游，不读 CRM 归档库。Neo4j 自动抽图、受限查询工具、真实模型调用是三项独立验收；这不表示整张图的语义全部正确。

## 查询和权限

工具只接受 `topic`（2–80字符）和 `limit`（1–20），只查部署明确指定的一份教材的一跳关系。没有 SQL、Cypher、URL、库名、文档 ID 或凭据参数。使用固定只读 Cypher 和参数化主题；数据库名、文档标签来自校验后的部署配置。

每次先用 WeKnora 受限 retrieve key 检查文档权限，再查 Neo4j；每条引用分块通过 WeKnora 再鉴权，并检查文档/知识库归属、启用及删除状态。最后重读文档，发现解析中或版本变化则拒绝返回部分结果。它继承部署所选 retrieve key 的知识库权限，**不是按 CRM 登录账号区分的多用户文档权限**。

Neo4j 连接仅限 HTTP 回环地址。当前社区版部署使用本机既有账号，由代码限定只读语句；这不是数据库角色层面的只读授权。密钥文件和配置须为私有文件，模型只见业务参数与投影后的结果，错误正文和凭据不外传。请求限15秒、响应限512KiB，拒绝重定向；同一工具实例仅一个查询在途。查询不生成新的关系，也不额外调用抽取模型。

`OK` 表示取得有当前来源的关系；`NO_MATCH` 只表示指定图范围未命中；`UNAVAILABLE` 表示权限、配置或服务不可用。拒绝关系全部被排除时返回 `REVIEW_REQUIRED`。不会拿文档命中冒充图命中。

## 原文、人工核对和误连

只返回关系名称和两个实体共有的分块，不返回模型自行补写的实体属性。`evidence_refs` 是共享来源，不是关系正确性的证明。未核对的关系 `semantic_verified=false`，不能解释成“已证明为错”。业务公式优先对照 `crm_knowledge_explain` 的已确认定义。

可配置私有 `reviewFile`：以精确三元组、分块 ID、当前文本 SHA256 记录 `verified` 或 `rejected` 及原因。拒绝优先，拒绝项从 `relations` 移入 `review_notes`；原数据库不删除。文本变化后旧审阅不再生效，关系恢复为待核对。抽取时未保存原文哈希，所以未经审阅的全图仍不能保证与当前文档同版本。

2026-09-20局部核对：会员溢价的分子、分母、衡量对象共3条确认；3条误连被隔离。IPT 查询没有命中，不能推断教材没有 IPT。其余关系仍待逐步核对。

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
  "reviewFile": "/private/graph-review.json"
}
```

`reviewFile` 可省略；若提供，格式为 `{schema:"crm-graph-review/v1", knowledge_id:"文档UUID", entries:[...]}`，每项含 `source, relation, target, verdict, reason, chunk_id, content_sha256`。所有私有文件权限0600，父目录0700。使用与文档检索相同的受限 retrieve key；不扩大到其他知识库。

```sh
node scripts/crm-calibration/prepare-profile.mjs \
  --output /absolute/new-private-output \
  --plugin /absolute/repository/dsh-plugins/crm-knowledge \
  --python /absolute/python3.14 \
  --graph-settings /private/graph-settings.json
```

此命令只写新的输出目录，拒绝覆盖；不会修改现有 profile 或启停服务。输出 `host.patch.yml`、`preset/` 和带文件哈希的 manifest。模块 URL 带构建哈希，避免长期宿主复用旧模块；Python 显式传给该 preset，不再改整个进程的环境变量。输出目录和插件 checkout 是运行依赖，不能随意移动或清理。

部署时先备份目标 preset 的三个文件，核对已有 host 入口。如果尚无 CRM host，将生成的具体 `file:///.../lib/host.js` 插入一次；固定 DSH 版不能通过包子入口稳定发现登录 client。已有 `crm-knowledge-live-host` 时不重复插入，也不覆盖其他 profile 项。将 `preset/` 中三个文件放入所选 harness 的 `.agent-presets/crm-knowledge/`，保留生成目录中的 tools 模块。新建会话选择“CRM 知识与指标”。文档搜索仍使用原 dsh-weknora 配置；本生成器不迁移模型、凭据或它的权限范围。

首次本机接入只更新 preset，现有 host、登录与会话保持原进程；新会话加载新工具，已经运行的会话仍可能持有旧模块。切换到主仓后，若旧实例依赖待清理工作树，须保留原 runtime 受控重启 DSH，并重新验证登录与查询后再清理；对话历史保留，内存中的 CRM 登录须重新绑定。撤回时恢复三个 preset 备份并验证；不清空 runtime，不删图数据卷。

## 验证层级

合成覆盖 ACL 撤销、跨文档引用、禁用/删除源、版本变化、重定向、非法配置、参数注入、响应过大、取消、误连隔离和原生工具卸载。真实本机验收使用现有教材图和受限 key；MiniMax 已实际调用图谱与口径工具，返回第161页来源及被拒绝关系。私有原文、实际资料 ID、调用记录和配置不进入公开仓库。

仍开放：全图语义审核、多用户文档ACL、其他真实指标、图与原文同版本证明、保存分析/驾驶舱的持久化引用。真实业务口径与接入缺口见[真实指标接入清单](metric-readiness.md)。
