# How to 更新一个 ShineMage 插件

这份指南描述一次普通的单插件更新：插件作者在自己的仓库修改、测试并生成带摘要的包，主仓只更新需要变化的组合输入。完成后，你得到的是一个可审查的插件 PR；它不会自动变成 DSH 正式 candidate，也不会触发生产部署。

如果你要理解仓库职责、清理归档或升级 DSH，先读[维护、清理与升级手册](./shinemage-maintenance-and-cleanup.md)。如果你要查某个命令的完整输入合同，读[插件作者 Quickstart](./dsh-plugin-author-quickstart.md)和[当前验证入口](./verification.md)。

## 你将完成什么

```text
插件仓库分支
    │  frozen install / build / test / pack
    ▼
不可变 content pack + source/input/digest 记录
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
- Node `24.19.0`、pnpm `11.28.2`、固定 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443` 和审核过的 build-tools/kit 输入已准备。路径必须是绝对路径。
- 图表插件还需要版本与 SHA 已锁定的 `@shine-mage/board-components` tarball；CRM/知识插件使用各自声明的服务合同输入。
- 目标目录是新的、由本次运行独占的目录。失败输出保留，不覆盖旧 candidate、旧 journal 或旧证据。

## 步骤

### 1. 在插件仓建立干净分支

```bash
plugin_repo="dsh-shine-brand"     # 替换为目标独立仓库名
topic="update-revenue-label"      # 替换为本次完整变化的主题
git clone "https://github.com/tyuanww/${plugin_repo}.git"
cd "$plugin_repo"
git switch -c "codex/${topic}"
git status --short --branch
```

确认只在这个插件仓工作。不要把主仓的 `dsh-plugins/`、相邻 worktree、`node_modules` 或主仓 `.context` 复制进来。先读插件自己的 `README.md` 和 `AGENTS.md`（若存在），确认包名、版本、peer、输入摘要和本仓的 CI 入口。

### 2. 只准备声明过的固定输入

```bash
export COREPACK_ENABLE_NETWORK=0
export COREPACK_ENABLE_AUTO_PIN=0
export B0_BUILD_UPSTREAM=/absolute/pinned-dsh-checkout
export B0_BUILD_TOOLS=/absolute/reviewed-build-tools
export DSH_PACKAGE_INPUTS=/absolute/locked-domain-inputs   # 需要领域包时
```

独立作者仓通常用仓库内的 `author-inputs.mjs` 或 `check-inputs` 创建新的开发目录；以插件 README 的实际命令为准。输入缺失、摘要不符、相对路径、额外文件或既有输出目录应当失败。不要关闭 TLS、放宽版本检查或改用 `latest`。

### 3. 构建、测试并检查内容

在插件仓运行其声明的 frozen install、build、包级测试和内容检查。常见形状如下，命令名以目标仓为准：

```bash
pnpm install --frozen-lockfile --offline
pnpm build "$B0_BUILD_UPSTREAM" "$B0_BUILD_TOOLS"
pnpm test
pnpm pack --pack-destination /absolute/new-pack-directory
sha256sum /absolute/new-pack-directory/*.tgz
git diff --check
git status --short
```

记录以下事实：提交 SHA、包名/版本、tarball SHA-256、输入摘要、测试命令和退出码。检查 tarball 只含声明的运行时文件、入口和合同；不应包含 `src/`、测试、`node_modules`、kit、开发锁或 source map。包通过不代表宿主、服务、真实模型或生产通过。

### 4. 让插件仓 CI 和 PR 先收口

```bash
reviewed_files=(plugin/package.json plugin/build.mjs)  # 按仓库实际审查结果补齐
git add -- "${reviewed_files[@]}"
git commit -m "feat(plugin): describe one complete change"
git push -u origin "codex/${topic}"
gh pr create --fill
gh pr checks --watch
```

提交只包含一个完整目的。CI 通过后，在 PR 描述中写清固定输入、包摘要、测试范围和未执行项。当前独立仓的 fixed-inputs CI 只证明各自声明的构建链；它不等于主仓组合验收、正式 DSH candidate 或生产发布。合并插件 PR 需要另行授权。

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

完成本指南后，你拥有一个可复现的插件提交、一个经过 CI 的普通 content pack，以及（若从同一干净提交重新生成正式 pack 并明确准备组合输入）一条可审查的 candidate 身份链。普通包与正式 pack 的摘要分别记录，不能互相替代。DSH 主仓仍可独立升级，插件也可单独迭代；两者不会因为一次普通插件更新被隐式捆绑。

相关入口：[维护、清理与升级手册](./shinemage-maintenance-and-cleanup.md) · [DSH 插件作者 Quickstart](./dsh-plugin-author-quickstart.md) · [当前验证入口](./verification.md) · [插件平台边界](../architecture/shinemage-plugin-platform.md)
