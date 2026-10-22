# DSH 真实问数与页面链路复核

日期：2026-10-22（北京时间）。

## 结论

新会话知识库问答、HTML 页面生成、驾驶舱保存和真实文本编辑已经通过实际 UI 与
SQLite revision 联合验证。页面不是静态预览：版本 2 在刷新后仍可从页面库恢复。

CRM 数据链路本轮完成账号级认证与服务连接修复，但多次重启后尚未由 owner 在同一
新会话重新绑定 CRM，因此商品新老客、RFM 和真实经营指标查询仍待最后一次 UI 联调。

## 已通过

| 环节 | 实测结果 |
|---|---|
| 新会话知识库 | 问数智能体检索 WeKnora，返回 3 个引用文档 |
| HTML 生成 | `page-gen-growth-board-template-r3`，`PACKAGE_RECEIVED` |
| 页面内容 | 7 个 `data-page-block` 板块完整渲染 |
| 可编辑字段 | 页面包含 112 个 `data-page-field` |
| 驾驶舱保存 | `page_2a5e397a6aa04196a5a3a4736eae1096`，版本 2 |
| 真实编辑 | `board.host` 改为“增长董事会测试主持人” |
| 持久化 | 页面显示、版本历史和 SQLite `PATCH` revision 一致 |
| 预设 roster | `crm-query` 返回名称“问数智能体”，无 `broken` |
| CRM 账号认证 | `admin` 账号级校验通过 |
| 服务 | DSH `active`，CRM `18093=200`，前端 `18094=200` |

## 修复

- page-tool 发布精确的 `node_map` 字段：`node_id`、`kind`、`selector`。
- `kind` 枚举为 `static_element`、`dynamic_region`、`whole_page`。
- 资源结构明确为 `resource_id`、`content_type`、`sha256`、`byte_length`。
- 移除 DSH 工具 DSL 不支持的 `pattern` 和 `minimum`，改用字段描述。
- 校验失败时直接返回合法字段和枚举值，模型可按拒绝原因修复。
- CRM 授权不再因为会话暂时不活跃而删除；查询仍要求当前会话活跃。

## 运行身份

- Workbench `page-tools.js`：`0a5e031ba5e5b7f8570e13a10f3aac0c0697c36b228210d60a46b3b33b934ba7`
- CRM `host.js`：`9de2e22ad58fcc3949e2c9e9dc48854a4849203a3b36ee784c0b6b13f47ae349`
- 页面：`page_2a5e397a6aa04196a5a3a4736eae1096`
- 收件箱 artifact：`artifact_31e396b1b4b948f88ea49c9b368b3a78`，状态 `SAVED`
- 页面 head：版本 2

## 待完成

- owner 在新的“问数智能体”会话重新连接 CRM。
- 真实商品新老客查询、RFM 9 标签查询和页面数据绑定。
- 页面候选确认偶发出现“保存待核对”，但本轮页面本身已通过 SQLite revision 验证为保存成功；回执对账需在真实 CRM 数据联调时一并复核。
