# 项目状态（Project Status）

> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。历史 PASS、NOT_RUN 与版本只属于原验收对象，本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-10-12）

| 项 | 当前状态与证据 |
|---|---|
| 产品与固定底座 | VERSION `0.20.0.0`；DSH `0.1.7-rc.2` / upstream `477b4f42`，未改上游。产品 PARTIAL，`release_ready=false`；SDK 分发按适用门禁 BLOCKED。 |
| 公开主线 | PR #119 已普通 merge；远端 `main` 为 `5943d4be`，其[实际 main CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38151751342) SUCCESS。该 CI 覆盖合并时的旧组合绑定，不覆盖本次 Cordis 对接增量。 |
| 本地交付与 PR | PR #119 已合并。本机仍在 `codex/shinemage-abc-local-candidate`；本轮主仓代码／组合锁已本地提交为 `2b98baaa`（8 路径），5 份说明／证据随独立 docs 提交交付。当前 HEAD 以实际 Git 为准，本地未推送，不将本地 HEAD 当成 main。CRM `ceeff996`、Knowledge `22daa108` 各一笔 fix 已推送，两个作者 PR #1 的 push/PR CI 均成功，PR 尚未合并。 |
| 独立作者仓 | 九个插件与 board-components 领域库分别维护源码、版本和 CI；完整看板在 analytics-workbench，shine-board 只是能力标记；合成知识服务不是真实 WeKnora。作者覆盖按[验证入口](docs/operating/verification.md)及固定作者证据锁记账。 |
| 当前包绑定 | CRM `ceeff996` / `4be65420…`、Knowledge `22daa108` / `1ce746b6…` 对应真实新 CI 的正式回执。其余七包（含 Workbench `6c5adc9f` / `0af61dab…`）及两份现有 profile 不变；回执与 source_sha 是新身份，不继承旧 candidate/journal 或宿主验收。见[输入与隔离实测](docs/hackathon/evidence/shinemage-cordis-formal-cutover-proposal-20261012.md)。 |
| 主仓职责 | profile、公共合同、组合消费及 release 包装配使用固定正式包/公开合同/作者 CI 证据；backend、平台合同、静态边界、保留源码守卫和两组旧 Workbench 私有断言仍在主仓，旧 `dsh-plugins/` 不删。主仓是集成仓，尚不是只有 DSH 的仓库。 |
| 已完成验证 | 合并 main 的实际 CI：后端 3235 PASS / 80 SKIP / 0 FAIL / 0 ERROR，12 JUnit 无重复；B0 Python 862 PASS / 41 subtests PASS，23 warnings 保留。本次授权应用后，实际主仓四文件 42 PASS / 0 FAIL / 0 SKIP、九包/两 profile 准备 exit 0，19 项指定源码负对照 EPERM。当前正式 CRM/Knowledge 两包另完成三进程、18 项宿主断言；各层分别记账，不相加。 |
| 本次推送检查 | 主仓 PR #119 的 head `1ca738f7` 经适用 QA 后合并，main CI 已成功；历史 gh 状态、测试模拟值扫描失败及修复保留。本轮主仓守卫／锁增量已本地提交为 `2b98baaa`，未推送或运行新 hosted CI，不用上述绿色结果替代其检查。 |
| 新 hosted CI 输入 | 专用 read Secret 与四类私有 receiver 已接通，不重复配置凭据。主仓 artifact `11704150412` 仍对应旧组合；本次新正式 CRM/Knowledge 包尚未上传到主仓接收用汇总 artifact，三项非敏感变量未变。新组合远端 CI 前必须真实上传、核验新 ID/digest，再按授权更新变量；既有工件 10 月 25 日到期。 |
| 兼容门禁 | CRM/Knowledge 作者仓与本地主仓消费守卫均精确使用 Cordis `4.0.4`，拒绝旧 `4.0.2`、范围及其他 patch。当前正式两包经官方 CLI 在隔离 profile 注册，开启／卸载到原生壳／重装恢复三阶段 exit 0；实际 peer 为 dsh-tools `0.1.7-rc.2`、Cordis `4.0.4`。复用官方 npm 依赖的同字节副本，不是新冷安装或完整九包组合验收；此前启动与记录器失败保留。D/E 五仓无独立 tsc。见[本轮范围](docs/hackathon/evidence/shinemage-cordis-formal-cutover-proposal-20261012.md)。 |
| 真实验收 | 当前组合的正式服务/目标/terminal/browser/恢复、真实模型/CRM/WeKnora/UAT、standalone 页面包和正式分发仍按各自材料保持未关闭；旧 WSL/宿主结果不继承，见[准入预检](docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)。 |
| 生产与清理 | 杭州 `current` 的带日期恢复/热补丁事实见[2026-10-09 现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)，本地候选未部署。11 份候选目录及三个远端分支已按授权清理，归档与摘要保留，见[清理记录](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 任务外内容 | `security-audit-skill/` 不纳入提交或清理；任务范围干净不等于整仓无未提交内容。92 份历史证据同字节保留。 |

## 本轮施工计划

1. PR #119 合并和实际 main CI 已完成。作者 peer 修复各自保留 fix 提交，两个作者 PR #1 仍开放，不自动合并。
2. 本轮 13 路径已按授权在主仓本地应用；精确 Cordis 守卫、新正式包组合锁、主仓定向验证和两包宿主兼容验证已完成。8 个代码／锁路径已提交为 `2b98baaa`，5 份说明／证据单独 docs 提交；未推送，新汇总 artifact 和对应 hosted CI 尚未交付。
3. 主仓 Git 交付仍按 commit 前 /review、获 push 授权后真实 CI、获 merge 授权后 /qa 的顺序，不改 VERSION，不自动发布或部署。
4. 当前组合正式服务/目标/terminal/browser/恢复、真实 CRM/WeKnora/模型/UAT、standalone、SDK 分发和独立 DSH 升级沿原 stop/go 分别收尾，不扩展功能，不继承旧 candidate。

## 维护入口与边界

- 单插件日常更新见[插件更新指南](docs/operating/shinemage-plugin-update.md)；仓库职责、升级和清理见[维护手册](docs/operating/shinemage-maintenance-and-cleanup.md)，任务接续见[TODOS](docs/hackathon/TODOS.md#m1-核心交付)。插件变更不默认重建 DSH、迁移数据库或重复 SDK 全量审计。
- 本机用于开发、合成验证与 PR；杭州/6677、旧 CRM、真实业务 DuckDB、WeKnora 数据卷和凭据不在本轮操作范围。临时验证只回收本次拥有的实例。
- 历史候选、失败日志、原始包与截图保留；迁移各轮的数字、旧来源和未执行结论见[历史快照](docs/history/STATUS-HISTORY.md#shinemage-pr119-before-push-20261011)，不能当作当前准入或生产事实。
