# A/B/C 本地提交与新候选关联（2026-10-08）

用户明确授权仅本地提交当前集成成果，沿用已核验的 `first-purchase-source-http-local` 与固定服务绑定，核对组合后生成新 candidate 和新 journal。本轮已完成；没有 push、PR、合并、发布或部署。产品仍 **PARTIAL / release_ready=false**，SDK 分发仍 **BLOCKED**。

## 已提交的集成成果

集成源码提交为 `bd647352d02402c679b04172855e40ec8f2d96a5`，父提交 `e577f41b9247e3ac56052e21f84daed9dd32f163`；42 个文件，包含先前未提交的本地 B0 修复、独立插件夹具和证据收录。工作树保持 detached HEAD，没有 checkout、reset、stash；VERSION 保持 `0.20.0.0`。候选生成后的本页与当前入口同步另作本地文档提交，候选源码 SHA 始终指上述集成提交。

提交前按 `/review` 检查当前增量，主 Agent 与本机 adversarial 均无待修缺陷；子审查对 fixture 原始载荷采用 summary 模式，主 Agent 和仓库原生测试实际核对 owner 字节。57 条引用的 path+SHA 已匹配。额外 Claude 只读审查 180 秒超时，未得到结果，不算外审通过；没有第三次运行 HTML probe 外审。

固定 Node 24.19.0 / Python 3.14.4 / pnpm 11.28.2 下，本轮包输入与 candidate 合同专项 **17 PASS / 0 FAIL / 0 SKIP**，覆盖候选/profile/journal 绑定、篡改拒绝、旧写入者拒绝及最终 journal 冲突。初轮专项的 Python PATH 回落到系统 3.9，记录保留，修正后 r2 重跑上述 17 项；不累加计数。

正常 pre-commit 首次要求 3 份文档的 5 处“缺失”表述补附近核验依据，已补原始记录并复核；之后 commit-msg 要求详细提交正文，已按真实变更补充。最终正常钩子通过，未绕过。没有重跑既有完整 B0、服务专项、shell/tool、查询冷安装、十场更新或 headed 25/25。

## 固定组合与正式入口

本轮逐字节复制历史 profile 至集成树自有 `.context/checks/abc-local-candidate-20261008/profile.json`，不是新设计的 profile，也未改默认 `config/dsh-profile.rc2.json`。当前 `loadReleaseProfile`、`prepareServiceCompatibility` 与 `validateServiceGate` 均接受此固定输入。

| 绑定 | 当前值 |
|---|---|
| profile | `first-purchase-source-http-local` |
| profile SHA-256 | `be3948850fc414ce1524226a544783de1ecb3253514cc7f1d8f3280280b3d0af` |
| 唯一启用插件 | `@shine-mage/dsh-analytics-workbench-b0` / `0.0.0-b0` |
| DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 固定服务源码 | `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| 服务证据 SHA-256 | `9a6a4a7a28e0ffc69441394c18030b0a51eb2a881c4d00566b535931f3b391b0` |
| 服务状态/访问 | analysis-service，schema 1，`read-write`，`external`，`preserve-service-and-state` |
| 服务门禁结果 | `LOCAL_COMPATIBLE`；`BLOCKED_SERVICE_PACKAGE_AND_HOST_EVIDENCE_REQUIRED` |

正式命令为 `pnpm dsh plugin candidate --plugin <集成树绝对插件路径> --output-dir <本轮新candidate目录> --state-path <本轮新plugin-state.json> --profile <上述profile绝对路径> --service-evidence <原source/receipt.json绝对路径>`。完整参数、解释器路径、禁止 Corepack 联网的环境与 exit 0 存于原始 `candidate-command.json`。本入口只打一个已有构建的插件包，不构建 DSH、不启动服务。

组合核对范围是这个 profile 选定的插件与固定服务源码兼容证明；profile 没有列 CRM 插件或查询 kernel，因此没有把当前查询冷安装回执强行并入历史服务组合，也不声称完整 CRM/kernel/宿主运行组合已验收。

## 新 candidate 与新 journal

原始产物位于集成树 `.context/checks/abc-local-candidate-20261008/`：

| 产物 | 身份 |
|---|---|
| `candidate/candidate.json` 内部 digest | `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0` |
| candidate 文件 SHA-256 | `e57173990a0a7b2c836492159b87e36d17c97a9afe78284d1daf9eaadc131fe6` |
| 新 tarball SHA-256 | `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b` |
| tarball 字节数 | 438,511 |
| `plugin-state.json` SHA-256 | `2a0b4f78d250c2e6f28f078d68669a701db75b5a115f35505a9945b7ceea2ded` |
| journal | seq 1 `CANDIDATE_INTENT` → seq 2 `CANDIDATE_PREPARED` |

用现有 `readState` 回读摘要链，重算 candidate digest，并逐项核对两个 journal 事件的 candidate/profile/pack/service_binding，全部一致；没有 pending receipt。旧 journal `b9ef9b17…`、旧候选及原 profile/source 证据均未改，未追加旧事件。

新 tarball 与原 headed 包 `ecaa86…` 均为 8 成员：5 个运行 JS、依赖清单和 Cordis 配置这 7 项字节完全一致；唯一不同是 `package.json`，现有受控打包器去除了 4 个开发 scripts，其余解析字段一致。这是新 tarball，不能说整包同字节；原 headed 25/25 仍归原包，新 candidate 的 headed/服务宿主观察 **NOT_RUN**，journal 不继承旧通过事件。

回读控制器首轮错误地期待 state 顶层 `seq`，实际合同将 seq 放在 journal 条目上；失败脚本及记录保留，r2 按真实合同验证。产物/journal 没有为控制器修正而改写。打包前成员比较首轮未考虑包管理器去掉 `packageManager` 的行为，也保留失败，最终比较以上述两个原始 tarball 的实际成员为准。

## 仍未关闭

本地 candidate/journal 关联从 NOT_LINKED 推进到 **CANDIDATE_PREPARED**，只关闭该准备子项。服务包/宿主针对新候选的证据关联仍待完成；activation/canary/rollback、正式 CI、真实模型/业务/生产仍 **NOT_RUN**。SDK 分发 BLOCKED、EMBED-INLINE-BYTES 账本 PARTIAL、产品校验字段 NOT_VERIFIED；7 版本/29 公告没有重查。HTML probe 外审未关闭、standalone 页面包仍无输入，其他真实设备/身份门禁不变；不勾完 T5/T14/T15/T17/T18/T19，不越过既有 stop/go。

只读主成果树 14 份未提交文件，以及 SDK/HTML 执行树的 HEAD、status 和文件摘要均保持。没有读真实业务 DuckDB，没有操作杭州、6677、旧 CRM、WeKnora 或 DSH 上游。

[机器核验](shinemage-abc-local-candidate-validation-20261008.json)记录完整身份、验证范围和原始证据摘要。后续继续消费本次新 candidate/journal，不能替换成旧候选已观察的事件。
