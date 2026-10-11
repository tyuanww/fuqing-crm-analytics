# 项目状态（Project Status）
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 当前本地交付（2026-10-11，分组提交收口）

主仓 `codex/shinemage-abc-local-candidate` 已从 `5390667c` 分组交付本轮改动：104 个代码／配置／测试路径形成 12 笔提交，2 份边界清单形成 1 笔提交；94 份证据由 `39774244` 单独提交。本次说明同步另作 1 笔 `docs`，共 15 笔本地提交。代码与边界 HEAD 为 `d36c567e`；最终说明的 SHA 以 `git log -1` 为准，不把本地 HEAD 当作远端主线。提交目的、当前字节审查及原始验证见[本地交付索引](docs/hackathon/evidence/shinemage-main-local-commit-closeout-20261011.md)及[机器记录](docs/hackathon/evidence/shinemage-main-local-commit-closeout-20261011-validation.json)。

当前装配与作者证据锁绑定 Workbench `6c5adc9f`／正式回执 `0af61dab…`、CRM `c4b1c91e`／`4663cce0…`；九包和两份原 profile 准备已实际通过。默认公共合同、installed-kit、领域与 Workbench 作者覆盖、release 包装配和路径选择均已提交；它们分别消费固定包、固定公开合同或作者 CI 证据。主仓仍维护 backend／平台合同、profile、组合消费者、保留源码守卫和静态边界扫描，旧 `dsh-plugins/` 不删；另两组私有数值／查询断言仍读取旧 Workbench。因此主仓还不是只有 DSH 的仓库。

OCR delegate 的选档与规则由工具执行，主 Agent 审查每组实际差异；默认排除文件人工补查，外部模型未运行。受影响检查逐组通过，合同阶段另实际执行 17 个生成器／测试组；未将各组计数相加，也未将此前完整 B0 改标为最终 15 笔提交的通过。本轮没有新 hosted CI、candidate/journal、同对象宿主／目标／真实业务验收或远端 Git 写入。原有 92 份历史证据同字节保留，失败记录不改写。

VERSION 仍为 `0.20.0.0`，DSH 固定 `0.1.7-rc.2`／`477b4f42`。CRM／Knowledge 的精确 Cordis peer `4.0.2` 与固定输入实际 `4.0.4` 仍待校准，构建或公共消费通过不关闭兼容门禁；D/E 五仓仍无独立 tsc。SDK 分发按适用门禁 BLOCKED，产品 PARTIAL，release_ready=false。任务外 `security-audit-skill/` 保留且不纳入提交，不能把本轮范围干净写成整仓无未提交内容。


## 杭州生产恢复与 UI 热补丁（2026-10-09）

杭州 current 仍为 VERSION 0.20.0.0；本地 A/B/C 候选未部署。生产恢复、品牌与知识库入口修复的范围、回退和未完成真实模型验收见[现场记录](docs/operating/hangzhou-production-hotfix-20261009.md)。不得把该现场记录当作本次插件候选验收。

## 当前快照（2026-10-11，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

以下为本地分组提交前的迁移时点记录；其中“未提交”“两锁未应用”和历史 B0／CI 结论只对应所引用的当次输入。当前交付以上方“当前本地交付”为准。

本轮三路径已完成 OCR delegate 审查、修复并按授权本地应用：Workbench `6c5adc9f` / 正式回执 `0af61dab…`、CRM `c4b1c91e` / `4663cce0…` 及同来源 Workbench 作者 CI 已绑定；另七包与两 profile 不变。主仓新增 canonical 离线 eval 入口，修复空用例集也会通过的问题。应用后 reader 13 PASS，原三组分别 1/1/3 PASS，9 包/2 profile 准备及 CI 绑定 exit 0；新入口 1 个 Node 测试内执行 30/30 合成用例，不累计为 31 项。OCR 3/3，发现的 1 处 Medium 已关闭；后两组仍读取旧 Workbench，原 peer `4.0.2` 未改。代码/文档未提交，本轮完整 B0、新 CI、candidate/journal 和真实业务未执行。见[本轮审查与应用](docs/hackathon/evidence/shinemage-three-path-main-application-20261011.md)。下方“两锁未应用”保留为本轮之前的准备时点；产品 PARTIAL，release_ready=false。

主仓公共合同入口已按授权应用 12 路径，并修复重复终止进程组造成的错误覆盖；新入口隔离完整 B0 r2 exit 0：Python 855 PASS / 41 subtests PASS、23 warnings 保留，Node 27 组各自 0 FAIL / 9 次跳过。原 15 个生成器和 C0 hash 未改，主仓实际字节的守卫 28、路径 pytest 34、槽位 4、主题负测／漂移 2 分别通过，OCR 可审 11/11 与排除测试人工 1/1 已审，无开放发现。旧失败保留，主仓未提交，新 hosted CI 和当前组合准入未执行。见[本轮应用与实测](docs/hackathon/evidence/shinemage-public-contract-main-cutover-20261011.md)。

最新作者 Workbench 6c5adc9f、CRM c4b1c91e 的正式 pack 已在隔离目录生成、读取并逐成员核对；回执分别为 0af61dab…、4663cce0…。主仓运行包／作者证据锁仍是原绑定，9 包／2 profile 的两锁前移提案已经验证但未应用；不继承旧 candidate/journal 或宿主验收。见[最新来源正式包及下一提案](docs/hackathon/evidence/shinemage-current-author-formal-packs-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

最新来源正式包的原公共组合已实际运行：9 PASS / 0 FAIL / 0 SKIP，18 个指定来源负对照 EPERM，运行前后 198 个受保护文件未变、自有进程组已退出；合成 HTTP 和官方 resolver 层级，不代表严格 peer／完整宿主或正式准入。两锁提案 OCR delegate 2/2 已审，无开放发现，主仓 apply --check exit 0，但仍未应用。主仓 PR #119 的已有 B0 是 SKIPPED，当前 dirty CI 未执行；见[本轮组合与两锁审查](docs/hackathon/evidence/shinemage-latest-formal-combination-20261011.md)。

此前合同入口隔离提案准备时点（保留原记录）：

主仓公共合同消费者已形成 12 路径隔离提案，尚未应用：固定三仓真实 CI 的 31 份材料，保留原 15 个生成器与 C0 hash；原生成器 15 次 exit 0，槽位 4 项、主题负测／漂移 2 项、守卫 28 项、路径 pytest 34 项分别通过，34 个指定来源负对照 EPERM。OCR 可审 11/11 与排除测试人工 1/1 已审，失败保留；提案对当前 dirty 基线 apply --check 通过。新主仓入口完整 B0／CI、candidate 与业务准入仍 NOT_RUN，旧副本及保留源码守卫不删。见[提案与真实日志](docs/hackathon/evidence/shinemage-public-contract-main-cutover-proposal-20261011.md)。

此前合同作者交付时点（保留原记录）：

三个作者仓的合同导出已提交推送，当前真实 Ubuntu PR CI 和 31 份工件来源均核对通过；Workbench/CRM 的 CI 字节码污染由单路径修复关闭，失败保留。原 15 个生成器在旧插件资料拒读下 15/15 exit 0，原槽位 4 项与主题负测/漂移 2 项各自通过，私有行为保留在作者检查。主仓新合同入口和锁尚未切换，旧副本与静态边界继续保留；不继承正式包、candidate/journal 或真实业务准入，PARTIAL / SDK 分发 BLOCKED / release_ready=false。 见[合同材料的实际作者交付](docs/hackathon/evidence/shinemage-generated-contracts-owner-delivery-20261011.md)。

主仓领域默认入口已按授权应用完整 r2（18 路径）：以领域作者 `e78e040e` / 真实 Ubuntu PR CI `38121126913` 核对来源和实际覆盖，保留三份显式 legacy，不再在此阶段重建领域源码或执行私有几何。已应用 r2 的隔离完整 B0 r4 exit 0，Python 855 PASS / 41 subtests PASS（23 warnings 保留）；Node 26 组各自无失败，9 次跳过保留原因。前三轮缺输入与预检 PATH 失败原样保留；随后仅清理两份文件末尾空行，语法和差异检查通过。主仓还有 15 个源码合同生成入口、保留合同/缺输入守卫及静态边界扫描，旧副本不删；新主仓 CI、当前候选/真实业务未执行，代码文档未提交，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[本轮应用与完整验证](docs/hackathon/evidence/shinemage-board-components-main-cutover-20261011.md)。

此前 Workbench 几何对接时点（保留原记录）：

Workbench 私有几何的本地对接已完成：干净来源 `e9223289` 的真实 CI 运行文件生成新正式回执 `871fd3bb…`，tarball 仍为同字节 `e41df9f5…`；两份锁已同时绑定来源、正式包和实际 CI（155 文件 / 1086 PASS，既有远端结果不重跑、不累计）。主仓三路径已应用，几何阶段核对作者 CI 精确覆盖，不再导入该私有源码。应用后 reader 13 项、几何 1 项各自通过；九包 CLI 准备及身份绑定 exit 0，20 项源码负对照 EPERM，漏几何的重封存夹具按预期拒绝。另八包、profile、旧包/candidate/journal 均未改，主仓未提交；本轮完整 B0、主仓 CI 和新组合准入未执行。见[当前正式绑定与实测](docs/hackathon/evidence/shinemage-workbench-geometry-main-bind-20261011.md)，[此前 CI 交付](docs/hackathon/evidence/shinemage-workbench-geometry-ci-delivery-20261011.md)保留时点。


上一轮领域作者交付与迁移提案准备时点（保留原记录）：

领域作者的五路径已提交为 `e78e040e` 并推送至现有 PR #1；当前 Ubuntu PR CI `38121126913` SUCCESS。新增守卫 5、几何 28、producer/输入 6、准备守卫 4 分别通过，不累计本地或 push CI。实际 artifact 同时包含干净来源 30 文件、真实 TAP/执行回执与原封存 `22245ab9…`，下载 ZIP/API digest 及所有成员均核对；构建包 `66d53381…` 是不同外层对象。主仓领域入口与锁未切换，无独立 tsc，PR 未合并/发布/部署。见[当前作者 CI 归属交付](docs/hackathon/evidence/shinemage-board-components-ci-ownership-delivery-20261011.md)；[隔离提案](docs/hackathon/evidence/shinemage-board-components-ci-ownership-proposal-20261011.md)保留准备时点。 下一步已形成[18 路径完整隔离提案](docs/hackathon/evidence/shinemage-board-components-main-cutover-proposal-20261011.md)：公开消费 8 项、证据守卫 15 项、保留合同 2 项和路径参数 3 项各自通过，21 个指定来源负对照 EPERM；OCR 可审 17/17 与排除测试的人工审查完成。r2 补丁对当前主仓 --check 通过，尚未应用，完整 B0/新主仓 CI 未执行；此前四路径读取提案保留准备时点，不叠加。

board-components 已按授权建成[私有远程领域仓](https://github.com/tyuanww/shinemage-board-components)：main 为 `3855db80`，两份文档提交 `d5aacdb4` 已推送至 [PR #1](https://github.com/tyuanww/shinemage-board-components/pull/1)。本次 Ubuntu PR CI `38119670295` SUCCESS，几何 28、producer/输入 6、准备守卫 4 分别通过；下载包为 1951 字节 `66d53381…`，与原 1955 字节 `22245ab9…` 的五个成员同字节，外层归档不能互换。无独立 tsc，未合并/发布/部署，主仓领域锁与生产者选择保持。见[远端 CI 原始绑定](docs/hackathon/evidence/shinemage-board-components-remote-ci-20261011.md)。

主仓旧领域生产者的输出文件符号链接防覆盖已单独修复，四项自有负对照拒绝且标记保持；受影响 `package-inputs` 入口 13 PASS / 0 FAIL / 0 SKIP，增量 OCR delegate 2/2 已审，无发现。两源码增量仍未提交，没有新完整 B0/主仓 CI/组合准入；见[本地修复证据](docs/hackathon/evidence/shinemage-board-components-main-output-guard-20261011.md)。PARTIAL / SDK 分发 BLOCKED / release_ready=false。

上一轮领域本地 Git/clone 交付时点（保留原记录）：

board-components 领域作者仓已按授权完成首次提交 `3855db80`（28 路径）及该提交的真实 `--no-local` clone。暂存差异 OCR delegate 19/19 已审；源码与网络拒绝下 producer/输入 6 项、几何 28 项、准备守卫 4 项分别通过，17 个负对照均 EPERM；1955 字节包仍与 `22245ab9…` 同字节。作者仓干净、无 remote，远端 CI 和主仓领域生产者切换未执行；无独立 tsc，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[本地 Git 与 clone 交付](docs/hackathon/evidence/shinemage-board-components-owner-git-delivery-20261011.md)。

上一轮领域提案准备时点（保留原记录）：

既有计划中的 board-components 领域 owner 也已形成本地可审提案：原几何 28 项、producer/输入 5 项和最终准备守卫 4 项分别通过；拒主仓、上游/build-tools、九个作者源码后生成的 1955 字节领域包与 `22245ab9…` 同字节。不需要 DSH 构建；当前没有 Git/真实 clone/远端 CI，无独立 tsc，主仓生产者保持。见[领域提案](docs/hackathon/evidence/shinemage-board-components-owner-proposal-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

历史四插件隔离也已迁出默认源码构建：shine-brand/query、CRM 和 Knowledge 现在分别接收各自固定正式归档，不再临时复制源码、构建或造 Git 来源。源码、作者仓、上游和 build-tools 拒读条件下 4 PASS / 0 FAIL / 0 SKIP，20 项负对照均 EPERM；既有公共行为消费者另跑 29 PASS / 0 FAIL / 0 SKIP，使用可读固定 SDK 和合成 localhost HTTP，不累计，也不关闭原 Cordis 严格安装冲突。六项坏输入及 pipeline 目录复用拒绝保留日志。两份原源码夹具都留作显式 legacy；领域生产者、私有几何投影及剩余源码合同仍开放，旧副本不删。本轮完整 B0、新 CI、当前 candidate/journal 与真实业务、发布均未执行，主仓改动尚未提交；见[当前固定包隔离](docs/hackathon/evidence/shinemage-fixed-pack-isolation-20261011.md)。

上一轮执行记录（installed-kit 默认迁移；历史隔离当时尚未关闭）：

installed-kit 的默认十源码构建已迁出：当前入口实际打包并离线安装开发 kit，严格编译一份自有合成消费者，再从九个固定正式包核对 kit 声明和三份领域锁；九份主仓业务源码、九个原作者仓拒读条件下，同次 13 PASS / 0 FAIL / 0 SKIP，18 个负对照均 EPERM。相邻合同另跑 24 PASS，五项坏输入拒绝及 pipeline 结果目录复用拒绝符合预期，数字不相加。原十源码函数体逐字节保留为显式 legacy 入口，本轮未运行。主仓仍有领域包生产者、历史四插件隔离和若干源码合同入口，旧副本暂不删除；本轮完整 B0、新 CI、当前 candidate/服务/目标/browser/真实业务及发布均未执行。改动尚未提交，PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[当前 kit 归属迁移](docs/hackathon/evidence/shinemage-installed-kit-pack-ownership-20261011.md)。

上一轮执行记录（正式 preflight 包装配；下列验证只覆盖该轮字节）：

正式 preflight 与 release 的业务插件装配已改为消费独立正式包，不再读取所选主仓插件源码或执行它们的 build。当前七包在九份旧源码、九个作者仓、固定上游和 build-tools 拒读条件下装配与字节核对通过，20 个负对照均 EPERM；release 测试入口 539 PASS，最后工作流修订 41 PASS，路径/runner 检查 82 PASS，分别记账。单独输入锁更新仍选择适用 B0，不自动触发整套 DSH prepare/audit。实际 `preflight --check` 接受七包输入，但整体因 dirty tree 和 runtime bundle 缺失而 BLOCKED；完整 preflight、这一轮新字节的完整 B0、新 CI 和当前 candidate/journal 验收均 NOT_RUN。installed-kit 多插件源码夹具、领域包生产者、历史隔离及旧副本仍待迁移，产品 PARTIAL / SDK 分发 BLOCKED / release_ready=false。见[当前包装配记录](docs/hackathon/evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

上一轮执行记录（Workbench core 归属迁移；其完整 B0 只覆盖当时字节）：

Workbench 作者 head `d038f357` 的四项 CI SUCCESS 已交付；完整 CI 各自为 154 文件 / 1072 PASS。已从该精确来源生成新正式 pack 回执 `9d7f6bf3…`，tarball 仍为同字节 `e41df9f5…`，组合锁前移到 `89e2b2ea…`，其他八包和两份 profile 不变。主仓常规 Workbench core、构建、私有 loader 与 clean rebuild 已改为固定作者证据归属，保留原三组业务合同 1/1/3 和公开包消费者。新完整本地 B0 r3 exit 0：Python 855 PASS / 41 subtests PASS、Node 24 组无失败、9 次 opt-in 跳过；22 条 Python warnings 和 stderr finalization 警告保留。CI 路径/runner/workflow 补查 82 PASS 另记。主仓本轮产品和文档未提交、新 hosted CI 未运行；旧 tarball 宿主证据不重标为新 candidate。installed-kit、历史生产者、formal preflight 源码路径和旧副本仍待迁移。见[当前正式包与归属迁移](docs/hackathon/evidence/shinemage-workbench-core-formal-main-ownership-20261011.md)。

以下接续段保留较早执行时点；其中旧来源、未执行和未提交结论按各自证据对象理解，当前入口与身份以本节最前面的最新记录为准。

精确 Cordis `4.0.4` 的隔离修订普通包现已通过官方 npm 宿主的开启、原生关闭、恢复三进程验证：原生鉴权、合成会话保留、关闭时 CRM 路由 404、恢复后 200 且未连接。新 home/workspace、localhost 沙箱及自有进程清理均核对；旧正式包、原作者仓和 candidate/journal 不变，不能抵扣真实服务/模型或正式准入。见[本轮 npm 宿主证据](docs/hackathon/evidence/shinemage-corrected-npm-host-20261011.md)。

Cordis 精确校准已有可审查提案：两包隔离副本改为 `4.0.4`，严格构建/测试、官方 npm 严格锁解析与实际 `npm ci`、四个普通包入口导入均通过；五份运行 JS 与旧包同字节。三个增量补丁尚未应用，原作者声明和正式包仍为 `4.0.2`，因此原严格安装冲突未关闭。需 owner 授权合同校准、干净新提交/新正式包和输入锁后再接主仓守卫，不能继承旧准入；见[隔离提案证据](docs/hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。

普通严格包解析已确认 Cordis 声明冲突：官方 DSH/dsh-tools `0.1.7-rc.2` 要求 `~4.0.4`，CRM/Knowledge 正式包仍精确声明 `4.0.2`。三个 r2 锁解析案例均 exit 1 / ERESOLVE，逐条核对实际版本和 peer owner；这不是兼容 PASS。此前 linked 官方安装/初始化仍只覆盖原层级。首轮证书失败及包装脚本误读历史日志保留，单独 readback 纠正分类；TLS 未关闭，作者声明与封存包未改。见[严格 peer 证据](docs/hackathon/evidence/shinemage-cordis-strict-peer-20261011.md)。

迁移后的当前本地完整 B0 第 r2 轮 exit 0：Python 855 PASS、41 subtests PASS，23 条警告保留；Node 23 组均 0 FAIL，十次跳过按本次组与原因记账。固定 Node 24.19.0、独立 Python 3.14.4 按 B0 原锁核对 25 包，未改全局环境。首轮因生成边界清单过期失败，原日志保留；按既有生成器同步清单和说明，未改 policy、peer 或运行源码。干净重建/类型检查通过，重建目录已回收，临时包只作 fixture。以下较早阶段的“完整 B0 未跑”不覆盖本轮接续；本轮仍保留 Workbench 源码及历史生产者/隔离阶段，不代表全部源码装配已迁完。新 hosted CI、当前 candidate 正式服务/目标/浏览器/回退和真实业务仍开放，代码/说明未提交。见[当前 B0 回执](docs/hackathon/evidence/shinemage-current-b0-closeout-20261011.md)。

主仓 profile 生成器的五项原测试已移到 `scripts/crm-calibration/profile.test.mjs`，旧 CRM 路径保留兼容转发，默认 B0 使用新入口。在列明插件源码及原作者仓拒读条件下，实际三入口组合 14 PASS / 0 FAIL / 0 SKIP，已含这五项；旧入口另跑同样五项通过，不能累加。五份源码负对照为 EPERM。产品、正式包、candidate/journal、Workbench 待授权的八文件均未改；代码/说明未提交，完整 B0、新 CI 和其余源码阶段仍开放。见[测试归属迁移](docs/hackathon/evidence/shinemage-main-profile-test-ownership-20261011.md)。

默认 B0 的 CRM/Knowledge 两项源码构建已本地改为独立正式包行为消费，原公开断言正文保留；四份私有测试与作者仓同字节并归各自 CI。源码拒读下两包消费同次 11 PASS，包/profile 守卫 67 PASS、原公共组合 9 PASS，分别记账；六项坏输入/防复用及六份源码负对照通过，首次夹具布局失败保留。代码/文档未提交，完整 B0、新 CI、Workbench 源码阶段及正式候选仍开放，未删副本。见[包行为消费迁移](docs/hackathon/evidence/shinemage-crm-knowledge-package-consumers-20261011.md)。

CRM/Knowledge 的固定正式两包进一步完成官方安装、解析器导入和本机宿主/preset 初始化；声明仍是 Cordis `4.0.2`，实际解析 `4.0.4`。宿主接续六项通过，CRM 未连接状态明确返回；linked peer 警告和首次脚本清理错误保留。该结果只关闭本次固定组合的安装/初始化子项，不证明声明正确、实际 `4.0.2` 或全部运行兼容，也不抵扣真实服务/模型、浏览器或 candidate 准入。产品字节、包和 journal 未改，记录未提交；见[宿主兼容补查](docs/hackathon/evidence/shinemage-crm-knowledge-host-compat-20261011.md)。

作者验证归属补齐：Workbench 在四个 loader/skills/视图入口后，再接入 native-board-auth 和 lane-g 两个既有文件，原测试与 helper 未改。隔离 Linux 完整作者入口同次 30 文件、212 PASS / 0 FAIL / 0 SKIP，已包含新两文件的 8 项，边界 5 PASS 另记；严格构建和内容包通过，包与前轮修复后产物同字节。本轮复用前轮 113 包固定输入，不宣称全新 SDK 安装或 hosted CI；正式包/candidate/journal 未变。作者改动未提交，主仓七个旧生产者入口仍保留，待作者仓提交和 CI 交付后再切走重复执行；当前记录见[作者测试补齐](docs/hackathon/evidence/shinemage-workbench-author-tests-closeout-20261011.md)，此前 204 项属于[历史四入口](docs/hackathon/evidence/shinemage-workbench-producer-ownership-20261011.md)。

最新迁移：原生 prompt 的 10 项严格注入检查已消费公开客户端包与实际 Cordis `4.0.4`，源码拒读通过；九入口同次运行 66 PASS / 0 FAIL / 0 SKIP，输入/九 scope 守卫 18 PASS，分别记账。原断言保留，旧失败轮留存，compiled producer 剩七入口，源码构建和完整宿主仍开放；实现未提交。见[原生 prompt 消费记录](docs/hackathon/evidence/shinemage-workbench-native-prompt-pack-20261011.md)。

本轮客户端合同接续：工具卡、取消、保存、首购和资产弹层的运行检查已消费同一正式包，八入口源码拒读实跑 56 PASS / 0 FAIL / 0 SKIP，含前轮 12 项；相关输入回归 105 PASS，保留源码断言 4 PASS，各自记账。八个消费目录防复用通过，原包/candidate/journal 未改。Host、私有视图和其他源码生产者入口仍待迁移，本轮未提交；见[合同包消费记录](docs/hackathon/evidence/shinemage-workbench-consumer-contracts-20261011.md)。

最新客户端迁移：Workbench 的 12 项发布客户端检查已消费固定正式包，原断言保留，在列明源码拒读条件下 12 PASS / 0 FAIL / 0 SKIP；9 项新增输入守卫连同既有回归为 97 PASS，分别记账。原 Host 入口断言仍在源码阶段，原包运行 peer 缺口及默认 B0 的其他源码阶段未关闭。没有新包、candidate 或 journal，代码/证据未提交；见[客户端包消费记录](docs/hackathon/evidence/shinemage-workbench-client-pack-migration-20261011.md)。

最新本地补充：默认 B0 的六个叶子插件常规构建/消费阶段已改为读取独立正式包，品牌行为、能力标记、几何计算和 ESM/require/严格类型消费检查保留。列明源码拒读条件下 20 PASS / 0 FAIL / 0 SKIP，相关输入与既有回归 88 PASS，分别记账；21 个拒读路径的负对照为 EPERM，重复结果根被 EEXIST 拒绝。历史作者输入守卫、源码隔离夹具和 Workbench/CRM/知识源码阶段仍保留待迁移，不宣称默认 B0 已完全脱离源码。包、candidate、journal 未改，代码和证据尚未提交；见[叶子包消费迁移](docs/hackathon/evidence/shinemage-leaf-pack-migration-20261011.md)。

最新接续：主仓已有固定包准备入口及三个 CI 工作流的输入接线，九份既有正式包按来源 SHA、版本、manifest/归档摘要锁定；不复制插件源码到公开主仓。目录与 ZIP 准备、三项环境输入导出及准备后九项公共合同组合已本地通过；54 项包/profile/输入守卫和 189 项 tooling 检查分别通过。远端尚未配置固定 artifact 定位变量及专用读取 secret，未上传本次输入包，也未执行新 hosted CI；完整 B0、正式候选及宿主准入仍开放。见[CI 包输入接续](docs/hackathon/evidence/shinemage-ci-pack-inputs-20261011.md)。

本地检查补齐：ZIP 外部输入校验改为显式异常，普通与 Python `-O` 模式的坏归档均拒绝；最新 54 项守卫通过。前端构建及 223 项单测、release 回归 41 项通过。backend 通过不重叠分组覆盖既有 298 个 synthetic-not-slow 目标，唯一 JUnit 用例为 3223 PASS / 78 SKIP / 0 FAIL；三次环境失败保留，SKIP 不代表真实数据验收。隔离 Python 只按服务既有精确版本与 B0 的 psutil pin 准备，没有修改全局环境或服务清单。以上结果分开记账；完整 B0、依赖审计/Docker smoke 和本批远端 CI 仍未执行，实现/证据未提交。

本轮最新本地结果：CRM／知识与 page tools 的组合验收入口已消费独立正式包，沿用原 profile，在列明业务源码拒读和 localhost 网络条件下，九项公共合同组合通过；实际解析 Cordis `4.0.4`，声明仍为 `4.0.2`。47 项输入/profile/包守卫及 78 项旧夹具兼容回归分别通过，不相加。12 个自有 HTTP 服务已关闭并复查端口；原包、candidate 与 journal 未变。完整宿主、官方安装 peer 兼容和候选准入仍开放，代码/证据未提交。见[固定包组合记录](docs/hackathon/evidence/shinemage-fixed-pack-composition-20261011.md)。

本地接续：当前分支 `codex/shinemage-abc-local-candidate`，HEAD `5390667c`；PR #119 与九个插件 PR #1 仍开放，远端当前提交的适用 CI 成功，尚无本轮合并及 post-merge CI。八个插件作者仓干净，Workbench 另有未提交的运行 peer 修复及构建守卫；九仓均无 GitHub Release。主仓固定包开发入口迁移与 pnpm 选择修复仍未提交。原七包的官方安装和配置生成通过，但原 Workbench 在宿主导入时失败；补齐固定 peer 的隔离诊断通过开启、原生关闭、恢复三个进程阶段及合成会话持久化，不能记为旧正式包或 candidate 验收。修复后的 Workbench 本地 Linux 严格构建及 196 项包测试通过，主仓开发入口 114 项定向回归通过。新独立来源 candidate `591134e8…` 的 journal 仍为 seq 3，仅完成准备和同字节服务工件关联。最新结果见[宿主依赖修复与诊断](docs/hackathon/evidence/shinemage-official-pack-host-closeout-20261011.md)，此前准备阶段见[包输入迁移记录](docs/hackathon/evidence/shinemage-profile-pack-migration-20261011.md)。下表已合 PR #111–#118 的检查不覆盖本批未提交代码；live CLI reload、当前候选服务/目标/浏览器及正式回退仍未关闭。

本轮进一步完成 CRM/知识 profile 的正式包输入迁移：沿用现有 `crm-knowledge-rc2` profile 和独立仓固定提交的两份正式包，在主仓业务源码、原作者仓拒读及禁网条件下生成配置。包、来源和 profile 摘要已记录；正式服务/完整宿主准入及整体 Cordis 兼容仍未关闭，不能抵扣 candidate 准入。新增合同回归 38 PASS、release 定向回归 58 PASS 分别记账；实现和文档仍未提交。见[CRM/知识包输入记录](docs/hackathon/evidence/shinemage-crm-profile-pack-migration-20261011.md)。

| 项 | 状态 |
|---|---|
| Git | PR #111–#118 均已合并；当前远端 `main` 为 `4859d136`，PR #118 是 PR #117 后的主线事实同步。合并后的 `main` CI run `38066459376` 通过；实时主线以远端 `main` 和 GitHub CI 为准。三个已合并候选远程分支已按授权删除，本地旧分支引用和 stale `origin/*` tracking 引用仍单独保留待整理。原集成树的 `security-audit-skill/` 是独立目录，不纳入主仓。详见[最新 post-merge 远端事实](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)和[本次清理证据](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |
| 插件解耦 | 固定 SDK 构建路径要求显式绝对上游、build-tools 和输入包，已移除主仓 .context 回退；shine-brand 独立仓的默认公开编译路径使用自身 npm 锁，不读取上游或 SDK，且不代表严格 SDK 类型检查。CRM/看板/知识与 Workbench 的边界证据保持独立记录。 |
| 独立仓 | 九个插件已有独立私有远程仓；本次复核显示九仓各有一个开放 PR #1、最近 fixed-inputs CI 成功、均无 GitHub Release；`dsh-shine-crowd-action` 另保留较早 full CI 失败。详见[远程仓收口复核](docs/hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。主仓继续维护 DSH 集成合同、profile、组合验证和历史副本，正式物理分仓仍按 stop/go 约束推进。普通 content pack 不等于正式 dsh-plugin-pack/candidate。 |
| 本地验证 | 固定 Node 24、Python 3.14；定向 release/protocol/SDK/map/HTML 与边界检查已通过。推送钩子按路径计划执行适用检查，真实跳过原因保留。 |
| 产品 | PARTIAL；SDK 分发 BLOCKED；release_ready=false。 |
| 真实验收 | 真实 WSL2/terminal/browser、真实模型/业务、生产切换、standalone 页面包和正式分发仍按各自输入保持 NOT_RUN；当前 candidate 的逐项缺口见[正式准入预检](docs/hackathon/evidence/shinemage-formal-admission-preflight-20261010.md)。PR #111 的最终 preflight、B0、全量测试、前端、lint、依赖、合同、Docker smoke 和 merge-gate 均通过；`ground-truth-lint` 按既定条件跳过。 |
| 合并检查 | PR #115、#116、#117、#118 的 `CI`、`merge-gate`（适用时）和各自合并后的 `main` `CI` push workflow 均成功；PR #118 的 `changes`、`test`、`lint`、`merge-gate` 通过，不适用的路径 job 保持 skipped。这只是文档/代码合并检查，不是真实业务、生产或正式分发验收。run ID 见[最新 post-merge 远端事实](docs/hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。 |
| 清理 | 11 个已归档候选源目录及其 worktree 已按授权删除，11 个归档包和 SHA-256 清单保留；三个已合并远程候选分支已删除。T14、RC2、公共 main、SDK/证据归档和 `security-audit-skill/` 保持不动。详见[本次清理证据](docs/hackathon/evidence/shinemage-local-cleanup-20261010.md)。 |

## 本轮施工计划

1. 本轮本地分组提交已交付，当前说明最后提交；先核对任务范围无遗漏、暂存区为空，保留任务外目录，不做整仓清理。
2. 下一步按实际授权推送该 feature 分支并更新对应 PR，依真实路径计划执行新提交的 CI；旧文档 PR 或作者仓 CI 不替代这次主仓检查。
3. PR 审查发现问题时追加聚焦提交并验证；获合并授权后，完成适用 `/qa` 和实际 PR 门禁再合并，不先在本地把 feature 合进 main。
4. peer 校准、当前组合准入、真实业务／WeKnora／模型、SDK 正式分发与独立 DSH 升级按原 stop/go 分别推进，未执行项保持原状态。

### 此前 post-merge 施工记录（保留执行时点）

1. PR #111–#118 已合并到远端 `main`；当前主线为 `4859d136`，PR #118 同步了 PR #117 后的主线事实。三个已合并候选远程分支已完成归档、恢复路径核对和单独授权后的删除；本地分支引用的后续整理仍单独记账。
2. **PR #111 的** preflight、B0、全量测试、前端、lint、依赖和合同检查在最终提交上通过；`ground-truth-lint` 按既定条件跳过。本轮沿用 PR #111 的合并回执，未重跑这些检查；旧失败运行保留为历史，不改写为当前失败。
3. 主仓与九个独立插件仓的职责、单插件更新路径、DSH 升级路径和清理顺序已写入维护手册；面向开发者的逐步操作见[插件更新指南](docs/operating/shinemage-plugin-update.md)。最新插件远程状态、DSH 升级候选和 SDK 门禁分别见[远程仓复核](docs/hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)、[DSH 升级盘查](docs/hackathon/evidence/shinemage-dsh-upgrade-audit-20261010.md)和[SDK 门禁矩阵](docs/hackathon/evidence/shinemage-sdk-gate-closeout-20261010.md)。源码副本、candidate、正式分发和生产激活仍按各自门禁记账。
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
