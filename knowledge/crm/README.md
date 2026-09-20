# CRM 离线知识包（公开版）

本包提供 `crm-metrics/v1` 的目标定义、旧代码快照、合成案例与离线依赖关系，共 216 个节点、356 条边、66 条证据索引。它可由候选 `crm_knowledge_explain` 读取，尚未接入 WeKnora 或 Neo4j 图服务。

## 内容和权限

- `textbook/` 仅保留私有教材的主题、页码和引用索引；`ocr_excerpt=null`，不包含教材原文。引用索引不能充当已公开可访问的证据正文。
- `code_snapshots/` 描述历史基线 f9070431，引用不表示旧服务已经迁移。
- `definitions/` 保存 21 项确认决议、30 个目标指标；D019 的完整真实源映射仍未完成。
- `graph/` 保存关系与冲突；没有客户、订单、真实金额或触达授权。

证据中的历史施工文档路径属于私有输入索引，不随公开包分发；需要阅读定义时使用本包 `definitions/`，不能把索引路径当作可下载的公开正文。

原 C 线记录保持历史状态 `not_implemented`。`verification.json` 单独描述后续合成实现验收；运行时核对实现文件指纹后才返回 `synthetic_verified`。这不代表真实业务对账通过。

## 校验与再生成

```sh
python3 knowledge/crm/tools/emit_offline_pack.py
python3 knowledge/crm/tests/validate_pack.py
```

生成器同样不含私有教材原文。再生成后须重跑候选验证，更新回执；不能沿用已失效指纹。当前范围和后续事项见 [公开交付说明](../../docs/crm-calibration/public-release.md)，导入边界见 [IMPORT.md](IMPORT.md)。
