# 插件外置与主仓收口计划

## 目标

把 `fuqing-crm-analytics` 变成稳定的 DSH 集成和发布仓。插件源码由独立仓维护。主仓只消费经过摘要校验的插件 pack 和 profile 输入。

本计划不把主仓改成 DSH 官方源码仓。当前仓库没有 `packages/host`、`packages/client` 或官方 DSH 源码。主仓保存的是 CRM 应用、DSH 集成、组合校验和发布工具。DSH 官方源码和 runtime 继续由固定的外部 checkout 或发布资产提供。

## 当前事实

- 主仓 `main` 和 `origin/main` 都是 `4ac076de`。
- `dsh-plugins/` 包含 9 个插件和 1 个构建工具包。目录有 752 个源码文件和 28 个已生成 `lib/` 文件。
- GitHub 已有对应的独立仓。主仓组合锁保存 9 个 reviewed source SHA。
- `config/dsh-profile.rc2.json`、`config/dsh-profile.crm-knowledge.rc2.json` 和多个 CI 脚本仍读取 `dsh-plugins/` 路径。代码、配置和脚本中有 115 个直接引用。全仓含文档共有 347 个引用。
- `scripts/release/plugin-pack.mjs` 已能读取无源码的 sealed pack。主仓还没有让所有组合、测试和发布入口只消费 sealed pack。
- `dsh-plugins/analytics-workbench`、`crm-knowledge` 和 `knowledge` 的测试仍导入主仓脚本或其他插件源码。
- `dsh-plugins/plugin-kit` 仍是 private 包。独立插件构建仍需要外部 SDK、build tools 和固定 Node 24 工具链输入。
- 正式门禁保持 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。

## 目标边界

### 主仓保留

- CRM 应用和独立服务代码。
- DSH pin、profile 合同、pack reader、组合校验和发布工具。
- 外部 pack 的 manifest、source SHA、tree digest、tarball SHA-256 和 profile digest。
- 主仓自己的组合测试、接收测试和文档。

### 主仓移出

- `dsh-plugins/analytics-workbench`。
- `dsh-plugins/crm-knowledge`。
- `dsh-plugins/knowledge`。
- `dsh-plugins/shine-brand`。
- `dsh-plugins/shine-board`。
- `dsh-plugins/shine-crowd-action`。
- `dsh-plugins/shine-query`。
- `dsh-plugins/shine-funnel`。
- `dsh-plugins/shine-waterfall`。
- `dsh-plugins/board-components`。
- `dsh-plugins/plugin-kit`。

移出前必须完成对应独立仓的构建、测试、pack、来源证明和接收验证。移出不是删除独立仓。独立仓是每个插件的维护源。

## 独立运营合同

每个插件 pack 必须包含以下输入。

1. 包名和版本。
2. 独立仓 URL 和 reviewed source SHA。
3. source tree digest。
4. tarball SHA-256。
5. `dsh-generated-bytes/v1` provenance。
6. 固定 DSH peer 和 Cordis peer。
7. 固定 Node major 和 package manager 版本。
8. `files`、exports 和 Cordis patch 的完整清单。
9. 独立仓 CI 的 build、test 和 pack 回执。
10. 主仓接收器的 production-only install、`npm ls`、import 和最小组合回执。

插件不能依赖以下内容。

- 主仓绝对路径。
- 主仓的 `scripts/` 源码。
- 另一个插件的源码目录。
- workspace symlink、`file:` 依赖或隐式 fallback。
- 主仓的真实数据、凭据或运行时状态。

插件需要其他领域能力时，使用固定 tarball 输入或版本化公开合同。运行时依赖必须写入 `dependencies` 或 `peerDependencies`。构建工具只写入 `devDependencies`。

## 执行顺序

### 1. 建立外部来源清单

为 9 个插件和 1 个领域库生成一份机器可读清单。清单保存独立仓、source SHA、tree digest、manifest SHA、pack SHA 和当前 DSH pin。

验收命令必须在 clean checkout 运行。命令必须拒绝来源 SHA、manifest SHA 或 pack SHA 不一致的输入。

### 2. 让主仓只消费 sealed pack

先修改 profile、composition lock、pack reader 和 CI 输入。所有主仓组合命令都从一个绝对路径的 pack 输入目录读取 tarball。缺少输入时必须失败。主仓不能回退到 `dsh-plugins/` 源码。

这一阶段不删除插件源码。先证明主仓在源码目录改名后仍能完成 pack reader、profile preparation、composition input 和 production-only consumer closure。

### 3. 迁移插件专属测试

插件专属测试移回对应独立仓。主仓只保留组合合同、接收合同和跨插件行为测试。测试夹具不能通过相对路径回到主仓。

### 4. 迁移构建工具

把 `plugin-kit` 作为独立私有包发布或作为带摘要的 kit tarball 接收。独立插件仓只通过包输入获取 kit、SDK 和 build tools。主仓不再提供 workspace link。

### 5. 删除主仓源码副本

只有在第 2 至第 4 步的验证全部通过后，才删除主仓的 `dsh-plugins/` 源码副本和对应的 workspace 适配器。保留 pack lock、来源清单和历史证据。

### 6. 清理 Git 和远端

删除前先生成恢复 bundle 和文件清单。删除已合并且无独有提交的本地 worktree、分支和远端旧分支。保留当前 `main`、部署回执、保护目录和恢复 bundle。删除动作必须单独提交并单独核对。

## 删除前阻断条件

只要有一项成立，就不能删除 `dsh-plugins/`。

- 主仓脚本仍导入插件源码。
- profile 或 CI 仍用 `dsh-plugins/<name>` 作为默认输入。
- 独立仓没有可回读的 reviewed SHA 和 CI 回执。
- pack 缺少 `dsh-generated-bytes/v1` provenance。
- production-only install 有未解决的依赖或 peer 问题。
- 组合测试仍依赖 workspace link 或 `file:` 依赖。
- 插件的运行依赖没有进入生产 manifest。
- 没有可恢复的旧源码 bundle 和当前 pack 输入归档。

## 当前唯一可执行单元

先实现“外部来源清单和 sealed pack 输入检查”。这一单元不删除源码，不改正式 M2 状态，不切杭州 current。完成后再迁移 profile 和 CI 输入。

## 真实风险

- “最新 DSH”不是唯一版本线。当前主仓 rc2 pin、内部 rc1 runtime 和 alpha4 候选同时存在。迁移前必须在候选 manifest 中明确唯一的 DSH pin。不能用 `latest`。
- GitHub main 的主 CI 在 `4ac076de` 上成功，但同一 SHA 的 Weekly Backend Health Check 失败。远端全绿不能在没有复核前宣称。
- 直接删除源码会让当前测试、profile 和 CI 失效。删除前必须完成输入切换和负测。

## 完成定义

完成后，clean clone 的主仓不含插件源码。主仓能在无插件源码、无 workspace link 和无个人凭据的目录中完成 profile 输入校验、pack reader、组合校验和 production-only consumer closure。每个插件能在独立仓完成 build、test、pack，并在主仓或 DSH 仓接收同一 pack。所有版本、摘要和来源都能从 manifest 回读。正式 M2 状态仍按正式门禁单独维护。

## 外部仓库漂移

2026-10-19 读取了独立仓 `main` 的远端 ref。它们已经不再等于主仓组合锁中的 source SHA。

| 包 | 主仓锁定 SHA | 独立仓当前 `main` |
|---|---|---|
| `dsh-analytics-workbench` | `3030e3f2` | `865fe2e6` |
| `dsh-crm-knowledge` | `dac0539b` | `78eb9f7d` |
| `dsh-knowledge` | `f623c220` | `ef8960ed` |
| `dsh-shine-board` | `76601df7` | `75eced47` |
| `dsh-shine-crowd-action` | `5c39e21c` | `d709e80f` |
| `dsh-shine-query` | `1f1e19d2` | `37c853bb` |
| `dsh-shine-funnel` | `dbfaede0` | `c3732617` |
| `dsh-shine-waterfall` | `d123ac1d` | `cd0a4996` |
| `dsh-shine-brand` | `57ebcf38` | `6754f370` |

这些新 `main` SHA 不能直接替换组合锁。迁移必须为每个仓选择 reviewed commit，重新生成 pack、profile input、manifest、provenance 和接收回执。未完成前，主仓源码副本不能删除。

`shinemage-board-components` 当前 `main` 是 `68abb1ea`。它不是组合锁中的独立插件条目，但它是 `shine-funnel`、`shine-waterfall` 和 `analytics-workbench` 的构建输入。它也必须按 reviewed commit 和 tarball digest 固定，不能跟随独立仓 `main`。

## 已验证的独立仓证据

`tyuanww/dsh-shine-brand` 的独立仓已经有独立构建目录 `plugin/`、独立 `npm-author/`、固定 kit tarball 和 GitHub Actions。当前 `main` 为 `6754f370`，对应 CI run `38238051696` 成功。主仓锁定的 `57ebcf38` 也有成功 run `38076180876`。这证明源码可以独立维护。

这两个 run 仍不能替代主仓的 formal plugin pack。品牌仓的公开内容包回执明确记录 `formal_pack_plugin=NOT_RUN`。因此，独立仓存在不等于主仓可以立即删除源码。

## 已确定的合同形状

采用独立来源清单，不把来源字段塞进现有组合锁。现有组合锁继续描述 profile 选择和 pack 身份。新的来源清单描述外部仓和接收 artifact。

`config/shinemage-composition-pack-manifest.v1.json` 至少包含以下字段。

- `schema_version`。
- `consumer.repository`、`consumer.branch` 和 `consumer.reviewed_sha`。
- `lock.path` 和 `lock.sha256`。
- `bundle.repository`、`bundle.workflow`、`bundle.run_id`、`bundle.artifact_id`、`bundle.artifact_sha256`、`bundle.artifact_head_sha` 和 `bundle.expires_at`。
- `toolchain.sdk_version`、`toolchain.upstream_sha`、`toolchain.upstream_lock_sha256`、`toolchain.node_major` 和 `toolchain.pnpm`。
- `sources[]` 中每个包的 `id`、`repository`、`ref`、`sha`、`manifest_sha256` 和 `pack_sha256`。

`ref` 明确表示来源身份。`main` 需要检查远端 `main` 是否仍指向 `sha`。历史 reviewed commit 使用 `commit` 或精确 tag。校验器不能把历史 commit 误报为 `main` 漂移。

external mode 的接收命令必须先校验来源清单、组合锁和 artifact 回执，再创建输出目录。它必须拒绝缺少显式 toolchain 的输入。它不能从 `dsh-plugins/plugin-kit` 推断工具链，也不能从插件源码生成 pack。`--verify-remote-main` 开启后，缺少 `GH_TOKEN`、远端 ref 漂移、artifact head SHA 漂移和 artifact 过期都必须失败。

这个合同的第一个实现单元是离线清单和 sealed pack 检查。远端 API 查询、artifact 下载和正式 pack 重建属于后续单元。当前没有把未完成的 pack、签名或 CI 回执写成 PASS。

## 本次实际完成

- 提交 `a6a61477` 增加 `plugin-source-manifest.mjs` 和六项合同测试。
- 提交 `d7d08526` 增加当前 rc2 组合的来源清单。清单的九个 source 状态都是 `NOT_RUN`。组合 artifact 状态是 `NOT_RUN`。删除门禁是 `BLOCKED`。
- 提交 `aa14250f` 将来源清单测试绑定到当前组合锁和 `main` SHA。
- 六项测试通过。`git diff --check` 通过。JSON 通过 `python3 -m json.tool`。
- 本次没有生成 plugin tarball。没有运行远端 API 校验。没有删除插件源码。没有修改正式 M2 状态。

- 提交 `a268127b` 将来源清单接入 `composition-pack-inputs.mjs`。传入 `--manifest` 后，输入准备会先校验 lock SHA、source SHA、manifest SHA、source 状态和 pack SHA。`NOT_RUN` 来源会在创建输出前失败。未传 `--manifest` 的旧入口保持兼容。
- 该变更先触发了变量遮蔽回归。修复后组合输入和来源清单测试共 `18 PASS / 0 FAIL / 0 SKIP`。

## 外部输入盘查结果

2026-10-19 读取了独立仓的 GitHub Actions 产物索引。

- `dsh-analytics-workbench` 在旧 reviewed source `3030e3f2` 有 formal pack artifact，artifact ID 为 `11727345827` 或 `11727086505`。两者都需要按 run 和 digest 重新选择，不能只凭名称选择。
- `dsh-crm-knowledge` 的 reviewed source `dac0539b` 已有成功的 fixed-inputs run，但本次 GitHub API 查询出现 TLS 超时，artifact ID 尚未确认。
- `dsh-knowledge` 的 reviewed source `f623c220` 有 formal pack artifact `11727570395`，也有 CI evidence artifact `11727540579`。
- `dsh-shine-board`、`dsh-shine-query`、`dsh-shine-funnel` 和 `dsh-shine-waterfall` 的 reviewed source 当前只有 CI evidence artifact。当前索引没有 formal pack artifact。
- `dsh-shine-brand` 的独立仓只有 `public-contracts` artifact。其回执明确记录 `formal_pack_plugin=NOT_RUN`。
- `dsh-shine-crowd-action` 的 artifact API 查询因 TLS 超时未完成。
- `shinemage-board-components` 是构建输入。它必须单独固定 reviewed source 和 tarball digest。
- 旧组合 artifact 的下载请求遇到 GitHub blob TLS handshake timeout。本次没有把下载失败写成成功，也没有把旧 artifact 当作当前输入。

这些结果把“独立仓存在”和“主仓可接收 sealed pack”分开。当前来源清单继续保持 `NOT_RUN` 和 `BLOCKED`。
