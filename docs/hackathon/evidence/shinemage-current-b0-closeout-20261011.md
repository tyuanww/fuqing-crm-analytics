# 当前迁移字节的完整本地 B0（2026-10-11）

主仓分支 `codex/shinemage-abc-local-candidate`，HEAD `5390667cc990fa558b0445aa455b086d325a6c77`。本次检查覆盖当前 HEAD 加未提交迁移，不新增功能，不提交或执行远端动作。完整本地 r2 成功不是正式候选、真实业务或远端 CI 成功。

## 固定环境与准备

- Node `24.19.0`；DSH `0.1.7-rc.2`，上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。已有 TypeScript `6.0.3` / Vite `6.4.3` 和固定 build-tools 复用，未重编上游或声明新 SDK 安装。
- Corepack 在 `COREPACK_ENABLE_NETWORK=0` 下分别核对 upstream pnpm `11.7.0`、插件 pnpm `11.28.2`，均 exit 0。
- 系统 Python 是 `3.14.4`，但其 DuckDB `1.5.5` 不满足 B0 原锁 `1.5.6`。只在本次任务目录建立独立 Python `3.14.4`，从官方 PyPI 下载原锁精确 wheel、离线安装并核对 25 包；全局 Python 和原锁未改。该开发测试 wheelhouse 不是正式 service/platform 回执。
- CRM 两包/页面七包输入沿用既有正式包、profile 和摘要，每一轮使用新的独占 composition 输出根。声明 Cordis `4.0.2` 与实际 `4.0.4` 原样。

## 实际两轮

| 运行 | 实际结果 | 解释 |
|---|---|---|
| r1 完整命令 | exit 1 | 子阶段 `plugin-boundaries.mjs --check` exit 2，`BOUNDARY_INVENTORY_DRIFT`；失败原日志保留，没有将已完成局部项算全链成功 |
| 生成器同步 | exit 0 | 原 `plugin-boundaries.mjs --write` 更新当前机器清单，policy 未改；对应说明同步实际作者仓与计数 |
| r2 完整命令 | exit 0 | Python 855 PASS、41 subtests PASS；23 条警告保留。Node 23 个摘要组均 0 FAIL/0 cancelled，十次跳过逐组留存 |

实际命令为固定 Node 执行 `scripts/dsh-b0/pipeline.mjs --check --python <本次隔离python/bin/python3.14>`。当前整条 pipeline 的合同、Python、ruff、Node、host/client 严格类型检查、固定包消费者和干净重建均执行。Node 用例名称中的“rejects contradictory pytest: 1 passed, 1 failed/error/skipped”是成功的坏摘要单测名称，不是本次 Python 失败；机器摘要只采用实际独立 pytest 结果行。

跳过包括 shell/tool 三项 opt-in、两项固定包沙箱握手、saved-analysis 的三项固定服务输入专项、查询归档冷安装一项及 standalone 页面一项；十次执行的名称与理由在机器记录，不用它们替代此前独立证据或报实际运行。

干净重建复制 592 个源文件、3,681,365 字节，七个指定输出与原构建同字节。重建目录按 owning finally 回收；回执中的临时 isolated pack 明确 `fixture_only=true`，没有生成新的独立正式发布包或 candidate。

## 边界清单差异

[机器清单](../../architecture/shinemage-plugin-boundaries.json) 由原生成器更新，[说明](../../architecture/shinemage-plugin-boundaries.md) 与其同步。package/manifest、contracts、command owner、policy 和来源基线均未变；差异来自此前测试迁移的静态引用、动态导入及字面路由位置。

当前扫描 11 包、653 文件；27 跨包引用为 runtime 10 / build 11 / test 6。runtime 十条均为固定 board-components 的公开导出，生产源码例外仍为 0；仓库引用十七条、动态导入六十三条均为测试。198 个路径声明、128 种路径包含合成夹具，不是已连接 API 数量。说明中旧目标仓名已与实际九个作者仓区分，不修改机器 policy。

## 保存、清理与边界

原始目录 `/Users/hutou/.codex/tasks/shinemage-current-b0-20261011-e8663525/` 保存两轮日志/命令、Python wheel 摘要与闭包、Corepack 核对、清单原件/差异和 `build-evidence-r2.json`。旧 `build-evidence.json` 已先按原字节备份；当前派生入口由本轮 pipeline 更新，历史证据不重写。

两轮记录的自有父进程组均为空，临时 clean-build 目录已不存在；未生成逐个 HTTP 端口回执，不宣称全机进程/端口盘查。作者八文件、46 份封存保护输入与主仓继承产品字节均不改；上游 tracked clean。机器记录见[validation JSON](./shinemage-current-b0-closeout-20261011-validation.json)。

本次不是源码拒读的整条 B0：Workbench 源码构建、七个生产者及历史源码隔离阶段仍存在。此前单独消费者的源码拒读证据继续按原范围记账。完整本地 B0 通过不代表这些源码阶段已迁完或主仓副本可删除。

尚未关闭：新 hosted CI 的固定 artifact 定位/读取配置、Workbench 两笔待授权提交和新正式 pack、当前 candidate 的正式服务/目标/browser/回退、整体 Cordis 兼容、真实模型/CRM/WeKnora/UAT、独立版本分发/install/rollback、独立官方 DSH 升级与适用 SDK 门禁。没有 --audit、外部 LLM、commit、push、PR、合并、发布、部署、远端配置或目录清理授权动作。SDK 分发 BLOCKED，产品 PARTIAL，`release_ready=false`，VERSION `0.20.0.0`。
