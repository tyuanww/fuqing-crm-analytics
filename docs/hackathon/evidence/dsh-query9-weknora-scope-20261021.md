# DSH query.9 side-load 修复与 WeKnora 强制范围

日期：2026-10-21（北京时间）。

## 结论

线上 `shinemage-dsh.service` 已完成 `@shine-mage/dsh-query-agent@0.0.0-query.9` side-load，插件页显示版本 `0.0.0-query.9`，`query-tool-policy` 与 `preset-shinemage-crm-query` 为 `2/2 运行中`。受控重启后服务为 `active/running`，`NRestarts=0`，4328、18090–18094、18098 正常监听；根路径为 4328/18092/18093 `401`、18090/18094 `200`、18091 `404`、18098 `302`。启动日志无 error、exception、failed、fatal 或 unhandled。

首次 side-load 曾在半切换状态失败：profile `package.json`/`pnpm-lock.yaml` 仍指向 query.8，而 `node_modules` 已替换为 query.9。先保留现场文件与 query.8 安装副本，再补齐 manifest、lock 和冻结安装一致性，随后完成两次受控重启和浏览器复测。独立复核后又补齐非数组筛选与缺失文档 ID 的输入防护，并做一次受控重启。该事故与修复过程保留在本回执，不把旧进程仍可响应写成切换成功。

## query.9 artifact

- source：`d860b1d46d3a33de2ae1b0e77f1f420ec25e0d0d`
- source package manifest（`package.json` 字节）：`d3b901ea679ee6b413cecc11fad0471a66144aaa96171235f79afa9f13a10fa8`
- generated pack manifest（`plugin-pack.json` 字节）：`f68df1dbe45c411125080bdc203afff7669f4748c88bdc6d0c48d75ba09194e7`
- tarball：`shine-mage-dsh-query-agent-0.0.0-query.9.tgz`
- tarball SHA-256：`393af040437dfe7523605c718c18edee9bd8ea4b739b83f4454b18187419a4a7`
- tarball bytes：`3269`
- integrity：`sha512-MQiuKQE4uYdy6aO9Ur9PXJpVo+1vjNQyEV2T6TyxzdSYU1DDvKNjzuToJcunOXhkpKBDKchUXiVuSc9ZMp/KVA==`
- build provenance SHA-256：`d54dff1aa64e1767b4fab409c7bd16102a52c6819578020ddbd1a996cdad8eff`
- entries：`cordis.patch.yml`、`icon.svg`、`lib/tool-policy.js`、`locale/en.json`、`locale/zh.json`、`package.json`

上述两种 manifest 摘要不是同一个对象，也都不是 tarball 摘要。config-level lock 见 [`config/query-agent-side-load.v1.json`](../../../config/query-agent-side-load.v1.json)，测试会把 source `package.json` 摘要与回执中的生成包身份绑定起来。该 lock 描述 owner-operated side-load，不是正式 release 身份。

包从 clean commit 的隔离 worktree 生成，并通过严格 provenance reader。Query bundle 不声明 `@deepseek-ai/dsh-tools` peer 或依赖，仅组合 CRM 指标、WeKnora 检索和可选页面交付。

## 线上 profile

- profile：`/srv/shinemage/dsh/current/runtime/harness/profiles/web/`
- `package.json` SHA-256：`6c688d2296e089920267cc4b8928416caff2ac2b3958b54f8e5ce2b7a13168a6`
- `pnpm-lock.yaml` SHA-256：`ed46a48f3353474681b9cad6b2d5bed2a2a438e76f65b08b3220f588651bd333`
- installed query package SHA-256：`57761e4b1e584a96861795a81605fa034bab36adb057997c978721e7728b82da`
- query.8 references in `package.json` / root lock / `node_modules` lock：`0`
- pnpm install：`--frozen-lockfile --ignore-scripts --prefer-offline` 通过
- 恢复备份：`/srv/shinemage/dsh/recovery/query9-side-load-20261021/`
- 半切换完成前备份：`/srv/shinemage/dsh/recovery/query9-completion-20261021/`

DSH 启动时会生成新的 `runtime/plugin-packs-*` 根并重写本地 link，故 profile SHA 是本次观测快照，不是正式发布身份；旧 release marker 与 candidate receipt 仍不匹配当前现场。

## query.9 浏览器复测

- 新会话预设选择器显示“问数智能体”。
- 对真实 schema 做点名观察时，`crm_service_health`、`weknora_search`、`weknora_read_document`、`free_html_page_generate` 可见；这只是 `visible_tools_excerpt`，不是完整 schema 枚举。
- CRM 包静态注册 9 个指标工具；回执单独记录该清单，不能把四个点名工具写成完整工具面。
- 同一点名观察中，`bash`、`terminal_open`、`crm_knowledge_explain` 和私有教材图谱工具均不存在。
- UI 模型持久化路由显示 `DeepSeek-V4.1-Flash / Off`，对应 profile 声明 `deepseek-account / deepseek-flash / off`。
- 项目资料库正向检索 `会员溢价率` 返回 2 条命中，searched 为 `1c4627e2-dfc1-48ca-aeef-2c00b53da5f8`。

## WeKnora 范围缺口与修复

复测发现旧适配层只把项目资料库设为默认值。模型显式传入部署验收库 `9a4ea853-9466-4d27-8d4e-d8e8bd5a8018` 后，工具确实搜索该库并返回 3 篇 synthetic 文档，因此“默认收窄”不等于“只允许项目资料”。

修复保持第三方 WeKnora 包字节不变，在 DSH 薄适配层完成：

- 禁用 `weknora_list_knowledge_bases`，只暴露 production search/read。
- `weknora_search.knowledge_base_ids` 按固定 allowlist 校验；非数组、出现非项目库，或只能按 `knowledge_ids` 搜索、无法证明归属时立即返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。
- 上游 `weknora_search` 默认还会调用 tenant-wide `/knowledge/search` 做文档名 enrichment。生产客户端在调用入口直接返回空 enrichment，确保普通项目库 search 不会先把其他库元数据拉进 DSH。
- `weknora_read_document` 要求非空文档 ID，并在执行前读取元数据；只有 `knowledge_base_id` 属于项目资料库才继续，缺失 ID 或元数据失败时 fail-closed。
- 维护源为 `scripts/ops/weknora-production.mjs` 与 `scripts/ops/weknora-production-scope.mjs`。

远端文件：

- `weknora.mjs`：`3cee71585582befe222de54a9063a37d0dacbf7ed1ec31eaee88922a84bf2a53`
- `weknora-production-scope.mjs`：`94ee280908884918ac3c43d5be9fd71c1d2a0c1cfe0fb13eff2010b2998ee33c`
- `weknora-production-overlay.v1.json`：`f40e73372b07bf6887408bf3bd6fd35026b13df6399cc61aa890ed42ac37b90e`
- 回滚副本：`/srv/shinemage/dsh/recovery/weknora-production-scope-20261021/weknora.mjs`
- 输入防护前一版 helper：`/srv/shinemage/dsh/recovery/weknora-production-scope-20261021/weknora-production-scope.before-input-hardening-20261021.mjs`
- tenant-wide enrichment 修复前的 adapter/helper/overlay：`weknora.mjs.before-tenant-wide-disable-20261021`、`weknora-production-scope.before-tenant-wide-disable-20261021.mjs`、`weknora-production-overlay.before-tenant-wide-disable-20261021.json`
- 工具说明与 live 文案对齐前的 helper/overlay：`weknora-production-scope.before-search-description-20261021.mjs`、`weknora-production-overlay.before-search-description-20261021.json`

2026-10-09 的固定输入 manifest 仍为原字节（SHA-256 `e552acd8…8905`），不把后来的 adapter 和 helper 写回历史快照。新的 production overlay manifest 只记录当前 live overlay 文件、第三方 package origin、项目库 scope 和工具合同，权限为 `0600 root:root`；它不包含 `retrieve.key`，也不改变 DSH 启动路径。

修复后浏览器负测：

- 显式搜索部署验收库被拒绝，错误码 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`，未返回 synthetic 文档。
- 显式读取部署验收文档 `bf837310-9f76-4b4f-8a53-c3f39bb79f44` 被拒绝，未返回正文。
- 项目资料库同范围正向检索仍成功，说明限制没有破坏正常问数链路。

最终 tenant-wide enrichment 禁用版本下发并受控重启后，服务为 `active/running`、`NRestarts=0`，4328、18090–18094、18098 正常监听。真实只读模块探针使用 live adapter 和 `retrieve.key` 发起搜索，项目资料库查询返回 8 条 passage（searched `1c4627e2…`），网络路径只有 `/api/v1/knowledge-search`，没有 tenant-wide `/api/v1/knowledge/search`；显式部署验收库 search 和跨库 document read 均返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。跨库 read 的路径只有先核对元数据的 `/api/v1/knowledge/bf837310-…`，没有读取 chunk 正文。

本地定向回归 `node --test dsh-plugins/query-agent/test/package.test.mjs scripts/ops/weknora-production-scope.test.mjs` 为 `18/18 PASS`，其中 query `8/8`、WeKnora scope `10/10`；仓库级 side-load 身份校验另由 plugin-pack 回归覆盖。远端输入防护前 helper 备份为 `weknora-production-scope.before-input-hardening-20261021.mjs`。

## 仍未完成

- CRM 账户登录必须由用户在工作区“问数智能体”中完成；未登录时只能验证 `NOT_CONNECTED`，不能声称真实只读指标 UAT 通过。
- 本回执属于 owner-operated side-load，不是正式 release、签名发布、canary 或杭州正式切换。
- `release_ready=false` 不变；`release-marker.json`、`candidate-profile-receipt.json` 和 WeKnora 数据均未改写。
