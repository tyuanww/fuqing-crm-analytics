# How to 更新一个 ShineMage 插件

## 当前输入与交付状态（2026-10-12）

当前主仓组合锁绑定 Workbench `3030e3f`／`90000400…`、CRM `dac0539`／`4ee58ec3…`、Knowledge `f623c22`／`feb1187c…`，另六包与两份 profile 保持。十个独立作者仓 PR #1 已普通 merge，各自 main CI 均 SUCCESS；正式包回执、组合锁和当前输入边界见[作者合并与候选前置核验](../hackathon/evidence/shinemage-author-merge-and-candidate-preflight-20261012.md)与[当前正式组合输入预检](../hackathon/evidence/shinemage-composition-preflight-20261012.md)。不再按下方较早 2026-10-11 时点更新锁，也不把其中“未提交”“尚未迁移”当成当前默认入口结论。

普通插件更新先在插件作者仓完成受影响检查、独立产物及 PR；组合变化时，主仓才更新对应固定输入。默认包消费、installed-kit、领域作者覆盖、公开合同和 release 包装配已经迁移并提交；主仓仍保留另两组旧 Workbench 断言、合同／静态守卫及历史副本。来源变化须同时绑定正式包与作者 CI，不能仅换 ZIP 或沿用旧 candidate/journal。

PR #121 及后续文档收口已合并，主仓 main CI SUCCESS；三仓正式 `dsh-plugin-pack/v1` 回执已接入组合锁，九包、两 profile 的输入预检 exit 0。当前 service binding、服务/目标/terminal/browser/recovery、真实模型/业务/WeKnora、standalone、SDK 分发及独立 DSH 升级仍分别收尾；不因此宣称任意插件无重启热插拔或已能正式发布。详细状态以[验证入口](verification.md)和根 [STATUS.md](../../STATUS.md) 为准。

以下进度段和步骤中的验收计数保留各自执行时点；当前状态以上段及[验证入口](verification.md)为准。操作步骤中的命令仍须满足实际输入与授权，不能把历史成功改标为当前包通过。


Workbench 当前正式来源为 `3030e3f`，对应 formal pack manifest `90000400…`；作者 core CI 为 155 files / 1086 PASS，正式包已由主仓 reader 核对，browser/standalone 仍 `NOT_RUN_BY_THIS_COMMAND`。不能只替换 ZIP 路径或继承旧候选验收；当前完整九包宿主、服务、目标和准入仍未执行。见[当前正式包 CI 收口](../hackathon/evidence/shinemage-formal-plugin-ci-20261012.md)。

board-components 已有[独立私有远程仓](https://github.com/tyuanww/shinemage-board-components)；其 PR #1 已合并，main CI SUCCESS。开发只需固定 Node/pnpm、本仓 kit 与封存回归输入，无 DSH checkout/build-tools。当前领域包仍由主仓组合锁和消费者合同核验，升级函数/类型及切换输入仍需针对性验证。见[作者合并与候选前置核验](../hackathon/evidence/shinemage-author-merge-and-candidate-preflight-20261012.md)与[主仓本地守卫](../hackathon/evidence/shinemage-board-components-main-output-guard-20261011.md)。

上一轮领域本地 Git/clone 交付时点（保留原记录）：

board-components 的独立本地作者仓已提交为 `3855db80` 并完成真实 clone 验证；纯领域构建只需固定 Node/pnpm 和本仓 kit，不需要 DSH checkout/build-tools。作者工作区干净、尚无 remote，远端 CI 及主仓切换未运行；当前 1955 字节包 `22245ab9…` 是普通领域输入。更新函数/类型仍需自己的版本与消费者锁，主仓旧生产者暂保留。实际路径、固定命令和 Git 事实见[领域 Git/clone 交付](../hackathon/evidence/shinemage-board-components-owner-git-delivery-20261011.md)。

上一轮领域提案准备时点（保留原记录）：

纯领域库 board-components 的独立本地提案不依赖 DSH checkout/build-tools；用本仓固定 pnpm JS 入口、vendored kit 和封存回归输入构建，仍为 1955 字节 `22245ab9…`。当前没有 Git/远端 CI；函数/类型将来变化需自己的版本和消费者锁，主仓原生产者及公开合同暂保留。见[领域开发提案](../hackathon/evidence/shinemage-board-components-owner-proposal-20261011.md)。

主仓默认四插件源码隔离也已迁为固定正式包的独立接收，不再为普通更新复制兄弟源码、执行其 build 或制造临时来源提交；原四源码夹具仅作显式 legacy 保留。当前包接收 4 PASS、公共行为 29 PASS 各自记账；领域生产者、私有几何投影和剩余源码合同仍在，完整 B0/CI 和正式准入继续单列。输入与拒绝边界见[本轮固定包隔离](../hackathon/evidence/shinemage-fixed-pack-isolation-20261011.md)。

当前主仓 installed-kit 默认检查已经停止重建十份业务/领域源码：开发 kit 用自有严格编译夹具验证，九包声明与三份领域锁从固定正式包核对；实际同次 13 PASS，完整 B0 与正式组合仍未执行。该变更不把 D/E 五仓改成有独立 tsc，也不删除旧副本。字段和命令见[当前 kit 验证入口](./verification.md#当前-kit-与固定包验证2026-10-11)，结果和拒读边界见[本轮证据](../hackathon/evidence/shinemage-installed-kit-pack-ownership-20261011.md)。以下包装配和作者记录按各自执行时点保留。

这份指南描述一次普通的单插件更新：插件作者在自己的仓库修改、测试并生成带摘要的包，主仓只更新需要变化的组合输入。完成后，你得到的是一个可审查的插件 PR；它不会自动变成 DSH 正式 candidate，也不会触发生产部署。

正式 preflight/release 现在消费独立正式包，所选 profile 必须与外部输入同字节；装配不会读取业务插件作者源码、构建它们或安装 peer。当前七包已完成源码拒读装配与运行文件核对，整条 preflight 仍未跑。单独插件输入锁更新继续选择适用 B0，但不自动执行整套 DSH prepare/audit；DSH 升级另行推进。installed-kit 和历史源码夹具仍开放，旧副本不删；实际证据及未执行边界见[当前包装配记录](../hackathon/evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

上一轮执行记录（Workbench core 归属迁移；其完整 B0 只覆盖当时字节）：

Workbench 当前链为独立干净提交 `d038f357` → 成功完整 core CI → 新正式回执 `9d7f6bf3…` / tarball `e41df9f5…` → 组合锁 `89e2b2ea…`。主仓常规 core/构建/私有 loader/clean rebuild 已迁到固定作者证据，保留公开消费者及原 backend/query 三组；新本地 B0 r3 通过，主仓改动尚未提交、没有新 hosted CI。tarball 与 fd46 前轮安装/回退同字节，但旧运行不改写成新 candidate 或服务/目标验收。installed-kit、历史生产者与 formal preflight 源码路径仍待收尾，旧副本暂不删除；browser/standalone、服务/目标/模型/业务和独立发布分别验收。见[当前输入链与实跑](../hackathon/evidence/shinemage-workbench-core-formal-main-ownership-20261011.md)。

以下接续段保留较早执行时点；其中旧来源、未执行和未提交结论按各自证据对象理解，当前入口与身份以本节最前面的最新记录为准。

以下保留前轮作者测试收口的执行时点；当前 Git/CI 状态以上一段为准。

包内未公开实现的检查由作者仓承担。Workbench 已接入 loader/skills/独立视图和原生通道授权、页面交付六入口，本地完整作者入口同次 30 文件、212 PASS；原测试与 helper 未改，模型与业务 HTTP 仍为合成夹具，新 CI 未运行、改动未提交。主仓的公共包消费者和七个尚未切走的生产者入口分开保留，不能因为作者本地通过就删历史副本或继承正式宿主验收；当前见[作者测试补齐](../hackathon/evidence/shinemage-workbench-author-tests-closeout-20261011.md)，前轮 204 项及输入锁来源保留在[历史归属记录](../hackathon/evidence/shinemage-workbench-producer-ownership-20261011.md)。

如果你要理解仓库职责、清理归档或升级 DSH，先读[维护、清理与升级手册](./shinemage-maintenance-and-cleanup.md)。如果你要查某个命令的完整输入合同，读[插件作者 Quickstart](./dsh-plugin-author-quickstart.md)和[当前验证入口](./verification.md)。完整主仓 B0 还要求与正式包身份匹配的 `WORKBENCH_AUTHOR_CI_ARCHIVE`、固定领域的 `DOMAIN_AUTHOR_CI_ARCHIVE` 和三仓 `PUBLIC_CONTRACT_INPUTS`；准备与离线运行步骤见[B0 固定包和作者证据输入](./verification.md#b0-固定包和作者证据输入)。单独运行公开包消费者时，继续使用其自身列明的输入。

## 你将完成什么

```text
插件仓库分支
    │  frozen install / build / test / pack
    ▼
内容校验回执 + source/input/digest 记录（保留包时另记 tarball 路径）
    │  插件仓 CI 与 PR
    ▼
主仓 profile（仅在组合变化时更新）
    │  受影响合同验证
    ▼
候选 / journal（需要相应服务、宿主和授权时才生成）
```

普通 content pack、主仓 CI 通过和本地 candidate 准备是三个不同状态。没有目标宿主、服务回执或正式分发输入时，准确状态是 `NOT_RUN`、`BLOCKED` 或 `release_ready=false`，不能借用旧包的 PASS。

## 前置条件

精确 Cordis `4.0.4` 的隔离修订普通包现已通过官方 npm 宿主的开启、原生关闭、恢复三进程验证：原生鉴权、合成会话保留、关闭时 CRM 路由 404、恢复后 200 且未连接。新 home/workspace、localhost 沙箱及自有进程清理均核对；旧正式包、原作者仓和 candidate/journal 不变，不能抵扣真实服务/模型或正式准入。原仓仍需精确校准授权、新干净提交和正式包，不沿用诊断身份；见[本轮记录](../hackathon/evidence/shinemage-corrected-npm-host-20261011.md)。

精确 Cordis `4.0.4` 的作者与主仓配套修订已准备在隔离副本；普通严格 npm 锁解析、实际安装及四入口导入通过，未改变原仓和旧正式包。先取得 owner 合同校准授权，再交付干净新来源与正式包；输入锁更新后才接入主仓守卫。具体补丁、实测与顺序见[提案证据](../hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。

当前 CRM/Knowledge 的普通严格包解析尚不能通过：固定 DSH/dsh-tools 的 Cordis 是 `~4.0.4`，两包声明精确 `4.0.2`。先按插件 owner 的合同修订收口声明及同包验证，不使用 force、legacy-peer-deps 或 linked 初始化替代。现有声明未自动改变，见[严格解析记录](../hackathon/evidence/shinemage-cordis-strict-peer-20261011.md)。

- 目标插件的独立远程仓及其 README/CI 已确定。当前九个仓的远程状态见[远程插件收口复核](../hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。
- Node `24.19.0` 已准备。shine-brand 的默认公开编译路径使用 npm `11.17.0` 安装 `npm-author/package-lock.json` 中的精确依赖，打包使用其中的 pnpm `11.28.2`，不需要上游 checkout、build-tools 或 kit。它只做语法转换，不代表严格 SDK 类型检查或宿主兼容。
- 其余八仓的固定 SDK 路径，以及 shine-brand 保留的兼容入口，需要 pnpm `11.28.2`、固定 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443` 和审核过的 build-tools/kit 输入；路径必须是绝对路径。首次准备与已有输入复用分别按目标仓的 `DEVELOPMENT.md` 和 CI 执行。
- 图表插件还需要版本与 SHA 已锁定的 `@shine-mage/board-components` tarball；CRM/知识插件使用各自声明的服务合同输入。
- 目标目录是新的、由本次运行独占的目录。失败输出保留，不覆盖旧 candidate、旧 journal 或旧证据。

## 步骤

### 1. 在插件仓建立干净分支

先选定已审查的产品分支、完整 SHA 和对应 CI 回执。2026-10-12 复核时十个作者仓 PR #1 均已普通 merge，下面示范从 shine-brand 的 `main` 基线开始；其他插件不能只替换仓库名，必须同时替换分支、SHA 和后续构建入口。远端分支前移导致 SHA 不符时停止，先审查新基线。

```bash
set -euo pipefail
plugin_repo="dsh-shine-brand"
reviewed_branch="main"
reviewed_sha="6754f37075ad00d1b17478c9ed42e901419bda0f"
topic="update-brand-label"       # 本次完整变化的主题
pr_base="main"
git clone --no-checkout --single-branch --branch "$reviewed_branch" \
  "https://github.com/tyuanww/${plugin_repo}.git"
cd "$plugin_repo"
git fetch origin "refs/heads/${reviewed_branch}"
test "$(git rev-parse --verify 'FETCH_HEAD^{commit}')" = "$reviewed_sha"
git switch -c "codex/${topic}" "$reviewed_sha"
git status --short --branch
```

本次核验的 shine-brand `main` 合并提交为 `6754f370…`，对应 main CI `38238051696` SUCCESS。其他作者仓使用各自合并 SHA 和 main CI；不要把某个仓的 SHA 或 CI 结果套到另一个插件。

确认只在这个插件仓工作。不要把主仓的 `dsh-plugins/`、相邻 worktree、`node_modules` 或主仓 `.context` 复制进来。先读插件自己的 `README.md` 和 `AGENTS.md`（若存在），确认包名、版本、peer、输入摘要和本仓的 CI 入口。

### 2. 只准备声明过的固定输入

```bash
export COREPACK_ENABLE_NETWORK=0
export COREPACK_ENABLE_AUTO_PIN=0
```

shine-brand 的公开编译路径直接进入下一步，在自己的 `npm-author/` 安装锁定工具。只有选择固定 SDK 路径时才配置以下目录，并按该仓说明设置它自己的 pnpm JS 入口变量：

```bash
export B0_BUILD_UPSTREAM=/absolute/pinned-dsh-checkout
export B0_BUILD_TOOLS=/absolute/reviewed-build-tools
export DSH_PACKAGE_INPUTS="$PWD/inputs/package-inputs"   # 没有领域包时也保留本仓声明的空输入目录
```

当前独立仓已经带有自己的开发根、锁、vendor 与输入说明，不需要复制主仓的 `author-inputs.mjs` 流程。已有固定输入由 `check-inputs` 核验；首次准备使用本仓 CI/开发说明中的入口。输入缺失、摘要不符、相对路径、额外文件或既有输出目录应当失败。不要关闭 TLS、放宽版本检查或改用 `latest`。

### 3. 构建、测试并检查内容

下面命令只适用于步骤 1 的 shine-brand 基线，在作者仓根运行，与该基线的 `DEVELOPMENT.md` 和 `.github/workflows/ci.yml` 一致。首次安装需要 npm registry；未修改锁和依赖的后续源码迭代可复用本仓已安装工具：

```bash
set -euo pipefail
test "$(node --version)" = v24.19.0
test "$(npm --version)" = 11.17.0
npm ci --prefix npm-author --ignore-scripts --no-audit --no-fund
node npm-author/build.mjs
node --test scripts/build-input.test.mjs scripts/pinned-pnpm.test.mjs npm-author/build.test.mjs plugin/src/brand-surface.test.mjs plugin/src/client-lifecycle.test.mjs
export SHINE_BRAND_PNPM_ENTRY="$PWD/npm-author/node_modules/pnpm/bin/pnpm.mjs"
evidence_dir="$(mktemp -d "${TMPDIR:-/tmp}/shine-brand-content-check.XXXXXX")"
node scripts/verify-pack.mjs > "$evidence_dir/content-pack.log" 2>&1
cat "$evidence_dir/content-pack.log"
printf '内容校验日志：%s\n' "$evidence_dir/content-pack.log"
git diff --check
git status --short
```

shine-brand 的 `verify-pack.mjs` 在临时 staging 中打包，校验五个成员及其摘要，输出内容回执后删除临时 tarball；上例保存的是日志，不能声称该日志目录里已有可安装包。需要留存/交付包时，按该仓实际支持的保留产物流程处理；正式 candidate 则走步骤 6，并为实际保留的包重新记录路径和摘要。

其他八仓按选定 SHA 中的 `DEVELOPMENT.md` 和完整构建 workflow 执行各自的安装、输入预检、构建、包级测试及 `scripts/verify-pack.mjs`。这些仓的 pnpm 入口变量、测试集合、输出目录和是否保留 tarball 不完全相同，不能套用上面的 shine-brand 命令。九仓根 `package.json` 都是开发 wrapper，没有通用 `build/test` scripts；实际插件在 `plugin/`。不要在根目录直接运行 `pnpm build`、`pnpm test` 或 `pnpm pack`，也不要用根开发工程包替代插件内容包。

记录以下事实：提交 SHA、包名/版本、tarball SHA-256、输入摘要、测试命令和退出码。检查 tarball 只含声明的运行时文件、入口和合同；不应包含 `src/`、测试、`node_modules`、kit、开发锁或 source map。包通过不代表宿主、服务、真实模型或生产通过。

### 4. 让插件仓 CI 和 PR 先收口

```bash
reviewed_files=(plugin/package.json plugin/build.mjs)  # 按仓库实际审查结果补齐
git add -- "${reviewed_files[@]}"
git commit -m "feat(plugin): describe one complete change"
git push -u origin "codex/${topic}"
gh pr create --base "$pr_base" --fill
gh pr checks --watch
```

提交只包含一个完整目的。CI 通过后，在 PR 描述中写清固定输入、包摘要、测试范围和未执行项；只有拿到实际保留的 tarball 才登记可交付包路径。PR #1 尚未合并时，说明新 PR 对该产品分支的依赖，不把继承的整段历史当作这次单插件变化。当前独立仓的 CI 只证明各自声明的构建链；它不等于主仓组合验收、正式 DSH candidate 或生产发布。合并插件 PR 需要另行授权。

#### 目录发现与安装通道另行放行

[第三方社区 DSH Plugin Hub](https://github.com/dshplugin/dsh-plugin-hub) 可作为目录字段和安装通道的参考，但不能替代本项目的来源锁定、正式 pack 或宿主验收。其当前收录流程要求公开仓库和 `dsh-plugin` topic，并要求 README 给出实际可执行的安装信息；安装器优先使用 npm 包，其次使用目录给出的、符合 `releases/download/<tag>/<asset>.tgz` URL 形状的 GitHub Release 资产。Hub 的这层检查不证明 tag 不可移动，也不核验资产摘要；目录中的 `verified` 同样不等于本项目的 `release_ready=true`。

当前九个 ShineMage 作者仓都是私有仓，没有许可证、topic、tag 或 GitHub Release；仓库根 `package.json` 是开发 wrapper，真实插件清单位于 `plugin/`。因此：

- 状态保持 `PRIVATE / NOT_PUBLISHED / NOT_LISTED`，不加目录徽章，也不宣称市场可安装。
- 不提供 `git+https` 源码直装命令。未来优先发布经过审查的 npm 插件包；若使用 GitHub Release，则只引用固定 tag、固定资产名和已记录摘要的 `.tgz`。
- 许可证、公开化、repository topic、包元数据和目录提交分别决策；不能为了被目录发现而放宽 peer、固定输入或来源检查。
- 插件更新需要重启时继续记录 `HOST_RESTART_REQUIRED`；不复制第三方市场对热加载的概括来扩大本项目的已验证能力。

这些约束来自 2026-10-11 对 Hub 固定源码 `0fc6caba44e1d6c6674162ade0f1ef83d412b97d` 的[安装通道选择](https://github.com/dshplugin/dsh-plugin-hub/blob/0fc6caba44e1d6c6674162ade0f1ef83d412b97d/src/client/logic/install-command.ts)、[Release URL 校验](https://github.com/dshplugin/dsh-plugin-hub/blob/0fc6caba44e1d6c6674162ade0f1ef83d412b97d/src/server/services/install/release-target.ts)与[当前收录说明](https://dsh-plugin.org/zh/submit)的只读核对。Hub 或目录规则变化时重新核验，不能把本段当作永久协议。

### 5. 只有组合确实变化时才改主仓

只有插件路径、ID、顺序、DSH pin 或 service binding 等组合选择发生变化时，才在主仓 feature 分支更新对应 profile/allowlist；仅包版本或字节摘要变化时，更新正式 pack/candidate 输入和兼容记录即可。当前 profile 只选择插件路径、ID、顺序和 DSH pin，不保存 tarball SHA。只改一个插件，不重建 DSH，不迁移数据库，也不重复 SDK 全量审计。没有组合变化的插件文档或测试修复，不要为了“同步”改主仓 profile。

```bash
cd /absolute/fuqing-crm-analytics
git fetch origin main
git diff origin/main...HEAD -- config scripts docs
node scripts/dsh-b0/plugin-boundaries.mjs --check
pnpm dsh verify --scope local
```

主仓 CI 的路径计划决定是否扩大检查集合。改了 profile、host、跨插件合同或 DSH pin，才按[验证入口](./verification.md)选择 B0、合同和候选检查；不要把插件仓的测试数和主仓检查数相加。


#### 正式 preflight 与 release 的固定包输入

`doctor --release`、`preflight` 和 `release` 需要绝对路径 `DSH_PROFILE_PACK_INPUTS`，合同仍为 `dsh-profile-pack-inputs/v1`。它必须绑定主仓当前选定 profile 的原始内容和摘要，包 ID/顺序、来源、正式 manifest 和 tarball 由既有严格读取器核对；不能用普通 content pack 或另一份同名 profile 替代。默认七包 profile 可使用包准备回执中的 `CRM_COMPOSITION_PAGE_INPUTS`。切到 CRM/知识等其他 profile 时，必须同时提供该 profile 自己的包输入；现有 `service_binding` 与 `--service-evidence` 门禁保持。

```bash
export DSH_PROFILE_PACK_INPUTS=/absolute/prepared-composition/page-inputs.json
export DSH_PYTHON=/absolute/python3.14
node scripts/release/preflight.mjs --check \
  --python "$DSH_PYTHON" \
  --tag dsh-fixed-pack-check \
  --output-dir /new/private/release-check
```

下述阻断是引用记录的当时状态，不是本轮提交后的新 preflight 结果；本轮未重跑整条 preflight。

这是只读入口，不启动宿主或服务，也不运行 prepare/audit/build。干净工作树、Node/pnpm/Python、固定上游、zstd、runtime bundle、输出与证据目录仍会检查。缺输入、profile 不同、摘要漂移或结果目录已有内容均拒绝，不回退到旧源码。当前实跑中七包输入通过，但 dirty tree 和缺 runtime bundle 导致整体 BLOCKED。

正式执行时，历史 `build` stage 只复核同一固定包输入；`release` 从排除业务源码的主仓 allowlist 生成独占 payload，把所选运行文件放到 profile 原路径，并保留原包回执与 tarball。新 manifest 的 `profile_pack_snapshot` 绑定 `shinemage-release-pack-inputs.json`，接收端验证实际运行文件逐字节等于对应归档，额外文件或替换字节拒绝。历史无该字段的 manifest 按原合同验证，不改写历史回执。整套 DSH prepare/audit/runtime 阶段仍只属于明确的 DSH/preflight 工作；单独输入锁改动不会自动触发它，主仓适用 B0 仍由路径选择执行。

本轮实际验证只关闭固定包装配子项，未生成新的完整应用 artifact、candidate 或 journal；完整 preflight、本轮最新完整 B0、新 CI、宿主/服务/目标/真实业务与发布仍未执行。见[当前包装配记录](../hackathon/evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

#### 开发入口消费固定包（2026-10-11 本地迁移）

本节改动后的完整本地 B0 已完成 r2：固定输入、独立 B0 Python 原锁、禁网 Corepack 版本检查、合同、合成 Python/Node、严格构建和干净重建通过，实际 exit 0。首轮清单过期失败保留，边界清单由既有生成器更新、policy 未改。Node 的十次跳过不替代 shell/tool opt-in、固定包沙箱握手或 standalone 实测；新 hosted CI、当前 candidate 与真实业务仍未关闭。这里仍有历史源码生产者阶段，不能删除副本或把本地结果写成正式发布。完整命令及范围见[当前 B0 记录](../hackathon/evidence/shinemage-current-b0-closeout-20261011.md)；下面各迁移阶段的 NOT_RUN 保留为当时范围。

CRM/知识配置准备也已本地支持同一输入合同。其 CLI 使用 `--pack-inputs`，其中 profile 的插件清单必须与正式包的 ID、顺序和摘要一致。现有 `config/dsh-profile.crm-knowledge.rc2.json` 选择 CRM 和知识两包；需要 page tools 时必须在已审查的组合中显式选择 Workbench 正式包，不能读取其源码补齐。

```bash
# 仅生成新的私有配置及解包目录，不启动服务或宿主。
node scripts/crm-calibration/prepare-profile.mjs \
  --output /new/private/crm-knowledge-assets \
  --pack-inputs /absolute/crm-knowledge-inputs.json
```

生成的 `manifest.json` 仍为 `crm-profile-assets/v3`，新增 `package_inputs` 保存 profile、来源 SHA、manifest 和 tarball 摘要；运行入口只指向本次解出的包。普通 content pack、混用 `--plugin` / `--knowledge-plugin` / `--page-tools-plugin`、坏摘要或已有输出都会失败，不回退到主仓。带 `service_binding` 的 profile 必须走既有 candidate/服务门禁，不能用本命令绕过。Cordis 声明 `4.0.2` 保持，配置准备不证明实际 `4.0.4` 的运行兼容。实现尚未提交；实测与未执行项见[CRM/知识包输入记录](../hackathon/evidence/shinemage-crm-profile-pack-migration-20261011.md)。

CRM／知识包行为和公开 page tools 的公共合同组合可用以下固定包入口验证。CRM 输入沿用现有两包 profile；page 输入沿用现有七包 profile，只消费 Workbench 的 `./page-tools`，不把其他六包的解包写成激活。两份输入必须通过真实正式包读取器；页面输入不能包含另一份同名 CRM／知识包来覆盖原选择。

```bash
set -euo pipefail
test "$(node --version)" = v24.19.0
export B0_BUILD_UPSTREAM=/absolute/pinned-dsh-checkout
export FQ_B0_PYTHON=/absolute/python3.14
export CRM_COMPOSITION_PACK_INPUTS=/absolute/crm-knowledge-inputs.json
export CRM_COMPOSITION_PAGE_INPUTS=/absolute/page-profile-inputs.json
export CRM_COMPOSITION_OUTPUT="$(mktemp -d "${TMPDIR:-/tmp}/crm-pack-composition.XXXXXX")"
node --test --test-concurrency=1 \
  scripts/crm-calibration/crm-package.integration.mjs \
  scripts/crm-calibration/knowledge-package.integration.mjs
node --test --test-concurrency=1 \
  scripts/crm-calibration/knowledge-composition.integration.mjs \
  scripts/crm-calibration/page-composition.integration.mjs \
  scripts/crm-calibration/profile.test.mjs
```

每次使用新的独占输出根，缺输入和既有输出会失败；不回退源码。测试使用官方解析器、真实编译包和自有合成 HTTP 服务，不调用模型。九项公共合同在实际 Cordis `4.0.4` 下通过，只关闭该子项；官方 `plugin add`、完整宿主、整体 peer 兼容和正式 candidate 准入仍未执行。原声明、包和 journal 不改。默认 B0 的组合阶段现在需要这三项输入并显式传入固定 Python；其余源码装配尚待迁移，CI 的新准备入口仍缺远端输入配置，所以本轮没有完整 B0/新 CI PASS。详见[组合验收记录](../hackathon/evidence/shinemage-fixed-pack-composition-20261011.md)。

后续包消费迁移已取消默认 B0 的 CRM/Knowledge 两项源码构建，改为以上 11 项包行为；原公开断言正文不变，私有 transport/graph/relay 检查由独立作者仓负责。`crm-package`、`knowledge-package`、`knowledge`、`page` 各用独立子目录，同一 scope 再跑必须换新输出根。11 项包消费、67 项守卫与原 9 项组合回归分别通过，完整 B0、新 hosted CI 和 Workbench 源码阶段仍开放；见[包行为迁移](../hackathon/evidence/shinemage-crm-knowledge-package-consumers-20261011.md)。此外，固定两包已有[官方安装/宿主初始化补查](../hackathon/evidence/shinemage-crm-knowledge-host-compat-20261011.md)，只补齐安装/初始化层，不关闭整体兼容或正式 candidate。上述旧九项组合记录的 NOT_RUN 不覆盖后续补查结果。

主仓 profile 的五项检查随后移回主仓维护目录，以上第二条命令现含原 profile 五项与两组公共组合九项；本次默认 B0 相同三入口组在源码拒读下 14 PASS，未启动完整宿主或调用模型。旧 CRM 测试路径仍只做兼容转发；重复验证同五项不算新增覆盖。历史 9 项和 38 项记录保持其当时命令及范围，不替换为当前计数。完整 B0、新 CI 及其他源码装配仍开放，见[测试归属迁移](../hackathon/evidence/shinemage-main-profile-test-ownership-20261011.md)。

固定包输入可用主仓准备入口生成，两份 profile 的内容与插件顺序保持原样。`config/shinemage-composition-packs.lock.json` 绑定每包来源 SHA、版本和正式 manifest 摘要；输入目录须有 `packs/<锁内 directory>/plugin-pack.json` 及该 manifest 声明的 tarball。ZIP 只能携带同一层级的包文件，不携带源码、SDK、凭据或服务状态。输出父目录须已存在，输出目录须尚未存在。

```bash
node scripts/ci/composition-pack-inputs.mjs \
  --archive /absolute/composition-packs.zip \
  --output /new/private/composition-r1 \
  --python /absolute/python3.14
```

也可用 `--input-dir /absolute/pack-input-directory` 替代 `--archive`。成功后从 `preparation.json` 的 `env` 读取前述三项绝对路径；运行组合测试后，其 `runs/knowledge`、`runs/page`、`runs/leaf` 与 `runs/geometry` 不可复用。`pipeline --check` 在任何源码构建和服务启动前核对这些输入与结果目录。新包必须经审查更新锁，不得把新来源或修复 manifest 伪装成原包。

原生 prompt 注入消费现也使用同一正式包的 `./client` 与实际 Cordis `4.0.4`；完整九文件命令见[验证入口](verification.md)。九入口一次实跑 66 项、九 scope 输入守卫 18 项分别通过，不是完整宿主/真实 session 验收。`workbench-native-prompt` 目录不得复用，原七个 Host/私有 producer 与其他源码构建保留待迁移；见[本轮证据](../hackathon/evidence/shinemage-workbench-native-prompt-pack-20261011.md)。

主仓的客户端消费组已进一步覆盖工具卡、取消、保存、首购和资产弹层，具体八文件命令见[验证入口](verification.md)。它们从同一正式包读取 `./client`，分别使用限定的新消费子目录；合成输入留在主仓验收目录，业务实现仍由插件仓维护。原源码结构断言保留，私有视图和 Host 入口仍待迁移；不要把 56 项客户端结果当作完整宿主或正式服务通过。见[接续证据](../hackathon/evidence/shinemage-workbench-consumer-contracts-20261011.md)。

Workbench 的发布客户端消费另用 `node --test --test-concurrency=1 scripts/dsh-b0/workbench-client-pack.integration.mjs`，同样使用上述固定 page 包输入和新的结果根，独占 `workbench-client` 子目录。12 项原检查已迁到主仓正文；旧生命周期路径只作兼容，pipeline 不再从源码或干净重建副本重复运行它。Host 入口及其余私有测试仍保留，不能把客户端通过写成激活、完整宿主或候选通过。见[本轮记录](../hackathon/evidence/shinemage-workbench-client-pack-migration-20261011.md)。

主仓六个叶子插件的常规包消费阶段已改为上述固定输入。`leaf-pack-composition.integration.mjs` 读取实际发布 host/client 与公开几何，`legacy-geometry-exports.test.mjs` 从同一正式包读取 ESM/require/类型文件；类型检查还要求绝对 `B0_BUILD_TOOLS`。本轮源码拒读消费通过，不代表完整浏览器、原生 Settings 或 Workbench 激活通过。历史作者输入守卫和源码隔离夹具，以及 Workbench/CRM/知识构建仍保留待迁移，旧副本暂不删除。实测入口与边界见[叶子包记录](../hackathon/evidence/shinemage-leaf-pack-migration-20261011.md)。

ZIP 的路径、类型、重复成员和大小检查即使在 Python `-O` 模式也会执行；不依赖可关闭的 assert。最新目录/ZIP 准备只复制已经核对的运行包字节；本轮前端、backend、tooling 和 release 回归的范围与 SKIP 单独记录在接续证据，不代表当前包完整宿主或发布验收。

三个 hosted CI 工作流使用同一准备器。主仓当前已配置 `SHINEMAGE_PACK_ARTIFACT_REPOSITORY`、`SHINEMAGE_PACK_ARTIFACT_ID`、`SHINEMAGE_PACK_ARTIFACT_SHA256` 三项 variables，以及只授予所选输入仓读取权限的 `SHINEMAGE_PLUGIN_READ_TOKEN` secret。当前 artifact `11732716479`、digest `552aa4d1…`，有效期至 `2026-10-26T07:29:17Z`；成功 run、未过期状态、API digest 与下载字节均会核对。token 仅传给准备步骤，不传入构建或业务测试；不要发送 token 到聊天或写进仓库。实测和未执行项见[正式组合交付](../hackathon/evidence/shinemage-pr121-formal-pack-delivery-20261012.md)。

当前开发入口支持 `--pack-inputs /absolute/inputs.json`，不再自动读取主仓的 Workbench 或兄弟插件目录。正式包必须先通过上述 pack 流程取得；普通 content pack 不能直接传入。该路径已随 PR #121 合入并由主线 CI 核对；组合输入预检仍不等于 candidate 或发布通过。

输入 JSON 的 `schema_version` 为 `dsh-profile-pack-inputs/v1`，只包含三个字段：`schema_version`、`profile`、`plugins`。`profile` 是 `{ "path": "profile.json", "sha256": "原 profile 的 SHA-256" }`；每条 `plugins` 是 `{ "id": "原 allowlist 中的包 ID", "manifest": "packs/该包/plugin-pack.json", "sha256": "该 manifest 的 SHA-256" }`。所有相对路径均从输入 JSON 所在目录解析。逐项保留 profile 原有的插件 ID 和顺序，把正式 manifest 与其声明的 tarball 放在同一目录；不要把源码路径、目录链接或未核对的包替代这些输入。

读取入口会核对 profile、manifest 和 tarball 摘要、包身份、固定 DSH pin 及归档内容，再将已验证的内存字节解到本次 runtime 的新目录。这里不要求逻辑 profile 的 `path` 指向可读源码。缺输入、混用 `--plugin-path` 与 `--pack-inputs`、包身份不符、目录链接或已有安装输出均停止，不回退到主仓源码。

```bash
# 只有明确要执行隔离开发检查时运行；check 会调用官方 plugin add 安装包，
# 再检查配置，不代表候选、真实服务、目标 WSL2 或生产验收。
./scripts/dsh-dev/run.sh check \
  --upstream /absolute/pinned-dsh \
  --plugin on --shine-brand on \
  --pack-inputs /absolute/reviewed-inputs/inputs.json \
  --runtime /absolute/new-owned-runtime --web-port 4328
```

固定包清单应覆盖原 profile；功能开关只决定本次启用哪些包。默认品牌关闭，其余现有 leaf 默认开启；关闭对应开关即可省略该功能的运行安装。`--plugin off` 不读取包输入，只准备原生回退配置。显式 `--plugin-path` 和各 leaf 的 `--*-path` 仍供作者检查已构建目录使用，每个启用功能都必须提供自己的绝对路径；此模式不建立正式包身份。

官方 `plugin add` 需要已准备的 pnpm `11.28.2` 位于调用方 PATH；本地修复优先使用该入口，禁止 Corepack 联网，并核对版本。DSH CLI 本身仍由选定的 Node 执行。`reload` 在停止自有旧实例前检查包输入、固定宿主、额外 patch 和包管理器；错误版本提前拒绝。它不编译插件或 DSH，不迁移数据库，不执行 SDK 全量审计。官方安装命令的依赖解析仍属于安装行为，不能声称完全不安装依赖。

当前 Workbench formal pack 已包含固定运行 peer，并由作者 CI 与主仓 reader 核对通过；完整九包官方宿主、live CLI reload、浏览器和候选服务/目标仍未运行，不承诺热插拔、激活原子性或新候选正式回退通过。原失败与详细范围见[当前正式包 CI 收口](../hackathon/evidence/shinemage-formal-plugin-ci-20261012.md)。

带 `service_binding` 的正式 profile 必须继续使用已有 candidate/service/host 准入链；开发入口返回 `DSH_DEV_SERVICE_PROFILE_USE_CANDIDATE_HARNESS`，不会丢弃服务绑定来启动。当前两份正式 profile 仍没有 `service_binding`，九包组合输入虽已准备成功，candidate/journal、服务、目标和恢复链仍保持 `NOT_RUN`。当前证据见[后续组合预检](../hackathon/evidence/shinemage-composition-next-preflight-20261012.md)。

### 6. 需要候选时建立新的身份链

候选输出目录和 state 文件必须是新的绝对路径。独立作者仓先产出普通 content pack，供内容白名单和运行时文件检查；这个 tarball 及其 SHA 不会自动转换成正式身份。要从独立仓进入正式候选，必须从同一干净提交重新运行主仓的 pack 工具生成 `dsh-plugin-pack/v1` manifest 和受控 tarball，然后通过 `--pack-manifest`/`--pack-sha256` 接收这两个同目录文件。不要把独立仓路径直接传给主仓的 `--plugin` 模式，因为源码模式要求插件位于主仓 profile 的 allowlist 路径内：

```bash
# 在独立插件仓执行；plugin-root 是含 package.json 的目录
pack_root="$(mktemp -d "${TMPDIR:-/tmp}/shine-mage-pack.XXXXXX")"
node /absolute/fuqing-crm-analytics/scripts/release/plugin-pack.mjs \
  --plugin /absolute/plugin-root \
  --output-dir "$pack_root" \
  --manifest "$pack_root/plugin-pack.json"
pack_manifest_sha="$(sha256sum "$pack_root/plugin-pack.json" | awk '{print $1}')"

# 回到主仓；profile 只选择组合，candidate 同时记录 profile digest 与 pack SHA
cd /absolute/fuqing-crm-analytics
candidate_root="$(mktemp -d "${TMPDIR:-/tmp}/shine-mage-candidate.XXXXXX")"
pnpm dsh plugin candidate \
  --pack-manifest "$pack_root/plugin-pack.json" \
  --pack-sha256 "$pack_manifest_sha" \
  --profile config/dsh-profile.rc2.json \
  --output-dir "$candidate_root/pack" \
  --state-path "$candidate_root/state.json"
cat "$candidate_root/pack/candidate.json"
```

CRM/知识组合必须把上例的 profile 换成 `config/dsh-profile.crm-knowledge.rc2.json`，并确认 pack manifest 的包 ID 在该 allowlist 中。`--plugin /absolute/plugin` 只适用于主仓内、与 profile 路径 canonical 相同的源码目录。candidate 当前绑定插件 source SHA、正式 pack 的包 SHA-256、profile digest 和 DSH pin；profile digest 是组合快照，pack SHA 是单个受控 tarball 摘要，两者由 candidate/journal 分别记录。构建输入、领域包和测试范围要在插件仓 CI/证据中单独记录，不能把不存在的通用“输入摘要”字段写进 candidate。涉及保存服务时，还要使用已有的服务 binding 和新服务回执；涉及宿主时，必须提供同一 candidate 的宿主/目标证据。旧 candidate、旧 journal、旧 WSL/浏览器回执不能继承给新包。没有正式目标或授权时停在 `CANDIDATE_PREPARED` / `NOT_RUN`，不要写成 verified 或 active。

### 7. 审查、合并和发布分开处理

在提交或合并前做代码审查；修复后重新检查受影响范围。插件 PR 合并、主仓 PR 合并、GitHub Release、receive/activate 和生产部署是独立动作，分别需要授权。普通 content pack 不是 `dsh-plugin-pack/v1`，本地摘要也不是发布者签名或撤销证明。

## 验证结果怎么记

在 PR 或证据页按这张表写，不把状态混成一个“通过”：

| 层级 | 可以声称 | 不能声称 |
|---|---|---|
| 插件仓 build/test/pack | 该提交在声明的固定输入上可构建，包内容摘要已核对 | DSH 宿主兼容、真实服务、生产可用 |
| 插件仓 CI | 该仓的 CI 门禁通过 | 主仓组合、目标 WSL2、正式分发 |
| 主仓 profile/合同检查 | 该组合的静态/合成合同通过 | 真实模型、业务数据库、杭州激活 |
| candidate/journal | 新身份链已生成到明确阶段 | `release_ready=true`、签名、发布或部署 |

未执行的目标、浏览器、模型、生产和 SDK 供应链检查必须保留 `NOT_RUN` 或 `BLOCKED`，并写出解除条件。SDK 分发目前仍是 `BLOCKED`，不应作为每次普通插件更新的隐含前置步骤。

## 常见失败与处理

| 现象 | 原因 | 处理 |
|---|---|---|
| `UPSTREAM_NOT_CONFIGURED` / `*_INPUT_REQUIRED` | 没有传绝对固定输入 | 准备新的输入目录后重跑，不从相邻目录回退 |
| `PLUGIN_PACK_SOURCE_DIRTY` | 工作树有未提交改动 | 先审查并提交，再从干净 clone 打包 |
| `PACKAGE_INPUT_DIGEST` 或 `HOST_ARTIFACT_*` | 输入/候选摘要与声明不一致 | 保留失败证据，修正绑定并使用新输出目录 |
| `DSH_ERROR OUTPUT-DIR_REQUIRED` | 候选命令缺少独占输出目录 | 传新的绝对 `--output-dir` 和 `--state-path` |
| CI 通过但 candidate 仍 `NOT_RUN` | CI 与目标宿主/发布门禁是不同层级 | 不补写旧回执；准备同一 candidate 的目标输入 |
| SDK `BLOCKED` | 供应链、签名、撤销或完整来源门禁未关闭 | 按 SDK 专项矩阵处理，不把单插件绿色结果改成放行 |

## 清理本次工作

确认新的包摘要、日志和证据已登记后，再按[维护手册的清理顺序](./shinemage-maintenance-and-cleanup.md)处理临时目录和旧 worktree。先生成 manifest 与 SHA-256，再单独授权删除；不要删除历史失败证据、归档包、锁文件、真实数据或未跟踪的独立仓。

## 你现在拥有的结果

完成本指南后，你拥有一个可复现的插件提交和对应 CI/内容校验回执；只有执行并核验了保留产物的步骤，才拥有可交付的普通 content pack。若从同一干净提交重新生成正式 pack 并明确准备组合输入，还可建立一条可审查的 candidate 身份链。普通包与正式 pack 的摘要分别记录，不能互相替代。DSH 主仓仍可独立升级，插件也可单独迭代；两者不会因为一次普通插件更新被隐式捆绑。

相关入口：[维护、清理与升级手册](./shinemage-maintenance-and-cleanup.md) · [DSH 插件作者 Quickstart](./dsh-plugin-author-quickstart.md) · [当前验证入口](./verification.md) · [插件平台边界](../architecture/shinemage-plugin-platform.md)
