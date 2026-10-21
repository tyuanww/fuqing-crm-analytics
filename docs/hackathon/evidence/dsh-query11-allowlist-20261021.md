# query.11 工具 allowlist 与 WeKnora 强化范围复测

日期：2026-10-21（北京时间）。

> 本页是 query.11 allowlist 部署时点的历史快照；其中两处工具摘要、两处 WeKnora 摘要早于最终生命周期与 tenant-wide enrichment 修复。当前线上事实以[生命周期强化回执](dsh-weknora-lifecycle-hardening-20261021.md)为准。

## 结论

线上 `shinemage-dsh.service` 已完成 `@shine-mage/dsh-query-agent@0.0.0-query.11` side-load。插件页显示 query.11，`query-tool-policy` 与 `preset-shinemage-crm-query` 为 `2/2` 运行中。服务为 `active/running`，`NRestarts=0`，4328、18090–18094、18098 均恢复监听；根路径为 4328/18092/18093 `401`、18090/18094 `200`、18091 `404`、18098 `302`，启动日志错误匹配为 `0`。

query.10 曾尝试用 `tools.restrict({ allow: [] })` 隐藏全部继承工具，但真实 request header 只剩团队等 scoped 工具，9 个 CRM 工具、2 个 WeKnora 工具和页面工具全部消失。该版本已回滚到 query.9；query.11 改为隐藏已知 shell、文件系统、Web 和团队工具，并对执行使用 12 工具 allowlist guard。query.10 回归事实保留在 [机器回执](dsh-query10-allowlist-20261021.json)。

## query.11 artifact

- source：`030f4446b3b0b26f3a2859a08576d0eac860d068`
- source package manifest：`a5e753386722edcd4626bc1e082ee453e74af0ef614b074001d29e26ae355598`
- generated pack manifest：`3108e6cf7094311f1bacf8b80e0f837c24e7eebe0be8e328e73950e8856dbfbc`
- tarball：`shine-mage-dsh-query-agent-0.0.0-query.11.tgz`
- tarball SHA-256：`9046def0d68f6b89f4a4f3ea79af0f6de4109880bc3c07ba36dd0139946aad1e`
- tarball bytes：`3776`
- integrity：`sha512-uZIoYFTR3jcuFpeppxCHGcnsuf9x3OZr0iCo5uDuktGsUJvYm2WxE7btetaWYwKIfFdDmj2YMdb6Br91kYfoMg==`
- build provenance SHA-256：`d46f266559f21430ade50ec35c4d3348aef40a261bf87d9a1a0566fbd10914f1`
- entries：`cordis.patch.yml`、`icon.svg`、`lib/tool-policy.js`、`locale/en.json`、`locale/zh.json`、`package.json`

包从 clean commit 的隔离 worktree 生成，并通过 `readPluginPack(requireGeneratedProvenance=true)`。side-load lock 见 [`config/query-agent-side-load.v1.json`](../../../config/query-agent-side-load.v1.json)。

## 模型与工具面

真实 request header `session-a6d4d690-26bf-4e09-8e12-d52fd9c82574` 记录：

- provider/model/effort：`deepseek-account / deepseek-flash / off`；页面显示 `DeepSeek-V4.1-Flash / Off`。
- 12 个业务工具全部存在：9 个 CRM 指标工具、`weknora_search`、`weknora_read_document`、`free_html_page_generate`。
- `bash`、`pwsh`、`read`、`write`、`edit`、`terminal_*` 不在 schema。
- 团队、IM、会话检索、Ralph、工作树等 scoped 工具仍可能由上层组合出现在 schema 中；它们不属于 query allowlist，执行时由 monotonic guard 拒绝。
- 实际调用 `list_agents` 返回 `CRM_QUERY_TOOL_NOT_ALLOWED`，证明 guard 生效。

空白会话依次选择 `crm-query` 和 `standard` 后，`session-fa878b33-78e8-4a7c-b785-82fdedb61cdc` 的 request header 恢复 `bash`、`read`、`write` 等标准模式工具，证明切回其他预设时 query 限制已释放。

## WeKnora 只读复测

live overlay 的三份文件摘要为：

- `weknora.mjs`：`1c2e223d911bfbb02a0113ed0a2927e04086c503b8bdcbcad8b6729530f976e2`
- `weknora-production-scope.mjs`：`7e49863d5800f6f19879db39698d8db964ef182a80f69ecf710fde7191a75384`
- `weknora-production-overlay.v1.json`：`bb6a9215972d4983f740e643a9695c36f59b897fe198bd8f7b1c57b017952319`

live module probe 的真实网络路径只出现项目库 passage search `/api/v1/knowledge-search` 和跨库读取前的元数据 `/api/v1/knowledge/bf837310-…`，没有 tenant-wide `/api/v1/knowledge/search`，也没有读取跨库 chunk 正文。项目库查询返回命中；部署验收库 search、document-id search 和跨库 document read 均返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`。浏览器复测的项目库查询返回 2 条 passage，两个跨库负测均被拒绝且未返回 synthetic 文档或正文。

WeKnora client 改为 `Object.create` 薄包装，`findDocuments` 作为 wrapper own method 返回空数组；上游方法内部调用 `this.findDocuments()` 也无法绕过。search/read wrapper 对参数键执行 deny-by-default，camelCase 参数返回 scope denied。

## 验证与回滚

- query + WeKnora 生命周期定向回归：本页撰写后的加固版本为 `29/29 PASS`；[机器回执](dsh-query11-allowlist-20261021.json) 的 `26/26` 是初始 allowlist 部署时点，不覆盖读取后范围复验和事务释放回归。
- `node --test scripts/release/plugin-pack.test.mjs`：初始部署为 `44/44 PASS`；提交 `a8cebd68` 增加 query.9 不可变历史身份快照回归后，最终生命周期回执为 `45/45 PASS`。两个数字对应不同提交，不互相覆盖。
- API 与 Web 监听、HTTP 状态、插件页 `2/2`、模型路由和 standard 模式恢复均有本次现场证据。
- 恢复根目录：`/srv/shinemage/dsh/recovery/query10-side-load-20261021/`，保留 query.9 profile、lock、安装包、tarball 和 WeKnora 旧 overlay。
- 恢复 scope helper 会退回只收窄 WeKnora 范围但没有参数 deny-by-default 的版本；安全要求优先时，应禁用 WeKnora 工具而不是静默回退。

## 未完成

- CRM 用户本人尚未登录，真实只读指标 UAT 仍为 `NOT_CONNECTED`，不能写成业务已验收。
- 本轮是 owner-operated side-load，不是正式签名 release、canary 或杭州正式切换。
- `release_ready=false` 不变。
