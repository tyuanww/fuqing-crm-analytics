# DSH 插件作者 Quickstart

这条路径只验证一个插件包。DSH、CRM 服务、知识库和真实业务数据不随插件构建；插件失败时保留 DSH 原生对话是 T17 宿主验收目标，当前 pack/candidate 尚不能证明进程隔离。插件包默认不得覆盖原生标题、侧栏、会话或工具合同，未接通的 capability 必须显示 `NOT_AVAILABLE` 及原因。

## 前置条件

- 插件开发使用 Node `24.19.0`、pnpm `11.28.2`。Python `3.14+` 属于后端服务、合成集成测试与发布校验工具的环境，不是 CRM 插件运行依赖。
- 插件位于 profile allowlist 中，包名匹配 `@shine-mage/*`。
- `package.json` 使用 `type: module`、`packageManager: pnpm@11.28.2`，并把 `@deepseek-ai/dsh-tools` 固定为 `0.1.7-rc.2` peer。
- `files` 只声明运行时 `lib/`、bundle patch、已打包领域输入的 digest lock 和必要的 README/LICENSE；不得包含 `src/`、测试、`node_modules`、source map、符号链接或 workspace/file/link 依赖。

<a id="plugin-contract"></a>
## 包合同

每个插件有自己的 `build.mjs`、测试和版本。构建期可以使用 workspace 内的 `dsh-plugins/plugin-kit`，但运行时只消费自身包、公开 DSH capability 合同和服务 API；不能导入 `analytics-workbench` 或其他插件的 toolchain 源码。profile 只组合已打包版本，不拥有插件源码。固定 pin、manifest/lock 和补丁位于 `plugin-kit/toolchain.json` 与 `plugin-kit/build-tools/`；workbench 只保留自己的业务类型检查。

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

## 三步本地路径

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

## 边界检查

本地或 CI 运行 `node scripts/dsh-b0/plugin-boundaries.mjs --check`，核对包 owner、公开/内部合同、跨包引用、构建 DAG 与清单漂移。B0 pipeline 同时运行两个叶子包的 source-only 隔离 build/test/pack；这种本地夹具证据不代替真实宿主安装、服务合同或 clean reviewed SHA 的候选。CRM 的生产源码例外已归零；slot/主题合同由领域生成，页面工具在 profile 层显式装配，见 [边界清单](../architecture/shinemage-plugin-boundaries.md)。

## 相关入口

- [rc2 Quickstart](./dsh-rc2-quickstart.md)
- [profile manifest](../architecture/dsh-profile-manifest.md)
- [release artifact reference](../reference/dsh-rc2-release-artifact.md)
- [当前状态](../../STATUS.md)
- [CRM 插件与独立合成服务](./crm-plugin-service-boundary.md)
