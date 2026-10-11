# 项目状态（Project Status）

> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。历史 PASS、NOT_RUN 与版本只属于原验收对象，本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-10-11）

| 项 | 当前状态与证据 |
|---|---|
| 产品与固定底座 | VERSION `0.20.0.0`；DSH `0.1.7-rc.2` / upstream `477b4f42`，未改上游。产品 PARTIAL，`release_ready=false`；SDK 分发按适用门禁 BLOCKED。 |
| 公开主线 | PR #111–#118 已合并；远端 `main` 为 `4859d136`，其 CI 见[post-merge r4](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)，不抵扣本次新提交检查。 |
| 本地交付与 PR | 15 笔分组交付及追加修复均已推送到 [PR #119](https://github.com/tyuanww/fuqing-crm-analytics/pull/119)；结果提交争用修复 `de196938`，main `4859d136` 已以 `3cee76f0` 合入 feature，文件树未变。PR OPEN，未合并；最新文档 SHA 看 `git log -1`。见[本轮交付](docs/hackathon/evidence/shinemage-main-pr119-delivery-20261011.md)。 |
| 独立作者仓 | 九个插件与 board-components 领域库分别维护源码、版本和 CI；完整看板在 analytics-workbench，shine-board 只是能力标记；合成知识服务不是真实 WeKnora。作者覆盖按[验证入口](docs/operating/verification.md)及固定作者证据锁记账。 |
| 当前包绑定 | Workbench source `6c5adc9f` / 正式回执 `0af61dab…`、CRM `c4b1c91e` / `4663cce0…`；九包与两份现有 profile 的准备已通过，不继承旧 candidate/journal 或宿主验收。 |
| 主仓职责 | profile、公共合同、组合消费及 release 包装配使用固定正式包/公开合同/作者 CI 证据；backend、平台合同、静态边界、保留源码守卫和两组旧 Workbench 私有断言仍在主仓，旧 `dsh-plugins/` 不删。主仓是集成仓，尚不是只有 DSH 的仓库。 |
| 已完成验证 | `f1f1d500` 正常 hooks：完整后端 3237 PASS / 78 SKIP / 0 FAIL、12 JUnit 无重复；前端 build / 29 文件 / 223 单测、完整主仓 B0 exit 0。SIGKILL 故障注入测试 71 PASS 单列；作者 core 归固定作者 CI，OCR 增量逐字节审查，无外部 LLM。 |
| 本次推送检查 | `4c28df71` 诊断与 `f1f1d500` 测试修正已正常推送，exit 0，无 hook 绕过；缺输入目录及先前失败保留。`f861a895` 已本地修复 gh 状态写入 checkout，定向 59 PASS；最新 head 的 CI/preflight 看 [PR #119 checks](https://github.com/tyuanww/fuqing-crm-analytics/pull/119/checks)，不写为发布通过。 |
| 新 hosted CI 输入 | 专用 read Secret 已配置，真实四类私有 receiver 均 PASS；`fc46b243` 主 CI attempt 2 SUCCESS。`f1f1d500` preflight 因 `.local/state/gh/device-id` FAIL，根因与 `f861a895` 修复见[本次接续](docs/hackathon/evidence/shinemage-pr119-ci-secret-reconnect-20261011.md)。原 artifact/三变量不变，工件 10 月 25 日到期。 |
| 兼容门禁 | CRM/Knowledge 的精确 Cordis peer `4.0.2` 与固定运行输入 `4.0.4` 仍待 owner 校准；隔离提案见[证据](docs/hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。不改 peer，不用构建通过抵扣兼容。D/E 五仓无独立 tsc。 |
| 真实验收 | 当前组合的正式服务/目标/terminal/browser/恢复、真实模型/CRM/WeKnora/UAT、standalone 页面包和正式分发仍按各自材料保持未关闭；旧 WSL/宿主结果不继承，见[准入预检](docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)。 |
| 生产与清理 | 杭州 `current` 的带日期恢复/热补丁事实见[2026-10-09 现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)，本地候选未部署。11 份候选目录及三个远端分支已按授权清理，归档与摘要保留，见[清理记录](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 任务外内容 | `security-audit-skill/` 不纳入提交或清理；任务范围干净不等于整仓无未提交内容。92 份历史证据同字节保留。 |

## 本轮施工计划

1. 已完成本轮源码、正常推送和祖先同步；以[最新交付](docs/hackathon/evidence/shinemage-main-pr119-delivery-20261011.md)及实际 PR head 核对 CI，历史失败与逐组提交保留。
2. Secret 与四类私有输入已接通；核对追加 CLI 状态修复的新 head CI/preflight，以真实结果关闭对应子项，不重复索要已配置的凭据，不跳过门禁。
3. PR 审查和适用验证完成后，按单独合并授权走 `/qa` 与实际远端门禁；不先在本地把 feature 合进 main，不自动发布或部署。
4. peer 校准、当前组合准入、真实业务/WeKnora/模型、SDK 正式分发和独立 DSH 升级沿原 stop/go 分别收尾，不扩展功能。

## 维护入口与边界

- 单插件日常更新见[插件更新指南](docs/operating/shinemage-plugin-update.md)；仓库职责、升级和清理见[维护手册](docs/operating/shinemage-maintenance-and-cleanup.md)，任务接续见[TODOS](docs/hackathon/TODOS.md#m1-核心交付)。插件变更不默认重建 DSH、迁移数据库或重复 SDK 全量审计。
- 本机用于开发、合成验证与 PR；杭州/6677、旧 CRM、真实业务 DuckDB、WeKnora 数据卷和凭据不在本轮操作范围。临时验证只回收本次拥有的实例。
- 历史候选、失败日志、原始包与截图保留；迁移各轮的数字、旧来源和未执行结论见[历史快照](docs/history/STATUS-HISTORY.md#shinemage-pr119-before-push-20261011)，不能当作当前准入或生产事实。
