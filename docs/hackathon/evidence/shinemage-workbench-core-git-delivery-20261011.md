# Workbench 完整 core 归属与 Git/CI 交付（2026-10-11）

Workbench 的精确 40 路径 r2 提案已应用原独立作者仓并提交、推送。提交 **`d038f3577efec91e75fcf711a60b1fb868d7bcd5`**，父提交 `fd46b34d04ddf143811fd1eba7ef2ff6c3ca230b`；现有 [PR #1](https://github.com/tyuanww/dsh-analytics-workbench/pull/1) 的 head 已更新，PR 仍 OPEN。正常 commit / push 退出码均为 0，作者工作区干净；没有 merge、发布或部署。

改动是一件完整的作者测试归属工作：发现全部 core 测试、冻结十五份合成合同输入、将两项 browser 和一项 standalone 拆为显式阶段，并补齐它们所需的固定官方模块输入、CI 与说明。未改插件 manifest、runtime peer、构建入口或四个继承运行依赖文件。提案摘要仍为 `180ed79e…`，已核对 40 路径的 before/after、既有审查和暂存区；没有整树复制或带入继承修改。

新 head 的四项远端检查均 SUCCESS：[pull_request .github/workflows/ci-full.yml](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38107479575)、[pull_request analytics-workbench](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38107479576)、[push .github/workflows/ci-full.yml](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38107477408)、[push analytics-workbench](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38107477409)。push 和 PR 的完整 CI **各自**覆盖 154 个文件、1072 PASS / 0 FAIL / 0 SKIP；数字不相加。每次原始日志、摘要与包输入留在[机器回执](shinemage-workbench-core-git-delivery-20261011-validation.json)。本轮没有重跑未变化的本机全量 core。旧 `fd46b34d` 的 30 文件 / 212 PASS 只属于旧 head。

此前[未应用提案及审查](shinemage-workbench-source-ownership-20261011.md)保留为当时事实；本页接续它的未应用状态。两项 browser、一项已有 standalone 页面包、真实 backend/query 三组与主仓源码阶段迁移仍未关闭。没有制作替代页面。

组合锁仍是 `598b62ea…`，正式 pack `e41df9f5…` 的 source 仍是 `fd46b34d`。本轮新作者提交、CI 内容包、[该正式 tarball 的宿主实测](shinemage-formal-tarball-install-20261011.md)各有自己的身份，不能相互继承候选或业务准入。没有生成新 pack/candidate/journal。

Git 操作期间主仓 HEAD `5390667c`、原 114 项及其他八个作者仓未变。主仓新证据与当前说明仍未提交，VERSION 保持 0.20.0.0。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false。

原始交接：[HANDOFF-r1.md](/Users/hutou/.codex/tasks/shinemage-workbench-proposal-commit-20261011-z57s64hv/HANDOFF-r1.md)。
