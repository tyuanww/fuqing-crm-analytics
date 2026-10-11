# 三路径审查、修复与主仓本地应用（2026-10-11）

本轮经用户明确授权：先用 open-code-review-delegate 审核并修复，再本地应用三路径、必要验证和当前文档同步。不包含 commit、push、PR、合并、peer 修改、删除旧副本、candidate/journal、发布或部署。

主仓为 `codex/shinemage-abc-local-candidate`，HEAD `5390667cc990fa558b0445aa455b086d325a6c77`。有效基线是该提交加本轮前 196 项未提交内容；暂存区为空。原三路径 r1 和前两锁／离线提案保留为准备时点，不叠加旧补丁。

## 审查与修复

OCR CLI 仅负责 deterministic preview/rule，当前主 Agent 实际审查。三份预览文件全部 reviewed：total 3、reviewed 3、skipped 0、coverage 100%；外部模型 NOT_RUN。两份锁结合实际 pack 回执、tarball、CI ZIP 与调用方核对，没有开放发现。

离线入口发现一处 Medium：`total=passed=0` 且 `failed=[]` 会通过原三条断言。隔离进程输出负对照复现修复前 PASS；修复加入正整数且大于零的用例数检查，以及 `planner=OFFLINE_STUB` 检查，原三条断言保留。修复后空集和错误 planner 各 exit 1，拒绝原因符合预期；负对照仅是测试进程输出，不是伪造后端或业务回执。最终 open findings 0。

## 本地应用

| 产品路径 | 本轮变化 |
|---|---|
| [组合包锁](../../../config/shinemage-composition-packs.lock.json) | Workbench `6c5adc9f` / 正式回执 `0af61dab…`，CRM `c4b1c91e` / `4663cce0…`；另七包及两 profile 不变 |
| [Workbench 作者证据锁](../../../config/workbench-author-evidence.lock.json) | 同来源 CI `38126014921` / artifact `11697212818` 与实际正式包绑定；首个 main-owned 行迁到主仓，另两组不变 |
| [主仓离线入口](../../../scripts/dsh-b0/competition-offline-eval.test.mjs) | 执行 canonical backend 合成 eval，不导入 Workbench 私有实现；拒绝空用例集及非 OFFLINE_STUB |

两锁和新入口均已应用并逐字节核对，修订补丁 SHA-256 `d36c9ae7da0804efa752c951086c681bd6a9828bdba8e69cf74c40e9a075bfa0`。准确前后摘要见同名 validation JSON 与任务目录内 reviewed-application-plan-r1.json。没有生成新 pack；消费此前已实际生成、读取和逐成员核对的[当前来源正式包](shinemage-current-author-formal-packs-20261011.md)。

Workbench 正式 tarball 为 `e41df9f5…` / 438499 字节，CRM 为 `0da9f8ed…` / 234901 字节。作者 ZIP 摘要 `46322d14…` / 546708 字节；155 文件 / 1086 PASS 是已有真实作者 CI 回执的读取结果，本轮没有重跑或累计这些测试。

## 应用后实际验证

| 范围 | 当前主仓实际结果 | 限制 |
|---|---|---|
| 固定包准备与作者 CI 绑定 | exit 0，9 包 / 2 profile | 使用实际 pack、ZIP、当前锁；不执行插件或完整宿主 |
| 作者证据 reader 守卫 | exit 0，13 PASS / 0 FAIL / 0 SKIP | 使用现有负测入口，不是新的作者 core CI |
| 新离线入口 | exit 0，1 个 Node 测试；内部 30/30 合成 Python 用例 | planner OFFLINE_STUB，真实模型 NOT_RUN；不能写成 31 项通过 |
| 原 main-owned 协调器 | exit 0，三组分别 1、1、3 PASS | NODE_TEST_CONTEXT 负对照由原协调器清理；后两组仍读取实际旧 Workbench 源码 |
| 来源拒读 | 3 个指定真实文件均 EPERM | 主仓 Workbench/CRM 和原作者文件；不是整机 deny-default |
| 空集／错误 planner | 修复后各 exit 1，按预期拒绝 | 修复前空集 PASS 和修复后失败日志全部保留 |

前三类包/reader/离线验证禁网并拒读列明的旧插件目录与作者仓；协调器使用另一份只读策略放行两个保留组实际所需的旧 Workbench 文件。两类策略不能合称“主仓全部源码退场”。未改原协调器、后端、原旧测试、peer、SDK/DSH pin、包内容、candidate/journal 或 VERSION。

固定 Node 24.19.0；隔离 B0 Python 3.14.4 路径来自已有固定环境。应用后受影响入口命令为：

```bash
export PYTHON=/absolute/prepared-b0-python3.14
export FQ_B0_PYTHON="$PYTHON"
node --test --test-concurrency=1 scripts/ci/workbench-author-evidence.test.mjs
node --test --test-concurrency=1 scripts/dsh-b0/competition-offline-eval.test.mjs
node scripts/dsh-b0/workbench-main-contracts.mjs
```

实际命令使用固定 Node 绝对路径和 sandbox-exec；完整 argv、cwd、时间、退出码、输入摘要与原始 stdout/stderr 位于 `/Users/hutou/.codex/tasks/shinemage-main-three-path-ready-20261011-46__pej3/local-review-apply-ijms4w7q/logs/`。包准备调用既有 prepareCompositionPacks 和 readWorkbenchAuthorEvidence/bindWorkbenchAuthorEvidence，输出到本轮新独占目录，不复用旧成功目录；见 binding-main-result-r1.json。

本次没有启动宿主、业务服务或浏览器；本次自有命令进程组已退出。完整 B0、新 hosted CI、当前候选/服务/目标/browser/回退、真实模型/业务、发布和部署均 NOT_RUN_THIS_APPLICATION。此前完整 B0 和组合的结果仍只属于当轮字节，不改写为本次执行。

## 当前边界与下一步

旧副本仍保留；另两组私有 decoder/终态/泄露断言还需原计划的等价公共路径或作者归属收口。CRM/Knowledge 的原声明仍为 `@deepseek-ai/cordis: 4.0.2`，当前严格 `4.0.4` 校准是另一份未应用提案，不能在本授权顺带修改。后续新作者提交、新包和同包验收分别记账，不继承旧候选准入。

四份当前说明已同步本轮结果，历史未应用与失败记录保留。本轮无 Git 交付，不改 VERSION `0.20.0.0`。产品 PARTIAL，SDK 分发 BLOCKED 只约束适用门禁，release_ready=false。完整收尾目标仍未完成。
