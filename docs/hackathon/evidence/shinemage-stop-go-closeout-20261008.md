# 2026-10-08：既有 stop/go 指标证据收尾

本轮只读取既有原始 JSON 和控制器，形成可核验的指标记录；没有重跑更新、取消、宿主验收或目标任务。四指标的证据仍不齐，**不作正式人工 GO 决定**。物理分仓、独立 CI/发布与独立 DSH 升级沿用既有 stop/go；`release_ready=false`，SDK 分发仍 BLOCKED。

固定身份：当前 candidate `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`，workbench 包 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`，服务源码 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`。只读正式 journal 仍为 seq 3 / `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`，三个事件的 candidate/pack 均一致；没有目标宿主事件。candidate 自身 activation、rollback 仍 NOT_RUN，未提供 previous-profile，不能从本页的历史回退推断当前候选已可切换。

[机器记录](shinemage-stop-go-closeout-validation-20261008.json)保存 30 个来源的绝对路径、文件摘要、实际字段、控制器计时范围及缺口；它与 A 执行树 `.context/checks/stop-go-closeout-20261008/summary.json` 同字节。

| 原定指标 | 原始证据能确认的实测 | 未关闭部分 |
|---|---|---|
| 插件变更到可回退 candidate 的 lead time / P95 | 原更新 runner 一次准备 `pack_ms=908`；十个异质场景各自总耗时 4,236–6,136 ms，全轮开始到结束 50,806 ms。正式当前 journal 的 INTENT→PREPARED 两次记录相隔 14 ms。 | 上述数字都不是变更到可回退候选 lead time；14 ms 仅是 journal 写入区间。没有十次同边界、同维护者环境的候选样本，未形成冷/热基线、认可目标或该指标 P95，值保留 null。 |
| 失败恢复有界 | 中断前未 ready、摘要拒绝、在途 kill、prepare 拒绝后的 `openSession` 恢复分别 783 / 791 / 734 / 734 ms；旧组合回退 731 ms；UNKNOWN 保存首次重放 359 ms。每个恢复分支只有一次直接恢复调用。真实 SIGINT / SIGTERM 记录为 0.404 / 0.398 s，退出码均 2，owned host 已不存在、后九项 NOT_RUN、保护端口不变。 | 恢复计时从失败/停止完成后开始，包含 prepare、启动及 synthetic 会话验证，不含之前停止/失败、之后 pointer 写入。取消计时还包括等待退出、读 summary 及检查 PID；20 s 是探针 wait 上界，不是认可 SLO。没有正式恢复时间/重试数上限；进程重启期间不能宣称旧 profile 始终不中断。 |
| 故障隔离 / native 恢复 | 原第九场 native 重开 723 ms、恢复新组合 730 ms。后续固定宿主原始 evidence 有 10 行 PASS，含加载后阻塞、进程级重启、native 回退和旧组合/会话恢复；记录明确 `in_process_containment=UNSUPPORTED`。当前 candidate 的既有本机记录另有在途 SIGKILL 恢复、50 事件前缀及 native fallback 两项观察 PASS。 | 原十场与后续宿主证据绑定历史 CRM/knowledge 包，不是当前 b75d90 的目标组合验收；当前 candidate 记录只证明已有本机 synthetic 范围。不能宣称任意插件进程内热插拔、真实模型、WSL 或生产恢复。 |
| 维护成本 / owner | 已有 policy 明确 10 个控制入口的逻辑 owner：release-control、build-tooling、architecture-maintainer、host-dev-adapter、deploy-owner、backend-services。 | 限定阅读计划、边界 policy/文档、平台和作者 quickstart，没有找到每周升级/审查/发布人工分钟及其基线；build / receive / UAT / cutover / rollback / cleanup 六职责的具名主备 owner 均未确认，留 null。边界文档明确逻辑 owner 不能替代现场 RACI。不扫描个人日志，不把 agent 名称或用户自动填为 owner。 |

十场原始 `record.json` 中，WAL 前缀和固定组件保持记录均为 true，owned 存活 PID 均为空；第七场是提交后 UNKNOWN 的幂等重放，分析记录从 1 增到 2，不能误写成十场业务数据字节都不变。第八场只覆盖 prepare 拒绝，不算加载后故障；加载后阻塞依据独立 `runtime-failure-r2/evidence.json`。

主要原始来源（完整绝对路径与 SHA-256 在机器记录）：

- A 原树 `.context/checks/abc-followup-20261008-r1/ten-scenarios/summary.json` 及其 `runs/*/record.json`；取消控制器 `cancel-real-host.py` 与 `real-host-cancellation.json`。
- A 原树 `.context/checks/abc-closeout-20261008-r1/runtime-failure-r2/evidence.json`，不是保留失败的 r1。
- 本树 `.context/checks/candidate-admission-20261008/local-v4/test_official_host_crm_query_s0/official-host/recovery-observations.json`。
- 集成树 `docs/plans/shinemage-plugin-platform-split.md:196` 首期四指标、`:1638` 未关闭 T10；`config/shinemage-plugin-boundaries.v1.json`、`docs/architecture/shinemage-plugin-boundaries.md:61` 逻辑 owner 限制。

## 正式目标可直接承接的入口与硬约束

沿用既有 [目标离线准备交接](shinemage-candidate-target-preflight-20261008.md)和本树 `.context/checks/candidate-target-preflight-20261008/commands-not-run-r2.json`；本轮没有重做 43/349 成员检查。source-only 或 combined terminal 二选一，精确参数已在机器记录引用。combined runner 的 source HTTP 子步骤成功后，才复制**当次** platform receipt 并生成 input-v5，再运行 terminal；旧 receipt 不进入新链。browser 仍需新 source receipt 和新 terminal 父事件。

正式 validator 要求实际 WSL2 Linux x86_64、UID 65534、Python 3.14：`source-target-evidence.mjs:101,107–111` 同时校验 actual-wsl2 scope 与内核含 microsoft/wsl2；`terminal-host-evidence.mjs:60–61,107–109` 再校验父事件与相同平台。固定 runner `terminal-target-20261007.py.txt:4` 和 source probe `:141–142` 也拒绝非 WSL2。**Docker `--platform linux/amd64` 的仿真环境没有等价准入分支**，不能改 gate、改 receipt 或用旧 CRM/WeKnora 镜像抵扣。

仍缺可明确执行的已授权 WSL2 目标及其真实新回执，目标执行保持 NOT_RUN；杭州禁令未变。正式 CI 仅引用主 Agent `ci-readiness.json` 的 plan-only 准备，`actual_checks_run=false`、`formal_ci=NOT_RUN`。这些缺口属于原任务收尾，没有追加平台功能或新方案。

本次没有修改产品源码、旧回执、正式 journal 或共享状态页，没有启动服务/目标、SSH、commit、push、PR、合并、发布或部署。
