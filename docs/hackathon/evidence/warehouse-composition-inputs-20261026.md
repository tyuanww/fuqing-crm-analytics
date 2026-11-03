# 仓库快照组合输入

本轮消费来源合同 `3112b9dc`、主接线 `5aa303ff`、CRM 作者 `2db2d8ba` 和 Workbench 作者 `178bdcae`。五份输入锁已更新。最终运行包、真实模型和浏览器业务验收尚未完成，`release_ready=false`。

两作者正式包分别在干净 clone 中离线构建，并通过固定 rc3 SDK 构建与严格来源回读。正式包的真实 SDK 工具入口验证 10 项通过；源码 callback 验证 15 项通过。两组不是完整业务验收。

组合输入来自运输提交 `1d3d04de` 的 CI `40217453890`，artifact 为 `12607903341`。归档共 737595 字节，SHA-256 为 `ec4708cc37b528648dd945f909f1a9dd67b56861dfa8f3d48c9d225b490edcb2`。20 份载荷与本地固定输入逐字节一致，9 个插件及 1 个 domain 严格回读通过。运输归档与最终运行包分开记录，来源清单的 `bundle.status` 保持 `NOT_RUN`。

公共合同使用真实 PR CI：CRM `40216736287`、Workbench `40216760901`。31 份材料与作者来源匹配。Workbench 作者核心为 162 个文件、1156 项通过；其 CI 内容包与本轮正式包分别校验。正式包的来源提交、manifest 摘要和 tarball 摘要均与作者证据绑定通过。

锁读取器验证分批完成：组合及作者证据 37 项通过，公共合同 22 项通过。首次命令缺少显式 Python 和材料环境变量而失败，配置完整后通过。独立同模型 CLI 复核发现公共合同 CI 事件标注 P2；现已替换为真实 PR 归档并复核关闭，没有放宽事件门禁。注释复核零项。

复查入口为 `scripts/ci/composition-pack-inputs.mjs`、`scripts/ci/public-contract-inputs.mjs` 和 `scripts/ci/workbench-author-evidence.mjs`。对应测试通过 `node --test` 运行，需提供 `FQ_B0_PYTHON` 和 `PUBLIC_CONTRACT_INPUTS` 的实际绝对路径。

新 query-agent 来源为 `5aa303ff`，另作 side-load 输入，尚未激活。真实仓库仅五个缓存键已热；完整两年仍为 PARTIAL。本轮未合并 PR、未创建发布标签、未切换杭州现役。
