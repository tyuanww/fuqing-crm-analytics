# How to 更新一个 ShineMage 插件

这份指南描述一次普通的单插件更新：插件作者在自己的仓库修改、测试并生成带摘要的包，主仓只更新需要变化的组合输入。完成后，你得到的是一个可审查的插件 PR；它不会自动变成 DSH 正式 candidate，也不会触发生产部署。

如果你要理解仓库职责、清理归档或升级 DSH，先读[维护、清理与升级手册](./shinemage-maintenance-and-cleanup.md)。如果你要查某个命令的完整输入合同，读[插件作者 Quickstart](./dsh-plugin-author-quickstart.md)和[当前验证入口](./verification.md)。

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

- 目标插件的独立远程仓及其 README/CI 已确定。当前九个仓的远程状态见[远程插件收口复核](../hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。
- Node `24.19.0` 已准备。shine-brand 的默认公开编译路径使用 npm `11.17.0` 安装 `npm-author/package-lock.json` 中的精确依赖，打包使用其中的 pnpm `11.28.2`，不需要上游 checkout、build-tools 或 kit。它只做语法转换，不代表严格 SDK 类型检查或宿主兼容。
- 其余八仓的固定 SDK 路径，以及 shine-brand 保留的兼容入口，需要 pnpm `11.28.2`、固定 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443` 和审核过的 build-tools/kit 输入；路径必须是绝对路径。首次准备与已有输入复用分别按目标仓的 `DEVELOPMENT.md` 和 CI 执行。
- 图表插件还需要版本与 SHA 已锁定的 `@shine-mage/board-components` tarball；CRM/知识插件使用各自声明的服务合同输入。
- 目标目录是新的、由本次运行独占的目录。失败输出保留，不覆盖旧 candidate、旧 journal 或旧证据。

## 步骤

### 1. 在插件仓建立干净分支

先选定已审查的产品分支、完整 SHA 和对应 CI 回执。2026-10-11 复核时九仓的 PR #1 均未合并，默认 `main` 仍是初始提交，不能直接从默认 clone 的 HEAD 开始更新。下面只示范 shine-brand 已核验的产品基线；其他插件不能只替换仓库名，必须同时替换分支、SHA 和后续构建入口。远端分支前移导致 SHA 不符时停止，先审查新基线。

```bash
set -euo pipefail
plugin_repo="dsh-shine-brand"
reviewed_branch="codex/shine-brand-independent"
reviewed_sha="2d7c17c2afa8050fc2d6b5def6af34fcaf821667"
topic="update-brand-label"       # 本次完整变化的主题
pr_base="$reviewed_branch"       # PR #1 未合并时，新 PR 以产品分支为 base
git clone --no-checkout --single-branch --branch "$reviewed_branch" \
  "https://github.com/tyuanww/${plugin_repo}.git"
cd "$plugin_repo"
git fetch origin "refs/heads/${reviewed_branch}"
test "$(git rev-parse --verify 'FETCH_HEAD^{commit}')" = "$reviewed_sha"
git switch -c "codex/${topic}" "$reviewed_sha"
git status --short --branch
```

该产品基线的[PR #1](https://github.com/tyuanww/dsh-shine-brand/pull/1)与[CI 回执](https://github.com/tyuanww/dsh-shine-brand/actions/runs/37802176213)不包含后续本地文档提交。相关 PR 合并后，改用已核验的 `main` SHA，并将 `reviewed_branch`、`pr_base` 改为 `main`；不要沿用旧 SHA 推断新主线已通过。

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
