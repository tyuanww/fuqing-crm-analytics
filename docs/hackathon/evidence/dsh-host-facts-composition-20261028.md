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

## 最终候选与远程结果

运行候选固定为 `e52f6e5d555716eabb3f917a2ee802a742b471d2`。本次文档更新使用单独分支，保留候选及归档身份。

| 对象 | 结果 |
|---|---|
| #185 CI `40582822182` | SUCCESS |
| #186 CI `40582839222` | SUCCESS |
| #187 CI `40584544777` | SUCCESS |
| e52 运行包预检 `40584544901` | SUCCESS |
| e52 新组合本地完整 B0 | PASS，Python 1043 passed、41 subtests passed、23 warnings |

最终运行 artifact `12772486076` 为 177217698 bytes，外层 ZIP SHA-256 为 `071f4c603b549d99c873bb886d65ecf6fe953f4e1709985c70404f64c0e23660`。真实下载后，`verifyPreflight` 与 `assertReleaseInputs` 核对七份文件、来源 e52、上游 `1f81c047`、内外层摘要及校验和通过。`receiveArtifact` 接收 1554 个源码文件，源码归档 SHA-256 为 `48e5d1e6121f007f939b6db4e4f28ee8611f84690bb14cde428db11cbdc5f43c`。

包内九插件经严格 reader 回读，Workbench source、manifest 和 tarball 与 e20 输入一致。新增 facts 合同和选择模块也与冻结源码原字节相同。上游运行时为 171256761 bytes，SHA-256 为 `2e596d1b4b76b05e9d153fe65b324c225be8f512fc38cd21ccd256ee1fcff74c`；现有安全解包器接受 43780 项、664799207 bytes。没有执行 Linux 运行时、启动服务或安装到杭州。

## Linux 可迁移性边界

对收到的通用运行包另行执行 `verifyPortableLinuxRuntime`，实际失败 75 项：34 个异平台 native 文件、35 个带构建路径的 shim，以及 6 个含构建路径的包或 pnpm 元数据。原始失败保留，未修改包或放宽检查。

只读追踪确认，通用 preflight 未选择可选 `--portable-linux` 模式。该模式还会改变依赖物化路径，不能只凭已有开关就认定修复完成。独立复核确认 Linux x64 native 文件存在、所查 shim 执行目标为包内相对路径，6710 个符号链接均未越界且有目标。当前证据没有复现 Linux 安装、native 加载或 Web 启动失败，也不成立已确认安全漏洞。

本轮按现有通用包合同完成接收。portable Linux 扫描仍为 FAIL，独立 Linux 可迁移候选及异目录安装、native 加载与目标启动验证保留为发布前开放项。若明确选择该交付合同，应生成新候选、新摘要，不改写 e52 的已接收字节。不能把当前包视为可在目标机任意重新执行 pnpm 安装的完整输入。

## 其他开放项

旧页跨重登仍受授权代次保护，尚无来源重新授权流程。全部筛选与缓存本轮未复验；WeKnora 仍依赖固定的 owner-operated 运行配置，不能称为独立发布闭包。

已通过的作者 CI、运输 CI、运行包预检和当前登录周期 UAT 不表示正式发布完成。e52 包的杭州安装与启动、正式 clean-machine 和发布身份门禁未在本轮执行，产品仍为 PARTIAL、`release_ready=false`。

原始回执保存在 `/private/tmp/dsh-fact-mapping-20261028/ui-closeout/`，包括运输和消费回执、`e52-b0-build-evidence.json`、`e52-source-runtime-receipt.json`、`e52-runtime-diagnostics.json`、`runtime-portability-assessment-result.md` 及正常推送日志。审核使用本机同模型 CLI 独立只读复核，不称跨模型审核。
