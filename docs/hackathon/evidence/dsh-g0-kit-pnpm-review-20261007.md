# T15：pnpm 候选提交前审核与修复（2026-10-07）

基线 `codex/plugin-boundary-review@efbf5417`。按用户指定的 OCR delegate 工作流，由当前 Agent 完成审核；OCR 仅执行文件选择和规则解析，没有调用外部模型。用户授权本地 commit；本批不 push、不发布、不修改杭州、上游源码或默认工具链 pin。

## 审核覆盖

`ocr delegate preview --format json` 返回 10 文件：3 个代码文件可审，7 份 Markdown 因 `unsupported_ext` 被 OCR 排除；这 7 份文档另行人工核对。3 个代码文件取得同一 JavaScript 规则组，并结合仓库规则和提交前 review checklist 审查调用链、子进程、临时目录、版本/产物约束及证据范围。新增本记录亦核对。

| 文件 | 状态 | 审核重点 |
|---|---|---|
| `dsh-plugins/board-components/build.mjs` | reviewed / modified | 精确声明、实际版本、拒绝时无产物、图表包摘要 |
| `scripts/dsh-b0/package-inputs.test.mjs` | reviewed / modified | 负测只用自有副本，版本错误在写输出前失败 |
| `scripts/dsh-b0/plugin-kit.test.mjs` | reviewed / modified | 真安装、10 消费者、候选输入、默认模式和隔离边界 |
| `CHANGELOG.md` | reviewed / modified | 行为描述与实际修复相符 |
| `STATUS.md` | reviewed / modified | 初验/审修分开，保留 PARTIAL/BLOCKED 与下一步 |
| `docs/hackathon/TODOS.md` | reviewed / modified | 只关闭候选子项，不勾选正式迁移/分发 |
| `docs/operating/verification.md` | reviewed / modified | 候选必需参数、默认 SKIP 和验证范围 |
| `docs/plans/shinemage-plugin-platform-split.md` | reviewed / modified | 依赖迁移顺序及不修改上游原则 |
| `dsh-plugins/plugin-kit/README.md` | reviewed / modified | 候选入口可复现，不把试验写成默认升级 |
| `docs/hackathon/evidence/dsh-g0-kit-pnpm-candidate-20261007.md` | reviewed / added | 原始结果/失败保留，新审核另列 |
| 本记录 | reviewed / added | 发现、复现、修复、实际结果与未执行范围 |

覆盖：OCR reviewable **3/3**；原始变更 **10/10**，含本记录 **11/11**。`total_files=11`、`reviewed_files=11`、`skipped_files=0`、`coverage_rate=100%`。机器记录位于 `.context/checks/kit-pnpm-review-20261007/` 的 `preview.json`、`rules.json` 和 `review-final.json`。

## 发现及维修

**Medium / test，已修复：候选 manager 模式在没有 SDK 时仍绿色退出。**

位置：`scripts/dsh-b0/plugin-kit.test.mjs` 的真实安装/消费者测试。原逻辑对显式候选仍沿用默认模式的可选 SDK；漏传 `B0_BUILD_UPSTREAM` 时只构建 board-components，另外 9 个消费者 SKIP，却返回 0。实际复现为 **2 PASS / 9 SKIP / exit 0**，见 `logs/missing-sdk-before.log`。该结果会误导只检查退出码的候选验证流程；上一轮完整 A/B 已明确传入 SDK 且 0 SKIP，其证据不受此漏传问题影响。

修复：仅对显式 `B0_TEST_PNPM_VERSION` 要求 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS`、`COREPACK_HOME` 为显式绝对路径；缺项/相对路径在创建打包目录前返回 `KIT_TEST_CANDIDATE_INPUT_REQUIRED <变量名>`。不回退仓库工具或个人缓存，不修改默认测试允许明确 SKIP 的行为。目录存在性、内容身份和 closure 仍由真实 Corepack/SDK 检查器核验，不增加另一套 SDK 校验。

新增 6 个子进程负例覆盖三个参数各自缺失/相对路径。`logs/guard-red.log` 先失败；修复后 `logs/guard-green.log` 通过。原复现命令修复后 **exit 1**，明确报缺 upstream，见 `logs/missing-sdk-after.log`；这是负测预期拒绝，不是开放故障。

## 修复后的实际验证

Node 24.19.0，沿用已固定、只读的缩减 SDK；新旧 manager 分别使用已核对的缓存、自有 HOME/TMPDIR，并沿用禁止外网、旧 SDK/仓库现成依赖不可读、当前 SDK 不可写的 sandbox。

| 命令 / 范围 | 结果 | 本轮证据 |
|---|---|---|
| `node --test scripts/dsh-b0/plugin-kit.test.mjs`，pnpm 11.28.2 候选 | **17 PASS / 0 SKIP，10/10 消费者** | `candidate-command.json`、`candidate-result.json`、`logs/candidate.log` |
| 同一测试，默认 pnpm 11.7.0 对照 | **17 PASS / 0 SKIP，10/10 消费者** | `baseline-command.json`、`baseline-result.json`、`logs/baseline.log` |
| `node --test scripts/dsh-b0/package-inputs.test.mjs scripts/dsh-b0/clean-build.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs` | **25 PASS / 0 SKIP** | `guards-command.json`、`guards-result.json`、`logs/guards.log` |
| `verifySdkClosure` 只读检查 | **30540 条目 / 227713472 字节通过** | `sdk-verify.json` |
| 默认 pin、包声明、锁和补丁 / 候选 manager 缓存 / candidate 与 journal | 原字节保持 | `review-final.json` |

两版图表 tarball SHA 仍为 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。10 消费者与工作台 8 个选定测试文件的范围沿用[初验证据](dsh-g0-kit-pnpm-candidate-20261007.md)。空 store 111 包冻结安装及其严格类型检查是上一实施轮记录，本次没有重跑或冒充本次新结果。复现执行器首次拒绝重用已有临时目录后改用新的 after 目录，没有覆盖原失败证据。

## 结论与交付边界

本次范围没有未关闭的 Critical/High/Medium 发现。修复及原候选兼容改动随本次本地提交收录，父提交 `efbf5417`，精确提交号以 Git 为准；正常 hooks 执行，不绕过检查。

后续顺序保持：先拆清官方 DSH 声明与自有插件 manager 的配置职责，再受控迁移默认 pin/prepare/CI 和生成新 SDK；其余官方依赖、信任/供应链、WSL/干净机器验收仍开放。旧 SDK 的 10 个版本/42 条公告结论本次未重查、未关闭。产品仍 PARTIAL，SDK 分发仍 BLOCKED；不能据此宣称整个系统、远端 CI 或生产验收通过。
