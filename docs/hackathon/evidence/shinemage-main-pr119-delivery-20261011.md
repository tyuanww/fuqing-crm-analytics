# 主仓 PR #119 推送、祖先同步与私有 CI 输入（2026-10-11）

记录本轮实际主仓交付；[机器记录](shinemage-main-pr119-delivery-20261011-validation.json)固定本次对象，不累计历史或作者仓 PASS。当前最新文档提交看 Git，以下源码身份与运行结果属于列明提交。

## Git 与审查

主仓 feature 为 `codex/shinemage-abc-local-candidate`。15 笔分组交付、STATUS 短表修复 `28c7fde2`、结果提交争用修复 `de196938` 均已正常推送到 [PR #119](https://github.com/tyuanww/fuqing-crm-analytics/pull/119)。指定 main `4859d136` 已按授权以 merge 提交 `3cee76f0` 合入 feature 并推送；两父分别为 `de196938` 和 `4859d136`，文件树同为 `416501ff9d5f31519c31bf89b9f86c3b5829c422`，无内容变化。PR 仍 OPEN／MERGEABLE，当前门禁 BLOCKED；没有合并 PR。

OCR delegate 对当前 216 个 PR 路径核对实际字节：153 个可审文件与 63 个排除文件全部处理，无开放代码发现；规则和选文件由 OCR 提供，审查由主 Agent 完成，没有外部 LLM 审查。默认排除的测试／证据人工补查。旧审查只在 SHA-256 一致时继承；文档本轮增量另审，不把 216 个路径称作外审通过。

## 修复与本地验证

SQLite 短时写锁会令已完成计算的结果提交失败。本轮先用真实已退出子进程及独立 SQLite writer 锁复现，再追加修复：只对 SQLite BUSY／LOCKED 原因的 `STATE_UNAVAILABLE` 结果事务最多重试三次，不重启计算、不延长 deadline，每次重新核验权限与原 run／step／绑定。持续争用、撤销与非争用错误不降级为成功。原 Ubuntu native HTTP 失败新增有界诊断；新远端是否关闭该失败，以真实新结果为准。

| 对象 | 本次实际结果 | 范围 |
|---|---|---|
| worker 受影响六文件 | 129 PASS / 0 FAIL / 0 SKIP；Ruff exit 0 | SQLite／进程／权限合成回归；不是生产或目标宿主 |
| `28c7fde2` 正常推送钩子 | 后端 3230 PASS / 78 SKIP；前端 build、29 文件 / 223 单测；完整本地 B0 `--check` exit 0 | 修复前提交，不能写为当前后端计数 |
| `de196938` 正常推送钩子 | 后端受影响 60 PASS；完整主仓 B0 `--check` exit 0 | Workbench core 仍归固定作者 CI，不重跑私有实现 |
| `3cee76f0` 正常推送钩子 | 完整后端 3237 PASS / 78 SKIP / 0 FAIL；12 JUnit，3315 个唯一 testcase，重复 0 | 空文件差异由现有钩子选择完整后端；不绕过钩子，前端/B0 未在这轮重复执行 |

环境保持本机 Node 24.19.0、Python 3.14.4 和锁定 B0 Python；新后端隔离环境按 requirements-lock 安装。r1 缺依赖、r2 STATUS 过长的推送失败仍保留；80 行短表合同保持，原文在 STATUS-HISTORY，不放宽检查。

## 私有工件与主仓变量

私有 Workbench 暂存分支 `codex/ci-composition-inputs-20261011` 提交 `531dff48` 只新增已审 21 路径；作者 PR #1 仍在 `6c5adc9f`，没有修改其源码、peer 或分支。九个正式回执和九个 tarball 逐字节保留，另有 inventory、stdlib verifier 和分支专用上传 workflow；不是重新生成正式包、candidate 或 release。

[实际上传 CI 38143033361](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38143033361) SUCCESS。工件 ID `11704150412`，704355 字节，SHA-256 `a98624139eb9dca81bc97ec02bdb9a7eeb756c27863e35634f68fc1dcc266371`；下载 ZIP 与 API digest 相同，18 个 payload 成员与原输入一致。主仓实际 `scripts/ci/composition-pack-inputs.mjs --archive` receiver 已通过九包／两份既有 profile 来源、回执、tarball 和 guard 核验。它只准备运行输入，没有启动宿主或验收组合。

主仓三项非敏感 Actions Variables 已配置并回读一致：

- `SHINEMAGE_PACK_ARTIFACT_REPOSITORY=tyuanww/dsh-analytics-workbench`
- `SHINEMAGE_PACK_ARTIFACT_ID=11704150412`
- `SHINEMAGE_PACK_ARTIFACT_SHA256=a98624139eb9dca81bc97ec02bdb9a7eeb756c27863e35634f68fc1dcc266371`

工件到期 `2026-10-25T13:24:26Z`。到期后实际重新上传相同固定输入、核验新回执，再更新 ID/digest；不能延用过期工件或用本机 ZIP 摘要替代 Actions ZIP。私有载荷没有写入公开主仓。

## 远端结果与需要用户配置的输入

[source merge 的 release preflight 38143499305](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38143499305) 的 `Verify the reviewed source` 已 PASS，原 ancestry 失败关闭；随后 `Receive fixed Workbench author core evidence` 因空 `GH_TOKEN`、`WORKBENCH_AUTHOR_AUTH_REQUIRED` 失败，后续 B0／发布检查未执行。[同提交 CI 38143499513](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38143499513)在本次记录时仍执行中，不能报总体通过。最终 docs 提交会有自己的新 CI，以实际 PR head 为准。

用户仍需在[主仓 Actions Secrets](https://github.com/tyuanww/fuqing-crm-analytics/settings/secrets/actions)直接配置 `SHINEMAGE_PLUGIN_READ_TOKEN`：fine-grained token 的 owner 为 tyuanww，仅选择 Workbench、CRM、shine-brand、board-components 四仓，权限 Actions read、Contents read。主仓普通 GITHUB_TOKEN 不提供这四仓的读取权限；没有把个人 gh 登录复制到 CI，也没有读／设置 token 值。配置名称可回读，token 不放在聊天或 Git；配置后实际重跑失败的输入准备，检查来源/digest/run，不放宽门禁。权限依据：[GitHub artifact API](https://docs.github.com/en/rest/actions/artifacts)、[fine-grained 权限](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)。

## 保留边界与原始材料

本轮 worker 改变服务源码，旧 candidate、服务、headed、WSL2 或 journal 不继承到新字节。CRM／Knowledge peer 4.0.2 与固定 runtime 4.0.4 仍待授权校准；D/E 五仓仍无独立 tsc。SDK 分发按实际适用门禁保持 BLOCKED；真实模型／CRM／WeKnora／业务 UAT、当前正式组合服务／目标／terminal／browser／恢复与 standalone 输入继续开放。产品 PARTIAL，release_ready=false，VERSION 0.20.0.0；没有生成新 candidate/journal，没有合并、发布或部署，不勾父任务，不删旧源码。

原始材料在 `/Users/hutou/.codex/tasks/shinemage-main-pr-delivery-20261011-5rn503ab/`：push-r3/r4/r5 的完整日志及 result、push-r5-backend-validation-r1.json、worker 修复前后与 targeted 日志、OCR preview/rules/逐路径审查、merge 前后记录、ci-staging upload run/jobs/artifact metadata、下载 ZIP、实际 receiver 回执、三变量配置回读和失败 CI/preflight 日志。仅本任务验证输出，生产数据与任务外 `security-audit-skill/` 保持不动。92 份历史证据同字节保留。
