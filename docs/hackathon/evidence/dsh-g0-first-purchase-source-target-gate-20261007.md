# 来源 HTTP 目标回执接入原候选账本（2026-10-07）

结论：复用[上一轮实际杭州 WSL 十项观测](dsh-g0-first-purchase-source-wsl-20261007.md)的原始输入和回执，经现有 CLI 核验后，追加到候选的原 journal **seq 4**。本轮没有重新打包、执行远端服务或切换生产。仍为 **PARTIAL / activation BLOCKED**。

工作树 codex/plugin-boundary-review，HEAD 为 09080b776acdf0023d1436e98758e7131029c6d3。业务包来源仍为 f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6；本地未提交的校验器/测试/文档不改候选身份。

原始记录根目录（下文 OUT）：.context/checks/first-purchase-source-target-gate-20261007/。

## 绑定关系和边界

| 项目 | 精确身份 |
|---|---|
| 既有局部 candidate | 861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4 |
| 查询 archive | 109251614197e515a34a4824206e93ef53c0185e5c09a24a7906f9f7a967b8b7 |
| 保存 archive | ee4908c40c7c8d127cec1c25b4bfae83ec6b0997d006bc7bf9615e8ee23f0ac7 |
| 原始 WSL receipt | 607b7d942a10b337d50a58b1138cf1f31424d925561b1376011dd72d446f8f2f |
| 原始 WSL input | 7f12e035ad3019b566a411b9febac5af30932d9aa09bdc4b9bddf8d40f7bd3d3 |
| seq 4 event digest | 1164f8a90711d6b7cb8ddf2814b6ac44403b34b780dd305d03cadbb75b44be18 |
| seq 4 state file SHA | 3045d82a47d8ad21e0f94a5c774778bdfc3b482c33ca9d4d6950993d233fd57b |

plugin verify-service 按明确 schema 区分旧十四项跨版本服务恢复与新十项来源 HTTP 观测。原十四项校验保持原合同；未知 schema 和互相冒充 scope 均拒绝。两类证据共享既有 journal 和事件模型，没有新建第二本状态账。

新增核验包括原 candidate 字节/digest、服务源码关系、43 个输入文件、固定 runner/helper、synthetic fixture、查询包 Git 源码与 allowlist、安全解包、保存包 hash、15/13 个目标依赖及离线安装日志、五个服务进程和已退出 worker、SIGKILL/重放、独立 SQLite owner、完整 sidecar 集合。查询包与保存包复用受限解包校验，不运行包内业务代码。

该有限 runner 要求插件候选与 query/save 来自同一源码 SHA。后续物理多仓须显式设计新 runner/输入版本，不能放宽这份历史证据的约束。当前 candidate 仍只代表既有 workbench/保存绑定，不代表整个 DSH 部署；query 归档以独立摘要记入观测。

输出为 LOCAL_WSL_SYNTHETIC_SOURCE_HTTP_OBSERVATION_VERIFIED，并保留：

- release_ready=false、activation=BLOCKED。
- dsh_host、cross_version_service_recovery、production_identity、supply_chain 为 NOT_RUN。
- evidence_authenticity=UNATTESTED_OPERATOR_OBSERVATION：本地 hash 校验不能认证远端操作者或发布者。
- candidate_policy=SYNTHETIC_NO_AGE_POLICY：沿用用户暂不评估陈旧/过期的决定，不启用生产保存。
- production_listener_preservation=NOT_VERIFIED_BY_THIS_RECEIPT：原始十项 receipt 未包含完整生产端口前后快照；上一轮另有清理观察，本门禁不把它冒充为独立生产健康证明。

## 本轮实际验证

| 命令/检查 | 实际结果 | 证据 |
|---|---|---|
| Node 24：node --test scripts/release/source-target-evidence.test.mjs | **34 PASS / 0 SKIP** | source-tests-reviewed-r2.log |
| Node 24：node --test scripts/release/service-target-evidence.test.mjs scripts/release/plugin-service-evidence.test.mjs | **70 PASS / 0 SKIP**；旧门禁回归 | prior-gate-tests.log |
| Node 24：node scripts/dsh.mjs test（同 pnpm dsh test） | **278 PASS / 0 SKIP**，包含新旧门禁 | release-tests-final.log |
| 实际原始 WSL 回执调用 CLI | seq 3 服务事件复用，新增 seq 4；不改前三条历史 | actual-cli.stdout、actual-verification.json |
| 独立 CLI 进程重试 | 输出一致；journal 字节及 mtime 均不变 | actual-cli-retry.stdout |
| 实际本机 PASS receipt / 错 candidate receipt | 分别以 scope/binding 错误退出 2，不写 journal | local-receipt-rejected.stderr、wrong-candidate-rejected.stderr |
| Python 3.14：pytest --noconftest -q -W error::ResourceWarning backend/tests/test_first_purchase_source_target_probe.py | **7 PASS**；Ruff 同时通过 | python-guards.log |
| 固定文件复核 | 15 个候选文件字节、大小、mtime 不变；原现场 input/receipt 与 runner 不变 | before.json、actual-verification.json |

接线命令沿用同一入口，实际运行的是固定 Node 24 的 scripts/dsh.mjs：

    PKG="$PWD/.context/checks/first-purchase-source-packages-20261007"
    WSL="$PWD/.context/checks/first-purchase-source-wsl-20261007"
    node scripts/dsh.mjs plugin verify-service \
      --candidate "$PKG/plugin-candidate/candidate.json" \
      --evidence "$PKG/pair-r2/receipt.json" \
      --state-path "$PKG/plugin-state.json" \
      --target-evidence "$WSL/retrieved/result/receipt.json" \
      --target-input "$WSL/wsl-r4/input/input.json"

测试夹具仅验证校验器：其中的 wheel 是不可安装的测试字节，不代表真实 WSL 或服务执行。真实十项结果仍归属上一轮，不计成本轮重新通过。

## 审查与失败记录

首轮新增 32 项、旧门禁 70 项通过；随后增加重新散列恶意 query 归档的负测，完整套件当时为 277 项。OCR 自审发现固定 runner 的同源码 SHA 条件未完全进入校验器，现已补齐并增加另一候选源码不得继承观测的用例。测试夹具初次调整使用了非法 tag，被既有 RELEASE_STATE_TAG_INVALID 拒绝；改为复用其原合法 tag。失败日志 source-tests-reviewed.log 保留，没有绕过校验或覆盖成 PASS。最终以本表 34/278 为准。

仍需完成目标 DSH/插件/浏览器组合、当前双包与旧服务的目标恢复矩阵、生产身份/传输保护与 UAT、供应链、activation/reconcile/canary 和物理分仓。此接线不关闭这些 gate，也不授权发布。


## 下一阶段的只读预检

本轮通过 Tailscale/SSH 实际检查杭州 WSL：Linux x86_64、Node 24.21.0、Python 3.14.4，zstd/git/timeout/unshare 可用，临时盘剩余约 170 GB。只执行版本、工具位置和磁盘探针，没有启动应用或访问业务数据；见 target-prerequisites.json。

现有本机 9902bdd9 runtime 的摘要 40af3c5e… 仍正确，但归档包含 Mac arm64 的 system/require-builtin/sharp/sherpa 原生依赖；本次只清点文件，不能因此声明完整 Linux 闭包或 Linux 启动通过。当前 first-purchase-artifacts 与 Host driver 仍校验上游 Git checkout 并使用 apps/cli 布局，需要增加明确的已验证 runtime-artifact 入口后再做目标整链。见 runtime-inventory.json。

已只读取得 GitHub 已发布 dsh-0.20.0.0-r1 的资产列表及 release manifest，并核对下载文件大小和 GitHub asset SHA；它指向同一官方上游的另一个 runtime（164918950 B，a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4），可作为下一步复用候选。尚未下载/运行该 runtime，也未验证其 Linux 闭包或发布信任链，不将资产列表当作目标通过。已知路径 /srv/shinemage/dsh/incoming 未找到，不代表其他目录没有缓存；本次没有遍历生产磁盘。见 published-release-assets.json、published-r1/release-manifest.v1.json、target-runtime-cache.json。

本机已有 Docker daemon 的只读探针返回 linux/aarch64；这不等于目标 linux/x86_64 构建已经就绪，没有启动 daemon 或容器。下一阶段先核验可复用的固定 runtime，再决定是否需要独立 Linux 构建，不在杭州现役目录编译或改上游源码。

## 最终审核与文件范围

按 open-code-review-delegate 覆盖 **18/18** 文件：OCR 选中 9 个，另补审被过滤的 9 个文档/测试，0 跳过；由当前 Agent 自审，没有外部 reviewer。已修复上述源码关系缺口和两处“尚未接线”的过期文档表述，本批未确认其他未修复阻断缺陷。250 个本地文档链接目标、差异空白检查及本批文本 secret scan 通过。逐文件状态、最终 SHA 与审查归因见 OUT/review-summary.json。

本地修改/新增文件（含上一轮保留的 8 文件）：

- STATUS.md
- backend/tests/test_first_purchase_source_target_probe.py
- docs/hackathon/TODOS.md
- docs/hackathon/evidence/dsh-g0-first-purchase-source-target-gate-20261007.md
- docs/hackathon/evidence/dsh-g0-first-purchase-source-wsl-20261007.md
- docs/operating/first-purchase-save-admission.md
- docs/operating/verification.md
- docs/plans/shinemage-plugin-platform-split.md
- docs/reference/dsh-rc2-release-artifact.md
- scripts/dsh-b0/first-purchase-source-target.probe.py
- scripts/dsh.mjs
- scripts/release/plugin-service-evidence.mjs
- scripts/release/service-artifact-evidence.mjs
- scripts/release/service-target-evidence.mjs
- scripts/release/source-target-evidence.mjs
- scripts/release/source-target-evidence.test.mjs
- scripts/release/test-fixtures/service-artifacts.mjs
- scripts/release/test-fixtures/source-target.mjs

本轮没有 commit、push、PR、合并或 Release 发布；HEAD 仍为 09080b77，18 个本地文件保留待提交。
