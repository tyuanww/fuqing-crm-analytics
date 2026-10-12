# ShineMage 插件平台边界

本设计落实[已批准的拆分计划](../plans/shinemage-plugin-platform-split.md)，不是重新选型。目标是官方 DSH 底座、独立 CRM/知识库服务、各自版本化的插件和一个组合 profile。首批插件已经形成独立远程仓，当前远程清单见[远程仓盘查](../hackathon/evidence/shinemage-remote-repository-inventory-20261010.md)，主线短 SHA 见 STATUS，完整 SHA、合并时间和 CI 事实见[最新 post-merge 记录](../hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)；主仓继续保留平台合同、组合验证、历史 `dsh-plugins/` 和候选账本，部分历史副本已经按授权清理，剩余副本、正式物理分仓、正式 `dsh-plugin-pack/v1`/`dsh-plugin-candidate/v1` 分发与生产切换仍按各自门禁执行。普通插件更新的具体操作见[插件更新指南](../operating/shinemage-plugin-update.md)。


## 当前维护边界（2026-10-12 PR #121 合并后）

本轮实现与测试迁移已分组提交并经 PR #121 普通 merge，合并后 main CI 见[核验记录](../hackathon/evidence/shinemage-pr121-postmerge-20261012.md)。九个插件各自维护源码／版本／测试；board-components 仍是独立领域库，不是第十个插件。主仓装配锁绑定 Workbench `3030e3f`、CRM `dac0539`、Knowledge `f623c22` 及其真实 PR CI 产出的 `dsh-plugin-pack/v1` 回执；默认开发／preflight 装配消费固定包，公开合同阶段核对封存作者导出，领域与私有 core 覆盖核对作者来源和实际 CI。当前回执与 artifact 摘要见[正式包 CI 收口](../hackathon/evidence/shinemage-formal-plugin-ci-20261012.md)。

主仓仍负责 backend、平台合同、profile、组合消费、来源与权限门禁、保留合同守卫和静态扫描。另两组私有数值／查询断言继续读取旧 Workbench，历史 `dsh-plugins/` 因这些用途暂留；本地源码迁移没有证明全面源码退场，也没有改变运行时边界。完整看板仍在 analytics-workbench，shine-board 是能力标记；合成知识服务不能当作真实 WeKnora。

单插件日常变更按自己的作者检查与受影响主仓消费者验证，不重建 DSH、迁移业务数据库或重复 SDK 全量审计。DSH 升级仍是独立固定候选及兼容验收。作者仓、主仓守卫与正式包组合现已精确使用 Cordis `4.0.4`；D/E 五仓无独立 tsc，SDK 正式分发 BLOCKED，产品 PARTIAL、release_ready=false。PR #121 已合入 main，合并后主 CI 与工件摘要见[合并后核验](../hackathon/evidence/shinemage-pr121-postmerge-20261012.md)。当前九包输入预检已成功生成固定回执，见[组合输入预检](../hackathon/evidence/shinemage-composition-preflight-20261012.md)；candidate/journal、目标／真实业务及发布不据此通过，新服务字节需自己的组合验收。当前 backend worker 的结果事务争用修复只影响服务处理，不改变插件归属。

此前三路径应用时点（保留原记录）：

当前本地装配锁已绑定 Workbench `6c5adc9f` 与 CRM `c4b1c91e` 的独立正式包，并核对同来源作者 CI；canonical 后端离线 eval 的验证归属已迁回主仓，保留原断言并拒绝空用例集。应用后包准备/证据绑定和受影响测试通过；另两组私有数值/查询断言仍保留旧源码，尚未实现全部源码退场。原 peer `4.0.2`、candidate/journal、生产和发布边界不变，代码/文档未提交；见[本轮三路径应用](../hackathon/evidence/shinemage-three-path-main-application-20261011.md)。

## 四类升级各有归属

| 改动 | 归属与交付 | 必须验证 | 不随之打包的内容 |
|---|---|---|---|
| 官方 DSH | host exact SHA、SDK 和 runtime lock；当前 `0.1.7-rc.2` / `477b4f42` | 固定宿主的工具、slot、生命周期、恢复和插件兼容矩阵 | CRM/知识库源码、业务数据库 |
| 单个插件 | 本领域源码、版本、测试、`lib/`、peer、bundle patch；产出独立 digest | files/exports、安全扫描、合同消费者测试、目标宿主验收 | 其他插件源码、DSH runtime、服务状态 |
| CRM/知识库服务 | API、权限、领域 schema、持久化与迁移协议 | API 兼容窗口、权限、幂等/回放、状态 forward-fix | DSH shell 与其他服务的数据 |
| profile/部署 | 固定包的有序清单、host pin、来源、digest、回执与回退指针 | 来源信任、同一 artifact、canary、受控激活和恢复 | 构建工具、源代码仓库、现场编译流程 |

不需要先 fork DSH 才能维护插件。当前不修改上游源码，也不自动追随 latest；下一代 DSH 在独立 candidate 中适配后单独升级。[第三方社区 DSH Plugin Hub](https://github.com/dshplugin/dsh-plugin-hub) 只能作为发现/安装参考，不能替代本项目锁定来源和兼容证据；当前私有作者仓也不满足市场收录与正式发布条件，安装通道见[插件更新指南](../operating/shinemage-plugin-update.md#目录发现与安装通道另行放行)。

## 开发工具与运行时分开

以下带日期的进度段落是各迁移步骤的历史记录；当前已提交状态与默认入口以上方维护边界及本地交付索引为准。

主仓公共合同入口已按授权应用 12 路径，并修复重复终止进程组造成的错误覆盖；新入口隔离完整 B0 r2 exit 0：Python 855 PASS / 41 subtests PASS、23 warnings 保留，Node 27 组各自 0 FAIL / 9 次跳过。原 15 个生成器和 C0 hash 未改，主仓实际字节的守卫 28、路径 pytest 34、槽位 4、主题负测／漂移 2 分别通过，OCR 可审 11/11 与排除测试人工 1/1 已审，无开放发现。旧失败保留，主仓未提交，新 hosted CI 和当前组合准入未执行。见[本轮应用与实测](../hackathon/evidence/shinemage-public-contract-main-cutover-20261011.md)。

2026-10-11 提案时点：作者 Workbench `6c5adc9f`、CRM `c4b1c91e` 的正式 pack 已在隔离目录生成、读取并逐成员核对；回执分别为 `0af61dab…`、`4663cce0…`。当时主仓运行包／作者证据锁仍是原绑定，9 包／2 profile 的两锁前移提案已经验证但未应用；不继承旧 candidate/journal 或宿主验收。当前绑定以本节顶部及 STATUS 为准。见[历史来源记录](../hackathon/evidence/shinemage-current-author-formal-packs-20261011.md)。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

2026-10-11 提案时点：来源正式包的原公共组合实际运行 9 PASS / 0 FAIL / 0 SKIP，18 个指定来源负对照 EPERM；这只是合成 HTTP 和官方 resolver 层级，不代表严格 peer／完整宿主或正式准入。两锁提案 OCR delegate 2/2 已审，主仓 apply --check exit 0；后续已由 Cordis 对接和 PR #120 取代。见[历史组合记录](../hackathon/evidence/shinemage-latest-formal-combination-20261011.md)。

此前合同入口隔离提案准备时点（保留原记录）：

主仓公共合同消费者已形成 12 路径隔离提案，尚未应用：固定三仓真实 CI 的 31 份材料，保留原 15 个生成器与 C0 hash；原生成器 15 次 exit 0，槽位 4 项、主题负测／漂移 2 项、守卫 28 项、路径 pytest 34 项分别通过，34 个指定来源负对照 EPERM。OCR 可审 11/11 与排除测试人工 1/1 已审，失败保留；提案对当前 dirty 基线 apply --check 通过。新主仓入口完整 B0／CI、candidate 与业务准入仍 NOT_RUN，旧副本及保留源码守卫不删。见[提案与真实日志](../hackathon/evidence/shinemage-public-contract-main-cutover-proposal-20261011.md)。

此前合同作者交付时点（保留原记录）：

三个作者仓的合同导出已提交推送，当前真实 Ubuntu PR CI 和 31 份工件来源均核对通过；Workbench/CRM 的 CI 字节码污染由单路径修复关闭，失败保留。原 15 个生成器在旧插件资料拒读下 15/15 exit 0，原槽位 4 项与主题负测/漂移 2 项各自通过，私有行为保留在作者检查。主仓新合同入口和锁尚未切换，旧副本与静态边界继续保留；不继承正式包、candidate/journal 或真实业务准入，PARTIAL / SDK 分发 BLOCKED / release_ready=false。 见[合同材料的实际作者交付](../hackathon/evidence/shinemage-generated-contracts-owner-delivery-20261011.md)。

领域库 `board-components` 的 producer/私有几何现由独立作者 `e78e040e` 的固定真实 Ubuntu CI 负责；主仓默认阶段核对来源、原封存输入及实际覆盖，公开包/类型与跨消费者锁继续在主仓消费，不再本地重建领域源码。18 路径已按授权应用，r2 同字节完整本地 B0 r4 exit 0，随后仅清理两份末尾空行并通过语法/差异检查；新 hosted CI、候选和真实业务未验收。15 个合同生成/比较入口、保留合同及静态边界扫描仍读取旧源码，清理 stop/go 尚未满足。领域包外层摘要不同不得互换，CI artifact 14 天有效期也不是正式分发。见[本轮应用与边界](../hackathon/evidence/shinemage-board-components-main-cutover-20261011.md)。

以下领域/几何接续段保留较早执行时点；当前事实以本段与本轮证据为准。

Workbench 私有几何已由独立作者 `e9223289` 与实际完整 CI 负责；主仓现以精确 archive/member 摘要、来源、新正式回执 `871fd3bb…` 及 tar `e41df9f5…` 绑定，再核对真实 plan 中的几何文件。三路径已本地应用，不复制作者私有几何实现；九包准备、实际身份绑定和源码拒读验证通过，原领域生产者及剩余源码合同仍保留。新来源不继承旧候选准入，完整 B0/主仓 CI 未重跑。见[正式来源与主仓对接](../hackathon/evidence/shinemage-workbench-geometry-main-bind-20261011.md)。

board-components 的独立维护源现为[私有领域仓](https://github.com/tyuanww/shinemage-board-components)，main `3855db80`，PR #1 head `d5aacdb4`；真实 Ubuntu CI 已通过 producer/几何/准备边界。它继续是纯领域库，不是第十个 DSH 插件。CI 包 `66d53381…` 的五个成员等于封存参考 `22245ab9…`，外层归档不同；主仓原领域输入锁、生产者选择和公开类型消费/跨消费者锁保持。主仓旧生产者另补本地输出文件保护，尚未提交；不表示入口已迁移或发布准入完成。见[远端交付](../hackathon/evidence/shinemage-board-components-remote-ci-20261011.md)、[本地修复](../hackathon/evidence/shinemage-board-components-main-output-guard-20261011.md)。

上一轮领域本地 Git/clone 交付时点（保留原记录）：

board-components 的维护源已形成本地领域作者仓首次提交 `3855db80`；从该提交真实 clone，在 DSH checkout/build-tools、业务与作者源码及网络拒绝条件下完成安装、producer/几何验证和同字节内容包。它仍是纯领域库，不是第十个 DSH 插件；无远程仓/CI，主仓生产者、公开类型消费及跨消费者锁暂保留，未切换入口。见[领域首次提交与 clone](../hackathon/evidence/shinemage-board-components-owner-git-delivery-20261011.md)。

上一轮领域提案准备时点（保留原记录）：

board-components 继续是既有漏斗/瀑布图纯领域库，不是新增 DSH 插件。独立本地作者提案可在 DSH checkout/build-tools 和业务源码拒读时生成与封存归档同字节的内容包；Git/远端 CI/主仓生产者切换均未执行，类型消费及跨消费者锁仍在主仓。见[领域 owner 提案](../hackathon/evidence/shinemage-board-components-owner-proposal-20261011.md)。

四插件源码隔离默认入口也已改为接收独立作者正式归档：每包只解出自己的运行文件、核对 manifest/成员/摘要，不复制源码、不执行 build、不制造临时 Git 来源。构建与私有测试归作者仓，主仓继续运行既有固定包公共行为消费者；原夹具以 `plugin-source-isolation.legacy.mjs` 显式保留。源码拒读接收 4 PASS 和可读固定 SDK 的公共行为 29 PASS 分开记录，不代表完整宿主、严格 npm peer 兼容或正式准入。领域生产者及其余源码合同尚在，旧副本仍按 stop/go 保留；见[固定包隔离证据](../hackathon/evidence/shinemage-fixed-pack-isolation-20261011.md)。

默认 installed-kit 检查现在只验证当前开发 kit 的真实打包、离线安装、公共工具链与自有合成编译夹具；业务插件声明和领域锁从九个固定正式包读取，不再在该入口复制或重建十份生产者源码。严格 TypeScript 只属于这份 kit 夹具，D/E 五仓的独立 tsc 仍为 NOT_IN_CURRENT_BUILD。原十源码入口保留为显式 legacy，领域包生产者、历史隔离和剩余公共合同仍各自维护；本轮 targeted 验证不代表完整 B0、SDK 分发或正式组合准入。见[当前 kit 归属与证据](../hackathon/evidence/shinemage-installed-kit-pack-ownership-20261011.md)。

上一轮执行记录（正式 preflight 包装配；下列验证只覆盖该轮字节）：

正式 preflight/release 现通过 `DSH_PROFILE_PACK_INPUTS` 读取与主仓所选 profile 同字节的独立正式包。打包先排除旧业务插件源码，再装入固定运行文件，携带原 manifest/tarball 和输入账本；接收端逐包核对运行文件与归档字节。历史 `build` stage 名保留，只作固定包复核，不宣称现场编译。当前七包已在列明源码和构建输入拒读条件下装配通过；整条 preflight/当前 candidate 仍未执行。普通插件输入锁改动不会自动触发整套 DSH prepare/audit。主仓仍维护组合、公共合同、验收、开发 kit 和历史源码夹具，还不是只有官方 DSH 的纯壳。见[包装配边界与证据](../hackathon/evidence/shinemage-formal-preflight-pack-assembly-20261011.md)。

上一轮执行记录（Workbench core 归属迁移；其完整 B0 只覆盖当时字节）：

Workbench 的完整 core/严格构建/私有 loader 现由独立作者提交 `d038f357` 与成功 Ubuntu CI 负责；主仓用固定 archive/member 摘要校验，并绑定新正式回执 `9d7f6bf3…`、来源及 tarball `e41df9f5…`，组合锁为 `89e2b2ea…`。默认主仓阶段已切走该包整批源码 core、直接构建和 clean rebuild，保留公开包消费者与三组原 backend/query 断言。新本地 B0 r3 exit 0，不等于当前 candidate 或 hosted CI；installed-kit 多插件夹具、历史生产者、formal preflight 源码路径与旧副本仍在。前轮 fd46 的宿主安装/回退是同字节历史证据，不继承新来源的服务/目标准入。固定 archive 有有效期，不代替持久分发；不承诺任意无重启热插拔。见[当前归属与正式包](../hackathon/evidence/shinemage-workbench-core-formal-main-ownership-20261011.md)。

以下接续段保留较早执行时点；其中旧来源、未执行和未提交结论按各自证据对象理解，当前入口与身份以本节最前面的最新记录为准。

精确 Cordis `4.0.4` 的隔离修订普通包现已通过官方 npm 宿主的开启、原生关闭、恢复三进程验证：原生鉴权、合成会话保留、关闭时 CRM 路由 404、恢复后 200 且未连接。新 home/workspace、localhost 沙箱及自有进程清理均核对；旧正式包、原作者仓和 candidate/journal 不变，不能抵扣真实服务/模型或正式准入。诊断使用普通 npm 包公开导出与既有 renderer，不是新的正式 profile 或 live 热插拔；见[本轮记录](../hackathon/evidence/shinemage-corrected-npm-host-20261011.md)。

精确 `4.0.4` 的配套修订已在隔离作者副本完成普通严格 npm 安装和四入口导入，运行 JS 与旧包同字节；原仓和正式包的 `4.0.2` 保持，合同修订尚未应用。主仓守卫提案只能在新干净来源、正式包与输入锁到位后接入，不能先接受旧包或改写其历史回执。见[隔离修订证据](../hackathon/evidence/shinemage-cordis-exact-proposal-20261011.md)。

固定官方 npm DSH 与 dsh-tools 的 Cordis 要求均为 `~4.0.4`；CRM/Knowledge 现有正式包的精确 `4.0.2` 与其无共同版本。普通严格 npm 锁解析已分别拒绝声明版本+SDK、宿主版本+CRM、宿主版本+Knowledge 三组合，不应把 linked resolver 的初始化成功推广为严格安装兼容。没有放宽范围或修改上游，原声明保持；需 owner 校准合同后以新提交/新包重新验收。见[严格解析证据](../hackathon/evidence/shinemage-cordis-strict-peer-20261011.md)。

当前本地整条 B0 在固定输入下已完成 r2 验证，Python 855 项和 41 subtests 通过，Node 23 组无失败；原 opt-in/standalone 跳过仍保留。静态清单已由原生成器同步到当前主仓副本，policy 和运行依赖未变。B0 仍包含 Workbench 本仓构建与历史生产者/源码隔离夹具；通过只证明本次迁移后的本地检查链，不证明主仓完全不读插件源码、SDK 已可分发或独立包正式准入。见[当前 B0 证据](../hackathon/evidence/shinemage-current-b0-closeout-20261011.md)；以下较早迁移阶段的未执行范围按当时时点保留。

组合 profile 生成器由主仓维护，其五项测试也已移回主仓 `scripts/crm-calibration/profile.test.mjs`；CRM 插件旧路径仅转发兼容，不再承担维护正文。默认 B0 三入口组合在业务源码拒读下同次 14 项通过，含原五项 profile；这只是测试归属与输入边界迁移，不改变插件运行实现、profile 或 peer 声明，也不关闭剩余源码阶段及正式准入。见[归属证据](../hackathon/evidence/shinemage-main-profile-test-ownership-20261011.md)。

默认 B0 的 CRM/Knowledge 两项本仓构建及作者私有 transport/graph/relay 测试已本地切走，改由独立作者仓负责；主仓消费既有正式两包并保留公开行为断言。实际源码拒读的包消费 11 项和原公共组合 9 项通过，输入守卫分别记账；Workbench 源码构建、七个生产者及历史输入守卫仍在，完整 B0 和新 CI 未跑，不能删除副本或宣称全部源码装配已迁完。见[本轮记录](../hackathon/evidence/shinemage-crm-knowledge-package-consumers-20261011.md)。

CRM/Knowledge 的既有正式两包现已在固定 DSH 的官方安装、profile resolver 与实际 Cordis `4.0.4` 下完成本机宿主/preset 初始化；没有改精确 `4.0.2` 声明或设置版本豁免。Linked peer 警告保留，该结果不证明声明正确或完整运行兼容，不代替真实服务和当前 candidate 的组合准入；见[宿主兼容补查](../hackathon/evidence/shinemage-crm-knowledge-host-compat-20261011.md)。

未公开的 `skills.js`、未打包视图、包内原生通道授权和页面交付实现属于 Workbench 作者验证，不能临时新增 exports 或复制进主仓来通过组合检查。作者仓六个既有入口及原 built 检查已在完整作者入口同次 30 文件、212 项通过，原断言未改；固定输入仅用于本地编译/测试闭包，不重编上游。主仓七个旧生产者入口在作者提交和 CI 交付前仍保留，当前没有删除或正式迁完。真实模型和业务不由合成夹具抵扣；当前见[作者测试补齐](../hackathon/evidence/shinemage-workbench-author-tests-closeout-20261011.md)，前轮输入锁与失败记录见[历史归属接续](../hackathon/evidence/shinemage-workbench-producer-ownership-20261011.md)。

原生 prompt 消费也已转为正式包公开 `./client`，使用固定官方 Cordis `4.0.4` Context，合成 remote/RPC 只验证公开注入和生命周期。10 项原断言保留并在源码拒读下通过，九入口同次实跑 66；七个 Host/私有 compiled producer 和其余源码构建仍保留，不等同完整宿主或正式候选。见[本轮证据](../hackathon/evidence/shinemage-workbench-native-prompt-pack-20261011.md)。

发布客户端的工具卡、取消、保存、首购和资产弹层运行检查也已改为固定包消费，主仓只维护消费者与合成合同数据；不复制插件 decoder、保存网关或模型实现。八入口在列明源码拒读下实跑 56 项，源码结构检查仍留在生产者阶段，Host/私有视图和剩余构建继续开放。该结果不解决原正式包的 peer 缺口或完整宿主准入，见[合同消费证据](../hackathon/evidence/shinemage-workbench-consumer-contracts-20261011.md)。

Workbench 的公开客户端消费进一步迁到主仓验收目录，仅使用七包既有 profile 中正式包的 `./client` 和固定官方 React/store 模块。12 项原 factory/生命周期断言保留，源码拒读实测通过；SSR/JSDOM 和合成槽位不代表完整宿主或原生浏览器。Host 入口及其他源码生产者检查保留待迁移，不抵扣原 Workbench 的运行 peer 缺口。见[本轮证据](../hackathon/evidence/shinemage-workbench-client-pack-migration-20261011.md)。

默认 B0 的品牌、漏斗、瀑布、问数、看板标记和人群行动常规消费阶段现已读取独立正式包，不在该阶段重建六份主仓源码。主仓保留实际发布 JS、浏览器 factory、品牌默认边界、几何和公开类型的消费验证；几何类型消费使用显式固定 TypeScript，不声称五仓已有独立 tsc。历史作者输入守卫/源码隔离夹具与 Workbench/CRM/知识源码构建尚待迁移；本轮源码拒读的 20 项包消费结果不代表完整宿主或默认 B0 全链通过。见[迁移证据](../hackathon/evidence/shinemage-leaf-pack-migration-20261011.md)。

主仓 B0 的固定包输入准备沿用两份现有 profile，锁只记录已审查的九份正式包身份和摘要；源码与运行包不进入公开主仓。目录/ZIP 消费器及 CI 接线已有本地实测，托管 CI 仍需提供固定 artifact 和显式读取权限。准备不安装 peer、不启动宿主、不放行 candidate，默认 pipeline 的其他源码阶段仍待迁移。见[CI 包输入记录](../hackathon/evidence/shinemage-ci-pack-inputs-20261011.md)。

ZIP 接收的安全校验使用明确异常，不能因 Python 优化模式关闭。包输入准备、合成公共合同与 backend/frontend/tooling/release 的本地回归各自留存证据，不合并为完整宿主或正式发布通过；当前候选与 journal 身份不变。

CRM/知识 profile 生成器现已本地支持与开发入口相同的 `dsh-profile-pack-inputs/v1`，先核对完整包和固定 profile，再解到本次独占目录；公开导出、领域合同、精确 peer 和配置私密性检查保持。实测使用现有 `crm-knowledge-rc2` profile 和两份独立正式包，没有新建服务 profile。带 service binding 的组合仍必须进入正式 candidate 门禁，配置准备不能代替服务/宿主验收。见[迁移证据](../hackathon/evidence/shinemage-crm-profile-pack-migration-20261011.md)；实现尚未提交，完整运行组合及默认源码 pipeline 仍待收口。

CRM／知识和公开 page tools 的组合验收已进一步改为读取固定包，测试维护在主仓验收目录，旧插件测试路径保留兼容。当前只证明官方解析器、Cordis `4.0.4` 下的九项公共合同；声明 `4.0.2` 没有放宽，也未安装 peer 或启动完整宿主。默认源码 pipeline 的其他装配及完整宿主准入仍未关闭，见[本轮组合证据](../hackathon/evidence/shinemage-fixed-pack-composition-20261011.md)。

2026-10-11 本地接续：开发 `check/start/reload` 正在迁移为显式固定包输入，包读取、准备和原七包的官方安装/配置生成已有实测。实际启动发现 Workbench 未声明 `dsh-client-connection`、`dsh-llm` 运行 peer；作者仓本地补齐同一固定版本，并在真实 host 构建输出上检查未声明依赖。修复后的隔离诊断完成开启、原生关闭、恢复和合成会话持久化；它修改了 manifest，不是原正式包或 candidate 的验收。代码尚未提交，live CLI reload、默认源码 pipeline 与其他 CRM/Knowledge 组合入口仍待迁移；不能据此删除历史副本或宣称物理分仓全部完成。范围见[插件更新指南](../operating/shinemage-plugin-update.md#开发入口消费固定包2026-10-11-本地迁移)、[准备证据](../hackathon/evidence/shinemage-profile-pack-migration-20261011.md)及[宿主修复证据](../hackathon/evidence/shinemage-official-pack-host-closeout-20261011.md)。

`dsh-plugins/plugin-kit` 只拥有固定工具链、依赖锁与构建绑定；它不导入业务插件、不读取服务状态、不进入插件 tarball。插件自己的类型检查、测试、生成物与业务行为由插件维护。10 个固定 SDK 构建消费者已使用精确开发依赖及 kit 公开导出；仓库内由显式 workspace 适配器连接，采用该路径的独立作者工程消费已核对的 kit tarball。shine-brand 独立仓另有默认公开编译路径，使用自身 `npm-author` 锁，不读取上游 checkout 或 SDK，只做语法转换；它不取代严格 SDK 类型检查与宿主验收。具体路径见[作者入口](../operating/dsh-plugin-author-quickstart.md)。这不代表 kit 已在 registry 发布或 SDK 已获准分发。

`toolchain.json`、build-tools manifest/lock/补丁现在位于 kit；release、B0 pipeline、开发入口和合同生成器读取同一份 pin。不能为了让一个包构建成功，静默从相邻历史仓库找依赖。已准备的第三方依赖可以复用，但须与 kit 锁定输入一致。

当前事实见[机器清单与依赖说明](./shinemage-plugin-boundaries.md)。首批 leaf 已能脱离 workbench 构建；CRM 原 5 条 workbench 私有引用全部解除，合成 Python 查询/知识解释也改为显式配置的独立服务 HTTP API 1.0.0。插件不再发现主仓路径或启动 Python。两项服务已各自产出[独立应用候选包](../operating/crm-service-packages.md)，资源与依赖按领域锁定；知识服务不再加载指标引擎或 DuckDB。九个插件已有独立远程仓和 CI，但主仓仍保留集成副本、适配和历史证据；主仓副本清理、正式分发与完整宿主故障隔离仍未关闭。

CRM 与知识插件也已拆成两个独立候选包：CRM 保留旧包 ID，知识使用 `@shine-mage/dsh-knowledge`；profile v3 按包分别选择、分别记录指纹。双方只共享领域 owner 维护的公开合同生成物；私有知识通过可撤销会话 lease 获取身份，不读取 CRM 实现或凭据。公开解释可独立运行，私有教材当前仍需要 CRM Host 作为身份提供方。迁移需要新 profile 和对应新 Host，不能宣称原地热替换已验证，详见[服务与插件边界](../operating/crm-plugin-service-boundary.md)。

## 领域合同不能变成共享业务单体

- 极小的跨插件合同只约定 capability 的提供/消费、slot、结果 envelope 与不可用状态。
- CRM、问数、看板、页面与知识库 schema 由各领域拥有；生成器、源摘要、消费者和兼容政策一起维护。
- 观察到的 `/internal/native/*` 是内部 adapter，不能当成长期公开 API。字面路由清单也不证明权限、幂等或可用性。
- 插件被禁用或依赖缺失时，动作必须显示 `disabled` / `NOT_AVAILABLE` 和原因；默认保留 DSH 原生标题、侧栏、会话及工具合同，`--shine-brand off`。

## 安装、故障与保存边界

首期包身份保持现有 `@shine-mage/dsh-analytics-workbench-b0`；不能把目标仓库名称当成已获授权的 npm 包重命名。profile 只选择固定包组合，candidate 再记录单包 pack digest 与 profile snapshot digest。每次候选记录来源 SHA、生成合同摘要、DSH pin、capability 和 journal，不能用工作区目录作为发布身份。

同进程插件挂死或部分注册不能靠静态分析证明可隔离。T17 必须在命令拥有的临时 profile/home/WAL/PID/端口中验证固定 DSH 的实际行为；不支持安全卸载时明确 `HOST_RESTART_REQUIRED`，按已验证的原生回退与受控重启处理。当前不宣称热插拔或无重启回退。

2026-10-08 已在固定 rc2 的本机合成场景验证加载后阻塞、终止自有宿主、重启原生配置和恢复旧组合/会话，10/10 通过；见[A/B/C 集成验收](../hackathon/evidence/shinemage-abc-integration-20261008.md)。该结果只覆盖进程级恢复，不关闭任意插件隔离、生产或完整兼容门禁。同日后续本地准入：官方 shell/tool 显式三项加 9 项边界共 12 PASS；当前配方查询冷安装 3 PASS，回执绑 `e577f41b` / `ddb70716…`，`release_ready=false`。该阶段 standalone example 与正式 candidate/journal 尚未关闭；后续本地提交 `bd647352` 已生成新 candidate/journal（仅 CANDIDATE_PREPARED），standalone 与针对新候选的服务/宿主验收仍开放，见[本地候选记录](../hackathon/evidence/shinemage-abc-local-candidate-20261008.md)。见[剩余准入](../hackathon/evidence/shinemage-abc-remaining-20261008.md)和[当前配方查询包](../hackathon/evidence/shinemage-abc-kernel-current-20261008.md)。SDK 审计属于工具链升级，不加入每次单插件更新。

profile 回退不回滚已写入 CRM/SQLite 的记录。D15 是否启用 durable save 由 T3/T7 的服务状态矩阵决定：candidate/correlation/idempotency、成功但回执丢失、重复提交、UNKNOWN 重放和 forward-fix 都需要证据。证据不足时首个候选仍只交付可核对结果。

## 实施顺序与放行

1. T1 固化 owner、实际依赖和边界检查；T15 先证明 dev kit 与低耦合 leaf 包。
2. board-components 已拥有公开计算/类型，workbench 的 6 条图表源码引用已改为固定 tarball，独立 build/pack 与消费者回归已有本地证据。CRM 的 slot/主题改为领域版本化生成合同，页面工具由 profile 装配公开入口，原 5 条 workbench 内部引用全部解除；单包构建/测试/pack 通过。细目在机器清单，每解除一条就删除对应临时例外；不把源码解耦当作生命周期验收。
3. T2/T17 固定宿主证据与 T3/T7 保存矩阵通过后，完成 D15 workbench 包的独立 candidate、canary 和回退证据。
4. 保留批准的签名、SBOM/CVE、来源、权限、灰度和责任门禁；独立远程仓已建立，后续只在对应门禁关闭后收口正式分发、清理主仓历史副本和建立多生产者 catalog。

打包成功不代表发布就绪。GitHub 发布、杭州 receive/activate、WSL/路由操作和真实数据迁移仍按各自授权及现场门禁执行。开发与 CI 可以生成验证包；生产只接收已审查 SHA 的不可变 artifact，大包由杭州直接下载，Tailscale 负责控制与探针。
