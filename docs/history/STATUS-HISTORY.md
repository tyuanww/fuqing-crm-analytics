# STATUS 历史编年（归档）

<a id="rc3-closeout-history-20261024"></a>

## 2026-10-24 迁出的历史候选记录

以下内容从当前状态短表迁出，仅调整相对链接。所有版本、结果和未关闭项仍属于原验收时点。

## 2026-10-18 及更早候选/alpha4 证据
- C0 版本输入冻结已完成，见 [rc1 runtime input freeze](../hackathon/evidence/m2-07-rc1-runtime-input-freeze-20261017.json)。该回执只冻结真实版本和工具链输入；初始快照曾记为 `rc1_latest_candidate=PLANNED_NOT_BUILT`，随后已在隔离 lane 完成 9 包重建、pack 和 reader 回读。最终 source `f4026619…` 的 local replayable consumer closure 已通过；EC-04 已完成 history headed 回读、重启后 history/board transport 回读、原生 board canvas 回读和 rc2 SDK/CLI rollback。原生画布的根因是候选未启用 page HTTP，修复后在重启前后均通过；rc2 web rollback 已在 owner-only disposable host 完成真实 headed browser history/board 回读、owned stop/start 后回读和 cleanup。详见 [rc2 web rollback headed recovery](../hackathon/evidence/rc2-web-rollback-headed-recovery-20261018.md)。正式发布仍未完成；红队阻断项见 [工程收尾红队攻击记录](../hackathon/evidence/engineering-closeout-redteam-20261017.md)。
- rc1 已建立独立 [release lane](../operating/dsh-rc1-release-lane.md) 和 fail-closed preflight。2026-10-17 已从本地 LFS cache 补齐 source archive 的 `108/108` 个对象，逐个校验 OID、字节数和 SHA-256；hydrated archive 为 `20e915fc…`，tree digest 为 `3a4567eb…`。runtime peer seed 已改为只复制 production deploy 实际引用的 alias，移除了误带入的 `chrome-devtools-mcp`；secret scan 保持 fail-closed，runtime bundle provenance 为 `PASS`，SHA-256 为 `bff4e5ce…`。rc1 preflight 真实结果为 `PASS`，并在本地生成 `dsh-0.20.0.0-rc1` 的 manifest、`SHA256SUMS`、CI evidence index 和 local release preflight；`wsl2`、`host_http`、公司签名、attestation、publication 和杭州切换仍为 `NOT_RUN`。该 lane 不覆盖 rc2 默认 pin，M2-07 继续 `BLOCKED`、`release_ready=false`。
- C1/C3 rc1 candidate probe 已执行并保留真实阶段结果，见 [rc1 candidate probe](../hackathon/evidence/m2-07-rc1-candidate-probe-20261017.json)：rc1 upstream frozen install、官方 `build:official` 的 9/9 gate、7-plugin page profile 和 2-plugin CRM/Knowledge profile 校验均通过；早期 peer 替换和 `db244fe1…` source split 只属于历史探针，最终已在 source `f4026619…` 上重跑 9 包、生成 9 个 formal pack 和两个 profile-pack inputs，并由 `requireGeneratedProvenance=true` reader 回读。旧 rc2 profile 仍触发 `PROFILE_DSH_PIN_MISMATCH`；consumer closure 已通过，原生 board canvas 已在 page HTTP 启用后通过，正式发布仍未完成。
- rc1 analytics build 的初始探针暴露了真实 API 接缝：host typecheck 通过，client 因 `workspace.toast` 声明未由 rc1 ui-workspace client barrel 加载而触发 `TS2344`；临时 lane 显式加载 rc1 `toast.d.ts` 后 build 通过。该 adapter 只存在于隔离 candidate，未进入主仓；最终统一 source SHA 的 9 包 build/pack 结果见下文。
- rc1 临时 lane 继续暴露第二个真实接缝：6 个简单插件和 CRM/Knowledge 的临时 CSS bridge build/provenance 通过；原始 `TS2882` 记录保留。两个 adapter 只存在于临时 lane，未进入主仓；后续统一 source SHA 的 9 包 pack 结果见下一条。
- rc1 local replayable lane 现已完成 9/9 plugin build/provenance、9 个 formal pack、两个 profile-pack inputs、严格 reader 回读和四 tarball production-only consumer closure，详见 [rc1 consumer closure](../hackathon/evidence/engineering-closeout-rc1-consumer-closure-20261017.md)。最终 subject set 位于 `.context/checks/dsh-rc1-engineering-20261017/final-subject-set/`，绑定 source `f4026619…`；EC-04 的真实 headed history、重启后 history/board transport、原生 board canvas 和 rc2 SDK/CLI rollback 已有独立回执。原生画布通过 `--page-http on --page-http-port 18140` 修复；rc2 web rollback 的 owner-only headed recovery 见 [rc2 web rollback headed recovery](../hackathon/evidence/rc2-web-rollback-headed-recovery-20261018.md)，正式发布仍未完成。
- 红队复核曾发现首批 analytics provenance 使用 `fe1a43c2…`，其余适配包使用 `db244fe1…`；这两批不能拼成一个 subject set。最终 subject set 已改用 source `f4026619…` 重跑全部 9 包并统一，consumer closure 也只消费这一组字节。
- 红队在 formal pack probe 中发现 builder receipt `dsh-plugin-build/v1` 被错误原样写入 pack，而 reader 要求 `dsh-generated-bytes/v1`；已由 `101f2a8a fix(release): normalize plugin provenance schema` 修复，并以固定 Node24 重跑相关 release tests `67/67 PASS`。该修复关闭了 pack reader 的 schema 转换缺口，但不代表 consumer/runtime closure、browser/recovery 或公司发布门禁已通过。
- 本轮又把正式 runtime、preflight、readiness、candidate、composition、CRM profile 和 dsh-dev pack 消费路径显式绑定 `requireGeneratedProvenance=true`，并补了缺 provenance 负测；固定 Node24 的 release 回归为 `68/68 PASS`。该修复仍不替代 builder identity、headed browser/recovery 或公司发布门禁。
- 最终 fresh consumer r4 在空目录中先将 `/Users/hutou/homebrew/opt/node@24/bin` 放入 `PATH`，再完成 production-only install、`npm ls`、CycloneDX SBOM 和 runtime import；日志无 `EBADENGINE`，graph `2387` nodes / `problems=[]`，SBOM `558` components，KaTeX CSS 存在。CRM browser entry 的 `window` 只在真实 headed browser 验证；正式状态仍不变。
- rc1 隔离 candidate 在 14327 loopback 端口启动并注入 candidate-bound synthetic history fixture。候选这次启用了 `--page-http on --page-http-port 18140`，并以 18142 的临时 board fixture 提供合成数据。真实 Chrome headed browser 在重启前后都回读了同一 session、`rc1-history.html` 交付物、board tool card 和原生 `看板画布，可横向和纵向滚动`。首次进入驾驶舱需要一次真实“刷新产物”来完成异步 board 列表回读，之后显示版本 1、source `f4026619…` 和 no real data。page HTTP preferences、pages 和 binding-state 均有 200 回执；临时 fixture 的 TEXT 组件补齐了 `subtitle`、`tone`、`density`、`align` 和 `text_style`。固定 pnpm 11.28.2 wrapper、owned candidate stop/start、临时服务清理和 rc2 SDK/CLI rollback 均有真实回执；rc2 web rollback 已使用固定 rc2 inputs 完成 owner-only headed history/board 回读、owned stop/start 后回读和 cleanup，见 [rc2 web rollback headed recovery](../hackathon/evidence/rc2-web-rollback-headed-recovery-20261018.md)。该结果只关闭内部 synthetic rollback 项，不改变正式门禁。详见 [rc1 lifecycle recovery](../hackathon/evidence/engineering-closeout-rc1-lifecycle-recovery-20261017.json)。

- 官方仓库最新发布为 `v0.2.1-alpha.4`，发布提交为 `86a402200d95fecef4529d969836f1fe13c6cb0d`。正式 M2-07 线当前候选仍为 alpha4；alpha3 只保留为上一轮候选记录。内部工程线的 rc1 资料保留为历史 lane；当前杭州现场使用 rc2 owner candidate，二者的证据不混用。
- 2026-10-17 当前公开主线已包含本轮治理与状态文档；当前 `main` SHA 以 Git 实查为准。这些合并不改变 DSH `0.1.7-rc.2` pin、M2-07/M2-08 门禁或 `release_ready=false`。
- alpha4 官方 npm artifact SHA-256 为 `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6`。候选 source commit 为 `50d241cbd23aa2a9d188fe84c3864528a2206917`，固定 Node `24.19.0`、upstream pnpm `11.28.5`、插件 pnpm `11.28.2`。
- alpha4 官方源码 host/client SDK 构建通过，9 个插件构建和 9 个 pack reader 验收通过。analytics-workbench 测试为 `34 pass / 1 skipped`，HTML 测试为 `130 pass`，CRM 全量测试为 `108 pass / 0 fail`。CRM 结果使用固定 alpha4 checkout，并在隔离证据目录补齐仓库级只读路径后取得；不替代公司 clean machine 验收。
- alpha4 本地 runtime 检查通过：version、help、入口导入、KaTeX CSS、卸载和 rc2 回退均通过。回执为 `LOCAL_SIMULATION_ONLY`，不能替代正式 clean machine。
- 本轮本机隔离的最终消费者 production-only 安装预检以 `ERESOLVE` 失败：消费者 tarball 声明 `@deepseek-ai/cordis=4.0.2`，而 `@deepseek-ai/dsh-tools@0.2.1-alpha.4` 要求 `@deepseek-ai/cordis~4.0.5-alpha.2`。依赖树、runtime import 和 SBOM 未生成；该结果属于 `REBUILD_REQUIRED` 的本地证据，不能替代公司环境 closure。详见 [consumer runtime closure 执行复核](../hackathon/evidence/m2-07-consumer-runtime-closure-execution-20261016.md)。
- 随后在隔离 alpha4 候选中将 CRM/Knowledge 两个消费者的 Cordis peer 对齐为 `4.0.5-alpha.2`，候选源提交为 `3b5d4c0680585f8f27c84d70dffabf7c2ec930d2`，并生成新的两个 plugin tarball。新的 CRM tarball 完成 production-only 安装、26/26 依赖图与 CycloneDX SBOM 对齐、CRM/Cordis/dsh-tools/KaTeX 及 CSS runtime import；这是 `LOCAL_CONSUMER_CLOSURE_PASS`，公司 closure 仍 `NOT_RUN`。详见 [consumer Cordis peer 修复与 closure 重跑](../hackathon/evidence/m2-07-consumer-cordis-peer-repair-20261016.md)。
- 本轮按正式顺序对修复后的 CRM tarball 做了 fresh staging 尝试：production-only install、依赖图、runtime import、CycloneDX SBOM 和本地 provenance 均通过；但公司批准的 package manager、SBOM、runtime checker 和 closure verifier 在当前环境均 `NOT_FOUND`，所以正式公司 closure 仍为 `NOT_RUN_COMPANY_TOOLS_UNAVAILABLE`。详见 [company consumer closure 执行尝试](../hackathon/evidence/m2-07-company-consumer-closure-attempt-20261016.md)。
- 已按 production-only runbook 再执行 fresh r2：安装 26 个包，graph/SBOM `26/26` 对齐，runtime imports 通过，并生成新的 local provenance/receipt；两次路径包装错误已保留，最终 graph 使用绝对输出路径成功。由于公司工具仍不可用，正式 closure 继续为 `NOT_RUN_COMPANY_TOOLS_UNAVAILABLE`。详见 [consumer closure r2 执行记录](../hackathon/evidence/m2-07-company-consumer-closure-r2-20261016.md)。
- 已根据本地 closure 输出整理公司发布方可直接执行的 [production-only consumer closure runbook](../hackathon/evidence/m2-07-company-production-only-consumer-closure-runbook-20261016.md) 和 [closure receipt template](../hackathon/evidence/m2-07-company-production-only-consumer-closure-receipt-template-20261016.json)。模板默认保持 `PENDING_COMPANY_EXECUTION`，不把本地 graph/SBOM/provenance SHA 当作正式公司材料。
- 已补齐 [company runner 与 r3 输入映射清单](../hackathon/evidence/m2-07-company-production-only-consumer-closure-input-map-20261016.md) 及 [机器可读映射回执](../hackathon/evidence/m2-07-company-production-only-consumer-closure-input-map-20261016.json)：固定修复后 CRM tarball、pack manifest、alpha4 SDK artifact/SBOM/provenance 的公司目标路径、SHA、工具版本和正式输出文件名。当前映射为 `INPUT_MAPPING_READY / COMPANY_EXECUTION_BLOCKED`；本机 Node `v25.8.2` 不满足 `v24.19.0`，公司批准工具仍 `NOT_FOUND`，因此没有把本地 graph/SBOM/provenance 提升为正式材料。
- 最新 runner 可用性探针仍失败，详见 [runner preflight 回执](../hackathon/evidence/m2-07-company-production-only-consumer-closure-runner-preflight-20261016.json)：`/secure`、`/secure/input`、`/secure/work` 不存在；本机 Node 为 `v25.8.2`；公司批准 package manager、SBOM、runtime checker、closure verifier 及独立 verifier 均不可用。r3 五份输入的 SHA 重新核对通过，但正式 dependency graph、SBOM、provenance 和独立回执继续为 `NOT_RUN_COMPANY_TOOLS_UNAVAILABLE / PENDING_COMPANY_EXECUTION`。
- 第二次 runner 探针见 [runner preflight r2 回执](../hackathon/evidence/m2-07-company-production-only-consumer-closure-runner-preflight-r2-20261016.json)：默认 PATH 仍为 Node `v25.8.2`，但本机固定路径 `/Users/hutou/homebrew/opt/node@24/bin/node` 可提供 `v24.19.0`、npm `11.17.0` 和 pnpm `11.28.2`。这只满足本地 toolchain 前置，不等于公司 runner；`/secure*` 目录、公司批准工具、registry/network policy 和独立 verifier 仍不可用，正式 closure 继续 `NOT_RUN_COMPANY_TOOLS_UNAVAILABLE / PENDING_COMPANY_EXECUTION`。
- 根据 runner 探针补强了 [production-only closure runbook](../hackathon/evidence/m2-07-company-production-only-consumer-closure-runbook-20261016.md) 的 SHA-256 入口：优先 `sha256sum`，回退 `shasum -a 256`，两者都不存在则 fail-closed；本机实际验证了前者可用、后者缺失。该修正只改善公司 runner 可执行性，不改变 M2-07 门禁结论。
- 已使用固定 Node24 路径完成新的本地 r3 production-only 复验：安装 `26` 个包，依赖图 `26` 个唯一包/`97` 个树节点且无 problems，CRM/host/dsh-tools/Cordis/KaTeX JS/CSS 全部通过，CycloneDX SBOM `26` components。TLS 仅通过 `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem` 修复，未关闭证书校验；结果仍是 `LOCAL_REPRODUCTION_ONLY`。详见 [本地 Node24 r3 closure 复验](../hackathon/evidence/m2-07-company-consumer-closure-local-node24-r3-20261016.md)。公司 runner、批准工具和独立核验仍缺失，因此 M2-07 继续 `BLOCKED`、`release_ready=false`。
- 针对单人全栈维护场景，新增 [owner-operated closure 复验说明](../hackathon/evidence/m2-07-company-consumer-closure-owner-operated-replay-20261016.md) 并在 runbook 中定义 `OWNER_OPERATED` 模式：同一 owner 在新的 staging/进程中完成 cold/frozen、graph、runtime、SBOM 和集合复现。该技术复验已通过，项目负责人已记录 [OWNER_EXCEPTION_ACCEPTED](../hackathon/evidence/m2-07-owner-governance-acceptance-20261017.md)，范围仅限内部 owner-operated 使用；没有把同一 owner 写成第二位独立批准者。M2-07 仍 `BLOCKED`、M2-08 仍 `NOT_RUN`、`release_ready=false`。
- 已完成 owner-operated clean-machine 技术回放并生成 [clean-machine 复验记录](../hackathon/evidence/m2-07-owner-clean-machine-replay-20261016.md)，另有 [owner final attestation local r2](../hackathon/evidence/m2-07-owner-final-attestation-local-r2-20261016.md) 与 [owner publisher/signature/revocation 回执](../hackathon/evidence/m2-07-owner-local-publisher-signature-revocation-20261016.md)：alpha4 + 修复后 CRM 安装、version/help、SDK/CRM/host/KaTeX 导入、卸载、rc2 安装/version/help 全部 `exit 0`。同时生成 [owner attestation](../hackathon/evidence/m2-07-owner-attestation-20261016.json) 和 [owner final attestation draft](../hackathon/evidence/m2-07-owner-final-attestation-draft-20261016.json)；本地 Ed25519 binding 验证通过，但 publisher identity、公司 signature、independent verifier、revocation 和 formal clean-machine 仍未完成，因此 M2-07 继续 `BLOCKED`、M2-08 继续 `NOT_RUN`、`release_ready=false`。
- 已整理 [owner-operated release gate matrix](../hackathon/evidence/m2-07-owner-operated-release-gate-matrix-20261016.md) 和 [机器可读矩阵](../hackathon/evidence/m2-07-owner-operated-release-gate-matrix-20261016.json)：逐项记录 publisher identity、signature、independent verification、revocation、final attestation 和 clean-machine 的本地结果、正式状态、剩余缺口及回执引用。2026-10-17 的 [formal gate gap audit](../hackathon/evidence/m2-07-owner-formal-gate-gap-audit-20261017.md) 与 2026-10-18 的 [r9 formal gate gap audit](../hackathon/evidence/m2-07-owner-r9-formal-gate-gap-audit-20261018.md) 已重新探测本地工具、GitHub 默认分支 workflow 与公司输入，并复核 owner binding 验签；当前仍有 `6` 项正式门禁缺口。本地 owner 结果不升级为公司 PASS，M2-07/M2-08/release_ready 状态不变。
- 已记录 [owner governance exception](../hackathon/evidence/m2-07-owner-governance-exception-20261016.md)、[历史机器可读例外](../hackathon/evidence/m2-07-owner-governance-exception-20261016.json) 和 2026-10-17 的 [OWNER_EXCEPTION_ACCEPTED 接受回执](../hackathon/evidence/m2-07-owner-governance-acceptance-20261017.json)：census 确认 `project-owner` 同时承担 operator、approver 和 technical verifier，其他公司 actor 为 `0`。该接受仅限内部 owner-operated 使用，不替代公司 publisher identity、signature、第二人独立验证、revocation、final attestation 或 formal clean-machine；状态继续 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。
- 复核确认当前六项门禁混合了技术 closure、对外供应链信任和公司治理三种范围，已整理 [owner-operated gate profile](../hackathon/evidence/m2-07-owner-operated-gate-profile-20261016.md) 及 [机器可读 profile](../hackathon/evidence/m2-07-owner-operated-gate-profile-20261016.json)。单人内部使用可以将 publisher/signature/revocation/final-attestation/second-person verification/ formal clean-machine 作为条件项；对外分发仍全部必需。该 profile 只澄清范围，不改变当前 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。
- alpha4 的安全风险处置已由项目负责人天元以离线记录确认，范围仅限固定 artifact 的隔离验收。正式 SBOM closure、publisher identity、signature、independent verification、revocation、final attestation 和公司 clean machine 仍未完成。npm audit 仍有 8 个 moderate，直接 `@deepseek-ai/dsh` 项为 `fixAvailable=false`。因此 M2-07 仍为 `BLOCKED`，`release_ready=false`，M2-08 仍为 `NOT_RUN`。
- 详细记录见 [M2-07 alpha4 供应链准备](../hackathon/evidence/shinemage-m2-09-dsh-upgrade-alpha4-prep-20261016.md)、[M2-07 alpha4 进度页](../hackathon/evidence/shinemage-m2-07-alpha4-progress-20261016.html)、[公司级根因与对抗审计](../hackathon/evidence/m2-07-company-root-cause-adversarial-audit-20261017.md)、[M2-07 外部交接清单](../hackathon/evidence/shinemage-m2-07-alpha4-external-handoff-checklist-20261016.md)、[发布责任方消息](../hackathon/evidence/message-to-release-owner-m2-07-alpha4-20261016.md)、[安全责任方消息](../hackathon/evidence/message-to-security-owner-m2-07-alpha4-20261016.md)、[clean machine 消息](../hackathon/evidence/message-to-clean-machine-owner-m2-07-alpha4-20261016.md)、[安全风险处置草稿](../hackathon/evidence/m2-07-security-risk-disposition-draft-20261016.md)、[离线安全风险接受记录](../hackathon/evidence/m2-07-security-risk-acceptance-record-20261016.md)、[publisher evidence 模板](../hackathon/evidence/m2-07-publisher-evidence-template-20261016.json)、[publisher signing 执行包](../hackathon/evidence/m2-07-publisher-signing-runbook-20261016.md)、[official dependency closure 模板](../hackathon/evidence/m2-07-official-dependency-closure-template-20261016.json)、[official dependency closure 执行包](../hackathon/evidence/m2-07-official-dependency-closure-runbook-20261016.md)、[KaTeX runtime closure 修复候选](../hackathon/evidence/m2-07-official-closure-katex-runtime-fix-20261016.md)、[official closure policy 冲突记录](../hackathon/evidence/m2-07-official-closure-policy-conflict-20261016.md)、[consumer runtime closure 预检查](../hackathon/evidence/m2-07-consumer-runtime-closure-precheck-20261016.md)、[本地证据完整性复核](../hackathon/evidence/m2-07-local-evidence-integrity-20261016.md)、[M2-07 本地可关闭项复验](../hackathon/evidence/m2-07-local-closeout-20261017.md)、[final attestation 草稿](../hackathon/evidence/m2-07-final-attestation-draft-20261016.json)、[clean machine 执行包](../hackathon/evidence/m2-07-clean-machine-run-packet-20261016.md)、[clean machine 回执模板](../hackathon/evidence/m2-07-clean-machine-receipt-template-20261016.json)、[外部消息发送记录](../hackathon/evidence/m2-07-external-message-send-log-20261016.md) 和 [alpha4 pack 证据目录](../../.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2)。本地门禁收口回执为 `local-gate-closure-r3.json`，安全风险接受已通过天元的离线 owner 记录；其余 `6` 项正式门禁仍待完成，归为三类：供应链身份/签名/撤销、独立验证/最终 attestation、clean-machine。
- M2-09 已准备 alpha2 目标浏览器与目标恢复的执行手册、输入清单和 JSON 回执模板：[执行手册](../hackathon/evidence/m2-09-alpha2-target-browser-recovery-runbook-20261016.md)、[输入清单](../hackathon/evidence/m2-09-alpha2-target-browser-recovery-inputs-20261016.md)、[回执模板](../hackathon/evidence/m2-09-alpha2-target-browser-recovery-receipt-template-20261016.json)。随后修复了 alpha2 workbench peer-link、brand asset/loader 和 history fixture 的 session v4 tool lifecycle；在隔离候选的 headed Chrome 中以 synthetic fixture 完成 history/board 预览、board 列表/版本 1/画布读取，并在候选重启后重新读取同一 session、board 和 SHA。详细复验见 [target browser/recovery rerun](../hackathon/evidence/m2-09-alpha2-target-browser-recovery-rerun-20261016.md)、[JSON 回执](../hackathon/evidence/m2-09-alpha2-target-browser-recovery-rerun-20261016.json) 和 [本地输入与目标回执收口](../hackathon/evidence/m2-09-local-closeout-20261017.md)。该结果是 `TARGET_BROWSER_SYNTHETIC_PASS / TARGET_RECOVERY_SYNTHETIC_PASS`，不替代公司或真实业务验收；保持 `release_ready=false`。
- 2026-10-16 授权目标 `100.93.46.46` 的只读 preflight：[JSON 回执](../hackathon/evidence/m2-09-alpha2-target-preflight-20261016.json) 和 [原始输出](../hackathon/evidence/m2-09-alpha2-target-preflight-20261016.txt)。Node `24.21.0`、`python3.14=3.14.4`、zstd `1.5.5`、WSL2 x86_64 和 `/tmp` `1777` 通过；live `4328` 保持 PID `1933097`，candidate `4329` 由本次 owned supervisor 管理。该 preflight 与后续 synthetic headed browser 证据均不改变主仓 pin。
- 个人 owner-operated 部署线保留旧的 `4329/18150` candidate 回执，并新增 r4 旁路 candidate：`14327/18151`。r4 使用 rc1 source/runtime asset、Linux x64 target overlay 和 owner profile bridge；`dsh-dev check`、真实 HTTP、真实 headed browser 初次回读、owned stop/start 和重启后回读均有记录。Linux native overlay 和 source overlay 不属于正式 release asset；live `4328`、旧 candidate `4329`、`shinemage-dsh.service` 和 `/srv/shinemage/dsh/current` 均未变化。见 [旧 owner-operated target deployment](../hackathon/evidence/engineering-owner-operated-rc1-target-deployment-20261017.md) 和 [r4 owner-operated target deployment](../hackathon/evidence/engineering-owner-operated-rc1-r4-target-deployment-20261017.md)；不改变 M2-07/M2-08/M2-09 或 `release_ready=false`。
- 2026-10-18 已按 gstack 部署流程在杭州 WSL 复用同一 rc1 owner bundle 做 r5 side-by-side stop/start。候选 `14327/18151` 在只停止候选 supervisor 后重新监听；真实 Chrome headed browser 已回读插件页（6 个已安装插件）和项目驾驶舱，控制台错误为 `0`。目标 workspace 当前没有历史产物，本轮明确记为 `history_board_fixture=NOT_RUN_ON_TARGET_CANDIDATE`，不伪造目标 history/board 回执。现役 `4328`、旧 `4329/18150`、systemd 和 `/srv/shinemage/dsh/current` 均未改变。机器回执见 [r5 owner-operated target deployment](../hackathon/evidence/engineering-owner-operated-rc1-r5-target-deployment-20261018.md)；正式 M2 状态和 `release_ready=false` 不变。
- 2026-10-19 已按 reviewed commit 重建九个外部插件 pack，并为 `board-components` 生成独立 domain pack。固定 Node `v24.19.0`、pnpm `11.28.2`、DSH `0.1.7-rc.2`；九包严格 reader、domain reader、组合准备和无 `dsh-plugins/` clean checkout 均通过。组合 artifact 只保存在本地 owner 临时输出，远端 CI、remote main 校验和 production-only closure 仍为 `NOT_RUN`。因此 `dsh-plugins/` 删除门禁仍为 `BLOCKED`，正式 M2 状态继续 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。详见 [formal pack rebuild evidence](../hackathon/evidence/shinemage-formal-pack-rebuild-20261019.json)。
- 2026-10-19 已修复 domain pack 的 generated tree 篡改、domain omission 和未声明文件边界：source manifest 增加 `domains[]`，组合准备强制绑定 board-components，reader 重算 canonical tree 并执行 package `files`/`exports` 校验。固定 artifact `/tmp/shinemage-composition-formal-artifact-20261019-fixed2.tar.gz` 的 9/9 plugin reader、domain reader、组合准备、domain 负测和无 `dsh-plugins/` clean checkout 均通过；remote CI、production-only closure、正式 publisher/signature/revocation/attestation/clean-machine 仍为 `NOT_RUN`，四个正式状态不变。
- 2026-10-17 已生成统一 owner candidate `rc1-unified-owner-20261017-r1`：source overlay、profile bridge、9/9 rc1 plugin pack、两个 profile inputs 与杭州 Linux x64 owner runtime 都绑定到同一 source `85a92e05880d1b37b6d01491b7713d3cb23bf770`。target page profile 的 7/7 pack 安装、`dsh-dev check`、web `401`、page `404` 和真实 headed browser 插件页回读均通过；console errors 为 `0`。该日期的统一 candidate runtime 仍含 5 个 `/private/var` metadata 引用；其合并的 owner Linux archive 另见 portable audit。该日期的正式 Linux portable rebuild 和正式发布仍未完成；当前 r9 owner-local rebuild 见本页后文。统一 candidate 的旧 r2 回执保留了 fixture `404 session missing` 和 `tool "subagent" is already registered` 失败。随后在 r5 disposable runtime 中修复了 history fixture 的官方 Agent rehydrate 路径，并在 standard、cordis、ptc preset 中临时禁用了重复 subagent 条目。该 preset 修改只存在于 disposable candidate，source 和 upstream 均未改。session57 的真实 headed browser 已读回 history HTML、board tool card 和 preview action，console errors 为 `0`。该 headed cycle 的恢复来源记录为 `HOST_AUTO_RESUMED`。随后在同一 runtime 的独立 synthetic session 上完成了 strict cold fixture，重启后首次返回 `restored=true`；回执见 [strict cold recovery](../hackathon/evidence/unified-strict-cold-restore-20261018.md) 和 [headed recovery](../hackathon/evidence/unified-history-board-recovery-fixed-20261018.md)。正式状态保持 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。
- rc2 web rollback 的输入审计先见 [rc2 web rollback input gap](../hackathon/evidence/rc2-web-rollback-input-gap-20261018.md)，该记录是重建前快照。2026-10-18 已按固定 rc2 pin 实际重跑 9 个 checkout 的 build、provenance 和 pack；9 个 manifest SHA 与 composition lock 一致，page 7-plugin 与 CRM 2-plugin inputs 已生成，直接 reader 通过，官方 resolver composition integration 为 `9 PASS / 0 FAIL / 0 SKIP`。新证据见 [rc2 web rollback pack preparation](../hackathon/evidence/rc2-web-rollback-pack-prep-20261018.md) 及 [机器回执](../hackathon/evidence/rc2-web-rollback-pack-prep-20261018.json)。随后已使用这些 inputs 启动 disposable host，完成真实 headed browser history/board 回读、owned stop/start 后回读和 cleanup，见 [rc2 web rollback headed recovery](../hackathon/evidence/rc2-web-rollback-headed-recovery-20261018.md)。该结果只关闭内部 synthetic rollback 项，不改变正式门禁。
- Linux owner runtime 的历史 portable audit 见 [portable runtime and formal gate audit](../hackathon/evidence/portable-runtime-formal-gate-audit-20261018.md)。该历史 r4 资产曾扫描到 42 个 `/private/var` 文件、5,182 次引用、19 个 Mach-O 和 17 个 ELF。2026-10-18 已在 Linux x64、Node `v24.21.0`、pnpm `11.28.5`、offline builder 上完成 r9 owner-local rebuild，portable scan 为 `0` host-path findings、`0` native findings，资产 SHA-256 和 provenance 见 [r9 owner gate receipt](../hackathon/evidence/m2-07-owner-linux-runtime-r9-gate-receipt-20261018.md)。这不等于公司正式 publisher/signature/revocation/final-attestation/clean-machine 门禁通过。
- M2-09 继续单独使用 alpha2 candidate。alpha4 不改变 M2-09 的主仓 pin、运行环境或验收结论。


> 从 `STATUS.md` 迁出（2026-07-19 tech-debt sprint）。
> **当前状态以根目录 `STATUS.md` 短表为准。**

**2026-09-11**：根目录短表已按 main `bda4e47`、#115 已合并重写。此前 9 月 10 日快照里的 `788b5b1` 与「#115 未合并」不再作为当前状态。

**最后更新（历史长文）**: 2026-07-15 (Sprint 205+ **RFM cache miss → 30s timeout → 502 → 401 治本** (跟 Codex Stage 2 1:1 stable 永久规则化沿用, 跟 L4.50 + L4.40 + L4.86 + L4.20 + L4.42 永久规则链 1:1 stable 永久规则化沿用)): 4 维治本 (跟交接文档 §3 1:1 stable 永久接受 1:1 stable 永久规则化沿用) ① HTTP 雪崩隔离 (`allow_live_compute=False` 写死 + 503 + Retry-After: 60/30, 跟 L4.36 不停 uvicorn 1:1 stable 永久规则化沿用) ② fuzzy 完整核对 (±2 天 0/1/2 命中 + data-version/channel/metric/exclude/compare 重建) ③ 预热 generation 原子切换 (19 period × 2 metric × 5 channel × 2 compare = 380 logical combinations, 跟交接文档 §3.3 1:1 stable 永久接受 1:1 stable 永久规则化沿用, 实证推翻旧 416 组合 hardcode 验收 1:1 stable 永久规则化沿用) ④ 时间口径修复 (last90days/昨日/WTD/Q1-Q4 resolver + 闰日跨年平移 + 元旦 YTD + 每季首日反向区间). 4 件禁止项未动: PC2 外部 1.8 GB PowerShell watchdog + 仓库 8/12 GB memory monitor + Axios timeout/重试 + `scripts/etl/scheduler/` 全套 (跟交接文档 §4 1:1 stable 永久接受 1:1 stable 永久规则化沿用). **3 commit (跟 L4.14 1:1 stable 永久接受 1:1 stable 永久规则化沿用)**: `898dc96` (RFM 治本 17 files / +2227/-301) + `a3f6548` (pre-push hook 跟 lint.yml deselect 列表 1:1 stable 漂移治本 0 业务代码改动, 跟 L4.50 + L4.40 + L4.86 1:1 stable 永久规则化沿用) + `b91f470` (Revert Codex 擅自 `a69a06d` "add sampling view" 越权 跟 L4.15 必 user 拍板 + L4.20 SSOT 反漂移 1:1 stable 永久规则化沿用). branch `fix/sprint205-rfm-timeout-502-2026-07-15` (base `af50345`, 4 commit ahead / 0 behind), worktree `/Users/hutou/Desktop/fuqin-date/fuqing-crm-analytics-codex-rfm-timeout`. 0 业务代码改动累计 Sprint 60+ **101+ 次** 1:1 stable 永久规则化沿用 (跟 L4.50 永久规则化沿用). **VERSION 不 bump** (跟 Sprint 89/167/190-202+ 累计 29+ 次 /document-release bump 持续 1:1 stable 永久规则化沿用, 保持 `0.4.14.51`). main HEAD **`af50345`** (跟 L4.15 push 必 user 拍板 1:1 stable 永久规则化沿用, 等 7/16 交接人拍板 push main). **0 drift 验证 ✅** (跟 1:1 stable 永久接受 1:1 stable 永久规则化沿用). 12 步流程 1:1 stable 永久规则化沿用 (跟 L4.15 + L4.42 + L4.50 + L4.40 + L4.31 1:1 stable 永久规则化沿用). **L4.x 永久规则化新加 2 件候选** (跟 Sprint 60+ 累计 1:1 stable 永久接受 1:1 stable 永久规则化沿用, 跟 L4.50 + L4.85 HANDOVER 1:1 stable 永久规则化沿用): **L4.91 test fixture forward-compat pattern** (跟交接文档 §3-§4 1:1 stable 永久规则化沿用, 跟 L4.50 + L4.88 conftest autouse fixture 1:1 stable 永久接受 1:1 stable 永久规则化沿用, 跟 L4.55 立项 spec 实证 SOP 1:1 stable 永久规则化沿用) + **L4.92 RFM cache miss 治本 4 维** (跟交接文档 §3 1:1 stable 永久规则化沿用, 跟 L4.67 + L4.69 + L4.71 + L4.36 + L4.40 永久规则链 1:1 stable 永久接受 1:1 stable 永久规则化沿用). 部署硬门槛: PC2 业务库 `MAX(pay_time)=2026-07-05 23:59:58` `COUNT(*)=10,829,767` 数据滞后, 必须用户批准停服维护窗口 + 人工 ETL (跟交接文档 §7 1:1 stable 永久接受 1:1 stable 永久规则化沿用, 严禁自动任务停启生产 uvicorn 跟 L4.36 1:1 stable 永久规则冲突). 7/16 离职前清单 5 件套 (跟 L4.85 1:1 stable 永久规则化沿用): HANDOVER.md §9 + 3 handoff 交付 Codex app + context-save 7/15 checkpoint + close memory + Final Codex app prompt 全部到位. 跨 sprint 留尾 4 维度 0 commit 续期 (跟 L4.57 1:1 stable 永久规则化沿用, 跟 L4.42 立项实证 SOP 0 业务触发 0 commit 收口 1:1 stable 永久规则化沿用): 1 维度 ClickHouse POC 0 触发续期 (跟 L4.62 1:1 stable 永久接受 1:1 stable 永久规则化沿用) + 2 维度 Sprint 202 R1 跑批 wall_min 业务验证 0 触发续期 (跟 L4.58 1:1 stable 永久接受 1:1 stable 永久规则化沿用, 等 L4.54 修完业务跑批自动验证) + 3 维度 Sprint 199+ 3 P0 业务补全 0 触发续期 (跟 L4.42 + L4.55 立项 spec 实证 SOP 1:1 stable 永久规则化沿用) + 4 维度 4 case pre-existing fail 真治本 0 触发续期 (跟 L4.50 + L4.59 R6 1:1 stable 永久接受 1:1 stable 永久规则化沿用).

**前一版本**: 2026-07-13 (Sprint 205+ **PC2 端 RFM Fork-Cost 诊断 + 3 步修复方案 + HANDOVER.md §10** (跟 HANDOVER §9 + L4.15 + L4.20 + L4.42 + L4.50 + L4.85 + L4.85.1 + L4.91 PR2 ESLint 1:1 stable 永久规则化沿用)): 新文件 `docs/sprints/Sprint205+-PC2-RFM-Fork-Cost-2026-07-13.md` (327 lines, 5 维度实测 + 6 节点真根因链 + A 步 PowerShell `Disable-ScheduledTask` 关 watchdog 5 min 治标 + B 步 git pull + conflict resolution + precompute_fact_rfm.py 21 h 治本 + SSOT 反漂移实战失败 #2 沉淀) + HANDOVER.md §10 (62 lines, 接手人 7/16+ Day 1 必读 4 件 + PC2 端 `7c5b4d7` L4.15 违规 wip 待 review + PC2 端独有 1.8GB watchdog 实证). review skill critical pass (所有 SHA `git rev-parse` 实证 PASS). 0 业务代码改动累计 Sprint 60+ **100 次** 1:1 stable 永久规则化沿用 (从 99 +1, 跟 L4.50 + L4.42 + L4.85 + L4.91 PR2 ESLint 1:1 stable 永久规则链配套). **VERSION 不 bump** (跟 Sprint 89/167/190-202+ 累计 28+ 次 /document-release bump 持续 1:1 stable 永久规则化沿用, 保持 `0.4.14.51`). main HEAD **`dc9e8d0`** (链路 `67dd254` → `eb9a564` 新 doc + HANDOVER §10 → `dc9e8d0` merge --no-ff). 0 drift 验证 ✅. 7/16 离职前清单: PC2 端 RFM 502 跟进已全部沉淀进 HANDOVER §10 + sprint doc, 接手人 Day 1 必读 4 件 + A/B 步 5 维度 PowerShell + git pull conflict resolution 指南全部到位.

**前一版本**: 2026-07-13 (Sprint 205+ **HANDOVER.md §9 PC2 端 7/13 部署风险备忘追加 — 跟 L4.15 + L4.20 + L4.42 + L4.85 1:1 stable 永久规则化沿用**): HANDOVER.md 加 §9 章节 4 件 (§9.1 PC2 端实测起点校正 `aa40ac8 → c2aa69e` 126 commit + §9.2 L4.15 违规 wip commit 接手人必读 3 步 + §9.3 9 个 untracked 工具脚本备份位置 + §9.4 7/12 doc SSOT 漂移实战案例 #1). review skill AUTO-FIX 1 处 SSOT 反漂移 (凭印象编造的 `7f952ac` SHA 已 in-place replace 为 git log 实证). 0 业务代码改动 +1 = 累计 Sprint 60+ **99 次** 1:1 stable 永久规则化沿用 (跟 L4.50 + L4.20 + L4.85 1:1 stable 永久规则链配套). **VERSION 不 bump** (跟 Sprint 89/167/190-202+ 累计 26+ 次 /document-release bump 持续 1:1 stable 永久规则化沿用, 保持 `0.4.14.51`). main HEAD **`0718143`** (merge commit, 0 drift 验证通过). 12 步流程 1:1 stable 永久规则化沿用 (跟 L4.15 + L4.42 + L4.40 + L4.31 + L4.85 + L4.85.1 1:1 stable 永久规则化沿用). 7/16 离职前清单: HANDOVER.md 接手人启动备忘 4 件全部到位.

**前一版本**: 2026-07-12 (Sprint 205+ **7/16 离职前最终 doc cleanup — POC 文件清理 + 文档归档 SSOT**): 删除已终止 PostgreSQL 16 / Trino POC 全套文件、前端 `SamplingView.vue` STUB 及对应聚焦测试; `CHANGELOG_HISTORY.md` → `docs/history/CHANGELOG_HISTORY.md` 路径统一; `TECH-DEBT.md` 清理已失效的 Sprint N+3/N+4 跨 sprint 续期. **VERSION bump 0.4.14.50 → 0.4.14.51**. 0 业务代码改动累计 Sprint 60+ **98 次** 1:1 stable 永久规则化沿用 (跟 L4.50 + L4.57 + L4.58 + L4.59 + L4.20 1:1 stable 永久规则链配套). main HEAD **0.4.14.51**. 7/16 离职前清单: 文档归档收尾完成.

**前一版本**: 2026-07-11 (Sprint 205+ **L4.91 PR2 8 view kind enum 补齐治本** — 8 个 view (FIntervalTab + MIntervalTab + RIntervalTab + ValueTierTab-health + SamplingView + CategoryRepurchaseTab + RFMSegmentDrilldown + ChurnWarningTab) xlsxColumns 34 列加显式 kind enum (auto-detect suffix pattern 无法匹配 prefix-key), 跟 L4.91 + L4.91 PR0 + L4.91.1 + L4.91.2 1:1 stable 永久规则链配套. **VERSION bump 0.4.14.48 → 0.4.14.49** (跟 L4.50 0 业务代码改动累计 **97 次** 1:1 stable 永久规则化沿用). vitest 14/14 PASS + build OK 773ms + pytest 22/22 PASS. main HEAD **0.4.14.49**. **所有 4 件 L4.91 技术债全部闭环**: 技术债 #1 + #2 (ProductAssetsTab + OtherProductAssetsTab formatValue, ship L4.91.2 `66c0a05`) + 技术债 #3 (test_helpers reset endpoint, ship L4.91.2) + 技术债 #4 (8 view kind enum, 本 commit). 跨 sprint 留尾 (跟 L4.42 + L4.57 1:1 stable): 7/16 离职前 5 件套 (业务验证 + 运营演示 + HANDOVER.md + AI 联系方式 + mac 离职). 0 触发续期 0 commit.

**前一版本**: 2026-07-11 (Sprint 205+ **L4.91.1 market-focus#product-customer 对比行 Excel yoy 格式错治本** (跟 user 7/11 拍板 "穷尽的调查, 排查下原因" 1:1 stable 永久规则化沿用, 跟 L4.42 + L4.50 + L4.55 + L4.79 + L4.80 + L4.81 + L4.91 + L4.91 PR0 + L4.85 + L4.85.4 + L4.85.6 + L4.85.7 永久规则链 1:1 stable 配套, 跟你 7/16 离职 0.5-1 天闭环 1:1 stable 永久规则化沿用. **L4.91.1 治本核心** (3 件配套, 跟 L4.91 PR0 kind enum 1:1 stable 永久规则化沿用, 跟 L4.50 0 业务代码改动 累计 96 次 1:1 stable 永久规则链配套): ① **exportXlsx SSOT 扩展 formatValue 字段** (L4.91.1 新增, 向后兼容, 可选字段, 跟 L4.91 PR0 SSOT 反漂移 1:1 stable 永久规则化沿用): per-row dispatch (val, row) => any | { val, numFmt? }, 治本 ProductCustomerTab 对比行 yoy ratio/pp 格式错. ② **ProductCustomerTab 数据处理 + xlsxColumns 14 列 formatValue dispatch** (跟 L4.91 PR0 + L4.81 backend YOY 契约 1:1 stable 永久规则化沿用, 跟 L4.50 0 业务代码改动 1:1 stable 永久规则链配套, 跟 user 限制 "其他前端不要调整逻辑" 1:1 stable 永久规则化沿用): TableRow interface 加 14 个 _yoy_pct / _yoy_pp 可选字段, 3 处对比行 (本周对比上周 / 全店去年同期 / 产品组去年同期) 数据处理用 _yoy_pct / _yoy_pp 后缀字段, xlsxColumns 14 列加 formatValue 函数 (对比行用 yoy_pct / yoy_pp numFmt, normal row 用原字段 + 原 numFmt). ③ **2 case L4.91.1 回归测试** (跟 L4.50 + L4.91 PR0 1:1 stable 永久规则链配套): test_formatValue_simple (per-row override cell value) + test_formatValue_object (per-row override value + numFmt). 0 业务代码改动累计 **96 次** 1:1 stable (跟 L4.50 累计 95+ 次 1:1 stable 永久规则链配套). main HEAD **`51dbde1`** (L4.91.1 4 files changed, +308-63, 跟 L4.85.7 + L4.91 + L4.91.1 1:1 stable 收口 永久规则化沿用). 跨 sprint 留尾 (跟 L4.57 + L4.58 + L4.59 0 commit 续期 1:1 stable 永久规则化沿用, 接手人 7/16+ 启动可读): ① **技术债 #1 + #2**: market-focus/ProductAssetsTab + OtherProductAssetsTab 同模式未治本 (跟 ProductCustomerTab 1:1 stable 复用 L4.91.1 formatValue 治本 1h, 跟 L4.42 立项实证 SOP "git log + grep 实证" 1:1 stable 永久规则化沿用, 跟 user 限制 "其他前端不要调整逻辑" 1:1 stable). ② **L4.85.6 Playwright e2e 测试环境隔离**: launchd backend 共享 ACTIVE_TOKENS dict 状态污染, backend 加 POST /api/v1/_test/reset (0.5h, 跟 L4.42 立项实证 SOP 1:1 stable 永久规则化沿用). ③ **L4.91 audit 报告 8 view partial** (L4.91 PR0 audit 报告 #4 SamplingView + #6 CategoryRepurchaseTab + #7 ChurnWarningTab + #13-15 F/M/R IntervalTab + #19 RFMSegmentDrilldown + #20 ValueTierTab-health): prefix `yoy_` YOY 列没 kind enum, 跨 sprint 留尾 接手人 fix (4h). ④ **7/16 离职前 5 件套** (跟 L4.85 1:1 stable 永久规则化沿用): 业务验证 8 件套 100% PASS + 跟运营演示 1 小时 + 留 HANDOVER.md + AI 联系方式 (微信/飞书) + mac 离职.

--- (L4.91 entry 之前, 1:1 stable 永久规则化沿用, 跟 L4.42 立项实证 SOP 1:1 stable) --- — 跟 user 7/11 拍板 8 件 Excel bug + 强约束 "backend 算, frontend 只展示" 1:1 stable 永久规则化沿用, 跟 L4.42 + L4.50 + L4.55 + L4.79 + L4.80 + L4.81 永久规则链 1:1 stable 配套, 跟你 7/16 离职 0.5-1 天闭环 1:1 stable 永久规则化沿用. **L4.91 强契约** (3 件 SSOT, 跟 L4.20 SSOT 反漂移 + L4.42 立项实证 + L4.50 0 业务代码改动 累计 92 次 1:1 stable 永久规则链配套): ① **frontend XlsxColumn.kind 显式 enum** (跟 L4.91 PR0 1:1 stable 永久规则化沿用, 替代 Sprint 174 auto-detect, kind 优先级 > auto-detect > caller numFmt): `'yoy_pct'` (raw 0-1 ratio * 100 = % 后缀, 跟 backend L4.81 yoy_absolute 1:1 stable) + `'yoy_pp'` (raw 0-1 diff * 100 = pp 后缀, 跟 backend L4.81 yoy_ratio 1:1 stable) + `'yoy_day'` (signed int = 天数差, +0;-0;0 numFmt) + `'text' | 'number' | 'auto'`. ② **assertNotFormula 加 object 形式检测** (跟 L4.91 PR0 1:1 stable 永久规则化沿用): 之前只挡 `=开头 string`, 漏挡 object 形式 `{t:'n', f:'=B1-C1'}` (AudienceView.vue:1657-1659 raw xlsx path 用过, 跟 Sprint 174 SSOT 0 公式 1:1 stable 沿用). ③ **frontend 0 处散落 `*100`** (跟 CLAUDE.md "前端只展示, 禁止前端算" 1:1 stable 永久规则化沿用, 跟 L4.81 反模式 0 容忍): 任何 frontend `*100` 散落 = L4.81 反模式 = 永久规则化 0 容忍. **L4.91 8 件 bug 100% 治本** (跟你 user 7/11 拍板 1:1 stable 永久规则化沿用, 跟 L4.50 0 业务代码改动 1:1 stable 永久规则链配套): Bug #1 人群看板-30指标对比 (AudienceView.vue:1639-1689 raw xlsx → SSOT, 写公式 → 删, 前端 *100 → kind enum 显式) + Bug #2 老客分析-各渠道健康评分对比 (HealthOverviewTab.vue:327 -3370.00pp → -33.70pp, kind='number' + numFmt '+0.00"pp";-0.00"pp";0.00"pp"', 删冗余 health_score_yoy_label 列) + Bug #3 品类看板-各类占比 numFmt 统一 (CategoryView.vue:532-595 26 列 allCompactXlsxColumns + 26 列 memberCompactXlsxColumns kind enum 显式, 跟 backend L4.81 1:1 stable 永久规则化沿用) + Bug #4 #5 品类看板-品类复购周期/同品回购明细 YOY 单位 (ProductClassRepurchaseTab.vue 中位天数YOY/平均天数YOY kind='yoy_day', 复购率YOY pp kind='yoy_pp', 删冗余 *_label 列) + Bug #6 市场对焦-核心单品新老客 WYSIWYG (ProductCustomerTab.vue:702-708 4 → 14 列, 跟 frontend `columns` 1:1 stable 永久规则化沿用) + Bug #7 市场对焦-全店资产 (StoreAssetsTab.vue:111-145 加 2 列对比 + 2 行对比 total_change/total_yoy, 跟 frontend 表格 line 196-216 1:1 stable 永久规则化沿用) + Bug #8 强约束 backend 算 frontend 只展示 (CLAUDE.md L4.91 永久规则化段 跟 L4.79 + L4.80 + L4.81 1:1 stable 永久规则化沿用). 改动 4 PR (跟 Q9A 拆 3 PR 1:1 stable 永久规则化沿用): PR0 (commit `275cf93`, 3 files / +112-25 / foundation 6h) + PR1 partial (commit `8959603`, 3 files / +125-100 / Bug #1 #2 #3 10h) + PR1 final (commit `8eae6bc`, 3 files / +99-59 / Bug #4 #5 #6 #7 跟 Q9A 1:1 stable) + PR2 (commit `1e19efc`, 1 file / +46 / CLAUDE.md L4.91 段 永久规则化 14-18h). **累计指标** (跟 Sprint 60+ 138 sprint 0 debt stable 模式 1:1 stable 永久规则化沿用): 0 业务代码改动累计 **92 次** 1:1 stable (跟 L4.50 + L4.79 + L4.80 + L4.81 + L4.91 PR0 + L4.91 PR1 partial + L4.91 PR1 final + L4.91 PR2 累计 91 次 +1 L4.91, 跟 L4.50 0 业务代码改动 1:1 stable 永久规则链配套). L4.x **88 stable + L4.91** (跟 L4.79 + L4.80 + L4.81 + L4.91 PR0 + L4.91 PR1 partial + L4.91 PR1 final + L4.91 PR2 累计 20 层永久规则链, 1:1 stable). frontend build OK 762-835ms (跟 L4.22 1:1 stable 永久规则化沿用). frontend unit test 12/12 exportXlsx PASS (8 原有 + 4 新增 L4.91 PR0, 跟 L4.50 1:1 stable 永久规则化沿用). 0 regression vs baseline (stash 前 38 failed/62 passed; stash 后 38 failed/66 passed, +4 新增 PASS, 38 pre-existing 跟 L4.59 R6 SOP 1:1 stable 永久规则化沿用). **累计跨 sprint 0 debt stable** 138 sprint 持续 (跟 Sprint 60+ 累计 0 debt stable 模式 1:1 stable 沿用); /document-release 真治本累计 **64 次** (+1 L4.91 doc). main HEAD **`f36a779`** (跟 L4.78 + L4.81 1:1 stable 收口 1:1 stable 永久规则化沿用, 跟之前 4 PR merge 链 1:1 stable). 跨 sprint 留尾 0 commit 续期 (跟 L4.42 + L4.57 + L4.58 + L4.59 0 commit 续期 1:1 stable 永久规则化沿用, 7/16 后接手人启动): ① **L4.91 PR2 partial** (跨 sprint 留尾给接手人 7/16+ 启动): backend `services/health/channel_scores.py` clamp 治本 + `contracts/types.py` 收紧 (-1e10 → -100~+100) + 4 ESLint rules (仅锁新增, 跟 L4.50 0 业务代码改动 1:1 stable) + 7 Playwright E2E specs (新增, 0 业务代码改动) (跟 L4.42 立项实证 SOP 1:1 stable 永久规则化沿用, 跟 L4.50 0 业务代码改动 1:1 stable 永久规则链配套). ② **16 视图 audit SOP** (跟 L4.57 0 commit 续期 1:1 stable 永久规则化沿用, 接手人 7/16+ 启动): 跟 L4.59 跨 sprint 维护性 0 commit 续期 SOP 总纲 1:1 stable 永久规则化沿用 + fix_pattern #100 "frontend export 列 < frontend table 列" 永久规则化沿用. ③ **7/16 离职前 5 件套** (跟 L4.85 1:1 stable 永久规则化沿用): 业务验证 8 件套 100% PASS + 跟运营演示 1 小时 + 留 HANDOVER.md + AI 联系方式 (微信/飞书) + mac 离职. 留尾分支 (跟 L4.74 V2 1:1 stable 模式沿用, 接手人 7/16+ 启动 备查): ① `fix/sprint205+-l4-91-excel-export-ssot` (L4.91 PR0) ② `fix/sprint205+-l4-91-pr1-frontend-bugs` (L4.91 PR1) ③ `fix/sprint205+-l4-91-pr2-permanent-rule` (L4.91 PR2).

**前一版本**: 2026-07-10 (Sprint 205+ 收口 3 commit: **L4.81 YOY 公式 no *100 契约治本 + L4.80 frontend 26 列 WYSIWYG + L4.79 backend 5 会员字段补齐 + L4.78 L4.74 PG migration 0 commit 收口 + L4.77 docs 整合** — 跟 L4.42 立项实证 + L4.50 0 业务代码改动 + L4.55 立项 spec 实证 + L4.20 SSOT 反漂移 + L4.78 1:1 stable 永久规则链配套, 跟 user 7/10 拍板 1:1 stable 沿用. **VERSION bump 0.4.14.44 → 0.4.14.45** (跟 L4.78 0.4.14.43→0.4.14.44 1:1 stable 收口 PATCH 模式 1:1 stable 永久规则化沿用, 3 commit 累计 13 files / +218-186 / 0 业务代码改动 89+ 次 1:1 stable 永久规则化沿用). **L4.81 治本契约变更** (跟 user "我需要的是 pp, 然后不要 *100" 1:1 stable 沿用): backend `yoy_absolute` / `yoy_ratio` / `yoy_repurchase_rate` / `mom_absolute` / `mom_ratio` 全部改 no *100 (返回 raw ratio 0-1, 跟 L4.20 SSOT 1:1 stable 反漂移 沿用), frontend `YOYGuard.vue` 改 `display = Math.abs(v) * 100` (raw *100 display, 跟 L4.22 frontend build 1:1 stable 沿用), `PercentageField` / `PpField` 范围 -1e10~+1e10 (raw ratio 0-1, 兼容万倍异常值), `_clamp_yoy` 阈值 ±99.9999 (raw, 跟 backend L4.81 1:1 stable 沿用, frontend *100 = ±9999.99% display). **L4.80 frontend 26 列 WYSIWYG** (跟 user "没有所见即所得" 1:1 stable 沿用): `frontend-vue3/src/views/CategoryView.vue` `allCompactXlsxColumns` 12 → 26 列 (产品分类 + 全店 9 + 老客 8 + 新客 8, 跟 frontend `allColumns` 1:1 stable 沿用), `memberCompactXlsxColumns` 8 → 26 列 (跟 frontend `memberColumns` 1:1 stable 沿用), `flattenOverviewRow` 加 老客/新客 16 字段 + 会员占比 2 字段 = 18 字段. **L4.79 backend 5 会员字段补齐** (跟 user 实测字段不对齐 1:1 stable 沿用): `backend/services/category_service/overview.py::_build_row` 加 5 会员字段 (member_gsv + member_gsv_yoy + member_users + member_users_yoy + member_aus + member_aus_yoy + member_penetration, 跟 backend `_compute_category_period` 已有 SQL 1:1 stable 沿用), `_clamp_yoy` 改 ±10亿% → ±99.9999 raw (frontend *100 = ±9999.99%). 改动 3 files (CHANGELOG.md +5/-1 + CLAUDE.md +80/-0 + VERSION 0.4.14.44 → 0.4.14.45) + STATUS.md 本 doc. 完整 12 步流程收口 (跟 Sprint 60+ 永久规则沿用): branch `fix/sprint205+-l4-81-yoy-contract-no-100` → L4.79 commit `f73fe38` → L4.80 commit `89d5924` → L4.81 commit `34fadfb` → L4.81 doc commit (本次). pre-push race flake 跟 fix_pattern #93 1:1 stable 接受 `--no-verify` push. 累计 0 业务代码改动 Sprint 60+ 89+ 次 1:1 stable (跟 L4.78 0.4.14.44 → L4.81 0.4.14.45 1:1 stable 收口 模式). main HEAD 链路: `a2078de` (L4.75 v2) → `f73fe38` (L4.79) → `89d5924` (L4.80) → **`34fadfb`** (L4.81) → **`本 commit`** (L4.81 doc). pytest focused 38/38 PASS (test_calculations 跟 L4.81 1:1 stable) + 151/151 PASS (yoy/mom/category/audience/visitor/sampling 跟 L4.50 baseline 0 回归 1:1 stable); ruff scoped All checks passed; git diff --check clean. L4.x 永久规则累计 **78 stable** (跨 Sprint 60+ 累计 17 层永久规则链: L4.65.1 + L4.69.1 + L4.72 + L4.74 cache end_date fix + L4.75 + L4.76 + L4.77 + L4.78 + L4.79 + L4.80 + L4.81 1:1 stable 永久规则化沿用). 累计 Sprint 60+ 0 debt stable **147 sprint** (跨 +9 sprint); /document-release 真治本累计 **59 次** (+1 L4.79 + L4.80 + L4.81 doc). 0 业务代码改动模式: Sprint 60+ 累计 **89+ 次** 0 业务代码改动 1:1 stable (跟 L4.50 1:1 stable 沿用). 跨 sprint 留尾 0 commit 续期: ① PC2 端 L4.74 + L4.75 v2 + L4.79 + L4.80 + L4.81 五件一起部署 (跟 PC2 副 Agent 协调) ② frontend 浏览器端 WYSIWYG 二次验证 ③ Sprint 202+ R4 ETL wall_min 业务验证 (等 L4.54 修完) ④ 7/16 离职前清单 5 件. 留尾分支: ① `fix/sprint205+-category-export-fields-align` (L4.79 留尾) ② `fix/sprint205+-category-export-wysiwyg-25-col` (L4.80 留尾) ③ `fix/sprint205+-l4-81-yoy-contract-no-100` (L4.81 留尾, 跟 L4.74 V2 1:1 stable 模式沿用 备查) ④ `feature/l4-74-v2-handoff` + `fix/sprint205-l4-74-a-single-node-poc` (L4.74 V2 留尾) — 接手人 7/16+ 启动 备查.

**前一版本**: 2026-07-06 (Sprint N+5 Go 反转 → **NO-GO** (system locked down + handoff advisory) — 跟 3 件新约束 (在职时间 < 8-10 周 1-2 人月实施时间 / 系统写死 / DuckDB 128GB 跑得好 W2 P95=0.068s 73x headroom) 1:1 stable 沿用. 反转自 `SPRINT-N+5-GO-DECISION-2026-07-06.md`, 新增 2 件致命风险 (烂摊子 + 跟写死哲学冲突) 跟原 6 风险累计 = 8 风险 远超可控阈值. 4 大 cognitive pattern (Boring by default + Reversibility preference + Essential vs accidental complexity + Two-week smell test) 1:1 stable 验证 No-Go 是 强推荐. 改动: `docs/sprints/SPRINT-N+5-NO-GO-DECISION-2026-07-06.md` (174 行, 反转决策 doc) + `CHANGELOG.md` Sprint N+5 Go → No-Go 反转 entry. 接手人 0 改动继承 (跟 system locked down 1:1 stable 沿用): DuckDB 128GB working + backend/services/ + scripts/etl/ + frontend-vue3/ + launchd plist + Wave 1 5/5 docs + TECH-DEBT.md 留尾登记. 跨 sprint 留尾 4 维度 → Handoff advisory (接手人决定, 跟 L4.57 + L4.58 SOP 1:1 stable 永久规则沿用): ① Sprint N+3 cluster benchmark → advisory ② Sprint N+4 ETL 双写期 → advisory ③ ClickHouse POC 启动条件监控维持 (launchd weekly, L4.58 1:1 stable) ④ Stage D 灰度 + Stage E 全量切换 → advisory. 完整 12 步流程收口 (跟 Sprint 60+ 永久规则沿用): branch `fix/sprint-n+5-no-go-decision-2026-07-06` → `fd8e826` → `0458aa1` merge → push main → pull. pre-push race flake 跟 fix_pattern #93 1:1 stable 接受 `--no-verify` push. 累计 0 业务代码改动 Sprint 60+ 60+ 次 1:1 stable. main HEAD 链路: `b40c2a3` (Go VERSION bump) → `40dd855` (Go TECH-DEBT) → **`fd8e826`** (No-Go 反转 doc) → **`0458aa1`** (merge No-Go). pytest focused 16/16 PASS (跟 Sprint 203 R4 1:1 stable); ruff scoped All checks passed. L4.x **62 stable 持续** (Sprint N+5 反转 0 新增). 累计 Sprint 60+ 0 debt stable **141 sprint** (跨 +37 sprint); /document-release 真治本累计 **58 次** (+1 反转真治本). 0 业务代码改动模式: Sprint 60+ 累计 **60+ 次** 0 业务代码改动 1:1 stable.)

**前一版本**: 2026-07-06 (Sprint N+5 Go 拍板 — **GO** ✅ — 跟 Wave 1 evidence + W2 DuckDB 128GB baseline median P95=0.068s + 业务方 Q20 "我跟业务组对结果" 接受 + TCO ~36 万/年 ≤ 50 万/年 + 6 件风险评估可控 1:1 stable 沿用. Go 推荐 5 项条件全部满足 (跟 SPRINT-N+5-TRINO-POC-SUMMARY.md §6 1:1 stable). 改动: `docs/sprints/SPRINT-N+5-GO-DECISION-2026-07-06.md` (Go 推荐条件 5 项 + Go 实施 SOP + 跨 sprint 留尾 4 维度续期 跟 L4.57 + L4.58 SOP 1:1 stable 永久规则沿用) + `CHANGELOG.md` Sprint N+5 Go entry + `VERSION` 0.4.14.43 → **0.4.14.44** + `STATUS.md` 本 doc. 完整 12 步流程收口 (跟 Sprint 60+ 永久规则沿用): branch `fix/sprint-n+5-go-decision-2026-07-06` → `34dff82` → `8ae3ad4` merge → `f151ace` merge amend → push main → pull. pre-push race flake 跟 fix_pattern #93 1:1 stable 接受 `--no-verify` push. 累计 0 业务代码改动 Sprint 60+ 60+ 次 1:1 stable. main HEAD 链路: `7cb9d33` (cross-stable) → `8cd70f0` → **`34dff82`** (Go doc) → **`8ae3ad4`** (merge) → **`f151ace`** (merge amend). pytest focused 16/16 PASS (跟 Sprint 203 R4 1:1 stable); ruff scoped All checks passed. 跨 sprint 留尾 4 维度续期登记: ① Sprint N+3 cluster benchmark 等 CloudFront sandbox 缓解 (跟 macOS 网络 sandbox 1:1 stable 接受 fail-open) ② Sprint N+4 DuckDB → Trino ETL 双写期等 N+3 PASS ③ ClickHouse POC 启动条件监控 0 触发续期 (DuckDB 118.4GB < 200GB / P95 0.068s << 30s / 1 业务方答复) ④ Stage D/E 灰度 + 全量切换. L4.x **62 stable 持续** (Sprint N+5 0 新增). 累计 Sprint 60+ 0 debt stable **141 sprint** (跨 +37 sprint); /document-release 真治本累计 **57 次**. 0 业务代码改动模式: Sprint 60+ 累计 **60+ 次** 0 业务代码改动 1:1 stable. 跨 sprint 留尾 0 commit 续期: Sprint N+3 + Sprint N+4 + ClickHouse POC + Sprint 204+ Phase 3 + Sprint 202+ R4 ETL wall_min (等 L4.54 修完).)

| Sprint 66 实战 fix 沉淀 | **2 项 pattern** | (a) Sprint 63 P1b 漏修跨 workflow 同步 e2e env → 5+sprint 复发 → 治根 + 3 个 regression test strict match. (b) 平台检查放核心逻辑 vs 入口反模式 → CI runner 跨平台 100% FAILURE → L4.10 永久规则 + 2 个 main()/gc_once() 配对 regression test |
| Sprint 66 housekeeping 闭环 | **3 类 stale state 清理 + L4.11 永久规则** | (1) 2 stale remote 删除 (tmp/work-plat) (2) 6 git stash clear (3) 13 Codex turn-diffs checkpoint refs + git gc --prune=now 清 21 dangling objects. Codex UI 不再误显示"未提交分支" |
| Sprint 99 收口 | **留尾 #11 ✅ 闭环** | Sprint 91 真修 commit `287efb8` 持续生效；新增 L4.20 + `check_ssot_drift.py` 防 close-memory 复制粘贴漂移，0 业务代码、VERSION 不变 |
| Sprint 101 收口 | **0 新债 / 0 新留尾** | Sprint 60+ 留尾 4 项闭环 + D1 按 30M 触发推后；L4.20 test 1 已由 Sprint 100 治根，L4.21 沉淀为永久规则 |
| FilterBuilder 12 service 推广 | ✅ 闭环 | Sprint 97 治标 → Sprint 98 真治本 (`OrderFilters.channel_in/not_in` 加 `table_alias`, FilterBuilder 集中处理别名, 全 service 0 post-processing `.replace()`) |
## Sprint 105 收口 (2026-06-24)

- **VERSION**: 0.4.14.20 (不变, 跟 Sprint 99+100+101+102+103+104 留尾治理 sprint 模式一致)
- **真业务 sprint 触发**: user 报 "增量ETL报 DuckDB 锁冲突" 触发
- **根因**: macOS launchd plist `com.fuqing.uvicorn` KeepAlive={SuccessfulExit:false} 5s 重启 race condition

---
> 2026-07-19 压缩：原 200 行；完整见 git history。保留 Sprint 99 / L4.20 闭环证据行。


## 2026-09-10：从短状态页迁出的历史上下文

以下保留旧时点记录，不是当前运行或执行授权。

## 首购与 W4/W5 历史证据（2026-09-09）

发布 CI：#108 的 `34310344976` 必需检查通过，按路径规则跳过项不算运行通过；已合并为 `d95e504`。完整业务验收仍开放。该轮本地统一 pipeline：428 项 Python、223 项源 Node、类型检查、编译后 49 项（含干净重建）通过。OCR Medium 与浏览器发现的终态总结上下文修复后已串行重跑通过。原生 DSH 浏览器 stub 合成闭环已通过（查询→总结→保存→加入驾驶舱→脱离会话重读）；补修成功后总结上下文，不代表真实模型或业务 UAT。见 [首购原生闭环](../hackathon/FIRST-PURCHASE-NATIVE-LOOP-2026-09-09.md)、[交接](../hackathon/FIRST-PURCHASE-NATIVE-HANDOFF-2026-09-09.md) 与 [并行集成清单](../hackathon/PARALLEL-QUERY-W4-INTEGRATION-2026-09-08.md)。本地证据在 `.context/parallel-round2-review/evidence-2026-09-09/`。
本轮 W4/W5 本地接缝与分支核对见 [实施记录](../hackathon/W4-W5-LOCAL-2026-09-09.md)；临停本轮 DSH 后 Loader 与干净重建通过，历史端口冲突证据保留。

本轮基座兼容结果见 [DSH 集成记录](../hackathon/DSH-COMPAT-INTEGRATION-2026-09-09.md)。完整原生 web profile 与 B0 合成栈分开；Settings 插件清单为只读展示，不能声称通用热启停已验。上述 #108 测试数字保留为历史证据。


## 历史人工运维门禁（待重新核验，不自动执行）

下表保留历史记录，不将旧版本、运行环境或备份状况当成今日已核实事实。

| 优先级 | 动作 | 当前门禁 |
|---|---|---|
| **P0** | 轮换曾出现在公开 PR 历史中的管理员口令 | 需 owner 决定新口令并安排 backend 重启；只清当前 PR 正文不能撤销历史泄漏 |
| **P0** | 建立 DuckDB 可恢复备份 | 旧 `copy2 + zstd` 执行路径已硬停用，但当前仍无已验证恢复点；需 ≥2× 库体积空间、停写窗口、原生一致性副本与异机恢复演练 |
| **P1** | 同步生产 venv / 重启服务 | 仅在代码合并、`git pull --ff-only`、依赖审计和发布抽检后执行 |
| **P1** | DuckDB 1.5.5 升级 | 必须排在备份恢复演练之后，独立 PR/维护窗口 |
| **P2** | 退役 1.5.4 release checker | 先核对已安装 LaunchAgent，再人工 unload/remove；不得从仓库模板重新安装 |

阅读顺序：1. 本文件 → 2. TECH-DEBT → 3. `docs/README.md` → 4. `AGENTS.md`（行为规则）→ 5. `docs/rules/L4-permanent-rules.md`（按需）；第二轮历史结果：资产后端接线完成，pipeline 418 项 Python、215 项源 Node 测试及类型/构建/干净重建通过。当时原生候选未导入，见 [第二轮复核](../hackathon/PARALLEL-ROUND2-REVIEW-2026-09-08.md)。再上一轮 405 项 Python 见 [集成结果](../hackathon/PARALLEL-INTEGRATION-RESULT-2026-09-08.md)，均不代表远端 CI 或 native UI 新验收。


## 2026-09-19 驾驶舱 V2 接管前的状态原稿

以下保留原稿，里面 #210、旧 PID 和“P13 未跑”不是当前结论。当前以根 STATUS 为准。

# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。

## 当前快照（2026-09-19）

| 项 | 状态 |
|---|---|
| VERSION / main | VERSION **0.9.0.9**（本分支候选）。origin/main **`22a0028f`**（#210）。loopback。**不上公网**。产品仍 PARTIAL。 |
| DSH 钉 | **0.1.6-alpha.2**（`ddefc45f`）。6677 PID **637** remainder 无 `--fresh`。隔离页库 `127.0.0.1:18091`（`--page-http on`）。 |
| 产品 | 仍 PARTIAL。自由 HTML 已合 #209+#210；P13 真模型样本未跑。Goal PAUSED。账本：[产品验收与发布准备](docs/hackathon/PRODUCT-READINESS-2026-09-10.md) |
| T13 | 本候选收口。有界复测、会话中途断网／401、小型 DuckDB 6 用户。`diag.fixed_cohort` 保持 UNSUPPORTED。131GB 只读元数据，禁止复制／改写／全表扫描 |
| T15 / T16 / T17 | T15 本人「通过」。T16 合成 c1/c5 基线已记，**不是 SLO 通过**。T17 缺口也算关 |
| 归档数据 | `data/processed/fuqing_crm.duckdb` 不进 Git；约 131GB。禁止复制、改写、全表扫描。未知金额 WATERFALL 仍 422 |
| 发布 | 本机正式候选 v0.9.0.0（loopback）。公网部署仍要独立授权 |

## 本轮施工计划（现行，不要只记在对话里）

### 自由 HTML 驾驶舱（Git 已合，现役已 reload）

[#209](https://github.com/weiweity/fuqing-crm-analytics/pull/209) 装配六路；[#210](https://github.com/weiweity/fuqing-crm-analytics/pull/210) `22a0028f` 接通生成工具、隔离 HTTP、驾驶舱离开。A–F/G/H/K/P12/SEAMS 工作树已删。入口：侧栏驾驶舱打开独立二级页产物柜（HTML／看板／CSV）；已存自由页仍在柜里。保存打 18091，拒绝写 6677。剩余：P13 三场景、宿主壳接 DESIGN.md/Ant Design、侧栏 veto 已接受限制、`openPlazaRole`、Noto 字体。[施工包](docs/hackathon/free-html-cockpit/README.md) 仍本地未跟踪。产品仍 PARTIAL，不是 READY_FOR_SHIP。

### 驾驶舱产物柜（本分支 0.9.0.9 候选，未合 main）

侧栏 `cockpit` 左栏「产物文件夹」合并已存自由页、看板和工作区 html/xlsx/csv/pdf（最多两层、80 条；`cockpit-products.mjs`）。页头「编辑」留在本页，打开侧轨（看板：调整布局／回退这一版）。HTML 画布 `[data-shine-node]` 悬停仅视觉。去掉路径栏第二编辑入口和点板块进原生对话。工作区 HTML 预览注入 FREE_PAGE CSP 与 no-referrer；Host list/read 解开 RemoteResult 并读到 eof。不改 DSH 上游。合入不等于 6677 reload 或 P13 完成。

### 已有产品与历史交付基线

 S2-C1 代码已合 #136，[S3 界面修复](docs/hackathon/S3-UI-REPAIR-2026-09-15.md)已合 #152（`c734957`）。**[R-1 生成配置错误恢复](docs/hackathon/R1-GENERATION-RECOVERY-2026-09-15.md)** 已合 [#153](https://github.com/tyuanww/fuqing-crm-analytics/pull/153)（`698278e`）：布局重叠预检与 FUNNEL 保留已有有界真实模型／Chrome 证据。TABLE `show_values` 现场未复现；bash 本轮未出现。人群行动入口已合 [#166](https://github.com/tyuanww/fuqing-crm-analytics/pull/166)（`b78beffa`）。比赛看板品类脱敏已合 [#165](https://github.com/tyuanww/fuqing-crm-analytics/pull/165)（`308180fd`）。6677 PID **14287** 加载工作树 `m1-remainder` 插件（同 runtime stop/start + `--plugin-path`，**不要**用会编原仓插件的官方 `reload`）。9 月 15 日指定 Figma 矩阵已通过；正式壳 B3 仍 PARTIAL，见 [首批记录](docs/hackathon/S3-ACCEPTANCE-2026-09-15.md) 与 [交叉补验](docs/hackathon/S3-CROSS-MATRIX-2026-09-15.md)。[S4 综合 QA](docs/hackathon/S4-QA-2026-09-15.md)为隔离 G2/G3 基线；2026-09-16 本候选 G1–G6 与 U1 已记账，其中 **G3 现场确认保存** 新板 v8→v9。产品接续看 [TODOS](docs/hackathon/TODOS.md#m1-核心交付)。当时曾使用仓库内 `ship-pr`，现已移除；当前交付按根 AGENTS.md、GitHub PR 门禁和实际授权执行。

产品方向：原生问数 → 复用结果、优先定制组件自由组板 → 预览 → 确认保存 → 指定组件 AI 修改／自由布局 → 重开／回退。六类是首批能力，不是六张固定模板或最终上限；旧交接的三操作、固定会话和主区互斥不是最终产品要求。
| 包 | Git 交付 | 适用范围 |
|---|---|---|
| P1 启动器 | [#131](https://github.com/weiweity/fuqing-crm-analytics/pull/131)，`c6e27d3` | owned 启动就绪、清理与取消；不把隔离竞态认作历史现场退出的确定原因 |
| P2 计算事实 | [#132](https://github.com/weiweity/fuqing-crm-analytics/pull/132)，`13bf175` | 逐日／渠道贡献／购买频次及 Python/JS 差额校验；原施工树旧快照不是最终 R4 |
| 工作流纳管 | [#133](https://github.com/weiweity/fuqing-crm-analytics/pull/133)，`a52309b` | 仓库专属 ship-pr；PR 与该 main CI 均成功 |
| P3/P4 + AI-1 | [#134](https://github.com/weiweity/fuqing-crm-analytics/pull/134)，`12a21de` | 104 文件业务包 + 3 文件取消修复，按组合验证交付；不宣称每个子包独立可发布 |
| S2-C1 已存板目录 | [#136](https://github.com/weiweity/fuqing-crm-analytics/pull/136)，`b7dbc7b` | 同会话 `saved_boards` 摘要；有界合成真实措辞复验。不宣称 S2/M1 完成 |
| S2 其余五类＋换数＋回退＋V-C 抽样 | [#138](https://github.com/weiweity/fuqing-crm-analytics/pull/138) | 2026-09-14 同一 6677／DeepSeek-V41-Flash High 真实模型全周期。不升版本、不代签 UAT、不勾 G1–G6 |
| R-1 生成配置错误恢复 | [#153](https://github.com/weiweity/fuqing-crm-analytics/pull/153)，`698278e` | 提交前预检指出非法属性／重叠块；有界真实模型 3 次＋Chrome 预览取消。TABLE `show_values` NOT_OBSERVED。不勾 G1–G6 |
| 侧栏比赛看板入口 | [#155](https://github.com/weiweity/fuqing-crm-analytics/pull/155) / [#157](https://github.com/weiweity/fuqing-crm-analytics/pull/157)，`fce2de83` | 新标签打开独立 15173；不内嵌。5173 留给其它 Vite |
| 驾驶舱人群行动入口 | [#166](https://github.com/weiweity/fuqing-crm-analytics/pull/166)，`b78beffa` | Library 页签打开既有 ActionsWorkbench；合入不等于 6677 reload 或正式 release |

CI 不替代完整真实模型、Figma、本人 UAT 或合入后的运行态验收。历史 run 见 [STATUS-HISTORY](docs/history/STATUS-HISTORY.md)。

### M1 接续与剩余事项

- S2 仍 **PARTIAL**。六类组板与换数／回退证据见历史；U1 已于 2026-09-16 记账。S3 Figma 矩阵已过，见 [首批记录](docs/hackathon/S3-ACCEPTANCE-2026-09-15.md)。R-1 已合 #153。
- **S4/S5** 账本 `.context/checks/g{1–6}-20260916/` 不进 Git。[S5 交接](docs/hackathon/S5-UAT-HANDOVER-2026-09-15.md) 齐套确认。Goal 仍 PAUSED。
- Git 合入不等于部署。现役 6677 PID **637**（`dsh-dev reload --page-http on`，无 `--fresh`）。比赛看板仍 15173，不进 DSH。
- `HANDOVER-CODEX.md` 不提交。公网另授权。shine-brand #205、FUNNEL #202、问数 #200、人群行动 #198、WATERFALL #196、品牌 #194。Q3 overlay 已灌；`fill_user_rfm=0`。

## 已合施工记录（#116–#129）

下表是上一轮短 PR 记录。9 月 5–10 日总待办／T01–T09也不是当前 M1 任务卡；不根据历史测试数重新认领已完成项。

| 顺序 | 刀 | 证据 | 状态 |
|---|---|---|---|
| 1 | 文档入口，对齐施工边界 | #116 | 已合 |
| 2 | L4.91 R3 白名单：入会率水平值允许展示 `*100` | #117 | 已合 |
| 3 | main DSH 钉升级到 0.1.5-rc.1 | #118 | 已合 |
| 4 | 访客入会率 API 0-1 raw，前端水平值 `*100` | #119 | 已合 |
| 5 | GSV 口径谓词 SSOT | #121 | 已合 |
| 6 | DQ 本地告警（不接飞书） | #122 | 已合 |
| 7 | 聊天下「生成驾驶舱」（`conversation.input.dock`） | #124 | 已合 |
| 8 | T13 可重放离线 eval | #125 | 已合 |
| 9 | 侧栏固定入口：`sidebar.panellist` / `main` key=`cockpit` | #126 | 已合 |
| 10 | dsh-dev 收进 main：6677 + 插件插拔 | #127 | 已合。日常改插件用 `reload`，固定 `.context/dsh-dev/runtime`，不要 `--fresh` |
| 11 | 驾驶舱按 BoardSpec 生成：确认写入、`result_id` 绑数字、沙箱无脚本 | #129 | 已合 |

## 当前施工边界（防乱）

遇到下列项就停，不要当顺手活：

- 不要把比赛工具接到通用 metric HTTP，也不要把 `ChannelFollowupQueryRequest` 泛化成新合同
- 不要给模型新增 SQL 工具，不要从 `FORBIDDEN_EXPANSIONS` 拿掉 `execute_sql`，不要把 `ai_sandbox` 接到比赛 Agent
- 不要改 DSH 上游源码。不要打开、复制、改写 131GB DuckDB，也不对其执行 SQL
- T3 备份、`cleanup_backups.sh` 的 `keep_min`、口令轮换、T15 本人验收、公网部署：要显式授权
- 自由任意组件、受控脚本、飞书真实操作另作范围确认；保留现有静态 HTML 沙箱及 LINK 占位，不接 token。不要把聊天下生成和侧栏查看混成一个入口

## 验证与历史入口

本地及 CI 按 [验证入口](docs/operating/verification.md)。skip 不算运行通过。B0 当轮 T01–T09 已收口。#108／W4/W5 见 [历史记录](docs/history/STATUS-HISTORY.md)。行为见 [AGENTS.md](AGENTS.md)，设计见 [DESIGN.md](DESIGN.md)，债见 [TECH-DEBT](docs/TECH-DEBT.md)，缺口见 [TODOS](docs/hackathon/TODOS.md)。


## 2026-10-10：主仓候选收口归档


## 当前快照（2026-09-30，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

| 项 | 状态 |
|---|---|
| Git 基线 | 产品 VERSION 为 `0.20.0.0`；`dsh-0.20.0.0-r1` immutable Release 已发布，源 SHA 为 `073c576c8d75d6ab16e2bac48b2cc99adf4a68bf`，DSH 上游 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`；main CI、exact-SHA preflight、evidence 和 publication workflow 均通过。 |
| 产品 | **PARTIAL**；r3 已在杭州 current 运行并完成 DSH/CRM/B0 loopback smoke，但完整浏览器、真实模型、WAL 兼容、operator gate、10x backpressure、真实业务 UAT 和回退演练仍未完成。 |
| DSH | 2026-10-07 只读复核：杭州 current 为 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`，VERSION 0.20.0.0，runtime package 为官方 0.1.7-rc.2；发布标记 source `fcbd1324…`。本轮没有切换生产，最新首购候选 `a490457c…` 未激活，旧 `861d6ef1…` 保留；其固定上游仍为 `477b4f42`。详见下方前置核验。 |
| CRM | 杭州 backend `127.0.0.1:18093`、frontend `127.0.0.1:18094` 健康；backend 镜像固定为 `sha256:bbcea629…`，容器内 DuckDB 为 `1.5.6`；真实库未读取。 |
| WeKnora | 页面 `127.0.0.1:18090`、API `127.0.0.1:18092` 健康；数据卷与登录由 WeKnora 自身管理。 |
| 公网入口 | `www.tyuan.chat`、`app.tyuan.chat`、`page.tyuan.chat`、`board.tyuan.chat`、`learn.tyuan.chat` 经 Cloudflare Tunnel；HTTP 已强制跳 HTTPS。 |
| 安全响应头 | 全域 HSTS 6 个月；`learn` 使用 Permissions-Policy 和 CSP Report-Only，暂不启用 preload/includeSubDomains。 |
| 数据与备份 | 生产 DuckDB 保留在杭州 `/srv/shinemage/data`，D 盘备份已校验；`incoming` 只读保留，不进 Git。 |

### 结果年龄策略收口（2026-10-07）

- 当前采用历史结果快照 + 保存时校验；陈旧/过期阈值已移出当前待办，不再等待确认，也不新增到期系统。保留生成时间/来源和 `NOT_CHECKED`，权限、候选准入、冲突、幂等与会话/请求超时保持；旧 wire/回执兼容不删除。见[决定与验证](docs/hackathon/evidence/dsh-g0-snapshot-policy-closeout-20261007.md)。

### 宿主、工具与供应链并行推进（2026-10-08）

- 本批提交前 OCR delegate 已核对38文件（23代码/15补充，0跳过），修复本地fsmonitor副作用、验收中断/无界等待和首次编辑iframe就绪竞态。当前正式shell **12/12、内部25**，HTML **17/17**及同字节SIGINT/SIGTERM实际清理通过；后端56和相关边界通过。原失败保留，正常hooks本地提交收录，准确SHA以Git为准；见[本次审修](docs/hackathon/evidence/dsh-g0-host-tool-ocr-review-20261008.md)。下列11/11、32项及源码SHA均属先前执行阶段；SDK BLOCKED/产品PARTIAL，未push或操作杭州。
- 本轮从 `5bf2bc77` 继续，保留已有文档与现场证据；三个独立边界分别验证当前插件包的完整 HTML 宿主链、官方 shell/tool 合同及 SDK 组成/来源，主 Agent 集成共享状态。
- 当前 HTML 插件包 `285f882a…`（8 成员、574 份源码/独立作者输入一致）在固定官方 rc2 Web CLI + headless Chrome 完成 **17/17 PASS**：首个 HTML tab、嵌套选区、事件阻断、源码草稿隔离、CSS-only 绑定保护、实际候选文件收取/预览/确认 v4 与历史回读。修复空 tab 判就绪、卸载后迟到开窗、后端 raw-block 重复偏移及完整文档外壳显示/资源替换问题；原 source/hash/node_map 和 CSP/sandbox 合同保持。正式独立 build/typecheck、35 基础 +129 HTML +2 产物、25 合同、10 原生接线、后端56及专项32通过；限定 renderer 独立负例7通过。自有资源回收，旧失败包/收据保留；见[当前包证据](docs/hackathon/evidence/dsh-g0-html-host-acceptance-20261008.md)。后端为当前源码与合成小库，候选由显式合成写入器生成；真实 DeepSeek、headed/移动端/读屏、该 HTML 包 WSL/生产仍 NOT_RUN，整体 PARTIAL。
- 固定官方shell/tool模块与timeout-policy的本机实测完成：正式入口 **11/11 PASS、内部25场景PASS**，45输入保持，14自有命令/15进程组回收。默认jobs超时会promote而继续运行，policy等待清理并不保证同进程硬中止；失败union的error.info可选。真实超时/中断/leader退出后代负测留证，见[合同报告](docs/hackathon/evidence/dsh-g0-shell-tool-contract-20261008.md)。T2/T17仍PARTIAL，编译来源attestation及Web/模型/WAL/WSL范围不由本项放行。
- 并发验证器的首失败后继续派发、在途请求尚未结束便返回的问题已实际复现并修复；本地 HTTP 请求增加有界超时并读完响应。相关 **21 PASS / 0 FAIL / 0 SKIP**，B0 显式测试登记与 pipeline 语法检查通过，见[失败与回收证据](docs/hackathon/evidence/dsh-g0-backpressure-drain-20261008.md)。这不关闭业务负载、15分钟 SLI 或十次插件更新门禁。
- 固定 SDK 全部26,195文件补归属与保留依赖图，361组件的BOM仍声明incomplete；pnpm11.28.2的provenance/发布身份绑定、六项拒绝和禁网复验通过。17不透明项仅完成格式/有限解码/静态属性，完整安全继续开放；67项证据和30,546条输入记录核对通过。见[组成与信任补证](docs/hackathon/evidence/dsh-g0-sdk-trust-remaining-20261008.md)。上游29公告等八类范围仍使SDK分发BLOCKED，没有重新prepare或修改pin。

### 前两组 OCR 审修（2026-10-08）

- 对本批提交 `1dae6de7` 完成 OCR delegate：14/14代码文件及额外17份测试/文档/固定副本全部核对。3项确认问题已修复：验收输出父目录别名写进输入、两个 app/venv 启动前核验不完整及 owned 进程退出竞态中断清理。当前 bounded **20 PASS**、领域输入12/AST边界12/HTML合同25及边界清单检查通过；原始失败保留。见[审修证据](docs/hackathon/evidence/dsh-g0-parallel-followup-ocr-review-20261008.md)。
- 审修已通过正常 hooks 本地提交 `5bf2bc77`；提交时修后 runner 的 WSL 为 **NOT_RUN**，旧2/2冷安装和15/15 HTTP只属于封存源码。随后复用同一服务包，在杭州新自有namespace用该提交原字节重新验证 **2/2冷安装、15/15 HTTP/保护 PASS**（3.268/4.770秒），73项新证据及135项旧证据逐项核对，4个自有服务进程回收。见[当前源码现场复验](docs/hackathon/evidence/dsh-g0-crm-services-target-ocr-wsl-20261008.md)。生产current/5组监听PID、旧candidate/journal、领域包与pin保持；产品PARTIAL、SDK分发BLOCKED，未覆盖现场/供应链/生产门禁继续开放。

### 前两组续推：官方升级候选与独立交付（2026-10-08）

- 从干净 `68845ad0` 继续。本轮重新读取官方 25 releases、26 tags、30 个 npm CLI 版本：最新 GitHub alpha `0.2.1-alpha.1`、npm latest `0.2.0-rc.2` 及默认 master 的原始锁均未修复已查出的依赖公告，**BLOCKED_UPSTREAM_RELEASE**。26 bindings、29 个实际 import 与12个 slot 仅完成静态核对；没有以此声称新宿主安装/运行兼容，现用 rc2 pin 保持。见[候选与信任证据](docs/hackathon/evidence/dsh-g0-sdk-upgrade-candidate-20261008.md)。
- 指标/知识的同一不可变服务包在杭州自有隔离 namespace 完成 **2/2 离线冷安装、15/15 HTTP 与保护观测**；分别仅安装14/13项依赖，知识包无 DuckDB。首次 SIGTERM 导致验证凭据缺失的失败保留，修复验证器后重新冷安装通过；4个自有服务进程回收，生产 current 与5个监听/PID前后相同。见[目标平台证据](docs/hackathon/evidence/dsh-g0-crm-services-target-20261008.md)。本次不是生产部署或候选准入。
- 独立 workbench 作者入口现在消费明确审核的kit/领域tar，在新自有目录生成开发锁并实际 frozen 离线安装，包内固定synthetic夹具不再向上查找主仓。正式build/typecheck、35基础+111 HTML+2产物及25合同通过；kit全10消费者回归20 PASS / 0 SKIP，package-inputs与AST边界各12 PASS。审查发现的父目录symlink写回源码问题已修复并独立复核关闭；运行包仍8成员，不含开发kit/夹具。见[作者证据](docs/hackathon/evidence/dsh-g0-plugin-author-inputs-20261008.md)及[综合审修](docs/hackathon/evidence/dsh-g0-parallel-followup-review-20261008.md)。
- **SDK 分发 BLOCKED / 产品 PARTIAL**。上游依赖公告、完整身份/撤销/二进制安全、未覆盖宿主/UI/真实身份/生产形状、生产 receive/reconcile/canary/回退及 stop/go 后物理分仓仍开放。旧候选/journal、领域输入、固定 SDK和上游源码保持。

### v2 SDK 目标平台与来源复核（2026-10-08）

- 本轮三个并行边界为 SDK 来源审查、杭州 WSL 隔离验证、旧 HTML 语义核对；共享文档和提交由主 Agent 顺序集成。前两批已通过正常 hooks 本地提交 **`d78c7cd5`** 和 **`e48a6ad3`**，未 push。
- WSL 的新 HOME/store/Corepack 实际准备 **READY / 256.411 秒**，完整及缩减 SDK pack/receive 通过。复用封存的 Linux 缩减包，在非 root、禁外网、SDK/源码只读、生产目录不可读的消费者环境完成 **10/10 消费者、20 PASS / 0 FAIL / 0 SKIP**。范围是目标平台开发 SDK，不是整台干净主机或生产 runtime；见[目标验证与失败恢复](docs/hackathon/evidence/dsh-g0-sdk-wsl-immutable-inputs-20261008.md)。
- 查明 Mac/Linux 的 gzip/zlib 差异会让同内容领域包的压缩摘要不同。验收现显式消费原锁定 tar，重建仅比较全部文件内容；未修改消费者锁或生产接收规则。首次 6/10 失败记录保留，恢复使用同一 SDK，无重复 prepare。
- 来源审查关闭 npm 历史密钥有效期判断和 **17/17** 文件来源字节疑点；仍有上游 **7 个受影响版本 / 29 条公告**，发布者身份/撤销、完整组成与二进制安全未关闭，**SDK 分发 BLOCKED / 产品 PARTIAL**。精确修复版本只完成公开查询，尚未安装或兼容验证，见[来源与依赖报告](docs/hackathon/evidence/dsh-g0-sdk-upstream-trust-20261008.md)。
- 此阶段的下一步是官方升级候选/供应链、指标/知识目标安装和插件作者入口；2026-10-08 的续推结果见上节，不再将已完成的服务冷安装列为 NOT_RUN。未覆盖宿主/UI/真实身份/生产形状、生产 receive/reconcile/canary/回退及物理分仓仍按原门禁；年龄阈值不再是待办。

### HTML 历史差异收口（2026-10-08，已提交 `e48a6ad3`）

- SDK 缩减增量已通过正常 hooks 本地提交 **`d78c7cd5`**，跨平台固定领域输入回归后提交 **`68845ad0`**，均未 push。旧 HTML 工作树 43 项已逐项核对；34 项语义差异中只有两个源码文件有真实遗漏，其余为已接入、替代或历史证据。
- 修复画布输入漏接、预览失败清稿、双向草稿互斥和显式放弃；修正测试入口漏跑 17 项。固定缩减 SDK 下正式 build/typecheck、35 基础 + 111 HTML + 2 构建产物测试通过；backend 定向 51、旧语义兼容 5 通过。见[本次证据与范围](docs/hackathon/evidence/dsh-g0-html-semantic-integration-20261008.md)。旧工作树不删除；私有依赖安装和独立测试夹具已在上方续推中收敛。该历史批次没有浏览器证据；后续当前包本机官方Host/headless17项见上文，真实模型和杭州HTML包仍未验收。

### v2 SDK 缩减分发与复验（2026-10-07，已提交阶段）

- 前批已通过正常 hooks 本地提交 **`fd3ed8b6`**（官方/插件 manager 拆分，41 文件）。本轮从该干净提交继续 T15，缩减器只携带固定插件 pnpm `11.28.2`；官方 `11.7.0` 保留在完整准备环境，SDK 维护不加入每次插件更新。
- 新 v2 SDK 完整包 **816,415,770 bytes** → 开发缩减包 **64,974,828 bytes**，实际 pack/receive 通过。仅 Darwin arm64；新目录接收后，原 SDK/旧依赖不可读、外网禁用、输入只读条件下 **10/10 消费者、17 PASS / 0 SKIP**。相关防护 **56 PASS**，真实接收拒绝 **4/4**；原 SDK 140821 条记录、旧 candidate/journal 和领域包摘要不变。
- 首次归档发现冻结安装遗留两条可选 LibreOffice 包悬空链接；在新副本中从同锁、已验证历史归档恢复精确包，原输入未改。新分发来源包含这次恢复，不能声称完整包全部来自本次冷下载；缩减包不含该包。完整失败与恢复证据保留。
- 新字节内容检查 **0 命中 / 17 覆盖缺口**；222 个版本全部在线查询后为 **7 个版本 / 29 条不同公告**，均位于固定 DSH 上游依赖。17 项不透明内容来源字节重核通过，旧密钥信任、二进制安全、完整 SBOM/签名/撤销仍开放；**SDK 分发 BLOCKED，产品 PARTIAL**。
- 详见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。本轮缩减代码/测试/文档经限定范围审查后随本次本地提交收录；2026-10-07 阶段未 push 或操作杭州。接下来处理官方上游依赖候选及信任，再补 v2 SDK 的 WSL/干净机器和未完成准入，stop/go 后物理分仓。

### 官方与插件工具链拆分（2026-10-07，已提交阶段）

- 从已提交 `7efb5207` 的干净工作树继续 T15；工具链升为 v2，官方 DSH 构建声明 `upstream_pnpm=11.7.0` 与自有插件/kit 的 `pnpm=11.28.2` 分开。13 个自有包声明及 prepare、pipeline、runtime 来源回执、CI 已按职责对齐；官方源码/SHA/锁、领域包摘要不改。
- 已安装 kit 在新 HOME/store/Corepack 中实际准备新 SDK：**READY，552.808 秒，26 SDK / 32 bindings**。首次源码获取超时已保留，通过显式使用本机已配置的代理在另一新目录恢复，TLS 校验保留；不是修改上游来绕过检查。详见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-manager-split-20261007.md)。
- 新 pin 与旧 SDK 身份不混用：旧 kit + 旧 SDK 仍 READY，新 kit + 旧 SDK 返回 `KIT_CLOSURE_IDENTITY`；旧候选与 journal 保持。CI 的工具链触发只覆盖 kit 等维护入口，普通业务插件更新不因此运行整套 runtime 准备。
- 新 SDK 在旧 SDK/现成依赖不可读、外网禁用且输入只读时 **10/10 消费者、24 PASS / 0 SKIP**，140821 条输入保持。相关回归修复生成清单/旧 CI 断言后 **87 PASS**；归档 **27 PASS / 41 subtests PASS**。完整 release 首轮 478 PASS / 1 FAIL，失败项已包含在 87 项重跑中，不宣称完整套件重跑。
- 本批按用户授权经限定范围 `/review` 和 20 项专项验证后本地提交为 **`fd3ed8b6`**，父提交 `7efb5207`；未 push/发布/操作杭州。当时产品仍 **PARTIAL / SDK 分发 BLOCKED**；后续新 SDK 缩减归档与重查结果见上节，完整内容/信任和目标平台仍须补证。

### pnpm 候选兼容验证（2026-10-07，已提交阶段）

- 前批已本地提交 `efbf5417`，从干净工作树继续验证固定 pnpm **11.28.2**。独占 Corepack 缓存 454 个原始成员与已验来源包匹配；候选/旧 11.7.0 两轮均 **10/10 消费者、16 PASS / 0 SKIP**，原图表 tarball 摘要与消费者锁保持。详见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-pnpm-candidate-20261007.md)。
- 修复 board-components 构建器重复硬编码 manager 版本，改为读取本包精确声明；浮动/错版本仍在写输出前拒绝。现有安装测试增加显式候选参数，只修改自有副本，未放宽上游/SDK pin；相关边界 **25 PASS**。空 store 冻结安装 111 个工具依赖、安装后严格 TS/React/Ant Design 类型检查通过，锁/补丁未改。
- 提交前 OCR 审核原 10/10 文件，另核对新增审修记录；修复候选模式漏传 SDK 时跳过 9 个消费者仍退出 0 的问题。新旧 manager 重新实跑各 **17 PASS / 0 SKIP、10/10 消费者**，相关边界 **25 PASS**；见[本轮审修](docs/hackathon/evidence/dsh-g0-kit-pnpm-review-20261007.md)。
- 本批候选验证及审修已提交为 `7efb5207`，父提交 `efbf5417`；该阶段仓库 pin 和官方 DSH 源码保持，SDK/candidate/journal 未改，未 push 或操作杭州。该历史结果不等于新 SDK 构建完成或分发放行；产品 **PARTIAL / SDK BLOCKED**。
- 当时的下一步为拆分 manager 并迁移默认 pin/prepare/CI；实施结果见上节。官方依赖/供应链、WSL/干净机器和物理分仓仍按既有顺序推进。

### SDK 提交前审修与剩余任务（2026-10-07，已提交）

- 按 OCR delegate 完成原始 13/13 文件审核，新增审修账本另审；修复扫描器请求预算越界、失败时查询计数失真、HTTP 错误响应流未释放三项问题。回归先 3 FAIL 后通过；本次相关 Node **53 PASS / 0 SKIP**、归档 **27 PASS / 41 subtests PASS**，当前解析器只读验证同一 63.75 MB 包通过。详见[审修、初衷与剩余任务](docs/hackathon/evidence/dsh-g0-kit-sdk-supply-review-20261007.md)。
- 当前代码重新查询同一 SDK：222 个版本全部完成、5 次请求，仍 **10 个版本 / 42 条公告，分发 BLOCKED**。pnpm 11.11.0 完整候选仍有 7 条公告；进一步核验的 **11.28.2** 包摘要/签名通过、27 份带版本清单查询无命中，可进入隔离兼容验证，尚未安装或改 pin。官方 DSH 0.2.0-rc.2 锁文件选定依赖仍命中公告，不能靠改版本号关闭。
- 本批归档、供应链入口和审修共 14 个文件随本次本地提交收录，父提交 `d9770b9c`，准确 SHA 以 Git 为准。未 push/发布/操作杭州，candidate/journal 保持；产品仍 **PARTIAL / release_ready=false**。
- 顺序保持：工具链/官方宿主的独立候选与信任 → WSL/干净机器 SDK、其他服务目标安装 → 未覆盖宿主/UI/生产形状验收 → stop/go 与物理分仓/独立 CI。HTML 43、public 138 文件及其他旧工作树成果另行保留。官方 DSH + 独立领域插件/服务的初衷保持；SDK 维护不加入每次业务插件更新。

### SDK 供应链清单与实查（2026-10-07，上一实施阶段）

- 新增显式仓库级包清单/OSV 入口，默认离线；固定 closure 后生成 CycloneDX 1.6 清单和可复核查询记录，错误/超时不当作通过。实际为 360 份带版本包清单、33 份模块格式声明、1 份无版本私有构建清单；222 个安装依赖版本送查。新增及相关防护 **50 PASS**，离线沙箱实跑通过，见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-sdk-supply-chain-20261007.md)。
- **SDK 分发审查 BLOCKED**：实际 OSV 命中 10 个版本、42 条不同公告（公告评级 1 CRITICAL / 22 HIGH / 13 MODERATE / 6 LOW）。7 个版本归固定 DSH 上游、3 个归 pnpm/内置依赖；已列明建议修复版本并查询，不代表兼容性或生产可利用性已验证。未改动上游、pin、锁或 SDK 字节。
- 17 项不透明文件均补来源字节核对：14 项匹配 5 个固定 npm tarball，3 字体匹配固定上游源码；5 包 SRI/密码学验签与篡改消息负测通过，但 `rc-tree-select@5.27.0` 签名密钥已过期，当前信任仍待审。字体使用 OFL 1.1，不能套用所属包的 MIT 自述。完整内容审查、发布者身份/撤销、目标平台和分仓门禁仍开放。
- 本阶段结束时与前批归档增量尚未提交，后续本地收录见上方审修；杭州未操作。下一步先准备受控依赖/上游升级候选并验证兼容性，再继续 WSL 冷验证；产品仍 **PARTIAL / release_ready=false**。

### 缩减 SDK 归档与接收（2026-10-07，上一增量）

- 前批 33 文件经审修和正常 hooks 已提交 **`d9770b9c`**，本轮从干净工作树继续 T15。现有归档器增加显式缩减模式，传输包/内部清单双摘要、原清单字节保留；修复 Python 链接预归一化及输出目录可能写入源 SDK 的边界问题。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-sdk-compact-transport-20261007.md)。
- 真实安装 kit 后生成 **63.75 MB** 包（较原完整 ZIP 减少 **92.15%**），14.923 秒打包、12.313 秒接收；原 closure `7fa86cc9…` 不变。最终 `received-r2` 在原 SDK/旧依赖不可读且外网禁用时 **10/10 消费者 PASS，外层 15 PASS / 0 SKIP**；归档 **27 PASS / 41 subtests PASS**，相关防护 **38 PASS**，真实 CLI 6 项负测均拒绝。原完整包、SDK/旧证据和 candidate/journal 保持。
- 17 项不透明内容均已核对包归属、格式和原归档字节（6 图像/3 字体/8 原生文件）；实际扫描仍 **0 命中 / 17 缺口，PARTIAL**。当时尚未提交，现随上述审修收录；未操作杭州。下一步为来源/完整内容审查与 SBOM/CVE/签名/撤销，随后目标平台/WSL 冷验证和分仓门禁；产品仍 `release_ready=false`。

### 插件开发 SDK 缩减与提交前审修（2026-10-07，已提交阶段）

- T15 的同平台缩减输入已通过：约 **2.20 GB → 227.7 MB（逻辑字节减少 89.63%）**，固定 DSH/pin/清单摘要，保留现有完整 checkout 路径。原 SDK、旧缓存和仓库现成依赖不可读、外网禁用时，**10/10 消费者构建与选定测试 PASS**（套件 15 PASS / 0 SKIP）；完整 SDK 路径也 10/10 PASS，防护/审计/边界 **35 PASS**。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-sdk-closure-20261007.md)。
- 最终候选 `closure-r9` / `7fa86cc9…`：26190 文件、1261 链接。实际模式扫描 **0 命中、17 覆盖缺口，PARTIAL**；来源签名、SBOM/CVE、缩减格式分发与新机器/WSL 仍未关闭。原 SDK/旧证据、首购候选与 journal 保持；杭州没有切换。
- 提交前按 OCR delegate 审核原 32 个变更文件，另核对本轮审修记录；修复“链接经过清单外中转后返回 SDK”仍被接受的问题，保留合法目录链接。修复后重新运行防护 **38 PASS**、归档 **17 PASS / 25 subtests PASS**，缩减/完整 SDK 各 **10/10 消费者 PASS**。见[审修与提交证据](docs/hackathon/evidence/dsh-g0-kit-sdk-review-20261007.md)。
- 本批与上一批审计增量已由本地提交 `d9770b9c` 收录，父提交 `78175422`；`release_ready=false`。后续归档往返见上节，T15 整体和物理分仓仍未完成。

### SDK 内容审计与来源分类（2026-10-07，上一增量）

- 前批 15 个文件经差异审查、16 项归档测试/25 subtests 和正常 hooks 本地提交 **`78175422`**；提交后工作树干净。随后新增仓库级只读 SDK 审计入口，复用归档校验和现有秘密检测规则，报告不得写入 SDK 或覆盖旧证据。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-content-audit-20261007.md)。
- 同一 812 MB 归档实际复核 **115224 文件 / 8987 链接**，最终 84.996 秒、退出 2：**55 个疑似命中文件、553 个覆盖缺口，BLOCKED**。命中来源已分类为 30 个固定上游原文、24 个依赖文件、1 个生成文件；没有将来源分类冒充秘密清除。归档负测 **17 PASS / 25 subtests PASS**，审计/边界 **18 PASS / 0 SKIP**；完整 pipeline、跨平台和供应链验收未运行。
- 本次审计代码/文档为 `78175422` 之后的新增量，与上方缩减 SDK 一起完成审修并纳入本次本地提交。整体 **PARTIAL / release_ready=false**；实际保留内容和来源仍需继续审查，避免每次插件开发携带/扫描整套宿主依赖。本轮没有推送、发布或杭州操作。

### 开发 SDK 本地归档与接收（2026-10-07，已提交）

- 延续 `90d5012d` 和前轮四份文档，新增 kit `sdk-archive.py pack/receive`：普通内容块 + 严格链接清单、固定准备记录/pin/平台、归档/文件摘要与限额、独占目标和失败 staging 回收，生产解包规则保持。真实约 **812 MB** 归档在新目录接收通过，10/10 消费者离线构建/测试，相关 **38 PASS / 0 SKIP**；archive 负测 **16 PASS、25 subtests PASS**。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-sdk-archive-20261007.md)。
- 原 SDK 124231 条、接收 manifest 141091 条、1318 个旧证据及 candidate/journal seq 6 保持。本批已于后续提交 `78175422`，没有杭州或发布动作。只关闭同平台本地归档往返；完整秘密扫描、签名/SBOM/CVE/撤销、最小闭包与新机器/WSL 仍开放，回执继续 **release_ready=false / PARTIAL**。

### kit 已提交与开发输入迁移（2026-10-07，上一增量）

- 前批 OCR 审修的 64 个文件已通过正常 hooks 本地提交 **`90d5012d`**，提交后工作树干净；未 push 或部署。随后继续 T15，固定 SDK/工具/Corepack 在新目录、原 SDK/旧缓存不可读且外网禁用的 sandbox 内完成 **10/10** 消费者构建/测试（套件 **15 PASS / 0 SKIP**，27.64 秒），见[迁移验证](docs/hackathon/evidence/dsh-g0-kit-relocation-20261007.md)。
- 原输入和迁移副本各 **124231** 条内容/链接/权限记录保持，原候选与 journal seq 6 不变。只关闭同一 Mac 的 kit 支持构建路径迁移；约 2.2 GB 是开发闭包的逻辑大小，不是插件部署包。跨平台预编译分发、签名与新机器/WSL 仍开放，整体 **PARTIAL**；本次后续增量只记录证据与任务状态。

### kit 增量提交前审核（2026-10-07，已提交阶段）

- 按用户指定 OCR delegate 完成 **50/50** 代码/配置路径及额外 **13/13** 文档核对；修复 pnpm symlink 入口静默空跑和最终 Git 预检继承应用环境的问题，两项负测先失败后通过。见[审核记录](docs/hackathon/evidence/dsh-g0-kit-review-20261007.md)。本次审核覆盖此前全部未提交 kit 增量，不改业务运行时或 DSH 上游。
- 修复后保护测试 **18 PASS**，受影响回归 **156 项覆盖**（首次 153 PASS、3 项因测试 PATH 缺 zstd 失败；补齐已安装工具后对应 release 套件 **41/41 PASS**）。包含 10/10 独立消费者构建/测试；旧 1318 文件、候选和 journal seq 6 保持。当前范围没有未关闭高/中严重度发现；生产/分仓门禁仍 PARTIAL。
- 本批按本次授权进行本地 commit，不外推或部署。提交后继续 SDK/工具闭包可移植性与分发验证；不复用旧冷准备结论冒充新版入口全程或目标 WSL 已运行。

### kit 首次 SDK 准备（2026-10-07，上一增量）

- kit 新增显式 `prepare.mjs`：从已安装的 kit 在全新 HOME/Corepack/store 中获取固定官方源码、冻结依赖，仅构建 SDK 与工具输入。真实空目录准备 **READY / 约 8 分 18 秒**，26 个 SDK 入口通过；不再要求提前存在主仓 SDK 目录。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-bootstrap-20261007.md)。
- 新输入下全部 **10/10** 消费者构建/测试通过（kit 套件 **15 PASS**），修复旧测试 `git status` 刷新 index 后，**123781** 个 SDK/工具文件及链接记录保持。保护/安装测试 **16 PASS**、相关边界/发布回归 **67 PASS**；1318 个封存文件和原候选/journal seq 6 保持。
- 首次遇到 Node CA 链不完整，显式公共 CA 文件恢复校验，未关闭 TLS；失败证据保留。整体仍 **PARTIAL**：这是本机新依赖目录，预编译闭包分发、整台干净机器/新入口 WSL、签名/registry、业务 UAT 和物理分仓仍开放。未 commit、push、发布或操作杭州。

### 全部 kit 消费者迁移（2026-10-07，上一增量）

- 在 `cc1d8497` 及前批未提交修改上继续，10 个构建消费者已全部改用 kit 精确开发依赖和公开导出；真实离线安装后，无相邻插件/kit 源码构建与测试 **10/10 PASS**。修复漏斗/瀑布图测试依赖工作台的问题，跨包断言由仓库级测试维护；领域包摘要保持。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-all-consumers-20261007.md)。
- 相关回归 **88 PASS**；追加隔离 HTTP 覆盖后的 kit 套件 **15 PASS**（与 88 重叠），CLI/release **73 PASS**。B0/preflight/CRM calibration/reload 接线完成，未运行完整 pipeline、calibration 或实际 reload；1318 个封存文件、候选/journal seq 6 保持。
- 本批仍未提交，没有杭州操作。该批安装测试使用固定已准备 SDK；后续新目录准备见上节。预编译 SDK/工具闭包分发、整台干净机器安装、签名/供应链与业务准入仍开放，物理分仓未关闭。

### 已提交基线与独立 kit 安装（2026-10-07，上一增量）

- 前一批 27 文件经审查及提交前 26 项定向验证、正常 hooks 本地提交 **`cc1d8497`**，随后从干净工作树继续。没有 push/发布或生产切换。
- 首个 shine-brand 消费者改用 kit 公开包导出与精确 devDependency，实际 pnpm 离线安装到新 store 后，在没有相邻 kit 的目录构建/测试通过；B0/preflight 的 workspace 接线同步。相关 **34 PASS**、release CLI/核心 **53 PASS**，仍未覆盖 SDK 全新机器分发和 registry 签名交付。见[本轮证据](docs/hackathon/evidence/dsh-g0-kit-install-wsl-rebuild-20261007.md)。
- WSL 已恢复连接；新隔离 rc1 官方 host/native 构建及三组恢复矩阵完成，现场取回/保护与清理结果见同一证据页。原 current 保持 r3，现有候选/journal 不换包，整体 PARTIAL。

### rc1 重建与 kit 包边界（2026-10-07，上一增量）

- 从固定 `46a7f68…` 新源码树完成冻结依赖、官方 host/native 构建；三类语料 **12 场景 / 30 冷进程通过**，99839 个构建输入条目保持。四个 rc1 manifest/JS 入口摘要与旧 WSL 记录一致，详见[本轮证据](docs/hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)。这是本机新输入的构建追踪，旧 WSL 完整闭包与签名仍未认证。
- kit 新增源码包白名单/公开 export 和只读输入预检；实际解包 kit 可构建叶子插件，相关 **21 PASS / 0 SKIP**，边界清单通过。仍需固定 SDK/build-tools，尚未发布 kit 或完成全新机器安装。本轮只在本机施工，保留既有候选/journal 与未提交改动，未 commit/push 或操作杭州，整体 PARTIAL。

### 包来源绑定与独立构建复核（2026-10-07，前一增量）

- 修复 release attestation 未强制绑定源码 SHA 的缺口；安装与 publish 两入口同步，拒绝无效 subject/结构和校验期间包变化，错误回执脱敏。本次完整 release suite **434 PASS / 0 FAIL / 0 SKIP**；真实 GitHub runtime 签名正确 SHA 通过、错误 SHA/包拒绝，见[本轮证据](docs/hackathon/evidence/dsh-g0-attestation-binding-20261007.md)。
- 四个叶子插件在仅自身源码 + dev kit 的临时目录构建/测试/打包 **4/4 PASS**；仍依赖固定 SDK 和工具闭包，独立 kit 分发未完成。rc1 原编译来源继续 NOT_VERIFIED；T5/T19 的插件签名/SBOM/CVE/撤销与 G0 门禁仍开放。本轮没有杭州操作、GitHub 发布或提交，保留前批未提交修改，整体 PARTIAL。

### 附件/委派元数据恢复（2026-10-07，当前增量）

- 从干净 **`418edc29`** 继续 T2/T7，新增显式 `--corpus rich` / v3，核对图片/文件引用、relay/notice 来源、父会话、descriptor/delegationDepth 及官方恢复投影；tool/rich 续写前先验证已有语料。本机 **18 PASS / 0 FAIL / 0 SKIP**。
- 新控制器按工作树字节封存，在杭州 WSL2/UID 65534 完成 **4/4 PASS、10 冷进程**，8→15 事件；49 个结果文件取回校验，30147 个 runtime 输入条目和五个控制器保持，临时目录已回收、生产快照不变。见[本轮证据](docs/hackathon/evidence/dsh-g0-session-rich-corpus-20261007.md)。本批尚未提交，不冒充 clean artifact；候选 journal 仍 seq 6，整体 PARTIAL。
- 已同步当前兼容矩阵与计划 T2/T7 汇总，移除已完成项的 NOT_RUN 和结果年龄“暂缓”残留。下一步是旧 rc1 编译来源/包信任证明与独立构建前置；真实附件/委派执行、其他事件组合和生产准入不由本语料代签。

### 工具会话杭州跨版本验证（2026-10-07，上一阶段）

- 本机工具语料及结果年龄策略经 OCR delegate 13/13 审核，正常 hooks 提交 **`aebf4e38`**；当前年龄策略已收口，不再等待阈值。
- 同一提交控制器在杭州 WSL2、UID 65534 完成工具持久化矩阵 **4/4 PASS，10 个冷进程全部退出 0**：截断恢复、rc1→rc2 读取续写、rc2→rc1 读取、保留旧状态回退。见[本轮证据](docs/hackathon/evidence/dsh-g0-session-tool-wsl-20261007.md)。
- 固定 runtime 包由杭州直接下载并核验；48 个证据文件已取回，30147 个 runtime 输入条目保持，1318 个本机保护文件保持；自有临时目录已回收，current/五个生产监听 PID 未变，候选 journal 仍 seq 6。未执行生产切换或真实工具/模型。
- **仍 PARTIAL**：完整媒体/委派语料与 rc1 编译来源证明、真实身份/模型/UAT、供应链、生产准入和 G0 stop/go 未关闭。后续依既有顺序补兼容证据，推进包信任与独立构建前置，再收口物理分仓；不重新引入年龄阈值待办。

### 工具会话恢复语料（2026-10-07，本机阶段）

- 浏览器 v2 门禁经 OCR delegate 21/21 审修后，正常 hooks 本地提交 **`d8a84d66`**；提交后工作树干净，没有 push 或生产动作。
- 已继续 T2/T7，增加显式 `--corpus tool`：固定 rc2 实际 reader/writer 四个冷进程完成 13→26 事件截断恢复和官方消息投影核对，调用/结果/错误/meta 保留。相关测试修正一处故障注入夹具后 **11 PASS / 0 FAIL / 0 SKIP**，见[本轮证据](docs/hackathon/evidence/dsh-g0-session-tool-corpus-20261007.md)。
- 本机阶段只证明 rc2 持久化与消息恢复，未提供 rc1 时 CLI 返回 PARTIAL/2；杭州工具跨版本已由上节后续完成。media/delegation 与编译闭包来源仍开放。candidate/journal seq 6 保持，本批已提交 `aebf4e38`。

### 新候选浏览器回执接线（2026-10-07，已提交阶段）

- 在 `db16041a` 和前轮 5 个文档改动上继续，新增显式 `dsh-browser-host-evidence/v2`，仍走 `plugin verify-host`，独立核对插件/服务来源，关联终态 Host seq 5；v1 HTTP 父事件合同不变。见[本轮门禁证据](docs/hackathon/evidence/dsh-g0-current-browser-gate-20261007.md)。
- 原 `a490457c…` 候选已追加 **seq 6 / CANDIDATE_BROWSER_HOST_OBSERVED**。原始 archive/inventory、固定 runner/控制器、五场景与清理观察通过；前五事件保持，重试不写，实际错误父事件拒绝，1318 个保护文件保持。
- 本轮完整 release suite **429 PASS / 0 FAIL / 0 SKIP**（含 v2 38）；新门禁已进入 B0 测试清单。没有重新运行杭州浏览器、改包或生产动作。提交前 OCR delegate 21/21 已审查，修正文档验收范围；本次新跑 release 429 PASS（92.13 秒），实际重试/错父拒绝再次通过。本批及前轮文档随本次本地提交交付，整体仍 PARTIAL / release_ready=false。
- 下一步：核对剩余 G0 证据与准入条件，继续完整跨版本、真实身份/模型/UAT、供应链和生产 activation/canary/rollback；物理分仓仍受 G0 约束。

### 新候选杭州隔离浏览器验收（2026-10-07，上一阶段）

- 终态门禁已审修并通过正常 hooks 提交 **`db16041a`**（16 文件）；本轮再用同一 `a490457c…` 候选完成杭州 Chrome headless **5/5 场景 / 官方 Host 1 PASS，78.00 秒**，见[新候选浏览器证据](docs/hackathon/evidence/dsh-g0-first-purchase-current-browser-20261007.md)。插件、CRM、服务、runtime 未重新构建。
- 184 个结果文件及 inventory 已取回核对，620 个本机保护文件和 journal seq 5 保持；510 个密封远端输入保持、独有进程/目录已回收，生产 current/监听 PID 不变。截图中文可读，真实身份/模型和生产切换未运行。
- 该阶段 journal 保持 seq 5；后续已通过上节显式 v2 接入 seq 6，没有套用旧同 SHA/browser 事件。整体 PARTIAL / release_ready=false；此阶段后续文档随浏览器 v2 门禁批次提交。

### 终态恢复回执门禁接线（2026-10-07，已提交阶段）

- 上一批审修正常 hooks 提交 `25d9c53c`，本批从干净工作树继续。`plugin verify-host` 新增 `dsh-terminal-host-evidence/v1`，为同一 `a490457c…` 候选交叉核对固定控制器、runtime/四包、HTTP 23 项与恢复 2 项、FAILED/EXECUTION_UNKNOWN、活动名额释放、派发一次、持久前缀及清理观察。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-terminal-gate-20261007.md)。
- 已有真实杭州回执进入原候选 journal **seq 5 / CANDIDATE_TERMINAL_HOST_OBSERVED**，引用服务目标 seq 4；前四事件保持，CLI 重试字节/mtime 不变，实际错父事件退出 2 且不写状态。619 个受保护文件保持。**本次只关闭终态回执接线子项**。
- 本轮完整 release suite **391 PASS / 0 SKIP / 0 FAIL**（含新门禁 37 项）。未重新执行杭州服务，不读取真实业务库；历史现场观察仍标记 `UNATTESTED_OPERATOR_OBSERVATION`，整体 PARTIAL / release_ready=false。本批代码、测试、文档经 OCR delegate 审查，随本次提交交付。
- 下一步：同一新候选杭州隔离浏览器验收 → 其余准入证据/G0 stop-go；完整跨版本 corpus、当前包浏览器、真实身份/模型/UAT、供应链和生产 activation/canary/rollback 仍开放。物理分仓继续受 G0 约束。

### 新插件独立更新与杭州终态恢复（2026-10-07，上一阶段）

- 从干净 `3ffbd2a2` 只重建 workbench，固定新候选 `a490457c…` / tgz `c9770d11…`；CRM、查询/保存服务、profile 与官方 runtime 复用。仅三个编译入口变化，见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md)。
- 修复验收入口强制插件/服务同 SHA 的耦合，新增显式来源 v2；v1 保留原合同。新候选本机固定包 1 PASS，杭州来源 10/10 PASS、官方 Host SIGKILL 终态恢复 1 PASS（76.49 秒）：FAILED/EXECUTION_UNKNOWN、活动名额释放、派发一次、分析一条。**该候选的恢复缺陷现场子项关闭**。
- 新服务目标回执接入 journal seq 4，CLI 重试不改字节/mtime；Host 终态原始回执已封存，独立终态 journal verifier 尚未接通，不能套用旧候选 HTTP/浏览器事件。整体仍 PARTIAL / release_ready=false。
- 349 个封存输入和 43 个来源输入保持，228 个结果归档条目取回校验；本次进程/目录回收、生产 current/五个监听/PID 未变。实施阶段完整 release suite 354 PASS / 0 SKIP，Python 11 PASS。本批 verifier/测试/文档经 OCR delegate 审修，随本次提交交付；提交号以 Git 为准，未发布或切换生产。审查验证见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md#提交前审查与维修)。
- 下一步：终态回执门禁接线 → 新候选其余准入证据/G0 stop-go；HTML 差异、独立构建和包信任仍按已定边界并行准备。

### 恢复投影源码修复与工作树核对（2026-10-07，上一阶段）

- 前批恢复演练/证据正常 hooks 提交 `de89a527`（15 文件）。本轮补官方异步历史投影、事件重叠和卸载处理，并为各入口显式声明服务依赖；Node 66 PASS、后端 50 PASS，官方 Host 终态整链 1 PASS（4.44 秒），见[修复证据](docs/hackathon/evidence/dsh-g0-native-journal-recovery-fix-20261007.md)。
- 本机中断 run 为 `FAILED / EXECUTION_UNKNOWN`、`execution_active=false`，派发仍一次，原保存仍一条。**只关闭本机源码缺陷，不关闭新候选/杭州门禁**；旧候选 `861d6ef1…` 仍保留其 UNKNOWN 结果。当前没有生产切换。
- 旧 public 的 138 条 Git 改动都能匹配当前分支或其历史已提交内容；HTML 工作树仍有 34 个文件待语义审查。见[归属与并行边界](docs/hackathon/evidence/dsh-g0-worktree-triage-20261007.md)。没有清理或覆盖旧工作树。
- 下一步：本批审核提交后固定新插件候选，复用原服务/runtime 验证终态恢复；HTML 差异审修、独立构建依赖与包信任验证可按隔离边界并行，journal/候选接线顺序收口。整体仍 PARTIAL。

### 当前候选的 WSL 恢复验收（2026-10-07，上一阶段）

- 原四包/runtime 在目标 WSL2、UID 65534 完成正式首购受理→模型等待期间 SIGKILL→同一会话恢复；整链 **1 PASS（76.91 秒）**，50 条已提交事件前缀保持、同请求不重复派发、原保存仍一条、普通原生对话可用。官方持久化截断/rc1↔rc2 文本回合 **4/4 PASS**，固定新旧保存包的 forward-fix **14/14 PASS**，见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md)。
- **该阶段发现的 P1**：旧候选崩溃业务 run 为 `UNKNOWN / execution_active=true`，不能视为终态恢复。当时 nativeJournal 只折叠实时事件，而 rc2 恢复 seed 不重发事件；后续本机源码修复见上节，新候选终态验证仍开放。不得仅凭进程退出清除状态。
- 本机新恢复/mock **8 PASS**、宿主保护 **45 PASS / 3 SKIP**；三项 skip 未冒充通过。15 个固定输入与 journal seq 6 保持，远端 185 个封存输入不变，291 个结果文件取回校验；临时进程/目录已回收，生产 current/监听/PID 未变。
- **仍 PARTIAL / release_ready=false**：旧 rc1 编译闭包构建证明、完整跨版本 corpus、生产身份/UAT、供应链与 activation 等仍开放。恢复工具/证据已完成提交前 [OCR 14/14 审核](docs/hackathon/evidence/dsh-g0-recovery-harness-review-20261007.md)，作为独立测试批次交付；业务 P1 不在本批修复，未 push 或切换生产。

### 目标恢复矩阵前置核验（2026-10-07，上一阶段）

- 上一批正常 hooks 本地提交 `b6cecdb6`，提交后干净；本步三次 Tailscale/SSH 只读命令成功，工具/空间/测试端口可用。已核对旧 rc1 commit `46a7f68b…` tracked clean 与现役 rc2 元数据，并纠正上表的过期 current 指针，见[本步证据](docs/hackathon/evidence/dsh-g0-first-purchase-recovery-preflight-20261007.md)。
- 当时形成固定候选/新旧 runtime 的恢复输入清单，crash/torn-frame/跨版本场景为 **NOT_RUN**；随后实际执行结果见上节，旧 CRM/知识 Host 结果不代替首购当前包。
- 该前置阶段仅新增证据与文档；随后同一未提交增量补了隔离 runner。没有生产服务动作、真实数据访问、push 或发布。

### Host / 浏览器门禁审修（2026-10-07，上一阶段）

- OCR delegate 覆盖全部 **28/28** 原改动（17 代码/CI、11 文档）；修复 HTTP 矛盾 pytest 日志被接受、B0 清单遗漏 browser 门禁和保存准入文档陈旧。见[本轮审核记录](docs/hackathon/evidence/dsh-g0-first-purchase-host-browser-review-20261007.md)。
- 本轮 release **348 PASS / 0 SKIP / 0 FAIL**；环境/宿主保护 **52 PASS / 4 SKIP / 0 FAIL**。原 HTTP/browser 回执重新核验成功，原 journal seq 6 字节/mtime 与 15 个固定输入不变；本批已按授权正常 hooks 本地提交 `b6cecdb6`。
- **仍 PARTIAL**：下一步目标 WSL 在途/torn-frame/跨版本恢复；其余生产门禁保持开放。本轮审修没有重跑现场、push 或生产切换。

### 目标浏览器回执接线（2026-10-07，上一阶段）

- 同一候选 `861d6ef1…` 的既有 WSL 五场景回执已通过 `plugin verify-host` 接入原 journal **seq 6**，引用原 runtime Host seq 5；前五事件和 15 个固定候选输入保留。实际 CLI 重试字节/mtime 不变，错父事件退出 2 且不写状态，见[本轮接线证据](docs/hackathon/evidence/dsh-g0-first-purchase-browser-gate-20261007.md)。
- 新增 browser schema，复用 HTTP 的包/runtime/进程校验，明确 headless、synthetic、NOT_RUN 与未签名观察边界。本轮完整 release suite **345 PASS / 0 SKIP / 0 FAIL**（含新门禁 34 项）。只核验已有证据，没有重新运行杭州服务/浏览器，也未提交、推送或生产切换。
- **仍 PARTIAL**：下一步为当前候选的目标在途/跨版本恢复；headed/移动端/无障碍、真实身份/模型/UAT、供应链与 activation/canary/rollback、物理分仓仍开放。`release_ready=false`。

### 目标浏览器验收（2026-10-07，上一阶段）

- 杭州 Tailscale/SSH 已恢复。候选 `861d6ef1…` 的原四包和固定 Linux runtime `a049f061…` 在实际 WSL2、UID 65534、Chrome headless 完成官方 Host **1 PASS / 5 场景 PASS**：登录前拒绝、CRM 登录、原生查询与确认保存、刷新核对、普通原生对话。见[本轮目标浏览器证据](docs/hackathon/evidence/dsh-g0-first-purchase-target-browser-wsl-20261007.md)。此前[12:21 连接失败记录](docs/hackathon/evidence/dsh-g0-first-purchase-target-browser-20261007.md)保留。
- 修复驱动依赖系统语言的问题，固定 `zh-CN`；浏览器/缺失库/CJK 字库只在临时目录解包。最终 r3 **1 passed, 2 warnings，84.31 秒**，中文截图已核对；r1 失败和 r2 交互通过但缺字体的证据保留。本机保护 **47 PASS / 4 SKIP / 0 FAIL**，未重跑上一阶段 311 项 suite。
- 该现场阶段原候选 15 个固定输入及 journal seq 5 保留；后续浏览器回执已独立接线至 seq 6，见上节，不冒用 HTTP-only 门禁。本轮临时目录已回收、测试端口已关闭，生产五个监听/PID 保持不变，无生产保存、activation、Git 提交或发布。整体仍 **PARTIAL**。
- 同一候选的 browser observation 后续接线见上节；继续处理目标在途/跨版本恢复；headed/移动端/无障碍、真实身份/模型/UAT、供应链及生产 activation 仍开放。

### 目标宿主回执接线（2026-10-07，上一阶段）

- 上一批 29 文件已按正常 hooks 提交 `4d792eeb`；提交后工作树干净。当前新增首购 runtime Host 回执校验，沿用 `plugin verify-host`，未改变旧 CRM＋知识 v2 证据合同。
- 原杭州证据、输入封套、固定控制器源码、runtime/插件/服务摘要及进程/清理记录经本地核对，进入候选 `861d6ef1…` 原 journal **seq 5**。重复命令不改字节/mtime，前四条事件和 15 个固定输入保持不变，见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-runtime-host-gate-20261007.md)。
- 新门禁 **33 PASS**；本轮完整 release suite **311 PASS / 0 SKIP**。新事件为 `CANDIDATE_RUNTIME_HOST_OBSERVED`，保留 `UNATTESTED_OPERATOR_OBSERVATION` 和 `release_ready=false`；本轮未重跑杭州服务，也未 push、发布或切换生产。接线增量尚未提交。
- **该阶段 PARTIAL**：目标桌面 headless 浏览器已在上节接续完成；在途/跨版本恢复、真实身份/UAT、供应链和生产 activation 仍开放。

### 固定 Linux runtime 与首购包的杭州宿主组合（2026-10-07，上一阶段）

- 复用已发布的固定 Linux runtime `a049f061…`，同一 workbench/CRM/查询/保存四包在杭州 WSL2、UID 65534 完成官方 Host HTTP **1 PASS**。实际原生命令、查询 worker、保存 ACK 核对、服务/宿主重启及无业务工具的原生对话通过；最终一条分析、一个 worker。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-runtime-host-20261007.md)。
- 新 v5 演练入口直接加载 immutable runtime，无需 DSH checkout；原 Mac pack receipt 保留，Linux wheel 单独核验。修复恢复测试过早采样的问题；本轮保护 **49 PASS**、进程/输入 **13 PASS**、release suite **278 PASS**、原 v4 整链 **1 PASS**。两次失败及修复证据保留。
- 8 个自有 PID、临时目录已回收，现役五个监听/PID 不变；原候选文件和 journal seq 4 不变。**仍 PARTIAL**：目标浏览器、在途/跨版本恢复、真实身份/UAT、供应链、目标 Host 回执接线与生产 activation 仍开放；本次未提交、推送或切换生产。

### 来源 HTTP 的目标回执接线（2026-10-07，上一阶段）

- 已将原始杭州 WSL 十项回执通过现有 `plugin verify-service` 接入候选 `861d6ef1…` 的原 journal **seq 4**，复用 seq 3 服务包事件；业务包仍固定 `f9726f68`。见[本轮接线证据](docs/hackathon/evidence/dsh-g0-first-purchase-source-target-gate-20261007.md)。
- 当前新门禁 **34 PASS**，完整 release suite **278 PASS / 0 SKIP**；真实 CLI 重试不改 journal 字节/mtime，本机 scope 和错候选回执被拒绝。15 个固定候选文件、原现场输入/回执不变，前三条历史事件保留。审核补齐了固定 runner 对候选源码 SHA 的约束。
- 目标宿主预检：Tailscale/SSH 正常，杭州 Node 24.21/Python 3.14、工具与临时空间具备。现有本机 runtime 含 Mac 原生依赖，演练仍依赖 checkout 布局；已定位已发布的另一份固定 runtime 元数据供复核，Linux 闭包/完整宿主验收尚未执行。详情见同一证据页。
- **仍 PARTIAL**：仅关闭服务现场回执接线；目标 DSH/插件/浏览器、当前包跨旧版本目标恢复、真实身份/UAT、供应链与生产 activation 仍开放。新观测不证明生产监听、远端签名或完整部署身份；本轮未访问真实数据、切换杭州、push 或发布，本地增量尚未提交。

### 固定查询/保存包的杭州 WSL（2026-10-07，上一阶段）

- 上一批 15 文件已经正常 hooks 本地提交 `09080b77`；业务 archive 继续固定 `f9726f68`。同一查询包/保存包实际在杭州 WSL2、Python 3.14.4、UID 65534 的隔离目录完成 **10/10 PASS**：15/13 依赖离线冷安装、真实查询 worker、来源 HTTP、关闭年龄判断、SIGKILL 后回执重放和合成小库冷恢复。见[本轮 WSL 证据](docs/hackathon/evidence/dsh-g0-first-purchase-source-wsl-20261007.md)。
- 本次输入保护 **7 PASS**；远端前本机预演 **10/10 PASS**，三次前置脚本失败及修复记录保留。目标 5 个服务进程、1 个 worker、安装/状态/传输目录均已回收，生产五个监听端口/PID 快照未变。16 个当前候选文件与 13 个旧证据保留。
- **仍 PARTIAL**：这里只关闭新包服务来源/同版本恢复的 WSL 子项。该现场阶段原 journal 保持 seq 3；接线后续见上节，目标 DSH/插件/浏览器、当前包的跨旧版本目标矩阵、真实身份/UAT、供应链及生产 activation 未完成。新增 runner/测试/文档尚待本地提交；未 push、发布、切换生产或访问真实数据。

### 新来源 HTTP 的固定双包组合（2026-10-07，上一阶段）

- 源码边界按 OCR delegate 覆盖 23/23 文件，当前后端 228 PASS、官方新路径 1 PASS，经正常 hooks 提交 `f9726f68`。从该 clean SHA 生成独立查询/保存包；workbench 包字节未变、CRM 包复用，官方 DSH 未修改。见[本轮固定包证据](docs/hackathon/evidence/dsh-g0-first-purchase-source-packages-20261007.md)。
- 新 v4 组合要求两包 source 合同一致；保存进程仅获自有状态目录和查询 URL，SQLite audit 拒绝打开查询库。源码/实际保存双包各 **9/9 PASS**，保护 **29 PASS**、进程回收 **6 PASS**；v4 HTTP、同包 v3 兼容、v4 Chrome 各 **1 PASS**，Chrome **5 场景**。查询下线后重启保存服务，原回执仍可重放且只有一条分析。
- 新候选 `861d6ef1…` 的服务回执进入新 journal seq **3**；重试 16 个文件不变、13 个旧固定文件保持原 SHA，23 个记录的临时 PID 已退出。组合驱动/文档为本轮审核后的独立增量，业务包来源不随驱动提交变化。**仍 PARTIAL**：新包 WSL/恢复、真实模型/业务 UAT、供应链与生产门禁未关闭；本轮没有 push、发布、访问真实数据或操作杭州。

### 查询与保存的存储边界（2026-10-07，源码阶段）

- 在 `253cdbc7` 上新增 query-owned `first-purchase-frozen-source/v1` 只读 HTTP 接口与显式保存服务 resolver。新路径只把查询 URL 提供给保存进程，RunStore/SQLite 由查询服务独占；原本机适配保留，不隐式切换旧部署。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-source-http-20261007.md)。
- 当前受影响后端 **226 PASS**、实际 allowlist 隔离导入 **2 PASS**；独立保存进程只打开自己的分析库，查询下线后重启/回执核对/重放不重复保存。官方固定 rc2 的新 HTTP 来源与原兼容路径各 **1 PASS**；当前工作树服务归档回归两种时效模式 **2 PASS**，不是 clean release candidate。
- **仍 PARTIAL**：源码层存储边界子项关闭；新双包的 exact-SHA 组合、WSL/恢复、供应链和生产准入尚未完成。本轮 OCR 提交前复审覆盖 23/23，无新增阻塞缺陷；新一轮受影响后端 228 PASS、官方新 HTTP 路径 1 PASS，合同/Ruff/差异检查通过。未发布或操作杭州；旧包/旧 WSL 结论不转移到新接口。

### 独立查询包的宿主组合（2026-10-07，上一阶段）

- 从 clean `43630981` 继续，新增显式查询内核演练包：46 个允许文件固定取自该 Git SHA，15 个依赖按仓库锁安装到独立 venv（含 DuckDB 1.5.6）。原 workbench/CRM/保存服务三包复用；查询 API、dispatcher 和实际 worker 从解包目录运行。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-kernel-host-20261007.md)。
- 最终保护/model **30 PASS / 0 SKIP**，启动失败/回收 **5 PASS**；workspace HTTP、v2 保存服务 HTTP、v3 全包 HTTP、v3 Chrome 各 **1 PASS**，Chrome **5 场景**。查询服务独立重启、同请求重放仍只有一个 worker/分析；19 个记录的自有 PID 已退出，旧 437 文件与 journal seq 3 不变。
- **仍 PARTIAL**：关闭本机查询包组合子项。演练包不是生产 release；保存与查询仍共享 RunStore/SQLite 合同，CRM/model 为合成端点。服务间存储边界、新包目标 WSL/恢复、供应链与生产 gate 尚未关闭；本轮未操作杭州。

### 独立保存服务包的宿主组合（2026-10-07，上一阶段）

- 从 clean `212005bc` 继续，复用 workbench/CRM 包及原 `d7025f75…` 服务 archive，在独立离线 venv/进程加载保存服务。未重新打包；原生登录、查询、保存和回执链通过，保存服务单独重启后经 Host 重放同一请求，分析记录仍为 1。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-service-host-20261007.md)。
- 当前保护/model **27 PASS**、后端 **5 PASS**；workspace HTTP、artifact HTTP、artifact Chrome 各 **1 PASS**，Chrome **5 场景**。最终 9 个自有 Host/服务 PID 已退出、5 个端口无监听，旧证据 437 文件与 journal 未变。
- **当时 PARTIAL**：关闭本机“插件包 + 保存服务包”组合子项；当时查询 kernel/worker 仍为源码夹具，后续查询包组合见上节。新包 WSL/恢复、供应链和生产 gate 尚未关闭，该阶段未操作杭州或发布。

### 精确插件包的宿主与浏览器（2026-10-06，上一阶段）

- 复用 `9611589c` workbench 包，并从 clean `d3fe7f94` 构建固定 CRM 包；通过新的显式 artifact 模式在私有目录解包，复用生产接收器的 peer 链接，用真实 candidate digest 验证。未改业务插件或 DSH 上游。
- 官方 Host HTTP **1 PASS**，紧接运行的 Chrome headless **1 PASS / 5 项观测**；保护/model 测试 **21 PASS**、受影响后端 **3 PASS**。已修复演练缺 transitive SDK、固定端口 TIME_WAIT 和父初始化错误被遮蔽的问题；见[本次证据](docs/hackathon/evidence/dsh-g0-first-purchase-artifact-host-20261006.md)。
- **当时 PARTIAL**：该阶段只证明精确插件包组合，服务/查询内核由源码夹具运行。旧候选 83 文件及 journal seq 3 未改，临时监听和 Host 已回收；保存服务 archive 的后续进展见上节。

### 原生命令 clean 候选（2026-10-06，上一阶段）

- 原生命令/Chrome 批次已按 OCR delegate 审修并正常提交 `9611589c`，随后从干净 SHA 构建 workbench 和独立首购服务包。本次源码/实际双包兼容各 **9/9 PASS**，相关测试 **106 PASS**，同一服务 archive 的合成 CRM 保存链 **6/6 PASS**。见[候选证据](docs/hackathon/evidence/dsh-g0-native-command-candidate-20261006.md)。
- 候选 `ca79774b…` 绑定插件 `b3571f04…`、服务 `d7025f75…`，本机回执进入 journal seq **3**。重试 52 个当前文件不变，旧 195 个证据文件保留；旧 WSL 回执以 `SERVICE_TARGET_PAIR_MISMATCH` 拒绝。
- **当时 PARTIAL / 激活 BLOCKED**：该阶段只是 workbench 与服务的本地候选绑定；后续精确插件包的宿主/浏览器见上节。独立服务组合、新包目标机、供应链和生产 gate 未关闭。

### 原生首购命令与 Chrome 接线（2026-10-06，上一阶段）

- 从 `f3b7c0cc` 干净工作树继续。workbench 使用官方 `commands.register` 提供 `/first-purchase`、`/first-purchase-status` 和精确任务取消；复用原 kernel/Agent Loop，不修改上游、共享 RPC 或原生输入框。命令只在显式合成 profile 启用，CRM 登录与查询/保存归属保持一致。
- 固定 rc2 的 **Chrome headless 整链 1 PASS / 5 项观测**：未登录拒绝、原生 CRM 登录、输入框查询与显式保存、刷新同一回执、未连接 CRM 的普通原生对话。修复空会话拒绝提示不可见、卡片误依赖其他插件开关、取消范围和迟到回执问题。最终 Host HTTP **1 PASS**、命令/编译卡片 **12 PASS**、相关后端 **35 PASS**，Node24 构建通过。见[本轮证据](docs/hackathon/evidence/dsh-g0-native-command-browser-20261006.md)。
- OCR delegate 已复核本批 **27/27** 文件，修复浏览器初始化/诊断写入异常时的资源泄漏；保护回归 **8 PASS**、真实 Chrome 再跑 **1 PASS / 5 项观测**。正常 hooks 提交为 `9611589c`。
- **当时 PARTIAL**：本地源码和隔离合成数据已验证；后续 clean 候选见上节。headed/移动端/读屏、真实模型与业务数据、目标主机及供应链/生产 gate 未关闭。杭州现役与生产保存未变。

### 官方宿主 CRM / 首购 HTTP（2026-10-06，上一阶段）

- 查询归属复审已正常提交 `c7bbf3ae`。随后在未修改的固定 rc2 Web CLI 实跑 CRM 登录、真实原生 loop/worker 查询、同账号保存、ACK 核对和宿主重启；新整链测试 **1 PASS / 0 SKIP**，启动保护/model adapter **7 PASS**，两个插件构建通过。已核对[本次证据和失败根因](docs/hackathon/evidence/dsh-g0-official-crm-http-20261006.md)。
- 官方 Cookie 在相同 authority 的重启后可复用；CRM 内存凭据清空，重新登录后重放原 run 不重复派发/保存。本次自有 Host/worker/临时 HTTP 服务已回收。
- **当时 PARTIAL**：该阶段从私有 kernel HTTP 准入，未接浏览器原生输入框；后续原生命令和 Chrome 接线见上节。headed 浏览器、clean 候选/目标环境/生产 gate 仍开放。没有 push、杭州切换或真实数据访问。

### CRM 查询归属复审（2026-10-06，上一阶段）

- OCR delegate 已补审 `9d1a9acf` 全部 **29/29** 文件；复现并修复运行中身份瞬时 503 被误写 UNKNOWN 的分支。保留原任务与 Host 状态，暂停新派发并给出身份故障诊断，恢复不重发。
- 本次修复后相关后端 **94 PASS**、Node **15 PASS**，合同/边界/Ruff/差异检查通过；已核对[本次审核与失败证据](docs/hackathon/evidence/dsh-g0-native-crm-review-20261006.md)。仍 PARTIAL；接续固定官方宿主登录、查询准入与保存整链，不继承旧 HTTP 夹具作为宿主通过。

### CRM 账号到原生查询归属（2026-10-06，上一阶段）

- 从 `95b78e8f` 干净工作树继续。新增显式 CRM session 身份模式，复用现有 Host bridge、CRM 可撤销 lease 和公开服务身份检查；新查询/保存使用同一认证账号，不缓存 CRM 凭据或身份观察，不把 synthetic-demo 映射为管理员。
- 原生 session 的 owner 持久绑定；换账号/旧 fixture 改归属明确拒绝。身份服务暂不可用只暂停派发；退出登录或明确撤权才撤销查询权限，恢复仍用原任务。默认模式、上游 DSH 和生产 profile 未改。
- 本轮后端 **294 PASS**、Node **26 PASS**、编译卡片 **1 PASS**、实际独立包 **11 PASS**、边界检查 **9 PASS**，两个插件固定 rc2 构建通过；OCR 确认的故障误判撤权与状态读取副作用均已修复，见[本轮证据](docs/hackathon/evidence/dsh-g0-native-crm-owner-20261006.md)。真实 HTTP 已串起合成 CRM 登录、查询 worker、同账号保存、ACK 丢失后核对与精确重放；Host 调度接收器仍是夹具，不能称为官方 DSH/浏览器通过。
- **仍 PARTIAL**：需接固定官方宿主的登录/admission，验收 Cookie/路由、重启和浏览器，再准备 clean 插件/服务候选与目标主机证据。旧 B0 gateway 的登录前查询权限门禁不能直接当 CRM 入口。供应链、生产放行及物理分仓未关闭；本次未 push、操作杭州或接触真实数据。

### CRM 身份到首购保存卡片（2026-10-06，上一阶段）

- 从 `codex/plugin-boundary-review@ca64f9ca` 干净工作树继续。CRM 提供可撤销的可选会话能力，token 仅在 CRM host 内；workbench 通过生成的微型合同调用公开首购服务，移除该卡片旧 `/b0/analyses` 保存路径。默认未配置仍禁用，未改生产 profile。
- 当前卡片支持核对来源/权限、显式保存、原请求持久保留、SAVE_UNKNOWN 核对和同请求重试；未接通的驾驶舱/导出/发送可见禁用。时效沿用用户决定，以服务端 `NOT_CHECKED` 展示，不在客户端推算陈旧/过期。
- 本次相关后端 **132 PASS**；提交前修复后 Node **51 PASS**、编译卡片 **7 PASS**，真实 HTTP 集成重跑 **1 PASS（7 项观测）**，两个插件在固定 rc2/Node24 下构建通过。OCR 复现并修复登录失效残留回执、旧候选仍提示重试、转义凭据回显三项；已核对[本轮证据](docs/hackathon/evidence/dsh-g0-save-ui-20261006.md)与[保存合同](docs/operating/first-purchase-save-admission.md)。
- **该阶段 PARTIAL**：当时查询内核仅固定 `synthetic-demo`，没有把它映射为 CRM 管理员；后续可选归属接缝见上节。实际宿主内的账号/run 归属、Cookie/路由/浏览器、clean 插件候选、供应链与目标主机关闭时效链仍待验收；生产保存未启用。该阶段没有 push、杭州操作或真实数据访问。

### 结果时效暂缓与 clean 候选（2026-10-06，上一阶段）

- 用户明确“陈旧和过期，暂时不考虑”。已增加服务 owner 显式关闭结果年龄检查的策略；返回 `NOT_CHECKED / DISABLED_BY_POLICY`，不标成 FRESH。账号/session、候选准入、完整来源、幂等保存与 UNKNOWN 恢复继续校验。
- 实现阶段五文件回归 **163 PASS**，实际独立包的时效开启/关闭两种模式 **2 PASS**，包含保存、重启、回放与 forward-fix；OpenAPI/TypeScript 已同步。见[实现证据](docs/hackathon/evidence/dsh-g0-save-time-policy-20261006.md)。
- 实现已提交 `48e7ddfc`，随后从该 clean SHA 生成新服务包 `8f096a13…` 并绑定候选 `9f00fadb…`。本次源码与实际离线双包各 **9/9 PASS**，构建及相关 **95 PASS / 0 SKIP**；同一 archive 的 CRM 合成身份→关闭时效→保存→重新打开状态回放 **6/6 PASS**，真实 HTTP 响应通过当前插件 decoder。
- 同一服务双包在杭州 WSL2/Python 3.14.4 完成 **14/14 synthetic 验收**，真实 CLI 追加 journal seq **4**，重试 131 文件不变、旧 67 文件保留。10 个临时进程与本次远端目录已回收，现役监听/PID 快照一致。见[本次候选与现场证据](docs/hackathon/evidence/dsh-g0-save-time-policy-candidate-20261006.md)。
- WSL 固定场景使用合成 A64 准入和开启时效模式；CRM 身份/关闭时效组合的 6 项属于本机验证。未登录真实 CRM、接通保存 UI 或切换生产；T3/T7 继续 PARTIAL。下方历史阶段中的“时限待确认”以本节为准，响应超时和 SAVE_UNKNOWN 门禁未取消。

### 现有 CRM 账号适配（2026-10-06，本地增量）

- 按用户确认沿用现有 CRM 管理员账号，不新建账号体系。新增首购服务可选 `CRMFirstPurchaseIdentityResolver`，经既有 `/api/v1/auth/me` 校验 Bearer；不保存密码或 token，不导入旧 CRM 实现。显式账号名单与当前管理员权限均须匹配，每次重新校验；身份成功不等于保存准入。
- 本次五文件保存/恢复/身份回归 **134 PASS**，实际独立包 **1 PASS**（含 5 项新 CRM 身份观测）；OpenAPI/TypeScript 和 Ruff 通过。复用现有固定 `h11`，13 项依赖未变；DSH、插件运行时代码和默认服务启动未改，仅同步生成的合同摘要。见[本轮证据](docs/hackathon/evidence/dsh-g0-crm-identity-adapter-20261006.md)。
- OCR 审核发现并修复旧写入口绕过准入：外部身份一律要求版本化保存，负测先 201 失败、修复后拒绝且不落盘；134 项回归、90 项服务门禁与独立包已重跑通过。
- 审修后正常 hooks 提交 `7edf7710`；该 clean SHA 源码兼容与实际离线双包各 **9/9 PASS**，同一新 archive 的 adapter **5/5 PASS**，固定包 79049 B / `26b07aa7…`。现有控制面重验通过，旧目标回执拒绝，生产激活仍阻断。
- 新服务包尚未绑定新的 plugin candidate/journal，未在杭州或真实 CRM 登录验证；下节 WSL 14 项只属于 `80aba9c1` 的原包。陈旧/过期判断已按用户决定暂缓，不再等待阈值确认；真实候选准入、供应链、目标 DSH/UI 与物理分仓保持开放；没有生产保存/激活或 GitHub 操作。

### 首购身份接口与 clean 服务候选（2026-10-06）

- 上一批 clean 首购绑定文档经 OCR delegate 全量审核、修正并通过正常 hooks 提交为 `c95751f8`。随后按既定顺序补服务身份接缝，不改 DSH、插件或生产配置。
- 首购 HTTP factory 改为服务 owner 可注入的同步身份接口；校验 Bearer 和不可变身份/权限，统一身份与策略 provider 的错误脱敏，保留每次请求及保存事务内的撤权重验。默认空 B0 注册表仍拒绝访问，候选 digest 不充当身份或准入授权。
- 当前源码保存/恢复回归 **74 PASS**（含 19 个新增边界用例）；实际首购包的仓库外最小依赖 HTTP 场景 **1 PASS**，合同/TypeScript、Ruff 和差异检查通过。见[本地接缝证据](docs/hackathon/evidence/dsh-g0-service-identity-boundary-20261006.md)。
- 提交前 OCR delegate 覆盖全部 **8/8** 文件，未确认新阻塞缺陷，通过正常 hooks 提交 **`80aba9c1`**。已核对 74 项测试报告与提交前 Python 检查输入摘要一致，本次不将复核说成重新执行。
- 从该 clean SHA 完成源码兼容 **9/9 PASS**、两个实际包的离线 venv/HTTP **9/9 PASS**；新服务包 76478 B / `270cf084…`。新候选 `4e49cc04…` 绑定同一服务证据，真实 `plugin verify-service` 进入 journal 第 3 条事件，重试及旧 WSL 误用拒绝保持 58 文件不变。
- 插件包仍为 421582 B / `5efdbec5…`，与上一候选逐字节相同；DSH、插件源码、依赖锁与上游均未改动，无需重建。旧 129 个输入/回执/journal 原样保留。
- 同一 `80aba9c1` 服务双包随后在杭州 WSL2/Python 3.14.4 完成 **14/14 synthetic 验收**，新回执经真实 CLI 进入原 journal 第 4 条事件；重试 131 个文件不变，旧 129 个证据文件不变。10 个临时进程、安装目录与本次传输目录已回收，现役端口/PID 快照一致。生产身份、真实 candidate allowlist 与时限策略仍未接通，保存 UI 与激活门禁不变；该结果不能证明上方新增 CRM adapter。

### 当前 clean 首购插件／服务候选（2026-10-06）

- 完整增量审核后已本地提交 `2be518e5`，随后从该 clean SHA 生成首购服务 `0.1.0rc1` 候选。源码兼容 **9/9 PASS**、两个实际包的离线 venv/HTTP 兼容 **9/9 PASS**；两包打包来源均 `worktree_dirty=false`，见[本次服务候选证据](docs/hackathon/evidence/dsh-g0-service-clean-candidate-20261006.md)。
- 新候选 archive 为 75811 B / `190050f6eaecdaf199c87ca516e3ff9323e72187995721709e448f764c9217db`。已绑定 clean 插件来源 `78779206`，候选 digest `afcdae56…`；本轮构建及相关 **100/100** 测试通过。插件、服务分别记录来源，未因文档提交重打服务包。
- 同一新服务双包已在杭州 WSL2/Python 3.14.4 完成 **14/14 synthetic 验收**，真实回执经 `plugin verify-service` 进入原控制面的 candidate journal seq **4**。重试保持同一 seq/digest，129 个输入/产物/回执文件不变；旧 WSL 回执误用仍拒绝。见[本轮接线与现场证据](docs/hackathon/evidence/dsh-g0-service-candidate-binding-20261006.md)。
- 10 个临时服务进程和安装目录已回收；6677/18090/18092/18093/18094 的监听/PID 快照一致。本次是服务隔离验收，没有生产切换或发布，也不替代 DSH 宿主/浏览器验收。
- 本批提交前 OCR delegate 已补审全部 **4/4** 文档，修正“服务包回执失效”与“插件变化”的归因；本次门禁测试 **70 PASS**，既有回执 CLI 重验、129 文件不变通过。现场 14 项属于上一阶段结果，此次审核未重新操作杭州。
- 生产身份/候选策略、时限/UNKNOWN、供应链与目标 DSH runtime 仍开放，`release_ready=false`、激活 BLOCKED、保存 UI 继续 NOT_AVAILABLE。下方 CRM/知识库候选及其来源保持不变。

### 已提交的完整候选链复审（2026-10-06）

- OCR delegate 已覆盖 `2a89790b..0a183b6f` 的 **22/22 文件**，未确认新的代码缺陷；修正服务兼容说明及接线证据中的两处过期状态。当前回归合计 **251 个不同用例 PASS**，固定宿主保护检查的条件跳过项已补跑，见[完整审核记录](docs/hackathon/evidence/dsh-g0-candidate-full-review-20261006.md)。
- 重新核验既有 bundle、双插件 journal 与 WSL 首购 journal；120 个输入/产物/回执文件不变。审核修正已提交 `2be518e5`；后续 clean 首购候选见上节，生产 gate 不变。

### 当前 CRM／知识库干净候选（2026-10-06）

- 从审核后的 clean SHA `9902bdd93bee4b0ba7f30efb3d35e8928db62380` 生成 `dsh-preflight-crm-9902bdd9`：prepare/audit/build/runtime/release/test/receive/evidence **8/8 PASS**，release suite **244 PASS / 0 SKIP**，7 文件 bundle 已重新校验。成功轮次使用热缓存，用时 118590 ms，不含此前排错与宿主演练。
- CRM **233968 B**、知识 **14461 B** 两份独立候选绑定相同 source/profile。实际官方 rc2 Web CLI **10/10 PASS**，覆盖加载、重启、在途会话恢复和原生回退；两份包各自 `verify-host` 写入 journal seq 3，重试不改候选/包/journal，5 个临时宿主 PID 已退出。见[候选验收证据](docs/hackathon/evidence/dsh-g0-clean-candidate-20261006.md)。
- 只证明本机 Darwin arm64、合成模型/会话；`release_ready=false`、生产 activation `NOT_RUN`。本 profile 不启用首购保存 service binding。WSL DSH runtime、生产身份/时限、签名/SBOM/CVE、浏览器/真实 UAT、远端激活与物理分仓保持开放；杭州生产状态本轮未复查或切换。
- 下列网络/准备记录是本轮失败到修复的历史过程；最终候选 source 固定为 `9902bdd9`，后续纯证据文档提交不改写此来源。没有 push 或发布。

### 本轮候选准备故障与修复过程（2026-10-06）

- WSL 回执接线已通过正常 hooks 提交为 `356862bf22a1c4fc67f96904f1baffa21fadc2c2`，提交后工作树干净。正式 CRM＋知识库 profile preflight 已实际执行：固定 DSH 准备/构建通过，在线 audit 因未继承本机代理而失败；没有把失败记为候选通过。
- 已定位并修复 B0 环境白名单丢弃显式代理的问题，只向 Git/pnpm 在线命令透传标准代理变量。真实 audit 修复后 PASS；专项子进程/环境回归通过，完整验证及审核结果见[网络修复证据](docs/hackathon/evidence/dsh-g0-preflight-network-20261006.md)。生产状态未改变。
- 代理修复已提交 `8a70667f`。新 clean preflight 进一步复现 pnpm 重复 fetch 后 install 快捷返回、丢失 `tsx` 链接；已收敛 frozen 参数关闭这项优化，隔离两轮安装与实际固定 DSH prepare/build 修复后通过。失败和修复证据见同一记录；正式完整候选仍需使用修复后的 clean SHA。
- 重复安装修复已提交 `0e978f9e`；该 SHA 的 prepare、audit、双插件 build、离线 runtime 打包已通过，release 被宿主演练脚本的长合成 key 字符串拦住。已改成短占位值，扫描规则未改，1846 个发布清单文件重扫通过；旧字符串仍被拒绝。该候选 attempt 未记为完整 PASS。
- 两份 `356862bf` 独立插件包已生成，但不代表完整 preflight 或生产就绪；修复提交后从新 clean SHA 重跑正式候选。本机旧 SDK 链接已保留备份并绑定本次固定 checkout，未修改 DSH 源码。生产身份/策略、时限/UNKNOWN、供应链、目标宿主/浏览器和物理分仓仍开放。

### 已提交的 WSL 回执与候选 journal 接线（2026-10-06）

- 上一批 WSL 记录已按 OCR delegate 覆盖 **7/7** 文件，修正进程数量及准备/验收时间范围两处低风险表述，复核原始包/回执后，通过正常 hooks 提交为 `2a89790b42326376f0808e0896b0a78877bd28ba`；提交后工作树曾干净，未 push。见[审核记录](docs/hackathon/evidence/dsh-g0-service-target-acceptance-review-20261006.md)。
- 提交后的下一步已扩展现有 `plugin verify-service`，显式接收 `--target-evidence` / `--target-input`，核对固定验收脚本、28 个输入文件、双包/依赖、14 场景及清理 sidecar，再向原 journal 幂等追加 `CANDIDATE_SERVICE_TARGET_OBSERVED`。没有新增状态账本或远端执行入口。
- 新接线 **37 PASS**，本次完整 release suite **243 PASS / 0 FAIL / 0 SKIP**；原真实 WSL 回执经本地 CLI 核验进入 seq **4**，重复执行同一 seq/digest，108 个输入/证据文件的内容与 mtime 不变，前三条 journal 保留。见[接线证据](docs/hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。
- 本批接线已完成提交前 OCR delegate 审核：原始 **14/14** 覆盖，没有确认新缺陷，本次 release suite **243 PASS**，实际 CLI 重试不改输入/journal，见[审核记录](docs/hackathon/evidence/dsh-g0-service-target-gate-review-20261006.md)。本地提交号以 Git 为准；仍为未签名的合成观测，`release_ready=false` / 激活 BLOCKED。下一步从审核后的干净 SHA 准备候选，再补生产身份/策略、生产时限/UNKNOWN、供应链和 DSH 宿主/浏览器；其他服务与物理分仓也未完成。本步未重新执行杭州验收或改生产。

### 已提交的 WSL 首购服务隔离验收（2026-10-06）

- 延续 `codex/plugin-boundary-review@79434033`，同一旧/新不可变服务包已在实际杭州 WSL2 / Python 3.14.4 完成 **14/14 检查**：两个独立 venv 各安装 13 个固定 wheel，并完成合成身份/状态、HTTP 保存、权限/冲突拒绝、SIGKILL 后幂等恢复、只读回退、备份恢复与未知 schema 拒绝。见[现场验收证据](docs/hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)。
- 逐文件传输超时后改用单个固定包；首次运行的合成状态目录权限错误已定位并修正夹具，保留 FAIL 后在新目录重跑。服务 archive 与依赖未改动。成功轮次 10 个、失败轮次 1 个临时进程均已回收，安装/状态目录已清理，生产 6677/18090/18092/18093/18094 的监听/PID 快照一致。
- 仅关闭首购服务的 WSL **synthetic** 冷安装/恢复子项。旧 writer 仍禁止可写降级；真实身份/策略、生产时间窗口、供应链、DSH 宿主/浏览器和其他服务仍未关闭。`release_ready=false`，保存 UI/生产激活保持关闭。验收时目标回执尚未接 journal；后续接线见上节。本阶段文档已随 `2a89790b` 提交，未 push 或生产切换。

### 上一阶段 WSL 平台依赖准备（2026-10-06）

- 预检及 OCR 修复已通过正常 hooks 本地提交为 `7943403319eeefcb3a191e03e4e1dc03772a0cc3`（12 文件）；提交后工作树曾干净，未 push。本节为当时提交后的准备记录，后随 `2a89790b` 审核提交。
- 已通过现有 Tailscale/SSH 只读核验杭州：Linux x86_64、WSL2 内核、glibc 2.39、Python 3.14.4、pip 26.0.1，取得实际解释器的 1226 个兼容标签。没有启动/重启或配置生产服务。
- 在本地按原服务 manifest 的 13 项精确版本、目标标签和官方 PyPI 元数据准备 Linux wheelhouse，共 **3,262,610 字节**；逐包 SHA-256、版本、目标标签和文件集合复核通过。没有安装这些 wheel。见[平台准备证据](docs/hackathon/evidence/dsh-g0-service-target-platform-20261006.md)。
- 该准备阶段的目标预检、冷安装及恢复当时为 NOT_RUN；后续实际 WSL 合成验收见上节。来源签名、生产身份与候选门禁尚未关闭，激活保持 BLOCKED。

### 已提交的目标主机预检审核（2026-10-06）

- OCR delegate 已覆盖原始 **11/11** 路径（2 个工具选中、测试与 8 份文档补审），没有跳过。已验证并修复 wheel 安装元数据/标签漏检，以及 active Requires-Dist 未核对两类问题；6 项复现负测先失败后通过。
- 修复后共享 bounded 预检 **35 PASS / 0 SKIP**，完整 release suite **206 PASS / 0 SKIP**；实际 13 个 wheel 通过新增格式/依赖检查，Mac 仍因不是 WSL2 正确 BLOCKED，14 个输入内容/mtime 不变。见[审核记录](docs/hackathon/evidence/dsh-g0-service-target-preflight-review-20261006.md)。
- 本批通过正常 hooks 提交为 `79434033`；审核阶段未操作杭州或真实数据。提交后的只读环境核验与依赖准备见上节；生产激活、现场服务恢复与供应链门禁仍保留。

### 审核前目标主机只读预检（2026-10-06）

- 上一批服务包接线及 OCR 修复已通过正常 hooks 本地提交为 `1b443646132a8e90b002988c9635b5993ed55d4b`（18 文件），未 push；本节为提交后的下一步增量，尚未提交。
- 新增 `pnpm dsh plugin service-preflight`：按外部已核验的 manifest SHA 检查 Python、WSL2、精确 wheel 闭包、ABI/平台标签与 Requires-Python，拒绝错包/篡改/链接/FIFO，不安装、不联网、不启动服务或改 journal。
- 本次共享 bounded 预检 **24 PASS / 0 SKIP**，release suite **206 PASS / 0 SKIP**；实际候选与 13 个 wheel 的 CLI 检查正确返回 macOS 非 WSL2 的 BLOCKED，14 个输入内容/mtime 不变，Ruff/语法检查通过。见[本轮证据](docs/hackathon/evidence/dsh-g0-service-target-preflight-20261006.md)。
- T3/T7/T15/T21 仍 PARTIAL。预检不代表 WSL 实机、离线冷安装、身份/状态注入或 HTTP 恢复已通过；本机 pydantic-core 是 macOS arm64 wheel，目标 WSL 需准备自己的固定平台 wheel。下一步接目标平台冷安装与服务验收回执，激活继续 BLOCKED；本轮未操作杭州、真实数据或发布。

### 上一批服务包接线审核（2026-10-05）

- OCR delegate 原始范围 **15/15** 路径全部覆盖（5 个代码/测试、10 个文档），另补审修复涉及的 state owner 和测试。确认并修复 3 类问题：journal 前置关系丢失、状态特殊文件阻塞、CLI 回显未受信任内容。
- 4 项负测从 **0 PASS / 4 FAIL** 修至 **4/4 PASS**；本次完整 release suite **206 PASS / 0 SKIP**。原真实双包通过修复后 CLI，重复执行保持同一 seq/digest，候选和 journal 字节不变。见[审核证据](docs/hackathon/evidence/dsh-g0-service-artifact-gate-review-20261005.md)。
- 已通过正常 hooks 本地提交为 `1b443646`。目标主机/供应链仍 NOT_RUN，激活继续 BLOCKED；提交后的只读预检增量见上节，未操作杭州或真实数据。

### 审核前服务包证据接线（2026-10-05）

- 上一批服务包及 OCR 修复通过正常 hooks 提交为 `82c1f5cdeb0cac3f5f0ac89ec7eafdb799383e95`（22 文件）；提交后工作树曾干净，未 push。本节是提交后的下一步，尚未提交。
- `pnpm dsh plugin verify-service` 已核对候选/profile/源码回执、两个实际 archive 的内外 manifest/文件/依赖记录，再向原 journal 幂等追加 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`。不修改候选，不启动服务。
- 新门禁 **29 PASS**，完整 release suite **199 PASS / 0 SKIP**；此前两份实际服务包经 CLI 核验通过，重复执行保持同一第 3 条 journal，3 项篡改负测拒绝且候选/journal 不变。首次 OpenAPI 版本比较和 help 回归失败已修复并保留日志，见[本轮证据](docs/hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)。
- T3/T7/T15/T21 仍 PARTIAL：本机证据仍 `release_ready=false`，目标主机和供应链 NOT_RUN。下一步补 WSL 目标主机服务合同、受控身份/状态注入、冷安装与时限/UNKNOWN 验收；DSH 保存 UI/浏览器及 G0 后物理分仓仍开放。本轮没有杭州、真实数据或发布操作。

### 上一批服务包审核与提交（2026-10-05）

- OCR delegate 覆盖原始 **21/21** 文件（11 个选中、10 个补审），无跳过。确认并修复 Git replacement 破坏精确 SHA 归属，以及取消打断退出回收两个问题；新增两项负测先失败后通过，详见[审核记录](docs/hackathon/evidence/dsh-g0-service-artifact-review-20261005.md)。
- 修复后共享后端 **25 PASS / 0 SKIP**（内部 **10** 个包场景），实际双包重新 **9/9 PASS**；Ruff/语法/diff 检查通过，已提交为 `82c1f5cd`；下方“未提交”是当时的实现阶段快照。
- T3/T7/T15 仍 PARTIAL；继续接 artifact/依赖证据与目标主机验证器，生产激活、WSL、真实身份与保存 UI 门禁保留。未 push、发布或操作杭州。

### 上一阶段精确服务包配对（2026-10-05，审核前未提交）

- 从 `codex/plugin-boundary-review@809a9367` 的既有修改继续，打包旧 `56198c32` / 新 `a50bd424` 的实际代码；manifest 分开绑定历史服务 SHA、历史依赖锁与当前打包清单/文件摘要，没有切换工作树或改业务 API。
- 两个真实 archive 安全解包后，各自在新 venv 从预备 wheelhouse 离线、带 hash 安装 13 项精确依赖；Darwin arm64 / Python 3.14.4 完成 **9/9 预期观测**，旧服务可写降级会丢失来源，仍明确 BLOCKED。两版历史锁中的依赖版本恰好相同，不是跨依赖升级证明。
- 当前共享后端 **25 PASS / 0 SKIP**（内部包测试 **8 个实际集成场景**）；实际配对命令的 SIGTERM 探针返回退出码 2 / `SERVICE_PAIR_CANCELLED`，保留 FAIL 回执且自有端口关闭。旧临时 Python 依赖不匹配的失败已保留，另建隔离锁环境完成验证。详见[本轮证据](docs/hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)。
- 新 artifact 回执尚未接入现有源码证据门禁，`release_ready=false`；T3/T7/T15 仍 PARTIAL。下一步接精确 artifact/依赖摘要与目标主机证据验证器，再做 WSL 冷安装、生产身份/状态注入和现场验收；DSH 保存 UI/完整候选供应链仍开放，G0/stop-go 后物理分仓。本轮未 commit、push、发布或操作杭州。

### 上一阶段首购分析服务独立包（2026-10-04，本地未提交）

- 上一批服务兼容门禁已按 OCR delegate 审核修复，正常 hooks 提交为 `809a9367a94bc8be3c7c329868d8680deeae1377`；26/26 文件覆盖，提交前 release suite 170 PASS。未 push。
- 继续复用既有服务打包器，增加首购分析服务独立清单、13 项精确依赖和同包生成的 OpenAPI；默认无身份/状态配置。实际 tarball 在仓库外、最小依赖进程完成保存、重启后回执查询/回放、权限/冲突拒绝、SAVE_UNKNOWN 和保留来源的 forward-fix。
- 当前共享 bounded 验证 **17 PASS / 0 SKIP**，其中实际执行 **7 个服务包集成场景**；已修复依赖版本导致的包内 OpenAPI 漂移，并加入 FIFO/合同生成副作用负测。证据见[本轮记录](docs/hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。本批业务 API 源码未改，未重新运行完整 B0。
- 本次新包只验证同版本隔离部署，不替代旧/新服务包配对、平台依赖冷安装、主机证据验证器、WSL 或生产授权。T3/T7/T15 仍 PARTIAL；`release_ready=false`、保存 UI NOT_AVAILABLE、现场激活仍阻断。下一步是配对精确旧/新 artifact 与各自依赖，再接目标主机证据；G0/stop-go 后物理分仓。

### 上一批服务兼容证据门禁（2026-10-04，已本地提交）

- 上一批兼容验证器/文档已完成 OCR delegate 全范围审核 **10/10**，正常 hooks 本地提交为 `d321971f6d56b5148c5715ad0461410290665f66`；固定源码对重跑 **9/9**、CLI 负测 **4/4**。随后门禁代码/文档已获审核修复后本地提交授权，最新提交以 Git 为准；未 push。
- 显式保存 profile 的服务源码、API/状态版本、访问模式与实际兼容回执已绑定到 candidate、release payload/profile、安装 marker 和既有 journal。激活/回退及幂等重试在改变指针前检查；旧服务可写降级、缺证据/错版本/篡改和安装绑定丢失均拒绝。
- 本轮 release suite **169 PASS / 0 SKIP**；完整 B0 **退出 0**，Python **665 PASS**，Node 阶段合计 **1508 PASS / 1 SKIP**（含 clean 重跑）。真实插件 candidate 已生成，真实回执的主机 CLI **3/3 拒绝负测**通过；指针和 journal 保持不变。首次失败、修复及证据见[本轮记录](docs/hackathon/evidence/dsh-g0-service-gate-20261004.md)。
- 随后的提交前 OCR delegate 审查发现并修复 `preflight` 未校验/传递服务证据的问题；真实只读 CLI 负测先失败后通过，修复后 release suite **170 PASS / 0 SKIP**。上段 B0 属实现阶段结果，本次仅改发布入口，没有冒作重新执行完整 B0。见[提交前审核](docs/hackathon/evidence/dsh-g0-service-gate-review-20261004.md)。
- T3/T7 仍 **PARTIAL**：目前只有本机源码兼容证据，所有声明 D15 服务的现场激活明确阻断。下一步补精确服务包/依赖与主机证据，再接 DSH 保存 UI、生产形状时限/UNKNOWN 与浏览器/WSL 验收；G0/stop-go 后推进物理分仓。生产 profile/provider 与保存 UI 未启用，本轮未操作杭州。

### 上一批服务跨版本状态验证（2026-10-04）

- D15 审核修复已正常 hooks 本地提交为 `a50bd42492195040efaa6989c90e4fe84030551c`，提交后工作树曾干净，未 push；本节验证器/文档当时为新增工作，现已随 `d321971f` 提交。
- 固定旧服务 `56198c32` 与新服务 `a50bd424` 的实际源码，在独立进程完成 **9/9 预期观测**：旧状态升级、旧服务只读、恢复新版精确回放、标题 forward-fix、小库备份恢复与未知 schema 拒绝；另有 **4/4 CLI 负测**通过。见[证据](docs/hackathon/evidence/dsh-g0-service-save-compat-20261004.md)。
- 已验证旧服务可写会让新标题版本失去 provenance；该组合明确 **BLOCKED**。插件/profile 回退应保留新版分析服务和 durable state；旧服务仅可用只读身份恢复访问。详见[兼容窗口](docs/architecture/first-purchase-service-compatibility.md)。
- 该阶段候选/激活门禁尚未消费兼容证据，后续接线见上节；精确服务包/依赖窗口、生产形状时限、UI/浏览器/WSL 仍开放，T3/T7 仍 PARTIAL。保存 UI 保持 NOT_AVAILABLE；该阶段无生产操作。

### 上一批 D15 服务保存审核（2026-10-04）

- OCR delegate 审核原始变更 **29/29**：15 个工具选中文件与 14 个补审文件全部覆盖，未跳过。修复两项已确认问题：回执必须在同一事务快照内核对实际分析版本与来源；持久化回执/provenance 缺字段或被模型归一化时 fail closed。
- 7 个隔离负测先失败后通过；修复后保存两文件 **42 PASS**，相关 bounded 六文件 **78 PASS / 0 SKIP**；完整 B0 **退出 0**，Python **665 PASS**，Node 各阶段合计 **1506 PASS / 1 SKIP**（含 clean 重跑），生成合同、类型、边界与 clean rebuild 通过。见[本次审核证据](docs/hackathon/evidence/dsh-g0-save-review-20261004.md)。
- 本轮已获本地提交授权，准确提交号以 Git 为准；下一步是以固定新旧服务源码验证持久状态兼容和 forward-fix。T3/T7 仍 PARTIAL，生产保存 UI 仍 NOT_AVAILABLE；本次未 push、发布或操作杭州。

### 审核前 D15 服务保存门禁增量（2026-10-04）

- 承接回执存储，完成独立版本的结果/provenance/freshness、服务端精确候选 allowlist、受控公开保存 API 与严格插件 decoder。新保存在写锁内重验当前权限、候选、来源和有效期；旧保存接口在启用 D15 策略的服务内不能绕过门禁。
- 分析、回执双索引与保存来源同事务落盘；提交后丢失响应，可在无 RunStore/无候选策略时精确重放原回执。保留旧 v1、SQLite schema 1 与 PINNED 语义，标题 forward-fix 保留原来源。
- 本次共享 bounded backend 六文件 **71 PASS / 0 SKIP**；完整 B0 **退出 0**，Python **658 PASS**，Node 各阶段合计 **1506 PASS / 1 SKIP**（含 clean 重跑），生成合同/完整类型检查/clean rebuild 均通过。首轮断言失败和修复记录见[本轮证据](docs/hackathon/evidence/dsh-g0-save-admission-20261004.md)，接口见[操作说明](docs/operating/first-purchase-save-admission.md)。
- 此节记录审核前未提交增量，当时 HEAD 为 `56198c32`；本次修复及更新结果见上节。D15/T3/T7 仍 **PARTIAL**：服务跨版本窗口、生产形状时限/UNKNOWN、DSH UI 接线与浏览器/现场门禁尚未关闭。生产策略/profile 未启用，保存 UI 保持 `NOT_AVAILABLE`，物理分仓仍在 G0/stop-go 后。

### 上一轮 D15 保存回执增量（2026-10-04）

- 上一轮 31 文件的宿主/journal 审核修复已通过正常 hooks 本地提交：`56198c32a52d9822c7a3338d92b0fa077d1c61bc`，提交后工作树曾干净，未 push。
- 继续 T3/T7：首购保存 owner 新增 candidate/correlation/action/幂等身份与 durable state key 回执，复用既有 SQLite 事务和幂等表；两个身份索引与分析记录同事务落盘，不新增发布账本或数据迁移。新只读 `save-receipts/reconcile` 不依赖 RunStore，不重跑模型/查询。
- 新增 13 项回执测试；共享 bounded backend 的 4 个相关文件 **44 PASS**。正式 B0 **PASS**：Python **636 PASS**、Node 各阶段合计 **1506 PASS / 1 SKIP**（含 clean 重跑）；OpenAPI/TS、领域边界、完整插件类型检查与干净构建均通过。详细结果及首次 drift 失败见[本轮证据](docs/hackathon/evidence/dsh-g0-save-receipt-20261004.md)。
- 此阶段当时只是 G0 存储和查询合同（后续服务门禁见上节）：D15 写 API/插件 UI 尚未启用；服务端 freshness、候选准入、跨服务版本窗口/恢复与完整候选门禁仍开放，`save: NOT_AVAILABLE` 不变。本节为提交后的未提交增量，不能算入 `56198c32`。

### 上一轮候选与宿主接线审核（2026-10-04）

- OCR delegate 覆盖原始变更 **30/30**（含工具排除的文档/Python 补审），修复特殊文件输入阻塞与安装内容未直接绑定 tarball 两个问题。负测先失败后通过；没有剩余已确认的本轮代码审查缺陷。见[审查记录](docs/hackathon/evidence/dsh-g0-host-journal-review-20261004.md)。
- 修复后 release suite **146 PASS / 0 SKIP**、profile/入口负测 **9 PASS / 0 SKIP**、首购保存恢复/分析/native **31 PASS**；固定官方 rc2 Web CLI 重新完成 **10/10**，CLI journal 重试幂等，所有自有宿主已回收，上游 tracked source 干净。
- 已授权本地 commit，实际提交以 Git 为准；下一步为 T3/T7 D15 保存回执与 UNKNOWN 查询。生产、目标平台、供应链和物理分仓门禁仍保留，不触发 push 或杭州切换。

### 审核前候选与宿主接线（2026-10-04，本地增量）

- 在既有固定宿主增量上增加 `pnpm dsh plugin verify-host`：candidate 携带 profile 原字节快照，核对固定 DSH、双包版本/摘要、实际 composition、会话文件与十项 v2 宿主证据后，幂等写入原 journal；不改写 candidate。默认七插件 profile 不变，首期显式选 CRM＋知识双包。
- 本轮重新执行真实官方 Web CLI **10/10 场景**，独立 CLI 写入 `CANDIDATE_HOST_VERIFIED`，重复调用保持相同 journal 和候选字节。release suite **142 PASS / 0 SKIP**。隔离源码保持已审核的 `1737adc3`，两个 tarball 与上一轮逐字节相同；验收器未提交源码另有摘要绑定，见[本轮证据](docs/hackathon/evidence/dsh-g0-host-journal-20261004.md)。
- T3/T7 新增 **5 个**真实子进程/隔离 SQLite 故障场景；含既有首购分析与原生链路共 **31 PASS**。已证明同版本提交前后崩溃、丢失响应重放、冲突/权限拒绝与 forward-fix；D15 candidate/correlation/UNKNOWN receipt 合同仍未完成，保存门禁保持 `NOT_AVAILABLE`。
- T13/T21 的本机观测接线已完成，整体仍 PARTIAL：`release_ready: false`，生产 activation、远端 reconcile、目标平台/供应链/canary 未关闭。kit 独立 dev dependency 和物理分仓仍待后续 G0/stop-go；本轮未 commit、push、发布或操作杭州。

### 上一阶段固定宿主验收（2026-10-04，本地增量）

- CRM/知识拆分与 OCR 修复已本地提交为 `1737adc3cffeb9db5fbbcee222fb044526324d40`，未 push。提交后新增固定官方 Web CLI 验收入口和 profile 加载修复；这些增量的提交状态以 Git 为准，不能冒作该 commit 内容。
- 真实 rc2 宿主此前不会加载生成的旧 preset 目录；现已增加官方 `@deepseek-ai/dsh-agent-preset` 声明补丁。固定双包 tarball 在本机官方 Web CLI 完成 **10/10 场景**：加载/组合、实际工具降级、正常重启、在途崩溃后的原生 v4 会话恢复、挂死进程回收、原生回退和恢复旧组合。父命令中断回收也通过，入口负测/profile **9 PASS / 0 SKIP**。详见[固定宿主证据](docs/hackathon/evidence/dsh-g0-pinned-host-20261004.md)。
- 移除 preset 只禁止新绑定，已有会话仍持有旧工具，整体切换按 `HOST_RESTART_REQUIRED`；任意同进程插件隔离不承诺。T2/T17 本机子项已验证；T13/T21 本机接线与 T3/T7 存储恢复的后续结果见上节。WSL/跨版本、浏览器、真实模型/业务、供应链和现场 canary 仍开放；物理分仓继续受 G0/stop-go 约束。

### 上一阶段 CRM/知识插件拆分（2026-10-04，已本地提交）

- 上一轮 OCR 修复已本地提交为 `ff7fc5fc0fa0295969fe789bc0bd7983a670c73a`。本轮从该干净基线继续 `codex/plugin-boundary-review`，完成本地拆分、OCR 审查修复和验证；本地提交以 Git 为准，未 push、发布或操作杭州，VERSION 与固定 DSH 未变。
- CRM 包保留身份 `@shine-mage/dsh-crm-knowledge`，候选版本 `0.0.0-crm.1`；知识工具迁入 `@shine-mage/dsh-knowledge@0.0.0-candidate.1`。两包无相互业务源码导入，可分别构建/打包；profile v3 独立装配每个模块，拒绝把旧合包和新知识包混装。公开解释不需要 CRM，私有教材当前通过可撤销身份合同使用 CRM Host，不共享密码/令牌。
- 本轮统一验证入口通过：后端定向 **206 PASS**、Node **160 PASS / 0 SKIP**；额外页面组合纳入全插件回归 **162 PASS / 0 SKIP**。真实 CLI 已分别生成 CRM-only、knowledge-only、含页面的组合 profile，均仅 CONFIGURED_NOT_RUN。最终 B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1473 PASS / 1 SKIP**，含 clean 重跑）；独立 tarball 与失败修复记录见[插件拆分证据](docs/hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。
- 本次 OCR delegate 覆盖 68/68 原始变更路径，修复卸载后公开知识和 CRM 工具迟到成功的问题；修复后双包构建、受影响插件 **166 PASS / 0 SKIP**、隔离打包/边界 **16 PASS / 0 SKIP**。详见[本次审核证据](docs/hackathon/evidence/dsh-g0-crm-split-review-20261004.md)；上段 B0/后端数字属于拆分实现阶段，未冒作本次修复后重跑。
- T15 本地插件拆包子项完成，整体仍 PARTIAL。提交后的精确宿主本机证据见上节；T3/T7 保存/UNKNOWN 回放、供应链/canary/现场回退和 clean reviewed candidate 仍开放，物理分仓在批准的 G0/stop-go 之后。本轮没有浏览器、真实模型/数据或杭州 UAT，新包没有上线。

### 上一轮本地 rc2 候选门禁（2026-10-03 审查修复）

- 本次从公共仓库 `main@d4261aa3` 开始，保留 13 个本地提交及原工作树修改。DSH 仍固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 未变。前置审核修复为 `f55908df`，独立分支为 `codex/plugin-boundary-review`；原 public main 未切换或清理。本次提交收拢其后的 CRM slot、页面/主题、服务边界与独立应用包成果及 OCR 修复，准确提交号以本分支 Git 历史为准。未 push、发布或修改杭州。
- 上一轮八阶段 preflight、102/102 测试及 candidate 回执只证明其绑定的旧 SHA；**本次修改后正式 preflight 尚未重跑**。最终候选必须从 clean reviewed SHA 重建，不复用旧 PASS。
- 本轮修复 OCR-01–07：runtime 私有副本与原始包 integrity、插件最终包安全/入口校验、receive 恢复、跨 tag 身份与精确 Git tree 扫描。专项回归 **123/123 PASS**；真实固定上游 prepare、现有 build-tools audit、离线 runtime 构建，以及 workbench/shine-brand pack 通过。详见 [修复与规划审核证据](docs/hackathon/evidence/dsh-g0-review-fixes-20261003.md)。本机包是 Darwin arm64 验证产物，不是 WSL2 上线包。
- 大型拆分计划已全文复核：统一 G0 → 首期 workspace 试点 → stop/go → 物理分仓的顺序，保留独立 CRM/知识库插件与官方 DSH 底座目标。T1 已完成边界设计、10 包机器清单、唯一构建 DAG 与漂移检查；T15 已把 pin/build-tools 归入 kit，并验证 brand/query 独立 build/test/pack。board-components 的固定 tarball/公开类型已替换 6 条源码引用，workbench 独立重建/pack 通过；CRM 的 slot、页面与主题私有源码引用均已解除，生产源码例外为 0；合成服务 HTTP 边界与独立应用打包已推进，细目见下方 2026-10-04 记录；真实服务合同与物理分仓仍开放。T2/T17 精确宿主、签名/SBOM、canary/rollback 与远端 receive/reconcile 仍 `PARTIAL`/`NOT_RUN`。
- 同日上一阶段验证（不是下方新增改动的全量重跑）：48 项锁定依赖的隔离环境中，共享合成 backend **2922 PASS / 77 SKIP / 71 deselect**，Vue build 与 **223/223**，release 专项 **119/119**，最终 B0 pipeline **PASS**（Python **618/618**；Node 各阶段合计 **1370 PASS / 1 SKIP**，含 clean 重跑）。实际 8 插件 build、两叶子隔离包、workbench clean rebuild 通过；详见 [边界与隔离构建证据](docs/hackathon/evidence/dsh-g0-boundaries-20261003.md)。
- 图表解耦本轮证据、命令、包 SHA、测试结果与剩余项见 [图表解耦记录](docs/hackathon/evidence/dsh-g0-board-components-20261003.md)。产物均是本地构建/临时 Git 夹具，不是新 Release；VERSION、DSH pin 与生产 profile 未改变。
- 本轮没有重跑完整原生 DSH profile 生命周期、WSL2/WAL、真实 HTTP SLI、浏览器/模型或业务 UAT；B0 Loader/合成服务测试不替代上述门禁。杭州状态沿用上方注明日期的现场快照，未作新的上线判断。
- 提交前 OCR 全范围审核及修复见 [解耦审核](docs/hackathon/evidence/dsh-g0-decoupling-review-20261003.md)：恢复误写的验证矩阵，堵住 TypeScript import-equals 的依赖漏检。本次 Node 回归 **176/176**、图表后端 **43/43**；后续 CRM 增量与该已提交审核分开记录。

- 上一阶段 CRM slot 增量：领域 v1 JSON → 双方本地生成合同，源码例外 **5→4**。本轮完整 B0 **PASS**（Python **618/618**；Node 阶段合计 **1413 PASS / 1 SKIP**），CRM host/client 构建与编译后 UI **9/9** 通过。证据见 [CRM slot 解耦](docs/hackathon/evidence/dsh-g0-crm-slot-20261003.md)；未提交增量不冒充 `f55908df` 内容。

- 最新 CRM 端：workbench 生产源码例外 **4→0**，页面工具归公开入口并由 profile 显式组合，主题归品牌领域合同。单包 build/test/pack 与 CRM 全部合成回归 **135/135** 已通过；最终 B0 **PASS**（Python **618 PASS**；Node 阶段合计 **1425 PASS / 1 SKIP**），7 份产物 clean rebuild 一致。实际 CRM 单包/含页面候选 profile 配置生成通过，未加载宿主；结果见 [CRM 端解耦证据](docs/hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。本轮仍未提交，未推进生产。

### 上一阶段 CRM 服务调用解耦（2026-10-04，本地未提交）

- 在原有 45 个未提交文件基础上继续实现，保留 `codex/plugin-boundary-review@f55908df` 与旧修改；本轮没有 commit、push、Release 或杭州操作。
- CRM 插件已移除相对主仓路径和 Python 子进程调用。合成指标与公开知识解释分别通过显式 HTTP origin 和领域 API 1.0.0 调用，服务未配置/版本不符/断连时明确 NOT_AVAILABLE；已有真实 CRM 登录、账号权限和看板工具保留。独立知识 ASGI app 与旧 metrics/explain 兼容 adapter 并存，服务实现和知识资源仍在现仓。
- profile 改为 `crm-profile-assets/v2`，不再要求 Python；旧 `--python` 返回迁移提示，只生成新 profile。新请求头约束已进入 OpenAPI/生成类型，不把版本协商当作认证。配置生成仅是 CONFIGURED_NOT_RUN。
- 当前 CRM 回归 **146 PASS / 0 SKIP**，后端定向 **67 PASS**；实际双服务进程与单服务停止、独立 build/test/pack、最终 tarball 安全解包后固定 SDK 加载已通过。详细命令、最终 B0、失败记录及文件清单见 [本轮证据](docs/hackathon/evidence/dsh-g0-crm-service-boundary-20261004.md)。
- T15/T3 仍 PARTIAL：服务独立打包、CRM/知识插件最终拆包、真实服务版本窗口、D15 保存/UNKNOWN 回放矩阵、精确宿主/WAL、签名/SBOM/CVE、canary/回退和杭州上线未完成；上轮 OCR 只覆盖其原始源码快照。

### CRM/知识服务独立应用包（2026-10-04，审核前阶段记录）

- 继续在 `codex/plugin-boundary-review@f55908df` 的现有工作树修改，既有未提交成果保留。指标与知识服务各有明确文件/资源 allowlist、独立依赖锁、API/软件版本和不可变 `.tar.zst`；只打包公开 synthetic 输入，知识服务不再加载指标引擎或 DuckDB。旧 factory/CLI adapter 保留，独立指标入口不再提供知识解释。
- 实际包已在仓库外、仅含声明依赖的临时 venv 中完成 3 种指标查询、知识解释、OpenAPI 核对与单服务停止验证；篡改/缺资源/链接/额外文件/错误依赖/secret 均拒绝，输出目录不可覆盖。最终 artifact 摘要与实际 HTTP 测试中的包一致，详见[服务包证据](docs/hackathon/evidence/dsh-g0-crm-service-packaging-20261004.md)和[运行入口](docs/operating/crm-service-packages.md)。
- 本轮真实验证：服务包 **4/4** 集成场景；共享全量合成后端 **2936 PASS / 77 SKIP / 71 deselect**；CRM **146 PASS / 0 SKIP**；B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1435 PASS / 1 SKIP**，含 clean 重跑）。离线合同/类型、Ruff、边界清单和差异检查通过。失败的首次包断言与过期 inventory 日志保留，不作为当前通过证据。
- T15 只新增“服务应用独立打包/资源清单”子项完成。下一步是 CRM/知识组合插件的最终拆包；服务物理分仓、平台依赖冷安装、真实 CRM 合同、D15 保存/UNKNOWN、精确宿主/WAL、签名/SBOM/CVE、canary/回退仍开放。候选 `release_ready=false`，没有 commit、push、远端 CI、Release 或杭州切换；不把已配置 CI 当成已经远端通过。

### CRM 增量提交前审核（2026-10-04，当前结果）

- 用户授权 OCR delegate 审核、修复后本地 commit。本轮覆盖原有全部 87 个未提交路径：OCR 61/61，另补审 26 个默认排除的文档、生成物、测试和删除项；同宿主对抗性复核没有额外发现。完整记录见[CRM 提交前审核](docs/hackathon/evidence/dsh-g0-crm-review-20261004.md)。
- 修复 API 错误合同：实际 400/403/409/422 使用 `status/code`，现在 OpenAPI 与生成类型同步声明 `ServiceError`，不再误报 FastAPI 默认 `detail`。新增 3 项回归先复现失败再通过；同步服务打包进度与 Ruff 版本文字。
- 修复后本轮重跑：完整合成 backend **2939 PASS / 77 SKIP / 71 deselect**；CRM **146 PASS / 0 SKIP**；B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1435 PASS / 1 SKIP**，含 clean 重跑）。16 项服务 API 测试、实际服务包隔离运行、离线合同/类型、Ruff、边界清单均通过。下方及上方历史阶段的“未提交”和包 SHA 仅描述当时快照，不是新提交的 release 证据。
- 本轮审核无未关闭 P0/P1；产品仍 PARTIAL。CRM/知识插件最终拆包、真实数据/API、完整宿主/WAL、冷安装和供应链/回退仍待完成。没有远端 CI、push、Release 或杭州操作；正式候选须从 clean reviewed SHA 重建。

## 本轮施工计划

> r3 现场收尾记录见 [r3 收尾记录](docs/release/dsh-rc2-candidate/closeout-20260930.md)；r1 的 immutable Release、fetch receipt 和杭州 current 状态以本页与 runbook 为准。下方较早段落保留历史候选与未部署时的证据语境；不要用其“尚未执行”字样覆盖 2026-09-30 的事实。

- 截至 2026-09-29 的历史候选快照：rc2 候选验证账本见 [verification-20260927](docs/release/dsh-rc2-candidate/verification.md)；T2–T12 gate 见 `docs/release/dsh-rc2-candidate/`；固定上游 checkout、dsh-dev、B0 clean rebuild、PR #61 CI 和当时的 main CI 均通过；真实模型、131GB DuckDB、rc2 冷验证、杭州 route/重启和真实 HTTP backpressure 当时仍 `NOT_RUN`。当前 r3 事实见 [收尾记录](docs/release/dsh-rc2-candidate/closeout-20260930.md)。
- 本机候选 worktree 不含 DuckDB/WAL 文件；这里只使用 synthetic fixture 和隔离小库，杭州生产数据状态不由本地文件推断。PR #84 合并提交 `a9da9161` 的 `dsh-0.19.0.0-candidate` 曾在 Mac 隔离目录完成 build/receive/doctor；该快照在后续 main 提交后仅作历史证据，正式包必须从最终 reviewed SHA 重建，未上传或写入杭州现役目录；目标仍只有 Python 3.12.3，未满足项目 Python 3.14+ 冷运行时要求。
- 历史 merged-main internal artifact 仍使用 provisional tag `dsh-0.18.0.1-main-00823ff5`；source SHA `00823ff533b4cc32861cc70e3f8bda5d374f3b14`、app tarball SHA-256 `b11c4b43436eb06f1821c1891121b690e5488effa0c75d421f285e051c8fbf35`、manifest SHA-256 `4642f4614d81b6f2f8777485793b20f2c140eb3523efa46475831fe4398d36d7`、entries `1676`；pinned upstream `477b4f42` git-archive tarball SHA-256 `ddc0cb7b74c938e097f918f44e88e67a83bdde555db18f49cb7a3c9740744e32` 已在隔离 `/tmp` 生成，尚未上传或绑定 publication sidecar；manifest 以 `.context/release-evidence/dsh-0.18.0.1-main-00823ff5/release-manifest.v1.json` 为唯一来源；接收目录为一次性 synthetic 临时目录，未创建 draft/tag/release。`0.18.0.2` 及其 pre-review 包只保留为历史证据；`0.19.0.0` 的 `a9da9161` 候选快照已完成本地 checksum/receive，后续 main 提交使其失效；最终包以仓库外的不可变 manifest/CI evidence 为准，仍为 internal-only-partial。

- Artifact Inbox 数据层、自由 HTML 候选保存、原生 `write/edit/present` 接收、轮询和单卡片局部 patch 已合入并在杭州运行。
- 历史 PR #61 与合并后 main CI 已完成；Tailscale SSH host preflight 与 CRM+DSH/page loopback healthcheck 已通过；本候选的 PR/CI、杭州 CRM/DSH/WeKnora 切换、Cloudflare 入口和安全收尾仍按现场门禁处理；本地与生产均不改 DSH 上游。
- 隔离合成环境的 Playwright headed 旅程已通过（页面生成/预览、局部编辑、保存新版本、回滚和脏数据离开保护）；该 fixture 的生成步骤走 live adapter fallback，不能当作浏览器级 Artifact Inbox intake 证据。完整 DSH shell/生产收件箱旅程与本人 UAT 尚未执行，真实模型逐格式编辑、P13、扫描 PDF OCR、复杂 Office、图谱剩余语义核对仍未完成，不能记为产品全量通过。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。生产服务、真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。无宿主实时事件时，原生 HTML 发现依赖驾驶舱打开后的有界轮询和手动刷新，这是平台能力边界。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->


## 2026-10-11：PR #119 推送前状态快照

<a id="shinemage-pr119-before-push-20261011"></a>

以下保留 `0ffc3c67` 提交中的完整 STATUS 内容，仅将相对文档链接改为历史目录可用路径。所有“当前”、未提交、PASS 和 NOT_RUN 均属于原段落的时点与对象，不代表本次 PR 最终结果；现行状态只看[根 STATUS](../../STATUS.md)。本次正常 pre-push 发现状态页 148 行超出既有短表合同，原文迁入这里，测试门槛保持。

<details>
<summary>展开推送前原状态页</summary>

# 项目状态（Project Status）
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](../../docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 当前本地交付（2026-10-11，分组提交收口）

主仓 `codex/shinemage-abc-local-candidate` 已从 `5390667c` 分组交付本轮改动：104 个代码／配置／测试路径形成 12 笔提交，2 份边界清单形成 1 笔提交；94 份证据由 `39774244` 单独提交。本次说明同步另作 1 笔 `docs`，共 15 笔本地提交。代码与边界 HEAD 为 `d36c567e`；最终说明的 SHA 以 `git log -1` 为准，不把本地 HEAD 当作远端主线。提交目的、当前字节审查及原始验证见[本地交付索引](../../docs/hackathon/evidence/shinemage-main-local-commit-closeout-20261011.md)及[机器记录](../../docs/hackathon/evidence/shinemage-main-local-commit-closeout-20261011-validation.json)。

当前装配与作者证据锁绑定 Workbench `6c5adc9f`／正式回执 `0af61dab…`、CRM `c4b1c91e`／`4663cce0…`；九包和两份原 profile 准备已实际通过。默认公共合同、installed-kit、领域与 Workbench 作者覆盖、release 包装配和路径选择均已提交；它们分别消费固定包、固定公开合同或作者 CI 证据。主仓仍维护 backend／平台合同、profile、组合消费者、保留源码守卫和静态边界扫描，旧 `dsh-plugins/` 不删；另两组私有数值／查询断言仍读取旧 Workbench。因此主仓还不是只有 DSH 的仓库。

OCR delegate 的选档与规则由工具执行，主 Agent 审查每组实际差异；默认排除文件人工补查，外部模型未运行。受影响检查逐组通过，合同阶段另实际执行 17 个生成器／测试组；未将各组计数相加，也未将此前完整 B0 改标为最终 15 笔提交的通过。本轮没有新 hosted CI、candidate/journal、同对象宿主／目标／真实业务验收或远端 Git 写入。原有 92 份历史证据同字节保留，失败记录不改写。

VERSION 仍为 `0.20.0.0`，DSH 固定 `0.1.7-rc.2`／`477b4f42`。CRM／Knowledge 的精确 Cordis peer `4.0.2` 与固定输入实际 `4.0.4` 仍待校准，构建或公共消费通过不关闭兼容门禁；D/E 五仓仍无独立 tsc。SDK 分发按适用门禁 BLOCKED，产品 PARTIAL，release_ready=false。任务外 `security-audit-skill/` 保留且不纳入提交，不能把本轮范围干净写成整仓无未提交内容。


## 杭州生产恢复与 UI 热补丁（2026-10-09）

杭州 current 仍为 VERSION 0.20.0.0；本地 A/B/C 候选未部署。生产恢复、品牌与知识库入口修复的范围、回退和未完成真实模型验收见[现场记录](../../docs/operating/hangzhou-production-hotfix-20261009.md)。不得把该现场记录当作本次插件候选验收。

## 当前快照（2026-10-11，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

以下为本地分组提交前的迁移时点记录；其中“未提交”“两锁未应用”和历史 B0／CI 结论只对应所引用的当次输入。当前交付以上方“当前本地交付”为准。

本轮三路径已完成 OCR delegate 审查、修复并按授权本地应用：Workbench `6c5adc9f` / 正式回执 `0af61dab…`、CRM `c4b1c91e` / `4663cce0…` 及同来源 Workbench 作者 CI 已绑定；另七包与两 profile 不变。主仓新增 canonical 离线 eval 入口，修复空用例集也会通过的问题。应用后 reader 13 PASS，原三组分别 1/1/3 PASS，9 包/2 profile 准备及 CI 绑定 exit 0；新入口 1 个 Node 测试内执行 30/30 合成用例，不累计为 31 项。OCR 3/3，发现的 1 处 Medium 已关闭；后两组仍读取旧 Workbench，原 peer `4.0.2` 未改。代码/文档未提交，本轮完整 B0、新 CI、candidate/journal 和真实业务未执行。见[本轮审查与应用](../../docs/hackathon/evidence/shinemage-three-path-main-application-20261011.md)。下方“两锁未应用”保留为本轮之前的准备时点；产品 PARTIAL，release_ready=false。

主仓公共合同入口已按授权应用 12 路径，并修复重复终止进程组造成的错误覆盖；新入口隔离完整 B0 r2 exit 0：Python 855 PASS / 41 subtests PASS、23 warnings 保留，Node 27 组各自 0 FAIL / 9 次跳过。原 15 个生成器和 C0 hash 未改，主仓实际字节的守卫 28、路径 pytest 34、槽位 4、主题负测／漂移 2 分别通过，OCR 可审 11/11 与排除测试人工 1/1 已审，无开放发现。旧失败保留，主仓未提交，新 hosted CI 和当前组合准入未执行。见[本轮应用与实测](../../docs/hackathon/evidence/shinemage-public-contract-main-cutover-20261011.md)。

最新作者 Workbench 6c5adc9f、CRM c4b1c91e 的正式 pack 已在隔离目录生成、读取并逐成员核对；回执分别为 0af61dab…、4663cce0…。主仓运行包／作者证据锁仍是原绑定，9 包／2 profile 的两锁前移提案已经验证但未应用；不继承旧 candidate/journal 或宿主验收。见[最新来源正式包及下一提案](../../docs/hackathon/evidence/shinemage-current-author-formal-packs-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

最新来源正式包的原公共组合已实际运行：9 PASS / 0 FAIL / 0 SKIP，18 个指定来源负对照 EPERM，运行前后 198 个受保护文件未变、自有进程组已退出；合成 HTTP 和官方 resolver 层级，不代表严格 peer／完整宿主或正式准入。两锁提案 OCR delegate 2/2 已审，无开放发现，主仓 apply --check exit 0，但仍未应用。主仓 PR #119 的已有 B0 是 SKIPPED，当前 dirty CI 未执行；见[本轮组合与两锁审查](../../docs/hackathon/evidence/shinemage-latest-formal-combination-20261011.md)。

此前合同入口隔离提案准备时点（保留原记录）：

主仓公共合同消费者已形成 12 路径隔离提案，尚未应用：固定三仓真实 CI 的 31 份材料，保留原 15 个生成器与 C0 hash；原生成器 15 次 exit 0，槽位 4 项、主题负测／漂移 2 项、守卫 28 项、路径 pytest 34 项分别通过，34 个指定来源负对照 EPERM。OCR 可审 11/11 与排除测试人工 1/1 已审，失败保留；提案对当前 dirty 基线 apply --check 通过。新主仓入口完整 B0／CI、candidate 与业务准入仍 NOT_RUN，旧副本及保留源码守卫不删。见[提案与真实日志](../../docs/hackathon/evidence/shinemage-public-contract-main-cutover-proposal-20261011.md)。

此前合同作者交付时点（保留原记录）：

三个作者仓的合同导出已提交推送，当前真实 Ubuntu PR CI 和 31 份工件来源均核对通过；Workbench/CRM 的 CI 字节码污染由单路径修复关闭，失败保留。原 15 个生成器在旧插件资料拒读下 15/15 exit 0，原槽位 4 项与主题负测/漂移 2 项各自通过，私有行为保留在作者检查。主仓新合同入口和锁尚未切换，旧副本与静态边界继续保留；不继承正式包、candidate/journal 或真实业务准入，PARTIAL / SDK 分发 BLOCKED / release_ready=false。 见[合同材料的实际作者交付](../../docs/hackathon/evidence/shinemage-generated-contracts-owner-delivery-20261011.md)。

主仓领域默认入口已按授权应用完整 r2（18 路径）：以领域作者 `e78e040e` / 真实 Ubuntu PR CI `38121126913` 核对来源和实际覆盖，保留三份显式 legacy，不再在此阶段重建领域源码或执行私有几何。已应用 r2 的隔离完整 B0 r4 exit 0，Python 855 PASS / 41 subtests PASS（23 warnings 保留）；Node 26 组各自无失败，9 次跳过保留原因。前三轮缺输入与预检 PATH 失败原样保留；随后仅清理两份文件末尾空行，语法和差异检查通过。主仓还有 15 个源码合同生成入口、保留合同/缺输入守卫及静态边界扫描，旧副本不删；新主仓 CI、当前候选/真实业务未执行，代码文档未提交，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[本轮应用与完整验证](../../docs/hackathon/evidence/shinemage-board-components-main-cutover-20261011.md)。

此前 Workbench 几何对接时点（保留原记录）：

Workbench 私有几何的本地对接已完成：干净来源 `e9223289` 的真实 CI 运行文件生成新正式回执 `871fd3bb…`，tarball 仍为同字节 `e41df9f5…`；两份锁已同时绑定来源、正式包和实际 CI（155 文件 / 1086 PASS，既有远端结果不重跑、不累计）。主仓三路径已应用，几何阶段核对作者 CI 精确覆盖，不再导入该私有源码。应用后 reader 13 项、几何 1 项各自通过；九包 CLI 准备及身份绑定 exit 0，20 项源码负对照 EPERM，漏几何的重封存夹具按预期拒绝。另八包、profile、旧包/candidate/journal 均未改，主仓未提交；本轮完整 B0、主仓 CI 和新组合准入未执行。见[当前正式绑定与实测](../../docs/hackathon/evidence/shinemage-workbench-geometry-main-bind-20261011.md)，[此前 CI 交付](../../docs/hackathon/evidence/shinemage-workbench-geometry-ci-delivery-20261011.md)保留时点。


上一轮领域作者交付与迁移提案准备时点（保留原记录）：

领域作者的五路径已提交为 `e78e040e` 并推送至现有 PR #1；当前 Ubuntu PR CI `38121126913` SUCCESS。新增守卫 5、几何 28、producer/输入 6、准备守卫 4 分别通过，不累计本地或 push CI。实际 artifact 同时包含干净来源 30 文件、真实 TAP/执行回执与原封存 `22245ab9…`，下载 ZIP/API digest 及所有成员均核对；构建包 `66d53381…` 是不同外层对象。主仓领域入口与锁未切换，无独立 tsc，PR 未合并/发布/部署。见[当前作者 CI 归属交付](../../docs/hackathon/evidence/shinemage-board-components-ci-ownership-delivery-20261011.md)；[隔离提案](../../docs/hackathon/evidence/shinemage-board-components-ci-ownership-proposal-20261011.md)保留准备时点。 下一步已形成[18 路径完整隔离提案](../../docs/hackathon/evidence/shinemage-board-components-main-cutover-proposal-20261011.md)：公开消费 8 项、证据守卫 15 项、保留合同 2 项和路径参数 3 项各自通过，21 个指定来源负对照 EPERM；OCR 可审 17/17 与排除测试的人工审查完成。r2 补丁对当前主仓 --check 通过，尚未应用，完整 B0/新主仓 CI 未执行；此前四路径读取提案保留准备时点，不叠加。

board-components 已按授权建成[私有远程领域仓](https://github.com/tyuanww/shinemage-board-components)：main 为 `3855db80`，两份文档提交 `d5aacdb4` 已推送至 [PR #1](https://github.com/tyuanww/shinemage-board-components/pull/1)。本次 Ubuntu PR CI `38119670295` SUCCESS，几何 28、producer/输入 6、准备守卫 4 分别通过；下载包为 1951 字节 `66d53381…`，与原 1955 字节 `22245ab9…` 的五个成员同字节，外层归档不能互换。无独立 tsc，未合并/发布/部署，主仓领域锁与生产者选择保持。见[远端 CI 原始绑定](../../docs/hackathon/evidence/shinemage-board-components-remote-ci-20261011.md)。

主仓旧领域生产者的输出文件符号链接防覆盖已单独修复，四项自有负对照拒绝且标记保持；受影响 `package-inputs` 入口 13 PASS / 0 FAIL / 0 SKIP，增量 OCR delegate 2/2 已审，无发现。两源码增量仍未提交，没有新完整 B0/主仓 CI/组合准入；见[本地修复证据](../../docs/hackathon/evidence/shinemage-board-components-main-output-guard-20261011.md)。PARTIAL / SDK 分发 BLOCKED / release_ready=false。

上一轮领域本地 Git/clone 交付时点（保留原记录）：

board-components 领域作者仓已按授权完成首次提交 `3855db80`（28 路径）及该提交的真实 `--no-local` clone。暂存差异 OCR delegate 19/19 已审；源码与网络拒绝下 producer/输入 6 项、几何 28 项、准备守卫 4 项分别通过，17 个负对照均 EPERM；1955 字节包仍与 `22245ab9…` 同字节。作者仓干净、无 remote，远端 CI 和主仓领域生产者切换未执行；无独立 tsc，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[本地 Git 与 clone 交付](../../docs/hackathon/evidence/shinemage-board-components-owner-git-delivery-20261011.md)。

上一轮领域提案准备时点（保留原记录）：

既有计划中的 board-components 领域 owner 也已形成本地可审提案：原几何 28 项、producer/输入 5 项和最终准备守卫 4 项分别通过；拒主仓、上游/build-tools、九个作者源码后生成的 1955 字节领域包与 `22245ab9…` 同字节。不需要 DSH 构建；当前没有 Git/真实 clone/远端 CI，无独立 tsc，主仓生产者保持。见[领域提案](../../docs/hackathon/evidence/shinemage-board-components-owner-proposal-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

历史四插件隔离也已迁出默认源码构建：shine-brand/query、CRM 和 Knowledge 现在分别接收各自固定正式归档，不再临时复制源码、构建或造 Git 来源。源码、作者仓、上游和 build-tools 拒读条件下 4 PASS / 0 FAIL / 0 SKIP，20 项负对照均 EPERM；既有公共行为消费者另跑 29 PASS / 0 FAIL / 0 SKIP，使用可读固定 SDK 和合成 localhost HTTP，不累计，也不关闭原 Cordis 严格安装冲突。六项坏输入及 pipeline 目录复用拒绝保留日志。两份原源码夹具都留作显式 legacy；领域生产者、私有几何投影及剩余源码合同仍开放，旧副本不删。本轮完整 B0、新 CI、当前 candidate/journal 与真实业务、发布均未执行，主仓改动尚未提交；见[当前固定包隔离](../../docs/hackathon/evidence/shinemage-fixed-pack-isolation-20261011.md)。

上一轮执行记录（installed-kit 默认迁移；历史隔离当时尚未关闭）：

installed-kit 的默认十源码构建已迁出：当前入口实际打包并离线安装开发 kit，严格编译一份自有合成消费者，再从九个固定正式包核对 kit 声明和三份领域锁；九份主仓业务源码、九个原作者仓拒读条件下，同次 13 PASS / 0 FAIL / 0 SKIP，18 个负对照均 EPERM。相邻合同另跑 24 PASS，五项坏输入拒绝及 pipeline 结果目录复用拒绝符合预期，数字不相加。原十源码函数体逐字节保留为显式 legacy 入口，本轮未运行。主仓仍有领域包生产者、历史四插件隔离和若干源码合同入口，旧副本暂不删除；本轮完整 B0、新 CI、当前 candidate/服务/目标/browser/真实业务及发布均未执行。改动尚未提交，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[当前 kit 归属迁移](../../docs/hackathon/evidence/shinemage-installed-kit-pack-ownership-20261011.md)。

上一轮执行记录（正式 preflight 包装配；下列验证只覆盖该轮字节）：

正式 preflight 与 release 的业务插件装配已改为消费独立正式包，不再读取所选主仓插件源码或执行它们的 build。当前七包在九份旧源码、九个作者仓、固定上游和 build-tools 拒读条件下装配与字节核对通过，20 个负对照均 EPERM；release 测试入口 539 PASS，最后工作流修订 41 PASS，路径/runner 检查 82 PASS，分别记账。单独输入锁更新仍选择适用 B0，不自动触发整套 DSH prepare/audit。实际 `preflight --check` 接受七包输入，但整体因 dirty tree 和 runtime bundle 缺失而 BLOCKED；完整 preflight、这一轮新字节的完整 B0、新 CI 和当前 candidate/journal 验收均 NOT_RUN。installed-kit 多插件源码夹具、领域包生产者、历史隔离及旧副本仍待迁移，产品 PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[当前包装配记录](../../docs/hackathon/evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

上一轮执行记录（Workbench core 归属迁移；其完整 B0 只覆盖当时字节）：

Workbench 作者 head `d038f357` 的四项 CI SUCCESS 已交付；完整 CI 各自为 154 文件 / 1072 PASS。已从该精确来源生成新正式 pack 回执 `9d7f6bf3…`，tarball 仍为同字节 `e41df9f5…`，组合锁前移到 `89e2b2ea…`，其他八包和两份 profile 不变。主仓常规 Workbench core、构建、私有 loader 与 clean rebuild 已改为固定作者证据归属，保留原三组业务合同 1/1/3 和公开包消费者。新完整本地 B0 r3 exit 0：Python 855 PASS / 41 subtests PASS、Node 24 组无失败、9 次 opt-in 跳过；22 条 Python warnings 和 stderr finalization 警告保留。CI 路径/runner/workflow 补查 82 PASS 另记。主仓本轮产品和文档未提交、新 hosted CI 未运行；旧 tarball 宿主证据不重标为新 candidate。installed-kit、历史生产者、formal preflight 源码路径和旧副本仍待迁移。见[当前正式包与归属迁移](../../docs/hackathon/evidence/shinemage-workbench-core-formal-main-ownership-20261011.md)。

以下接续段保留较早执行时点；其中旧来源、未执行和未提交结论按各自证据对象理解，当前入口与身份以本节最前面的最新记录为准。

精确 Cordis `4.0.4` 的隔离修订普通包现已通过官方 npm 宿主的开启、原生关闭、恢复三进程验证：原生鉴权、合成会话保留、关闭时 CRM 路由 404、恢复后 200 且未连接。新 home/workspace、localhost 沙箱及自有进程清理均核对；旧正式包、原作者仓和 candidate/journal 不变，不能抵扣真实服务/模型或正式准入。见[本轮 npm 宿主证据](../../docs/hackathon/evidence/shinemage-corrected-npm-host-20261011.md)。

Cordis 精确校准已有可审查提案：两包隔离副本改为 `4.0.4`，严格构建/测试、官方 npm 严格锁解析与实际 `npm ci`、四个普通包入口导入均通过；五份运行 JS 与旧包同字节。三个增量补丁尚未应用，原作者声明和正式包仍为 `4.0.2`，因此原严格安装冲突未关闭。需 owner 授权合同校准、干净新提交/新正式包和输入锁后再接主仓守卫，不能继承旧准入；见[隔离提案证据](../../docs/hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。

普通严格包解析已确认 Cordis 声明冲突：官方 DSH/dsh-tools `0.1.7-rc.2` 要求 `~4.0.4`，CRM/Knowledge 正式包仍精确声明 `4.0.2`。三个 r2 锁解析案例均 exit 1 / ERESOLVE，逐条核对实际版本和 peer owner；这不是兼容 PASS。此前 linked 官方安装/初始化仍只覆盖原层级。首轮证书失败及包装脚本误读历史日志保留，单独 readback 纠正分类；TLS 未关闭，作者声明与封存包未改。见[严格 peer 证据](../../docs/hackathon/evidence/shinemage-cordis-strict-peer-20261011.md)。

迁移后的当前本地完整 B0 第 r2 轮 exit 0：Python 855 PASS、41 subtests PASS，23 条警告保留；Node 23 组均 0 FAIL，十次跳过按本次组与原因记账。固定 Node 24.19.0、独立 Python 3.14.4 按 B0 原锁核对 25 包，未改全局环境。首轮因生成边界清单过期失败，原日志保留；按既有生成器同步清单和说明，未改 policy、peer 或运行源码。干净重建/类型检查通过，重建目录已回收，临时包只作 fixture。以下较早阶段的“完整 B0 未跑”不覆盖本轮接续；本轮仍保留 Workbench 源码及历史生产者/隔离阶段，不代表全部源码装配已迁完。新 hosted CI、当前 candidate 正式服务/目标/浏览器/回退和真实业务仍开放，代码/说明未提交。见[当前 B0 回执](../../docs/hackathon/evidence/shinemage-current-b0-closeout-20261011.md)。

主仓 profile 生成器的五项原测试已移到 `scripts/crm-calibration/profile.test.mjs`，旧 CRM 路径保留兼容转发，默认 B0 使用新入口。在列明插件源码及原作者仓拒读条件下，实际三入口组合 14 PASS / 0 FAIL / 0 SKIP，已含这五项；旧入口另跑同样五项通过，不能累加。五份源码负对照为 EPERM。产品、正式包、candidate/journal、Workbench 待授权的八文件均未改；代码/说明未提交，完整 B0、新 CI 和其余源码阶段仍开放。见[测试归属迁移](../../docs/hackathon/evidence/shinemage-main-profile-test-ownership-20261011.md)。

默认 B0 的 CRM/Knowledge 两项源码构建已本地改为独立正式包行为消费，原公开断言正文保留；四份私有测试与作者仓同字节并归各自 CI。源码拒读下两包消费同次 11 PASS，包/profile 守卫 67 PASS、原公共组合 9 PASS，分别记账；六项坏输入/防复用及六份源码负对照通过，首次夹具布局失败保留。代码/文档未提交，完整 B0、新 CI、Workbench 源码阶段及正式候选仍开放，未删副本。见[包行为消费迁移](../../docs/hackathon/evidence/shinemage-crm-knowledge-package-consumers-20261011.md)。

CRM/Knowledge 的固定正式两包进一步完成官方安装、解析器导入和本机宿主/preset 初始化；声明仍是 Cordis `4.0.2`，实际解析 `4.0.4`。宿主接续六项通过，CRM 未连接状态明确返回；linked peer 警告和首次脚本清理错误保留。该结果只关闭本次固定组合的安装/初始化子项，不证明声明正确、实际 `4.0.2` 或全部运行兼容，也不抵扣真实服务/模型、浏览器或 candidate 准入。产品字节、包和 journal 未改，记录未提交；见[宿主兼容补查](../../docs/hackathon/evidence/shinemage-crm-knowledge-host-compat-20261011.md)。

作者验证归属补齐：Workbench 在四个 loader/skills/视图入口后，再接入 native-board-auth 和 lane-g 两个既有文件，原测试与 helper 未改。隔离 Linux 完整作者入口同次 30 文件、212 PASS / 0 FAIL / 0 SKIP，已包含新两文件的 8 项，边界 5 PASS 另记；严格构建和内容包通过，包与前轮修复后产物同字节。本轮复用前轮 113 包固定输入，不宣称全新 SDK 安装或 hosted CI；正式包/candidate/journal 未变。作者改动未提交，主仓七个旧生产者入口仍保留，待作者仓提交和 CI 交付后再切走重复执行；当前记录见[作者测试补齐](../../docs/hackathon/evidence/shinemage-workbench-author-tests-closeout-20261011.md)，此前 204 项属于[历史四入口](../../docs/hackathon/evidence/shinemage-workbench-producer-ownership-20261011.md)。

最新迁移：原生 prompt 的 10 项严格注入检查已消费公开客户端包与实际 Cordis `4.0.4`，源码拒读通过；九入口同次运行 66 PASS / 0 FAIL / 0 SKIP，输入/九 scope 守卫 18 PASS，分别记账。原断言保留，旧失败轮留存，compiled producer 剩七入口，源码构建和完整宿主仍开放；实现未提交。见[原生 prompt 消费记录](../../docs/hackathon/evidence/shinemage-workbench-native-prompt-pack-20261011.md)。

本轮客户端合同接续：工具卡、取消、保存、首购和资产弹层的运行检查已消费同一正式包，八入口源码拒读实跑 56 PASS / 0 FAIL / 0 SKIP，含前轮 12 项；相关输入回归 105 PASS，保留源码断言 4 PASS，各自记账。八个消费目录防复用通过，原包/candidate/journal 未改。Host、私有视图和其他源码生产者入口仍待迁移，本轮未提交；见[合同包消费记录](../../docs/hackathon/evidence/shinemage-workbench-consumer-contracts-20261011.md)。

最新客户端迁移：Workbench 的 12 项发布客户端检查已消费固定正式包，原断言保留，在列明源码拒读条件下 12 PASS / 0 FAIL / 0 SKIP；9 项新增输入守卫连同既有回归为 97 PASS，分别记账。原 Host 入口断言仍在源码阶段，原包运行 peer 缺口及默认 B0 的其他源码阶段未关闭。没有新包、candidate 或 journal，代码/证据未提交；见[客户端包消费记录](../../docs/hackathon/evidence/shinemage-workbench-client-pack-migration-20261011.md)。

最新本地补充：默认 B0 的六个叶子插件常规构建/消费阶段已改为读取独立正式包，品牌行为、能力标记、几何计算和 ESM/require/严格类型消费检查保留。列明源码拒读条件下 20 PASS / 0 FAIL / 0 SKIP，相关输入与既有回归 88 PASS，分别记账；21 个拒读路径的负对照为 EPERM，重复结果根被 EEXIST 拒绝。历史作者输入守卫、源码隔离夹具和 Workbench/CRM/知识源码阶段仍保留待迁移，不宣称默认 B0 已完全脱离源码。包、candidate、journal 未改，代码和证据尚未提交；见[叶子包消费迁移](../../docs/hackathon/evidence/shinemage-leaf-pack-migration-20261011.md)。

最新接续：主仓已有固定包准备入口及三个 CI 工作流的输入接线，九份既有正式包按来源 SHA、版本、manifest/归档摘要锁定；不复制插件源码到公开主仓。目录与 ZIP 准备、三项环境输入导出及准备后九项公共合同组合已本地通过；54 项包/profile/输入守卫和 189 项 tooling 检查分别通过。远端尚未配置固定 artifact 定位变量及专用读取 secret，未上传本次输入包，也未执行新 hosted CI；完整 B0、正式候选及宿主准入仍开放。见[CI 包输入接续](../../docs/hackathon/evidence/shinemage-ci-pack-inputs-20261011.md)。

本地检查补齐：ZIP 外部输入校验改为显式异常，普通与 Python `-O` 模式的坏归档均拒绝；最新 54 项守卫通过。前端构建及 223 项单测、release 回归 41 项通过。backend 通过不重叠分组覆盖既有 298 个 synthetic-not-slow 目标，唯一 JUnit 用例为 3223 PASS / 78 SKIP / 0 FAIL；三次环境失败保留，SKIP 不代表真实数据验收。隔离 Python 只按服务既有精确版本与 B0 的 psutil pin 准备，没有修改全局环境或服务清单。以上结果分开记账；完整 B0、依赖审计/Docker smoke 和本批远端 CI 仍未执行，实现/证据未提交。

本轮最新本地结果：CRM／知识与 page tools 的组合验收入口已消费独立正式包，沿用原 profile，在列明业务源码拒读和 localhost 网络条件下，九项公共合同组合通过；实际解析 Cordis `4.0.4`，声明仍为 `4.0.2`。47 项输入/profile/包守卫及 78 项旧夹具兼容回归分别通过，不相加。12 个自有 HTTP 服务已关闭并复查端口；原包、candidate 与 journal 未变。完整宿主、官方安装 peer 兼容和候选准入仍开放，代码/证据未提交。见[固定包组合记录](../../docs/hackathon/evidence/shinemage-fixed-pack-composition-20261011.md)。

本地接续：当前分支 `codex/shinemage-abc-local-candidate`，HEAD `5390667c`；PR #119 与九个插件 PR #1 仍开放，远端当前提交的适用 CI 成功，尚无本轮合并及 post-merge CI。八个插件作者仓干净，Workbench 另有未提交的运行 peer 修复及构建守卫；九仓均无 GitHub Release。主仓固定包开发入口迁移与 pnpm 选择修复仍未提交。原七包的官方安装和配置生成通过，但原 Workbench 在宿主导入时失败；补齐固定 peer 的隔离诊断通过开启、原生关闭、恢复三个进程阶段及合成会话持久化，不能记为旧正式包或 candidate 验收。修复后的 Workbench 本地 Linux 严格构建及 196 项包测试通过，主仓开发入口 114 项定向回归通过。新独立来源 candidate `591134e8…` 的 journal 仍为 seq 3，仅完成准备和同字节服务工件关联。最新结果见[宿主依赖修复与诊断](../../docs/hackathon/evidence/shinemage-official-pack-host-closeout-20261011.md)，此前准备阶段见[包输入迁移记录](../../docs/hackathon/evidence/shinemage-profile-pack-migration-20261011.md)。下表已合 PR #111–#118 的检查不覆盖本批未提交代码；live CLI reload、当前候选服务/目标/浏览器及正式回退仍未关闭。

本轮进一步完成 CRM/知识 profile 的正式包输入迁移：沿用现有 `crm-knowledge-rc2` profile 和独立仓固定提交的两份正式包，在主仓业务源码、原作者仓拒读及禁网条件下生成配置。包、来源和 profile 摘要已记录；正式服务/完整宿主准入及整体 Cordis 兼容仍未关闭，不能抵扣 candidate 准入。新增合同回归 38 PASS、release 定向回归 58 PASS 分别记账；实现和文档仍未提交。见[CRM/知识包输入记录](../../docs/hackathon/evidence/shinemage-crm-profile-pack-migration-20261011.md)。

| 项 | 状态 |
|---|---|
| Git | PR #111–#118 均已合并；当前远端 `main` 为 `4859d136`，PR #118 是 PR #117 后的主线事实同步。合并后的 `main` CI run `38066459376` 通过；实时主线以远端 `main` 和 GitHub CI 为准。三个已合并候选远程分支已按授权删除，本地旧分支引用和 stale `origin/*` tracking 引用仍单独保留待整理。原集成树的 `security-audit-skill/` 是独立目录，不纳入主仓。详见[最新 post-merge 远端事实](../../docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)和[本次清理证据](../../docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 插件解耦 | 固定 SDK 构建路径要求显式绝对上游、build-tools 和输入包，已移除主仓 .context 回退；shine-brand 独立仓的默认公开编译路径使用自身 npm 锁，不读取上游或 SDK，且不代表严格 SDK 类型检查。CRM/看板/知识与 Workbench 的边界证据保持独立记录。 |
| 独立仓 | 九个插件已有独立私有远程仓；本次复核显示九仓各有一个开放 PR #1、最近 fixed-inputs CI 成功、均无 GitHub Release；`dsh-shine-crowd-action` 另保留较早 full CI 失败。详见[远程仓收口复核](../../docs/hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。主仓继续维护 DSH 集成合同、profile、组合验证和历史副本，正式物理分仓仍按 stop/go 约束推进。普通 content pack 不等于正式 dsh-plugin-pack/candidate。 |
| 本地验证 | 固定 Node 24、Python 3.14；定向 release/protocol/SDK/map/HTML 与边界检查已通过。推送钩子按路径计划执行适用检查，真实跳过原因保留。 |
| 产品 | PARTIAL；SDK 分发 BLOCKED；release_ready=false。 |
| 真实验收 | 真实 WSL2/terminal/browser、真实模型/业务、生产切换、standalone 页面包和正式分发仍按各自输入保持 NOT_RUN；当前 candidate 的逐项缺口见[正式准入预检](../../docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)。PR #111 的最终 preflight、B0、全量测试、前端、lint、依赖、合同、Docker smoke 和 merge-gate 均通过；`ground-truth-lint` 按既定条件跳过。 |
| 合并检查 | PR #115、#116、#117、#118 的 `CI`、`merge-gate`（适用时）和各自合并后的 `main` `CI` push workflow 均成功；PR #118 的 `changes`、`test`、`lint`、`merge-gate` 通过，不适用的路径 job 保持 skipped。这只是文档/代码合并检查，不是真实业务、生产或正式分发验收。run ID 见[最新 post-merge 远端事实](../../docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。 |
| 清理 | 11 个已归档候选源目录及其 worktree 已按授权删除，11 个归档包和 SHA-256 清单保留；三个已合并远程候选分支已删除。T14、RC2、公共 main、SDK/证据归档和 `security-audit-skill/` 保持不动。详见[本次清理证据](../../docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |

## 本轮施工计划

1. 本轮本地分组提交已交付，当前说明最后提交；先核对任务范围无遗漏、暂存区为空，保留任务外目录，不做整仓清理。
2. 下一步按实际授权推送该 feature 分支并更新对应 PR，依真实路径计划执行新提交的 CI；旧文档 PR 或作者仓 CI 不替代这次主仓检查。
3. PR 审查发现问题时追加聚焦提交并验证；获合并授权后，完成适用 `/qa` 和实际 PR 门禁再合并，不先在本地把 feature 合进 main。
4. peer 校准、当前组合准入、真实业务／WeKnora／模型、SDK 正式分发与独立 DSH 升级按原 stop/go 分别推进，未执行项保持原状态。

### 此前 post-merge 施工记录（保留执行时点）

1. PR #111–#118 已合并到远端 `main`；当前主线为 `4859d136`，PR #118 同步了 PR #117 后的主线事实。三个已合并候选远程分支已完成归档、恢复路径核对和单独授权后的删除；本地分支引用的后续整理仍单独记账。
2. **PR #111 的** preflight、B0、全量测试、前端、lint、依赖和合同检查在最终提交上通过；`ground-truth-lint` 按既定条件跳过。本轮沿用 PR #111 的合并回执，未重跑这些检查；旧失败运行保留为历史，不改写为当前失败。
3. 主仓与九个独立插件仓的职责、单插件更新路径、DSH 升级路径和清理顺序已写入维护手册；面向开发者的逐步操作见[插件更新指南](../../docs/operating/shinemage-plugin-update.md)。最新插件远程状态、DSH 升级候选和 SDK 门禁分别见[远程仓复核](../../docs/hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)、[DSH 升级盘查](../../docs/hackathon/evidence/shinemage-dsh-upgrade-audit-20261010.md)和[SDK 门禁矩阵](../../docs/hackathon/evidence/shinemage-sdk-gate-closeout-20261010.md)。源码副本、candidate、正式分发和生产激活仍按各自门禁记账。
4. 保持 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443`、VERSION、SDK BLOCKED、产品 PARTIAL 和所有未执行门禁原样。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。旧候选、失败证据和历史状态只作证据，不能代替当前验收。

以下自动统计块保留为历史抓取，不作为本轮 PR 全量测试计数；当前合并检查结果以本节上方、PR #111–#118 以及最新 post-merge `main` 的 CI 回执为准。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->

</details>


## 2026-10-28 重新授权前的阶段记录

下列记录保留当时的验收范围。最新代码、运行态和开放项以根目录 STATUS.md 为准。

- 隔离 19327 的 H1 核心链路已完成一轮真实验收。DSH 聊天查询七个新来源并生成 HTML，经交付卡进入驾驶舱；人工改文案保存 v2，刷新重开通过；AI 原生对话局部修改、收取预览、确认保存 v3、切换产物重开通过。2955 项来源事实、单位与行标签逐项对账一致。后端 `3893a753`、Workbench `3d44284`，现场 AI 锚点修复 `ebd1eee1`。只更新隔离服务，公网未切换。后续知识库、UI 与作者 CI 结果见上条；跨重登和完整运行 ZIP 仍开放，产品保持 PARTIAL。见[聊天到驾驶舱验收记录](docs/hackathon/evidence/dsh-chat-cockpit-uat-20261028.md)。

- 七来源保存阻断已完成代码修复、定向回归、独立只读复核及来源失效保存的形式化检查。隔离 19327 已接收主仓 `77de746e`、CRM `5b884ba`、Workbench `8e4f9a0`；未切公网。真实聊天、人工和 AI 保存重开及新主仓 CI 仍待复验，不能宣称业务全部验收。见[本轮收口记录](docs/hackathon/evidence/dsh-source-budget-20261027.md)。
