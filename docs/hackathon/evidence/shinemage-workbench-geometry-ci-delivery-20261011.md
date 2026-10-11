# Workbench 几何测试远端 CI 交付（2026-10-11）

按用户本次授权，准确五路径本地提交 `e922328906a7bf7a7251c26198683f67fa3afd39` 已无 force、无 hook 绕过地推送至 `tyuanww/dsh-analytics-workbench` 的现有 `codex/analytics-workbench-independent` 分支，exit 0。PR #1 保持 OPEN，head 和正文已同步；没有 merge、发布或部署。[此前本地提交记录](shinemage-workbench-geometry-git-delivery-20261011.md)保留当时未推送事实。

## 当前实际 CI

| 运行 | 结果 | 覆盖 |
|---|---|---|
| [PR 完整 CI 38116124494](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38116124494) | SUCCESS | host/client 严格类型检查、构建、155 文件 / 1086 PASS / 0 FAIL / 0 SKIP、链接和内容包 |
| [PR 边界 CI 38116124493](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38116124493) | SUCCESS | 作者边界与固定输入 |
| [push 完整 CI 38116121887](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38116121887) | SUCCESS | 同样 155 / 1086，按真实结果 JSON 核对 |
| [push 边界 CI 38116121878](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38116121878) | SUCCESS | 作者边界与固定输入 |

四次运行均绑定上述精确 head。PR 上传 plan 含 `src/board-spec/geometry-composition.test.mjs` 恰好一次，冻结合同输入为 16 份；14 项几何断言已含在 1086 中，不额外加总。本轮未重复跑主仓完整 B0、旧包 headed/WSL、SDK 全量审计或真实业务。

## 已归档产物

PR artifact ID `11693279047`，ZIP 546706 字节、SHA-256 `20639168b2c5f5300424800f6b55faa3a3765162f98847632aa9e0c926d0439f`。普通内容包仍为 441127 字节、8 成员、SHA-256 `f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7`；与 d038 的 CI 原始内容归档及全部成员同字节。新测试没有改变运行代码，但新的 source commit 和 CI ZIP 身份另记。

ZIP、两份完整运行日志、四份 run API、artifact API、推送与 PR 正文读回保留在机器索引绑定的独占目录。初次本地预检错误解析相对 hooks 路径，证据读取又两次误用 plan 前缀/JSON 空格，已保留失败记录并据真实 cwd/路径/JSON 纠正；均未改产品或 CI 产物，不是远端 CI 失败。

## 仍需接入

主仓三路径几何对接仍 NOT_APPLIED，旧阶段继续执行。当前主仓固定正式包来源仍为 d038；不能把新 CI ZIP 配上旧来源锁来凑通过。需从干净的 e922 来源生成并核对正式 pack 回执，再更新准确输入绑定，验证后才切主仓入口。普通内容包同字节不替代正式来源身份，也不把旧 candidate/WSL/journal 绑定到新来源。

browser、standalone、当前服务/目标组合、真实模型/CRM/WeKnora/UAT、生产验收均未在本项执行。提交前外部 CLI 标记校验仍 UNVERIFIED；本次 CI SUCCESS 不抵扣外审。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false。
