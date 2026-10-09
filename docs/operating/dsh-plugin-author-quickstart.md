# DSH 插件作者 Quickstart

这条路径只验证一个插件包。DSH、CRM 服务、知识库和真实业务数据不随插件构建；插件失败时保留 DSH 原生对话是 T17 宿主验收目标，当前 pack/candidate 尚不能证明进程隔离。插件包默认不得覆盖原生标题、侧栏、会话或工具合同，未接通的 capability 必须显示 `NOT_AVAILABLE` 及原因。

单插件更新十场、整次取消和 HTML headed 探针的现有命令、输入范围及实际结果见[A/B/C 集成验收](../hackathon/evidence/shinemage-abc-integration-20261008.md)。这些是隔离验收入口，不是安装到现役环境的命令；进程级恢复通过不等于支持热插拔。

## 可用的独立远程作者仓与 PR（2026-10-09）

[八仓 URL、提交与 CI](../hackathon/evidence/shinemage-eight-remote-delivery-20261009.md)已可用于接续。每仓当前完整配方位于各自 `codex/*-independent` PR 分支，默认 main 仍是已审查的首次功能提交；不要把 main 当作已合入完整 CI 修复。Workbench 和 D/E 入口为 `.github/workflows/ci-full.yml`，CRM/Knowledge 为 `ci.yml`。

完整 Ubuntu PR CI 已按固定输入实际通过；日常开发仍按本仓 DEVELOPMENT.md 复用已核对的编译输入，只运行本包构建/测试，无须重复 SDK 全量审计。本轮未提供正式发布版、未合并 PR，内容包不是安装候选。下方“没有远程 URL”按历史时点保留。

这些 URL 只用于核对已经存在的作者仓 PR。本轮不合并、不发布、不部署，也不把八仓 Ubuntu CI 写成主仓 CI。D/E 的现有 build 仍无单独 tsc，类型检查是 `NOT_IN_CURRENT_BUILD`。不要把 `shine-board` 当成完整看板，不要把合成知识 HTTP 当成 WeKnora，不要因为构建通过就视为 cordis 4.0.2 peer 与固定输入 4.0.4 兼容。主仓 profile 与流水线仍从主仓源码构建；普通 content pack 不能改名后当作 `packPlugin` 候选。下方「没有远程 URL」「Ubuntu 未运行」是此前时点。主仓前三组已提交为 `c94dd3ee`、`a9c4d79d`、`80d48d14`，本页属于第 4 组当前说明同步；[分组前交接清单](../hackathon/evidence/shinemage-main-repo-delivery-20261009.md)保留原时点，最新 Git 接续看 [STATUS](../../STATUS.md)。本页的构建/候选示例不代表本轮执行授权。VERSION 不变。

## 八仓完整 CI 的当前入口（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

[八仓交付](../hackathon/evidence/shinemage-independent-ci-closeout-20261009.md)列出各自最新 `chore(ci)`、本地仓和验证边界。各仓 `inputs/ci/README.md` 说明固定 Node 24.19.0 / Python 3.14.4 / Linux x64 下的 `python scripts/ci/prepare-fixed-inputs.py --root /绝对/新目录`；消费命令仍以自己的 DEVELOPMENT.md 为准，不共用其他插件的环境名。CRM/Knowledge 用现有 `ci.yml` 完整入口；Workbench 和 D/E 用新增 `ci-full.yml`。

准备需 GitHub/npm 网络，允许原安全策略查询；已有根会拒绝，失败根保留。普通开发可复用已核对输入，运行本包构建/测试/打包，无须每次重装 SDK。源码 checkout/build-tools 仍需提供，不是所有插件已支持 npm-only。八仓现在各有本地提交、工作区干净，但没有远程 URL；Ubuntu Actions 未运行，不能给出虚构 clone 地址或发布命令。下方是此前准备阶段。

## Workbench 的可复现 CI 输入配方（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

[本轮交付](../hackathon/evidence/shinemage-workbench-ci-materialization-20261009.md)提供 8 文件补丁，位于 `/Users/hutou/.codex/tasks/shinemage-ci-materialization-20261009/patches/workbench-ci.patch`，已应用到 Workbench 原作者仓，尚未提交。任务副本 `recipe-consumer` 中的 `inputs/ci/README.md` 说明精确运行时、输入清单、准备网络与新目录要求。配方已在 Linux x64 本地容器从空目录完成准备和严格消费者全链；Ubuntu 远程执行未做。

这条配方按固定版本取得官方编译产物并安装依赖，不复制现成 SDK 安装目录，不重建 DSH；固定上游 checkout 和 build-tools 仍存在。不要把 Workbench 结果套用为 CRM、Knowledge 或 D/E 的构建/类型检查通过，也不要从本轮内容包继承旧候选身份。

## D/E 五个作者仓的本地提交（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

五个仓现在各有一笔本地提交，可用 `git clone --no-local` 取得不含 `lib/` 与 `node_modules/` 的树。当前已验证目录是各任务根下的 `clones/*-r1`，SHA 与作者 HEAD 相同，没有 alternates。没有远程 URL。命令、环境白名单和内容包见[交付证据](../hackathon/evidence/shinemage-independent-de-git-and-ci-20261009.md)。现有 build 仍无单独 tsc。下段“未提交、未真实 clone”是此前时点。

## D/E 五个新增作者仓（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

`/Users/hutou/.codex/tasks/shinemage-leaf-independent-20261009/` 下已有 `dsh-shine-query`、`dsh-shine-board`、`dsh-shine-crowd-action`；`/Users/hutou/.codex/tasks/shinemage-chart-independent-20261009/` 下已有 `dsh-shine-funnel`、`dsh-shine-waterfall`。每仓命令以自己的 DEVELOPMENT.md 为准，显式提供固定上游、build-tools、pnpm 和本仓领域输入，缺失时失败而不搜索主仓。五仓仍未提交、未真实 clone、无 remote，不提供虚构远程安装命令。

图表两仓继续使用摘要固定的 board-components 0.1.0 tarball，公开 funnel/waterfall subpath 和声明文件均已核对；叶子三仓只解除构建/测试路径耦合，board 未增加驾驶舱实现。五仓现有构建无单独 tsc，不能借固定 TypeScript 版本检查宣称类型检查通过。来源、原日志与实际包见[本轮记录](../hackathon/evidence/shinemage-independent-de-and-git-review-20261009.md)。

## 最终独立仓路径与本页适用范围

用户确认的终点是每插件独立本地/远程仓库、自己的锁/版本/CI/发布，DSH 使用官方精确 npm 发行版，CRM/看板/WeKnora 各自维护；详见[最终方案](../architecture/shinemage-plugin-platform.md)。本页保留固定 kit/领域包/SDK 路径，并补充已验收的 shine-brand 公开依赖构建和远程仓路径；其余八仓已有独立远程仓及完整 Ubuntu PR CI，但仍消费固定 checkout/build-tools，正式包、宿主组合和独立发布尚未完成。

日常只改一个插件时复用已核对开发依赖，运行该插件 build/test/pack 与受影响合同检查，不执行整仓 runtime preflight、数据库迁移或 SDK 全量审计。底座升级另起官方精确 npm 候选，先验证旧插件兼容，只适配受影响插件，再核验回退。当前 kit 的 `sdk_bindings` 仍指向固定上游构建输入，安装官方 npm 运行时并不会自动提供全部编译类型/导出；收尾必须在主仓、上游 checkout 和相邻插件源码不可见时验证独立依赖输入，未通过前保留现有路径和失败证据。

SDK 分发 BLOCKED 保持，只约束适用的工具链交付；不由本页放宽安全检查，也不把它变成每次插件修改的全量审计要求。现有 clone/依赖获取/CI 入口见各独立仓 DEVELOPMENT.md 和本页顶部远程交付记录；独立发布及新版 DSH 升级教程仍缺实际验收，不提供未发布包的安装命令。

## 三个业务插件的本地提交与 clone 入口（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

三个作者仓现在各有一笔本地提交。从该提交取得干净树的命令是 `git clone --no-local <作者仓> <新目录>`。当前已验证的目录是各任务根下的 `clones/r2`，精确 SHA 与作者仓 HEAD 相同，且没有 Git alternates。clone 起点不含 `lib/`、`node_modules/` 或旧 store；这些目录只在后续安装和构建后出现。

| 插件 | 作者仓与分支 | 当前提交 |
|---|---|---|
| analytics-workbench | `.../shinemage-workbench-independent-20261008/dsh-analytics-workbench`，`codex/analytics-workbench-independent` | `cc1dd6a972c85bb0ef0d7f7131edd72e62335dc1` |
| crm-knowledge | `.../shinemage-crm-independent-20261008/dsh-crm-knowledge`，`codex/crm-knowledge-independent` | `12b8259351d7e64429336faca96a175aad77d517` |
| knowledge | `.../shinemage-knowledge-independent-20261008/dsh-knowledge`，`codex/knowledge-independent` | `d9e26776905cc00f57c550dd08318e37ee1d1b21` |

共同输入仍是 Node 24.19.0、显式 pnpm 11.28.2 JS 入口、上游 `477b4f42`、kit `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901`。Workbench 还锁定 board-components `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。三仓没有远程 URL，不能从 GitHub clone。完整命令、环境白名单和 r2 日志见[交付证据](../hackathon/evidence/shinemage-independent-abc-git-delivery-20261009.md)。下段表格里的“无提交、未 clone”是审修时点。

## 三个业务插件的本地作者入口（2026-10-09）

> 历史阶段记录：以下“当前”“尚未”仅指该轮；最新 Git/CI 与当前接续见 [STATUS](../../STATUS.md)。

本地独立作者仓和完整命令见各自 `DEVELOPMENT.md`：

| 插件 | 本地仓目录 | 当前输入与边界 |
|---|---|---|
| analytics-workbench | `/Users/hutou/.codex/tasks/shinemage-workbench-independent-20261008/dsh-analytics-workbench` | 固定 kit、board-components、上游 checkout/build-tools；保留 host/client 严格类型检查 |
| crm-knowledge | `/Users/hutou/.codex/tasks/shinemage-crm-independent-20261008/dsh-crm-knowledge` | 固定 kit、上游 checkout/build-tools；本包合成夹具，跨服务合同仍在集成树 |
| knowledge | `/Users/hutou/.codex/tasks/shinemage-knowledge-independent-20261008/dsh-knowledge` | 固定 kit、上游 checkout/build-tools；身份与图谱使用合成 HTTP，非真实 WeKnora |

共同固定 Node 24.19.0、pnpm 11.28.2、DSH rc2 上游 `477b4f42`。各仓使用显式绝对输入，不回退主仓 `.context`；仍需这些开发输入，不是 npm-only 严格构建已通过。三仓当前无提交、无 remote、未 clone，不能提供已可用的远程安装命令。Workbench CI 仅边界检查，CRM/Knowledge CI 缺固定输入供应；先做本地提交与 clone，再按实际输入完善完整 CI。原日志、审修和未覆盖范围见[三仓证据](../hackathon/evidence/shinemage-independent-abc-review-20261009.md)。

## shine-brand 独立仓样本

独立仓在 `/Users/hutou/.codex/tasks/shinemage-shine-brand-independent-20261008/dsh-shine-brand`，私有远程 [tyuanww/dsh-shine-brand](https://github.com/tyuanww/dsh-shine-brand)，当前 [PR #1](https://github.com/tyuanww/dsh-shine-brand/pull/1)。默认公开编译器路径已在隔离本机和 Ubuntu CI 通过，无需主仓、兄弟源码、上游 checkout 或 build-tools。Node 24.19.0 / npm 11.17.0；包 ID/版本仍为 `@shine-mage/dsh-shine-brand@0.0.0-b0`。

以下命令适用于 PR 分支 `codex/shine-brand-independent`，已验证 HEAD 为 `2d7c17c2afa8050fc2d6b5def6af34fcaf821667`；默认 `main` 仍为初始提交 `506b1a3e`，尚不包含 `npm-author/`。在该分支的独立仓根执行 `npm ci --prefix npm-author --ignore-scripts --no-audit --no-fund`，然后 `node npm-author/build.mjs`；本包完整测试/打包命令见该仓 DEVELOPMENT.md。首次安装从 registry 取得锁定 esbuild/pnpm 及平台二进制，不分发旧 SDK。保留原固定 SDK 兼容入口及其输入门禁。仅转换 TypeScript，不代表严格 SDK 类型、宿主或候选准入已通过。

[远程交付证据](../hackathon/evidence/shinemage-shine-brand-remote-20261008.md)记录真实远程 clone、每次 32 项测试、CI 和跨平台包摘要。该样本无运行时外部依赖，不可原样当作其他插件的空模板；图表领域包、服务与身份合同须按各包核对。以下主仓/SDK 命令保留其原适用范围。

## 前置条件

- 插件开发使用 Node `24.19.0`、pnpm `11.28.2`。Python `3.14+` 属于后端服务、合成集成测试与发布校验工具的环境，不是 CRM 插件运行依赖。
- 插件位于 profile allowlist 中，包名匹配 `@shine-mage/*`。
- `package.json` 使用 `type: module`、`packageManager: pnpm@11.28.2`，并把 `@deepseek-ai/dsh-tools` 固定为 `0.1.7-rc.2` peer。
- `files` 只声明运行时 `lib/`、bundle patch、已打包领域输入的 digest lock 和必要的 README/LICENSE；不得包含 `src/`、测试、`node_modules`、source map、符号链接或 workspace/file/link 依赖。

<a id="plugin-contract"></a>
## 包合同

每个插件有自己的 `build.mjs`、测试和版本。构建期可以使用 workspace 内的 `dsh-plugins/plugin-kit`，但运行时只消费自身包、公开 DSH capability 合同和服务 API；不能导入 `analytics-workbench` 或其他插件的 toolchain 源码。运行时 profile 的目标职责是组合已打包版本；当前主仓 profile/candidate 的准备入口仍消费主仓源码，装配迁移尚未完成。固定 pin、manifest/lock 和补丁位于 `plugin-kit/toolchain.json` 与 `plugin-kit/build-tools/`；workbench 只保留自己的业务类型检查。

全部插件已改用 `@shine-mage/dsh-plugin-kit/toolchain` 公开导出与精确 `0.1.0` devDependency；board-components 使用 kit 的 `./packaged-dependencies` 公开入口。独立安装不需要相邻 kit 源码；本仓由下方显式 workspace 适配器准备，B0 pipeline/preflight 已包含该步。kit 仅限构建期，不能出现在运行时依赖或领域输入 lock 中。kit 已提供自身的首次 SDK 准备命令，受控 SDK/工具归档与接收已有验证；受信分发与 registry 交付仍未完成，见 [kit 说明](../../dsh-plugins/plugin-kit/README.md)。

独立插件工程若尚无匹配 pin 的已审核 SDK 输入，才用 Node24/Corepack/Git 运行 `node node_modules/@shine-mage/dsh-plugin-kit/prepare.mjs --destination /absolute/new-sdk-inputs`。这一步会联网取固定官方源码和冻结依赖，在新目录构建开发 SDK，不构建生产 runtime；已有目的目录拒绝覆盖，失败日志保留。已有受控接收的同一SDK时直接复用，不因每次插件更新重新prepare。之后调用 `node build.mjs /absolute/new-sdk-inputs/upstream /absolute/new-sdk-inputs/build-tools`，不再需要主仓预先准备的目录。公共 CA 参数、阶段回执和失败重试规则见 kit 说明；当前包仍 private，没有可直接从 registry 安装的发布版本。

## 图表领域包输入

workbench、funnel、waterfall 使用 `@shine-mage/board-components` 的公开代码/类型导出。包版本在各自 `devDependencies` 固定，tarball SHA-256 在 `bundled-dependencies.json` 固定；构建将代码打入插件，线上无新的 runtime peer。包的完整输入步骤：

```bash
# 仓库内开发：生成同一个不可变图表包；B0 --check 和 preflight 已包含这两步
node scripts/dsh-b0/plugin-kit-link.mjs "$PWD/dsh-plugins/board-components" "$PWD/dsh-plugins/plugin-kit"
node dsh-plugins/board-components/build.mjs
# 只为源测试绑定本地 tarball；build.mjs 会自行校验并绑定
node scripts/dsh-b0/package-inputs.mjs
```

独立 checkout 接收同一个 tarball 后，设置 `DSH_PACKAGE_INPUTS=/absolute/package-input-directory` 即可构建，无需相邻图表插件或其源码。该目录是显式可信的构建输入，摘要由消费者 lock 校验；不存在时返回 `PACKAGE_INPUT_REQUIRED`，不联网找 latest、不回退到源码。`PACKAGE_INPUT_DIGEST`/`PACKAGE_INSTALLED_DRIFT` 阻断篡改；同版本不同字节返回 `PACKAGE_OUTPUT_CONFLICT`，应升级领域包版本并审查 lock，不能覆盖旧 artifact。详见 [领域包说明](../../dsh-plugins/board-components/README.md)。

## workbench 独立作者安装（固定本地输入）

workbench 的旧 `pnpm-lock.yaml` 是历史 registry 闭包，不含后来加入的 private kit/board 开发输入。不能直接忽略它的 frozen 错误，也不能把本仓 kit symlink 当作独立安装。现由本包 `author-inputs.mjs` 在**新的开发者自有目录**准备离线父工程；插件发布 manifest 保持原精确版本，父工程的本地 tar overrides 和锁只用于开发，不进入运行时包。

先接收与当前 pin 匹配的目标平台开发 SDK，以及已核对 SHA 的 kit tarball和消费者锁指定的原领域 tarball。kit仍 private；SHA须来自已核对的本地打包记录或受信记录，不能据此宣称registry发布或签名可信。SDK准备/接收方式见 [kit说明](../../dsh-plugins/plugin-kit/README.md)。不要在作者更新中重新准备上游、重打领域包或修改消费锁。

```bash
# 从 analytics-workbench 源码目录执行。所有输入必须已存在；destination必须尚不存在。
export COREPACK_HOME=/absolute/received-sdk/corepack
export COREPACK_ENABLE_NETWORK=0
export COREPACK_ENABLE_AUTO_PIN=0
export B0_BUILD_UPSTREAM=/absolute/received-sdk/upstream
export B0_BUILD_TOOLS=/absolute/received-sdk/build-tools
export DSH_SDK_CLOSURE_SHA256=REVIEWED_CLOSURE_SHA256
export DSH_PACKAGE_INPUTS=/absolute/locked-domain-inputs

node author-inputs.mjs \
  --destination /absolute/new-author-workspace \
  --kit /absolute/reviewed-kit.tgz \
  --kit-sha256 REVIEWED_KIT_SHA256 \
  --package-inputs "$DSH_PACKAGE_INPUTS"

cd /absolute/new-author-workspace/plugin
pnpm build
pnpm test
pnpm test:built
```

入口先核对kit原始摘要，只以本地tar、`--offline --ignore-scripts`安装；随后使用已安装kit的公开接口校验领域包SHA/身份，再创建开发workspace的精确输入锁，并真正执行 `--frozen-lockfile` 安装。首次显式准备需要生成开发锁；普通build/test不更新锁，不关闭frozen或版本校验。`autoInstallPeers:false` 仅避免尝试从registry安装完整DSH peer；构建仍必须经kit验证固定DSH SDK、上游pin、全部锁与工具版本。build的显式参数优先，其次读取上述B0环境变量。

kit可复用标准pnpm虚拟store中已安装的领域包：先验证原锁tar，再逐字节核对已安装manifest与完整文件集合；没有覆盖、迁移或忽略外部安装。缺失输入、错误摘要、额外成员、特殊文件、SDK漂移或开发manifest/锁不一致均阻断。开发workspace中的 `author-inputs.json` 和 `logs/` 保留输入身份与安装证据；失败目录不覆盖，修复后选新目录重试。SDK、旧输入与现有作者工程不被此入口修改。

源码副本包含本包 `test/fixtures/coordinator/` 的合成合同和固定OpenAPI，带owner/合同版本/原路径/SHA；测试不搜索相邻主仓。独立包仅验证固定服务合同conformance；仓库侧fixture drift测试与现有离线生成检查分别保证受追踪来源一致性和backend生成一致性。夹具、作者脚本、开发锁、kit及输入包均不进入发布tarball。

实际验证和失败恢复见 [2026-10-08作者输入证据](../hackathon/evidence/dsh-g0-plugin-author-inputs-20261008.md)。这仍是开发构建路径，不是发布/安装宿主/激活授权。

## 当前集成仓的三步本地路径

此为固定输入已准备、源码已审查提交后的操作参考。15 个源码/测试已提交为 `c94dd3ee`，但该提交不自动授权生成候选，也不证明宿主兼容；本轮第 4 组只同步说明。后续按实际输入与动作授权使用本节，不重建或改写已有候选来替代新组合验收。

```bash
# 1. 只读检查当前 profile、工具链和本地合同
pnpm dsh doctor
pnpm dsh verify --scope local

# 2. 在插件目录构建和测试（upstream 路径必须是固定 checkout）
node scripts/dsh-b0/plugin-kit-link.mjs "$PWD/dsh-plugins/shine-brand" "$PWD/dsh-plugins/plugin-kit"
cd dsh-plugins/shine-brand
pnpm build "$PWD/../../.context/dsh-b0/upstream-0.1.7-rc.2"
pnpm test

# 3. 回到仓库根目录生成独立 candidate receipt
cd ../..
candidate_root="$(mktemp -d "${TMPDIR:-/tmp}/shine-mage-plugin.XXXXXX")"
pnpm dsh plugin candidate \
  --plugin "$PWD/dsh-plugins/shine-brand" \
  --output-dir "$candidate_root/pack" \
  --state-path "$candidate_root/state.json"
cat "$candidate_root/pack/candidate.json"
```

候选目录携带原字节 `profile.json` 快照；回执绑定插件 source SHA、包 SHA-256、profile digest、固定 DSH pin、capability 和 `CANDIDATE_PREPARED` journal。`canary`、`rollback` 和远端 receive 在当前首期显示 `NOT_RUN`/`NOT_AVAILABLE`，这不是发布成功；不能把 tarball 直接放进杭州 current。

最终 tarball 在私有临时目录安全解包，核对 `exports`（含条件分支）、`main`/`module` 和 `dsh.bundle.patch` 指向的文件，再执行敏感文件/secret scan；通过后才发布包与回执。源码映射、敏感文件或缺失入口均阻断，内容校验失败不发布 tarball；通过校验后若回执落盘失败，已验证包仍保留，需核对输出后使用新的候选目录重试。通配 exports 暂不支持，须列出明确入口。

## 声明保存服务依赖（本地候选）

使用 D15 保存的显式试验 profile 增加 [`service_binding`](../architecture/first-purchase-service-compatibility.md#候选和主机门禁)，记录精确服务源码、API/状态合同、访问模式、保留服务/数据的回退规则，以及实际兼容回执的 SHA-256。先执行 `service-save-compatibility.py`，再向上述 `plugin candidate` 命令追加 `--profile config/your-profile.json --service-evidence /absolute/receipt.json`。

候选同时保存原回执、绑定和 digest；已验证缺失证据、旧服务可写组合、陈旧验证器或与 profile 不符均在打包前拒绝。通过只表示 `LOCAL_COMPATIBLE`，`release_ready=false`；缺最终服务包/主机证据时实际激活继续拒绝。单纯展示插件无需声明该服务，默认 profile 与生产保存开关不变。`verify-host` 的 CRM＋知识宿主观测不能替代 analysis-service 验收。

## 连接已有宿主证据（CRM＋知识首期）

声明保存服务的候选，还可按[服务包说明](./crm-service-packages.md#将包回执绑定已有候选)运行 `pnpm dsh plugin verify-service`，把已运行的双服务包观测接入同一 journal。它不替换上述源码回执，也不使本机宿主观测成为目标 WSL 或生产保存验收。

专用 allowlist `config/dsh-profile.crm-knowledge.rc2.json` 只选择 CRM 和知识两个独立包，默认七插件 release profile 不变。在同一干净提交与已完成构建/测试的双包上执行：

```bash
plugin_trial="$(mktemp -d "${TMPDIR:-/tmp}/shine-mage-host.XXXXXX")"
pnpm dsh plugin candidate \
  --plugin "$PWD/dsh-plugins/crm-knowledge" \
  --profile config/dsh-profile.crm-knowledge.rc2.json \
  --output-dir "$plugin_trial/candidate" \
  --state-path "$plugin_trial/state.json"

# 仅启动/重启该命令自己创建的宿主和 loopback 模型夹具；含 SIGKILL 负测
node scripts/dsh-b0/pinned-host-acceptance.mjs \
  --upstream /absolute/unchanged-built-dsh-0.1.7-rc.2 \
  --output "$plugin_trial/host"

# 只读候选/证据，向既有 journal 追加一次观测；不启动或激活宿主
pnpm dsh plugin verify-host \
  --candidate "$plugin_trial/candidate/candidate.json" \
  --evidence "$plugin_trial/host/evidence.json" \
  --state-path "$plugin_trial/state.json"
```

成功返回 `LOCAL_HOST_VERIFIED` 与 `CANDIDATE_HOST_VERIFIED` journal 序号/摘要；同输入重试返回同一记录，原 candidate 保持不变。它只认证所选候选在回执列出的固定双包组合下的**本机观测**；伴随包摘要、平台、固定 DSH 和测试脚本源码均随证据核验。它不是数字签名、任意 profile 的兼容证明或部署许可，`release_ready: false`、activation/service state 仍为 `NOT_RUN`。

验证器使用现有 `python3` 安全解包入口，在本次私有临时目录中复核已验摘要的 tarball，逐文件比对安装内容（含非入口资源），结束清理该临时目录；不执行包内代码。只核对安装目录自身的 manifest 摘要不够，包和安装目录内容不一致会返回 `PLUGIN_HOST_INSTALLED_PACK_MISMATCH`。特殊文件输入在读取前拒绝，不能令 CLI 一直等待。

旧 `dsh-pinned-host-acceptance/v1` 不能用来写入通过回执，必须重新跑宿主；没有 profile 快照的旧 candidate 必须重新生成。错误 pin、错误 source/包、缺场景、证据文件被改或没有 `CANDIDATE_PREPARED` 的 journal 均在写入前拒绝。单域或其他组合返回 `PLUGIN_HOST_PROFILE_SCOPE_MISMATCH`，不能拿双包测试结果替代验收。[本次实证](../hackathon/evidence/dsh-g0-host-journal-20261004.md)。

## 失败处理

`PLUGIN_PACK_SOURCE_DIRTY` 表示必须先完成 reviewed commit，再从干净 checkout 重打包；不要删除校验或使用 dirty 包。`PROFILE_PLUGIN_*` 表示 profile 与 package 合同不一致。候选输出目录必须为空，state path 必须是绝对路径并与后续 reconcile/status/resume 共用。真实 DSH 宿主、WSL2/WAL、远端回执和生产切换另有门禁与授权。

仓库级 `pipeline.mjs --check` 现在明确禁止 Corepack 联网；若提示 `Network access disabled by the environment`，先核对固定 pnpm 缓存是否已准备。该入口会净化环境，不能假定外层 PATH 或 `COREPACK_HOME` 被沿用。不要关闭 TLS 校验，也不要用单个包构建成功冒充全量检查通过；该次环境缺口的固定缓存/依赖准备、全量检查后续结果见[接续记录](../hackathon/evidence/shinemage-abc-resume-20261008.md)。可使用已准备缓存的独立 HOME；检查阶段本身仍不联网准备依赖。

## 边界检查

本地或 CI 运行 `node scripts/dsh-b0/plugin-boundaries.mjs --check`，核对包 owner、公开/内部合同、跨包引用、构建 DAG 与清单漂移。B0 pipeline 调用四包隔离入口（shine-brand、shine-query、CRM、knowledge），其中 CRM/knowledge 还检查实际解包后的加载；这种本地夹具证据不代替真实宿主安装、服务合同或 clean reviewed SHA 的候选。CRM 的生产源码例外已归零；slot/主题合同由领域生成，页面工具在 profile 层显式装配，见 [边界清单](../architecture/shinemage-plugin-boundaries.md)。

## 相关入口

- [rc2 Quickstart](./dsh-rc2-quickstart.md)
- [profile manifest](../architecture/dsh-profile-manifest.md)
- [release artifact reference](../reference/dsh-rc2-release-artifact.md)
- [当前状态](../../STATUS.md)
- [CRM 插件与独立合成服务](./crm-plugin-service-boundary.md)
