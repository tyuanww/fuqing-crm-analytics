# rc.5 旧 bridge ↔ ACP 离线投影对拍（P3-3c / S-A）

状态：**SHADOW（非阻塞）**。目标仍是 DSH `0.2.1-rc.5`、tag commit `b830ec950faba0a46dda564be3e2d854afed94f1`；仓库 pin 仍是 rc.3。本切片只做设计 §3c 的 **S-A 离线投影对拍**，不接 ACP transport、不切流、不产生模型调用或会话写入。

## 入口

| 面 | 文件 | 说明 |
|---|---|---|
| 对拍 CLI | [scripts/ci/rc5-shadow-compare.mjs](../../scripts/ci/rc5-shadow-compare.mjs) | `--fixtures <dir> --out <file> [--summary <file>]`；默认退出码即门禁结论 |
| 投影副本 | [scripts/ci/rc5-acp-projection.mjs](../../scripts/ci/rc5-acp-projection.mjs) | rc.5 `updates.ts:52-87`、`codec.ts:14-35`、`session.ts:531-556` 的固定副本，带源 commit/行号 |
| 分类与 schema | [scripts/ci/rc5-shadow-classifier.mjs](../../scripts/ci/rc5-shadow-classifier.mjs) | 分类词表、严重度、`shadow_diff` 行 schema 与报告校验 |
| 录制夹具 | [scripts/ci/fixtures/rc5-shadow/](../../scripts/ci/fixtures/rc5-shadow/) | normal end_turn、cancelled、error、forked、tool_call 五份按 legacy bridge 事件形状构造的静态语料 |
| 单测 | `scripts/ci/rc5-shadow-{classifier,compare}.test.mjs` | 分类矩阵、schema 漂移负测、夹具端到端与 CLI 退出码 |
| CI | `.github/workflows/lint.yml` 的 `rc5-shadow` job | 第三个非阻塞 step（job/step 都 `continue-on-error`，不在 `merge-gate.needs`） |

## 对拍语义

同一份 `session/event` 录制喂两条路径，只比较 dispatcher 证据形状（设计 §3c）：

1. **legacy**：仓库现有 `native-evidence.mjs`（`journalFromEvents` → `summarizeJournal` → `evidenceFor`，真实模块，不是副本）。
2. **ACP**：rc.5 纯投影副本把 `tool/call`/`tool/result` 投影成 `tool_call`/`tool_call_update`，把 `turn/end` 按 `session.ts:531-556` 的结算顺序投影成 `prompt` 的 `stopReason` 或 JSON-RPC error。

逐字段行：`turn.reason`、`turn.outcome`、`turn.execution_exited`、`turn.successful_call_ids`，外加每个工具生命周期的 `tool_call.<callId>.status`。

| 分类 | 含义 | 严重度 |
|---|---|---|
| `EQUAL` | 两路一致，含 codec 的直接翻译（`completed→end_turn`、`max-tokens→max_tokens`；`error` 以 JSON-RPC error 结算） | `none` |
| `EXPECTED_CODEC_COLLAPSE` | **仅** codec.ts 记录的三处塌缩：`blocked→end_turn`（NEEDS_INPUT 丢失）、`aborted→end_turn`（与完成不可分）、`interrupted→cancelled`（崩溃孤儿像用户取消）。只允许 `turn.outcome` 不同 | `low` |
| `MISSING_IN_ACP` | legacy 有事实、ACP 投影根本产不出：`forked` 是 fork-seed 边界、从不结算活的 prompt turn（`codec.ts:30-33`）；或录制里没有该 turn 的结算 | `medium` |
| `UNEXPECTED` | 上表解释不了的一切，包括投影副本与录制流漂移 | `high` |

`EQUAL` 的判定不依赖字符串相等：`turn.reason` 的直接翻译由投影函数 + 审查表判定；`turn.outcome` 只有在投影语义相同时才相等。`turn.execution_exited` / `turn.successful_call_ids` 的差异永远不会被“塌缩”解释。

## 报告 schema

`schema_version: "dsh-rc5-shadow-diff/v1"`，顶层含 `source`（rc.5 commit + 源行号 + legacy 模块）、`fixtures`、`summary`（按分类/严重度计数、`unexpected`、`missing`）与 `shadow_diff` 行数组。每行**恰好**七个键，顺序规范化：

```json
{"sessionId":"sess-shadow-cancelled","turnId":3,"eventKey":"turn.reason",
 "legacy":"interrupted","acp":"cancelled",
 "classification":"EXPECTED_CODEC_COLLAPSE","severity":"low"}
```

行按 session → turn → turn 字段 → 工具行排序；报告无时间戳，同输入逐字节稳定。`validateReport()` 在写盘前拒绝缺键/多键、未知分类、错误严重度、重复行、乱序、summary 不一致和未知 provenance。

## 夹具 schema

一份 JSON = 一次已录制观察（`dsh-rc5-shadow-fixture/v1`）：`name`、`description`、`sessionId`、`intent{run_id,attempt_id}`、`observations[{request_id,execution_exited}]`、`events[]`。`events[].seq` 必须从 0 连续（`native-evidence` 的 journal 前提）；工具结果保留 legacy 录制的嵌套 `tool-result` 块与 `message.toolCallId`，ACP 侧按 rc.5 helper 读 `message.isError`。

## 退出码与 CI

`0` = 无 `UNEXPECTED`（允许记录在案的 collapse/missing）；`1` = 存在 `UNEXPECTED`；`2` = 参数、夹具或报告校验失败。CI step 先跑两个单测，再对拍并写 `.context/rc5-shadow/shadow-diff.json` 与 `$GITHUB_STEP_SUMMARY`。

## 本切片不证明 / 残余风险

- **纯离线**：没有 transport、时序、丢更新率证据；S-B 在线金丝雀和 3b 的 `session/prompt` 往返不在本切片。
- 夹具是按 legacy bridge 实际事件形状（对照 `native-evidence.test.mjs` 与 `native-state-smoke.mjs` 的载荷）构造的静态语料，不是真机抓包；S-A 证明投影等价，真实录制留给 S-B。
- `forked` 恒为 `MISSING_IN_ACP`：ACP 结构上没有该事实，属设计 R3 的已知降级，不是可消除的 diff。
- 投影副本只覆盖证据相关表面：`assistant/message` 的 `agent_message_chunk`/`usage_update` 未复制；图片内容需要 attachment store，离线副本直接报错而非静默空投影。
- 无 turn 归属的观察（例如 turn 启动前就被取消）不会被伪造成 ACP 结算；当前录制夹具都是 turn-scoped。
- pin 提升到 rc.5 后必须重新核对本副本与上游（codec/updates/settlement 行号与语义），再把该 step 转为 blocking 并纳入 `merge-gate.needs`。
