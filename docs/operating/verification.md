# 当前验证入口与工作流

适用于成果工作树的本地补丁；是否已集成，以该工作树 Git 状态和远端证据为准。授权见 [AGENTS](../../AGENTS.md)。当前施工与缺口看根 [STATUS.md](../../STATUS.md) 和 [TODOS 的 M1 核心交付](../hackathon/TODOS.md#m1-核心交付)。黑客松入口与 [治理实施记录](../hackathon/WORKFLOW-GOVERNANCE-2026-09-06.md) 是历史证据链，不是本轮任务卡。

本页带日期的候选、端口、版本和测试数字都是历史证据。当前命令从“先按变更类型选验证”开始；当前版本、运行现场和门禁仍以 STATUS 为准。不要把历史段落中的 `6677`、旧 candidate 或旧测试数当作当前结论。

## 当前 cockpit-v3 商品映射现场（2026-10-22）

线上 `/srv/shinemage/dsh/current` 指向 `dsh-0.2.1-rc.1-core-main-20261021-cockpit-v3`。CRM `0.0.0-crm.5` 与 Query `0.0.0-query.14` 已 side-load，profile package 为 `eaf71912…`，lock 为 `00a202bc…`。商品新老客使用 `product-customer/v3`，覆盖不足明确拒绝，公开结果只返回 `display_name`；Vue 前端已迁移到去重后的商品接口。固定 upstream 仍为 `1600d8a1e140dcde43a1a0941940a0480712c011`。当前运行回执见[审查问题修复部署验收](../hackathon/evidence/dsh-review-fixes-20261022.md)。

v4 过渡候选已执行的局部检查为：固定 Node24 release tests `45 pass / 0 fail`、远程 Node24 peer 缺失负测 PASS、runtime provenance PASS、native/business boot PASS、Settings/account RPC PASS、浏览器插件页 PASS、plugin-market Discover PASS、console logs EMPTY、AppleDouble locale files `0`、v4 boot PASS。上述 peer 缺失负测已验证 fail-closed 行为。默认 Node25 下的 dsh-dev 全量失败属于环境版本不满足，不能改写为代码 PASS。

IM 已从归档输入未定位推进为 `PINNED_INPUTS_VERIFIED`：`@xmanrui/dsh-im@5.2.0` 与 `dsh-plugin@2.0.5` 的归档已按线上 lock 的字节摘要、integrity、commit 根目录和包身份核验并保存。该事实不表示 IM 已完成正式发布；当前仍缺统一发布身份、publisher/signature、独立验收和切换授权，所以 `release_ready=false`。Query `0.0.0-query.14` 已由 clean source `482d149d…` 生成并完成线上 side-load；WeKnora 生产适配层保留固定项目 allowlist，并对读取前后文档元数据双重校验、工具 effect 事务释放和 tenant-wide 文档名 enrichment 禁用 fail-closed。

2026-10-21 收口后的只读现场复核再次确认服务、query.11、模型路由和项目库检索正常；任务队列仍保留 1 条 2026-09-19 的 `datatable:summary` 历史 dead letter（`model ID cannot be empty`），当前 10 篇文档无 pending task 或 error。三个知识库的 `vector_store_id` 按 Postgres env-store 合同保持 `NULL`；Workspace `retriever_engines` 已显式固定为 keywords + vector 的 `postgres` 引擎，不再依赖空数组 fallback。WeKnora 的 DB-managed VectorStore 不接受 Postgres，当前单库部署不创建 per-KB store。检索 key 仍为 tenant scope，但 `knowledge_base_ids` 已从项目库与部署验收库收紧为仅项目库，并保持 `retrieve` capability、`full_access=false` 和原 token 不变。直接项目库搜索和文档元数据读取返回 `200`；部署验收库的搜索与文档元数据读取由服务端返回 `403`，适配层 allowlist 继续作为第二层边界。

本轮在固定 Node `24.19.0` 和 Python `3.14.8` 下重新接收三份作者证据并执行完整 B0 r10 `--check`：Workbench 为 155 文件／1086 PASS，领域作者为 34 PASS，公共合同为三仓 31 份材料；组合包、领域合同、插件边界、supervisor 与固定宿主负测均通过。B0 Python 为 `862 passed / 0 failed`（41 subtests passed，23 warnings），Node 主组为 `586 passed / 4 skipped / 0 failed`，其余调用组均无失败，opt-in/NOT_RUN 跳过项按原原因保留。r8 保持为历史证据；r9 的唯一失败为固定 Workbench 几何测试的 15 秒子进程超时，r10 独占运行通过，未放宽超时。独立完整 backend 为 `3286 passed / 85 skipped / 0 failed / 6 warnings`。命令、退出码、日志路径和摘要见[收口验证回执](../hackathon/evidence/dsh-weknora-lifecycle-hardening-20261021.md#收口验证)。该结果是本地提交前验证，不替代远端 CI、正式 clean machine、CRM 用户登录和真实只读 UAT。


## 独立作者仓合并与正式目标前置（2026-10-12，历史时点）

十个独立作者仓 PR #1 已普通 merge，各自 main CI 均 SUCCESS；完整 SHA、CI run 和范围见[合并与候选前置核验](../hackathon/evidence/shinemage-author-merge-and-candidate-preflight-20261012.md)。隔离任务目录以当前 Workbench formal pack 与既有服务绑定生成 candidate `facb83f3…` / journal seq 2，主仓 profile/journal 未变。

该段只记录 2026-10-12 的历史边界：当时没有把生产入口用于本次 candidate 的 synthetic source/terminal/browser/recovery。2026-10-13 用户明确授权杭州入口同时作为当前测试和生产目标，当前目标前置结果见[授权生产目标前置预检](../hackathon/evidence/shinemage-production-target-preflight-20261013.md)；后续云服务器迁移另行处理。

## 授权生产目标前置（2026-10-13）

`100.93.46.46` 已只读核验为 Linux x86_64 / WSL2，Python `3.14.4`、Node `v24.21.0`、zstd `1.5.5` 和临时目录权限满足目标合同。现役 DSH 的陈旧 `supervisor.lock` 在确认空目录且无 supervisor owner 后受保护移除，systemd 随后恢复 `active/running`。当前 service manifest 的精确 13-wheel preflight 返回 `SERVICE_TARGET_PREFLIGHT_PASS`；source HTTP、terminal/进程恢复和 candidate-bound browser 随 seq 3–5 已分别取得 receipt；cold install、身份状态、真实 UAT 和 activation 仍按 candidate 身份单独验收。现役 release source 与隔离 candidate 不同，不能继承旧结果。

当前 composition candidate `125c8e53…` 已在同一目标完成 `source-http-target-observation/v2`：10 个 source HTTP / service recovery 场景 PASS，target receipt SHA `40a59cfe…`，输入 SHA `b1c5de00…`，并追加隔离 journal seq 3。该回执只覆盖 synthetic service archive、保存幂等、SIGKILL durable replay、备份冷恢复和清理；terminal、browser、真实模型/身份/UAT 与 activation 仍按各自 receipt 和门禁解释。详见[当前组合 source HTTP 目标验收](../hackathon/evidence/shinemage-composition-source-http-target-20261013.md)。

同一 candidate 随后在该目标以当前 release 的临时 profile/runtime 完成九包 terminal drill：组合 roster、CRM/Knowledge 工具、synthetic native loop、受控重启和进程丢失后的 durable session 恢复 5/5 PASS；组合封套经 `verifyCompositionHostEvidence` 校验并追加 journal seq 4。目标 receipt SHA `1f4ceeea…`、输入 SHA `c2bffa80…`、runner SHA `271cc3a0…`，清理为 `OWNED_PROCESSES_AND_TEMPORARY_INSTALL_REMOVED`。该回执不证明真实模型/业务、供应链、生产身份、activation 或 release readiness；详见[当前组合 terminal 目标验收](../hackathon/evidence/shinemage-composition-terminal-target-20261013.md)。

对用户授权的真实入口 `https://app.tyuan.chat/` 做了只读 headed browser 观察：Aside 在桌面、平板和移动 viewport 都能打开入口，等待组合 bundle 加载后显示工作台导航与工作区内容，控制台错误为空。该观察只记录 live shell 的可达性，不接入 composition journal，也不替代 candidate-bound browser、standalone、读屏、完整键盘焦点或高对比度验收；当前键盘观察只到未登录 modal 的局部焦点行为。详见[授权生产入口 live browser 观察](../hackathon/evidence/shinemage-live-browser-20261013.md)。

2026-10-13 真实 UAT 已分层实跑：live Aside 的 WeKnora 只读检索与来源观察、CRM 聚合看板重试加载均有记录；工作台标准模式没有暴露 `query_crm_dashboard_gsv`，模型未执行替代调用。隔离 candidate 中用户手工保存 DeepSeek provider 凭据并绑定 CRM 当前对话后，真实模型、WeKnora 只读检索和 CRM GSV 7/7 日结构化查询通过；保存、权限失败、恢复和人工业务复核仍 `NOT_RUN`。详见[真实模型、WeKnora 与 CRM UAT 实跑](../hackathon/evidence/shinemage-real-business-uat-20261013.md)和[候选真实 UAT 证据](../hackathon/evidence/shinemage-m2-06-candidate-real-uat-20261013.md)。

## 当前 PR #121 合并后与 Cordis 对接验证（2026-10-12）

本节先记录 PR #121 合并后的当前事实，再保留 PR #120 等合并前门禁作为历史对象。[PR #121](https://github.com/tyuanww/fuqing-crm-analytics/pull/121) 已普通 merge 到 `b47cf9baf328921041dfaff3e289a2af4323e1d0`；[合并后 main CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38224409545) SUCCESS。四个适用 job 成功，五个路径矩阵 job SKIPPED；B0 862 PASS／41 subtests PASS，23 warnings 保留。合并提交、feature head、artifact digest 与本地工作树边界见[PR #121 合并后证据](../hackathon/evidence/shinemage-pr121-postmerge-20261012.md)。

本轮旧正向 host verifier 夹具只校准为精确 Cordis `4.0.4`，原拒绝和 journal 断言未改。五文件同次命令：`node --test --test-concurrency=1 scripts/release/plugin-host-evidence.test.mjs scripts/crm-calibration/profile.test.mjs scripts/crm-calibration/profile-packs.test.mjs scripts/crm-calibration/composition-inputs.test.mjs scripts/ci/composition-pack-inputs.test.mjs`，68 PASS／0 FAIL／0 SKIP；不与此前四文件 42 或作者测试相加。核心及本机独立审查无发现，外部 Claude/OCR NOT_RUN。

当前三份作者仓 formal pack 已绑定到组合锁后，可用 `node scripts/ci/composition-pack-inputs.mjs --input-dir /absolute/input-dir --output /new/private/composition --python /absolute/python3.14` 生成九包、两 profile 的固定输入。2026-10-12 的实际回执 exit 0，锁摘要 `be215557…`，原始证据见[当前正式组合输入预检](../hackathon/evidence/shinemage-composition-preflight-20261012.md)。该命令只验证输入身份和摘要，不启动宿主或业务服务；candidate 生成需显式 service binding/evidence，并已在当前登记链中完成。

M2-01 已增加组合 candidate 合同入口：`pnpm dsh plugin composition-candidate --crm-inputs /absolute/crm-inputs.json --page-inputs /absolute/page-inputs.json --service-binding /absolute/service-binding.json --service-evidence /absolute/service-evidence.json --output-dir /new/private/composition-candidate --state-path /absolute/composition-journal.json`。该入口只接受两份已核验 profile-pack 输入，绑定九个正式包和 service compatibility gate，并将 source HTTP、terminal、browser、recovery、activation 全部保持 `NOT_RUN`；缺 service binding/evidence 时在写 candidate 或 journal 前失败。合同和当前未执行边界见[组合 candidate 合同证据](../hackathon/evidence/shinemage-composition-candidate-contract-20261012.md)。

组合 archive 由暂存提交 `e9bfc776` 的[真实上传 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38218001878)生成，ID `11732716479`、SHA-256 `552aa4d122aa84418c6874798fef7c6024f5052ee8c331535036d5f85a5ea486`、704587 bytes；18 成员、九包／两 profile 验证通过，有效期至 `2026-10-26T07:29:17Z`。三项非敏感变量已更新并回读，专用只读 Secret 已配置且值不入库。PR #121 attempt 2 的 hosted B0 实际 SUCCESS：862 passed、23 warnings、41 subtests；首次旧 artifact 摘要失败保留。使用实际 archive 或 GitHub ID／digest，禁止用本机自制 ZIP 冒充 CI 工件；所有消费输出须用新独占目录，不复用前两轮失败输出。原始日志与接收回执见[PR #121 正式组合交付](../hackathon/evidence/shinemage-pr121-formal-pack-delivery-20261012.md)。

默认两份源 profile 均无 `service_binding`；当前主仓已登记 page 绑定的正式 candidate 快照，CRM 快照按组合合同无绑定，journal seq 1–5 含 source HTTP、terminal 和 browser。绿色 PR/preflight 与 main CI 已证明对应 Git/CI 检查通过，不证明真实业务或 SDK 分发通过；本地 feature 工作树仍与 main 分开，具体状态以 STATUS 和合并后证据为准。下节保留合并前本地应用／提交时点。

## PR #119 合并与 Cordis 本地对接（2026-10-12，历史时点）

主仓 PR #119 已合并到 `5943d4be`，[main CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/38151751342) SUCCESS：后端 3235 PASS / 80 SKIP / 0 FAIL / 0 ERROR、12 JUnit 无重复，B0 Python 862 PASS / 41 subtests PASS。主仓 CI Python 为 3.14.8；本轮本地固定 Python 仍为 3.14.4。合并前 QA 的三个影响组单列，不能与 main 或作者 CI 相加。详细记录见[本轮证据](../hackathon/evidence/shinemage-cordis-formal-cutover-proposal-20261012.md)。

CRM `ceeff996`、Knowledge `22daa108` 的新 Ubuntu CI 完成严格类型检查、构建、本包测试和内容打包。两份普通 CI 包外层摘要不同于本地包，成员字节一致；当前正式 pack 由新 CI lib 与干净固定提交的 manifest/声明资产通过原 producer 生成，reader 读回成功，重复输出拒绝，未重编 SDK。正式回执 `4be65420…` / `1ce746b6…` 与精确 `4.0.4` 守卫/组合锁一致对接，不继承旧 candidate/journal、headed 或 WSL 回执。

受影响入口：`node --test --test-concurrency=1 --test-reporter=tap scripts/crm-calibration/profile.test.mjs scripts/crm-calibration/profile-packs.test.mjs scripts/crm-calibration/composition-inputs.test.mjs scripts/ci/composition-pack-inputs.test.mjs`。13 路径授权应用后在实际主仓同次 42 PASS / 0 FAIL / 0 SKIP；九包/两份原 profile 实际准备 exit 0，19 项指定源码负对照 EPERM，重复输出 EEXIST 且首次字节不变。固定 pnpm 11.28.2 与 Python 3.14.4 必须可达，结果根不得复用。该组只验证受影响守卫和包装配，不是最新完整 B0 或新 hosted CI；隔离提案的同数结果保留，不累计。

当前正式 CRM/Knowledge 两包另在官方 npm 宿主完成三进程、18 项断言，exit 0：原生鉴权、CRM/Knowledge preset 的未运行合成会话、服务未配置的 CRM 状态、官方卸载后原生壳保留会话且路由 404、重新注册后的路由和 preset 恢复。七项主仓／作者／旧安装包／合成凭据夹具负对照 EPERM，仅 localhost 网络，实例与 4328 端口均回收。复用既有官方 npm 安装的 26544 个文件／符号链接同字节副本，剔除旧插件，再用官方 `dsh plugin --profile web add link:<已验证正式包解包根>` 注册；实际解析 dsh-tools `0.1.7-rc.2`、Cordis `4.0.4`。任意目录仅解包不能替代注册；缺注册的 r1/r2 启动失败、旧包遮蔽及 CLI／记录器错误原样保留，成功轮为 r7。它不是新 npm 冷安装、完整九包运行组合、browser 或正式 candidate/journal 回执。具体命令、输入和失败见[本轮证据](../hackathon/evidence/shinemage-cordis-formal-cutover-proposal-20261012.md)。

本次主仓代码／组合锁已本地提交为 `2b98baaa`（8 路径），5 份说明／证据随独立 docs 提交交付；未推送。旧主仓汇总 artifact 不包含新两包；新 hosted CI 前须真实上传并核验汇总工件，不能改变量指向本机 ZIP。当前正式组合服务/目标/terminal/browser/恢复与真实业务仍未关闭；上述未连接宿主恢复不抵扣带服务的正式恢复链。SDK 分发 BLOCKED、PARTIAL、release_ready=false。

## PR #119 合并前交付检查（2026-10-11，历史）

本轮代码、测试、CI 接线与证据已按目的分组提交，当前说明最后同步；逐组提交、原始输入及检查范围见[本地交付索引](../hackathon/evidence/shinemage-main-local-commit-closeout-20261011.md)与[机器记录](../hackathon/evidence/shinemage-main-local-commit-closeout-20261011-validation.json)。代码／边界 HEAD `d36c567e`、证据提交 `39774244`；Workbench `6c5adc9f`／`0af61dab…`、CRM `c4b1c91e`／`4663cce0…` 为当前正式包来源。下方“未提交”“两锁未应用”和历史 B0 计数保留当时范围。

| 当前检查对象 | 本轮实际检查 | 证据边界 |
|---|---|---|
| profile／CRM／知识／Workbench／叶子包 | 当前公开包与 HTTP／React／JSDOM 消费、来源拒读和缺输入守卫分别通过 | 合成消费，不是完整宿主／浏览器或真实服务验收 |
| 公共合同读取与执行 | 守卫 28 PASS；当前代码另实际执行 17 个生成器／测试组，全部 exit 0 | 固定三仓合同输入；旧正向证据因代码不同未复用 |
| 正式 release 包装配／接收／服务门禁 | 53 项合成回归通过；对应 workflow 断言 1 项单列 | 没有实际发布、生产激活或新 candidate |
| 组合准备 | 9 项准备守卫；实际九正式包／两 profile 在新独占输出中 exit 0 | 只复制已验证运行字节，不执行包代码 |
| CI 接线与路径选择 | 实际 pipeline 坏输入 28 项、共享路径 pytest 34 项分别通过 | 非全量 pipeline，也不是远端 CI |
| 静态边界 | 既有生成器核对通过、12 项边界测试通过 | 不代表运行时全面无源码依赖 |

各组计数不相加。上述表保留分组源码检查范围，追加 worker 修复另按六文件 129 PASS、正常 hooks 当前完整后端 3237 PASS / 78 SKIP / 0 FAIL 记账；12 JUnit 没有重复。`de196938` 完整主仓 B0 `--check` exit 0，作者私有 core 归固定作者 CI，OCR 不调用外部模型。主仓已推送到 PR #119、main 祖先同步已完成；专用 Secret 实跑与四类私有 receiver 已通过，`fc46b243` 主 CI attempt 2 SUCCESS。后续 `f1f1d500` preflight 因 gh 的相对状态文件 FAIL；`f861a895` 修复后，`fe7cc54d` hosted 的 git-clean、上游准备与 runtime 创建实际 PASS，随后扫描三处模拟值失败。`5102d7ad` 只修正测试值，相关单次合跑 83 PASS / 0 FAIL / 0 SKIP，scanner 不变；新 head 的 hosted 结果按实际 PR checks 核对。当前组合 candidate/journal、目标／真实业务与模型验收仍未执行。最新输入、修复和失败见[本轮接续](../hackathon/evidence/shinemage-pr119-ci-secret-reconnect-20261011.md)，此前成功与失败按原对象留存。

本地 Git 交付先检查任务范围和暂存区；任务外 `security-audit-skill/` 不检查、不纳入提交，允许其独立留存。随后按实际授权推送 feature 分支、更新对应 PR，利用现有共享路径选择执行适用 CI；PR 审查修复以追加提交交付，获合并授权后完成适用 QA 和实际门禁。不要用旧文档 PR 的绿色结果替代新源码检查，也不要为“清洁”删除证据或改写共享历史。

私有正式组合工件已由实际上传 CI 生成，ID `11704150412`／SHA-256 `a98624139eb9dca81bc97ec02bdb9a7eeb756c27863e35634f68fc1dcc266371`；18 成员与原输入一致，真实 receiver 核对九包／两 profile，主仓三项 artifact variables 已配置。主仓专用 `SHINEMAGE_PLUGIN_READ_TOKEN` 已由用户保存，四仓输入在真实 runner 上读取成功；不读取 Token 值或复制个人 gh 登录。组合接收器的 gh 子进程保持受限环境，配置与状态都使用本次独占临时目录，避免 `.local/state/gh/device-id` 污染 checkout。相关固定输入回归入口为 `composition-pack-inputs.test.mjs`、`workbench-author-evidence.test.mjs`、`domain-author-evidence.test.mjs`、`public-contract-inputs.test.mjs`，须沿 pipeline 提供对应的固定 archive/合同/Python 输入，裸跑不代表完整覆盖。工件 10 月 25 日到期，之后须真实上传、核验新 ID/digest，再改变量，不能用过期 ID 或本机 ZIP 替代。

此前三路径应用时点（保留原记录）：

2026-10-11 三路径审修后已应用：当前锁绑定 Workbench `6c5adc9f` / `0af61dab…`、CRM `c4b1c91e` / `4663cce0…`。应用后实际主仓的 `workbench-author-evidence.test.mjs` 为 13 PASS；`competition-offline-eval.test.mjs` 为 1 个 Node 测试内 30/30 合成用例；`workbench-main-contracts.mjs` 三组分别 1/1/3 PASS，后两组仍读取旧源码。9 包/2 profile 准备及同来源 CI 绑定 exit 0，三个指定来源拒读 EPERM；空集和错误 planner 的拒绝负测留存。155/1086 是固定作者 CI 回执读取，不是本轮重跑；本轮完整 B0、新 CI、当前 candidate/宿主/业务未执行。实际固定命令、输入、沙箱范围与日志见[本轮记录](../hackathon/evidence/shinemage-three-path-main-application-20261011.md)；下方“两锁未应用”只指先前准备时点。

合并后先刷新主线事实，再选择验证范围：

```bash
gh api repos/tyuanww/fuqing-crm-analytics/git/ref/heads/main
gh run list --repo tyuanww/fuqing-crm-analytics --branch main --limit 5
git fetch origin main
git merge-base origin/main HEAD
git diff --name-status "$(git merge-base origin/main HEAD)" HEAD
```

`origin/main` 是远端主线快照，当前本地 feature 分支的 `HEAD` 可能只是它的祖先；不要把本地 `HEAD` 当成已合并主线。远端 CI 的 `success`、插件仓的 fixed-inputs CI、主仓的合并检查、candidate journal 和目标宿主回执分别记账；一个层级的绿色结果不能替代另一个层级。

## 先按变更类型选验证

以下迁移进度为本轮分组提交前各步记录；当前检查状态见本页“当前本地交付检查”。后续命令仍按变更类型与输入选择，不因历史全量通过就跳过新的受影响检查。

主仓公共合同入口已按授权应用 12 路径，并修复重复终止进程组造成的错误覆盖；新入口隔离完整 B0 r2 exit 0：Python 855 PASS / 41 subtests PASS、23 warnings 保留，Node 27 组各自 0 FAIL / 9 次跳过。原 15 个生成器和 C0 hash 未改，主仓实际字节的守卫 28、路径 pytest 34、槽位 4、主题负测／漂移 2 分别通过，OCR 可审 11/11 与排除测试人工 1/1 已审，无开放发现。旧失败保留，主仓未提交，新 hosted CI 和当前组合准入未执行。见[本轮应用与实测](../hackathon/evidence/shinemage-public-contract-main-cutover-20261011.md)。

最新作者 Workbench 6c5adc9f、CRM c4b1c91e 的正式 pack 已在隔离目录生成、读取并逐成员核对；回执分别为 0af61dab…、4663cce0…。主仓运行包／作者证据锁仍是原绑定，9 包／2 profile 的两锁前移提案已经验证但未应用；不继承旧 candidate/journal 或宿主验收。见[最新来源正式包及下一提案](../hackathon/evidence/shinemage-current-author-formal-packs-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

最新来源正式包的原公共组合已实际运行：9 PASS / 0 FAIL / 0 SKIP，18 个指定来源负对照 EPERM，运行前后 198 个受保护文件未变、自有进程组已退出；合成 HTTP 和官方 resolver 层级，不代表严格 peer／完整宿主或正式准入。两锁提案 OCR delegate 2/2 已审，无开放发现，主仓 apply --check exit 0，但仍未应用。主仓 PR #119 的已有 B0 是 SKIPPED，当前 dirty CI 未执行；见[本轮组合与两锁审查](../hackathon/evidence/shinemage-latest-formal-combination-20261011.md)。

此前合同入口隔离提案准备时点（保留原记录）：

主仓公共合同消费者已形成 12 路径隔离提案，尚未应用：固定三仓真实 CI 的 31 份材料，保留原 15 个生成器与 C0 hash；原生成器 15 次 exit 0，槽位 4 项、主题负测／漂移 2 项、守卫 28 项、路径 pytest 34 项分别通过，34 个指定来源负对照 EPERM。OCR 可审 11/11 与排除测试人工 1/1 已审，失败保留；提案对当前 dirty 基线 apply --check 通过。新主仓入口完整 B0／CI、candidate 与业务准入仍 NOT_RUN，旧副本及保留源码守卫不删。见[提案与真实日志](../hackathon/evidence/shinemage-public-contract-main-cutover-proposal-20261011.md)。

此前合同作者交付时点（保留原记录）：

三个作者仓的合同导出已提交推送，当前真实 Ubuntu PR CI 和 31 份工件来源均核对通过；Workbench/CRM 的 CI 字节码污染由单路径修复关闭，失败保留。原 15 个生成器在旧插件资料拒读下 15/15 exit 0，原槽位 4 项与主题负测/漂移 2 项各自通过，私有行为保留在作者检查。主仓新合同入口和锁尚未切换，旧副本与静态边界继续保留；不继承正式包、candidate/journal 或真实业务准入，PARTIAL / SDK 分发 BLOCKED / release_ready=false。 见[合同材料的实际作者交付](../hackathon/evidence/shinemage-generated-contracts-owner-delivery-20261011.md)。

主仓领域默认入口已按授权应用完整 r2（18 路径）：以领域作者 `e78e040e` / 真实 Ubuntu PR CI `38121126913` 核对来源和实际覆盖，保留三份显式 legacy，不再在此阶段重建领域源码或执行私有几何。已应用 r2 的隔离完整 B0 r4 exit 0，Python 855 PASS / 41 subtests PASS（23 warnings 保留）；Node 26 组各自无失败，9 次跳过保留原因。前三轮缺输入与预检 PATH 失败原样保留；随后仅清理两份文件末尾空行，语法和差异检查通过。主仓还有 15 个源码合同生成入口、保留合同/缺输入守卫及静态边界扫描，旧副本不删；新主仓 CI、当前候选/真实业务未执行，代码文档未提交，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[本轮应用与完整验证](../hackathon/evidence/shinemage-board-components-main-cutover-20261011.md)。

此前 Workbench 几何对接时点（保留原记录）：

私有几何 `e9223289` 的实际 CI（155 文件 / 1086 PASS）已关联到新正式回执 `871fd3bb…`；当前两锁和三路径已本地应用。应用后当前 reader 13 PASS、几何 1 PASS，九包准备 CLI 和来源/回执/tar/CI 实际绑定 exit 0；20 项列明源码负对照 EPERM，旧 CI 和漏几何重封存夹具被拒绝。这些是定向验证，不是本轮新完整 B0、主仓 hosted CI 或组合准入；外部审查及历史失败状态未改。见[实际命令与输入](../hackathon/evidence/shinemage-workbench-geometry-main-bind-20261011.md)。


上一轮领域作者交付与迁移提案准备时点（保留原记录）：

领域作者本次真实 Ubuntu PR CI `38121126913` 绑定干净提交 `e78e040e`：准备守卫 4 tests/OK、记录守卫 5 PASS、几何 28 PASS、producer/输入 6 PASS，分组各自 0 FAIL / 0 SKIP。实际 artifact 的 API digest、30 个 Git 来源文件、回执命令与 4 个原日志、原封存 `22245ab9…` 和本次构建 `66d53381…` 分别核对通过。来源回执保留 job 内 NOT_VERIFIED_BY_JOB，由独立 run/jobs API 确认 SUCCESS；主仓入口迁移/新完整 B0/主仓 CI 未执行。见[当前命令和原始输入](../hackathon/evidence/shinemage-board-components-ci-ownership-delivery-20261011.md)，[本地提案及失败](../hackathon/evidence/shinemage-board-components-ci-ownership-proposal-20261011.md)保留。 下一步已形成[18 路径完整隔离提案](../hackathon/evidence/shinemage-board-components-main-cutover-proposal-20261011.md)：公开消费 8 项、证据守卫 15 项、保留合同 2 项和路径参数 3 项各自通过，21 个指定来源负对照 EPERM；OCR 可审 17/17 与排除测试的人工审查完成。r2 补丁对当前主仓 --check 通过，尚未应用，完整 B0/新主仓 CI 未执行；此前四路径读取提案保留准备时点，不叠加。

board-components 本次真实 Ubuntu PR CI `38119670295` 绑定 source `d5aacdb4`：Node 24.19.0、Python 3.14.4、pnpm 11.28.2，几何 28 PASS / 0 FAIL / 0 SKIP、producer/输入 6 PASS / 0 FAIL / 0 SKIP、准备守卫 4 tests / OK。下载 artifact zip 与 API digest 相等，1951 字节领域包 `66d53381…` 的五个成员等于原封存；不累计本地 clone、push CI 或旧几何数字。主仓旧生产者另跑受影响 `package-inputs`：13 PASS / 0 FAIL / 0 SKIP，四输出符号链接拒绝回归包含其中，OCR delegate 2/2 已审。主仓源码仍未提交，完整 B0/新 CI、领域入口迁移及组合准入未执行；独立 tsc 仍 NOT_IN_CURRENT_BUILD。见[CI 原始回执](../hackathon/evidence/shinemage-board-components-remote-ci-20261011.md)、[防覆盖验证](../hackathon/evidence/shinemage-board-components-main-output-guard-20261011.md)。

上一轮领域本地 Git/clone 交付时点（保留原记录）：

board-components 现已从首次提交 `3855db80` 做真实 `--no-local` clone 并实跑本地配方：producer/输入 6 PASS、几何 28 PASS、准备守卫 4 tests，各自 exit 0；冻结离线安装、固定输入、build 与 5 成员核对均 exit 0。17 项列明源码负对照为 EPERM，包仍为 1955 字节 `22245ab9…`；安装链接只指向 clone 内。Ubuntu/GitHub CI、主仓迁移及独立 tsc 未运行。精确命令与日志见[领域 Git/clone 验证](../hackathon/evidence/shinemage-board-components-owner-git-delivery-20261011.md)。

上一轮领域提案准备时点（保留原记录）：

board-components 的本地 CI 配方在列明源码与网络拒绝条件下复核：几何 28 PASS、producer/输入 5 PASS，最终准备守卫 4 tests 无失败；28 产品路径中原八份 manifest/代码/类型/夹具未变。包 1955 字节、5 成员、`22245ab9…` 同字节；准备只下载固定 pnpm，之后离线，不构建 DSH/SDK。Ubuntu CI、Git clone、主仓迁移和独立 tsc 未执行。入口、精确命令及坏输入保留见[领域验证记录](../hackathon/evidence/shinemage-board-components-owner-proposal-20261011.md)。

四插件隔离当前已消费固定正式归档：九份业务源码、九个作者仓、上游与 build-tools 拒读时 4 PASS / 0 FAIL / 0 SKIP，20 项负对照均 EPERM。公共包行为另跑 29 PASS / 0 FAIL / 0 SKIP，保留 SDK 和合成 HTTP 的明确范围；六项坏输入及 pipeline 目录复用拒绝另记，不累计。当前命令见[固定包隔离验证](#固定包隔离验证2026-10-11)，失败沙箱和当前 r2 证据见[本轮记录](../hackathon/evidence/shinemage-fixed-pack-isolation-20261011.md)。最新完整 B0、主仓 CI、宿主/candidate 和真实业务仍未运行。

上一轮执行记录（installed-kit 默认迁移；历史隔离当时尚未关闭）：

installed-kit 默认入口已迁到当前 kit 和固定正式包：列明九份主仓业务源码及九个原作者仓拒读条件下，两入口同次 13 PASS / 0 FAIL / 0 SKIP；实际离线安装、严格合成编译、九包开发声明及三份领域锁都执行。相邻合同另跑 24 PASS，五项坏输入拒绝及 pipeline 已有结果目录拒绝单列，不累计测试数。当前命令见[kit 与固定包验证](#当前-kit-与固定包验证2026-10-11)，原始命令、失败和边界见[本轮记录](../hackathon/evidence/shinemage-installed-kit-pack-ownership-20261011.md)。本轮完整 B0、新 CI、宿主/candidate/真实业务均未运行。

上一轮执行记录（正式 preflight 包装配；下列验证只覆盖该轮字节）：

正式 preflight 与 release 已改为验证固定正式包输入；当前七包源码拒读装配通过；接收端绑定由合成实际打包/接收测试验证。release 测试入口实际 539 PASS；随后仅 workflow 触发修订的 41 PASS、路径/runner 的 82 PASS 分开记录。实际只读 `preflight --check` 的 plugin-packs 通过，整体 exit 2 / BLOCKED：工作树未提交且 runtime bundle 缺失，不把此结果报整条 preflight PASS。完整 preflight、本轮最新完整 B0、新 hosted CI、当前 candidate/服务/目标/browser 仍 NOT_RUN。具体输入步骤见[正式 preflight 的固定包输入](./shinemage-plugin-update.md#正式-preflight-与-release-的固定包输入)，原始命令与失败留存见[本轮证据](../hackathon/evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

上一轮执行记录（Workbench core 归属迁移；其完整 B0 只覆盖当时字节）：

Workbench `d038f357` 的成功完整 CI 各自为 154 文件 / 1072 PASS，已用于生成正式回执 `9d7f6bf3…`；tarball `e41df9f5…` 与前轮同字节，当前组合锁 `89e2b2ea…`。主仓本地 B0 已改为校验固定作者 core archive、正式包身份及公开消费者，三组原业务检查分别 1/1/3；r3 exit 0，Python 855 PASS / 41 subtests PASS、Node 24 组无失败、9 次 opt-in 跳过。22 条 Python warnings 和 stderr SQLite finalization 警告原样保留；路径/runner/workflow 82 PASS、archive 守卫 13 PASS 分层记账。r1/r2 失败与最后元数据/CI 选择调整分别记录；新 hosted CI、formal preflight 源码迁移、当前 candidate/服务/目标/browser 仍未关闭。前轮 tarball 宿主结果不重标新身份。实际命令、输入和边界见[本轮证据](../hackathon/evidence/shinemage-workbench-core-formal-main-ownership-20261011.md)。

以下接续段保留较早执行时点；其中旧来源、未执行和未提交结论按各自证据对象理解，当前入口与身份以本节最前面的最新记录为准。

精确 Cordis `4.0.4` 的隔离修订普通包现已通过官方 npm 宿主的开启、原生关闭、恢复三进程验证：原生鉴权、合成会话保留、关闭时 CRM 路由 404、恢复后 200 且未连接。新 home/workspace、localhost 沙箱及自有进程清理均核对；旧正式包、原作者仓和 candidate/journal 不变，不能抵扣真实服务/模型或正式准入。r4 同次 16 项断言 exit 0，r3 不相加。输入、实际 CLI 命令、两轮 harness 失败及清理见[本轮记录](../hackathon/evidence/shinemage-corrected-npm-host-20261011.md)。

Cordis 精确 `4.0.4` 的隔离修订现有实际严格 npm 锁解析、`npm ci --ignore-scripts --strict-peer-deps --strict-ssl=true` 和四个普通 Node 入口导入回执，三条可用补丁均 apply-check 通过。作者构建/各组测试和主仓配套合同 41 项分别记录；原仓、封存包与正式准入不变。命令、输入摘要、沙箱失败留存、OCR delegate 审查范围及应用前置条件见[提案证据](../hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。

当前 Cordis 严格解析补查使用独占根 manifest 和 npm `11.17.0` 的 `install --package-lock-only --ignore-scripts --strict-peer-deps --strict-ssl=true`，三个 r2 命令均 exit 1 / ERESOLVE，分别核对实际 Found 与冲突 peer owner；未执行实际安装。官方固定 DSH/dsh-tools 要求 `~4.0.4`，CRM/Knowledge 声明精确 `4.0.2`，不能用 linked 初始化关闭这一层。r1 证书失败与 r2 包装日志分类问题保留，readback 只读当次 debug；命令、摘要及 CA 来源见[证据](../hackathon/evidence/shinemage-cordis-strict-peer-20261011.md)。

当前迁移字节的完整本地 B0 已在独立 Python 3.14.4 上执行 `node scripts/dsh-b0/pipeline.mjs --check --python /absolute/b0-python3.14`：r2 exit 0，Python 855 PASS/41 subtests PASS，Node 23 组均 0 FAIL；十次 opt-in/standalone 跳过逐条留存，不计为通过。三项 CRM_COMPOSITION 固定输入及新的输出根沿用下述准备器；上游 TypeScript/Vite 与固定 build-tools 已准备，Corepack 版本检查禁网通过。Python 必须满足 `scripts/dsh-b0/requirements.lock` 的 25 个精确版本，不能用其他服务环境替代；本次未改系统依赖。r1 的 inventory drift 失败、生成器差异、实际命令/日志和清理范围见[回执](../hackathon/evidence/shinemage-current-b0-closeout-20261011.md)。这不覆盖 --audit、新 hosted CI、正式候选或真实模型/业务；较早阶段的 B0 NOT_RUN 保留为历史。

主仓 profile 生成器测试现维护于 `scripts/crm-calibration/profile.test.mjs`。默认 B0 对应组为 `node --test scripts/crm-calibration/page-composition.integration.mjs scripts/crm-calibration/knowledge-composition.integration.mjs scripts/crm-calibration/profile.test.mjs`；需下述固定两包/七包输入和新的独占输出根。源码拒读下 14 PASS / 0 FAIL / 0 SKIP，其中五项为原 profile 断言；旧 `dsh-plugins/crm-knowledge/test/profile.test.mjs` 仍可转发，兼容重跑的五项不计新增覆盖。历史命令按运行时路径保留。原始日志、断言摘要及未执行项见[测试迁移记录](../hackathon/evidence/shinemage-main-profile-test-ownership-20261011.md)；完整 B0 和新 CI 未跑。

CRM/Knowledge 的包消费入口是 `scripts/crm-calibration/crm-package.integration.mjs` 与 `knowledge-package.integration.mjs`，使用同一固定两包输入和新的 `CRM_COMPOSITION_OUTPUT`。原公开断言正文保留，源码拒读下同次 11 PASS；包/profile 守卫 67 PASS、原知识/page 公共组合 9 PASS 分别通过。默认 B0 不再重建这两份本仓源码或运行作者私有 transport/graph/relay；这些文件与作者仓同字节，仍在各自 CI。缺输入、防复用、首次夹具失败及未执行范围见[迁移记录](../hackathon/evidence/shinemage-crm-knowledge-package-consumers-20261011.md)。Workbench 源码阶段和完整 B0/新 hosted CI 尚未关闭。

固定 CRM/Knowledge 两包的官方安装与初始化现有本机补查：沿用 `crm-knowledge-rc2` 和正式包，官方 CLI 两次 add 均 exit 0，resolver 两次导入成功，后续宿主/preset 六项检查通过。实际 Cordis `4.0.4`，声明仍 `4.0.2`，linked peer 警告保留；r1 因错误调用 Context 清理 API 退出 1，r2 只接续宿主，不重跑安装。明确范围及原始命令见[补查记录](../hackathon/evidence/shinemage-crm-knowledge-host-compat-20261011.md)，不能抵扣完整兼容、真实服务/模型或 candidate 准入。

Workbench 的内部 Host/skills、未发布视图、原生通道授权和页面交付检查在作者仓执行：固定绝对上游、build-tools、领域输入及 pnpm 入口准备好后，在该仓根运行 `node scripts/check-inputs.mjs`、`node plugin/build.mjs "$B0_BUILD_UPSTREAM" "$B0_BUILD_TOOLS"`、`node scripts/run-package-tests.mjs`。当前入口纳入六个既有作者文件；隔离 Linux 完整入口同次 30 文件、212 PASS / 0 FAIL / 0 SKIP，已包含新两文件的 8 项，边界 5 PASS 另记。SDK 输入沿用前轮锁与本地已准备闭包，不能写成全新 SDK 安装或远端 CI。主仓仍保留七个旧生产者入口，作者提交和 CI 交付后再迁移重复执行；当前见[作者测试补齐](../hackathon/evidence/shinemage-workbench-author-tests-closeout-20261011.md)，前轮 204、输入保护与锁扩展见[历史记录](../hackathon/evidence/shinemage-workbench-producer-ownership-20261011.md)。

| 变更 | 先跑什么 | 不自动扩大到什么 |
|---|---|---|
| 一个独立插件 | 插件仓自己的 frozen install、build、包级测试、内容摘要和边界负测；主仓只跑受影响合同，并核对 profile/allowlist → pack SHA → candidate/journal 链 | 不重建 DSH、不迁移数据库、不把插件测试写成生产或全量 SDK 通过 |
| DSH pin、host、profile 或跨插件合同 | 固定上游的 B0、host/合同矩阵、candidate 输入和相应 CI | 不继承旧包、旧 WSL/浏览器回执或浮动 `latest` |
| 服务/API/权限合同 | 服务包与兼容窗口、权限/幂等/回放和受影响插件组合 | 不读取真实 DuckDB、不连接杭州或 WeKnora 生产 |
| 仅文档/证据 | 差异、链接、当前 SHA 和未执行项检查 | 不用旧 PASS 数替代当前运行 |

插件日常更新和 DSH 升级是两条变更轴，完整顺序见[维护、清理与升级手册](./shinemage-maintenance-and-cleanup.md)。SDK 分发审计只在实际触及 SDK 分发或适用发布门禁时执行，不作为每次单插件更新的前置条件。

## 单一检查定义

2026-10-11 的本地 CRM/知识 profile 包输入迁移使用 `node --test --test-concurrency=1 scripts/crm-calibration/profile-packs.test.mjs dsh-plugins/crm-knowledge/test/profile.test.mjs scripts/release/profile-packs.test.mjs`，38 PASS / 0 FAIL / 0 SKIP；release 的 pack/candidate/host 结构回归另有 58 PASS，不相加为总体通过。真实两包的配置准备在禁网、主仓业务源码与原作者仓拒读条件下通过，未启动服务/宿主，没有新的 candidate 或 journal。命令、失败留存和输入摘要见[本轮证据](../hackathon/evidence/shinemage-crm-profile-pack-migration-20261011.md)。新测试已登记到 B0 pipeline；本轮完整 B0 与新字节的远端 CI 未运行。

`scripts/ci/pre_push_path_class.py:verification_plan` 定义互相独立的 backend/B0/frontend/tooling/dependencies/deployment 维度，依赖审计细分为 python_dependencies/frontend_dependencies，另有 ground_truth 与 filterbuilder 触发轴；`scripts/ci/run_checks.py` 生成并执行命令。本地 pre-push、PR 的 Python/Vue/B0 检查共用它；PR CI 只通过 `lint.yml` 调用一次 `check-plan.yml`。`dsh-b0.yml` 仅 `workflow_dispatch` 做空机器 `--prepare`。B0 的本地与 CI 构建始终调用既有 `scripts/dsh-b0/pipeline.mjs`。`merge-gate` 在路径计划失败或已选 job 失败/取消时阻断；skip 不算失败。分支保护属于远端配置；2026-09-09 核验已包含 `b0-contract-build` 和 `merge-gate`，本轮不调整必需检查。

本地固定包供应使用 `node scripts/ci/composition-pack-inputs.mjs --archive /absolute/composition-packs.zip --output /new/private/composition --python /absolute/python3.14`，随后使用回执中三项环境变量跑公共合同组合或 B0。缺输入、旧结果目录和摘要漂移在源码构建前失败。新准备器的坏输入/归档/权限守卫已登记到 pipeline；本轮五文件合同检查 54 PASS、tooling 路径轴 189 PASS、准备后公共合同组合 9 PASS 分开记账。三个 hosted workflow 已接线，但尚无固定 artifact 和专用读取权限配置，未报 hosted CI 或完整 B0 PASS。命令及原始日志见[CI 包输入证据](../hackathon/evidence/shinemage-ci-pack-inputs-20261011.md)。

Workbench 工具卡/取消/保存/首购/资产弹层及原生 prompt 注入的客户端消费组现在可运行：

```bash
node --test --test-concurrency=1 scripts/dsh-b0/workbench-client-pack.integration.mjs \
  scripts/dsh-b0/workbench-tool-cards.integration.mjs scripts/dsh-b0/workbench-query-cancel.integration.mjs \
  scripts/dsh-b0/workbench-query-save.integration.mjs scripts/dsh-b0/workbench-asset-overlay.integration.mjs \
  scripts/dsh-b0/workbench-first-purchase-card.integration.mjs scripts/dsh-b0/workbench-first-purchase-save.integration.mjs \
  scripts/dsh-b0/workbench-query-fault.integration.mjs \
  scripts/dsh-b0/workbench-native-prompt.integration.mjs
```

沿用上述固定 page 包输入、绝对上游/Python 和新的结果根。九个消费 scope 均不可复用，pipeline 预检覆盖全部目录；新增 `workbench-native-prompt` 使用实际固定 Cordis `4.0.4`。九入口同次实跑 66/0/0，输入/九 scope 守卫 18/0/0 分开记账。前轮八入口 56、相关回归 105 和源码检查 4 保留在[历史接续](../hackathon/evidence/shinemage-workbench-consumer-contracts-20261011.md)，不重复相加。SSR/JSDOM/合成 RPC/fake fetch 不属于完整宿主、Chrome、真实会话或正式服务；来源、原断言和失败修复见[原生 prompt 消费记录](../hackathon/evidence/shinemage-workbench-native-prompt-pack-20261011.md)。

Workbench 发布客户端消费入口为 `node --test --test-concurrency=1 scripts/dsh-b0/workbench-client-pack.integration.mjs`。复用上述准备回执的 `CRM_COMPOSITION_PAGE_INPUTS`，设置新的绝对 `CRM_COMPOSITION_OUTPUT`、`B0_BUILD_UPSTREAM` 和 `FQ_B0_PYTHON`；`workbench-client` 子目录不得复用。12 项原 factory/生命周期检查在列明源码拒读条件下通过，9 项新增守卫及既有回归 97 PASS 分开记账。Host 入口仍在源码阶段；不代表 Chrome、原生 Settings、完整宿主或 candidate 验收。见[本轮证据](../hackathon/evidence/shinemage-workbench-client-pack-migration-20261011.md)。

叶子包消费入口为 `node --test --test-concurrency=1 scripts/dsh-b0/leaf-pack-composition.integration.mjs scripts/dsh-b0/legacy-geometry-exports.test.mjs`。使用上述准备回执的 `CRM_COMPOSITION_PAGE_INPUTS`，设置新的 `CRM_COMPOSITION_OUTPUT`、绝对 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS` 和 `FQ_B0_PYTHON`；固定 TypeScript 仅用于主仓消费公开声明。`leaf`、`geometry` 结果子目录不可复用；默认 pipeline 已检查这两个子目录并登记入口。在列明业务/作者源码拒读条件下 20 PASS / 0 FAIL / 0 SKIP，输入及既有回归 88 PASS 分开记账，负对照和失败留存见[本轮记录](../hackathon/evidence/shinemage-leaf-pack-migration-20261011.md)。这不关闭原生浏览器、完整宿主、candidate 或默认 B0 的剩余源码阶段。

同批路径矩阵的本地续跑：前端构建和 29 文件 223 单测通过，release source/archive 回归 41 PASS；backend 用既有 bounded runner 覆盖全部 298 个 synthetic-not-slow 目标，互不重叠成功组的唯一 JUnit 用例为 3223 PASS / 78 SKIP / 0 FAIL / 0 ERROR。失败组不计入成功统计。backend 运行后 ZIP helper 的 assert 改成明确拒绝，另跑最新 54 项守卫（含 `-O`）和 Ruff；backend 源码/测试未改。三次环境失败和隔离 Python 的固定 wheel 安装记录均保留。依赖审计与 Docker 是单独 CI job，本地 shared runner 不执行它们，本批仍 NOT_RUN；完整 B0 和 hosted CI 也未执行。

| 改动 | 选择与边界 |
|---|---|
| 普通文档 | 不跑业务全套；差异/引用由本次编辑验证 |
| AGENTS、自动化配置、运维/验证文档 | 入口和 hook 行为回归；CI 的 ground-truth 仍使用 committed 模式 |
| B0 插件/内核/合同 | 既有 B0 pipeline：离线合同、Python/Node、编译/装配与干净构建；含 BoardSpec 源测试。`backend/tests/test_board_spec_ask.py` 走合成 backend。无需旧 CRM 全套 |
| Vue | `npm run build`（含 vue-tsc）和 `test:unit`；品牌、App、FilterSync 共用接缝同时选择 B0 |
| 旧 CRM 实现、未知代码、ETL | 合成 backend 全套；不运行真实 ETL |
| 普通 backend 测试文件 | 选中文件；删除/改名后缺失目标扩大到全套 |
| 公共 conftest、测试支撑文件 | 合成 backend 全套；conftest 不再仅当普通单文件执行 |
| hooks/检查脚本 | Shell 语法、改动 Python 的 Ruff、实际入口/失败/选择回归；不再只检查无关 backend Ruff |
| Python 共用锁/配置 | backend + B0 与 Python 依赖审计；Vue 锁仅选择 Vue 审计，混合修改取并集 |
| Docker/部署配置 | backend + CI 容器 smoke；本地入口不启动容器 |
| CI workflow | 主 CI/共享/未知 workflow 与选择器、执行器走完整矩阵；B0 workflow 走 B0 + tooling；周检走 backend + tooling + ground-truth，旧 E2E 走 backend + Vue + tooling |

混合改动取检查集合并集。新分支比较 merge-base 至待推送 SHA，不能只看最后一个提交。`--no-renames` 保留改名前后的两个路径，避免代码移入文档目录后漏检。取差异失败保守扩大，不能按空文档变化放行。未知空范围走 backend 全套。

## GitHub Actions 精简（2026-09-09）

配置生效后，固定测试从每周 11 次降为 1 次：`nightly.yml` 改为每周一运行并吸收原周报的摘要和 90 天产物保留；删除重复的 `weekly-report.yml` 和备用 `pre-commit.yml`；旧登录 `e2e-smoke.yml` 仅手动。主 CI 与共享路径计划继续承担门禁，并按下文去重、细分审计；手动 `dsh-b0.yml`、分支必需检查和 Dependabot 配置不变。本地文件修改须合入远端默认分支后才改变 GitHub 调度。

CI 的 `lint` job 只安装从 `requirements-lock.txt` 读取的唯一 Ruff 精确版本，负责 backend Ruff 和 Agent 入口校验。`test` 使用共享 runner 的 `--only ci-python`：import 完整性只运行一次，保留相同测试目标及改动的非 backend Python lint。`ci-python` 依赖并列且必需的 `lint` job，不作为本地完整验收入口；默认和 `--only python` 仍自包含。`dependency-audit` 保留原 job 名称，以两个生态输出分别选择 Python/Node 安装及审计；混合改动两者都跑。

可选工作流按消费者收窄，仍验证其实际后端/Vue 依赖，不把所有 workflow 改动当成纯文档。主 CI、共享计划、未知 workflow 和 `pre_push_path_class.py` / `run_checks.py` 保守扩大到完整矩阵；修改这些公共入口时不能用周检的缩小范围代替完整选择。B0/后端重叠测试、main push 检查及固定上游的干净构建仍保留。

## Mac 开发与杭州生产的 Git 预检

活动仓库只允许公共远端 `tyuanww/fuqing-crm-analytics`。Mac 上创建 feature 分支、跑本地检查并通过 PR；杭州从 immutable Release 下载绑定批准 source SHA 的 artifact，不在服务器 `git pull`、编辑源码或跟踪浮动分支。

```bash
git remote get-url origin
git remote get-url --push origin
git status --short --branch
git branch --show-current
```

两条 remote URL 都应指向 `tyuanww/fuqing-crm-analytics`；发现旧账号、脏工作树或未批准的服务器分支时先停在预检。生产切换前，另核对杭州 installed manifest/source SHA、容器配置和健康检查，不能把 `git push` 当成部署完成。

## 本地命令

在目标仓库根目录执行。命令不安装依赖、不提交、不推送：

```bash
# 查看计划：changed-files.txt 每行一个仓库相对路径
python3 scripts/ci/run_checks.py --files-from changed-files.txt --plan-only
# 实施该检查集合
python3 scripts/ci/run_checks.py --files-from changed-files.txt
# 直接执行完整的日常合成后端 profile
python3 scripts/run_backend_tests_bounded.py
# 仅验证指定后端文件；同样使用隔离环境和共享排除列表
python3 scripts/run_backend_tests_bounded.py backend/tests/test_local_demo_access.py
```

包含 B0/Vue 的检查会先核对 Node 24，再运行耗时步骤；手工入口可用 `--node /absolute/node` 选择已有解释器。Git hook 继承调用 shell 的 PATH，需要在该次操作中选用已有 Node 24，不自动安装或修改全局版本。已验证 `package-manager-env.test.mjs` 的工具定位和拒绝行为，B0 `--check` 还需现有 zstd：从调用方 PATH 定位，验证版本后将其解析后的工具目录附加到精简环境，缺失/不可运行时提前返回 `B0_ZSTD_REQUIRED`；不继承其他环境变量、不自动安装。ruff 锁 `0.16.9`（以 `requirements-lock.txt` 为准），`pyproject.toml` 的 `lint.select` 为 `E4/E7/E9/F`（0.15 默认集）；不要用无 select 的 `ruff check .` 去套 0.16 的 413 条默认规则。

DSH 本地开发包装器读取 `.nvmrc` 并选择 Node 24.19.0，不修改系统 Node；非标准安装可设置 `DSH_DEV_NODE=/absolute/node24`。`diagnose` 只读。当前本地迁移要求 `check` / `start` / `reload` 在启用插件时传入 `--pack-inputs /absolute/inputs.json`，或为每个启用功能显式传入已构建目录；没有主仓插件源码回退。安装和 reload 预检还需 PATH 上已有固定 pnpm `11.28.2`，禁止 Corepack 联网。输入合同见[插件更新指南](./shinemage-plugin-update.md#开发入口消费固定包2026-10-11-本地迁移)和[准备阶段证据](../hackathon/evidence/shinemage-profile-pack-migration-20261011.md)。最新[宿主依赖修复记录](../hackathon/evidence/shinemage-official-pack-host-closeout-20261011.md)分别记录原正式包安装成功/激活失败、修改 manifest 的隔离重启诊断、Workbench 本地 Linux 严格构建及主仓 114 项定向回归；这些结果不属于 PR #119、正式 candidate 或完整 B0。live CLI reload 仍未执行。

本轮独立包组合入口：`node --test --test-concurrency=1 scripts/crm-calibration/knowledge-composition.integration.mjs scripts/crm-calibration/page-composition.integration.mjs`，需绝对 `B0_BUILD_UPSTREAM`、`FQ_B0_PYTHON`、`CRM_COMPOSITION_PACK_INPUTS`、`CRM_COMPOSITION_PAGE_INPUTS` 和新的 `CRM_COMPOSITION_OUTPUT`。实际固定包公共合同 9 PASS / 0 FAIL / 0 SKIP；输入/profile/包守卫 47 PASS，迁移夹具的旧源码兼容 78 PASS，各自记账。运行身份、Cordis 解析、源码 EPERM、12 个自有端口回收及失败记录见[组合证据](../hackathon/evidence/shinemage-fixed-pack-composition-20261011.md)。缺输入不静默跳过，旧兼容测试入口现在也要求这些固定包输入。默认 pipeline 的其他源码装配与 CI 输入接通仍开放，未执行本批完整 B0；运行组合通过不等于官方完整宿主、浏览器或 candidate 准入通过。

## B0 固定包和作者证据输入

完整 `--check` 要求组合包、Workbench 作者 CI、领域作者 CI 和公共合同输入四类固定材料。路径必须是绝对路径且材料已准备；主仓不以旧测试摘要、作者目录或源码回退补齐。

| 输入 | 实际绑定 |
|---|---|
| `CRM_COMPOSITION_PACK_INPUTS` / `CRM_COMPOSITION_PAGE_INPUTS` | `config/shinemage-composition-packs.lock.json` 的九份正式包及两 profile |
| `WORKBENCH_AUTHOR_CI_ARCHIVE` | `config/workbench-author-evidence.lock.json`，当前来源 `3030e3f`，实际作者 core 155 文件／1086 PASS，与 Workbench 正式包来源一致；CI run `38204944592` |
| `DOMAIN_AUTHOR_CI_ARCHIVE` | `config/domain-author-evidence.lock.json`，来源 `e78e040e`、参考领域 tarball `22245ab9…`，并与主仓固定领域输入同字节 |
| `PUBLIC_CONTRACT_INPUTS` | `config/public-contract-inputs.lock.json` 的 Workbench／CRM／Brand 三份归档与 31 份公共材料；JSON 合同为 `shinemage-public-contract-inputs/v1` |

组合准备回执提供两份输入 JSON。公共合同输入 JSON 的 `archives` 分别使用 `workbench`、`crm`、`brand` 键，值为对应固定 ZIP 的绝对路径。作者归档、合同材料与运行 tarball 是不同对象，各自按锁核对；三个作者仓当前正式 `dsh-plugin-pack/v1` CI 回执与摘要见[正式包 CI 收口](../hackathon/evidence/shinemage-formal-plugin-ci-20261012.md)。不要把 CI 普通 content pack 替代正式包回执；正式包回执也不自动创建 candidate 或 journal。

已封存输入可离线复用。准备本次拥有、已创建且为空的绝对输出根；Python 3.14.4 环境须满足 `scripts/dsh-b0/requirements.lock`，主仓 kit 的固定 build-tools、上游 checkout、pnpm 缓存、zstd 及 `.context/dsh-b0/package-inputs/` 的原领域 tarball 也须已准备。现有流水线内部绑定 kit build-tools 与该领域输入目录，不从其他作者仓搜索缺项。

```bash
export B0_BUILD_UPSTREAM=/absolute/pinned-dsh-checkout
export CRM_COMPOSITION_PACK_INPUTS=/absolute/prepared/crm-inputs.json
export CRM_COMPOSITION_PAGE_INPUTS=/absolute/prepared/page-inputs.json
export CRM_COMPOSITION_OUTPUT=/absolute/new-empty-owned-output
export WORKBENCH_AUTHOR_CI_ARCHIVE=/absolute/sealed/workbench-author-ci.zip
export DOMAIN_AUTHOR_CI_ARCHIVE=/absolute/sealed/domain-author-ci.zip
export PUBLIC_CONTRACT_INPUTS=/absolute/sealed/public-contracts/inputs.json
node scripts/dsh-b0/pipeline.mjs --check --python /absolute/locked-python3.14
```

缺归档、摘要／来源不符、core 失败／跳过、领域输入不匹配或已有结果 scope 均在构建或服务执行前失败；作者私有几何须在实际 plan 中出现。主仓不重复运行作者 core／领域私有几何，公共合同在独占暂存目录执行原 15 个生成器及两个测试组；另两组旧 Workbench 断言、保留守卫和静态扫描仍读取源码，不能据此宣称整条 B0 已无源码依赖。

需要从 GitHub 重新取得这些锁定归档时，调用方先提供具有各选定私有仓 Actions 读取权限的 `GH_TOKEN`，再在获准的联网输入准备步骤使用三个独立的新输出根：

```bash
node scripts/ci/workbench-author-evidence.mjs \
  --output /absolute/new-workbench-input-root --python /absolute/python3.14
node scripts/ci/domain-author-evidence.mjs \
  --output /absolute/new-domain-input-root --python /absolute/python3.14
node scripts/ci/public-contract-inputs.mjs \
  --output /absolute/new-contract-input-root --python /absolute/python3.14
```

分别使用前两项输出中的 `author-ci.zip` 和第三项的 `inputs.json` 设置环境变量。三个准备器均支持 `--github-env "$GITHUB_ENV"` 供已有 CI 接线使用；它们不启动宿主，`--check` 本身不下载输入。当前日期不能沿用旧 Workbench 归档的到期时间；联网准备以实际 API 的成功 run、digest 和未过期状态为准。本轮只验证封存材料读取、当前绑定及守卫，新获取 CLI／主仓 hosted CI 未执行。artifact 临时保留不是长期分发，长期使用仍需持久输入及授权。

B0 独立入口：上述 `node scripts/dsh-b0/pipeline.mjs --check --python /absolute/python3.14` 使用完整固定输入；不带参数或传 `--help` 会打印用法，不启动任何服务。`--prepare` 会下载固定上游、先用锁文件完整预热 pnpm store，再安装构建依赖；`--audit` 只对已准备的 build-tools 闭包执行在线高危审计；二者属于明确动作，preflight 会把审计作为独立 fail-closed 阶段记录，网络异常时可单独重试。插件 `package.json` 的 `test` 是部分源测试便捷入口，`test:built` 也只有一个子集，均不能作为完整 B0 通过声明。原生查询资产需显式 `node scripts/dsh-b0/serve.mjs --python /absolute/python3.14 --native-query-assets`，不替代默认 `--native-query`。离线分析/驾驶舱合同用 `scripts/dsh-b0/analysis-contract.mjs` 与 `cockpit-contract.mjs`，不启动旧 CRM。旧 Vue 的依赖由 `frontend-vue3/package-lock.json` 管理，B0 的固定版本由 toolchain/自身锁管理，旧后端由 requirements-lock 管理；此轮未升级依赖。

已有固定版本工具链可通过环境变量 `B0_BUILD_UPSTREAM=/absolute/prepared/upstream` 供 `--check` 只读复用。仍强制验证上游 SHA、锁文件、SDK 与类型版本；不下载、不升级。上游 Git 核对禁用 optional locks、fsmonitor 和调用方全局/系统配置，避免只读输入的 index 被刷新。该覆盖不允许用于 `--prepare`。固定缓存准备、当前集成完整 B0 与 opt-in 服务补跑的实际结果见[2026-10-08 接续记录](../hackathon/evidence/shinemage-abc-resume-20261008.md)，不使用历史测试数替代。

首购官方 Host 的显式浏览器演练继续使用 `backend/tests/test_analytics_first_purchase_official_host.py` 与 `B0_NATIVE_CRM_BROWSER_MODULE=/absolute/playwright/index.mjs`。默认选择系统 Chrome；若使用独有临时目录中的固定 Chrome for Testing，可增加 `B0_NATIVE_CRM_BROWSER_EXECUTABLE=/absolute/regular-executable`，路径必须绝对、可执行且不能是 symlink，失败不回落到其他浏览器。驱动固定 `zh-CN` locale，与中文原生按钮定位一致，并记录实际浏览器版本、平台与启动状态；不自动安装浏览器或系统库。只有目标实际运行的结果才计为目标浏览器证据，本机空白页预检不能替代业务五场景。目标机还需可用的中文字体；DOM 断言通过不等于中文字形可见，必须复核实际截图。临时字体/库的来源与摘要单独记录，不改业务包；本次目标结果见[WSL 浏览器证据](../hackathon/evidence/dsh-g0-first-purchase-target-browser-wsl-20261007.md)。

在线 `--prepare` / `--audit` 的 Git/pnpm 命令接受操作者显式传入的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` 及小写形式。macOS 系统代理不会自动成为终端环境；只有确认自己的代理地址后才在当前命令导出。不会改全局网络配置，也不会把代理加入离线构建/测试和业务宿主环境；TLS/audit 绕过参数及业务凭据仍不透传。审计接口超时或返回非 JSON 时继续 fail-closed，修复连接后单独重跑 `--audit`，正式 preflight 使用新 tag 保留旧失败证据。实际故障与修复见[网络证据](../hackathon/evidence/dsh-g0-preflight-network-20261006.md)。

重复准备使用同一 helper 的 frozen fetch/install 参数：fetch 带 `--ignore-scripts`，install 显式关闭 `optimistic-repeat-install`，防止 pnpm 将仅有 virtual store 的目录误判为完整安装。不会禁用锁文件/完整性/供应链校验；构建用原生依赖仍只由已有 rebuild 清单处理。`package-manager-env.test.mjs` 在隔离本地包上连续运行两轮 fetch/install，验证可执行链接恢复、lock 字节不变与生命周期未执行。

独立 synthetic CRM/知识服务包：`CRM_SERVICE_PYTHON=/absolute/locked-python3.14 node --test --test-concurrency=1 scripts/crm-calibration/service-package.test.mjs`。共享后端 profile 的 `test_crm_service_packages.py` 调用同一实际 pack/解包/最小依赖 venv/双服务 HTTP 验证；因此全量后端验证也需要现有 Node 24 与 zstd。CI Python job 已声明这两项工具，不会从 B0 的最小 Python 锁冒充服务依赖。测试只操作自己创建的临时目录和进程，不表示完整 DSH、WSL 冷安装或真实数据验收；[服务包说明](./crm-service-packages.md)列出剩余门禁。

干净重建只复制固定白名单源码，不跟随符号链接，也不进入 `.git`、`.context`、`node_modules`、`dist` 或 `lib`。复制总量上限为 256 MiB、5 万文件和 32 层目录；临时目录带专属标记，正常失败会在 `finally` 清理，启动时还会回收超过 24 小时的已标记残留。构建被强制终止时不会保证即时删除，但不会再无边界复制依赖树。

2026-10-04：上面的服务包入口也覆盖首购分析的独立包，含 13 项精确依赖、HTTP 保存/重启回放、状态合同漂移和 FIFO 拒绝。共享 runner 仍调用同一测试文件；本机包验证不替代跨包版本配对或平台依赖冷安装，见[新包证据](../hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。

2026-10-05：另有显式 `node scripts/crm-calibration/service-package-compatibility.mjs` 入口，将两个固定源码 SHA 打成真实 archive，各自在新 venv 用离线 hash wheel 安装后执行 9 项 HTTP 兼容观测；参数与前置见[服务包说明](./crm-service-packages.md#精确旧新包的-opt-in-兼容验证)。这项需要已有历史 Git 对象和平台 wheelhouse，普通 CI 不自动下载/运行；本次 Darwin arm64 结果见[配对证据](../hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)，不代表 WSL 或生产激活。`backend/tests/test_service_artifact_compatibility.py` 的 CLI 负测纳入共享后端入口，覆盖浮动/相同版本、相对路径、重复参数、既有证据不覆盖与失败回执；没有历史对象时失败不能记成 PASS。

保存分析/驾驶舱的 finite mock 组件仍须独立通过类型检查、编译后 DOM 测试与干净重建。HTTP CONNECTED overlay 另有 `query-card-save`、`asset-overlay`、`native-query-assets-smoke` 与独立 analysis/cockpit HTTP 测试。`asset-overlay` 编译后 DOM（mock transport）覆盖 discard、过期预览、拖拽提交，以及撤销整板、从已保存分析加入、无板时创建、预览/保存 409 后重读；不是浏览器 E2E。默认查询入口不带资产能力。

服务包证据接线验证：`node --test --test-concurrency=1 scripts/release/plugin-service-evidence.test.mjs scripts/release/state-reconcile.test.mjs`，也由 `pnpm dsh test` 的 release suite 自动收集。使用 validator-only 小包夹具验证候选/journal 绑定、写锁内前置历史核对、实际安全解包、源码/清单/依赖漂移、特殊文件、错误脱敏与幂等；这些夹具不是实际服务运行证据。对已实际运行的双包调用 `pnpm dsh plugin verify-service` 的另行结果见[接线记录](../hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)；审核修复、本次 **206 PASS** 和实际 CLI 重试见[2026-10-05 审核记录](../hackathon/evidence/dsh-g0-service-artifact-gate-review-20261005.md)。

目标主机只读预检：`python scripts/run_backend_tests_bounded.py backend/tests/test_service_target_preflight.py`（固定 Python 3.14，PATH 使用 Node 24）。同一测试纳入共享后端矩阵，覆盖实际 CLI、只读审计钩子、WSL 形状的标签匹配/拒绝、Requires-Python、精确闭包和输入负测。WSL 事实注入只存在于测试子进程，不是生产参数；不是 WSL 实机验收。当前 **24 PASS** 与实际 Mac BLOCKED 结果见[证据](../hackathon/evidence/dsh-g0-service-target-preflight-20261006.md)。

随后 OCR 增加 WHEEL/dist-info/改名标签、active Requires-Dist 及 optional marker 的回归，当前同一入口 **35 PASS**；6 项负测先失败后通过，实际依赖包重验通过，见[审核证据](../hackathon/evidence/dsh-g0-service-target-preflight-review-20261006.md)。

2026-10-06 另行实际运行首购服务 WSL 合成验收 **14/14**：原双包、13 个固定 Linux wheel、两个新 venv、真实 HTTP 保存/权限/崩溃恢复/只读回退与未知 schema 拒绝，见[现场证据](../hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)。使用现有 helper 的有限验收编排，不新增生产安装入口或 CI 自动远端动作；合成状态目录必须保留 `0700`。该现场阶段不替代上面的单元测试，也未重跑历史 35/206 项套件；不代表 DSH 宿主、浏览器、真实身份/时间窗口或供应链通过。当时目标回执尚未接 candidate journal，后续接线见下一段。

WSL 目标回执接线：`node --test --test-concurrency=1 scripts/release/service-target-evidence.test.mjs`，已纳入 `pnpm dsh test` 自动发现。**37 PASS** 覆盖输入/日志/场景/清理篡改、只读回退声明、路径与特殊文件、幂等/恢复、错误脱敏；fixture 的 wheel/seed 是不可安装的解析器测试字节，不冒充 WSL 执行。固定 2026-10-06 runner 原字节只作审计输入，测试不执行它。同日完整 release suite **243 PASS / 0 SKIP**；另用已有真实现场回执执行本地 CLI，原 journal seq 4 和重试、108 文件不变通过，见[本次证据](../hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。本步没有重新执行远端验收，生产 gate 继续 BLOCKED。

来源 HTTP 目标回执接线：`node --test scripts/release/source-target-evidence.test.mjs`（Node 24），由同一 `pnpm dsh test` 自动发现。当前 34 PASS；完整 release suite 278 PASS / 0 SKIP。核对当前 query/save 两包与候选源码关系、安全解包、固定 runner/helper、15/13 Linux 依赖、十项观测、重启/崩溃与独立存储握手；错误证据拒绝且不写 journal。夹具不运行实际服务或 WSL。已有实际杭州回执接入 journal seq 4 的结果、重试与证据边界见[本轮记录](../hackathon/evidence/dsh-g0-first-purchase-source-target-gate-20261007.md)，没有重跑目标服务。

首购目标浏览器回执门禁：`node --test scripts/release/browser-host-evidence.test.mjs`，由既有 release suite 自动发现。本轮新门禁 **34 PASS**，完整 `node --test scripts/release/*.test.mjs` **345 PASS / 0 SKIP**。复用现有 `plugin verify-host` 和 HTTP 的包/runtime 校验，通过独立 browser schema 绑定原候选 Host 事件；真实 WSL 回执接入 seq 6 的幂等/拒绝结果见[接线证据](../hackathon/evidence/dsh-g0-first-purchase-browser-gate-20261007.md)。单元夹具只验证解析与状态，命令不启动浏览器/WSL，不认证截图内容或签名，不放行生产。

Release 来源绑定：`node --test scripts/release/attestation-binding.test.mjs scripts/release/trust.test.mjs`；新增测试随 `node --test scripts/release/*.test.mjs` 自动运行。覆盖缺/错 source SHA、输出结构/subject、错误脱敏、验证期间包变化；临时 verifier 是调用边界夹具。2026-10-07 完整套件 434 PASS、真实 GitHub runtime 签名正负验证与四个叶子插件隔离构建 4/4 见[本轮证据](../hackathon/evidence/dsh-g0-attestation-binding-20261007.md)，不表示新候选或生产准入通过。

## 提交内容与历史审计

Excel SSOT 的提交入口使用 `--staged`：从 Git index 读取变更 view 文件全文，工作树中未暂存的修复不能掩盖错误；新增/重命名文件同样校验四条规则。无参数命令仍全量扫描 views。`--only-new` 为 `--staged` 的兼容别名，原先该参数仅打印文案但没有筛选。

2026-09-06 全仓审计仍报 32 条历史违规，结果留在 `.context/checks/closeout-excel-lint.log`。这些未触及页面的字段语义须另做专项核验；本次不改倍率、不把全仓审计记成通过。暂存区正反例覆盖四条规则、未暂存修复、历史文件、重命名与 Git 读取失败。

## 测试环境与排除的归属

- 日常 runner 使用私有临时 HOME/TMP、白名单环境、禁用 dotenv；清除父 hook 的 Git 定位变量和调用方密码/API key/pytest 参数。不连接调用方配置的 DuckDB。
- conftest 在收集前把业务库和缓存库指向本会话临时路径，不自动探测归档；真实库路径只能由明确授权的 `FQ_TEST_ARCHIVE_DB` 验收配置选择。日常 runner 不透传它。
- 认证 fixture 缓存每个 Python 进程的合成 cost-12 哈希，仅恢复可变状态；密码加载、强度和安全行为的专用测试保留真实 bcrypt。纯逻辑测试不会为 autouse fixture 导入应用或 ETL。
- 清理测试显式引用 tracker fixture，构造函数默认值、日志、marker 全部隔离。会话退出只回收自己创建的临时目录，不遍历或删除其他 pytest 会话。
- 默认串行，每 25 个测试文件开新进程；单组 RSS 上限 6 GB、时间上限 900 秒，超过上限以 90/91 退出并只停止自己创建的进程树。可以通过明确 CLI 参数调整，不自动并行。
- `not slow` 与七条 C 类排除仍由既有 `scripts/ci/pytest_c_class_deselects.txt` 统一。PR/每周后端回归均使用此日常 profile；慢测、归档数据、宿主安装状态、原生服务与真实设备验收不在其中，不能声称已由 CI 全部覆盖。
- 仅有分进程通过不足以证明跨模块状态隔离；公共 fixture/环境变动另做同进程的混合与反序回归。

## 自动入口与副作用清单

| 入口 | 触发/调用 | 写入或网络 | 当前阻断规则 |
|---|---|---|---|
| Git pre-commit | 暂存路径 → 对应检查器 | 只读差异/源码；历史大临时文件只告警 | 失败阻断，CHANGELOG 默认提示 |
| Git commit-msg | message → commit_msg_check | 只读提交描述/差异 | 非零阻断 |
| Git pre-push | refs → run_checks → LFS | 检查写本次产物；授权 push 时 LFS 使用 remote | 任一非零阻断，无自动复用 |
| Git post-merge | main/master → audit/hint | 追加本工作树审计日志 | 记录 merge，不串联清理或发布 |
| Claude PreToolUse | 本仓配置的文件/命令规则 | 无业务数据写入 | 模式防护，不替代授权判断 |
| Claude PostToolUse | 编辑 Python → 文件 Ruff | 本地静态检查 | 提示型，不替代 commit/push 门禁 |
| PR CI | 共用路径计划 → 各 job | CI 临时依赖、产物；按依赖/部署维度访问注册表或启动微型容器 | 启用 job 保持硬门禁，不 continue-on-error |
| Weekly Backend Health Check（nightly.yml） | 每周一 09:00 北京时间/手动 → bounded runner | CI 临时环境、90 天报告与实际 suite 摘要 | 失败非零；ground-truth 仍为历史 warning 模式 |
| E2E Smoke | 仅手动 → 旧 CRM 登录壳层 | CI 微型合成库与临时服务 | 失败非零；不覆盖 DSH 原生业务旅程 |
| framework pre-commit | 仅本地选装；独立 Actions 工作流已移除 | 工具缓存/安装 | 不默认安装或叠加 |
| branch_cleanup | 默认只读预览；apply + exact local | 仅明确 apply 才删指定本地分支；无远端写入 | dirty/protected/current/unmerged/occupied 拒绝；无强删回退 |
| ETL/backup/launchd/start-stack | 独立运维入口 | 可涉及业务库、进程和守护 | 不由治理或普通验证触发，保留归档授权边界 |

全局 Claude 配置、主仓旧版 hooks、历史运维文件没有随成果工作树补丁自动更新。本表列出当前生效关系，不以历史文件存在推断其已安装运行。

## 历史 HTML sidecar 本地校验

不启动 6677，不连接公网，不读取模型凭据。Node 24 与只读 `B0_BUILD_UPSTREAM` 下执行：

```bash
node --test --test-concurrency=1 \
  dsh-plugins/analytics-workbench/test/validation-rollout-browser-smoke.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-performance.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-eval.test.mjs
```

开关、指标、回滚和兼容性见 [free-page-validation-rollout.md](free-page-validation-rollout.md)。通过这三项不表示真实模型、Playwright 完整主链或现役挂载已完成；缺凭据时评估报告保持 `MISSING_CREDENTIAL`。产品仍 PARTIAL。

## 证据与交付

每次 backend runner 创建新的 `.context/checks/<time>/`，记录解释器、HEAD、Python 检查源码摘要、完整目标与命令、每组退出码/耗时/峰值 RSS、JUnit 与最终结果；失败也保留。摘要是可审查证据，不是绕过检查的授权或自动缓存键。`summarize_checks.py` 汇总 JUnit 子 suite，避免过去从空根属性得到 None。

当前规则只在 AGENTS；当前产品任务状态在 STATUS 与 TODOS；B0 执行清单保留历史；日期报告是不可回写的历史证据。本次治理记录单列本地补丁、旧成绩和未运行项目。Git/远端 CI/真实业务验收分别交付，不能因为本地检查通过标记产品完成。

固定运行时选择器和混合文件入口见 [How to 运行固定 Node 与 Python 的前置测试](pregate-runner.md)。IM 固定归档的 lock 字段、校验命令与错误码见[DSH IM 插件固定输入参考](../reference/dsh-im-plugin-inputs.md)。

## DSH 基座兼容的独立验证

驾驶舱 HTML 选区提示词、源码范围验证器、原生初始提示或评估器发生变化时，合并前另跑真实模型评估（需要用户授权模型调用）：

```sh
node scripts/dsh-dev/cockpit-ai-eval.mjs \
  --runtime /absolute/already-running-dsh-runtime \
  --upstream /absolute/pinned-dsh \
  --python /absolute/python3.14 \
  --output /absolute/new-private-eval-report.json
```

入口复用所指实例当前模型，不读取或复制模型密钥，不启动、重启或切换服务。它创建临时合成目录和唯一原生 preset，限制文件工具与路径；分别跑三项修改和两项越界拒绝，使用真实 `TASK.md`、原生双轮提示、`present`、产品收取/确认及独立连接读回。失败立即停止后续场景，只取消自己创建的会话；临时 preset 结束时清理，失败与候选证据保留在报告所指目录。当前费用未知时记 `null`，有用量则记录实际 token，不伪造费用。这个门禁不自动加入 CI，也不替代完整宿主浏览器或用户真实文件 UAT。纯合成的评估器回归为 `backend/tests/test_cockpit_ai_eval.py` 和 `scripts/dsh-dev/cockpit-ai-eval-guard.test.mjs`，不调用模型。

`FQ_B0_PYTHON=/absolute/python3.14 DSH_DEV_UPSTREAM=/absolute/pinned/upstream node --test scripts/dsh-dev/*.test.mjs scripts/release/profile-packs.test.mjs` 检查开发入口、包合同和 supervisor 失败清理；PATH 要包含实际 Python 3.14 与 `lsof`，不停止现有监听。开启插件时，原生 UI-only 入口还需 `--pack-inputs` 或完整显式目录。`native-composition-browser-probe.mjs` 现在要求绝对 `DSH_DEV_PACK_INPUTS`，没有该输入时在启动合成服务之前拒绝；本轮没有运行该浏览器探针。上述检查与完整 B0、正式 candidate/host/target 验收分别记账。

B0 `serve.mjs --python /absolute/python3.14 --port-base 4335 --native-first-purchase` 使用 4335–4339；gateway 与 rpc 从同工作树 `current.json` 读取端口，三者均在隔离 worktree 执行。`B0_BUILD_UPSTREAM` 可只读复用固定 checkout。Loader 测试默认使用独立 4326，支持 `B0_PORT_BASE=4335` 选择 4336；端口忙直接失败，不停止用户演示。完整基座 Settings 的插件清单为只读，启停在启动配置层验证。


## 比赛集成候选复现（2026-09-09）

比赛 Python 验收随 backend 全套运行，包含 A9、本地 HTTP、C0 合同和诊断服务测试；
B0 pipeline 另检查 C0 离线产物以及比赛插件源测试和编译后 DOM。
两套 Python 锁不同，混合检查可设置 `FQ_B0_PYTHON=/absolute/b0-venv/bin/python`，
仅 B0 使用该解释器，其余检查仍使用 runner 的解释器；不安装或跳过检查。
Logo 使用当前 checkout 的 Git LFS 字节，可执行
`git lfs pull --include=frontend-vue3/src/assets/brand/shine-mage.png --exclude=`。
不再从相邻工作树读取 Logo。supervisor 单测只选空闲 4328/4329；已有监听不停止。
比赛 HTTP 演示仍为 synthetic；T13/T15/T16 不由单元测试替代。
离线 runtime deploy 在私有 staging 副本中运行，不改写 pinned checkout。HTTPS 直链使用准备阶段缓存的原始 tarball，并按固定锁文件的 SHA-512 integrity 校验；不把已安装目录重新打包冒充原始包。缓存缺失或摘要不符会阻断，离线阶段不重新解析依赖版本。

## 插件边界与独立构建

固定工具链由 `dsh-plugins/plugin-kit/toolchain.json` 和 `plugin-kit/build-tools/` 维护；不从相邻旧仓库发现依赖。`node scripts/dsh-b0/plugin-boundaries.mjs --check` 核对当前所有插件的 owner、直接 import、字面路由、合同与构建 DAG；新增源码耦合、循环、过期例外或清单漂移均阻断。已验证入口与边界负测，具体命令和结果见 [本轮审核](../hackathon/evidence/dsh-g0-decoupling-review-20261003.md)。边界说明见 [架构清单](../architecture/shinemage-plugin-boundaries.md)。

`plugin-kit.test.mjs` 实际打包并用 pnpm 离线安装 kit（新 HOME/store），逐个复制全部 10 个消费者，在没有相邻插件/kit 源码时构建与执行各自测试；SDK/build-tools 仍为显式固定输入。工作台 pin 测试走 kit 公开导出，图表组合断言由 `geometry-composition.test.mjs` 承担，B0 同步执行。当前结果及未执行层级见[全部消费者迁移证据](../hackathon/evidence/dsh-g0-kit-all-consumers-20261007.md)。

B0 `--check` 包含边界负测、`plugin-isolation.test.mjs` 和既有 workbench clean rebuild。CRM 也纳入独立源码构建/固定 SDK 组件注册测试/受控 pack，以及页面提供方组合与卸载测试。独立包测试只复制 kit 与单个 leaf 源码，复用相同锁文件的第三方依赖；在临时 Git 夹具中构建、执行现有生命周期单测并受控打包。临时提交不属于产品历史，不充当 reviewed release SHA。这些测试不启动真实 DSH、不证明热卸载或跨版本兼容。

B0 `--check` 先独立构建 board-components 并绑定受摘要约束的 tarball，再验证公开导出/类型、失真输入和几何语义。workbench clean rebuild 只含 workbench 源码与 kit，图表通过同一个 tarball 输入；不会复制 funnel/waterfall 源码。临时 Git 夹具内再执行受控 pack，记录 `fixture_only`，不冒充正式 reviewed source。`backend/tests/test_board_funnel.py` 与 `test_board_waterfall.py` 消费领域包拥有的同一套 JSON 标本，按受影响文件单独运行。

驾驶舱与 CRM 的 slot 形状由领域 JSON 生成各自的本地类型，B0 自动运行 `cockpit-slot-contract.mjs --check` 和对应消费者/漂移负测。独立消费者只携带自己的生成物；完整固定 SDK 类型检查和原生 SlotCore/编译后 UI 测试仍保留，不以纯类型通过替代宿主验收。

品牌内容主题由 `content-theme-contract.mjs --check` 和真实消费者测试核验；生成物纳入双方包内，无品牌插件运行时依赖。CRM 全部 Node/Host/UI 回归需要完整 backend 锁定 Python（`CRM_METRICS_PYTHON=/absolute/backend-python`），不能复用最小 B0 Python 冒称通过；Chrome 旅程单列，不纳入本轮合成 UI 结论。当前命令、范围及失败修复见 [CRM 端解耦证据](../hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。

2026-10-04 CRM 插件已改为显式 HTTP 服务配置；上述 Python 变量现在只供测试启动本次拥有的合成 API 进程，插件不再读取它。新增 `service-client.test.mjs` 的版本/超时/取消/重定向/响应大小/异常响应负测纳入 B0；`service-http.integration.mjs` 与 `tools.test.mjs` 在完整锁定 backend Python 下验证实际双 ASGI 服务。独立包测试额外对最终 tarball 安全解包，只提供固定 SDK 依赖后执行包级 ToolRuntime 验证。领域生成物漂移由 `test_crm_service_contracts.py` 与离线生成器检查；这些结果不证明完整原生 profile 或杭州已上线。详见 [服务边界](./crm-plugin-service-boundary.md) 与 [当前证据](../hackathon/evidence/dsh-g0-crm-service-boundary-20261004.md)。

同日插件拆包后，`scripts/crm-calibration/verify.py --node /absolute/node24 --upstream /absolute/pinned-dsh-checkout --build-tools /absolute/plugin-kit/build-tools` 由锁定 backend Python 执行，实际构建 CRM 与知识包，再跑两域工具、跨服务 HTTP、Host 和身份撤销组合测试。知识 schema/类型生成物归 `dsh-plugins/knowledge/src`，独立包回归与类型检查纳入 B0；`plugin-isolation.test.mjs` 只复制各自源码和 kit，分别 pack/安全解包/加载最终 tarball。页面组合仍由 B0 在提供方构建后验证。浏览器、完整 DSH profile、WSL/WAL 与真实服务 UAT 单列，详见[本轮拆分证据](../hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。

固定官方宿主验收使用显式入口 `node scripts/dsh-b0/pinned-host-acceptance.mjs --upstream /absolute/unchanged-built-dsh-0.1.7-rc.2 --output /absolute/new-private-evidence`。命令自己拥有 HOME/profile/session、loopback 模型夹具、动态端口与所有子进程；会实际进行重启、SIGKILL 和同步挂死负测，结束仅回收自有实例。默认从干净插件源码 pack；`--packages-from /absolute/prior-host-evidence` 可复核并复用同一包。没有真实模型、业务数据或现役服务访问，不替代目标平台、完整 runtime 信任链与浏览器验收。[实际证据](../hackathon/evidence/dsh-g0-pinned-host-20261004.md)及[兼容矩阵](../architecture/dsh-compatibility-matrix.md)记录范围。

这个真实宿主入口不自动加入日常 B0；B0 只运行 `pinned-host-acceptance.test.mjs` 的四项启动前负测，传入已有 `B0_BUILD_UPSTREAM`，检查错误 pin、路径、拒覆盖和包篡改。单独跑该测试而未提供固定 checkout 时，两项依赖 exact checkout 的检查明确 SKIP，不能记为全通过。

CRM 首购的真实宿主 HTTP 链另有显式入口：先按已有 SDK 链接构建 workbench 与 CRM 插件，再在 Node24 / B0 Python3.14 环境运行 `B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/unchanged-built-dsh-0.1.7-rc.2 python -m pytest --noconftest -q -W error::ResourceWarning backend/tests/test_analytics_first_purchase_official_host.py`。未设置该变量时明确 SKIP；不安装依赖、不修改上游，独占临时 4335/4336/4337，端口占用就失败，不能杀现有进程腾位置。它使用合成 CRM/model/JSON 和独立 SQLite，实际加载官方 Web CLI，经官方 `commands/execute` 准入，验证 Cookie/Origin、CRM 登录、原生 worker、保存/核对、精确取消和重启重新登录。这个默认模式只证明 HTTP 整链。

同一测试另提供显式 `B0_NATIVE_CRM_BROWSER_MODULE=/absolute/existing/playwright/index.mjs` 模式：使用已安装 Chrome、全新 headless context，实际点击官方输入框、CRM 登录与保存，刷新核对同一回执，再用不带业务工具的 preset 验证普通对话。这个模式和默认 HTTP 重启模式需分别运行，不把一个 PASS 当作两种都通过；未提供浏览器变量时浏览器保持 NOT_RUN，不自动安装浏览器/依赖或使用个人 profile。两种模式均回收自有实例，见[本次证据](../hackathon/evidence/dsh-g0-native-command-browser-20261006.md)；headless 不等于 headed、移动端、读屏或生产 UAT。如需保留 pytest 临时文件，`--basetemp` 只能传新的专用证据目录，不能复用旧证据目录。

同一入口可显式增加 `B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/owned/input.json`，安全解包并加载固定 workbench 候选与 CRM 包，保存使用真实 candidate digest。输入 schema/绝对路径/文件摘要见[包级验收](../hackathon/evidence/dsh-g0-first-purchase-artifact-host-20261006.md)；pytest 自动分配独立输出，沿用现有生产 peer link helper，结束后验证文件和 SDK 链接完整性。不提供变量仍走 workspace 模式；服务/查询内核仍为源码合成夹具，不代表服务 archive 已整链通过。自有 HTTP fixture 支持关闭连接后的端口复用，仍拒绝现有 live listener；不要杀其他进程腾端口。

该输入的 v2 schema 增加固定 `service_evidence_path` / `service_evidence_sha256`，同时要求显式 `B0_NATIVE_CRM_SERVICE_PYTHON` 和 `B0_NATIVE_CRM_SERVICE_WHEELHOUSE`。它复用原服务 verifier 和离线 hash 安装器，在独立 venv/进程运行保存服务，验证 Host 重放与服务重启，拒绝回落到源码服务；v1 保持上一段范围。具体[命令与范围](../hackathon/evidence/dsh-g0-first-purchase-service-host-20261007.md)已核对：查询内核/CRM/model 仍是源码合成夹具，不等于整套生产 runtime。`test_first_purchase_packed_service_support.py` 的启动拒绝/回收负测纳入 B0；真实宿主/服务包验收仍需 opt-in，同端口模式顺序运行。

该组合输入的 v3 schema 再增加绝对 `kernel_receipt_path` 与 `kernel_receipt_sha256`，并要求 `B0_NATIVE_CRM_KERNEL_WHEELHOUSE`。查询演练包由 `first-purchase-kernel-artifacts.mjs` 从完整固定 Git SHA/显式 allowlist 打包，复用现有安全解包、文件验证和离线安装器；不产生生产 profile 或 release journal。实际查询 API/dispatcher/worker 位于另一独立 venv/进程，私有 pipe 仅驱动原 dispatcher 和读取观测，不新增业务 HTTP 端点。输入错误拒绝回落，四种模式/重启/回收命令见[包级查询证据](../hackathon/evidence/dsh-g0-first-purchase-kernel-host-20261007.md)。日常 B0 纳入 `first-purchase-kernel-artifacts.test.mjs` 和 `test_first_purchase_packed_kernel_support.py` 的保护测试；实际冷安装 guard 另需 `B0_NATIVE_CRM_KERNEL_RECEIPT`/Python/wheelhouse。2026-10-08 用已提交 `e577f41b` 与当前配方 `ddb70716…` 打出新回执并冷安装 **3 PASS / 0 FAIL / 0 SKIP**；历史 `kernel-pack-r2` 保持原字节。第一次因 PATH 缺少 `zstd` 失败并保留。见[当前配方证据](../hackathon/evidence/shinemage-abc-kernel-current-20261008.md)。这不是正式 candidate。保存与查询仍共享同一合成 RunStore/SQLite，代码包隔离不等于存储服务解耦。

2026-10-07 增加源码模式 `B0_NATIVE_CRM_SOURCE_HTTP=1`：同一官方 Host 测试通过新的 `first-purchase-frozen-source/v1` 查询来源 API 保存结果，保存 factory 的 `run_store=None`。默认仍保留旧兼容路径；这个开关与 `B0_NATIVE_CRM_ARTIFACT_MANIFEST` 不能同时使用，旧固定包缺少新接口，不能悄悄回落或套用旧证据。此次新旧 HTTP 模式分别验证，浏览器/新双包/WSL 未重跑，见[源码边界证据](../hackathon/evidence/dsh-g0-first-purchase-source-http-20261007.md)。

`backend/tests/test_analytics_first_purchase_source_http.py` 纳入 B0：真实 loopback 检查来源/权限/版本/大小/超时/撤权与争锁；独立保存子进程有 SQLite audit guard，只允许打开其自有分析库，查询下线后新进程可核对/重放原回执。两套实际 allowlist 的隔离导入另验证不依赖邻接源码。`first-purchase-analysis-contract.mjs --check --python /absolute/python3.14` 同时离线检查分析 API/原插件类型与新 source OpenAPI；服务间合同不生成新浏览器 API。归档测试与这些源码测试不能替代 exact-SHA 双包、目标 runtime 或生产准入。

固定包来源模式使用 `dsh-first-purchase-host-artifacts/v4`（字段与 v3 相同），不设置工作树专用的 `B0_NATIVE_CRM_SOURCE_HTTP`。v4 对保存/查询包 source 合同摘要及实现入口做校验，再由实际进程走 HTTP；缺项不能回落到 v3 或工作树。保存进程使用专属目录，并在导入包前启用 SQLite audit guard；原 v3 本机适配模式仍可显式回归。新模式固定包、Chrome、查询离线重放和冷安装的实际命令/输入/边界见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-source-packages-20261007.md)，不继承旧 WSL 验收。

目标 immutable runtime 模式使用 `dsh-first-purchase-host-artifacts/v5`；输入字段和本次 WSL 命令/摘要见[目标宿主证据](../hackathon/evidence/dsh-g0-first-purchase-runtime-host-20261007.md)。同一个 `test_analytics_first_purchase_official_host.py` 入口读取 `B0_NATIVE_CRM_ARTIFACT_MANIFEST`、绝对 `B0_NATIVE_CRM_SERVICE_PYTHON`、两个 wheelhouse；**不设置** `B0_NATIVE_CRM_HOST_UPSTREAM` 或 `B0_NATIVE_CRM_SOURCE_HTTP`。v5 只接受固定 manifest/runtime 和匹配 candidate/source 的 Linux 依赖来源，安全解包与完整性检查后运行，绝不自动下载、编译或激活。Host 启动仍只在显式 opt-in 测试中发生。

`node --test scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs` 纳入 B0 pipeline，普通保护检查不启动 Host。覆盖 runtime pin/digest/大小、输入替换、FIFO/符号链接、完整安装树、错误平台 wheel 和混用 checkout；真实目标机结果不能由这些负测代替。原生查询恢复基线须在总结 turn 空闲后截取，不能把计算完成时的中间 journal 序号拿来比较恢复状态。

新来源的目标服务演练使用 `scripts/dsh-b0/first-purchase-source-target.probe.py run-wsl <absolute-sealed-input> <input-sha256>`（Python 3.14，`-I -B`）。输入目录含两包 archive/manifest、原来源 receipts、局部 candidate、固定 synthetic JSON、验收 helper 和目标平台各自 15/13 个 wheel；`input.json` 固定全量文件字节/摘要，验收不联网下载。只能在 WSL2、UID 65534 的专属临时目录运行，输出在其同级新建 `result`；4335 被占用则失败，不停止既有 owner。`run-local` 可用于预演，但输出 scope 不等于 WSL。

本次同一 `f9726f68` 包的实际杭州来源/同版本恢复 **10/10 PASS**，命令、摘要、失败修复及清理见[现场证据](../hackathon/evidence/dsh-g0-first-purchase-source-wsl-20261007.md)。该范围不启动 DSH/真实 CRM/模型，不关闭目标宿主或生产 gate；现场阶段回执接线当时未完成；现已由上文新的十项 schema 校验器接入原 journal seq 4，不能冒充旧十四项回执通过。

`pnpm dsh plugin verify-host --candidate /absolute/candidate.json --evidence /absolute/evidence.json --state-path /absolute/state.json` 核验已有 v2 宿主证据并幂等追加到原 candidate journal；该命令不运行宿主。`plugin-host-evidence.test.mjs` 纳入 release suite/B0，用明确的 verifier-only 夹具检查缺项、篡改、错误 scope/journal 和重试，不能将这些夹具视为真实宿主通过；真实命令的十项场景与 CLI 接线另行留证，见[本机接线与服务状态证据](../hackathon/evidence/dsh-g0-host-journal-20261004.md)。

同一 `plugin verify-host` 现在也接收 `dsh-runtime-host-evidence/v1` 封套：`inputs`、`controller`、`inventory`、`runtime_archive` 都是相对封套目录的 `{name, sha256}`，`service_target_event` 是原 journal 的 `{seq, digest}`。既有 WSL 主机输入与输出原字节保持不动；先核对原 source-HTTP 服务事件、固定控制器源码、完整文件清单/安全解包的插件安装摘要、runtime 流式摘要和 20 项 HTTP 记录，再以 `CANDIDATE_RUNTIME_HOST_OBSERVED` 幂等记账。旧 v2 分支不变。新分支不是浏览器、生产身份、签名或部署回退门禁。

定向入口：Node 24 `node --test scripts/release/runtime-host-evidence.test.mjs`，已由 `pnpm dsh test` 自动发现；当前 **33 PASS**，同轮完整 release suite **311 PASS / 0 SKIP**。夹具中的 runtime/wheel 和 PASS 日志明确是不可安装的校验器输入，不当作现场运行证据。真实已有杭州回执 CLI 接线、幂等重试及原输入保护见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-runtime-host-gate-20261007.md)。命令只读取封套相关文件、在本机临时目录安全解包插件并写显式 journal，不执行包内代码、不启动 Host 或连接杭州。

T3/T7 的 `backend/tests/test_analytics_first_purchase_save_recovery.py` 纳入现有 B0 Python 目标和常规 backend 回归：只用隔离合成 RunStore/SQLite，分别在提交前后 SIGKILL 自有子进程，通过新进程重放、冲突/权限拒绝、保留旧版本的 forward-fix 和不兼容 schema 拒绝验证存储边界。这仍不证明 D15 candidate/correlation 回执、业务数据迁移或跨版本服务回退；保存门禁继续关闭。

后续 `test_analytics_first_purchase_save_receipts.py` 补齐 G0 的保存身份、双键幂等和只读 `save-receipts/reconcile` 合同，并纳入 B0 Python 清单。此文件单独只证明存储回执；后续 `test_analytics_first_purchase_save_api.py` 覆盖版本化结果/freshness、候选准入、受控写 API、写锁后重验、保存来源原子性和新进程重放，并用真实 ASGI HTTP 响应执行插件严格 decoder。新文件已纳入 B0 Python 清单，见[准入接口](first-purchase-save-admission.md)和[实际证据](../hackathon/evidence/dsh-g0-save-admission-20261004.md)。生产策略和保存 UI 仍未启用。离线生成沿用 `first-purchase-analysis-contract.mjs`，同时产出 OpenAPI 与严格 TypeScript 合同检查；不启动旧 CRM。见[本轮回执证据](../hackathon/evidence/dsh-g0-save-receipt-20261004.md)。

跨版本状态使用显式入口 `python3.14 scripts/dsh-b0/service-save-compatibility.py --baseline <full-old-commit> --candidate <full-new-commit> --output /absolute/new-evidence`。它导出两个固定 Git tree 的受限源码和合成 JSON，以独立进程执行真实服务路由及小型 SQLite 恢复；不接受数据库路径，不联网、不切换分支、不启动监听端口。当前验证 pair 为 `56198c32` → `a50bd424`，其他 pair 必须重新验证。回执 `status=PASS` 是观测完成，旧可写服务仍 BLOCKED、`release_ready=false`；具体见[兼容窗口](../architecture/first-purchase-service-compatibility.md)与[证据](../hackathon/evidence/dsh-g0-service-save-compat-20261004.md)。此入口需要两份 Git 历史及显式运行，不自动加入无 Git 的 clean B0 测试。

兼容门禁回归由 `pnpm dsh test` 统一执行；定向入口为 `node --test scripts/release/service-compatibility.test.mjs scripts/release/plugin-candidate.test.mjs scripts/release/release.test.mjs scripts/release/promotion-retry.test.mjs`。这些测试使用自有临时目录，实际走 pack/receive/install/activate/rollback 与 journal，验证错误版本、旧 writer、篡改/缺证据、特殊文件、绑定丢失和幂等重试；验证器测试夹具不冒充真实兼容回执。真实源码对观测需另运行上段命令，本次结果见[门禁证据](../hackathon/evidence/dsh-g0-service-gate-20261004.md)。

### 插件开发 kit 验证

#### 当前 kit 与固定包验证（2026-10-11）

当前 `plugin-kit.test.mjs` 真实打包并离线安装 kit，再通过已安装的公共 `bindToolchain` 严格编译自有合成领域消费者；它不读取九个业务插件源码，也不重跑各作者仓私有测试。`installed-kit-packs.integration.mjs` 消费既有准备回执的两包与七包输入，核对九包开发 kit 声明及 Workbench/funnel/waterfall 的领域锁。输入必须来自已审的正式包；只设置路径不等于材料已准备。

```bash
export B0_BUILD_UPSTREAM=/absolute/pinned-rc2-checkout
export B0_BUILD_TOOLS=/absolute/reviewed-build-tools
export DSH_PACKAGE_INPUTS=/absolute/fixed-domain-inputs
export COREPACK_HOME=/absolute/prepared-corepack-cache
export COREPACK_ENABLE_NETWORK=0
export COREPACK_ENABLE_AUTO_PIN=0
export FQ_B0_PYTHON=/absolute/python3.14
export CRM_COMPOSITION_PACK_INPUTS=/absolute/prepared/crm-inputs.json
export CRM_COMPOSITION_PAGE_INPUTS=/absolute/prepared/page-inputs.json
export CRM_COMPOSITION_OUTPUT="$(mktemp -d "${TMPDIR:-/tmp}/shinemage-kit-consumers.XXXXXX")"
node --test --test-concurrency=1 \
  scripts/dsh-b0/plugin-kit.test.mjs \
  scripts/dsh-b0/installed-kit-packs.integration.mjs
```

使用固定 Node 24.19.0、Python 3.14.4、pnpm 11.28.2 和上游 `477b4f42`；领域 tarball 必须匹配既有 `22245ab9…` 摘要。`CRM_COMPOSITION_OUTPUT` 是实际新建且非 symlink 的目录，`installed-kit-packs` 子目录不得复用；该子目录也纳入 pipeline 的启动前拒绝检查。缺 SDK 时 kit 合成编译会明确 SKIP/NOT_RUN，缺正式包则消费者失败，均不能报同次全部通过。最新实际 source-denied r2 为 13 PASS / 0 FAIL / 0 SKIP，五项坏输入和 pipeline 复用拒绝另记；相邻三个合同入口为 24 PASS，不相加。

以下十消费者、冷准备与版本试验描述保留较早执行时点。它们原来的十源码函数体已逐字节转存到 `scripts/dsh-b0/plugin-kit-source-fixture.legacy.mjs`；如需复现该历史夹具，使用显式 `node --test scripts/dsh-b0/plugin-kit-source-fixture.legacy.mjs` 和对应的完整固定输入，不能再把旧命令中的 `plugin-kit.test.mjs` 当作十消费者入口。本轮 legacy、缩减 SDK 路径、包管理器候选试验及完整 B0 均未运行。原记录不改写为本轮通过，当前证据见[kit 归属迁移](../hackathon/evidence/shinemage-installed-kit-pack-ownership-20261011.md)。

#### 固定包隔离验证（2026-10-11）

沿用上述已审的 `CRM_COMPOSITION_PACK_INPUTS`、`CRM_COMPOSITION_PAGE_INPUTS` 和固定 Python；另建实际、非 symlink 的结果根。包接收本身无需上游或 build-tools，不执行 peer 安装。四份归档分别写入 `package-isolation/<plugin>/`，成员和字节来自原正式 tarball；完整回执仅在四项都完成后生成。

```bash
export CRM_COMPOSITION_OUTPUT="$(mktemp -d "${TMPDIR:-/tmp}/shinemage-pack-isolation.XXXXXX")"
node --test scripts/dsh-b0/plugin-isolation.test.mjs
```

当前源码和 SDK/build-tools 拒读 r2 为 4 PASS / 0 FAIL / 0 SKIP。原源码构建与私有测试归作者仓，不由这四项替代；其实际运行记录按独立作者证据查阅。继续验证包的公开行为时，准备同样的显式固定 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS`，使用既有入口：

```bash
node --test --test-concurrency=1 \
  scripts/dsh-b0/leaf-pack-composition.integration.mjs \
  scripts/crm-calibration/crm-package.integration.mjs \
  scripts/crm-calibration/knowledge-package.integration.mjs
```

该组需要固定 SDK 可读；本轮在九份业务源码与九个作者仓拒读、仅 localhost 网络放行条件下为 29 PASS / 0 FAIL / 0 SKIP，HTTP/DOM 是合成夹具，不属于完整宿主、浏览器或严格 npm peer 安装。`leaf`、`crm-package`、`knowledge-package` 与 `package-isolation` 结果子目录均不得复用，后续完整 pipeline 必须另建新的结果根。六项坏输入和启动前复用拒绝见[原始证据](../hackathon/evidence/shinemage-fixed-pack-isolation-20261011.md)。

#### 较早开发 kit 执行记录

其中 `plugin-isolation.test.mjs` 的四源码构建描述也属于历史：原体逐字节转存到 `plugin-source-isolation.legacy.mjs`，只能通过显式 `node --test scripts/dsh-b0/plugin-source-isolation.legacy.mjs` 复现；当前同名测试只接收正式归档。本轮没有运行该 legacy 入口，不能把下面旧源码测试结果归给新包或当前完整 B0。

当前工具链 `dsh-b0-toolchain/v2` 区分 `upstream_pnpm`（官方固定源码构建）与 `pnpm`（自有插件/kit/build-tools）；必须是两个精确声明，旧 schema 不隐式推断。Node 24 下运行 `package-manager-env.test.mjs` 验证同一 shim 按 cwd 使用两套实际版本、13 个自有清单与冻结安装行为；调用 PATH 须能定位已安装 zstd，Corepack 缓存须预先含两个固定版本。SDK 首次准备记录两者，生产 runtime 的 provenance 仍记录上游版本。

变更 pin 会改变 SDK 身份，先用新目录显式 prepare，再将新 upstream/build-tools/Corepack 同时传给安装消费者测试；不沿用旧 closure 摘要或关闭身份校验。2026-10-07 的 v2 冷准备、故障修复、10 消费者和旧 SDK 兼容边界见[当前证据](../hackathon/evidence/dsh-g0-kit-manager-split-20261007.md)。该范围不替代完整 B0 pipeline、生产 runtime、WSL、供应链或远端 CI。

v2 缩减开发包只携带自有 `pnpm` 的完整版本目录；提取器先验证实际 manager 包名/版本，完整 SDK 的官方 manager 不随插件开发包传输。其消费者入口为 `node --test scripts/dsh-b0/plugin-kit.test.mjs`；`package-manager-env.test.mjs` 验证双 manager 准备环境，不能用只有插件 manager 的包运行并宣称双角色通过。当前同平台新包实测 **10/10、17 PASS / 0 SKIP**，closure/content/supply/boundary 四文件 **56 PASS**，真实 receive 负测 **4/4**；内容及 OSV 仍保持 PARTIAL/BLOCKED，见[v2 分发证据](../hackathon/evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。

`python3 -m pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py` 验证 SDK 本地归档的 schema/平台、路径/链接图、摘要、ZIP 目录/大小上限、失败 staging 回收和不覆盖已有目标；已纳入 B0 Python 测试清单。实际包通过 `sdk-archive.py pack/receive` 生成并恢复后，仍须将恢复的 upstream/build-tools 显式传给 `plugin-kit.test.mjs`，不能只凭 pack 的 LOCAL_READY 判定构建可用。生产 `secure-unpack.py` 仍拒绝符号链接；开发归档为独立合同且 `release_ready=false`，签名/秘密扫描/跨平台证据单列。

`scripts/release/sdk-content-audit.mjs --archive /abs/sdk.zip --sha256 SHA --root /abs/received-sdk --python /abs/python3.14 --output /abs/new-report.json` 是显式仓库级分发审计，不在日常 pipeline 内扫描真实 SDK；B0 JS 清单只运行其 synthetic 防护测试 `sdk-content-audit.test.mjs`。实际入口重新验证归档和已接收清单内容；报告不得写入 SDK 或覆盖旧证据。`BLOCKED`（疑似命中）/`PARTIAL`（覆盖缺口）退出 2，`PATTERN_SCAN_PASS` 也不开放发布。模式检查有 16 MiB 单文件上限；binary/非 UTF-8、Git 对象、原生模块及嵌套归档均明确列缺口，完整内容/签名/供应链须单独完成，不通过测试数替代。

缩减 SDK 使用 `scripts/release/sdk-closure.mjs --source /abs/received --destination /abs/new-sdk --archive /abs/sdk.zip --sha SHA --python /abs/python3.14` 显式生成；B0 仅运行 `sdk-closure.test.mjs` 的 synthetic 防护，不自动提取大包。`DSH_SDK_CLOSURE_SHA256` 是构建时显式输入；对应 `check.mjs --closure-sha256 SHA`，全部文件验证失败时禁止加载编译器，不能省略 Git 又省略 digest。`plugin-kit.test.mjs` 同时支持完整 checkout 和缩减目录，需在各自固定输入下实际运行 10/10 消费者，不能把单一路径通过算作双路径通过。缩减内容审计使用同一 `sdk-content-audit.mjs --root /abs/new-sdk --closure-sha256 SHA --output /abs/new-report.json`，与旧归档报告分开。

SDK 供应链使用 `node scripts/release/sdk-supply-chain.mjs --root /abs/sdk --closure-sha256 SHA --output /abs/new-report.json [--osv]`：默认离线生成 inventory 与 CycloneDX `bom`，`--osv` 显式发送安装依赖名称/版本并处理每个结果的独立分页，发送前限制 80 次请求。报告区分 requested/queried/completed/requests_sent 和逐包未查询/未完成状态；HTTP 错误释放响应流。只读验证固定输入，报告拒绝写入 SDK/别名或覆盖旧文件；未知响应、网络/TLS/超时和资源限额失败不能变成通过。包清单与声明的许可证不代表完整依赖图、整包摘要或发布者证明；`PARTIAL/BLOCKED` 均退出 2，`release_ready=false`。`node --test scripts/release/sdk-supply-chain.test.mjs` 只用 synthetic 输入/HTTP 替身，已接入 B0 清单和 release suite 自动发现；真实离线/在线、CycloneDX 结构检查、依赖公告及 17 文件来源核对见[2026-10-07 证据](../hackathon/evidence/dsh-g0-kit-sdk-supply-chain-20261007.md)，不得将在线检查加入每次业务插件构建。

缩减往返使用已安装 kit 的 `sdk-archive.py pack/receive --closure-sha256 <固定清单摘要>`；receive 另要求 `--sha256 <固定传输包摘要>`。复用上述 Python 测试入口，覆盖格式/双摘要、内外清单一致、原字节保留、链接逐段解析、篡改/限额/不覆盖和源目录输出拒绝。必须在新目录真实接收，再以接收目录的 upstream/build-tools/Corepack 和同一 `DSH_SDK_CLOSURE_SHA256` 跑 10 消费者；用 sandbox 禁止读取原 SDK/归档/旧依赖、禁止写接收 SDK。完整格式兼容测试与缩减格式证据分列；Mac 通过不代表 WSL 或供应链准入。

kit 自身的在线准备入口为 `node node_modules/@shine-mage/dsh-plugin-kit/prepare.mjs --destination /absolute/new-sdk-inputs`，可选 `--ca-file /absolute/public-ca-bundle.pem`。只接受新目录，固定官方 SHA/锁和工具版本；在独立 HOME/store 中安装并构建开发 SDK，不构建生产 runtime。该入口必须显式运行，不接入默认 doctor/check 或每次插件构建。`plugin-kit-prepare.test.mjs` 则只用隔离夹具验证环境、不覆盖、失败码、公共 CA 输入和中断/超时进程回收，已纳入 B0，不联网。

首次准备完成后，使用 `B0_BUILD_UPSTREAM=/absolute/new-sdk-inputs/upstream B0_BUILD_TOOLS=/absolute/new-sdk-inputs/build-tools node --test scripts/dsh-b0/plugin-kit.test.mjs` 验证实际安装 kit 的全部 10 个消费者。冷准备的真实记录另见[本轮证据](../hackathon/evidence/dsh-g0-kit-bootstrap-20261007.md)，包括首次证书失败及修复后的新目录、固定输入保护和仍未运行的目标平台层级。只有设置两个新路径才证明消费新闭包；不能沿用仓库 build-tools 冒充完整冷准备。

dev kit 输入预检在 Node 24 下显式运行 `node dsh-plugins/plugin-kit/check.mjs --upstream /absolute/pinned-rc2-checkout [--build-tools /absolute/identical-installed-build-tools]`。命令只读 source SHA/lock、工具版本和 SDK main/types 边界；不联网、不安装、不执行编译工具、不写插件链接。READY 仅表示本机 build inputs 可用，`release_ready=false`；缺项返回 BLOCKED/退出 2，不输出内部路径。实际构建继续调用同一 `bindToolchain` 的检查器，避免两套校验漂移。

`B0_BUILD_UPSTREAM=/absolute/pinned-rc2-checkout node --test scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/clean-build.test.mjs scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs` 验证实际 kit 打包/安全解包/public export 导入、SDK 边界负测、解包后叶子构建及原隔离回归；`plugin-kit.test.mjs` 已纳入 B0 pipeline。未设置 `B0_BUILD_UPSTREAM` 时须将真实解包构建记为 NOT_RUN，不能以其余包测试通过代替。kit 仍是 private 本地源码包，不含 SDK/已安装依赖，也未完成新机器分发。

后续 `plugin-kit.test.mjs` 已增加实际 pnpm 离线安装到新 store、无相邻 kit 的 shine-brand 构建、错误 kit 版本拒绝和 workspace 适配器幂等/拒绝外部安装。改动 `packaged-dependencies.mjs` 时同时运行 `scripts/dsh-b0/package-inputs.test.mjs`，保留图表领域 lock 校验，并拒绝把开发 kit 当成运行时领域输入；改动构建入口时同步核对 B0 pipeline 和 `scripts/release/preflight.mjs`。适配器只在正式 build 阶段运行，doctor/preflight `--check` 不创建链接。

包管理器兼容试验复用 `plugin-kit.test.mjs`：显式 `B0_TEST_PNPM_VERSION=<精确版本>`、独占 `COREPACK_HOME`，保留原 SDK 的 `B0_BUILD_UPSTREAM/B0_BUILD_TOOLS/DSH_SDK_CLOSURE_SHA256`。候选模式强制显式绝对路径的 upstream、build-tools 和 Corepack cache，缺项/相对路径在打包前报 `KIT_TEST_CANDIDATE_INPUT_REQUIRED`；默认模式保留缺 SDK 时的明确 SKIP，不能将其当成全消费者通过。缓存须预先按固定来源摘要准备；测试内禁用 Corepack 联网并验证实际版本，只改测试副本声明，不改默认 pin、上游或领域包锁。默认路径与候选路径分别运行 10 个消费者；`package-inputs.test.mjs` 验证 producer 对浮动/错 manager 的拒绝。2026-10-07 11.28.2/11.7.0 A/B、本次冻结安装及范围见[证据](../hackathon/evidence/dsh-g0-kit-pnpm-candidate-20261007.md)，修复后各 17 PASS / 0 SKIP 见[审修](../hackathon/evidence/dsh-g0-kit-pnpm-review-20261007.md)，不能把复用 SDK 的消费者通过当作 SDK 冷构建通过。

### 首购候选恢复验收

2026-10-07 的新 rc1 来源重建和同一恢复入口的三语料实测见[本轮证据](../hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)：官方固定源码与锁、host/native 构建、输入清单及运行前后摘要已保留，本机 12 场景/30 冷进程通过。它不证明旧杭州编译闭包、历史签名或新输入的 WSL 结果；没有自动重建/部署入口，也不更改 rc2 pin。

Node 24 下以 `B0_BUILD_UPSTREAM=/absolute/pinned-rc2-checkout node --test scripts/dsh-b0/recovery-model-gate.test.mjs scripts/dsh-b0/session-recovery.test.mjs scripts/dsh-b0/mock-provider.test.mjs` 验证故障代理、输出保护和官方 JSONL 冷读写；两个新测试入口已纳入同一 B0 pipeline。跨版本入口为 `node scripts/dsh-b0/session-recovery.mjs /absolute/new-output /absolute/rc2-modules /absolute/rc1-modules`，必须提供新输出目录和实际编译模块目录；缺 rc1 返回 PARTIAL/退出 2，子进程失败返回 FAIL/退出 1，不默认联网、构建或读取现有会话。

实际首购 Host 通过原 `test_analytics_first_purchase_official_host.py` 加 `B0_NATIVE_CRM_RECOVERY=1` 显式运行，沿用 v5 不可变包输入，与 browser 模式互斥。该阶段 WSL 整链 1 PASS、持久化 4/4 和服务兼容 14/14 的范围与原始日志见[恢复证据](../hackathon/evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md)。此模式锁定原候选的安全 UNKNOWN 行为，**不能当作业务任务终态恢复门禁**；恢复历史投影及活动名额释放的修复和新包验收见下段。该阶段未接入新的 release journal 事件。

工具持久化语料用同一 `session-recovery.mjs` 命令附加 `--corpus tool`，可省略 rc1 位置参数运行仅 rc2 部分（返回 PARTIAL/2）。默认 `--corpus text` 保留历史文本范围；tool 模式为显式 v2 回执，比较调用/结果/错误/meta 与官方恢复消息投影，未执行真实工具。本机四冷进程及负测见[工具语料证据](../hackathon/evidence/dsh-g0-session-tool-corpus-20261007.md)；后续杭州同一工具语料已实际完成四项跨版本矩阵、10 冷进程，见[目标机证据](../hackathon/evidence/dsh-g0-session-tool-wsl-20261007.md)。这不关闭媒体/委派等完整 corpus 或编译闭包来源证明。传输控制器需包含 `session-recovery-tool-corpus.mjs`；不能从本机结果推定目标或生产通过。

附件/委派元数据语料在同一入口使用 `--corpus rich`，为显式 v3 回执，第一轮 8 条事件、续写后 15 条（子会话 descriptor 只创建一次）。核对图片/文件引用、relay/notice 来源、会话头父级/delegationDepth、官方 descriptor/depth helper 和消息投影；附件存储/渲染、真实委派/模型仍 `NOT_RUN`。传输控制器须包含 `session-recovery-rich-corpus.mjs`，即使只运行默认 text/tool 也不能漏掉静态 import。相关冷恢复/篡改负测继续由上述 `session-recovery.test.mjs` 统一执行。

修复后终态门禁显式使用 `B0_NATIVE_CRM_RECOVERY=terminal`：要求 FAILED/EXECUTION_UNKNOWN、活动名额释放、相同请求不重复派发和原分析唯一；`=1` 仅保留旧包的历史复现。源码模式与固定包模式继续互斥。本机源码/官方 Host 的命令和失败日志见[投影修复证据](../hackathon/evidence/dsh-g0-native-journal-recovery-fix-20261007.md)。新候选 `a490457c…` 的本机固定包与杭州 WSL2 终态恢复均已实际通过，见[新候选证据](../hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md)。原始回执现已通过下述专用 verifier 接入 seq 5，服务目标 seq 4 与 Host 终态 seq 5 是两个独立事件，生产准入仍为 PARTIAL。

2026-10-07 新候选 `a490457c…` 已用原 v5/browser 入口在杭州完成 5/5 headless 场景、官方 Host 1 PASS；输入与执行记录见[当前候选浏览器证据](../hackathon/evidence/dsh-g0-first-purchase-current-browser-20261007.md)。原四包不重建；旧候选回执不继承。其新原始 observation 已通过显式 `dsh-browser-host-evidence/v2` 接入 `plugin verify-host`，关联终态 seq 5 并追加浏览器 seq 6；不向旧 v1 伪装父事件。封套增加 `terminal_host_event/collection/result_archive/completion_script`，核对固定来源、runner、原 archive 与 inventory、清理及逐项观测；定向入口 `node --test scripts/release/browser-host-v2.test.mjs` 已进入 release suite 与 B0 清单，详见[接线证据](../hackathon/evidence/dsh-g0-current-browser-gate-20261007.md)。字体配置原字节未取回，校验的是既定模板摘要与操作者记录；不证明供应链或真实生产准入。

同一 `plugin verify-host` 使用 `dsh-terminal-host-evidence/v1` 封套，只读取已封存的 `inputs/controller/inventory/runtime_archive` 相对路径与摘要，并要求同候选的 `service_target_event`。完整校验后追加 `CANDIDATE_TERMINAL_HOST_OBSERVED`；失败退出 2，重试不写文件。控制器固定已审查来源和历史 runner 字节，核对 HTTP 23 项、恢复 2 项、终态 run、会话前缀、原生回退和独立服务进程；不会执行包、安装依赖或联系杭州。定向命令为 `node --test scripts/release/terminal-host-evidence.test.mjs`，已进入 release suite 与 B0 清单；夹具只测校验器，不代表实际运行。原回执接线命令、一次真实 schema 适配失败及修复见[门禁证据](../hackathon/evidence/dsh-g0-first-purchase-terminal-gate-20261007.md)。保留 `release_ready=false`；原始事件正文/WAL 未在此命令中重新回放，哈希和断言属于未签名操作者观察。

独立插件更新的来源验收使用 `synthetic-source-http-target-input/v2` / `source-http-target-observation/v2`：`source_sha` 指向查询/保存服务源码，必须与 candidate 的 `service_compatibility.binding.source_sha`、两份服务归档一致；插件源码仍由 candidate/pack 自身核对，不能要求跟服务同一次提交。v1 保留历史同 SHA 约束，不能重标旧回执。两种输入都绑定完整 candidate digest、包摘要、固定 runner 和实际目标证据；新插件必须生成自己的 v2 目标回执，不能复制旧 PASS。`first-purchase-runtime-artifacts.test.mjs`、`source-target-evidence.test.mjs` 和 `test_first_purchase_source_target_probe.py` 覆盖该边界。


## v2 SDK 跨平台不可变领域输入（2026-10-08）

已有 `node --test scripts/dsh-b0/plugin-kit.test.mjs` 可显式设置绝对 `DSH_PACKAGE_INPUTS`，指向包含已锁定 `shine-mage-board-components-0.1.0.tgz` 的目录。原 archive 由三份消费者锁核验，board 重建只比较全部内容，消费仍用原 archive；拒绝错误路径、特殊文件和摘要漂移，执行后核对原包与锁字节。未设置时保留原自生成与精确 SHA 行为。

目标平台实跑仍同时需要 Node 24、固定 SDK/build-tools/Corepack 和缩减 closure SHA；缺少 SDK 时既有测试可能明确跳过部分消费者，不能将部分绿色结果报成十消费者通过。所有变量和本轮 WSL 命令、结果见[跨平台证据](../hackathon/evidence/dsh-g0-sdk-wsl-immutable-inputs-20261008.md)。此验证不准备生产 runtime、不激活服务，也不替代 SDK 内容/供应链放行。

## 独立作者输入与指标/知识目标观测（2026-10-08）

workbench 的日常独立入口见[作者 Quickstart](dsh-plugin-author-quickstart.md)：`author-inputs.mjs` 在新的源码外自有目录消费审核kit/领域原tar，生成开发锁并实际frozen离线安装。build使用同一固定SDK，包内test夹具可独立运行；发布包不携带作者入口、kit、夹具和开发lock。源内父目录symlink、已有输出、错误输入/锁/SDK摘要均拒绝，不修改发布manifest/原领域锁。改变kit的领域输入绑定时运行 `node --test scripts/dsh-b0/package-inputs.test.mjs`，本次12 PASS；改变resolver静态识别时运行 `node --test scripts/dsh-b0/plugin-boundaries.test.mjs` 和边界 `--check`，本次12 PASS，不能把未知动态resolver或runtime kit导入作为例外放行。

包内三份synthetic夹具由固定白名单和SHA加载，测试还与当前追踪的schema/spec/OpenAPI来源逐字节比较，避免副本悄然过期；独立夹具不能代替owner当前代码生成合同。真实作者工程在主仓源码不可读/外网禁用、SDK与领域输入只读条件下实际完成formal `pnpm build/test/test:built/pack`，结果和负测见[本轮证据](../hackathon/evidence/dsh-g0-plugin-author-inputs-20261008.md)。

指标/知识的受控目标验证器为 `scripts/crm-calibration/crm-services-target.py`，要求已审核input manifest与SHA、新owned输出、明确 `--phase install|http`；现场namespace/只读bind与权限由单独已审控制器提供，脚本不创建namespace、选择主机或默认连接远端。正常本地/CI后端入口会发现 `backend/tests/test_crm_services_target.py` 的20项隔离夹具测试（含输出别名、两套安装启动前漂移和TERM/KILL退出竞态），也可用共享bounded入口定向运行，**测试本身不连接杭州或启动生产服务**。本次WSL的2/2冷安装与15/15 HTTP、首次失败/恢复、清理和生产保护见[服务证据](../hackathon/evidence/dsh-g0-crm-services-target-20261008.md)；不能把新runner自动接入首购候选的专用verifier。

本轮未运行完整B0/release、真实身份/业务/浏览器UAT、远端CI或生产切换。官方新版本盘查为[BLOCKED_UPSTREAM_RELEASE](../hackathon/evidence/dsh-g0-sdk-upgrade-candidate-20261008.md)，SDK分发保持BLOCKED，不能将开发入口与固定服务synthetic通过当成供应链或发布放行。

本批提交 `1dae6de7` 的后续OCR审修与当次20/12/12/25结果见[审核记录](../hackathon/evidence/dsh-g0-parallel-followup-ocr-review-20261008.md)，已正常提交 `5bf2bc77`。验收器行为改变后另在新WSL隔离环境运行该提交原字节，同一两包 **2/2冷安装、15/15 HTTP/保护 PASS**，见[当前源码现场证据](../hackathon/evidence/dsh-g0-crm-services-target-ocr-wsl-20261008.md)。本地20项回归不算WSL测试，旧现场结果仍只对应旧执行SHA；该观测不授予生产/候选准入。

## 并发验证与SDK组成补证（2026-10-08）

当前插件包的 HTML 宿主入口为 `scripts/dsh-b0/html-host-browser.probe.mjs`，先用 Node24 查看 `--help`。它只消费事先核对的 `html-host-input-audit/v1`：固定官方 rc2 checkout/CLI/Web、immutable 8 成员插件包，以及与当前源码逐字节一致的独立作者输入。不会构建源码或准备 SDK。

运行前需已有 Python3.14 的合成后端测试依赖、Playwright 模块和可用的系统 Chrome；入口不安装这些环境。只读输入检查成功不等于浏览器、后端或整链已运行。

```bash
node scripts/dsh-b0/html-host-browser.probe.mjs \
  --input /absolute/reviewed-inputs.json \
  --output /absolute/worktree/.context/checks/new-owned-run \
  --python /absolute/python3.14 \
  --playwright /absolute/playwright/index.mjs \
  --check
```

`--check` 只读核验且不创建输出；明确需要运行隔离宿主时替换为 `--run-isolated-host`。默认使用空闲 loopback 4328，拒绝 6677、既有输出、输入别名/漂移/额外成员和调用者 Git 配置干扰。后端使用当前源码和自有小型合成库；原生对话使用显式合成响应及候选文件写入器，真实模型不由此放行。浏览器/宿主/HTTP 回收独立执行，HTTP 优雅退出、TERM、KILL 与外层总预算有界，日志失败不能跳过后续回收。`html-host-browser-inputs.test.mjs`、`html-host-browser-cleanup.test.mjs` 纳入 B0 显式清单；HTML helper 和 renderer 回归也由插件正式入口及 B0 自动收集。

本轮当前包 `285f882a…` 的官方宿主整链17项、独立 build/typecheck、35/129/2前端、25合同、10原生接线、56后端、32专项和独立renderer7项实际通过，见[当前包证据](../hackathon/evidence/dsh-g0-html-host-acceptance-20261008.md)。32专项是10 mounted、10输入防护、4清理、8renderer；与正式套件重叠，不累加为新的唯一测试总数。后端也按 `--noconftest -W error::ResourceWarning` 复验56项；完整B0、真实模型、WSL当前HTML包及生产未运行。

当前验收器统一处理 SIGINT/SIGTERM（禁用 Playwright 默认信号退出）、运行期180秒后取消并进入独立有界清理；解释器5秒、HTTP10秒且覆盖body、失败截图/文本独立限时。进入编辑后首选区等待iframe桥接就绪。修后cleanup8/inputs10与真实Host两种中断、正常17项已通过，见[提交前审修](../hackathon/evidence/dsh-g0-host-tool-ocr-review-20261008.md)。上段32项属此前阶段，不用旧计数代替新源码验证。

`scripts/dsh-b0/shell-tool-contract.test.mjs` 已加入B0显式清单。实际官方模块执行要求绝对 `B0_BUILD_UPSTREAM` 和新绝对 `DSH_TOOL_CONTRACT_EVIDENCE`；明确输入时修后12 tests/25内部场景通过。未设置时3个runtime/超时/中断测试是SKIP/NOT_RUN，9个输出边界/进程组/只读Git回归不能代替它们。2026-10-08 集成接续用固定上游和新证据目录实际跑过这 12 项，见[剩余准入](../hackathon/evidence/shinemage-abc-remaining-20261008.md)。该入口不prepare/build/install/启动Web、不连接模型或生产，45模块输入前后核对；编译artifact身份未验证。默认jobs超时promotion、timeout-policy清理与非硬中止、failure union及完整命令/故障证据见[合同报告](../hackathon/evidence/dsh-g0-shell-tool-contract-20261008.md)。仍须另补Web/模型/WAL/WSL/Windows范围。

`node --test scripts/release/backpressure.test.mjs scripts/release/operator-gate.test.mjs scripts/release/local-verify.test.mjs scripts/release/cli.test.mjs` 使用Node24，当前21 PASS；新五项回归也纳入现有B0显式清单和release自动发现。任务首失败后停止派发并等待在途任务结束；callback须自身有界，本地loopback请求带5秒时限并读完响应。这不是生产负载、15分钟SLI或十次插件更新证据，见[失败与回收](../hackathon/evidence/dsh-g0-backpressure-drain-20261008.md)。完整B0/release在此子项未重跑。

SDK补证使用现有只读 `sdk-content-audit.mjs` / `sdk-supply-chain.mjs` 及本轮有摘要的一次性离线组成/attestation控制器，不新增日常插件命令或运行全量prepare。pnpm来源验证显式补系统公开CA且保留TLS校验；禁网复验与拒绝矩阵通过。精确输入、控制器/原始响应摘要、保留依赖图/incomplete BOM及八类开放门禁见[本次补证](../hackathon/evidence/dsh-g0-sdk-trust-remaining-20261008.md)。能解码资产不证明无恶意内容、 ad-hoc签名不证明发布者，SDK保持BLOCKED。

### 2026-10-08 A/B/C 本地候选关联

集成提交 `bd647352` 已用既有 `pnpm dsh plugin candidate` 入口生成新 candidate/journal；profile 为原字节 `first-purchase-source-http-local`，固定服务源码 `f9726f68…`。当前 17 项包输入/candidate 合同通过，摘要链回读与 7 个不变运行成员核对通过。仅 `CANDIDATE_PREPARED`，不等于 service/host 验收、正式 CI 或激活；命令与回执见[本地候选证据](../hackathon/evidence/shinemage-abc-local-candidate-20261008.md)。
