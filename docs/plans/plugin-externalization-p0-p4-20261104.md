# 插件外置 P0-P4 作战计划（2026-11-04 基线）

> 本文件是当前计划，不是历史快照。状态事实以 `origin/main` = `e09ff4f`、PR #211/#216/#218/#222/#229/#230/#232/#234/#235/#236/#237 和本文引用的 CI run 为准；2026-11-04 的旧证据保留在 2.1、2.2 与附录 A。执行前先按第 6 节重新核对；状态变化时追加记录，不要改写已经发生的证据。2026-11-05 owner 已批准 D1–D4 与 P3-3 五项，执行依据见 5.1 与 5.1.1，切片状态见 C09。

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

2026-11-05 12:08 刷新：`origin/main` = `e09ff4ffc28a697583c401deb81a068e2f5cfcd3`，第一父链为 `e09ff4f` → `b872288` → `d169809` → `60d7f4e`。下表状态按该快照与 #237 合并更新，明细见 2.3；2.1 与 2.2 是 2026-11-04 23:25 的旧快照，保持原样。

| 层 | 范围 | 状态 | 证据 |
|---|---|---|---|
| P0 | 目标 DSH 单源到 `0.2.1-rc.5` | 已完成 | #211 merged `9f6c06db`，head `150197b1`；CI `41886050465` success；10 个作者仓按 rc.5 / kit 0.1.1 重建，主仓组合锁、来源清单与证据锁回填；密封 artifact `13348198215`、sha256 `02ed3c37…`、20 成员，seal run `41880213998`；作者 artifact 14 天有效，**2026-11-18 到期** |
| P1 | 插件卫生，幽灵 import、无效 inject、类型检查 | 已完成 | #210 merged，head `2a419584`，merge `9674604c`；CI `41816034553` success；5 个 `client.tsx` 改从 `@deepseek-ai/cordis` 导入，5 个包各自 3 条 `dsh.client.inject` 全部删除，kit 增加 `checkClientTypes()` |
| P2a | provenance 与 client banner 收进 kit | 已完成 | #213 merged，head `ef1cc6d8`，merge `ecf93daf`；CI `41835511757` success；kit 新增 `./provenance` 与 `./client-banner`，9 个 `build.mjs` 与 8 个 banner 改向，`repository_edges` 26 → 17，`cross_package_edges` 28 → 45 |
| P2b | tool policy 单源与官方工具漂移门禁 | 已完成 | #214 merged，head `6849fc4c`，merge `432cc03a`；CI `41828359712` success；`dsh-plugins/query-agent/src/tool-policy.ts` 加 `dsh-plugins/query-agent/config/{query-agent-tool-policy,dsh-official-tools}.v1.json`，68 个官方工具名，25 项行为逐条等价 |
| P2c | component catalog 移出插件源码 | 已完成 | #212 merged，head `ec83fe52`，merge `dc9b8fba`；CI `41823447654` success；`backend/contracts/component-catalog.json` 7014 bytes、sha256 `8e2161fa…`，`board_spec.py` 导入期不再读 `dsh-plugins/` |
| P2d | 生成物收进独立 contracts 包 | 已完成 | #216 merged `36111a90`，head `107d2324`；CI `41874816482` success；110 files +1800/−687；b0 / test / merge-gate 绿 |
| P3 | 换私有协议为 rc.5 公开面 | 部分完成：P3-0/P3-1/P3-2/P3-5 已合并；P3-3 的 3a/3b/3c/3d-prep 与 #237 回收/回调修复合入，cutover 待真机验收；P3-4 决策已定，按 C10 执行 | #218 merged `a2b9a546`，head `a823b0d9`，CI `41880532530` success（P3-0 影子门禁 + P3-1 disposer）；#222 merged `8da4b78e`，head `2df54efe`，CI `41895117591` success（P3-2 Config / typed tools + P3-5 TurnEndReason）；#237 merged `e09ff4f`，head `c85a988`（ACP C2 回调 + scoped env + lost-turn 回收 + 关停/profile 准入）；2026-11-05 owner 批准 D4 与 P3-3 五项，P3-4 按 D1–D3 执行；P3-3 切片见 C09 |
| P3-3 | 外部半换 ACP，`query` 家族留在 bridge | 3a/3b/3c/3d-prep 与 #237 已合并（#230/#232/#229/#234/#237）；cutover 仍待真机验收；作者仓 workbench repack 已随 #235 回填；3e 可选未立项 | #230 merge `72239df2`（transport seam）、#232 merge `0eeb8faa`（ACP stdio transport）、#229 merge `4a926836`（offline shadow compare）、#234 merge `60d7f4e8`（profile generator + `acp_bindings` + cancel-aware settlement + deadline strategy）、#235 merge `d169809`（回填作者 pack、锁链与 sealed artifact）、#237 merge `e09ff4f`（binding-based C2 callback、scoped child env、lost/no-tool reclaim + slot release、dispatcher-owned shutdown、profile health）。真机验收清单见 [acp-cutover-acceptance.md](../operating/acp-cutover-acceptance.md)；默认 transport 仍 `bridge`，剩余构建项见该清单第 9 节 |
| P3-4 | 品牌与账号收口 | 部分完成：D2 hero/徽章与 D3 设置入口按现状接受，不再列为可完成项；D1 构建期标题只留卡片，未实现 | 2026-11-05 决策见 5.1；C10 收口现状，C15 记录标题构建路径与阻塞 |
| P4 | 最后拆仓并删除主仓插件源码 | 未开工 | 无分支、无 PR；`deletion_gate=BLOCKED`，原因为 `remote_main_not_verified` 与 `production_only_closure_not_recorded`；硬依赖 P3-3/P3-4 完成、10 作者仓迁移和删除门禁 |

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

### 2.3 2026-11-05 状态刷新

P2d #216、P0 #211、P3-0/P3-1 #218、P3-2/P3-5 #222 已依次合并，§3.1 的“P2d → kit → 作者包 → 锁回填 → #211”串行链全部走完。P4 的阻塞从“P0 未完成”改为“P3-3/P3-4 未完成 + 10 作者仓迁移”。

- 作者 artifact 有效期 14 天，**2026-11-18 到期**（CHANGELOG 与 STATUS 同口径）。到期后 sealed 组合不能只靠旧 artifact 复验，必须重跑作者 CI 或重新密封；主仓 sealed artifact `13348198215` 本身是 2027-02-02 过期，两个日期不要混用。
- P3-3 曾等 D4（ACP 主线 vs SDK 主线）；P3-4 曾等 D1/D2/D3（标题、hero 徽章、设置入口）。四项已于 2026-11-05 由 owner 决定，见 5.1 与 5.1.1；代码侧没有新增阻塞。
- 2026-11-05 决策回填：owner 批准 D1–D4 与 P3-3 五项（5.1/5.1.1）。P3-3 拆为 3a–3e 与 starlette rollout，C09 记录每项 owner-facing 下一步；3a/3c/starlette rollout 记为进行中，3b/3d 未开工，3e 可选。P3-4 的 D2/D3 接受现状，D1 的构建期标题见 C15（未实现）。本轮基于 `e6074d7`（#225/#226 dependabot 合并）的 main 复核，未刷新第 2 节的时间快照。
- 2026-11-05 P3-3 切片回读，#230 merge `72239df2`（3a transport seam）、#232 merge `0eeb8faa`（3b ACP stdio transport）、#229 merge `4a926836`（3c offline shadow compare）、#234 merge `60d7f4e8`（3d-prep profile generator + `acp_bindings` + cancel-aware settlement + deadline strategy）。cutover 待 pinned rc.5 真机验收，清单见 [acp-cutover-acceptance.md](../operating/acp-cutover-acceptance.md)；作者仓 workbench repack 已随 #235 回填，作者 PR #16 仍未合；默认 transport 仍 `bridge`。
- 2026-11-05 #237 merge `e09ff4f`（head `c85a988`）修掉 P3-3 cutover 的回收与回调阻塞：settled no-tool、丢失结算和重启中的 ACP attempt 统一 CAS binding `LOST`、run `FAILED`/`EXECUTION_UNKNOWN`、释放 active slot；子进程改 scoped env allowlist + per-boot ACP callback token；C2 改 `/internal/acp/tool-call` 由 `acp_bindings` join；dispatcher 关停回收 child；health 先验证 tools-only profile。cutover 仍待 pinned rc.5 真机验收，剩余构建项（`dispatch_intents.transport` 列与 canary、bridge 删除范围、identity 归属、门禁转 blocking、默认翻 acp、作者 PR #16/C0）见验收清单第 9 节。
- B0 flake 跟进见 C14：`test_native_success_save_cockpit_roundtrip_and_negatives` 在 run `41871881222` / job `126720993582` attempt 1 记 `1 failed, 1048 passed`，同分支后续 head `107d2324` 的 run `41874816482` 通过。**未修**，精确诊断与剩余风险写在该卡片。

## 3 依赖图与串行链

### 3.1 主链

```text
P2d #216 合并（36111a90）
      |
      v
kit 0.1.1 → 10 个作者仓按 rc.5 重建 → 主仓锁链回填 + sealed artifact（已完成）
      |
      v
#211 合并（9f6c06db），P0 完成
      |
      v
P3-0/P3-1 (#218) 与 P3-2/P3-5 (#222) 已合并
      |
      v
P3-3（3a/3b/3c/3d-prep 与 #237 已合并，cutover 待真机验收；3e 可选）/ P3-4（D2/D3 接受现状，D1 见 C15）→ P4 拆仓
```

### 3.2 四个拒绝点

1. 作者 peer 校验。`scripts/crm-calibration/composition-inputs.mjs` 的 `validateCompositionPacks` 调 `inspectDeclaredPlugin(..., {dshSdkVersion, cordisVersion})`，作者 pack manifest 声明的 peer 必须等于 rc.5 与 4.0.5，否则 `CRM_COMPOSITION_*_DSH_PIN` 失败，b0 必红。这是 #211 合并前 b0 红的直接原因；P0 已按此重建作者 pack。
2. 锁链摘要绑定。profile digest、`config/shinemage-composition-packs.lock.json`、`config/shinemage-composition-pack-manifest.v1.json`、sealing 分支、`config/shinemage-composition-artifact.lock.json` 之间逐层 sha256 绑定，改一层必须重算下游，只能单 writer 顺序回填。
3. sealed artifact 分支。密封 workflow 只接受两个硬编码分支，两条都已与 main 分叉（2026-11-04 核对，`codex/rc3-composition-artifact-20261024` 为 ahead 5、behind 347，`codex/warehouse-composition-inputs-20261026` 为 ahead 17、behind 125），P0 已按 rc.5 重建并密封，未复用旧 artifact。
4. 冲突面。#211 与 main 冲突，P2d 又把生成物移到 `dsh-plugins/contracts/` 并改多个 `package.json` 邻域。实际顺序已按 #216 先落、再 rebase #211 执行。

### 3.3 并行通道（2026-11-05）

| 通道 | 工作 | 位置 | 状态 | 冲突面 |
|---|---|---|---|---|
| W1 | #216 评审与合并授权 | 现有 PR | 已完成（`36111a90`） | 与 #211 争 `package.json` 邻域，先落 W1 |
| W2 | P3-0 影子门禁、P3-1 disposer 收口 | 新 worktree off `ecf93daf` | 已完成（#218 `a2b9a546`） | 与 P2d 文件大体不重叠；与 #211 争 `package.json` 时先让 W1 |
| W3 | kit tarball 构建、作者仓 patch 草案、锁链重算脚本自测 | `/tmp` 与只读作者仓 | 已完成（kit 0.1.1） | 无主仓写入 |
| W4 | 10 作者仓重建、推分支、触发 CI | 10 个作者仓 | 已完成（rc.5 / kit 0.1.1） | 与主仓锁链是串行输入 |
| W5 | 主仓锁链回填与 artifact 密封 | 主仓 `config/` 与 sealing 分支 | 已完成（artifact `13348198215`） | 共享热点，只能单 writer |
| W6 | 交付层真实演练 T02/T03/T06/T07/T09/E1 | 隔离实例与文档 | 需授权或人工窗口 | 与插件代码无文件冲突 |

结论。W1 到 W5 已随 P0 完成，W6 仍可并行。D1–D4 与 P3-3 五项已由 owner 决定（5.1/5.1.1）；P3-3 按 C09 的 3a–3d 主链推进，3a/3b/3c/3d-prep 与 #237 已合并，cutover 待真机验收，3e 可选；P3-4 只剩 C15 的标题构建选择。P4 在 P3 与 10 作者仓迁移完成后启动。

## 4 任务卡

每张卡包含目标、输入、入口、验收、阻塞和授权。授权只写“需要人做什么”，不代表本计划已经授权。

2026-11-05：C01–C08、C11 已完成（merge `36111a90` / `9f6c06db` / `a2b9a546` / `8da4b78e`）；D1–D4 与 P3-3 五项已由 owner 批准（5.1/5.1.1），C09 拆 3a–3e 与 starlette rollout，C10 按 D2/D3 接受现状；C15 是 D1 标题的构建期卡片（暂不实现）；C12 等 P3 完成；C13、C14 为跟进（C14 已按文档接受）。

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

### C09 P3-3 外部半换 ACP（决策已定，按 3a–3e 切片）

**目标** 让 FastAPI run kernel 通过 `dsh --profile acp` 子进程驱动 kernel 拥有的自动化 run，删除自建 HTTP、bearer token 和固定端口的外部半；用户聊天与 `query` 家族留在现有 bridge，不在本卡迁移。

**决策** 2026-11-05 owner 批准五项，全文见 5.1.1：

1. P3-3-H5：自动化回答暂不需要进入用户聊天会话；`query` 家族继续走 bridge；ACP 只服务 kernel-owned automation run；用户聊天行为不变。
2. A 以 K 的 OS 身份运行，信任边界是父进程。
3. K 实现 `session/requestPermission`；业务工具按机器 allowlist 通过，其余失败关闭。
4. 接受 rc.5 codec collapse；SDK 独立审计会话作为可选 3e，不阻塞 cutover。
5. 自动化 run 接受串行；队列化留到 P4 或更晚。

**输入** rc.5 `acp` profile、ACP 客户端（`@agentclientprotocol/sdk` 或同源实现）、`dsh-plugins/analytics-workbench/src/bridge.ts`、`backend/services/analytics/runtime.py`、`backend/services/analytics/runtime_ports.py`、`backend/analytics_runtime.py`。

**入口**

```bash
dsh --profile acp
dsh --profile sdk
# 映射 /dispatch -> session/prompt，/cancel -> session/cancel
# /observe -> ACP tool_call 更新折账，/health -> initialize + session/list
```

**切片与 owner-facing 下一步**

| 切片 | 范围 | 状态 | owner-facing 下一步 |
|---|---|---|---|
| 3a 传输缝 | 在 bridge 与后端之间留出可替换 seam；`query` 家族不走 ACP | 已合并 #230（`72239df2`） | 已收口，seam 合同与测试在 main |
| 3b ACP server/client | ACP 启动、prompt、cancel、`session/requestPermission`、tool_call id | 已合并 #232（`0eeb8faa`） | 已收口，真实宿主项转到 3d 验收 |
| 3c 影子对账 | 新旧外部半双写与对账，保留回滚 | 已合并 #229（`4a926836`） | 已收口，离线 S-A 报告随 cutover 证据刷新；S-B 在线金丝雀仍未做 |
| 3d 切主路径 | 切到 ACP，删除自建 http/token/端口 | 3d-prep #234 与 #237 已合并；作者 pack/锁链由 #235 回填；cutover 待真机验收 | 按 [真机验收清单](../operating/acp-cutover-acceptance.md) 在 pinned rc.5 跑完；剩余构建项：`dispatch_intents.transport` 列与 canary、bridge 删除范围（保留 `query` 家族）、identity 归属、门禁转 blocking、默认翻 `acp`、作者 PR #16/C0 前置；最后单独发起 cutover PR |
| 3e SDK 独立审计会话（可选） | 用独立 SDK 会话做原因保真审计 | 可选，未立项 | owner 决定是否立项；不阻塞 3d |
| starlette rollout | 后端 FastAPI/Starlette 侧的独立 rollout | 进行中 | 回填 PR/run 与隔离实例回执，并说明与 3b 的接口边界（子进程生命周期、取消、重试归属） |

**验收** H5 下用户聊天无变化；ACP 能启动、prompt、cancel；`session/requestPermission` 只放行机器 allowlist，其余失败关闭；tool_call id 可用于证据链；取消后 inbox 拼接时序正确；3c 影子对账通过后才切主路径；删除自建 http/token/端口后无残留调用；串行 run 不出现并发写入，需要队列时另立切片。

**阻塞** 3a/3b/3c/3d-prep 与 #237 已合并；3d cutover 等 pinned rc.5 真机按 [验收清单](../operating/acp-cutover-acceptance.md) 通过。剩余构建项：`dispatch_intents.transport` 列与在线 canary、bridge 删除范围（保留 `query` 家族）、identity 归属、rc.5 gate 转 blocking、默认 transport 翻 `acp`、作者 PR #16 合入与 C0 例外移除。作者仓 workbench repack 已随 #235 回填，作者 PR #16 仍未合；starlette rollout 进行中；3e 可选。部署形态改变（子进程、stdout 协议、生命周期）仍需单独评审。

**授权** 架构级改动、部署形态、子进程管理；不在杭州现役上直接验证。

### C10 P3-4 品牌与账号收口（决策已定）

**目标** 按 2026-11-05 决策收口品牌与账号：D2 保留现有 hero 标题与“预览版”徽章的 DOM 处理，D3 保留现有设置/账号入口实现并承认没有公共 API，D1 的浏览器标题改由构建期 `DSH_CLIENT_TITLE` 承担（实现见 C15，本卡不新增 runtime hook）。

**输入** `shine-brand/src/brand-surface.mjs` 的 `document.title`、headline、previewBadge 替换；`analytics-workbench/src/client/account-chrome.tsx` 与 `analytics-workbench/src/client/native-account-settings.mjs` 的 `aria-label` 选择器；rc.5 brand slot / theme token / `sidebar.footer.action` / `settings.section`。

**入口**

```text
shine-brand 品牌 token 与 mark/name slot 保留
账号菜单保持当前实现（sidebar.footer.action 自绘 + aria-label 兜底）
设置页保持当前实现（settings.section 可用，程序化打开无公共 API）
hero 标题与预览徽章保留现有 DOM 处理，不列为完成项
标题按 D1 走 C15 的构建期方案；落地前保留 document.title 赋值
```

**验收** D2/D3 在文档中明确为“接受现状”，不再以删除 DOM 选择器作为完成条件；D1 落地前 `document.title` 不被导航抢回，C15 落地后删除该赋值；rc.5 真实 shell 下品牌展示、账号菜单、设置页维持可用。

**阻塞** D1 的构建期路径（C15）；D2/D3 无阻塞。

**授权** 业务接受品牌与账号能力降级；新增 shell 构建面需单独授权（C15）。

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

**Runbook** 执行顺序、删除门禁与回滚证据见 [p4-repo-split-runbook.md](../operating/p4-repo-split-runbook.md)（2026-11-05）。

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

### C14 B0 native-save 503 flake（跟进）

**目标** 关闭 `backend/tests/test_analytics_first_purchase_native.py::test_native_success_save_cockpit_roundtrip_and_negatives` 的偶发 503，不用测试侧重试掩盖。

**证据** run `41871881222` job `126720993582` attempt 1：`1 failed, 1048 passed`，失败点是 `incomplete.status_code == 422` 实际得到 503；同一测试的 captured log 有 `B0 STATE_UNAVAILABLE; new dispatch paused until reconciliation`。该 run 的 attempt 2 被取消；同分支后续 head `107d2324` 的 run `41874816482` b0 通过（15m40s）。本机整文件 30 次、批次前缀 602 项均通过，未复现。

**诊断** 503 来自 RunStore 读连接：`_connection(readonly=True)` 每次新开连接且 `timeout=0.1`；WAL 下普通写锁不会阻塞读（`test_analytics_jobs.py` 已断言 “WAL reader still works”），所以不是 writer 持锁。失败与同进程 dispatcher tick 的 STATE_UNAVAILABLE 同时出现，最可能是连接频繁开/关时撞上 WAL recovery/checkpoint 或临时 I/O 的 100 ms 窗口；`tick()` 又把任何 `sqlite3.DatabaseError` 统一记成 STATE_UNAVAILABLE 并暂停准入。已排除跨测试共享状态：每个 app 用独立 `tmp_path/state`，10 文件 212 项批次内 fd 12–15、线程 10–13 且无增长，也没有全局 sqlite monkeypatch。

**剩余风险** 同一 100 ms 窗口仍可命中任意读路径，按合同返回可重试 503，概率低但未关闭；CI 若再次出现应保留 job 日志并记录具体 sqlite 错误类型。

**未做/下一步** 生产侧候选是给只读连接更长的 busy timeout，或复用读连接 / 显式 WAL recovery 策略；两者都会改动 0.1s fail-closed 准入语义和现有 contention 测试（`test_analytics_native_runtime.py`、`test_analytics_jobs.py`），需要单独评审，不在本 PR 做。测试侧加重试或放宽断言会掩盖合同问题，明确不做。2026-11-05 决定按现状接受，以上生产侧候选不排期。

**决策（2026-11-05）** 按现有文档接受该 flake：不修改生产锁语义，不加测试侧重试、不放宽断言；CI 再次出现时重跑 job，保留 job 日志并记录具体 sqlite 错误类型。复现频率上升再单独立项。

**授权** 无产品决策；改生产锁语义前单独评审。

### C15 构建期品牌标题（D1 已决，暂不实现）

**目标** 用构建期 `DSH_CLIENT_TITLE` 把浏览器标题固定为业务品牌，替代运行期 `document.title` 赋值；不新增 runtime plugin hook。

**决策** 2026-11-05 owner 接受 build-time `DSH_CLIENT_TITLE`，不采用运行期插件 hook。

**核验（2026-11-05，rc.5 `b830ec95`）** `DSH_CLIENT_TITLE` 是构建期值：`apps/web/vite.config.ts` 的 `clientDocumentTitle()` 把它写进初始 `<title>`，`packages/client/ui-layout/src/client/AppFrame.tsx` 把它作为 `productTitle` 传给 `DocumentTitle`（导航时重写 `document.title`）。官方构建经 `scripts/build.ts` 的 `official` profile 调 `scripts/client-build-environment.ts`，其中 `OFFICIAL_CLIENT_BUILD_ENVIRONMENT` 把 `DSH_CLIENT_TITLE` 固定为 `DeepSeek Harness`，且 `resolveClientBuildEnvironment` 对 `official` 之外的 profile 直接抛错。本仓 `scripts/dsh-b0/pipeline.mjs` 在固定 SHA 的干净 checkout 上跑 `pnpm run build:official`，`verifySource()` 拒绝本地改动。因此在本仓 build env 里加 `DSH_CLIENT_TITLE` 不会生效。

**为什么不实现** 三条可选路径都不是“build define/env 加一个测试”：改上游源码违反硬规则 2；只在 `runtime-bundle` 后处理 `apps/web/dist/index.html` 不够，因为 bundle 内的 `productTitle` 仍会把导航标题抢回 `DeepSeek Harness`，要同时改产物 JS 并同步 `.dsh-build/client-build-environment.json` 与运行时 source-tree/provenance 摘要；改用非 official profile 会改变固定准备与官方 artifact 合同。按本轮边界只留卡片。

**owner-facing 下一步** owner 在两条中选一：(a) 在 `runtime-bundle` 增加受控 post-build 标题重写（`index.html` 与 client bundle 的 `productTitle`）并同步 client build record / runtime provenance，单独 PR、单独授权；(b) 等上游提供支持自定义标题的 official profile 或新 env 合同，本仓只升级 pin。选定前保留现有 `document.title` 运行时赋值，避免导航后被官方 `DocumentTitle` 抢回。

**验收** 二选一落地后：构建产物 `index.html` 的 `<title>` 为业务品牌；`.dsh-build` 记录与产物摘要一致；导航后标题不再被抢回；删除 `shine-brand` 的 `document.title` 赋值不导致回归。

**阻塞** 需要新增构建步骤或等待上游合同；本计划不授权。**授权** 新增 shell 构建/后处理面、修改 runtime provenance 需单独授权。

## 5 决策与授权记录

### 5.1 rc.5 产品决策（2026-11-05 已决）

D1–D4 已由 owner 批准；“决定”列是执行依据，“选项”与“后果与建议”列保留为决策上下文。

| 编号 | 决策 | 选项 | 后果与建议 | 决定（2026-11-05） |
|---|---|---|---|---|
| D1 | 产品标题如何替换 | A 自建 web client 构建并带自己的 `DSH_CLIENT_TITLE`；B 保留 `document.title` 赋值，接受导航时被 `DocumentTitle` 抢回 | A 成本高，新增 shell 构建与维护面；B 零成本但有已知缺陷。建议 P3 先按 B 标记 LATER，把 A 单独立项 | 接受构建期 `DSH_CLIENT_TITLE`，不加运行期插件 hook；本仓注入受阻的原因与二选一见 C15 |
| D2 | hero 标题与“预览版”徽章 | A 保留 DOM MutationObserver；B 接受文案不动；C 向上游提 slot 需求 | rc.5 无 slot、locale 不可覆盖、无 token；C 违反“不改上游”的当前约束。建议 B，A 作为过渡但记录脆弱性 | 保留现有 DOM 处理，不列为可完成项；C10 按现状收口 |
| D3 | 程序化打开官方设置面板 | A 占用 `settings.launcher`（会顶掉官方账号菜单）；B 自绘菜单不提供“打开设置”；C 保留一次 DOM 兜底 | A 会丢官方账号与配额条目；B 能力降级；C 保留脆弱选择器。建议 B 加 C 的短期兜底，并在文档标 LATER | 保留当前实现，承认没有公共 API；不占用 `settings.launcher`，C10 记录能力边界 |
| D4 | 外部 kernel 走 ACP 还是 SDK | A ACP 主线，SDK 仅作证据增强；B SDK 主线，另用 ACP 或宿主插件补 cancel | A 有 `session/cancel` 与 tool_call id，推荐；B 需要重键 requestId 且 cancel 缺口要另补 | ACP 主线，SDK 仅作证据；C09 按 3a–3d 推进，3e 可选 |

### 5.1.1 P3-3 五项决策（2026-11-05 批准）

| 编号 | 决策点 | 决定 | 后续动作 |
|---|---|---|---|
| P3-3-H5 | 自动化回答是否进入用户聊天 | 暂不需要；`query` 家族继续走 bridge；ACP 只服务 kernel-owned automation run；用户聊天行为不变 | C09 验收；不因 ACP 迁移改用户聊天路径 |
| P3-3-A-ID | A 的 OS 身份 | 接受 A 以 K 的 OS 身份运行，信任边界是父进程 | 3b/3c 记录父进程边界，不新增跨用户隔离承诺 |
| P3-3-A-PERM | A 内审批 | K 实现 `session/requestPermission`；业务工具按机器 allowlist 通过，其余失败关闭 | 3b 先写 fail-closed 用例，再接入业务工具 |
| P3-3-REASON | 原因保真 | 接受 rc.5 codec collapse；SDK 独立审计会话作为可选 3e，不阻塞 cutover | 3e 由 owner 决定是否立项 |
| P3-3-CONC | 并发 | 接受自动化 run 串行；队列化留到 P4 或更晚 | 3d 不引入队列；并发需求另立切片 |

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
| D5 | #216 P2d | 已合并 `36111a90` | 关闭；它是 #211 rebase 的前置 |
| D6 | #215 CI 精简 | 已合并 `c2f627cb` | 关闭；test 四片与 push-main 无 b0 已上线 |
| D7 | #211 P0 | 已合并 `9f6c06db` | 关闭；作者 artifact 2026-11-18 到期，到期前不要把它当作长期输入 |

### 5.4 其它需要授权的动作

| 编号 | 事项 | 选项 | 后果 |
|---|---|---|---|
| D11 | kit 版本策略 | A 保持 `0.1.0` 重打 tarball；B bump `0.2.0` | A 最小，只改摘要与 vendor；B 语义清楚，但要改 10 仓 30 多处断言与锁，本轮成本高。建议 A，P4 前再 bump |
| D12 | 写 10 个作者仓并触发 CI | 授权或只做本地草案 | 不授权则 P0 停在准备阶段；授权后先 Phase 0 再并行 Phase 1 |
| D13 | leaf 与 brand 的 formal pack 路径 | A 补进作者 CI；B 主仓本地生成 | A 可持续，但要改 6 个仓的 build 与 CI；B 快，但证据来自主仓手工操作。建议 A |
| D14 | `FQ_PRE_PUSH_SKIP=1` 本机例外 | 接受或要求本机补齐 7 个固定输入 | 接受则本机 push 绕过 B0，依赖 CI 兜底；不接受则本机无法完整跑 pre-push |
| D15 | 3 份 profile 仍叫 `*.rc3.json` | 本批重命名或保留 | 重命名会动 `validateProfile`、CI 与锁；保留则命名债继续存在。建议保留到 P4 拆仓时一起改 |

## 6 如何接续

1. 先读 `AGENTS.md`、本文件、`STATUS.md`、`docs/operating/verification.md`，再读 #211/#216/#218/#222 的 body（均已合并）。不要只读会话摘要。
2. 核对 live 状态。

```bash
gh pr list -R tyuanww/fuqing-crm-analytics --state open
gh pr checks <n> -R tyuanww/fuqing-crm-analytics
git log --oneline origin/main -12
```

3. 判断入口。P0、P2d、P3-0、P3-1、P3-2、P3-5 已完成；D1–D4 与 P3-3 五项已于 2026-11-05 决定，3a/3b/3c/3d-prep 与 #237 已合并，下一步按 C09 在 pinned rc.5 真机执行 [ACP 验收清单](../operating/acp-cutover-acceptance.md)，通过后再发起 cutover PR；P3-4 只剩 C15 的标题构建选择，然后 P4。不要重开 #211/#216。
4. 需要并行时按 3.3 选通道。W1–W5 已完成，3.3 表里只剩 W6；C09 的 3a/3c/starlette rollout 是另外的并行切片，不占 W 通道。P3-3 与 P3-4 会改 `dsh-plugins/*/package.json` 与 profile，同一时刻只让一个 writer 动这些热点。
5. 只写 `/tmp` 的准备工作已完成；后续写作者仓、主仓 `config/`、sealing 分支或删 `dsh-plugins/` 仍需单独授权。
6. 每完成一张卡，把 PR 号、run id、artifact、摘要写回本文件的对应卡片或追加“执行记录”，不要覆盖旧证据。
7. 遇到 5.2 到 5.4 中仍未决的决策点，把选项和后果发给用户，不要替用户选；5.1 与 5.1.1 已决项不要重新打开。默认建议不构成授权。
8. 报告时按“结论、证据、未做、下一步”四段写。没有真实 run 的项写 `NOT_RUN`，不要写“应该通过”。
9. 工作树纪律。只在自己的 `/tmp` 克隆或独立 worktree 写；不要写用户工作树和 `/Users/hutou/.codex/worktrees`；不要为了验证复制真实大库或启动生产实例。

## 7 本计划不覆盖

- 真实业务 UAT。包括真实模型、真实 CRM 数据、完整文档格式、人工编辑与 AI 局部改的业务验收。P3-0 只证明运行时接线，不证明业务可用。
- 杭州部署与现役切换。包括 100.93.46.46 隔离实例、systemd、端口、Cloudflare 和回退演练。这些是独立授权动作。
- 公网 cutover。T09 不在本计划内，本文不构成切换授权，也不把隔离通过当成公网上线。
- 10 个作者仓的内部实现。每个仓怎么改 peer、怎么改断言、怎么重生成 lock，以各仓 `DEVELOPMENT.md` 与 CI 为准；本文只定义输入、证据格式和顺序。
- DSH 上游改动。本计划不打补丁、不提上游 PR、不 vendor 上游源码。
- 数据迁移、缓存预热、真实 DuckDB 操作和旧 CRM 业务逻辑。
- Dependabot 遗留已清零（#204、#199、#174、#169、#168 关闭，#202、#171 合并）；pydantic 与 pydantic-core 的 ignore 已按成对冻结对齐。
- rc.5 源码复验报告的入库。报告当前只在会话产物中，建议 P3 开工时整理进 `docs/architecture/`，本文不复述全部源码位置。
- `STATUS.md` 与 `CHANGELOG.md` 的本轮更新。为避免与 #211、#215、#216 冲突，本文不修改这两个文件；P0 收口时由单 writer 统一补记。

## 附录 A 证据索引（2026-11-04 核对，2026-11-05 追加）

| 对象 | 值 |
|---|---|
| main（2026-11-04 快照） | `ecf93daf71bc587d046a54012243f8d47a5bff97` |
| main（2026-11-05） | `8da4b78e0bf1db15a1747e2a83903af99599a550` |
| P1 merge | `9674604c`（#210），head `2a419584`，CI `41816034553` |
| P2c merge | `dc9b8fba`（#212），head `ec83fe52`，CI `41823447654` |
| P2b merge | `432cc03a`（#214），head `6849fc4c`，CI `41828359712` |
| P2a merge | `ecf93daf`（#213），head `ef1cc6d8`，CI `41835511757` |
| P2d merge | `36111a90`（#216），head `107d2324`，CI `41874816482` |
| P0 merge | `9f6c06db`（#211），head `150197b1`，CI `41886050465`；seal run `41880213998`，artifact `13348198215`（`02ed3c37…`，20 成员，2027-02-02 过期） |
| P3-0/P3-1 merge | `a2b9a546`（#218），head `a823b0d9`，CI `41880532530` |
| P3-2/P3-5 merge | `8da4b78e`（#222），head `2df54efe`，CI `41895117591` |
| CI 精简 | #215，`c2f627cb` |
| rc.5 | `b830ec95`，Cordis `4.0.5`，lock `911b0499…` |
| kit | `0.1.1`，已用于 10 作者仓 rc.5 重建 |
| 作者 artifact | 14 天有效，2026-11-18 到期 |
