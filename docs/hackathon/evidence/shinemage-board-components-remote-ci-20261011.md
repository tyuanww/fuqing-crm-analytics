# board-components 私有远程仓与 Ubuntu CI 交付（2026-10-11）

已按用户授权完成两份已审文档的本地提交、私有建仓、main 初始化、功能分支推送、PR 和真实 Ubuntu CI。主仓 HEAD 仍为 `5390667c`，没有本轮主仓提交、推送或合并。机器记录见[shinemage-board-components-remote-ci-20261011-validation.json](shinemage-board-components-remote-ci-20261011-validation.json)。

| 项 | 实际结果 |
|---|---|
| 独立领域仓 | [tyuanww/shinemage-board-components](https://github.com/tyuanww/shinemage-board-components)，private；纯领域库，不是第十个 DSH 插件 |
| 默认 main | `3855db80f380856e21d5e034070d5e76cb127b8f`，已审的 28 路径首次提交 |
| 文档提交与分支 | `d5aacdb464ff35b5dbb1aa46bf89717b31f131d0`，`codex/board-components-independent`；只含 README.md、DEVELOPMENT.md；工作区干净 |
| PR | [#1](https://github.com/tyuanww/shinemage-board-components/pull/1)，OPEN；未合并 |
| 本次 PR CI | [38119670295](https://github.com/tyuanww/shinemage-board-components/actions/runs/38119670295)，attempt 1，pull_request，source head 为 `d5aacdb4`，SUCCESS |
| 环境 | Ubuntu 24.04、Node 24.19.0、Python 3.14.4、显式固定 pnpm 11.28.2；没有 DSH checkout/build-tools |
| 验证组 | 几何 28 PASS / 0 FAIL / 0 SKIP；producer/输入 6 PASS / 0 FAIL / 0 SKIP；Python 准备守卫 4 tests / OK。按组记录，不相加 |
| 同次 CI 内容包 | 1951 字节；SHA-256 `66d53381095e93f38dbaa7385780f20b677f68ca2692702cb270849f3392853e`；5 个普通领域成员 |
| 与封存参考 | 参考归档仍为 1955 字节、`22245ab9…`；5 个成员逐字节相等，外层归档字节/摘要不同 |

## 原始对象与实际范围

原始记录在 `/Users/hutou/.codex/tasks/shinemage-domain-delivery-preflight-20261011-8dnlp38u`。PR CI 的 artifact ID 是 `11693814256`；下载 zip 的 SHA-256 为 `10635ccff9df3e93711a325afe984c3feb3e8f6813ca1e543c1a2a14eb34ce69`，与 GitHub API 的 digest 相等。解包前检查路径、成员类型和大小，下载的领域 tarball 再逐成员核对封存参考。完整日志、run/job API、zip、原解包和包管理器回执保留；push CI 两轮 SUCCESS 单独记账，不累计测试数，也不替代本次 PR run。

文档修订只同步真实 clone 事实和固定 pnpm helper/JS 入口，两文件人工复核及命令语法检查已完成。OCR 不支持 Markdown，两文件不能写成代码审查 2/2；源码首次提交的既有审查与 clone 留在[上一轮 Git/clone 记录](shinemage-board-components-owner-git-delivery-20261011.md)，没有重标为本轮实跑。

## 尚未关闭

没有独立 tsc（`NOT_IN_CURRENT_BUILD`）；普通领域内容包不等于正式 DSH plugin pack 或 candidate。主仓领域生产者入口、原三份领域锁和 `22245ab9…` 输入保持，不将新 CI 的外层摘要冒充旧摘要。本次不覆盖当前组合宿主/服务/目标/回退、真实模型或业务验收；没有合并、发布或部署。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。
