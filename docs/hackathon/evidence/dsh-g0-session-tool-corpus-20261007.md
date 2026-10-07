# 会话恢复工具语料第一步（2026-10-07）

在浏览器 v2 门禁正常 hooks 提交 `d8a84d66` 后，继续 T2/T7 的兼容语料缺口。**本机固定 rc2 的工具调用/结果持久化恢复已通过；跨版本、杭州新语料和完整 corpus 仍 PARTIAL / NOT_RUN。** 此批在下述 OCR delegate 审核后随本次提交交付。

## 实现与范围

`session-recovery.mjs` 增加显式 `--corpus tool`；默认文本入口和 v1 回执保留。工具语料使用 `dsh-owned-session-recovery/v2` / `tool-roundtrip/v1`，每轮 13 事件，包含两个工具调用、成功与失败结果、`toolCallId/source.callId`、错误身份、JSON meta 和第二步助手答复。合同取自固定 `477b4f42` 的 `packages/core/session/src/types.ts` 与 `packages/llm/llm/src/message.ts`，未修改上游。

冷进程通过实际官方编译 JSONL reader/writer 读写，并用官方 `Session.create` 恢复消息投影，逐项比较工具语料与模型可见消息。工具事件是 synthetic fixture；没有执行真实工具、模型、CRM 请求或读取业务库。`--corpus` 未知值在创建输出前拒绝，仍拒绝复用已有目录。新模块 `session-recovery-tool-corpus.mjs` 属于测试控制器，后续传输新控制器时必须一起带上；旧封存控制器、包和候选不重写。

## 实际验证

证据目录 `.context/checks/session-tool-corpus-20261007/`，Node24.19.0，macOS 本机，固定 upstream checkout `477b4f420553e8a52c2fbccc464d7561b239c443` tracked clean。编译模块来自该本机 checkout；本轮没有重建或补签编译闭包，不构成构建来源认证。

| 验证 | 实际结果 | 证据 |
|---|---|---|
| 原文本回归初跑 | 3 PASS / 0 SKIP | `legacy-tests.log` |
| 工具语料实际四个冷进程 | rc2 截断恢复 PASS，13→26 事件；注入 65 字节不完整末帧，只读不改文件、续写保留完整前缀、冷读一致 | `actual-rc2/session-recovery.json` 和 `process-0` 至 `process-3` stdout/stderr |
| 新负测首跑 | 10 PASS / 1 FAIL；测试夹具错误，未到被测拒绝路径 | `tests.log` |
| 修复后相关测试 | **11 PASS / 0 FAIL / 0 SKIP，1.31 秒**；含真实文本/工具冷读写、篡改持久化结果拒绝且不改文件、输出保护、故障代理和 mock 测试 | `tests-fixed.log` |
| 语法、差异、引用与既有 candidate/journal 保护 | PASS | `final-checks.json` |

首个负测错误来自 Node 的 Zstandard 解压仅返回首个 header 帧。修复为保留独立 header 帧、从已验证冷进程事件重建单独的篡改事件帧，再交实际官方 reader 读取。最终负测确实因 `RECOVERY_TOOL_CORPUS_CONTENT` 拒绝，没有把解压错误当作功能拒绝。首轮失败日志保留。

实际命令（`OUT` 必须是不存在的新目录）：

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test   scripts/dsh-b0/session-recovery.test.mjs   scripts/dsh-b0/recovery-model-gate.test.mjs   scripts/dsh-b0/mock-provider.test.mjs

node scripts/dsh-b0/session-recovery.mjs "$OUT"   "$PWD/.context/dsh-b0/upstream-0.1.7-rc.2/apps/cli/node_modules/@deepseek-ai"   --corpus tool
```

第二条本次退出 **2 / PARTIAL**：rc2 行为 PASS，未提供实际 rc1 编译模块，所以 rc1↔rc2 明确 NOT_RUN。这是保留门禁的预期结果，不是整体通过。测试文件已在 B0 pipeline 清单中，本轮未重跑全部 pipeline。

## 剩余边界

下一步仍需用固定 rc1/rc2 编译输入在隔离环境跑同一工具语料双向读取、旧状态回退，并补 media/delegation 等语料与构建闭包证明。本轮不联系杭州、不追加 candidate journal，也不将旧文本四项结果套给新工具语料。真实身份/模型/UAT、签名/SBOM/CVE、生产 activation/canary/rollback、G0 stop/go 和物理分仓继续开放。


## 提交前审查与当前复验

使用 `/Users/hutou/.agents/skills/open-code-review-delegate/SKILL.md`：OCR 确定文件/规则，宿主完成审查，不调用外部模型。已核对 13 个变更文件（4 个 MJS、9 个文档，按 path/status 记账），无跳过，覆盖率 100%；OCR 排除的 Markdown 也人工核对。没有新增未关闭的高/中风险发现。工具夹具仍显式不执行真实工具；既有 terminal gate 固定历史 controller，不需要随本次脚本修改旧证据。

提交前同一命令在 Node24 的已有固定 rc2 编译环境重新执行：**11 PASS / 0 FAIL / 0 SKIP，1.35 秒**，见 `.context/checks/session-tool-review-20261007/tests.log`；没有复用旧测试数冒充本轮通过。预览、规则、逐文件清单和摘要保存在同目录。另有[年龄策略收口](./dsh-g0-snapshot-policy-closeout-20261007.md)的独立 90 项本次回归。本批未重跑 release 全套或杭州；两者不能从这里推定通过。
