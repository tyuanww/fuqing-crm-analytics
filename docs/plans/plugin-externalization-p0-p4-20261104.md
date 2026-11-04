# 插件外置 P0-P4 作战计划（2026-11-04 基线）

> 本文件是当前计划，不是历史快照。状态事实以 `origin/main` = `ecf93daf`、PR #211/#215/#216 和本文引用的 CI run 为准。执行前先按第 6 节重新核对；状态变化时追加记录，不要改写已经发生的证据。

## 1 目标与执行规则

### 1.1 目标

把 `fuqing-crm-analytics` 从“主仓同时维护 DSH 集成和插件源码”改成“插件由独立作者仓维护，主仓只消费带摘要证据的 sealed pack 和 profile 输入”。目标运行时是 DSH `0.2.1-rc.5`（tag commit `b830ec95`，Cordis `4.0.5`，`upstream_lock_sha256` `911b0499…`），不是 `latest`。

P0 到 P4 是同一件事的五个阶段，不是五个独立项目。

- P0 把目标版本单源，并让主仓锁链指向按 rc.5 重建的作者 pack。
- P1 清插件卫生，避免幽灵 import 和无效 inject 在换版本时静默失效。
- P2 把插件构建、策略、目录、生成物的所有权收回到插件或独立包。
- P3 把插件当前使用的私有协议换成 rc.5 公开面。
- P4 按依赖顺序把插件源码移出主仓，最后删除源码副本。

### 1.2 硬规则

1. 插件是独立作者。作者仓只通过 kit tarball、固定 SDK 输入和版本化合同消费主仓能力；主仓不反向 import 插件源码（P2c 已开头，P4 收尾）。
2. 不改 DSH 上游，不打补丁。上游没有的能力只能降级为业务取舍或另立架构决策，不在本仓 patch `deepseek-harness`。
3. 版本跟最新且固定。目标 `0.2.1-rc.5`，不用 `latest`、浮动分支或本机缓存的 rc.3 输入。
4. 证据只认真实产物。PR 号、merge commit、CI run、artifact 摘要和字节数必须可回读；没跑过的写 `NOT_RUN` 或 `PARTIAL`。
5. 合并、发布、切杭州、删数据是四个独立授权。本计划不授权其中任何一个。
6. 共享热点同一时刻只有一个 writer。`STATUS.md`、`CHANGELOG.md`、`docs/architecture/shinemage-plugin-boundaries.json`、`config/*lock*.json`、`config/shinemage-composition-*`、`AGENTS.md`、`dsh-plugins/*/package.json` 都算热点。

## 2 状态总表

采集时间 2026-11-04 23:25 +08。`origin/main` = `ecf93daf71bc587d046a54012243f8d47a5bff97`，第一父链为 `bf1b5738` → `9674604c` → `dc9b8fba` → `432cc03a` → `ecf93daf`。

| 层 | 范围 | 状态 | 证据 |
|---|---|---|---|
| P0 | 目标 DSH 单源到 `0.2.1-rc.5` | 进行中，draft #211 不能单独合 | head `94df1b37`；`sdk_version` 为 `0.2.1-rc.5`、upstream 为 `b830ec95`、lock 仍为 `911b0499…`、Cordis `4.0.5`；CI run `41817908263` 的 b0 与 merge-gate 红、test 与 lint 绿；preflight run `41817908094` 红；`mergeable=false`（dirty） |
| P1 | 插件卫生，幽灵 import、无效 inject、类型检查 | 已完成 | #210 merged，head `2a419584`，merge `9674604c`；CI `41816034553` success；5 个 `client.tsx` 改从 `@deepseek-ai/cordis` 导入，5 个包各自 3 条 `dsh.client.inject` 全部删除，kit 增加 `checkClientTypes()` |
| P2a | provenance 与 client banner 收进 kit | 已完成 | #213 merged，head `ef1cc6d8`，merge `ecf93daf`；CI `41835511757` success；kit 新增 `./provenance` 与 `./client-banner`，9 个 `build.mjs` 与 8 个 banner 改向，`repository_edges` 26 → 17，`cross_package_edges` 28 → 45 |
| P2b | tool policy 单源与官方工具漂移门禁 | 已完成 | #214 merged，head `6849fc4c`，merge `432cc03a`；CI `41828359712` success；`dsh-plugins/query-agent/src/tool-policy.ts` 加 `dsh-plugins/query-agent/config/{query-agent-tool-policy,dsh-official-tools}.v1.json`，68 个官方工具名，25 项行为逐条等价 |
| P2c | component catalog 移出插件源码 | 已完成 | #212 merged，head `ec83fe52`，merge `dc9b8fba`；CI `41823447654` success；`backend/contracts/component-catalog.json` 7014 bytes、sha256 `8e2161fa…`，`board_spec.py` 导入期不再读 `dsh-plugins/` |
| P2d | 生成物收进独立 contracts 包 | 已实现，CI 全绿，待合并授权 | head `9557f84b`，base `ecf93daf`，110 files +1800/−687；preflight `41853858184` pass 7m39s；CI `41853858267` 全绿（2 个按路径 skipped），b0 15m4s、test 16m43s、merge-gate pass；`mergeable_state=clean` |
| P3 | 换私有协议为 rc.5 公开面 | 未开工，源码阻塞已清除 | 无分支、无 PR；2026-11-04 已对 `b830ec95` 源码逐面复验，12 个 API 面全部有结论（见 2.2）；剩余阻塞是 4 个产品决策，不是代码 |
| P4 | 最后拆仓并删除主仓插件源码 | 未开工 | 无分支、无 PR；`deletion_gate=BLOCKED`，原因为 `remote_main_not_verified` 与 `production_only_closure_not_recorded`；硬依赖 P3、10 作者仓迁移和删除门禁 |

### 2.1 写作时校正的六处事实

旧会话状态（2026-11-04 21:28）与本文件采集时的 live 状态有差异，以下六处以本文件为准。

1. P2d 已经开工。会话状态写“未开工”，实际已有 PR #216，且实现范围、验证和 CI 都超过“未开工”。
2. CI 精简已有 PR #215，10 个 commit，全部检查绿（含 merge-gate），但未合并。会话状态只记到“CI 审计产物在另一会话”。
3. P3 的 0.2.1 源码复验已经完成。会话状态把“补 0.2.1 源码”列为 P3 前置，实际源码复验报告已产出，P3 可以开工，剩余是产品决策。
4. P2b 的单源文件实际在 `dsh-plugins/query-agent/config/`，不在主仓 `config/`。按文件位置引用时不要写错。
5. PR #211 不只是“落后 4 个 merge”，当前 `mergeable=false` 且与 main 冲突。P2d 又改了 contracts 布局和多个 `package.json` 邻域文件，所以 #211 必须在 #216 落地后 rebase，不能直接合。
6. 作者仓 vendored kit 的摘要不是旧 runbook 写的 `251383e1…`。采集时抽查 `dsh-shine-board` 与 `dsh-crm-knowledge`，两仓 `vendor/dsh-plugin-kit-0.1.0.tgz` 都是 45574 bytes、sha256 `03ca0fde…`；`251383e1…` 是 2026-10-08 旧证据里的历史 tarball 摘要。

### 2.2 rc.5 源码复验结论

复验对象为 `b830ec95` 源码树（codeload tar.gz 与 GitHub tarball 两条通道）。标记为源码可核验，运行时行为仍需 P3-0 证明。

| API 面 | 结论 | 对 P3 的影响 |
|---|---|---|
| `dsh.client` 发现 | 存在，语义已变 | `inject` 是模块到达顺序边，不再是纯预取元数据；5 个纯存在壳删 inject 仍安全，workbench、crm-knowledge、shine-brand 不能按旧口径删 |
| `agent.inbox` 与生命周期 | 存在 | `followup`、`steer`、`send`、`cancel` 都在；`/dispatch` 与 `/cancel` 可先改官方方法 |
| `connection.fetch.register` | 存在 | 浏览器半已有 4 条路由，形状一致；缺 `ctx.effect` 托管 disposer |
| slot 键与注册 | 存在，目录扩容 | 仓库用到的 13 个键全部存在，官方目录 86 → 103；list slot 必填 `id` |
| `ctx.sessionQuery` | 存在且 main 已采用 | native-evidence 的 `readSession` 冷恢复已落地，P3 该项降级为运行时验收 |
| 品牌与标题 | 部分可用 | `overrideTokens` 与三个 brand slot 可用；`DSH_CLIENT_TITLE` 是构建期 env，hero 标题和预览徽章没有官方替换面 |
| 设置与账号 | 部分可用 | `sidebar.footer.action` 与 `settings.section` 可用；程序化打开设置只有 `settings.launcher`，且会顶掉官方账号菜单 |
| 外部连接 | ACP 完整，SDK 有缺口 | ACP 有 `session/cancel` 与 tool_call id；SDK 无 cancel，prompt 无客户端 requestId |
| Config 与 typed tools | 可用 | 插件 `export const Config` 加 `defineTool` 可替代 `/internal/native/*` 与固定端口，无需上游新面 |

## 3 依赖图与串行链

### 3.1 主链

```text
P2d #216 合并
      |
      v
kit tarball（P0-0）
      |
      v
10 个作者仓按 rc.5 重建 pack（P0-1，可并行）
      |
      v
主仓锁链回填 + 重新密封 artifact（P0-2，严格串行单 writer）
      |
      v
#211 rebase + preflight + 合并（P0-3）
      |
      v
P3 代码迁移（P3-0 到 P3-5）→ P4 拆仓
```

### 3.2 四个拒绝点

1. 作者 peer 校验。`scripts/crm-calibration/composition-inputs.mjs` 的 `validateCompositionPacks` 调 `inspectDeclaredPlugin(..., {dshSdkVersion, cordisVersion})`，作者 pack manifest 声明的 peer 必须等于 rc.5 与 4.0.5，否则 `CRM_COMPOSITION_*_DSH_PIN` 失败，b0 必红。这是 #211 b0 当前红的直接原因。
2. 锁链摘要绑定。profile digest、`config/shinemage-composition-packs.lock.json`、`config/shinemage-composition-pack-manifest.v1.json`、sealing 分支、`config/shinemage-composition-artifact.lock.json` 之间逐层 sha256 绑定，改一层必须重算下游，只能单 writer 顺序回填。
3. sealed artifact 分支。密封 workflow 只接受两个硬编码分支，两条都已与 main 分叉（2026-11-04 核对，`codex/rc3-composition-artifact-20261024` 为 ahead 5、behind 347，`codex/warehouse-composition-inputs-20261026` 为 ahead 17、behind 125），本轮必须重建，不能复用旧 artifact。
4. 冲突面。#211 与 main 冲突，P2d 又把生成物移到 `dsh-plugins/contracts/` 并改多个 `package.json` 邻域。顺序必须是 #216 先落，再 rebase #211。

### 3.3 现在可以并行的工作

| 通道 | 工作 | 位置 | 现在能否开始 | 冲突面 |
|---|---|---|---|---|
| W1 | #216 评审与合并授权 | 现有 PR | 可以，CI 已全绿 | 与 #211 争 `package.json` 邻域，先落 W1 |
| W2 | P3-0 影子门禁、P3-1 disposer 收口 | 新 worktree off `ecf93daf` | 可以，不碰 pin 和锁 | 与 P2d 文件大体不重叠；与 #211 争 `package.json` 时先让 W1 |
| W3 | kit tarball 构建、作者仓 patch 草案、锁链重算脚本自测 | `/tmp` 与只读作者仓 | 可以，只写 `/tmp` | 无主仓写入 |
| W4 | 10 作者仓重建、推分支、触发 CI | 10 个作者仓 | 需授权 | 与主仓锁链是串行输入 |
| W5 | 主仓锁链回填与 artifact 密封 | 主仓 `config/` 与 sealing 分支 | 需授权，且必须等 W4 完成 | 共享热点，只能单 writer |
| W6 | 交付层真实演练 T02/T03/T06/T07/T09/E1 | 隔离实例与文档 | 需授权或人工窗口 | 与插件代码无文件冲突 |

结论。现在可以并行的是 W1、W2、W3。W4 与 W5 必须授权且串行。P3-2 与 P3-3 会改 `dsh-plugins/*/package.json` 和 profile，建议在 #211 合入后做，避免第二次 rebase。P4 在所有前置完成前不启动。

## 4 任务卡

每张卡包含目标、输入、入口、验收、阻塞和授权。授权只写“需要人做什么”，不代表本计划已经授权。

### C01 P2d #216 收口

**目标** 完成 contracts 包的合并前收口，评审通过并取得合并授权，生成物不再由插件目录拥有。

**输入** PR #216 head `9557f84b`，base `ecf93daf`，110 files +1800/−687。PR 自述 30 个生成文件迁移、39 个消费方文件、11 个 compiler companion 迁移，C0 合同 `competition-c0-contract.generated.d.ts` 保留为已评审例外。

**入口**

```bash
gh pr checks 216 -R tyuanww/fuqing-crm-analytics --watch --interval 30
gh pr diff 216 -R tyuanww/fuqing-crm-analytics
gh pr checkout 216 && node --test scripts/dsh-b0/contracts-package.test.mjs
node scripts/dsh-b0/plugin-boundaries.mjs --check
```

**验收** `b0-contract-build`、`test`、`merge-gate` 全绿；边界清单为 13 packages、93 edges、668 sources；三个插件内不再有生成副本（C0 例外 1 条）；`public-contract-inputs.lock.json` 的 16 份 generated material 投影到 `dsh-plugins/contracts/`，lock 本体不移位。

**阻塞** CI 已全绿，剩评审与合并授权；C0 例外要等作者 archive 重建后才能移，不能在本 PR 硬移。

**授权** 合并 #216 需要明确授权。本 PR 会改变 `dsh-plugins/` 布局，是 #211 rebase 的前置。

### C02 kit 分发（P0-0）

**目标** 产出含 `./provenance` 与 `./client-banner` 的 kit tarball，确定版本策略，并把同一 tarball 分发到 10 个作者仓。

**输入** 主仓 kit 为 `@shine-mage/dsh-plugin-kit` `0.1.0`、`private: true`。作者仓 vendored 的 `vendor/dsh-plugin-kit-0.1.0.tgz` 为 45574 bytes、sha256 `03ca0fde…`，解包 16 个文件，不含 P2a 新增的 `provenance.mjs` 与 `client-banner.mjs`，所以作者仓当前无法按 rc.5 重建。

**入口**

```bash
pnpm --dir dsh-plugins/plugin-kit pack --pack-destination "$KIT_OUT"
sha256sum "$KIT_OUT"/*.tgz
```

分发到每个作者仓的四个位置，`vendor/` 下的 tgz、`vendor/KIT-SHA256`、`inputs/ci/identity.json`、`pnpm-lock.yaml` 的 `file:` devDependency。版本策略见 D11。

**验收** 新 tarball 含 `provenance.mjs` 与 `client-banner.mjs`；10 个作者仓的 `KIT-SHA256` 与 identity 摘要一致；作者仓 `verify-pack.mjs` 通过；主仓 `scripts/dsh-b0/plugin-kit-provenance.test.mjs` 仍通过。

**阻塞** 版本策略未定；写作者仓需授权。

**授权** 允许写 10 个作者仓的 vendor 与锁文件。

### C03 十个作者仓按 rc.5 重建（P0-1）

**目标** 每个作者仓在 `codex/rc5-rebuild-20261104`（或复用现有 rc3 分支）产出 rc.5 的 content pack、formal pack、public contracts 三类证据。

**输入** 新 kit tarball、rc.5 upstream `b830ec95`、build-tools、Python 3.14.4、pnpm 11.28.2，funnel 与 waterfall 另需 board tgz。

| 作者仓 | 现有入口 | 采集时 head | 包版本 |
|---|---|---|---|
| `dsh-analytics-workbench` | PR #16 `wb15-provenance` | `f3c75ca6` | `0.0.0-b0` |
| `dsh-crm-knowledge` | PR #6 `codex/crm-source-reauthorization-20261028` | `721d2bb9` | `0.0.0-crm.5` |
| `dsh-knowledge` | PR #2 `codex/dsh-rc3-ci` | `2b0f5745` | `0.0.0-candidate.1` |
| `dsh-shine-board` | PR #2 `codex/dsh-rc3-ci` | `c7b4ab65` | `0.0.0-b0` |
| `dsh-shine-crowd-action` | PR #2 `codex/dsh-rc3-ci` | `6a3c2d66` | `0.0.0-b0` |
| `dsh-shine-query` | PR #2 `codex/dsh-rc3-ci` | `81363e47` | `0.0.0-b0` |
| `dsh-shine-funnel` | PR #2 `codex/dsh-rc3-ci` | `3420ec3b` | `0.0.0-b0` |
| `dsh-shine-waterfall` | PR #2 `codex/dsh-rc3-ci` | `6a07f2d9` | `0.0.0-b0` |
| `dsh-shine-brand` | PR #2 `codex/dsh-rc3-ci` | `f2c81900` | `0.0.0-b0` |
| `shinemage-board-components` | PR #1 已合并，重跑 CI | `68abb1ea` | `0.1.0` |

**入口** 每个插件仓走固定构建链，具体命令以该仓 CI 与 `DEVELOPMENT.md` 为准。

```bash
node scripts/pinned-pnpm.mjs install --frozen-lockfile --ignore-scripts --offline
node scripts/check-inputs.mjs
node build.mjs
node scripts/verify-pack.mjs
# 包测试与 author-boundary 以各仓 CI 为准
# formal-pack 仅 knowledge、crm-knowledge、workbench 与选 A 的仓，输出到 FORMAL_PACK_OUT
```

board-components 走自己的 author 七步，不需要 DSH checkout。

**验收** 每个仓 CI SUCCESS，artifact 名称与 run id 可回读；workbench 的三份 artifact 为 public-contracts、workbench-ci-evidence、workbench-formal-pack；其余仓至少 content pack，选 A 的仓再加 formal pack；每仓新 `source_sha` 就是 PR head。

**阻塞** C02 的新 kit、D12 的写仓授权、D13 的 leaf formal pack 路径选择；workbench PR #16 是栈式分支，需先 rebase 到 rc.5 基线。

**授权** 推作者仓分支、触发作者 CI、下载私有 Actions artifact。

### C04 主仓锁链回填与 artifact 密封（P0-2）

**目标** 用 C03 的新证据重算所有组合锁，重新密封 20 文件 artifact，使主仓组合身份指向 rc.5 作者 pack。

**输入** 10 个作者仓的新 `source_sha`、formal manifest sha、pack sha、CI run 与 artifact id、workbench core 计数、domain pack 摘要。

**入口** 回填顺序不可交换。

```text
profile digests
  -> config/shinemage-composition-packs.lock.json
  -> config/shinemage-composition-pack-manifest.v1.json
  -> config/dsh-profile.business.rc3.json（派生）
  -> sealing 分支 .ci/rc3-composition/**（20 文件）
  -> 触发 rc3-composition-artifact.yml
  -> 下载 artifact
  -> config/shinemage-composition-artifact.lock.json
  -> 其余证据锁与 STATUS/CHANGELOG
```

生成与校验入口

```bash
node scripts/ci/public-contract-inputs.mjs --output "$NEW_ROOT" --python "$PY314"
node scripts/ci/composition-pack-inputs.mjs --write-business-profile config/dsh-profile.business.rc3.json
node scripts/ci/composition-pack-inputs.mjs --check-business-profile config/dsh-profile.business.rc3.json
node scripts/ci/composition-pack-inputs.mjs --artifact-lock config/shinemage-composition-artifact.lock.json --output "$OUT"
node --test scripts/release/plugin-source-manifest.test.mjs
```

**验收** `plugin-source-manifest`、`validateSourceManifest`、`public-contract-inputs` 全部 PASS；9 个作者包与 2 个 profile 全 PASS，缺一即 `SOURCE_MANIFEST_GATE_*` fail；sealing 20 文件摘要一致；artifact lock 的 `runId`、`headSha`、`sha256` 与新 run 对应；business profile 派生后 `--check` 通过。

**阻塞** C03 未完成；sealing 分支已分叉，必须先重建；只能单 writer。

**授权** 写 `config/`、push sealing 分支、触发 workflow、下载 artifact。

### C05 #211 rebase 与合并（P0-3）

**目标** 把 #211 从 `94df1b37` 变基到含 #216 与锁回填的新 main，跑通 preflight 后合入，完成 P0。

**输入** #211 head `94df1b37`；C04 的锁回填提交；#216 已合并；本机 7 个固定输入（`CRM_COMPOSITION_OUTPUT`、`CRM_COMPOSITION_PACK_INPUTS`、`CRM_COMPOSITION_PAGE_INPUTS` 等）。

**入口**

```bash
git switch codex/p0-dsh-rc5-single-source-20261104
git rebase origin/main
node scripts/dsh-b0/pipeline.mjs --check
gh pr checks 211 -R tyuanww/fuqing-crm-analytics --watch --interval 30
```

**验收** b0-contract-build、test、merge-gate、preflight 全绿；`dsh-release-preflight` 有新的成功 run；冲突清零；`dsh-plugins/plugin-kit/toolchain.json` 仍为 rc.5、upstream `b830ec95`、lock `911b0499…`、Cordis `4.0.5`。

**阻塞** C04 未完成；本机缺固定输入时会以 `CRM_COMPOSITION_OUTPUT_REQUIRED` 失败，不能把本机失败当作代码失败；若接受 `FQ_PRE_PUSH_SKIP=1` 需要 D14 的授权。

**授权** 合并 #211。

### C06 P3-0 影子门禁

**目标** 在 rc.5 上零改动验证组合图、slot 注册和插件资源路由，给后续 P3 切片一个可重复的基线。

**输入** rc.5 runtime（可用 #211 分支构建的隔离实例）、business profile、9 个插件 bundle 与 1 个领域包。

**入口**

```bash
dsh --profile <business> --dump-config
# 启动隔离 web 实例后逐项采集
# /plugins/<id>/client.js?rev= 每个 bundle 一条 200 探针
# boot 后检查 ctx.modules 行与 13 个 slot 键的注册
```

**验收** 组合图包含全部插件行；13 个 slot 键的注册无 `slot ... is not declared` 与 `single slot ... already has a registration`；每个 `/plugins/<id>/client.js?rev=` 返回 200；HMR 重载后旧路由不残留。

**阻塞** 需要一个可启动的 rc.5 隔离实例。启动进程、占用端口需要用户同意，不能用生产实例代替。

**授权** 启停隔离实例；不得触碰杭州现役。

### C07 P3-1 bridge 浏览器半收口

**目标** 把 `connection.fetch.register` 的 disposer 全部交给 `ctx.effect` 托管，统一 4 条以上浏览器路由的路径与鉴权语义。

**输入** `dsh-plugins/crm-knowledge/src/host.ts` 两条 streaming 路由，`analytics-workbench/src/first-purchase-save-api.ts`、`cockpit-history-api.ts`、`board-browser-api.ts` 三条 buffered 路由。

**入口**

```bash
rg -n "connection\.fetch\.register" dsh-plugins
rg -n "ctx\.effect" dsh-plugins/crm-knowledge/src/host.ts dsh-plugins/analytics-workbench/src
```

**验收** 每个 `register` 返回值都进入 `ctx.effect` 的 disposer；插件卸载或 HMR 重载后路由释放，无重复注册；路径都在 `/api` 之下。

**阻塞** 无。与 P2d 文件不重叠，可与 #216 并行。

**授权** 无额外授权，按普通代码 PR 流程。

### C08 P3-2 去端口化与 typed tools

**目标** 把 analytics-workbench 的 kernel 地址、端口和 token 从环境变量与固定端口改成插件 `Config`，把 `/internal/native/*` 的输入输出改成 `defineTool` 声明式合同。

**输入** `runtime-endpoints.ts` 的 4315/4325/4335 固定白名单、`B0_PORT_BASE`、`B0_RUNTIME_TOKEN`；backend 的 `services/analytics/runtime.py` origin 白名单、`runtime_ports.py`；profile 行 config。

**入口**

```bash
# 插件侧新增 schemastery Config，profile 行提供 baseUrl
dsh --profile <business> --dump-config
node scripts/dsh-b0/pipeline.mjs --check
```

**验收** 目标 profile 的 config 能注入 `baseUrl` 与相关可调值；不再依赖固定端口和 token env；工具 schema 注册成功且与 query-agent allowlist 不漂移；backend 保留一个过渡期兼容窗口。

**阻塞** 建议在 #211 合入后做，因为要改 `dsh-plugins/analytics-workbench/package.json` 与 profile，避免二次 rebase。无产品决策。

**授权** 修改 profile 与部署文档；若要在隔离实例验证，需启停授权。

### C09 P3-3 外部半换 ACP

**目标** 让 FastAPI run kernel 通过 `dsh --profile acp` 子进程驱动会话，删除自建 HTTP、bearer token 和固定端口的外部半。

**输入** rc.5 `acp` profile、ACP 客户端（`@agentclientprotocol/sdk` 或同源实现）、`dsh-plugins/analytics-workbench/src/bridge.ts`、`backend/services/analytics/runtime.py`、`backend/services/analytics/runtime_ports.py`、`backend/analytics_runtime.py`。

**入口**

```bash
dsh --profile acp
dsh --profile sdk
# 映射 /dispatch -> session/prompt，/cancel -> session/cancel
# /observe -> ACP tool_call 更新折账，/health -> initialize + session/list
```

**验收** ACP 能启动、prompt、cancel；tool_call id 可用于证据链；取消后 inbox 拼接时序正确；删除自建 http/token/端口后无残留调用；保留双写影子期再切主路径。

**阻塞** D4 的 ACP 与 SDK 取舍；部署形态改变（子进程、stdout 协议、生命周期）需要单独评审。

**授权** 架构级改动、部署形态、子进程管理；不在杭州现役上直接验证。

### C10 P3-4 品牌与账号收口

**目标** 用 rc.5 的 theme token、brand slot、`sidebar.footer.action`、`settings.section` 替换 DOM 手术，并按决策处理无法替换的标题与徽章。

**输入** `shine-brand/src/brand-surface.mjs` 的 `document.title`、headline、previewBadge 替换；`analytics-workbench/src/client/account-chrome.tsx` 与 `analytics-workbench/src/client/native-account-settings.mjs` 的 `aria-label` 选择器。

**入口**

```text
shine-brand 品牌 token 与 mark/name slot 保留
账号菜单改用 sidebar.footer.action 自绘
设置页改用 settings.section（id/order/label/close）
标题与徽章按 D1/D2 执行
打开设置按 D3 执行
```

**验收** 删除的每个 DOM 选择器都有官方替代面；没有替代的项在文档中明确降级；rc.5 真实 shell 下品牌展示、账号菜单、设置页可用。

**阻塞** D1、D2、D3 三个产品决策。

**授权** 业务接受品牌与账号能力降级或自建 web client 的成本。

### C11 P3-5 native-evidence 验收

**目标** 确认 main 上已经落地的 `ctx.sessionQuery` 冷恢复与 live 事件影子对账在 rc.5 运行时通过，并补 `TurnEndReason` 新变体映射。

**输入** `dsh-plugins/analytics-workbench/src/native-evidence.mjs`，rc.5 的 `TurnEndReasonMap`（新增 `forked`、`aborted.reason`、结构化 `error`）。

**入口**

```bash
node --test dsh-plugins/analytics-workbench/test/native-evidence.test.mjs
rg -n "evidenceFor|TurnEndReason|forked" dsh-plugins/analytics-workbench/src/native-evidence.mjs
```

**验收** 冷恢复 seed 与 live `session/event` 交叠窗口只折新增连续后缀；`forked` 不再落入 `UNKNOWN`；损坏或不可兼容快照仍失败关闭为 `NATIVE_JOURNAL_UNAVAILABLE`。

**阻塞** 需要 C06 的 rc.5 运行实例。

**授权** 无产品决策。

### C12 P4 拆仓

**目标** 按依赖顺序把插件源码移出主仓，最后删除 `dsh-plugins/` 源码副本，主仓只保留 pack reader、锁和组合测试。

**输入** P3 完成；10 个作者仓迁移完成；`deletion_gate` 清零；恢复 bundle。

**顺序** `plugin-kit` → `contracts` 与 `board-components` → 5 个 shine 壳 → `knowledge` 与 `crm-knowledge` → `query-agent`（配置型 bundle）→ `analytics-workbench` 最后。

**入口**

```bash
node --test scripts/release/plugin-source-manifest.test.mjs
node --test scripts/ci/composition-pack-inputs.test.mjs
# clean clone 后做 production-only install 与 import 闭合
```

**验收** clean clone 不含插件源码；主仓无插件源码时仍能完成 profile 输入校验、pack reader、组合校验、production-only consumer closure；`deletion_gate` 的 `remote_main_not_verified` 与 `production_only_closure_not_recorded` 都有回读证据。

**阻塞** P3 未完成；作者仓未全部迁移；删除门禁仍 BLOCKED。

**授权** 删除 `dsh-plugins/` 是单独动作，必须单独提交、先生成恢复 bundle，并单独授权。

### C13 交付层遗留（低细节）

这些卡片不阻塞 P0 到 P4，但占用真实环境和人工窗口，和插件链并行时不要抢同一台实例。

| 卡片 | 目标 | 入口或输入 | 验收 | 阻塞与授权 |
|---|---|---|---|---|
| T02 备份演练 | 证明可回退 | 隔离实例与备份磁盘，当前约 75G 可用、小于 2×132G | 备份、校验、恢复各一步有回执 | 磁盘不足；需授权停机窗口 |
| T03 UI 编辑验收 | 人工完成一次编辑、保存、重开 | Chrome 人工操作，当前无 CDP，跨源 iframe | 人工改文案、AI 局部改、保存、切换、重开 | 需人工窗口；需授权操作隔离实例 |
| T06 性能基线 | 记录页面与查询的基线 | 隔离实例与固定数据窗口 | 有可比对的耗时与资源记录 | 需稳定实例；不能占用生产 |
| T07 增长董事会 | 真实数据跑通一次董事会材料 | WeKnora 授权与真实查询 | 真实来源、口径、事实边界可核对 | WeKnora 授权；真实数据只读 |
| T09 公网切换 | 把验证过的版本切到公网 | 杭州与 Cloudflare 现役 | 切换、健康检查、回退路径 | 单独授权；本计划不覆盖 |
| E1 看板接线 | 第二入口上传后接入驾驶舱 | #206 后端与 #207 前端已合 | 上传、只读 SQL、生成看板、保存重开真实联调 | 需真实附件与人工验收 |

## 5 只有人才能决定的事项

### 5.1 rc.5 产品决策

| 编号 | 决策 | 选项 | 后果与建议 |
|---|---|---|---|
| D1 | 产品标题如何替换 | A 自建 web client 构建并带自己的 `DSH_CLIENT_TITLE`；B 保留 `document.title` 赋值，接受导航时被 `DocumentTitle` 抢回 | A 成本高，新增 shell 构建与维护面；B 零成本但有已知缺陷。建议 P3 先按 B 标记 LATER，把 A 单独立项 |
| D2 | hero 标题与“预览版”徽章 | A 保留 DOM MutationObserver；B 接受文案不动；C 向上游提 slot 需求 | rc.5 无 slot、locale 不可覆盖、无 token；C 违反“不改上游”的当前约束。建议 B，A 作为过渡但记录脆弱性 |
| D3 | 程序化打开官方设置面板 | A 占用 `settings.launcher`（会顶掉官方账号菜单）；B 自绘菜单不提供“打开设置”；C 保留一次 DOM 兜底 | A 会丢官方账号与配额条目；B 能力降级；C 保留脆弱选择器。建议 B 加 C 的短期兜底，并在文档标 LATER |
| D4 | 外部 kernel 走 ACP 还是 SDK | A ACP 主线，SDK 仅作证据增强；B SDK 主线，另用 ACP 或宿主插件补 cancel | A 有 `session/cancel` 与 tool_call id，推荐；B 需要重键 requestId 且 cancel 缺口要另补 |

### 5.2 CI 策略决策

PR #215 已经修掉机械项（test 四片、pip 不触发 b0、path matrix 补洞、去掉无效 LFS、push-main 不跑 b0、删 0-run workflow、preflight 超时收紧、nightly 修红、dependabot 分组），但三个策略项明确未做。

| 编号 | 决策 | 选项 | 后果 |
|---|---|---|---|
| S1 | 全量 test 是否也移出 push-main | A 保留；B 只靠 PR 验证 | A main 每次 push 仍跑全量，成本高但回归强；B 省时，但直接 push 或 merge 后的坏树发现更晚。建议保留 A，等 PR 覆盖率稳定后再议 |
| S4 | backend fast lane 是否接线 | A 接到 pre-push 与 PR；B 保持空转 | A 缩短本地与 PR 反馈；B 保留现状但没有收益。建议先在一个 PR 上试运行再接线 |
| S5 | release preflight 的宽 paths 是否收窄 | A 收窄；B 保留 | 目前无法证明某个 glob 已被 lint 的 b0 job 覆盖，收窄有漏检风险。建议保留 B，先在 preflight 里加覆盖映射证据 |

### 5.3 合并授权

| 编号 | PR | 当前状态 | 建议与前置 |
|---|---|---|---|
| D5 | #216 P2d | open，`mergeable_state=clean`，preflight、b0、test、merge-gate 全绿 | 评审通过后即可合。它是 #211 rebase 的前置 |
| D6 | #215 CI 精简 | open，`mergeable_state=clean`，全部检查绿（含 merge-gate） | 与 P0 无代码依赖，可独立合。合并后 CI 行为变化，下一轮看 test 四片与 push-main 无 b0 |
| D7 | #211 P0 | draft，`mergeable=false`，b0、preflight、merge-gate 红 | 只能在 C03 与 C04 完成后合。合并前必须 rebase 到含 #216 的 main，并确认锁链指向新 pack |

### 5.4 其它需要授权的动作

| 编号 | 事项 | 选项 | 后果 |
|---|---|---|---|
| D11 | kit 版本策略 | A 保持 `0.1.0` 重打 tarball；B bump `0.2.0` | A 最小，只改摘要与 vendor；B 语义清楚，但要改 10 仓 30 多处断言与锁，本轮成本高。建议 A，P4 前再 bump |
| D12 | 写 10 个作者仓并触发 CI | 授权或只做本地草案 | 不授权则 P0 停在准备阶段；授权后先 Phase 0 再并行 Phase 1 |
| D13 | leaf 与 brand 的 formal pack 路径 | A 补进作者 CI；B 主仓本地生成 | A 可持续，但要改 6 个仓的 build 与 CI；B 快，但证据来自主仓手工操作。建议 A |
| D14 | `FQ_PRE_PUSH_SKIP=1` 本机例外 | 接受或要求本机补齐 7 个固定输入 | 接受则本机 push 绕过 B0，依赖 CI 兜底；不接受则本机无法完整跑 pre-push |
| D15 | 3 份 profile 仍叫 `*.rc3.json` | 本批重命名或保留 | 重命名会动 `validateProfile`、CI 与锁；保留则命名债继续存在。建议保留到 P4 拆仓时一起改 |

## 6 如何接续

1. 先读 `AGENTS.md`、本文件、`STATUS.md`、`docs/operating/verification.md`，再读 PR #211、#215、#216 的 body。不要只读会话摘要。
2. 核对 live 状态。

```bash
gh pr list -R tyuanww/fuqing-crm-analytics --state all --limit 20
gh pr view 211 -R tyuanww/fuqing-crm-analytics --json state,isDraft,mergeable,headRefOid
gh pr view 216 -R tyuanww/fuqing-crm-analytics --json state,mergeable,headRefOid
gh pr view 215 -R tyuanww/fuqing-crm-analytics --json state,mergeable,headRefOid
git log --oneline origin/main -12
```

3. 判断入口。若 #216 未合，先做 C01，不要开 #211 rebase。若 #216 已合且 #211 仍红，按 C02 到 C05 顺序推进，不要跳步。
4. 需要并行时按 3.3 选通道。W2 的 P3-0 与 P3-1 可以立即开，但不要改版本 pin、锁和 `STATUS.md`。
5. 先做只写 `/tmp` 的准备工作。kit tarball、作者仓 patch 草案、锁链重算脚本自测都不需要仓库授权；写作者仓或主仓 `config/` 前停下来要授权。
6. 每完成一张卡，把 PR 号、run id、artifact、摘要写回本文件的对应卡片或追加“执行记录”，不要覆盖旧证据。
7. 遇到 5.1 到 5.4 的决策点，把选项和后果发给用户，不要替用户选。默认建议不构成授权。
8. 报告时按“结论、证据、未做、下一步”四段写。没有真实 run 的项写 `NOT_RUN`，不要写“应该通过”。
9. 工作树纪律。只在自己的 `/tmp` 克隆或独立 worktree 写；不要写用户工作树和 `/Users/hutou/.codex/worktrees`；不要为了验证复制真实大库或启动生产实例。

## 7 本计划不覆盖

- 真实业务 UAT。包括真实模型、真实 CRM 数据、完整文档格式、人工编辑与 AI 局部改的业务验收。P3-0 只证明运行时接线，不证明业务可用。
- 杭州部署与现役切换。包括 100.93.46.46 隔离实例、systemd、端口、Cloudflare 和回退演练。这些是独立授权动作。
- 公网 cutover。T09 不在本计划内，本文不构成切换授权，也不把隔离通过当成公网上线。
- 10 个作者仓的内部实现。每个仓怎么改 peer、怎么改断言、怎么重生成 lock，以各仓 `DEVELOPMENT.md` 与 CI 为准；本文只定义输入、证据格式和顺序。
- DSH 上游改动。本计划不打补丁、不提上游 PR、不 vendor 上游源码。
- 数据迁移、缓存预热、真实 DuckDB 操作和旧 CRM 业务逻辑。
- Dependabot 遗留（#204、#202、#199、#174、#171、#169、#168）。它们与插件链无直接依赖，单独排期。
- rc.5 源码复验报告的入库。报告当前只在会话产物中，建议 P3 开工时整理进 `docs/architecture/`，本文不复述全部源码位置。
- `STATUS.md` 与 `CHANGELOG.md` 的本轮更新。为避免与 #211、#215、#216 冲突，本文不修改这两个文件；P0 收口时由单 writer 统一补记。

## 附录 A 证据索引（2026-11-04 核对）

| 对象 | 值 |
|---|---|
| main | `ecf93daf71bc587d046a54012243f8d47a5bff97` |
| P1 merge | `9674604c`（#210），head `2a419584`，CI `41816034553` |
| P2c merge | `dc9b8fba`（#212），head `ec83fe52`，CI `41823447654` |
| P2b merge | `432cc03a`（#214），head `6849fc4c`，CI `41828359712` |
| P2a merge | `ecf93daf`（#213），head `ef1cc6d8`，CI `41835511757` |
| P2d | #216，head `9557f84b`，CI `41853858267`，preflight `41853858184` |
| P0 | #211，head `94df1b37`，CI `41817908263`，preflight `41817908094` |
| CI 精简 | #215，head `00ddef77`，CI `41846033884`，preflight `41846033847` |
| rc.5 | `b830ec95`，Cordis `4.0.5`，lock `911b0499…` |
| kit | `0.1.0`，private，新 tarball 待 C02 产出 |
