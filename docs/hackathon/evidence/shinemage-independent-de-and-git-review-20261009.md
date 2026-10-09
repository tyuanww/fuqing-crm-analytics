# D/E 五仓与三仓 Git 交付审查（2026-10-09）

主集成树实际基线为 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`，开工 porcelain 100 项、6818 字节，SHA-256 `fa1658616c0a4486b4f279d83943890509a5515164a4421f0bed905f05b50e01`，暂存区为空。D/E 交接里更早的 98 项及其摘要属于各自执行时点；三仓 Git 交付已新增两份证据，不能把旧摘要当本轮基线。

本轮接收用户的三个交接：D 线三个叶子仓、E 线两个图表仓，以及 Workbench/CRM/Knowledge 的本地提交与真实 clone。没有整树复制、重跑全量 B0 或提交。原始证据共 355 份（含实际内容包）按摘要复制到 `.context/checks/independent-de-and-git-review-20261009/archive/`，来源索引为 `archive-manifest.json`。原任务证据不改，r1 失败与有限隔离记录保留。

机器摘要：[shinemage-independent-de-and-git-review-20261009-validation.json](./shinemage-independent-de-and-git-review-20261009-validation.json)。各审查对象、原日志、源码和包成员复核详见该目录的 `leaf/`、`chart/`、`git-delivery/` 中 review 与 machine 记录。

## 九个现有插件的阶段

| 插件 | 本地作者工程 | 本地提交 / 真实 Git clone | 远程仓 / 完整 CI |
|---|---|---|---|
| shine-brand | 已完成 | 沿用已验收结果 | 沿用已核验的私有远程仓、clone、CI 证据；本轮未查询远端或变更 PR |
| analytics-workbench | 已完成，固定 SDK | `cc1dd6a972c85bb0ef0d7f7131edd72e62335dc1` / r2 已验 | 无 remote；现 workflow 只跑边界检查，完整 CI NOT_RUN |
| crm-knowledge | 已完成，固定 SDK | `12b8259351d7e64429336faca96a175aad77d517` / r2 已验 | 无 remote；固定 CI 输入供应 OPEN |
| knowledge | 已完成，固定 SDK | `d9e26776905cc00f57c550dd08318e37ee1d1b21` / r2 已验 | 无 remote；固定 CI 输入供应 OPEN |
| shine-query | 本地独立作者仓，原隔离结果已复核 | 无提交 / NOT_RUN | 无 remote / NOT_RUN |
| shine-board | 本地独立作者仓，原隔离结果已复核 | 无提交 / NOT_RUN | 无 remote / NOT_RUN |
| shine-crowd-action | 本地独立作者仓，原隔离结果已复核 | 无提交 / NOT_RUN | 无 remote / NOT_RUN |
| shine-funnel | 本地独立作者仓，原隔离结果已复核 | 无提交 / NOT_RUN | 无 remote / NOT_RUN |
| shine-waterfall | 本地独立作者仓，原隔离结果已复核 | 无提交 / NOT_RUN | 无 remote / NOT_RUN |

shine-brand 只引用[既有远程记录](./shinemage-shine-brand-remote-20261008.md)，没有本轮远程重验。其他八仓仍需要固定 upstream/build-tools，不是已移除 checkout 的公开 npm 严格构建。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false。

D 线三包目前都是能力标记入口，apply 测试不等于问数、组板或人群行动业务已经从 analytics-workbench 拆出；shine-board 不等于完整驾驶舱。E 两包保留已有计算与公共 subpath。当前里程碑是九个既有插件包都有作者工程，不宣称九项完整运营业务均已独立验收。

## D/E 输入与原始验证

D 线根目录：`/Users/hutou/.codex/tasks/shinemage-leaf-independent-20261009/`，分别为 `dsh-shine-query`、`dsh-shine-board`、`dsh-shine-crowd-action`。E 线根目录：`/Users/hutou/.codex/tasks/shinemage-chart-independent-20261009/`，分别为 `dsh-shine-funnel`、`dsh-shine-waterfall`。各线原交接在根目录 `evidence/HANDOFF.md`。

五仓均为 unborn main，无提交、无 remote。D 每仓 27 份作者输入；E 每仓 29 份。原源码分类及变更复核成立：query/crowd/funnel/waterfall 仅解除 build 和 lifecycle 测试的路径耦合；board 保留了主树两份 dirty 文件，没有以 HEAD 旧版覆盖。业务计算、几何、视觉、包 ID/版本/peer 未变。

共同固定 Node 24.19.0、pnpm 11.28.2、DSH rc2 上游 `477b4f42`、已安装 build-tools、kit SHA-256 `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901`。E 两仓额外消费本仓 board-components 0.1.0 tarball，SHA-256 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。

五包原 build 没有单独 tsc：**NOT_IN_CURRENT_BUILD**。bindToolchain 检查 TypeScript/esbuild 版本不是类型检查通过。没有新增类型检查或删除原检查来制造独立化结论。

| 插件 | 原本包测试，均 0 FAIL / 0 SKIP | 作者边界 | 留存内容包，逐字节已复算 |
|---|---|---|---|
| shine-query | lifecycle 2 PASS | 5 PASS | 1431 B / 5 成员；`f19fc60ce50f4a963367282031d7c2071258ba75e9bd5649de6530d605bae98d` |
| shine-board | lifecycle 2 PASS | 5 PASS | 1514 B / 5 成员；`0bcf6ed8310f97e65771df56a5940eb4d418a4d43a38a25c0eae05705173115c` |
| shine-crowd-action | lifecycle 2 PASS | 5 PASS | 1600 B / 5 成员；`dfbd9279394853aa8afca82391327b21c7e769d894b734c4860c509ad6918d94` |
| shine-funnel | 计算 2 PASS；lifecycle 1 PASS | 7 PASS | 2409 B / 8 成员；`ba1f9cd941d67447ee19e29eaf1810c27dfb6ac738da366584aab2a28148105d` |
| shine-waterfall | 计算 1 PASS；lifecycle 1 PASS | 7 PASS | 2871 B / 8 成员；`d98ee03ea678aacec87d1e6f39aecac43f741f728a90da5de1c5c0541fe021f9` |

原 install/check-inputs/build/test/pack 均有 exit 0 日志。以上不属于本轮重跑，不跨包相加。E 两包导出的 funnel.d.mts / waterfall.d.mts 与固定领域包声明逐字节相等，六份 lib 与主树已跟踪产物相等。D 每仓两个 JS 与主树对应产物相等。manifest 仅由 pnpm 去掉 packageManager，未修改身份。formal packPlugin、candidate、宿主/headed/WSL 和生产均 NOT_RUN。

历史临时副本已删除。D 保存了打包时七份 plugin 源摘要，未保存全部作者脚本/锁的执行前封存；E 同样没有完整构建前副本清单。本轮可核对现存作者输入、原脚本、探针和包成员，不能追认完整历史签名执行证明。策略在广泛读权限后拒绝列出的 .codex/Desktop 等路径，再放行 SDK 输入和自身副本；不是整机 deny-default。E 保存的环境字段是显式覆盖记录，未通过 env -i 清空所有继承变量。

## 本轮发现与最小修复

D 三仓原 `scripts/verify-pack.mjs` 用默认 cpSync 保存同名内容包，独立调用可覆盖既有证据。E 两仓虽然先 stat 拒绝已有输出，但 stat 与复制之间出现新文件仍会被覆盖。两类 P2 均改为 `copyFileSync(..., constants.COPYFILE_EXCL)`，运行时业务源码与发布成员不改。

- D 每仓只改 verify-pack 和当前作者 provenance 两文件；改前脚本、清单、差异均封存。原任务 HANDOFF/extract-manifest/日志不变。
- E 每仓只改 verify-pack；既有 provenance 不包含该脚本摘要，无需改历史输入记录。具体最终文件差异以 chart 审查记录为准。
- 本轮新验证在独占副本中，从已核验留存包复用 lib 成员，执行真实 pnpm pack。没有安装、编译、完整隔离构建或本包测试重跑，不能将其记成新构建通过。

| 范围 | 实际新增检查 | 结果 |
|---|---|---|
| D 三仓，逐仓 | 首次真实打包保存，再次同名保存 | 各自 exit 0 → exit 1/EEXIST，原包摘要不变 |
| E 两仓，逐仓 | 修前受控竞态；修后首次保存、普通重复和预检后竞态 | 修前可复现覆盖；修后首次 exit 0，重复 exit 2，竞态 exit 1/EEXIST，既有字节保留 |

E 的竞态夹具只在验证副本通过 preload 在实际复制前创建目标，触发真实文件系统拒绝；没有临时改生产源码来测试。命令、cwd、环境、原始日志、重复写入结果和补丁分别在 `leaf/pack-repeat-r1/`、`chart/pack-fix-verification/`。保留修前失败证据；新打包字节与各自旧包相同，但不继承正式候选身份。

## 前三仓 Git / r2 的独立复核

[执行方汇总](./shinemage-independent-abc-git-delivery-20261009.md)已逐项对原件核验：三仓均一个无父提交、作者 clean、无 remote。609/65/40 个 tracked 文件分别读取 Git blob、作者工作区和 r2 工作区，全部同字节；提交不含 lib/node_modules/store。r2 的 clone 命令为 git clone --no-local，同 SHA/tree、无 alternates。原三仓未在本轮修改。

Workbench 原 r2 为 host/client 严格检查与 193 PASS；CRM 为严格检查与 103 PASS；Knowledge 为严格检查及 graph 22、client 5、package 5、identity 12、boundary 5 分组通过。各 step 的实际 argv/cwd/sandbox 与日志匹配。三份实际留存 tgz 的摘要、长度和逐成员均吻合回执；第二次独占保存 exit 1/EEXIST 与 wx 实现吻合。本轮不重跑。

r2 只拒绝明确列出的产品树、三个原作者仓及 r1 等路径；其他任务副本或另外两个 r2 未全部禁止。当前 Git/作者/clone 同字节可支持本地交付关联，不追认历史运行前后全源签名。CRM r2 有一份未跟踪 pnpm 缓存，不影响 tracked 和作者 clean，不为此删除证据。

没有新的运行时产品增量或新 P1/P2；完整 CI 输入供应缺口仍 OPEN。Workbench workflow 只有边界检查，CRM/Knowledge 路径变量不会在 hosted runner 创建实际 SDK 输入。不得删除构建/类型检查门禁换绿色 CI。

## 下一项

1. 五个 D/E 作者仓按各仓授权完成首次功能提交；纳入本轮排他保存修复，再从精确提交做真实 clone。无需重做源码提取或新一轮 SDK 全审。
2. 为尚未完成远程交付的八仓确定实际可获取的固定开发输入和完整 CI，再按对应授权建远程/push/PR。宿主安装、插件编译、SDK 分发分别记账。
3. CRM/知识真实服务、完整业务边界、官方 npm 宿主组合与单独 DSH 升级继续原任务，不因作者工程齐备而关闭。

本轮无 commit/远程操作；主树只更新五份当前文档并新增本证据/机器摘要，继承产品修改、VERSION、旧 candidate/journal 保持。T1/T15/T19/T21 不整体勾完。
