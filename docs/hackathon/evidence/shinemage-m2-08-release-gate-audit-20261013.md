# M2-08 release / activation / canary / rollback 门禁审计（2026-10-13）

本轮只审计 M2-08 的前置条件和当前状态，不执行 push、merge、release、远端接收、生产激活、canary、rollback 或任何服务切换。

## 前置条件核对

| 前置项 | 当前事实 | M2-08 影响 |
|---|---|---|
| M2-01 九包 candidate | 主仓已登记正式组合 candidate，candidate digest `125c8e53…`，两份 profile 快照和 journal seq 1–5 已提交 | candidate identity 已具备；仍不等于 immutable release 或 activation |
| M2-02 service binding | page profile 快照已登记 `analytics-first-purchase` service binding；CRM profile 按组合合同保持无绑定，默认 profile 未污染 | 组合输入已接线；仍需独立 release artifact、生产身份和授权 |
| M2-04 目标链路 | source HTTP、terminal/进程恢复和 candidate-bound headed browser 已有同一 candidate 的 PASS；键盘焦点只有部分观察，screen-reader、高对比度与发布门禁仍开放 | 目标接收仍受页面、模型和供应链门禁约束 |
| M2-05 页面验收 | live headed browser 和 candidate responsive browser 部分通过；source-owned 页面包和本地 Chromium standalone 探针已通过 6 项；已记录 12 步 Tab 焦点部分观察；candidate 读屏、人工完整键盘焦点和高对比度仍未完成 | 页面准入不完整 |
| M2-06 真实业务 UAT | candidate 真实模型、WeKnora 只读检索和 CRM GSV 只读查询已通过；live 标准会话工具面仍为空；保存/权限失败/恢复和人工业务复核未运行 | 业务准入仍不完整 |
| M2-07 SDK 供应链 | `BLOCKED`；SBOM、发布者身份、最终签名、撤销/允许名单、干净主机和回退未关闭 | 供应链门禁不完整 |
| release authorization | 当前记录只有测试+生产目标授权，没有 M2-08 所需的正式 release/activation 授权证据 | 不执行发布或激活 |

## 当前状态证据

当前审计矩阵明确：

```text
product: PARTIAL
release_ready: false
activation: NOT_RUN
```

正式 candidate 的 journal seq 1–5 仍是独立证据链；live `4328` 未被切换，杭州生产入口未执行本轮发布、激活、canary 或 rollback。candidate-bound browser、synthetic 终端回执和作者 CI 不能替代同一 immutable artifact 的正式接收与生产回退证据。

## 结论

M2-08 保持 `NOT_RUN`。这不是发布失败，而是前置门禁未关闭时的 fail-closed 状态。下一步必须先关闭 M2-04 至 M2-07 的独立缺口、生成并核对同一 immutable artifact、取得明确 release/activation 授权，再按授权执行 receive → activation → canary → rollback；当前不自动部署、不推送、不切换生产。

## 2026-10-13 定向回归

执行：

```sh
node --test --test-concurrency=1 scripts/release/operator-gate.test.mjs
```

结果：`3 PASS / 0 FAIL / 0 SKIP`。这只证明 operator gate 的身份匹配、禁止响应和 15 分钟 SLI 规则保持 fail-closed，不产生 release、activation、canary 或 rollback 证据。
