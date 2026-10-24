# rc3 六项收尾与 CLI 复核

本记录更新于 2026-10-24。作者 CI、严格包与组合 ZIP 读回已完成，主仓非草稿 [PR #164](https://github.com/tyuanww/fuqing-crm-analytics/pull/164) 已创建。依赖安全修复 `bd705237` 正常 pre-push 通过并推送。rc3 Linux 扫描命中已定位，并补充精确例外与负测；最终提交的远端结论以 PR 当前 checks 为准。杭州只读核验已完成服务、依赖和缓存锁元数据，没有打开真实业务库、合并、发布或切换。`release_ready=false`。

## 六项状态

| 项目 | 已有证据 | 仍未关闭 |
| --- | --- | --- |
| 作者 CI | Workbench `d6b711a1`、CRM `46111c5b`、Knowledge `2b0f5745` 及六叶子最终提交对应 CI 全部成功 | 不代表合并、宿主或业务验收 |
| 严格正式包 | 九插件从最终干净提交构建并严格读回；领域包从固定源重建，保留参考字节 | 主仓 candidate、journal 和运行验收未完成 |
| 六个叶子作者与组合 | 六仓已推送，PR 和 CI 成功；组合锁已更新，真实 artifact 已上传并严格读回 | 上传载体不是正式 release 或杭州部署 |
| 主仓验证与 Git | 初始候选及依赖修复 `bd705237` 正常 pre-push 通过并推送；精确扫描例外的发布测试 45 PASS | 最终提交的 CI 以 PR 当前 checks 为准；跳过项和离线评估不算业务通过 |
| 独立审核与业务验收 | 用户允许 CLI 替代故障原生审查；定向对抗复核未确认 P0–P2 | 同模型不提供跨模型独立性；真实宿主、业务 UAT、近两年 RFM 和商品缓存覆盖未验证 |
| 合并与杭州切换 | 未执行 | 需要前置检查、实际候选身份、回退与现场 UAT；不继承旧 side-load 的验收 |

## 远端依赖审计与候选修复

文档提交 `58965678` 正常推送，tooling 198 PASS。随后 [CI run 40080028895](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40080028895) 的 `dependency-audit` job `120831493986` 报告 certifi `2026.2.25` 的 `PYSEC-2026-4320` 和 setuptools `84.0.0` 的 `GHSA-xmj3-9gf7-h52w`，不能将此前本地完整检查当作远端 CI 通过。

按[供应链记录](../../operating/supply-chain.md#2026-10-24-候选安全修复)同步三个 certifi 精确锁至 `2026.10.19`，CRM setuptools 至 `84.1.0`，并提高声明和构建下限。隔离 CRM 环境仅这两个安装版本变化，B0 环境仅 certifi 变化；`pip check` 通过，相关 CI 合同 58 PASS。新增修改代码注释为 0，CLI 定向复核无新的 P0–P2，仍保留非原生、同模型限制。

本地 pip-audit `2.10.1` 在便携 Python `3.14.4` 创建临时环境时出现 ensurepip SIGABRT，失败日志保留为 `pip-audit-root-r3.log`，未计通过。使用本机已有 Python `3.14.8` 的新隔离审计环境执行相同完整解析命令后 exit 0，结果为未发现已知漏洞，见 `pip-audit-root-r4.json` 和 `.log`。没有使用 `--no-deps`、`--disable-pip` 或 advisory 忽略项。前端 `npm audit --omit=dev --audit-level=high` exit 0，结果位于 `npm-audit-production-r1.json`。新依赖下的完整 hooks 和最终 PR CI 仍待确认；旧服务、SDK 和候选回执不追改摘要。

安全修复 `bd7052377922e62cc3ed4cf77211809e8ec78e35` 已正常推送。第一次调用遗漏了 B0 所要求的空输出目录，完整后端已通过，但 B0 在 lstat 前置失败，没有开始 LFS 或 push。补建新的独占 `prepush-security-r2` 根后正常 hooks 全部通过，日志为私有证据根的 `main-push-security-r2.log`。没有跳过检查，前端因本次仅改 Python 依赖而按共享路径矩阵不重跑。

最初本机缺少手册中的 `hangzhou-wsl` 别名，默认用户名被 SSH publickey 拒绝。用户确认目标后，从已有 `scripts/ops/open-hangzhou-dsh.sh` 找到正确 root 与独立运维身份，连接成功。只读元数据确认目标为 WSL2、DSH 仍是 rc1 且 active，CRM 与 WeKnora 健康。现役 CRM 仍安装 certifi `2026.2.25` 和 setuptools `84.0.0`，两项线上风险没有随源码 pin 更新而消除；后续需真实新镜像及授权维护切换。没有读取私钥、修改配置或重启服务。

## rc3 Linux 扫描命中与精确例外

原 [preflight run 40080028898](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40080028898) 的官方 rc3 构建为 9/9 PASS，随后 runtime 密钥扫描拒绝两份 DevTools chunk。没有按目录跳过扫描，也没有把 Mac 或 npm 包的不同字节追认为 Linux 输出。

独立[诊断 run 40080968871](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40080968871) 在 Ubuntu 24.04、Node `24.19.0` 重建 consumer `58965678` 所固定的 upstream `1f81c047`，检查源码 clean 和原 pnpm 锁。诊断只输出摘要和预设公开字面量分类，不上传原 JS、未知匹配值或凭据。artifact `12555346882` 为 902 bytes，ZIP SHA-256 为 `7f92b902893a40de5198b616f4033e672c9f46a38d7e2111c4d07ea1369a0fd9`，已实际下载校验，成员与报告一致。

| 文件 | 完整 SHA-256 | 仅本字节允许的公开标识 |
| --- | --- | --- |
| `data_grid-ehf9xIbN.js` | `bf04c38a3718a005767a676a9847616b8e6ab8a2c8987441ec2f2f29bd6c459e` | `DataGridInternalToken` |
| `legacy-Dg_djKt3.js` | `29a622e8e7c7ef54241123b18eba6400c1cd111ffb7445df12e251f7b1300188` | `ReportingEndpointNotToken`、`InvalidCredentialsCookie` |

两文件原扫描仍命中，仅加入上述已知字面量时命中归零。主仓原测试表先补新案例并实际失败，再添加四条例外覆盖 materialized 和 installed 两种路径。既有扫描器函数、正则、全局 benign 集合及目录扫描未改。测试同时拒绝错误路径、错误摘要和未知凭据；发布测试为 45 PASS，报告驱动的六组字面量与路径负测通过。CLI 复核未发现本范围新增 P0–P2，保留非原生、同模型限制。实际 runtime preflight 仍由最终 PR CI 验证，不能拿策略单测或诊断成功代替。

## 真实缓存与业务边界

现役独立 RFM 缓存文件存在，大小为 1,060,864 bytes。lsof 与容器 PID 核对证明持写锁的是现役 CRM 进程。没有另开 DuckDB 连接、复制缓存、停服务或改数据；active generation、完整筛选覆盖与延迟仍未知。不能直接让第二个进程写同一缓存文件，须先解决受控预热与发布的 owner 边界。

源码预热仍仅列 `YEARS=[2026]` 的 380 个逻辑组合，窗口按日期解析并去重，简单把年份乘二不等于近两年覆盖。商品端点仍调用聚合服务，独立持久缓存及近两年筛选速度尚未验证。R/F/M 流转 miss 仍与八象限的 cache-only 路由不同，不把它们合称全部已预热。新 rc3 的真实问数、WeKnora、快照、HTML 编辑保存及恢复仍需对应候选 UAT，不继承旧 rc1 结论。

## 最终作者与组合身份

| 作者 | 最终 source | 成功 CI run | PR |
| --- | --- | --- | --- |
| Workbench | `d6b711a1bc6f48c4e283eafeba839d4bdba9a803` | `40075710303` | [#2](https://github.com/tyuanww/dsh-analytics-workbench/pull/2) |
| CRM | `46111c5bd93c798cd8256419c6c8dee0505b215f` | `40075710655` | [#2](https://github.com/tyuanww/dsh-crm-knowledge/pull/2) |
| Knowledge | `2b0f5745f725eda5b26df20ebd86c79003b08078` | `40072137767` | [#2](https://github.com/tyuanww/dsh-knowledge/pull/2) |
| board | `c7b4ab6541449adc236398a753662c09f61d5ab8` | `40075750502` | [#2](https://github.com/tyuanww/dsh-shine-board/pull/2) |
| crowd-action | `6a3c2d6601e8500326565d9fefe495c82d5ec37b` | `40075774458` | [#2](https://github.com/tyuanww/dsh-shine-crowd-action/pull/2) |
| query | `81363e4743871a7d08a9a8686b933d53a99b1f67` | `40075776419` | [#2](https://github.com/tyuanww/dsh-shine-query/pull/2) |
| funnel | `3420ec3b2650000388ceee5e2a14d78dc8a84a59` | `40075779068` | [#2](https://github.com/tyuanww/dsh-shine-funnel/pull/2) |
| waterfall | `6a07f2d95c47302ffde72507c6b29e4d7c13f8c6` | `40075781965` | [#2](https://github.com/tyuanww/dsh-shine-waterfall/pull/2) |
| brand | `f2c819003aa695404827957951e44befdc5ae017` | `40075782816` | [#2](https://github.com/tyuanww/dsh-shine-brand/pull/2) |

八个新提交的作者目录均已干净，Knowledge 无新改动。领域库固定源为 `e78e040e14792c89f99a2e3181004dbdaefd9bf6`。原 CI 工件即将到期，已真实重跑同一来源的 run `38121126913` attempt 2，成功并生成 artifact `12553123830`，到期日为 2026-11-07。不是替旧工件延长时间或补写来源证明。

组合载体使用独立分支 `codex/rc3-composition-artifact-20261024`，提交为 `8210b7144ddf297d372dd477df1a2abfeea6333e`。[上传 CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40076593648) 成功，artifact 为 `12553780915`，725944 bytes，SHA-256 为 `e6a5019a56e8cf04fdf1636774ecec696ae10de5d770a54ca166986e67432eb3`，到期日为 2027-01-22。真实 ZIP 包含九插件和领域的 20 个文件，经来源清单、生成证明、peer 和摘要守卫读回。组合锁 SHA-256 为 `96bb0e9b4cd13445e2c36f49d30bb8bbc319f05b6f264024d608a42c4c9aafb2`。

主仓三个 CI 调用显式选择版本化 artifact 锁，并绑定该组合锁、run 和 head。没有改仓库全局变量，也没有让旧分支误消费 rc3。审查发现的锁文件缺失已补充真实配置，相关检查先以 ENOENT 失败再通过。公共契约曾只接受 crm.1，新档案在修复前触发 `PUBLIC_CONTRACT_VERSION`；改为当前 crm.5 并增加旧版拒绝回归后，相关 35 项通过。

前端首次使用借用依赖运行时 224 PASS、2 FAIL。借用目录安装 Rive 2.45.1，而候选锁为 2.43.1。保留原链接后按候选锁离线安装私有依赖，构建及 226 项单测通过，没有改受测 WASM。B0 首次在缺少 zstd 的调用 PATH 上前置失败，保留日志并用现有安装重跑，没有修改门禁。

B0 随后发现边界库存未跟随既有授权测试及测试行号更新。通过 `plugin-boundaries.mjs --write` 生成，`--check` 和 12 项测试通过。下一组发现 CLI 仍期望旧 rc2 SHA，只改固定期望为真实 rc3 SHA，dsh-dev 整组 100 PASS、1 个显式历史上游缺失 SKIP。备份后端测试曾因调用 PATH 缺 `/usr/sbin` 而找不到 lsof，保持 fail-closed；补齐现有工具路径后同文件 9 PASS，没有修改备份删除规则。首次全量后端在第三组因此停止，不计完整通过；完整门禁仍需执行。

新增私有证据位于 `/private/tmp/dsh-rc3-final.ELtVwt`，包括 `author-ci.json`、`composition-results.json`、`domain/result.json`、`carrier-artifacts.json`、`prepared-remote-r1/preparation.json`、`ci-inputs/`、`artifact-reference-tests-final.log`、`updated-author-inputs-tests.log`、`domain-ci-input-tests.log` 和主仓各检查日志。生成脚本和 API 观察一并保留；计数按组报告，不累加或冒充业务验收。

## 核心作者的较早固定提交证据

GitHub workflow 和 job 状态已通过 API 查询，不再沿用此前“CI 未确认”的结论。

| 作者 | CI run | formal artifact | 本地严格 pack manifest SHA-256 |
| --- | --- | --- | --- |
| Workbench | `40072082417` | `12551523808` | `9b5637c1567447cbef3db1aafd0e2b63b5352c318f2daf5f0623e66f84095f49` |
| CRM | `40072133174` | `12551661792` | `b31834721313e69f24739a8b3629ad6397b42bab430ebee4929e14c164cc4703` |
| Knowledge | `40072137767` | `12551199866` | `d09889991f5613153bcb11d70e0305688fbcb06322e81bb58c1e8a6da901bb63` |

这三份远端 artifact 的原 producer 不含 `generated_bytes_provenance`，不能直接通过主仓严格消费。本地严格包来自 `git clone --no-local --no-checkout` 后的精确提交、冻结离线安装和实际构建。构建前后工作树均核对干净，没有给旧产物补写证明。

本轮审修后 Workbench 和 CRM 源码发生变化，上表只保留原提交证据，不再代表这两仓的最新候选。Knowledge 本轮没有新源码变更。

## 六个叶子插件

六仓从各自远端 `main` 新 clone，使用新分支 `codex/dsh-rc3-ci`。仅更新构建输入、peer、对应测试和文档，业务源码未改。五份固定 SDK 输入与 CRM 的 26 个绑定一致，实际闭包核对为 110 包、1512 文件，无锁外 lib。漏斗和瀑布图保留原 `board-components` 身份与摘要，不覆盖成无领域包的输入。

| 作者 | 包级测试 | 其他本地结果 |
| --- | --- | --- |
| board | 7 PASS | 构建、内容包、2 项输入测试通过 |
| crowd-action | 7 PASS | 同上 |
| query | 7 PASS | 同上；这是能力标记插件，不是线上独立 Query Agent 包 |
| funnel | 10 PASS | 构建、声明和内容包、2 项输入测试通过 |
| waterfall | 9 PASS | 同上 |
| brand | 41 PASS | 公开编译器构建和内容包通过；固定 SDK 预检通过，未运行固定 SDK 完整构建 |

各组均 0 FAIL、0 SKIP。五份 SDK 准备脚本另各跑 3 项进程组和 6 项输入保护测试，均成功。没有新增独立 tsc，不把打包成功称为严格 SDK 类型验收。

brand 首次公开工具离线安装报 `ENOTCACHED`。按锁文件通过本机已有代理补齐依赖后，执行构建、41 项测试和内容包。原失败日志保留，后续结果独立记录。Git 网络同样使用每次命令的代理参数，没有修改全局 Git 或代理配置。

## 审查发现与修复

`no-comments` 的首次 CLI 审查提出 10 处注释建议和 3 个代码形状疑点。复核后删除 16 行旁白注释，作者仓和主仓同步副本保持一致，不重复计算删除数。保留裸包 Loader 的外部约束注释，固定 rc3 上游的 `resolveMeta`、`locatePkgJson` 和 `exactPackageSpecifier` 提供依据。

两项代码形状疑点已撤回。页面包的 hash 由服务端归一化后计算，是明确的来源合同；`registerTools:false` 保留 Agent 范围注册，是有意配置。没有为了删注释重构这些正确路径。

一项真实边界问题已修复。`openNativeAccountSettings` 以前在非 Document 根、无 `aria-expanded` 时只要点击未抛错就返回成功。JSDOM scoped DOM 负测在修复前得到 `true !== false`。删除该分支后，所有根都必须观察到菜单或对话框打开；账号优先、等待渲染和一次 Settings 回退保留。

修复后的设置按钮与产物收件箱测试为 20 PASS。Workbench 重新构建后，core 为 160 文件、1135 PASS、0 FAIL、0 SKIP。CRM 仅有注释删除，重新构建并运行包合同为 10 PASS；不能将本轮 10 项写成新跑了此前全部 137 项。

主仓发布合同首次为 609 项，570 PASS、33 FAIL、6 SKIP。失败涉及旧默认 SDK、上游 SHA、profile 夹具和 rc1 诊断的默认线路断言。默认夹具改用当前工具链；rc1 诊断继续固定校验 rc3 默认 SHA/SDK，rc1 目标校验及显式 rc2 来源负测保留。没有放宽 peer、摘要、服务证据或来源检查。

受影响的六个测试文件复跑为 96 项，93 PASS、0 FAIL、3 SKIP。完整发布合同重跑为 609 项，603 PASS、0 FAIL、6 SKIP。跳过项是三项显式 rc1 上游、重绑与 artifact 检查，以及三项需指定 rc3 上游的重绑检查，不能计入通过。

完整重跑期间修改了状态文档，`gstack-evidence` 因工作树指纹变化将该回执标为 STALE。实际执行结果保留，但不用于宣称最终 Git 门禁通过。冻结文件后的补跑日志独立保存为 `main-release-final-frozen.log`，其状态以实际日志为准。

CLI 最终定向复核未确认 actionable P0–P2。`no-comments` 所余一条旁白已按报告删除；剩余 MUST KILL 和 suppressions 均无。复核不证明全项目无 bug 或无安全风险，也不是完整宿主验收。

## 本地证据与 Git

本轮私有证据根为 `/private/tmp/dsh-rc3-six-gates.f5NEEP`。主要文件如下。

- `build-author-pack.mjs`、三个核心作者子目录的 `result.json` 和构建日志。
- `verify-leaf.mjs`、六份 `verify-*/` 日志。brand 保留首次 `result.json` 与补跑 `continuation.json`。
- `comment-review-result.md`、`leaf-adversarial-result.md`、`final-review-result.md`。均为非原生、同模型 CLI，未伪装成多模型或原生通过。
- `native-settings-red-r2.log`、`native-settings-green.log`、`workbench-review-regression/result.json`。最初缺环境的 `native-settings-red.log` 不算缺陷复现。
- `main-release-repair.log`、`main-release-full-green.log`。主仓命令由 `gstack-evidence` 另保留原始日志。

主仓起点为 `79839c0b`。远端 `main` 已 fetch 为 `1c21fa6a`，是当前候选的祖先。新增改动均由本轮产生，没有 stash、reset、强推、切换用户已有分支或绕过 hooks。八作者仓和独立组合上传分支已提交并推送，Knowledge 维护仓未改动。主仓 `3112b3448d31c07708d64d7632be373f72680b7e` 正常 push exit 0；`ls-remote` 已核对远端相同提交，推送后工作树干净。当前文档在独立提交更新，不冒充已执行其后的 CI。

正常推送命令先加载私有 `check-environment.sh`，再使用新的 `CRM_COMPOSITION_OUTPUT=/private/tmp/dsh-rc3-final.ELtVwt/prepush-r3` 执行 `git push -u origin codex/dsh-rc3-business-sync`。原始日志为该根下的 `main-push-r3.log`，backend 12/12 组完成，frontend、tooling 和 B0 均 exit 0。此前状态文档超过 80 行的失败已通过保留全文与修正链接的历史归档解决，没有提高上限；私有 Python 补齐自带 pip 后通过服务目标标签预检，没有修改依赖守卫。官方 rc3 持久化模块导出适配及 native preparation 已修复，并实际验证合成 text、tool、rich 的 rc3 与历史 rc2 冷恢复矩阵；这不覆盖杭州 rc1 或真实业务数据回退。最新编译 Workbench 的消费者验证改为原生账号归属，失败及重试路径在真实封存包 DOM 执行，九文件 65 PASS，没有修改产品 UI 或凭据。
