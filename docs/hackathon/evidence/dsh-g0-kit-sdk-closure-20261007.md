# 插件开发 SDK 缩减与隔离消费（2026-10-07）

本轮继续 T15，基于 `codex/plugin-boundary-review@78175422` 的已有工作树增量；没有新增 commit、push、Release、生产切换或真实数据库访问。关闭的是 **Mac 同平台、固定摘要的 SDK 构建/测试输入缩减**，T15 整体和产品仍 **PARTIAL / release_ready=false**。

以上及下文测试数是生成阶段的记录；随后已完成 [OCR 审修与提交](dsh-g0-kit-sdk-review-20261007.md)，修复链接中转校验并重跑两条 SDK 消费路径，随本次本地提交收录。历史失败与 `r9` 输入保持，不以此覆盖原证据。

## 实现与用途

仓库维护者从已验证的完整 SDK 归档提取新目录，业务插件复用这份固定输入。提取与分发审计不加入每次插件开发流程；完整 checkout 保留用于 SDK 维护，不再作为本轮支持的插件消费者构建前置。它不是完整宿主 runtime，也不是数学意义的最小集合。

- `scripts/release/sdk-closure.mjs` 从 26 个固定 SDK 入口、编译工具、已安装 runtime/peer/optional 依赖和发布声明引用构造清单。纯类型依赖不携带运行程序；缺少必需依赖拒绝，不猜测安装版本。
- kit `sdk-closure.mjs` 在加载工具前验证显式摘要、schema/pin/平台/Node、每个文件的内容/模式、额外文件与封闭链接。没有显式摘要仍走原 Git 校验；错误摘要不能回退。`check.mjs` 与真实构建复用同一验证器。
- 现有工作台测试改用 kit 的输入校验及 React/bundler 加载器，替换测试内分散的 Git 和 `apps/web` 假设。保留功能断言；官方 Agent Loop testkit、client modules 注册器、JSDOM、Store 所需 Zustand/Immer，以及八个精确宿主合同测试文件纳入固定输入，不修改上游源码。
- `sdk-content-audit.mjs` 支持缩减清单，沿用原秘密模式和缺口语义；没有目录豁免。受控复制入口、包 files、B0 防护测试清单与边界 inventory 同步。

## 不可变输入与结果

证据目录：`.context/checks/kit-sdk-closure-20261007/`。原归档仍为 `../kit-sdk-archive-20261007/pack-r2/sdk.zip`，原接收目录仍为 `received-r1`；没有覆盖原输入。

| 项 | 本轮实际结果 |
|---|---|
| DSH pin | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 原归档 SHA-256 | `9ceeb884c014fa374a65c593b0e402396b9d06c509aceeed44f42b32b38056d5` |
| 最终目录 | `closure-r9/` |
| closure SHA-256 | `7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6` |
| 平台 | darwin-arm64，Node 24.19.0，pnpm 11.7.0，Python 3.14 |
| 提取 | 25.073 秒，退出 0，`LOCAL_PROJECTED`；`command-r9.json` / `projection-result-r9.json` |
| 内容 | 30540 条清单记录：26190 文件、1261 链接，其余为目录；227713472 逻辑字节 |
| 体积比较 | 原完整输入 2195784674 → 227713472 逻辑字节，减少 **89.63%**；约 2.20 GB → 227.7 MB。未将压缩 ZIP 大小与未压缩大小混比 |
| 依赖 | 331 包，其中 297 为运行/测试输入、34 仅类型；4370 条声明关系 |
| 保留的已知限制 | 26 条原完整输入也无法解析的声明引用、37 条未安装 optional 关系在 receipt 明示；不能据此宣称所有 SDK 消费者兼容 |

`controller-source-r9/` 与 `controller-sha256-r9.json` 保存本轮实际提取器、验证器、规则、kit 和消费者入口来源。提取回执的 `consumers=NOT_RUN` 保持生成时事实，后续结果由单独证据绑定同一 closure SHA，不改写旧回执。

## 实际验证

| 验证 | 结果与证据 |
|---|---|
| 真实安装 kit + 缩减 SDK | **10/10 消费者构建和选定现有测试 PASS**；外层套件 15 PASS / 0 FAIL / 0 SKIP，63.975 秒。`consumer-command-r9.json`、`consumer-r9.sb`、`consumers-r9.log`、`consumer-result-r9.json` |
| 原完整 SDK 回归 | **10/10 PASS**；外层套件 15 PASS / 0 SKIP，28.831 秒。`legacy-command-r3.json`、`legacy-consumers-r3.log`、`legacy-result-r3.json`；之后只补投影输入，没有再改消费者测试或 kit 验证实现 |
| 提取/验证、审计、边界、复制防护 | `node --test scripts/release/sdk-closure.test.mjs scripts/release/sdk-content-audit.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs scripts/dsh-b0/clean-build.test.mjs`：**35 PASS / 0 SKIP**；`guards-final-r9.log` |
| 实际 CLI | 正确 closure SHA → READY/0；错误 SHA → KIT_CLOSURE_DIGEST/2；省略摘要 → KIT_INPUTS_UNAVAILABLE/2。`cli-checks-r9.json` |
| 边界 inventory | `node scripts/dsh-b0/plugin-boundaries.mjs --check`：11 包、28 跨包边、644 源文件、74 动态引用；已核对生成差异 |
| 格式 | `git diff --check` PASS |

消费者是 board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench。每次在只有当前消费者的临时目录实际离线安装 kit；没有相邻 kit/插件源码。工作台执行既有 8 个合同测试文件，其余按 `plugin-kit.test.mjs` 的明确文件清单；这不是全部前端、完整 pipeline、真实浏览器或完整宿主启动验收。

缩减版验证使用新 HOME/store/TMPDIR，外网禁止，只允许本次 synthetic loopback HTTP。原 SDK、原完整归档及接收目录、旧迁移/缩减目录、仓库及插件现成 node_modules 均禁止读取；当前缩减 SDK 禁止写入。这比“把 SDK 路径改到另一目录”更强，避免意外借用旧环境。

## 内容审计与保护

`node scripts/release/sdk-content-audit.mjs --root /abs/closure-r9 --closure-sha256 <上述摘要> --output /abs/new-report.json` 实际报告为 `content-audit-r9.json`，11.628 秒、退出 **2 / PARTIAL**：

- 26190 文件、227713472 字节核对并执行有界模式检查；1261 链接核对。
- **0 个疑似命中，17 个覆盖缺口**：10 个 binary-or-nontext（图标/字体/esbuild）及 7 个 native-or-wasm（Corepack 原生辅助与一个固定原生模块）。这些文件仍在清单中，未以摘要相同或平台不同豁免安全检查。
- 原完整包的 55 个命中文件均未进入缩减清单。选择依据是发布 files、必要依赖与合同测试入口，没有按扫描结果改写上游或扩大秘密规则豁免；原完整包的 BLOCKED 结论继续有效。
- `release_ready=false / supply_chain=NOT_VERIFIED`；零模式命中不等于完整内容或供应链安全通过。

`integrity-r8.json` 保留实际只读保护复核：原 SDK 124231 条、接收 manifest 141091 条、旧证据 1318 个文件保持；原 candidate 与 journal seq 6 保持。最终 r9 同样只在新目录生成，所有消费者由 sandbox 禁止改写原输入；没有生产或真实业务数据访问。

## 失败与修复链

所有失败记录仍在同一 evidence 目录，未冒充 PASS：

1. r1 构建缺少发布声明中引用、却不在 runtime manifest 的包；增加声明扫描和固定来源解析。
2. r2/r3/r4 分别暴露自引用、纯类型边误带运行程序、声明诊断字符串误作包名；分别处理自引用、区分类型/运行依赖、按合法包名解析，保留实际消费者类型检查。
3. r5/r6 补齐第三方声明链接后构建通过，但运行测试暴露官方 testkit 和分散 Git/apps/web 假设。
4. r7 暴露 JSDOM、Store 的 dev-only 运行依赖及剩余两处 Git 断言；统一校验并保留实际测试输入。
5. r8 严格隔离下工作台 40 项通过、1 项失败：client modules 注册器仍只有类型输入；将该官方测试入口列入运行输入，未删除断言。
6. r9 的完整消费验证最终通过；完整 SDK 路径也完成当前测试代码回归。

## 剩余任务

- T15 缩减格式的安全归档/接收与正式可分发 kit 尚未实现；旧 `sdk-archive.py pack/receive` 仍只处理完整 SDK 格式，不能直接拿来包装本目录。
- 17 项不透明内容审查，以及发布者签名/来源证明、SBOM/CVE、撤销策略未关闭。
- Linux/WSL、全新机器、其他 DSH 版本未运行；此 SDK 不可作为杭州运行包。完整 pipeline 与真实宿主/UI/UAT 本轮 NOT_RUN。
- 物理分仓及新插件生产激活仍按既有 stop/go 和现场授权门禁推进。本轮没有新增业务功能或改变杭州现役。

后续顺序是先补缩减格式的受控归档/接收和来源证据，再做目标平台冷验证，之后继续独立仓交付；不回到每次插件都重建完整 DSH 的路径。

## 待提交文件（含上一批审计增量）

- `CHANGELOG.md`
- `STATUS.md`
- `docs/architecture/shinemage-plugin-boundaries.json`
- `docs/hackathon/TODOS.md`
- `docs/hackathon/evidence/dsh-g0-kit-content-audit-20261007.md`
- `docs/hackathon/evidence/dsh-g0-kit-sdk-archive-20261007.md`
- `docs/hackathon/evidence/dsh-g0-kit-sdk-closure-20261007.md`
- `docs/operating/verification.md`
- `docs/plans/shinemage-plugin-platform-split.md`
- `dsh-plugins/analytics-workbench/src/client/cockpit-composition.test.mjs`
- `dsh-plugins/analytics-workbench/src/client/leave/host-leave-adapter.test.mjs`
- `dsh-plugins/analytics-workbench/test/built.test.mjs`
- `dsh-plugins/analytics-workbench/test/helpers/native-board-bridge.mjs`
- `dsh-plugins/analytics-workbench/test/helpers/sdk-inputs.mjs`
- `dsh-plugins/analytics-workbench/test/lane-g-delivery.test.mjs`
- `dsh-plugins/analytics-workbench/test/native-fixture-client-boundary.test.mjs`
- `dsh-plugins/analytics-workbench/test/native-prompt-inject.test.mjs`
- `dsh-plugins/analytics-workbench/test/native-slot-ownership.test.mjs`
- `dsh-plugins/plugin-kit/README.md`
- `dsh-plugins/plugin-kit/check.mjs`
- `dsh-plugins/plugin-kit/package.json`
- `dsh-plugins/plugin-kit/sdk-archive.py`
- `dsh-plugins/plugin-kit/sdk-closure.mjs`
- `dsh-plugins/plugin-kit/toolchain.mjs`
- `scripts/dsh-b0/clean-build.mjs`
- `scripts/dsh-b0/pipeline.mjs`
- `scripts/dsh-b0/plugin-kit.test.mjs`
- `scripts/dsh-b0/test_sdk_archive.py`
- `scripts/release/sdk-closure.mjs`
- `scripts/release/sdk-closure.test.mjs`
- `scripts/release/sdk-content-audit.mjs`
- `scripts/release/sdk-content-audit.test.mjs`
