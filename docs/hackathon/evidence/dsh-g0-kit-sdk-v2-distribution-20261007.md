# T15：v2 SDK 缩减分发、离线消费与当前风险

## 范围与结论

2026-10-07，按“先 commit，然后继续推进下一步”，前批 41 个文件经局部 `/review`、20 项专项验证和正常 hooks 提交为 **`fd3ed8b6a687d55ff36fff7d2198a304a39e9f46`**，主题 `refactor(plugin-kit): separate official and plugin package managers`。首次 commit-msg 因描述长度被拒，补具体正文后提交；没有绕过 hooks。

本轮从该干净提交继续 T15 新 SDK 的缩减、归档接收、消费者和供应链核验。**同平台开发路径通过，SDK 分发仍 BLOCKED，产品 PARTIAL。** 本轮新增代码/测试/文档经 2026-10-08 限定范围审查后随本次本地提交收录；本节描述的 2026-10-07 阶段没有 push、发布、杭州操作或真实业务数据访问。

工作树为 `codex/plugin-boundary-review`；原始证据目录为 `.context/checks/kit-sdk-v2-distribution-20261007/`，以下日志路径均相对此目录。SDK/归档只留本地忽略目录，不作为生产 runtime 或签名发布物。

## 输入、实现与产物

| 项目 | 实际值 |
|---|---|
| 官方 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| pin SHA-256 | `8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe` |
| 环境 | Darwin arm64，Node 24.19.0，Python 3.14 |
| 完整 SDK archive | 816,415,770 bytes；`3aadb81472bf50f0cf4defa44c9802fef1b2898c7fd43d103d258ff0de98c639` |
| 缩减 SDK archive | 64,974,828 bytes；`71b43981d4085c0be78532012ef2119c5d73ef1193dd85115ade014bae03e738` |
| closure SHA-256 | `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4` |
| 解包逻辑大小/条目 | 231,215,516 bytes；30,546 条（含文件、链接、目录） |
| 插件 manager | 仅 `11.28.2`；完整准备环境另保留官方 `11.7.0` |
| 生产 runtime | NOT_BUILT / NOT_INSTALLED，`release_ready=false` |

本次源码修改集中于 `scripts/release/sdk-closure.mjs` 和对应测试：按既有 `managerVersions(pin).plugins` 选择精确 manager 根目录，先验证包名 `pnpm` 和实际版本，再完整保留该版本目录；不把官方 manager 或其他 Corepack 缓存塞入插件开发包。没有裁剪 pnpm 自身文件，没有修改官方源、锁、SDK 字节、插件业务行为或归档拒绝条件。

此前生成的 r2 包仍携带两套版本，`manager-scope-before.json` 明确记录 FAIL；r3 真正只含插件 manager。已验证：缺失/伪装/错误版本的 manager 由新增负测拒绝，见 `logs/guards.log` 与本次 `.qa-evidence/002/receipt.json`。完整 prepare 与“消费已构建 SDK”职责不同，双 manager 环境测试不在插件专用包上冒充通过。

## 本次失败、调查与恢复

1. 首次完整 pack 退出 2 / `KIT_ARCHIVE_LINK_TARGET`（19.367 秒）。`link-diagnosis.json` 定位两条指向 `@deepseek-ai/libreoffice-kit-darwin-arm64@0.1.1` 的悬空链接。原冻结安装日志有该可选包下载失败，但 pnpm 仍成功；此前 SDK/消费者未使用 LibreOffice，成功构建不代表完整依赖图可归档。
2. 保持原 140821 条输入不动，创建新 `sdk-complete` 副本。使用旧 kit 对历史完整归档 `9ceeb884…` 校验，核对同一上游锁 SHA、精确包名/版本和逐文件摘要后，已核对 `input-recovery.json`，只恢复缺失 subtree 的 830 条记录（含父目录新增共 831 条）。未联网安装或运行恢复包脚本，未删除链接或放宽校验。见 `input-recovery.json` / `recover-input.py`。**这是新构建加历史同锁包的可追踪恢复，不能称完整包所有内容均来自本轮冷下载，也未重新验证该包 npm tarball SRI。** 缩减包不携带 LibreOffice。
3. 恢复副本的完整 pack 成功（71.310 秒）。首次 r2 receive runner 误把 CLI 操作 `receive` 改为目录标签 `receive-r2`，argparse 拒绝；只修正命令，原失败证据保留。实际 r2 receive 成功后，再修复缩减器的 manager 选择，输出全新 r3 目录。
4. 真实负测 runner 首次预期 `KIT_ARCHIVE_CLOSURE_DIGEST`，接收器实际更早以 `KIT_ARCHIVE_IDENTITY` 拒绝错误摘要。接收器行为正确，修正观测断言并在另一个新目录重跑 4 项；未修改生产接收器。原记录见 `negative-receive-r1-failure.json`。

## 本次验证

所有 Node 命令使用现有 Node 24；完整 argv/cwd/白名单环境保存在对应 `*-command.json`。消费者使用全新 HOME/TMP，已安装的本地 kit，且未设置 manager 候选覆盖变量。

| 入口/范围 | 实际结果 | 证据 |
|---|---|---|
| 当前提取器 + 已安装 kit `sdk-archive.py pack/receive` | r3 全通过；提取 49.933s / pack 21.453s / receive 19.477s | `stages-r3.json`、`result-r3.json`、`received-r3/receipt.json` |
| `node --test scripts/release/sdk-closure.test.mjs scripts/release/sdk-content-audit.test.mjs scripts/release/sdk-supply-chain.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs` | **56 PASS / 0 SKIP** | `guards-command.json`、`logs/guards.log` |
| `node --test scripts/dsh-b0/plugin-kit.test.mjs` | **17 PASS / 0 SKIP、10/10 消费者**，111.706s | `consumers-command.json`、`consumers-result.json`、`logs/consumers.log` |
| 安装 kit `check.mjs` 验证同一 closure（消费者前后） | 两次 READY，26 SDK / 32 bindings | `check-before-result.json`、`check-after-result.json`、对应日志 |
| 实际 receive：错 archive、错 closure、缺 closure、已有目标 | **4/4 BLOCKED**；无 staging 泄漏，已有回执不变 | `negative-receive.json` |
| 内容扫描同一 received-r3 | **PARTIAL / 退出 2**；26,195 文件、1,261 链接，0 模式命中 / 17 覆盖缺口 | `content.json`、`logs/content.log` |
| 默认离线 SBOM/inventory | **PARTIAL / 退出 2**；360 带版本包清单、33 模块格式声明、1 无版本私有清单 | `inventory-offline.json` |
| 显式 OSV 查询 | **BLOCKED / 退出 2**；222 requested/queried/completed，5 次请求 | `inventory-osv.json`、`advisory-summary.json` |
| 当前 BOM 对保留的官方 CycloneDX 1.6 schema | 结构通过；错误 bomFormat 被拒；formats **NOT_VALIDATED** | `cyclonedx-validation.json` |
| 17 个不透明文件来源重核 | 当前字节匹配 5 个精确 tarball / 固定上游 3 字体；完整安全仍 PARTIAL | `opaque-provenance.json` |
| 原 SDK、旧候选/journal、领域包保护 | 140821 条原输入相同；candidate/journal SHA 与前批相同；图表包 SHA 不变 | `input-protection.json`、消费者日志 |

消费者测试覆盖 board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench 的实际独立构建与各自选定测试。沙箱禁止外网，允许合成 loopback，原完整 SDK、旧依赖、归档和中间目录不可读，接收 SDK 不可写；`consumers-r3.sb` 保存边界。不是全部业务测试、浏览器/UAT 或宿主实际加载。

## 当前告警与后续范围

当前新包的 222 个可查询版本全部完成，仅向固定 OSV API 发送公开包名/版本；不发送私有/workspace 名称、文件内容或凭据。使用系统公共 CA，未关闭 TLS。相比旧 pin 包的 10 个受影响版本 / 42 条不同公告，新包为 **7 个版本 / 29 条不同公告**：

| 依赖 | 固定版本 | 本次命中条数 |
|---|---|---|
| fast-uri | 3.1.3 | 8 |
| js-yaml | 4.2.0 / 4.3.1 | 3 / 1 |
| katex | 0.16.47 | 1 |
| source-map-js | 1.2.1 | 1 |
| undici | 7.28.0 / 8.10.0 | 15 / 11 |

各版本之间有公告重复，不能把上表相加作为不同公告数。7 个版本的清单路径均在固定 DSH `upstream/node_modules`；本次不改官方锁来伪造原 SHA，也不把静态命中直接称为生产可利用漏洞。插件 pnpm 11.28.2 及其带版本清单本次未命中，不覆盖无清单的打包成分；完整环境保留的官方旧 manager 不在本次缩减包查询范围。

17 项的来源字节本轮重新比较；签名/注册表信任沿用已留存证据，**未重新拉取公钥或核验撤销**。`rc-tree-select@5.27.0` 的过期密钥问题不因此关闭；3 字体仍按 OFL 1.1 来源声明，不能按所属包的 MIT 代替。二进制安全审查、完整依赖组成和发布者身份仍未通过。

下一步沿用已有队列：官方依赖升级候选/兼容及信任核验 → 新 v2 SDK 的目标 WSL/干净机器 → 未完成宿主/UI/生产形状准入 → stop/go 后物理分仓/独立远端 CI。SDK 维护动作保持独立，不进入每次插件业务修改。新工具链不等于新 DSH，杭州当前服务没有变化。

本次没有重跑完整 release/B0 pipeline、远端 CI、Windows/WSL、新机器、真实模型或业务 UAT；此前的通过与本轮结果分列。当前代码增量可供下一次审查，但 **未达到 SDK 签名分发或产品上线条件**。

收尾静态检查：两份修改的 JS `node --check`、`git diff --check` 通过，9 个新增 Markdown 链接目标存在；tracked pin/锁/领域输入未改。当前为 8 份 tracked 修改及 1 份新增证据文件，均是前批 commit 之后的增量。

## 2026-10-08 提交前复核

采用 `open-code-review-delegate` 的文件选择与规则解析，由当前 Agent 完整审查本次 9 个文件（2 个源码/测试、7 个文档），无跳过；范围为 `fd3ed8b6` 之后的工作区增量，不代表整条分支或 PR 已审。按仓库 `/review` 检查点复核 manager 身份、闭包路径、负测和证据层级；没有发现此增量需要修复的代码缺陷。

本次实际重跑：Node 24 下 `node --test scripts/release/sdk-closure.test.mjs` 为 **14 PASS / 0 SKIP**；对同一 `received-r3` 执行只读沙箱 `check.mjs` 为 **READY、26 SDK / 32 bindings**。详细 argv、cwd、stdout 与退出状态保存在 `.context/checks/sdk-v2-review-20261008/.qa-evidence/`；300 秒限时验证报告与 checkpoint 见该目录上级 `functional-report.md`。前述 56 项、10 消费者和在线 OSV 仍是 2026-10-07 的结果，没有改称本次重新执行。

本地提交保留正常 hooks；没有 push 或发布。后续供应链精化、WSL 与 HTML 差异盘查单独留证，不纳入这次 9 文件审查结论。
