# T15：pnpm 11.28.2 插件开发侧候选验证（2026-10-07）

从 `codex/plugin-boundary-review@efbf5417` 的干净工作树开始。**pnpm 11.28.2 在本机插件打包、独立安装和 10 个消费者构建范围通过；没有升级仓库 pin、官方 DSH 或生产环境。** 本页保留初次验证结果；后续审核修复及本地提交见[审修记录](dsh-g0-kit-pnpm-review-20261007.md)。产品仍 PARTIAL，SDK 分发仍 BLOCKED。

## 输入、隔离与修复

- 候选仍是上一轮固定的 pnpm 11.28.2，tarball SHA `30d4099fa03b9ba1124d81527808b1e4d8e719aeb0ddfe169426df3c4a038a5f`。先核对本地来源包，再用精确版本 + SHA-512 的 Corepack locator，在本轮独占 HOME/Corepack 目录准备；缓存 **454/454** 个原始成员重新与 tarball 比对通过。不是全局安装。
- 开发 SDK 继续只读使用旧 `received-r2`，closure `7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6`；上游仍 `477b4f420553e8a52c2fbccc464d7561b239c443`。SDK 编译器和依赖未用新 pnpm 重建，不能把消费者通过当作新 SDK 冷构建通过。
- 为现有 `plugin-kit.test.mjs` 增加仅测试使用的 `B0_TEST_PNPM_VERSION`：精确版本、实际 version 断言、显式 Corepack 调用、禁网/禁自动改 pin。只给独占的 kit/消费者副本声明候选版本，不修改仓库或官方源码，不关闭 pnpm 的版本检查。
- 修复 `board-components/build.mjs` 重复写死 pnpm 11.7.0 的问题：读取本包 `packageManager` 的精确版本并核对实际进程。默认声明仍为 11.7.0；浮动版本/实际版本不符，在写输出前拒绝。
- 最终候选与旧版的图表 tarball SHA 均为 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。原有三个消费者的锁字节保持，测试也不改临时锁或接受新摘要代替原摘要。

## 本次验证

证据目录：`.context/checks/kit-pnpm-candidate-20261007/`。Node 24.19.0；测试只用合成输入、临时目录与自有 loopback HTTP。

| 验证 | 实际结果 / 证据 |
|---|---|
| 固定候选版本与缓存来源 | PASS，`manager-result-r2.json`、`manager-files.json`；实际执行 11.28.2，454 个成员摘要一致 |
| 最终候选消费者套件 | **16 PASS / 0 SKIP，10/10 消费者**；`consumers-result-final.json`、`logs/consumers-final.log`，命令约 95.43 秒 |
| 最终旧版对照套件 | **16 PASS / 0 SKIP，10/10 消费者**；`baseline-result-final.json`、`logs/baseline-final.log`，命令约 103.67 秒 |
| 包输入/clean-build/插件边界回归 | **25 PASS / 0 SKIP**；`logs/guards.log`，含浮动/错误实际 manager 的隔离负测 |
| 新目录、空 store、固定锁安装构建依赖 | **111 个包安装通过**；`tools-command.json`、`tools-result.json`、`logs/tools-install.log`，约 109.50 秒；frozen-lockfile/ignore-scripts，未重新解析版本 |
| 安装后的真实 TS/React/Ant Design 合同 | PASS，`tools-typecheck.json`；使用新 node_modules 的 tsc，strict、skipLibCheck=false，Button/Table/DatePicker/createRoot 类型检查，无 DOM 执行 |
| 安装输入保护 | 当前副本 package.json、pnpm-lock、workspace、两个补丁与安装前字节一致；仅副本 packageManager 在安装前明确设为候选版本 |
| 原 SDK / candidate / journal 保护 | 全 closure 条目/链接/摘要复核，原 candidate/journal 摘要保持；`sdk-state-after.json` |

10 个消费者为 board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench。逐个源副本没有相邻插件/kit 源码；实际安装 kit，再构建与运行已有选定测试。工作台使用 8 个既有合同测试文件，不称为整个产品测试。消费者阶段外网禁止，原仓依赖/旧 SDK 目录不可读，复用的已审 SDK 和候选 Corepack 缓存禁止写入。独占消费者和临时进程随测试退出回收。

相关代码测试命令：

```sh
node --test scripts/dsh-b0/package-inputs.test.mjs \
  scripts/dsh-b0/clean-build.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs

# 下面是显式测试输入；缓存须事先按固定摘要准备。
# 两个构建路径必须属于同一已验证 SDK，缩减模式同时固定其 closure SHA。
B0_TEST_PNPM_VERSION=11.28.2 COREPACK_HOME=/absolute/candidate-cache \
  B0_BUILD_UPSTREAM=/absolute/sdk/upstream B0_BUILD_TOOLS=/absolute/sdk/build-tools \
  DSH_SDK_CLOSURE_SHA256=REVIEWED_CLOSURE_SHA256 \
  node --test scripts/dsh-b0/plugin-kit.test.mjs
```

不设置 `B0_TEST_PNPM_VERSION` 就沿用包声明，不自动使用候选。上述两个阶段使用不同 Corepack cache；实际完整环境和 sandbox 规则见 `consumers-command.json`、`consumers.sb`、`baseline-result.json`。两轮耗时有并行负载影响，不据此声称性能提升。

## 失败和根因保留

1. 首次版本探针目录未声明自己的 packageManager，向上找到了原仓的 11.7.0，pnpm 正确拒绝不一致。随后在独占 probe 中显式声明 11.28.2，未使用 warn/ignore 绕过；两份 manager 日志保留。
2. 首轮消费者为 11 PASS / 5 FAIL（含父测试）；board-components 的硬编码和隐式旧版本调用先失败，三个领域包消费者随后因缺 tarball 失败。其余 6 个消费者通过。修复生产脚本中重复版本常量，候选副本的嵌套调用统一选择真实候选。
3. 第二轮临时包内容断言错误地要求发布清单保留 packageManager，导致图表子项失败。进一步 A/B 实跑证明两版都会移除这个开发字段，最终包摘要完全相同。删除试验性的临时锁改写，恢复原摘要硬断言后，最终两版都通过。该问题是测试预期错误，**不是新 pnpm 造成产物漂移**。
4. 冻结安装经历慢下载告警，最终 111 包全部完成。安装器自己的“supply-chain policies”通过不等于本项目完整 CVE/发布者/撤销门禁通过。

## 下一步边界

本子项只关闭 **插件开发侧 manager 候选兼容与构建工具冻结安装**。首次默认 pin 迁移还要分别表达“官方 DSH 声明的构建 manager”和“我方插件/kit manager”，核对 prepare、Corepack、build-tools、CI 及新 SDK closure 的一致性；不能将单一 pnpm 字段整体替换成 11.28.2，否则固定上游 packageManager 校验会失败。

默认 pin 的受控迁移、官方 DSH SDK 的新来源构建/升级、Linux/WSL、新机器、完整 pipeline 和远端 CI 均 **NOT_RUN**。本次没有全 SDK 再查 OSV，因此不改写上一轮 10 个版本/42 条公告的 BLOCKED 结论；pnpm 自身候选的 27 份清单无命中是上一轮有明确范围的记录。生产激活/回退、真实模型和业务数据未操作。

这仍按“官方 DSH + 独立插件”的初衷推进：工具链变动单独验兼容，插件无需复制/修改上游；正常插件更新也不会执行整套 SDK 准备或供应链扫描。
