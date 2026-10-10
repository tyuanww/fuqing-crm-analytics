# ShineMage formal admission preflight（2026-10-10）

## 当前基线

- 主仓远端 main：`c0a417b7cc84888f16513725289f1dc8c4920519`
- DSH：`0.1.7-rc.2`，上游 `477b4f420553e8a52c2fbccc464d7561b239c443`
- 已准备的本地 candidate：`993daf31…`
- candidate 包：`b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`
- profile：`first-purchase-source-http-local`
- 服务源码：`f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`
- 当前状态：`CANDIDATE_PREPARED`，`release_ready=false`

## 已证实

- candidate/profile/service binding/journal 的本地摘要链一致。
- 本地 candidate 合同专项 17 PASS / 0 FAIL / 0 SKIP。
- 主仓 PR #111–#116 已合并；PR #116 和合并后的 main CI 均成功。
- 旧候选、旧 headed、旧 WSL 回执没有被写入本候选的新 journal。

## 正式准入尚缺

| 门禁 | 当前状态 | 所需新材料 |
|---|---|---|
| 目标宿主 | NOT_RUN | 已授权的非生产 Linux x86_64/WSL2、固定 Python/Node/zstd、独占目录 |
| 服务组合 | NOT_RUN | 与本 candidate 同一 service binding 的新 source/terminal receipt |
| terminal/browser | NOT_RUN | 本次 candidate 的父事件和浏览器回执 |
| 新 candidate headed | NOT_RUN | 针对 `b75d90…` 的新隔离 headed 结果 |
| standalone 页面 | NOT_RUN | 已存在的 COCKPIT_EXAMPLE_PACKAGE，不能临时伪造 |
| 真实模型/业务 | NOT_RUN | 明确的非生产业务输入与独立回执；不得读取真实 DuckDB |
| activation/canary/rollback | NOT_RUN | 前述门禁全部通过后，按授权执行 |
| SDK 分发 | BLOCKED | 供应链缺口单独关闭，不能用本地 candidate 代替 |

## 执行依赖

1. 先冻结 candidate、profile、服务输入和目标独占目录。
2. 在同一目标上生成新的 platform/source/terminal receipt。
3. 用新 receipt 做 candidate admission 和 journal 关联。
4. 再做 browser/业务验收；不得复用旧候选事件。
5. 所有适用门禁通过后才讨论 receive/activate/release。

本文件只是本地准入清单，不生成 candidate、不写 journal、不连接生产、不改变主仓文件。
