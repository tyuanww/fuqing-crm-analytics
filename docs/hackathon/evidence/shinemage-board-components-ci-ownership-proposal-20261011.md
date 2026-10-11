# 领域 CI 归属回执最小提案（2026-10-11）

本提案为既有主仓领域生产者迁移补齐实际执行输入，不增加领域函数、类型、版本或新的运行平台。原作者仓仍为 `d5aacdb4`；主仓 HEAD 仍为 `5390667c`。五路径增量只在隔离副本，尚未应用、提交、推送或执行新的远端 CI。机器记录见[shinemage-board-components-ci-ownership-proposal-20261011-validation.json](shinemage-board-components-ci-ownership-proposal-20261011-validation.json)。

## 当前入口为何仍不能直接删除

主仓默认 `package-inputs.test.mjs` 还复制旧领域生产者、构建并运行其私有几何。已通过的领域 PR CI `38119670295` 实际保存了生成包与 manager 证据，执行计数需读取外部日志；该 artifact 没有随包的机器执行记录及原 `22245ab9…` 封存输入。Ubuntu 新归档 `66d53381…` 与原包外层不同，不能放宽原锁来完成迁移。

## 本增量

- `scripts/run-author-tests.mjs` 实际运行原几何和 producer/输入测试，保存 TAP 原始日志、统计、退出码、源文件和实际测试摘要；执行前后核对源码。任何失败、取消、跳过、零测试、缺失/重复统计或源码变化，均不生成通过回执。
- `scripts/run-author-tests.test.mjs` 覆盖真实 TAP、坏统计、目标目录别名/复用、真实失败，以及通过测试途中改写自有源码。
- CI 显式 checkout PR head，调用同一入口并随 artifact 保存回执及原封存输入；本次生成的另一份归档继续单独保存，摘要不能互换。
- 两份说明解释固定命令与提案边界。CI 拒绝 `--proposal`；本地施工副本显式记录为 `LOCAL_PROPOSAL`，不当作真实 CI 或干净来源。

## 实际验证与审查

新空 store 的冻结离线安装 exit 0、downloaded 0。拒读主仓、旧领域源码、九个兄弟作者仓及网络时，新增守卫 5 PASS / 0 FAIL / 0 SKIP；实际几何 28 PASS、producer/输入 6 PASS，各自 0 FAIL / 0 SKIP。12 个列明源码负对照均 EPERM。允许机器其他目录读取，因此不宣称整机 deny-default。

原封存输入保存在本地提案回执的 `reference/`，仍为 1955 字节、`22245ab9…`，没有重新生成或改写历史包。输出目录复用、普通模式脏源码、CI 中的提案模式均 exit 1；真实失败与执行中源码变化的测试检查没有通过回执。来源标记是 `d5aacdb4 + 5 路径未提交提案`，source_clean=false，不能归为该提交已完成的正式 CI。

新增负测第 r2 轮实际为 3 PASS / 2 FAIL，发现 `/var` 到 `/private` 的 CLI 判断偏差。修正为 realpath 判断后，第 r3 轮 5 PASS；旧失败日志保留。YAML 解析、bash 语法及补丁 `git apply --check` exit 0；actionlint 未安装，未运行。

OCR delegate 选择三份代码/工作流，主 Agent 实际审查 3/3、coverage 100%，没有发现；两份 Markdown 人工复核，未计入代码覆盖。补丁、准确五路径清单、日志和输入摘要在 `/Users/hutou/.codex/tasks/shinemage-domain-ci-ownership-proposal-20261011-2a8b1o72`；patch SHA-256 `46db3bc6a123715a47681af48fa05f80e62b2b9ace73a1805f48849bb3d607bb`。

## 接续边界

先按实际授权应用、提交和推送这五路径，再取得同一新提交的真实 Ubuntu artifact，核对来源、运行状态、回执与两份独立归档。随后才准备主仓公开消费者与旧 producer/私有测试入口的迁移；不能先删源码步骤或伪造新 artifact ID。本轮不覆盖新组合准入、真实业务、SDK 分发、合并、发布或部署；PARTIAL，SDK 分发 BLOCKED，release_ready=false。
