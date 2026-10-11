# 项目状态（Project Status）

> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。历史 PASS、NOT_RUN 与版本只属于原验收对象，本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-10-11）

| 项 | 当前状态与证据 |
|---|---|
| 产品与固定底座 | VERSION `0.20.0.0`；DSH `0.1.7-rc.2` / upstream `477b4f42`，未改上游。产品 PARTIAL，`release_ready=false`；SDK 分发按适用门禁 BLOCKED。 |
| 公开主线 | PR #111–#118 已合并；远端 `main` 为 `4859d136`，其 CI 见[post-merge r4](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)，不抵扣本次新提交检查。 |
| 本地交付与 PR | feature 分支 `codex/shinemage-abc-local-candidate`；已从 `5390667c` 形成 15 笔本地提交，代码/边界为 `d36c567e`，说明为 `0ffc3c67`，见[交付索引](docs/hackathon/evidence/shinemage-main-local-commit-closeout-20261011.md)。PR #119 仍开放，尚未推送这 15 笔；正常推送检查发现状态页过长，正在以独立 docs 修复。最新本地 SHA 看 `git log -1`。 |
| 独立作者仓 | 九个插件与 board-components 领域库分别维护源码、版本和 CI；完整看板在 analytics-workbench，shine-board 只是能力标记；合成知识服务不是真实 WeKnora。作者覆盖按[验证入口](docs/operating/verification.md)及固定作者证据锁记账。 |
| 当前包绑定 | Workbench source `6c5adc9f` / 正式回执 `0af61dab…`、CRM `c4b1c91e` / `4663cce0…`；九包与两份现有 profile 的准备已通过，不继承旧 candidate/journal 或宿主验收。 |
| 主仓职责 | profile、公共合同、组合消费及 release 包装配使用固定正式包/公开合同/作者 CI 证据；backend、平台合同、静态边界、保留源码守卫和两组旧 Workbench 私有断言仍在主仓，旧 `dsh-plugins/` 不删。主仓是集成仓，尚不是只有 DSH 的仓库。 |
| 已完成验证 | 每组提交已审查并完成必要验证，默认 OCR 排除文件人工补查，未调用外部 LLM；合同阶段实际执行 17 个生成器/测试组。旧完整 B0 与本次最终提交分别记账，不累加各组 PASS。 |
| 本次推送检查 | 正常钩子先因 B0 环境缺后端依赖停止；按后端锁新建隔离环境后，完整后端检查在状态页短表合同处停止。前端/B0 尚未由本次完整钩子执行完成，失败日志保留，不绕过钩子。 |
| 新 hosted CI 输入 | 尚缺 `SHINEMAGE_PLUGIN_READ_TOKEN` 和三项 `SHINEMAGE_PACK_ARTIFACT_*`；正式汇总 ZIP 仅在本机，尚未上传。新 CI 不用旧文档或作者 CI 代替，不向公开主仓提交私有包载荷。 |
| 兼容门禁 | CRM/Knowledge 的精确 Cordis peer `4.0.2` 与固定运行输入 `4.0.4` 仍待 owner 校准；隔离提案见[证据](docs/hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。不改 peer，不用构建通过抵扣兼容。D/E 五仓无独立 tsc。 |
| 真实验收 | 当前组合的正式服务/目标/terminal/browser/恢复、真实模型/CRM/WeKnora/UAT、standalone 页面包和正式分发仍按各自材料保持未关闭；旧 WSL/宿主结果不继承，见[准入预检](docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)。 |
| 生产与清理 | 杭州 `current` 的带日期恢复/热补丁事实见[2026-10-09 现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)，本地候选未部署。11 份候选目录及三个远端分支已按授权清理，归档与摘要保留，见[清理记录](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 任务外内容 | `security-audit-skill/` 不纳入提交或清理；任务范围干净不等于整仓无未提交内容。92 份历史证据同字节保留。 |

## 本轮施工计划

1. 修复 STATUS 短表，将迁移过程与旧统计保留在[历史快照](docs/history/STATUS-HISTORY.md#shinemage-pr119-before-push-20261011)；追加聚焦 docs 提交，再通过正常推送钩子交付现有 PR #119。
2. 核对新 PR 的实际路径计划与 CI，修复可本地解决的问题；补齐专用只读 secret 和真实正式汇总 artifact 后再跑被阻断的 CI，不跳过门禁。
3. PR 审查和适用验证完成后，按单独合并授权走 `/qa` 与实际远端门禁；不先在本地把 feature 合进 main，不自动发布或部署。
4. peer 校准、当前组合准入、真实业务/WeKnora/模型、SDK 正式分发和独立 DSH 升级沿原 stop/go 分别收尾，不扩展功能。

## 维护入口与边界

- 单插件日常更新见[插件更新指南](docs/operating/shinemage-plugin-update.md)；仓库职责、升级和清理见[维护手册](docs/operating/shinemage-maintenance-and-cleanup.md)，任务接续见[TODOS](docs/hackathon/TODOS.md#m1-核心交付)。插件变更不默认重建 DSH、迁移数据库或重复 SDK 全量审计。
- 本机用于开发、合成验证与 PR；杭州/6677、旧 CRM、真实业务 DuckDB、WeKnora 数据卷和凭据不在本轮操作范围。临时验证只回收本次拥有的实例。
- 历史候选、失败日志、原始包与截图保留；迁移各轮的数字、旧来源和未执行结论见[历史快照](docs/history/STATUS-HISTORY.md#shinemage-pr119-before-push-20261011)，不能当作当前准入或生产事实。
