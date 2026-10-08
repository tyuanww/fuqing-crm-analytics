# 单插件更新演练交接（2026-10-08）

> 集成阶段新增证据：固定宿主已实测加载后阻塞、进程重启、原生回退及恢复旧组合，10/10 PASS，见 [A/B/C 集成验收](shinemage-abc-integration-20261008.md)。下方“开始加载后的失败尚未覆盖”保留为此前阶段的事实；新证据只覆盖注入的阻塞故障及进程级恢复，不承诺任意插件的同进程隔离。原 A 树文档未修改，本文件为独立集成副本。

## 最新验证结论（2026-10-08，修复后完整实跑）

**当前执行器十次固定 DSH 演练 10/10 命中预期状态；实际 DSH 的 SIGINT/SIGTERM 两次取消验证均通过。** 下方 run2、16/20 项测试及 NOT_RUN 陈述属于前序交接阶段，不代表本节之后的状态。完整机器可读摘要见 [当前验证](grok-plugin-update-current-validation-20261008.json)。

- 新证据目录：`.context/checks/abc-followup-20261008-r1/`；原失败目录、run2、前轮 OCR 与 25 项 headed 证据均未覆盖。
- `invocation.json` 保存完整绝对参数及 runner/startHost 摘要。Node 24.19.0、Python 3.14.4、pnpm 11.28.2，官方 DSH 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443`。`ten-scenarios/summary.json` 为 PASS，退出码 0，2026-10-08T04:33:20.892Z–04:34:11.698Z，约 50.8 秒。
- 当前完整十场覆盖受控更新、同摘要重放、就绪前中断恢复、错误摘要拒绝、重启要求、运行中断与 WAL 前缀恢复、保存 UNKNOWN 幂等重放、准备阶段拒绝、原生回退后更新、profile 回退保留保存数据。所有状态严格命中既有 EXPECTED_OUTCOMES，无放宽断言。
- 两次取消测试分别观察到当前执行器实际创建的固定 DSH 子进程后发送 SIGINT/SIGTERM。两次都退出 2 / INTERRUPTED，只有首场开始且为 INTERRUPTED，后九场均 NOT_RUN。宿主消失、cleanup_failed=false，响应时间分别 0.404 / 0.398 秒。测试脚本为新证据目录中的 `cancel-real-host.py`。
- 10 份场景记录均与汇总一致，摘要已记录，固定组件保持，自有 PID 无残留；正常与取消三次运行的受保护端口/PID 前后相同。新 CRM 包摘要仍是 `295b234a951a989ff74c137dfe20ce5e466b6b8d67cbe3669afbaea83e709bc1`。
- 本轮不修改执行器代码，不因无代码变化重复上一轮 54 PASS / 8 SKIP。当前源码与上一轮 post-review-validation 及本次 invocation 摘要核对一致。

仍未关闭：插件**开始加载后的**失败隔离（第 8 场仍只是准备失败）；正式 CI/journal；SDK 分发信任链；完整原始产物长期归档；真实模型、WSL/生产验收。SDK 仍 BLOCKED，release_ready=false。两份服务包仅做不可变摘要核对，不启动服务。没有真实 DuckDB、6677/旧 CRM/WeKnora/杭州操作。

没有 commit、push、主成果树集成或部署。新增的当前验证 JSON 是小型审查摘要，不等于原 tarball/日志已长期归档。

## 以下为保留的前序交接与审修记录

基线 `cb6f723c66df4a66117ef5edbf9aacd4a94d2065`。工作树 `/Users/hutou/.codex/worktrees/grok-plugin-update-trial/fuqing-crm-analytics`，分支 `codex/grok-plugin-update-trial`。本文件只记录任务 A。没有 commit、push、PR、合并、发布或部署。

## 修改文件

本轮改动。前四份脚本和两份文档未跟踪；`pinned-host-acceptance.mjs` 是已跟踪文件上的启动中止改动：

| 文件 | SHA-256 |
|---|---|
| `scripts/dsh-b0/plugin-update-trial.mjs` | `ea9e6d0d02a0da3d2329968a9bb162ecb8eca9bfb3175eb27c42bda51cf393f6` |
| `scripts/dsh-b0/plugin-update-trial.test.mjs` | `6d6de27da038f5f2009cc4188cdc3e7a4a0007e21eb1c37d462e8c3c01871fe9` |
| `scripts/dsh-b0/plugin-update-trial-cancel.test.mjs` | `9af610af57c2c914329b4560b54efb892fd4b74bfbedca68acd2d362f080efde` |
| `scripts/dsh-b0/plugin-update-trial-cancel-fixture.mjs` | `807bd1ff58439a19a79512477d845ab02a9d7fc48c28ed0e82d1371785767869` |
| `scripts/dsh-b0/pinned-host-acceptance.mjs` | `f10b317531f313efd1ffa106a9fae33420b7ee43d6ac732561503a0fd807263a` |
| `docs/hackathon/evidence/grok-plugin-update-cancellation-20261008.json` | `51f83a61962410cf0ef0e71728f16b426a49b083ebb50c3326bcdf412a73f666` |

没有修改 DSH 上游、`scripts/dsh-b0/pipeline.mjs`、正式 candidate/journal、profile schema、边界 policy、根 `STATUS.md` / `TODOS.md` / `CHANGELOG` / `VERSION`。

## 脚本修复

- 十个场景各有唯一成功状态。`aggregateTrial` 只在场景顺序和状态都命中时给出 `PASS`。其他标签，包括不是 `FAIL` 的标签，汇总为 `FAIL`。`overall_scope` 固定为 `TEN_SCENARIO_OUTCOME_CODES_ONLY`。
- 输出目录在写入前必须不存在或为空。已有 `summary.json` 或其他条目都会拒绝。已核对 `plugin-update-trial.test.mjs` 的 `output directories that already contain evidence are rejected` 用例及当前通过日志。
- 解包前用绝对 Python 重新核对归档字节和 SHA-256。摘要不符时不会启动解释器。子进程使用拥有的 cwd、清理后的环境和超时。
- 整次运行有一个不会被下一轮替换的取消控制器。第一次 `SIGINT` 或 `SIGTERM` 后，打包、场景之间、fixture、宿主和 Python 子进程都会看到这个状态。已经取消就不再启动新工作。场景内部的故障注入仍使用自己的控制器，不把第 3/6/7 项变成整次取消。
- 记录文本去掉 `token` / `api_key`、`sk-` 和 `Authorization`。准备失败原因 `ENOENT` 与 `lib/host.js` 保留。
- 打包必须通过现有 `scripts/release/plugin-pack.mjs`，并且解析到的 pnpm 必须是声明的 `11.28.2`。不会把 PATH 上的 `11.19.0` 当成声明版本。

## 第 8 场景

run2 的目录名仍是 `08-load-failure-restore-old`，记录未改。失败原文是准备阶段 `lstat` 不到安装副本的 `lib/host.js`，状态 `FAILED_OLD_RESTORED`。它证明准备阶段拒绝，以及随后旧组合恢复。它不证明宿主已经开始加载后的插件失败，也不证明完整崩溃隔离。

脚本中的当前名称是 `08-prepare-reject-restore-old`，并带有上述覆盖说明。历史 id 只写在 coverage 里。

对照 T18：十次 synthetic 要记录中断、恢复和有界停机。run2 的十次记录仍是这份证据。T18 正文没有把“宿主开始加载后失败”列为这十次的必要门禁，因此本轮没有另开宿主故障场景，也没有新增任务编号。该缺口保持未覆盖。

## pnpm

交接记录的旧演练 pack 使用 pnpm `11.19.0`。本机 Node 24 前缀上的 `pnpm -v` 现在仍是 `11.19.0`。旧 tarball 和 run2 记录都没有改写成 `11.28.2`。

本轮用固定二进制重新打包：

- Node `/Users/hutou/homebrew/opt/node@24/bin/node` `24.19.0`
- pnpm `/Users/hutou/Library/pnpm/store/v11/links/@/pnpm/11.28.2/122be7a2eef9b52155dfbfddf4de8df482b45bc92b37ac10394fd3c370cb5af3/bin/pnpm` `11.28.2`
- Python `/Users/hutou/homebrew/opt/python@3.14/bin/python3.14` `3.14.4`
- 插件源码 `cb6f723c66df4a66117ef5edbf9aacd4a94d2065`，`source_dirty=false`
- 成员：`cordis.patch.yml`、`lib/client.js`、`lib/host.js`、`lib/index.js`、`package.json`

新旧包都是 `shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz`，234944 字节，SHA-256 `295b234a951a989ff74c137dfe20ce5e466b6b8d67cbe3669afbaea83e709bc1`。五个成员清单相同，成员内容无差异，`tarball_same=true`，`runtime_same=true`。因此没有重跑十次宿主场景。run2 仍绑定这个摘要；不是因为体积接近就复用。

本地归档 tarball `pnpm-11.28.2.tgz` 的 SHA-256 是 `30d4099fa03b9ba1124d81527808b1e4d8e719aeb0ddfe169426df3c4a038a5f`，5631165 字节。本轮没有重新 prepare SDK。

## 本轮命令

工作目录是任务 A 工作树。解释器是上面的 Node 24.19.0。

```text
node --test scripts/dsh-b0/plugin-update-trial.test.mjs
```

退出码 0。7 PASS / 0 FAIL。覆盖精确状态汇总、相对路径拒绝、非空输出拒绝、脱敏、错误 pnpm 版本、SIGINT 回收，以及摘要不符时不解包。

```text
node scripts/dsh-b0/plugin-update-trial.mjs \
  --pack-declared-pnpm <pnpm 11.28.2 绝对路径> \
  --output "$PWD/.context/checks/grok-plugin-update-20261008-pnpm-11282" \
  --python <Python 3.14.4 绝对路径> \
  --node <Node 24.19.0 绝对路径> \
  --previous-pack "$PWD/.context/checks/grok-plugin-update-20261008-run2/new-crm-pack/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz"
```

退出码 0。第一次尝试在版本检查的 PATH 中没有 Node，pnpm shim 报 `node: not found`，退出码 2，只留下空目录。补上 Node 所在目录后重跑成功。比较结果在该目录的 `comparison.json` 和 `toolchain-pack.json`。

## 复用与未跑

复用 run2（`2026-10-08T02:33:39.990Z` 起）的十份场景记录。各状态与新的期望表一致，但旧汇总器当时是“不是 FAIL 即 PASS”。旧 `summary.json` 没有改写。新汇总器只由单测证明，没有再跑十次宿主。

旧失败目录 `.context/checks/grok-plugin-update-20261008/` 保持 `overall=FAIL`，十个场景都是 `FAIL`，时间 `2026-10-08T02:32:15.387Z` 到 `2026-10-08T02:32:35.612Z`。没有并入 run2。

没有重跑的范围：新执行器下的完整十次 DSH 宿主场景是 `NOT_RUN`。正式 CI/journal、生产、真实模型、真实 DuckDB、SDK prepare 也没有跑。SDK 仍是 `LOCAL_READY` / `supply_chain=NOT_VERIFIED` / `distribution=BLOCKED`。两份业务服务包仍是 `worktree_dirty=true`、`process=NOT_STARTED`。

## 取消与清理

根因是 `handleTrialSignal` 只中止当前场景新建的 `AbortController`，主循环不读取 `aborted`。当前场景清理后仍会创建下一轮控制器并启动新的宿主。Python 保存子进程也没有接上取消信号。`launch` 对已经 aborted 的信号只追加监听，收不到已经发生的 abort。

现在 `createTrialSignals().run` 贯穿整次运行。循环在每个场景之前检查它。取消后的场景写入 `not_started`，状态是 `NOT_RUN`，不会是 `PASS`。最后一个场景完成后若才收到取消，汇总是 `INTERRUPTED`，退出码 2。清理使用现有 `stopOwnedChild`：先 `SIGTERM`，时限后只对本次拥有的进程 `SIGKILL`。清理错误会把该场景和整次结果记为 `FAIL`。信号监听在 CLI 的 `finally` 里移除。import 模块不会注册监听，也不会自己开跑。

本轮没有为这条取消链再启动 DSH。`pinned-host-acceptance.mjs` 只补了“信号在监听注册前已经 aborted 时立即杀掉刚创建的宿主子进程”。这条路径没有用真实 DSH 进程复跑。

命令在任务 A 工作树，Node v24.19.0：

```text
node --test --test-concurrency=1 \
  scripts/dsh-b0/plugin-update-trial.test.mjs \
  scripts/dsh-b0/plugin-update-trial-cancel.test.mjs
```

退出码 0。16 PASS / 0 FAIL。其中 7 项是原有单测，9 项是取消链。取消测试实际向仍存活的执行器子进程发送 `SIGINT` 和 `SIGTERM`。执行器里的忽略 `SIGTERM` 的 Node 子进程由生产回收逻辑先 `SIGTERM` 再 `SIGKILL`，`kill_sent=true`，`remaining=false`，父进程随后观察到 `ESRCH`。场景间隙的 `SIGINT` 只留下已完成的 `one=PASS`，`two=NOT_RUN`。全部场景完成后的 `SIGTERM` 仍使 `overall=INTERRUPTED`，退出码 2。清理函数抛错时 `overall=FAIL`。Python 3.14.4 的 `sleep` 子进程由运行信号回收。

证据目录 `.context/checks/grok-plugin-update-cancellation-20261008T032734Z/`。可审查摘要是 `docs/hackathon/evidence/grok-plugin-update-cancellation-20261008.json`。四次隔离运行的退出码都是 2。没有把这些结果写回 run2。

## 范围

| 项 | 状态 |
|---|---|
| run2 十次场景记录 | 复用；不是生产 PASS |
| 声明 pnpm 11.28.2 的包字节 | PASS，与 run2 tarball 相同 |
| 新汇总器和负测 | PASS，仅单测 |
| 执行器取消、停止派发和子进程回收 | 本轮新测 PASS；不是十次宿主通过 |
| 新执行器完整十次 DSH 场景 | NOT_RUN |
| 准备阶段拒绝与旧组合恢复 | 由旧第 8 项证明 |
| 宿主开始加载后的失败 | NOT_COVERED |
| SDK 分发 | BLOCKED |
| 生产 / journal | NOT_PERFORMED |

## 主 Agent 集成

接收执行器、两份测试、取消 fixture、`pinned-host-acceptance.mjs` 的启动中止改动、本文件和取消摘要。不要把补丁直接复制进主成果树。不要改写 run2、第一次 FAIL 目录或 pnpm 补证目录。tarball 仍在 git 忽略的 `.context/checks/grok-plugin-update-20261008-pnpm-11282/`；取消运行的原始日志也在 git 忽略的 checks 目录。本文件和 JSON 摘要不等于原始包或完整日志已进入 Git。若要长期归档原始 tarball，需要单独的归档动作。

集成后的十次演练如果重跑，输出必须是新目录，并显式传入 pnpm 11.28.2。不要用 11.19.0 重新生成后再声称它是声明工具链。

## 主 Agent 追加修复：最终取消与记录落盘（2026-10-08）

上面的文件摘要、16 项取消测试和 `grok-plugin-update-cancellation-20261008.json` 属于上一轮输入，不改写为本轮结果。本轮新增验证在 `.context/checks/ocr-abc-20261008-r1/`。旧 run2、首次 FAIL、pnpm 补证目录保持。

- `runCancellableSequence` 在最终清理完成后调用 `persistTrialRecord`，场景记录包含最终状态、回收与清理错误。初始化尚未创建场景目录时失败，也由此入口创建并保存失败记录。写入失败向上传播，不生成引用不存在记录的成功 summary。已核对 `plugin-update-trial-cancel.test.mjs` 的落盘回读断言及当前通过日志。
- `finalizeTrialReport` 在最终端口检查后重新核对整次取消状态。summary 通过临时文件替换；如果取消发生于写入或替换期间，重新写入 INTERRUPTED 再返回。CLI 输出前再次核对，清理失败仍优先保持 FAIL。
- 新增实际 SIGINT/SIGTERM 的最终检查/写入阶段测试，以及清理失败和初始化失败后的磁盘记录一致性测试。

实际命令（Node 24.19.0）：

```text
node --test --test-concurrency=1 scripts/dsh-b0/plugin-update-trial.test.mjs scripts/dsh-b0/plugin-update-trial-cancel.test.mjs
node --test --test-concurrency=1 scripts/dsh-b0/pinned-host-acceptance.test.mjs scripts/dsh-b0/html-host-browser-cleanup.test.mjs
```

第一条 20 PASS / 0 FAIL；第二条 28 PASS / 0 FAIL / 8 SKIP，跳过项需要明确上游或已有服务包环境。没有重跑完整十次 DSH、真实模型、杭州或生产。路径选择器仍将这些脚本归入 B0；本轮针对性回归不等于完整 B0 pipeline/远端 CI 通过。

OCR 审查结果以本轮 `.context/checks/ocr-abc-20261008-r1/review.json` 及最终复核记录为准。Markdown 与 `.d.mts` 被 OCR 默认扩展名规则跳过时，必须记录实际补核范围，不把工具退出 0 当作全部文件通过。

## 主 Agent：OCR 后修复与当前验证（2026-10-08）

本节对应 `.context/checks/ocr-abc-20261008-r1/`。原 run2、首次失败、pnpm 字节补证和 cancellation JSON 均保留；这些历史结果不代表当前执行器的完整宿主演练。

OCR A session `78a6f569-7a4c-4731-8afe-943df76d22e9` 完成 6/6 个受支持文件，返回 12 条意见，同时报告两组 second-round deadline 警告。`.md` 不在 OCR 支持范围，另作人工核对；不得标成无警告完整复审。修复后的代码由主 Agent 核对及执行针对性测试，未重复整份 OCR。

本轮关闭：

- 宿主停止后先验证 PID 和端口，再移除归属；停止错误写入 cleanup_errors，并使整次结果 FAIL，即使随后收到取消也不降成 INTERRUPTED。
- startHost 增加可选 onSpawn 回调，启动就绪前即登记自有进程。场景 03 在创建进程后、就绪前确定性中断，不再依赖 200ms 竞态；这不证明插件开始加载后的失败隔离。
- 打包及工具版本探针使用显式 spawn 的 POSIX 自有进程组；复用现有组回收器，有界处理取消、超时和残留孙进程。最初用 execFile 的负测失败日志保留，随后改为 spawn 后通过。
- 取消测试夹具在等待 ready 前登记子进程，等待有上界并处理 already-aborted，import 无副作用；Python 从绝对 FQ_B0_PYTHON 注入，未配置时显式 SKIP。
- 移除未用 packPlugin 静态导入。两条嵌套三元表达式风格意见不构成功能阻塞；未调用的 crash-before-commit 分支不作为已覆盖场景，也未为了风格审查扩展演练范围。

当前验证：

```sh
FQ_B0_PYTHON=/Users/hutou/homebrew/opt/python@3.14/bin/python3.14 \
/Users/hutou/homebrew/opt/node@24/bin/node --test --test-concurrency=1 \
  scripts/dsh-b0/plugin-update-trial.test.mjs \
  scripts/dsh-b0/plugin-update-trial-cancel.test.mjs \
  scripts/dsh-b0/pinned-host-acceptance.test.mjs \
  scripts/dsh-b0/html-host-browser-cleanup.test.mjs
```

`final-targeted-tests-r2.log`：62 项，54 PASS、8 SKIP、0 FAIL。8 项因未配置固定上游/服务包而跳过；不是完整 B0、CI 或十次 DSH 通过。新 startHost 入口用临时合成 CLI 实际创建和终止子进程，未启动真实 DSH、真实模型或生产服务。A 执行器与取消测试共 26 PASS；共享入口/cleanup 为 28 PASS、8 SKIP。

仍开放：当前执行器完整十场 DSH 演练 NOT_RUN；运行时加载后的插件失败隔离未覆盖；正式 CI/journal、SDK 分发和长期原始产物归档尚未关闭。未 commit、push、集成主成果树或部署。

打包成功路径也已用当前执行器实跑：`--pack-declared-pnpm` 指定既有 pnpm 11.28.2、Node 24.19.0、Python 3.14.4，退出 0。新目录 `ocr-abc-20261008-r1/pack-after-review/` 的 `comparison.json` 显示 tarball_same=true、runtime_same=true、5 个成员无差异；摘要仍为 `295b234a951a989ff74c137dfe20ce5e466b6b8d67cbe3669afbaea83e709bc1`（234944 字节）。未构建 DSH、prepare SDK 或启动业务服务。
