# 精确 Cordis 正式包与主仓对接提案（2026-10-12）

下方提案及应用段保留验证时点：提案生成时未应用，应用／宿主验证时 HEAD 为 `1ca738f7` 且未提交。文末另列本地 Git 交付接续，原始提案回执不改写；Git/远端状态由 STATUS 和实际回执接续。

| 作者 | 来源提交 / push CI | 新正式回执 | 正式归档 / 字节 |
|---|---|---|---|
| CRM | `ceeff9965509a545cc1761091bca604b31c02285` / 38153846752 | `4be65420f929fface899fd48928dde4e444289bc428d46adeb3497a6bb5d9abc` | `5803819e9eb36bacd5b237eacff928133ff6eb361c1f111eedd3f1ecf60aeb05` / 234901 |
| Knowledge | `22daa108bcf72cc80af28156ba1f6601fcfc00dc` / 38153849607 | `1ce746b6593892f176fe7c259a8e3fbc52ca91ceb3e6a855a61589e43ce9ca49` | `870fdeeadc07bf7187d475ba4a77fe0d417b915a72473b8712c004f7079b4090` / 14476 |

两个作者 PR #1 的新 push/PR CI 均 SUCCESS。Knowledge PR CI 使用 GitHub 合并测试提交，正式来源绑定采用直接 checkout `22daa108` 的 push CI。实际 ZIP 摘要、下载字节、源 manifest 和 CI 成员均已核对。两次真实 clone 为精确提交、无 alternates、工作区干净；只物化 CI 的忽略 lib，未重新安装或编译 SDK。

原 producer/reader 来自合并 main `5943d4be` 的 8 个实际 Git blob，未改打包器。正式 manifest 沿用 pnpm 内容打包时对 packageManager 的规范化，再由原 producer 移除 scripts；运行成员与新 CI 内容包同字节。CRM 普通包自动包含的 README 没有在 manifest.files 声明，因此正式包按既有边界保留 5 成员；Knowledge 正式包为 4 成员。两包 pack/readback exit 0，输出复用各 exit 2 / PLUGIN_PACK_OUTPUT_EXISTS，首次字节未变。拒主仓内容、九个原作者目录和网络的策略下 12 项负对照均 EPERM；不是整机不可读。

提案的 8 个代码/锁路径只改精确 Cordis 守卫及其反例，并更新组合锁的 CRM/Knowledge source_sha/正式回执摘要。旧 4.0.2、范围和其他 patch 均拒绝；另七包、两份 profile、Workbench 作者证据锁和上游 pin 原字节保留。隔离当前 snapshot 的四文件 42 PASS / 0 FAIL / 0 SKIP，九包/两 profile 实际准备 exit 0，输出复用 EEXIST，主仓 apply --check exit 0。没有应用或提交主仓，没有新组合 hosted CI。

主仓 PR #119 已普通 merge 到 `5943d4be`，实际 main CI `38151751342` SUCCESS；它覆盖合并时的旧守卫/锁，不能抵扣本提案新字节。合并前 QA 139 Node / 107 Node / 131 Python 按三个影响组单列；main 后端 3235 PASS / 80 SKIP、B0 Python 862 PASS / 41 subtests 分别记账，不汇总。

原始正式包、负对照、命令、stderr 与执行 JSON 位于 `/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x`；[完整提案清单](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/main-local-cutover-plan-complete-r2.json)、[两包实测](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/formal-pack-validation-r1.json)、[九包准备](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/nine-pack-preparation-r1.json)。作者提交与 CI 原始材料位于 `/Users/hutou/.codex/tasks/shinemage-cordis-local-apply-20261011-zlui2vav`。

新正式包不继承旧 candidate/journal、headed 或 WSL。普通 npm 同字节宿主结果只单列复用，不是新正式包组合启动。本次没有服务/目标/浏览器/模型/真实业务验收；不改主仓远端变量、peer 范围、VERSION，不 commit/push/merge/发布/部署。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false。

机器摘要：[shinemage-cordis-formal-cutover-proposal-20261012-validation.json](shinemage-cordis-formal-cutover-proposal-20261012-validation.json)。

## 授权本地应用与当前正式包宿主验证

用户授权的 13 路径完整 r2 补丁已一次应用到实际主仓 `codex/shinemage-abc-local-candidate` / `1ca738f7`，没有叠加旧补丁。实际主仓四文件 42 PASS / 0 FAIL / 0 SKIP；九包／两 profile 准备 exit 0，重复输出 exit 1 / EEXIST，首次内容未变；19 项主仓插件／领域源码及原作者目录负对照 EPERM。其余七包、两 profile、三份作者／合同锁、上游 pin 与 VERSION 均未改，暂存区为空。原始记录：[实际主仓应用](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/main-application-r1/application-validation-r1.json)。

另对上表两份当前正式 pack 实跑官方 npm 宿主：Node `24.19.0`、DSH/dsh-tools `0.1.7-rc.2`、Cordis `4.0.4`。运行依赖是既有严格 npm 安装的同字节副本，剔除旧插件；26544 个文件／符号链接前后核对一致，不是新 npm 冷安装。正式包解包根通过官方 CLI 在新隔离 profile 注册，保留 `--strict-peer-dependencies`、禁网离线输入和生命周期脚本禁用。实际 resolver 对两包均返回固定 dsh-tools 与 Cordis，未改上游或手工接入 SDK symlink。

成功轮 r7：开启、通过官方 CLI 卸载回到原生壳、重新注册恢复，共三进程、18 项断言，exit 0。原生鉴权、CRM/Knowledge preset 的未运行合成会话、CRM 未配置服务的明确未连接状态、原生回退保留会话且 CRM 路由 404、恢复后路由 200 和 preset 可创建均核对。七项主仓／作者／旧安装包／合成凭据夹具负对照 EPERM，网络只放行 localhost；仅终止本次三个实例，结束后 4328 空闲。正式 receipt、tarball、全部运行成员和原 npm lock 未变。命令与摘要见[宿主收尾](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/current-formal-host-r1/closeout-r7.json)、[原始宿主结果](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/current-formal-host-r1/host-result-r7.json)、[resolver 绑定](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/current-formal-host-r1/diagnose-import-r7.json)。18 不与主仓 42、作者 CI 或旧宿主结果相加。

此前失败全部保留在同一证据目录：未注册的任意解包目录不能解析 peer，r1/r2 preset 未启动；CLI r3 使用 pnpm 不接受的配置参数；CLI r4 被旧普通安装的同名插件遮蔽，EPERM 负对照暴露了错误来源；r5 的 remove 参数不受 pnpm 支持；r6 官方卸载成功，但记录器没有处理省略的空 dependencies 字段。这些失败没有改成 PASS；改用隔离依赖副本、官方注册与正确 CLI 参数，并修复记录器后得到独立的 r7。

本轮只完成本地兼容与未连接宿主恢复，不抵扣当前完整组合的正式服务／目标／terminal/browser／恢复链、真实模型／CRM／WeKnora／UAT、standalone 或 SDK 分发。没有新 candidate/journal、完整 B0、新主仓 hosted CI、远端变量变更，也没有 commit、push、PR、merge、发布或部署；任务外 `security-audit-skill/` 保留。新私有汇总工件的五路径提案已准备，尚未交付，不能让旧 artifact 代表新组合。产品 PARTIAL、SDK 分发 BLOCKED、release_ready=false。

## 本地 Git 交付接续（2026-10-12）

上述“未提交”保留验证捕获时的事实。随后用户授权两笔本地提交：8 个代码／组合锁路径已提交为 `2b98baaac876973e1b9f3758fe8e3fc0fe69a5aa`，信息为 `fix(composition): align exact Cordis peer with verified author packs`，正常 pre-commit 与 commit-msg 钩子通过，提交字节与原 8 路径审查清单一致。5 份当前说明／证据在后续独立 `docs: record Cordis cutover and formal host validation` 提交交付，不写入自身未知 SHA。

本轮 `/review` 的主 Agent 与同宿主原生对抗审查无开放发现；外部 Claude/OCR 未执行。文件阶段与 Git 事实的文档接续另作检查，运行包、测试、正式回执与验证输入未改变，因此不重复已通过的代码／宿主验证。[代码提交原始记录](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/git-delivery-r1/code-commit-execution.json)保留实际提交路径与退出码。主仓仍未推送，没有新的 PR、汇总 artifact、远端变量配置或新 hosted CI；candidate/journal、PARTIAL、SDK 分发 BLOCKED、release_ready=false 不变。
