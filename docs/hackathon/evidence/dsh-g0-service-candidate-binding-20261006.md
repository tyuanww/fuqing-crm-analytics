# Clean 首购候选绑定与 WSL 隔离验收（2026-10-06）

本轮把已有 clean 首购服务包绑定到新插件候选，并用**同一服务双包**重新完成杭州 WSL 合成验收。构建通过，相关测试 **100/100 PASS、0 SKIP**，现场 **14/14 PASS**；回执已由既有 `plugin verify-service` 写入 candidate journal seq **4**。产品仍 PARTIAL，`release_ready=false`，生产激活仍 BLOCKED。

承接[服务 clean 候选](./dsh-g0-service-clean-candidate-20261006.md)。这次没有修改业务代码、上游 DSH、生产 profile 或保存 UI；不重跑也不把上一轮源码/本机包的各 9/9 计入本轮测试数。CRM/知识库的独立候选不承接首购保存合同，来源和 journal 均保留。

## 固定来源与产物

| 对象 | 本轮固定值 |
|---|---|
| 插件源码 | `787792065f8b86dbaa8fac7b7cc4d46dbb1e8a3e`，构建/打包时工作树 clean |
| 插件 | `@shine-mage/dsh-analytics-workbench-b0@0.0.0-b0`，421582 B，SHA-256 `5efdbec5d0239bdd5ead109442a30430163b867d684bf0168cc31ca59a44321d` |
| 官方 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，只读复用已有固定 SDK 构建依赖 |
| 服务源码 / 候选包 | `2be518e584d3adfb0343be58049dc3c674cea2f9` / `190050f6eaecdaf199c87ca516e3ff9323e72187995721709e448f764c9217db` |
| 服务 baseline 源码 / 包 | `56198c32a52d9822c7a3338d92b0fa077d1c61bc` / `e721dde8976ac28d75d169fbdb14143bd0070788cf6c2be952979d2edf8021e8` |
| 包配对回执 | `a74bf6e92d3246c6d3632af41e495df9fc75b72fb8a437efa6b6399aaf0549a2` |
| 本机测试 profile / digest | `first-purchase-clean-local` / `7319e8bf434d299c902cfd4c0cc38a775019b345464fc11c9b498ed127e9f21d` |
| plugin candidate digest | `afcdae563db363d0223b51a3eb908e9a95afa556d2a0b109f0d7c7a1dab07994` |
| journal seq / digest | `4` / `aa07ea523fabf7a63d7b599bdc2a4c8dcf2e4b7d087c044b91ce9e11d879b100` |

插件与服务分别记录自己的来源；文档提交不会触发服务包重打。临时 profile 只用于候选合同核验，不启用生产写权限。上述插件包与旧构建的字节相同，但本次服务包及配对回执已变化；旧 WSL 回执绑定旧服务配对，因此被拒绝。仅插件/profile 改变而服务包、依赖与适用环境不变时，不据此要求重跑服务验收；仍须分别核对插件宿主合同与候选保存准入。

## 实际命令与结果

Node **24.19.0** / pnpm **11.7.0**，服务 Python **3.14.4**。工作树根下执行，输出根 `OUT=.context/checks/service-candidate-binding-20261006`；服务证据根 `SERVICE=.context/checks/service-clean-2be518e5-20261006`。生成目录已经存在，不应覆盖；`verify-service` 可以对同一组输入重复核验。

```sh
OUT=.context/checks/service-candidate-binding-20261006
SERVICE=.context/checks/service-clean-2be518e5-20261006
export B0_BUILD_UPSTREAM=/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public/.context/dsh-b0/upstream-0.1.7-rc.2

node dsh-plugins/analytics-workbench/build.mjs \
  /Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public/.context/dsh-b0/upstream-0.1.7-rc.2

node --test --test-concurrency=1 \
  dsh-plugins/analytics-workbench/test/built.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-query-model.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-query-card.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-saved-analysis-view.test.mjs \
  scripts/release/plugin-pack.test.mjs scripts/release/plugin-candidate.test.mjs \
  scripts/release/plugin-service-evidence.test.mjs scripts/release/service-target-evidence.test.mjs

pnpm dsh plugin candidate --plugin "$PWD/dsh-plugins/analytics-workbench" \
  --output-dir "$PWD/$OUT/plugin-candidate" --state-path "$PWD/$OUT/plugin-state.json" \
  --profile "$OUT/profile.json" --service-evidence "$PWD/$SERVICE/source/receipt.json"

pnpm dsh plugin verify-service --candidate "$PWD/$OUT/plugin-candidate/candidate.json" \
  --evidence "$PWD/$SERVICE/pair/receipt.json" --state-path "$PWD/$OUT/plugin-state.json" \
  --target-evidence "$PWD/$OUT/target/result/receipt.json" \
  --target-input "$PWD/$OUT/target/input/input-manifest.json"
```

构建及编译后测试显式使用相同的 `B0_BUILD_UPSTREAM` 固定依赖路径。上游 tracked tree 在构建前后保持 clean；没有执行上游安装或修改源码。测试覆盖实际编译后入口/首购卡片、结果 decoder、保存视图，以及打包、candidate、服务包和目标证据门禁；这不是完整 B0 套件或真实浏览器验收。

- 不带目标参数的实际 `verify-service` 先写入 seq 3；重复 CLI 保持字节不变。
- 将旧 WSL 回执交给新 candidate，CLI 返回 **2 / `SERVICE_TARGET_PAIR_MISMATCH`**，不写 journal。
- 新目标回执写入 seq 4；重复 CLI 保持同一 seq/digest，129 个源码回执、包、候选、目标输入/sidecar、journal 文件的 SHA、长度、mtime 不变，前三条 journal 保留。
- `assertServicePromotion` 仍返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`；本地成功不放行生产。

## 新包的实际杭州验证

通过已有 Tailscale SSH 配置与严格 host-key 校验连接，现场为 **Linux x86_64 / WSL2 / Python 3.14.4**。SSH 只做本次专属临时目录的传输、完整性核验及有限命令启动；测试以现有 `nobody`（UID 65534）运行。两个新 venv 分别离线安装相同的 13 个固定 Linux wheel，不联网解析依赖、不安装系统服务。

复核新旧服务的依赖清单完全一致后，复用原平台准备的 wheel 字节、PyPI 来源记录与 synthetic seed；新的准备记录绑定新 manifest，并另存复用来源。28 个输入文件及外层清单封成 **3,706,880 B** 单包，本次传输约 **19.30 秒**。输入 SHA-256 为 `1741dea96bbb9bc4e16a729fa67213160b8198229aa954bb6ca77234a767bf54`，验收 runner 仍为已审查的 `08a1650f…` 原字节。

现场 14 项均 PASS：双包预检/冷安装、旧状态读取、freshness/候选/权限拒绝、保存幂等与冲突、真实 SIGKILL 后回放/UNKNOWN、旧版只读回退、forward-fix、小型备份冷恢复、检出旧 writer 来源损失、双版本未知 schema 拒绝，以及输入/安装完整性。与[原现场场景定义](./dsh-g0-service-target-acceptance-20261006.md)一致，结果来自新包本次执行。

首次解包前，编排创建的 `.owned-acceptance` 标记误用了字面 `\n`；原保护检查拒绝执行，尚未安装或启动服务。保留 `execute-v1.py`、`unpack.stderr` 后，核验本次目录和传输包摘要，修正标记再继续。服务包、wheel、seed、验收 runner 和产品逻辑均未改变，没有把这次失败记成通过。

新回执 SHA-256 为 `ce956bf5dd91f95525bc5ba12b91a38817f4244864217d2a45864729bd6edf05`。10 个临时服务 PID 均已退出，临时安装/状态目录回收；6677、18090、18092、18093、18094 的监听地址/PID 前后相同。回执下载并完成本地验证后，凭本次目录标记和传输摘要回收专属远端目录；原始证据保留在本地。只证明这些快照，未执行生产应用完整健康验收。

## 证据与剩余门禁

本轮本地根：`.context/checks/service-candidate-binding-20261006/`。

- `build.log`、`tests.log`、`context.json`：本轮工具链、来源与 100 项结果。
- `plugin-candidate/`、`plugin-state.json`、`verify-service*.log`、`verify-target*.log`：真实候选、包、seq 3/4 与重复核验。
- `old-target-rejected.log`、`verification.json`、`final-verification.json`：拒绝误用、生产阻断及 50/129 文件不变核验。
- `target/preparation.json`、`input/`、`target-run.log`、`result/`、`result-transfer.json`：固定输入、14 项现场结果、50 个原始回执/sidecar 及下载摘要。
- `target/target-before.json`、`target-after.json`、`result/cleanup-verification.json`：监听/PID、10 个临时进程与安装目录回收的实际证据。
- `target/owned-directory-cleanup.stdout`：下载摘要校验后，仅回收本次拥有的远端目录，未操作旧版本或数据。

此处仍是 **UNATTESTED_OPERATOR_OBSERVATION / SYNTHETIC_A64_ONLY**：fixture 使用 `a` 重复 64 次的候选准入和固定时钟，不能证明真实 plugin candidate 已获生产保存权限。生产身份/候选准入/状态策略、生产 freshness/UNKNOWN 时限、签名/SBOM/CVE、受信任 receive/reconcile/activate、目标 DSH runtime/session/WAL/浏览器及其他服务尚未闭环；物理分仓继续按 G0/stop-go 门禁推进。

以上验收阶段未 commit、push、发布 Release 或生产切换，未读取真实 DuckDB；旧 evidence 与既有 CRM/知识候选保持原记录。后续提交前审核与本地提交另行记录，不改写候选来源。

## 提交前 OCR delegate 审核

2026-10-06 使用 OCR `1.12.11` 的 `delegate preview/rule` 与宿主人工审核。原始变更 **4/4 文件 reviewed、0 skipped、coverage 100%**：STATUS、TODO、拆分计划及本页。OCR 默认以 `unsupported_ext` 排除全部 Markdown，已按其默认规则逐项补审；没有把工具的 0 个可审文件当作审核完成，也未调用外部模型。

确认一处低风险文档问题并修正：旧目标回执拒绝的原因是服务包配对变化，不能归因于插件/profile 变化，从而要求所有插件更新都重跑服务验收。没有确认本批新的产品代码缺陷。

本次实际重跑 `node --test --test-concurrency=1 scripts/release/plugin-service-evidence.test.mjs scripts/release/service-target-evidence.test.mjs`：**70 PASS / 0 FAIL / 0 SKIP**。真实 CLI 重验既有新回执、拒绝旧回执和生产激活负测通过；journal 仍 seq 4，129 个文件的 SHA/长度/mtime 不变，141 个本地文档链接有效。此次审核未重跑杭州现场；上面的 100 项与 14 项保留为上一阶段的实际结果，不计作新的远端通过。

审核原始证据：`.context/checks/service-candidate-binding-review-20261006/` 的 `preview.json`、`rules.json`、`tests.log`、`actual-verification.json` 与 `review-summary.json`。按用户授权通过正常 hooks 本地提交本批文档；没有 push 或生产动作。
