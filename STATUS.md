# 项目状态（Project Status）

> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。历史 PASS、NOT_RUN 与版本只属于原验收对象，本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-10-12）

| 项 | 当前状态与证据 |
|---|---|
| 产品与固定底座 | VERSION `0.20.0.0`；DSH `0.1.7-rc.2` / upstream `477b4f42`，未改上游。产品 PARTIAL，`release_ready=false`；SDK 分发按适用门禁 BLOCKED。 |
| 公开主线 | PR #120 已普通 merge；远端 `main` 为 `e04caca7`，其[实际 main CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38167688143) SUCCESS。五个适用 job 成功，五个路径矩阵 job SKIPPED，具体结果见[合并后核验](docs/hackathon/evidence/shinemage-postmerge-pr120-20261012.md)。 |
| 本地交付与 PR | PR #119、#120 均已合并；本机仍在 `codex/shinemage-abc-local-candidate`，feature HEAD 为 `865cda89`，没有自动切到 main。合并提交、父提交、工件摘要和保留的 `security-audit-skill/` 见[合并后核验](docs/hackathon/evidence/shinemage-postmerge-pr120-20261012.md)。三个作者 PR #1 当前 head 为 Workbench `3030e3f`、CRM `dac0539`、Knowledge `f623c22`，正式包 CI 均成功，仍未合并。 |
| 独立作者仓 | 九个插件与 board-components 领域库分别维护源码、版本和 CI；完整看板在 analytics-workbench，shine-board 只是能力标记；合成知识服务不是真实 WeKnora。作者覆盖按[验证入口](docs/operating/verification.md)及固定作者证据锁记账。 |
| 当前包绑定 | Workbench `3030e3f` / `90000400…`、CRM `dac0539` / `4ee58ec3…`、Knowledge `f623c22` / `feb1187c…` 已写入组合锁，并由真实 PR CI 产出 `dsh-plugin-pack/v1` 回执；其余六包及两份现有 profile 不变。回执与 source_sha 是新身份，不继承旧 candidate/journal 或宿主验收。见[当前正式包 CI 收口](docs/hackathon/evidence/shinemage-formal-plugin-ci-20261012.md)。 |
| 当前正式包 CI | 三个作者仓的 full CI 均 SUCCESS：Workbench run `38204944592`、CRM `38204944092`、Knowledge `38205510926`；formal artifact 下载后由主仓 `readPluginPack` 复核，`source_dirty=false`、`activation=NOT_RUN`。Workbench 作者 core 为 155 files / 1086 PASS / 0 FAIL / 0 SKIP；browser/standalone 仍 `NOT_RUN_BY_THIS_COMMAND`。 |
| 主仓职责 | profile、公共合同、组合消费及 release 包装配使用固定正式包/公开合同/作者 CI 证据；backend、平台合同、静态边界、保留源码守卫和两组旧 Workbench 私有断言仍在主仓，旧 `dsh-plugins/` 不删。主仓是集成仓，尚不是只有 DSH 的仓库。 |
| 已完成验证 | PR #120 合并后的[实际 main CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38167688143) SUCCESS：12 JUnit／3315 testcase，0 failure／0 error／80 skipped；B0 862 PASS / 41 subtests PASS，23 warnings 保留。工件下载摘要与 API digest 一致，见[合并后核验](docs/hackathon/evidence/shinemage-postmerge-pr120-20261012-validation.json)。平台与历史数字不相加；当前两包既有三进程／18 项未连接宿主断言仍单列。 |
| 本次推送检查 | 正常 push 第三轮 exit 0，原后端／工具／B0 钩子通过；两轮失败留存。正向 host verifier 夹具只改精确 peer，五文件同次 68 PASS / 0 FAIL / 0 SKIP，核心与本机独立审查无发现，外部 Claude/OCR NOT_RUN。PR #120 六个适用 checks SUCCESS、五个路径未选 job SKIPPED；[rc2 preflight](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38162446076)成功，仅生成 head 绑定 CI 工件，不是 Release 或生产准入。 |
| 新 hosted CI 输入 | 私有暂存 `8f44bb64` 的[上传 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38160012202) SUCCESS。真实 artifact `11710265230`／704352 字节／digest `fbef740a…`，下载与原 receiver 核对 18 成员、九包／两 profile；三项非敏感变量已更新并回读，专用只读 Secret 已配置，值不入库。输入对应 PR #120 的新组合，旧 main CI 不抵扣；有效期至 `2026-10-25T17:31:36Z`，到期须核验新真实工件。 |
| 兼容门禁 | CRM/Knowledge 作者仓与本地主仓消费守卫均精确使用 Cordis `4.0.4`，拒绝旧 `4.0.2`、范围及其他 patch。当前正式两包经官方 CLI 在隔离 profile 注册，开启／卸载到原生壳／重装恢复三阶段 exit 0；实际 peer 为 dsh-tools `0.1.7-rc.2`、Cordis `4.0.4`。复用官方 npm 依赖的同字节副本，不是新冷安装或完整九包组合验收；此前启动与记录器失败保留。D/E 五仓无独立 tsc 沿用作者边界记录，本轮没有重验这五仓。见[本轮范围](docs/hackathon/evidence/shinemage-cordis-formal-cutover-proposal-20261012.md)。 |
| 真实验收 | 两份当前 profile 均无 `service_binding`；当前九包尚无相应新插件 candidate／服务／platform／terminal／browser／恢复链与正式 journal。真实模型／CRM／WeKnora／UAT、standalone 页面包和正式分发未关闭；旧回执不继承，见[当前输入缺口](docs/hackathon/evidence/shinemage-cordis-pr120-ci-delivery-20261012.md#当前准入缺口)。[2026-10-10 准入预检](docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)只保留当时对象和流程参考。 |
| 生产与清理 | 杭州 `current` 的带日期恢复/热补丁事实见[2026-10-09 现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)，本地候选未部署。11 份候选目录及三个远端分支已按授权清理，归档与摘要保留，见[清理记录](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 任务外内容 | `security-audit-skill/` 不纳入提交或清理；任务范围干净不等于整仓无未提交内容。92 份历史证据同字节保留。 |

## 本轮施工计划

1. PR #119 合并和实际 main CI 已完成。作者 peer 修复各自保留 fix 提交，两个作者 PR #1 仍开放，不自动合并。
2. 精确 Cordis 守卫、新正式包组合锁和两包未连接宿主验证已完成；三个作者仓现在有真实 `dsh-plugin-pack/v1` CI 产出，主仓锁已绑定当前 source/manifest 摘要。两笔原提交、祖先同步及追加夹具修复已交付 PR #120，新汇总 artifact 和 `bd96af9a` 的 CI／preflight 成功。本轮只接续文档，不重跑未变化的业务检查。
3. PR #120 已按普通 merge 合入 `e04caca7`，实际 main CI `38167688143` 已核对成功；合并后证据已归档。commit 前 /review、正常 push 钩子继续保留，不改 VERSION，不自动发布或部署。
4. 当前组合正式服务/目标/terminal/browser/恢复、真实 CRM/WeKnora/模型/UAT、standalone、SDK 分发和独立 DSH 升级沿原 stop/go 分别收尾，不扩展功能，不继承旧 candidate。

## 维护入口与边界

- 单插件日常更新见[插件更新指南](docs/operating/shinemage-plugin-update.md)；仓库职责、升级和清理见[维护手册](docs/operating/shinemage-maintenance-and-cleanup.md)，任务接续见[TODOS](docs/hackathon/TODOS.md#m1-核心交付)。插件变更不默认重建 DSH、迁移数据库或重复 SDK 全量审计。
- 本机用于开发、合成验证与 PR；杭州/6677、旧 CRM、真实业务 DuckDB、WeKnora 数据卷和凭据不在本轮操作范围。临时验证只回收本次拥有的实例。
- 历史候选、失败日志、原始包与截图保留；迁移各轮的数字、旧来源和未执行结论见[历史快照](docs/history/STATUS-HISTORY.md#shinemage-pr119-before-push-20261011)，不能当作当前准入或生产事实。
