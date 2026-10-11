# 主仓领域入口迁移提案（2026-10-11，未应用）

本轮只完成可审查的隔离提案。主仓仍为 `5390667cc990fa558b0445aa455b086d325a6c77` + 已有未提交内容，索引为空，VERSION 仍 `0.20.0.0`。正式包、profile、candidate 与 journal 未改；主仓产品入口没有切换。

提案目录：`/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji`。完整增量为 `product-delta-r2.patch`（105351 字节，SHA-256 `5d08d71940fce931f000ec42da01a028c1a8d7f101d6167670ed89a1b8c0bef0`）；准确 18 路径（9 修改、9 新增）及前后摘要见同目录 `main-local-cutover-plan-r2.json`。[机器记录](shinemage-board-components-main-cutover-proposal-20261011-validation.json)与 `HANDOFF-r2.md` 对照使用。不要叠加 r1 或此前四路径 reader 提案。

## 当前改动与归属

领域作者的来源与实际远端 CI 已交付，见[五路径提交与 CI](shinemage-board-components-ci-ownership-delivery-20261011.md)。本提案固定读取来源 `e78e040e…`、PR run `38121126913`、artifact `11694947955`，核对原始 ZIP/API digest、30 文件来源、真实分组命令/TAP/日志以及领域五个成员。job 内 `NOT_VERIFIED_BY_JOB` 原文不改；run 成功由独立实际 API 确认。

默认 B0 提案移出主仓领域 build、私有几何复跑和 source-wide dependency binder。领域 producer/输入 6 项及几何 28 项继续归属作者真实 CI，不冒充本轮主仓执行。主仓保留三个实际正式消费者包内的领域锁核对、公开导出、严格 TypeScript 消费、真实离线 pnpm 安装和漂移负测。原 1955 字节领域输入 `22245ab9…` 保持；Ubuntu 1951 字节构建包 `66d53381…` 只证明成员相等，不能替代原 archive。

三个旧入口全文逐字节保存成显式 `.legacy.mjs`，默认 pipeline 不调用。原两项 Workbench author/coordinator 合同移至独立主仓测试入口继续执行，八插件缺输入守卫以及三组 Workbench 主仓合同仍保留源码读取，故此提案不能支持删除旧 `dsh-plugins/`，也不是完整 pipeline 的源码拒读验收。

三个工作流新增固定领域 CI 输入准备，domain lock 单独变更选中适用 B0；绝对新输出根、远端 commit/run/artifact/digest 不一致、已过期或缺授权 token 均失败关闭，不搜索源树或跳过门禁。当前 artifact API 过期时间为 `2026-10-25T07:22:54Z`；之后需新的实际 CI 回执和经审查的新锁。没有建立新的插件市场或发布机制。

## 实际验证

| 范围 | 本次结果 | 原始入口或记录 |
| --- | --- | --- |
| 正式包领域消费 | 8 PASS / 0 FAIL / 0 SKIP；exit 0 | `public-domain-consumers-r1.stdout`、同名 JSON |
| 证据与下载守卫 | 15 PASS / 0 FAIL / 0 SKIP；exit 0 | `domain-evidence-guards-r2.stdout`、同名 JSON |
| 正式消费者锁 CLI | exit 0 | `public-domain-cli-r1.stdout` / JSON |
| 指定来源负对照 | 21 个 EPERM；exit 0 | `source-negative-probes-r1.stdout` / JSON |
| 保留的 Workbench 合同 | 2 PASS；exit 0，独立于源码拒读公共范围 | `workbench-retained-contracts-r1.stdout` |
| 输入锁路径选择 | 3 PASS / 27 deselected；exit 0 | `domain-lock-path-matrix-r1.stdout` |
| 工作流静态检查 | YAML 解析通过，三个新增 bash 步骤语法通过 | `workflow-domain-steps-r1.json` |
| 增量审查 | OCR delegate 17/17 已审；排除的 1 个测试另做人工审查；无未解决发现 | `review-r2.json`、`ocr-preview-r2.stdout`、`ocr-rules-r1.stdout` |
| 补丁一致性 | 主仓 `git apply --check` exit 0 无 warning；只在隔离基线上应用，18 输出字节和权限匹配 | `main-apply-check-r2.*`、`scratch-apply-bytes-r2.json` |

数字按各自对象记账，不能相加为整体通过。公共消费与守卫沙箱为 allow-default 加禁网/指定源码拒读；它拒绝九份主仓业务源码、列明作者仓及领域旧 clone，允许开发工具与正式包。不是整台机器或整个主仓不可读。下载测试使用 owned mock；新下载模块的真实联网调用 **NOT_RUN**。此前真实 API 的 11 个字段和原下载 ZIP另有核对，不将 mock 写成真实下载。

## 保留的失败与开放项

下载 mock 首轮 14 PASS / 1 FAIL，原因是测试预期 `/var` 而输出已解析为 `/private/var`；修正断言后 15 PASS。首轮留存的是工具输出观察记录，并非完整原始日志。r1 补丁曾对可执行的路径分类脚本报告 mode warning，r2 保留原权限；历史 r1 与观察保留。原失败或旧证据没有覆盖。

完整主仓 B0、应用后 hosted CI、当前 candidate 的服务/宿主/目标/browser/回退、真实模型及业务、actionlint 都未在此提案执行。领域无独立 tsc（`NOT_IN_CURRENT_BUILD`）；SDK 分发仍 BLOCKED，产品 PARTIAL，release_ready=false。

下一步仅在主仓本地入口应用得到实际授权后执行：复核 HEAD/索引和九个基线摘要，只应用完整 r2，核对 18 输出摘要，补必要的新字节验证，同步实际结果。主仓 commit/push/PR/merge、发布、部署和删除旧副本不包含在本提案内。[此前四路径读取提案](shinemage-board-components-main-evidence-proposal-20261011.md)保留准备时点，由本完整提案取代待应用范围。
