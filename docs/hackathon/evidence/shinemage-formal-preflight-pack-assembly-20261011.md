# ShineMage 正式 preflight 固定包装配接续（2026-10-11）

本轮只关闭正式 preflight/release 的业务插件源码装配子项：主仓按固定正式包生成独占 payload，并在接收验证中核对运行文件与原归档字节。当前七包实际装配通过，但没有执行整条正式 preflight、生成完整应用 artifact、candidate/journal 或启动宿主/服务/模型。产品仍 PARTIAL，SDK 分发仍 BLOCKED，release_ready=false。

主仓是本机当前成果目录，HEAD 为 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。起点为 HEAD 加 `snapshot-r1.json` 中的 127 项继承修改；本轮产品增量 10 路径，当前说明 5 份和本证据对另记。没有切换、reset、stash、提交、推送、创建 PR、合并、发布或部署。VERSION 保持 `0.20.0.0`。

机器摘要：[validation JSON](shinemage-formal-preflight-pack-assembly-20261011-validation.json)。原始目录：[本轮记录](</Users/hutou/.codex/tasks/shinemage-formal-pack-assembly-r2-20261011-ef2gl0wm>)；本轮仅可应用产品增量为 [product-delta-r1.patch](</Users/hutou/.codex/tasks/shinemage-formal-pack-assembly-r2-20261011-ef2gl0wm/product-delta-r1.patch>)，SHA-256 `74c62bbd5220cee34c2a1d74116e25a6ada24cdf33519c99573a03ecc8b9a6b1`，42,523 字节。临时起始文件上 `git apply --check` exit 0，不包含继承的其余修改。

## 实现与受影响合同

- `readiness.mjs` 验证逻辑 profile 与强制 `DSH_PROFILE_PACK_INPUTS`；不再要求主仓各插件的 build.mjs。profile 内容、digest、顺序、包名、source SHA、正式 manifest 和归档摘要必须通过既有严格读取器。
- `preflight.mjs` 移除所选业务插件及 board-components 的现场构建。历史 `build` stage 名保留以兼容 preflight/v2，实际只复核固定包，并在进入 release 时绑定同一输入摘要。prepare/audit/runtime 仍属于整套 DSH 的既有门禁。
- 新 `release-profile-packs.mjs` 先从 allowlist 排除整个旧业务插件源码，再保留开发 kit 和主仓既有交付内容。固定包只解到自有临时目录，按正式 receipt.entries 复制到 profile 原运行路径；不构建、安装 peer 或激活。
- 原正式 manifest 与 tarball 留存在 `config/shinemage-release-packs/<index>/`；`shinemage-release-pack-inputs.json` 记录 profile 和各包绑定。新 release manifest 的可选 `profile_pack_snapshot` 绑定这个账本，接收端核对所选运行目录的精确成员和每一文件字节。历史无此字段的 manifest 保持原验证合同，不改历史证据。
- allowlist 收集器在检查 entry 前跳过范围外的源码别名；范围内 symlink 仍拒绝。缺输入、不同 profile、归档漂移、跨阶段输入更换、运行字节替换、额外文件、symlink 和旧输出目录均有失败覆盖。
- 工作流明确传入准备好的 page 包输入。两份单插件输入锁不再单独触发完整 DSH preflight；共享路径选择器仍为它们选择适用 B0。release/helper/kit 等相关代码变动仍按既有工作流检查。
- pipeline 只把新守卫测试登记到既有 Node 组。本轮没有改九个作者仓、peer、官方 DSH 上游、SDK 检查器或 candidate/journal。

10 个产品路径的原始/当前字节见 [增量清单](</Users/hutou/.codex/tasks/shinemage-formal-pack-assembly-r2-20261011-ef2gl0wm/product-delta-files-r1.json>)。主 Agent 读取实际源码、调用方、前后差异和原始输入后记录 [本地审查](</Users/hutou/.codex/tasks/shinemage-formal-pack-assembly-r2-20261011-ef2gl0wm/local-review-r1.json>)；没有未解决发现。本轮外部模型/OCR delegate 为 NOT_RUN，不能称外审通过。

## 当前七包实际装配

输入为前轮已准备的 `canonical-composition-r1/page-inputs.json`，不是从主仓重打包：

| 输入 | SHA-256 |
|---|---|
| profile-pack 输入 | `66af13c06ab9241e531a87f4b3d410859676ceb4233fe9a6bbfb0fafce42a888` |
| 所选 profile | `c8c9df8c36f11060ad8fbcce68cb2ebf28d783c5eb5759d1b71ff5463782c981` |
| 新 payload 包账本 | `45b2f8905dca70d6bd3f5bf3ce7257a724ca37a57d3cdfde17b51137f483ef12` |

Workbench 来源仍是 `d038f3577efec91e75fcf711a60b1fb868d7bcd5`，正式回执 `9d7f6bf3…`，tarball `e41df9f5…`；其他六个所选包未改。全部来源/manifest/tarball 身份在 [实际装配 JSON](</Users/hutou/.codex/tasks/shinemage-formal-pack-assembly-r2-20261011-ef2gl0wm/actual-assembly-r2.json>) 中逐包保存。CRM/Knowledge 不属于这个七包 profile；其原 peer `4.0.2`、隔离 `4.0.4` 提案与严格安装缺口不因本次结果关闭。

r2 沙箱拒读九个主仓业务插件目录、九个原作者仓、固定上游和 build-tools，拒绝网络及主仓写入；20 个负对照均 EPERM。这是列明路径的拒读策略，不是整机 deny-default。实际运行退出码 0，生成 1,461 个文件、28,146,002 字节的本地装配 payload；所选七包运行文件与各自原归档一致，复用输出被 EEXIST 拒绝。装配快照包含执行时的主仓交付文件；本轮当前说明随后更新，没有把此目录称为正式应用 release。没有宿主、浏览器、服务、WSL2、模型、真实业务或生产执行。

## 实际命令与结果

固定 Node `24.19.0`、Python `3.14.4`；未升级全局环境，不关闭 TLS。所有计数按各自执行记账，不相加。

| 命令/层级 | 退出码 | 结果与范围 |
|---|---:|---|
| 五文件定向 release 守卫 r3 | 0 | 90 PASS / 0 FAIL / 0 SKIP |
| `node scripts/dsh.mjs test` | 0 | release 测试入口 539 PASS / 0 FAIL / 0 SKIP；合成打包、实际接收及坏输入合同 |
| 最后 workflow 触发修订的 release.test | 0 | 41 PASS / 0 FAIL / 0 SKIP；没有把 539 宣称为该修订后重跑 |
| Python 三文件路径/runner/workflow r2，`--noconftest` | 0 | 82 PASS；无关 backend conftest 不参与这些脚本检查 |
| 当前七包源码拒读实际装配 r2 | 0 | PACK_BYTES_VERIFIED，20 EPERM，复用 EEXIST；activation NOT_RUN |
| 实际 `preflight --check` | 2 | plugin-packs PASS；整体 BLOCKED_DIRTY_AND_RUNTIME_MISSING，无 prepare/build/network 和输出目录 |
| `plugin-boundaries.mjs --check` | 0 | 既有生成器检查：11 packages / 27 edges / 653 source files / 63 dynamic imports；未再生成或改 policy |
| 10 路径语法、JSON、差异和补丁适用性 | 0 | 本地检查；结果见最终保留性记录 |

整条正式 preflight、本轮最新完整 B0 和新 hosted CI 均 NOT_RUN。前轮 B0 r3 的 855 PASS / 41 subtests 与 Node 24 组，只属于[前轮实际字节](shinemage-workbench-core-formal-main-ownership-20261011.md)；旧包宿主/WSL2 与 journal 回执不重标到新身份。

保留失败：首轮单位测试的 collector 越界检查已修复，保存的是输出尾部而非完整 stdout；首轮沙箱用 Unicode 转义路径，负对照没有拒读，未产生 payload，不作为隔离通过。Python r1 因无关 backend conftest 缺 duckdb 而收集失败，随后使用本组既有独立检查方式 `--noconftest`，未安装 duckdb 或访问数据。

## 保留与下一步

[最终核对脚本](</Users/hutou/.codex/tasks/shinemage-formal-pack-assembly-r2-20261011-ef2gl0wm/final-preservation-r1.py>) 和其输出记录检查：119 个未触及继承文件、46 个旧受保护文件、6 份 npm runtime 文件、55 个前轮原始绑定均保持；九个作者仓仍为各自同一 HEAD 且干净，三份原主仓业务断言同字节。五份当前说明保留旧记录的原行；链接、产品摘要、Git HEAD/分支、空暂存区和 VERSION 另行核对。

仍待既有收尾：
1. installed-kit 多插件源码夹具、board-components 生产者、历史四插件隔离及缺输入守卫；三份主仓业务检查仍有旧 Workbench 路径，不提前删除旧副本。
2. 主仓这批变更的审查与分事件 Git 交付、新 CI；正式 preflight 还需干净已审提交和固定 runtime bundle。远端固定包定位/专用读取配置与持久分发按实际输入和授权执行。
3. CRM/Knowledge owner 合同校准和干净新来源/包，以及当前 candidate 的服务、目标、browser、回退和真实模型/CRM/WeKnora/UAT 输入。
4. PR 合并、独立版本发布与 DSH 升级按各自动作授权；本轮没有新合并/发布/部署。SDK 分发 BLOCKED 只约束分发和适用准入，不妨碍已完成的普通插件包装配。

操作入口：[固定包 preflight/release 输入](../../operating/shinemage-plugin-update.md#正式-preflight-与-release-的固定包输入)、[当前验证](../../operating/verification.md)、[架构](../../architecture/shinemage-plugin-platform.md)、[STATUS](../../../STATUS.md)。不勾完 T5/T15/T19/T21，不改 release_ready 或 VERSION。
