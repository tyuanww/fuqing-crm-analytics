# 八个独立插件的远程仓、PR 与 Ubuntu CI（2026-10-09）

本轮完成既有独立化队列的远程交付：八个作者仓分别创建私有 GitHub 仓库、推送、建立 PR，并实际通过完整 Ubuntu 构建 CI。沿用已审查的功能首次提交初始化各仓 `main`；CI 配方与修复分别保留为 `chore(ci)`、`fix(ci)`。八个 PR 均保持 OPEN，未合并、发布或部署。shine-brand 的既有交付未改。

主集成树起点与结束仍为 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`；起点 110 项未提交内容保留，仅更新本轮五个文档入口和新增本页/机器记录。没有提交主树、改变 VERSION、产品源码、候选或 journal。

## 分仓提交与远端结果

| 作者仓 / PR | 首次功能提交（main） | CI 配方提交 | 本次 fix(ci) / PR head | 完整 PR CI |
|---|---|---|---|---|
| [analytics-workbench #1](https://github.com/tyuanww/dsh-analytics-workbench/pull/1) | `cc1dd6a9` | `aa56dbeb` | `76d00f27` | [PASS / 37875348316](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/37875348316) |
| [crm-knowledge #1](https://github.com/tyuanww/dsh-crm-knowledge/pull/1) | `12b82593` | `73efd8bc` | `22bd8099` | [PASS / 37875375168](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/37875375168) |
| [knowledge #1](https://github.com/tyuanww/dsh-knowledge/pull/1) | `d9e26776` | `5c4a775a` | `9b7c60c3` | [PASS / 37875378986](https://github.com/tyuanww/dsh-knowledge/actions/runs/37875378986) |
| [shine-query #1](https://github.com/tyuanww/dsh-shine-query/pull/1) | `258a3449` | `7220fa65` | `5d92be4e` | [PASS / 37875384134](https://github.com/tyuanww/dsh-shine-query/actions/runs/37875384134) |
| [shine-board #1](https://github.com/tyuanww/dsh-shine-board/pull/1) | `49b00e08` | `613ba48f` | `4f248e6c` | [PASS / 37875386821](https://github.com/tyuanww/dsh-shine-board/actions/runs/37875386821) |
| [shine-crowd-action #1](https://github.com/tyuanww/dsh-shine-crowd-action/pull/1) | `51f8088d` | `680f01c2` | `68398dc5` | [PASS / 37875390716](https://github.com/tyuanww/dsh-shine-crowd-action/actions/runs/37875390716) |
| [shine-funnel #1](https://github.com/tyuanww/dsh-shine-funnel/pull/1) | `1c71c04b` | `e3f6a04b` | `ab924632` | [PASS / 37875393112](https://github.com/tyuanww/dsh-shine-funnel/actions/runs/37875393112) |
| [shine-waterfall #1](https://github.com/tyuanww/dsh-shine-waterfall/pull/1) | `632867cb` | `8110c61f` | `c4b7b1ae` | [PASS / 37875394817](https://github.com/tyuanww/dsh-shine-waterfall/actions/runs/37875394817) |

每个仓现有三个按事件划分的提交：首次功能、CI 配方、CI 路径修复；工作区干净。远端均为 private、默认分支 main；PR base 仍是该仓首次功能提交，head 为上表修复提交。GitHub Actions 实际 checkout 是 `refs/pull/1/merge` 的合成提交，已分别记录其 SHA，并通过 Git API 核对八个合成提交的 tree 等于各自作者 HEAD tree，不能把 run.head_sha 当作 checkout SHA。精确身份见[机器记录](./shinemage-eight-remote-delivery-20261009-validation.json)。

## 实际修复与审查

首轮完整工作流在 job 创建前失败：`jobs.<job>.env` 不能读取 `runner.temp`（[官方上下文范围](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)）。每仓只修改一份 workflow，将同样六个路径移到第一个 Bash step，通过 RUNNER_TEMP / GITHUB_ENV 初始化。固定输入、action SHA、权限、构建与测试命令不变。

独立复核另发现：若初始化中断，always 上传会把空的 CONTENT_PACK_OUT 加斜杠变成根路径。现要求 INPUT_ROOT 与 CONTENT_PACK_OUT 都非空；后续构建失败仍保留 always 收证据。最终主审与独立宿主内复核均无遗留发现；没有执行本轮外部 OCR/Claude 审查。

固定 actionlint 1.7.7 仅在任务目录使用、归档摘要匹配官方 checksums。每仓修复前六条上下文诊断 / exit 1，修复后所有 workflow exit 0；实际 shell 普通路径、含空格及 `$` 的路径传递通过，缺 RUNNER_TEMP 的负测 exit 1 且未写 env 文件。上传条件按代码和官方语义复核，未执行根目录上传或伪造远端失败注入。八笔提交均只含本仓这份 workflow，插件源码、peer、版本、kit 和领域包字节未变。

## 本次 Ubuntu 执行证据

八仓均由 GitHub 托管 ubuntu-24.04 / Linux x64 runner 从远端固定源码准备新输入，实际 Node 24.19.0、Python 3.14.4；prepared-inputs 的 source_local=null。上游 `477b4f420553e8a52c2fbccc464d7561b239c443`、tree `e3e63253d1d35ad07f785273235c40813cb6c8bd`、锁摘要 `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa` 均匹配。上游安装使用 pnpm 11.7.0，作者/build-tools 使用 11.28.2，受跟踪上游源码未改。

这是本轮实际冷环境准备及消费者运行，不再仅沿用本地容器记录。CRM/Knowledge 使用 108 个官方 npm 包 / 1495 个 lib 文件，其余六仓使用 106 / 1482，获取记录与对应输入锁匹配。准备允许 GitHub/npm 网络；作者 kit 使用 offline frozen 安装。没有声称整台 runner 禁网，也没有重建 DSH。

| 仓 | 本包 / 边界测试分组（各组 0 FAIL / 0 SKIP） | 类型检查 | 内容包 SHA-256 前缀 / 字节 / 成员 |
|---|---|---|---|
| analytics-workbench | 本包 193；边界 5 | PASS | `920183d4172d` / 441102 / 8 |
| crm-knowledge | 本包 103；边界 11 | PASS | `53c6ecd71ae2` / 244181 / 6 |
| knowledge | graph 22、service-client 5、package 5、identity 12、author-boundary 5 | PASS | `5bb2e8f4e099` / 17140 / 5 |
| shine-query | lifecycle 2；boundary 5 | NOT_IN_CURRENT_BUILD | `b141df60cea6` / 1446 / 5 |
| shine-board | lifecycle 2；boundary 5 | NOT_IN_CURRENT_BUILD | `da091814cc64` / 1538 / 5 |
| shine-crowd-action | lifecycle 2；boundary 5 | NOT_IN_CURRENT_BUILD | `6a855bdce765` / 1622 / 5 |
| shine-funnel | 计算 2；lifecycle 1；boundary 7 | NOT_IN_CURRENT_BUILD | `c27fda09ad76` / 2429 / 8 |
| shine-waterfall | 计算 1；lifecycle 1；boundary 7 | NOT_IN_CURRENT_BUILD | `ab7b8be91dec` / 2924 / 8 |

每个完整 PR job 另有 process-group 3 项和 preparation-guards 6 项通过，分开留证。Workbench 轻量边界 workflow 的通过不替代完整链；push 与 pull_request 两次触发不相加。D/E 五仓构建没有独立 tsc，不能把固定编译器版本检查写成类型检查通过。CRM/Knowledge 的 cordis peer 仍为 4.0.2，固定 SDK 实际为 4.0.4；本轮未放宽 peer，CI 不证明真实宿主兼容。

主 Agent 读取原始 run/jobs、准备回执与实际 tarball，复算 artifact ZIP 与 GitHub API digest 相等；八份内容包压缩摘要及成员与各自前轮本地 Linux 包同字节。内容包仍非 formal packPlugin/candidate，不继承旧包的 headed、WSL2 或业务验收。

## 证据留存与剩余边界

原始任务目录 `/Users/hutou/.codex/tasks/shinemage-eight-remote-delivery-20261009/` 保留建仓/push/PR 回执、首轮解析失败、网络重试、修复补丁/审查、CI 原始日志、artifact ZIP、输入回执和内容包。集成归档为 `.context/checks/eight-remote-delivery-20261009/archive/`，1099 文件 / 9350161 字节；索引 `archive-manifest.json`，SHA-256 `e7e29e839fe687bef1bf23efe303e68119953c11d698da62c24640ac89d2cc1c`。两份归档副本只脱敏临时签名 URL 查询参数，原文件保留，索引分别记录原始与副本摘要。未覆盖历史失败。

只关闭八仓远程创建、push、PR 与本次完整作者仓 CI 子项。合并、独立版本/发布流程、适用宿主/服务组合、真实 CRM/WeKnora 权限及业务验收、独立 DSH 升级与回退仍按原队列推进；不补做无关功能，不勾完 T1/T15/T19/T21。SDK 分发仍 BLOCKED，仅对实际适用门禁记账；产品 PARTIAL、release_ready=false。主树全量 B0、candidate/journal 准入及历史外审缺口未由本轮重新执行或关闭。
