# 缩减 SDK 安全归档、接收与来源盘点（2026-10-07）

> 本页保留实施阶段证据；后续已完成提交前审修并随同一批本地提交收录。当前结果、修复候选与剩余任务以[本批审修记录](dsh-g0-kit-sdk-supply-review-20261007.md)为准，以下“未提交/没有新 commit”为当时状态。

从干净的 `codex/plugin-boundary-review@d9770b9c` 继续 T15；上一批 33 文件已经本地提交，本批为后续未提交增量。完成 **Mac 同平台、显式双摘要的缩减 SDK 归档往返及接收副本消费**。产品和 T15 整体仍 **PARTIAL / release_ready=false**，没有 push、发布、杭州切换或真实 DuckDB 访问。

## 实现和维修

- 扩展已安装 kit 的同一个 `sdk-archive.py pack/receive`，增加显式 `--closure-sha256`；默认完整格式保持。缩减格式为 `shinemage-development-sdk-closure-archive/v1`，接收必须同时提供传输包 SHA 与内部 SDK 清单 SHA，不从包内推断或降级模式。
- 保留 `sdk-closure.json` 原始字节，要求内外 entries 一致；继续校验 schema/pin/OS/arch/Node、内容块摘要、权限、ZIP 目录/文件/总量限制与封闭链接。接收后运行同一 Node `check.mjs`，不加载 SDK 程序、不联网、不覆盖既有目标。失败只清理本次 staging 并保留 BLOCKED 回执。
- 修复 Python 链接解析：不能先对整条路径做 `normpath`，否则会擦除未声明的中间路径或误判目录链接之后的 `..`。现在逐段解析声明图，与 Node 校验的语义一致。
- 修复输出保护：打包输出落在源 SDK 内时，原顺序会先创建输出目录再拒绝；现在在任何写入前拒绝，包括通过目录别名进入源树。隔离夹具及真实安装入口均核对输入完全不变。
- 17 项不透明内容记录精确路径、摘要、归属包、声明版本/许可证和只读格式观察，并逐项与原归档文件摘要比对。没有执行这些二进制来“审计”，没有删除它们或增加 secret scan 豁免。

## 固定输入和实际产物

原始证据：`.context/checks/kit-sdk-compact-transport-20261007/`。控制器快照与摘要为 `controller-source/`、`controller-sha256.json`，实际安装的 r2 `sdk-archive.py` 与最终源码字节一致。

| 项 | 本轮结果 |
|---|---|
| 固定 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 原完整归档 SHA | `9ceeb884c014fa374a65c593b0e402396b9d06c509aceeed44f42b32b38056d5` |
| 原缩减输入 | `../kit-sdk-closure-20261007/closure-r9`；未改写 |
| 保持不变的 closure SHA | `7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6` |
| 最终传输包 | `pack-r2/sdk.zip`，**63746942 字节（63.75 MB）** |
| 最终传输包 SHA | `fb6e0d2af05cfe4dfa4b98fc4eaa06094ab065cd7ec652c09d96bb82241d15d6` |
| 内部传输 manifest SHA | `932b9cbc75758bb53ae97f5517443a6ae0a0b63d848f834d42da3e613f3ff498` |
| 内容 | 30540 条记录、26190 文件、1261 链接；227713472 逻辑字节、21549 个去重 blob |
| 实际接收副本 | `received-r2/`，SDK 清单与原目录逐字节一致 |
| 传输体积比较 | 原完整 ZIP 811766966 → 63746942 字节，减少 **92.15%**；没有混比压缩与逻辑大小 |

`pack-r1`/`received-r1` 是首次通过的阶段输入；随后修复源目录输出保护，重新离线安装最终 kit 并生成 r2，旧记录保留。ZIP 时间字段导致两次外层 SHA 不同，内部 SDK 清单和文件身份相同；最终证据以 r2 为准，不替换旧回执。

## 本次实际验证

| 验证入口 | 结果与证据 |
|---|---|
| Python 3.14 `-m pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py` | **27 PASS / 41 subtests PASS**；`archive-tests-r2.log`。含完整/缩减两种格式 |
| Node 24 `--test scripts/release/sdk-closure.test.mjs scripts/release/sdk-content-audit.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs scripts/dsh-b0/clean-build.test.mjs` | **38 PASS / 0 SKIP**；`guards-r1.log` |
| 实际 `pnpm pack` 和新 store 离线安装 kit | PASS，`kit-r2.tgz`、`kit-pack-r2.log`、`kit-install-r2.log`；只安装源码/固定锁与检查入口 |
| 已安装 kit `sdk-archive.py pack --closure-sha256 …` | **LOCAL_READY / 0**，14.923 秒；`pack-command-r2.json`、`pack-r2.log` |
| 已安装 kit `sdk-archive.py receive --sha256 … --closure-sha256 …` | **LOCAL_READY / 0**，12.313 秒；`receive-command-r2.json`、`receive-r2.log` |
| 接收副本 `node --test scripts/dsh-b0/plugin-kit.test.mjs` | **10/10 消费者构建及选定测试通过，外层 15 PASS / 0 FAIL / 0 SKIP**；`received-consumer-command-r2.json`、`received-consumers-r2.sb`、`received-consumers-r2.log`、`received-consumer-result-r2.json` |
| 真实 CLI 拒绝错误 archive SHA、错误/遗漏 closure SHA、已有目标 | **4/4 拒绝，退出 2**，无 staging 残留；`negative-cli-r1.json` |
| 最终安装入口拒绝输出到源树（直接/别名） | **2/2 拒绝且无输入写入**；`installed-output-guard-r2.json` |
| 新共享解析器只读检查原完整 812 MB 归档 | **PASS**，141091 条记录，10.683 秒；`legacy-archive-result.json` |
| 最终接收副本内容审计 | **0 命中 / 17 覆盖缺口，PARTIAL / 退出 2**，17.340 秒；`received-audit-r2.json`、对应 command/result |
| 保护核对 | 原 SDK 124231 条、原接收清单 141091 条、旧证据 1318 文件、candidate/journal 保持；`integrity-after.json` |
| 差异和文档入口核对 | `git diff --check` PASS；README、verification、STATUS、TODO 与本记录同步 |

10 个消费者为 board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench。每次独立安装 kit、只复制当前消费者；工作台执行已有 8 个合同测试文件。使用全新 HOME/TMPDIR/store，禁止外网，只允许 synthetic loopback；原缩减 SDK、完整归档/接收树、旧依赖和 r1 副本禁止读取，最终接收 SDK 禁止写入。不是整台新机器、全部前端测试或完整宿主验收。

## 不透明内容与未关闭门禁

`opaque-inventory-r1.json` 按同一 closure SHA 完成 **17/17** 归属及源字节核对：

- 6 个 PNG/GIF，归 `rc-tree@5.13.1` / `rc-tree-select@5.27.0`。
- 3 个 WOFF2，归固定 DSH `ui-theme@0.1.7-rc.2`。
- 8 个原生工具/模块：`@reflink/*@0.1.19` 四份、pnpm 11.7.0 自带的 fastlist 两份、`@esbuild/darwin-arm64@0.25.12` 一份、`node-addon-require-builtin-darwin-arm64@0.1.6` 一份。

格式/包名/许可证是本地观察或包自述，**来源字节相同不等于发布者身份、无漏洞或二进制安全已验证**。记录维持 `RETAIN_GAP`，未把 17 个缺口变成 PASS。跨平台 pnpm 辅助文件保留原固定包内容，没有为了清零报告裁剪官方分发包。

下一顺序：按上述精确包/锁/摘要补供应链来源、完整内容审查与 SBOM/CVE/签名/撤销证据；再对目标 Linux/WSL 准备其本平台 SDK，执行同一入口的冷验证；之后继续物理分仓门禁。Mac 包不能直接作为 WSL 包或杭州运行时。

本轮完整 pipeline、目标平台/WSL、真实浏览器/模型/UAT、远端 CI、生产激活/回退均 **NOT_RUN**；没有新 commit 或远端写入。本批只关闭 T15 的同平台安全传输及消费子项，不把整体 T15 勾完。
