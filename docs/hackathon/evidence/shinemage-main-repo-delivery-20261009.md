# 主仓交付整理（2026-10-09）

本轮只核对主仓源码、装配边界和 Git 交付。没有新增产品代码，没有新的装配代码，没有 commit、push、PR、合并、发布或部署。没有新 candidate，也没有改旧 journal。

## 现场

集成树 `/Users/hutou/.codex/worktrees/shinemage-abc-integration/fuqing-crm-analytics`。只读实查：

- HEAD `f8db3949a7323c1e058c4d57f6287d4dbf54451d`，detached。保存引用 `codex/shinemage-html-save-status-fix` 指向同一 SHA。
- 远端 `main` `fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25`。`git rev-list --left-right --count origin/main...HEAD` 为 `0 76`。
- 已提交差异 622 个路径。未提交起始为 112 项：22 个已跟踪修改、90 个未跟踪；其中 15 个源码/测试、97 个文档/证据。暂存区为空。
- 关闭时相对起始多两条未跟踪路径：本文件和 `shinemage-main-repo-delivery-20261009-validation.json`。9 份当前说明原本就在这 112 项里，本轮只改字节。validation JSON 绑定本文件摘要和沿用日志，不是新的测试进程。
- VERSION `0.20.0.0`。本轮不改。
- 主仓开放 PR 10 个，#101–#110，全部是 Dependabot。没有本轮 ShineMage 集成 PR。

## 源码

15 个未提交源码/测试文件与起始字节一致，本轮没有再改。六点都沿用已有增量：`board_tools` 是 `{status, execution, reason}`，可见时 `execution` 仍是 `NOT_RUN`；三个 `build.mjs` 在缺少显式上游时退出 2，不再搜索主仓 `.context`；公开知识 HTTP 保留 30 秒、2 MiB 和错误体取消；graph ledger 写出去覆盖在 `scripts/crm-calibration/graph-ledger.test.mjs`；嵌套测试删除 `NODE_TEST_CONTEXT`；`pipeline.mjs` 只追加 `knowledge-http.test.mjs` 与 `graph-ledger.test.mjs`。

沿用、且文件修改时间不晚于日志的既有结果，各组不相加：

- `scripts/dsh-b0/plugin-isolation.test.mjs`：外层 4 pass / 0 fail / 0 skip，退出码 0。内部 shine-brand 7、shine-query 1、crm-knowledge source/installed 各 8、knowledge source/installed 各 5，skipped 都是 0。日志 `.context/checks/plugin-independence-integration-20261008/review-c/integration/logs/isolated-after.stdout`。
- `knowledge-http.test.mjs` 与 `graph-ledger.test.mjs`：9 pass / 0 fail / 0 skip，退出码 0。日志同目录 `helper-owner.stdout`。

这些日志不是新的完整 B0，也不是宿主兼容或正式候选。

## 装配

九个私有作者仓都只读实查到。PR #1 仍开放、未合并，没有 GitHub Release。当前产物是各仓 PR head 上的普通 content pack，不是 `dsh-plugin-pack/v1` 或 `dsh-plugin-candidate/v1`。shine-brand 的 CI 记录写明 `formal_pack_plugin=NOT_RUN`。

主仓里，`fetch-release`、`plugin verify-host`、首购 artifact 和更新演练的旧包安装已经按路径与摘要消费正式产物。`config/dsh-profile*.json`、`plugin candidate`、`packPlugin` 的输入目录、`pipeline.mjs` 和新 CRM 更新包仍消费主仓源码。`pipeline.mjs` 本轮未改。旧 `dsh-plugins/` 目录先不删除。没有因为保留组合测试而删除本地构建入口。

## 仍分开的事实

- `fd1fba4c…` / `a0d5dd08…` 已有 headed 与 WSL2，journal seq 6。不能再写成 WSL 缺目标。后续 CRM 源码和独立仓新产物不能继承。
- 八仓最新 Ubuntu PR CI 通过不等于主仓整支 CI。集成树 HEAD 不在 GitHub。
- CRM/Knowledge peer `@deepseek-ai/cordis` 声明 4.0.2，固定输入实际 4.0.4。构建通过不证明宿主兼容。
- D/E 五仓没有独立 tsc，`NOT_IN_CURRENT_BUILD`。
- 完整看板在 analytics-workbench。`shine-board` 仍是能力标记。
- 合成知识服务不是真实 WeKnora。
- SDK 分发仍 BLOCKED，不因此暂停主仓整理。无新材料，未重复全量 SDK 查询。
- 产品 PARTIAL，`release_ready=false`。

## 建议的提交顺序

未执行。相对起始 112 项，本轮改了已有当前说明的字节，并追加本文件与配套 validation JSON。建议在得到单独的「授权提交」之后，按事件分成四笔，不要压进已有的 76 笔，也不要拆成 76 个 PR：

1. `fix(plugins)`：15 个源码/测试。
2. `docs(evidence)`：2026-10-08 历史证据。
3. `docs`：2026-10-09 插件仓交付记录，含本文件。
4. `docs`：STATUS、TODOS、架构、验证和 README 的当前接续，放在最后。

76 笔已提交历史建议用一个不压扁的主仓 PR 说明，按 RC2 门禁、拆包、服务工件、身份、固定宿主、SDK 传输、HTML 收口七组书写。push、开 PR、合并都要各自授权。
