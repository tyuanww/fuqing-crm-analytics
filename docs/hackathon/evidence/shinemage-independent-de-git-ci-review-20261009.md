# 五仓 Git 交付与 CI 输入审查（2026-10-09）

本轮承接[执行方交接](./shinemage-independent-de-git-and-ci-20261009.md)，按实际 Git、原始日志、源码摘要、内容包和 CI 脚本核对。主树仍为 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`，开工 104 项未提交、暂存区为空；不把交接的 102 项旧起点当作当前状态。

审查目录：`.context/checks/independent-de-git-ci-review-20261009/`；机器摘要：[shinemage-independent-de-git-ci-review-20261009-validation.json](./shinemage-independent-de-git-ci-review-20261009-validation.json)。D/E 原 Git 交付证据 361 文件、CI 原日志/回执/补丁/包 38 文件均按摘要归档，原件保留；公开依赖 tarball 只复算索引，不重复下载。

## 五仓本地 Git 交付成立

| 仓库 | 首次提交 | 作者 / clone | 原包身份 |
|---|---|---|---|
| shine-query | `258a34490ec09c47397b55cf9d4e7c2a5bd04743` | 27 tracked 文件与提交和 clone 同字节 | `f19fc60c…`，1431 B |
| shine-board | `49b00e0871c16f489f99f0c8ed42d3378d1b2240` | 27 tracked 文件与提交和 clone 同字节 | `0bcf6ed8…`，1514 B |
| shine-crowd-action | `51f8088d798a0ce0f146e270fbc4dba4c3aec6ef` | 27 tracked 文件与提交和 clone 同字节 | `dfbd9279…`，1600 B |
| shine-funnel | `1c71c04bf2a5738ca3a00bb7e52d8b17cdd7218b` | 29 tracked 文件与提交和 clone 同字节 | `ba1f9cd9…`，2409 B |
| shine-waterfall | `632867cb2ca1481ceae0a5f51ed8c95659d5ac7c` | 29 tracked 文件与提交和 clone 同字节 | `d98ee03e…`，2871 B |

五仓均为 codex 功能分支上的一笔无父提交，作者 clean、无 remote；真实 clone 原命令为 git clone --no-local，同 SHA、无 alternates。前轮 COPYFILE_EXCL 修复已进入首次提交，没有恢复已知缺陷。Funnel clone 当前多出 7 份未跟踪 node-compile-cache 文件，tracked 不变；不把作者 clean 泛化为 clone 零缓存，不为此清理。

原始日志的各组计数与退出码核对成立：D 三仓分别 lifecycle 2 / boundary 5；Funnel 计算 2 / lifecycle 1 / boundary 7；Waterfall 计算 1 / lifecycle 1 / boundary 7，均无失败/跳过。这里是原结果复核，不是本轮重跑；五仓原 build 无单独 tsc，保持 NOT_IN_CURRENT_BUILD。原 board/waterfall 元数据 lstat 拒绝失败保留，修正后范围按实际 profile 记账。

五份实际 tgz 已重新计算摘要和全部成员。D 为 5 成员，E 为 8 成员；两份声明与领域包同字节，编译 mjs 与领域原文不同、与本次 clone 产物一致。第二次写入按各仓 exit 1 或 2 拒绝，首包不变。不继承旧 candidate/headed/WSL。

隔离只证明列出的产品树/作者目录内容被拒绝，固定 SDK 只读。历史材料、部分工具副本和品牌副本可读。crowd-action 的 READ_DIR 是目录读取记录；readable-copies 原记录中相关目录文件数为 0，不宣称读取了三份完整业务源码。board 还明确读到了品牌证据中的 kit toolchain 和 Workbench 历史 verify 的 toolchain。以上不提升为整盘 deny-default，也不据此要求无变化的构建重跑。

本轮五仓没有新代码修改或新确认 P1/P2。九个既有插件现在均有本地提交及相应 clone 验证证据，shine-brand 沿用既有远程交付；其余八仓仍无远程交付。三个 D 叶子仍是能力标记入口，不能把 Git 独立化记为完整运营业务拆出。

## CI 输入：有材料进展，供应仍未关闭

任务根为 `/Users/hutou/.codex/tasks/shinemage-ci-inputs-20261009/`。Workbench 消费者为 `cc1dd6a` 的独立 clone，本轮逐一核对 609 个 tracked 文件与提交相等，原作者仓未改。

- 36 个公开 tarball 的 sha512 integrity 全部在本机重新复算一致。
- 26 个 SDK binding 的公开包 main/types 入口与当前固定 checkout 的对应入口逐字节一致；这是入口文件比较，完整传递依赖、生成物和类型解析闭包未验证。
- 新 source/upstream 确实是固定 `477b4f42` / tree `e3e63253…`，原预检 exit 1 停在 vite/package.json。它尚未检查完后续依赖，所以不能说只缺 vite。
- 原 prepared 全链成功仍依赖本机旧的已安装上游和 build-tools。darwin/arm64 的严格构建、193 项和 `74321fa0…` 内容包成立，但没有使用新取得的公开包/源码树完成干净输入构建。本轮不重跑。

**CI-PREPARED-HOSTED-MISMATCH / P2 / OPEN**：`patches/ci-prepared-runner.yml:17` 仍选择全新 `ubuntu-24.04`，同时要求 `/opt/shinemage/inputs/477b4f42…` 已安装闭包，却没有准备步骤或已准备 runner 选择。它仍是未就绪草案，不能直接应用并称完整 CI 可运行。`require-prepared-inputs.mjs` 是存在性/身份前置检查，不提供这些文件。没有擅自创建 runner、复制 macOS 平台二进制到 Linux、放宽类型检查或发布受阻 SDK。

下一步应具体完成目标平台依赖安装与 SDK 必需生成物准备，再让固定消费者从这份新闭包构建；或者绑定确有该闭包的已授权 runner。官方 npm runtime、插件编译输入、自制 SDK 分发分别记账。再次只跑旧 macOS 准备树不能关闭这个缺口。

## 两个辅助脚本的本地审修

原 run-consumer.mjs 对固定 evidence/run-prepared 使用覆盖写入；prepare-inputs.mjs 的 verify/compare 也会覆盖固定回执。为保留成功和失败历史，本轮只修复 CI 任务根中的这两个脚本：

- run-consumer 必须传 `prepared|source-only --run-root /绝对/新目录`；原子创建运行目录，证据/包/home/tmp 放在该目录下。
- prepare-inputs 的每个模式必须传 `--evidence-root /绝对/新目录`，验证模式继续要求原绝对 upstream/build-tools。
- 根路径缺失、相对或已存在时，在执行子命令/网络前拒绝；记录使用 wx，不覆盖既有记录。父目录须已存在。
- 原日志里的旧命令保持历史原文；不要使用旧无输出根命令重跑。没有为验证该修复重跑真实构建或下载。

本轮实际新增为 24 个 CLI/轻量夹具检查及两次 node --check，均通过；轻量消费者/空 binding 只验证执行前拒绝和记录保护，不算 SDK 构建成功。精确命令、补丁和前后摘要见 `ci-script/`。原 evidence/pack、公开 tarball 和源码树摘要保持。

Ubuntu、GitHub Actions、八仓远程建仓、push/PR、宿主新组合、真实业务和发布均未执行；SDK BLOCKED、产品 PARTIAL、release_ready=false。本轮没有 commit，主树只增量补当前审查入口及新证据，既有产品修改、VERSION、旧 journal 保持。
