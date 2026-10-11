# 领域作者 CI 固定输入读取提案（2026-10-11）

领域作者当前 [PR CI 38121126913](https://github.com/tyuanww/shinemage-board-components/actions/runs/38121126913) 的精确来源为 `e78e040e`，已交付[真实回执、原日志和两份归档](./shinemage-board-components-ci-ownership-delivery-20261011.md)。在独立任务目录准备了四个新增路径，用于主仓后续核对这份 CI 和原固定领域输入；尚未应用到主仓、接入 pipeline、提交或推送。

## 四个新增路径

- `config/domain-author-evidence.lock.json`：固定当前来源、run/attempt/artifact、ZIP、回执、四份原日志、两份领域包与成员摘要。
- `scripts/ci/domain-author-evidence.mjs`：只读固定归档，核对完整来源清单、真实几何/producer 计数及明确的未运行边界；固定领域输入必须仍是原 reference。
- `scripts/ci/read-domain-author-evidence.py`：内存中检查有界 ZIP、TAP 与 tar 成员；不解包落盘、不执行包代码。
- `scripts/ci/domain-author-evidence.test.mjs`：坏来源、坏覆盖、过度声明、ZIP 特殊路径和输入绑定守卫。

增量在 `/Users/hutou/.codex/tasks/shinemage-domain-main-evidence-proposal-20261011-k62g10wq/product-delta-r1.patch`，SHA-256 `c910d8261693e8ae3b2879f37e02c184fd62bae9f66cd44462263fd95313d144`。四路径摘要见同目录 `main-local-proposal-plan-r1.json`；`git apply --check` exit 0。没有继承主仓的 165 份施工文件到增量。

## 实际验证与审查

列明主仓、worktrees、领域作者/旧 clone 及九个原插件作者内容拒读、拒网的条件下，绑定实际 CI ZIP 的守卫 12 PASS / 0 FAIL / 0 SKIP；实际 reader 加原 reference 输入绑定 exit 0，来源 `e78e040e`、原领域包仍为 1955 字节 `22245ab9…`。12 个文件负对照全部 EPERM。策略允许其他系统/历史目录，不称整机 deny-default 隔离。

未提供 CI ZIP 时为 4 PASS / 0 FAIL / 8 SKIP；八条包含 `NOT_RUN`，不抵当前 CI 输入验证。此提案没有重新执行领域几何 28 或 producer 6，读取和验证的是其真实作者 CI 日志。

OCR delegate 确定性 preview/rules 后，主 Agent 实审四路径 4/4，无未解决发现，无外部模型调用。第一轮提案测试 helper 改用 readFile 时把 await 放在同步 assert.throws 回调中，导致 SyntaxError / exit 1；原日志保留，改为在回调前读取字节后 r2 通过。这是本提案测试修复，不影响此前已交付的作者 CI。

原始材料为任务目录的 `ocr-preview-r{1,2}.stdout`、`ocr-rules-r1.stdout`、`review-r1.json`、`source-denied-tests-r{1,2}.*`、`source-denied-probes-r1.*`、`actual-fixed-input-bind-r1.*`、`actual-fixed-input-validation-r1.json`、`no-opt-in-tests-r1.*`。机器摘要见[validation JSON](./shinemage-board-components-main-evidence-proposal-20261011-validation.json)。

## 下一步仍需完成的对接

这四路径只准备输入校验，不单独关闭领域迁移。原 `package-inputs` 13 项需按已核对职责保留公开消费/类型/离线安装守卫和 Workbench 合同；私有 producer/几何改归此固定作者 CI，旧原函数体保留为显式 legacy。默认 pipeline 的生产者、源码绑定、作者缺输入守卫和 CI 输入接线需一起形成后续可审增量，再按对应实际授权应用。不能只删除原测试来变绿。

主仓产品、锁、正式包、profile、candidate/journal、VERSION 保持；没有新完整 B0、主仓 CI、当前组合准入或真实业务验收。PARTIAL / SDK 分发 BLOCKED / release_ready=false。
