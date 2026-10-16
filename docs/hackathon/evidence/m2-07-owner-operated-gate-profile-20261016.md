# M2-07 owner-operated 门禁 profile 复核（2026-10-16）

当前六项正式门禁混合了三种目的：技术可运行性、对外 artifact 的供应链信任、公司治理核验。单人项目可以把它们分层，但不能把一层的结果写成另一层的通过。

## 适用于单人内部使用的 profile

以下项目保留为技术必需项：

- r3 artifact、pack manifest、source SHA 和 SDK pin 一致；
- production-only consumer closure；
- dependency graph、runtime import、KaTeX JS/CSS 和 dev-only 排除；
- alpha4 安装、最小功能、卸载和 rc2 回退；
- owner-operated clean replay；
- owner attestation 和 same-owner replay 的限制说明；
- 本地测试、审计和回退证据。

以下项目改为条件项：

- 第二位人员的 independent verification；
- 公司 publisher identity；
- 公司签名服务、透明日志和 revocation；
- 公司格式的 final attestation；
- 公司 formal clean-machine receipt。

条件项不能被删除。项目只做本机或内部 owner-controlled 使用时，它们可以保持 `FORMAL_EXCEPTION_REQUIRED` 或 `NOT_APPLICABLE_BY_SCOPE`，前提是 owner 记录范围、风险和回退条件。

## 对外分发 profile

只要 artifact 要发给其他团队、进入公开 registry、生成 GitHub Release、交给生产环境或切换杭州入口，publisher identity、signature、independent verification、revocation、final attestation 和 clean-machine 必须全部取得真实回执。单人团队可以由 owner 执行 runner，但不能把 owner self-signature 写成公司批准签名。

## 合并、推送和上线的边界

- 源码 merge 和 push 只证明代码交付，不能把 SDK artifact 标成可分发。
- 本地或内部 owner-operated 验证可以支持代码审查和候选保存。
- 对外发布、生产 activation、GitHub Release 和杭州切换仍按 [AGENTS.md](../../../AGENTS.md) 分别授权和验收。
- 当前用户尚未明确选择“内部 owner 使用”还是“对外分发”。因此本 profile 只做范围澄清，不改变 `M2-07=BLOCKED`、`M2-08=NOT_RUN` 或 `release_ready=false`。

## 建议的最小单人路径

1. 继续使用已经通过的 owner-operated technical closure、same-owner replay 和 clean replay。
2. 代码 review 只审实际代码和行为验证，不把 publisher 门禁混入普通源码 merge。
3. 如果目标是内部使用，记录 owner exception、范围和回退，保持外部分发门禁为条件项。
4. 如果目标是对外发布，再启动完整 publisher/signature/revocation/final-attestation/clean-machine 链。
