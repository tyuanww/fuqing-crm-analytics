# Cordis 对接与 PR #120 CI 交付（2026-10-12）

本记录接续[本地应用与两包宿主验证](shinemage-cordis-formal-cutover-proposal-20261012.md)，保留原记录的捕获时点。本轮交付到新 PR 和实际 CI；没有合并 PR、发布或部署。机器记录见[validation JSON](shinemage-cordis-pr120-ci-delivery-20261012-validation.json)。

## Git 与远端检查

本记录捕获于 `2026-10-11T18:28:47Z`：成果分支 `codex/shinemage-abc-local-candidate` 的本地／远端代码 head 当时为 `bd96af9aa8d7c5172e8d10fcc9060277f53650e5`，[PR #120](https://github.com/tyuanww/fuqing-crm-analytics/pull/120) 当时 OPEN、MERGEABLE、CLEAN，14 个路径、4 笔提交。公开 main 为 `5943d4be`，不能把 PR 的成功写成新组合已经合入 main。后续文档交付的 HEAD、PR 计数和 CI 以实际 Git／PR 为准，本页结果不抵扣后续 head。

| 提交 | 目的与范围 |
|---|---|
| `2b98baaa` | fix(composition)：8 个组合守卫／测试／正式包锁路径 |
| `528271d0` | docs：5 份本地应用／宿主说明与证据 |
| `86826129` | chore(git)：普通 merge 同步 main 祖先，前后 tree 相同 |
| `bd96af9a` | test(release)：仅修正 host verifier 正向合成夹具的 Cordis 4.0.2 → 4.0.4 |

正常 push 第三轮 exit 0，原后端／工具／完整 B0 钩子通过。第一轮全局 Python 依赖不符、第二轮旧正向夹具失败均保留。夹具修复没有改断言、skip 或正式包；五个原回归文件在同次执行中 68 PASS／0 FAIL／0 SKIP，核心与本机独立审查无发现，外部 Claude/OCR NOT_RUN。

## 新工件与实际 CI

私有 Workbench 暂存分支的 `8f44bb64` 只交付准备清单中的 5 个包／索引路径，[上传 CI 38160012202](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38160012202) SUCCESS。真实 artifact `11710265230` 为 704352 字节，SHA-256 `fbef740af07cafc5bfd92bcc310bd9427d7e59eaed644114a0632a244df601f4`；下载摘要与 GitHub 相等，原 receiver 核对 18 成员、九正式包／两份 profile。仅 CRM／Knowledge 换成当前正式回执 `4be65420…`／`1ce746b6…`，其余七包及两份 profile 原字节保留。有效期至 `2026-10-25T17:31:36Z`。

主仓三项非敏感 artifact 变量已更新并回读，专用 read Secret 未修改。新变量绑定 PR #120 的组合，旧 main 的成功记录不证明其使用新输入重新执行仍会通过。

| 验证对象 | 实际结果 | 范围 |
|---|---|---|
| 本地正常 pre-push | 后端 3237 PASS／78 SKIP／0 FAIL／0 ERROR；12 JUnit、3315 testcase 无重复；完整 B0 exit 0 | 本机 Python 3.14.4、Node 24.19.0、分别锁定的 backend/B0 依赖和新独占输出根 |
| [PR #120 主 CI 38162446612](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38162446612) | SUCCESS；test、B0、lint、路径选择与 merge-gate 均成功 | 当前 head `bd96af9a`；五个路径未选 job 保留 SKIPPED |
| Ubuntu 后端工件 `11711176564` | 3235 PASS／80 SKIP／0 FAIL／0 ERROR；12 JUnit、3315 testcase 无重复 | ZIP digest `709aaec0…` 已核对；实际 Python 3.14.8；GitHub 合成 checkout `bbee6ed3` 的两个父提交是 main 和当前 head |
| Ubuntu B0 原始日志 | Python 862 PASS、41 subtests PASS、23 warnings；原入口成功标记 | opt-in/platform 跳过保留；Workbench 私有 core 仍归固定作者 CI，不与主仓重复相加 |
| [rc2 preflight 38162446076](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38162446076) | SUCCESS；head 绑定工件 `11711003667` | CI 预检构建，不是 GitHub Release 或生产验收 |

各层、平台与历史数字分别记账。原始命令、日志、输入摘要、CI 元数据和 SHA-256 位于 `/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/remote-delivery-r1/`；[完整回执](/Users/hutou/.codex/tasks/shinemage-cordis-formal-proposal-20261012-pv41ov3x/remote-delivery-r1/remote-delivery-validation-r2.json)与本页机器记录列明原文件摘要。状态读取的一次 TLS timeout 和 CLI 拒绝原始日志终端控制字符均另行留存，未改 TLS、测试或 CI 门禁。

## 当前准入缺口

两份当前 profile `config/dsh-profile.crm-knowledge.rc2.json`、`config/dsh-profile.rc2.json` 的字节未变，均无 `service_binding`。当前九包输入还没有生成相应的新插件 candidate、服务／platform／terminal／browser 回执和正式 journal；没有连接目标或运行服务。既有两包官方 npm 宿主 18 项只是服务未连接的开启／原生回退／恢复，不抵扣带服务的完整组合链。

[2026-10-10 准入预检](shinemage-formal-admission-preflight-20261010.md)中的 candidate／b75／服务源码及旧未执行状态只属于当时对象。它保留流程参考，不能当作本次九包输入或用旧 headed／WSL／journal 关闭本次准入。

后续仍按原顺序：独立接续当前文档，获合并授权后做适用 QA／普通 merge／实际新 main CI；正式组合冻结带服务绑定的现有输入后再做同一组合的新目标／terminal／browser／恢复链；真实 CRM／WeKnora／模型／UAT 与 standalone 需各自有效输入。SDK 分发和独立 DSH 升级分别按原门禁收尾，不把 SDK BLOCKED 泛化为每次插件更新都不能进行。

捕获时本次文档接续尚未提交、未推送，JSON 的 `captured_doc_git_delivery` 仅记录这一时点；后续 Git 动作另按实际授权和 HEAD／PR 核验。没有新的插件 candidate 或正式 journal，不改 VERSION／DSH pin／上游／peer。旧失败与历史证据保留，任务外 `security-audit-skill/` 不读、不提交、不清理。产品 PARTIAL、SDK 分发 BLOCKED、`release_ready=false`。
