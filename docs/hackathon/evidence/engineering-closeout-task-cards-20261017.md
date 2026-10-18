# 工程收尾任务卡与红队检查表

日期：2026-10-17

> 事实纠偏（2026-10-18）：本文件是 2026-10-17 快照。rc2 web rollback 的当前 owner-only synthetic 结果见 [rc2 web rollback headed recovery](rc2-web-rollback-headed-recovery-20261018.md)。历史 `NOT_RUN` 文字不再触发重复验证，也不改变正式 M2 状态。

## 收尾定义

工程收尾不是把正式发布门禁全部伪装成通过。工程收尾的可验证条件是：最终 Harness 版本固定，隔离 candidate 可重建，插件和 runtime 合同通过，回退路径可回放，所有结论绑定真实 artifact 和原始回执。

正式发布仍单独记录：

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

当前真实状态是：

```text
C0_INPUT_FREEZE=PASS
EC-01=INPUTS_FROZEN
EC-02=PASS_IN_LOCAL_REPLAYABLE_LANE
EC-03=PASS_IN_LOCAL_REPLAYABLE_LANE_BROWSER_ENTRY_PASS
EC-04=HISTORY_BROWSER_PASS_BOARD_TRANSPORT_PASS_NATIVE_BOARD_CANVAS_PASS_PAGE_HTTP_ON_RESTART_PASS_ROLLBACK_SDK_CLI_PASS_WEB_ROLLBACK_NOT_RUN
EC-05=NOT_IMPLEMENTED
EC-06=DEFERRED
```

在 EC-02 开始前，必须先完成 provenance gate hardening、统一 rc1 subject set 和 SDK/peer 输入绑定。版本文档和输入冻结不能代替 candidate 构建。

## 主线任务卡

### EC-01：固定最终 Harness 输入

**目标**

把最终内部运行时从旧 `0.1.7-rc.2` 基线切到 Harness 最新发布 `dsh-v0.2.1-rc.1`，不使用浮动版本。

**固定输入**

```text
upstream_tag=dsh-v0.2.1-rc.1
upstream_sha=1600d8a1e140dcde43a1a0941940a0480712c011
tarball_sha256=6d0c6fe8ad0c21797a27d6afc0cb69a022714ea0cd7331e4cba8b07b8ce19009
cordis=4.0.5
node=24.19.0
upstream_pnpm=11.28.5
plugin_pnpm=11.28.2
```

**工具**

`git ls-remote`、`npm view`、`npm pack`、`sha256sum`、lockfile 读取器、manifest 校验器。

**完成证据**

一份 immutable pilot manifest，绑定 upstream/tree/tarball/plugin/lockfile digest、Node、pnpm、Cordis 和回退版本。

**失败判定**

出现浮动 `latest`、旧 rc2 peer、alpha4 peer、未绑定 SHA、dirty source 或 manifest 与实际字节不一致时，卡片失败。

现有 `config/dsh-profile.rc2.json` 和旧 profile pack inputs 不能复用。rc1 必须重新生成 profile、pack inputs 和组合 subject set，否则会触发 `PROFILE_DSH_PIN_MISMATCH`。

### EC-02：建立 rc1 隔离 candidate lane

**目标**

只在隔离 checkout 中对齐 rc1，不修改主仓 rc2 pin，也不复用 alpha2/alpha4 的 candidate receipt。

**工作**

- 更新隔离 toolchain 和 source/upstream lock。
- 对齐 9 个插件的 `dsh-tools` peer 和 Cordis peer。
- 使用 rc1 host/client SDK 构建。
- 重新生成 9 个 plugin pack。
- 重新生成 source/tree/tarball/provenance。

**工具**

现有 release pack builder、profile/pack reader、固定 Node 24、固定 pnpm、clean checkout、独立输出目录。

**完成证据**

9/9 pack receipt、source dirty 检查、manifest digest、tarball digest、pack digest 和 provenance 能由独立脚本重算。

每个 pack 都必须带 `generated_bytes_provenance`，candidate/load/verify 路径必须强制要求 builder receipt。不能依赖调用方传入可选布尔参数，也不能只用环境变量自报 clean builder。

**失败判定**

任何 pack 从 ignored workspace、旧 runtime、旧 peer 或未登记路径读取时，整卡失败，不修补 receipt。

rc1 的 analytics client build 还必须证明生成声明闭包可用。当前 rc1 `ui-workspace` 的 `workspace.toast` 增量声明没有被 client barrel 自动加载；候选适配只能显式加载 rc1 的 `toast.d.ts`，不能复用 alpha3 的宽泛 shim，也不能修改官方 upstream。

CRM/Knowledge 还必须显式验证 rc1 Markdown 类型对 `katex/dist/katex.min.css` 的 side-effect import；缺少 CSS ambient declaration 时应停在 `TS2882`，不能用跳过类型检查或打包成功掩盖。

### EC-03：执行 rc1 consumer/runtime closure

**目标**

证明最终内部 runtime 的真实消费者可以在 production-only 安装后加载。

**工作**

- fresh staging 目录。
- production-only install。
- 不使用 `--legacy-peer-deps`、`--force` 或跳过 verifier。
- SDK、`dsh-tools`、Cordis 和 CRM tarball 必须作为明确的 file/cache 输入或由锁定 integrity 的 registry 输入消费；只在 step 0 计算 SDK SHA、安装时又让 peer 从 registry 自由解析，不算绑定。
- 生成 dependency graph。
- 生成 SBOM。
- 检查 CRM、Knowledge、Cordis、`dsh-tools`、KaTeX JS/CSS runtime import。
- 绑定 provenance 到同一份 manifest。

**完成证据**

dependency graph、SBOM、provenance、runtime import receipt 和 command/exit-code log 的 SHA 都能回读。

**失败判定**

`ERESOLVE`、peer 警告、缺 CSS、只在 devDependencies 存在的 runtime 包、只在本机缓存可用或 graph 与 SBOM 不一致，均为失败。

**当前结果**

最终 subject set 已固定到 `.context/checks/dsh-rc1-engineering-20261017/final-subject-set/`。9 个 pack 和两个 profile-pack inputs 绑定同一 source SHA `f4026619392c2909b449eb75be1081776b7c5507`，严格 provenance reader 通过。fresh consumer 只声明 SDK、dsh-tools、Cordis 和修复后的 CRM tarball；production-only install、无问题依赖图、CycloneDX SBOM、CRM/host/Cordis/dsh-tools imports 和 CRM pack 传递的 KaTeX JS/CSS 均通过。真实 Chrome headed browser 已打开并进入 rc1 工作台，history/board fixture 和生命周期回放在 EC-04 单独记录。

### EC-04：执行 candidate lifecycle、browser 和 recovery smoke

**目标**

证明 rc1 candidate 的 session、history、board 和回退路径在实际生命周期中可读回。

**工作**

- fresh runtime 和 empty HOME。
- 拒绝 credentials 文件和个人 API key。
- 只注入 synthetic/de-identified fixture。
- 启动候选并读取 history/board。
- 只停止自己拥有的进程。
- 重启候选。
- 用真实 headed browser 回读同一 session、board、version 和 SHA。
- 卸载 rc1，安装 rc2 fallback，验证 version/help/import。

**完成证据**

前后两次回读绑定同一 candidate manifest，browser 操作来自真实 headed browser，重启后回读不依赖 synthetic backend，cleanup receipt 显示自有进程和临时目录均已回收。

**失败判定**

只看 HTTP 200、只看 synthetic fixture、只看服务存活、没有重启后回读、复用了 live 凭据或停止了无关进程，均不算通过。

**当前结果**

固定 Node24/pnpm11.28.2 的 rc1 隔离 candidate 已在独立 14327 端口启动，并注入 candidate-bound synthetic history/board fixture。上一轮的“页库暂时不可用”根因是候选没有启用 page HTTP，导致 `preferencesReady=false`。本轮用现有 `--page-http on --page-http-port 18140` 重启，并让 18142 的临时 board fixture 补齐原生 TEXT 组件公共字段。真实 Chrome headed browser 在重启前后都回读了同一 history session、交付物、board tool card 和原生 canvas。首次进入驾驶舱需要一次真实“刷新产物”来完成异步 board 列表回读；随后 AX 读到 `看板画布，可横向和纵向滚动`、标题 `候选合成说明`、版本 `1` 和同一 source SHA。预览保持 `PENDING`，没有执行 confirm。候选 owned stop/start、page HTTP preferences/pages、board RPC、重启后 history/board 回读和 rc2 SDK/CLI rollback 均有真实回执；rollback 的 web 侧因没有 rc2 profile pack 保持 `NOT_RUN`。完整机器可读回执见 [rc1 lifecycle recovery](engineering-closeout-rc1-lifecycle-recovery-20261017.json)，browser entry 的历史入口回执仍保留为 [browser entry probe](engineering-closeout-rc1-browser-entry-20261017.json)。

### EC-05：内部 Stage 0（条件任务卡）

**触发条件**

只有要让 1–3 名内部用户实际试用时才启动。没有真实任务卡时，只能运行 `HARNESS_SMOKE_ONLY`。

**输入**

部门、岗位、用户、任务、输入、输出、允许数据类别、每周频次、任务前耗时、owner 和目标日期。

**完成证据**

local-only receipt、fixture digest、cleanup receipt、任务输入输出样例和权限边界记录。

**失败判定**

没有任务卡、使用真实未批准数据、复制个人凭据、把 smoke 结果写成 readiness 或把 1–3 人结果外推到 500 人，均失败。

### EC-06：Stage 1 与正式 M2（延期线路）

**Stage 1 触发条件**

只有要扩大到 10–20 人时才处理 OIDC、共享存储、备份恢复、日志告警、容量和支持责任。

**正式 M2 触发条件**

只有要对外分发、生产激活或设置 `release_ready=true` 时才打开 M2-07、M2-08、M2-09。

## 红队攻击矩阵

| 攻击面 | 红队工具和动作 | 需要的反证 | 上线阻断条件 |
| --- | --- | --- | --- |
| 版本漂移 | `git ls-remote`、`npm view`、读取所有 manifest/lock/toolchain | rc1 tag、upstream SHA、package SHA、插件 peer 全部一致 | 任一文件仍偷偷指向 rc2/alpha4/浮动 latest |
| ignored artifact 注入 | `git status --ignored`、clean checkout 重建、source/tree 对比 | source_dirty=false、pack source SHA 与 checkout HEAD 一致 | pack 来自 ignored workspace 或旧输出目录 |
| 依赖闭包伪通过 | fresh HOME、production-only install、graph/SBOM 独立重算 | 无 ERESOLVE、无 legacy/force、graph 与 SBOM 一致 | 依赖只在本机缓存或 devDependencies 中存在 |
| Cordis peer 冲突 | 读取每个插件 `package.json`、`pnpm list`、运行时 import | 9 包 peer 与 rc1 `dsh-tools`/Cordis 完全一致 | 旧 Cordis 4.0.4 或 alpha2 peer 残留 |
| provenance 造假 | 独立脚本重算 source/tree/tarball/provenance SHA | receipt 中的 SHA 与真实字节一致 | 只信 JSON 字段，不重算字节 |
| 凭据泄露 | empty HOME、拒绝 `.credentials.yaml`、日志 secret scan | 无个人 API key、无凭据文件复制、日志无 secret | 运行依赖个人配置或日志出现 token |
| 数据越界 | synthetic fixture、redaction 检查、权限负测 | fixture 类型、数据类别、权限和删除回执齐全 | 真实数据未经 owner 批准进入 Stage 0 |
| browser/recovery 伪通过 | 真实 headed browser、重启后同一 ID/SHA 回读 | history/board 前后回读一致，console 和 cleanup 有原始记录 | 只有 HTTP 200、没有重启后回读或复用了 synthetic backend |
| 进程所有权 | PID/PGID 记录、只停止 owned process、复查 live 端口 | 无关服务 PID/端口前后不变 | 为清理方便停止 live 或共享服务 |
| 回退不可用 | rc1 安装、卸载、rc2 安装、version/help/import | rc2 回退 receipt 和数据 schema 兼容证据 | 只能升级不能回退，或回退覆盖旧 workspace |
| 目标环境差异 | 目标 OS/arch/Node/pnpm/CA/网络逐项 preflight | 目标环境 receipt 与本地 manifest 绑定 | 只在 macOS 本地通过，目标环境未验证 |
| 证据可信度 | 重新执行 verifier、检查命令/退出码/时间/路径 | 原始 stdout/stderr、artifact SHA、receipt 可重放 | 只有人工描述，没有可重放原始输出 |
| 门禁语义 | 检查 STATUS、TODO、receipt scope | local/internal/formal scope 清楚分开 | 本地 PASS 被写成公司 PASS 或 release_ready=true |

## 收尾判定

### 工程收尾

EC-01 至 EC-04 全部通过后，工程状态写为：

```text
architecture=CLOSED
local_technical_closure=CLOSED
latest_harness_candidate=PASS
final_internal_runtime=READY_FOR_STAGE0
```

### 内部试用收尾

EC-05 通过后，只能写为 `STAGE0_HARNESS_PASS`。它不改变正式 M2。

### 正式发布收尾

EC-06 的正式 M2 只有在公司供应链、发布授权、正式目标、activation、canary 和 rollback 的真实回执全部通过后，才能把 `release_ready` 改为 `true`。

## 停止规则

- EC-01 至 EC-04 过程中发现版本或 peer 冲突，先修隔离 candidate，不回头重跑旧 alpha4。
- 同一失败原因连续出现两次，停止重复执行，改为修复版本合同或验证器。
- 没有真实目标输入时记录 `NOT_RUN` 或 `INCONCLUSIVE`，不补写 PASS。
- 主仓 rc2 pin、正式 M2 状态和受保护 `security-audit-skill/` 不在本收尾任务中修改。
