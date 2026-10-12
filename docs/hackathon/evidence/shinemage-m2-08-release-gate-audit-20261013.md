# M2-08 release / activation / canary / rollback 门禁审计（2026-10-13）

本轮只审计 M2-08 的前置条件和当前状态，不执行 push、merge、release、远端接收、生产激活、canary、rollback 或任何服务切换。

## 前置条件核对

| 前置项 | 当前事实 | M2-08 影响 |
|---|---|---|
| M2-01 九包 candidate | 隔离 candidate 已准备，主仓正式 profile/journal 未注册 | 不能形成正式 immutable release identity |
| M2-02 service binding | 隔离证据已绑定，主仓两份 profile 仍缺 `service_binding` | 不能把隔离回执升级为正式发布输入 |
| M2-04 目标链路 | source HTTP 与 terminal/进程恢复有 candidate-bound PASS；candidate-bound browser/recovery 的完整发布链仍未关闭 | 目标接收证据不完整 |
| M2-05 页面验收 | live headed browser 部分通过；candidate browser、standalone、读屏、完整键盘焦点、高对比度仍未运行；`COCKPIT_EXAMPLE_PACKAGE` 缺失 | 页面准入不完整 |
| M2-06 真实业务 UAT | live 工具面为空；candidate 模型以 `MISSING_CREDENTIAL` 失败；CRM/WeKnora 只读查询、保存/权限失败/恢复和人工 UAT 未运行 | 业务准入不完整 |
| M2-07 SDK 供应链 | `BLOCKED`；SBOM、发布者身份、最终签名、撤销/允许名单、干净主机和回退未关闭 | 供应链门禁不完整 |
| release authorization | 当前记录只有测试+生产目标授权，没有 M2-08 所需的正式 release/activation 授权证据 | 不执行发布或激活 |

## 当前状态证据

当前审计矩阵明确：

```text
product: PARTIAL
release_ready: false
activation: NOT_RUN
```

隔离 candidate 的 journal 仍是独立证据链；live `4328` 未被切换，杭州生产入口未执行本轮发布、激活、canary 或 rollback。历史 candidate、synthetic 终端回执和作者 CI 不能替代同一 immutable artifact 的正式接收与生产回退证据。

## 结论

M2-08 保持 `NOT_RUN`。这不是发布失败，而是前置门禁未关闭时的 fail-closed 状态。下一步必须先关闭 M2-04 至 M2-07 的独立缺口、生成并核对同一 immutable artifact、取得明确 release/activation 授权，再按授权执行 receive → activation → canary → rollback；当前不自动部署、不推送、不切换生产。
