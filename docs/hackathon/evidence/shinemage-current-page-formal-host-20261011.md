# 当前正式七包在官方 npm 宿主的加载与进程回退（2026-10-11）

本轮使用新 Workbench 正式包 `e41df9f5…` 和现有六个 leaf 正式包，通过官方 `@deepseek-ai/dsh@0.1.7-rc.2` npm 安装的 CLI，在独占 home/workspace 验证加载、原生关闭及恢复。r2 三个进程均通过；这属于 macOS 宿主与合成会话层，固定服务、WSL2、浏览器、真实模型/业务和正式 candidate/journal 准入仍未执行。

主仓 `HEAD` 为 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。产品源码、组合锁、包回执和作者仓均未因本轮改变；本地仅补证据与五份当前说明，没有新 commit、push、PR、合并、发布或部署。

## 同一份包及安装入口

- Workbench 源码提交：`fd46b34d04ddf143811fd1eba7ef2ff6c3ca230b`。
- 正式 tarball：`e41df9f5a8f7031c092319222543c8d723ca644c0c9d69b2ae53f13257e9b79e`，438499 字节，8 成员。
- 回执：`a9463faa7c3299cc5d24179708dc7c5ae5ecf0f124ce97dfa904145398b65910`。
- 主仓组合锁：`598b62ea0ae00c2f57474c8666e2787202658b57488612cb1d1ea4c40edd571b`；page 输入：`19cfda92f0f755a352924f630cfa0d0e2c85d0bcd6a076c40379a245c15ef5d0`。
- 固定 Node 24.19.0、Python 3.14.4、pnpm 11.28.2。官方 CLI 来自已安装的 npm 固定包，运行不读固定上游 checkout、主仓或九个作者仓。

真实 `loadProfilePacks` / `installProfilePacks` 校验并安全解出七份正式包；随后逐包运行 `node <官方 npm dsh/lib/bin.js> plugin --profile web add <已验证解包目录> --offline --ignore-scripts`。七条命令 exit 0，官方配置生成 exit 0。没有手工补运行 peer 链接，没有修改包内 manifest；安装使用本地目录，因此属于官方管理器的 link 安装路径，不能当作普通 npm tarball 安装或发布证明。

官方 npm 安装根原有修订 CRM/Knowledge 包，但本轮 web profile 只选 Workbench、brand、waterfall、crowd-action、query、board、funnel 七包，没有挂载 CRM/Knowledge，也没有操作真实 WeKnora。原 npm 安装根和锁只读且字节未变。

## 实际启动与恢复

| 阶段 | 实际进程 | 七行状态 | 原生鉴权与会话 | 私有 bridge |
| --- | --- | --- | --- | --- |
| enabled | PID 21169，exit 0 | 全部启用，无导入失败 | 无 cookie 401，有 cookie 200；创建并重命名合成会话 | 已挂载，未鉴权 401，有本轮 token 200 |
| native | PID 21178，exit 0 | 全部 disabled，无导入失败 | 同一会话及标题保留，seq 3 | 端口空闲 |
| restored | PID 21180，exit 0 | 全部重新启用，无导入失败 | 同一会话及标题保留，seq 3 | 重新挂载，鉴权仍有效 |

三个阶段是三个独立进程；没有做任意插件无重启热插拔。只调用 workspace/create、session/create、session/rename、session/list、session/projections 元数据 RPC；会话 running=false，没有 Agent prompt 请求或真实模型调用。

bridge 使用既有显式能力合同：本轮合成 session ID、内存中随机生成且长度充分的 runtime token、允许的 `B0_PORT_BASE=4325`；token 仅以 SHA-256 记入结果。没有设置 `DSH_ANALYTICS_UI_ONLY` 来跳过 bridge。bridge `/health` 返回 200 且 ready=false，表示没有已就绪业务 Agent，不能写成服务准入通过。

运行策略仅允许 localhost 网络，并拒读完整主仓和九个原作者仓；10 个实际负对照 EPERM。工具/helper 是运行前逐字节绑定的既有验证入口副本，npm runtime 固定安装闭包可读，因此这不是整机 deny-default。HOME 保持真实默认值，DSH_HOME、DSH_AGENTS_HOME 和 TMPDIR 指向本轮独占目录；个人 .dsh/.ssh/.aws/.config 拒读，没有读取个人凭据。

## 失败、包完整性及清理

r1 官方安装和配置生成通过，但实际启动遗漏 session/runtime capability。包明确报 `B0 bridge requires explicit isolated capabilities`，故 `HOST_PLUGIN_ACTIVATION_FAILED`，exit 1；ready URL 未被当成插件验收。失败结果、boot 日志、首份 home/workspace 均保留。

r2 在新的 home/workspace 按现有合同补齐能力输入后通过。七包共 38 个运行/资产成员在安装及三次启动后与封存 tarball 逐字节相同，manifest 未改。三个自有 PID 已不存在，4326/4328 均无监听，自有退出码均 0。原 npm runtime 的 6 个绑定文件、旧 candidate/journal 等 46 个受保护文件未变。

## 仍需收口

本轮不生成 candidate、不写 journal，不抵扣 service pair、目标平台回执、WSL2、headed browser、真实模型/CRM/WeKnora/UAT 或 live reload。原正式 pack 回执中的 activation=NOT_RUN 保留为生产时点事实；这次独立宿主结果以同一 tarball 摘要另外关联。

40 路径扩大作者测试提案和 Cordis owner 修订仍待实际授权；主仓源码阶段未切走。SDK 分发 BLOCKED，VERSION 0.20.0.0，产品 PARTIAL，release_ready=false。

## 证据

原始目录：`/Users/hutou/.codex/tasks/shinemage-current-page-pack-host-20261011-sse_49o0`；实际命令和外层退出码在 `execution-r1.json` / `execution-r2.json`，子安装命令在 `install-result-r2.json`，启动命令与会话记录在 `host-result-r2.json`，完整性与清理在 `integrity-cleanup-r1.json`。共有 67 个原始文件逐项摘要绑定；失败不覆盖。

机器索引：[当前正式七包 npm 宿主 validation](shinemage-current-page-formal-host-20261011-validation.json)。原始汇总：[summary-r1.json](/Users/hutou/.codex/tasks/shinemage-current-page-pack-host-20261011-sse_49o0/summary-r1.json)。正式包来源和组合锁：[前轮正式包记录](shinemage-workbench-current-formal-pack-20261011.md)。维护入口：[验证](../../operating/verification.md)、[单插件更新](../../operating/shinemage-plugin-update.md)、[架构](../../architecture/shinemage-plugin-platform.md)。
