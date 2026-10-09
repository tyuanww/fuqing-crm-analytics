# ShineMage 插件平台边界

本设计落实[既有拆分计划](../plans/shinemage-plugin-platform-split.md)，并以用户 2026-10-08 再次确认的主线为最终交付：**每插件一个本地与远程仓库；官方 npm DSH 独立安装升级；CRM、看板、WeKnora 分开维护，通过插件提供运营入口**。当前 workspace 边界证明是迁移基础，不是终点；下面分别标明目标与现状。仓库命名、远程创建和发布动作在实际执行时记录，不因本页更新视为已完成。

## 当前接续（2026-10-09，主仓）

主仓前三组已分别提交 `c94dd3ee`（15 个源码/测试）、`a9c4d79d`（10 月 8 日证据）、`80d48d14`（10 月 9 日交付记录）；本页属于随后第 4 组当前说明同步。[分组前交接](../hackathon/evidence/shinemage-main-repo-delivery-20261009.md)保留原快照，最新 Git 与接续看 [STATUS](../../STATUS.md)。八个插件仓的合并另账。九个插件已有独立远程仓；八仓最新完整 Ubuntu PR CI 通过，PR 仍 OPEN。这不等于主仓整支 CI，主仓也还没有本轮集成 PR。安装、宿主核对和首购装配已经能按路径与摘要消费正式 `dsh-plugin-pack/v1`；profile、candidate 生成和流水线仍消费主仓源码。九仓现有产物是普通 content pack，不是正式候选。cordis 方面，CRM/Knowledge peer 声明 4.0.2，固定输入实际 4.0.4，构建通过不证明宿主兼容。D/E 无独立 tsc，为 `NOT_IN_CURRENT_BUILD`。完整看板仍在 analytics-workbench，`shine-board` 只是能力标记。合成知识服务不是 WeKnora。`fd1fba4c…` / `a0d5dd08…` 的 headed 与 WSL2、journal seq 6 只属于该封存组合，后续 CRM 源码和独立仓新产物不能继承。SDK 分发仍 BLOCKED，不因此暂停主仓文档和 Git 整理。产品 PARTIAL，`release_ready=false`。下文「没有远程仓库」「Ubuntu 未做」按各段自己的时点阅读。

## 八仓远程与独立 CI 的当前状态（2026-10-09）

[八仓交付证据](../hackathon/evidence/shinemage-eight-remote-delivery-20261009.md)：除既有 shine-brand 样本外，本轮八插件分别具备私有远程仓、独立 PR 和实际通过的 Ubuntu 构建 CI。runner 自行准备固定 checkout/build-tools 与官方 npm lib，构建不读取主仓或兄弟源码；仍不是全部插件 npm-only 编译，SDK 分发结论不变。业务职责、插件产品字节与官方 DSH pin 未变。PR 未合并，独立版本发布、真实服务及底座升级仍待原队列收尾。下方为此前阶段。

## 八仓 CI 本地收尾（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

除已有远程样本 shine-brand 外，其余八仓现各有独立的固定输入完整 workflow 与一笔本地 `chore(ci)`；源码、kit、peer 和运行时职责未变。本地消费者分别验证，CRM/Knowledge 另补实际测试所需的两个官方 rc2 包；原构建仍消费固定 checkout/build-tools，D/E 无单独类型检查。没有重建 DSH或将 SDK 分发审计接入普通插件更新。详见[提交、验证与边界](../hackathon/evidence/shinemage-independent-ci-closeout-20261009.md)。八仓远程仓、Ubuntu CI 和发布尚未完成；真实服务与底座升级判据不由本轮关闭。下方为此前时点。

## Workbench CI 输入准备进度（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

固定上游源码、冻结安装锁和官方 npm lib 产物已能在新目录准备 Linux x64 编译输入，并使 Workbench 原严格构建及本包测试通过。它仍消费固定 checkout/build-tools；不修改上游源码、不重建 DSH、不改变运行时或业务服务职责，也不代表自制 SDK 获准分发。完整 workflow 补丁已在隔离任务副本验证并集成至 Workbench 作者仓；本地提交和 Ubuntu 远程 CI 待执行。见[实测与范围](../hackathon/evidence/shinemage-workbench-ci-materialization-20261009.md)；下方为此前阶段。

## 当前独立仓进度（2026-10-09，五仓本地 Git 与 CI 输入）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

query、board、crowd-action、funnel、waterfall 已从各自本地提交完成真实 clone。包身份和 peer 未改。shine-board 仍是能力标记，完整驾驶舱仍在 analytics-workbench。图表包的公开 subpath 与 `.d.mts` 继续对齐领域包声明。八个非 shine-brand 插件的构建仍使用固定上游 checkout 与已安装 build-tools；其中 D/E 五仓没有独立 tsc。Workbench 代表消费者已在本机验证这条已准备输入；全新 hosted runner 还没有自动准备该输入。远程仓与发布未执行。见[交付记录](../hackathon/evidence/shinemage-independent-de-git-and-ci-20261009.md)。下段是此前复核时点。

## 当前独立仓进度（2026-10-09，D/E 与 Git 交接复核）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

九个现有插件已分别形成独立作者工程；本地 Git/远程交付进度仍分层：shine-brand 已有远程样本，Workbench/CRM/Knowledge 已有本地提交及真实 clone，query/board/crowd-action/funnel/waterfall 五仓尚无提交。后三组均继续消费固定 SDK 输入，未移除上游 checkout/build-tools。源码提取只解除构建和测试路径耦合，shine-board 仍是能力标记，完整驾驶舱仍由 analytics-workbench 拥有；图表包保持原公开 subpath 与声明。见[证据与边界](../hackathon/evidence/shinemage-independent-de-and-git-review-20261009.md)。这不改变业务服务 owner，不新增运行时或平台，也不证明真实服务或 DSH 升级兼容已验收。

## 最终方案与仓库职责

| 独立单元 | 目标仓库与职责 | 不承担的职责 |
|---|---|---|
| 官方 DSH | 使用官方精确版本 npm 发行包，保留版本/来源及旧版回退记录；不 fork 或修改上游 | CRM、看板、WeKnora 业务实现和数据库 |
| 各个 DSH 插件 | 现有 analytics-workbench、crm-knowledge、knowledge、shine-brand、shine-query、shine-board、shine-funnel、shine-waterfall、shine-crowd-action 各有独立本地 Git 与远程仓库；自有锁、版本、测试、构建和发布 | 相邻插件源码、自动管理业务服务、重建 DSH |
| CRM 业务服务 | 业务 API、权限、数据、迁移与自己的发布；CRM 插件通过版本化接口调用 | 看板 UI、知识库引擎、DSH runtime |
| 看板/驾驶舱 | 页面、图表和编辑能力由对应插件/领域包独立维护；数据查询与保存仍由各服务 owner 提供明确接口 | 导入 CRM 私有实现、直接读真实 DuckDB、复制第二套业务引擎 |
| WeKnora 与接入插件 | WeKnora 保持其独立官方项目/服务生命周期；知识插件的 WeKnora 接入能力独立版本化，通过其接口和权限边界调用 | 把 WeKnora 源码或数据库打进 DSH/插件；用合成知识服务替代 WeKnora 验收 |
| 共享开发工具/领域包 | 已有 plugin-kit、board-components 作为独立维护的精确版本开发/领域依赖，由消费者锁定包与摘要 | 统一业务运行时或所有插件一起发版 |
| 组合配置 | 沿用现有 profile 与回执，记录官方 DSH、插件和服务的兼容组合；只装配版本与配置 | 收回各插件源码形成新单体、另建 catalog/控制平台作为前置 |

表中的插件名称对应现有目录，不是新建仓库或 npm 改名清单；保持既有包 ID，特别是 `@shine-mage/dsh-analytics-workbench-b0` 与 CRM 旧包 ID。看板独立的完成条件是可以单独维护/构建/交付其能力，`board-components` 独立不等于完整看板能力已独立交付；看板可作为 DSH 插件运行，不要求另建一套 Web 应用或服务。知识包已拆开，但现有公开 synthetic 知识服务和依赖 CRM Host 的私有身份 lease 不能证明 WeKnora 接入已经独立完成；该接口/身份依赖要在原知识插件任务中逐项核对，不另建知识引擎。

## 三条维护流程与完成判据

1. **日常改单插件**：从该插件远程仓库独立 clone，取得精确锁定的开发依赖，运行本包 build/test，生成本包版本和产物；按变更范围验证服务合同与选定宿主组合，再更新 profile。无需拉取其他业务仓库、重建 DSH、迁移数据库或重跑 SDK 全审；若实际改了服务状态合同，迁移与兼容另按服务职责处理。
2. **升级官方 DSH**：在新隔离目录取得选定的官方 npm 版本，保留旧版和现有插件包，先跑真实加载、工具/UI、会话与恢复兼容检查；仅适配不兼容插件或必要的开发工具绑定，产出新组合回执后按授权切换。不自动安装 latest，不把 npm 安装成功当成升级验收，也不承诺插件永久零改动。
3. **升级 CRM/看板/WeKnora**：各自仓库独立构建和交付，只对受影响接口及消费者验证；数据与权限仍由业务服务管理。插件提供可用入口与明确不可用原因，不替业务服务保存一份事实或控制无关服务。

完成验收要看到真实独立远程仓库、无主仓/相邻源码可见时的独立构建和插件产物、各仓独立 CI/版本记录、官方 npm 宿主的固定组合实测，以及一次独立底座升级/回退证据。仓库迁移不会自动改变生产；所需来源、签名、权限、状态及回退门禁仍按实际交付物适用。当前这些最终判据尚未全部完成，已有合成包验收不能替代。

## 当前实现与 SDK 阻塞的适用范围

目前 kit 为 private 包，`toolchain.json` 把编译输入绑定到固定上游路径；沿用 kit 的作者入口及 shine-brand 以外八仓仍需受控准备/接收的 SDK。shine-brand 已有公开依赖编译路径，范围见[作者入口](../operating/dsh-plugin-author-quickstart.md#shine-brand-独立仓样本)。**官方 npm 运行时安装与插件编译依赖是两个问题**：尚未验证“只靠公开 npm 依赖就能编译所有现有插件”，也未证明现有 bundle patch/UI 内部绑定对任意官方 npm 版本兼容。后续沿原作者入口核对所需导出/类型，优先使用官方可消费的版本化依赖；必要开发绑定集中在既有 kit 中，不修改上游、不复制业务代码，不用删校验实现独立构建。

自制 SDK 分发仍 BLOCKED，相关来源、公告、签名等证据和拒绝保持；这不是本页对其安全放行。它只阻塞确实使用该交付物的分发/准入，不把所有本地插件维护、分仓准备和文档工作一起暂停。日常复用固定已验输入；工具链变更或分发才触发对应审计。若官方发行包本身也受相同问题影响，仍需按实际范围处理，不能换成 npm 安装就宣称漏洞消失。

## 业务插件本地 Git 与真实 clone（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

analytics-workbench、crm-knowledge、knowledge 已从各自精确本地提交完成 `git clone --no-local`。当前提交是 `cc1dd6a972c85bb0ef0d7f7131edd72e62335dc1`、`12b8259351d7e64429336faca96a175aad77d517`、`d9e26776905cc00f57c550dd08318e37ee1d1b21`。包 ID 仍是 `@shine-mage/dsh-analytics-workbench-b0@0.0.0-b0`、`@shine-mage/dsh-crm-knowledge@0.0.0-crm.1`、`@shine-mage/dsh-knowledge@0.0.0-candidate.1`。CRM 与 knowledge 的 cordis peer 仍是精确 `4.0.2`。

隔离完整的 r2 拒绝主仓、兄弟插件源码和原作者仓内容，并只读使用固定上游 checkout 与已安装 build-tools。三仓都没有远程仓库。完整公开依赖严格编译、官方 npm 宿主组合、真实 WeKnora/Neo4j 和完整远程 CI 仍按各自缺口保留。看板页面与编辑仍在 analytics-workbench 提交内；shine-board 标记壳不代替它。记录见[本地 Git 交付](../hackathon/evidence/shinemage-independent-abc-git-delivery-20261009.md)。下段是此前审修时点，当时三仓尚未提交。

## 业务插件独立作者仓进度（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

analytics-workbench、crm-knowledge、knowledge 已有各自未提交的本地 Git 作者仓、锁、构建入口和本包测试，并核对主仓/兄弟源码不可读时的实跑日志。固定上游 checkout/build-tools 仍是显式开发输入；这些仓的完整公开依赖严格编译未验证。三仓真实 clone、远程仓及远程 CI 尚未完成，见[审查记录](../hackathon/evidence/shinemage-independent-abc-review-20261009.md)。

看板保留实际页面/编辑源码；CRM 的合成数据夹具验证固定合同消费者；知识已有图谱 HTTP 客户端和身份 lease 消费实现，当前实测仍是合成 HTTP，未接真实 WeKnora/Neo4j。这些本地拆分不改变服务 owner，也不继承旧 candidate 的运行验收。公开 cordis 的版本不能沿用 DSH 版本号查询：固定输入中 cordis 为 4.0.4，CRM/knowledge 精确 peer 4.0.2 的兼容仍待验证。SDK 分发限制按实际交付物保持，不附加到日常本包测试。

## A/B/C 独立化交付的当前边界（2026-10-08）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

[本地集成证据](../hackathon/evidence/shinemage-plugin-independence-integration-20261008.md)与[shine-brand 最新远程证据](../hackathon/evidence/shinemage-shine-brand-remote-20261008.md)分层记账：官方 npm rc2 安装及插件下发已有文件证据，运行终态补证仍按 A 线范围；shine-brand 已有真实独立本地/私有远程仓、公开工具构建、远程 clone 和 Ubuntu CI，不再依赖上游 checkout。该样本的严格 SDK 类型与宿主准入不由编译替代，其他插件仍需各自分仓和验证。本轮 CRM/知识/看板源码边界使用合成夹具，真实 WeKnora 与完整看板独立交付尚未验收。

A 没有交付 kit 改动：26 个 binding 的 metadata 有精确版本，不等于编译导出已验证；`dsh-client-core@0.1.7-rc.2` 保存查询为 404，npm 安装的 cordis 4.0.4 与 CRM/knowledge 精确 peer 4.0.2 的差异仍需验证，不能放宽 peer。B 的 kit tarball、上游与工具输入沿用已有固定材料，SDK 分发门禁不因本地构建成功解除。

C 的 `crm_service_health.board_tools` 从环境变量推断字符串改为 catalog 可见性对象：`status`、`execution: NOT_RUN` 和 `reason`。它只表明 `competition_board_catalog` 对当前 Agent 可见，不证明全部看板工具能执行。`shine-board` 当前仅为能力标记；实际页面/编辑/组板仍在 analytics-workbench。私有知识依赖既有身份 lease，WeKnora/Neo4j 接口测试仍使用合成服务，不能写成真实系统独立验收。旧 candidate 的通过不覆盖新 CRM 字节。

## 四类升级各有归属

| 改动 | 归属与交付 | 必须验证 | 不随之打包的内容 |
|---|---|---|---|
| 官方 DSH | 目标使用精确 npm 发行版本/来源/摘要；当前已有验收仍绑定 SDK/runtime lock 与 `0.1.7-rc.2` / `477b4f42` | 固定宿主的工具、slot、生命周期、恢复和插件兼容矩阵 | CRM/知识库源码、业务数据库 |
| 单个插件 | 本领域源码、版本、测试、`lib/`、peer、bundle patch；产出独立 digest | files/exports、安全扫描、合同消费者测试、目标宿主验收 | 其他插件源码、DSH runtime、服务状态 |
| CRM/知识库服务 | API、权限、领域 schema、持久化与迁移协议 | API 兼容窗口、权限、幂等/回放、状态 forward-fix | DSH shell 与其他服务的数据 |
| profile/部署 | 固定包的有序清单、host pin、来源、digest、回执与回退指针 | 来源信任、同一 artifact、canary、受控激活和恢复 | 构建工具、源代码仓库、现场编译流程 |

不需要先 fork DSH 才能维护插件。当前不修改上游源码，也不自动追随 latest；下一代 DSH 在独立 candidate 中适配后单独升级。Plugin Hub 只能作为发现/安装参考，不能替代本项目锁定来源和兼容证据。

## 开发工具与运行时分开

`dsh-plugins/plugin-kit` 只拥有固定工具链、依赖锁与构建绑定；它不导入业务插件、不读取服务状态、不进入插件 tarball。插件自己的类型检查、测试、生成物与业务行为由插件维护。10 个构建消费者已使用精确开发依赖及 kit 公开导出；仓库内由显式 workspace 适配器连接，独立作者工程消费已核对的 kit tarball，见[作者入口](../operating/dsh-plugin-author-quickstart.md)。这不代表 kit 已在 registry 发布或 SDK 已获准分发。

`toolchain.json`、build-tools manifest/lock/补丁现在位于 kit；release、B0 pipeline、开发入口和合同生成器读取同一份 pin。不能为了让一个包构建成功，静默从相邻历史仓库找依赖。已准备的第三方依赖可以复用，但须与 kit 锁定输入一致。

当前事实见[机器清单与依赖说明](./shinemage-plugin-boundaries.md)。首批 leaf 已能脱离 workbench 构建；CRM 原 5 条 workbench 私有引用全部解除，合成 Python 查询/知识解释也改为显式配置的独立服务 HTTP API 1.0.0。插件不再发现主仓路径或启动 Python。两项服务已各自产出[独立应用候选包](../operating/crm-service-packages.md)，资源与依赖按领域锁定；知识服务不再加载指标引擎或 DuckDB。九个插件已有独立远程仓；主仓 workspace 副本仍被 profile、candidate 生成和组合流水线消费，主仓装配迁移尚未完成。源码/服务边界进展不等于完整宿主故障隔离。

CRM 与知识插件也已拆成两个独立候选包：CRM 保留旧包 ID，知识使用 `@shine-mage/dsh-knowledge`；profile v3 按包分别选择、分别记录指纹。双方只共享领域 owner 维护的公开合同生成物；私有知识通过可撤销会话 lease 获取身份，不读取 CRM 实现或凭据。公开解释可独立运行，私有教材当前仍需要 CRM Host 作为身份提供方。迁移需要新 profile 和对应新 Host，不能宣称原地热替换已验证，详见[服务与插件边界](../operating/crm-plugin-service-boundary.md)。

## 领域合同不能变成共享业务单体

- 极小的跨插件合同只约定 capability 的提供/消费、slot、结果 envelope 与不可用状态。
- CRM、问数、看板、页面与知识库 schema 由各领域拥有；生成器、源摘要、消费者和兼容政策一起维护。
- 观察到的 `/internal/native/*` 是内部 adapter，不能当成长期公开 API。字面路由清单也不证明权限、幂等或可用性。
- 插件被禁用或依赖缺失时，动作必须显示 `disabled` / `NOT_AVAILABLE` 和原因；默认保留 DSH 原生标题、侧栏、会话及工具合同，`--shine-brand off`。

## 安装、故障与保存边界

首期包身份保持现有 `@shine-mage/dsh-analytics-workbench-b0`；不能把目标仓库名称当成已获授权的 npm 包重命名。发布组合的目标是由 profile 只引用固定包及 digest；当前主仓 profile/candidate 准备入口仍消费源码路径与 `build.mjs`，装配迁移尚未完成。每次候选记录来源 SHA、生成合同摘要、DSH pin、capability 和 journal，不能用工作区目录作为发布身份。

同进程插件挂死或部分注册不能靠静态分析证明可隔离。T17 必须在命令拥有的临时 profile/home/WAL/PID/端口中验证固定 DSH 的实际行为；不支持安全卸载时明确 `HOST_RESTART_REQUIRED`，按已验证的原生回退与受控重启处理。当前不宣称热插拔或无重启回退。

2026-10-08 固定 rc2 本机进程级恢复 10/10、单插件更新/取消等历史证据见[A/B/C 集成验收](../hackathon/evidence/shinemage-abc-integration-20261008.md)。最新本地提交 `f8db3949` 的 candidate `fd1fba4c…` / 包 `a0d5dd08…` 已完成 headed 25 PASS、WSL2 source 10 PASS、terminal 1 PASS、browser 1 PASS / 5 场景，并经原校验器推进新 journal 到 seq 6，见[当前组合](../hackathon/evidence/shinemage-html-fix-candidate-20261008.md)。这证明固定现有输入下的合成组合，不证明官方 npm 升级、真实分仓、WeKnora、任意插件隔离或生产；standalone 等原缺口保持。SDK 审计不进入每次单插件更新。

profile 回退不回滚已写入 CRM/SQLite 的记录。D15 是否启用 durable save 由 T3/T7 的服务状态矩阵决定：candidate/correlation/idempotency、成功但回执丢失、重复提交、UNKNOWN 重放和 forward-fix 都需要证据。证据不足时首个候选仍只交付可核对结果。

## 实施顺序与放行

1. T1 固化 owner、实际依赖和边界检查；T15 先证明 dev kit 与低耦合 leaf 包。
2. board-components 已拥有公开计算/类型，workbench 的 6 条图表源码引用已改为固定 tarball，独立 build/pack 与消费者回归已有本地证据。CRM 的 slot/主题改为领域版本化生成合同，页面工具由 profile 装配公开入口，原 5 条 workbench 内部引用全部解除；单包构建/测试/pack 通过。细目在机器清单，每解除一条就删除对应临时例外；不把源码解耦当作生命周期验收。
3. T2/T17 固定宿主证据与 T3/T7 保存矩阵通过后，完成 D15 workbench 包的独立 candidate、canary 和回退证据。
4. 沿既有 stop/go 核对独立开发/升级/回退证据和责任，已完成的九仓分仓与 CI 按各自产物留证，继续收尾主仓装配迁移、各仓合并/独立发布及适用组合验收。来源、签名、SBOM/CVE、权限和状态门禁按所交付内容保持适用；多生产者 catalog 不作为本次主线的必做前置。

打包成功不代表发布就绪。GitHub 发布、杭州 receive/activate、WSL/路由操作和真实数据迁移仍按各自授权及现场门禁执行。开发与 CI 可以生成验证包；生产只接收已审查 SHA 的不可变 artifact，大包由杭州直接下载，Tailscale 负责控制与探针。
