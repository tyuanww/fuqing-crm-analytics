# 固定 rc2 shell / tool 合同实测（2026-10-08）

以下11 tests及源码摘要属于当轮封存输入。随后只读Git的fsmonitor/hook修复增加1个回归，当前12 tests/25场景已重新通过，见[提交前OCR审修](dsh-g0-host-tool-ocr-review-20261008.md)；本表旧摘要不代表修后runner。

本轮仅关闭 **Darwin arm64、本机官方模块、声明 synthetic 场景**的合同证据缺口：最终正式入口 **11/11 PASS / 0 FAIL / 0 SKIP**，其中完整官方模块运行 **25/25 场景 PASS**。不代表官方 Web CLI、模型派发、WSL/Windows、WAL 或生产整链通过，产品仍 PARTIAL、`release_ready=false`。没有改 DSH 上游、锁或 pin，没有安装依赖、编译、模型付费调用、生产端口连接、发布或提交。

基线是业务工作树 `codex/plugin-boundary-review@5bf2bc77bde1e00ae82832a8b5aa2d6726563e38`。执行使用已存在固定 checkout 的官方 `Context`、`ToolRuntime`、`LocalSubprocessRuntime`、`LocalBashExecutor`、`tool-bash`、`LocalJobRegistry`、`tool-jobs` 与 `tool-call-timeout-policy`，没有实现替代 shell 或伪造官方工具结果。

## 输入和范围

| 输入 | 本次实际核验 |
|---|---|
| 官方 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，tracked Git 前后 clean |
| 官方锁 | `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa`，前后保持 |
| Node / OS | `v24.19.0` / Darwin arm64 |
| 实际编译入口 | `.context/dsh-b0/upstream-0.1.7-rc.2` 中已有模块，不执行 build/install |
| 关键输入 | 原 42 项，增加官方 `packages/guard/timeout-policy` 的 package/source/lib 三项后为 **45 项**；逐项前后字节相同 |
| 缩减 SDK 对照 | 原回执 closure `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`；45 项中16项存在并逐字节一致，29项不在该开发缩减包中，0项不一致 |
| 编译来源认证 | **NOT_VERIFIED**；Git/source/lock/运行前后摘要记录不等于编译 artifact attestation、完整依赖闭包或供应链放行 |

缩减 SDK 不携带这些 shell/provider 运行入口，因此没有把 SDK 开发消费者验证冒充为此处的 runtime。固定 checkout 是另一份明确输入；完整来源信任继续由 T5/T15 负责。

## 本次真实语义

| 官方行为 | 本次结果 |
|---|---|
| Shell 成功 / 非零退出 | resolve `ShellRunResult`；exit 9 不构成 promise rejection，success result 投影可 memoize |
| Shell own timeout | `timedOut=true, aborted=false`，350ms后终止自有进程；忽略 TERM 的自有进程被升级为 SIGKILL |
| Shell caller abort | `aborted=true, timedOut=false`，first-cause 不同时标记两种原因 |
| Shell `onExpiry=none` | 超过 timeoutMs 仍保留有效 running handle；增量读不重发旧输出，放行后完成 |
| Shell spawn/工作目录失败 | `done` 不 reject，handle 为 killed；`result()` reject，失败读路径只消费一次 |
| Tool success/failure union | success 有 `isError=false/value` 无 error；failure 有 `isError=true/error` 无 value；**`error.info` 可选**，不能把普通 Node error 当作必含业务错误码 |
| bash 非零退出 / 无 jobs timeout | 均是 foreground success value，通过 exit marker 或 timedOut 表达命令结果，不把命令失败等同于工具协议失败 |
| 调用前取消 / 参数错误 | 不进入命令 body，不产生自有 marker；分别为 `TOOL_ABORTED_BEFORE_DISPATCH` / 参数失败 |
| 调用后 bash 取消 / unknown tool | `TOOL_ABORTED` / `UNKNOWN_TOOL` failure，不带成功 value |
| 输出 schema 违规 | 官方运行时返回 `INVALID_TOOL_OUTPUT`，fail closed |
| 有界输出 | 内存保留128 bytes；完整1024 bytes spill位于自有私有目录 |
| 官方默认 jobs timeout | **`kind=promoted`，命令仍在运行**；本轮放开自有 fence 后完成，并由官方 job_output 收取。不能解释成 kill 或重试新命令 |
| background / job_kill | success value为严格 `background/jobId`；官方 job_kill 后任务变为 killed |
| `promoteOnTimeout=false` | 保持 jobs 已挂载，但该调用按 foreground timeout kill；与默认 promotion 明确区分 |
| tool-call-timeout-policy | 80ms预算后先完成30ms自有 cleanup才返回 `TOOL_TIMEOUT`；caller cancel不误判为 timeout；无预算不新增截止时间 |
| 不合作的有限工具 promise | 50ms预算、150ms实际body；官方 policy等待body settle后才返回 TOOL_TIMEOUT，**不提供同进程硬中止** |
| composition teardown | 自有运行进程终止，handle done已 settle |

这里的两个自有测试工具用于违规 output 和 timeout/cancel 负测，均经真实官方 `defineTool` / `ToolRuntime` / timeout policy 执行；它们不是模型或业务插件的替代实现。

## 入口、清理与证据

正式验证命令（`DSH_TOOL_CONTRACT_EVIDENCE` 必须是新的绝对路径）：

```bash
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" \
DSH_TOOL_CONTRACT_EVIDENCE="$PWD/.context/checks/dsh-tool-contract-20261008-r1/verified-runtime" \
/Users/hutou/homebrew/opt/node@24/bin/node --test scripts/dsh-b0/shell-tool-contract.test.mjs
```

实际输出保留于 `.context/checks/dsh-tool-contract-20261008-r1/verified-tests.log`：11 tests全部PASS，0skip；完整官方运行2499.457ms，含负测的整体suite5560.922ms。可单独运行 `node scripts/dsh-b0/shell-tool-contract.mjs /absolute/pinned-checkout /absolute/new-output`。缺显式固定输入/独占证据路径时，默认测试中的 **3 项实际 runtime/中断/超时测试为 SKIP / NOT_RUN**，其余8项边界与owned group测试不能代替本次25场景通过。

输出保护实际覆盖：相对路径、输出包含/进入 upstream、父目录 symlink alias、源码输出、已有证据不可覆盖和无界预算。Git查询禁用 replace objects及系统/global配置。所有子命令只使用新自有文件；worker环境只有明确PATH、新HOME/TMPDIR/DSH_HOME及telemetry关闭。

最终四个官方 Context、7个直接Shell handles、14个自有Node命令全部回收；父runner对 **15个即时登记的自有PGID**逐项确认已回收。登记hook只观察真正的Node spawn，不替换provider outcome。新增独立“主worker已退出、同PGID后代忽略TERM”的实际负测证明，退出不等于group quiescence，回收仍继续TERM→KILL；日志写入在回收后，写证据失败不能跳过范围回收。Mac fallback不提供逃逸恶意后代的完整containment保证。

两项故障入口测试的原始运行分别在 `verified-runtime-timeout/` 与 `verified-runtime-interrupt/`。内部receipt正确为 **FAIL**，分别 `timed_out=true` / `interrupted=true`；对应测试断言它们没有冒充PASS，已知自有groups全部回收。这是本次实际取消/超时负测，不能将这些FAIL凭据计入25场景成功。

| 最终字节 | SHA-256 |
|---|---|
| runner `scripts/dsh-b0/shell-tool-contract.mjs` | `25b9228a7b856207d620b00928bc862937b0f82d49ab76ec63b37ec58e60aebe` |
| probe `scripts/dsh-b0/shell-tool-contract.probe.mjs` | `2e2ceea91899a82f3dd1594b0fc2404eb711059e4ffd9bbf46db331ccb829b0c` |
| tests `scripts/dsh-b0/shell-tool-contract.test.mjs` | `98e5663c25f01a4d11c099ef5319cd823634ebb22e3868cb54c1c442c93a068e` |
| `verified-runtime/inputs.json` | `da7eb18794561adb9f5a98ae9c76a2569c21d5300b8974753dd606dbfc5bfc1d` |
| `verified-runtime/observation.json` | `d1b485aedd4e9236b4455c59015efefb2a7a89efa52c7fc068146b0c7d3bd7da` |
| `verified-runtime/result.json` | `f9439b3d0b2aff03f6a14c55c686142868623d937543869b43d081668c86fdf0` |
| `evidence-inventory.json`（241项阶段证据） | `d36be61b0ecf083d1af6352e426d34797e79afa62805230560a5b1bf6ffd9b5a` |

最终执行同时封存 `runner-source.mjs` / `probe-source.mjs` 原字节，并实际运行该probe快照，45项输入摘要和源码对应关系不依赖之后工作树是否修改。3文件 `node --check` 与 `git diff --check`实际PASS。

## 失败与修复记录

没有删除失败或将历史成功重标为当前通过：`run-1`（14PASS/1FAIL）误以为所有error必含info；`run-2`（9PASS/1FAIL）在PID文件出现但未写完时读取；`run-3`（16PASS/1FAIL）把官方错误码写反，实际是 `INVALID_TOOL_OUTPUT`。修正自有观察器/断言后，`run-4`得到首轮21PASS。

初次正式日志 `current-tests.log` 保留Mac `/var→/private` canonical路径断言错误；`current-tests-r1.log`保留自有后代fixture转义错误造成的1项测试超时（清理仍执行）。`current-tests-r2.log`是当时21场景/9tests通过。增加policy后 `final-tests.log`保留对普通Node AbortError要求 `TOOL_ABORTED` info的误判：官方会保留已失败结果，info仍可选；修正为验证未误判TOOL_TIMEOUT及drain后，当前 `verified-tests.log`为25场景/11tests真实通过。这些都是本轮harness开发失败，不是改上游来迁就断言。

## 仍未覆盖

官方Web CLI/原生Agent Loop模型派发、session/WAL关联、WSL与Windows真实provider、sandbox权限enforcement、PTC/复杂周边policy组合、敌对同进程挂死与逃逸后代、完整编译来源认证和生产生命周期均 **NOT_RUN或原BLOCKED**。T2/T17可将本机声明模块子项更新为PASS，但不能整体标为SUPPORTED/完成或提升发布条件；官方0.2.0升级线也未运行。
