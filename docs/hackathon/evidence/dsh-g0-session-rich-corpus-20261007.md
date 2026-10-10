# 附件与委派元数据恢复验证（2026-10-07）

从干净 `418edc29` 继续 T2/T7，增加 `--corpus rich`。**本机回归 18 PASS；杭州 WSL2 四项矩阵 4/4 PASS、10 个冷进程均退出 0。** 本批是该基线后的工作树增量，尚未提交；远端控制器按实际字节封存为 `reviewed-working-tree`，不能冒充 clean commit 或新 release artifact。

## 实现与合同范围

固定 rc2 `477b4f420553e8a52c2fbccc464d7561b239c443` 的合同来源：

- `packages/attachment/attachment/src/types.ts`、`packages/llm/llm/src/types.ts`：图片/文件引用保存 `attachmentId`、尺寸/字节数/名称等字段，不是任意磁盘路径或 URL。
- `packages/core/session/src/types.ts`：会话头记录 `parentSession`、`origin`、`delegationDepth` 和 `agentPreset`。
- `packages/subagent/subagent/src/descriptor.ts`、`continuation-messages.ts`、`depth.ts`：descriptor v3、relay/notice 来源，以及持久化深度不能被运行时较小的值降低。

新回执为显式 `dsh-owned-session-recovery/v3`、corpus `attachment-delegation-metadata/v1`；旧 text/v1 与 tool/v2 范围保留。首轮 8 条事件、第二轮累计 15 条：descriptor 仅首轮创建，包含图片/文件引用、父代理 relay、子代理 settled notice、reasoning/text 与 provider replayState。每个冷进程使用官方 reader/writer 和 `Session.create()` 恢复，核对消息投影、header、官方 `foldSubagentDescriptor()` 与 `delegationDepthOf()`；运行时深度 0 不得覆盖已保存的深度 2。

图片/文件引用使用微型 synthetic 内容摘要，**不调用附件服务，不读取或上传附件、不验证渲染/授权**。子代理事件为 fixture，不启动子代理、Agent Loop 或真实模型。保持 `attachment_storage/attachment_rendering/delegation_execution/tool_execution/model_execution=NOT_RUN` 和 `release_ready=false`。

续写前新增对已存 tool/rich 语料的核对，防止先追加后才发现输入已变更；异常读取/续写均拒绝，不改受测文件。本批不修改 DSH 上游或当前插件/服务候选。

## 本机实际验证

Node `24.19.0`，固定已编译 rc2，原始证据：`.context/checks/session-rich-corpus-20261007/`。

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test \
  scripts/dsh-b0/session-recovery.test.mjs \
  scripts/dsh-b0/recovery-model-gate.test.mjs \
  scripts/dsh-b0/mock-provider.test.mjs
```

`tests.log`：**18 PASS / 0 FAIL / 0 SKIP，2.60 秒**。包含原文本/工具回归、新 rich 冷恢复，以及图片身份、文件字节数、子会话 composition、委派深度和父会话身份五种篡改；每种实际运行冷进程 read/append，校验拒绝原因及文件不变。

单独执行 `session-recovery.mjs <new-output> <rc2-modules> --corpus rich`，本机截断恢复 8→15 事件通过；未提供 rc1 的本机结果仍为 **PARTIAL / 退出 2**。`actual-rc2/session-recovery.json` 属于续写前校验补齐前的首次正例；最终代码通过上面的完整相关测试及下述现场运行。没有把缺 rc1 当成成功，也没有重跑不受影响的全后端/release suite。

## 杭州实际验证

证据：`.context/checks/session-rich-wsl-20261007/`。WSL2 x86_64、Node `24.21.0`、UID 65534，独立 HOME/TMPDIR、自有临时目录 `/tmp/owned-session-rich-mzu27c1f`。

rc2 复用既有 GitHub Release runtime，SHA-256 `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`，164918950 字节；杭州直接下载 10.98 秒，安全解包，没有编译。rc1 读取原 `46a7f68b0922371ce7144b668b90e377d8e799f4` checkout 的现有模块，tracked clean；四个包的 package/entry 摘要已记录，**旧编译闭包来源仍 NOT_VERIFIED**。

| 场景 | 结果 |
|---|---|
| rc2 截断末帧恢复 | PASS；注入 63 字节不完整帧，8→15 事件，前缀和只读文件保持 |
| rc1 写入 → rc2 读取/续写 | PASS；format 4→4，8→15 事件 |
| rc2 续写 → rc1 读取 | PASS；读取全部 15 条，未改变新状态 |
| rc1 + 保留旧状态回退 | PASS；恢复原 8 条，不包含后来的新写入，不等同业务数据回滚 |

十个进程均恢复相同父会话、descriptor 和深度 2。结果 archive SHA-256 `ec103b03dfc45a9bc9f4add6b49b8191770d885cbb5f1119b7cdee1a86ade4db`，49 个输入/结果文件逐项取回校验；五个控制器源文件与本机当前字节一致。旧 source、编译入口和 rc2 runtime 输入完整性分别记录，不把 Git clean 或 digest 等同供应链签名。

## 当前结论

本次关闭的是“图片/文件引用及委派元数据在所声明语料中的跨版本持久化观察”。附件真实存储/读取权限/渲染、活跃委派/取消/授权、image-offload/compaction/fork 等其他事件组合不在本语料范围，不能标成已验证；真实模型、业务 UAT、供应链及生产 activation/canary/rollback 继续按各自门禁处理。0.2.0 仍属后续 advisory pin。

当前兼容矩阵和计划汇总表同步已完成的文本/工具/元数据、杭州终态恢复与回执接线事实，保留历史证据。结果年龄仍采用历史快照策略，无待定阈值任务。


回收与保护已核对：`cleanup.result.json` 确认无自有进程存活并只回收本次临时目录，current 仍为 `dsh-0.20.0.0-r3`，五个生产监听/PID 不变；`retrieved/integrity.json` 记录 30147 个 rc2 输入条目、五个控制器和四组 rc1 package/entry 保持。本机 `session-rich-corpus-20261007/integrity.json` 记录 1318 个既有文件字节/mtime 保持，当前候选 journal 仍 seq 6，未追加或改写历史证据。矩阵本身耗时 1.466 秒，不含下载/解包/采集。


## 审查与交付状态

沿用 `open-code-review-delegate`：OCR 提供文件清单和 JavaScript 规则，宿主核对全部 11 个文件（4 个 MJS、7 个文档；包含 OCR 按扩展名排除的 Markdown），11/11 reviewed、0 skipped、覆盖率 100%，无未关闭高/中风险发现。范围包括前缀保留、一次 descriptor、消息来源/附件引用、header 重验、续写前拒绝以及 NOT_RUN 声明。旧兼容矩阵/计划汇总的过期结论已修正，历史证据原字节保留。

`preview-final.json`、`rules.json`、`review-final.json`、`integrity.json` 在本机证据目录；语法、差异和新增引用通过。本批未 commit/push、发布或生产切换。最新已提交 HEAD 仍 `418edc29`；当前代码的测试和现场结果以控制器摘要绑定，不能当成 clean release 来源。
