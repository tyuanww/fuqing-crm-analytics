# SDK 分发 BLOCKED 门禁收口盘查（2026-10-10）

本文件是只读/离线证据核对，不是新的 SDK 验收。未执行 `sdk-supply-chain.mjs`、OSV 查询、SDK prepare、网络请求、安装、native/PE 执行、签名或发布；未修改仓库文件。原始 JSON/归档目录未复制。

## 结论

当前产品仍为 **PARTIAL**，SDK 分发仍为 **BLOCKED**，`release_ready=false`。当前工作树 `codex/shinemage-abc-local-candidate` / `c0a417b7`；`scripts/release/sdk-supply-chain.mjs` 无工作树差异，SHA-256 为 `690034dea4f9a823ede52dc298b50bb44b0a29feb68a6aaf24f17eb81d947fba`。

这次能完成的最小本地工作是：把已跟踪的 STATUS/TODOS/SDK 证据对齐成 8 条顶层门禁的阻塞矩阵，并静态确认供应链检查器仍 fail-closed。它没有关闭任何门禁。

## 门禁矩阵

| 门禁 | 当前状态 | 现有证据 | 仍需材料/条件 | 可并行的本地工作 |
|---|---|---|---|---|
| `SDK-UPSTREAM-ADVISORIES` | **BLOCKED_UPSTREAM_RELEASE** | 固定 DSH 仍有 7 个受影响版本/29 条公告；已有候选查询但未安装/编译。 | 需要官方 upstream replacement release/commit，以及候选的身份、依赖和兼容核验。<br>外部条件：官方 upstream 发布物（外部）；随后本地候选安装/编译。 | 可先准备候选核验清单和兼容矩阵；不能在旧 pin 上伪造修复。 |
| `SDK-EMBEDDED-COMPOSITION` | **PARTIAL** | 官方 map 位置一致性、883 个仓库源 blob 和部分 store 源已核对；父门禁仍 PARTIAL。 | 需要实际 bundle recipe、完整 resolved build lock、每个保留嵌入组件及变换后字节。<br>外部条件：若缺少原始 bundle/build 输入，需要 SDK 原始归档或可复现构建环境；不是用户确认即可关闭。 | 可离线维护组成/来源缺口清单；不要接入 pipeline 或放宽默认 coverage。 |
| `SDK-FULL-PACKAGE-INTEGRITY-IDENTITY` | **OPEN** | 212 条 installed-package 仅有 lock sha512 声明；195/196 唯一 tarball 摘要匹配，仍有缺失、重复路径和网络失败分类。 | 需要剩余包的可验证 tarball/来源字节、120 个 workspace 源的来源边界处理，以及 1 个未在 lock 中的嵌套清单处置。<br>外部条件：剩余 registry/source archive（外部或历史封存材料）；不应重跑完整 OSV/整版本查询。 | 可先把已知缺失 7 条、重复成员 2 条、超时 1 条固定成阻塞清单；不改解包规则。 |
| `SDK-REVOCATION` | **OPEN** | 现有 trust verifier 在撤销/允许名单到位前 fail-closed。 | 签名撤销/允许名单、回滚语义和 fail-closed 刷新测试。<br>外部条件：签名服务/发布者治理材料（外部），并需授权策略。 | 可先定义回滚/过期/撤销证据字段和负测矩阵；不能凭本地时间戳替代。 |
| `SDK-NATIVE-EXECUTION-SAFETY` | **OPEN** | 4 个 PE 仅做静态 header/证书表检查且未执行；既有 Mach-O 签名结论未重跑。 | 作者签名、源码/构建映射、各目标平台预期行为和受控执行证据。<br>外部条件：签名材料与目标平台/干净环境（外部）；执行不能在当前只读盘查替代。 | 可离线整理 17 项 opaque 文件路径、摘要和待验证属性。 |
| `SDK-ASSET-PARSER-SAFETY` | **PARTIAL** | 既有 Pillow/FreeType 的有限格式检查；浏览器侧解析、资源限制和恶意输入仍未完成。 | 浏览器解析器/资源限制的受控夹具和目标运行时结果。<br>外部条件：若只使用已封存输入可本地进行；完整目标浏览器/平台证据仍需相应环境。 | 可先列资源边界、截断/超限负测及证据字段；当前不升级状态。 |
| `SDK-COMPLETE-PREPARATION-AND-CLEAN-HOST` | **OPEN** | 同平台 Mac 与目标 WSL 开发 SDK 子项已完成，但明确不是整台全新机器/生产验收。 | 独立干净主机上的完整 SDK prepare、闭包安装和保护复核。<br>外部条件：全新机器/隔离环境（外部运行条件）；不能用当前工作树替代。 | 可准备干净主机执行清单与回收/失败判定，不启动服务。 |
| `SDK-FINAL-DISTRIBUTION-SIGNATURE` | **OPEN** | 最终 SDK 的发布者 attestation、配方与 SBOM 签名尚未执行。 | 授权发布者对最终 SDK 摘要、配方和完整 SBOM 的签名/attestation。<br>外部条件：签名密钥/发布者材料与授权发布动作（外部）；本轮不得发布。 | 可离线固定最终签名输入清单和摘要绑定格式；不能生成伪签名。 |

## 已完成的离线核对

- `STATUS.md` 明确保留 `PARTIAL / SDK 分发 BLOCKED / release_ready=false`（[STATUS.md](STATUS.md:15)）。
- `docs/hackathon/TODOS.md` 的 T15 SDK 分发剩余项仍未勾选，并明确不重复整版本 OSV 查询或 SDK prepare（[TODOS.md](docs/hackathon/TODOS.md:387)）。
- `scripts/release/sdk-supply-chain.mjs` 仍将 `dependency_graph`、`embedded_components`、`registry_integrity`、`publisher_identity`、`opaque_content`、`revocation` 置于未验证/未审查状态，并固定 `release_ready=false`（[sdk-supply-chain.mjs](scripts/release/sdk-supply-chain.mjs:158)）。
- 最新 closeout 证据仍将 8 条门禁维持为 `PARTIAL`、`OPEN` 或 `BLOCKED_UPSTREAM_RELEASE`，没有局部证据升级为发布通过（[closeout](docs/hackathon/evidence/grok-sdk-trust-closeout-20261008.md:111)）。
- 当前 checkout 不含历史报告引用的 `.context/checks/sdk-trust-remaining-20261008-r1`、`sdk-trust-closeout-20261008`、`kit-sdk-v2-distribution-20261007` 原始目录；本轮没有恢复或重跑这些目录中的命令。

## 需要外部输入的项目

- **Upstream**：官方需要提供受影响依赖的替换 release/commit；然后才有意义做候选安装、编译、依赖与兼容核验。
- **干净机器/目标平台**：完整 SDK prepare、全新机器保护复核、native/PE 受控行为和浏览器资产解析需要独立环境；已有 Mac/WSL 开发 SDK 证据不等价。
- **签名材料**：最终 SDK 摘要、recipe、完整 SBOM 的授权发布者 attestation，以及撤销/允许名单和回滚策略尚未提供。
- **来源归档**：剩余 registry/source tarball 与可核验发布来源缺口不能由 lock integrity 自动填充；不应重跑已有整版本查询。

## 可后续并行

- 维护官方升级候选兼容矩阵，不安装候选、不改现用 pin。
- 固定 212 条 package integrity 缺口分类，待来源归档到位后定向补证。
- 准备 revocation、native、asset parser、clean-host、final-signature 的证据字段和负测矩阵模板。
- 维护最终签名输入清单与摘要绑定格式，但不生成伪签名、不发布。

机器可读版本：[`shinemage-sdk-gate-closeout-20261010.json`](./shinemage-sdk-gate-closeout-20261010.json)。
