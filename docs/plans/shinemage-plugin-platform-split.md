<!-- /autoplan restore point: "/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/main-autoplan-restore-20261001-161631.md" -->
# ShineMage 插件平台拆分与 DSH 独立升级计划

## 目标

把当前 `fuqing-crm-analytics` 的二开形态收敛为可维护的 ShineMage 插件平台：DeepSeek Harness 使用官方上游版本，业务插件按领域独立发布，profile 只负责组合版本，CRM/知识库/数据服务独立运行。插件更新不再重新打包 DSH、CRM、DuckDB 或知识库；DSH 升级也不再与每个业务插件和数据服务绑定为一次大版本发布。

本计划只覆盖架构拆分、合同抽取、仓库边界、独立构建/测试/发布和候选 profile 验收。真实杭州切换、Windows/WSL 重启、Cloudflare route、真实 DuckDB 数据迁移、GitHub 发布和删除旧运行时均不在本计划默认授权内。

## 当前执行依据（2026-10-03 全文复核）

本页后半部分保存多轮评审原文。**当前顺序以本节、当前实现账本和 Eng Review Rerun 3 的 D3–D8 最终答案为准**；历史 `Applied`/`Approval readiness: PASS` 仅代表决定已写入计划，不代表代码或验收通过。历史待答题和测试数不产生新的审批或当前通过结论。

1. 保留“官方 DSH 底座 + 各领域独立插件/服务仓”的目标；先在 workspace 证明边界，stop/go 后再物理分仓。首期 DSH 只阻塞 `0.1.7-rc.2`，`0.2.0` 为后续独立候选。
2. 先做 G0：T1 边界清单、T2/T17 精确宿主证据、T15 无业务叶子包、T13 状态路径，以及 T3/T7 的服务保存/回放矩阵。G0 不依赖尚未实现的 D15 UI 或 stop/go；可执行前置测试不因 T17 尚未通过而自我阻塞。
3. T15 的 workspace 解耦与独立 pack 在 G0/stop/go **之前**；物理仓库迁移在 **之后**。先选低耦合 brand 证明包边界，再验证 D15 workbench 包；实际迁移顺序为 brand → board-components → CRM adapter → query/cockpit/workbench，最终以 T1 DAG 复核。
4. D4-C 保留 durable save 目标，但只有服务状态、candidate/correlation/idempotency 和 forward-fix/重放矩阵通过才进入首个 D15 candidate；否则显示保存禁用及原因，只交付可核对结果。
5. D7-A 保留首个可交付 candidate 的完整签名/SBOM/CVE、canary、回退、灰度与 RACI 门禁。**G0 本地 pack 可以先生成 PARTIAL 回执，不能因此删掉完整候选门禁**。catalog、物理多仓、杭州切换及 0.2.0 激活仍后置。
6. T17 未证明同进程隔离；保留旧 active 指针不等于旧进程仍健康，也不等于业务数据回滚。必须分别证明可用性、受控重启、WAL 恢复和服务状态处理。
7. T21 目前生成不可变 pack/profile/capability/journal 回执；`plugin verify-host` 可追加与候选一致的本机宿主观测，不能激活宿主。T17 独立 opt-in harness 已验证本机原生会话与重启回退；生产 canary、runtime install、远端 WAL/回退仍为 `NOT_RUN/NOT_AVAILABLE`。

全文核对与本轮代码修复证据见 [2026-10-03 审查修复记录](../hackathon/evidence/dsh-g0-review-fixes-20261003.md)。未关闭的实施项沿用 T1–T23，不新增重复规划或再次询问已回答的选择。

### 2026-10-08 宿主、工具与供应链并行推进

按用户授权在当前工作树从 `5bf2bc77` 继续，保留既有六项文档；三个独立边界为当前HTML包的完整宿主链、官方shell/tool执行合同、固定SDK组成/信任。主Agent统一集成测试清单与事实，不另建计划或修改旧candidate/journal。

T15 当前 HTML 包 `285f882a…` 的8成员、574份源/独立作者输入均匹配，固定官方 rc2 + headless Chrome 完成 **17/17 PASS**。空会话首个tab、卸载取消、raw-block范围与完整document投影/资源替换修复后，actual candidate 写入、收取、预览、确认v4和版本回读均实跑。正式独立 build/typecheck、35/129/2 前端、25合同、10原生接线、56后端、32专项和独立renderer7项通过，清理与CI入口核对留证；详见[当前 HTML 包证据](../hackathon/evidence/dsh-g0-html-host-acceptance-20261008.md)。源/hash/node_map与CSP/sandbox保持；后端为当前源码夹具，模型为显式synthetic writer。真实模型、headed/移动/读屏、该包WSL/生产继续NOT_RUN，T15仍PARTIAL；旧失败和旧候选不覆盖。

T2/T17官方模块子项使用真实固定Context/ToolRuntime/bash/jobs与timeout-policy，正式11 tests、内部25场景PASS，45输入与官方Git保持。14命令/15PGID回收，超时/中断和主进程退出后代回收已故障验证。默认jobs promotion不是kill，policy等待清理并不提供同进程硬中止；Web/模型/WAL/WSL/Windows和编译attestation继续NOT_RUN/NOT_VERIFIED。见[本机合同证据](../hackathon/evidence/dsh-g0-shell-tool-contract-20261008.md)，T2/T17整体PARTIAL。

并发验证器首失败后继续派发且提前返回的问题已真实复现并修复，实际HTTP回归在内的21项通过；本地请求加有界时限并读完响应。见[本次证据](../hackathon/evidence/dsh-g0-backpressure-drain-20261008.md)。这只是T10/T16的验证器子项，不代表15分钟SLI、业务容量或T18十次更新。

T5/T19/T15补全部26,195文件归属与361组件incomplete BOM，pnpm11.28.2的构建/发布身份、六项拒绝和禁网复验通过；67项证据、30,546条SDK输入保持。17不透明项的有限解码/静态属性不替代安全审查，完整SBOM/其他身份/撤销/上游29公告等八类范围继续BLOCKED，见[精确补证](../hackathon/evidence/dsh-g0-sdk-trust-remaining-20261008.md)。未再次prepare SDK，不把SDK维护绑定每个插件更新。

### 2026-10-08 前两组续推

后续对本批提交 `1dae6de7` 完成 OCR delegate 和额外排除文件核对；3项验收工具问题已修复，本次bounded20/领域输入12/AST边界12/HTML合同25及清单检查通过，正常hooks提交 `5bf2bc77`。提交时修后runner现场WSL为NOT_RUN，旧2/2与15/15只属于原执行快照；见[本次审修证据](../hackathon/evidence/dsh-g0-parallel-followup-ocr-review-20261008.md)。

随后按队列用 `5bf2bc77` 的验收器原字节、同一指标/知识服务包及固定wheel，在杭州新自有namespace完成 **2/2冷安装、15/15 HTTP/保护 PASS**（3.268/4.770秒）；73项新证据与135项旧证据完整核对、4进程回收，生产current/监听PID及原候选/pin保持。见[修后现场证据](../hackathon/evidence/dsh-g0-crm-services-target-ocr-wsl-20261008.md)。只关闭新版runner现场子项，不将本地20项负测算作WSL套件；产品与SDK供应链/生产准入门禁不变。

从干净 `68845ad0` 按已有队列并行推进，不新建规划。官方最新三个 release、默认 master 与 npm 发布索引已重新读取：尚无去除已知29条公告的官方候选，`BLOCKED_UPSTREAM_RELEASE`；26 bindings、29实际import、12slot和两profile探针只有静态/拒绝证据，没有安装或运行新宿主。固定 rc2 pin 和上游原字节保持，见[候选盘查](../hackathon/evidence/dsh-g0-sdk-upgrade-candidate-20261008.md)。

指标与知识同一不可变服务包已在杭州自有namespace分别冷安装14/13项离线依赖，**2/2安装、15/15 HTTP与保护观测**通过。验证器首次依赖atexit导致SIGTERM缺凭据，原失败保留；改为同步记录guard/禁止attempt并区分正常退出后重新冷安装。4个自有进程回收，生产current与5个监听/PID保持。详见[目标证据](../hackathon/evidence/dsh-g0-crm-services-target-20261008.md)。关闭这两个fixed synthetic包的目标安装子项，不关闭生产准入、供应链或其他源码范围。

后续按既有门禁补未覆盖宿主/UI/真实身份/生产形状和生产receive/reconcile/canary/回退，stop/go后物理分仓。SDK维护保持独立于每次插件更新；SDK分发BLOCKED、产品PARTIAL。

作者入口与共享夹具亦已收口：独立开发父目录只消费审核后的kit/领域原tar，实际frozen离线安装；三份synthetic夹具固定在插件测试包内，同时检查owner字节漂移。正式build/typecheck与35基础/111 HTML/2产物/25合同通过，kit全10消费者回归20 PASS、package-inputs和AST边界各12 PASS，均0 skip。源码内祖先symlink写入经隔离复现后修复并独立复核，运行tar仍8成员且不含开发kit/测试夹具；见[作者证据](../hackathon/evidence/dsh-g0-plugin-author-inputs-20261008.md)与[综合审修](../hackathon/evidence/dsh-g0-parallel-followup-review-20261008.md)。没有将完整宿主维护或CRM数据库加入每次插件发布。

### 2026-10-08 v2 SDK 目标平台与来源收口

按用户要求并行推进三个有独立边界的任务，主 Agent 顺序集成。SDK 缩减和 HTML 修复已分别本地提交 `d78c7cd5`、`e48a6ad3`，未 push。

T15 新 Linux SDK 在既有 WSL2 工具链、全新 HOME/store/Corepack 中实际准备 READY（256.411 秒），完整及缩减包往返通过；同一缩减包离线、非 root、只读隔离消费 **10/10、20 PASS / 0 FAIL / 0 SKIP**。首次失败定位到 gzip/zlib 跨平台压缩字节差异，修复验收器为消费同一原 tar、独立重建核对全部内容；原锁不变。见[目标验证](../hackathon/evidence/dsh-g0-sdk-wsl-immutable-inputs-20261008.md)。这不关闭整台干净机器、其他服务目标安装或生产验收。

来源复核关闭历史签名密钥日期疑点及 17/17 文件来源字节，仍有上游 7 个版本/29 条公告；修复候选尚未安装/验证，完整组成、发布者身份/撤销与二进制安全继续阻断 SDK 分发。见[信任与依赖证据](../hackathon/evidence/dsh-g0-sdk-upstream-trust-20261008.md)。后续可并行官方升级/信任、其他服务目标安装和插件作者入口，候选/journal 集成仍单一 owner；剩余宿主/UI/真实身份/生产形状、现场 receive/reconcile/canary/回退之后按 stop/go 物理分仓，不为每次插件修改重跑官方 SDK 维护。

### 2026-10-08 HTML 历史差异收口（已提交 `e48a6ad3`）

旧工作树 43 项已核对，34 语义项全部归类并修复两文件真实遗漏及测试入口问题；不是 34 个待开发功能。应用后固定 SDK 正式 build/typecheck、35 基础/111 HTML/2 产物测试通过，51 后端与5旧语义兼容通过，详见[本次证据](../hackathon/evidence/dsh-g0-html-semantic-integration-20261008.md)。本步不改上游/接口生成物、不回灌旧布局，不认证浏览器/真实模型/杭州 HTML 运行；私有依赖直接 pnpm 入口与独立测试夹具供给的后续收口见上节。旧树保留。

### 2026-10-07 v2 SDK 分发复验（已提交阶段）

前批工具链拆分已提交 `fd3ed8b6`。本轮从该干净基线继续 T15，插件 SDK 只携带固定插件 manager，官方准备环境保持两套版本；64.97 MB 新包实际往返后在原输入不可读/禁外网/只读条件下 10/10 消费者通过（17 PASS），防护 56 PASS、接收负测 4/4。新字节审计仍 0 命中/17 缺口，222 个版本查完后上游 7 个版本/29 条公告 BLOCKED；17 项来源重核不代替签名时效与二进制安全。已核对归档首轮可选依赖缺失和新副本恢复的 `input-recovery.json`，明确留证，不冒充完整冷下载。见[本轮记录](../hackathon/evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。本轮代码/文档经限定范围审查后随本次本地提交收录，T15 整体 PARTIAL，2026-10-07 阶段未操作杭州；继续官方依赖候选/信任，再做目标平台与 stop/go 后物理分仓。

### 2026-10-07 官方与插件工具链拆分（已提交阶段）

从已提交 `7efb5207` 继续 T15：v2 明确官方 `upstream_pnpm=11.7.0` 与插件 `pnpm=11.28.2`，更新自有包/准备入口/CI/回执来源，官方固定 SHA/锁不改。已安装 kit 在全新目录实际准备 SDK READY（552.808 秒）；旧 kit/SDK 可用，新 kit 拒绝误用旧身份。证据和实际消费者结果见[本轮记录](../hackathon/evidence/dsh-g0-kit-manager-split-20261007.md)。本批经提交前局部审查后按授权本地提交，未操作杭州，T15 整体仍 PARTIAL；接着核对新 SDK 的缩减分发与供应链，再做目标平台。官方升级、业务插件更新和服务部署保持独立。

### 2026-10-07 pnpm 候选兼容增量（已提交阶段）

从 `efbf5417` 干净基线继续：固定 11.28.2 候选与旧 11.7.0 各 10/10 消费者、16 PASS；图表包摘要/锁保持，边界 25 PASS。另完成空 store 的 111 包冻结安装及安装后严格类型检查。只关闭 T15 的插件开发侧 manager 候选验证，默认 pin/SDK 未替换；后续 OCR 修复候选漏传 SDK 时的绿色跳过，新旧各 17 PASS / 0 SKIP，见[审修](../hackathon/evidence/dsh-g0-kit-pnpm-review-20261007.md)。随本次本地提交收录，未操作杭州。下一步分别表达官方 DSH 声明与我方插件 manager，受控迁移准备入口/CI/SDK，不能改上游 packageManager 来绕过校验。见[本轮证据](../hackathon/evidence/dsh-g0-kit-pnpm-candidate-20261007.md)。

### 2026-10-07 上一阶段收口与执行顺序

SDK 归档/供应链原始 13 文件及新增审修记录已核对，三项扫描器问题修复；本次 53 项 Node、27 项归档/41 subtests 通过，随本批本地提交收录。SDK 查询仍 10 个版本/42 条公告 BLOCKED；pnpm 11.28.2 是下一隔离兼容候选，官方 DSH 0.2.0-rc.2 的锁仍含受影响依赖，不能仅改版本号。先收口工具链/官方升级与信任，再做目标平台 SDK/其他服务和剩余宿主/UI/生产形状验收，stop/go 后物理分仓。各线可并行准备，共享 candidate/journal 顺序集成。详见[本批审修、任务表和初衷核对](../hackathon/evidence/dsh-g0-kit-sdk-supply-review-20261007.md)；历史阶段的“未提交/NOT_RUN”按其日期理解，不能覆盖后续已完成子项。

### 2026-10-07 结果年龄策略收口

当前产品采用历史结果快照，不按年龄失效；需要新数据重新查询。陈旧/过期阈值不再是本轮待办或发布阻塞，不新增替代到期系统。保留生成时间/来源、保存时身份与候选准入/冲突/幂等校验，以及现有无年龄策略 `NOT_CHECKED` 合同；不删除旧时效字段/兼容分支或取消 session/请求超时。后文历史 D9、Eng freshness 决策按各自日期保留，当前任务 T3/T7/T14 的年龄要求以本节和[保存准入](../operating/first-purchase-save-admission.md)为准，不能重新要求用户提供阈值。实现核对及本次验证见[收口证据](../hackathon/evidence/dsh-g0-snapshot-policy-closeout-20261007.md)。

## 已确认的事实与约束

- 最初迁移盘点基线为 `main@fcbd1324`；本次修复从公共仓库 `main@d4261aa3` 开始。前置审核修复在独立分支 `codex/plugin-boundary-review` 为 `f55908df`，当前工作区为 `/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`。本次本地提交包含后续 CRM 解耦增量与 2026-10-04 OCR 修复，准确 SHA 以 Git 为准，审核证据见[提交前审核](../hackathon/evidence/dsh-g0-crm-review-20261004.md)。本地提交不等于 clean reviewed release artifact 已重建；原公共 main 及其修改保留。
- 当前项目固定 DSH `0.1.7-rc.2`，上游 SHA `477b4f420553e8a52c2fbccc464d7561b239c443`；官方候选 `0.2.0-rc.2` 是另一条兼容线，不能只改一个版本号。
- 当前业务包至少有 `analytics-workbench`、`crm-knowledge`、`knowledge`、`shine-brand`、`shine-board`、`shine-query`、`shine-funnel`、`shine-waterfall`、`shine-crowd-action`；它们仍在同一仓库内，叶子构建已改用 workspace dev-only `plugin-kit`，pin/build-tools 已归 kit 所有；图表 6 条引用已迁至固定 tarball 的公共导出；CRM 原 5 条跨包源码/类型引用已全部解除。2026-10-04 合成查询/知识解释改为分别配置的 HTTP API 1.0.0，插件不再依赖本仓 Python 路径；服务源码与知识资源的 authoring 输入仍在本仓，但已按领域清单分别打成独立应用候选，并在最小依赖的隔离进程中运行；CRM 与知识插件现已在 workspace 拆成两个本地候选包，各自 build/test/pack，profile v3 独立选择；物理分仓、平台依赖冷安装与宿主/发布验收未完成。
- 目标 bundle 验收必须保持 `package.json`、`dsh.bundle.patch`、构建产物、精确 `files/exports`、DSH/Cordis peer 合同和 `./invariant` 验证；bundle 变更后按官方合同重启 profile 生效。
- 保留 DSH 原生 Web/单一 Agent Loop/会话/工具合同；插件只能通过官方 bundle、client、slot、service/provider/consumer 合同扩展，不复制或修改 DSH 上游源码。
- 后端、知识库、DuckDB 和生产密钥属于服务/数据层，不随插件 npm 包发布；测试只能使用 synthetic fixture 和隔离小库。

## 当前实现账本（2026-10-06）

本计划已进入首期 workspace 垂直切片的实现阶段。下面只记录本工作树实际证据；后文的评审记录保留为历史决策，不覆盖这张账本。

2026-10-04 的服务门禁经 26/26 文件审核修复，以 `809a9367` 本地提交；其后独立首购服务包与同版本恢复验证见[服务包证据](../hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。2026-10-05 已用旧 `56198c32` / 新 `a50bd424` 的实际 archive，在两个新 venv 离线 hash wheel 冷安装并完成 **9/9**；共享后端 **25 PASS**（内部 8 个包集成场景）、SIGTERM 回收通过，见[最新配对证据](../hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)。这轮仍未提交；新 artifact 回执尚未接入门禁，只证明本机 Darwin arm64，T3/T7/T15 与目标 WSL/生产/供应链验收继续 PARTIAL。

提交前追加 OCR delegate：原始 **21/21** 文件覆盖，修复 Git replacement 与取消回收两个问题；修复后共享后端 **25 PASS**（内部 10 个包场景）、实际双包 **9/9 PASS**，见[审核记录](../hackathon/evidence/dsh-g0-service-artifact-review-20261005.md)。已通过正常 hooks 提交为 `82c1f5cd`；上段“未提交”和 8 场景为当时的实现阶段状态。

提交后新增 `plugin verify-service`：候选/profile/源码证据、实际双包与依赖观测核验后，沿用原 journal 幂等追加本机结论。新门禁 **29 PASS**、release suite **199 PASS**，实际 CLI 重试与 3 项篡改拒绝通过，见[接线证据](../hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)。这批增量尚未提交；`release_ready=false`，不关闭目标主机和供应链门禁。

本次 OCR 接线审核已覆盖原始 15/15 路径，并补审 state owner 的修复。已核对并修复 journal 前置关系、特殊文件阻塞和错误内容回显；4 项复现负测修复后全通过，完整 release suite **206 PASS / 0 SKIP**，实际双包 CLI 重试通过。见[审核证据](../hackathon/evidence/dsh-g0-service-artifact-gate-review-20261005.md)。目标主机、供应链和激活条件保持未关闭。

上述接线及审核修复已本地提交为 `1b443646`。2026-10-06 的下一步增量增加只读 `plugin service-preflight`，在安装前检查目标 Python/WSL2 和固定 wheel 的 ABI、平台、Requires-Python；24 项测试和本次 206 项 release suite 通过。实际 Mac 检查正确 BLOCKED，不写 journal、不闭合目标主机门禁，见[预检证据](../hackathon/evidence/dsh-g0-service-target-preflight-20261006.md)。下一步仍为目标平台冷安装、身份/状态注入与服务恢复回执。

提交前 OCR 已覆盖上述原始 11/11 文件。已核对并修复 wheel 安装格式/标签和 active Requires-Dist 两类问题；6 项复现负测修复后通过，当前专项 **35 PASS**、完整 release suite **206 PASS**，实际 13 个 wheel 检查通过，Mac 的 WSL2 阻断保留。见[审核证据](../hackathon/evidence/dsh-g0-service-target-preflight-review-20261006.md)，未关闭任何现场门禁。

预检批次已本地提交为 `79434033`。随后只读取得杭州 WSL2/x86_64/Python 3.14.4 的实际平台标签，在本地下载并校验同一服务清单的 13 个固定 Linux wheel；准备阶段尚未运行目标服务，见[平台准备证据](../hackathon/evidence/dsh-g0-service-target-platform-20261006.md)。

同日继续完成首购服务实际 WSL **14/14** 合成验收：固定旧/新包、两个独立离线 venv、权限/保存/冲突、SIGKILL 恢复、旧只读、forward-fix、备份恢复和未知 schema 拒绝。夹具目录权限遗漏修正后在新目录重跑，失败记录保留；成功轮次 10 个、失败轮次 1 个临时进程均回收，安装目录已清理，生产入口监听/PID 未变。见[现场证据](../hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)。现场阶段该记录尚未接入候选 journal，不关闭真实身份/时限、供应链、DSH 宿主或其他服务门禁；没有生产安装或切换。

上述 WSL 记录经 OCR delegate **7/7** 覆盖，修正数量/时间范围表述并核对原始证据后，本地提交为 `2a89790b`。提交后的目标接线扩展现有 `plugin verify-service`，绑定固定输入/runner/日志/清理与原候选 journal；新增 **37 PASS**、完整 release suite **243 PASS**，已有真实回执进入 seq 4，重试及 108 文件不变通过，见[接线证据](../hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。接线代码尚未提交，现场回执未改写；未签名合成观测仍不能放行生产身份、供应链或激活。

提交前补充审核已覆盖上述原始 **14/14** 文件（含 OCR 未选中的 8 份文档），没有确认新缺陷；本次 release suite **243 PASS**，真实 WSL 回执经本地 CLI 再核验，原输入和 journal 保持不变。见[审核记录](../hackathon/evidence/dsh-g0-service-target-gate-review-20261006.md)。接线批次按正常 hooks 本地提交，再从固定 clean SHA 运行候选 preflight；不把审核通过等同生产放行。

2026-10-06 的接线已提交 `356862bf`。随后在完整候选链实际修复代理透传、pnpm 重复准备、合成 key 扫描和 profile 测试环境四处问题；最终 clean SHA `9902bdd9` 的八阶段 preflight **PASS**（release 244 项），两份 CRM/知识独立包与官方 rc2 本机宿主 **10/10 PASS**。各自 journal seq 3 的幂等核验通过，见[最终本机候选](../hackathon/evidence/dsh-g0-clean-candidate-20261006.md)。这不关闭目标 WSL runtime、首购保存服务、生产身份、供应链或 G0/stop-go；上述“尚未提交”为各自历史阶段。

2026-10-06 完整增量复审 **22/22** 覆盖，251 个不同用例通过，修正两处文档状态；见[审核记录](../hackathon/evidence/dsh-g0-candidate-full-review-20261006.md)。该批已提交 `2be518e5`，随后生成 clean 首购服务候选并完成源码/实际离线包各 **9/9 PASS**，见[本机证据](../hackathon/evidence/dsh-g0-service-clean-candidate-20261006.md)。

后续在 clean 插件来源 `78779206` 重新构建首购插件，绑定同一 `2be518e5` 服务包；本轮相关 **100 PASS / 0 SKIP**，新服务双包实际杭州 WSL 合成验收 **14/14 PASS**。新回执经既有 CLI 进入 candidate journal seq 4，重试及 129 文件不变、旧目标回执误用拒绝、生产激活阻断均已验证，见[接线与现场证据](../hackathon/evidence/dsh-g0-service-candidate-binding-20261006.md)。10 个临时进程已回收，生产监听/PID 不变；生产身份/候选准入、时限、供应链及目标 DSH 宿主仍开放。

上述 clean 绑定批次经 OCR delegate 审修后已通过正常 hooks 提交 `c95751f8`。下一步本地增量补齐首购服务 owner 的同步身份接口、身份/策略故障脱敏及撤权边界，保存/恢复 **74 PASS**、实际独立包场景 **1 PASS**，见[身份接缝证据](../hackathon/evidence/dsh-g0-service-identity-boundary-20261006.md)。本批完成 **8/8** 提交前审核，正常 hooks 提交 `80aba9c1`；随后该 clean SHA 的源码兼容与实际离线包各 **9/9 PASS**，新候选 `4e49cc04…` 经现有 CLI 记入本地 journal 第 3 条事件，重试不改 58 文件。插件 tarball 与上次逐字节相同，未重建 DSH/插件；旧 `2be518e5` 固定包与回执保留。随后同一 `80aba9c1` 包已另行完成 WSL 合成 **14/14 PASS**，真实 CLI 绑定 journal 第 4 条事件，重试不改 131 文件，旧 129 文件保留；10 个自有进程与目录已回收、现役监听不变。生产认证、真实候选 allowlist 与时限仍开放，T3/T7 不改为完成。

继续按用户确认复用现有 CRM 管理员身份：可选服务 adapter 只消费既有 `/api/v1/auth/me`，不共享 CRM 实现、不新建账号/密码或扩展 DSH。每次重新认证、总 I/O 超时、严格响应上限和失败拒绝已在本地验证；五文件 **134 PASS**，实际独立包 **1 PASS**（含 5 项 adapter 观测）。见[CRM 身份适配证据](../hackathon/evidence/dsh-g0-crm-identity-adapter-20261006.md)。OCR 审修已修复旧写入口绕过准入，正常 hooks 提交 `7edf7710`；其 clean 服务包另完成源码/实际离线包各 **9/9 PASS**、同一 archive adapter **5/5 PASS**。这是新的服务包，不是上述 WSL 包；新插件候选绑定、真实 CRM 现场接入与生产时限仍未完成。

2026-10-06 当前用户决定覆盖此前 freshness 规划：**陈旧/过期判断暂缓**，不再以生产时间阈值待确认阻塞接入。服务端显式 `check_freshness=False`，响应和持久来源记录 `NOT_CHECKED / DISABLED_BY_POLICY`，阈值/截止时间为 null；权限、候选准入、来源、幂等与 SAVE_UNKNOWN 恢复不放宽。实现阶段源码 **163 PASS**、实际独立包两种模式 **2 PASS**，见[时效决定与验证](../hackathon/evidence/dsh-g0-save-time-policy-20261006.md)。后文历史 D9 保留决策轨迹，当前实施边界按本段及保存准入文档执行。

该实现已正常提交 `48e7ddfc`，新 clean 源码/实际离线双包各 **9/9 PASS**，新候选 `9f00fadb…` 绑定服务包 `8f096a13…`。本轮构建及相关 **95 PASS**，同一包的 CRM 合成身份、关闭时效、保存与状态重新打开回放 **6/6 PASS**，实际响应通过插件 decoder。新双包在杭州 WSL 固定 A64/开启时效场景另完成 **14/14 PASS**，journal seq 4、重试 131 文件不变；10 个临时进程与本次目录已回收、现役监听/PID 不变。已核对[本次候选证据](../hackathon/evidence/dsh-g0-save-time-policy-candidate-20261006.md)与[任务账本](../hackathon/TODOS.md)：只关闭这些具体子项，真实 CRM 接入、目标关闭时效链、DSH UI/浏览器、供应链和物理分仓仍未完成，T3/T7 保持 PARTIAL。

2026-10-06 保存 UI 增量：CRM 的可选会话 lease 通过生成合同连接 workbench 公开保存 adapter；原生壳不变、默认禁用，卡片不再走旧 `/b0/analyses`。当前相关后端 132 PASS、审修后 Node 51 PASS、编译卡片 7 PASS、真实 HTTP 链 1 PASS（7 项观测）；已核对[实现/审核证据](../hackathon/evidence/dsh-g0-save-ui-20261006.md)。T9/T14 只关闭本地接线子项：该阶段仅验证固定 synthetic-demo；后续可选归属接缝见下一段，实际宿主 Cookie/路由、headed 浏览器和新 clean 插件包仍未验收，不能视为生产保存已启用或 G0/供应链已完成。

2026-10-06 查询归属增量：显式 CRM session 模式复用现有 Host bridge 与服务身份检查，真实 HTTP 合成链已覆盖登录、worker 查询、同账号保存及 ACK 恢复；原生 session owner 不重绑，服务暂不可用只暂停原任务。已核对[本轮证据](../hackathon/evidence/dsh-g0-native-crm-owner-20261006.md)。T3/T9/T14 仍 PARTIAL：Host 接收器为夹具，旧 B0 gateway 不是 CRM 登录入口；实际官方宿主/admission/Cookie/浏览器、clean 候选、供应链与目标主机仍开放。

后续已完成 `c7bbf3ae` 运行中身份故障审修，并通过固定官方 Host 的 CRM/首购 HTTP 整链 **1 PASS**：实际原生 loop/worker、Cookie/Origin、保存 ACK 恢复、同 authority 重启与重新登录；启动保护/model adapter **7 PASS**。已核对[独立宿主证据](../hackathon/evidence/dsh-g0-official-crm-http-20261006.md)。这一步替换了原来的受控 Host 调度接收器，当时查询准入仍由私有测试驱动器发起。

原生准入从 `f3b7c0cc` 继续，使用官方 commands 服务，不抢占共享 RPC 或输入框；新增查询/status/精确取消，并修复空会话反馈及卡片跨插件开关依赖。新 HTTP 整链 **1 PASS**，Chrome headless **1 PASS / 5 项观测**，命令/编译卡片 **12 PASS**、相关后端 **35 PASS**；未连接 CRM 的普通原生对话可用。后续 OCR **27/27** 文件复核修复浏览器异常清理，8 项保护测试与 Chrome 五项重新通过，见[本轮证据](../hackathon/evidence/dsh-g0-native-command-browser-20261006.md)。T3/T9/T14 仍 PARTIAL：当时仅完成本地源码合成验证，后续 clean 候选见下一段；headed/移动端/无障碍、真实模型、目标环境与生产 gate 保持开放，不继承旧包/WSL 回执为新源码通过。

上述原生命令批次正常 hooks 提交为 `9611589c`，从其 clean SHA 新建 workbench 与独立服务候选。源码/实际双包各 **9/9 PASS**、相关 **106 PASS**、同包合成 CRM/NOT_CHECKED 保存 **6/6 PASS**；候选 `ca79774b…` 的服务回执进入 seq 3，52 个当前文件与 195 个旧证据保留，旧 WSL 回执拒绝。见[本次候选证据](../hackathon/evidence/dsh-g0-native-command-candidate-20261006.md)。当时未验证精确插件包组合；后续进展见下一段，现有 verify-host 的 CRM + knowledge 范围不变。

继续从 clean `d3fe7f94` 打包 CRM，与旧 workbench tarball 组成显式隔离输入。实际加载解包后两个插件，官方 HTTP **1 PASS**、连续 Chrome **1 PASS / 5 项观测**，保护/model **21 PASS**、受影响后端 **3 PASS**；修复演练 SDK 链接/TIME_WAIT/EOF 归因，包内容、83 个旧候选文件与 journal 保持不变。见[精确插件包证据](../hackathon/evidence/dsh-g0-first-purchase-artifact-host-20261006.md)。该阶段服务/查询内核为源码夹具；后续保存服务 archive 组合见下一段，新包目标环境和生产门禁保持开放。

2026-10-07 从 clean `212005bc` 继续，原三个包未重建。保存服务 archive 已在独立离线 venv/进程接入同一官方 Host/Chrome，artifact HTTP 与 Chrome 各 **1 PASS**（5 浏览器场景），保存进程同端口重启后经 Host 重放同一请求，分析仍一条；旧 workspace **1 PASS**、保护/model **27 PASS**、后端 **5 PASS**。已核对[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-service-host-20261007.md)。关闭本机保存服务包组合子项；查询 kernel/worker 仍为源码夹具，目标环境、供应链/生产门禁不变，437 个旧证据文件/journal 保留。

2026-10-07 上一批组合驱动已提交 `09080b77`；复用 `f9726f68` 同一 archive，实际杭州 WSL 新来源 HTTP/同版本恢复 **10/10 PASS**，新输入保护 **7 PASS**。5 个服务进程与 1 个 worker、临时目录已回收，生产监听/PID 未变。见[本轮目标证据](../hackathon/evidence/dsh-g0-first-purchase-source-wsl-20261007.md)。该现场阶段记录尚未接入原 journal；随后同一原始回执经 `verify-service` 核验后进入 seq 4，前三条历史事件和候选包不变，实际重试幂等与两项拒绝通过。当前新门禁 34 PASS，完整 release suite 278 PASS，见[接线证据](../hackathon/evidence/dsh-g0-first-purchase-source-target-gate-20261007.md)。不把服务十项观测当成 DSH 目标宿主、旧包十四项验收或生产放行。

2026-10-07 目标宿主增量：复用已发布的 Linux runtime `a049f061…`、原四包及独立目标 wheel，在杭州 WSL/UID 65534 通过官方 Host HTTP 整链 **1 PASS**；原生命令、查询 worker、保存/ACK 核对、查询/保存独立重启、宿主会话正常恢复和原生对话均实跑。本轮保护 **49 PASS**、进程/输入 **13 PASS**、release **278 PASS**，v4 本机回归 **1 PASS**。两次失败与修复、输入摘要及清理见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-runtime-host-20261007.md)。8 个自有 PID、临时目录回收，现役监听/PID 未变；原 journal seq 4 不变。只关闭目标 HTTP 子项，不能替代目标浏览器、跨版本/在途恢复或生产 activation。

2026-10-07 目标宿主回执接线：上一批 29 文件正常 hooks 提交 `4d792eeb`；新首购封套在现有 `verify-host` 中独立校验，原始杭州 HTTP 观察进入候选 journal seq 5，前四事件和 15 个固定输入不变，重复命令不改字节/mtime。门禁 33、完整 release suite 311 PASS，见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-runtime-host-gate-20261007.md)。只新增本地核对与记账，不重复现场运行，也不改变生产准入。

2026-10-07 目标浏览器阶段：12:21 的连接超时记录保留为[历史失败证据](../hackathon/evidence/dsh-g0-first-purchase-target-browser-20261007.md)。用户恢复连接后，同一 runtime/四包在实际杭州 WSL2、UID 65534 完成 **官方 Host 1 PASS / headless 五场景 PASS**；驱动固定中文 locale，临时补齐字库后截图中文可读。保护 47 PASS / 4 SKIP / 0 FAIL；原候选 15 输入和 journal seq 5 不变，新 browser observation 尚未接线，见[现场证据](../hackathon/evidence/dsh-g0-first-purchase-target-browser-wsl-20261007.md)。只关闭目标桌面 headless synthetic 子项，不替代跨版本、真实身份/UAT、供应链或生产放行。

2026-10-07 浏览器回执接线：复用原目标文件，通过独立 browser schema 将五场景观察记入原候选 journal **seq 6**，引用 seq 5 Host 事件；前五事件/15 输入保留，重试不改字节/mtime。完整 release **345 PASS / 0 SKIP**（新门禁 34），错父事件拒绝，见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-browser-gate-20261007.md)。不重新跑 WSL，也不授予生产准入；下一步目标在途/跨版本恢复。

2026-10-07 本机增量：T2 的新 rc1 可追踪构建/三语料矩阵、T15 的 kit 本地包/只读预检已完成，见[最新证据](../hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)。随后新输入的 WSL 官方构建/三语料矩阵也已独立实跑通过，见[现场与安装补证](../hackathon/evidence/dsh-g0-kit-install-wsl-rebuild-20261007.md)。下表仍为整体状态；旧构建历史签名、全新机器 SDK/kit 分发和供应链门禁继续开放。

| 任务 | 当前状态 | 已有证据 | 尚未关闭 |
|---|---|---|---|
| T1 | IMPLEMENTED / STATIC PASS | 架构设计、机器 policy/inventory、11 包及当前 AST 盘点；含 import-equals 的 drift/循环/越界/公开导出负测纳入 B0 pipeline，精确数量与源摘要以生成的边界清单为准 | 这只关闭依赖盘点；真实宿主与服务语义由 T2/T3/T17 验证 |
| T2 | PARTIAL / DECLARED CORPUS + LOCAL TOOL PASS | 固定Linux runtime的杭州HTTP/headless与在途崩溃恢复、文本/工具/附件委派元数据的四项恢复矩阵按各自来源通过；本轮固定官方shell/tool/jobs/timeout-policy本机25场景及11项正式测试通过，见[本机合同](../hackathon/evidence/dsh-g0-shell-tool-contract-20261008.md)及上方既有恢复证据 | 新rc1可追踪WSL构建已通过；旧构建历史信任、完整语料、headed/移动端/无障碍、shell/tool的Web派发/WAL/WSL组合及编译artifact身份仍开放；0.2.0仍DEFERRED |
| T13 | PARTIAL / LOCAL JOURNAL PASS | profile/state/既有 journal 保留；候选快照与 v2 host evidence 已通过 CLI 幂等接入 `CANDIDATE_HOST_VERIFIED`，重复不改原候选，见[本轮证据](../hackathon/evidence/dsh-g0-host-journal-20261004.md) | 生产 activation 崩溃 replay、远端部署 receipt/reconcile；已有首购 HTTP/浏览器观察分别接入 seq 5/6 |
| T15 | PARTIAL | 独立包/构建成果保留；`f9726f68` 查询/保存包与固定Linux runtime的WSL官方HTTP/headless五场景、独立作者入口、开发SDK十消费者及指标/知识服务2/2目标冷安装与15/15保护观测已分别通过；修后服务runner已补现场复验。当前HTML包 `285f882a…` 另在本机固定官方Host/headless完成17项，见上方各自来源证据 | 当前HTML后端为源码夹具，其WSL包组合未运行；物理分仓、headed/移动端/无障碍、完整跨版本/精确宿主合同与invariant、其他服务源码范围、签名/完整SBOM/来源信任和生产准入仍未关闭；开发SDK验证不等于整台干净机器 |
| T3 | PARTIAL / WSL HOST HTTP + HEADLESS ARTIFACT PASS | `f9726f68` 两包 owner 分离；本机官方 HTTP/Chrome、WSL 服务十项及实际 WSL 官方 Host/四包 HTTP 与 headless 五场景通过，保存进程只开自有库 | headed/移动端/无障碍、当前包跨旧版本目标矩阵、生产身份/候选准入、供应链及真实模型/UAT 未完成 |
| T7 | PARTIAL / WSL SYNTHETIC RECOVERY PASS | 查询/保存隔离恢复与新候选 FAILED/EXECUTION_UNKNOWN、名额释放/不重复派发已实跑；原保存包 forward-fix 14/14，文本/工具 session 跨版本 4/4 分别留证；见[服务恢复](../hackathon/evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md)和[新候选终态](../hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md) | 真实业务/身份、编译来源与完整候选门禁未完成；结果采用历史快照，无年龄阈值待办，生产保存 UI 未启用 |
| T17 | PARTIAL / LOCAL HOST + TOOL PASS | 固定官方Web CLI十项既有场景、父命令中断及本轮官方模块25场景/15自有进程组回收；preset移除后旧会话保留工具，同进程挂死需外部重启；默认jobs promotion与非硬中止的timeout-policy已实测 | 任意插件同进程隔离不承诺；生产activation/journal/canary、未覆盖目标平台与真实服务恢复仍开放，测试指针不替代原子部署 |
| T21 | PARTIAL / LOCAL HOST + SERVICE RECEIPT PASS | `plugin candidate` 携带 profile 快照；`verify-host` 分别绑定旧 v2 十项宿主观测、首购 WSL runtime 二十项 HTTP 观察和五项 headless 浏览器观察；`verify-service` 绑定精确服务双包九项观测及按各自 schema 区分的 WSL 十四项恢复/十项 source-HTTP 观测，均以原 journal 幂等记账，见上方最新证据 | 生产 canary/rollback、远端 receive/reconcile、host activation；本机核验仍 release_ready=false，目标 JSON 不证明发布者身份 |
| T22 | IMPLEMENTED / DOCS PASS | README、docs 索引、rc2 Quickstart 和插件作者 Quickstart 已统一当前事实与三步入口 | 现场 host/canary/rollback 仍不属于文档门禁 |
| T23 | IMPLEMENTED / READINESS PASS | 聚合阻断码、remedy 和 Quickstart 锚点已实现；检查成功返回 0，缺项/门禁阻断返回 2；旧 runtime 的 readiness 结果仅属历史证据 | 远端证据仍由发布门禁负责 |

历史 B0 618 项 pytest、314 项 Node 测试、七插件构建和 clean rebuild，以及八阶段 preflight 102/102，均只证明各自证据文件绑定的旧 source SHA。`brace-expansion@2.1.7` 与 prepare/audit 分阶段修复继续保留；审计的“0 漏洞”只描述当次结果，不是永久安全保证。

2026-10-03 审查发现 runtime 原地改写/错包绑定、plugin pack 内容/入口漏验、receive 假完成、跨 tag 身份继承和静态扫描未绑定 Git tree 共七项问题。本轮修复及新测试记录在上述证据页；当前未提交修复必须在授权提交后从最终 clean SHA 重跑正式 preflight，不能沿用旧 PASS。runtime 现在只在独立工作副本改元数据，直链包用锁文件 SHA-512 绑定原始缓存；最终包检查和真实离线运行结果各自列出。

本次 T1/T15 首轮实现见 [边界与隔离构建证据](../hackathon/evidence/dsh-g0-boundaries-20261003.md)，最新图表领域包、workbench pack 与测试结果见 [图表解耦证据](../hackathon/evidence/dsh-g0-board-components-20261003.md)；长期边界见 [架构设计](../architecture/shinemage-plugin-platform.md)。

## 目标架构

```text
DeepSeek Harness 官方宿主仓库
  └─ exact tag/SHA + runtime lock + Node/pnpm contract
       └─ ShineMage profile/release 仓库
            ├─ dsh.profile.bundles + pnpm lock
            ├─ @shine-mage/dsh-brand
            ├─ @shine-mage/dsh-analytics-workbench-b0（首期稳定身份；stop/go 后如需拆分按新 artifact 规则迁移）
            ├─ CRM 插件（从 crm-knowledge 的 CRM domain + 薄 adapter 迁出）
            ├─ 知识库插件（从 crm-knowledge 的知识能力迁出）
            ├─ @shine-mage/dsh-query
            ├─ @shine-mage/dsh-board-cockpit
            └─ @shine-mage/dsh-board-components（funnel + waterfall）
                 │
                 ├─ 官方 DSH client/slot/service 合同
                 └─ 版本化 API/contract → ShineMage CRM API 服务
                                      ├─ synthetic DuckDB adapter
                                      ├─ CRM/分析状态
                                      └─ 知识库 API adapter → 独立知识库服务
```

## 首期垂直切片与 stop/go 闸门

首期只交付一条用户可见的 CRM/分析能力：固定为 D15 已批准的原生 DSH 会话 → first-purchase prompt → 绑定 worker 结果 → 权限/来源引用 → 成功或取消/`EXECUTION_UNKNOWN` 恢复；保存分析按 D4-C 的 G0 服务状态证据决定是否启用；cockpit preview/apply 只作为同一候选的后续断言。它使用当前仓库的 workspace/package 边界和 immutable profile candidate，不先物理拆成多个 Git 仓库。

首期必须先完成 DSH 合同 spike、API/schema baseline、兼容 adapter、activation transaction 和供应链门禁。物理多仓、完整私有 catalog、全部插件拆分和杭州切换只有在 2–4 周 stop/go 评审通过后才进入下一阶段。

| 指标 | 首期基线 | 目标/闸门 | 证据 |
|---|---|---|---|
| 插件变更到可回退 candidate 的 lead time | Phase 0 实测 | 在同一维护者环境压缩到可接受窗口并记录 P95 | profile journal |
| 失败后恢复 | 现状实测 | 旧 profile 保持 active，恢复时间和重试次数有上限 | rollback receipt |
| 故障隔离 | 现状实测 | 部分注册、挂死、崩溃、超时不破坏 native loop | activation negative tests |
| 维护成本 | 现状实测 | 记录每周升级/审查/发布人工分钟数，stop/go 不得无证据上升 | owner log |

RACI 在 Phase 0 产出，至少为 build、receive、UAT、cutover、rollback 和 cleanup 指定主备 owner。stop/go 记录必须写明指标、未关闭风险、是否继续物理拆仓，以及 catalog 的触发条件。

## 仓库边界

### 1. `shinemage-dsh-host`

只保存官方 DSH 的 exact tag/SHA、运行时 lock、Node/pnpm 版本、升级记录和最小 host smoke。默认不 fork、不修改上游源码。DSH 0.1.7-rc.2 与 0.2.0-rc.2 必须使用不同 candidate profile 验证。

### 2. `shinemage-dsh-capability-contracts`

只保存极小的 DSH capability 合同：slot/provider/consumer、工具 envelope、生命周期和 disabled/NOT_AVAILABLE 语义。CRM API/schema、query 结果、board 模型、知识库合同由各自领域或小型 domain package 版本化；不建立一个承载所有业务 schema 的共享运行时单体。首期服务接口必须使用可版本化的公开 capability/API 合同；`/internal/native/*` 只能由服务侧临时 adapter 实现，不能成为插件长期消费的 generated contract。

### 3. 每个可独立发布的领域一个插件仓库

- `shinemage-dsh-brand`：品牌和受控 UI 主题入口，只覆盖允许的品牌层，不伪装原生标题、侧栏、会话和工具合同。
- `shinemage-dsh-analytics-workbench`：B0 工具、自由 HTML 编辑链、候选保存/预览/版本操作和其 client 适配。它承载首期 D15 workspace 试点；物理拆仓顺序靠后，不先整体搬迁。
- `shinemage-dsh-crm` 与 `shinemage-dsh-knowledge`：CRM、知识库各自的工具和受控页面槽位。当前合并包 `crm-knowledge` 是迁移来源，最终边界按领域拆开；不携带数据库文件或 FastAPI 服务。
- `shinemage-dsh-query`：查询/诊断工具及结果展示合同。
- `shinemage-dsh-board`：看板生成/预览/确认和 board kind；只依赖合同与 query/result service。
- `shinemage-dsh-board-components`：先把 funnel 与 waterfall 放在同一领域包，消除当前反向源码依赖；`crowd-action` 这类 marker-only 包先随 board/profile 组合，只有具备独立生命周期、版本和验收证据时才拆成单包。

小型板块不应复制 build toolchain。先抽取通用 `@shine-mage/dsh-plugin-kit`（构建、invariant、测试 fixture、版本矩阵），它只提供无业务的开发工具，不能成为新的运行时单体。

### 4. `shinemage-dsh-profile`

只保存 profile 的 bundles 清单、lockfile、host/runtime 兼容矩阵、组合测试、candidate manifest、receipt 和 rollback 指针。插件源码不放入 profile 仓库；profile 更新只改包版本和 lock。

### 5. `shinemage-crm-api` 与 `shinemage-knowledge-service`

从当前仓库抽离 FastAPI、权限、分析语义、synthetic DuckDB adapter、知识库访问和迁移合同。服务使用独立版本和 API contract；真实杭州 DuckDB 不迁移、不复制、不进 Git。插件只通过受控 HTTP/DSH host service 调用。

### 6. `shinemage-deploy`

保存 immutable artifact 接收、sidecar/manifest、WSL side-by-side activation、rollback、service ownership、Tailscale 只作 SSH 控制/探针和小型 sidecar 传输；大包由杭州从固定 GitHub Release 直接下载。生产只接收已验证包，不 `git pull`、不现场编译。

私有 ShineMage catalog/admission 是后置能力，不属于首期垂直切片。首期 admission 由 profile allowlist、签名/来源 manifest、SBOM、漏洞门禁和撤销元数据承担；只有多生产者或审计量达到 stop/go 记录中的阈值后，才创建独立 catalog 服务。

## 分阶段执行

### Phase 0：基线和依赖图

1. 以 `fcbd1324` 历史盘点为起点，按本次实际 Git 状态更新插件清单、文件归属、跨包 import、build/test 入口和运行时 peer 矩阵。
2. 将每个包的公开 API、DSH/Cordis peer、后端 endpoint、状态目录和资源文件写入 `docs/architecture/shinemage-plugin-boundaries.md`。
3. 建立 `shinemage-dsh-host`、profile、插件、服务、部署的版本关系图。
4. 通过 `rg`/CodeGraph 确认没有真实 DuckDB、凭据或生产路径被纳入拆分输入。
5. 以 DSH 0.1.7-rc.2 的 capability/slot/client 生命周期、restart/unload、工具结果/timeout、session/WAL synthetic 恢复作为首期阻塞证据；0.2.0-rc.2 只记录 advisory 差异，stop/go 通过后另开候选。
6. 选择首期 CRM/分析垂直切片，测量上述指标基线并生成 RACI、唯一依赖 DAG 和 stop/go 模板。

验收：依赖图覆盖所有当前 `dsh-plugins` 包；每个跨仓库依赖有 owner 和合同；工作树保持可回退。

### Phase 1：先抽合同和插件开发工具

1. 抽取极小 DSH capability 合同；CRM、query、board、knowledge 的业务 schema 仍由各自领域持有，并在边界 manifest 中记录 owner、来源 SHA、生成器版本与输入 SHA、SemVer/兼容策略和生成物来源。D15 不得把 `/internal/native/prompt` 或 `/internal/native/first-purchase` 直接冻结为插件合同；服务 adapter 对外暴露带 SemVer 的 capability/API 合同，内部路由只留在 adapter 后面。
2. 抽取无业务的 plugin kit：package checklist、peer/devDependency 对齐、build、`./invariant`、package smoke、DSH 版本矩阵。
3. 为 0.1.7-rc.2 建立兼容基线；扫描 `ctx.shell.run/start`、工具结果 union、session/WAL synthetic resume。
4. 冻结首期 CRM/API 与领域 schema baseline，建立兼容 adapter、版本窗口、生成类型和 profile × service × durable-state 回退矩阵；先用 synthetic/隔离小库验证 expand/contract 与 backup/restore。adapter 属于服务合同边界或独立迁移包，不进入首期插件运行包；记录删除条件、owner 和兼容窗口。比例字段必须沿 semantic → contract → caller 固定为 B0 的 0–1 口径，禁止旧 CRM raw ratio 直接复用。
5. 按 T17 的真实宿主结果定义失败边界：先覆盖部分注册、全局副作用、挂死、进程崩溃、超时和 receipt mismatch；只有宿主能力已证实才允许宣称 activation transaction/atomic rollback，否则首期只保留旧 profile 并走 disable/native + host restart。
6. 首期供应链门禁最低为 profile allowlist、packed digest、来源/manifest、files/exports、peer/invariant 和审计回执；按最终 D7-A，签名、SBOM、漏洞阈值、轮换/撤销仍是首个可交付 candidate 的门禁；未可执行时保持 BLOCKED，G0 pack 可以 PARTIAL，但不能把完整门禁后置。
7. 不改变非切片运行路径；旧仓库通过临时 compatibility adapter 消费新合同。

验收（workspace 前置能力，非物理多仓 DoD）：合同包和 dev-only kit 可在当前 workspace build/test/package；旧仓库测试不减少；无 DSH 上游改动。

### Phase 2：首期垂直切片（stop/go 前）

1. 在当前 workspace 内为 `@shine-mage/dsh-analytics-workbench-b0` 建立独立 package candidate、manifest、lock 和 profile journal；不复制 DSH 源码或真实 DuckDB。packed artifact 必须记录 package id、DSH plugin id、生成 schema 的 source/generator digest 和 pack 输入清单，保证干净 profile 可安装、可重放。
2. 只为上述插件与 D15 服务路径冻结 contracts + CRM API compatibility adapter，不继续引入 backend/workbench 反向源码依赖；其它领域包不在首期迁移。
3. 保留普通 HTML 与绑定页面安全边界、预览/确认/版本历史、失败回退和 NOT_AVAILABLE 合同。
4. 用 T17 已证实的失败边界执行 synthetic canary、profile diff/explain 和 candidate replay；若宿主不支持进程内隔离，首期验收改为旧 profile 保持 active、disable/native + host restart、再确认 WAL/会话恢复。
5. 记录 lead time、故障隔离、回退时长、维护成本和一条 D15 synthetic 端到端证据；这些先作为基线，2–4 周 stop/go 的数值目标另行冻结。
6. 2–4 周后执行 stop/go；未通过则保留 workspace 边界并修复，不开始物理多仓。

验收（当前 Eng/DX gate）：首期命名 package 在 clean workspace 中可 build/test/pack；profile 可安装同一 immutable packed artifact；D15 synthetic 路径和失败回退有 receipt；插件失败时 DSH 原生对话仍可用。

### Phase 3：stop/go 通过后的领域迁移

顺序固定为：`shine-brand` → `board-components (funnel + waterfall)` → `crm-domain + 薄 DSH adapter` → `shine-query` → `board-cockpit/workbench`。每次只迁移一个领域，先发布 candidate，profile 组合验证通过后才切下一个。

每个插件必须通过：

- package manifest、exports/files、DSH/Cordis peer/devDependency 检查；
- source-only、built package、invariant、client lifecycle 测试；
- 与支持的 DSH pin 的兼容矩阵；
- install/load/unload/failed dependency/restart/rollback；
- 不覆盖原生 UI、标题、侧栏、会话、工具合同的回归。

### Phase 4：建立 profile/release 控制面（可与首期切片共用薄实现）

1. profile 仓库维护唯一 bundles 清单和 lockfile。
2. 插件版本升级只生成新的 profile candidate，不重建 DSH 或服务。
3. candidate manifest 绑定每个包的版本、digest、DSH SHA、contracts SHA、runtime、构建器和证据。
4. GitHub Release 只发布 immutable profile artifact；杭州 receive/verify/reconcile/activate 使用同一 artifact。
5. side-by-side 保留旧 profile；active 指针切换与回退、进程重启、WAL 和服务状态分别按 T17/T3 证据处理。Tailscale 用于控制/探针和小 sidecar，大包从 immutable Release 直取。

验收：修改一个插件可以独立生成 profile patch；DSH/服务没有无关重建；回退可恢复旧 profile。

### Phase 5：DSH 0.2.0-rc.2 单独升级

1. 从官方 tag/SHA 建立独立 host candidate profile。
2. 批量更新所有插件 peer/devDependency 与 lock，不放宽到浮动 latest；业务合同仍按领域版本锁定。
3. 执行 API grep/typecheck，核对 `ctx.shell.run/start` 是否变化、工具 timeout/promoted 结果和 Desktop/web profile 初始化差异；静态关键词命中不能证明某接口已删除或运行时兼容。
4. 执行 plugin manifest dump、tool catalog、UI slot、权限、session/WAL synthetic resume、install/load/unload/restart/rollback。
5. 仅在候选 profile 全部通过后，更新 profile lock；插件与 host 仍分别发版。

未通过时保留 0.1.7-rc.2 profile 可用，不触碰杭州 current。

### Phase 6：服务和部署拆分

1. 把 CRM API、知识库和数据适配器迁入各自服务仓库，先用 synthetic/隔离小库。
2. 用 OpenAPI/schema digest 把插件与服务绑定；服务 schema 变化单独走迁移和兼容窗口。
3. deploy 仓库只接收 artifact+manifest+receipt，禁止 `git pull` 和现场重新编译。
4. Tailscale 断线时 receive 可重试、状态可 reconcile；网络不是发布状态来源。

## 独立更新规则

- 插件改动：发布插件包 → 更新 profile lock → 生成新 immutable profile artifact → profile 重启/原子切换；不重新发布 DSH。
- DSH 改动：新 host candidate profile → 全插件兼容矩阵和 session/WAL 验证 → 更新 profile lock → 单独候选；不强制修改服务数据。
- CRM/知识库改动：服务独立发布；只有 API/schema 变化时更新 contracts 和对应插件。
- 数据库版本改动：独立 migration/backup/rollback 合同；禁止把 DuckDB 文件作为插件或 profile 资产。
- Plugin Hub：只作为发现/安装参考；生产 profile 仍锁定包版本、digest、DSH peer 和来源 SHA，不能直接使用浮动 latest。

## 不在本轮范围

- 不把当前所有文件一次性搬迁并删除旧仓库。
- 不 fork 或修改 DSH 上游源码。
- 不读取、复制、迁移真实杭州 DuckDB。
- 不自动切换杭州服务、重启 WSL、修改 Cloudflare route。
- 不承诺所有插件都支持 HMR；bundle 更新默认需要 profile 重启。
- 不把 dsh-plugin-hub 的社区审核或“刷新即生效”文案当作生产合同。

## 长期目标完成定义（stop/go 通过后）

- 每个领域插件有独立仓库、版本、CI、invariant、兼容矩阵和回退包。
- profile 是唯一组合入口，能由同一 immutable artifact 重放到本地和杭州。
- DSH、插件、服务、数据各自可独立升级，依赖由 peer/schema/manifest 明确表达。
- 任意单插件失败不会破坏 DSH 原生对话；未接通能力明确显示 disabled/NOT_AVAILABLE。
- DSH 0.1.7-rc.2 与后续单独批准的 0.2.0-rc.2 profile 都能在 synthetic 环境安装、启动、恢复、回退；0.2.0 不阻塞当前 0.1.7 候选。
- 文档、runbook、release evidence 和回退条件与实现一致。

## 首期实现完成定义（当前 Eng/DX gate）

- 只验证 DSH 0.1.7-rc.2、synthetic fixture、workspace 内一个独立可打包插件和命令所有的临时 profile；candidate receipt 必须可重放并保留旧 active。
- digest 来自通过 files/exports、peer/invariant 和 manifest 校验的 packed artifact；profile manifest 和显式 RELEASE_STATE_PATH 是组合与 journal 的唯一输入。native DSH profile/home/WAL 只代表运行时物理状态，崩溃后必须由 journal/profile manifest 重新 reconcile，比较 native profile digest 后才能接受激活或回退结果。
- T17 证明宿主 load/unload/restart/crash 行为前，不宣称 in-process isolation、atomic activation 或无重启回退；失败时只能保留旧 profile 并走 disable/native + host restart 的已证实路径。
- 0.2.0、物理多仓、catalog、GitHub Release、杭州 receive/activate、真实数据和生产 UAT 均是后续 gate，不属于首期通过条件。


### 首期包与路径映射

- 首期唯一命名插件包：`@shine-mage/dsh-analytics-workbench-b0`，对应当前 `dsh-plugins/analytics-workbench`；这是 D15 native first-purchase 路径的 DSH bundle/client/tool 边界。
- **Artifact 身份规则（Eng Rerun）**：首期 `package_id`、DSH plugin/tool id、profile bundle key 和 candidate receipt 中的 artifact identity 在 stop/go 前后保持不变；`@shine-mage/dsh-analytics-workbench` 只能作为未来明确迁移后的新 artifact 身份，不能把 scope、包名或 `-b0` 后缀静默改名。任何改名都必须生成新包、新 digest、新迁移/回退记录，并保留旧身份的 resume 映射。
- FastAPI 的 `/internal/native/prompt`、绑定 worker、权限/来源引用和保存边界仍属于服务侧 adapter 与 synthetic fixture；它们不是把 backend 源码打进插件包，也不是插件的长期公开合同。D15 的跨层 receipt 必须绑定 `correlation_id`、`candidate_digest`、服务/API 版本、分析 durable-state key、permission/source owner 和 idempotency key；profile 回退不自动回滚已写入的服务状态，必须按矩阵执行服务侧恢复或 forward-fix。
- crm-knowledge、shine-query、board、brand、funnel、waterfall 和 crowd-action 只在当前 profile 中作为依赖/组合背景，不作为首期独立拆仓验收对象；后续按 stop/go 顺序迁移。
## 当前可执行命令与后续门禁

以下在仓库根、固定 Node 24/pnpm 11.7 环境运行；包构建前须已有固定上游准备产物。完整准备说明见 [插件作者入口](../operating/dsh-plugin-author-quickstart.md) 与 [rc2 Quickstart](../operating/dsh-rc2-quickstart.md)。

```bash
pnpm dsh doctor
pnpm dsh test
pnpm dsh verify --scope local
node dsh-plugins/board-components/build.mjs
pnpm --dir dsh-plugins/analytics-workbench build "$PWD/.context/dsh-b0/upstream-0.1.7-rc.2"
pnpm --dir dsh-plugins/analytics-workbench test
# 只打包选定插件；输出使用新目录，不删除旧证据
candidate_root="$(mktemp -d "${TMPDIR:-/tmp}/shinemage-candidate.XXXXXX")"
pnpm dsh plugin candidate \
  --plugin "$PWD/dsh-plugins/analytics-workbench" \
  --output-dir "$candidate_root/pack" \
  --state-path "$candidate_root/state.json"
# status/resume 读取同一 journal；canary/安装/回退尚未接通
pnpm dsh status --state-path "$candidate_root/state.json"
```

`doctor --release`/`preflight --check` 另需 clean reviewed source、绝对 Python 和固定 runtime；参数见 Quickstart，不能把省略参数的草案当作通过命令。上述 plugin candidate 不创建 DSH home/WAL、不启动宿主；未来 T17 harness 必须拥有自己的 profile、DSH home、WAL、B0 SQLite、PID 和端口，不能使用操作者真实 home。现场动作仍另行授权。

T15 最新增量：CRM cockpit slot 的私有类型引用已改为驾驶舱领域 v1 合同生成物；双方携带自己的类型副本。页面工具/主题 4 条引用也已解除：页面工具归公开适配入口，主题归品牌领域生成合同。见 [CRM slot 证据](../hackathon/evidence/dsh-g0-crm-slot-20261003.md) 和 [CRM 端解耦](../hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。

## Review record

> 以下为 2026-10-01 至 10-02 的评审历史与目标合同。`currentDecision`、`Applied`、测试数和当时的缺项均保留其时间语境；最新任务状态以页首账本为准，后续 D3–D8 已回答的选择不重新打开。

### CEO Step 0

- Mode: SCOPE EXPANSION, selected by user in D1.
- Current goal: make DSH host, plugins, profile, contracts, services, data, and deployment independently versionable without weakening native DSH behavior or touching production data.
- Expansion candidates are evaluated one at a time; acceptance is recorded before changing the implementation plan.

## currentDecision CEO-EXT-001

Commitment comparison: add a DSH/plugin compatibility conformance matrix and synthetic fixture suite | defer it to TODOS.md | skip it

Question: D2 — CEO-EXT-001: Should the platform include a reusable DSH/plugin compatibility conformance suite?
Header: Choose whether every plugin repository must prove compatibility against pinned DSH host profiles before a profile candidate can be built.
A) Add compatibility conformance suite (recommended)
The suite tests manifest/peer alignment, tool result unions, lifecycle load/unload, profile restart, session/WAL synthetic resume, and rollback against each supported DSH pin. It becomes a release blocker with readable evidence and keeps host upgrades separate from plugin releases. Effort human M / CC 15–20 minutes; risk medium; verification through isolated profiles and fixture-only data.
B) Defer to TODOS.md
Keep the split plan and add the suite after the first repositories exist. This shortens the first migration but leaves the main source of “plugin worked on one DSH version and failed after upgrade” unresolved. Effort human S now, L later; risk high until delivered; verification postponed.
C) Skip
Rely on each repository's local tests and the profile smoke test. This avoids a shared test contract but makes compatibility evidence inconsistent and allows incompatible packages into the profile. Effort human S; risk high; maintenance burden grows with every DSH release.

### CEO-EXT-001 decision

- Decision: ACCEPTED, user selected A in D2.
- Scope（stop/go 后长期能力）：create a reusable conformance suite and make its evidence a plugin/profile release blocker; 首期只执行一个命名插件 × DSH 0.1.7-rc.2 × synthetic fixture。
- Verification: isolated profile matrix, package invariant checks, structured evidence bound to plugin version, DSH SHA, and profile lock.

### CEO-EXT-002 decision

- Decision: ACCEPTED, user selected A in D3.
- Scope: create a development/CI-only `@shine-mage/dsh-plugin-kit` and starter template. It may resolve pinned SDKs and run manifest, invariant, fixture, and package checks, but it must not be a runtime dependency and must not contain business schema, UI, or state.
- Verification（stop/go 后）：two independent clean plugin repositories build and package with the kit; 首期只要求 workspace 内命名插件的 pack/invariant 证据。

### CEO-EXT-003 decision

- Decision: ACCEPTED, user selected A in D4.
- Scope: add a thin profile registry/release layer that records the ordered bundle list, lockfile, plugin digests, DSH SHA, contracts SHA, builder, attestation sidecars, receive receipt, active pointer, and rollback pointer. It must not contain plugin source or runtime business logic.
- Verification: offline manifest validation, receive/reconcile fixtures, same candidate replayed in a clean local profile and an isolated host fixture, and rollback to the previous profile.

### CEO-EXT-004 decision

- Decision: ACCEPTED, user selected A in D5.
- Scope: plugins declare provided/required capabilities; profile activation validates them before loading. Unavailable optional capabilities must produce disabled/NOT_AVAILABLE with a reason and preserve native DSH conversation; failed lifecycle cleanup and unload remain explicit.
- Verification: unavailable provider, incompatible version, unload, failed activation, and native fallback fixtures.

### CEO-EXT-005 decision

- Decision: ACCEPTED, user selected A in D6.
- Scope（stop/go 后）：add a private ShineMage catalog/admission layer above the profile registry; 首期不建设 catalog。
- Verification: metadata schema, source allowlist, digest binding, rejected-source fixtures, and catalog/profile consistency checks.

## currentDecision CEO-EXT-006

Commitment comparison: add a one-command local profile sandbox for install/load/unload/restart/rollback testing | defer it to TODOS.md | skip it

Question: D7 — CEO-EXT-006: Should plugin maintainers get one command to test a clean local profile before publishing?
Header: Choose whether the platform should provide an isolated synthetic sandbox that exercises the same profile install and lifecycle contract as a candidate.
A) Add local profile sandbox (recommended)
The command creates an isolated profile directory, installs selected immutable packages, dumps the composed manifest, runs load/unload/restart/rollback and synthetic session/WAL checks, then removes only its own temporary state. It shortens the path from plugin change to trustworthy evidence without touching the real DSH home or DuckDB. Effort human M / CC 15–20 minutes; risk low-medium; verification through repeated and interrupted runs.
B) Defer to TODOS.md
Keep the existing plugin and profile test commands, then add the sandbox after repositories are split. This avoids another CLI surface early but keeps local verification more manual. Effort human S now, M later; risk medium.
C) Skip
Ask maintainers to install plugins into their personal DSH profile and inspect behavior manually. This is familiar but mixes state, makes failures hard to reproduce, and can accidentally test the wrong bundle combination. Effort human S; risk high for upgrades.

### CEO-EXT-006 decision

- Decision: ACCEPTED, user selected A in D7.
- Scope: add a one-command isolated local profile sandbox that installs fixed immutable packages, dumps the composed manifest, exercises load/unload/restart/rollback and synthetic session/WAL behavior, and cleans only its own temporary state.
- Verification: clean/repeated/interrupted runs, failed plugin activation, and proof that the real DSH home and DuckDB paths are untouched.

### CEO-EXT-007 decision

- Decision: ACCEPTED, user selected A in D8.
- Scope: add profile diff/explain tooling that compares immutable manifests and reports bundle order, changed plugin digests, capability providers/consumers, peer/contract changes, disabled features, and rollback impact before activation.
- Verification: added, removed, replaced, incompatible, and rollback comparisons use the same manifest verifier as receive/activation.

### CEO-EXT-008 decision

- Decision: ACCEPTED, user selected A in D9.
- Scope: every profile candidate runs an isolated synthetic canary beside the known-good profile, exercises native conversation, capability checks, API loopback, synthetic session/WAL and bounded health, then records an atomic rollback to the previous pointer. The drill must cover failed canary, timeout, interrupted activation and receipt mismatch.
- Verification: candidate evidence is bound to the profile manifest and rollback receipt; no host data migration or real DuckDB access is allowed.

### CEO-STRUCT-001 decision

- Decision: ACCEPTED, user selected A in D10.
- Scope: start with low-coupling `shine-brand`; group funnel and waterfall into one board-components domain to remove reverse imports; then extract CRM domain plus a thin DSH adapter; finally split query and board-cockpit/workbench. Do not create one repository per marker-only widget.
- Verification: each stage removes a concrete cross-directory import or shared-runtime dependency and publishes an independent candidate before the next stage begins.

## currentDecision CEO-STRUCT-002

Commitment comparison: keep business contracts versioned by domain instead of placing all API/schema/event/tool contracts in one shared runtime package | centralize every contract | defer contract boundary

Question: D11 — CEO-STRUCT-002: Should domain contracts remain separate instead of becoming one shared API monolith?
Header: Choose whether to keep only tiny DSH capability contracts shared while CRM, query, board, and service schemas stay versioned with their owning domain.
A) Keep domain-owned contracts (recommended)
Publish a tiny DSH capability layer for slots/providers/tool envelopes, while CRM API/schema, query results, board models, and knowledge contracts remain owned by their domains or small domain packages. This keeps independent plugins replaceable and avoids a new shared runtime monolith. Effort human M / CC 15–20 minutes; risk medium; verification through contract consumers and version compatibility tests.
B) Centralize every contract
Put all API, schema, event, tool, permission, and error contracts into one `shinemage-dsh-contracts` package. This is easy to discover but couples unrelated domains and forces every plugin release to track one package. Effort human M now, L later; risk medium-high.
C) Defer contract boundary
Keep current generated contracts and decide ownership after the first plugin moves. This reduces upfront design work but preserves backend/workbench reverse dependencies during the riskiest migration. Effort human S now, M later; risk high.

### CEO-STRUCT-002 decision

- Decision: ACCEPTED, user selected A in D11.
- Scope: share only the tiny DSH capability contract; CRM/API, query, board, and knowledge schemas remain owned and versioned by their domains or small domain packages. No shared business-schema runtime monolith.
- Verification: each consumer pins its domain contract version; compatibility tests cover add/remove/replace and rejected incompatible changes; implementation packages do not cross-import another domain's source.

## currentDecision CEO-STRUCT-003

Commitment comparison: promote the accepted architecture into a durable design document and boundary manifest | keep the decisions only in this plan | defer documentation until implementation

Question: D12 — CEO-STRUCT-003: Should the accepted split architecture become a durable design document before implementation?
Header: Choose whether to publish the repository graph, ownership rules, upgrade boundaries, and evidence requirements as a design artifact that future work must follow.
A) Promote architecture and boundary manifest (recommended)
Create `docs/architecture/shinemage-plugin-platform.md` and a machine-readable boundary manifest from the accepted plan. Link it from STATUS/TODOS and require future extraction PRs to update the manifest. This prevents the split from drifting back into cross-imports while leaving implementation to later phases. Effort human S–M / CC 10–15 minutes; risk low; verification through link/reference checks and manifest validation.
B) Keep decisions only in this plan
The plan remains the single design record and no new durable architecture file is added. This minimizes files now but makes future plugin repositories and reviews depend on a long execution plan.
C) Defer documentation
Write the design after the first extraction. This keeps the first implementation moving but allows repository boundaries and contracts to drift during the riskiest migration.

### CEO-STRUCT-003 decision

- Decision: ACCEPTED, user selected A in D12.
- Scope: promote the accepted architecture into `docs/architecture/shinemage-plugin-platform.md` and a machine-readable boundary manifest; link both from STATUS/TODOS and require extraction work to update them.
- Verification: documentation/reference checks, manifest validation, and a boundary review for every extraction candidate.

### CEO-REVIEW-001 decision

- Decision: ACCEPTED, user selected A.
- Scope: first deliver one high-value CRM/analysis vertical slice with independent package/workspace release, immutable candidate, safe rollback, and measured lead time/failure isolation. Use a 2–4 week stop/go gate before physically splitting additional repositories or building the full catalog/deploy surface.
- Verification: baseline and target metrics, one end-to-end user-visible capability, candidate replay, rollback drill, and explicit go/no-go record.

### CEO-REVIEW-002 decision

- Decision: ACCEPTED, user selected A.
- Scope: before freezing further repository boundaries, run a contract spike against exact DSH 0.1.7-rc.2 and 0.2.0-rc.2 candidates. Record capability/slot/client lifecycle, restart versus unload behavior, tool result and timeout semantics, and synthetic session/WAL recovery with source SHA evidence.
- Verification: a versioned compatibility matrix, minimal fixture packages, typecheck/static scan results, and explicit supported/deferred behavior for each host pin.

### CEO-REVIEW-003 decision

- Decision: ACCEPTED, user selected A.
- Scope: define the first vertical slice as one user-visible CRM/analysis capability and add baseline/target metrics for lead time, rollback duration, failure isolation, and maintenance cost. Assign build, receive, UAT, cutover, rollback, and cleanup owners and enforce a 2–4 week stop/go exit before broader physical decomposition.
- Verification: the slice has one end-to-end acceptance path, measured evidence, named primary/backup owners, and a signed go/no-go record.

### CEO-REVIEW-004 decision

- Decision: ACCEPTED, user selected A.
- Scope: freeze the vertical slice's CRM/API and domain schema baseline before moving plugin code; provide a compatibility adapter, explicit service version window, and profile × service × durable-state rollback matrix. Plugin extraction must consume the contract rather than preserve backend/workbench reverse imports.
- Verification: generated consumer types, contract diff/compatibility tests, adapter loopback, expand/contract migration fixtures, backup/restore evidence, and a documented forward-fix path for non-reversible changes.

### CEO-REVIEW-005 decision

- Decision: ACCEPTED, user selected A.
- Scope（以 T17 结果为条件）：the first vertical slice must define the strongest activation/isolation boundary the pinned host actually supports; unsupported in-process cleanup falls back to disable/native plus host restart.
- Verification: side-by-side candidate/known-good fixtures, interrupted activation, crash recovery, timeout recovery, and proof that the previous profile remains active.

### CEO-REVIEW-006 decision

- Decision: ACCEPTED, user selected A.
- Scope: the boundary manifest must record each contract's owner, source SHA, generated-artifact source, SemVer/compatibility policy, provider/consumer matrix, and whether it is an upstream re-export or domain-owned contract. CI must run contract diff and consumer compatibility tests.
- Verification: changed, additive, incompatible, and source-drift fixtures produce stable accept/reject evidence tied to the manifest.

### CEO-REVIEW-007 decision

- Decision: ACCEPTED, user selected A.
- Scope（分层门禁）：retain the private catalog as a future admission capability; 首期只要求 profile allowlist + packed digest + manifest/invariant，签名/SBOM/CVE 工具不可用时保持 BLOCKED。
- Verification: admission rejects unallowlisted, unsigned, unverifiable, vulnerable, or revoked artifacts; the trigger and removal/retirement condition are documented.

### CEO-REVIEW-008 decision

- Decision: ACCEPTED, user selected A.
- Scope: add a pre-production evidence gate using production-shaped but business-data-free contract fixtures, recorded request/permission matrices, latency/capacity envelopes, and fault injection. Real杭州 UAT remains a separately authorized gate; synthetic results cannot be labelled as production compatibility.
- Verification: evidence records fixture provenance, auth outcomes, p95/5xx/resource limits, network interruption, recovery, and the boundary between synthetic/pre-production and real-business UAT.

### CEO-REVIEW-009 decision

- Decision: ACCEPTED, user selected A.
- Scope: the first slice must run old and new profiles side by side behind an explicit feature flag or gray window, retain one active pointer, record rollback thresholds, publish a deprecation date, and define the evidence gate for deleting the old adapter/profile. Compatibility adapters are temporary migration tools, not permanent platform contracts.
- Verification: migration runbook covers install, canary, cutover, rollback, deprecation notice, cleanup approval, and proof that post-cleanup plugin-only updates do not rebuild DSH, services, or data.

### CEO Step 0H approval

- Decision: APPROVED by user (A) on 2026-10-01.
- Scope: the synchronized working plan and CEO scope summary may proceed to 0I and the Architecture, Design, DX, and Eng review sections. This approval does not authorize implementation, commit, push, merge, release, deployment, production cutover, or data migration.
- Spec review evidence: two bounded native spec-review attempts returned no completed report; `quality_score` remains `null` and this limitation stays visible.

### CEO Step 0I temporal interrogation

- Hour 1, foundations: inventory every current bundle and reverse import; freeze the unique dependency DAG, DSH source pins, capability contract spike scope, API/schema baseline, boundary manifest, metrics baseline and RACI.
- Hours 2–3, core logic: build the workspace/package vertical slice, compatibility adapter, profile journal, manifest/contract drift checks, activation transaction, isolation boundary and signed artifact admission. Exercise partial registration, timeout, crash, receipt mismatch and native fallback with synthetic fixtures.
- Hours 4–5, integration: run the same immutable candidate through profile diff/explain, side-by-side canary, production-shaped business-data-free fixtures, permission/network/latency fault injection, rollback and gray-window cutover. Keep the old profile active until thresholds pass.
- Hour 6+, polish and release decision: package evidence, runbook, deprecation/cleanup conditions, plugin-only update proof, and the 2–4 week stop/go record. Only a positive gate permits physical repository extraction, full catalog work or DSH 0.2.0-rc.2 activation.
- Feasibility blockers: exact DSH 0.1.7/0.2.0 contract evidence; CRM/API adapter and state rollback matrix; activation isolation mechanism; signing/SBOM/vulnerability tooling; production-shaped fixture source; named owners and authorized pre-production/UAT endpoint.
- Pending choices retained for later gates: measured numeric targets after baseline, catalog trigger threshold, real Hangzhou UAT authorization, and DSH 0.2.0-rc.2 cutover approval. The first user-visible path is frozen by D15 below.

### 首期闸门优先级（已由 Eng Rerun 3 D3–D8 收敛）

早期复核曾建议把签名/SBOM/CVE、生产形状 fixture、灰窗和 RACI 全部后置；最终 D7-A 未采纳该缩减。当前遵循页首执行依据：先跑 G0 可行性证据，再交付带完整安全/canary/回退门禁的 D15 候选；保存是否进入候选按 D4-C。只有 catalog、物理多仓、远端动作和 0.2.0 激活仍后置，不能把早期建议当作当前豁免。

<!-- autoplan-accepted:ceo -->
- Keep the DSH upstream source independent and preserve native-first behavior; plugins use official bundle/client/slot/service contracts and cannot replace native title, sidebar, session, or tool ownership.
- Require a reusable DSH/plugin compatibility conformance matrix and synthetic fixture suite for every supported exact DSH pin, covering manifest/peer alignment, lifecycle, restart, session/WAL resume, rollback, and failure visibility.
- Provide a development/CI-only `@shine-mage/dsh-plugin-kit` and starter template for manifest, invariant, fixture, package, and matrix checks; it must not be a runtime dependency or contain business schema, UI, or state.
- Make a thin profile/release layer authoritative for ordered bundles, lockfile, plugin digests, DSH and contract pins, evidence, receipts, active pointer, and rollback pointer; it must not contain plugin source or business runtime logic.
- Require capability provided/required declarations, activation validation, explicit disabled/NOT_AVAILABLE reasons, native fallback, and lifecycle cleanup on failure.
- Add a private ShineMage catalog/admission layer recording source, verified release, supported DSH pins, capabilities, license, digest, security review, and deprecation; production accepts only profile-pinned immutable artifacts.
- Provide an isolated local profile sandbox, profile diff/explain, and synthetic canary/rollback drill using only synthetic fixtures and isolated state; never touch the real DSH home or DuckDB.
- Extract in evidence-based order: `shine-brand`, grouped `board-components` (funnel plus waterfall), CRM domain with a thin DSH adapter, then query and board-cockpit/workbench; do not create one repository per marker-only widget.
- Share only the tiny DSH capability contract; CRM/API, query, board, and knowledge schemas remain owned and versioned by their domains or small domain packages.
- Promote the accepted architecture into a durable design document and machine-readable boundary manifest linked from STATUS/TODOS; every extraction updates the manifest.
<!-- /autoplan-accepted:ceo -->

### Eng Review D14 scope record

- Feature answers: preserve the already accepted CEO scope for the DSH/plugin conformance suite, development-only plugin kit, profile/release evidence, capability validation and native fallback, isolated sandbox, diff/explain, synthetic canary/rollback, domain-owned contracts, production-shaped fixtures, dual-track migration, and stop/go measurement.
- Structure: **B — smaller workspace vertical slice**, selected by the user on 2026-10-01. The first implementation keeps one workspace with explicit package, contract, profile, artifact, activation and rollback boundaries; it does not reduce the approved feature, security, error, test, performance, or evidence requirements.
- Long-term repository target: after the 2–4 week stop/go gate, split the validated boundaries into one official DSH host repository, a capability-contract repository, multiple independently maintained plugin repositories (for example knowledge base, CRM, query/analytics, board components and workbench), profile/release control, independent CRM/knowledge services, and deployment. Physical repository count is a later migration decision, not a permanent single-repository constraint.
- Accepted scope: prove one user-visible CRM/analysis capability end to end in the workspace, package it independently, replay one immutable profile candidate, exercise activation isolation/canary/rollback, and capture lead-time, recovery, isolation, and maintenance evidence. Then use the recorded stop/go decision to promote validated package boundaries into separate repositories without rewriting release semantics.
- Pending remedies: numeric targets after baseline, DSH 0.1.7/0.2.0 contract-spike results, real Hangzhou UAT authorization, DSH 0.2 cutover approval, native-first wording reconciliation in `DESIGN.md`, and the catalog trigger threshold.

## Eng Review Decision ledger

### R1: 首期用户可见 CRM/分析路径

Finding: **[P1] (confidence: 9/10) plan:43-58; backend/analytics_first_purchase_native.py:202-225; backend/analytics_first_purchase_native.py:227-251 — 首期只写“CRM/analysis 能力”，没有冻结一个入口、成功结果、权限失败、取消/UNKNOWN 回执和保存边界。现有实现同时提供原生 prompt/step/cancel 路径，且另有分析保存和 cockpit preview/apply 路径；如果不先选定首期路径，合同、适配器、profile capability、验收指标和回退证据会各自选择不同子集。**

Plan baseline: CEO-REVIEW-001/003 approved one user-visible CRM/analysis vertical slice with measured lead time, rollback, isolation and maintenance cost, while leaving the exact flow pending.

Runtime evidence: the current native implementation contains `@app.post("/internal/native/prompt", status_code=202, include_in_schema=False)` at `backend/analytics_first_purchase_native.py:202`, invokes `store.accept(...)` at lines 207–212, executes the bound step at lines 214–225, and exposes cancellation with explicit `WORKER_ACTIVE`/`NO_ACTIVE_RUN` handling at lines 227–251. Separate first-purchase analysis and cockpit routes exist in `backend/analytics_first_purchase_analysis_app.py:112-159` and `backend/analytics_first_purchase_cockpit_app.py:118-174`. These are existing interfaces; the first slice choice remains unverified until selected.

Comparison grid:

| Choice | Entry and result | Evidence retained | Work and risk |
|---|---|---|---|
| A | Native DSH session → first-purchase prompt → bound worker result → permission/source reference → cancel or UNKNOWN recovery → save analysis; optional board preview is a follow-on assertion in the same journey. | Exercises the native session boundary, capability contract, worker receipt, cancellation, saved-analysis trust boundary and native fallback in one path. | Recommended; reuses the most complete existing synthetic path, but requires an explicit fixture for source/reference and permission outcomes. |
| B | Query-run HTTP kernel only: create/get/cancel a run through `/api/v1/analytics-query`, with no native prompt or UI handoff in the first gate. | Proves service contract, auth, idempotency and state recovery, but leaves DSH session/plugin integration for later. | Smaller integration surface, but poor proof of the user-visible plugin goal and risks declaring the plugin decoupled without native evidence. |
| C | Saved analysis → cockpit preview → version apply, with no new query execution in the first gate. | Proves preview/confirm/version history and dashboard ownership, but does not prove the DSH query lifecycle or worker cancellation. | Strong UI demonstration, but it depends on a trusted existing analysis and can hide upstream query/plugin failures. |

Question D15:
首期应该冻结哪一条可见 CRM/分析路径作为 contracts、profile capability、canary、metrics 和 stop/go 的共同对象？

Header: 选择首期端到端用户路径

Options:

A) Native first-purchase analysis (recommended) — 从原生 DSH 会话提交 first-purchase 查询，验证绑定 worker、权限/来源引用、成功结果、取消和 UNKNOWN 恢复，再保存分析；cockpit preview/apply 作为同一候选的后续断言，不改变首期入口。

B) Query-run HTTP kernel — 只验证 `/api/v1/analytics-query` 的 create/get/cancel、身份、幂等和状态恢复；保留 native session/plugin handoff 到后续阶段。

C) Saved analysis to cockpit — 只验证可信分析进入 cockpit 的 preview/apply/version history；查询执行和 native session 生命周期沿用现有证据，作为后续 gate。

State: approved

Actual answer: **A — Native first-purchase analysis**, selected by the user in D15 on 2026-10-01.

Accepted scope: freeze the first slice as the native DSH session → first-purchase prompt → bound worker result → permission/source reference → success or cancel/UNKNOWN recovery → saved analysis path. The same candidate may then assert cockpit preview/apply, but the first-slice entrypoint and stop/go metrics are the native analysis path. Contract, capability, profile, canary, rollback and test evidence must cover the selected path; no real business data or production UAT is implied.

History: CEO-REVIEW-001/003 intentionally left this path open; D15 resolved it with the existing first-purchase synthetic interfaces at `backend/analytics_first_purchase_native.py:202-251`.

## Review Sections

### Section 1: Architecture Review

**Current scope and dependency graph**

```text
official DSH host (exact tag/SHA, runtime lock)
        │ official bundle/client/slot/service contracts
        ▼
workspace vertical slice ── capability contract ── CRM API compatibility adapter
        │                                      │
        │                                      ▼
        │                             CRM/API service + domain schema
        │                                      │
        │                                      ▼
        │                             synthetic/isolated data fixture
        ▼
profile candidate + lock + manifest + journal + signed sidecars
        │
        ├── local sandbox / pre-prod receive / diff-explain / canary
        └── side-by-side active pointer ── rollback ── old profile
```

首期保持一个 workspace，物理多仓是 stop/go 之后的选项。profile 是组合与证据边界，不复制 DSH 源码、FastAPI 实现或 DuckDB 文件。`shine-brand`、board-components、CRM domain、query 和 workbench 的拆分只能在首期证据支持后进行。

**四条数据流与阴影路径**

```text
候选发布（happy）
plugin source + lock → manifest/peer/contract 校验 → build/package
→ digest/sign/SBOM → profile journal CANDIDATE → canary/verify
→ receive receipt → ACTIVE pointer → user-visible capability

nil/unavailable
unavailable package/runtime/contract → stable BLOCKED reason + repair command
→ no artifact activation; old ACTIVE remains

empty/zero
empty bundle list, empty manifest, empty capability set → schema fail-closed
→ candidate rejected; no implicit native override

error
build/sign/receive/canary/receipt error → typed failure + redacted evidence
→ journal UNKNOWN/BLOCKED; reconcile or rollback; native DSH remains usable
```

```text
用户分析（happy）
user action → auth/permission check → CRM API adapter → domain schema validation
→ synthetic/pre-prod service → traceable result/source reference → plugin view

nil/empty/wrong type
unavailable query or empty result → explicit EMPTY/NOT_AVAILABLE state + reason
→ no guessed SQL or fabricated business conclusion

upstream error
timeout/429/malformed response → bounded retry/backoff → typed error
→ preserved native loop and retry/recovery action
```

**Profile state machine**

```text
DRAFT → CANDIDATE → VERIFIED → CANARYING → ACTIVE
  │        │           │          │          │
  └────── BLOCKED ←────┴──────────┴──────────┴──→ ROLLED_BACK
                         │                     │
                         └──── UNKNOWN ────────┘
ACTIVE → DEPRECATED → CLEANED (only after evidence + approval)
```

Invalid transitions are rejected by the journal verifier: `DRAFT→ACTIVE`, `BLOCKED→ACTIVE`, `UNKNOWN→ACTIVE`, `ACTIVE→CLEANED` without a newer active pointer and cleanup receipt. Compare-and-swap on the active pointer and one action id per promotion prevent double activation.

**Before/after coupling**

```text
before: workbench ──source import──> funnel/waterfall
        workbench ──backend internals──> CRM/knowledge
        each bundle ──shared toolchain──> analytics-workbench

after:  plugin package ──capability contract──> profile
        plugin ──versioned domain API──> service
        board-components ──public component contract──> board-cockpit
        build kit ──dev-only──> independent packages
```

Findings and dispositions:

- **ARCH-001 / P1 / Applied**：唯一 DAG、每个包的 owner、命令实现位置仍需在 Phase 0 形成机器可读 manifest；否则 Phase 2/3 会重复迁移。已有 Phase 0、CEO-003 和 CEO-006 覆盖，实施前必须验证。
- **ARCH-002 / P1 / Applied**：DSH 同进程插件的部分注册、挂死和全局副作用不能仅靠 disabled 文案解决。CEO-005 已加入 activation transaction、隔离边界和负测；实现必须证明旧 profile 保持 active。
- **ARCH-003 / P1 / Applied**：API baseline 必须先于 workbench 拆分。CEO-004 已把 adapter、版本窗口和状态回退矩阵前置。
- **ARCH-004 / P1 / Applied**：digest 只证明字节身份，不证明来源可信。CEO-007 已把 allowlist、签名、SBOM、漏洞、轮换/撤销和审计回执列为首期门禁。
- **ARCH-005 / P2 / Applied**：10x 包数量会放大 profile lock 和 canary 时间，100x 会放大 manifest/journal 与 registry 压力；首期只验证一条切片，后续以并行 candidate、可重放 manifest 和缓存构建解决，不提前建设 catalog。

Eng Review verification:

- **ARCH-ENG-001 / P1 / confidence 9/10 / Applied** — the approved profile boundary is not yet the source of the plugin list. `scripts/release/readiness.mjs:7-15` currently declares `export const RELEASE_PLUGINS = [...]`, and `scripts/release/preflight.mjs:22` consumes that list before `:123` builds every entry. A future plugin-only repository update would therefore require changing the host/release code. Phase 0/T1 must move the ordered bundle list into the profile manifest and make readiness/preflight consume the pinned profile input; the verifier remains shared.
- **ARCH-ENG-002 / P1 / confidence 9/10 / Applied** — the release CLI still permits an implicit state source: `scripts/dsh.mjs:193-203` uses `args[0] || join(releaseEvidence, 'state.json')` for `reconcile`, `status` and `resume`, while `scripts/release/host-control.mjs:24-37` requires `RELEASE_STATE_PATH` for promotion. This can make a local command inspect a different journal from host activation. T1/T7/T11 must make the state path explicit or resolve one documented environment value and fail closed when absent; only isolated tests may supply a temporary path.

**单点故障与回退**：profile journal、签名信任根、CRM API adapter、active pointer 和唯一维护者是单点。journal 损坏时使用最后一个完整 receipt；信任根失效时拒绝候选而保持旧 profile；adapter 不兼容时旧 profile/旧 API window 保持；active pointer 写入冲突用 CAS 和 reconcile；维护者缺席由主备 RACI 和 runbook 暴露风险。回退路径是停止灰度、指向旧 profile、验证 native loop/API health、保留 candidate 证据，目标时长在 Phase 0 基线后设定。

### Section 2: Error & Rescue Map

本计划是策略/架构深度，以下使用 capability 级别，不虚构尚未存在的方法名。

| Capability / codepath | What can go wrong | Exception class / result | Rescued? | Rescue action | User sees |
|---|---|---|---|---|---|
| DSH contract spike | API/slot/lifecycle 语义不一致 | `UnsupportedContract` | Y | 标记 pin 不支持，阻断 profile | 明确不兼容版本与下一步 |
| API compatibility adapter | timeout、429、malformed schema | `Timeout`/`RateLimited`/`SchemaInvalid` | Y | 有界重试；仍失败则保留旧 profile/native loop | 可重试、权限或服务不可用原因 |
| manifest/allowlist | 缺文件、路径穿越、空 schema、digest mismatch | `ManifestInvalid`/`DigestMismatch` | Y | fail-closed，拒绝 candidate | 候选被拒及修复命令 |
| signature/SBOM gate | 未签名、撤销、漏洞超阈值 | `AdmissionRejected` | Y | 不接收，不激活，保留旧版本 | 供应链门禁原因 |
| activation transaction | 部分注册、挂死、崩溃、超时 | `ActivationTimeout`/`ActivationCrash` | Y | abort/cleanup，旧 active 保持 | 插件 disabled 或回退状态 |
| receive/reconcile | 网络断线、重复 receipt、UNKNOWN | `ReceiptUnknown` | Y | 用 action id 重试/查询，不伪造成功 | 状态 UNKNOWN 和恢复命令 |
| canary/health | native loop/API/权限/恢复失败 | `CanaryFailed` | Y | 不切换，记录失败 evidence | 候选未激活 |
| domain state migration | lock、部分迁移、不可逆变化 | `MigrationConflict` | Y | expand/contract 或 forward-fix；禁止假回退 | 迁移阻断和人工 gate |
| rollback/cleanup | 旧包未提供或 cleanup 条件不满足 | `RollbackUnavailable` | N until verified | 保留旧 profile 和人工恢复 runbook | 明确 BLOCKED，不删除数据 |
| AI/plugin user action | refusal、empty/invalid result、duplicate submit | `ActionRejected`/`Conflict` | Y | 幂等 action id、冲突 receipt、native fallback | disabled/NOT_AVAILABLE 或可重试 |

所有未知分支必须由 owner 在实现阶段映射为稳定错误码；禁止 catch-all 后静默继续。`RollbackUnavailable` 是首期的 P1 负测，未通过不得进入 stop/go。

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Plan mitigation | Remaining verification |
|---|---|---|---|---|
| 恶意/篡改 artifact、路径穿越、tar bomb | Medium | High | allowlist、manifest schema、大小/路径约束、digest、签名、解包到隔离目录 | synthetic malicious archive fixtures |
| 包脚本或依赖供应链污染 | Medium | High | 固定 lock、SBOM、漏洞阈值、来源签名、撤销/轮换、dev-only kit | CI tool availability and trust-root drill |
| 插件伪装 native UI/工具/会话 | Medium | High | native-first contract、capability declaration、slot allowlist、fallback regression | UI/contract conformance on both DSH pins |
| CRM/API IDOR 或越权查询 | Medium | High | service-side auth/permission scope、recorded permission matrix、schema validation | pre-prod negative probes without business data |
| Tailscale endpoint 被当作授权 | Low-Medium | High | Tailscale 只做传输/探针，真正 gate 由 artifact/receipt/operator policy 决定 | authorized pre-prod route evidence |
| 日志泄露 token、路径或业务数据 | Medium | High | redaction、synthetic fixture、最小 audit fields、禁止真实 DuckDB | secret scan and redaction tests |
| receipt/action replay | Medium | Medium-High | unique action id、CAS、journal idempotency、conflict/unknown receipt | repeated/interrupted receive tests |
| 真实 DuckDB 被插件包带走 | Low | Critical | data/service boundary、denylist、路径审计、synthetic-only local tests | path/asset scan before packaging |

本节未改变已接受的安全边界；它把签名信任根、供应链撤销、权限负测和日志脱敏列为实施证据，而不是把 hostname/Tailscale 当作安全证明。

### Section 4: Data Flow & Interaction Edge Cases

**发布流的并发时序**

```text
candidate A        journal/lock           candidate B
   |                   |                    |
   |--prepare A------->|                    |
   |                   |<--prepare B--------|
   |                   |--CAS rejects B---->|
   |--verify/canary--->|                    |
   |--activate A------>|                    |
   |                   |--active=A--------->|
   |                   |<--reconcile B------|
   |                   |--B marked STALE--->|
```

如果 B 的验证先完成，也不能覆盖 A，除非 B 的 parent active digest 与 journal CAS 条件仍匹配。重复 receive 使用同一 action id 返回同一 terminal receipt；未知 receipt 只能 reconcile，不能当成失败后再次盲写。

**用户交互边界**

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| 安装候选 | 双击/重复提交 | Required | action id + conflict receipt |
| 灰度切换 | 用户离开页面/网络断线 | Required | journal state independent of UI; reconcile |
| 能力调用 | provider unavailable/版本不兼容 | Required | disabled/NOT_AVAILABLE + native fallback |
| 分析查询 | 空结果/超大结果/权限拒绝 | Required | EMPTY/permission error/size limit |
| 预览保存 | stale version/重复保存 | Required | version compare + conflict receipt |
| 回退 | canary timeout/旧包未提供 | Required | old active retained; rollback blocked loudly |
| 清理旧 profile | 未达弃用条件/仍有 active session | Required | cleanup gate refuses deletion |

**数据一致性检查**：服务 schema 使用 expand/contract；插件消费方先支持新旧版本窗口；profile、service 和 durable state 组合必须在回退矩阵中逐格验证。不可逆状态变化走 forward-fix，不能宣称代码回退等于数据回退。

### Section 5: Code Quality Review

计划层面的主要质量风险不是重复代码，而是控制面职责重复：profile manifest、journal、receipt、host state 和 catalog 不能各自成为状态源。已接受的边界是 profile journal 为权威，transport sidecar/host view 只能引用和校验它。

发现：

- **QUALITY-001 / P1 / Applied**：所有命令入口需要明确 owner 和最小实现位置；Phase 0 manifest 必须列出脚本/包/CI 入口，避免文档写不可用的 `pnpm dsh` 命令。
- **QUALITY-002 / P1 / Applied**：plugin kit 只能是 dev/CI 工具，不能被 runtime import；需要 package invariant 和 built-package grep。
- **QUALITY-003 / P2 / Applied**：同一 digest、contract SHA、action id 的解析和校验只能有一个 verifier；其他入口调用它，不复制逻辑。
- **QUALITY-004 / P2 / Applied**：首期 workspace 与未来多仓必须共享同一 manifest schema，迁移时只替换 package source，不重写 release semantics。

Eng Review verification:

- **QUALITY-ENG-001 / P1 / confidence 10/10 / Applied** — package boundaries are currently source-coupled. `dsh-plugins/shine-funnel/build.mjs:4` and `dsh-plugins/shine-query/build.mjs:4` both import `../analytics-workbench/toolchain.mjs`; `dsh-plugins/analytics-workbench/src/board-spec/component-view.mjs:6-7` imports funnel and waterfall source, and `dsh-plugins/crm-knowledge/src/client/index.tsx:10-18` imports workbench theme/slot code. T1/T3 must record these first-party callers and migrate each in the approved order, extracting only the dev-only kit and public capability/domain contracts. No shared runtime helper may bridge isolated service boundaries.

未发现需要在本计划阶段规定具体类名或函数的理由；实现阶段由 owner 按现有模块边界落地，并以 contract/invariant/negative tests 证明。

### Section 6: Test Review

**测试覆盖图**

```text
contract spike ── unit/typecheck/static grep
      │
package manifest/invariant ── package smoke
      │
profile install/load/unload/restart ── integration
      │
API adapter + synthetic service ── contract/integration
      │
activation transaction + crash/timeout ── fault-injection/system
      │
canary + gray + rollback ── system/E2E on isolated host fixture
      │
pre-prod shape/auth/latency ── authorized pre-prod UAT
```

2am 信心测试：同一个 immutable candidate 在 clean workspace、隔离 profile 和 pre-prod shape fixture 中通过分析成功、权限拒绝、取消/UNKNOWN receipt、native fallback、重启恢复和原子回退。

敌对 QA 测试：篡改一个字节、替换一个依赖、空 manifest、重复 action id、并发 candidate、部分注册后崩溃、服务 schema 降级、Tailscale 断线、日志 token 探测、旧 profile 未提供。

Chaos 测试：在 receive、verify、activation、canary 和 rollback 的每个状态边界 kill/timeout，重新运行 reconcile，确认旧 active 和 journal 不分叉。

测试金字塔：大量 manifest/contract/invariant 单测，较少 profile/API 集成，极少真实浏览器/主机 E2E；真实杭州 UAT 单独授权。所有依赖网络、时间和随机性的测试固定 fixture、clock 和 retry budget，不能依赖浮动 registry。

发现：

- **TEST-001 / P1 / Applied**：验证命令草案必须在 Phase 0 绑定真实脚本 owner，未实现前只能标为 planned，不得写成已通过证据。
- **TEST-002 / P1 / Applied**：每个故障路径必须同时断言 journal terminal state、active pointer、用户可见状态和脱敏日志，helper pass 不等于 caller pass。
- **TEST-003 / P2 / Applied**：对 10x synthetic candidate 做包大小、构建时间、启动时间和并发 receive 压测；100x 只做 manifest/journal 规模模型，不触碰真实数据库。
- **TEST-004 / P2 / Applied**：若后续修改 AI prompt/LLM 合同，必须增加 malformed/empty/refusal/invalid JSON eval；本计划当前不改变 prompt，因此不假报已有 eval 通过。

Eng Review selected-path coverage:

```text
CODE PATHS                                                   USER FLOWS
[★★★ TESTED] /internal/native/prompt → store.accept          [GAP→E2E] native DSH session submits first-purchase query
  ├── [★★★ TESTED] bound /internal/native/first-purchase      ├── [GAP→E2E] permission/source reference shown to user
  ├── [★★★ TESTED] replay/idempotency                         ├── [GAP→E2E] cancel/UNKNOWN recovery remains actionable
  ├── [★★★ TESTED] cancel WORKER_ACTIVE/NO_ACTIVE_RUN         ├── [GAP→E2E] successful result saved as analysis
  ├── [★★★ TESTED] session/WAL reopen fixtures                └── [GAP→E2E] plugin failure leaves native conversation usable
  └── [★★  TESTED] saved analysis/cockpit HTTP
                                                             [GAP] profile candidate installs the selected plugin and replays it
```

The selected path already has 34 passing backend tests across native, HTTP and saved-analysis modules, plus 15 native session/state smoke tests in the current worktree. Those tests are strong component evidence; they do not yet prove the same immutable profile candidate through plugin admission, activation isolation, canary and rollback.

Eng Review findings:

- **TEST-ENG-001 / P1 / confidence 9/10 / Applied** — add one integration/E2E fixture that starts from the selected native path and asserts the complete user-visible chain, including permission/source metadata, cancel or `EXECUTION_UNKNOWN`, saved-analysis rejection for non-success, native fallback, and candidate digest binding. Existing coverage at `backend/tests/test_analytics_first_purchase_native.py:274-369` and `:587-665` proves the service path; the new proof must add profile/plugin activation around it.
- **TEST-ENG-002 / P1 / confidence 9/10 / Applied** — add profile-level tests for a profile-supplied plugin list and explicit state path. Current release tests pass (52/52), but `doctor --release` in this plan worktree is correctly `BLOCKED` for the untracked plan, unavailable pinned upstream checkout and unavailable runtime bundle; formal candidate/preflight evidence remains NOT_RUN. Do not label those release gates complete from component tests.

### Section 7: Performance Review

首期性能边界是发布控制面和 API adapter，而不是读取真实 131GB DuckDB。需要测量：candidate build/pack P95、签名/SBOM 时间、manifest verify、profile startup/restart、API adapter p95/5xx、receive retry 时长和 rollback time。

10x 风险是 lockfile/manifest 解析与 canary 顺序导致发布时间线性增加；100x 风险是 registry/artifact storage、journal contention 和 sidecar 累积。缓解是 immutable digest cache、并行但受 CAS 约束的 candidate、分阶段 canary、bounded queue 和 journal compaction；不能通过放宽校验解决。

发现：

- **PERF-001 / P1 / Applied**：Phase 0 先采基线再设数值目标，至少包含 build-to-candidate、rollback、API p95/5xx、plugin/native failure 和 journal recovery。
- **PERF-002 / P2 / Applied**：为 receive/reconcile 设置连接、重试、队列和磁盘上限；超限进入 BLOCKED，而不是无限堆积。
- **PERF-003 / P2 / Applied**：synthetic load fixture 需要限制结果大小、内存和连接池，避免测试机资源耗尽。

Eng Review verification:

- **PERF-ENG-001 / P2 / confidence 8/10 / Applied** — `scripts/release/preflight.mjs:121-126` runs prepare, then builds every plugin in a serial `for (const plugin of plugins)` loop before runtime, release and tests. This is deterministic but makes plugin-only lead time grow with package count. Phase 0/T10 must record the serial baseline and set a bounded P95 target; only then may independent package builds be parallelized, with profile ordering and CAS kept serial at admission/activation.

### Section 8: Observability & Debuggability Review

每条控制面事件至少带 `release_id`、`profile_digest`、`artifact_digest`、`action_id`、`host_id`、`stage`、`attempt`、`result` 和 redacted `reason`。日志事件按 prepare/build/sign/receive/verify/canary/activate/reconcile/rollback/cleanup 划分，不能记录 token、真实 DuckDB 路径或业务内容。

核心指标：candidate lead time、verify failure rate、native/plugin error ratio、API p95/5xx、canary failure、rollback duration、UNKNOWN receipt age、active profile age、journal recovery count、cleanup blocks。告警包括 active 与 journal 分叉、UNKNOWN 超时、签名/漏洞门禁失败、native loop 受影响和回退阈值超限。

首日 dashboard 需要 profile timeline、artifact/receipt consistency、capability availability、API/permission、host transport 和 rollback panel；runbook 按 failure registry 逐项恢复。三周后仍能通过 `release_id + action_id` 重建一次发布，不依赖聊天记录。

发现：

- **OBS-001 / P1 / Applied**：把上述事件字段和 redaction 规则写入 capability/release evidence contract，并由 CI 检查敏感字段。
- **OBS-002 / P1 / Applied**：UNKNOWN receipt 必须有 age/owner/next action 指标，否则网络断线会变成永久静默状态。
- **OBS-003 / P2 / Applied**：为单维护者提供 `profile diff/explain` 和 `reconcile --dry-run`，调试不应要求手工读取多个日志目录。

### Section 9: Deployment & Rollout Review

```text
build pinned source → package/sign/SBOM → offline verify
→ side-by-side receive → manifest/receipt check → isolated canary
→ pre-prod shape/auth/latency gate → gray window
→ CAS active pointer switch → bounded health watch
→ retain old profile → deprecate → cleanup after evidence
```

部署顺序：先验证服务兼容窗口和 profile artifact，再 receive；先并排安装，再 canary，再灰度；只有阈值通过才能切 active。Tailscale 负责传输/探针，不负责信任或发布状态。首 5 分钟检查 active/profile/receipt/API/native loop，首 1 小时检查 error ratio、p95、UNKNOWN、rollback threshold；任何失败保留旧 profile。

发现：

- **DEPLOY-001 / P1 / Applied**：旧/新 profile、service schema 和 durable state 必须按回退矩阵组合演练；不能只回退 npm 包。
- **DEPLOY-002 / P1 / Applied**：灰度/feature flag 的默认值、切换者、超时和撤销路径要落入 runbook；默认关闭新能力，保留 native fallback。
- **DEPLOY-003 / P2 / Applied**：跨 OS/WSL/Node/Python 环境矩阵必须由 pre-prod fixture 和 cold unpack 记录，不把本地 macOS 通过当作杭州通过。
- **DEPLOY-004 / P2 / Applied**：清理旧版本需单独授权，本计划只定义 gate，不执行删除。

### Section 10: Long-Term Trajectory Review

当前可逆性评分 **4/5**：workspace 垂直切片、profile lock、adapter 和旧 active 都可回退；真实数据迁移、物理分仓、catalog 和删除旧 runtime 被 gate 隔离，因此没有立即的一次性门。

技术债：维护 manifest/journal/contract 三类 schema、主备 owner、双轨窗口、供应链信任根和 pre-prod fixture 会增加初始运维成本。路径依赖：如果 plugin kit 或 capability contract 变成业务单体，会重新制造中央耦合；因此 kit 设 dev-only、domain contract 设 owner/source/compat policy。知识集中：RACI、runbook、profile diff/explain 和机器 manifest 让新维护者可接手。

一年后理想状态是：新工程师只需看边界 manifest，选择一个插件仓库，运行固定 doctor/test/package/canary 命令，更新 profile lock 并得到可回退 receipt；不必重新理解 CRM、DuckDB 或 DSH 上游实现。平台能力可复用于知识库、board 和其他独立插件。

发现：

- **TRAJ-001 / P1 / Applied**：必须把“插件-only 更新不重建 DSH/服务/数据”作为 stop/go 的可执行验收，而不是愿景。
- **TRAJ-002 / P2 / Applied**：catalog、物理多仓、DSH 0.2 activation 都有明确触发条件/回退条件，防止平台先于产品价值扩张。
- **TRAJ-003 / P2 / Applied**：每个领域迁移需要 deprecation date 和 cleanup owner，避免旧 adapter 永久存在。

### Section 11: Design & UX Review

本计划包含用户可见的分析、能力 disabled/NOT_AVAILABLE、native fallback、预览/确认和灰度状态，因此不能跳过 UI/UX 评审。依据 `DESIGN.md`，新 React/DSH 插件应使用集中 Ant Design token 和官方 slot/适配层；当前用户要求的 native-first 约束优先于任何品牌覆盖，不能用品牌标题、侧栏或工具合同伪装原生 DSH。若 DESIGN.md 仍保留允许全面品牌覆盖的旧表述，实施前要通过设计合同明确优先级，不能自行覆盖上游。

**信息架构与状态覆盖**

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| CRM/分析入口 | skeleton + stage | 明确无数据/无能力原因 | 权限/服务/合同错误 | 可追溯结果与来源 | 结果可用但某 capability disabled |
| profile/candidate 状态 | verify/canary progress | 无 candidate | BLOCKED/UNKNOWN + next action | receipt + active digest | 灰度中/旧 profile active |
| HTML/页面编辑 | preview pending | 空内容 | schema/selection 拒绝 | preview → confirm → version | disabled save/export/send with reason |
| rollback/cleanup | reconciling | 无旧版本 | rollback blocked | old profile active | cleanup postponed |

**用户流程**

```text
进入原生 DSH 对话
  → 选择受支持的 CRM/分析能力
  → 加载/权限检查
     ├─ 缺能力：disabled/NOT_AVAILABLE + 原因 → 回到原生对话
     ├─ 失败：错误/重试/回退 → 原生对话保持可用
     └─ 成功：分析结果 + 来源/查询引用
           → 预览/确认
              ├─ 冲突/取消/UNKNOWN：保留草稿，给恢复动作
              └─ 保存：新版本 + receipt；失败则旧版本继续可用
```

**首期 D15 Interaction Contract（已批准 D1）**

首期用户只有一条可见入口：DSH 原生会话中的 first-purchase prompt。插件不得新增导航、品牌壳或第二套会话；`cockpit preview/apply` 只作为同一 immutable candidate 的后续断言，不进入首期主入口。

首期输入合同同时冻结三类示例，避免把任意自然语言当成首购查询：

- **支持**： “按固定 30 天观察窗比较 A/B 渠道首购商品的 N 日正装转化率”。解析为 `first_purchase_product_path`，要求 `analysis:read` 和 synthetic 数据范围。
- **拒绝**： “直接导出全部客户手机号并发送营销短信”。返回 `UNSUPPORTED`，说明导出/发送未接通且不能绕过原生权限；不执行查询、不显示数字、不允许保存。
- **需澄清**： “看看最近表现”或缺少观察窗/渠道范围。返回 `NEEDS_CLARIFICATION`，保留原问题，要求补齐范围；不生成经营结论、不允许保存。

`UNSUPPORTED` 与 `NEEDS_CLARIFICATION` 是用户态合同，不得降级成通用 `FAILED`；两者都必须显示原因、下一步和禁止动作，并保留回到原生 composer 的路径。

```text
第一层：DSH 原生 transcript / composer
  └─ 用户提出受支持的首购分析问题；原生标题、侧栏、会话和工具归 DSH 所有
第二层：first-purchase-query-card
  └─ 阶段、结果数字、权限与来源同卡展示；能力未提供或失败仍回到原生对话
第三层：first-purchase-saved-analysis-view
  └─ 只有 success 且用户明确确认后出现；显示版本、时间和 receipt
```

首期验收必须逐层确认：第一眼能回到原生 composer，第二眼先看到阶段/结果及 provenance，第三眼才出现保存；保存不能与提问抢同一主 CTA。任何 synthetic 结果、权限限制和 capability disabled 状态必须在窄屏仍可见。维护者的 `plugin candidate` receipt、profile journal、digest、灰度和 rollback 属于 CLI/运维控制面，不渲染进老板或分析师的首购界面。

**D15 状态合同（已批准 D2）**

| 组件/状态 | 用户看到什么 | 主动作 / 禁止动作 | 焦点与播报 |
|---|---|---|---|
| `QUEUED` | 已接收 action，显示 action id 的短摘要、排队原因和最近更新时间；不伪造百分比 | 允许取消或查看状态；禁止重复提交和保存 | `role=status` + `aria-busy=true`，阶段变化只播报一次 |
| `AUTHORIZING` | 正在核对权限、数据范围和 capability；显示 elapsed 与 last-updated | 允许取消；禁止重复提交、保存和显示数字 | `aria-live=polite` 播报阶段，不使用无阶段全屏 skeleton |
| `RUNNING` | 正在执行绑定 worker，显示真实阶段、elapsed、last-updated 和可取消提示 | 允许取消；禁止重复提交和保存 | `role=status` + `aria-busy=true`；不伪造百分比 |
| `VALIDATING` | 正在校验结果、来源和 freshness；结果未确认前不展示经营结论 | 允许查看状态；禁止保存、导出、发送和重复 action | 阶段变化进入独立 `aria-live=polite`，焦点保持在当前用户操作处 |
| `READY_TO_SAVE` | 校验通过，显示结果、provenance、synthetic 标记和保存前提示 | 允许预览/确认保存；禁止把预览当历史版本 | `aria-busy=false`；焦点按用户动作落在结果标题或保存动作 |
| `EMPTY` | “没有符合当前范围的结果”及数据时间/范围；不把空结果写成经营结论 | 允许修改问题或范围；禁止保存空结果 | 空态标题可读，主动作可聚焦 |
| `PERMISSION_DENIED` | 缺少的权限、数据范围和下一步联系/申请路径 | 允许回到原生对话或申请权限；禁止保存、导出、发送 | 错误说明进入 live region，焦点落在下一步动作 |
| `UNSUPPORTED` | 当前请求不在首购能力边界内，说明未接通能力和不能执行的动作 | 允许修改问题或回到原生对话；禁止执行、保存、导出、发送 | `aria-live=polite` 播报原因，焦点落在修改问题动作 |
| `NEEDS_CLARIFICATION` | 缺少观察窗、渠道或范围，保留原问题并列出需要补充的字段 | 允许补齐范围；禁止生成数字、保存或重提同一不完整 action | `aria-live=polite` 播报需要补充的字段，焦点落在补充入口 |
| `NOT_AVAILABLE` / capability disabled | 能力名称、未接通原因和“原生对话仍可用” | 允许继续原生对话；禁止伪装成 DSH 原生能力或反复点击不可用动作 | 文案和图标同时表达，不只靠颜色；焦点回 composer |
| `FAILED` / timeout / schema error | 稳定错误码可折叠，给出重试或修改范围的原因 | 允许有界重试；禁止把失败结果保存为成功 | 焦点落在重试/修改动作，保留原生输入 |
| `EXECUTION_UNKNOWN` / `ReceiptUnknown` | 明确“结果尚未确认”，显示 action id、最后已知阶段和核对方式 | 允许 reconcile/查询状态；禁止重提同一 action、保存或宣称成功 | live region 播报未知状态；焦点落在核对动作 |
| `CANCEL_PENDING` (`WORKER_ACTIVE`) | 已收到取消请求，但执行尚未确认退出；明确“仍在核对”，不宣称已停止 | 允许查询同一 action；禁止重复提交、保存或把它当作完成 | `aria-live=polite` 播报取消请求；焦点落在核对/状态动作 |
| `CANCELLED_NO_ACTIVE_RUN` (`NO_ACTIVE_RUN`) | 没有可取消的活动任务；明确“没有任务在运行”，不伪造停止结果 | 允许重新提问；禁止保存未完成结果 | 焦点回 composer 或重新提问按钮 |
| `SAVE_PREPARING` | 已提交保存请求，正在写入新版本；当前结果仍保留 | 允许查看当前结果；禁止再次提交同一保存动作 | `aria-live=polite` 播报一次；焦点留在保存状态 |
| `SAVE_FAILED` | 当前结果未保存，失败原因可理解 | 允许使用同一保存动作重试；禁止创建新版本的重复请求 | 错误进入 live region，焦点落在重试动作 |
| `SAVE_UNKNOWN` | 保存结果尚未确认，显示 action id/最后已知阶段 | 允许 reconcile 同一 action；禁止再次创建保存动作或宣称成功 | `aria-live=assertive` 播报未知状态；焦点落在核对动作 |
| `SAVE_CONFLICT` | 已有版本发生变化，当前结果仍可查看 | 允许查看已有版本或生成新的明确保存意图；禁止覆盖他人/更新后的版本 | 焦点落在查看版本/重新保存动作 |
| `HOST_RESTART_REQUIRED` | 宿主进程需要重启才能完成隔离/加载；显示旧 active 指针保留、进程可用性待核对，草稿和 receipt 按恢复合同保留 | 允许查看回执、复制恢复命令、重启后重新打开会话；禁止在重启前重提同一 action、保存或宣称插件已加载 | `aria-live=assertive` 播报重启要求；焦点落在“重新打开会话/核对状态” |
| `SUCCESS_UNSAVED` | 数字、权限、来源、synthetic 标记和“尚未保存” | 允许预览/确认保存；禁止把预览当历史版本 | 焦点落在结果标题，保存为明确的后续动作 |
| `SAVED` | 新版本、时间、receipt 和后续查看入口 | 允许查看/回退（按权限）；禁止覆盖旧版本 | 保存回执进入 live region，焦点落在版本链接 |
| `PARTIAL` | 哪个 capability 被关闭、哪些结果仍可信及限制 | 允许查看可用部分或回到原生；禁止隐藏限制后保存完整结论 | 文案、图标和结构同时表达部分状态 |
| `STALE` | 结果仍可查看，但 freshness 已超过允许保存窗口，显示数据时间和过期原因 | 允许刷新/重新查询；禁止保存为新版本或伪装成当前结论 | `aria-live=polite` 播报过期原因，焦点落在刷新动作 |
| `EXPIRED` | 结果已不能用于当前保存合同，保留原 receipt 和失效时间 | 允许重新查询或查看历史；禁止保存、导出或发送 | `aria-live=assertive` 播报失效，焦点落在重新查询动作 |

状态合同只描述用户面；profile journal 的 `PASS/PARTIAL/NOT_RUN/BLOCKED`、canary、rollback 和 candidate digest 仍属于维护者控制面，不能直接复用为老板界面的文案。`READY_TO_SAVE` 是展示阶段，只能对应服务已确认的 `SUCCESS_UNSAVED` 结果；保存还须同时满足 D4-C、`FRESH`、权限和完整 provenance。其它状态默认不能保存，不能由前端阶段值自行放行。

**加载、计时与未知结果语义（已批准 D8 补充）**

D15 的执行阶段固定为 `QUEUED → AUTHORIZING → RUNNING → VALIDATING → READY_TO_SAVE`；服务或插件只能报告真实阶段，不能用 0–100% 百分比填充未知进度。每个阶段至少提供 `started_at`、`elapsed_ms`、`last_updated_at` 和当前 `action_id`，前端只按服务事件更新，不自行推断“快完成”。

若在合同规定的 heartbeat/timeout 窗口内没有新的状态事件，结果转为 `EXECUTION_UNKNOWN`，保留最后已知阶段、elapsed、last-updated 和 correlation/action identity。此状态必须给出下一次 reconcile 时间或手动核对动作；在核对完成前禁止重复提交、保存、导出、发送或宣称成功。reconcile 成功才回到真实阶段或 `SUCCESS_UNSAVED`，确认失败则进入 `FAILED`/`CANCELLED_NO_ACTIVE_RUN`，并保留原 action 的回执。

超时和 UNKNOWN 文案必须说明“系统尚未确认结果”，不能使用“已完成”“已取消”等推断性措辞。前端使用 `aria-busy=true` 覆盖 `QUEUED` 到 `VALIDATING`，进入 `READY_TO_SAVE` 或终态后改为 `false`；`role=status`/`aria-live=polite` 只播报阶段和恢复动作一次，避免轮询造成重复播报。T14 需用断线、延迟和重复 receipt fixture 验证这些边界，不能把静态 loading 截图当作通过证据。

**状态文案、阶段标题与来源引用合同（已批准 D11 补充）**

| 状态/阶段 | 标题或首句 | 主动作 | 禁用/禁止动作 | 播报要求 |
|---|---|---|---|---|
| `QUEUED` | “已收到分析请求，正在排队” | “查看状态” / “取消请求” | 再次提交同一问题、保存 | 只播报一次 action 已接收 |
| `AUTHORIZING` | “正在检查权限和数据范围” | “取消请求” | 显示数字、保存、导出 | 播报检查阶段，不承诺耗时 |
| `RUNNING` | “正在计算首购路径” | “取消请求” | 重复提交、保存 | 播报真实阶段和 elapsed，不伪造百分比 |
| `VALIDATING` | “正在核对结果和来源” | “查看状态” | 保存、导出、发送 | 播报校验阶段，保留结果草稿 |
| `READY_TO_SAVE` | “结果已核对，可以预览保存” | “预览保存” | 直接覆盖已有版本 | 播报可保存条件和 freshness |
| `EXECUTION_UNKNOWN` | “结果尚未确认” | “核对结果” | 再次提交、保存、宣称成功 | `aria-live=assertive` 一次，包含最后已知阶段 |
| `PERMISSION_DENIED` | “当前权限不足，无法读取此范围” | “查看权限要求” / “回到对话” | 保存、导出、发送 | 播报缺少的 scope，不只显示 403 |
| `STALE` / `EXPIRED` | “结果已过期，需要重新查询” | “重新查询” / “查看历史” | 保存为新版本、发送 | 播报过期时间和原因，不把旧数字说成当前结论 |
| `SAVE_PREPARING` | “正在保存为新版本” | “查看保存状态” | 再次保存 | 只播报一次保存已提交 |
| `SAVE_UNKNOWN` / `SAVE_CONFLICT` | “保存结果尚未确认” / “版本已发生变化” | “核对保存” / “查看最新版本” | 重复创建版本、覆盖他人版本 | 播报 action/版本信息和下一步 |

按钮文案必须使用动作加对象（如“核对结果”“重新查询”“确认保存”），不能用没有上下文的“继续”“处理”或重复使用“重试”覆盖不同语义。错误码、action id 和 candidate digest 属于受控技术详情：主界面显示可读短摘要，技术详情提供复制完整值并保留 `aria-label`；复制失败要显示可见的手动选择路径。

`source_refs` 在窄屏最多显示一行可读标题或脱敏路径，使用“展开来源”查看完整引用；完整值不得通过 CSS 截断后丢失，也不得放进仅 tooltip 可见的内容。展开/收起保持键盘焦点，复制按钮有明确状态（“已复制”/“复制失败，请手动选择”），不会把 URL、SQL、权限范围或 synthetic 标记播报成秘密。T14 的文案 fixture 必须逐态检查标题、主动作、禁止动作和 live-region 去重。

**两条首期 storyboard（已批准 D3）**

| 步骤 | D15 终端用户做什么 | 用户需要感受到什么 | 计划必须提供的支持 |
|---|---|---|---|
| 1 | 在原生 composer 提出受支持的首购问题 | 清楚知道入口和范围 | 原生标题/侧栏/会话保留；提示能力边界和 synthetic 环境 |
| 2 | 等待 worker 执行并观察阶段 | 系统在工作，不是卡死 | 阶段名、取消动作、重复提交保护、可读进度 |
| 3 | 查看数字、数据范围、权限与来源 | 结果可信且可核对 | provenance 同卡、synthetic 标记不可隐藏、数字与来源同层级 |
| 4 | 选择预览/确认保存 | 保存是明确承诺 | `SUCCESS_UNSAVED` 才显示保存主动作；保存前保留原生对话 |
| 5 | 遇到权限拒绝、取消或 UNKNOWN | 不丢数据，知道下一步 | 各自的中文原因、恢复/核对动作、禁止误保存和焦点回 composer |
| 6 | 看到保存回执或部分结果 | 结果有版本，限制透明 | 版本/时间/receipt；partial 显示限制，不冒充完整结论 |

| 步骤 | T21 维护者做什么 | 维护者需要感受到什么 | 计划必须提供的支持 |
|---|---|---|---|
| 1 | 读单一 Quickstart，确认 DSH pin、包和 state path | 不需要猜哪个仓/哪个版本 | README/STATUS/Quickstart 事实一致，命令前置条件明确 |
| 2 | 运行只读 doctor/preflight check | 失败在构建前可定位 | 每项稳定错误码、修复命令、是否联网和是否写 artifact |
| 3 | 运行 `pnpm dsh plugin candidate` | 只构建选择的插件 | packed artifact digest、profile diff、capability 和隔离路径显式输出 |
| 4 | 读取单一 receipt | 能判断下一步，不会误当生产通过 | `PASS/PARTIAL/NOT_RUN/BLOCKED`、`NOT_AVAILABLE` 原因、local receive/verify 命令 |
| 5 | 失败后 resume/reconcile 或保留旧 profile | 系统可恢复且旧版本仍安全 | 同一 journal/state path、action id、旧 active 指针和不上传/不重启承诺 |

这两条 storyboard 不共享界面：D15 不展示 profile digest/journal，T21 不改变原生会话或业务结果。二者只共享 immutable candidate、状态术语的机器合同和“失败时旧状态保持”的安全语义。

设计检查结果：

- 信息架构已冻结为“原生 composer → first-purchase-query-card（结果与 provenance 同卡）→ success 后 saved-analysis-view”；不可把发布控制面错误地做成覆盖原生导航的第二应用。
- 键盘焦点、屏幕阅读器、状态颜色对比度和触控目标需要沿用 Ant Design/现有 token；移动端单列时不能隐藏 disabled、权限和 synthetic 边界。上述状态合同必须在 T14 fixture 和组件验收中逐态覆盖。
- 原生/插件边界必须可见但克制：能力名、来源和状态原因可见，不能用品牌元素暗示能力已由 DSH 原生提供。
- 当前 `DESIGN.md` 的全面品牌覆盖描述与 native-first 要求存在潜在冲突，属于实施前文档合同修正项；不改变本计划的安全/原生优先决策。

**Native-first 所有权矩阵（沿用用户已确认的原生优先要求）**

| 区域 | 所有者 | 首期允许的插件行为 | 首期禁止 |
|---|---|---|---|
| DSH 标题、侧栏、会话 transcript/composer、原生工具 envelope | DSH 上游 | 通过官方 slot/client 提供能力声明和结果卡入口 | 改名、覆盖、伪装成原生菜单/工具或另起一套会话 |
| first-purchase-query-card、provenance、saved-analysis-view 内部内容 | ShineMage 插件 | 使用集中 Ant Design token、品牌字体/状态色和明确能力来源 | 全局选择器、复制 Vue theme、把插件能力写成 DSH 原生能力 |
| disabled/`NOT_AVAILABLE` 与 native fallback | DSH 原生语义 + 插件文案 | 在插件卡内显示原因，保留原生 composer 可用 | 用品牌装饰隐藏未提供、把禁用变成空白或静默失败 |
| profile/candidate/journal/canary/rollback | 维护者 CLI/运维控制面 | 通过 T21 receipt 和 runbook 可追踪 | 渲染成老板/分析师的第二导航或业务卡片 |

首期验收以这张矩阵为准；`DESIGN.md` 中更宽的全量品牌覆盖只在不违反矩阵的前提下另开文档修订，未修订前不得按它覆盖 DSH 原生 chrome。

Eng rerun 记录的实现对齐点：React `competitionTokens.breakpoint` 当前是 `phone/tablet/laptop`（`dsh-plugins/analytics-workbench/src/client/competition-shell/tokens.ts:158`），Vue 事实源是 `compact/mobile/table/board/action`；T9 必须把它们映射到一份公开 token 合同，而不是让两个框架各自猜断点。`ctx.theme.overrideTokens` 与 brand-mark slot 只有显式 brand override 时才允许，D15 candidate 必须默认关闭该路径，确保 native title/sidebar/session/tool ownership 不被插件覆盖。

**首期低保真组件 state board（已批准 D4）**

| 组件 | Slot/归属 | 必须表达 | 允许的品牌层 | 禁止 |
|---|---|---|---|---|
| Prompt | DSH 原生 composer；插件只注册 capability | 受支持问题、范围和 synthetic 环境提示 | 不改 composer chrome；结果卡入口使用 token | 新导航、第二输入框、覆盖原生标题 |
| Progress | 插件结果 card 内 | 当前 stage、取消、重复提交保护 | `--sm-*` 间距/字体；静态状态线 | 无阶段全屏 skeleton、只用转圈或颜色 |
| Result | `first-purchase-query-card` | 数字、口径、时间、限制和“尚未保存” | Ant Design token 映射 ShineMage 状态色 | 经营结论式标题、默认卡片墙、隐藏限制 |
| Provenance | Result 同卡固定区 | 环境、数据时间、查询范围、权限、来源、synthetic | 边界/字重/可折叠详情 | 只放 tooltip、移动端隐藏、把 synthetic 当真实 |
| Save | Result 内 success-only action | 明确“确认保存”、版本和 receipt | Signal Lime 只表达确认，不做大面积背景 | 非 success 可点、渐变 CTA、覆盖原生发送 |
| Fallback | Result 内联状态 + 回到 composer | disabled/NOT_AVAILABLE、权限、UNKNOWN 的原因和下一步 | 文案、图标和结构共同表达 | 静默失败、纯 Toast、伪装成 DSH 原生能力 |
| Candidate Receipt | CLI/维护者控制面，不是业务 UI | digest、pin、profile diff、状态和下一条命令 | 终端可读表格/JSON | 渲染为老板导航、业务卡或第二套 profile UI |

首期实现只允许集中 token 和官方 slot/client；不复制 `frontend-vue3/src/theme.ts` 到 React，不散写全局 CSS，不用紫色渐变标题、科技大屏、装饰性发光或均匀圆角卡片。每个组件至少提供正常、失败、部分和窄屏状态，实际像素与浏览器/读屏验收仍由 T9/T14 完成。

**首期 token、对比度和字体边界（已批准 D5）**

| 用途 | 允许 token/组合 | 约束与验收 |
|---|---|---|
| 深色表面正文/状态说明 | `#FEFCFF`、`#D3C3E8` 或 `#F2FFDC` on `#09050D`（实测约 19.81:1、12.26:1、19.36:1） | 普通文字至少 4.5:1；正文不得直接用 Brand Purple |
| Brand Purple `#805D9D` | 边界、图标、非文字装饰或大字号加粗文字 | on Deep Plum 约 3.82:1，不能作为普通正文；不得与 Danger 作为相邻文字状态（约 2.16:1） |
| Danger `#FF7D91` | 风险文字/图标 on Deep Plum（约 8.27:1） | 禁止只用红色表达错误；同步文字、图标和结构 |
| Signal Lime `#F2FFDC` | 确认状态、焦点辅助和关键数字 | 不能做大面积背景；焦点环需在深/浅表面均可见 |
| Focus / reduced motion | 集中 `--sm-*` focus token；`prefers-reduced-motion` 关闭呼吸、阶段动画和 skeleton 位移 | 键盘 `:focus-visible` 可见；不把动画完成当作内容出现条件 |
| 字体 | 中文 `Alibaba PuHuiTi 3.0` → `PingFang SC` → `Microsoft YaHei`；英文/数字 `Outfit` → `SF Pro Display`；数据/代码 `SFMono-Regular` → `Menlo` | React 插件只能从集中 Ant Design token/字体资产映射；Vue 继续由 `frontend-vue3/src/theme.ts` 管理，禁止互相 import |

对比度数值由当前 `DESIGN.md` 色值按 WCAG 相对亮度公式复算；实现测试仍需覆盖实际 alpha、字号、焦点环和浏览器渲染，不把静态色值计算当作真实视觉通过。

**宿主主题映射与强制颜色合同（已批准 D10 补充）**

插件不自行判断系统主题，也不直接复制 Vue 或 React 的主题对象。宿主只提供语义 token：`surface.default`、`surface.raised`、`text.primary`、`text.secondary`、`text.muted`、`border.default`、`focus.ring`、`status.info`、`status.success`、`status.warning`、`status.danger`、`state.disabled` 和 `state.unknown`；插件组件只能消费这些 token 和官方 slot。

| 宿主模式 | 允许的映射 | 必须验证 | 禁止行为 |
|---|---|---|---|
| Dark | `surface.*` 使用 Deep Plum 系列，正文/焦点/状态文字使用已验证的高对比组合 | 实际 alpha、字号、焦点环与背景叠加后的 WCAG AA；状态同时有文本/图标 | 用 Brand Purple 作为普通正文或依靠紫色渐变表达状态 |
| Light | 由宿主提供相同语义 token 的浅色值；插件不把深色 hex 硬编码到内容层 | 正文、边界、链接、禁用、焦点环和错误在浅色表面逐项测量 | 把 dark token 直接反转，或只验证深色模式 |
| Forced colors / 高对比度 | 使用 `Canvas`、`CanvasText`、`ButtonFace`、`ButtonText`、`Highlight` 等系统语义色，保留边框和文本结构 | Windows 高对比度/forced-colors 下，状态仍可由文字、边框和结构识别；焦点可见 | 用背景图片、渐变、透明 alpha 或颜色本身承载唯一语义 |

主题切换不改变 DSH 原生标题、侧栏、会话和工具所有权；只更新插件卡片内部的语义 token。T9/T14 必须在 Dark、Light、forced-colors 三种模式下实测正文、disabled、`UNKNOWN`、权限拒绝、保存冲突和 `:focus-visible`，并记录实际浏览器/字号/alpha/对比度结果；缺任一模式证据则标记 `PARTIAL` 或 `NOT_RUN`，不能因默认深色通过而宣称主题完成。

**响应式与无障碍首期门禁（已批准 D6）**

| 视口 | 布局合同 | 不得丢失的信息/动作 |
|---|---|---|
| Desktop（`breakpoint.board` 及以上） | 保留 DSH 原生会话主列；query card 使用受控最大宽度，Result 与 Provenance 同层；保存动作在结果之后 | 阶段、来源、权限、synthetic、保存禁用原因和回到 composer |
| Tablet（`breakpoint.mobile`–`breakpoint.board`） | 单列顺序为 composer → progress/result → provenance → actions；长来源折叠但不删除 | UNKNOWN/权限/部分状态、核对和取消动作仍在首屏顺序中 |
| Mobile（低于 `breakpoint.mobile`，`compact` 时动作进一步纵向堆叠） | 所有卡片单列，操作按“修改/取消 → 核对 → 保存”排序；表格或长引用横向滚动且有可读标签 | synthetic 标记、数据范围、权限原因、保存禁用原因和原生回退入口始终可见 |

首期 WCAG 2.2 AA 验收必须覆盖：键盘从 composer → 状态卡 → provenance → 保存/恢复动作的闭环；异步阶段、`NOT_AVAILABLE`、错误和 `EXECUTION_UNKNOWN` 使用 `aria-live` 与可见文本；取消、保存、重试和核对按钮最小触控目标 44×44 CSS px；焦点可见且弹层/折叠关闭后回到触发点；200% 放大和窄屏重排不隐藏内容；错误/部分/禁用不能只靠颜色；链接保留访问前后区分；`prefers-reduced-motion` 关闭呼吸、skeleton 位移和状态转场。真实读屏器/触控设备仍需在 T14/T9 证据中单独标记 PASS、PARTIAL 或 NOT_RUN。

**精确视口与大字验收矩阵（已批准 D12 补充）**

| 视口/模式 | 必须完成的路径 | 具体布局约束 | 失败判定 |
|---|---|---|---|
| 320 CSS px | 提问 → 取消/核对 → 展开 provenance → 回到 composer | 单列；主动作纵向排列；来源允许横向滚动但不遮住标题、状态和回退入口 | 横向页面滚动、按钮互相遮挡、synthetic/权限/保存原因不可见 |
| 375 CSS px | 提问 → 结果 → freshness 判断 → 保存或重新查询 | 结果数字与单位同层；长标题换行；操作目标仍至少 44×44 CSS px | 数字被截断、动作落出首屏且无顺序、焦点跳到页面顶部 |
| 768 CSS px | 键盘完成完整 D15 路径；查看展开的来源 | composer、结果和 provenance 单列；来源折叠状态可保持；无第二套导航 | 键盘无法进入核对/保存、折叠后内容不可访问、原生会话被覆盖 |
| 1280 CSS px | 桌面完整查询、保存冲突与历史查看 | DSH 原生会话保持主列；结果/provenance 受控最大宽度，不扩成卡片墙 | 插件渲染原生侧栏/标题、信息层级依赖阴影或悬浮才可理解 |
| 200% 浏览器缩放/大字体 | 完成上述路径并读取所有状态 | 内容重排而非缩放遮挡；焦点环和 live region 可见；长文案不靠 tooltip | 文案被裁切、固定高度吞掉内容、焦点不可见或必须依赖鼠标 |
| 高对比度/forced-colors | 识别权限、UNKNOWN、禁用、成功和焦点 | 使用系统语义色，边框/文字/结构保留；图标不能是唯一状态 | 颜色被系统覆盖后状态无法区分、按钮边界消失或焦点不可见 |

T14/T9 必须在这些视口与模式记录实际浏览器、缩放、字体和结果截图/DOM 证据；只在 1280 深色模式下通过不能代表响应式完成。任何一项只完成到 `PARTIAL`，保存、核对和回退动作仍必须可达，不能为了窄屏隐藏 release/freshness 或权限原因。

**ARIA、live-region 与焦点恢复合同（已批准 D13 补充）**

- `first-purchase-query-card` 使用稳定的 `aria-labelledby` 标题和 `aria-describedby` 状态/原因文本；执行阶段 (`QUEUED`–`VALIDATING`) 设置 `aria-busy=true`，`READY_TO_SAVE` 和所有终态设置 `false`。结果数字不能只存在于 `aria-live`，必须同时有可读的可见文本。
- 阶段变化、权限拒绝、`NOT_AVAILABLE`、`EXECUTION_UNKNOWN`、保存未知/冲突和 freshness 过期使用独立的 live region。阶段/普通进度用 `aria-live=polite`，未知、权限和阻止保存用 `assertive`；同一 `action_id + stage + reason_code` 在短时间内只播报一次，轮询不得反复朗读。
- 取消请求后焦点落在 `CANCEL_PENDING` 状态或“核对取消”动作；确认 `NO_ACTIVE_RUN` 后焦点回到 composer 或“重新提问”。`EXECUTION_UNKNOWN`、`SAVE_UNKNOWN` 和冲突状态的焦点落在唯一核对/查看动作；`UNSUPPORTED`、`NEEDS_CLARIFICATION` 和权限拒绝焦点落在修改问题/权限说明动作。
- provenance 的展开按钮使用 `aria-expanded` 与 `aria-controls`，折叠不会移除 DOM 中的必要字段；关闭/返回后焦点回到触发按钮。保存成功后焦点落在版本标题或回执链接，失败/冲突焦点落在恢复动作。
- 所有 live 文案同时可见；不使用仅屏幕阅读器可见的秘密、action id 全量值或颜色描述。`aria-label` 必须描述动作和对象（如“核对分析结果”），不能用“按钮 1”或只读图标。

T14 必须用键盘和至少一个真实浏览器读屏/可访问性树检查上述属性，覆盖阶段切换、取消、UNKNOWN、保存冲突、折叠 provenance、200% 放大和回到 composer；自动化 fixture 需断言属性值、焦点元素和 live-region 去重 key。缺读屏或真实焦点证据时只能记为 `PARTIAL/NOT_RUN`，不能由静态 JSX 快照替代。

**Provenance 与 synthetic 合同（已批准 D7）**

`first-purchase-query-card` 的 provenance 区固定紧跟结果数字，窄屏只允许折叠次要来源详情，不得隐藏最小业务字段：`environment`（`synthetic`/`pre-prod`/`production`，首期只允许前两者）、`data_time_window`、`query_scope`、`permission_scope`、`source_refs`、`generated_at` 和 `freshness`。首期所有 synthetic 结果和保存预览必须显示可见的“合成数据/不可作为真实经营结论”标记；保存后的历史版本复制同一组 provenance，不能因进入保存库而变成真实结论。`candidate_digest` 必须与同一 `correlation_id` 绑定：结果卡只显示短摘要和“技术核对”入口，完整 digest 置于受控、可复制的技术详情中，维护者 candidate receipt 始终保留完整值；它不能成为老板/分析师的主 CTA 或第二导航。若来源或权限字段未提供，状态降为 `PARTIAL`/`NOT_AVAILABLE` 并禁止保存，不用空字符串或装饰性 tooltip 掩盖未提供。

`freshness` 必须由服务合同计算并返回状态、阈值和原因，而不是由前端按本地时钟猜测。最小字段为 `freshness_state`（`FRESH`、`STALE`、`EXPIRED`、`UNKNOWN`）、`freshness_checked_at`、`freshness_expires_at`、`save_eligible` 和 `save_ineligible_reason`；`save_eligible=true` 只能出现在完整 provenance、允许的 permission scope、`SUCCESS_UNSAVED`、`FRESH` 且同一 candidate/correlation/action 身份均可核对时。`PARTIAL`、`STALE`、`EXPIRED`、`UNKNOWN`、缺来源/权限或 freshness 未提供默认 `save_eligible=false`，服务端必须拒绝绕过 UI 的保存请求并返回稳定原因码。

刷新或重新查询产生新 action/correlation；它不能覆写原 receipt，也不能把旧结果自动提升为新鲜结果。保存冲突、freshness 变化和 session 过期都要进入明确状态并保留原草稿，T14 需覆盖时间推进、断线恢复、过期 session 和重放保存请求的负测。

**宿主重启恢复语义（已批准 D14 补充）**

当 T17 的进程级隔离证据表明插件故障、未卸载干净或 native loop 需要重启时，业务面必须进入 `HOST_RESTART_REQUIRED`，而不是把它压成普通 `FAILED`。该状态携带原 `action_id`、`correlation_id`、candidate/profile digest、最后已知阶段、草稿引用、receipt 引用和重启原因；旧 profile 的 active 指针保持不变；宿主崩溃时不得声称原生会话仍可用，必须待受控重启、健康探针和 reconcile 确认恢复。

重启前禁止再次提交同一 action、保存、导出、发送或显示“插件已恢复”。维护者控制面提供受控重启命令和 ownership 检查；业务面只提供“查看回执”“复制恢复说明”“重新打开会话/核对状态”。重启后若 reconcile 确认 action 未执行，进入 `CANCELLED_NO_ACTIVE_RUN` 或允许新问题；若仍无法确认，保持 `EXECUTION_UNKNOWN`；只有真实 receipt 到达才进入 `SUCCESS_UNSAVED`。草稿和 receipt 不能因重启丢失，也不能自动重放造成重复保存。

Eng rerun 合同落点：业务字段必须由服务域的 versioned capability/API envelope 负责生成，并同步到 `backend/contracts/`、OpenAPI generated d.ts、plugin decoder 和 saved-analysis record；`candidate_digest` 由 profile/release receipt 注入并以同一 correlation id 关联，不能只在 UI 里拼接，也不能把内部 FastAPI 路由当作公开合同。业务层只接收短摘要/受控技术详情的边界，完整发布 digest 仍由 T21 receipt 作为审计 SSOT。

**角色、能力与动作矩阵（已批准 D8）**

以下是 synthetic 验收身份，不把产品称呼直接当作生产 RBAC 角色；实际授权仍由服务合同返回的 permission scope 决定。当前可用 scope 以 `backend/analytics_first_purchase_native.py` 的 `analysis:read`、`analysis:save`、`dashboard:read`、`dashboard:update` 为准；`export`、真实 `send` 等未接通能力必须保持 `disabled/NOT_AVAILABLE`。

| Synthetic 身份/意图 | 必须具备的 scope | 查看/查询 | 预览/保存 | 导出/发送/回退 | 缺权时用户路径 |
|---|---|---|---|---|---|
| 只读老板/审阅者 | `analysis:read`、`dashboard:read` | 允许结果、provenance、历史版本 | 只读预览；保存禁用 | 未接通动作均 disabled；回退不在用户面 | 显示缺少 scope，回到原生对话或联系权限 owner |
| 分析师 | `analysis:read`、`analysis:save`、按需 `dashboard:read` | 允许受支持首购查询和结果核对 | `SUCCESS_UNSAVED` 可确认保存；非 success 禁止 | 导出/发送仍按 NOT_AVAILABLE，不自行放开 | 显示申请/联系路径，保留问题和原生 composer |
| 看板运营/编辑者 | `analysis:read`、`dashboard:read`、`dashboard:update` | 允许读取结果和 board 相关证据 | cockpit apply 是后续断言，不改变 D15 首期入口 | 真实发送仍禁用；profile rollback 归维护者 | 缺 `dashboard:update` 时只读并解释原因 |
| 插件维护者 | CLI/profile 控制面身份，不进入业务 UI | 不凭 CLI receipt 读取业务结果 | 通过 T21 candidate/receipt 管理包、profile 和回退 | 不在用户面执行发送/数据迁移 | 使用命令输出的 remedy，不把 BLOCKED 映射成业务成功 |

权限拒绝必须同时给出缺少的 scope、保持可见的当前结果/草稿边界、下一步（申请权限/联系 owner/回到原生对话）和禁止动作；禁止只隐藏按钮或返回通用 403。每种身份至少用 synthetic fixture 覆盖允许、拒绝、过期会话和跨 session 隔离。

**回退与恢复合同（已批准 D9）**

Profile 回退、插件能力禁用和已保存分析版本回退是三种不同动作，不能共用一个“重试/回退”按钮：

1. **Profile 回退**只由维护者控制面触发。预览阶段必须显示 `active_digest`、`candidate_digest`、profile pin、影响范围、是否需要 host restart、当前会话处理方式、数据/服务 schema 是否变化和旧版本保留期限；确认后生成独立 `rollback_action_id`，不允许隐式切换或清理旧包。
2. **运行中会话**不得静默丢失：若宿主能继续，继续使用旧 active；若 T17 证明必须重启，显示“需要重新打开会话”的原因和恢复入口，保留可恢复 receipt/草稿边界；禁止把 profile 回退说成业务结果已回退。
3. **插件能力禁用**回到原生 composer，旧结果卡标成只读/过期并保留 provenance；不能让用户继续提交依赖已禁用 capability 的保存动作。
4. **分析版本回退**只改变已保存分析的版本指针，展示目标版本、来源和权限；不修改 profile active pointer，不删除数据。
5. **失败或未知**必须显示 `RollbackUnavailable`/`ReceiptUnknown`、旧 digest、最后已知阶段、人工 runbook 链接、责任 owner 和下一次检查时间；允许查询/重试同一 action id，禁止重复创建未知回退。

回退 receipt 至少记录 `release_id`、`rollback_action_id`、`active_digest_before/after`、profile/DSH pin、actor、reason、stage、attempt、session_effect`、`PASS/PARTIAL/NOT_RUN/BLOCKED` 和脱敏时间戳。任何 cleanup 仍需单独 gate 和授权；这些字段属于维护者控制面，业务 UI 只显示与当前用户有关的会话/结果影响。

建议在实现前运行一次 `/plan-design-review`，确认视觉合同与 native-first 规则一致；实际页面上线后再运行 `/design-review`，因为本计划没有真实渲染验收证据。

### Decision ledger

| ID | Owner section | Decision / finding | Disposition | Verification owner | Status |
|---|---|---|---|---|---|
| CEO-EXT-001…008 | CEO | 兼容矩阵、kit、profile、capability、catalog 后置、sandbox、diff、canary | Accepted by user D2–D9 | profile/plugin owners | Applied |
| CEO-STRUCT-001…003 | CEO | 拆分顺序、domain contracts、架构文档 | Accepted by user D10–D12 | architecture owner | Applied |
| CEO-REVIEW-001…009 | CEO | 垂直切片、contract spike、metrics/RACI、API baseline、隔离、治理、供应链、pre-prod、双轨 | Accepted by user | release/architecture owner | Applied |
| Eng Review D14 | Scope Challenge | 保留全部已批准功能，先在 workspace 做垂直切片；stop/go 后拆 DSH host、多个插件仓库、profile、服务和 deploy | Accepted by user D14 | architecture owner | Applied |
| Eng Review D15 / R1 | Scope/Architecture | 首期冻结 Native first-purchase analysis 端到端路径 | Accepted by user D15 | CRM/plugin owner | Applied |
| Design D1 | Section 11 | 首期唯一用户表面为原生 DSH 会话 → first-purchase-query-card → provenance → success 后 saved-analysis-view；cockpit 与维护者 receipt 不进入首期主入口 | Accepted by user | CRM/plugin/design owner | Applied |
| ARCH-001…005 | Section 1 | DAG、隔离、API 前置、供应链、规模 | Existing accepted remedies | Phase 0 owner | Applied |
| ARCH-ENG-001…002 | Eng Section 1 | profile 驱动插件清单；statePath 单一且显式 | Required by D4/CEO-EXT-003 and rc2 state SSOT learning | release/profile owner | Applied |
| ERROR-001…010 | Section 2 | capability failures and typed rescue | Required by accepted contracts | implementation owners | Applied |
| SEC-001…008 | Section 3 | artifact/API/log/data threats | Required by accepted security scope | security/release owner | Applied |
| DATA-001…007 | Section 4 | idempotency, concurrency, empty/error interaction paths | Required by profile/API contracts | profile/plugin owners | Applied |
| QUALITY-001…004 | Section 5 | one verifier, dev-only kit, real command ownership | Required by Phase 0 | tooling owner | Applied |
| QUALITY-ENG-001 | Eng Section 5 | 记录并消除 workspace 反向源码/build-toolchain 依赖 | Accepted extraction order D10 | plugin-kit/domain owners | Applied |
| TEST-001…004 | Section 6 | caller assertions, chaos, load and LLM eval boundary | Required by verification scope | test owner | Applied |
| TEST-ENG-001…002 | Eng Section 6 | selected native path profile E2E；profile-supplied plugin list/statePath tests | Accepted D2/D7/D9/D15 | test/profile owners | Applied |
| PERF-001…003 | Section 7 | baseline, bounded queues, synthetic limits | Required by stop/go | release owner | Applied |
| PERF-ENG-001 | Eng Section 7 | serial preflight baseline before safe build parallelism | Accepted stop/go metrics | release owner | Applied |
| OBS-001…003 | Section 8 | event schema, UNKNOWN age, diff/reconcile | Required by evidence contract | observability owner | Applied |
| DEPLOY-001…004 | Section 9 | rollout matrix, flags, parity, cleanup auth | Required by dual-track scope | deploy owner | Applied |
| TRAJ-001…003 | Section 10 | plugin-only proof, triggers, deprecation | Required by stop/go | architecture owner | Applied |
| DESIGN-001 | Section 11 | DESIGN.md/native-first wording reconciliation | Documentation contract correction | design/architecture owner | Open verification |

### Outside voice dispositions (2026-10-01)

The completed outside review returned twelve findings. The dispositions below preserve the user's accepted long-term plugin-platform direction while correcting sequencing, feasibility claims, and first-slice exit criteria. They do not authorize implementation, publication, deployment or data access.

| # | Outside finding | Disposition and evidence | Plan change |
|---:|---|---|---|
| 1 | In-process plugin isolation may be impossible under the pinned DSH host | **Accepted as a feasibility gate.** No transaction, canary or rollback claim is valid until the 0.1.7 host load/unload/restart probe proves the boundary; if it fails, the path must fall back to disable/native and host restart rather than pretend cleanup is atomic. | T17; failure modes and T4/T6 verification narrowed to proven host behavior. |
| 2 | Governance scope may consume the whole vertical slice | **Accepted as a sequencing correction, not a product-scope cut.** The native first-purchase candidate is the first go/no-go object; kit, profile evidence and security checks are minimum thin gates, while catalog, full matrix and multi-repo work remain post-gate. | Phase 0 budget gate; T12 stop/go wording and T18. |
| 3 | Brand-first extraction and CRM-first user path appear contradictory | **Accepted and reconciled.** Workspace validation uses the selected native path; physical extraction order remains brand → board-components → CRM adapter only after stop/go. No pre-gate workbench rewrite is implied. | D14 wording and T1/T15 ordering clarified. |
| 4 | DAG is generated after extraction order is fixed | **Accepted.** The machine-readable DAG and reverse-import inventory are a prerequisite to any package movement; the proposed order is provisional until the evidence is recorded. | T1 is a hard dependency for T3/T15 and physical split. |
| 5 | Plugin-only update still restarts the profile and may interrupt sessions | **Accepted.** “Independent plugin release” means independent artifact/version ownership; it does not promise HMR. Restart, session continuity and WAL recovery become measured exit criteria. | T18 and T12 metrics. |
| 6 | First-slice DoD mixes future multi-repo/release/deploy with current authorization | **Accepted.** Remove physical multi-repo, GitHub release and Hangzhou deployment from the first-slice DoD; they remain later stop/go gates and separately authorized actions. | NOT in scope and T12 corrected. |
| 7 | Signature/SBOM/admission tools and trust root are unspecified | **Accepted.** T5 must name the selected tool, signer/trust-root owner, key storage boundary and CI capability before the gate is called real; unavailable tooling blocks the candidate. | T5 and T19. |
| 8 | CLI commands may be invented | **Rejected as stale for this checkout, retained as a documentation check.** `scripts/dsh.mjs` exposes the commands and the current release subset passes 52/52; T11 still has to link each command to its implementation and preserve NOT_RUN/blocked labels. | No command redesign; T11 evidence strengthened. |
| 9 | Hour-by-hour effort and P95 estimates are not credible | **Accepted.** Replace fixed-hour completion claims with measured baseline, bounded synthetic runs and explicit stop/go thresholds; the two-to-four-week window is observation time, not a promise of six-hour implementation. | T10/T12 and unresolved numeric targets. |
| 10 | The plan is too platform-heavy for a partial archive project | **Partially accepted.** The implementation critical path is reduced to one workspace capability and minimum gates, while the user's long-term multi-repo target remains documented as a post-gate architecture. | Phase order and scope expansion record clarified. |
| 11 | Adapter cleanup has no date or authority | **Accepted.** The adapter receives an owner, sunset date/condition, deprecation evidence and an explicit cleanup approval; a failed stop/go keeps it and records why. | T19 and T12 cleanup gate. |
| 12 | DSH 0.2.0-rc.2 should not block the 0.1.7 candidate | **Accepted as a sequencing correction.** Keep the user-approved 0.1.7/0.2.0 contract spike, but make the 0.2 result advisory for the 0.1.7 candidate; only a later 0.2 cutover gate can activate it. | T2 split into blocking 0.1.7 facts and non-blocking 0.2 comparison. |

Outside review conclusion: **the plan is retained with a narrower first-slice gate and stronger feasibility checks; production activation and unproven in-process isolation remain blocked until T17 provides evidence; inventory, contract inspection and the isolated T17 probe are prerequisite work, not blocked by their own unavailable result.**

**Approval readiness: PASS for the recorded decisions** — CEO-EXT-001…008 (D2–D9), CEO-STRUCT-001…003 (D10–D12), CEO-REVIEW-001…009, Eng Review D14, and Eng Review D15/R1 have explicit user answers; ARCH-ENG-001…002, QUALITY-ENG-001, TEST-ENG-001…002, and PERF-ENG-001 are applied within those accepted boundaries. **Implementation gate: OPEN** until T17 proves the pinned host process model and all P0/P1 evidence is produced. Open verification and separately authorized operations remain listed below and are not silently treated as approval.

## Developer Experience Review (2026-10-01 至 2026-10-02)

状态：**REVIEW PARTIAL / T21–T23 已实现首期薄切片**。8 个维度已审；T21 已提供本地 candidate，T22 已统一入口文档，T23 已提供 readiness 阻断摘要。2026-10-02 复核纠正了重复任务、计时和诊断描述；宿主、远端、签名和生产验收仍未完成。

### Current DX freeze / implementation gate

本计划保留 CEO 评审确认的长期 **SCOPE EXPANSION** 方向（DSH 底座、领域插件独立维护、未来多仓与审核平台），但本次开发者体验评审采用用户已选择的 **DX POLISH** 模式。两者不能共用一个完成定义：当前实现闸门只验证一个 workspace 内、固定 DSH `0.1.7-rc.2`、synthetic 数据和隔离 profile 的 `plugin candidate` 收据；不以物理拆仓、catalog、GitHub Release、杭州 receive/activate、DSH `0.2.0` 或真实数据作为本轮完成条件。长期架构任务仍保留为后续 stop/go，不得被“文档已写”“骨架已建”提前判定完成。

当前魔法时刻的唯一验收合同是：同一命令在本地生成一份可复核 candidate receipt，至少包含 packed artifact digest、来源 commit、DSH pin、profile diff、capability（含 `NOT_AVAILABLE` 原因）、隔离 canary/rollback 的 `PASS/PARTIAL/NOT_RUN/BLOCKED` 状态和下一条**本地** receive/verify 命令；远端或生产动作必须显式另行执行。T21 已实现首期薄切片，但 canary/rollback/远端仍保持 `NOT_RUN`/`NOT_AVAILABLE`。

### Developer Persona Card

| Field | Current target |
|---|---|
| Who | 个人全栈维护者和运营者；未来扩展到内部 CRM、知识库、问数等插件维护者 |
| Context | DSH 跟随官方固定版本；领域插件各自维护，通过 profile（固定的插件组合）安装和回退 |
| Tolerance | 已选本地 candidate 目标 12–25 分钟，远端验收另计；首次理解耗时尚未测量 |
| Expects | 独立测试、构建、版本和发布；能从失败回执定位插件；不用每次修改插件都升级 DSH、CRM 服务和知识库 |
| Secondary | 内部插件审核者，核对来源、digest、capability、兼容结果和权限，不要求独立于个人维护者的第二位审批人 |

### Developer Empathy Narrative

我打开 README，首屏仍写产品 0.19.0.0/r3，而 STATUS 记载产品 0.20.0.0/r1 已发布、杭州仍运行 r3。我需要先分清产品候选与现役状态，才能知道该用哪个入口。doctor 的四项 PASS 很清楚，但不等于完整发布检查；verify local 也只是 synthetic 合同结果。带 --check 的 preflight 会一次列出 Python、Git、upstream 和 runtime 缺项，我能逐项看到 remedy，但末尾只显示第一个阻断码。第一次用的人可能还需要翻 Quickstart 判断应准备现有 runtime，还是进入正式 preflight。

我更在意的是只更新自己的插件。目前包有 DSH peer、bundle patch、client inject 和 exports，插件格式已有官方接口基础；然而构建脚本、部分测试和 CRM 插件仍直接引用 workbench。命令列表也没有已选的 plugin candidate。我要的是插件包变了，只生成它的新版本，再用固定 DSH 和服务组成候选，看到 digest、兼容结果、原生回退与下一步命令。未验证的 canary、重启和 WAL 恢复应明确 NOT_RUN，不能因为打包成功就说生产可用。

这是经用户确认画像后写出的角色代入叙事，不是用户实测录屏或耗时证据。2026-10-02 修正：private:true 限制 npm publish，本身不阻止独立构建、私有 tarball 安装或独立仓库维护。

### Competitive DX Benchmark

用户已选的时钟：从干净工作树开始，包含阅读前置说明、准备固定工具链/依赖及首次运行，到理解并取得可复核 candidate。安装下载是否命中缓存必须记录；冷启动与缓存可用的结果分别报告。12–25 分钟是接受的目标/先前估计，**不是已测结果**；远端安装/UAT 另计。本轮 doctor 的 74 ms 是命令执行耗时，不能替代人的首次上手时间。

| Tool | Start → result | Time + evidence type | DX choice | Source |
|---|---|---|---|---|
| 本项目 | clean checkout → 理解工具链和插件入口 → candidate 回执 | 完整首次运行 NOT_RUN；目标 12–25 分钟；本轮只有只读 CLI 探针 | 复用 state/journal，区分本地与发布证据，插件作者不必复制整仓发布步骤 | README:36–64、Quickstart:5–31、scripts/dsh.mjs:17–25 |
| 官方 DSH | 插件包元数据 → bundle 安装/加载 | 官方资料未提供同边界人工计时 | 遵守官方包、注入和生命周期合同；本项目 CLI 只作薄适配 | [官方插件发布说明](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish) |
| DSH Plugin Hub | 查找插件 → 按项目说明安装 | 本轮没有实测其安装时长或安全隔离能力 | 参考插件发现/安装体验；不据此假定企业信任和回退已经具备 | [Plugin Hub](https://github.com/dshplugin/dsh-plugin-hub) |

上述路径终点不完全相同，只比较设计选择，不作快慢排名。按技能的通用 TTHW 标尺，超过 10 分钟是 **Red Flag**；本项目把较重的 candidate 证据作为终点，已选择 12–25 分钟，保留上手阻碍作为 DX 风险，不擅自改成 2 分钟目标，也不据此增加自动发布门禁。

### Magical Moment Specification

DX-D4 已接受：`pnpm dsh plugin candidate`（**已实现，首期 PARTIAL**）生成可追踪回执。回执包含插件包 digest、来源 commit、固定 DSH pin、profile digest/差异、capability 结果、canary/回退证据状态和下一步 receive/verify 指引；canary/回退/远端当前仍是 `NOT_RUN`/`NOT_AVAILABLE`。

- 每个对象分别标识：plugin digest 是单包，profile digest 是组合；不能拿一个 source tarball 的 hash 冒充全部依赖已验证。
- 插件包内容和包版本归插件 owner；DSH/runtime 和服务维持 pin。候选装配复用已有 verifier、journal 和显式 statePath；不能把全量 runtime 重编译隐藏在插件快捷命令后。
- 一份新插件包必须能在自己的包目录构建和验证；本地开发工具不能依赖兄弟仓库源码。复用既定 T13/T15，避免 CLI 只是给整仓流程改个名字。
- 回执逐层列 PASS/PARTIAL/NOT_RUN/BLOCKED；实际运行的隔离 synthetic 检查与未来远端证据分开。包构建成功不代表 canary、回退、现场或真实模型通过。
- 无隐式 GitHub 上传、生产重启、route 切换、旧版本删除或真实库读取；缺前置条件时输出原因，保留旧 profile。

理想路径草案（实现后才能作为可执行 Quickstart）：①从插件作者入口准备固定工具链与依赖，②运行该包的 `pnpm build`/`pnpm test`，③运行计划中的 `pnpm dsh plugin candidate` 查看回执。各步耗时须由 T10 首次测量，不编造分段预算；首次安装无法压到三步时如实记录前置操作。

### Developer Journey Map

| Stage | Developer does | Evidence and friction | Disposition |
|---|---|---|---|
| Discover | 读 README/STATUS/插件 README | 首屏指向 STATUS，插件作者有独立 candidate 教程；历史发布与现役仍分开 | T22 已实现；保留历史和发布/现役区别 |
| Install | doctor 和 readiness 只读检查 | 默认 doctor 四项；release readiness 输出所有检查、remedy、错误码和文档锚点 | T23 已实现；不自动联网/安装 |
| Hello World | 本地验证 → candidate | `scripts/dsh.mjs` 提供 plugin candidate；profile/pack/journal 已接通，远端与 canary 仍分开 | T21 已实现首期薄切片；local PASS 不充当发布通过 |
| Real Usage | 独立构建插件、在固定 DSH 中使用 | shine-*/build.mjs 引用 workbench toolchain；crm-knowledge 引用 workbench 源码 | T24 归并 T15，保留两个独立包的验收 |
| Debug | 读 code/remedy、status、resume、reconcile | 诊断已多项输出；why-blocked/retry 有静态提示，不能称为动态修复；状态路径问题已有 T13 | T13/T21 复用状态合同；T23 新提示已记录；实现待后续 |
| Upgrade | 换插件包或单独升级 DSH | restart/session/WAL 证据未完成，不能承诺热插拔或故障一定只影响插件 | T25 归并 T18/T19/T20；DSH 0.2.0 激活另设闸门 |

### First-Time Developer Confusion Report

以下时点用于角色代入，不是实测用户耗时；情绪与误解是待验证推断。

| Simulated time | Source observation → possible confusion | Disposition |
|---|---|---|
| T+0:00 | README 与 STATUS 产品版本不一致 → 不确定候选和现役 | T22 |
| T+0:30 | doctor 四项 PASS → 可能误解为完整 readiness | T22 解释范围；无需新增检查器 |
| T+1:00 | local verify 与 release gate 范围不同 → 需了解缺哪些证据 | 沿用已有 scope 说明，T21 回执延续 |
| T+2:00 | preflight 四项 FAIL 都有 code/remedy → 末尾单码可能让人忽略前面其他项 | T23 可选提示已记录；不是漏检 |
| T+5:00 | CLI 没有 plugin candidate，包有跨目录引用 → 独立维护者仍需理解整仓 | T21/T15 |
| Candidate endpoint | 完整流程耗时和冷/热缓存差异未知 | T10/T12 记录实际测量，不能填“已在 12–25 分钟完成” |

### 本轮可复核证据

基线 public `main @ fcbd1324`；只读探针执行于 2026-10-02。原始输出保存在本地评审附件 `dx-plan-20261002-020315/`，不纳入发布包。

| Command | Actual result | Scope |
|---|---|---|
| `node scripts/dsh.mjs --help` | exit 0，命令表无 plugin | 当前 CLI 入口核对 |
| `node scripts/dsh.mjs doctor` | exit 0，Node 24.19.0 / VERSION 0.20.0.0 / rc2 pin / schemas PASS | 默认四项，不代表发布 readiness |
| `node scripts/dsh.mjs preflight --check --python /usr/bin/python3 --tag dsh-dx-20261002-check` | exit 2，PYTHON314_REQUIRED、RELEASE_BLOCKED_DIRTY_WORKTREE、PREFLIGHT_UPSTREAM_SHA_MISMATCH、RELEASE_UPSTREAM_RUNTIME_REQUIRED | 主动选用系统 Python 3.9.6 核对错误路径；不表示本机没有其他 Python；两处文档改动解释 dirty；未准备上游或 runtime |
| 正式 build/preflight、插件 package 发布、DSH runtime/session/WAL、远端验收 | NOT_RUN | 只读计划评审，不凭旧运行结果计为本次通过 |

### DX Decision ledger

| Source/evidence | Current value | Proposed value / disposition | Exact approval + scope | Fixed / pending |
|---|---|---|---|---|
| DX-D1 / 用户路径说明 | 个人维护，全栈运维 | 当前个人；未来内部多插件维护者 | 用户说明“一个仓 CRM、一个仓知识库、N 个仓插件” | 多仓长期目标固定 |
| DX-D2 / 同理叙事 | 维护者需要拼接多个入口 | 以该角色评估各触点 | 用户 A：准确 | 叙事不是运行证据 |
| DX-D3 / benchmark | 全流程时间未测 | 12–25 分钟本地目标 | 用户“按照推荐走”，对应 C | 远端另计，不能改写起点/终点 |
| DX-D4 / useful result | plugin 子命令不可用（评审时） | 单命令 candidate 回执 | 用户“按照你推荐”，对应 A | T21 已实现首期薄切片 |
| DX-D5 / review depth | 评审深度待定 | DX POLISH | 用户 B | 不添加托管平台 |
| T21 / CLI evidence | 缺独立 candidate 入口（评审时） | 加入 follow-up | 用户明确 A：加入 TODOS.md | 已实现，canary/远端仍未运行 |
| T22 / docs evidence | 首屏与插件作者路径分散（评审时） | 加入 follow-up | 用户“选择你推荐的选项” | 已实现并补作者 Quickstart |
| T23 / readiness.mjs | 全部阻断项和 remedy 已打印，末尾仅首码（评审时） | 摘要/帮助链接 | D8-A 已批准并记录为 DX8/T23 | 已实现，逐项 `ref=` 与汇总摘要 |
| T24 / T15 原任务 | 已要求两个独立可构建包 | 归并 T15，避免重复排期 | 既有 Eng T15，保留验收范围 | 不新增任务或审批 |
| T25 / T18/T19/T20 原任务 | 已要求 restart/WAL、回退、adapter 退役及 DSH 分轨 | 文档与证据归原 owner；仍跑原定十次 synthetic | 既有 T18/T19/T20 | 不额外重复十次，不新增 HMR 承诺 |
| T26 / CEO-REVIEW-006/007、T7/T10 | owner/source/pin/digest/兼容证据与计时已在计划 | 复用字段与已有证据记录 | 既有治理/度量合同 | 独立审核模板、自动漏斗、周期流程未获批准，不纳入施工 |

### DX Passes and Scorecard

#### Pass 1 — Getting Started: 5/10 → 7/10（计划评分）

已具有 doctor、local/release scope、只读 preflight check 和 synthetic 路径；插件 candidate 命令已接通首期包边界。首次运行不需要购买云平台，但真实模型/生产凭据仍属于另外的环境。10/10 应是无需理解整仓，在同一终端完成文档规定的准备、验证与可追踪候选；完整 TTHW 未测，超过 10 分钟的通用 DX 风险保留；12–25 分钟目标不因评分调整。

#### Pass 2 — API/CLI/SDK: 5/10 → 7/10（计划评分）

现有命令命名可识别，verify scope 有明确语义，但官方 `dsh plugin add` 与本项目 `pnpm dsh` 不应混为同一个 CLI。T21 是业务包装入口而非 DSH 上游功能；T13 统一 profile 和 statePath，T15 消除跨包源码引用。10/10 是看到一个例子即可正确选包、查失败并重复执行；不靠新增控制面或整仓重建达成。退出码 2 当前兼有参数/检查/门禁含义，保留原有合同并以稳定 code 区分，不擅改退出码。

#### Pass 3 — Errors & Debugging: 7/10 → 8/10

当前已有 code、实际值和 remedy；现在还会输出阻断数量、去重 code 和文档 `ref=` 锚点。10/10 仍需要真实首次运行和端到端远端错误回放，既不建议清理用户修改也不自动安装/联网。

| Error path | 当前实际输出要点 | 已有恢复与未关闭项 |
|---|---|---|
| Python | `PYTHON314_REQUIRED remedy=set DSH_PYTHON to an absolute Python 3.14+ executable` | 说明绝对路径与版本；Quickstart 已有 `--python`；输出对应 toolchain 锚点 |
| Dirty worktree | `RELEASE_BLOCKED_DIRTY_WORKTREE remedy=build from a clean reviewed commit` | 保留所有文档改动；后续从经审查提交/CI 生成包，不建议 reset/stash |
| Runtime unavailable | `RELEASE_UPSTREAM_RUNTIME_REQUIRED remedy=set DSH_UPSTREAM_RUNTIME_BUNDLE ...` | Quickstart 锚点区分首个正式 preflight 与已有 runtime 的只读检查 |

开发态输出会含工具链路径，不能宣称现有 readiness 已保证所有路径脱敏；公共回执按 T7 的脱敏合同另验。why-blocked 是静态提示，retry 只提示需要 state/idempotency，rollback 在本 CLI 只指向 runbook；它们不是已经实现的一键恢复。

#### Pass 4 — Documentation: 5/10 → 7/10（计划评分）

README、Quickstart、reference、verification 及各插件 README 已存在；问题是当前事实与独立插件作者路径不统一，而不是“没有插件文档”。T22 统一入口、解释候选/现役差别；T11 对每条命令做实现映射。迁移文档归 T18/T20。10/10 是读者两分钟内找到对应版本和故障步骤，示例能照做；不为该分数增加在线 playground 或文档站搜索服务。

#### Pass 5 — Upgrade: 4/10 → 6/10（计划评分）

固定 peer/DSH SHA、0.1.7 blocking 与 0.2.0 advisory 已是正确边界；源码、slot、state/WAL 和重启行为仍需 T2/T17/T18 证明。T25 的指南归 T18/T19/T20，不重复做一套验证。10/10 是旧/新 profile、业务服务和状态兼容有证据且能回退；在证据前，插件故障可能影响同进程 DSH，不能承诺“插件崩了只需重装插件”。不无条件添加 codemod，是否需要由真实 breaking change 决定。

#### Pass 6 — Developer Environment: 6/10 → 7/10（计划评分）

工具链固定、readiness 只读、CI exact-SHA 及 synthetic 入口已有；跨包 build 依赖仍妨碍独立仓库。T15 用真实的包边界构建和 consumer tests 证明，类型发布位置、打包内容与外部声明也要随包核对，不能只看源码 TS 能编译。10/10 是包内固定安装/build/test 与 CI 一致、错误不会引导去改兄弟仓库。Windows/WSL2 冷验证、代理网络和 native runtime 均未在本轮实测；不承诺 hot reload。

#### Pass 7 — Community/Ecosystem: 4/10 → 5/10（计划评分）

各包 README 已存在，内部单维护者并不需要为了评分新建社区、客服或收费体系。private:true 不代表仓库私有，也不阻止打包测试；只说明 npm publish 当前被禁用。10/10 对本项目是插件作者能找到 owner、合同、例子和审核结果。T1/T5/T7/T19 保留既有来源与审核合同；新独立审核 checklist 没有获批，不塞进 T26。公开 npm、完整 catalog、监控社区渠道均不在本轮。

#### Pass 8 — Measurement: 6/10 → 7/10（计划评分）

preflight.mjs:47 与 preflight-bundle.mjs:42 已有自动执行阶段计时，**不含阅读、安装前置或人的排错时间**。T10/T12 按原先选定边界记录 fresh-start 起止、冷/热缓存及失败原因；可先用本地证据账本，不建立自动遥测、用户漏斗或定时复审。10/10 是同一边界下能比较候选 lead time 和回退时间；/devex-review 后续测量不能拿 warm 命令计时替代。周期/频率/数据收集若以后增加，须另作决定。

| Dimension | Initial | Amended plan | Evidence still needed |
|---|---:|---:|---|
| Getting Started | 5 | 7 | T21 可运行及首次上手 |
| API/CLI/SDK | 5 | 7 | T13/T15/T21 合同与独立包 |
| Error Messages | 7 | 8 | T23 摘要与文档锚点已实现；远端错误回放仍待 |
| Documentation | 5 | 8 | T22 示例已落档；首次上手耗时仍未测 |
| Upgrade Path | 4 | 6 | T17/T18/T20 真实固定宿主证据 |
| Dev Environment | 6 | 7 | 包级 build/test/types 与 CI |
| Community | 4 | 5 | 来源/owner/兼容证据 |
| Measurement | 6 | 7 | 完整 fresh-start 测量 |
| **Overall DX** | **5.3/10** | **6.8/10（本地首期）** | 算术平均四舍五入；不是已交付质量 |

低于 6 的生态维度是独立插件维护的 DX 债务。TTHW 当前 **NOT_MEASURED**、目标 **12–25 分钟**、通用标尺 **Red Flag**。没有同一计划的先前 DX 完成记录；早先 rc2 TRIAGE 是另一个计划，不能拿它作本轮评分趋势。

| Principle | Coverage |
|---|---|
| Zero friction | 部分：独立 candidate 和作者入口已实现，首次运行仍未测 |
| Learn by doing | 部分：已有 synthetic 验证，T22 已给独立包示例 |
| Fight uncertainty | 部分：已有多项 code/remedy、摘要和文档锚点；远端回放仍待 |
| Opinionated + escape hatches | 已设计：固定 pin、native fallback、scope 与回退；需证据 |
| Code in context | 待 T15：脱离 workbench 仍能构建和消费 |
| Magical moment | 已选 D4，T21 已实现首期 candidate receipt；canary/远端仍未运行 |

### DX Implementation Checklist

- [ ] 按完整起点计时，证明 candidate 目标 12–25 分钟；远端另计。
- [x] T21 命令及包级调用真实存在，输出插件/profile/runtime 各自身份；canary/远端仍标记未运行。
- [ ] 同一 verifier/journal/statePath；local PASS 不绕过 release gate。
- [x] T22 示例、当前版本、历史段落和文档引用一致；现场 UAT 仍单独标记。
- [ ] T15 两个插件包独立 build/test/types，无 workbench 源码反向引用。
- [ ] T18/T19/T20 提供重启、会话/WAL、状态回退、弃用和分轨升级指南。
- [ ] T5/T7/T19 记录来源、pin、digest、审核/撤销及证据 scope。
- [ ] T10/T12 记录实际 fresh-start 与自动阶段耗时的区别。
- [x] T23 已实现阻断摘要和 `ref=` 锚点；继续保留现有全部 code/remedy 和门禁。

安装无前置、无重启升级、自动 codemod、新文档搜索、收费/社区渠道等通用 checklist 项目不自动成为本项目功能要求。

### DX Review Outside Scope / What Already Exists

不扩展托管 dashboard、云 playground、自动上传、生产切换、自动 telemetry 或新审批角色。完整 catalog、物理多仓、GitHub Release、杭州 receive/activate、DSH `0.2.0` 激活和 HMR 仍按已批准 stop/go 顺序保留为长期目标；它们不属于当前 DX candidate 的 DoD。真实模型、Chrome、杭州、真实库均不能从本轮文档结论推定。

复用现有 DSH bundle/client/peer/exports、各包 README、doctor/readiness/local verify、immutable artifact verifier、state/reconcile 与 fixture。新增命令必须适配这些 owner，不能重新写整套发布状态机。candidate 的 digest 必须来自经过 `files/exports` 白名单和 peer/invariant 校验的 packed artifact，不得对脏源码树或 workspace `file:` 引用直接取 hash；临时 profile、DSH home、WAL、B0 SQLite 和临时服务路径必须由本次命令拥有，退出时只清理自己的状态。

### DX Outside Voice / coverage

2026-10-02 已通过正确的 `gstack-claude-code` provider 完成一次独立 DX POLISH 评审（边界：只接收计划正文，未读取仓库源码、`TODOS.md` 或 `STATUS.md`；因此它将截断后的 T21–T26 和命令实现视为未知，不能替代本地证据）。外部结论为 **Revise and freeze**，不是 clean：

| 外部 finding group | 处置 |
|---|---|
| DX POLISH 与长期 SCOPE EXPANSION、catalog/杭州 DoD 混杂 | 已在本节上方冻结当前 candidate DoD；长期目标保留但不阻塞本轮 |
| 魔法时刻和 12–25 分钟没有成为唯一命令/收据合同 | 已补入 Current DX freeze；T21 仍是未实现 follow-up，T10/T12 仍需实测 |
| candidate 可能 hash 脏树、workspace 引用，或污染真实 DSH home/WAL/服务 | 已补入 T21 设计约束：packed artifact、隔离根目录、命令所有权、synthetic-only；实现前由 T17/T15 证据阻塞 |
| DSH `0.1.7-rc.2` 与 `0.2.0-rc.2`、远端 receive、catalog 可能拖入默认路径 | 当前 DX 仅阻塞 0.1.7；0.2.0 advisory，远端/catalog 后置 |
| T24–T26 与既有 T15/T18/T19/T20/治理重复 | 保持现有归并，不新增任务 |
| 单一失败收据、独立包路径、native fallback 的可见性不足 | 保留既有 code/remedy；T21 receipt 必须列出 `PASS/PARTIAL/NOT_RUN/BLOCKED` 与 `NOT_AVAILABLE` 原因 |

外部审查未发现可以把当前计划标成“完成”的证据；T17 的固定宿主进程模型、T15 的独立包边界、T21/T22 的实际实现和 T10/T12 的完整计时仍是实施闸门。T23 已回答并进入 DX8/T23；当前只保存评审检查点，不写完成日志，也不宣称已经解除 Eng 或 release 阻断。


## Design Review Rerun（2026-10-02）

审查对象：`docs/plans/shinemage-plugin-platform-split.md`，公共 `main@fcbd1324`。本轮只审计划中的 UI/native-first 合同，不改业务代码、不启动服务、不访问真实 DuckDB、不做发布或杭州切换。设计生成器不可用（`DESIGN_NOT_AVAILABLE`），因此使用 `DESIGN.md`、当前前端路径和文字 state board 完成计划级审查；没有生成或批准视觉 mockup，也不把本轮结果当作真实浏览器视觉通过。

### Outside voices 与覆盖

- Claude Code 独立设计审查：完成，结论 `REVISE`，评分 4/10，指出首期表面、八态、native chrome、synthetic provenance、角色权限、响应式/无障碍和回退合同缺口。
- Codex in-host 独立设计审查：完成，结论 `BLOCK`，评分 4.5/10，确认同一组缺口；没有访问仓库或修改文件。
- 两路一致：T14 不能只按通用 Section 11 开工；必须先落实 D15 Interaction Contract、状态矩阵、native-first 所有权、provenance、a11y 和回退合同。

### 评分与完成度

| 维度 | 初评 | 修订后 | 证据/剩余条件 |
|---|---:|---:|---|
| 信息架构 | 6 | 9 | D1 冻结原生 composer → query card → success-only saved view |
| 交互状态 | 5 | 9 | D2 十态矩阵；T14 仍需真实组件/fixture 证据 |
| 用户旅程 | 5 | 9 | D3 分离 D15 与 T21 storyboard，异常有动作 |
| 具体性/反模板 | 5 | 8 | D4 state board；无视觉 mockup，需实现后 `/design-review` |
| Design token 对齐 | 6 | 8.5 | D5 token/对比度/字体边界；T9 仍需同步 DESIGN.md |
| 响应式与无障碍 | 4 | 8 | D6 三档布局和 WCAG 2.2 AA；真机/读屏仍 NOT_RUN |
| 回退/恢复可理解性 | 5 | 8 | D9 profile、能力禁用、分析版本回退分离 |

整体设计计划评分 **6/10 → 8.2/10**。这是计划合同分数，不是已实现质量分数；T9、T14、T17、T21、T22 的实现和真实设备证据仍未完成。

### 已批准的设计决定

- **D1**：首期唯一用户表面为 DSH 原生会话、`first-purchase-query-card`、同卡 provenance 和成功后的 `saved-analysis-view`；cockpit 与 candidate receipt 不进入首期主入口。
- **D2**：为 `PREPARING/RUNNING`、`EMPTY`、权限拒绝、`UNSUPPORTED`、`NEEDS_CLARIFICATION`、`NOT_AVAILABLE`、失败、`EXECUTION_UNKNOWN`、`CANCEL_PENDING`、`CANCELLED_NO_ACTIVE_RUN`、`SUCCESS_UNSAVED`、`SAVED`、`PARTIAL` 写明可见文案、动作、禁止动作、焦点和 live region；`WORKER_ACTIVE` 不能显示已停止。
- **D3**：D15 终端 storyboard 与 T21 维护者 storyboard 分开；权限、取消、UNKNOWN、保存和回退不再共用“重试”；保存必须区分准备中、失败、未知和冲突，并以同一 action/correlation/idempotency 进行核对。
- **D4**：首期使用低保真组件 state board，冻结 Prompt、Progress、Result、Provenance、Save、Fallback、Candidate Receipt 的 slot、文案、token 和禁止样式。
- **D5**：集中 token、字体、focus/reduced-motion 和 WCAG 对比度组合；React 不直接 import Vue theme，Brand Purple 不做普通正文。
- **D6**：使用 `breakpoint.mobile/table/board` 定义三档布局；首期执行 WCAG 2.2 AA、键盘闭环、live region、44px 触控、200% 放大和 reduced-motion。
- **D7**：provenance 固定包含 environment、data time window、query scope、permission scope、source refs、candidate digest、generated_at、freshness；synthetic 标记在窄屏和保存版本不可隐藏。
- **D8**：以现有 `analysis:read/save`、`dashboard:read/update` 为 synthetic 身份合同；导出/真实发送未接通时始终 `NOT_AVAILABLE`，拒绝必须给 scope 和下一步。
- **D9**：profile 回退、插件能力禁用和分析版本回退分开；回退显示旧/新 digest、会话影响、owner、runbook 和 typed receipt，不自动清理。

### Litmus 与硬约束

首期表面分类为 **OPERATE + EXPERIENCE**：DSH 原生会话承载体验，结果卡和保存动作承载任务。已写入计划的硬约束是：首屏不做通用 SaaS 卡片墙；不覆盖 DSH 原生标题/侧栏/会话/工具；不使用无阶段全屏 skeleton、纯 Toast UNKNOWN、颜色唯一状态、非 success 保存、未标注 synthetic 数字、模态打断 composer 或第二套 profile 导航。状态和来源必须能靠标题/文本扫描理解，且不依赖装饰阴影或动画完成语义。

### 未决设计事项

- `DESIGN-001` 的修复方向已获批准：T9 必须把 `DESIGN.md` 的全量品牌覆盖文字改成与 native-first 矩阵一致的唯一合同，逐区列出 DSH-owned、plugin-owned、允许 slot 和禁止覆盖；当前审查已批准方案，文件同步仍是 T9 的实现门禁，不能提前宣称完成。
- T17 宿主进程模型可能决定失败后是否必须 host restart；计划按最保守的 disable/native + restart 分支设计，不能在证据前承诺进程内原子隔离。
- T9/T14 的真实浏览器、键盘、读屏、触控和 200% 放大证据仍是 `NOT_RUN`；这不是本轮计划通过的替代品。

### Design Review Required Outputs

**NOT in scope（设计）**：完整视觉稿/像素验收、真实生产角色映射、真实杭州设备读屏/触控、profile journal 在业务 UI 中的可视化、未接通 export/send 的产品化；这些分别由 `/design-review`、T8/T14/T17/T19 和后续 capability 合同处理。

**What already exists（设计）**：`DESIGN.md` 的品牌色、字体、尺寸和 reduced-motion 令牌；Vue `frontend-vue3/src/theme.ts` 的令牌事实源；analytics-workbench 的 first-purchase/saved-analysis 模型与状态测试；现有 native fallback、disabled/NOT_AVAILABLE 和 provenance 字段。计划新增内容只冻结首期组合方式，不复制第二套运行时。

**Implementation task mapping（不新增重复任务）**：D1–D9 的可执行工作归入既有 T9（native-first、state board、token、响应式/a11y）、T14（D15 状态/角色/provenance/焦点 fixture）、T21（维护者 candidate receipt/storyboard）和 T22（唯一 Quickstart）。本轮没有创建新的任务 ID，避免与 follow-up/Eng/DX 控制面重复。

**JSONL task artifact**：本轮无新任务 ID；已生成空任务记录 `/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/tasks-design-review-20261002.jsonl`，已有 T9/T14/T21/T22 继续由原任务记录追踪。

## NOT in scope

- 真实杭州切换、Windows/WSL 重启、Cloudflare route、真实 DuckDB 迁移、旧 runtime 删除、GitHub push/tag/Release：均需单独现场信息和授权。
- DSH 上游源码修改或 fork：只允许固定官方 tag/SHA。
- 物理多仓、完整私有 catalog、全部领域插件拆分：首期 stop/go 通过后才决定；不是当前实现自动发生的结果。
- 真实业务 UAT：需要单独授权；pre-prod 使用不含业务数据的生产形状 fixture。
- 当前计划不宣称真实 Chrome、真实 DeepSeek、杭州端口或生产数据已验收。

## What already exists

- 当前仓库已有 DSH bundle/package/invariant、analytics-workbench、CRM/knowledge backend、release/readiness、receive/verify/reconcile、side-by-side/rollback 和 synthetic verification 入口；首期应复用并统一状态源，不另起第二套实现。
- 官方 DSH 0.1.7-rc.2 pin、上游 SHA、插件 peer/devDependency 和 0.2.0-rc.2 官方候选资料已盘查；`ctx.shell.run/start`、bundle/profile 重启及 WAL 的精确变化仍需对应源码/运行证据；静态 SUPPORTED 不代表生命周期通过。
- 现有 HTML 编辑链、绑定页面保护、native fallback、disabled/NOT_AVAILABLE 文案和后端/前端测试是首期用户路径的基础；本计划只要求独立 candidate/合同/回退证据，不宣称现场 UAT。

## Dream state delta

距离 12 个月目标还差：边界 manifest 和真实 owner/RACI 落地、DSH 双 pin contract spike、API adapter、activation isolation、签名/SBOM pipeline、pre-prod shape evidence、双轨迁移和第一条用户可见切片。完成这些后，插件可以独立版本化；物理多仓和 catalog 仍必须用 stop/go 证据决定。

## Error & Rescue Registry

| Capability | Failure mechanisms | User impact | Known safeguard | Unknown owner / required proof |
|---|---|---|---|---|
| contract compatibility | peer/API/lifecycle mismatch | candidate blocked or plugin disabled | exact pins, matrix, spike | plugin owner: prove both pin rows |
| API adapter | timeout/429/schema invalid/permission | retry or no analysis | bounded retry, typed error, native fallback | service owner: contract fixture |
| artifact admission | path/digest/signature/SBOM failure | no activation | fail-closed verifier | release owner: malicious archive and trust-root tests |
| activation | partial registration/hang/crash | old profile must remain active | transaction/isolation/CAS | runtime owner: kill/timeout drills |
| receive/reconcile | network break/unknown receipt | delayed promotion | action id/journal/reconcile | deploy owner: interrupted receive |
| canary | health/native/WAL failure | candidate not active | side-by-side canary/rollback | profile owner: failure evidence |
| migration | incompatible durable state | promotion blocked | expand/contract/forward-fix | service owner: backup/restore matrix |
| UI capability | disabled/NOT_AVAILABLE/fallback mismatch | user cannot use feature | native-first state contract | design owner: state/accessibility review |

## Failure Modes Registry

> 这是目标验收矩阵。下表 Y 表示必须有的处理/测试，不表示本次已运行；实际 PASS/PARTIAL/NOT_RUN 见页首账本和证据页。

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES? | LOGGED? |
|---|---|---:|---:|---|---:|
| contract spike | unsupported DSH pin | Y | Y | blocked with pin/reason | Y |
| manifest verifier | empty/path/digest/schema mismatch | Y | Y | candidate rejected | Y |
| signature/SBOM | unsigned/revoked/vulnerable | Y | Y | admission rejected | Y |
| API adapter | timeout/429/schema/permission | Y | Y | retry or explicit error | Y |
| activation | partial/hung/crashed | Y | Y | old profile/native loop | Y |
| receive | network/duplicate/UNKNOWN | Y | Y | UNKNOWN + reconcile | Y |
| canary | native/API/WAL failure | Y | Y | no cutover | Y |
| migration | lock/partial/incompatible | Y | Y | blocked/forward-fix | Y |
| rollback | unavailable old profile | unknown | Y | rollback blocked, no deletion | Y |
| cleanup | gate not met | Y | Y | cleanup postponed | Y |

## Implementation Tasks

Synthesized from this review's findings. Run with Claude Code or Codex; checkbox as you ship.

- [x] **T1 (P1, human: ~4h / CC: ~30min)** — Phase 0 inventory — generate the unique dependency DAG, package ownership, command owner map, and machine-readable boundary manifest.
  - Surfaced by: Section 1 ARCH-001 and Section 5 QUALITY-001.
  - Files: `docs/architecture/shinemage-plugin-platform.md`, `docs/architecture/shinemage-plugin-boundaries.md`, `docs/architecture/shinemage-plugin-boundaries.json`, `config/shinemage-plugin-boundaries.v1.json`, `scripts/dsh-b0/plugin-boundaries.mjs`.
  - Verify: inventory covers every `dsh-plugins` package, direct/reverse imports, literal service/gateway paths and real package/control commands; dynamic dispatch, auth and lifecycle require separate runtime evidence. `git diff --check`; no real DuckDB/path/secret included.
  - Status 2026-10-03: **IMPLEMENTED / STATIC PASS**. All 10 packages, 579 sources, 29 cross-package imports, 190 literal route occurrences, 10 owned contracts and 8 control entries are inventoried. Eight parser/policy tests and the B0 pipeline pass. Five temporary CRM source edges have explicit retirement conditions; T1 completion does not close T15/T17. Evidence: `docs/hackathon/evidence/dsh-g0-board-components-20261003.md`.

- [ ] **T2 (P1, human: ~6h / CC: ~35min)** — DSH contract spike — compare exact 0.1.7-rc.2 and 0.2.0-rc.2 capability, slot, client lifecycle, restart/unload, shell/tool timeout and synthetic session/WAL behavior.
  - [x] 2026-10-07 新输入 WSL 实测：固定官方 rc1 SHA/tree/lock、隔离 pnpm 11.7.0/nobody，官方 host/native 构建成功；三语料 12 场景/30 冷进程通过，98040 个构建输入不变，133 个结果文件取回。新可追踪构建的 WSL 子项关闭；未签名观察不等于历史签名或生产准入，完整事件组合/0.2.0 仍按原范围开放。见[现场补证](../hackathon/evidence/dsh-g0-kit-install-wsl-rebuild-20261007.md)。
  - [x] 2026-10-07 新 rc1 本机来源补证：从官方固定 `46a7f68b…` 全新源码树冻结安装，执行官方 host/native 构建；text/tool/rich 共 12 场景、30 冷进程通过，99839 条输入前后不变。四个 JS 入口与旧 WSL 记录一致，但旧 WSL 完整闭包、签名来源和新构建的 WSL 验证仍开放；不关闭整个 T2。见[重建与 kit 证据](../hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)。
  - Surfaced by: CEO-REVIEW-002 and Section 1 ARCH-002.
  - Files: `.context/dsh-b0/upstream/` evidence reference, `docs/architecture/dsh-compatibility-matrix.md`, synthetic fixture files (to be determined).
  - Verify: source SHA pinned; static grep/typecheck and isolated fixture rows produce explicit SUPPORTED/DEFERRED/BLOCKED results.
  - Status 2026-10-02: **PARTIAL**. Exact 0.1.7/0.2.0 tags are now shallow-checked out under ignored `.context/dsh-b0/` and the bounded source-family scan is `SUPPORTED`; runtime lifecycle, shell/tool timeout and WAL semantics remain `NOT_RUN/DEFERRED`. Evidence: `docs/architecture/dsh-compatibility-matrix.md`, `docs/hackathon/evidence/dsh-g0-compatibility-scan-20261002.md`, `scripts/dsh-b0/compatibility-matrix.test.mjs`.
  - Status 2026-10-07: **PARTIAL**. Current immutable first-purchase candidate now has actual WSL in-flight Host crash/prefix/no-duplicate observations and four compiled rc1/rc2 text-session/torn-frame cases. The interrupted business run remains UNKNOWN with its slot held; nativeJournal must seed restored history through the official persistence API before terminal recovery can pass. rc1 compiled-build attestation, richer cross-version corpus and 0.2.0 runtime remain open. Evidence: [target recovery](../hackathon/evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md).
  - Follow-up 2026-10-07: **LOCAL FIX PASS / CANDIDATE PARTIAL**. Official async history hydration and lifecycle/race handling now produce FAILED/EXECUTION_UNKNOWN with the slot released in the local official Host drill. Node 66, backend 50 and Host 1 PASS. A new plugin artifact and target replay are still required; the old immutable candidate keeps its UNKNOWN observation. Evidence: [local repair](../hackathon/evidence/dsh-g0-native-journal-recovery-fix-20261007.md).
  - Target follow-up 2026-10-07: **TERMINAL RECOVERY OBSERVED / G0 PARTIAL**. New plugin candidate `a490457c…` reuses the unchanged CRM/service/runtime artifacts. Actual WSL source v2 10/10 and official Host terminal recovery 1 PASS: FAILED/EXECUTION_UNKNOWN, slot released, no duplicate dispatch. Service provenance is independently bound; v1 keeps historical shared-SHA checks. Service target journal seq 4 is recorded; terminal Host journal adapter and other G0 gates remain open. Evidence: [new candidate on WSL](../hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md).
  - Journal follow-up 2026-10-07: **TERMINAL RECEIPT GATE IMPLEMENTED / G0 PARTIAL**. Explicit terminal envelope verifies the archived current-candidate observations and appends seq 5 linked to source-HTTP seq 4. Full release suite 391 PASS (37 new gate cases), real CLI replay idempotent, wrong parent rejected, 619 protected files unchanged. No new WSL execution or production activation; browser/current-candidate, cross-version corpus and remaining G0 gates stay open. Evidence: [terminal receipt gate](../hackathon/evidence/dsh-g0-first-purchase-terminal-gate-20261007.md).
  - Browser follow-up 2026-10-07: **CURRENT CANDIDATE BROWSER OBSERVED / G0 PARTIAL**. After terminal gate commit `db16041a`, the unchanged `a490457c…` packages passed actual WSL Chrome headless five scenarios / Host 1 PASS (78.00s). 184 result files verified, 620 local protected files and journal seq 5 unchanged; owned directory reclaimed and production unchanged. The new browser receipt still needs an explicit journal adapter; no inherited old-candidate event. Evidence: [current candidate browser](../hackathon/evidence/dsh-g0-first-purchase-current-browser-20261007.md).
  - Browser journal follow-up 2026-10-07: **CURRENT BROWSER RECEIPT GATE IMPLEMENTED / G0 PARTIAL**. Explicit browser v2 uses the terminal Host parent and independent plugin/service sources, retaining v1. Archived evidence accepted at seq 6, five prior events preserved, retry unchanged and wrong parent rejected. Release suite 429 PASS including 38 v2 cases; 1318 protected files unchanged. No remote rerun or production activation. Evidence: [browser v2 gate](../hackathon/evidence/dsh-g0-current-browser-gate-20261007.md).

  - Tool corpus follow-up 2026-10-07: **LOCAL RC2 TOOL PERSISTENCE PASS / CROSS-VERSION NOT_RUN**. Explicit tool corpus uses the compiled official persistence and restored message surface, 13→26 events after a torn final frame; success/error/meta retained. Related suite 11 PASS after correcting the corruption fixture. No tool execution, target rerun, journal update or build attestation. Evidence: [tool corpus](../hackathon/evidence/dsh-g0-session-tool-corpus-20261007.md).

  - Tool target follow-up 2026-10-07: **WSL TOOL PERSISTENCE MATRIX 4/4 PASS / G0 PARTIAL**. Committed controller `aebf4e38`, immutable rc2 runtime and recorded rc1 compiled modules passed ten fresh processes: torn-tail repair, rc1→rc2 append, rc2→rc1 read, preserved-old-state rollback. 48 evidence files retrieved, owned directory reclaimed, production unchanged, journal remains seq 6. Complete corpus/build provenance and business gates remain open. Evidence: [tool WSL matrix](../hackathon/evidence/dsh-g0-session-tool-wsl-20261007.md).

  - Attachment/delegation metadata follow-up 2026-10-07: **DECLARED RICH CORPUS WSL 4/4 PASS / G0 PARTIAL**. Explicit v3 preserves image/file references, relay/notice attribution, parent/header/depth and the one-time child descriptor. Local 18 PASS includes five corruption cases rejecting both read and append without writes; actual WSL ten cold processes pass with the immutable rc2 runtime. 49 files retrieved, owned directory reclaimed, production unchanged; controller is an uncommitted reviewed worktree increment. Attachment storage/rendering, live delegation, other event compositions and build provenance remain unproven. Evidence: [rich corpus](../hackathon/evidence/dsh-g0-session-rich-corpus-20261007.md).

- [ ] **T3 (P1, human: ~8h / CC: ~45min)** — CRM/API baseline — freeze the first vertical slice contract, compatibility adapter, generated types, version window and profile×service×state rollback matrix.
  - Surfaced by: CEO-REVIEW-004 and Section 4 DATA-001.
  - Files: `backend/contracts/` and adapter location to be determined; `docs/architecture/shinemage-plugin-boundaries.md`.
  - Verify: contract diff/consumer tests, synthetic API loopback, expand/contract migration and isolated backup/restore；公开 capability/API 合同有 SemVer owner，generated OpenAPI/types 明确 generator + input SHA 并进入 manifest；`environment/data_time_window/query_scope/permission_scope/source_refs/candidate_digest/generated_at/freshness` 的 provenance envelope 在后端、生成类型、前端 decoder 和保存记录中同名同义；first-purchase freshness/save eligibility 使用独立版本 envelope，cockpit v1 的 `PINNED` 保持快照语义并由显式 adapter 兼容；ratio/rate 的 B0 0–1 口径有正反例。

- [ ] **T4 (P1, human: ~8h / CC: ~45min)** — Activation isolation — implement transaction/CAS/cleanup and kill/timeout/crash fixtures for partial registration and global side effects.
  - Surfaced by: CEO-REVIEW-005 and Section 2/4.
  - Files: profile journal/activation owner to be determined; `scripts/dsh-b0/` fixture entry.
  - Verify: interrupted activation leaves old profile active; repeated action id is idempotent; UNKNOWN reconciles without false success.

- [ ] **T5 (P1, human: ~6h / CC: ~30min)** — Artifact trust gate — add source allowlist, signature/attestation binding, SBOM, vulnerability threshold, key rotation/revocation and redacted receipt.
  - Surfaced by: CEO-REVIEW-007, Section 3, Section 8.
  - Files: release/admission owner to be determined; `docs/operating/` runbook.
  - Verify: tampered, unsigned, revoked, vulnerable and path-traversal fixtures reject; valid candidate produces auditable evidence.
  - [x] 2026-10-07：现有 release 验签绑定 certificate source SHA，应用/runtime 安装和 publish 同步；完整 release suite 434 PASS，真实 GitHub runtime 正确 SHA 通过、错 SHA/错包拒绝。T5/T19 整体仍 PARTIAL，插件签名接线、SBOM/CVE/撤销未代签。见[来源绑定证据](../hackathon/evidence/dsh-g0-attestation-binding-20261007.md)。

- [ ] **T6 (P1, human: ~6h / CC: ~30min)** — Side-by-side canary and migration runbook — add gray/feature-flag defaults, active pointer, rollback thresholds, deprecation date and cleanup gate.
  - Surfaced by: CEO-REVIEW-008/009 and Section 9 DEPLOY-001/002.
  - Files: profile/release owner to be determined; `docs/operating/` runbook.
  - Verify: old/new profiles coexist; rollback preview shows old/new digest, session effect and owner; failed or unknown rollback preserves old active and emits a typed receipt; cleanup is rejected before gate and plugin-only update does not rebuild DSH/service/data.

- [ ] **T7 (P1, human: ~4h / CC: ~20min)** — Evidence and observability contract — standardize release/action fields, redaction, UNKNOWN age, diff/explain and reconcile dry-run.
  - Surfaced by: Section 8 OBS-001/002/003.
  - Files: `docs/architecture/` evidence contract and implementation owner to be determined.
  - Verify: one release reconstructs from `release_id`/`action_id`; receipt additionally binds `correlation_id`, `candidate_digest`, profile/service/schema digests, durable-state key and idempotency key; secret scan passes; stale UNKNOWN raises an alert；D15 heartbeat、timeout、reconcile interval、maximum age、retry/backoff cap 和 alert threshold 由同一 versioned config/receipt 记录，单位和 owner 明确，不能由前端本地猜测。

- [ ] **T8 (P2, human: ~4h / CC: ~20min)** — Production-shaped pre-prod fixtures — build business-data-free request/permission/latency/capacity fixtures and fault injection.
  - Surfaced by: CEO-REVIEW-008 and Section 6 TEST-003/Section 7.
  - Files: synthetic fixture directory to be determined; `docs/operating/` evidence guide.
  - Verify: permission denial, network interruption, p95/5xx/resource envelopes and recovery are recorded separately from real UAT.

- [ ] **T9 (P1, human: ~3h / CC: ~15min)** — Native-first UI contract reconciliation — align DESIGN.md wording, the ownership matrix, low-fidelity state board, capability states, keyboard/accessibility and disabled/NOT_AVAILABLE paths before T14 UI implementation.
  - Surfaced by: Section 11 DESIGN-001.
  - Files: `DESIGN.md`, `docs/architecture/shinemage-plugin-platform.md`.
  - Verify: plan-design-review; the ownership matrix, state board, token/contrast table and three-viewport contract are reflected in DESIGN.md or explicit override notes; `mobile/table/board` breakpoints have one canonical cross-framework mapping with the current React/Vue values and an owner; D15 path cannot enable `brandOverride` or custom native chrome; state matrix covers loading/empty/error/success/partial; keyboard/live-region/focus/44px/reduced-motion checks and actual rendered text/focus combinations meet WCAG AA; no plugin masks native title/sidebar/session/tool contracts or renders candidate receipt in business UI.

- [ ] **T10 (P2, human: ~3h / CC: ~15min)** — Performance and ownership baseline — measure lead time, rollback, API p95/5xx, plugin/native errors, queue/disk limits and RACI.
  - Surfaced by: CEO-REVIEW-003 and Section 7 PERF-001/002.
  - Files: `docs/operating/` SLI/RACI/runbook files to be determined.
  - Verify: baseline and target table exists; 10x synthetic candidate run stays bounded; stop/go record names primary/backup owners.

- [ ] **T11 (P2, human: ~2h / CC: ~10min)** — Command and documentation truth — map each `pnpm dsh`/profile command to a real implementation, mark planned vs passed, and link STATUS/TODOS/design docs.
  - Surfaced by: Section 5 QUALITY-001 and Section 6 TEST-001.
  - Files: `STATUS.md`, `docs/hackathon/TODOS.md`, `docs/operating/verification.md`, command owner files to be determined.
  - Verify: every documented command exists or is marked planned; no historical test counts are reused.

- [ ] **T12 (P2, human: ~4h / CC: ~20min)** — Stop/go evidence review — run the first user-visible CRM/analysis flow, compare metrics, record unresolved risks and decide workspace-only vs physical split/catalog/DSH 0.2.
  - Surfaced by: CEO-REVIEW-001/003 and Section 10 TRAJ-001/002.
  - Files: `docs/operating/` stop/go record to be determined.
  - Verify: one immutable artifact is replayed through the selected native first-purchase path, canary/rollback evidence is attached, and the decision is explicitly GO or HOLD.

- [ ] **T13 (P1, human: ~4h / CC: ~25min)** — Profile-driven release inputs and one journal path — move the ordered plugin bundle list out of `RELEASE_PLUGINS` code constants and make profile manifest plus an explicit `RELEASE_STATE_PATH` the only release inputs.
  - Surfaced by: Architecture Eng findings ARCH-ENG-001 and ARCH-ENG-002 (`scripts/release/readiness.mjs:7-15`, `scripts/release/preflight.mjs:22`, `scripts/dsh.mjs:193-203`).
  - Files: `scripts/release/readiness.mjs`, `scripts/release/preflight.mjs`, `scripts/dsh.mjs`, `scripts/release/host-control.mjs`, profile manifest schema and `docs/operating/` command reference.
  - Verify: a profile-only plugin-list change is consumed without changing host code; unavailable or divergent state path fails closed; `release`, `receive`, `reconcile`, `status`, `resume` and `rollback` reconstruct the same journal; isolated tests use temporary paths only.
  - Status 2026-10-02: **PARTIAL**. The ordered plugin list now lives in `config/dsh-profile.rc2.json`; `scripts/release/profile.mjs` validates profile schema, exact DSH 0.1.7 pin, package identity/peer, build entrypoints, duplicate/path constraints and emits a profile digest. Readiness and preflight consume the profile instead of the removed `RELEASE_PLUGINS` constant. `release`, `receive`, `reconcile`, `status` and `resume` now require an explicit absolute state path and release/receive append journal evidence; the preflight state sidecar and full replay across every field command remain open. Evidence: `scripts/release/profile.mjs`, `scripts/release/profile.test.mjs`, `scripts/release/readiness.mjs`, `scripts/release/preflight.mjs`, `scripts/dsh.mjs`.

- [ ] **T14 (P1, human: ~8h / CC: ~45min)** — Native first-purchase candidate journey — add one profile-level integration fixture covering native DSH session, first-purchase prompt, bound worker, permission/source reference, success, cancel, `EXECUTION_UNKNOWN`, save boundary and native fallback.
  - Surfaced by: Test Eng findings TEST-ENG-001/002 and approved D15 path (`backend/analytics_first_purchase_native.py:202-251`).
  - Files: `backend/tests/` first-purchase integration fixture, `scripts/dsh-b0/` profile candidate fixtures, release/profile verification tests.
  - Verify: the selected path uses one immutable candidate digest; the only user entry is native DSH composer → first-purchase-query-card → success-only saved-analysis-view; every D15 state row has visible copy, allowed/forbidden actions and focus/live-region behavior owned by an explicit host hook or plugin fallback; provenance fields and the synthetic marker remain visible in narrow and saved views and are present in generated/server/saved contracts; freshness/save eligibility uses the versioned envelope and old v1 receipts are rejected or adapted explicitly; stage transitions include elapsed/last-updated and timeout→UNKNOWN; each synthetic identity in the role/action matrix passes allowed and denied paths; ratio fields preserve the B0 0–1 contract; non-success cannot save; cancel distinguishes WORKER_ACTIVE from NO_ACTIVE_RUN; SAVE_UNKNOWN/SAVE_CONFLICT/HOST_RESTART_REQUIRED preserve draft/receipt and reconcile without false success; cross-layer `correlation_id`/idempotency prevents duplicate saves after replay; native DSH remains usable when the plugin is disabled; permission/source evidence is redacted and replayable; 320/375/768/1280, 200% and forced-colors checks cover the complete keyboard/live-region/focus path.

- [ ] **T15 (P1, human: ~6h / CC: ~30min)** — Boundary extraction inventory and independent package build — record first-party callers for current shared imports and extract only the dev-only kit/public contracts needed for two independently buildable plugin packages.
  - [x] 2026-10-07 SDK 内容审计入口/来源分类：前批已提交 `78175422`；复用归档 verifier 和现有 secret patterns，只读核对 115224 文件/8987 链接，真实结果 **BLOCKED：55 个疑似命中、553 个覆盖缺口**。17 项归档负测/25 subtests 与 18 项审计/边界测试通过，见[审计证据](../hackathon/evidence/dsh-g0-kit-content-audit-20261007.md)。来源分类不等于安全豁免，供应链与生产仍 PARTIAL。
  - [x] 2026-10-07 同平台 SDK 缩减：固定来源归档提取约 227.7 MB，较原逻辑大小减少 89.63%；新摘要校验与完整 Git 路径并存，现有测试共享 kit 验证。禁外网/旧 SDK/仓库现成依赖后 10/10 消费者构建与选定测试通过，完整路径也 10/10，35 项防护/边界通过。审计实际 0 命中/17 覆盖缺口，仍 PARTIAL，见[证据](../hackathon/evidence/dsh-g0-kit-sdk-closure-20261007.md)。本批随审修提交收录。
  - [x] 2026-10-07 提交前 OCR：完整核对原 32 文件及新增审修记录；修复清单外链接中转，新增先红后绿负测和合法链/循环回归。修复后 38 项防护、17 项归档/25 subtests、缩减与完整 SDK 各 10/10 消费者通过，见[证据](../hackathon/evidence/dsh-g0-kit-sdk-review-20261007.md)。仅本地提交范围通过，17 项不透明内容及分发/供应链/跨平台仍开放。
  - [x] 2026-10-07 缩减格式同平台传输：共用归档器、显式双摘要、原清单字节不变；实际安装 kit 打包 63.75 MB，在新目录接收后 10/10 消费者构建与选定测试通过。27 项归档/41 subtests、38 项防护，真实 CLI 6 项拒绝；17 项不透明内容完成来源盘点，仍 0 命中/17 缺口 PARTIAL。见[本轮证据](../hackathon/evidence/dsh-g0-kit-sdk-compact-transport-20261007.md)。随本次供应链审修本地提交收录，不作为生产包。
  - [x] 2026-10-07 SDK 清单与供应链实查：新增默认离线 inventory/CycloneDX 和显式 OSV；50 项相关防护通过，222 个安装依赖版本实际命中 10 个版本/42 条不同公告，保持 BLOCKED。17 项不透明内容补来源字节核对，5 包密码学验签通过但 1 包密钥已过期；见[证据与修复候选](../hackathon/evidence/dsh-g0-kit-sdk-supply-chain-20261007.md)。未改固定上游/pin/SDK，随本次审修本地提交收录。
  - [x] 2026-10-07 pnpm 11.28.2 插件侧候选：新旧 10/10 消费者分别 16 PASS，原图表包/锁不变；25 项防护、111 包冻结安装及新依赖严格类型检查通过。修复构建器重复版本硬编码，默认 pin、官方源码和 SDK 保持，详见[候选证据](../hackathon/evidence/dsh-g0-kit-pnpm-candidate-20261007.md)。后续审核修复候选缺输入时的误通过，各 17 PASS / 0 SKIP，随本次本地提交收录；不关闭新 SDK/目标平台/供应链。
  - [x] 2026-10-07 v2 SDK 缩减分发：前批 manager 拆分提交 `fd3ed8b6`，本轮缩减包只保留插件固定 manager；64.97 MB 包实际接收后 10/10 消费者、17 PASS，相关防护 56 PASS、真实拒绝 4/4。新包查询 7 个版本/29 条公告仍 BLOCKED，0 模式命中/17 覆盖缺口；来源重核与失败恢复详见[证据](../hackathon/evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。本次增量经限定范围审查后随本次本地提交收录。
  - [ ] 下一子项：受控处理新包中固定上游 7 个受影响版本及兼容性、旧密钥信任，完成 17 项不透明内容审查、完整 SBOM/发布者身份/签名/撤销，以及新 v2 SDK 的目标平台/WSL/干净机器验证；完整环境的官方旧 manager 仍独立审查。T15 整体与物理分仓仍开放，全量 SDK 审计不附加为每次业务插件开发的重流程。
  - [x] 2026-10-07 SDK 本地归档/接收：kit 内显式内容寻址归档、封闭链接图、pin/平台与摘要限额；真实 812 MB 归档恢复后 10/10 消费者离线构建/测试，相关 38 PASS、16 项负测和 25 subtests PASS。生产 receiver 不变，源/接收输入与旧候选保持。只关闭 Mac 本地往返，签名/完整秘密扫描与最小闭包、WSL/新机器仍开放；见[归档证据](../hackathon/evidence/dsh-g0-kit-sdk-archive-20261007.md)。
  - [x] 2026-10-07 审修与同平台 SDK 迁移：前批正常 hooks 提交 `90d5012d`；迁移固定 SDK/工具/Corepack，sandbox 阻断原目录和外网后 10/10 消费者构建/测试通过（15 PASS / 0 SKIP），两份各 124231 条内容/链接/权限记录保持。只证明 kit 支持路径在 Mac 同平台可迁移，不关闭归档信任、跨平台或全新机器/WSL。见[迁移证据](../hackathon/evidence/dsh-g0-kit-relocation-20261007.md)。
  - [x] 2026-10-07 kit 首次 SDK 准备：已安装 kit 在新 HOME/Corepack/store 中下载固定官方源码/冻结依赖、执行官方 SDK build，26 入口 READY；10/10 消费者使用这些新输入完成构建/测试，123781 个输入记录保持。16 项保护、15 项安装/消费者套件和 67 项边界/发布回归通过。只关闭本机新依赖目录准备，预编译闭包分发、整台干净机器/新入口 WSL、签名/registry 及物理分仓仍开放。见[准备证据](../hackathon/evidence/dsh-g0-kit-bootstrap-20261007.md)。
  - [x] 2026-10-07 全部 10 个构建消费者：kit 公开包导出/精确开发依赖迁移完成，真实离线安装无相邻源码构建/测试 10/10；B0/preflight/calibration/reload 接线，图表跨包测试归仓库层。相关 88 PASS、kit 追加验证 15 PASS、入口 73 PASS，领域包摘要不变。下一步 SDK/工具闭包分发与整台干净机器验证；尚未发布或物理分仓。见[消费端证据](../hackathon/evidence/dsh-g0-kit-all-consumers-20261007.md)。
  - [x] 2026-10-07 首个公开 kit 消费者：shine-brand 使用精确 devDependency/public export，实际 pnpm 新 store 安装本地 tarball 后，无相邻 kit 源码构建/测试；B0/preflight 显式 workspace 适配，禁止 runtime kit、未打包导出和外部安装覆盖。34 项相关回归、53 项 release CLI/核心通过；其余消费者、SDK/工具闭包分发和签名仍开放。见[独立安装证据](../hackathon/evidence/dsh-g0-kit-install-wsl-rebuild-20261007.md)。
  - [x] 2026-10-07 dev kit 本地包合同：files/exports、只读 `check.mjs`、26 个 SDK main/types 边界校验、真实 tarball 安全解包消费及叶子构建通过；相关 21 项测试通过。kit 仍 private，独立安装接线、SDK/工具闭包分发和新机器验证未完成。见[重建与 kit 证据](../hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)。
  - Surfaced by: Code Quality Eng finding QUALITY-ENG-001 (`shine-funnel`, `shine-query`, `shine-board` toolchain imports; `crm-knowledge` workbench imports).
  - Files: `dsh-plugins/*/build.mjs`, package manifests/exports, boundary manifest and architecture document; no DSH upstream files.
  - Verify: two plugin packages build from clean package boundaries without importing workbench source or runtime state; each package produces a controlled pack/tarball whose files/exports and peer/invariant checks fail closed; `workspace:*` and file links are resolved or rejected before packing; the digest is over that pack output plus pinned generated-contract inputs, not a workspace or file: link; the extraction order remains shine-brand → board-components → CRM adapter → query/cockpit/workbench.
  - Status 2026-10-02: **PARTIAL**. A controlled plugin-only pack boundary now validates package identity, exact DSH peer pin, package manager, allowlisted build output, symlink/special-file and workspace/file/link dependency rejection, clean source commit, tarball entry allowlist and SHA-256 receipt. Synthetic fixture: 4/4 pass; the boundary regression suite is 8/8. After fixed upstream dependencies were prepared in ignored `.context/dsh-b0`, the real workbench host/client typecheck, build and pack passed; the real `shine-brand` build and 7/7 lifecycle tests pass, and its pack passed before the shared build entry refactor. The new workspace dev-only `plugin-kit` removes leaf build imports from workbench toolchain source, with a boundary regression test; funnel/waterfall now copy their source helper into `lib/` and publish only `lib/` exports. A clean reviewed commit must rerun both real tarballs. The build-tools `brace-expansion` finding was fixed at 2.1.7 and online production audit is now 0 vulnerabilities, with a supply-chain regression test. Signature/SBOM/source trust and the full two-package boundary remain open. Evidence: `scripts/release/plugin-pack.mjs`, `scripts/release/plugin-pack.test.mjs`, `scripts/release/plugin-boundary.test.mjs`, `scripts/release/supply-chain.test.mjs`, `docs/hackathon/evidence/dsh-g0-plugin-pack-20261002.md`.

  - [x] Workspace board-components extraction: public JS/types, digest-pinned input, legacy subpath consumers, workbench source-only rebuild and controlled pack.
  - Status 2026-10-03: **PARTIAL**. Kit owns pin/lock/patches. Brand/query isolated build/test/pack remain covered; board-components now publishes an exact tarball with JS/types and no DSH runtime dependency. Workbench and legacy graph adapters consume public exports with digest locks; the six workbench source edges are retired. Workbench clean rebuild and controlled pack use only its own source, kit and the locked tarball; six compiled outputs match. Fixture commits are not reviewed release identities. Five CRM source edges, invariant/native lifecycle and supply-chain gates remain open. Evidence: `docs/hackathon/evidence/dsh-g0-board-components-20261003.md`.

  - [x] 2026-10-04 workspace CRM/知识插件拆包：两个独立候选、生成合同、profile v3、可撤销身份 lease、真实包组合配置和 SDK 卸载/迟到结果回归。详见[本轮证据](../hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。物理分仓与完整宿主门禁仍开放；上方历史状态不代表当前源码耦合仍存在。

- [ ] **T16 (P2, human: ~3h / CC: ~15min)** — Preflight build baseline and bounded parallelism gate — measure serial plugin build time first, then document whether independent package builds can run in parallel without changing ordered admission or activation.
  - Surfaced by: Performance Eng finding PERF-ENG-001 and `scripts/release/preflight.mjs:121-126`.
  - Files: `scripts/release/preflight.mjs`, `docs/operating/` SLI/runbook and synthetic load fixtures.
  - Verify: 10x synthetic candidate runs produce duration/P95/resource evidence; serial baseline is retained; any parallel mode is opt-in, bounded, reproducible and never reorders manifest verification, signing, receipt or activation.

- [ ] **T17 (P0, human: ~4h / CC: ~30min)** — DSH 0.1.7 process-model feasibility gate — prove the actual host load, unload, restart, timeout and crash behavior before claiming in-process activation isolation or atomic rollback.
  - Surfaced by: Outside finding 1 and CEO-REVIEW-005; the pinned DSH host must remain unchanged.
  - Files: `.context/dsh-b0/upstream/` evidence reference, `docs/architecture/dsh-compatibility-matrix.md`, isolated synthetic host fixtures under `scripts/dsh-b0/`.
  - Verify: the fixture records whether a plugin can be unloaded, whether a hung/crashed plugin can be contained, how the native loop behaves after failure, and whether restart/WAL recovery is required. The harness owns a temporary DSH home/profile/WAL, service process or TestClient, PID/port registry and cleanup boundary; it never uses the operator home. After crash/restart, journal/profile manifest is the source of truth and native profile digest is reconciled against it. If containment is unsupported, mark activation isolation `BLOCKED`, require disable/native fallback plus host restart, and remove any stronger promise from T4/T6 before implementation.
  - Status 2026-10-02: **PARTIAL / BLOCKED**. Synthetic process-boundary rows pass for load, native loop, timeout/crash containment, restart, explicit native fallback, WAL checkpoint replay and profile digest reconciliation. In-process unload is deliberately `BLOCKED` and returns `HOST_RESTART_REQUIRED`; exact pinned DSH host runtime behavior remains `NOT_RUN` even though the exact source checkout is now available. Evidence: `scripts/dsh-b0/host-feasibility.mjs`, `scripts/dsh-b0/host-feasibility.test.mjs`, `docs/architecture/dsh-compatibility-matrix.md`, `docs/hackathon/evidence/dsh-g0-host-feasibility-20261002.md`.

- [ ] **T18 (P1, human: ~4h / CC: ~25min)** — First-slice budget and restart/session SLI — separate minimum gates needed for the selected native first-purchase path from post-gate platform capabilities, and measure plugin-only update restart, session continuity and WAL recovery.
  - Surfaced by: Outside findings 2, 5, 6, 9, 10 and the approved D14/D15 scope.
  - Files: `docs/operating/` stop/go and SLI records, profile test fixtures, `docs/architecture/shinemage-plugin-platform.md`.
  - Verify: one candidate has an explicit must-pass list; catalog, physical multi-repo, GitHub release and Hangzhou deployment are outside the first DoD; ten synthetic plugin-only update runs record interruption, recovery and bounded downtime without reading real business data.

- [ ] **T19 (P1, human: ~4h / CC: ~20min)** — Trust-root and adapter retirement contract — name the artifact signing/attestation tool and owner, key storage boundary, revocation path, and adapter sunset/cleanup authority before calling the supply-chain or migration gate complete.
  - Surfaced by: Outside findings 7 and 11, CEO-REVIEW-007/009.
  - Files: `docs/operating/` trust and migration runbooks, boundary manifest, release evidence schema.
  - Verify: a synthetic candidate proves signer/source/digest/SBOM/revocation evidence or remains BLOCKED; the adapter has a dated condition/owner, and cleanup is rejected until the stop/go record and rollback evidence authorize it.

- [ ] **T20 (P1, human: ~3h / CC: ~20min)** — Split the DSH compatibility spike into blocking and advisory rows — keep 0.1.7-rc.2 load/lifecycle facts as the first-slice gate and record 0.2.0-rc.2 differences for the later upgrade track.
  - Surfaced by: Outside finding 12 and approved CEO-REVIEW-002.
  - Files: `docs/architecture/dsh-compatibility-matrix.md`, `docs/operating/` upgrade runbook and stop/go record.
  - Verify: a 0.2 difference cannot silently activate in the 0.1.7 profile; the later cutover has its own candidate, migration, session/WAL and rollback evidence requirement.

- [ ] **T21 (P1, human: ~6h / CC: ~35min)** — Plugin candidate golden path — add pnpm dsh plugin candidate as a thin adapter over the existing profile/release state, producing one immutable candidate digest, DSH pin, manifest, capability result, profile diff, canary/rollback evidence and next receive/verify command.
  - Surfaced by: DX Pass 1/2 and accepted DX-D4; current scripts/dsh.mjs:17-25 has no plugin command.
  - Files: scripts/dsh.mjs, scripts/release/, profile manifest schema, docs/operating/ plugin author guide. Depends on T13 explicit profile/state input, T15 packed independent package boundaries and T17 host process-model evidence.
  - Verify: plugin candidate accepts an explicit plugin/package or profile-manifest input and does not silently use the seven-entry host constant; it reuses the same journal/state path as release and fails closed when RELEASE_STATE_PATH is absent or ambiguous; its digest is calculated from the controlled pack output (not a dirty source tree or workspace file: link); the packed identity is stable (`@shine-mage/dsh-analytics-workbench-b0` plus DSH plugin/tool id), and generated schema inputs/generator versions are pinned and included in the digest manifest; it runs only with DSH 0.1.7-rc.2 and synthetic fixtures inside command-owned temporary profile/DSH-home/WAL/B0 paths with explicit PID ownership; no implicit upload/restart/route/data access occurs; local failure leaves the old profile active and returns a typed code. 0.2.0-rc.2, remote receive and catalog are advisory/post-gate only. Acceptance tests exercise one selected plugin, a rejected unallowlisted plugin, unavailable state path, pack digest mismatch, generated-contract drift, interrupted canary, crash/restart reconcile and replayed save idempotency.
  - Status 2026-10-02: **PARTIAL**. `pnpm dsh plugin candidate` now requires explicit plugin/output/state inputs, consumes the profile allowlist, reuses the durable journal, and produces a pack/profile/capability candidate receipt. Synthetic candidate, reject, CLI and profile tests pass. Profile diff with a previous profile, host canary/rollback, remote receive and full T13 shared journal integration remain `NOT_RUN`/`NOT_AVAILABLE`; evidence: `scripts/release/plugin-candidate.mjs`, `scripts/release/plugin-candidate.test.mjs`, `docs/hackathon/evidence/dsh-g0-plugin-candidate-20261002.md`.

- [ ] **T22 (P1, human: ~3h / CC: ~20min)** — Single discoverable plugin author entry — reconcile README/STATUS/Quickstart current facts and add a copy-paste three-step plugin author path with explicit DSH pin, package contract, local verification and candidate handoff.
  - Surfaced by: DX Discover/Pass 1/4; README:3-7 and docs/operating/dsh-rc2-quickstart.md:1-33.
  - Files: README.md, STATUS.md, docs/README.md, docs/operating/dsh-rc2-quickstart.md, new docs/operating/dsh-plugin-author-quickstart.md.
  - Verify: a clean reader can identify the current entry in under two minutes; historical sections are labeled; every command is present or explicitly planned; `plugin candidate` documents the temporary profile/DSH home/WAL/B0 state ownership and the public capability contract; no claim of Chrome/DeepSeek/杭州 UAT is added.

- [ ] **T23 (P2, follow-up accepted, human: ~1–2h / CC: ~10–15min)** — Readiness summary and help links — add an optional final summary and verified documentation anchors over the existing complete code/remedy output.
  - Surfaced by: DX Pass 3; readiness.mjs:173–179 already emits every failed prerequisite; preflight.mjs:67–69 uses only the first code in its terminal line.
  - Files: `scripts/release/readiness.mjs`, `scripts/release/preflight.mjs`, command reference and readiness tests.
  - Verify: no duplicate validator; all failures and remedies remain; stable exit code and read-only/no-network behavior remain; links lead to the current instructions.
  - Disposition: D8-A approved; tracked as `DX8 / T23` in `docs/hackathon/TODOS.md`. Existing release checks remain mandatory regardless of this optional presentation improvement.

**T24 → T15 (DUPLICATE, not completed)** — Independent package build, peer/exports/files and workbench reverse-import removal are the existing T15 acceptance. Retain that scope and owner; do not schedule two extractions or count effort twice.

**T25 → T18/T19/T20 (DUPLICATE, not completed)** — Upgrade/recovery instructions accompany the already-approved restart/session/WAL, trust/adapter retirement and split-version tasks. The ten synthetic runs are the same T18 evidence, not an extra ten.

**T26 → T5/T7/T10/T12/T19 (TRACE, not a new implementation task)** — Reuse accepted source/pin/digest/owner/receipt fields and local timing evidence. A separate reviewer checklist, automatic onboarding funnel or recurring telemetry process was an unapproved draft suggestion; none is adopted here. The future catalog/review objective remains unchanged.

## Worktree parallelization strategy

This is a dependency map, not automatic authorization to create agents/worktrees. The first slice has several independent evidence lanes, but profile, contract and state files are shared boundaries. Keep the lanes disjoint until their evidence is merged; do not parallelize physical extraction or activation changes before T17/T1 are complete.

| Step | Modules touched | Depends on |
|---|---|---|
| Lane A — inventory and DSH contracts (T1 → T2 → T20) | `docs/architecture/`, `.context/dsh-b0/`, synthetic DSH fixtures | — |
| Lane B — CRM/API and native path (T3/T7 save matrix → T14; after T17) | `backend/contracts/`, `backend/tests/`, `scripts/dsh-b0/` | T1 for boundary ownership; T17 blocks stronger activation claims |
| Lane C — profile/release/trust (T5 → T7 → T13 → T19) | `scripts/release/`, profile manifest, evidence/runbooks | T1/T2 for pins and bundle ownership |
| Lane D — measurement and stop/go (T10 → T16 → T18 → T12) | `docs/operating/`, synthetic load/recovery fixtures | Lanes A–C evidence and T17 |
| Workspace package proof (T15) | `dsh-plugins/`, package manifests/exports, boundary manifest | T1; leaf pack can precede T17; D15 install follows T17. Physical split follows stop/go. |

Execution order: launch Lane A and the read-only parts of Lane B/C; merge the inventory and contract evidence; run T17 before any activation implementation; then run T14/T13/T19 and the measurement lane. T15 workspace package proof runs before stop/go and is a G0 input; only physical repository extraction waits until after stop/go. Shared conflicts are the boundary manifest, profile schema, release journal and generated contract types; one owner updates each in order.

## Failure modes

| Path | Realistic failure | Test/evidence | User-visible handling | Gap |
|---|---|---|---|---|
| DSH host/plugin process | Hung or crashed in-process plugin leaves global state behind | T17 host fixture, timeout/crash/restart probe | Candidate stays BLOCKED; disable/native fallback and host restart are required | **Conditional critical gap until T17** |
| Activation transaction | Partial registration or cleanup failure | T4 negative fixtures and old-active assertion | Old profile remains active; typed activation error | Covered by plan |
| Profile manifest | Empty/duplicate/unallowlisted bundle or invalid schema | T1/T5 manifest fixtures | Candidate rejected before build/activation | Covered by plan |
| Artifact trust | Tampered, unsigned, revoked or vulnerable package | T5/T19 synthetic admission fixtures | BLOCKED with redacted repair evidence | Covered by plan |
| Release journal | Implicit or divergent state path | T13 profile/state-path tests | Fail closed; no guessed journal or success | Covered by plan |
| Remote receipt | Network loss, duplicate or UNKNOWN receipt | T7/T13 reconcile/retry fixtures | UNKNOWN with action id and recovery command | Covered by plan |
| CRM/API path | Permission denial, timeout or malformed response | T3/T8/T14 contract and fault fixtures | Error/NOT_AVAILABLE; native loop remains usable | Covered by plan |
| Session/WAL | Plugin-only profile restart interrupts session or recovery | T18 synthetic restart/WAL runs | Bounded interruption plus explicit recovery; no HMR promise | Covered after baseline |
| Adapter migration | Service schema incompatibility or failed cleanup | T3/T19 expand/contract and sunset evidence | Keep old adapter/profile; cleanup remains blocked | Covered after baseline |
| Build/backpressure | Serial build time or queue/resource bound exceeded | T10/T16 10x synthetic runs | Preflight blocks with stable resource reason | Covered after baseline |

## Scope Expansion Decisions

Accepted: compatibility suite; dev-only plugin kit; thin profile/release registry; capability declarations and native fallback; future catalog/admission; isolated sandbox; profile diff/explain; synthetic canary/rollback; evidence-based extraction order; domain-owned contracts; architecture document and boundary manifest; first vertical slice and 2–4 week stop/go; DSH contract spike; product metrics/RACI; API baseline and adapter; activation isolation; contract governance; supply-chain gate; production-shaped pre-prod evidence; dual-track migration and cleanup gate.

Deferred: real Hangzhou cutover, WSL restart, Cloudflare changes, real DuckDB migration, old runtime deletion, GitHub release/publish actions, full catalog until trigger, physical multi-repository extraction until stop/go, actual DSH 0.2.0 activation until contract evidence.

Skipped: none recorded.

## Stale Diagram Audit

The diagrams in this plan are newly generated for the current workspace-first plan; no prior diagram in the touched plan file predates the accepted vertical-slice change. The target architecture diagram remains conceptual until Phase 0 produces the machine-readable DAG.

## CEO / Eng Completion Summary（历史评审结果）

| Item | Result |
|---|---|
| Mode | SCOPE EXPANSION |
| System Audit | Initial all-at-once platform scope was narrowed to one measured workspace vertical slice; major risks are contract evidence, activation isolation, artifact trust, service/schema compatibility, and migration cleanup. |
| Section 1 (Architecture) | 7 findings, applied |
| Section 2 (Errors) | 10 capability paths mapped, 1 P1 verification gap retained for rollback-unavailable |
| Section 3 (Security) | 8 threats, 3 high-impact gates |
| Section 4 (Data/UX) | 7 interaction/data edge classes, 0 unhandled by plan; implementation evidence pending |
| Section 5 (Quality) | 5 findings, applied |
| Section 6 (Tests) | coverage diagram produced, 6 findings, implementation evidence pending |
| Section 7 (Performance) | 4 findings, numeric targets pending baseline |
| Section 8 (Observability) | 3 findings, applied |
| Section 9 (Deployment) | 4 risks, applied |
| Section 10 (Future) | reversibility 4/5, 3 debt items |
| Section 11 (Design) | 1 documentation contract issue, design review recommended |
| NOT in scope | 8 categories, written |
| What already exists | written |
| Dream state delta | written |
| Error/rescue registry | 8 rows, 1 unresolved verification condition |
| Failure modes | 10 total, 1 conditional CRITICAL GAP: pinned-host process isolation is unproven until T17; rollback proof remains P1 |
| TODOS.md updates | T21–T23 已加入并完成首期薄实现；T24/T25/T26 were merged into existing T15/T18/T19/T20/T5/T7/T10/T12/T19 scopes |
| Scope proposals | 20 CEO proposals plus D14 structure and D15 path decisions; all accepted, 0 deferred, 0 skipped |
| CEO plan | written and persisted |
| Outside voice | completed `claude-code` plan review; 12 findings recorded and dispositions applied; no native fallback used |
| Lake Score | N/A; no 10/10 coverage questions were used |
| Diagrams produced | architecture, data flow, state machine, error flow (registry), deployment, rollback (deployment sequence plus rollback contract) |
| Stale diagrams found | 0 |
| Unresolved decisions | Prior CEO/Eng six-item set remains; this DX review adds one unanswered optional T23 presentation decision. |
## DX Completion Summary（历史快照）

> 此表记录早期评审结束时的状态；T23 已回答并实现，T21 已有 PARTIAL 命令，当前不再有该待选题。

| Item | Result |
|---|---|
| Review mode | DX POLISH |
| Product type | CLI + plugin platform |
| Persona | Personal full-stack maintainer now; future internal plugin maintainers |
| Accepted clock | Local candidate 12–25 minutes target; remote verification separate |
| Score | 5.3/10 initial → 6.6/10 planned; not a shipped-quality score |
| TTHW | NOT_MEASURED; target retained, no runtime claim |
| Read-only probes | doctor PASS; preflight check BLOCKED with four reported causes; help has no plugin subcommand |
| Accepted follow-ups | T21 plugin candidate; T22 single plugin author entry |
| Pending choice | T23 optional final summary/help links; existing readiness checks already complete |
| Duplicate handling | T24→T15, T25→T18/T19/T20, T26→existing governance/measurement; no duplicate tasks |
| Outside voice | 2026-10-02 Claude Code DX POLISH review completed; result **Revise and freeze** with P0/P1 findings recorded above; prior 12-finding plan review remains separate |
| Implementation status | No code, release, deployment, DSH host restart, real DuckDB, WSL2/WAL or production UAT executed |

## Eng Review Rerun (2026-10-02)

Target: docs/plans/shinemage-plugin-platform-split.md on public main@fcbd1324; this is a plan review, not an implementation or release approval. The D14 structure answer (B — smaller workspace vertical slice) and D15 path answer (A — native first-purchase analysis) are reused exactly. The current DX freeze narrows the first implementation gate; it does not revoke the long-term multi-repository direction.

### Scope Challenge and preparation

- Scope accepted as previously reduced: one workspace vertical slice, fixed DSH 0.1.7-rc.2, synthetic/isolated evidence, then a measured stop/go before physical repository extraction. No new service, catalog, remote activation or production data scope was added.
- Complexity remains above the 8-file / 2-class threshold, so the existing D14 arrangement is retained: inventory/contracts, native path, profile/release, and measurement are separate evidence lanes; shared manifest/journal/state files remain sequential. No new complexity question was opened because the exact D14 answer is recorded and the DX corrections only tighten contracts.
- Prior learning applied: profile-inputs-and-state-ssot (confidence 10, 2026-10-01), dsh-host-process-model-before-isolation (confidence 10), rc2-four-control-plane-state-ssot (confidence 10), candidate-digest-input-boundary (confidence 9), and doctor-release-blocked-is-valid-evidence (confidence 9).
- Retrospective: release history shows repeated fixes around clean checkout, runtime closure, evidence binding and promotion state. No revert was found for the named plan/release paths; this supports keeping state and artifact boundaries explicit instead of adding another parallel control plane.
- Aside was not ready; no web-dependent engineering claim was added. DESIGN.md was read; native-first and centralized token/adapter constraints remain applicable.

### Section 1 — Architecture

**ENG-R1 — [P0] (confidence: 10/10) docs/plans/shinemage-plugin-platform-split.md:1182-1185 — host process isolation is still an implementation gate, not a capability.** The plan says: “prove the actual host load, unload, restart, timeout and crash behavior before claiming in-process activation isolation or atomic rollback” and, if unsupported, “require disable/native fallback plus host restart”. Until T17 records the pinned host behavior, transaction and rollback claims cannot be used as a release gate. **Disposition: keep T17 as the hard prerequisite; no implementation may mark this resolved.**

**ENG-R2 — [P1] (confidence: 10/10) scripts/release/readiness.mjs:7-15, scripts/release/preflight.mjs:123 — plugin-only candidate input is not yet a profile-owned boundary.** The current source declares export const RELEASE_PLUGINS = [ followed by seven hardcoded package paths, and preflight builds each entry in for (const plugin of plugins). The plan’s T21 calls the future command “plugin-only” but previously did not require an explicit plugin/profile input. **Disposition: T13 owns moving the ordered list into the profile manifest; T21 now requires an explicit selected plugin or profile manifest, rejects unallowlisted entries, and must not invoke the seven-entry host default.**

**ENG-R3 — [P1] (confidence: 9/10) dsh-plugins/shine-funnel/build.mjs:4, dsh-plugins/shine-query/build.mjs:4, dsh-plugins/analytics-workbench/package.json:17-22 — an independent release digest needs an explicit pack boundary.** The build scripts currently import ../analytics-workbench/toolchain.mjs; the package declares a files allowlist, but the package is also private, so source-tree build success is not proof of an installable immutable package. **Disposition: T15/T21 now require a controlled pack/tarball, files/exports/peer/invariant validation and digest over the pack output; no workspace file: link or raw source-tree hash counts.**

**ENG-R4 — [P1] (confidence: 10/10) scripts/dsh.mjs:193-203, scripts/release/promotion.mjs:18-20 — state-path semantics still diverge.** The CLI currently uses args[0] || join(releaseEvidence, state.json) for reconcile/status/resume, while promotion requires RELEASE_STATE_PATH and raises RELEASE_STATE_PATH_REQUIRED. A candidate can therefore inspect a default journal while activation uses another journal. **Disposition: retain T13 as a release blocker; T21 must pass an explicit state path through every local command and fail closed when unavailable/ambiguous.**

**ENG-R5 — [P1] (confidence: 9/10) docs/plans/shinemage-plugin-platform-split.md:43, :457 — the first-slice prose had two different entrypoints.** Line 43 previously described the workbench-to-CRM-API entry, while the approved D15 record at line 457 freezes native DSH session → first-purchase → worker → permission/source → success/cancel/UNKNOWN → save. **Disposition: line 43 has been aligned to D15; cockpit preview/apply remains a later assertion in the same candidate.**

**ENG-R6 — [P1] (confidence: 9/10) docs/plans/shinemage-plugin-platform-split.md:183-190 — long-term completion mixed 0.2.0 into the first gate.** The earlier completion definition required both 0.1.7 and 0.2.0 profiles without saying this was post-stop/go, while the DX freeze made 0.2.0 advisory. **Disposition: the heading is now long-term completion after stop/go and a separate first-slice completion definition explicitly blocks only 0.1.7; 0.2.0 remains a later candidate.**

### Section 2 — Code Quality and boundaries

- The plan reuses existing readiness, preflight, artifact, state, promotion and fixture owners; it does not introduce a second verifier or state machine. This is the correct smaller arrangement.
- The shared-code rubric identifies at least two authored callers for the toolchain boundary (shine-funnel/build.mjs:4 and shine-query/build.mjs:4) and a separate workbench consumer (crm-knowledge imports workbench client/theme code). T15 must remove these reverse imports before claiming independent repositories; no cross-service helper should be extracted.
- The current package manifests already expose files, exports, DSH peer and bundle patch fields, so the smallest quality change is to validate packed output and move only dev-only toolchain bindings. private:true is not treated as an independent publication channel.
- Error handling remains fail-closed for unavailable Python, dirty worktree, unavailable upstream/runtime and state conflict; the candidate path must add selected-plugin, pack-digest, unavailable-state and interrupted-canary codes without catching them into generic success.

### Section 3 — Test and evidence review

The existing release tests and synthetic backend tests are component evidence, not candidate proof. The plan’s test diagram correctly leaves a gap around profile-supplied plugin list, explicit state path, canary and rollback. Required test mapping is:

1. T13: profile-only plugin-list change, unavailable/ambiguous RELEASE_STATE_PATH, and all release/receive/reconcile/status/resume/rollback commands reading the same journal.
2. T15: two package-level clean builds; pack/tarball inspection of files/exports, peer and invariant; built package import with no workbench source or kit runtime dependency.
3. T17: pinned host load/unload/restart/hung/crash/timeout fixture, plus native-loop survival and WAL recovery classification.
4. T14/T21: selected native first-purchase path through one immutable candidate; permission denial, cancel, EXECUTION_UNKNOWN, save rejection, native fallback, unallowlisted plugin, pack digest mismatch and interrupted canary.
5. T16/T18: ten synthetic plugin-only runs with serial baseline, interruption, restart/session/WAL recovery and bounded rollback duration; no real DuckDB or host endpoint.

No current test run is promoted to “passed” by this review; the existing doctor --release blocked result remains valid evidence that the release environment is incomplete.

### Section 4 — Performance and operability

- scripts/release/preflight.mjs:121-126 still builds the complete seven-entry list serially. That is acceptable for the existing full preflight baseline, but a plugin-only candidate must select one package/profile and record its own duration; T16 must measure before considering bounded parallelism.
- The 12–25 minute local target remains a target, not a measured result. T10/T12 must separate human setup/read time from command phase timings and report cold/warm cache separately; remote receive/UAT is outside this clock.
- Candidate operations need one receipt with release_id, profile_digest, artifact_digest, action_id, stage, attempt, redacted reason and PASS/PARTIAL/NOT_RUN/BLOCKED; old profile remains active on any failed or unknown activation.
- No new silent critical gap was found beyond ENG-R1/T17. Production-shaped fixture, trust-root tooling, real host UAT, and cleanup remain explicitly gated.

### Eng Review disposition and task mapping

| Finding | Disposition | Existing owner/task | State |
|---|---|---|---|
| ENG-R1 host isolation | retain hard gate and native/host-restart fallback | T17 | OPEN / P0 |
| ENG-R2 profile-owned plugin selection | move list to manifest; explicit candidate selector | T13 + T21 | OPEN / P1 |
| ENG-R3 packed artifact boundary | pack output, allowlist/exports/peer/invariant, digest | T15 + T21 | OPEN / P1 |
| ENG-R4 one explicit journal | fail closed on unavailable/ambiguous state path | T13 + T21 | OPEN / P1 |
| ENG-R5 first-slice path | align prose to D15 native first-purchase | plan body | APPLIED |
| ENG-R6 0.2 sequencing | separate long-term DoD from first-slice DoD | plan body + T20 | APPLIED |

No new task ID is created; all findings map to existing T13–T21 owners. The Eng JSONL task artifact for this run is intentionally empty to avoid duplicating T24–T26 or creating a second state/control-plane task.

### Eng completion summary

| Item | Result |
|---|---|
| Step 0 Scope Challenge | Existing D14 B — smaller workspace vertical slice reused; D15 A — native first-purchase path reused |
| Architecture Review | 6 findings; 1 P0 feasibility gate, 4 P1 boundary gates, 1 P1 documentation/sequence correction |
| Code Quality Review | 4 boundary checks; reverse imports and pack boundary remain T15/T21 evidence |
| Test Review | 5 evidence groups; candidate/profile/isolation proof remains NOT_RUN |
| Performance Review | 3 issues; T10/T16/T18 measurement remains open |
| NOT in scope | written; no remote/catalog/0.2/production action added |
| What already exists | release/readiness/artifact/state/promotion helpers and synthetic fixture lanes reused |
| TODOS.md updates | 0 new items; T13–T21 owners updated, T21/T22 remain accepted DX follow-ups |
| Failure modes | 1 conditional critical gap (T17 host containment) |
| Unresolved decisions | 0 new engineering choices; prior CEO/Eng unresolved set and T23 remain open |
| Outside voice | 2026-10-02 Claude Code Eng review completed; `revise-and-freeze`; findings and dispositions recorded in Eng Outside Voice; prior DX pass remains recorded |
| Parallelization | 4 evidence lanes; 3 parallel/read-only lanes, 1 sequential extraction/activation lane |
| Lake Score | N/A; no new kind-differentiated choice was asked |

### Eng approval readiness

Approval readiness: PASS for the recorded decisions D14, D15, DX-D4, T13/T15/T17/T20 ownership and the current DX freeze. The pass records existing approvals only; it does not close T17 or turn any NOT_RUN evidence into a pass.

### Suppressed findings

One low-confidence concern about exact DSH unload semantics was suppressed from the main report because the pinned upstream runtime behavior was not available in this worktree; it remains covered by T17 rather than being presented as a current defect.

### Eng Outside Voice / coverage

2026-10-02 由正确的 `gstack-claude-code` provider 完成独立 Eng 复审，边界为只读计划正文，未读取仓库、TODOS、STATUS、未执行命令或触碰生产。结论为 **revise-and-freeze**，不是 clean。它确认当前闸门方向正确，但指出 Phase 0–2、CEO 扩展和 0I 仍可能把后置能力当首期验收；并要求命名首期包、把 0.2.0 改为 advisory、把多仓命令移出首期、保持 T13 state/profile 源为 OPEN、把供应链门禁分层、将 T17 失败路径作为唯一首期隔离合同。上述处置已写入本计划的首期包映射、当前闸门优先级、Phase 0–2 和 CEO 决策说明；无新任务 ID。

外部证据边界保留：它没有独立验证本仓代码或测试，未知内容不能当作通过；本地源代码核对和只读 preflight 结果仍是本轮主证据。

## Eng Review Rerun 2（2026-10-02）

Target: `docs/plans/shinemage-plugin-platform-split.md` on public `main@fcbd1324`. This rerun validates the accepted D1–D9 design contracts against current source and the existing T3/T7/T9/T13/T14/T15/T17/T21/T22 owners. It remains a plan review: no implementation, commit, push, merge, release, deployment, service restart, real DuckDB access or production UAT occurred.

### Scope Challenge and preparation

- Existing scope answers are reused exactly: D14 B (smaller workspace vertical slice) and D15 A (native first-purchase path). The long-term multi-repository direction remains after stop/go.
- Complexity is still above the 8-file / 2-class threshold; the four evidence lanes and sequential shared profile/journal boundaries remain. No new structure question was opened because this rerun only tightens already approved contracts.
- Prior learnings applied: `d15-ui-contract-before-t14`, `profile-inputs-and-state-ssot`, `dsh-host-process-model-before-isolation`, `candidate-digest-input-boundary`, and `rc2-four-control-plane-state-ssot`.
- Retrospective: release history still shows repeated fixes around runtime closure, evidence binding, clean checkout and promotion state; no revert was found on the named plan/release paths.
- Aside was unavailable for this rerun; no web-dependent claim was added. The external Claude Code review below completed with the plan body truncated at the provider limit.

### Section 1 — Architecture

**ENG-R7 — [P1] (confidence: 10/10) `backend/analytics_first_purchase_native.py:202-225` — the D15 service surface is an internal route, not a stable plugin contract.** The source declares `@app.post("/internal/native/prompt", ... include_in_schema=False)` and `/internal/native/first-purchase` with the same hidden schema boundary. The plan already approves a CRM/API baseline and generated consumer types, but does not say that the plugin consumes a SemVer capability/API envelope while these routes remain a service-side adapter. **Disposition: apply under T3; keep `/internal/native/*` behind the adapter, assign the public contract owner and version window, and do not generate plugin types from hidden routes.**

**ENG-R8 — [P1] (confidence: 10/10) `scripts/dsh-b0/run-kernel-contract.mjs:47-65`, `analysis-contract.mjs:52-69`, `cockpit-contract.mjs:53-70` — generated schema ownership and digest inputs are not part of candidate identity.** The generators compute an OpenAPI digest and write backend JSON plus workbench `.d.ts`, while the plan only names “generated types” and a boundary manifest. It does not require generator version, input source SHA, generated artifact owner, or those inputs to enter the packed candidate manifest. **Disposition: apply under T3/T15/T21; record generator and source/input digests in the manifest, run drift checks before pack, and include them in the candidate evidence. The same contract row also fixes B0 ratio fields at 0–1 and tests legacy raw-ratio rejection.**

**ENG-R9 — [P1] (confidence: 10/10) `dsh-plugins/analytics-workbench/package.json:2-22` and `dsh-plugins/shine-funnel/build.mjs:4-10` — package identity and installable pack boundary can change under the first candidate.** The actual first-slice package is `@shine-mage/dsh-analytics-workbench-b0`, while the target architecture also named a different `@shine-mage/dsh-analytics-workbench`; build scripts still import the workbench toolchain and the package is private. A stop/go rename or unresolved `workspace:*`/file link would change DSH ids, receipts and resume semantics, or produce a tarball that a clean profile cannot install. **Disposition: apply under T15/T21; keep the approved first-slice package id stable, reject unresolved workspace/file links, hash the controlled pack output plus pinned generated inputs, and treat any future rename as a new artifact identity with an explicit migration.**

**ENG-R10 — [P0] (confidence: 9/10) `scripts/dsh.mjs:193-203` versus `scripts/release/promotion.mjs:18-20` — release journal and native DSH profile are still two state ledgers without a crash reconciliation contract.** The CLI can fall back to a default `release-evidence/state.json`, while promotion requires `RELEASE_STATE_PATH`; native host restart additionally owns profile/home/WAL state. Without an explicit rule, crash recovery can promote from a stale journal or trust a runtime profile that was never admitted. **Disposition: retain T13/T17 as hard gates; the journal/profile manifest remains the release source of truth, native profile/home/WAL is runtime evidence, and every restart reconciles native profile digest to the journal before any activation or rollback result is accepted.**

**ENG-R11 — [P1] (confidence: 9/10) `backend/services/analytics/first_purchase/saved.py:63-80,172-219` — durable service state is not bound to profile rollback identity.** Saved analyses are persisted in a separate SQLite store with idempotency and `evidence_digest`, while the current result contract has no `candidate_digest`/`correlation_id` envelope. Profile rollback alone cannot undo or safely replay a service-side save; a retried `EXECUTION_UNKNOWN` can create a second durable record unless the cross-layer identity is explicit. **Disposition: apply under T3/T7/T14; bind candidate/profile/service/schema digests, correlation and idempotency keys, permission/source owner and durable-state key in the receipt and rollback matrix; profile rollback must report service-state handling instead of implying data rollback.**

**ENG-R12 — [P1] (confidence: 9/10) `scripts/dsh-b0/run-kernel-contract.mjs:30-35` and current verification command draft — the proposed harness does not yet define process ownership or isolated DSH state.** The existing generators are deliberately offline and only set `cwd/PYTHONPATH`; the plan’s candidate command previously pointed at a single JSON state path, which cannot represent a profile directory, WAL, sessions, node_modules or a host process. Without a command-owned DSH home/profile/WAL and explicit PID/port registry, T17 cannot prove crash/timeout/partial-registration safety without risking the operator environment. **Disposition: apply under T17/T21/T22; require a process-level synthetic host/service harness, temporary directory ownership, PID cleanup and no real DSH home/DuckDB access.**

### Section 2 — Code Quality and contract boundaries

- The existing generators are useful Layer 1 reuse, but they currently write artifacts into backend/workbench locations. T3/T15 must assign one domain owner per schema and make the plugin consume the versioned output, rather than moving generated copies into a shared runtime kit.
- The source has explicit fail-closed validation and idempotency (`FirstPurchaseResult` rejects invalid status/facts; `saved.py` records idempotency keys), so the required change is an envelope and boundary binding, not a second state machine. The current package’s `files`/`exports`/peer fields are the right admission inputs; `private: true` must not be mistaken for a publishable install boundary.
- Native-first ownership is a real code boundary: `ctx.theme.overrideTokens` and brand slots are conditional in `dsh-plugins/analytics-workbench/src/client/index.tsx:676-683`, while the plugin also injects account/theme chrome at `829-851`. T9 must make D15 candidate profiles disable those paths by default and test that native title/sidebar/session/tool contracts remain host-owned.

### Section 3 — Test and evidence review

```text
CODE PATHS                                             USER FLOWS
[+] native DSH prompt → service adapter                 [+] User asks first-purchase question
  ├── [GAP][→E2E] public SemVer envelope               │   ├── [★★ TESTED] synthetic request/receipt decode — existing first-purchase tests
  ├── [GAP] hidden internal route must stay adapter    │   ├── [GAP][→E2E] permission denial + source/provenance visible
  └── [GAP] contract/generated digest drift           │   ├── [GAP][→E2E] cancel / EXECUTION_UNKNOWN / replay
[+] candidate pack → profile journal → native host    │   ├── [GAP][→E2E] save idempotency + candidate rollback
  ├── [★★ TESTED] offline generator drift checks       │   └── [GAP] native fallback after plugin disable/restart
  ├── [GAP][→E2E] pack identity/workspace-link reject
  ├── [GAP][→E2E] journal ↔ native profile reconcile
  └── [GAP][→E2E] crash/timeout/PID cleanup harness
[+] saved analysis → SQLite durable state              [+] Maintainer runs plugin candidate
  ├── [★★ TESTED] idempotency conflict/duplicate key   ├── [GAP][→E2E] clean profile install from tarball
  ├── [GAP] candidate/correlation binding               └── [GAP] receipt replay after restart
  └── [GAP] profile rollback service-state handling
[+] UI token/native ownership                            [+] Keyboard/mobile/reduced-motion D15 use
  ├── [★ TESTED] existing aria-live/focus CSS smoke     ├── [GAP][→E2E] 3 viewport + 200% zoom
  ├── [GAP][→E2E] brandOverride disabled in D15         └── [GAP][→E2E] focus restore/live-region per state

COVERAGE: 7/22 paths tested (32%) | Code paths: 5/14 (36%) | User flows: 2/8 (25%)
QUALITY: ★★★:0 ★★:3 ★:4 | GAPS: 15 (10 E2E)
Legend: ★★★ behavior + edge + error | ★★ happy path | ★ smoke check | [→E2E] integration/host path
```

Required test plan additions map to existing owners: T3 contract envelope/generated digest/ratio fixtures; T13 journal/profile crash reconciliation; T14 D15 permission, provenance, cancel/UNKNOWN, save replay and focus/live-region fixtures; T15 clean tarball install with workspace-link rejection; T17 process-level crash/timeout/native-loop/WAL fixture; T21 candidate receipt and identity replay; T22 command ownership and verification documentation. No current test run is promoted to pass by this plan review.

### Section 4 — Performance and operability

- Generated schema drift and pack identity should be checked before any expensive build or host canary; fail early so the 12–25 minute target is not consumed by a late install failure.
- The native host/profile reconciliation adds one bounded digest comparison and journal read per candidate; record its latency separately from service/API p95 and cold/warm pack time. Do not parallelize journal admission or activation merely to hide this gate.
- The receipt must carry `release_id`, `action_id`, `correlation_id`, `profile_digest`, `artifact_digest`, `contracts_digest`, `service_schema_digest`, `stage`, `attempt`, `redacted reason`, and `PASS/PARTIAL/NOT_RUN/BLOCKED/UNKNOWN`; old active remains unchanged on failed or unknown activation.

### Eng Review disposition and task mapping

| Finding | Disposition | Existing owner/task | State |
|---|---|---|---|
| ENG-R1 host process model | retain hard T17 gate and conservative native/host-restart fallback | T17 | OPEN / P0 |
| ENG-R2 profile-owned plugin selection | explicit profile/plugin selector; no seven-entry default | T13 + T21 | OPEN / P1 |
| ENG-R3 packed artifact boundary | controlled pack, allowlist/exports/peer/invariant and pack digest | T15 + T21 | OPEN / P1 |
| ENG-R4 one explicit journal | fail closed on unavailable/ambiguous state path | T13 + T21 | OPEN / P1 |
| ENG-R5 first-slice path | D15 native first-purchase entry | plan body | APPLIED |
| ENG-R6 0.2 sequencing | advisory/post-gate only | plan body + T20 | APPLIED |
| ENG-R7 public service contract | SemVer capability/API envelope; internal route behind adapter | T3 | OPEN / P1 |
| ENG-R8 generated inputs and ratio | owner/source/generator digests; B0 0–1 negative tests | T3 + T15 + T21 | OPEN / P1 |
| ENG-R9 stable package identity | stable package/plugin ids; reject unresolved workspace links | T15 + T21 | OPEN / P1 |
| ENG-R10 ledger reconciliation | journal/profile is source of truth; native state reconciles | T13 + T17 + T21 | OPEN / P0 |
| ENG-R11 durable-state rollback | cross-layer correlation/idempotency and service-state matrix | T3 + T7 + T14 | OPEN / P1 |
| ENG-R12 process harness | command-owned DSH home/WAL/service/PID boundary | T17 + T21 + T22 | OPEN / P1 |

No new task IDs are created; all findings map to existing T3/T7/T9/T13/T14/T15/T17/T21/T22 owners. The Eng JSONL artifact for this rerun is intentionally empty because no new task ID is needed; the required QA plan artifact is generated separately.

### Eng rerun completion summary

| Item | Result |
|---|---|
| Step 0 Scope Challenge | Existing D14 B and D15 A reused; accepted scope unchanged |
| Architecture Review | 6 new findings plus retained R1–R6; 2 release-blocking gaps (T17 host model, journal/native reconciliation) |
| Code Quality Review | 3 boundary checks; generated/schema/package/native ownership remains open |
| Test Review | ASCII diagram produced; 15 gaps identified, 10 E2E-worthy |
| Performance Review | 3 issues; early drift checks and bounded reconciliation remain open |
| NOT in scope | unchanged; no remote/catalog/0.2/production action added |
| What already exists | offline generators, strict result validation, idempotent SQLite save, package allowlist/peer fields and native fallback primitives reused |
| TODOS.md updates | 0 new items; existing T3/T7/T9/T13/T14/T15/T17/T21/T22 scopes tightened |
| Failure modes | 2 critical gaps flagged: T17 host containment and journal/native state reconciliation |
| Unresolved decisions | 0 new choices; prior T23 and CEO/Eng/DX unresolved items remain explicit |
| Outside voice | Claude Code completed; `issues_found`, plan body truncated; no native fallback |
| Parallelization | 4 lanes; 3 read-only/contract lanes can run in parallel, activation/extraction remains sequential |
| Lake Score | N/A; no new kind-differentiated choice was asked |

### Eng rerun approval readiness

Approval readiness: PASS for reused D14/D15 scope and prior T3/T7/T9/T13/T14/T15/T17/T21 ownership. The pass records existing approvals and required contract proofs; it does not mark any OPEN task or NOT_RUN evidence as complete.

### Eng rerun Outside Voice / coverage

Claude Code completed an independent read-only challenge with the plan body truncated by the provider input limit. It found eight gaps: hidden internal route as contract, generated schema owner/digest inputs, unstable package identity and workspace packing, dual journal/profile ledgers, durable-state rollback identity, unavailable process harness, adapter placement, and numeric ratio contract. The first seven are mapped to T3/T7/T13/T14/T15/T17/T21/T22; the numeric contract is folded into T3/T14. Recommendation was to block Phase 1 schema freeze until public contract owner, generator SHA, stable package id and native-vs-journal source of truth are explicit. Those corrections are now written into the plan; the gaps remain OPEN until implementation evidence exists.

### Suppressed findings

No additional suppressed finding met the P0 threshold. Exact DSH unload semantics remain unknown and continue under T17 rather than being asserted.

## Design Review Rerun 2（2026-10-02）

审查对象：`docs/plans/shinemage-plugin-platform-split.md`，基准为公共 `main@fcbd1324`。本轮继续只审 UI/native-first 计划合同，沿用 D14 首期垂直切片和 D15 原生 first-purchase 路径；不实现代码、不修改 `DESIGN.md`、不启动服务、不读取真实 DuckDB、不做浏览器/杭州/发布验收。设计生成器仍返回 `DESIGN_NOT_AVAILABLE`，所以没有生成视觉稿，视觉和设备证据继续由 T9/T14 后续实现门禁负责。

### 覆盖与独立声音

- 本地独立设计复核：完成，评分 **6.5/10**，结论 `revise-and-freeze`。确认 native-first、状态矩阵和 provenance 方向正确，并指出取消/保存未知、输入边界、主题模式、文案、精确视口和 ARIA 需要可执行合同。
- Claude Code 独立设计复核：完成，评分 **7/10**，结论 `revise-and-freeze`。指出 `DESIGN.md` 全品牌文字冲突、candidate digest 的业务/维护者边界、React/Vue 断点、宿主重启、结果标题、freshness、权限播报和真实焦点证据缺口。
- 两路都只审计划和已提供的源码证据，没有宣称浏览器、读屏器、触控设备、真实 DSH、杭州或生产通过。

### 本轮已冻结的设计决定

| 决定 | 计划合同 | 归属/实现门禁 |
|---|---|---|
| D8 | `QUEUED → AUTHORIZING → RUNNING → VALIDATING → READY_TO_SAVE` 固定阶段；每阶段有 elapsed/last-updated/action；超时转 `EXECUTION_UNKNOWN`，必须 reconcile，禁止伪造百分比或重复动作 | T14 服务/插件状态 fixture；T21 receipt |
| D9 | `freshness_state`、阈值、`save_eligible` 和 `save_ineligible_reason` 由服务合同提供；`FRESH + SUCCESS_UNSAVED + 完整 provenance + 合法权限` 才能保存；PARTIAL/STALE/EXPIRED/UNKNOWN 默认拒绝 | T3/T7/T14 saved-analysis contract 和负测 |
| D10 | Dark/Light/forced-colors 只通过宿主语义 token；实际 alpha、字号、焦点环和 WCAG AA 对比度必须实测；React/Vue 不互相 import 主题 | T9 token/主题合同；T14 三模式证据 |
| D11 | 阶段标题、主动作、禁止动作、live 文案、来源截断/展开/复制统一；“核对结果”“重新查询”“确认保存”不能混成泛化“重试” | T9 state board；T14 文案/DOM fixture |
| D12 | 320/375/768/1280 CSS px、200%/大字体、forced-colors 均需完成查询→核对/保存/回退路径；长来源只能折叠或横向滚动，不得丢状态 | T9/T14 精确视口证据 |
| D13 | 稳定 `aria-labelledby`/`aria-describedby`、`aria-busy`、live politeness、`action_id+stage+reason_code` 去重、取消/折叠/返回 composer 的焦点恢复 | T14 可访问性树/键盘/读屏证据 |
| D14 | `HOST_RESTART_REQUIRED` 独立于 `FAILED`；旧 profile/native loop 保持 active，草稿/receipt 保留，重启后 reopen/reconcile，未确认不能自动成功或重复保存 | T17 宿主进程证据；T14/T21 恢复 fixture |

此前 D1–D7 的入口、状态/故事板分离、state board、token/对比度、三档响应式、provenance、scope 与 disabled/NOT_AVAILABLE 决定继续有效。本轮没有创建新的任务 ID，D8–D14 都映射到既有 T3/T9/T14/T17/T21/T22。

### Litmus、现状与未关闭门禁

首期仍只允许 DSH 原生 composer → first-purchase-query-card → provenance → `SUCCESS_UNSAVED` → saved-analysis-view；维护者 candidate receipt、profile journal、digest、rollback 不进入业务 UI。任何状态必须能用标题和文字理解，不能靠颜色、阴影、动画、tooltip 或第二套导航完成语义。`UNSUPPORTED`、`NEEDS_CLARIFICATION`、`NOT_AVAILABLE`、`EXECUTION_UNKNOWN`、`STALE`、`EXPIRED`、`HOST_RESTART_REQUIRED` 都不允许伪装成成功。

计划合同现在足够进入实现排期，但仍不是实现完成：T9 还要同步 `DESIGN.md` 的全品牌覆盖文字；T14/T9 还没有真实浏览器、键盘、读屏、触控、200% 和三主题证据；T17 还要证明 host load/unload/restart/crash/timeout/WAL 行为；T3/T15/T21 还要完成公开合同、packed identity、digest、receipt 和回退实现。上述项目是实现/证据门禁，不是本轮尚未回答的设计选择。

### 评分与结论

| 维度 | 本轮计划评分 | 仍需的实现证据 |
|---|---:|---|
| 信息架构/native-first | 9/10 | T9 逐区同步 DESIGN.md 并验证原生 chrome 不被覆盖 |
| 状态与恢复 | 8.5/10 | T14/T17 真实断线、超时、重启、保存冲突/重放 |
| 文案与可执行性 | 8.5/10 | 文案 fixture、live 去重和焦点 DOM 断言 |
| 主题/响应式/无障碍 | 8/10 | 320–1280、200%、forced-colors、读屏和触控实测 |
| 视觉证据 | 5/10 | 设计生成器不可用，需实现后 `/design-review` |

整体计划合同评分 **6.5/10 → 8.0/10**。结论为 **ISSUES OPEN / revise-and-freeze**：设计选择已冻结，不能把未执行的实现、浏览器或宿主证据写成通过；下一门应是 T9/T14/T17 的实现和验证，再由 Eng Review 复核跨层合同。

## Eng Review Rerun 3（2026-10-02）

Target: `docs/plans/shinemage-plugin-platform-split.md` on public `main@fcbd1324`; this is a plan review of the D8–D14 design additions against current contracts and implementation owners. Scope reuses the approved D14-B smaller workspace vertical slice and D15 native first-purchase path. No code, service, real DuckDB, host restart, release or deployment action occurred. Aside was unavailable, so no external web claim is used.

### Scope Challenge and preparation

- The proposed work crosses more than eight files and multiple service/package boundaries, so the complexity gate applies. The exact prior structure approval is D14-B: keep one workspace vertical slice and four evidence lanes, then use stop/go before physical repositories; no new scope reduction is required in this rerun.
- Existing helpers remain the Layer 1 base: versioned backend contracts, generated workbench decoders, profile/release journal, native first-purchase service and synthetic worker fixtures. T3/T9/T14/T17/T21/T22 own the new evidence; no second state machine or runtime is proposed.
- Prior learning applied: `public-contract-and-profile-reconcile-before-schema-freeze` (10/10, observed), `d15-ui-contract-before-t14` (10/10, cross-model), `profile-inputs-and-state-ssot` (10/10, cross-model), `dsh-host-process-model-before-isolation` (10/10, cross-model), `business-result-vs-maintainer-receipt` (9/10, cross-model).
- Retrospective: release/preflight paths have repeated fixes for clean checkout, runtime closure, state path and promotion recovery; `git log --grep=revert` found no revert on the named paths. This supports keeping the explicit profile/state and packed artifact gates.

### Section 1 — Architecture

**ENG-R13 — [P1] (confidence: 9/10) `docs/plans/shinemage-plugin-platform-split.md:1008-1010`, `backend/contracts/analytics_first_purchase_cockpit.py:137-147` — the new freshness/save contract needs an explicit schema version.** The plan requires `freshness_state` values `FRESH/STALE/EXPIRED/UNKNOWN`, `save_eligible` and `save_ineligible_reason`, while the current cockpit contract defines `freshness: Literal["PINNED"]` for success and unavailable cards. `PINNED` describes a fixed snapshot, not its eligibility for a new save; an unversioned meaning change would break existing consumers. **Disposition: D1-A approved by the user's “按照推荐” reply on 2026-10-02. T3/T14 add a versioned service-owned first-purchase result/provenance envelope, generated types and strict decoder; cockpit v1 retains its snapshot meaning behind an explicit adapter. The server enforces eligibility; a UI flag cannot grant it.**

### Section 2 — Code Quality and contract boundaries

**ENG-R14 — [P1] (confidence: 9/10) `dsh-plugins/analytics-workbench/src/client/first-purchase-query-card.tsx:149-160,170-195`, `dsh-plugins/analytics-workbench/src/query-cancel.mjs:18-26` — the existing UI collapses the newly approved failure states.** `SavePhase` only contains `idle/saving/saved/joining/joined/join-error`, asset capability failure returns `null` without a visible `NOT_AVAILABLE` reason, and `classifyCancelOutcome` returns only `accepted|error`; it cannot distinguish `WORKER_ACTIVE` from `NO_ACTIVE_RUN` as required by D5/D14. This is an implementation gap under the already approved state contract, not a request to invent another UI flow. **Disposition: map to T14/T3 with explicit cancel/save envelopes, typed reason codes and visible disabled/UNKNOWN/conflict states.**

**ENG-R15 — [P1] (confidence: 9/10) `dsh-plugins/analytics-workbench/src/first-purchase-query-model.mjs:18-26,42-50` — the receipt codec is exact-key and status-limited, so D8/D9/D14 fields cannot be added informally.** `RECEIPT_KEYS` currently admits only the v1 run/result fields and `STATUSES` lacks `AUTHORIZING`, `VALIDATING`, `READY_TO_SAVE`, `HOST_RESTART_REQUIRED`, `STALE` and `EXPIRED`; adding optional keys without a schema/version boundary would either reject the approved states or make unknown data silently accepted. **Disposition: T3 owns a versioned envelope/decoder and generated type update; T14 must reject old or partial receipts before showing save.**

### Section 3 — Test and evidence review

**TEST-ENG-003 — [P1] (confidence: 8/10) plan `T14` verification and current test paths — the new D8–D14 contracts are named but not all mapped to executable fixtures.** The plan requires elapsed/last-updated and timeout reconciliation, freshness eligibility, three theme modes, exact viewports, ARIA dedupe/focus, and host restart recovery, while the current evidence is mostly static contract/source coverage. T14/T17/T21 must add synthetic tests for stage transitions, old-v1 receipt rejection, save replay/UNKNOWN/conflict, `HOST_RESTART_REQUIRED`, 320/375/768/1280 + 200%/forced-colors, and live-region/focus assertions; unavailable browser/host evidence remains `NOT_RUN`, never PASS.

### Section 4 — Performance and operability

**PERF-ENG-002 — [P1] (confidence: 8/10) plan `docs/plans/shinemage-plugin-platform-split.md:868-870,997-1016` — heartbeat, timeout and reconcile budgets have no units or bounded retry policy.** The UI contract says “合同规定的 heartbeat/timeout 窗口” and “下一次 reconcile” but does not state who owns the values, the maximum age before `UNKNOWN`, the retry/backoff cap or the operator alert threshold. T7/T10/T14/T17 need one measurable configuration contract so a long-running worker is not mistaken for a hang and `UNKNOWN` cannot remain silent indefinitely. **Disposition: D2-A approved. T7 defines one versioned timing/operability config and receipt; T10/T14/T17 consume it, while numeric values stay pending until synthetic/host baselines.**

### Test coverage diagram

```text
CODE PATHS                                                   USER FLOWS
[+] first-purchase result/provenance envelope               [+] Native DSH first-purchase journey
  ├── [GAP][★★ TESTED] v1 adapter preserves PINNED meaning     ├── [★★ TESTED] submit → result → provenance
  ├── [GAP][→E2E] freshness FRESH/STALE/EXPIRED/UNKNOWN       ├── [GAP][→E2E] AUTHORIZING → RUNNING → VALIDATING
  └── [GAP] old/partial receipt rejected before save          ├── [GAP][→E2E] timeout → UNKNOWN → reconcile
                                                               └── [GAP][→E2E] HOST_RESTART_REQUIRED → reopen
[+] query cancel/save envelopes                               [+] Save and recovery
  ├── [★★ TESTED] current accepted/error cancel fixtures       ├── [GAP][→E2E] WORKER_ACTIVE vs NO_ACTIVE_RUN
  ├── [GAP] reason-coded cancel outcome                         ├── [GAP][→E2E] FRESH save / STALE or EXPIRED rejection
  └── [GAP][→E2E] SAVE_UNKNOWN/SAVE_CONFLICT replay             └── [GAP][→E2E] duplicate action id remains idempotent
[+] profile/journal/host recovery                             [+] Display and accessibility
  ├── [GAP][→E2E] same explicit state path everywhere           ├── [GAP][→E2E] 320/375/768/1280 complete path
  ├── [GAP][→E2E] crash/timeout/native WAL reconcile            ├── [GAP][→E2E] 200%/large font/forced-colors
  └── [GAP][→E2E] old profile stays active on failure           └── [GAP][→E2E] live dedupe and focus restoration

LLM integration: no new prompt/template/tool contract in this plan; no eval suite added.

COVERAGE: 2/17 paths tested (12%) | Code paths: 2/9 (22%) | User flows: 0/8 (0%)
QUALITY: ★★:2 | GAPS: 15 (10 E2E, 0 eval)
```

Legend: ★★★ behavior + edge + error | ★★ happy path | ★ smoke check | [→E2E] integration/system evidence required | [→EVAL] LLM quality evaluation required. Existing tests shown above are current source coverage only; this review does not promote them to release PASS.

### Decision ledger

#### R13: freshness schema compatibility

Finding: ENG-R13, P1, confidence 9/10, plan:1008-1010 and backend/contracts/analytics_first_purchase_cockpit.py:137-147.
Plan baseline: D9 approved service-owned `freshness_state`, `save_eligible` and `save_ineligible_reason`; existing cockpit v1 still exposes `freshness: Literal["PINNED"]`.
Runtime evidence: current v1 success and unavailable cards accept only `PINNED`; first-purchase receipt codec is v1 and has no freshness envelope.
Comparison grid:

| Choice | Schema meaning | Compatibility work | Save safety |
|---|---|---|---|
| A | Add a versioned first-purchase result/provenance envelope carrying freshness state and eligibility; keep cockpit v1 unchanged behind an adapter | T3 generated models/types, decoder, migration/negative tests | Fail closed on unavailable/old freshness; only envelope `save_eligible=true` can save |
| B | Keep v1 `freshness=PINNED` and map freshness only in UI/local state | Smallest code diff, but two freshness sources and old consumers cannot see server eligibility | Unsafe unless every server save rechecks a separate unversioned field; rejected by default |
| C | Defer freshness to post-gate and keep D9 text as documentation only | No schema work now | Leaves stale/expired results indistinguishable and blocks the approved save boundary |

Question D1 — freshness schema compatibility
Project/branch/task: `main` / `docs/plans/shinemage-plugin-platform-split.md` / Eng Review Rerun 3.
ELI10: The plan now says a result can be fresh, stale, expired or unknown, but the current API only says `PINNED`. If we do not give the new meaning its own versioned envelope, old screens may save an expired result or new screens may silently ignore the server’s decision.
Stakes if we pick wrong: A local UI-only mapping can make the screen look safe while the save endpoint still accepts data under the old contract, breaking rollback and cross-version compatibility.
Recommendation: A because a versioned service-owned envelope keeps one source of truth and lets old cockpit consumers remain behind an explicit adapter.
Completeness: A=10/10, B=7/10, C=3/10.
Options:
A) Versioned freshness/provenance envelope (recommended) — adds the fields to the public first-purchase contract, generated types and decoder; keeps v1 adapter behavior explicit and makes server save fail closed when freshness is unavailable.
B) UI/local freshness mapping — preserves the v1 field and calculates or carries the extra status outside the contract; it is quicker but leaves two sources of truth and requires a separate unversioned save check.
C) Defer freshness — keeps current v1 behavior and postpones the approved freshness boundary; no stale result is saved by this new feature, but D9 remains unresolved and the candidate cannot claim the new contract.
State: approved
Actual answer: A — 用户于 2026-10-02 回复“按照推荐”，对应本轮唯一待答的 D1 推荐选项。
Accepted scope: T3/T14 使用版本化、服务端拥有的 first-purchase result/provenance envelope，包含 freshness、save eligibility 和原因；同步生成类型、严格 decoder、显式 v1 adapter 与兼容负测。cockpit v1 的 PINNED 保持快照语义；新保存缺少可核验 freshness 时服务端拒绝。本轮只修订计划，不授权业务代码或发布。
History: D9 was approved in the design review; D1 resolves only its schema/version placement after the current v1 source was verified. The intermediate “开始” was not recorded as a selector; the later “按照推荐” explicitly resolves A.

#### D2: measurable heartbeat/timeout/reconcile contract

Finding: **PERF-ENG-002, P1, confidence 8/10**. The approved D8 contract names heartbeat, timeout, elapsed, last-updated and reconcile, but the current plan did not assign units, an owner, a maximum age before `EXECUTION_UNKNOWN`, retry/backoff limits or an alert threshold.

Comparison grid:

| Choice | Contract shape | Operational effect |
|---|---|---|
| A | Freeze one versioned config/receipt with duration units, owner, heartbeat, timeout, reconcile interval, maximum age, retry/backoff cap and alert threshold; T10/T17 fill measured values | One clock across UI, service, host and receipt; UNKNOWN is bounded and actionable |
| B | Let each implementation choose defaults | Fast initial coding, but creates multiple clocks and ambiguous recovery |
| C | Defer the timing contract until after the first release | No immediate schema work, but long-running and UNKNOWN behavior stays unbounded |

Question D2 — timing and operability contract
Project/branch/task: `main` / `docs/plans/shinemage-plugin-platform-split.md` / Eng Review Rerun 3.
ELI10: a timer is part of the result, not a decoration. If every layer picks a different timeout, one layer can say “still running” while another says “unknown”, and no operator knows when to reconcile or alert.
Recommendation: **A**, because it freezes the shared fields and ownership without inventing production numbers; synthetic and host runs provide the measured values.
State: **approved**.
Actual answer: **A — 冻结统一可测量合同（推荐）**, selected by the user on 2026-10-02 with “按照推荐进行”.
Accepted scope: T7 owns a versioned timing/operability config and receipt fields with explicit units and owner; T10/T14/T17 consume the same values; maximum age transitions to `EXECUTION_UNKNOWN`, retry/backoff is bounded, and the alert threshold is measurable. Concrete numeric values remain `NOT_RUN` until synthetic/host baselines are collected. This review does not authorize production tuning or host actions.

#### D3: external scope challenge and evidence-first sequencing

Finding: the completed Claude Code review recommended replacing the current first slice with only a host lifecycle spike plus a leaf package, and deferring D15, the CLI, canary, RACI and physical multi-repository work. That recommendation conflicts with the already approved D14-B workspace slice and D15 native first-purchase path, but it correctly identifies T17 host behavior, pack independence and service-save rollback as prerequisites whose evidence is still unavailable.

Decision: **C — 先做证据闸门再决定**; the user selected C on 2026-10-02. The plan keeps the approved feature scope and long-term repository direction, but changes the execution order:

```text
G0 evidence gate (before D15 implementation)
  ├─ T17: pinned DSH 0.1.7-rc.2 load/unload/restart/crash/timeout/WAL evidence
  ├─ T15/T21: one no-business leaf package, controlled pack/tarball, clean install and digest
  ├─ T13/T21: existing command ownership and explicit state-path inventory
  └─ T3/T7/T14: service save/rollback matrix with candidate/correlation/idempotency identity
          │
          ├─ GO: all four lanes have bounded PASS/BLOCKED evidence → continue D15/T9/T14 canary path
          └─ NO-GO: host or save boundary unsupported → keep native fallback, defer affected slice and record the exact trigger
```

G0 is a sequencing gate, not a new product scope and not permission to publish or touch Hangzhou. It may narrow the first candidate only after evidence shows the current D15 contract cannot be made safe.

#### D4: durable save boundary

Finding: the external review correctly identified that profile rollback cannot erase or implicitly roll back a service-side saved analysis. A lost save receipt, replayed action or profile change can otherwise produce duplicate or orphaned durable state.

Decision: **C — 由 G0 证据决定**; the user selected C on 2026-10-02. The approved D15 save target stays in the plan, but the first candidate has two explicit gates:

```text
query result + provenance
        │
        ├─ always eligible for inspect/reconcile when receipt is valid
        └─ save path only when G0 proves candidate_digest + correlation_id
           + idempotency_key + durable_state_key + forward-fix/replay matrix
                 │
                 ├─ PASS → SUCCESS_UNSAVED → idempotent save → SAVED
                 └─ BLOCKED → visible save disabled/reason; result remains inspectable
```

The plan must never describe profile rollback as data rollback. If the matrix is not proven, the candidate stops at a visible, auditable result and records save as post-gate; it does not silently drop the API or fake a successful save.

#### D5: command ownership and `pnpm dsh`

Finding: the external review noted that the draft names a broad `pnpm dsh doctor/test/verify/preflight/plugin candidate` product while the repository currently owns those behaviors in separate scripts. A new command must not become a second release state machine.

Decision: **A — 薄适配现有脚本**; the user selected A on 2026-10-02. The command contract is now:

- `pnpm dsh` validates arguments, prints stage boundaries and points to the existing owner for each action.
- `readiness`, `release`, `receive`, `verify`, `reconcile`, `status`, `resume` and `rollback` share the explicit state path, profile manifest and artifact identity already owned by the release control plane.
- `plugin candidate` is a post-G0 adapter over profile selection, pack, digest, contract verification and synthetic canary; it is not a new journal or promotion implementation.
- Help text names network, filesystem and host side effects; no implicit upload, restart, route change or data access is added.

This is an implementation boundary, not a claim that every subcommand already exists. Unavailable owners remain P1 implementation work and cannot be hidden behind a green CLI wrapper.

#### D6: plugin-kit ownership

Finding: a full kit containing DSH lifecycle, business schemas, fixtures and release orchestration would re-create the coupling that the split is meant to remove.

Decision: **A — 窄 kit，只做开发期校验**; the user selected A on 2026-10-02. The kit may own stateless build/invariant/peer/manifest/pack checks and their versioned CLI helpers. It may consume generated contract artifacts and pinned input digests, but it does not generate or own CRM/knowledge/query schemas, load DSH, own profile/WAL/session state or implement activation/reconcile. Each plugin keeps its own runtime and domain release cadence.

#### D7: canary, supply-chain and RACI depth

Finding: the external review proposed deferring full canary, supply-chain and responsibility tooling. The user chose to retain the complete approved scope.

Decision: **A — 首期完整保留**; the user selected A on 2026-10-02. The plan therefore keeps immutable pack identity, allowlist/exports/peer/invariant checks, signature/SBOM/CVE gates, isolated synthetic canary, side-by-side/atomic rollback evidence, gray-window hooks and the full RACI/backup runbook. G0 still runs before D15 implementation, but it is a feasibility gate for this scope, not permission to remove it. If T17 proves a capability impossible on DSH 0.1.7-rc.2, the plan records the exact blocked contract and the conservative native/host-restart fallback; it does not claim a weaker proof is equivalent.

#### D8: readiness summary/help follow-up

What: add a final multi-failure summary and Quickstart/reference anchors to `readiness` and `doctor --release`, while preserving the existing per-check remedy, exit code and fail-closed gate.
Why: current checks expose accurate individual codes, but a maintainer must manually combine several failures and find the matching documentation path.
Pros: shortens first diagnosis without creating a new state source, network action or installer; keeps the command useful for both personal and future plugin maintainers.
Cons: adds a small documentation/CLI maintenance item and depends on D5 command ownership plus T22's current links.
Context: this is a P2 DX follow-up, not a release blocker and not a new control plane.
Depends on / blocked by: D5 owner mapping, T7 redaction contract and T22 README/Quickstart alignment.

Decision: **A — 加入 `TODOS.md`**; the user selected A on 2026-10-02. It is recorded as `DX8 / T23` in `docs/hackathon/TODOS.md`; this review does not implement it.

### Review preparation findings not requiring a new choice

- `ENG-R14`, `ENG-R15` and `TEST-ENG-003` carry already approved D3/D5/D8/D9/D13/D14 behavior into the existing T3/T9/T14/T17/T21 owners; no separate scope or UI choice is created.
- D2-A is now approved and maps to the existing T7/T10/T14/T17 owners; no new task ID is created and no production numeric value is invented in this review.
- The first-slice scope stays 0.1.7-rc.2 and synthetic-only. DSH 0.2.0, physical multi-repository extraction, catalog and Hangzhou operations remain post-gate.
- D3-C is approved: G0 evidence comes before D15 implementation; the long-term multi-repository goal stays recorded and no scope is silently cut.
- D4-C is approved: durable save remains a target, but entry into the first candidate is conditional on the G0 service-state replay/forward-fix matrix; otherwise only inspectable results ship in the candidate.
- D5-A is approved: `pnpm dsh` is a thin adapter over existing owners, with one state path and no second release state machine; plugin candidate remains post-G0 implementation work.
- D6-A is approved: plugin-kit is stateless development tooling only; runtime, domain schemas, DSH lifecycle and profile state stay with their existing owners.
- D7-A is approved by the user: full canary, supply-chain, rollback, gray-window and RACI evidence remains in the approved scope; G0 is a sequence gate, not a scope cut.
- D8-A is approved: T23 is now `DX8` in `docs/hackathon/TODOS.md`; it is a P2 follow-up and does not block G0 or the first candidate.

### Eng Outside Voice / coverage

2026-10-02 外部 `claude-code` 复核已完成，provider 状态为 `completed`，结论为 **reject-and-rewrite**。输入只包含当前计划正文前 30KB 和已冻结决策，正文在 30KB 处截断；外部 reviewer 没有读取仓库、运行测试、修改文件、访问真实 DSH/杭州或业务数据。完整原文保存在 `/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/outside-eng-review-rerun3-20261002.md`。

| 外部意见 | 当前处置 | 归属 |
|---|---|---|
| A-stack 把个人项目变成未配备维护者的控制面 | 不直接采纳；D3-C 先做 G0 宿主/pack/state/save 证据，再由 stop/go 决定是否收窄 | D3 / T17 / T15 / T21 |
| D15 横跨 host、插件、服务和 durable save，回退不能回滚数据 | 已采纳风险；D4-C 要求 service-state forward-fix、candidate/correlation/idempotency 和 replay 矩阵，证据不足则保存后置 | D4 / T3 / T7 / T14 |
| workbench pack 仍不能证明独立发布 | 保留为 G0 必过；T15/T21 必须 clean tarball、无 workspace/file link、稳定身份和输入 digest | T15 / T21 |
| T17 生命周期、CLI owner、0.2.0 sequencing 依赖未先证实 | T17 先行；D5-A 将 `pnpm dsh` 限为薄适配，0.2.0 仍 advisory | T2 / T17 / T20 / T21 |
| plugin-kit 会重新绑定所有插件 | 已采纳边界；D6-A 只允许无业务、无运行时的 build/invariant/peer/manifest 校验 | T15 / T21 |
| EXT-008 原子 canary/rollback 与 T17 条件冲突 | 不把条件证据写成能力；D7-A 保留完整目标，但 unsupported 分支必须进入 native/host-restart fallback | T4 / T6 / T17 |
| 完整签名/SBOM/CVE、灰度和 RACI 对个人维护者过重 | 用户选择 D7-A，保留完整首期范围；G0 只决定可行性，不静默删除安全和回退目标 | T5 / T6 / T18 / T19 |
| 新 `pnpm dsh` 产品和 readiness 摘要 owner 不清 | D5-A 建立 owner 映射；D8-A 将摘要/帮助链接加入 DX8/T23 follow-up | T11 / T21 / T23 |

外部 reviewer 的“只做 T17 + 无业务叶子包”的建议未直接覆盖已批准的长期目标；本计划采用证据优先的折中：先证明基础边界，再决定 D15 durable save 和完整候选能力是否可安全进入首个 candidate。外部意见不提供任何实现通过或发布授权。

### Test Plan and task artifacts

- QA Test Plan：`/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/root-main-eng-review-test-plan-20261002-165115.md`。
- Eng task JSONL：`/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/tasks-eng-review-20261002-165115.jsonl`，本轮没有新任务 ID，文件为空表示已运行且全部发现映射到既有 T3/T7/T9/T13/T14/T15/T17/T21/T22/T23。
- Design task JSONL：历史设计复核任务账本仍按原路径保存；本轮不重复创建 UI 任务。

### NOT in scope

- 本轮不实现 T3/T4/T5/T6/T7/T9/T13/T14/T15/T17/T18/T19/T20/T21/T22/T23，不改产品代码或 DSH 上游。
- 不启动服务、真实 DSH、真实 DeepSeek、Chrome/读屏设备、杭州 Windows/WSL2、Tailscale、Cloudflare 或生产路由。
- 不读取、复制、迁移或修改真实 DuckDB；只规划 synthetic fixture、隔离 profile、WAL 和小型测试库。
- 不创建物理多仓、catalog、GitHub Release、tag、push、merge 或部署；这些仍需独立授权并等待实现证据。
- 不把 DSH 0.2.0-rc.2、真实生产形状、签名/SBOM/CVE 现场信任根或灰窗结果写成首期已通过。

### What already exists

- 版本化 backend contracts、generated workbench decoder、first-purchase native service、SQLite durable save/idempotency 和 synthetic worker fixtures。
- `scripts/release/readiness.mjs`、`preflight.mjs`、`preflight-bundle.mjs`、`scripts/dsh.mjs` 以及 release/receive/verify/reconcile/status/resume/rollback 的现有 owner；D5 只增加薄适配边界。
- profile/release manifest、journal、immutable artifact verifier、side-by-side/rollback 结构和既有 synthetic verification 入口；T13/T15/T17/T21 负责证明它们是否足够。
- D15 native-first UI 合同、状态矩阵、provenance/freshness、ARIA、视口和 HOST_RESTART_REQUIRED 设计合同；T9/T14/T17 仍需真实实现和证据。

### Eng completion summary

| 项目 | 结果 |
|---|---|
| Step 0 Scope Challenge | 复用 D14-B workspace 垂直切片；新增 D3-C G0 证据优先顺序，未静默删范围 |
| Architecture Review | 1 个本轮 P1 合同问题（ENG-R13）；T17 宿主和 journal/native reconcile 两个既有 P0 闸门仍 open |
| Code Quality Review | 2 个 P1（ENG-R14/R15）：取消/保存 reason envelope、receipt version/decoder |
| Test Review | 15 个可执行 gaps；覆盖图已写入本计划，浏览器/宿主证据保持 NOT_RUN |
| Performance Review | 1 个 P1（PERF-ENG-002）；D2-A 已冻结字段/单位/owner，具体数值待 T10/T17 基线 |
| 外部复核 | Claude Code 完成；9 类意见已映射到 D3–D8 与既有 T2/T3/T4/T5/T6/T7/T11/T13/T14/T15/T17/T18/T19/T20/T21/T23 |
| NOT in scope | 已写；无代码、服务、真实数据、远端或发布动作 |
| What already exists | 已写；复用现有 contract/readiness/release/journal/fixture owner |
| TODOS.md updates | 1 项：`DX8 / T23` 已加入 `docs/hackathon/TODOS.md` |
| Failure modes | 2 个条件性关键闸门：T17 host containment、T13/T17 journal↔native reconcile；均未宣称通过 |
| Unresolved decisions | 0 个本轮未答的选择；D1–D8 均已记录实际答案，实施证据仍 open |
| Outside voice | `claude-code`, completed, issues found, 原文和边界已记录 |
| Parallelization | 4 条证据 lane；3 条可并行读取/fixture 准备，profile/journal/activation 1 条顺序 lane |
| Lake Score | 2/2 = 10/10 answered coverage choices（D1、D2）；D3–D8 为 kind choices，不计分 |

### Eng approval readiness

Approval readiness: **PASS for this review's decisions** — D1-A freshness envelope、D2-A timing contract、D3-C G0 sequencing、D4-C durable-save gate、D5-A thin CLI adapter、D6-A narrow kit、D7-A full canary/supply-chain/RACI scope、D8-A T23 follow-up 均有用户实际答案；D14/D15 和先前 CEO/Design/DX decisions 按原账本复用。该 PASS 只说明选择记录完整，不关闭 T17/T13/T15/T21 或任何 NOT_RUN 证据，也不授权实现、提交、发布、远端切换或部署。

### Suppressed findings

- DSH 0.1.7-rc.2 的精确 unload 语义仍没有本仓可复核证据，继续由 T17 以隔离 host fixture 证明；不把外部 reviewer 的推断当作运行事实。
- 外部 reviewer 因计划输入截断，关于 30KB 之后的段落只能作为风险提示，不能单独推翻已写入的 T3/T9/T14/T17 合同；所有会改变范围的意见都已通过 D3–D7 单独决策。

外部复核已写入 Eng Outside Voice / coverage。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/autoplan` | Scope, product direction and long-term plugin-platform architecture | 1 | ISSUES OPEN | 20 proposals, 20 accepted; six historical unresolved items remain in the prior ledger |
| Outside Review | `codex-plan-review` via Claude Code | Independent second opinion for Eng rerun 3 | 1 current | ISSUES FOUND | `reject-and-rewrite`; scope, D15 save, kit, CLI and sequencing risks mapped to D3–D8 |
| Eng Review | `/plan-eng-review` | Architecture, code boundaries, tests, performance and rollback | 4 | ISSUES OPEN | 5 issues, 2 critical gaps; D1–D8 decisions closed, implementation evidence open |
| Design Review | `/plan-design-review` | UI/native-first and DESIGN.md alignment | 2 | ISSUES OPEN | score 6.5/10 → 8.0/10, 14 decisions; browser/host evidence open |
| DX Review | `/plan-devex-review` | CLI + plugin onboarding, candidate flow and recovery UX | 1 | ISSUES OPEN | score 5.3/10 → 6.6/10, TTHW NOT_MEASURED → 12–25 minute target; DX8/T23 now accepted |

**OUTSIDE COVERAGE:** Current Eng rerun had completed `claude-code` coverage on 2026-10-02. The provider saw the first 30KB of the plan and the accepted decisions, returned `reject-and-rewrite`, and did not read or mutate the repository, run tests, access DSH/杭州, or touch production. The full response is preserved at `/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/outside-eng-review-rerun3-20261002.md`. Prior Design outside coverage remains recorded separately; no unavailable coverage was promoted to PASS.

**CROSS-MODEL:** Local Eng review and Claude Code agree that T17 host lifecycle, packed artifact identity, explicit state ownership, service-save replay and command ownership are real gates. They disagree on immediate scope: external voice recommends cutting the first slice to T17 plus a leaf package, while the local plan retains the approved D15/long-term scope behind D3 G0 and D4 save evidence. The user selected D3-C, D4-C, D5-A, D6-A, D7-A and D8-A; agreement supports the evidence gates, not the unexecuted implementation.

**VERDICT:** Eng Review is **ISSUES OPEN / revise-and-freeze**. The plan is ready to implement only behind the recorded G0 sequence: T17 host/process evidence, T15/T21 clean pack boundary, T13 explicit journal/profile reconciliation and T3/T7/T14 service-save replay/forward-fix. D1–D8 choices and DX8/T23 follow-up are recorded with actual user answers. No code, test suite, browser, host, real DuckDB, release, deployment, commit, push or merge was performed in this review; no release readiness is implied.

**EVIDENCE:** The plan and follow-up read-back shows D1–D8, outside dispositions, QA Test Plan and empty Eng task JSONL paths. `git diff --check` passed after this terminal report was appended; the read-back confirms exactly one terminal report heading and that this report is the last level-two section. The QA artifact is `/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/root-main-eng-review-test-plan-20261002-165115.md`; the task artifact is `/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/tasks-eng-review-20261002-165115.jsonl`.

**UNRESOLVED DECISIONS:**
- Current Eng Review: none; D1–D8 and DX8/T23 have explicit answers. Remaining T17/T13/T15/T21/T9/T14 items are implementation or evidence gates, not unanswered choices.
- 历史评审曾计 CEO 6、Design 5、DX 1；这不是 12 个当前待答题。D3–D8 已关闭本轮选择，剩余是 T17 宿主、T3 保存、T15 包边界、T5/T19 信任链、T9/T14 UI 和 T10/T12 测量等实施证据。
