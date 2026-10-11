# 开发入口固定包迁移（2026-10-11，本地未提交）

基线为主仓 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。本记录只覆盖当前本地改动，不属于 PR #119 已通过的文档 CI，不代表完整 B0、宿主激活或生产验收。

## 实际变化

- `loadProfilePacks` 读取显式 `dsh-profile-pack-inputs/v1`：profile 原字节与摘要、原 allowlist 的顺序及包 ID、每个正式 manifest 的摘要，以及同目录 tarball 的摘要和内容均核对。逻辑 profile 的源码 path 不需存在；无默认源码发现。
- `installProfilePacks` 持有自己的已验证字节副本，在新目录解包；调用方在异步写入期间修改其 Buffer 不改变本次安装身份。已有输出拒绝覆盖。回执明确记录宿主 NOT_RUN 和 release_ready=false。
- 开发 `check/start/reload` 在插件启用时要求显式固定包清单，或每个启用功能自己的已构建绝对目录。已删除自动发现/构建主仓插件的 reload 流程。
- reload 在停止旧自有实例前检查包、固定 DSH 和额外 patch，向子进程转发 upstream、包清单及额外 patch。官方 plugin add 安装行为保留；不宣称它完全不解析依赖。
- 带服务 binding 的 profile 拒绝进入开发启动路径，继续走原 candidate/service/host 门禁。浏览器合成探针增加显式包输入要求；本轮未执行它。新合同测试已登记到原 pipeline，但默认 pipeline 仍构建主仓源码。

## 原始输入与实测

原始日志位于本机独占目录 `/Users/hutou/.codex/tasks/shinemage-profile-pack-migration-20261011-4Ssg4AuN/`。该目录的 `fixed-inputs/` 只复制并核对既有正式 manifest、tarball 与原 profile，没有复制业务源码、SDK 或数据库。原七包属于独立作者仓的固定提交；输入身份沿用上一轮正式 pack 清单，没有重新打包。

`runtime-validation-r3.json` 记录最终新入口的源码拒读验证：策略拒绝主仓九个业务插件与领域源码、九个原作者仓及旧构建输入，关闭网络；两条负对照均 EPERM。七包安全解包后，`prepareRuntime` 只从本次包目录准备插件路径与配置。`--plugin off` 即使指定不存在的包输入也不读取它，可准备原生配置；坏 extra patch 在只读预检阶段拒绝。这里未调用 plugin add、bootHost 或 live reload。此前 r2 保留为修改前的准备证据。

固定 Node 24.19.0、Python 3.14.4。最终 `dev-regression-r4.log` 覆盖 11 个开发测试文件、profile 和固定包合同，共 112 PASS / 0 FAIL / 1 SKIP，退出码 0；其中固定包合同 20 项，CLI 23 项，不重复相加。唯一 SKIP 是未配置 B0_BUILD_UPSTREAM 的固定原生工具 registry 集成，不能算通过。浏览器夹具的坏输入负测退出码 1 为预期拒绝，发生在合成服务启动之前；它不是浏览器验收。

`open-code-review-delegate` 用 OCR v1.12.12 实际选取七个代码/测试文件并解析规则，主 Agent 逐文件审查；六份 Markdown 由主 Agent 补充检查，OCR 默认不收录 Markdown。安装字节的异步可变引用与浏览器夹具的输入预检顺序已修复，最终复验通过。该委派模式没有调用外部模型，不抵扣历史外审未关闭项。

首次测试包意外含 macOS AppleDouble 成员，修改合成 fixture 的 tar 环境后通过，没有放宽正式归档校验。扩展回归的前两轮漏配 Python 3.14 / lsof 路径，失败日志保留；固定环境后重跑。沙箱 r1 的中文路径被错误编码为转义文字，负对照失败，不能作为隔离证据；r2 使用原 Unicode 路径，负对照与准备验证通过，r1 保留。

## 当前身份与未关闭项

上轮独立来源 Workbench candidate `591134e8e4d45913d95d17caf6c4281fcc5b09e96ac11eeb3fe53b4401c1f0d1`，journal seq 3 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`。本轮不改变 candidate、journal、服务 binding、包字节或 DSH pin。该服务事件只是同字节工件关联，当前宿主、目标平台、浏览器及回退仍 NOT_RUN。

本次完成的是开发输入和配置准备迁移；live reload、官方安装的当前组合、CRM/Knowledge 的 Cordis 4.0.2/4.0.4 运行兼容、默认源码 pipeline 迁移、主仓副本 stop/go 清理、真实模型/CRM/WeKnora/UAT 及独立发布均未关闭。主仓 PR #119 与九个插件 PR #1 仍未合并。本轮没有 commit、push、合并、发布、部署、删除或上游修改；VERSION 0.20.0.0、SDK BLOCKED、产品 PARTIAL、release_ready=false 保持。

交付入口：[插件更新指南](../../operating/shinemage-plugin-update.md#开发入口消费固定包2026-10-11-本地迁移) · [验证入口](../../operating/verification.md) · [当前状态](../../../STATUS.md)。
