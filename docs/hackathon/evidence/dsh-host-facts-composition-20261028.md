# 事实面板与画布修复的组合接收

本轮将已验收的 Workbench `e20a0fead28a38f22ee57c2e0fb2c3a0c98eec61` 接入组合候选。未合并 PR、未切杭州公网，产品保持 PARTIAL，`release_ready=false`。

## 来源与归档

作者草稿 PR [#12](https://github.com/tyuanww/dsh-analytics-workbench/pull/12)、[#13](https://github.com/tyuanww/dsh-analytics-workbench/pull/13) 分别承载宿主事实区和编辑生命周期修复。最终固定输入 CI `40572186294` 成功，core 为 166 文件、1386 passed。作者 CI 归档 `12764394844` 已按实际 ZIP、成员摘要与计数核对，并绑定本次严格包的 source、manifest 和 tarball。

CI formal-pack 缺少 generated_bytes_provenance，本轮没有直接消费或放宽守卫。本次使用精确 clean source 本地构建的严格包：manifest SHA-256 为 `78530f79a8c9fb4289b9f1b9477e212fb4c306dfb57f339a454f392cc6369c3e`，tarball 为 `506cb717060be9735472b6710880555e3469646e59bda94238c2bb33f09927dd`。它与 CI formal-pack 分开记录。

运输提交 `f723c9cadc6b34958617eb28737bf85135ccc141` 的 [CI 40582793438](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40582793438) 成功。artifact `12770641494` 为 793141 bytes，ZIP SHA-256 为 `5cc42e1db7abeca3a441185dc9b0805ae10d2046daaf817522cf135095d842ec`。真实下载后，20 个成员与封存输入逐字节相同；只替换 Workbench 两份文件，其余 18 个成员不变。原消费者严格接收九插件、领域包和完整业务 profile，通过 artifact 身份及作者 CI 绑定。

运输分支先普通合并已审源码，再单独提交六份运输文件。workflow 校验同提交的 `.ci` 封存元数据，保留 20 成员、零 symlink、SHA-256 和 manifest 摘要检查。消费锁在真实归档完成后更新，未预填 artifact 身份。

## 验证与依赖

主仓分层为 [事实接口 #185](https://github.com/tyuanww/fuqing-crm-analytics/pull/185) → [AI 父锚点 #186](https://github.com/tyuanww/fuqing-crm-analytics/pull/186) → 本组合接收。事实接口先于新面板部署。回退时先回退面板，再回退 facts 接口；AI 定位修复可独立回退。

`335bacbd` 的默认后端 4072 passed、81 skipped，前端构建和 236 项测试通过；完整 B0 Python 为 1043 passed、41 subtests passed、23 warnings。四分支正常推送又在 `f723c9ca` 完成后端、前端和完整 B0，未跳过 hooks。该次仍消费旧已版本化包，证明接口兼容，不能代替新 e20 组合的 B0 和完整运行包门禁。

真实浏览器业务以[UI 与知识库收尾记录](dsh-ui-knowledge-closeout-20261028.md)为准。最终 e20 在当前授权下完成原问数聊天、交付卡、保存 v1、人工标题 v2、AI 标题 v3、切换产物后重开。来源事实与绑定逐项核对，最后两次客户端更新使用 HMR，服务 PID 与 CRM 授权保持。

## 开放项

新 e20 组合的完整 B0、主仓远程 CI、完整运行候选 ZIP 尚待同次门禁完成。已通过的作者 CI、运输 CI和当前登录周期 UAT 不表示正式发布完成。

旧页跨重登仍受授权代次保护，尚无来源重新授权流程。全部筛选与缓存本轮未复验；WeKnora 仍依赖固定的 owner-operated 运行配置，不能称为独立发布闭包。

原始回执保存在 `/private/tmp/dsh-fact-mapping-20261028/ui-closeout/`，包括 `e20-transport-readback.json`、`e20-consumption-receipt.json`、`e20-remote-receipt.json`、`transport-e20-review-result.md` 和正常推送日志。审核使用本机同模型 CLI 独立只读复核，不称跨模型审核。
